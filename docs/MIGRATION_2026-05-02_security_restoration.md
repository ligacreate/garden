---
title: SEC-001 — Восстановление безопасности БД (RLS + grants)
type: migration
version: 1.0
created: 2026-05-02
status: draft (готов к ревью с веб-Claude перед исполнением)
related_docs:
  - docs/REPORT_2026-05-02_db_audit.md
  - docs/REPORT_2026-05-02_db_audit_v2.md
  - docs/REPORT_2026-05-02_db_audit_v3.md
  - docs/REPORT_2026-05-02_db_audit_v4.md
  - docs/REPORT_2026-05-02_db_audit_v5.md
  - docs/REPORT_2026-05-02_code_audit.md
  - database/pvl/notes/garden-profiles-rls-for-pvl-sync.md
  - plans/BACKLOG.md (SEC-001)
---

# SEC-001 — Восстановление безопасности БД (RLS + grants)

## Обзор

Этот документ — **полный план миграции** для Этапа 2 SEC-001: «Настройка защиты на стороне БД». Все SQL-блоки готовы к копированию в `psql` под `gen_user@5.129.251.56`.

### Объём

- **profiles**: чистка 10 дублей политик, оставить «доверенное сообщество» (Вариант A).
- **users_auth, to_archive, events_archive**: RLS-on без политик + REVOKE.
- **messages**: DELETE 4 тестовых + RLS-on без политик.
- **push_subscriptions**: RLS-on без политик.
- **birthday_templates**: RLS-on + 4 политики.
- **24 PVL-таблицы**: 5 шаблонов RLS (A–E).
- **Хелпер**: `public.is_mentor_for(uuid)` — `SECURITY DEFINER STABLE`.
- **Grants**: USAGE/SELECT/INSERT/UPDATE/DELETE по матрице.

### Последовательность фаз

```
0. Pre-flight checks
1. Чистка дублей profiles
2. Замена hardcoded-Olga в knowledge_base
3. Хелпер is_mentor_for(uuid)
4. Lockdown users_auth
5. Lockdown to_archive / events_archive
6. messages: DELETE + RLS-on
7. push_subscriptions: RLS-on
8. birthday_templates: RLS + политики
9. PVL шаблон A — контент курса (8 таблиц)
10. PVL шаблон B — свои данные ученика (9 таблиц)
11. PVL шаблон C — реестр PVL (3 таблицы)
12. PVL шаблон D — личные сообщения и нотификации (3 таблицы)
13. PVL шаблон E — audit log (1 таблица)
14. Grants
15. Smoke-тесты
```

Каждая фаза — отдельная транзакция (`BEGIN; … COMMIT;`) с rollback-блоком. Если smoke-тест в конце фазы падает — `ROLLBACK;` и разбираемся.

### Отложено сознательно

- **FORCE ROW LEVEL SECURITY** — отдельная задача SEC-004 в BACKLOG (требует отдельной DB-роли для garden-auth, иначе бекенд упадёт).
- **DROP `to_archive`** — отложено решением владельца («пока не удалять», см. v2/v3).
- **DROP тестовой «Участницы» `33333…01`** — решение владельца «не удалять».

### Расхождение репо ↔ live

🔴 **`migrations/05_profiles_rls.sql` повреждён.** Файл занимает 42 байта и содержит только строку `{97AE7713-21F0-4F0C-B575-A281FE6084F0}.png` (имя PNG-картинки, без расширения и без переноса строки). Никакого SQL внутри нет. Это значит: **репо не описывает текущее состояние политик `profiles`** на live-БД (где их 14, см. v3 задача 4). Источник истины — backup `~/Desktop/policies_backup_2026-05-02.txt`.

🟡 **Расхождение `migrations/05`.** До исполнения этой миграции — отдельной задачей **восстановить** содержимое 05, либо заменить на новый файл `migrations/29_profiles_rls_cleanup.sql`, отражающий результат фазы 1. Без этого следующий разработчик увидит «миграция 05 пустая» и не поймёт, откуда `profiles_select_authenticated`. Эту восстановительную миграцию не пишем сейчас — после применения этого документа.

### Как откатывать

Каждая фаза имеет `-- ROLLBACK:` блок прямо после `COMMIT`. В случае проблемы — выполнить именно его. В конце документа — общий **backout-план** (полный возврат к состоянию ДО миграции).

---

## 0. Pre-flight checks (read-only)

Запустить **до начала** миграции. Все запросы — `SELECT`, изменений нет. Если хоть один пункт не сошёлся — **не продолжать**, разобраться.

```sql
-- 0.1. Версия Postgres (ожидаем 18.1)
SELECT version();

-- 0.2. Под кем мы подключены (ожидаем gen_user, owner таблиц public.*)
SELECT current_user, session_user;

-- 0.3. Ключевые роли существуют (web_anon, authenticated, gen_user)
SELECT rolname, rolsuper, rolinherit, rolcanlogin, rolbypassrls
FROM pg_roles
WHERE rolname IN ('web_anon', 'authenticated', 'gen_user', 'postgres')
ORDER BY rolname;

-- 0.4. is_admin() существует (используется в новых политиках)
SELECT proname, prosecdef AS security_definer, prorettype::regtype AS returns
FROM pg_proc WHERE proname = 'is_admin';
-- Ожидаем: proname=is_admin, security_definer=t, returns=boolean

-- 0.5. is_mentor_for(uuid) НЕ существует (создаём в фазе 3)
SELECT count(*) AS already_exists
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'is_mentor_for';
-- Ожидаем: 0

-- 0.6. RLS-статус по 28 целевым таблицам (ожидаем rls_enabled=false везде, кроме pvl_checklist_items и pvl_student_content_progress где =true с no-op политиками)
SELECT n.nspname AS schema, c.relname AS table_name,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname = n.nspname AND p.tablename = c.relname) AS policies
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname IN (
    'profiles', 'knowledge_base',
    'users_auth', 'to_archive', 'events_archive',
    'messages', 'push_subscriptions', 'birthday_templates',
    'pvl_audit_log','pvl_calendar_events','pvl_checklist_items','pvl_cohorts',
    'pvl_content_items','pvl_content_placements','pvl_course_lessons','pvl_course_weeks',
    'pvl_direct_messages','pvl_faq_items','pvl_garden_mentor_links','pvl_homework_items',
    'pvl_homework_status_history','pvl_mentors','pvl_notifications',
    'pvl_student_certification_criteria_scores','pvl_student_certification_scores',
    'pvl_student_content_progress','pvl_student_course_points','pvl_student_course_progress',
    'pvl_student_disputes','pvl_student_homework_submissions','pvl_student_questions','pvl_students'
  )
ORDER BY n.nspname, c.relname;

-- 0.7. Все 14 политик profiles ещё на месте (контрольный счёт перед чисткой)
SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='profiles' ORDER BY policyname;
-- Ожидаем: 14 строк (см. v3 задача 4)

-- 0.8. Целевая таблица в pvl_garden_mentor_links НЕ пуста (для smoke шаблона B/C)
SELECT count(*) AS links_total FROM public.pvl_garden_mentor_links;
-- Ожидаем: ≥ 19 (см. v3)

-- 0.9. Таблица messages содержит 4 тестовые строки (см. v4)
SELECT id, author_id, author_name, left(text, 60) AS preview FROM public.messages ORDER BY created_at;
-- Ожидаем: 4 строки от 2026-03-17, все «Тестовое сообщение»/«Привет-привет»

-- 0.10. Backup всех текущих политик в файл (для критичного rollback)
\copy (SELECT * FROM pg_policies ORDER BY schemaname, tablename, policyname) TO '~/policies_backup_2026-05-02_pre_migration.csv' WITH CSV HEADER
```

