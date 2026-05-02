---
title: Runbook Garden — known runtime quirks + диагностика
type: runbook
version: 1.0
created: 2026-05-02
status: active
purpose: операционное знание о Garden — симптомы, диагностика,
  design-decisions, ловушки. Дополняется по мере работы.
related_docs:
  - CLAUDE.md
  - plans/BACKLOG.md
  - docs/MIGRATION_2026-05-02_security_restoration.md
---

# Runbook Garden

## 1. Симптомы → диагностика

Если в проде что-то ведёт себя неожиданно — сначала смотри сюда.

### 1.1. «Студент не видит свой вопрос в pvl_student_questions»

**Возможная причина:** в строке `pvl_student_questions.student_id`
лежит невалидный UUID. RLS-политика делает `student_id::uuid`
для передачи в `is_mentor_for(uuid)`, и cast падает с
`invalid input syntax for type uuid`. Postgres интерпретирует
такую ошибку как «строка не прошла политику» — fail-closed.
Owner-bypass (`gen_user`) видит строку, обычные роли — нет.

**Диагностика (под gen_user):**

```sql
SELECT id, student_id, length(student_id) AS len
FROM public.pvl_student_questions
WHERE NOT student_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
```

Если результат непуст — это «слепые» строки.

**Решение:** либо починить student_id (UPDATE), либо удалить
строку. После CLEAN-007 (миграция таблицы на UUID) проблема
исчезнет.

**Связано:** docs/EXEC_2026-05-02_phase10_2_pvl_student_questions.md
(урок 9), CLEAN-007 в backlog.

### 1.2. «gen_user внезапно потерял права, прод не работает»

**Возможная причина:** кто-то открыл в Timeweb-панели форму
«Привилегии gen_user» и сохранил с дефолтными галочками.
Эта форма работает как snapshot replacement ACL: при
сохранении делает REVOKE ALL FROM gen_user и затем GRANT
только тех привилегий, что отмечены. Если форма пустая по
дефолту — gen_user теряет всё.

**Диагностика:**

```sql
-- Под postgres в default_db:
SELECT has_schema_privilege('gen_user', 'public', 'USAGE') AS u,
       has_schema_privilege('gen_user', 'public', 'CREATE') AS c;
SELECT relname, relacl FROM pg_class
WHERE relnamespace = 'public'::regnamespace AND relkind='r' LIMIT 10;
```

Если USAGE/CREATE = false или relacl без gen_user — права сорваны.

**Решение:** не открывать форму без понимания. Если уже
открыли и сохранили — восстановить права через ту же форму,
поставив все нужные галочки (или через SQL под postgres).

**Связано:** EXEC_2026-05-02_phase3_is_mentor_for.md (урок про
форму Timeweb).

### 1.3. «Список пользователей пуст после логина»

**Возможная причина 1:** токен в localStorage есть, но истёк/
невалиден. PostgREST возвращает 401, фронт получает пустой
массив. После фронт-патча должен сработать обработчик
has401 → api.logout() → setCurrentUser(null), но если патч
не задеплоен — пользователь застревает.

**Диагностика:**

- DevTools → Network → запрос на /profiles — есть ли header
  `Authorization: Bearer …`?
- Если есть и приходит 401 → токен невалиден.
- Если Bearer нет → latch-флаг сработал в старом коде или
  VITE_POSTGREST_SKIP_JWT включён в env.

**Решение:** ручной logout (очистить localStorage), повторный
логин.

**Связано:** docs/FRONTEND_PATCH_2026-05-02_jwt_fallback.md
(патч 1, патч 3).

### 1.4. «После применения миграции messages начал возвращать пусто, а раньше там было 4 строки»

Это не баг, это намеренно. 4 тестовые строки от 2026-03-17
оставлены в БД для упрощения миграции (см. CLEAN-010). Они
видны только под gen_user через owner-bypass. Под web_anon/
authenticated RLS-on без политик возвращает 0. Когда фича
чата активируется — отдельная задача (включить политики,
дать grants).

### 1.5. «Студент видит только себя в списке студентов курса (cohort/одногруппники)»

**Возможная причина:** это намеренно, не баг. После SEC-001 фаза
11.1 (`pvl_students` под шаблоном C) студент через RLS видит
**только свою строку** в `pvl_students` (предикат `id = auth.uid()
OR is_admin() OR is_mentor_for(id)`). `pvlPostgrestApi.listStudents()`
вернёт ему 1 строку. Ментор увидит своих 3-4 студентов. Админ
увидит всех 23.

