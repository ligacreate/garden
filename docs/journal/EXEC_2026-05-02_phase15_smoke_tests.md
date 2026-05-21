---
title: SEC-001 Phase 15 — Smoke tests (execution log)
type: execution-log
phase: "15"
created: 2026-05-03
status: ✅ COMPLETED
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
prev_phase: docs/EXEC_2026-05-02_phase14_part2_grants_and_sequences.md
follow_up: "Phase 14.5 — fix EXECUTE on is_mentor_for (см. ниже)"
---

# Phase 15 — Smoke tests (read-only) — execution log

**Время выполнения:** 2026-05-03, ~01:13 MSK.
**Подключение:** `ssh root@5.129.251.56` → `psql` под `gen_user` к `default_db` через `/opt/garden-auth/.env`.
**Тип:** read-only (без DDL/DML), цель — финальная верификация фаз 1–14.
**Результат:** ⚠ Тесты пройдены, но обнаружены **две дыры в grants**, которые сломают фронт после деплоя. Требуют отдельного исправления (Phase 14.5 — дополнить grants) перед открытием Caddy.

---

## 15.1 — RLS=on на 32 целевых таблицах

```
                  relname                  | rls_on
-------------------------------------------+--------
 birthday_templates                        | t
 events_archive                            | t
 knowledge_base                            | t
 messages                                  | t
 profiles                                  | t
 push_subscriptions                        | t
 pvl_audit_log                             | t
 pvl_calendar_events                       | t
 pvl_checklist_items                       | t
 pvl_cohorts                               | t
 pvl_content_items                         | t
 pvl_content_placements                    | t
 pvl_course_lessons                        | t
 pvl_course_weeks                          | t
 pvl_direct_messages                       | t
 pvl_faq_items                             | t
 pvl_garden_mentor_links                   | t
 pvl_homework_items                        | t
 pvl_homework_status_history               | t
 pvl_mentors                               | t
 pvl_notifications                         | t
 pvl_student_certification_criteria_scores | t
 pvl_student_certification_scores          | t
 pvl_student_content_progress              | t
 pvl_student_course_points                 | t
 pvl_student_course_progress               | t
 pvl_student_disputes                      | t
 pvl_student_homework_submissions          | t
 pvl_student_questions                     | t
 pvl_students                              | t
 to_archive                                | t
 users_auth                                | t
(32 rows)
```

**Сводка:** `rls_on_count=32, rls_off_count=0, total=32` ✅

---

## 15.2 — Счётчики политик по таблицам (вся `public`)

40 таблиц с политиками в `public`. Из них 32 целевые SEC-001:

```
                 tablename                 | policies
-------------------------------------------+----------
 birthday_templates                        |        4
 knowledge_base                            |        5    ← 3 старых + 2 новых admin
 profiles                                  |        4
 pvl_audit_log                             |        2    ← select_admin + insert_authenticated
 pvl_calendar_events                       |        4
 pvl_checklist_items                       |        4
 pvl_cohorts                               |        4
 pvl_content_items                         |        4
 pvl_content_placements                    |        4
 pvl_course_lessons                        |        4
 pvl_course_weeks                          |        4
 pvl_direct_messages                       |        4
 pvl_faq_items                             |        4
 pvl_garden_mentor_links                   |        4
 pvl_homework_items                        |        4
 pvl_homework_status_history               |        2    ← select + insert (append-only)
 pvl_mentors                               |        4
 pvl_notifications                         |        4
 pvl_student_certification_criteria_scores |        4
 pvl_student_certification_scores          |        4
 pvl_student_content_progress              |        4
 pvl_student_course_points                 |        4
 pvl_student_course_progress               |        4
 pvl_student_disputes                      |        4
 pvl_student_homework_submissions          |        4
 pvl_student_questions                     |        4
 pvl_students                              |        4
```

Lockdown-таблицы (без политик в этом списке): `users_auth`, `to_archive`, `events_archive`, `messages`, `push_subscriptions` — RLS=on, политик нет (deny-by-default).

Артефакты другого приложения: `notebooks` (1 политика), `questions` (1 политика).

Прочие таблицы Garden: `app_settings(2)`, `cities(4)`, `course_progress(2)`, `events(5)`, `goals(4)`, `meetings(6)`, `news(2)`, `notifications(2)`, `practices(4)`, `scenarios(4)`, `shop_items(2)`.

