# Live SQL: рекон Этапа 2 сертификации

**Дата:** 2026-05-28
**Кто:** codeexec
**Источник запросов:** [2026-05-28_142_codeexec_recon_etap2_certification.md](2026-05-28_142_codeexec_recon_etap2_certification.md), §5.8
**Подключение:** `ssh root@5.129.251.56` → `psql` под `gen_user` (RUNBOOK §1.3-паттерн)
**Режим:** read-only, только SELECT, без INSERT/UPDATE/DELETE.

---

## 0. TL;DR — что меняется по сравнению с §142

| Гипотеза стратега в §142 | Live-факт | Влияние на ТЗ |
|---|---|---|
| «RLS не найдено в migrations» (§1.6, §5.1) | **RLS включён + 12 политик**, шаблон C (RESTRICTIVE `has_platform_access` + PERMISSIVE own/mentor/admin) | Сессия 1 НЕ проектирует RLS с нуля — только меняет column-level логику |
| «У феи может не быть `pvl_students` row» (§5.5, §4.2) | **pvl_students row у феи есть** (id=`1085e06d…`, cohort `11111111-…-101`, status=`active`) | Блокер из §5.5 отпадает. INSERT из §4.4 **не нужен** |
| «У феи нет mentor_id» — не проверялось напрямую | `pvl_students.mentor_id = NULL` у феи, **но в `pvl_garden_mentor_links` связь есть** (mentor=фиксик, от 2026-04-18) | Расхождение между денормализованной колонкой и links-таблицей — Сессия 1 должна решить, на что опираться mentor-view |
| Все 4 helper-функции под вопросом | **Все 4 существуют, все SECURITY DEFINER, все возвращают boolean** | RLS-шаблоны можно строить на них без оговорок |
| scores/criteria — счётчики неизвестны | **Обе таблицы пусты (0 rows)** | На тестовой когорте никто ещё не сертифицирован — backend Сессии 1 пишется на чистый лист |

**Главное:** не «RLS отсутствует, добавляем», а **«RLS есть, но НЕ умеет column-level self vs mentor — UPDATE даёт менти и ментору одну и ту же строку и любые колонки»**. Это меняет §5.1/§5.3 ТЗ.

---

## 1. SQL #1 — RLS state

### 1a. Флаги и количество политик

| table_name | rls_enabled | policies_count |
|---|---|---|
| `pvl_student_certification_criteria_scores` | `true` | 6 |
| `pvl_student_certification_scores` | `true` | 6 |

**Вывод:** RLS включён на обеих таблицах. По 6 политик на каждую.

### 1b. Расшифровка политик (через `pg_policies`)

#### `pvl_student_certification_scores` (6 политик)

| policyname | cmd | permissive | qual / with_check |
|---|---|---|---|
| `…_active_access_guard_select` | SELECT | **RESTRICTIVE** | qual: `has_platform_access(auth.uid())` |
| `…_active_access_guard_write` | ALL | **RESTRICTIVE** | qual + with_check: `has_platform_access(auth.uid())` |
| `…_select_own_or_mentor_or_admin` | SELECT | PERMISSIVE | qual: `(student_id = auth.uid()) OR is_admin() OR is_mentor_for(student_id)` |
| `…_insert_own` | INSERT | PERMISSIVE | with_check: `(student_id = auth.uid())` |
| `…_update_own_or_mentor_or_admin` | UPDATE | PERMISSIVE | qual + with_check: `(student_id = auth.uid()) OR is_admin() OR is_mentor_for(student_id)` |
| `…_delete_admin` | DELETE | PERMISSIVE | qual: `is_admin()` |

#### `pvl_student_certification_criteria_scores` (6 политик)

| policyname | cmd | permissive | qual / with_check |
|---|---|---|---|
| `…_active_access_guard_s…` (select) | SELECT | **RESTRICTIVE** | qual: `has_platform_access(auth.uid())` |
| `…_active_access_guard_w…` (write) | ALL | **RESTRICTIVE** | qual + with_check: `has_platform_access(auth.uid())` |
| `…_select` | SELECT | PERMISSIVE | `EXISTS (SELECT 1 FROM pvl_student_certification_scores s WHERE s.id = certification_score_id AND (s.student_id = auth.uid() OR is_admin() OR is_mentor_for(s.student_id)))` |
| `…_insert` | INSERT | PERMISSIVE | with_check через тот же EXISTS, но **только `s.student_id = auth.uid()`** (без admin/mentor) |
| `…_update` | UPDATE | PERMISSIVE | EXISTS qual+with_check как у `_select` |
| `…_delete` | DELETE | PERMISSIVE | `is_admin()` |

