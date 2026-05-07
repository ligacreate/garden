# Phase 25 миграция — план (executor side)

**Адресат:** стратег (claude.ai).
**Автор:** VS Code Claude Code (executor).
**Создано:** 2026-05-07.
**Источник:** [`2026-05-07_04_strategist_phase25_prompt.md`](2026-05-07_04_strategist_phase25_prompt.md).
**Контекст:**
- DB-recon стратега: [`2026-05-07_03_strategist_db_recon.md`](2026-05-07_03_strategist_db_recon.md)
- Code-recon executor: [`2026-05-07_02_codeexec_recon_feat016_017_report.md`](2026-05-07_02_codeexec_recon_feat016_017_report.md)
**Режим:** проектирование. **НЕ apply, НЕ commit.**

---

## TL;DR

- **2 schema-изменения** в `pvl_homework_items`: `module_number int NULL`,
  `is_module_feedback boolean NOT NULL DEFAULT false`.
- **Backfill в той же транзакции** — single-pass UPDATE с regex по `title`
  для `module_number` (паттерн «модул[ьюяе]\s*(\d+)») и ILIKE для
  `is_module_feedback` («Рефлексия по модулю%», «Анкета обратной связи%»).
- **RPC `pvl_admin_progress_summary(p_cohort_id uuid)`** — SECURITY DEFINER,
  возвращает `jsonb` (массив объектов по студенту в когорте). Реализован
  как один SELECT с двумя LATERAL-подзапросами (stats + module_progress).
- **GRANT EXECUTE → authenticated** + **`ensure_garden_grants()` ДО COMMIT**
  (RUNBOOK 1.3, защита от Timeweb DDL wipeout).
- **5 verify-блоков** вне транзакции (V1-V5).

Reality-check по 19 hw_items (live read из БД 2026-05-07):

| title | ожидаемый module_number | ожидаемый is_module_feedback |
|---|---:|:---:|
| Тест к уроку «Из чего состоит практика» | NULL | f |
| Чек-лист практикума (модуль 2) | 2 | f |
| Пилот 2 завтрака Лиги | NULL | f |
| Анкета обратной связи (модуль 3) | 3 | **t** |
| Мини-проект модуля 2 | 2 | f |
| Запись СЗ | NULL | f |
| Рефлексия по модулю 1 | 1 | **t** |
| Домашка модуля 1 (слабый прогресс) | 1 | f |
| Упражнение модуля 1 | 1 | f |
| Задание к уроку «Научные основы письменных практик» | NULL | f |
| Чек-лист для анализа встречи | NULL | f |
| Задание к уроку «Ведущая: роль, границы, этика» | NULL | f |
| Чек-лист ДЗ к уроку «Научные основы письменных практик» | NULL | f |
| Задание к уроку «Из чего состоит практика» | NULL | f |
| Рефлексия по модулю | NULL (нет цифры) | **t** |
| Тест к уроку «Научные основы письменных практик» | NULL | f |
| Тест к уроку «Формат завтрака» | NULL | f |
| Тест к уроку «Ведущая: роль, границы, этика» | NULL | f |
| Домашка 1 | NULL (нет «модул») | f |

**Distribution после backfill (V5 expectation):**
- module_number=1: 3 строки (Рефлексия по модулю 1 / Домашка модуля 1 / Упражнение модуля 1)
- module_number=2: 2 строки (Чек-лист практикума / Мини-проект)
- module_number=3: 1 строка (Анкета обратной связи)
- module_number=NULL: 13 строк (тесты к урокам, задания к урокам, общая «Рефлексия по модулю», «Домашка 1», 2 control_point)
- is_module_feedback=true: 3 строки (Рефлексия по модулю 1 / Рефлексия по модулю / Анкета обратной связи)

⚠ См. Section 3 «Open questions» — есть заметные edge-cases по
«Домашка 1», «Рефлексия по модулю» (без цифры), control_points.

---

## Section 1 — Полный текст миграции (готов к apply)

**Путь:** `migrations/2026-05-07_phase25_pvl_admin_progress_summary.sql`

