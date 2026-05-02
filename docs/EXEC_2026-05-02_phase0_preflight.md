---
title: SEC-001 Phase 0 — Pre-flight checks (execution log)
type: execution-log
phase: 0
created: 2026-05-02
status: ✅ PASSED
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
---

# Phase 0 — Pre-flight checks (execution log)

**Время выполнения:** 2026-05-02, ~20:00 MSK.
**Подключение:** `ssh root@5.129.251.56` → `psql -h "$DB_HOST" -U gen_user -d default_db` через `/opt/garden-auth/.env`.
**Режим:** read-only (только SELECT и `\copy`).
**Результат:** ✅ все 10 пунктов соответствуют ожиданиям. Готовы к фазе 1.

---

## 0.1 — Версия Postgres

**SQL:**
```sql
SELECT version();
```

**Результат:**
```
                                                              version
-----------------------------------------------------------------------------------------------------------------------------------
 PostgreSQL 18.1 (Ubuntu 18.1-1.pgdg24.04+2) on x86_64-pc-linux-gnu, compiled by gcc (Ubuntu 13.3.0-6ubuntu2~24.04) 13.3.0, 64-bit
(1 row)
```

**Вердикт:** ✅ PostgreSQL 18.1 — соответствует ожиданию. Все RLS-фичи доступны.

---

## 0.2 — Под кем подключены

**SQL:**
```sql
SELECT current_user, session_user;
```

**Результат:**
```
 current_user | session_user
--------------+--------------
 gen_user     | gen_user
(1 row)
```

**Вердикт:** ✅ `gen_user` — owner таблиц `public.*`, owner-bypass для RLS будет работать. Соответствует.

---

## 0.3 — Ключевые роли

**SQL:**
```sql
SELECT rolname, rolsuper, rolinherit, rolcanlogin, rolbypassrls
FROM pg_roles
WHERE rolname IN ('web_anon', 'authenticated', 'gen_user', 'postgres')
ORDER BY rolname;
```

**Результат:**
```
    rolname    | rolsuper | rolinherit | rolcanlogin | rolbypassrls
---------------+----------+------------+-------------+--------------
 authenticated | f        | t          | f           | f
 gen_user      | f        | t          | t           | f
 postgres      | t        | t          | t           | t
 web_anon      | f        | t          | f           | f
(4 rows)
```

**Вердикт:** ✅ Все 4 роли на месте. `web_anon` и `authenticated` — NOLOGIN (как и должно быть для PostgREST-ролей). `gen_user` — без `bypassrls` (owner-bypass работает через ownership, не атрибут). Соответствует.

---

## 0.4 — `is_admin()` существует

**SQL:**
```sql
SELECT proname, prosecdef AS security_definer, prorettype::regtype AS returns
FROM pg_proc WHERE proname = 'is_admin';
```

**Результат:**
```
 proname  | security_definer | returns
----------+------------------+---------
 is_admin | t                | boolean
(1 row)
```

**Вердикт:** ✅ `is_admin()` существует, `SECURITY DEFINER`, возвращает `boolean`. Готов к использованию в новых политиках. Соответствует.

---

## 0.5 — `is_mentor_for(uuid)` НЕ существует

**SQL:**
```sql
SELECT count(*) AS already_exists
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'is_mentor_for';
```

**Результат:**
```
 already_exists
----------------
              0
(1 row)
```

**Вердикт:** ✅ `is_mentor_for` отсутствует, фаза 3 создаст его без конфликтов. Соответствует.

---

## 0.6 — RLS-статус целевых таблиц

**SQL:** см. в [docs/MIGRATION_2026-05-02_security_restoration.md](MIGRATION_2026-05-02_security_restoration.md) раздел 0.6.