**Что найдено:**
- ✅ Шаблон C из phase11 (RESTRICTIVE `has_platform_access` + PERMISSIVE own/mentor/admin) уже применён.
- ✅ INSERT в scores ограничен `student_id = auth.uid()` — только сама menti может создать row.
- ✅ INSERT в criteria_scores — тоже только сама menti (через EXISTS до родителя).
- ✅ DELETE — только админ.

**Что НЕ найдено / что мешает Этапу 2:**
- ❌ **Column-level разделения self vs mentor нет.** UPDATE-политика `_update_own_or_mentor_or_admin` пускает к строке и menti, и её ментора, и админа — но **по всем колонкам сразу**. Ментор может править `self_score_total`, menti — `mentor_score_total`. PostgreSQL RLS не различает колонки.
- ❌ **INSERT в scores может сделать только menti.** Ментор НЕ может создать row, пока menti не начала. Это нужно учитывать в UI-флоу (порядок: сначала самооценка, потом оценка ментора в той же row).
- ❌ Нет PERMISSIVE-разделения на «menti UPDATE → только self_*» и «mentor UPDATE → только mentor_*».

**Вердикт по §5.1 ТЗ:** RLS уже сделан, но column-level self/mentor — отсутствует. Стратегу выбрать между:
- (a) Сплит на две таблицы `_self` + `_mentor` (как в phase38 для training_feedback) — потребует DROP/MIGRATE существующей `pvl_student_certification_scores` (пустой, миграция дешёвая).
- (b) Триггер `BEFORE UPDATE`, который кидает ошибку если `NEW.mentor_score* != OLD.mentor_score*` и `auth.uid() != mentor_id`, и симметрично для self_*.

---

## 2. SQL #2 — Live state scores-таблиц

### 2a. Row counts

```
scores_rows   = 0
criteria_rows = 0
```

### 2b. Scores для cohort `11111111-1111-1111-1111-111111111101`

```
(0 rows)
```

**Вывод:** обе таблицы пустые. Никто ещё не сертифицирован, в т.ч. на тестовой когорте. Это **удобно** — Сессия 1 может менять схему `pvl_student_certification_scores` (например, добавить `UNIQUE (student_id)`, разбить на две таблицы, добавить reflexion-колонки) без миграции данных.

---

## 3. SQL #3 — Фея и фиксик в БД

### 3a-1. `profiles`

| id | name | email | role | access_status | status |
|---|---|---|---|---|---|
| `1085e06d-34ad-4e7e-b337-56a0c19cc43f` | Настина фея | viktorovna7286@gmail.com | `applicant` | active | active |
| `1b10d2ef-8504-4778-9b7b-5b04b24f8751` | Настин фиксик | zobyshka@gmail.com | `mentor` | active | active |

### 3a-2. `users_auth`

| id | email |
|---|---|
| `1085e06d-…-43f` | viktorovna7286@gmail.com |
| `1b10d2ef-…-751` | zobyshka@gmail.com |

### 3b. `pvl_students`

| source | id | full_name | cohort_id | mentor_id | status |
|---|---|---|---|---|---|
| pvl_students | `1085e06d-…-43f` | Настина фея | `11111111-1111-1111-1111-111111111101` | **∅ NULL** | active |

**Фиксика в `pvl_students` нет** — ожидаемо, ментор не должен туда попадать (это таблица учеников).

### 3c. `pvl_garden_mentor_links`

| student_id | mentor_id | updated_at |
|---|---|---|
| `1085e06d-…-43f` (фея) | `1b10d2ef-…-751` (фиксик) | 2026-04-18 11:18:27.159+03 |

**Что найдено:**
- ✅ Оба пользователя есть в `profiles` и `users_auth`, оба `active`.
- ✅ Роли — `applicant` у феи, `mentor` у фиксика.
- ✅ У феи **ЕСТЬ** `pvl_students` row (вопреки гипотезе §5.5). cohort_id корректный.
- ✅ Связь menti↔mentor зафиксирована в `pvl_garden_mentor_links` от 2026-04-18.

**Что НЕ найдено / на что обратить внимание:**
- ⚠️ **`pvl_students.mentor_id = NULL`** у феи, но в `pvl_garden_mentor_links` связь есть.
  - Если код Этапа 2 (или mentor-view вообще) читает `pvl_students.mentor_id` напрямую — он не увидит связь и подумает что у феи нет ментора.
  - Если читает через JOIN с `pvl_garden_mentor_links` — увидит.
  - Стратегу: явно зафиксировать source of truth для связи. Сейчас это `pvl_garden_mentor_links`.
- ⚠️ У феи `profiles.role = 'applicant'`, а не `student`. Если RLS / UI завязывается на role вместо `pvl_students.status` или `has_platform_access` — может не пустить.

---

## 4. SQL #4 — Helper-функции