```sql
-- migrations/2026-05-07_phase25_pvl_admin_progress_summary.sql
--
-- FEAT-017 phase 25 — структурный module_number / is_module_feedback в
-- pvl_homework_items + RPC pvl_admin_progress_summary(p_cohort_id) для
-- админского дашборда прогресса студентов.
--
-- Schema changes:
--   pvl_homework_items.module_number      integer NULL
--   pvl_homework_items.is_module_feedback boolean NOT NULL DEFAULT false
--
-- Backfill (single-pass UPDATE по title regex):
--   module_number       — substring(title FROM 'модул[ьюяе]\s*(\d+)')::int
--   is_module_feedback  — title ILIKE 'Рефлексия по модулю%'
--                         OR title ILIKE 'Анкета обратной связи%'
--
-- RPC public.pvl_admin_progress_summary(p_cohort_id uuid):
--   SECURITY DEFINER, проверка is_admin(), возвращает jsonb-массив объектов
--   по каждому студенту когорты. См. структуру в strategist prompt
--   2026-05-07_04 секция 3.
--
-- RUNBOOK 1.3:
--   SELECT public.ensure_garden_grants() ДО COMMIT — защита от Timeweb
--   DDL GRANT-wipeout.
--
-- Apply:
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
--     -v ON_ERROR_STOP=1 -f /tmp/2026-05-07_phase25_pvl_admin_progress_summary.sql'

\set ON_ERROR_STOP on

BEGIN;

-- ── 1. SCHEMA ────────────────────────────────────────────────────────
ALTER TABLE public.pvl_homework_items
    ADD COLUMN IF NOT EXISTS module_number integer NULL,
    ADD COLUMN IF NOT EXISTS is_module_feedback boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pvl_homework_items.module_number IS
    'Номер модуля курса (0..3) или NULL если ДЗ не привязан к конкретному модулю.';
COMMENT ON COLUMN public.pvl_homework_items.is_module_feedback IS
    'true для рефлексий и анкет обратной связи по модулю — для FEAT-016 выгрузки feedback.';

-- ── 2. BACKFILL ──────────────────────────────────────────────────────
-- Single regex покрывает все 3 паттерна из spec'а:
--   "модуль 1" / "модуля 2" / "модулю 1" / "(модуль N)" / "по модулю N"
-- Парные скобки в title — литералы; regex не требует их учитывать.
UPDATE public.pvl_homework_items
SET module_number = NULLIF(substring(title FROM 'модул[ьюяе]\s*(\d+)'), '')::int
WHERE module_number IS NULL;

UPDATE public.pvl_homework_items
SET is_module_feedback = (
       title ILIKE 'Рефлексия по модулю%'
    OR title ILIKE 'Анкета обратной связи%'
)
WHERE is_module_feedback = false;

-- ── 3. RPC: pvl_admin_progress_summary ───────────────────────────────
CREATE OR REPLACE FUNCTION public.pvl_admin_progress_summary(p_cohort_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Permission check FIRST (даже на NULL p_cohort_id админ-чек обязателен)
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'forbidden: admin role required' USING ERRCODE = '42501';
    END IF;

    RETURN COALESCE((
        SELECT jsonb_agg(row_data ORDER BY sort_name)
        FROM (
            SELECT
                jsonb_build_object(
                    'student_id',     s.id,
                    'full_name',      s.full_name,
                    'status',         s.status,
                    'cohort_id',      s.cohort_id,
                    'mentor_id',      ml.resolved_mentor_id,
                    'mentor_name',    m.full_name,
                    'hw_total',       stats.hw_total,
                    'hw_accepted',    stats.hw_accepted,
                    'hw_in_review',   stats.hw_in_review,
                    'hw_revision',    stats.hw_revision,
                    'hw_not_started', GREATEST(stats.hw_total - stats.submissions_total, 0),
                    'hw_overdue',     stats.hw_overdue,
                    'last_activity',  stats.last_activity,
                    'module_progress', mp.module_progress,
                    'state_line', CASE
                        WHEN stats.hw_accepted + stats.hw_in_review + stats.hw_revision = 0
                            THEN 'ДЗ не начаты'
                        WHEN stats.hw_overdue > 0 OR stats.hw_revision > 0
                            THEN 'есть долги'
                        WHEN stats.hw_in_review > 0
                            THEN 'нужна проверка'
                        ELSE 'в ритме'
                    END
                ) AS row_data,
                s.full_name AS sort_name
            FROM public.pvl_students s
            -- Резолюция ментора: links → fallback на pvl_students.mentor_id
            LEFT JOIN LATERAL (
                SELECT COALESCE(
                    (SELECT mentor_id
                     FROM public.pvl_garden_mentor_links
                     WHERE student_id = s.id),
                    s.mentor_id
                ) AS resolved_mentor_id
            ) ml ON TRUE
            LEFT JOIN public.pvl_mentors m ON m.id = ml.resolved_mentor_id
            -- Агрегаты по статусам submissions (только homework, без control_points)
            LEFT JOIN LATERAL (
                SELECT
                    (SELECT count(*)
                     FROM public.pvl_homework_items
                     WHERE item_type = 'homework' AND NOT is_control_point
                    )                                                   AS hw_total,
                    count(*) FILTER (WHERE shs.status = 'accepted')     AS hw_accepted,
                    count(*) FILTER (WHERE shs.status = 'in_review')    AS hw_in_review,
                    count(*) FILTER (WHERE shs.status = 'revision')     AS hw_revision,
                    count(*) FILTER (WHERE shs.status = 'overdue')      AS hw_overdue,
                    count(*)                                            AS submissions_total,
                    max(shs.updated_at)                                 AS last_activity
                FROM public.pvl_student_homework_submissions shs
                JOIN public.pvl_homework_items hi ON hi.id = shs.homework_item_id
                WHERE shs.student_id = s.id
                  AND hi.item_type = 'homework' AND NOT hi.is_control_point
            ) stats ON TRUE
            -- Прогресс по модулям: {module: {done, total}}
            LEFT JOIN LATERAL (
                SELECT COALESCE(
                    jsonb_object_agg(
                        per_module.module_number::text,
                        jsonb_build_object('done', per_module.done_count,
                                           'total', per_module.total_count)
                    ),
                    '{}'::jsonb
                ) AS module_progress
                FROM (
                    SELECT
                        hi.module_number,
                        count(*) AS total_count,
                        count(*) FILTER (
                            WHERE EXISTS (
                                SELECT 1
                                FROM public.pvl_student_homework_submissions shs2
                                WHERE shs2.student_id      = s.id
                                  AND shs2.homework_item_id = hi.id
                                  AND shs2.status           = 'accepted'
                            )
                        ) AS done_count
                    FROM public.pvl_homework_items hi
                    WHERE hi.module_number IS NOT NULL
                      AND hi.item_type = 'homework'
                      AND NOT hi.is_control_point
                    GROUP BY hi.module_number
                ) per_module
            ) mp ON TRUE
            WHERE s.cohort_id = p_cohort_id
        ) by_student
    ), '[]'::jsonb);
END;
$$;

-- ── 4. GRANT ─────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.pvl_admin_progress_summary(uuid)
    TO authenticated;

-- ── 5. RUNBOOK 1.3 — safety-net ДО COMMIT ────────────────────────────
SELECT public.ensure_garden_grants();

COMMIT;
```