**Это согласуется с решением владельца** «студент видит только
инфу про себя» (Вариант A, шаблон C, сессия 2026-05-02).

**Диагностика (под gen_user):**

```sql
-- Сколько pvl_students-строк увидит конкретный пользователь:
SET LOCAL request.jwt.claims = '{"sub": "<uuid_пользователя>"}';
SET ROLE authenticated;
SELECT count(*) FROM public.pvl_students;
RESET ROLE;
```

**Когда это не «по дизайну», а баг:**

- Если **админ** видит меньше 23 — проблема. Проверить `is_admin()`
  и роль в `profiles`.
- Если **ментор** видит 0 (а должен 3-4) — проблема. Проверить
  `pvl_garden_mentor_links` (есть ли запись с его `mentor_id =
  auth.uid()`) и `is_mentor_for(...)`.

**Решение, если это нужно поменять:** ввести политику «студенты
одной когорты могут видеть друг друга» — потребует FK `cohort_id`
(сейчас у всех 23 он NULL, см. 3.4) либо отдельный RPC под админом.

**Связано:** docs/EXEC_2026-05-02_phase11_1_pvl_students.md
(раздел «Следствие для фронта»), раздел 3.1 этого runbook'а.

## 2. Расхождения репо ↔ прод

### 2.1. migrations/05_profiles_rls.sql — повреждён

42 байта, содержит `{97AE7713-21F0-4F0C-B575-A281FE6084F0}.png`
вместо SQL. Реальное состояние политик profiles берётся из
live-БД (см. v3 задача 4). См. CLEAN-009.

### 2.2. migrations/17_create_messages_chat.sql

Описывает RLS+2 политики — в live RLS=off, 0 политик. Если
прогнать миграцию повторно — лишние политики.

### 2.3. migrations/19_messages_update_delete_permissions.sql

🔴 **Опасно.** Содержит `GRANT update, delete ON messages TO public`.
Если прогнать повторно — open-write для всех вернётся, RLS
не покроет (RLS включён, но политик 0 → доступ через owner-bypass
будет работать, public получит INSERT/UPDATE/DELETE поверх — нет,
только если RLS-on без политик блокирует). На текущий момент
REVOKE FROM PUBLIC сделан вручную. См. CLEAN-009.

### 2.4. migrations/20_push_subscriptions.sql

🔴 **Опасно.** То же самое с push_subscriptions.

## 3. Особенности структуры БД (design-decisions, не баги)

### 3.1. pvl_students.id = profiles.id — конвенция, не FK

Связь между PVL-студентом и его профилем — на уровне
договорённости ETL: при выдаче `profiles.role='applicant'`
создаётся запись в pvl_students с тем же UUID. На 2026-05-02
22/23 совпадают (одна тестовая «Участница» — placeholder).
См. ARCH-010 в backlog (если когда-то будут проблемы — добавить
FK).

### 3.2. «Участница» с UUID 33333333-…-01 в pvl_students

Тестовая seed-запись, оставлена осознанно. Не имеет соответствующего
профиля и ментора. Под шаблоном B невидима (никто не залогинится
с таким auth.uid()), под шаблоном C видна админу и ментору
(не привязана). Если когда-то будет мешать — DELETE безопасно.

### 3.3. pvl_mentors — оторванный справочник

В таблице 1 placeholder-строка («Елена Ментор», UUID 22222…01).
Реальные 5 менторов хранятся в `pvl_garden_mentor_links.mentor_id`,
которые ссылаются на profiles.id. Из-за этого pvl_mentors
покрыта шаблоном A (read-all-write-admin), а не шаблоном C.
Если структура когда-нибудь выровняется — переключить на C.

### 3.4. pvl_students.mentor_id и cohort_id — мёртвые колонки

У всех 23 студентов NULL. Реальная связка ментор↔студент
— только в pvl_garden_mentor_links. См. CLEAN-007.

### 3.5. messages в publication supabase_realtime

Legacy от Supabase. Realtime-фича не используется фронтом.
Удалить отдельной задачей (низкий приоритет).

## 4. Ловушки кода фронта

### 4.1. services/pvlMockApi.js — НЕ mock

Production-код на 4221 строку, гибрид seed + реальный
PostgREST через pvlPostgrestApi. Используется в 7 production-
views. Не удалять. Имя вводит в заблуждение, переименование
запланировано в REFACTOR-001.

### 4.2. VITE_POSTGREST_SKIP_JWT — dev-only флаг