**Всего политик в `public`:** **144** ✅ (соответствует ожиданию ≈ 90 новых + 50 ранее существовавших).

---

## 15.3 — `is_admin()` и `is_mentor_for()` под `gen_user` (без auth.uid)

```
 is_admin_check
----------------
 f
(1 row)

 not_mentor
------------
 f
(1 row)
```

✅ Обе функции корректно возвращают `false` без падения, когда `auth.uid()` отсутствует.

---

## 15.4 — Под `web_anon`: всё закрыто

### Прямые SELECT под `SET LOCAL ROLE web_anon`

```
SAVEPOINT s1;
SELECT count(*) FROM public.profiles;          -- ERROR: permission denied for table profiles
SELECT count(*) FROM public.users_auth;        -- ERROR: permission denied for table users_auth
SELECT count(*) FROM public.pvl_students;      -- ERROR: permission denied for table pvl_students
SELECT count(*) FROM public.messages;          -- ERROR: permission denied for table messages
SELECT count(*) FROM public.push_subscriptions;-- ERROR: permission denied for table push_subscriptions
SELECT count(*) FROM public.knowledge_base;    -- ERROR: permission denied for table knowledge_base
SELECT count(*) FROM public.pvl_audit_log;     -- ERROR: permission denied for table pvl_audit_log
```

### `has_table_privilege('web_anon', ..., 'SELECT')`

```
 profiles | users_auth | pvl_students | messages | push | kb | audit
----------+------------+--------------+----------+------+----+-------
 f        | f          | f            | f        | f    | f  | f
```

### Интерпретация (важно!)

`web_anon` **полностью лишён `SELECT` на схему `public`** — ни одна таблица не доступна.
Это **жёстче**, чем обещал MIGRATION-документ (документ говорил «web_anon видит 0 строк через RLS», то есть таблицы доступны, но политики не пускают).

📝 **Что это значит для PostgREST:**
- Запрос без JWT (анонимный) → роль `web_anon` → **403 Forbidden** на все эндпоинты в `public`.
- Не RLS-блок (200 + `[]`), а GRANT-блок (403).

### Хорошо это или плохо

**Хорошо для Garden:** платформа полностью под логином, public-эндпоинтов нет — никаких страниц, требующих анонимного доступа, у нас нет.

**Может быть не хорошо если:**
- Где-то в фронте есть запросы до логина (например, чтение `app_settings` для брендинга / лого / мета-тегов на лендинге).
- Есть Open Graph / SEO-снимки, которым нужен какой-то контент.

**Решение:** оставить как есть, наблюдать в живом smoke (раздел 15.7). Если что-то требует анонимного доступа — выдать `GRANT SELECT … TO web_anon` точечно.

---

## 15.5 — Под `authenticated` без JWT: ⚠ обнаружена дыра

### SELECT под `SET LOCAL ROLE authenticated` (auth.uid() = NULL)

```
SELECT count(*) FROM public.profiles;                          -- 0  ✓ (политика отбила)
SELECT count(*) FROM public.pvl_students;                      -- ❌ ERROR: permission denied for function is_mentor_for
SELECT count(*) FROM public.pvl_student_homework_submissions;  -- ❌ ERROR: permission denied for function is_mentor_for
SELECT count(*) FROM public.pvl_garden_mentor_links;           -- 0  ✓
SELECT count(*) FROM public.pvl_audit_log;                     -- 0  ✓
SELECT count(*) FROM public.users_auth;                        -- ERROR: permission denied for table users_auth  ✓ (lockdown ожидаемый)
SELECT count(*) FROM public.messages;                          -- ERROR: permission denied for table messages    ✓ (lockdown ожидаемый)
SELECT count(*) FROM public.knowledge_base;                    -- 18 ✓ (общедоступные строки видны всем authenticated)
SELECT count(*) FROM public.birthday_templates;                -- 2  ✓ (та же логика)
```

### `has_table_privilege('authenticated', ..., 'SELECT')`

```
 profiles | users_auth | messages | push | to_archive | events_archive | pvl_students | pvl_subm | audit
----------+------------+----------+------+------------+----------------+--------------+----------+-------
 t        | f          | f        | f    | f          | f              | t            | t        | t
```

✅ SELECT-grants для `authenticated` корректны: открыты PVL и общедоступные таблицы, закрыты 5 lockdown.