### Замечания по реализации

1. **`item_type='homework' AND NOT is_control_point`** — оба условия применены везде, чтобы `hw_total / hw_accepted / module_progress` считались **только по обычным homework** (исключаем 2 control_points). См. open question 3.1.

2. **`hw_overdue`** реально считается — статус `'overdue'` есть в check-constraint таблицы (`status_check`). Сейчас в БД 0 строк со статусом `overdue`, но контракт корректен. Переход submission → `overdue` будет работать через будущий cron/trigger или ручной UPDATE.

3. **`hw_not_started = max(hw_total - submissions_total, 0)`** — `GREATEST` защищает от негатива в крайних случаях (теоретически возможно если у студента submissions для items, которых нет в `WHERE item_type='homework' AND NOT is_control_point`; на деле не возникнет благодаря FK + CASCADE, но оставлено для безопасности).

4. **`mentor_id`** — двухуровневый COALESCE: сначала `pvl_garden_mentor_links.mentor_id`, потом `pvl_students.mentor_id`. **Несимметрия типов:** `pvl_students.mentor_id` FK→`pvl_mentors(id)`; `pvl_garden_mentor_links.mentor_id` FK не объявлен (см. ARCH-014 в backlog), скорее всего ссылается на `profiles(id)`. → `mentor_name` через LEFT JOIN `pvl_mentors` сработает только когда `resolved_mentor_id` совпадает с `pvl_mentors.id`. В остальных случаях `mentor_name = NULL`. Это **известное ограничение**, см. open question 3.4.

