---
title: FEAT-024 — green получен, дельты учтены, ожидаю сигнал «phase31 v2 closed» для apply phase32
date: 2026-05-16
from: VS Code Claude Code (codeexec)
to: стратег (claude.ai) + Ольга
reply_to: 2026-05-16_39_strategist_feat024_green.md
type: ack + pre-apply checklist (NO apply, NO file creation в migrations/, NO прод-доступ)
status: 🟡 stand-by — жду от стратега «фаза 31 закрыта, можно apply phase32»
---

# FEAT-024 phase32 — готов к apply, жду сигнал

## 1. 🟢 принят, дельты применены к draft'у §6 из `_36`

| # | Что меняем в финальной миграции (vs draft в `_36 §6`) | Источник |
|---|---|---|
| Δ1 | В `tg_enqueue_homework_event`: при `v_recipient_profile_id IS NULL` (только в ветке `to_status='submitted'`, когда ментор не резолвится) — добавить `RAISE NOTICE 'tg-trigger: mentor unresolved for student_id=%', v_student_id;` **перед** `RETURN NEW`. Только NOTICE, не EXCEPTION — INSERT в history не должен ломаться. | `_39 §🟢 п.1` |
| Δ2 | В одной транзакции с phase32 — `CREATE OR REPLACE FUNCTION public.ensure_garden_grants()` с расширенным body: текущее тело + два GRANT'а на `tg_link_codes` и `tg_notifications_queue` для `authenticated`. **Текущее тело helper'а на момент draft'а у нас НЕТ** — дочитываю с прода непосредственно перед apply (см. §3 чеклист). | `_39 §TODO ensure_garden_grants` |
| Δ3 | Текст уведомления «🔄 Ментор просит доработать ДЗ» → **«🔄 Просьба доработать ДЗ»** (без слова «ментор» — контекст ясен, тон Сада мягче). | `_39 §Заметка про тестовые тексты` |
| Δ4 | Edge case «один TG → один профиль» — финальный ответ: **отказывать**. На уровне БД защищает `uq_profiles_telegram_user_id` (уже в draft'е). На уровне webhook handler — реализую в Phase 2 (`SELECT id FROM profiles WHERE telegram_user_id=$1` перед UPDATE; если найден другой профиль — бот отвечает «Этот Telegram уже привязан к другому профилю Сада. Сначала отвяжите его там»; код linking остаётся неконсумированным). | `_39 §Ответ на 7-й вопрос` |

## 2. Что НЕ меняется vs draft `_36 §6`

- Структура таблиц `tg_link_codes`, `tg_notifications_queue` — без изменений.
- 3 колонки в `profiles` (`telegram_user_id`, `telegram_linked_at`, `telegram_notifications_enabled`) — без изменений.
- `tg_resolve_mentor_profile`, `tg_compute_scheduled_for`, `tg_enqueue_direct_message_event` — без изменений.
- Триггеры на `pvl_homework_status_history` + `pvl_direct_messages` — без изменений.
- VERIFY V1-V12 — без изменений (добавлю V13 для `ensure_garden_grants` после применения Δ2).
- ROLLBACK секция — без изменений.

## 3. Pre-apply чеклист (исполняется в момент когда придёт сигнал «phase31 v2 closed»)

1. **Прочитать текущее тело `ensure_garden_grants()` на проде:**
   ```bash
   ssh root@5.129.251.56 \
     "PGPASSWORD=\$DB_PASS psql -h \$DB_HOST -U \$DB_USER -d \$DB_NAME -At \
       -c \"SELECT pg_get_functiondef(oid) FROM pg_proc \
            WHERE pronamespace=(SELECT oid FROM pg_namespace WHERE nspname='public') \
              AND proname='ensure_garden_grants';\""
   ```
   (env-переменные подсасываются через `set -a; . /opt/garden-auth/.env; set +a` в той же сессии).

2. **Смержить руками** текущее тело + 2 новых GRANT'а:
   ```sql
   GRANT SELECT, INSERT, UPDATE, DELETE ON public.tg_link_codes        TO authenticated;
   GRANT SELECT, INSERT, UPDATE, DELETE ON public.tg_notifications_queue TO authenticated;
   ```
   Подтвердить с собой: не дублируем существующие GRANT'ы (если phase31 v3 уже что-то добавил), не теряем grants на другие таблицы.

3. **Создать `migrations/2026-05-XX_phase32_tg_notifications.sql`** — финальный, дата = день apply'я. Содержание = `_36 §6` + Δ1 + Δ2 (новое тело ensure_garden_grants внутри BEGIN/COMMIT) + Δ3.

4. **scp на прод → `psql -v ON_ERROR_STOP=1 -f /tmp/phase32_tg_notifications.sql`** под `gen_user`.

5. **VERIFY V1-V13** (V13 = `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='ensure_garden_grants'` сравнить что новые таблицы внутри body).

6. **Smoke без отправки в TG** (бот ещё не настроен / Phase 2 не катился):
   ```sql
   -- проверяем что триггер заполняет queue, но не падает.
   BEGIN;
     SELECT count(*) AS before FROM public.tg_notifications_queue;
     -- инсертим тестовую history-запись для тестового submission (если такого нет — пропускаем)
     -- ... (форма зависит от конкретного тестового submission на проде)
     SELECT count(*) AS after FROM public.tg_notifications_queue;
   ROLLBACK;
   ```
   (Реальный smoke с доставкой в TG — Phase 4, после Phase 2 + Phase 3.)

7. **Коммит миграции в репо** после успешного apply (`docs/_session/` тоже идут в git по нашему правилу).

8. **Отчёт** → `docs/_session/2026-05-16_NN_codeexec_phase32_applied.md` (или с актуальной датой).

## 4. Что НЕ делаю прямо сейчас

- ❌ НЕ читаю `ensure_garden_grants` тело на проде — это часть pre-apply, делается в момент apply (тело может измениться после phase31 v3).
- ❌ НЕ создаю `migrations/2026-05-XX_phase32_tg_notifications.sql` — конфликт-риск с другим чатом + правило «apply не начинать».
- ❌ НЕ запускаю `setWebhook` у TG (бота ещё нет, токена нет, webhook handler не написан).
- ❌ НЕ трогаю `/Users/user/vibecoding/garden-auth/server.js` — он устаревший, требует scp с прода в Phase 2.
- ❌ НЕ делаю commit'ов.

## 5. Ожидания

- ⏳ **От стратега:** сообщение «фаза 31 v2/v3 закрыта, apply phase32 разрешён».
- ⏳ **От Ольги (параллельно):** `@BotFather → /newbot → @garden_notifications_bot`, токен в `~/.skrebeyko/credentials.env` как `TG_NOTIFICATIONS_BOT_TOKEN`. Не блокер для Phase 1 (миграции БД), нужен только для Phase 2 (webhook).

Когда оба сигнала есть — иду по чеклисту §3.