| proname | is_definer | args | returns |
|---|---|---|---|
| `has_platform_access` | **true** | `target_user uuid` | boolean |
| `is_admin` | **true** | (нет аргументов) | boolean |
| `is_mentor_for` | **true** | `student_uuid uuid` | boolean |
| `is_pvl_cohort_peer` | **true** | `target_student uuid` | boolean |

**Что найдено:**
- ✅ Все 4 функции существуют в схеме `public`.
- ✅ Все `SECURITY DEFINER` — будут работать в RLS под `authenticated` без дополнительных GRANT'ов на нижележащие таблицы.
- ✅ Все возвращают `boolean` — пригодны для использования в `USING (…)` / `WITH CHECK (…)`.
- ✅ `is_mentor_for(uuid)` принимает `student_uuid` (т.е. вызов `is_mentor_for(student_id)` корректен).
- ✅ `has_platform_access(uuid)` принимает явный `target_user` (в политиках вызывается как `has_platform_access(auth.uid())`).

**Что НЕ найдено:** ничего из ожидавшихся — все 4 на месте.

---

## 5. Сводка «что блокирует / не блокирует ТЗ Сессии 1»

### Снято с блокеров (можно вычеркнуть из §5 в §142)

1. ✅ **§5.5 «у феи нет pvl_students row»** — есть. Manual INSERT из §4.4 **не нужен**. Тестовая пара готова на 80%.
2. ✅ **§5.1 «RLS на certification не найдено в migrations»** — RLS live есть (12 политик, шаблон C). В Сессии 1 проектировать с нуля не надо, только дорабатывать.
3. ✅ **Helper-функции** — все 4 на месте, SECURITY DEFINER, можно опираться без оговорок.
4. ✅ **scores/criteria пустые** — структуру таблиц можно менять без миграции данных.

### Остаются как блокеры / требуют решения стратега

1. ❌ **Column-level self vs mentor в RLS не реализован.** Сейчас UPDATE-политика пускает к строке и menti, и ментора по всем колонкам. Этап 2 (двойной assessment) **не безопасен** без решения:
   - (a) split на `_self_scores` + `_mentor_scores` (потребует DROP пустой `pvl_student_certification_scores` и пересборка PostgREST endpoints);
   - (b) триггер BEFORE UPDATE с проверкой колонок (qual stays as is).
2. ❌ **`pvl_students.mentor_id = NULL` у феи**, ментор-связь живёт только в `pvl_garden_mentor_links`. Стратегу: явно описать в ТЗ, что mentor-view для Этапа 2 читает связь из `pvl_garden_mentor_links`, а не из денормализованной колонки. Иначе ментор не увидит свою menti в Этапе 2.
3. ❌ **`profiles.role = 'applicant'` у феи**, не `student`. Если access к Этапу 2 завязывается на role (а не на `pvl_students.status`/`has_platform_access`) — фея не пройдёт. Стратегу: зафиксировать контракт «кто допущен в Этап 2».
4. ⚠️ **INSERT в `pvl_student_certification_scores` может сделать только menti** (политика `_insert_own` WITH CHECK `student_id = auth.uid()`). Это значит: UI Этапа 2 должен создавать row **под menti**, ментор не может «открыть оценку» до того как menti начала. Если продуктово нужен обратный порядок (ментор стартует первым) — нужна правка RLS или новая таблица.
5. ⚠️ **Reflexion-текст некуда писать** (§5.3 ТЗ) — это не SQL-блокер, это design-вопрос. SQL подтверждает: в существующих таблицах нет колонок под текст.
6. ⚠️ **Нет UNIQUE на `pvl_student_certification_scores.student_id`** (§5.4 ТЗ) — это не SQL-блокер, но раз таблица пустая, ADD CONSTRAINT в Сессии 1 пройдёт без миграции.

### Технические замечания по выполнению

- Один из запросов из §5.8 (#3 первый SELECT — UNION ALL `profiles + users_auth`) **падает** с `ERROR: UNION types uuid and text cannot be matched` из-за `id::text` во второй ветке при `name uuid` в первой. Я разбил на два отдельных SELECT'а — данные получены.
- `polqual::text` в SQL #1b отдаёт parse-tree (`{BOOLEXPR :boolop or :args (…)}`), нечитаемо. Перезапросил через view `pg_policies` (колонки `qual`, `with_check`) — текстовый qual в таблице выше.

---

## 6. Сырые psql-логи

- `/tmp/recon_etap2_output.txt` — основной прогон (SQL #1, #2, #3, #4)
- `/tmp/recon_etap2_followup_output.txt` — добор: pg_policies + #3 split (на хосте Ольги)

Файлы локальные (не в репо). Если нужны в репо — скажи, переложу в `_session/_raw/`.

---

**Файл:** `garden/docs/_session/2026-05-28_143_codeexec_recon_etap2_live_sql.md`