✅ **Если все 10 пунктов сошлись** — продолжаем разделом «Расхождения репо ↔ прод», затем фазой 1.

---

## Расхождения репо ↔ прод

Этот раздел фиксирует **известные несоответствия** между файлами `migrations/*.sql` в репо и фактическим состоянием live-БД (по результатам v1–v5 и сегодняшнего чтения миграций). Эти расхождения **не блокируют** текущую миграцию — для всех DROP/CREATE мы принимаем **live-БД** как источник истины (через v3 задача 4 и v1 backup политик), не содержимое миграций.

⚠ **Решение по этим расхождениям.** В текущей сессии **не чиним**. Зафиксировано как отдельная задача `CLEAN-009: Аудит и восстановление migrations/*.sql` в backlog.

### Р-1. `migrations/05_profiles_rls.sql` — повреждён

- **Размер:** 42 байта (без line-terminator).
- **Содержимое:** только строка `{97AE7713-21F0-4F0C-B575-A281FE6084F0}.png` (имя PNG-файла, не SQL).
- **Проверено:** `file` определяет как `ASCII text, with no line terminators`; `od -c` показывает плоское имя файла.
- **Что должно быть в файле:** определение текущих 14 политик на `public.profiles` (по v3 задача 4: `profiles_select_authenticated`, `profiles_insert_own`, `profiles_update_own`, `profiles_update_admin` + 10 дублей с историческими именами).
- **Влияние на текущую миграцию:** нулевое. Все DROP'ы фазы 1 ссылаются на имена из live-БД (v3 задача 4 / v1 backup). Восстановление файла — отдельная задача.

### Р-2. `migrations/17_create_messages_chat.sql` ≠ live на `messages`

- **Миграция 17 описывает:** `enable row level security` + 2 политики (`messages_select_authenticated` USING `auth.uid() IS NOT NULL`, `messages_insert_authenticated` WITH CHECK `auth.uid() IS NOT NULL AND (author_id IS NULL OR author_id = auth.uid())`) + `grant select, insert TO authenticated` + добавление в publication `supabase_realtime`.
- **Live (v3 задача 1):** RLS = **off**, политик **0**, в publication `supabase_realtime` таблица **присутствует**. Структура колонок 8 (миграция 17 объявляет 7 — отсутствует `image_url`, который добавляет 18).
- **Гипотеза дрейфа:** RLS и политики на `messages` были вручную сняты в проде (когда — неизвестно, до 2026-05-02). Возможно, это связано с миграцией с Supabase или с попыткой починить чат, когда RLS блокировал реальные сценарии.
- **Влияние на текущую миграцию:** нулевое. Фаза 6 включает RLS-on без политик и REVOKE — это явное действие, не зависящее от того, что говорит миграция 17.

### Р-3. `migrations/19_messages_update_delete_permissions.sql` ≠ live на `messages`

- **Миграция 19 описывает:** `grant update, delete ON public.messages TO public` (!), плюс TO authenticated; политики `messages_update_own`/`messages_delete_own` (`author_id = auth.uid()`), при условии что схема `auth` существует.
- **Live (v1):** на `messages` стоит `gen_user=arwdDxtm/gen_user` — то есть **REVOKE ALL FROM PUBLIC** уже выполнен (вчерашняя работа SEC-001 этап 0); GRANT'ов к `authenticated` нет в `Access privileges`.
- **Гипотеза дрейфа:** миграция 19 действительно исполнялась в прошлом (`GRANT TO public` явно опасно — это Supabase-наследие, где `public` ≈ anon). Вчера Caddy-закрытием+REVOKE перекрыли это вручную.
- **Опасность для будущих прогонов:** если кто-то перевыполнит `psql -f migrations/19_*.sql` без понимания — **GRANT TO public вернётся**, и все клиенты, имеющие connection-string под `public`, снова получат UPDATE/DELETE. Защита держится на RLS, который сейчас off. Учесть в CLEAN-009.
- **Влияние на текущую миграцию:** нулевое. Фаза 6 делает REVOKE FROM PUBLIC явно, заново.

### Р-4. `migrations/20_push_subscriptions.sql` ≠ live на `push_subscriptions`

- **Миграция 20 описывает:** **НЕ включает RLS** (нет `enable row level security`); даёт `grant select, insert, update ON push_subscriptions TO public` (!); даёт `grant usage, select ON sequence ... TO public`.
- **Live (v1):** RLS=off (соответствует), политик 0 (соответствует), `Access privileges = gen_user=arwdDxtm/gen_user` — то есть **REVOKE ALL FROM PUBLIC выполнен** (вчерашняя работа), но GRANT'ы из миграции 20 в момент исходного прогона действительно были.
- **Гипотеза дрейфа:** аналогично Р-3 — `TO public` исторически от Supabase, REVOKE сделан руками вчера.
- **Влияние на текущую миграцию:** нулевое. Фаза 7 повторяет REVOKE и включает RLS.

### Р-5. `migrations/16_course_progress_rls.sql` — статус совпадения не верифицирован

- **Миграция 16 описывает:** RLS-on + 4 политики (`course_progress_select_own`, `course_progress_select_admin`, `course_progress_insert_own`, `course_progress_insert_admin`).
- **Live (v1):** `course_progress` в списке таблиц с RLS-on; точное число политик в v1 не выписано.
- **Расхождение:** не подтверждено и не опровергнуто. **Действие в pre-flight 0.6 уже включает запрос `policies` по таблице** — если live даст не 4, расхождение всплывёт в момент выполнения. Не блокер.

### Р-6. `migrations/25_app_settings.sql` — соответствует live

- **Миграция 25 описывает:** RLS-on + 2 политики (`app_settings_select_all` USING true, `app_settings_write_admin` через `is_admin()`).
- **Live (v1 backup):** ровно эти 2 политики.
- **Расхождения нет.** Зафиксировано для контроля.

### Сводка

| ID | Файл | Расхождение | Действие в этой сессии |
|---|---|---|---|
| Р-1 | `05_profiles_rls.sql` | Повреждён, мусор вместо SQL | Не чинить, CLEAN-009 |
| Р-2 | `17_create_messages_chat.sql` | RLS+2 политики в репо vs RLS=off+0 политик в live | Не чинить, CLEAN-009 |
| Р-3 | `19_messages_update_delete_permissions.sql` | GRANT TO public в репо vs REVOKE FROM PUBLIC в live | Не чинить, CLEAN-009 |
| Р-4 | `20_push_subscriptions.sql` | GRANT TO public в репо vs REVOKE FROM PUBLIC в live | Не чинить, CLEAN-009 |
| Р-5 | `16_course_progress_rls.sql` | Статус совпадения неизвестен | Pre-flight 0.6 покажет, не блокер |
| Р-6 | `25_app_settings.sql` | Совпадает | Контрольная точка |

**Итог.** В текущей миграции для всех DROP/CREATE используется **состояние из live-БД (v3 задача 4 / v1 backup)**, не содержимое `migrations/*.sql`. Если pre-flight 0.6 / 0.7 / 0.9 даст расхождение с ожидаемым — стоп, разобраться отдельно (это сигнал, что между чтением v1–v5 и началом миграции кто-то ещё что-то менял).

---

## Фаза 1 — Чистка 10 дублей политик `profiles`

**Цель.** Убрать 10 политик, которые либо дублируют корректные, либо открывают `profiles` всем (`qual=true`), либо привязаны к hardcoded email. Оставить 4 минимально необходимых: `profiles_select_authenticated`, `profiles_insert_own`, `profiles_update_own`, `profiles_update_admin`.

**Ссылка на v3 задача 4** — там точные имена и `qual` всех 14 политик.

