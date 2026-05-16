---
title: FEAT-024 phase32 — applied на проде, V1-V12 зелёные, smoke зелёный
date: 2026-05-16
from: VS Code Claude Code (codeexec)
to: стратег (claude.ai) + Ольга
reply_to: 2026-05-16_41_codeexec_phase32_diff.md (🟢 на Δ5+Δ6 от Ольги в чате)
type: post-apply отчёт
status: ✅ phase32 closed на проде, готов к Phase 2 (garden-auth webhook + endpoints)
---

# phase32 — applied, V1-V12 зелёные

## TL;DR

- ✅ `migrations/2026-05-16_phase32_tg_notifications.sql` создан и применён на проде атомарно (BEGIN/COMMIT, ON_ERROR_STOP=1, exit 0).
- ✅ V1-V12 — все зелёные. В частности V12 подтверждает Δ5/Δ6: `authenticated` не имеет ни одного privilege на `tg_link_codes`/`tg_notifications_queue`.
- ✅ Smoke без TG: триггеры на `pvl_homework_status_history` и `pvl_direct_messages` срабатывают на INSERT, не падают, в queue ничего не пишут (т.к. ни у одного profile ещё нет `telegram_user_id`). Тестовые вставки выполнены в `BEGIN ... ROLLBACK`, прод-данные не задеты.
- ✅ `/tmp/2026-05-16_phase32_tg_notifications.sql` на проде удалён.
- ⏳ Готов к Phase 2 (webhook handler + endpoints + worker в garden-auth, scp-pattern с прода).

## 1. Команды и вывод

### 1.1 scp

```
scp ./migrations/2026-05-16_phase32_tg_notifications.sql root@5.129.251.56:/tmp/
```
Файл 22121 байт, md5 `0635601de5ad5f43994968ff50be8e55`.

### 1.2 Apply

```
ssh root@5.129.251.56 'set -a && source /opt/garden-auth/.env && set +a
  && PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1 -f /tmp/2026-05-16_phase32_tg_notifications.sql'
```

Pre-check NOTICE: `phase32 pre-check: чистая инсталляция TG-колонок` — ожидаемо.

Последовательность DDL (всё в одной транзакции):
- BEGIN
- ALTER TABLE profiles + CREATE INDEX uq_profiles_telegram_user_id + COMMENT
- CREATE TABLE tg_link_codes + 2 INDEX + COMMENT
- CREATE TABLE tg_notifications_queue + 3 INDEX + COMMENT
- CREATE FUNCTION tg_resolve_mentor_profile
- CREATE FUNCTION tg_compute_scheduled_for
- CREATE FUNCTION tg_enqueue_homework_event + DROP/CREATE TRIGGER
- CREATE FUNCTION tg_enqueue_direct_message_event + DROP/CREATE TRIGGER
- COMMIT

Два NOTICE `trigger "..." for relation "..." does not exist, skipping` — нормально, `DROP TRIGGER IF EXISTS` отработал на чистой инсталляции.

psql exit 0.

### 1.3 VERIFY (после COMMIT)

| Check | Ожидание | Факт |
|---|---|---|
| **V1** | 3 колонки в profiles | telegram_user_id=t, linked_at=t, enabled_flag=t |
| **V2** | UNIQUE partial index | `uq_profiles_telegram_user_id` |
| **V3** | tg_link_codes — 6 колонок | 6 ✓ |
| **V4** | tg_notifications_queue — 16 колонок | 16 ✓ |
| **V5** | CHECK на event_type | `tg_notifications_queue_event_type_check` ✓ |
| **V6** | 4 функции | 4 ✓ |
| **V7** | 2 триггера на правильных таблицах | `trg_tg_enqueue_homework_event` → `pvl_homework_status_history`, `trg_tg_enqueue_direct_message_event` → `pvl_direct_messages` ✓ |
| **V8** | scheduled_for_now валидное | `2026-05-16 15:52:58 MSK` (08-22 окно → отправка немедленно, корректно) |
| **V9** | tg_resolve_mentor_profile вернула UUID | `492e5d3d-81c7-41d8-8cef-5a603e1389e6` ✓ |
| **V10** | 4 индекса на queue | pkey + pending + recipient + dedup ✓ |
| **V11** | queue пустая | 0 ✓ |
| **V12** | 0 grants для authenticated на новых таблицах | 0 rows ✓ (Δ5/Δ6 подтверждены) |

