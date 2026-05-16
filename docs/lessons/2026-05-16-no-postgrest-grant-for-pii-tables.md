---
title: Не давать PostgREST-доступ к таблицам, которые держит серверный endpoint
date: 2026-05-16
caught_at: pre-apply (FEAT-024 phase32 diff в _session/_41), не на проде
related:
  - migrations/2026-05-16_phase32_tg_notifications.sql
  - docs/_session/2026-05-16_36_codeexec_feat024_recon.md (§8 — где был GRANT)
  - docs/_session/2026-05-16_41_codeexec_phase32_diff.md (Δ5 + Δ6)
audience: будущий codeexec при добавлении новых таблиц с user-visible content
---

# Не давать GRANT TO authenticated на таблицы, к которым ходит серверный endpoint под owner

## Симптом (потенциальный, не случился)

В draft'е миграции phase32 (FEAT-024) я по инерции дал `GRANT SELECT, INSERT, UPDATE, DELETE` для `authenticated` на `tg_notifications_queue`. Эта таблица хранит `message_text` уведомлений, в том числе полный текст DM-сообщений ментора студентке (поле `event_type='dm_from_mentor'`, `message_text='💬 Новое сообщение от ментора\n\n<i>{text}</i>'`).

Если бы миграция прошла в таком виде:
- любой авторизованный юзер мог бы через PostgREST `GET /tg_notifications_queue?select=*` читать **все** нотификации в системе, включая чужие;
- утечка PII: текст DM-сообщений ментор↔студентка попадал бы каждому, у кого валидный JWT;
- атака масштабируема: один скомпрометированный JWT = полный архив сообщений всех пар.

P0-уровня дыра. Поймана **до apply** на этапе pre-apply diff в `_session/_41`.

## Корневая причина

Рефлекторно скопировал паттерн из `ensure_garden_grants` Tier-1 (39 таблиц с full CRUD для authenticated). В Сада 39 таблиц действительно работают через PostgREST под JWT — это норма архитектуры (фронт ходит в БД напрямую). Я не остановился спросить себя: **а эта новая таблица тоже идёт через PostgREST?**

Если бы остановился — увидел бы:
- `tg_link_codes` генерится только через endpoint `/api/profile/generate-tg-link-code` (server-side, под owner gen_user);
- `tg_notifications_queue` наполняется триггерами + читается worker'ом (тоже server-side, owner);
- ни одна операция не должна идти через PostgREST.

Корень: путаница между «таблица в схеме `public`» и «таблица доступна через PostgREST API». Это разные вещи. `public` — namespace; PostgREST exposes только то, на что есть GRANT для роли API.

## Почему так получилось

1. **Инерция паттерна.** Все остальные новые таблицы в проекте действительно ходят через PostgREST (это основной API). Дать GRANT — мускульная память, не анализ.
2. **Стратег и я оба не подсветили.** В draft'е `_36 §8` GRANT был, стратег `_39` дал 🟢 не задумавшись.
3. **Worker и owner-доступ — не упоминались в чек-листе безопасности.** Owner может всё без GRANT'ов, но мы это не использовали как аргумент в дизайне; везде по умолчанию «нужны GRANT'ы».

## Как починили (до apply)

В `_session/_41` (pre-apply diff):
- **Δ5** — убрать `GRANT … TO authenticated` на обе TG-таблицы.
- **Δ6** — следствие Δ5: `ensure_garden_grants` не трогаем (нечего восстанавливать).
- Финальный V12 в миграции — проверка что 0 grants для authenticated на новых таблицах. Гарантия что Δ5 закреплён DDL'ем.

На проде после apply (V12): 0 rows. Чисто.

## Что проверить в будущем — паттерн

При добавлении новой таблицы спроси себя по чек-листу:

1. **Ходит ли фронт в эту таблицу через PostgREST напрямую?**
   - Если да (как с `meetings`, `events`, `pvl_*`) → нужен GRANT + (опционально) RLS-политики.
   - Если нет → **никаких GRANT'ов** для authenticated/web_anon. Owner = gen_user, garden-auth коннектится под ним, этого достаточно.

2. **Содержит ли таблица user-visible content (тексты сообщений, drafts, comments, push-payload, email-body, нотификации с полным текстом)?**
   - Если да → даже если фронт ходит через PostgREST, нужно очень осторожно проектировать GRANT scope + обязательно RLS «only own rows».
   - В сомнении — **прячь через серверный endpoint** под owner-ом. Меньше attack surface.

3. **Можно ли вынести операции с этой таблицей в endpoint в garden-auth/push-server?**
   - Если да и таблица содержит PII → выбирай endpoint. Это даёт:
     - контроль над тем, что юзер может прочитать (не «всё что в SELECT»);
     - аудит через server-side логи;
     - возможность подменить storage backend без миграции схемы.

4. **Сигналы что таблица — кандидат на «owner-only»:**
   - имя таблицы содержит `queue`, `log`, `audit`, `pending`, `events_internal`, `secrets`, `tokens`, `codes`;
   - есть колонки `message_text`, `body`, `payload`, `email_text`, `comment_full`, `dm_*`;
   - наполняется триггерами или server-side только;
   - читается только worker'ом или server-side endpoint'ом.

5. **Анти-паттерн:** «дам GRANT по аналогии, потом добавлю RLS» — RLS легко забыть. GRANT попадает в Tier-1 ensure_garden_grants, RLS — отдельная фаза, забывается. Лучший дефолт — **не давать GRANT** и forces себя зайти через endpoint, чем дать и надеяться на RLS.

## Конкретный паттерн для будущих миграций

```sql
-- ❌ ПЛОХО для таблицы с PII, к которой обращается только worker/endpoint:
CREATE TABLE public.foo_queue (
  ...,
  message_text TEXT,    -- содержит user PII
  ...
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.foo_queue TO authenticated;
-- + добавление в ensure_garden_grants → подтверждает что хотим этот GRANT при wipe.

-- ✅ ХОРОШО:
CREATE TABLE public.foo_queue (
  ...,
  message_text TEXT,
  ...
);
COMMENT ON TABLE public.foo_queue IS
  'FEAT-XYZ. Не доступна authenticated — только сервер (gen_user). Содержит PII.';
-- НЕ добавляем в ensure_garden_grants — таблица вне Tier-1.
-- Проверочный SELECT в VERIFY:
SELECT count(*) FROM information_schema.role_table_grants
 WHERE grantee='authenticated' AND table_name='foo_queue';
-- ожидаем 0.
```

## Related

- `ensure_garden_grants()` Tier-1 — для таблиц, которые **реально** нужны через PostgREST. Не дефолт «всё подряд».
- FEAT-024 Phase 2 (garden-auth endpoint'ы для tg_link_codes и tg_notifications_queue) — реализация owner-only паттерна.
- TECH-DEBT-AUTH-REPO-SYNC — синхронизация локального `/Users/user/vibecoding/garden-auth/server.js` с прод-версией (нужна перед Phase 2; иначе откатим TG-blackbox-фикс).