5. **Сортировка результата** — `jsonb_agg(... ORDER BY sort_name)`. Frontend получит массив, отсортированный по `full_name` русским collation Postgres'а (default). Если нужна другая сортировка — поправим в frontend.

6. **`LATERAL` без `LEFT JOIN`** для `stats` и `mp` — `count(*)` без `GROUP BY` всегда возвращает одну строку даже на пустом наборе. То есть для студентов без submissions: `hw_accepted/in_review/revision/overdue/submissions_total = 0`, `last_activity = NULL`, `module_progress = {}`. Корректно.

---

## Section 2 — Verify-блок (вне транзакции, после COMMIT)

```sql
-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (после COMMIT, под gen_user)
-- ─────────────────────────────────────────────────────────────────────

\echo === V1: функция pvl_admin_progress_summary создана, SECURITY DEFINER ===
SELECT proname, prosecdef AS is_definer,
       pg_get_function_arguments(oid) AS args,
       pg_get_function_result(oid) AS returns
FROM pg_proc
WHERE proname = 'pvl_admin_progress_summary'
  AND pronamespace = 'public'::regnamespace;
-- Ожидание: 1 строка, is_definer=t, args='p_cohort_id uuid', returns=jsonb

\echo === V2: GRANT EXECUTE для authenticated ===
SELECT grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE specific_schema = 'public'
  AND routine_name = 'pvl_admin_progress_summary'
  AND grantee = 'authenticated';
-- Ожидание: 1 строка, EXECUTE

\echo === V3: RUNBOOK 1.3 sanity — auth/anon grant counts ===
SELECT
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE grantee = 'authenticated' AND table_schema = 'public') AS auth_grants,
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE grantee = 'web_anon'      AND table_schema = 'public') AS anon_grants;
-- Ожидание: 158 / 4

\echo === V4: SELECT pvl_admin_progress_summary(NULL) под gen_user ===
\echo (gen_user не имеет profile-строки с role=admin → is_admin() = false → forbidden)
-- Ожидание: ERROR 42501 'forbidden: admin role required'
SELECT public.pvl_admin_progress_summary(NULL);

\echo === V5: backfill distribution ===
SELECT module_number, is_module_feedback, count(*)
FROM public.pvl_homework_items
GROUP BY 1, 2
ORDER BY module_number NULLS LAST, is_module_feedback;
-- Ожидание (на текущих 19 hw_items, см. TL;DR таблицу выше):
--   module_number | is_module_feedback | count
--   --------------+--------------------+------
--                1| f                  |    2  (Домашка модуля 1, Упражнение модуля 1)
--                1| t                  |    1  (Рефлексия по модулю 1)
--                2| f                  |    2  (Чек-лист практикума, Мини-проект)
--                3| t                  |    1  (Анкета обратной связи)
--             NULL| f                  |   12  (тесты к урокам, задания к урокам, control_points, «Домашка 1»)
--             NULL| t                  |    1  (общая «Рефлексия по модулю» без цифры)
-- ИТОГО: 19. Если суммы не сходятся — стратег решает по open questions 3.1-3.3.

\echo === V6: smoke на реальной когорте (read-only, проверка что RPC отдаёт jsonb) ===
\echo Под gen_user RPC бросит forbidden, поэтому проверяем альтернативой —
\echo напрямую запрашиваем плановый shape данных:
SELECT
  s.id           AS student_id,
  s.full_name,
  s.cohort_id,
  count(shs.id) AS submissions_count
FROM public.pvl_students s
LEFT JOIN public.pvl_student_homework_submissions shs ON shs.student_id = s.id
GROUP BY s.id, s.full_name, s.cohort_id
ORDER BY s.full_name
LIMIT 3;
-- Если эта выборка работает — RPC под admin'ом получит то же + агрегаты.
```