```sql
BEGIN;

-- SELECT-дубли с qual=true (3 шт.)
DROP POLICY IF EXISTS "Map_View_All" ON public.profiles;
DROP POLICY IF EXISTS "Public View" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;

-- UPDATE-дубли по auth.uid()=id (3 шт., оставляем profiles_update_own)
DROP POLICY IF EXISTS "Self Update" ON public.profiles;
DROP POLICY IF EXISTS "User_Edit_Self" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;

-- INSERT-дубли по auth.uid()=id (2 шт., оставляем profiles_insert_own)
DROP POLICY IF EXISTS "User_Insert_Self" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;

-- Hardcoded olga@skrebeyko.com (2 шт., замена is_admin() уже покрыта profiles_update_admin)
DROP POLICY IF EXISTS "Olga Power" ON public.profiles;
DROP POLICY IF EXISTS "Olga_Power_Profiles" ON public.profiles;

-- Smoke: остаётся ровно 4 политики
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='profiles';
  IF n <> 4 THEN RAISE EXCEPTION 'Expected 4 profiles policies, got %', n; END IF;
END $$;

COMMIT;

-- ROLLBACK (если smoke упал ИЛИ обнаружилось, что какая-то из дроп-политик была нужна):
-- BEGIN;
-- CREATE POLICY "Map_View_All" ON public.profiles FOR SELECT TO public USING (true);
-- CREATE POLICY "Public View" ON public.profiles FOR SELECT TO public USING (true);
-- CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles FOR SELECT TO public USING (true);
-- CREATE POLICY "Self Update" ON public.profiles FOR UPDATE TO public USING (auth.uid() = id);
-- CREATE POLICY "User_Edit_Self" ON public.profiles FOR UPDATE TO public USING (auth.uid() = id);
-- CREATE POLICY "Users can update own profile." ON public.profiles FOR UPDATE TO public USING (auth.uid() = id);
-- CREATE POLICY "User_Insert_Self" ON public.profiles FOR INSERT TO public WITH CHECK (auth.uid() = id);
-- CREATE POLICY "Users can insert their own profile." ON public.profiles FOR INSERT TO public WITH CHECK (auth.uid() = id);
-- CREATE POLICY "Olga Power" ON public.profiles FOR ALL TO public USING ((auth.jwt() ->> 'email'::text) = 'olga@skrebeyko.com'::text) WITH CHECK ((auth.jwt() ->> 'email'::text) = 'olga@skrebeyko.com'::text);
-- CREATE POLICY "Olga_Power_Profiles" ON public.profiles FOR ALL TO public USING ((auth.jwt() ->> 'email'::text) = 'olga@skrebeyko.com'::text) WITH CHECK ((auth.jwt() ->> 'email'::text) = 'olga@skrebeyko.com'::text);
-- COMMIT;
```

---

## Фаза 2 — Замена hardcoded-Olga в `knowledge_base`

**Цель.** Перевести `KB_Update_Admin` и `KB_Delete_Admin` с hardcoded email на role-based проверку через `is_admin()`. Эти 2 политики **выживают** после фазы 1 (они не на `profiles`), но содержат hardcoded `olga@skrebeyko.com` (см. v1 раздел 2).

**Контекст.** На `knowledge_base` сейчас 5 политик: `KB_View_All` (USING true), `KB_Edit_Auth` (auth.role()='authenticated'), `KB_Insert_Auth` (auth.role()='authenticated'), `KB_Update_Admin` (hardcoded email), `KB_Delete_Admin` (hardcoded email). Заменяем admin-проверки.

```sql
BEGIN;

DROP POLICY IF EXISTS "KB_Update_Admin" ON public.knowledge_base;
DROP POLICY IF EXISTS "KB_Delete_Admin" ON public.knowledge_base;

CREATE POLICY kb_update_admin ON public.knowledge_base
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY kb_delete_admin ON public.knowledge_base
  FOR DELETE TO authenticated
  USING (is_admin());

-- Smoke: проверяем, что новые admin-политики появились
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
    WHERE schemaname='public' AND tablename='knowledge_base'
      AND policyname IN ('kb_update_admin','kb_delete_admin');
  IF n <> 2 THEN RAISE EXCEPTION 'Expected 2 new KB admin policies, got %', n; END IF;
END $$;

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- DROP POLICY IF EXISTS kb_update_admin ON public.knowledge_base;
-- DROP POLICY IF EXISTS kb_delete_admin ON public.knowledge_base;
-- CREATE POLICY "KB_Update_Admin" ON public.knowledge_base FOR UPDATE TO public USING ((auth.jwt() ->> 'email'::text) = 'olga@skrebeyko.com'::text);
-- CREATE POLICY "KB_Delete_Admin" ON public.knowledge_base FOR DELETE TO public USING ((auth.jwt() ->> 'email'::text) = 'olga@skrebeyko.com'::text);
-- COMMIT;
```

---

## Фаза 3 — Хелпер `public.is_mentor_for(uuid)`

**Цель.** Создать функцию, которая проверяет: «Является ли текущий `auth.uid()` ментором для студента `student_uuid`?». Используется в шаблонах B и C. `SECURITY DEFINER` — потому что без него функция запускается под правами вызывающего, а у `authenticated` после фазы 14 не будет SELECT на `pvl_garden_mentor_links` без RLS-фильтра. `STABLE` — результат не меняется в пределах одного запроса.

```sql
BEGIN;

CREATE OR REPLACE FUNCTION public.is_mentor_for(student_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pvl_garden_mentor_links
    WHERE student_id = student_uuid
      AND mentor_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_mentor_for(uuid) TO authenticated;

-- web_anon выполнить эту функцию не может (нет GRANT)
REVOKE EXECUTE ON FUNCTION public.is_mentor_for(uuid) FROM PUBLIC;

-- Smoke: функция существует, EXECUTE есть у authenticated
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname='public' AND p.proname='is_mentor_for';
  IF n <> 1 THEN RAISE EXCEPTION 'is_mentor_for not created'; END IF;
END $$;

COMMIT;

-- ROLLBACK:
-- BEGIN; DROP FUNCTION IF EXISTS public.is_mentor_for(uuid); COMMIT;
```

⚠ **Критический момент.** `is_mentor_for` использует `pvl_garden_mentor_links` без фильтра по `is_active`/etc., потому что в этой таблице нет такой колонки (PK = student_id, один студент = один линк). Если в будущем добавится история связок — функцию придётся обновить.

---

## Фаза 4 — Lockdown `users_auth`

**Цель.** Закрыть таблицу с `password_hash` от `web_anon`/`authenticated`/`PUBLIC` через RLS-on без политик + REVOKE как defense-in-depth.

⚠ **Важно.** `gen_user` (owner) сохранит доступ через owner-bypass, потому что мы НЕ включаем FORCE. Это значит, что garden-auth-сервис продолжит логинить пользователей. См. SEC-004 (отдельная задача) про FORCE и отдельную auth-роль.

```sql
BEGIN;

-- RLS-on без политик: любой запрос под web_anon/authenticated вернёт 0 строк
ALTER TABLE public.users_auth ENABLE ROW LEVEL SECURITY;

-- Defense-in-depth: REVOKE со всех потенциальных ролей
REVOKE ALL ON public.users_auth FROM PUBLIC;
REVOKE ALL ON public.users_auth FROM web_anon;
REVOKE ALL ON public.users_auth FROM authenticated;

-- Smoke: RLS включён, политик нет
DO $$
DECLARE rls_on bool; n_pols int;
BEGIN
  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid = 'public.users_auth'::regclass;
  IF NOT rls_on THEN RAISE EXCEPTION 'users_auth RLS not enabled'; END IF;
  SELECT count(*) INTO n_pols FROM pg_policies WHERE schemaname='public' AND tablename='users_auth';
  IF n_pols <> 0 THEN RAISE EXCEPTION 'users_auth: expected 0 policies, got %', n_pols; END IF;
END $$;

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- ALTER TABLE public.users_auth DISABLE ROW LEVEL SECURITY;
-- -- (GRANT'ы возвращать руками если нужно)
-- COMMIT;
```