**Результат (32 строки, в списке IN было 32 имени):**
```
 schema |                table_name                 | rls_enabled | rls_forced | policies
--------+-------------------------------------------+-------------+------------+----------
 public | birthday_templates                        | f           | f          |        0
 public | events_archive                            | f           | f          |        0
 public | knowledge_base                            | t           | f          |        5
 public | messages                                  | f           | f          |        0
 public | profiles                                  | t           | f          |       14
 public | push_subscriptions                        | f           | f          |        0
 public | pvl_audit_log                             | f           | f          |        0
 public | pvl_calendar_events                       | f           | f          |        0
 public | pvl_checklist_items                       | t           | f          |        1
 public | pvl_cohorts                               | f           | f          |        0
 public | pvl_content_items                         | f           | f          |        0
 public | pvl_content_placements                    | f           | f          |        0
 public | pvl_course_lessons                        | f           | f          |        0
 public | pvl_course_weeks                          | f           | f          |        0
 public | pvl_direct_messages                       | f           | f          |        0
 public | pvl_faq_items                             | f           | f          |        0
 public | pvl_garden_mentor_links                   | f           | f          |        0
 public | pvl_homework_items                        | f           | f          |        0
 public | pvl_homework_status_history               | f           | f          |        0
 public | pvl_mentors                               | f           | f          |        0
 public | pvl_notifications                         | f           | f          |        0
 public | pvl_student_certification_criteria_scores | f           | f          |        0
 public | pvl_student_certification_scores          | f           | f          |        0
 public | pvl_student_content_progress              | t           | f          |        1
 public | pvl_student_course_points                 | f           | f          |        0
 public | pvl_student_course_progress               | f           | f          |        0
 public | pvl_student_disputes                      | f           | f          |        0
 public | pvl_student_homework_submissions          | f           | f          |        0
 public | pvl_student_questions                     | f           | f          |        0
 public | pvl_students                              | f           | f          |        0
 public | to_archive                                | f           | f          |        0
 public | users_auth                                | f           | f          |        0
(32 rows)
```

**Вердикт:** ✅ Соответствует.
- 32 таблицы (8 не-PVL + 24 PVL) — все на месте.
- `profiles`: rls_enabled=t, 14 политик (из v3).
- `knowledge_base`: rls_enabled=t, 5 политик (из v1).
- `pvl_checklist_items`, `pvl_student_content_progress`: rls_enabled=t, 1 политика каждая (no-op `qual=true` из v1, будут перезаписаны фазой 10).
- Остальные 28 таблиц: rls_enabled=f, 0 политик — точно как в v2/v3.
- `rls_forced=f` везде — соответствует решению владельца отложить FORCE в SEC-004.

📝 **Заметка по формулировке.** В заголовке pre-flight 0.6 в MIGRATION-документе сказано «28 целевых таблиц» — это число таблиц **без RLS**. Сам список IN содержит 32 имени (включая `profiles`, `knowledge_base`, `pvl_checklist_items`, `pvl_student_content_progress`, у которых RLS уже включён). Расхождение чисто терминологическое, на корректность проверки не влияет.

---

## 0.7 — Все 14 политик `profiles` на месте

**SQL:**
```sql
SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='profiles' ORDER BY policyname;
```

**Результат:**
```
                policyname                 |  cmd
-------------------------------------------+--------
 Map_View_All                              | SELECT
 Olga Power                                | ALL
 Olga_Power_Profiles                       | ALL
 Public View                               | SELECT
 Public profiles are viewable by everyone. | SELECT
 Self Update                               | UPDATE
 User_Edit_Self                            | UPDATE
 User_Insert_Self                          | INSERT
 Users can insert their own profile.       | INSERT
 Users can update own profile.             | UPDATE
 profiles_insert_own                       | INSERT
 profiles_select_authenticated             | SELECT
 profiles_update_admin                     | UPDATE
 profiles_update_own                       | UPDATE
(14 rows)
```

**Вердикт:** ✅ 14 политик, ровно те же имена и `cmd`, что в v3 задача 4. Готовы к чистке: фаза 1 удалит 10 строк, останется 4 (`profiles_insert_own`, `profiles_select_authenticated`, `profiles_update_admin`, `profiles_update_own`). Соответствует.

---

## 0.8 — `pvl_garden_mentor_links` не пуст

**SQL:**
```sql
SELECT count(*) AS links_total FROM public.pvl_garden_mentor_links;
```

**Результат:**
```
 links_total
-------------
          19
(1 row)
```

**Вердикт:** ✅ 19 ≥ 19 — соответствует. Это та же цифра, что в v3 задача 2 и v6. `is_mentor_for(uuid)` будет работать на этих 19 связках.

---

## 0.9 — `messages` содержит 4 тестовые строки

**SQL:**
```sql
SELECT id, author_id, author_name, left(text, 60) AS preview FROM public.messages ORDER BY created_at;
```

