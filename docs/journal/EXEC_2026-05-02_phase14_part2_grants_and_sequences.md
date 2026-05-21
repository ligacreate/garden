---
title: SEC-001 Phase 14 Part 2 — INSERT/UPDATE/DELETE grants + sequences (execution log)
type: execution-log
phase: "14.3+14.4"
created: 2026-05-02
status: ✅ COMMITTED
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
prev_phase: docs/EXEC_2026-05-02_phase14_part1_grants.md
---

# Phase 14 Part 2 — Grants 14.3 + sequences 14.4 (execution log)

**Время выполнения:** 2026-05-02, ~23:35 MSK.
**Транзакций:** 2 (14.3 + 14.4), обе закоммичены.
**Подход:** scp + `psql -f /tmp/phase14_part2.sql` (один файл с двумя BEGIN/COMMIT-блоками).
**Результат:** ✅ INSERT/UPDATE/DELETE grants выданы по варианту A (только под существующие политики). Sequences USAGE+SELECT для `authenticated`.

---

## Шаг 14.3 — INSERT/UPDATE/DELETE grants (вариант A)

### Решение по 4 расхождениям

| Таблица | Документ предлагал | Реально дано | Причина |
|---|---|---|---|
| `news` | INSERT/UPDATE/DELETE | **только INSERT** | UPDATE/DELETE-политик нет |
| `notebooks` | INSERT/UPDATE/DELETE | **ничего** | RLS=on, 0 политик; артефакт другого приложения |
| `notifications` | INSERT/UPDATE | **только UPDATE** | INSERT-политики нет |
| `questions` | INSERT/UPDATE/DELETE | **ничего** | RLS=on, 0 политик; артефакт другого приложения |

📝 **`notebooks` и `questions`** — артефакты приложения расписания событий ведущих, случайно оказавшиеся в этой БД. Не относятся к Garden. Под SEC-001 grants не выдаём; разбор — отдельной задачей **CLEAN-011**.

### SQL (выдержка ключевого)

```sql
BEGIN;

-- profiles
GRANT INSERT, UPDATE ON public.profiles TO authenticated;

-- knowledge_base, birthday_templates
GRANT INSERT, UPDATE, DELETE ON public.knowledge_base TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.birthday_templates TO authenticated;

-- PVL шаблон A (8 таблиц через DO FOREACH)
DO $outer$ ... GRANT I/U/D на pvl_course_weeks/lessons/content_items/placements/
                              homework_items/calendar_events/faq_items/cohorts ... END $outer$;

-- PVL шаблон B (9 таблиц через DO FOREACH)
DO $outer$ ... GRANT I/U/D на pvl_student_* и pvl_checklist_items ... END $outer$;

-- PVL шаблон C (3 таблицы, отдельные GRANT'ы)
GRANT INSERT, UPDATE, DELETE ON public.pvl_students             TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pvl_garden_mentor_links  TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pvl_mentors              TO authenticated;

-- PVL шаблон D
GRANT INSERT, UPDATE, DELETE ON public.pvl_direct_messages TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pvl_notifications   TO authenticated;
GRANT INSERT                ON public.pvl_homework_status_history TO authenticated;  -- append-only

-- PVL шаблон E
GRANT INSERT                ON public.pvl_audit_log TO authenticated;  -- write-once

-- Прочие (под существующие политики):
GRANT INSERT, UPDATE        ON public.app_settings    TO authenticated;
GRANT INSERT                ON public.course_progress TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.events          TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.goals           TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.meetings        TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.practices       TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.scenarios       TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.shop_items      TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cities          TO authenticated;

-- Расхождения (только под факт):
GRANT INSERT ON public.news          TO authenticated;
GRANT UPDATE ON public.notifications TO authenticated;

COMMIT;
```

### Output (сокращённо — все GRANT'ы прошли)

```
BEGIN
GRANT  × 22 (включая 8+9 через DO-блоки, остальные явно)
DO     × 2 (PVL A и PVL B FOREACH)
COMMIT
```

### Верификация 14.3

```
      relname       | i | u | d
--------------------+---+---+---
 birthday_templates | t | t | t
 knowledge_base     | t | t | t
 news               | t | f | f
 notebooks          | f | f | f
 notifications      | f | t | f
 profiles           | t | t | f
 questions          | f | f | f
(7 rows)
```