---

## Фаза 5 — Lockdown `to_archive` и `events_archive`

**Цель.** Закрыть архивные/staging таблицы. Никто их не читает в боевом потоке.

```sql
BEGIN;

ALTER TABLE public.to_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.to_archive FROM PUBLIC;
REVOKE ALL ON public.to_archive FROM web_anon;
REVOKE ALL ON public.to_archive FROM authenticated;

ALTER TABLE public.events_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.events_archive FROM PUBLIC;
REVOKE ALL ON public.events_archive FROM web_anon;
REVOKE ALL ON public.events_archive FROM authenticated;

-- Smoke
DO $$
DECLARE rls_on bool;
BEGIN
  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid = 'public.to_archive'::regclass;
  IF NOT rls_on THEN RAISE EXCEPTION 'to_archive RLS not enabled'; END IF;
  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid = 'public.events_archive'::regclass;
  IF NOT rls_on THEN RAISE EXCEPTION 'events_archive RLS not enabled'; END IF;
END $$;

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- ALTER TABLE public.to_archive DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.events_archive DISABLE ROW LEVEL SECURITY;
-- COMMIT;
```

---

## Фаза 6 — `messages`: RLS-on без политик

**Цель.** Закрыть таблицу `messages` тем же паттерном, что `users_auth`/`to_archive`/`events_archive`: RLS-on без политик + REVOKE для PUBLIC/web_anon/authenticated.

📝 **Решение по 4 тестовым строкам.** Изначально планировался `DELETE WHERE created_at::date = '2026-03-17'` для очистки тестовых. На исполнении (попытка 1, 2026-05-02 ~21:15 MSK) выявлен баг в smoke #1: `GET DIAGNOSTICS … ROW_COUNT` внутри `DO`-блока возвращает 0, не 4 (внешний DELETE не виден plpgsql-блоку). Транзакция откатилась, состояние не изменилось.

Владелец принял решение **не удалять 4 строки в этой миграции** — RLS-on без политик защищает одинаково с строками или без. 4 строки = тестовые от 2026-03-17 («Тестовое сообщение из БД», «И от меня» и т.п.), бизнес-смысла не имеют. Удаление — отдельной задачей **CLEAN-010** в backlog.

```sql
BEGIN;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.messages FROM PUBLIC;
REVOKE ALL ON public.messages FROM web_anon;
REVOKE ALL ON public.messages FROM authenticated;

-- Smoke: RLS включён, политик нет
DO $$
DECLARE rls_on bool; n_pols int;
BEGIN
  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid='public.messages'::regclass;
  IF NOT rls_on THEN RAISE EXCEPTION 'messages RLS not enabled'; END IF;
  SELECT count(*) INTO n_pols FROM pg_policies WHERE schemaname='public' AND tablename='messages';
  IF n_pols <> 0 THEN RAISE EXCEPTION 'messages: expected 0 policies, got %', n_pols; END IF;
END $$;

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- ALTER TABLE public.messages DISABLE ROW LEVEL SECURITY;
-- COMMIT;
```

⚠ **Заметка.** Realtime-publication `supabase_realtime` на `messages` остаётся (см. v3 — это legacy от Supabase). На безопасность не влияет, удалить отдельной задачей CLEAN-006.

---

## Фаза 7 — `push_subscriptions`: RLS-on без политик

**Цель.** Защитить таблицу подписок. Сейчас 0 строк, фича не активна.

```sql
BEGIN;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions FROM PUBLIC;
REVOKE ALL ON public.push_subscriptions FROM web_anon;
REVOKE ALL ON public.push_subscriptions FROM authenticated;

-- Smoke
DO $$
DECLARE rls_on bool;
BEGIN
  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid='public.push_subscriptions'::regclass;
  IF NOT rls_on THEN RAISE EXCEPTION 'push_subscriptions RLS not enabled'; END IF;
END $$;

COMMIT;

-- ROLLBACK: ALTER TABLE public.push_subscriptions DISABLE ROW LEVEL SECURITY;
```

---

## Фаза 8 — `birthday_templates`: RLS + 4 политики

**Цель.** Открыть SELECT для всех залогиненных, CRUD — только админу.

```sql
BEGIN;

ALTER TABLE public.birthday_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY birthday_templates_select_all ON public.birthday_templates
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY birthday_templates_insert_admin ON public.birthday_templates
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY birthday_templates_update_admin ON public.birthday_templates
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY birthday_templates_delete_admin ON public.birthday_templates
  FOR DELETE TO authenticated
  USING (is_admin());

-- Smoke
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='birthday_templates';
  IF n <> 4 THEN RAISE EXCEPTION 'birthday_templates: expected 4 policies, got %', n; END IF;
END $$;

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- DROP POLICY IF EXISTS birthday_templates_select_all ON public.birthday_templates;
-- DROP POLICY IF EXISTS birthday_templates_insert_admin ON public.birthday_templates;
-- DROP POLICY IF EXISTS birthday_templates_update_admin ON public.birthday_templates;
-- DROP POLICY IF EXISTS birthday_templates_delete_admin ON public.birthday_templates;
-- ALTER TABLE public.birthday_templates DISABLE ROW LEVEL SECURITY;
-- COMMIT;
```

---

## Фаза 9 — Шаблон A: контент курса (8 таблиц)

**Цель.** Все залогиненные читают; писать может только админ.

**Таблицы.** `pvl_course_weeks`, `pvl_course_lessons`, `pvl_content_items`, `pvl_content_placements`, `pvl_homework_items`, `pvl_calendar_events`, `pvl_faq_items`, `pvl_cohorts`.

```sql
BEGIN;

-- Универсальный «макрос» через DO: для каждой таблицы — RLS-on + 4 политики
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'pvl_course_weeks','pvl_course_lessons','pvl_content_items','pvl_content_placements',
    'pvl_homework_items','pvl_calendar_events','pvl_faq_items','pvl_cohorts'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
                   t || '_select_all', t);

    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (is_admin())',
                   t || '_insert_admin', t);

    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin())',
                   t || '_update_admin', t);

    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (is_admin())',
                   t || '_delete_admin', t);
  END LOOP;
END $$;

-- Smoke: на каждой из 8 таблиц по 4 политики (всего 32) + RLS-on
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public'
     AND tablename = ANY(ARRAY['pvl_course_weeks','pvl_course_lessons','pvl_content_items',
       'pvl_content_placements','pvl_homework_items','pvl_calendar_events','pvl_faq_items','pvl_cohorts']);
  IF n <> 32 THEN RAISE EXCEPTION 'Шаблон A: expected 32 policies, got %', n; END IF;
END $$;

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- DO $$
-- DECLARE t text; tables text[] := ARRAY['pvl_course_weeks','pvl_course_lessons','pvl_content_items','pvl_content_placements','pvl_homework_items','pvl_calendar_events','pvl_faq_items','pvl_cohorts'];
-- BEGIN
--   FOREACH t IN ARRAY tables LOOP
--     EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_all', t);
--     EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert_admin', t);
--     EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update_admin', t);
--     EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete_admin', t);
--     EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
--   END LOOP;
-- END $$;
-- COMMIT;
```

---

## Фаза 10 — Шаблон B: свои данные ученика (9 таблиц)