**Результат:**
```
 id |              author_id               |    author_name     |          preview
----+--------------------------------------+--------------------+----------------------------
  1 |                                      | Система            | Тестовое сообщение из БД
  2 | e6de2a97-60f8-4864-a6d9-eb7da2831bf4 | Анастасия Зобнина  | Тестовое сообщение от меня
  3 | 1085e06d-34ad-4e7e-b337-56a0c19cc43f | Настина фея        | И от меня
  4 | 85dbefda-ba8f-4c60-9f22-b3a7acd45b21 | Ольга Скребейко    | Привет-привет
(4 rows)
```

**Вердикт:** ✅ Ровно 4 строки, всё совпадает с v4 (id 1–4, тестовые тексты). Фаза 6 удалит их по `created_at::date = '2026-03-17'`. Соответствует.

---

## 0.10 — Backup всех текущих политик в файл

**SQL:**
```sql
\copy (SELECT * FROM pg_policies ORDER BY schemaname, tablename, policyname) TO '/root/policies_backup_2026-05-02_pre_migration.csv' WITH CSV HEADER
```

**Результат psql:**
```
COPY 68
```

**Проверка файла:**
```
$ ls -la /root/policies_backup_2026-05-02_pre_migration.csv
-rw-r--r-- 1 root root 6460 May  2 19:53 /root/policies_backup_2026-05-02_pre_migration.csv

$ wc -l /root/policies_backup_2026-05-02_pre_migration.csv
69 /root/policies_backup_2026-05-02_pre_migration.csv

$ head -3 /root/policies_backup_2026-05-02_pre_migration.csv
schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
public,app_settings,app_settings_select_all,PERMISSIVE,{public},SELECT,true,
public,app_settings,app_settings_write_admin,PERMISSIVE,{public},ALL,is_admin(),is_admin()
```

**Вердикт:** ✅ Файл создан на сервере (`/root/`, та же машина, где `gen_user` подключается к Postgres). 6460 байт, 68 политик + 1 строка заголовка = 69 строк. CSV-формат корректный. Это будет точкой восстановления для критичного rollback.

📝 **Заметка по пути.** В MIGRATION-документе путь записан как `~/policies_backup_2026-05-02_pre_migration.csv`. При исполнении через `ssh root@…` тильда раскрылась в `/root`, что и зафиксировано — файл лежит там же, где вчерашний `~/Desktop/policies_backup_2026-05-02.txt` мысленно ассоциировался (но физически вчерашний бэкап на macOS Ольги, а сегодняшний — на сервере). Не путать.

📝 **Сравнение с предыдущим бэкапом.** 68 политик ≠ 63 в `public` + 5 в `storage` = 68 из v1. Совпадает по числу. Содержимое идентично (видно из первых строк — те же `app_settings_*`).

---

## Сводная таблица

| # | Пункт | Статус | Комментарий |
|---|---|:---:|---|
| 0.1 | Версия Postgres | ✅ | PostgreSQL 18.1, как и ожидалось |
| 0.2 | current_user | ✅ | `gen_user` — owner таблиц, owner-bypass работает |
| 0.3 | Ключевые роли | ✅ | Все 4 роли на месте, атрибуты соответствуют |
| 0.4 | `is_admin()` | ✅ | Существует, `SECURITY DEFINER`, returns boolean |
| 0.5 | `is_mentor_for()` | ✅ | Отсутствует (фаза 3 создаст) |
| 0.6 | RLS-статус 32 таблиц | ✅ | profiles RLS=on/14 политик, kb RLS=on/5, 2 PVL no-op, остальные 28 — RLS=off |
| 0.7 | Политики `profiles` | ✅ | 14 строк, имена и cmd точно как в v3 задача 4 |
| 0.8 | `pvl_garden_mentor_links` | ✅ | 19 строк (≥19) |
| 0.9 | `messages` | ✅ | 4 тестовые строки от 2026-03-17, всё совпадает с v4 |
| 0.10 | Backup CSV | ✅ | `/root/policies_backup_2026-05-02_pre_migration.csv`, 68 политик, 6460 байт |

---

## Следующий шаг

**Жду подтверждения «идём в фазу 1».** Никакие изменения в БД не сделаны. Все pre-flight условия для фазы 1 (чистка 10 дублей `profiles`) выполнены: 14 политик на месте, имена совпадают, бэкап готов.
