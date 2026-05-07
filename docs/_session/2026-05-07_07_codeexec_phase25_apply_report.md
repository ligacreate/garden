# Phase 25 — apply report (executor)

**Адресат:** стратег (claude.ai).
**Автор:** VS Code Claude Code (executor).
**Создано:** 2026-05-07.
**Источник плана:** [`2026-05-07_05_codeexec_phase25_plan.md`](2026-05-07_05_codeexec_phase25_plan.md)
**Источник ревью:** [`2026-05-07_06_strategist_phase25_review.md`](2026-05-07_06_strategist_phase25_review.md)
**Файл миграции:** `migrations/2026-05-07_phase25_pvl_admin_progress_summary.sql`
(на диске, **не закоммичен**).

---

## TL;DR

- **Apply пытался дважды.** Первый прогон упал на backfill UPDATE с
  ошибкой `record "new" has no field "updated_at"` — латентный баг:
  trigger `trg_pvl_homework_items_updated_at BEFORE UPDATE` обращается
  к `NEW.updated_at`, но колонки в таблице исторически не было.
- **Транзакция корректно откатилась** (BEGIN→ALTER→ALTER→ERROR), grants
  158/4 не пострадали.
- **Поправка:** добавлена третья колонка
  `updated_at timestamptz NOT NULL DEFAULT now()` в `ALTER TABLE`.
  Это фиксит латентный баг и совместимо с другими `pvl_*`-таблицами.
- **Второй прогон — PASS.** V1-V5 (+V6) все зелёные. RPC
  `pvl_admin_progress_summary(uuid)` зарегистрирована, GRANT EXECUTE
  для authenticated, distribution backfill совпадает с TL;DR-таблицей
  плана.
- **Поправка ревью 3.4** (`mentor_name = COALESCE(m.full_name, p_mentor.name)`)
  применена. `profiles.name` подтверждено как корректное имя колонки.
- **⚠ Data-finding:** все 22 строки `pvl_students.cohort_id IS NULL` —
  RPC технически работает, но пока студенты не привязаны к когорте,
  будет возвращать `[]` для любого `p_cohort_id`. Не блокер apply,
  но **блокер для FEAT-017 frontend smoke** — нужна отдельная
  data-миграция (см. ниже).

---

## Хронология apply

### 1. Создан файл миграции

`migrations/2026-05-07_phase25_pvl_admin_progress_summary.sql` —
с поправкой ревью 3.4 (LEFT JOIN profiles + COALESCE для mentor_name)
и комментарием в шапке про источник.

### 2. Pre-apply check — `profiles.name` существует

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles'
  AND column_name IN ('name','full_name','display_name');
```
→ `name` (1 строка). Поправка 3.4 в SQL — корректна как есть, без
правки имени колонки.

### 3. Первый apply — FAIL на backfill

```bash
scp migrations/2026-05-07_phase25_…sql root@5.129.251.56:/tmp/
ssh root@…  '… psql -v ON_ERROR_STOP=1 -f /tmp/…'
```

Сырой вывод:
```
BEGIN
ALTER TABLE
COMMENT
COMMENT
ERROR:  record "new" has no field "updated_at"
CONTEXT:  PL/pgSQL assignment "NEW.updated_at = NOW()"
PL/pgSQL function pvl_set_updated_at() line 3 at assignment
```

#### Диагностика
- ALTER TABLE прошёл (2 колонки добавлены).
- COMMENT × 2 прошли.
- Первый UPDATE backfill (`module_number`) триггернул
  `trg_pvl_homework_items_updated_at BEFORE UPDATE`, который
  пытается `NEW.updated_at = NOW()`, но `pvl_homework_items` не
  имеет `updated_at` колонки.
- Триггер был создан, видимо, по шаблону остальных pvl_*-таблиц,
  но колонку забыли добавить. Боевой UPDATE на этой таблице, видимо,
  никогда не выполнялся (CRUD идёт через INSERT при создании ДЗ
  + RLS-policy update_admin никем не использовалась).
- Это **латентный баг pre-existing**, не регрессия phase 25.

#### Состояние после rollback
```sql
SELECT count auth_grants/anon_grants;   -- 158 / 4 ✓
SELECT column_name FROM …;               -- 0 строк ✓
```
Транзакция корректно откатилась, GRANT-wipeout не сработал.

### 4. Поправка миграции

Добавлена третья колонка в `ALTER TABLE`:
```sql
ALTER TABLE public.pvl_homework_items
    ADD COLUMN IF NOT EXISTS module_number      integer NULL,
    ADD COLUMN IF NOT EXISTS is_module_feedback boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS updated_at         timestamptz NOT NULL DEFAULT now();