**Цель.** Студент видит/правит свои строки, ментор — строки своих студентов, админ — все. Удалять — только админ.

**Таблицы UUID-id.** `pvl_student_homework_submissions`, `pvl_student_course_progress`, `pvl_student_content_progress`, `pvl_checklist_items`, `pvl_student_certification_scores`, `pvl_student_course_points`, `pvl_student_disputes`. Все 7 — `student_id uuid`, FK на `pvl_students(id)`.

**Таблица TEXT-id.** `pvl_student_questions` — `student_id text` (см. v3). Cast `auth.uid()::text`.

**Таблица без прямого `student_id`.** `pvl_student_certification_criteria_scores` — `certification_score_id uuid → pvl_student_certification_scores(student_id)`. Идём через JOIN.

⚠ **Особый случай.** `pvl_homework_status_history` владелец отнёс в шаблон D, **не** в B (см. решение #7 шаблон D). В фазе 10 её нет.

### 10.1 — UUID-таблицы со student_id напрямую (7 шт.)

```sql
BEGIN;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'pvl_student_homework_submissions','pvl_student_course_progress',
    'pvl_student_content_progress','pvl_checklist_items',
    'pvl_student_certification_scores','pvl_student_course_points','pvl_student_disputes'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Включаем RLS, если ещё не включён (pvl_checklist_items и pvl_student_content_progress уже rls=on)
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Сначала чистим no-op политики ALL with qual=true, если есть
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_all', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_student', t);

    -- SELECT: свой_id, ментор, админ
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (student_id = auth.uid() OR is_admin() OR public.is_mentor_for(student_id))$f$,
      t || '_select_own_or_mentor_or_admin', t);

    -- INSERT: только за себя
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
      WITH CHECK (student_id = auth.uid())$f$, t || '_insert_own', t);

    -- UPDATE: свои строки + ментор + админ (USING + WITH CHECK совпадают)
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
      USING (student_id = auth.uid() OR is_admin() OR public.is_mentor_for(student_id))
      WITH CHECK (student_id = auth.uid() OR is_admin() OR public.is_mentor_for(student_id))$f$,
      t || '_update_own_or_mentor_or_admin', t);

    -- DELETE: только админ
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (is_admin())',
                   t || '_delete_admin', t);
  END LOOP;
END $$;

-- Smoke: 7 таблиц × 4 политики = 28
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public'
     AND tablename = ANY(ARRAY['pvl_student_homework_submissions','pvl_student_course_progress',
       'pvl_student_content_progress','pvl_checklist_items','pvl_student_certification_scores',
       'pvl_student_course_points','pvl_student_disputes'])
     AND (
       policyname LIKE '%_own_or_mentor_or_admin'
       OR policyname LIKE '%_insert_own'
       OR policyname LIKE '%_delete_admin'
     );
  IF n < 28 THEN RAISE EXCEPTION 'Шаблон B (UUID): ожидалось ≥28 политик, получено %', n; END IF;
END $$;

COMMIT;
```

### 10.2 — TEXT-таблица `pvl_student_questions`

```sql
BEGIN;

ALTER TABLE public.pvl_student_questions ENABLE ROW LEVEL SECURITY;

-- В этой таблице student_id — TEXT, нужен cast auth.uid()::text.
-- ВАЖНО: is_mentor_for(uuid) принимает uuid, поэтому обратный cast student_id::uuid.
-- Если значение student_id невалидное uuid — функция упадёт с ошибкой. Это приемлемо:
-- невалидные строки не должны быть в живой таблице.
CREATE POLICY pvl_student_questions_select_own_or_mentor_or_admin
  ON public.pvl_student_questions FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()::text
    OR is_admin()
    OR public.is_mentor_for(student_id::uuid)
  );

CREATE POLICY pvl_student_questions_insert_own
  ON public.pvl_student_questions FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid()::text);

CREATE POLICY pvl_student_questions_update_own_or_mentor_or_admin
  ON public.pvl_student_questions FOR UPDATE TO authenticated
  USING (
    student_id = auth.uid()::text
    OR is_admin()
    OR public.is_mentor_for(student_id::uuid)
  )
  WITH CHECK (
    student_id = auth.uid()::text
    OR is_admin()
    OR public.is_mentor_for(student_id::uuid)
  );

CREATE POLICY pvl_student_questions_delete_admin
  ON public.pvl_student_questions FOR DELETE TO authenticated
  USING (is_admin());

COMMIT;
```

### 10.3 — `pvl_student_certification_criteria_scores` (через JOIN)

```sql
BEGIN;

ALTER TABLE public.pvl_student_certification_criteria_scores ENABLE ROW LEVEL SECURITY;

-- SELECT/UPDATE/INSERT: проверяем владельца через certification_score_id → pvl_student_certification_scores.student_id
CREATE POLICY pvl_student_certification_criteria_scores_select
  ON public.pvl_student_certification_criteria_scores FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pvl_student_certification_scores s
      WHERE s.id = certification_score_id
        AND (s.student_id = auth.uid() OR is_admin() OR public.is_mentor_for(s.student_id))
    )
  );

CREATE POLICY pvl_student_certification_criteria_scores_insert
  ON public.pvl_student_certification_criteria_scores FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pvl_student_certification_scores s
      WHERE s.id = certification_score_id
        AND s.student_id = auth.uid()
    )
  );

CREATE POLICY pvl_student_certification_criteria_scores_update
  ON public.pvl_student_certification_criteria_scores FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pvl_student_certification_scores s
      WHERE s.id = certification_score_id
        AND (s.student_id = auth.uid() OR is_admin() OR public.is_mentor_for(s.student_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pvl_student_certification_scores s
      WHERE s.id = certification_score_id
        AND (s.student_id = auth.uid() OR is_admin() OR public.is_mentor_for(s.student_id))
    )
  );

CREATE POLICY pvl_student_certification_criteria_scores_delete
  ON public.pvl_student_certification_criteria_scores FOR DELETE TO authenticated
  USING (is_admin());

COMMIT;

-- ROLLBACK для всей фазы 10 (10.1 + 10.2 + 10.3):
-- BEGIN;
-- (DROP POLICY ... ON public.<каждая_таблица>; ALTER TABLE ... DISABLE ROW LEVEL SECURITY;)
-- Длинный rollback для 9 таблиц — см. полный backout в конце документа.
-- COMMIT;
```

⚠ **Расхождение, требующее решения.** В шаблоне B по ТЗ владельца **9 таблиц**, но `pvl_student_certification_criteria_scores` из ТЗ покрывается через JOIN (без прямого `student_id`). Если считать как «9 таблиц, на которых есть политики» — мы покрыли все 9 (7 в 10.1 + 1 в 10.2 + 1 в 10.3). Но `pvl_homework_status_history` владелец отдельно отнёс в шаблон D — её здесь нет.

---

## Фаза 11 — Шаблон C: реестр PVL (3 таблицы)

**Цель.** Студент видит свою строку и связанного ментора. Ментор видит своих студентов. Админ — всё. Писать — только админ.

**Таблицы.** `pvl_students`, `pvl_garden_mentor_links`, `pvl_mentors`.

### 11.1 — `pvl_students`

```sql
BEGIN;

ALTER TABLE public.pvl_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY pvl_students_select_own_or_mentor_or_admin
  ON public.pvl_students FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR is_admin()
    OR public.is_mentor_for(id)
  );

CREATE POLICY pvl_students_insert_admin
  ON public.pvl_students FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY pvl_students_update_admin
  ON public.pvl_students FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY pvl_students_delete_admin
  ON public.pvl_students FOR DELETE TO authenticated
  USING (is_admin());

COMMIT;
```

### 11.2 — `pvl_garden_mentor_links`

```sql
BEGIN;

ALTER TABLE public.pvl_garden_mentor_links ENABLE ROW LEVEL SECURITY;

-- SELECT: студент видит свою связку, ментор видит свои связки, админ — всё
CREATE POLICY pvl_garden_mentor_links_select_own_or_mentor_or_admin
  ON public.pvl_garden_mentor_links FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR mentor_id = auth.uid()
    OR is_admin()
  );

-- INSERT/UPDATE/DELETE: только админ (учительская)
CREATE POLICY pvl_garden_mentor_links_insert_admin
  ON public.pvl_garden_mentor_links FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY pvl_garden_mentor_links_update_admin
  ON public.pvl_garden_mentor_links FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY pvl_garden_mentor_links_delete_admin
  ON public.pvl_garden_mentor_links FOR DELETE TO authenticated
  USING (is_admin());

COMMIT;
```

### 11.3 — `pvl_mentors` (шаблон A, не C)

⚠ **Намеренное расхождение с ТЗ владельца.** В исходном плане `pvl_mentors` отнесён в шаблон C (реестр PVL, минимальная изоляция). Применяем **шаблон A** (контент-справочник) на основании фактической структуры таблицы:

- В `pvl_mentors` всего **1 строка** (см. v3 задача 1).
- В `pvl_garden_mentor_links` 5 уникальных `mentor_id`, ни один из них не FK на `pvl_mentors.id` (FK у `pvl_garden_mentor_links.mentor_id` нет вовсе).
- Реальная роль `pvl_mentors.id` — технический uuid (`gen_random_uuid()`), **не равен** `auth.uid()` ментора. Это видно из v6: `pvl_garden_mentor_links.mentor_id` соответствует `profiles.id` (ID-ы менторов в Сад-системе), а `pvl_mentors.id` — отдельная сущность.
- То есть `pvl_mentors` — оторванный справочник имён, не реестр действующих менторов курса.

Шаблон A корректен: SELECT всем залогиненным (имя ментора в UI должно быть видно), CRUD — только админ.

```sql
BEGIN;

ALTER TABLE public.pvl_mentors ENABLE ROW LEVEL SECURITY;

CREATE POLICY pvl_mentors_select_all
  ON public.pvl_mentors FOR SELECT TO authenticated
  USING (true);

CREATE POLICY pvl_mentors_insert_admin
  ON public.pvl_mentors FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY pvl_mentors_update_admin
  ON public.pvl_mentors FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY pvl_mentors_delete_admin
  ON public.pvl_mentors FOR DELETE TO authenticated
  USING (is_admin());

COMMIT;
```

📝 **Если в будущем `pvl_mentors` будет «выровнен» с `profiles`** (через FK `pvl_mentors.id → profiles(id)` или добавление `pvl_mentors.profile_id`) — переключиться на шаблон C можно отдельной задачей. Пока структура такова, шаблон A — единственно работающий вариант.

---

## Фаза 12 — Шаблон D: личные сообщения и нотификации (3 таблицы)

**Таблицы.** `pvl_direct_messages`, `pvl_notifications`, `pvl_homework_status_history`.

### 12.1 — `pvl_direct_messages` (UUID)

**Поля.** `mentor_id uuid`, `student_id uuid`, `author_user_id uuid`. Все три без FK.

```sql
BEGIN;

ALTER TABLE public.pvl_direct_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: участники диалога (ментор/студент) или админ
CREATE POLICY pvl_direct_messages_select_participant_or_admin
  ON public.pvl_direct_messages FOR SELECT TO authenticated
  USING (
    auth.uid() = mentor_id
    OR auth.uid() = student_id
    OR is_admin()
  );

-- INSERT: автор должен совпадать с auth.uid() и быть участником диалога
CREATE POLICY pvl_direct_messages_insert_own
  ON public.pvl_direct_messages FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND (auth.uid() = mentor_id OR auth.uid() = student_id)
  );

-- UPDATE: только автор может править свои (например, edited_at в схеме нет, но на будущее) + админ
CREATE POLICY pvl_direct_messages_update_author_or_admin
  ON public.pvl_direct_messages FOR UPDATE TO authenticated
  USING (author_user_id = auth.uid() OR is_admin())
  WITH CHECK (author_user_id = auth.uid() OR is_admin());

-- DELETE: только админ
CREATE POLICY pvl_direct_messages_delete_admin
  ON public.pvl_direct_messages FOR DELETE TO authenticated
  USING (is_admin());

COMMIT;
```

### 12.2 — `pvl_notifications` (TEXT)

**Поля.** `user_id text`, `recipient_student_id text`, `recipient_mentor_id text`. Триггер `pvl_sync_notification_compat` синкает только legacy-контент, не адресацию (см. v4). Поэтому предикат — OR по 3 колонкам.

```sql
BEGIN;

ALTER TABLE public.pvl_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY pvl_notifications_select_own_or_admin
  ON public.pvl_notifications FOR SELECT TO authenticated
  USING (
    auth.uid()::text = user_id
    OR auth.uid()::text = recipient_student_id
    OR auth.uid()::text = recipient_mentor_id
    OR is_admin()
  );

-- INSERT: любой залогиненный (создание нотификаций фронтом). При желании сузить — только если auth.uid()::text совпадает с одной из полей адресата ИЛИ is_admin().
-- Сейчас принимаем минимально широкий вариант — только залогиненный.
CREATE POLICY pvl_notifications_insert_authenticated
  ON public.pvl_notifications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: только своих нотификаций (для перевода в is_read=true) + админ.
CREATE POLICY pvl_notifications_update_own_or_admin
  ON public.pvl_notifications FOR UPDATE TO authenticated
  USING (
    auth.uid()::text = user_id
    OR auth.uid()::text = recipient_student_id
    OR auth.uid()::text = recipient_mentor_id
    OR is_admin()
  )
  WITH CHECK (
    auth.uid()::text = user_id
    OR auth.uid()::text = recipient_student_id
    OR auth.uid()::text = recipient_mentor_id
    OR is_admin()
  );

-- DELETE: только админ
CREATE POLICY pvl_notifications_delete_admin
  ON public.pvl_notifications FOR DELETE TO authenticated
  USING (is_admin());

COMMIT;
```

⚠ **Расхождение, требующее решения.** В ТЗ владельца про шаблон D написано: «UPDATE: только своих нотификаций для read-status, иначе запрещено». Текущая политика разрешает UPDATE по любому полю (включая, например, `body`/`text`). Если хочется именно «только `is_read`/`read_at`» — нужно либо `WITH CHECK` на сравнение с старыми значениями (сложно в декларативной RLS), либо использовать column-level GRANT (`GRANT UPDATE (is_read, read_at) ON pvl_notifications TO authenticated`). На данный момент политика разрешает UPDATE-всех-колонок. Решить с владельцем перед исполнением.

### 12.3 — `pvl_homework_status_history` (через JOIN)

```sql
BEGIN;

ALTER TABLE public.pvl_homework_status_history ENABLE ROW LEVEL SECURITY;

-- SELECT: участник submission'a (студент/ментор/админ)
CREATE POLICY pvl_homework_status_history_select
  ON public.pvl_homework_status_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pvl_student_homework_submissions s
      WHERE s.id = submission_id
        AND (s.student_id = auth.uid() OR is_admin() OR public.is_mentor_for(s.student_id))
    )
  );

-- INSERT: разрешён, если author = auth.uid() и пишущий имеет право на submission
CREATE POLICY pvl_homework_status_history_insert
  ON public.pvl_homework_status_history FOR INSERT TO authenticated
  WITH CHECK (
    changed_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.pvl_student_homework_submissions s
      WHERE s.id = submission_id
        AND (s.student_id = auth.uid() OR is_admin() OR public.is_mentor_for(s.student_id))
    )
  );

-- UPDATE/DELETE: запрещены (immutable history). Не создаём политики — без них UPDATE/DELETE падает с RLS.

COMMIT;
```

⚠ **Не создаём политики UPDATE и DELETE.** В Postgres отсутствие политики для CMD = запрет под RLS. Это намеренно: история статусов должна быть append-only.

---

## Фаза 13 — Шаблон E: audit log (1 таблица)

**Таблица.** `pvl_audit_log` (TEXT id, `actor_user_id text`).

```sql
BEGIN;

ALTER TABLE public.pvl_audit_log ENABLE ROW LEVEL SECURITY;

-- SELECT: только админ
CREATE POLICY pvl_audit_log_select_admin
  ON public.pvl_audit_log FOR SELECT TO authenticated
  USING (is_admin());

-- INSERT: любой залогиненный
CREATE POLICY pvl_audit_log_insert_authenticated
  ON public.pvl_audit_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE/DELETE: запрещены (нет политик, RLS блокирует)

-- Smoke
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='pvl_audit_log';
  IF n <> 2 THEN RAISE EXCEPTION 'pvl_audit_log: expected 2 policies (select+insert), got %', n; END IF;
END $$;

COMMIT;
```

---

## Фаза 14 — Grants (роль-уровневые привилегии)

**Цель.** На уровне ролей открыть нужный CRUD для `authenticated`. Без `GRANT ...` PostgREST вернёт 401/403 ещё до проверки RLS. RLS отфильтрует строки, GRANT даёт право на тип операции.

⚠ **Принцип.** `web_anon` не получает ничего. `authenticated` получает SELECT на всё (RLS отфильтрует), и точечный GRANT INSERT/UPDATE/DELETE по списку таблиц. Чувствительные таблицы (`users_auth`, `to_archive`, `events_archive`) уже закрыты явным REVOKE в фазах 4–5; здесь их **не GRANT'им**.

### 14.1 — Schema USAGE

```sql
BEGIN;

GRANT USAGE ON SCHEMA public TO web_anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Опционально, если фронт обращается к storage через PostgREST (из v1):
-- GRANT USAGE ON SCHEMA storage TO authenticated;

COMMIT;
```

### 14.2 — SELECT на все таблицы для authenticated, REVOKE на закрытые

```sql
BEGIN;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

-- REVOKE точечно (defense-in-depth повторно к фазам 4-6, плюс audit log)
REVOKE ALL ON public.users_auth         FROM authenticated;
REVOKE ALL ON public.to_archive         FROM authenticated;
REVOKE ALL ON public.events_archive     FROM authenticated;
REVOKE SELECT ON public.messages        FROM authenticated;  -- RLS-on без политик; SELECT всё равно вернёт 0, но REVOKE экономит RTT
REVOKE SELECT ON public.push_subscriptions FROM authenticated;

-- pvl_audit_log — SELECT только через политику, GRANT можно оставить (RLS отфильтрует).
-- Но для скорости отказа на уровне PostgREST лучше REVOKE — INSERT всё равно идёт через GRANT INSERT ниже.
-- Решение: оставляем SELECT GRANT, политика is_admin() сама фильтрует. (Если оставлять только админам — REVOKE и потом GRANT TO admin, но admin как DB-роль у нас не существует — admin определяется через is_admin() из profiles.)

COMMIT;
```

### 14.3 — INSERT/UPDATE/DELETE точечно по списку

```sql
BEGIN;

-- profiles
GRANT INSERT, UPDATE ON public.profiles TO authenticated;
-- DELETE на profiles только через is_admin() — но политики DELETE на profiles нет (см. фазу 1: после чистки 4 политики на profiles, DELETE отсутствует => RLS блокирует). Если админу нужен DELETE — отдельной задачей добавить политику.

-- knowledge_base (RLS уже описывает: INSERT/UPDATE/DELETE через is_admin())
GRANT INSERT, UPDATE, DELETE ON public.knowledge_base TO authenticated;

-- birthday_templates
GRANT INSERT, UPDATE, DELETE ON public.birthday_templates TO authenticated;

-- PVL шаблон A — INSERT/UPDATE/DELETE через is_admin() RLS
DO $$
DECLARE t text; tables text[] := ARRAY[
  'pvl_course_weeks','pvl_course_lessons','pvl_content_items','pvl_content_placements',
  'pvl_homework_items','pvl_calendar_events','pvl_faq_items','pvl_cohorts'
];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('GRANT INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- PVL шаблон B — INSERT/UPDATE/DELETE через RLS
DO $$
DECLARE t text; tables text[] := ARRAY[
  'pvl_student_homework_submissions','pvl_student_course_progress',
  'pvl_student_content_progress','pvl_checklist_items',
  'pvl_student_certification_scores','pvl_student_certification_criteria_scores',
  'pvl_student_course_points','pvl_student_disputes','pvl_student_questions'
];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('GRANT INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- PVL шаблон C
GRANT INSERT, UPDATE, DELETE ON public.pvl_students TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pvl_garden_mentor_links TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pvl_mentors TO authenticated;

-- PVL шаблон D
GRANT INSERT, UPDATE, DELETE ON public.pvl_direct_messages TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pvl_notifications TO authenticated;
GRANT INSERT ON public.pvl_homework_status_history TO authenticated;
-- UPDATE/DELETE на pvl_homework_status_history НЕ даём — append-only

-- PVL шаблон E
GRANT INSERT ON public.pvl_audit_log TO authenticated;
-- UPDATE/DELETE НЕ даём (write-once)

-- Прочие таблицы (cities, events, news, practices, scenarios, app_settings, course_progress,
-- goals, meetings, notebooks, notifications, questions, shop_items) — у них уже свои политики
-- (см. v1). Наш план не меняет их, но GRANT уровня роли может понадобиться.
-- Поэтому даём SELECT (через 14.2 уже) и точечно — INSERT/UPDATE/DELETE по список из v1.
GRANT INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT INSERT ON public.course_progress TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.goals TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.meetings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.news TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.notebooks TO authenticated;
GRANT INSERT, UPDATE ON public.notifications TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.practices TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.questions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.scenarios TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.shop_items TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cities TO authenticated;

COMMIT;
```

### 14.4 — Sequences (для INSERT с identity-колонками)

```sql
BEGIN;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
-- web_anon — не получает.

COMMIT;
```

⚠ **Расхождение, требующее решения.** Список таблиц в 14.3 (последний блок «Прочие») — основан на v1, не верифицирован отдельно. Перед исполнением фазы 14 рекомендуется прогнать pre-flight `\dt+ public.*` и пройтись по списку: какие из них имеют политики INSERT/UPDATE/DELETE и что фронт пишет. Это вне scope db_audit v1–v5; делать на ревью с веб-Claude.

---

## 15. Smoke-тесты (read-only, после всех фаз)

```sql
-- 15.1. Все целевые таблицы имеют RLS=on
SELECT relname, relrowsecurity FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
  AND relname IN (
    'profiles','knowledge_base','birthday_templates',
    'users_auth','to_archive','events_archive',
    'messages','push_subscriptions',
    'pvl_audit_log','pvl_calendar_events','pvl_checklist_items','pvl_cohorts',
    'pvl_content_items','pvl_content_placements','pvl_course_lessons','pvl_course_weeks',
    'pvl_direct_messages','pvl_faq_items','pvl_garden_mentor_links','pvl_homework_items',
    'pvl_homework_status_history','pvl_mentors','pvl_notifications',
    'pvl_student_certification_criteria_scores','pvl_student_certification_scores',
    'pvl_student_content_progress','pvl_student_course_points','pvl_student_course_progress',
    'pvl_student_disputes','pvl_student_homework_submissions','pvl_student_questions','pvl_students'
  )
ORDER BY relname;
-- Ожидаем: relrowsecurity=t для всех

-- 15.2. Контрольные счёты политик
SELECT tablename, count(*) AS policies
FROM pg_policies
WHERE schemaname='public'
GROUP BY tablename
ORDER BY tablename;
-- Ожидаем (минимально, ориентировочно):
-- profiles: 4
-- knowledge_base: 5 (3 старые + 2 новые admin)
-- birthday_templates: 4
-- pvl_course_weeks/lessons/content_items/placements/homework_items/calendar_events/faq_items/cohorts: 4 каждая
-- 7 student-таблиц (UUID): 4 каждая = 28
-- pvl_student_questions: 4
-- pvl_student_certification_criteria_scores: 4
-- pvl_students/pvl_garden_mentor_links/pvl_mentors: 4 каждая = 12
-- pvl_direct_messages: 4
-- pvl_notifications: 4
-- pvl_homework_status_history: 2
-- pvl_audit_log: 2

-- 15.3. is_admin() и is_mentor_for() работают (под gen_user)
-- gen_user не имеет profiles.id и не является ментором. Должны вернуть false без ошибки.
SELECT public.is_admin() AS is_admin_check;  -- ожидаем NULL или false (нет auth.uid)
SELECT public.is_mentor_for('00000000-0000-0000-0000-000000000000') AS not_mentor;  -- ожидаем false

-- 15.4. Под web_anon — всё закрыто
SET ROLE web_anon;
SELECT count(*) FROM public.profiles;  -- ожидаем 0 (не падает, но и не видит)
SELECT count(*) FROM public.users_auth;  -- ожидаем 0
SELECT count(*) FROM public.pvl_students;  -- ожидаем 0
RESET ROLE;

-- 15.5. Под authenticated БЕЗ JWT — то же что web_anon (auth.uid() = NULL)
SET ROLE authenticated;
SELECT count(*) FROM public.profiles;  -- ожидаем 0 (auth.uid() IS NOT NULL = false)
RESET ROLE;

-- 15.6. EXPLAIN на 2-3 ключевых запросах фронта
-- Под authenticated с подделанным JWT — это уже из приложения; здесь просто план под gen_user.
EXPLAIN (FORMAT TEXT)
  SELECT * FROM public.profiles WHERE id = '85dbefda-ba8f-4c60-9f22-b3a7acd45b21';

EXPLAIN (FORMAT TEXT)
  SELECT * FROM public.pvl_student_homework_submissions WHERE student_id = '1085e06d-34ad-4e7e-b337-56a0c19cc43f';

EXPLAIN (FORMAT TEXT)
  SELECT * FROM public.pvl_garden_mentor_links;
```

### 15.7. Функциональные smoke (после открытия Caddy и деплоя фронт-патча)

В браузере, открытом под Ольгой (admin):
- Войти в платформу — должен загрузиться список пользователей.
- Карта ведущих — список не пуст.
- Открыть профиль другого пользователя — данные видны.
- Учительская — назначения видны, кнопка «назначить ментора» работает.
- PVL: войти как студент → открыть курс → открыть урок → отметить чек-лист.
- PVL: войти как ментор → проверить ДЗ своего студента → изменить статус.

Каждое — со снапшотом DevTools Network: `Authorization: Bearer …` присутствует, ответы не 401/403 (кроме целевых, типа попытки чтения чужого).

---

## Backout-план (полный возврат к до-миграционному состоянию)

В случае серьёзных проблем после полного применения. **Не обнуляет данные**, только структуру/политики.

```sql
BEGIN;

-- 1. Снять RLS со всех затронутых таблиц
DO $$
DECLARE t text; tables text[] := ARRAY[
  'birthday_templates','users_auth','to_archive','events_archive','messages','push_subscriptions',
  'pvl_course_weeks','pvl_course_lessons','pvl_content_items','pvl_content_placements',
  'pvl_homework_items','pvl_calendar_events','pvl_faq_items','pvl_cohorts',
  'pvl_student_homework_submissions','pvl_student_course_progress','pvl_student_content_progress',
  'pvl_checklist_items','pvl_student_certification_scores','pvl_student_certification_criteria_scores',
  'pvl_student_course_points','pvl_student_disputes','pvl_student_questions',
  'pvl_students','pvl_garden_mentor_links','pvl_mentors',
  'pvl_direct_messages','pvl_notifications','pvl_homework_status_history','pvl_audit_log'
];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- 2. Удалить новые политики (имена паттерн-матчатся)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname='public'
      AND (
        policyname LIKE '%_select_all'
        OR policyname LIKE '%_insert_admin'
        OR policyname LIKE '%_update_admin'
        OR policyname LIKE '%_delete_admin'
        OR policyname LIKE '%_select_own_or_mentor_or_admin'
        OR policyname LIKE '%_update_own_or_mentor_or_admin'
        OR policyname LIKE '%_insert_own'
        OR policyname IN ('kb_update_admin','kb_delete_admin',
                          'pvl_direct_messages_select_participant_or_admin',
                          'pvl_direct_messages_insert_own',
                          'pvl_direct_messages_update_author_or_admin',
                          'pvl_direct_messages_delete_admin',
                          'pvl_notifications_select_own_or_admin',
                          'pvl_notifications_insert_authenticated',
                          'pvl_notifications_update_own_or_admin',
                          'pvl_notifications_delete_admin',
                          'pvl_homework_status_history_select',
                          'pvl_homework_status_history_insert',
                          'pvl_audit_log_select_admin',
                          'pvl_audit_log_insert_authenticated',
                          'pvl_mentors_select_self_or_student_or_admin')
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I.%I',
                   r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- 3. Восстановить чистенный набор profiles (через rollback фазы 1)
-- См. фаза 1, секция ROLLBACK.

-- 4. Восстановить hardcoded-Olga в knowledge_base (через rollback фазы 2)
-- См. фаза 2, секция ROLLBACK.

-- 5. Удалить хелпер
DROP FUNCTION IF EXISTS public.is_mentor_for(uuid);

-- 6. Восстановить 4 тестовые messages (через rollback фазы 6)
-- См. фаза 6, секция ROLLBACK.

-- 7. Grants — ROLLBACK через `\copy` бэкапа pre-flight
-- (этот шаг не делается одной командой, нужен файл из 0.10)

ROLLBACK;  -- ← НЕ исполняем backout «целиком», копируем нужные части
```

⚠ **Backout-план не «один SQL-блок».** Это **набор фрагментов**, которые исполняются избирательно: что именно сломалось — то и откатываем. Полный backout без причины не нужен.

---

## Контрольный список перед исполнением

- [ ] Подтверждено: `pvl_mentors.id` = `auth.uid()` ментора в profiles. (Иначе фаза 11.3 не работает на полную.)
- [ ] Подтверждено: для `pvl_notifications` UPDATE OK на all-columns (не только `is_read`/`read_at`). (Иначе нужны column-grants.)
- [ ] Подтверждён список «прочих таблиц» в фазе 14.3 (cities/events/news/…).
- [ ] Pre-flight 0.1–0.10 пройдены, расхождений нет.
- [ ] Backup `~/policies_backup_2026-05-02_pre_migration.csv` существует.
- [ ] Готов фронт-патч (FRONTEND_PATCH_2026-05-02_jwt_fallback.md), но **не задеплоен** — деплоим после успеха фаз 1–14.
- [ ] План отдельной мини-задачи: восстановить/заменить пустой `migrations/05_profiles_rls.sql`.