---

## Section 3 — Open questions от executor

### 3.1. Считать `hw_total` со включением control_points или без?

В spec'е («count(pvl_homework_items) в когорте») не уточнено. Сейчас в плане
**исключаем** control_points (`item_type='homework' AND NOT is_control_point`),
потому что:
- `hw_in_review/accepted/revision` логично считать только по обычным homework
  (control_points — отдельная сущность с другим UX);
- `state_line` стал бы шумным для когорты с малым числом submitted control_points.

Но если спецификация продукта требует **общую цифру** (включая cp) — заменить
`AND NOT is_control_point` на пусто (или вытащить в отдельный параметр).
**Запрос к стратегу:** оставить как есть (исключаем cp) или включить?

Текущие 2 control_points в БД:
- «Пилот 2 завтрака Лиги» (control_point)
- «Запись СЗ» (control_point)

### 3.2. Title «Домашка 1» — это «модуль 1» или нет?

`Домашка 1` без слова «модул» — regex не сработает, остаётся `module_number=NULL`.
Если продукт хочет, чтобы это было `module_number=1`, нужен второй паттерн в
backfill (`'^Домашка (\d+)$'` или `'^Домашка (\d+)\b'`). Сейчас **в плане
никак не парсится**. Принимаем «как есть» по spec'у.

**Запрос к стратегу:** оставить NULL для «Домашка 1» или добавить паттерн?

### 3.3. Title «Рефлексия по модулю» без цифры — `module_number = NULL`, `is_module_feedback = true`?

Сейчас в плане **да** — `is_module_feedback=t` (ILIKE-паттерн поймает),
`module_number=NULL` (regex без цифры не сработает). Это означает, что в выгрузке
feedback (FEAT-016) запись попадёт «общая рефлексия без модуля». Допустимо?

**Запрос к стратегу:** подтвердить такое поведение или назначить какой-то
дефолтный модуль (например, текущий week → module mapping)?

### 3.4. `mentor_name` через `pvl_mentors` — пропустим случаи когда `pvl_garden_mentor_links.mentor_id` указывает не на `pvl_mentors.id`?

В реальной БД 18 mentor_links и 1 ментор в `pvl_mentors`. Из CLEAN-013 recon
известно, что `pvl_garden_mentor_links.mentor_id` мог хранить UUID профиля
**не из `pvl_mentors`** (например, тестовый «ментор» Настин фиксик). После
CLEAN-013 закрытия большая часть таких случаев должна уйти, но контракт
по-прежнему хрупкий (см. ARCH-014 в backlog).

Сейчас в плане LEFT JOIN `pvl_mentors` — `mentor_name = NULL` для несоответствий.
Frontend сможет показать «не назначен» или mentor_id как fallback.

**Запрос к стратегу:** ОК, или нужен дополнительный fallback на `profiles.name`?

### 3.5. `module_progress` ключи — text или int?

`jsonb_object_agg` требует text-ключи (jsonb-стандарт). Сейчас приведено
`per_module.module_number::text`. На фронте получится `{"0": ..., "1": ...}`
вместо `{0: ..., 1: ...}`. Это **корректное JSON-поведение** (jsonb-ключи
всегда строки). Frontend должен делать `Object.keys(module_progress).sort()`
с приведением к int для сортировки.