### 🔴 НАХОДКА 1 — критическая дыра в EXECUTE-grants

`authenticated` **не имеет права исполнять `public.is_mentor_for(uuid)`**.

Любая RLS-политика, которая вызывает эту функцию в предикате, под `authenticated` падает с:

```
ERROR: permission denied for function is_mentor_for
```

Это значит, что после деплоя фронт-патча и открытия Caddy:

- Любой залогиненный пользователь → запрос на `pvl_students` → **403**.
- Любой залогиненный пользователь → запрос на `pvl_student_homework_submissions` → **403**.
- Любой залогиненный пользователь → запрос на `pvl_student_*` (большинство шаблона B) → **403**.

**Фикс (требует отдельного шага «Phase 14.5»):**

```sql
GRANT EXECUTE ON FUNCTION public.is_mentor_for(uuid) TO authenticated;
```

Также стоит проверить аналогичный grant для `is_admin()` — формально работает (возможно `SECURITY DEFINER` или granted earlier), но лучше явно проверить.

---

## 15.6 — EXPLAIN на ключевых запросах (под `gen_user`)

### 15.6.1 `profiles` by id

```
 Index Scan using profiles_pkey on profiles  (cost=0.14..8.16 rows=1 width=869)
   Index Cond: (id = '85dbefda-ba8f-4c60-9f22-b3a7acd45b21'::uuid)
```

✅ Index scan — план оптимальный.

### 15.6.2 `pvl_student_homework_submissions` by `student_id`

```
 Seq Scan on pvl_student_homework_submissions  (cost=0.00..7.41 rows=4 width=723)
   Filter: (student_id = '1085e06d-34ad-4e7e-b337-56a0c19cc43f'::uuid)
```

⚠ Seq Scan, но `cost=0.00..7.41` — таблица слишком мала (и индекса по `student_id` нет). Окей на текущем размере, в backlog: при росте — добавить index `(student_id)` (PERF-001 или CLEAN-007).

### 15.6.3 `pvl_garden_mentor_links` full scan

```
 Seq Scan on pvl_garden_mentor_links  (cost=0.00..22.00 rows=1200 width=40)
```

⚠ `rows=1200` — оптимизатор не знает реальный размер (`pg_stat reset` или `ANALYZE` не запускался после миграции). Реально таблица крошечная, ~5 строк. **Не блокер**, но стоит выполнить:

```sql
ANALYZE public.pvl_garden_mentor_links;
ANALYZE public.pvl_student_homework_submissions;
ANALYZE public.profiles;
-- и т.п. для всех PVL-таблиц.
```

— это не RLS-затрагивающее действие, можно сделать в любое время.

---

## Сводка

| Тест | Статус | Комментарий |
|---|---|---|
| 15.1 RLS=on на 32 | ✅ | все 32 |
| 15.2 политики | ✅ | 144 в public, на 32 целевых от 2 до 5 |
| 15.3 helper functions под gen_user | ✅ | оба `false` |
| 15.4 web_anon закрыт | ✅+ | даже жёстче ожидаемого (GRANT-блок, не RLS-блок) |
| 15.5 authenticated без JWT | ⚠ | **дыра: нет EXECUTE на is_mentor_for** |
| 15.6 EXPLAIN | ✅ | один Index Scan, два Seq Scan на малых таблицах |

---

## 🔴 Что нужно сделать ПЕРЕД открытием Caddy (этап 5)

### Phase 14.5 — дополнить grants на функции

```sql
BEGIN;

-- Дать authenticated право исполнять is_mentor_for
GRANT EXECUTE ON FUNCTION public.is_mentor_for(uuid) TO authenticated;

-- Проверить, что is_admin тоже доступен (если нет — дать)
-- SELECT has_function_privilege('authenticated', 'public.is_admin()', 'EXECUTE');
-- если f → GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

COMMIT;
```

После применения — повторно прогнать 15.5 и убедиться, что `pvl_students` / `pvl_student_homework_submissions` под `authenticated` без JWT возвращают **0** (а не ERROR).

### Опционально (не блокер) — ANALYZE

```sql
ANALYZE public.pvl_garden_mentor_links;
ANALYZE public.pvl_student_homework_submissions;
ANALYZE public.profiles;
ANALYZE public.pvl_students;
ANALYZE public.knowledge_base;
ANALYZE public.birthday_templates;
```