Если на проде окажется в env, фронт перестанет посылать Bearer
→ всё пойдёт под web_anon → пользователь видит пусто. На прод-
сборке (deploy.yml) этот флаг не передаётся (см. v5).
Если когда-то всплывёт — проверить .env и GitHub Secrets.

### 4.3. api.getCurrentUser() — без сетевой проверки токена

Читает из localStorage напрямую, не валидирует токен. Если
token истёк, а user в localStorage остался — фронт думает
«залогинен», но запросы возвращают 401. Каждые 60 секунд
фоновый таймер должен дёрнуть /auth/me и обновить состояние.
См. FRONTEND_PATCH (патч 3) — добавлено явное обработчик
401.

## 5. Lessons learned для DDL-миграций

### 5.1. gen_user не имеет CREATE on schema public по умолчанию

Owner таблиц ≠ owner схемы. Schema public принадлежит
pg_database_owner. Для CREATE FUNCTION нужен явный
`GRANT CREATE ON SCHEMA public TO gen_user` под postgres
в правильной БД (default_db). После миграции —
`REVOKE CREATE ON SCHEMA public FROM gen_user`.

### 5.2. GET DIAGNOSTICS ROW_COUNT в DO-блоке

Считает строки последнего statement внутри DO, не статусы
выполненные снаружи. Не использовать для верификации DELETE/
INSERT, выполненных перед DO. Альтернатива — SELECT count(*)
до и после.

### 5.3. Конфликт dollar-tags $$ и $f$

В DO-блоке с `EXECUTE format($f$ ... $f$, ...)` внешний DO
не должен использовать те же `$$`. Вместо `DO $$ ... END $$`
использовать `DO $outer$ ... END $outer$`.

### 5.4. Web-форма Timeweb «Привилегии» = REVOKE ALL + GRANT

Snapshot-замена ACL, не инкремент. Открывать только если
точно знаешь полный набор нужных галочек. Лучше править
права через SQL под postgres.

### 5.5. GitHub Actions secrets vs .env сборки

GH Secrets не попадают в Vite-сборку автоматически. Только
те переменные, что явно прописаны в deploy.yml шаге
`Create env file`. Пишем `VITE_X` в env только если
явно `echo "VITE_X=..." >> .env` в workflow.

### 5.6. RLS-политика, ссылающаяся на функцию, требует EXECUTE для роли

RLS-политика выполняется в контексте вызывающей роли. Если
политика вызывает `is_mentor_for(uuid)` или другую SQL-функцию,
и роль (`authenticated` / `web_anon`) не имеет `EXECUTE` на эту
функцию — запрос падает с `permission denied for function …`,
а не возвращает 0 строк через RLS-фильтр.

**Признак:** RLS добавлена, политики корректны, но
`SELECT count(*)` под `SET ROLE authenticated` возвращает
`permission denied for function`, не 0.

**Решение:**
```sql
GRANT EXECUTE ON FUNCTION schema.fn(arg_types) TO authenticated;
REVOKE EXECUTE ON FUNCTION schema.fn(arg_types) FROM PUBLIC;
```

**Не путать с `SECURITY DEFINER`:** `SECURITY DEFINER` обходит
проверку привилегий внутри тела функции (она исполняется как
owner), но саму функцию вызвать без EXECUTE-привилегии у
вызывающей роли всё равно нельзя — это другой уровень проверки.

**Подвох с верификацией:** `information_schema.routine_privileges`
может показывать grant как существующий, но в реальном
`SET ROLE` он не работает. Проверять через
`pg_proc.proacl` напрямую и через **реальный smoke с SET ROLE**:

```sql
-- Реальные grants:
SELECT proname, proacl FROM pg_proc
WHERE pronamespace='public'::regnamespace AND proname='is_mentor_for';

-- Реальный smoke:
BEGIN;
SET LOCAL ROLE authenticated;
SELECT count(*) FROM public.pvl_students;  -- не должно падать
ROLLBACK;
```

**Связано:** docs/EXEC_2026-05-02_phase3_is_mentor_for.md
(verifications) vs docs/EXEC_2026-05-02_phase15_smoke_tests.md
(находка 1 — реальный SET ROLE smoke).

## Как пополнять этот файл

При обнаружении нового runtime-quirk'а / расхождения /
поучительной ошибки:

1. Добавить новую подсекцию в нужный раздел (1-5).
2. Использовать формат: «Возможная причина / Диагностика /
   Решение / Связано».
3. Связать со всеми релевантными документами в `docs/` и `plans/`.
4. Дата-кейсам с резолюцией: оставлять историческую запись
   («исправлено миграцией X в дату Y»), не удалять.