### 1.4 Smoke (transactional, ROLLBACK)

```sql
-- 1. Берём submission с привязанным ментором
WITH src AS (SELECT s.id, s.student_id
  FROM pvl_student_homework_submissions s
  INNER JOIN pvl_garden_mentor_links ml ON ml.student_id = s.student_id
  LIMIT 1)
-- submission_id=9f3a8f09-f224-4db4-be8a-cde644379d80, student_id=35019374-d7de-4900-aa9d-1797bcca9769

BEGIN;
  count(*) FROM tg_notifications_queue  -- before: 0
  INSERT history (..., 'draft', 'submitted', NULL, student_id)  -- "сдала"
  count(*)  -- after_submitted: 0 (ментор не привязал TG → RETURN NEW без enqueue)
  INSERT history (..., 'in_review', 'accepted', 'тестовый коммент', mentor_id)  -- "принял"
  count(*)  -- after_accepted: 0 (студентка не привязала TG → RETURN NEW)
ROLLBACK;

-- DM smoke
BEGIN;
  INSERT pvl_direct_messages (mentor_id, student_id, author_user_id=mentor_id, 'smoke')
  count(*)  -- after_dm: 0 (студентка не привязала TG → RETURN NEW)
ROLLBACK;

post-rollback count(*): 0  -- ROLLBACK откатил тестовые INSERT'ы в history/dm
```

Все 3 триггер-инвокации:
- успешно вернули `INSERT 0 1` (одна строка вставлена в исходную таблицу history/dm);
- триггер не упал;
- в queue ничего не добавилось (правильно — RETURN NEW в шаге §3 «получатель привязал TG?»).

### 1.5 Cleanup

`rm /tmp/2026-05-16_phase32_tg_notifications.sql` — done. Подтверждено `ls`: «No such file or directory».

## 2. Что изменилось на проде

| Объект | Изменение |
|---|---|
| `public.profiles` | +3 колонки (telegram_user_id, telegram_linked_at, telegram_notifications_enabled) + 1 partial unique index |
| `public.tg_link_codes` | новая таблица + 2 индекса |
| `public.tg_notifications_queue` | новая таблица + 3 индекса |
| `public.tg_resolve_mentor_profile(uuid)` | новая функция |
| `public.tg_compute_scheduled_for()` | новая функция |
| `public.tg_enqueue_homework_event()` | новая функция (trigger handler) |
| `public.tg_enqueue_direct_message_event()` | новая функция (trigger handler) |
| `public.pvl_homework_status_history` | новый AFTER INSERT trigger |
| `public.pvl_direct_messages` | новый AFTER INSERT trigger |
| `public.ensure_garden_grants()` | **не тронут** (Δ6) |
| grants на authenticated/web_anon | **не тронуты** для новых таблиц (Δ5) |

Прод-данные (existing rows) — не модифицировались. Pre-check NOTICE: «чистая инсталляция».

## 3. Что готово к Phase 2

- БД полностью готова: триггеры висят, queue пустая, ждут когда юзеры привяжут TG и начнут происходить события homework/DM.
- Бот `@garden_notifications_bot` создан Ольгой (она подтвердила в чате), `TG_NOTIFICATIONS_BOT_TOKEN` в `~/.skrebeyko.env`. Нужно ещё положить в `/opt/garden-auth/.env` на проде.

## 4. Что НЕ сделано (по дизайну)

- Phase 2 (garden-auth webhook + endpoints + worker) — отдельным заходом, после Phase 1 review.
- Phase 2b (frontend UI «Привязать Telegram») — после Phase 2.
- Phase 4 (smoke с реальной отправкой в TG) — после Phase 2+3.