```

Плюс `COMMENT ON COLUMN updated_at` с пояснением, что это совместимость
с pre-existing trigger.

### 5. Второй apply — PASS

```
BEGIN
ALTER TABLE
COMMENT
COMMENT
COMMENT
UPDATE 19
UPDATE 19
CREATE FUNCTION
GRANT
 ensure_garden_grants 
----------------------
 
(1 row)
COMMIT
```

Все шаги отработали:
- 3 ALTER COLUMN (через `ADD COLUMN IF NOT EXISTS` × 3 в одном
  `ALTER TABLE`).
- 3 COMMENT ON COLUMN.
- 2 UPDATE-backfill, каждый затронул 19 строк.
- CREATE FUNCTION (CREATE OR REPLACE).
- GRANT EXECUTE.
- `ensure_garden_grants()` (RUNBOOK 1.3).
- COMMIT.

---

## Verify — сырой вывод

### V1: функция зарегистрирована
```
          proname           | is_definer |       args       | returns 
----------------------------+------------+------------------+---------
 pvl_admin_progress_summary | t          | p_cohort_id uuid | jsonb
(1 row)
```
✅ `is_definer=t`, args/returns как ожидалось.

### V2: GRANT EXECUTE
```
    grantee    | privilege_type 
---------------+----------------
 authenticated | EXECUTE
(1 row)
```
✅ EXECUTE для authenticated.

### V3: RUNBOOK 1.3 sanity — auth/anon grant counts
```
 auth_grants | anon_grants 
-------------+-------------
         158 |           4
(1 row)
```
✅ 158/4 — Timeweb DDL wipeout не сработал, `ensure_garden_grants()`
отработал внутри транзакции.

### V4: NULL под gen_user → forbidden
```
ERROR:  forbidden: admin role required
CONTEXT:  PL/pgSQL function pvl_admin_progress_summary(uuid) line 5 at RAISE
```
✅ Permission check срабатывает первым (line 5 = первый `RAISE`),
до обращения к `p_cohort_id`. Контракт RPC соблюдён.

### V5: backfill distribution
```
 module_number | is_module_feedback | count 
---------------+--------------------+-------
             1 | f                  |     2
             1 | t                  |     1
             2 | f                  |     2
             3 | t                  |     1
               | f                  |    12
               | t                  |     1
(6 rows)
```

✅ **Точно совпадает с TL;DR-таблицей плана:**
- module_number=1: 3 строки (Рефлексия по модулю 1 ⊕ Домашка модуля 1
  ⊕ Упражнение модуля 1)
- module_number=2: 2 строки (Чек-лист практикума ⊕ Мини-проект)
- module_number=3: 1 строка (Анкета обратной связи)
- module_number=NULL: 13 строк (тесты к урокам, задания к урокам,
  control_points, «Домашка 1»; + 1 общая «Рефлексия по модулю»)
- is_module_feedback=true: 3 строки (две Рефлексии + Анкета обратной связи)

ИТОГО 19 строк. **Чистый backfill, всё детерминированно через regex.**

### V6: sanity — реальные данные через альтернативный SELECT
```
              student_id              |     full_name      | cohort_id | submissions_count 
--------------------------------------+--------------------+-----------+-------------------
 1431f70e-63bd-4709-803a-5643540fc759 | LIlia MALONG       |           |                 0
 a2356b84-84de-4d86-9ca4-f3ab06d1d01d | Александра Титова  |           |                 4
 4250ffac-acd7-4209-bd28-b31bd9c02665 | Анастасия Ван      |           |                 0
 e6de2a97-60f8-4864-a6d9-eb7da2831bf4 | Анастасия Зобнина  |           |                 0
 9fb65c2a-4541-4fef-8b8b-3b93d8f6b881 | Анжелика Тарасова  |           |                 5
(5 rows)
```
✅ Студенты читаются, submissions_count varies (0-5 на 5 пилотных
строк). RPC под админ-JWT собрал бы тот же набор + агрегаты.

---

## ⚠ Data-finding для FEAT-017 frontend

В V6 `cohort_id` колонка пустая. Углубил:

```sql
SELECT count(*) AS students_total, count(cohort_id) AS students_with_cohort
FROM public.pvl_students;
SELECT id, title FROM public.pvl_cohorts;
```

→ результат:
```
 students_total | students_with_cohort 
----------------+----------------------
             22 |                    0
(1 row)

                  id                  |      title       
--------------------------------------+------------------
 11111111-1111-1111-1111-111111111101 | ПВЛ 2026 Поток 1