✅ **Точное соответствие ожиданию:**
- `news`: только INSERT (i=t) ✓
- `notebooks`: ничего (всё f) ✓
- `notifications`: только UPDATE (u=t) ✓
- `questions`: ничего ✓
- `profiles`: I+U без D ✓ (DELETE на profiles нет — отдельная задача если нужно)
- `knowledge_base`, `birthday_templates`: все три ✓

### Что не охвачено в верификации (но дано через GRANT)

PVL-таблицы (24 шт.) и «прочие» (cities, events, goals, …) — GRANT'ы выданы, но не вошли в список верификации. Для них верификация пройдёт неявно при smoke-тестах раздела 15 и при первом боевом запросе под `authenticated`.

---

## Шаг 14.4 — Sequences

### SQL

```sql
BEGIN;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
COMMIT;
```

### Output

```
BEGIN
GRANT
COMMIT
```

### Верификация 14.4

**Sample (первые 10 sequence'ов):**
```
          relname          | auth_usage | auth_select
---------------------------+------------+-------------
 birthday_templates_id_seq | t          | t
 cities_id_seq             | t          | t
 course_progress_id_seq    | t          | t
 events_id_seq             | t          | t
 goals_id_seq              | t          | t
 knowledge_base_id_seq     | t          | t
 meetings_id_seq           | t          | t
 messages_id_seq           | t          | t
 news_id_seq               | t          | t
 notebooks_id_seq          | t          | t
(10 rows)
```

**Полный счёт:**
```
 total_sequences | auth_usage_count
-----------------+------------------
              15 |               15
(1 row)
```

✅ Все 15 sequence'ов в `public` имеют USAGE+SELECT для `authenticated`. Это нужно для `INSERT` в таблицы с identity-колонками (например, `cities`, `events`, `birthday_templates`, …).

📝 **Заметка про `messages_id_seq`/`notebooks_id_seq`.** Sequences дали авторизации `authenticated` даже для таблиц, где сама таблица закрыта (REVOKE). Это нормально: GRANT на sequence — отдельная привилегия. Без GRANT на саму таблицу INSERT всё равно не пройдёт, sequence без таблицы бесполезна.

---

## Что изменилось в проде (полный итог фазы 14)

### Полный список GRANT'ов для `authenticated`

| Группа | Таблицы | CRUD |
|---|---|---|
| **Schema** | public | USAGE |
| **SELECT-all** (с REVOKE на 5) | все таблицы кроме users_auth, to_archive, events_archive, messages, push_subscriptions | SELECT |
| **profiles** | profiles | I, U |
| **knowledge_base** | knowledge_base | I, U, D |
| **birthday_templates** | birthday_templates | I, U, D |
| **PVL A (8 таблиц)** | course_weeks, course_lessons, content_items, content_placements, homework_items, calendar_events, faq_items, cohorts | I, U, D |
| **PVL B (9 таблиц)** | student_homework_submissions, student_course_progress, student_content_progress, checklist_items, student_certification_scores, student_certification_criteria_scores, student_course_points, student_disputes, student_questions | I, U, D |
| **PVL C (3 таблицы)** | students, garden_mentor_links, mentors | I, U, D |
| **PVL D (3 таблицы)** | direct_messages, notifications | I, U, D |
| **PVL D (history)** | homework_status_history | I (append-only) |
| **PVL E** | audit_log | I (write-once) |
| **Прочие 9** | app_settings, course_progress, events, goals, meetings, practices, scenarios, shop_items, cities | по политикам (см. выше) |
| **news** | news | I (только) |
| **notifications** | notifications | U (только) |
| **NOT GRANT** (артефакты) | notebooks, questions | — |
| **Sequences** | все 15 в public | USAGE, SELECT |

### Что НЕ дано authenticated

- `users_auth`, `to_archive`, `events_archive`, `messages`, `push_subscriptions` — **полный REVOKE** (фаза 4–7).
- `notebooks`, `questions` — **никаких GRANT'ов** (артефакты другого приложения, RLS-on без политик и так блокирует, но GRANT'ов лишних нет).
- Остальные таблицы под RLS-фильтром: `authenticated` имеет права на CMD, но RLS отбирает строки по предикатам.

---

## Что ждёт после открытия Caddy

### Теоретическая проверка фронта

После открытия Caddy фронт под `authenticated` (с JWT) должен:
- Читать список пользователей (`profiles`) — все 59 ✓ (нет узких политик).
- Читать PVL-контент курса — да через шаблон A.
- Читать свои данные ученика — да через шаблон B (`auth.uid() = student_id`).
- Читать свою связку с ментором — да через шаблон C.
- Создавать свой profile / редактировать свой profile — INSERT/UPDATE есть.
- Писать audit-логи — да (INSERT шаблона E).
- НЕ читать `users_auth` — да (REVOKE).
- НЕ читать `messages` — да (REVOKE) — фича чата сейчас не активна.

