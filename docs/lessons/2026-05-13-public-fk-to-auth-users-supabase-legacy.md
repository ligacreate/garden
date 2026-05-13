# FK-наследие Supabase: 5 таблиц `public` остались привязаны к `auth.users` после переезда на свой auth

**Дата:** 2026-05-13.
**Тикет:** BUG-GOALS-FK-SUPABASE-LEGACY.
**Фикс:** [migrations/2026-05-13_phase27_public_fk_to_profiles.sql](../../migrations/2026-05-13_phase27_public_fk_to_profiles.sql) — перевод 5 FK с `auth.users(id)` на `public.profiles(id)` + синхронное обновление `public.admin_delete_user_full` (DELETE приватных `scenarios` перед `DELETE FROM profiles`).

## Симптом

Яна Соболева не смогла создать цель на вкладке «Мастерство». Тост:
«Не удалось привязать цель к вашему профилю. Обновите страницу и
попробуйте снова.» — продуктовая обёртка вокруг PostgreSQL `23503`
(`goals_user_id_fkey`), которую выдаёт [services/dataService.js:2528](../../services/dataService.js#L2528).

Дальнейшая диагностика на проде показала, что баг — не локальный для
`goals`. На `auth.users(id)` смотрели **5** FK в `public`:
`goals`, `practices`, `notifications`, `news`, `scenarios`. Значит у
любого пользователя, созданного после переезда с Supabase, ломалось
создание цели, практики, личного сценария и приём ряда уведомлений
(плюс возможные тихие проблемы с `news.author_id`).

## Корневая причина

FK на `auth.users` — наследие Supabase. После переезда на свой
auth-сервис (`auth.skrebeyko.ru` + `public.users_auth` + `public.profiles`)
наша инфра больше **не пополняет** `auth.users`. Там осталось 32 старых
аккаунта эпохи Supabase. У Яны и любых «новых» пользователей в
`auth.users` строки нет → FK-проверка на `INSERT` падает с `23503`.

Поведение `ON DELETE NO ACTION` у этих FK всё это время **молчало**, потому
что мы и не удаляли никого из `auth.users` — там никто не двигался.
Но `INSERT` триггерит FK сразу, и именно он начал падать у каждого
post-Supabase пользователя.

## Почему так получилось

1. **Cross-schema FK не виден стандартному аудиту.** Запрос через
   `information_schema.constraint_column_usage` (его лоял дефолтный
   диагностический SQL [docs/goals_fk_diagnostics_and_repair.sql](../goals_fk_diagnostics_and_repair.sql)) **не пробивает FK между схемами**.
   Чтобы найти все FK `public → auth.users`, пришлось идти через
   `pg_constraint` напрямую:

   ```sql
   SELECT c.conrelid::regclass, c.conname
   FROM pg_constraint c
   JOIN pg_class      r ON r.oid = c.confrelid
   JOIN pg_namespace  n ON n.oid = r.relnamespace
   WHERE c.contype='f' AND n.nspname='auth' AND r.relname='users';
   ```

   Из-за этой слепой зоны переезд auth прошёл «вроде успешно»: profiles
   были переведены, миграция данных шла, RLS/гранты настроены — а
   тихие FK на старую `auth.users` остались жить в продовой схеме.

2. **Дырявая абстракция в коде.** В `dataService.addGoal` /
   `_resolveGoalsUserId` есть длинная цепочка попыток подобрать
   корректный `user_id`: `/auth/me`, потом `profiles.id`, потом
   `users.id`, потом автосоздание строки в `public.users`. Эта лестница
   workaround'ов **компенсирует** проблему в дочернем слое, а не чинит
   её в источнике правды. На Яне последний шаг (автосоздание в
   `public.users`) тоже не сработал — но даже если бы сработал, мы бы
   получили мусорные строки в `users` и продолжали игнорировать
   реальную проблему FK на чужую схему.

3. **Симптом проявлялся только у новых пользователей.** Со старыми
   Supabase-аккаунтами (32 строки в `auth.users`) система работала, и
   ошибка не попадала на глаза тестам/мониторингу.

## Как починили

Phase 27 одним атомарным DDL-блоком:

- **Pre-flight orphan-check** по всем 5 таблицам внутри транзакции;
  любой сирота → `RAISE EXCEPTION 23503` → полный rollback.
- **Переключение FK** на `public.profiles(id)` для всех 5 таблиц.
  `ON DELETE` дифференцирован по продуктовому смыслу — повтор паттерна
  phase24 (`course_progress` CASCADE, `meetings` ручная развязка):
    - `goals`, `practices`, `notifications` → **CASCADE** (личные данные)
    - `news.author_id`, `scenarios.user_id` → **SET NULL** (контент
      переживает автора). Для этого `ALTER COLUMN ... DROP NOT NULL`
      идемпотентно.
- **`CREATE OR REPLACE public.admin_delete_user_full`** — добавлен шаг
  `DELETE FROM public.scenarios WHERE user_id = p_user_id AND is_public IS NOT TRUE`
  перед `DELETE FROM profiles`. Публичные сценарии и новости уходят
  в `SET NULL` через FK, приватные удаляются явно (аналог `meetings`).
- **`SELECT public.ensure_garden_grants()` до `COMMIT`** (RUNBOOK 1.3,
  страховка от Timeweb GRANT-wipeout после DDL).
- **VERIFY вне транзакции** (5 проверок): все 5 FK на `profiles` с
  ожидаемым `on_delete`, 0 FK `public → auth.users`, GRANTs 158/4,
  сирот 0, `admin_delete_user_full` SECURITY DEFINER + EXECUTE для
  `authenticated`.

Поведенческое изменение `NO ACTION → CASCADE/SET NULL` зафиксировано в
плане — до phase27 оно не триггерилось, потому что наша инфра не
удаляла из `auth.users`. После phase27 `admin_delete_user_full`
запустит каскад целиком.

Fallback-лестница в `_resolveGoalsUserId` оставлена как есть в этом
коммите: после переключения FK она становится no-op (главный кандидат
`/auth/me` совпадает с `profiles.id` и FK проходит). Зачищать её можно
отдельной задачей по техдолгу — сейчас она не вредит.

## Что проверить в будущем

1. **Любой 23503 от PostgREST с именем constraint, ссылающимся на
   `auth.*`,** — это та же ловушка. Сначала смотреть `pg_constraint`,
   не `information_schema`.

2. **При следующей миграции auth- или identity-слоя** (Supabase → свой,
   свой → внешний IdP, переезд провайдера) — обязательный pre-check:

   ```sql
   -- все FK из public на foreign-схему identity-провайдера
   SELECT c.conrelid::regclass AS table, c.conname AS constraint,
          n.nspname || '.' || r.relname AS references
   FROM pg_constraint c
   JOIN pg_class      r ON r.oid = c.confrelid
   JOIN pg_namespace  n ON n.oid = r.relnamespace
   WHERE c.contype='f' AND c.connamespace='public'::regnamespace
     AND n.nspname <> 'public';
   ```

   Если что-то нашлось — переехать или удалить FK ДО переключения
   identity. Иначе записи в эти таблицы будут падать у новых
   пользователей со дня переезда, и долго никто не заметит.

3. **Fallback-лестницы для `user_id` в сервисах** — красный флаг
   устаревшей идентификации. Если в `addX()` есть цикл по 3-5
   кандидатам и автосоздание строк в служебной таблице — это симптом
   того, что слой identity где-то не выровнен. Лечить надо
   контракт/FK, а не цикл попыток.

4. **Cross-schema FK в новых миграциях** — нужно избегать. Если FK на
   `auth.users` появляется снова (миграция из Supabase-туториала,
   копипаст), задавать его на `public.profiles(id)` сразу.

5. **При DDL-миграциях** — `SELECT public.ensure_garden_grants()` до
   `COMMIT` (RUNBOOK 1.3). В этой миграции wipeout не случился, но
   парирование стоило одной строки и спасает от P0.

## Связано

- [docs/RUNBOOK_garden.md](../RUNBOOK_garden.md) §1.3 — Timeweb GRANT-wipeout.
- [migrations/2026-05-05_phase23_grants_safety_net.sql](../../migrations/2026-05-05_phase23_grants_safety_net.sql) — `ensure_garden_grants()`.
- [migrations/2026-05-07_phase24_admin_delete_user_rpc.sql](../../migrations/2026-05-07_phase24_admin_delete_user_rpc.sql) — паттерн «личное → CASCADE, контент → ручная развязка».
- [docs/goals_fk_diagnostics_and_repair.sql](../goals_fk_diagnostics_and_repair.sql) — оригинальный диагностический скрипт, который не пробивал cross-schema FK (см. п. 1 «Почему так получилось»).