---

## Что следует записать в Runbook

Добавить раздел в `docs/RUNBOOK_garden.md`:

> ### 5.6. RLS-политика, ссылающаяся на функцию, требует EXECUTE для роли
>
> RLS-политика выполняется в контексте вызывающей роли. Если политика вызывает
> `is_mentor_for(uuid)` или другую SQL-функцию, и роль (`authenticated`/`web_anon`)
> не имеет `EXECUTE` на эту функцию, запрос падает с
> `permission denied for function …`, а не возвращает 0 строк.
>
> **Признак:** RLS добавлена, политики корректны, но `SELECT count(*)` под
> `authenticated` возвращает 403 / `permission denied for function`.
>
> **Решение:** `GRANT EXECUTE ON FUNCTION schema.fn(arg_types) TO authenticated;`
>
> **Не путать с `SECURITY DEFINER`:** `SECURITY DEFINER` обходит проверку
> EXECUTE-привилегии для тела функции, но саму функцию вызвать без EXECUTE
> всё равно нельзя — это одна и та же проверка.

---

---

# Phase 14.5 — fix EXECUTE on is_mentor_for (mini-phase, 2026-05-03 ~01:20 MSK)

## Контекст

Smoke-тест 15.5 показал: под `SET ROLE authenticated` вызов
`is_mentor_for(uuid)` падает с `permission denied for function`.
Phase 3 декларировала grant выданным, но в реальной БД его не
оказалось. `is_admin()` работала «магически» — потому что у неё
`proacl` содержал `=X/gen_user`, то есть PUBLIC имеет EXECUTE.

Этот mini-fix явно выдаёт `EXECUTE` для `authenticated` на
`is_mentor_for(uuid)`, отзывает у PUBLIC, и проверяет `is_admin`.

## Step 1 — GRANT EXECUTE + условный grant is_admin

```sql
BEGIN;

GRANT EXECUTE ON FUNCTION public.is_mentor_for(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_mentor_for(uuid) FROM PUBLIC;

DO $smoke$
DECLARE has_exec boolean;
BEGIN
  SELECT has_function_privilege('authenticated', 'public.is_admin()', 'EXECUTE')
    INTO has_exec;
  IF NOT has_exec THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC';
    RAISE NOTICE 'is_admin EXECUTE не было — добавлено';
  ELSE
    RAISE NOTICE 'is_admin EXECUTE уже было';
  END IF;
END $smoke$;

COMMIT;
```

### Output

```
BEGIN
GRANT
REVOKE
NOTICE:  is_admin EXECUTE уже было
DO
COMMIT
```

✅ Транзакция закоммичена. `is_mentor_for` явно выдан, `is_admin` уже был доступен.

## Step 2 — proacl + has_function_privilege

```
    proname    |  owner   | security_definer |                     proacl
---------------+----------+------------------+------------------------------------------------
 is_admin      | gen_user | t                | {=X/gen_user,gen_user=X/gen_user}
 is_mentor_for | gen_user | t                | {gen_user=X/gen_user,authenticated=X/gen_user}
```

```
 auth_is_admin | auth_is_mentor_for | anon_is_admin | anon_is_mentor_for
---------------+--------------------+---------------+--------------------
 t             | t                  | t             | f
```

### Интерпретация

- **`is_admin`** — `=X/gen_user` означает PUBLIC получил EXECUTE при `CREATE FUNCTION` (по умолчанию). `SECURITY DEFINER=t`. Поэтому функция работала под любой ролью.
- **`is_mentor_for`** — после нашего фикса: `gen_user=X` (owner) + `authenticated=X` (явный grant). PUBLIC отозван. `SECURITY DEFINER=t`. Anon (web_anon) больше не может вызвать функцию (это норма: web_anon вообще не должен быть актором в RLS-предикатах PVL).

📝 **Урок:** `SECURITY DEFINER` НЕ обходит проверку EXECUTE на саму функцию. Он только меняет роль внутри тела функции. Если `authenticated` не имеет EXECUTE — вызов падает на входе, до тела.

📝 **Расхождение фазы 3 ↔ live.** В EXEC-логе фазы 3 декларировалось «GRANT EXECUTE TO authenticated», но в реальном `proacl` этого не было. Возможные причины:
1. Команда выполнялась внутри транзакции, которая откатилась.
2. EXEC-лог фазы 3 зафиксировал намерение, но команда GRANT не дошла до COMMIT.
3. Был бэкап/восстановление, который сбросил функцию + ACL заново.