### Что может всплыть

- Под обычным пользователем (не админом): `pvl_students` вернёт 1 строку (свою), не 23. Если в фронте есть UI «список всех студентов» для НЕ-админов — он окажется почти пустым. Это сознательный дизайн шаблона C.
- `notebooks`/`questions` запросы (если фронт делает) — вернут 0 строк / 403. Если эти таблицы не относятся к Garden, фронт их и не должен трогать.

---

## Чек-лист после конца миграции

- [ ] **Smoke-тесты раздела 15** документа MIGRATION (read-only финальная верификация).
- [ ] `REVOKE CREATE ON SCHEMA public FROM gen_user;` (выдан в фазе 3, разово).
- [ ] **Не открывать** Timeweb web-форму «Привилегии gen_user» до конца миграции.
- [ ] **Открыть Caddy** (Этап 5 SEC-001).
- [ ] **Деплой фронт-патча** (`FRONTEND_PATCH_2026-05-02_jwt_fallback.md`).
- [ ] CLEAN-009: восстановить `migrations/05_profiles_rls.sql`.
- [ ] CLEAN-010: DELETE 4 тестовых сообщений в `messages` (отдельным SQL).
- [ ] **CLEAN-011: разобрать `notebooks` и `questions`** — артефакты приложения расписания, не Garden. Решить: оставить, изолировать или DROP.

---

## Промежуточный итог по миграции (после фазы 14)

| Фаза | Что |
|---|---|
| 1 | profiles cleanup ✅ |
| 2 | knowledge_base hardcoded → role-based ✅ |
| 3 | is_mentor_for(uuid) ✅ |
| 4 | users_auth lockdown ✅ |
| 5 | to_archive + events_archive lockdown ✅ |
| 6 | messages lockdown ✅ |
| 7 | push_subscriptions lockdown ✅ |
| 8 | birthday_templates RLS+4 ✅ |
| 9 | PVL шаблон A (8 таблиц) ✅ |
| 10 | PVL шаблон B (9 таблиц) ✅ |
| 11 | PVL шаблон C (3 таблицы) ✅ |
| 12 | PVL шаблон D (3 таблицы) ✅ |
| 13 | PVL шаблон E (1 таблица) ✅ |
| **14** | **Grants ✅** |

**Итого:**
- **28 таблиц под RLS** (5 lockdown + 23 с политиками; ещё 2 — `notebooks`/`questions` — RLS-on без политик, но не относятся к Garden).
- **+90 политик создано, -10 удалено.**
- **GRANT'ы по матрице** для `authenticated` и `web_anon`.

---

## CLEAN-011 — добавить в backlog

Стоит добавить отдельную задачу в `plans/BACKLOG.md`:

> ### CLEAN-011: Разобрать таблицы notebooks/questions (артефакты другого приложения)
> - **Статус:** 🔴 TODO
> - **Приоритет:** P3
> - **Контекст:** В БД default_db случайно живут две таблицы `public.notebooks` и `public.questions` от приложения расписания событий ведущих (отдельный продукт). Не относятся к Garden. Сейчас RLS=on, 0 политик. Не доступны под web_anon/authenticated, но занимают namespace.
> - **Шаги:**
>   - [ ] Подтвердить, что эти таблицы не используются Garden-фронтом (grep по services/views).
>   - [ ] Решить: переместить в отдельную БД, schema, или DROP.
>   - [ ] Если DROP — проверить, что приложение расписания не пользуется этой БД.

---

## Статус

**✅ ФАЗЫ 14.3 + 14.4 ЗАКРЫТЫ. Все SQL-фазы SEC-001 миграции применены.**

## Следующий шаг

**Жду подтверждения «идём в раздел 15 — smoke-тесты»** — read-only финальная верификация:
- 15.1: Все 28 целевых таблиц имеют RLS=on.
- 15.2: Контрольные счёты политик.
- 15.3: `is_admin()` и `is_mentor_for()` работают под gen_user.
- 15.4: Под `web_anon` всё закрыто.
- 15.5: Под `authenticated` без JWT — то же что web_anon (auth.uid() = NULL).
- 15.6: EXPLAIN на ключевых запросах фронта.

После раздела 15 — открытие Caddy и деплой фронт-патча.