(1 row)
```

**Все 22 студента имеют `cohort_id IS NULL`.** В `pvl_cohorts` есть
ровно 1 когорта `11111111-…-101 «ПВЛ 2026 Поток 1»`.

**Импликация:**
- RPC `pvl_admin_progress_summary('11111111-1111-1111-1111-111111111101')`
  под админ-JWT **вернёт `[]`** (пустой jsonb-массив), потому что
  фильтр `WHERE s.cohort_id = p_cohort_id` ни на что не сматчится.
- Это **не баг RPC** — функция ведёт себя корректно. Это **data-issue**
  в `pvl_students`.

**Возможные пути решения** (для отдельного решения стратега + Ольги):

1. **Backfill data-миграция** — `UPDATE public.pvl_students SET cohort_id = '11111111-…-101'`
   для всех 22 строк (поскольку реально все они принадлежат единственной
   существующей когорте). Аналог `migrations/data/…feat002_hygiene…sql`
   паттерна. ~5 строк SQL, под gen_user.
2. **Fallback в RPC** — если `p_cohort_id IS NULL`, возвращать всех
   студентов. Не желательно с т.з. изоляции когорт в будущем (когда
   их станет больше).
3. **Подтянуть cohort_id из `pvl_garden_mentor_links` или другого
   источника** — если он там присутствует. Не проверял, может быть.

**Рекомендую вариант 1** — простая и явная backfill-миграция отдельным
файлом `migrations/data/2026-05-07_pvl_students_cohort_backfill.sql`
с verify-блоком (`SELECT count(*) FROM pvl_students WHERE cohort_id IS
NOT NULL` → 22). Делать **до** разработки FEAT-017 frontend, иначе
дашборд будет показывать пустоту.

Заводить как новый таск в backlog или решать сейчас — на усмотрение
стратега.

---

## Что закрыто

- ✅ ALTER TABLE phase 25 applied (3 колонки + 3 COMMENT).
- ✅ Backfill детерминированный: 6 backed up rows + 13 NULL/false
  по 19 hw_items.
- ✅ RPC `pvl_admin_progress_summary(uuid)` зарегистрирована,
  SECURITY DEFINER, args/returns корректны.
- ✅ GRANT EXECUTE для authenticated.
- ✅ RUNBOOK 1.3 — `ensure_garden_grants()` отработал, 158/4.
- ✅ V1-V6 все PASS.
- ✅ Поправка ревью 3.4 (mentor_name fallback на profiles.name)
  применена.
- ✅ Латентный баг с `updated_at` починен (попутно).

## Что открыто

- 🔴 **Data-finding:** `pvl_students.cohort_id IS NULL` для всех 22
  студентов — нужна backfill-миграция перед FEAT-017 frontend smoke.
- 🔵 **Файл миграции** `migrations/2026-05-07_phase25_pvl_admin_progress_summary.sql`
  лежит на диске, **не закоммичен в git и не запушен**. Ждёт
  отдельный 🟢 от стратега для commit.
- 🔵 **Frontend FEAT-017** — отдельной сессией.
- 🔵 **FEAT-016 (CSV-выгрузка)** — следующей сессией после FEAT-017 UI.

---

## Файл миграции — финальное состояние

`migrations/2026-05-07_phase25_pvl_admin_progress_summary.sql`

Отличия от плана 2026-05-07_05:
1. **+3-я колонка `updated_at`** в ALTER TABLE (поправка после первого
   FAIL на латентном `pvl_set_updated_at` триггере).
2. **+`COMMENT ON COLUMN updated_at`** с пояснением о trigger-совместимости.
3. **mentor_name COALESCE** — `COALESCE(m.full_name, p_mentor.name)`
   (поправка ревью 3.4).
4. **+`LEFT JOIN public.profiles p_mentor ON p_mentor.id = ml.resolved_mentor_id`**
   (поправка ревью 3.4).
5. **Шапка-комментарий обновлена** — упомянуты обе поправки + ссылка
   на ревью документ.

Тело RPC, все verify-секции, GRANT, ensure_garden_grants — без
изменений относительно плана.

---

## НЕ commit, НЕ push

Файл миграции на диске, **не закоммичен**. Ждём отдельный 🟢
стратега на commit.

После commit'а (отдельной сессией) — рекомендую такой же commit
message паттерн как phase 24:

```
schema: FEAT-017 phase 25 — module_number/is_module_feedback + RPC pvl_admin_progress_summary

ALTER TABLE pvl_homework_items: +module_number int, +is_module_feedback bool,
+updated_at timestamptz (фикс латентного бага с trg_pvl_homework_items_updated_at).
Backfill через regex 'модул[ьюяе]\\s*(\\d+)' для number и ILIKE для feedback.
RPC public.pvl_admin_progress_summary(p_cohort_id uuid) SECURITY DEFINER —
агрегатор по студентам когорты для FEAT-017 дашборда. Apply под gen_user
2026-05-07, V1-V6 зелёные.

⚠ Data-finding (отдельный таск): pvl_students.cohort_id IS NULL для
всех 22 студентов — нужен backfill в '11111111-…-101' перед FEAT-017
frontend smoke.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