Теперь явно зафиксировано в `proacl`. Остальные фазы не использовали helper-функции в политиках (только `is_mentor_for` и `is_admin`), так что других дыр такого рода быть не должно.

## Step 3 — повторный mini-smoke 15.5 (после фикса)

```
SET LOCAL ROLE authenticated;
```

```
 pvl_students       | 0        ✅ (раньше: ERROR: permission denied for function is_mentor_for)
 pvl_subm           | 0        ✅ (раньше: тот же ERROR)
 profiles           | 0        ✅
 kb                 | 18       ✅
```

✅ **Дыра закрыта.** Под `authenticated` без JWT все четыре запроса возвращают целые числа без ошибок. RLS-предикаты корректно выдают пустоту, потому что `auth.uid() IS NULL`.

## Step 4 — ANALYZE (опционально, не блокер)

Под `gen_user` ANALYZE отказался:

```
WARNING:  permission denied to analyze "pvl_garden_mentor_links", skipping it
WARNING:  permission denied to analyze "pvl_student_homework_submissions", skipping it
WARNING:  permission denied to analyze "profiles", skipping it
WARNING:  permission denied to analyze "pvl_students", skipping it
WARNING:  permission denied to analyze "knowledge_base", skipping it
WARNING:  permission denied to analyze "birthday_templates", skipping it
```

📝 **Причина:** `gen_user` не owner этих таблиц (видимо postgres владеет — Supabase legacy). Не-superuser может `ANALYZE` только свои таблицы. **Не блокер:** autovacuum сделает анализ статистики автоматически в течение часов; функционально это не влияет, только на cost-оценки оптимизатора. Если нужно — отдельным шагом из Timeweb-консоли под postgres:

```sql
ANALYZE public.pvl_garden_mentor_links;
ANALYZE public.pvl_student_homework_submissions;
ANALYZE public.profiles;
ANALYZE public.pvl_students;
ANALYZE public.knowledge_base;
ANALYZE public.birthday_templates;
-- или просто: ANALYZE; (всю БД)
```

(добавить в backlog как PERF-001 / минор)

## Phase 14.5 — Status

✅ **ФАЗА 14.5 ЗАКРЫТА.** EXECUTE-grants на helper-функции явно зафиксированы. Smoke 15.5 повторно прогнан, дыра закрыта.

---

## Финальный статус Phase 15

✅ **ФАЗА 15 ЗАКРЫТА (с применённым 14.5-фиксом).**

Все SQL-фазы SEC-001 (1–14.5) применены и проверены read-only smoke-тестами.

---

## Что осталось (вне SQL-миграции)

- [ ] `REVOKE CREATE ON SCHEMA public FROM gen_user;` через Timeweb SQL-консоль под `postgres` (отзыв временного права из фазы 3 — шаг владельца).
- [ ] **Этап 3** — PostgREST config: `PGRST_DB_ANON_ROLE` с `gen_user` на `web_anon`, JWT-secret = garden-auth, `systemctl reload postgrest`. Лог: `docs/EXEC_2026-05-02_etap3_postgrest_jwt.md`.
- [ ] **Этап 4** — фронт-патч из `docs/FRONTEND_PATCH_2026-05-02_jwt_fallback.md` (по коммитам), push, GitHub Actions деплой. Лог: `docs/EXEC_2026-05-02_etap4_frontend_patch.md`.
- [ ] **Этап 5** — Caddy: вернуть `reverse_proxy 127.0.0.1:3000` для `api.skrebeyko.ru`, убрать 503-заглушку, `systemctl reload caddy`. Лог: `docs/EXEC_2026-05-02_etap5_caddy_open.md`.
- [ ] **Live smoke (15.7)** в браузере (под Ольгой как admin): логин, карта ведущих, учительская, открытие курса, сдача ДЗ.
- [ ] **PERF-001 (опционально):** ANALYZE из Timeweb под postgres. Минор.

## Следующий шаг

**Жду от стратега зелёного на:**
1. `REVOKE CREATE ON SCHEMA public FROM gen_user` (через Timeweb-консоль под postgres).
2. Этап 3 — PostgREST на JWT.
3. Этап 4 — фронт-патч.
4. Этап 5 — открытие Caddy.
