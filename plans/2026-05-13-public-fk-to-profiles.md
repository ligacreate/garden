# 2026-05-13 — Переезд 5 FK из `public` с `auth.users` на `public.profiles`

## Контекст

BUG-GOALS-FK-SUPABASE-LEGACY. На вкладке «Мастерство» создание цели у Яны
Соболевой падает с тостом «Не удалось привязать цель к вашему профилю».
Корневая причина — `goals_user_id_fkey` ссылается на `auth.users(id)`,
наследие Supabase. После переезда на свой auth новые пользователи живут
в `public.users_auth` + `public.profiles`, в `auth.users` их нет.
INSERT падает PostgreSQL-кодом `23503`, на фронте — fallback-сообщение
из [services/dataService.js:2528](../services/dataService.js#L2528).

Диагностика на проде 2026-05-13 показала, что баг — не локальный для
goals. На `auth.users(id)` смотрят **5** FK в `public`:

| таблица        | колонка     | constraint                       | on_delete   |
|----------------|-------------|----------------------------------|-------------|
| `goals`        | `user_id`   | `goals_user_id_fkey`             | NO ACTION   |
| `practices`    | `user_id`   | `practices_user_id_fkey`         | NO ACTION   |
| `notifications`| `user_id`   | `notifications_user_id_fkey`     | NO ACTION   |
| `news`         | `author_id` | `news_author_id_fkey`            | NO ACTION   |
| `scenarios`    | `user_id`   | `scenarios_user_id_fkey`         | NO ACTION   |

Типы совпадают: `*.user_id = uuid`, `profiles.id = uuid`. У `goals`
проверено: сирот нет (11 целей, все матчатся в `profiles`).

## Решение

Перевести все 5 FK на `public.profiles(id)`. Поведение при удалении
профиля дифференцировано по продуктовому смыслу — так же, как в phase24
(`course_progress` → CASCADE; `meetings` → ручная развязка):

| таблица        | новое `ON DELETE` | обоснование                                                                 |
|----------------|-------------------|------------------------------------------------------------------------------|
| `goals`        | **CASCADE**       | Личные цели пользователя.                                                    |
| `practices`    | **CASCADE**       | Личные записи практик.                                                       |
| `notifications`| **CASCADE**       | Мёртвые уведомления = мусор.                                                 |
| `news`         | **SET NULL**      | Публикация переживает автора (Ольга, 2026-05-13: «Сохранить без авторства»). |
| `scenarios`    | **SET NULL**      | На FK — `SET NULL` (публичные сценарии Лиги выживают). Приватные удаляются явно в `admin_delete_user_full`. |

UI безопасен: `news.author_id` не читается фронтом нигде, `scenario.user_id`
не используется (отображается отдельная колонка `author_name`).

## Фазы

- [x] **0. Pre-flight diagnostics (на проде, 2026-05-13).**
  - 5 FK на `auth.users` подтверждены (pg_constraint).
  - Типы `uuid=uuid`.
  - `goals`: сирот нет (11 целей, все в `profiles`).
- [x] **1. Миграция [migrations/2026-05-13_phase27_public_fk_to_profiles.sql](../migrations/2026-05-13_phase27_public_fk_to_profiles.sql).** Применена 2026-05-13 10:21 UTC. VERIFY V1–V5 прошли: 5 FK → `public.profiles` (CASCADE для goals/practices/notifications, SET NULL для news/scenarios); 0 FK в `public` смотрят на `auth.users`; GRANTs 158/4; сирот 0; `admin_delete_user_full` SECURITY DEFINER + EXECUTE для authenticated.
  - Pre-flight orphan-check внутри транзакции по всем 5 таблицам;
    при наличии сирот — `RAISE EXCEPTION` (rollback всего).
  - `ALTER COLUMN ... DROP NOT NULL` (идемпотентно) для `news.author_id`
    и `scenarios.user_id` — обязательное условие `SET NULL`.
  - `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT ... REFERENCES public.profiles(id)`
    для всех 5 FK.
  - `CREATE OR REPLACE FUNCTION public.admin_delete_user_full(uuid)` —
    добавлен шаг `DELETE FROM scenarios WHERE user_id = p_user_id AND is_public IS NOT TRUE`
    перед `DELETE FROM profiles`. Публичные уходят в `SET NULL` через FK.
  - `SELECT public.ensure_garden_grants()` до `COMMIT` (RUNBOOK 1.3).
  - VERIFY вне транзакции: все 5 FK смотрят на `profiles`, GRANT counts 158/4,
    нет сирот.
- [x] **2. Smoke на проде после apply.** Ольга прогнала под Яной 2026-05-13 — цель создаётся, ошибки нет. Остальные таблицы (practices/scenarios/news/notifications) — на доверии симметрии: FK однотипные, схема и тип `uuid` совпадают, VERIFY на проде показал нули по сиротам.
- [x] **3. Урок** [docs/lessons/2026-05-13-public-fk-to-auth-users-supabase-legacy.md](../docs/lessons/2026-05-13-public-fk-to-auth-users-supabase-legacy.md). Главные сигналы: cross-schema FK не виден через `information_schema`, нужен `pg_constraint`; fallback-лестница `user_id` в сервисе — красный флаг устаревшей identity.
- [x] **4. Рефлексия** [.business/история/2026-05-13-public-fk-to-profiles.md](../.business/история/2026-05-13-public-fk-to-profiles.md). Зафиксирован техдолг: убрать `_resolveGoalsUserId`-лестницу из `dataService.js` (после phase27 no-op) и пометить устаревшим [docs/goals_fk_diagnostics_and_repair.sql](../docs/goals_fk_diagnostics_and_repair.sql) (ищет FK на `public.users`, реальный был на `auth.users`).

## Риски и совместимость

- **Поведенческое изменение `ON DELETE NO ACTION → CASCADE/SET NULL`.**
  До phase27 это поведение фактически не триггерилось — `auth.users` не
  пополняется и не чистится нашей инфрой. После phase27 удаление профиля
  через `admin_delete_user_full` запустит каскад: цели/практики/уведомления
  пользователя уйдут вместе с ним, новости и публичные сценарии останутся
  без автора. Это согласуется с явным замыслом phase24.
- **GRANT-wipeout от Timeweb после DDL.** Парирован `ensure_garden_grants()`
  в той же транзакции (RUNBOOK 1.3). Дополнительная защита — cron-monitor
  `/opt/garden-monitor/check_grants.sh`.
- **Откат после COMMIT.** Возвращать FK на `auth.users` НЕ нужно (это и был
  баг). Если потребуется снять CASCADE/SET NULL — отдельной миграцией
  поставить обратно `NO ACTION`.
- **Атомарность.** Вся миграция в одной транзакции с `\set ON_ERROR_STOP on`.
  Любой сбой — полный rollback, состояние БД не меняется.

## Итог

**Реализовано целиком.** Phase27 применена на проде 2026-05-13 10:21 UTC,
все 5 VERIFY-проверок прошли, smoke под Яной подтверждён. Урок и
рефлексия записаны.

Открытый техдолг (не блокирующий):
- Убрать `_resolveGoalsUserId`-лестницу из [services/dataService.js:2550-2634](../services/dataService.js#L2550-L2634) — после phase27 она no-op.
- Пометить устаревшим (или удалить) [docs/goals_fk_diagnostics_and_repair.sql](../docs/goals_fk_diagnostics_and_repair.sql)
  — он ищет FK на `public.users`, реальный был на `auth.users`.