Альтернатива: вернуть массив `[{module: 0, done, total}, {module: 1, ...}]` —
проще для итерации на фронте. Но prompt спрашивает именно
`{0:{done,total}, 1:{...}}` shape, так что оставляем.

### 3.6. Сортировка студентов в результате — по `full_name`?

Сейчас `jsonb_agg(... ORDER BY sort_name)` — сортирует по `full_name`
default'ным collation сервера. Frontend получает уже отсортированный массив.

Альтернативы (если стратег захочет иначе): сортировать по `state_line`
(сначала «есть долги», потом «нужна проверка», и т.д.) или вообще не
сортировать на стороне БД (frontend сам решит).

**Запрос к стратегу:** оставить сортировку по `full_name` или другая?

---

## Section 4 — Rollback-стратегия

В случае проблем после apply (например, `pvl_admin_progress_summary`
зависает на больших cohort'ах, или backfill дал не те результаты):

```sql
-- ─────────────────────────────────────────────────────────────────────
-- ROLLBACK PHASE 25
-- ─────────────────────────────────────────────────────────────────────

\set ON_ERROR_STOP on

BEGIN;

-- 1. DROP функции
DROP FUNCTION IF EXISTS public.pvl_admin_progress_summary(uuid);

-- 2. DROP колонок (необратимо для данных в module_number/is_module_feedback,
--    но эти данные восстанавливаются из title через тот же backfill)
ALTER TABLE public.pvl_homework_items
    DROP COLUMN IF EXISTS module_number,
    DROP COLUMN IF EXISTS is_module_feedback;

-- 3. RUNBOOK 1.3 — safety-net тоже на DROP'ах
SELECT public.ensure_garden_grants();

COMMIT;
```

### Особенности

1. **DROP COLUMN module_number / is_module_feedback** — данные потеряются.
   Но поскольку они полностью derived из `title` (single regex для number +
   ILIKE для feedback), повторный backfill после re-apply phase 25 их
   восстановит детерминированно. **Никаких ручных backfill-данных не теряется.**

2. **RUNBOOK 1.3** обязателен и на rollback'е — `DROP FUNCTION` / `DROP COLUMN`
   тоже DDL-операции, Timeweb может wipe'нуть GRANT'ы.

3. **Если функция активно используется во фронте** на момент rollback'а —
   вызовы будут падать `function pvl_admin_progress_summary(uuid) does not exist`.
   Это надо учесть в ордере rollback'а (сначала откатить frontend, потом DB).
   Но т.к. сейчас фронт **ещё не дёргает RPC** (FEAT-017 frontend-страница
   ещё не реализована), rollback DDL-only безопасен.

4. **Verify after rollback:**
   ```sql
   SELECT count(*) FROM pg_proc
   WHERE proname='pvl_admin_progress_summary' AND pronamespace='public'::regnamespace;
   -- Ожидание: 0

   SELECT column_name FROM information_schema.columns
   WHERE table_schema='public' AND table_name='pvl_homework_items'
     AND column_name IN ('module_number', 'is_module_feedback');
   -- Ожидание: 0 строк

   SELECT count(*) FROM information_schema.role_table_grants
     WHERE grantee='authenticated' AND table_schema='public';
   -- Ожидание: 158
   ```

5. **Idempotency:** ALTER TABLE использует `ADD COLUMN IF NOT EXISTS`,
   `DROP COLUMN IF EXISTS` — apply и rollback можно безопасно повторять.
   `CREATE OR REPLACE FUNCTION` тоже идемпотентен. UPDATE backfill —
   условный `WHERE module_number IS NULL` / `WHERE is_module_feedback = false`,
   то есть повторный apply ничего не сломает.

---

## Что вернуть стратегу

Этот файл (`docs/_session/2026-05-07_05_codeexec_phase25_plan.md`).
Стратег ревьюит, отвечает на open questions 3.1-3.6, даёт 🟢 на apply.

**НЕ apply, НЕ commit.** Файл миграции `migrations/2026-05-07_phase25_…sql`
**не создан** на диске — после 🟢 создам его и применю одной серией
(scp + ssh+psql).