## 5. Следующий заход

**Phase 2 — webhook + endpoints + worker в garden-auth**. План:

1. `scp root@5.129.251.56:/opt/garden-auth/server.js /Users/user/vibecoding/garden-auth/server.js` (синхронизировать локальную копию с прод-версией перед правками — TECH-DEBT-AUTH-REPO-SYNC; локальный файл сейчас отстаёт, без `httpsPostJson` и `/api/client-error`).
2. Положить токен в `/opt/garden-auth/.env`: `TG_NOTIFICATIONS_BOT_TOKEN=...`, `TG_NOTIFICATIONS_WEBHOOK_PATH=wh_<random32hex>`, `TG_NOTIFICATIONS_WEBHOOK_SECRET=<random32hex>`.
3. В `server.js`:
   - reuse `httpsPostJson` (уже есть для @grants_monitor — `family:4` обходит TG-blackbox).
   - `sendTgNotification(tgUid, text)` → `https://api.telegram.org/bot${TG_NOTIFICATIONS_BOT_TOKEN}/sendMessage`, 403 → disable flag, 400/5xx обработка по схеме `_36 §3.4`.
   - 3 endpoint'а:
     - `POST /api/tg-bot/webhook/:secret` (приём `/start LINK-XXXX`, реализация Q7-отказа при duplicate TG).
     - `POST /api/profile/generate-tg-link-code` (под JWT, генерит `LINK-XXXXXX` в `tg_link_codes`).
     - `POST /api/profile/unlink-telegram` (под JWT, UPDATE profiles SET telegram_user_id=NULL).
   - worker: `setInterval(processTgQueueBatch, 15000)` сразу после `app.listen`.
4. `setWebhook` у TG: `curl -X POST "https://api.telegram.org/bot$TG_NOTIFICATIONS_BOT_TOKEN/setWebhook" --data-urlencode "url=https://auth.skrebeyko.ru/api/tg-bot/webhook/$SECRET_PATH" --data-urlencode "secret_token=$TG_NOTIFICATIONS_WEBHOOK_SECRET"`.
5. scp обратно на прод → `systemctl restart garden-auth.service` → smoke `/health`.
6. Phase 2b — frontend UI.
7. Phase 4 — реальный smoke (Ольга привязывает свой TG → симулируем «сдала» через psql → ждём пуш).

## 6. Lesson на запись

По просьбе Ольги — запишу `docs/lessons/2026-05-16-no-postgrest-grant-for-pii-tables.md` отдельным шагом перед commit'ом. Содержание:
- Симптом — мог бы быть (не сработал, потому что словили в pre-apply diff).
- Корневая причина — рефлекторно дал GRANT TO authenticated по аналогии с ensure_garden_grants Tier-1 pattern, не подумав что queue содержит PII.
- Урок — паттерн: «если таблица доступна через серверный endpoint под owner'ом, НЕ давай GRANT через PostgREST. Меньше attack surface».
- Когда ловить: при появлении новых таблиц с user-visible content (DM, comments, drafts, notifications с полным текстом).

## 7. Артефакты для commit

Я закоммичу выборочно (есть много чужих незакоммиченных изменений, их не трогаю):
- `migrations/2026-05-16_phase32_tg_notifications.sql` (применён)
- `docs/_session/2026-05-16_35_strategist_feat024_tg_notifications.md` (от стратега, если ещё untracked)
- `docs/_session/2026-05-16_36_codeexec_feat024_recon.md`
- `docs/_session/2026-05-16_39_strategist_feat024_green.md` (если ещё untracked)
- `docs/_session/2026-05-16_40_codeexec_feat024_apply_ready.md`
- `docs/_session/2026-05-16_41_codeexec_phase32_diff.md`
- `docs/_session/2026-05-16_42_codeexec_phase32_applied.md` (этот файл)
- `docs/lessons/2026-05-16-no-postgrest-grant-for-pii-tables.md` (urok)

Push — не делаю, по умолчанию.
