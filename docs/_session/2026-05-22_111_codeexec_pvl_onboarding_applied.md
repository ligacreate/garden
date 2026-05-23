# phase37 apply — ❌ ABORTED, прод откатился чисто

**От:** codeexec (VS Code Claude Code)
**Кому:** стратега (claude.ai) → Ольга
**Дата:** 2026-05-23
**В ответ на:** 🟢 APPLY phase37
**Тип:** Failure report + proposed fix. **Без commit, без push, без retry.** Жду 🟢 на amended migration.

---

## TL;DR

- ❌ Apply **упал в Section 2 (UPDATE на pvl_cohorts)**. ON_ERROR_STOP=1 убил psql ДО `COMMIT` → транзакция откатилась атомарно.
- ✅ Прод в исходном состоянии: pvl_students = 15 (как было), pvl_cohorts = 1 строка без дат, FK/trigger/function отсутствуют. **Verify подтверждён.**
- 🔥 Корень: латентный баг в схеме `pvl_cohorts` — нет колонки `updated_at`, но trigger `trg_pvl_cohorts_updated_at` BEFORE UPDATE пытается её писать. Тот же паттерн, что phase25 чинила для `pvl_homework_items`.
- 🔍 **Параллельный bug audit:** проверила все 13 таблиц с `pvl_set_updated_at` trigger'ом — **ещё 2** в той же ситуации: `pvl_course_lessons`, `pvl_mentors`. Сейчас никто их не UPDATE'ит, поэтому не выстрелили. Это feedback `[[feedback_extend_scope_for_parallel_bugs]]` — чиним все 3 одной миграцией.
- 🛑 STOP, без retry. Жду 🟢 на amended migration (phase37 v2) с добавлением `updated_at` в 3 таблицы.

---

## 1. Что произошло (хронология)

### 1.1 scp + apply

```bash
scp /Users/user/vibecoding/garden_claude/garden/migrations/2026-05-23_phase37_pvl_onboarding_atomic.sql root@5.129.251.56:/tmp/
# OK (silent)

ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 -f /tmp/2026-05-23_phase37_pvl_onboarding_atomic.sql'
```

### 1.2 Вывод psql (raw)

```
BEGIN
ALTER TABLE
psql:/tmp/2026-05-23_phase37_pvl_onboarding_atomic.sql:114: NOTICE:  constraint "pvl_cohorts_dates_check" of relation "pvl_cohorts" does not exist, skipping
ALTER TABLE
ALTER TABLE
COMMENT
COMMENT
psql:/tmp/2026-05-23_phase37_pvl_onboarding_atomic.sql:129: ERROR:  record "new" has no field "updated_at"
CONTEXT:  PL/pgSQL assignment "NEW.updated_at = NOW()"
PL/pgSQL function pvl_set_updated_at() line 3 at assignment
```

Exit code 3. Транзакция в pending-state → psql сессия прервана `ON_ERROR_STOP=1` → connection close → Postgres делает implicit ROLLBACK.

### 1.3 Что попало в БД до падения

Из вывода видно:
- ✅ `BEGIN` — открыта транзакция.
- ✅ `ALTER TABLE` (×3) + 2 `COMMENT` — Section 1 (schema pvl_cohorts.start_date/end_date + CHECK + комментарии).
- ❌ `ERROR` — линия 129 — это первая команда Section 2: `UPDATE pvl_cohorts SET start_date='2026-04-15' ...`. Сработал BEFORE UPDATE trigger `trg_pvl_cohorts_updated_at` → `pvl_set_updated_at()` пытается `NEW.updated_at = NOW()` → колонки нет → fail.
- ❌ **НИЧЕГО не закоммичено.** ROLLBACK откатил Section 1 тоже.

### 1.4 Verify rollback на проде

```sql
SELECT COUNT(*) FROM pvl_students;       -- 15 (было 15 — OK, не 29)
SELECT id, title, year FROM pvl_cohorts; -- 1 строка «ПВЛ 2026 Поток 1», без дат — OK, Поток 2 не появился
SELECT conname FROM pg_constraint WHERE conname = 'pvl_students_id_fk_profiles';      -- (0 rows) FK не создан
SELECT proname FROM pg_proc WHERE proname = 'trg_create_pvl_student_on_approval';     -- (0 rows) функции нет
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_profiles_pvl_student_on_approval';  -- (0 rows) trigger'а нет
```

И главное — `pvl_cohorts` колонки `start_date` / `end_date` тоже отсутствуют:
```sql
SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'pvl_cohorts' ORDER BY ordinal_position;
-- id / title / year / created_at  (4 строки — те же, что до apply)
```

**Прод в точности pre-apply состоянии. Никаких следов миграции.**

---

## 2. Корневая причина

`pvl_cohorts` в текущей схеме имеет 4 колонки: `id`, `title`, `year`, `created_at`. **Колонки `updated_at` НЕТ.**

Но на таблице висит trigger:
```
CREATE TRIGGER trg_pvl_cohorts_updated_at
    BEFORE UPDATE ON public.pvl_cohorts
    FOR EACH ROW EXECUTE FUNCTION pvl_set_updated_at()
```

Функция `pvl_set_updated_at()` — это generic helper, который делает `NEW.updated_at = NOW()`. При UPDATE на таблицу, где этой колонки нет, plpgsql валит ошибку `record "new" has no field "updated_at"`.

В recon `_108` (§ 1.3) я видела этот trigger в списке, но не проверила, что таблица не имеет колонки — `\d+ pvl_students` показывал `updated_at` для pvl_students, но я не проверила схему pvl_cohorts (запрос был только `\d pvl_cohorts` без `+`, я смотрела только FK и доступные колонки для INSERT'а; колонки сошлись с тем, что мне нужно было INSERT'ить — `id`, `title`, `year`, `start_date`, `end_date` — а `updated_at` не было ни в списке, ни в моих планах писать в него).

Это **тот же латентный bug**, что phase25 уже видела и чинила для `pvl_homework_items`. Цитата из шапки phase25:

> pvl_homework_items.updated_at         timestamptz NOT NULL DEFAULT now()
>   (латентный баг: trg_pvl_homework_items_updated_at BEFORE UPDATE
>    обращается к NEW.updated_at, но колонки исторически не было —
>    срабатывает на первом UPDATE, ошибка «record "new" has no field
>    "updated_at"». Добавляем колонку для совместимости с триггером,
>    consistent с другими pvl_*-таблицами.)

Один-к-одному. Phase25 закрыла для одной таблицы, но не нашла остальные.

---

## 3. Параллельный bug audit (memory feedback)

В соответствии с `[[feedback_extend_scope_for_parallel_bugs]]` («нашёл аналогичный паттерн в смежном файле — чини оба») — проверила **все 13 таблиц**, на которые навешан `pvl_set_updated_at`:

```sql
SELECT t.relname AS table_with_trigger,
       (SELECT COUNT(*) FROM information_schema.columns c
          WHERE c.table_schema='public' AND c.table_name = t.relname
            AND c.column_name = 'updated_at') > 0 AS has_updated_at_column
  FROM pg_trigger tg
  JOIN pg_class t ON t.oid = tg.tgrelid
  JOIN pg_proc p ON p.oid = tg.tgfoid
 WHERE p.proname = 'pvl_set_updated_at' AND NOT tg.tgisinternal
 ORDER BY 2, 1;
```

### Результат:

| таблица | колонка updated_at | статус |
|---------|--------------------|--------|
| **pvl_cohorts** | ❌ нет | bомба — мы её сейчас и подорвали |
| **pvl_course_lessons** | ❌ нет | bомба — взорвётся при первом UPDATE |
| **pvl_mentors** | ❌ нет | bомба — взорвётся при первом UPDATE |
| pvl_course_weeks | ✅ есть | OK |
| pvl_homework_items | ✅ есть | OK (phase25 починила) |
| pvl_student_certification_criteria_scores | ✅ есть | OK |
| pvl_student_certification_scores | ✅ есть | OK |
| pvl_student_content_progress | ✅ есть | OK |
| pvl_student_course_progress | ✅ есть | OK |
| pvl_student_disputes | ✅ есть | OK |
| pvl_student_homework_submissions | ✅ есть | OK |
| pvl_student_questions | ✅ есть | OK |
| pvl_students | ✅ есть | OK |

**3 латентные бомбы:** `pvl_cohorts`, `pvl_course_lessons`, `pvl_mentors`. Никто их сейчас не UPDATE'ит (видимо ETL / админка не правит lesson'ы и mentor'ов через PostgREST после первого INSERT'а; cohort до сегодня тоже никто не правил). Любой будущий UPDATE упадёт с тем же error.

---

## 4. Предлагаемая правка миграции (нужен 🟢)

### 4.1 Минимальная (unblock phase37)

Добавить в Section 1 ровно одну колонку:
```sql
ALTER TABLE public.pvl_cohorts
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
```

Это:
- Снимает блокер phase37 (Section 2 UPDATE сразу пойдёт).
- НЕ трогает 2 остальных латентных bug'а (pvl_course_lessons / pvl_mentors остаются бомбами).

### 4.2 Рекомендуемая (закрыть весь класс bug'ов) ← **рекомендую**

В Section 1 добавить:
```sql
ALTER TABLE public.pvl_cohorts
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.pvl_course_lessons
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.pvl_mentors
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
```

Это:
- Снимает блокер phase37.
- Закрывает 2 другие латентные бомбы того же класса.
- Соответствует паттерну phase25 (один-к-одному, просто шире).
- Idempotent — `IF NOT EXISTS` защищает от повторного apply.
- Цена: +2 строки в миграции. Никаких side-effects на текущие данные (DEFAULT now() заполняет все existing rows).

### 4.3 Что в миграции **НЕ меняется**

Всё остальное phase37 (FK, trigger function, CREATE TRIGGER, backfill 14 interns, verify) — без изменений. Только Section 1 расширяется на 2 ALTER TABLE.

### 4.4 Также — обновить шапку миграции

Добавить в context-комментарий упоминание латентного bug'а + ссылку на phase25 как прецедент. Без этого будущий чтец будет недоумевать, почему мы расширяем 2 «чужие» таблицы в pvl-onboarding миграции.

---

## 5. VERIFY V1..V8 — НЕ выполнены

Транзакция откатилась → нечего verify'ить. После amended apply выполню полный verify и вернусь с цифрами в этом же _111 (или новом отчёте, как решишь).

---

## 6. Что я НЕ сделала (явно)

- ❌ **НЕ retry** apply без правок (instruction: «без retry»). 
- ❌ **НЕ модифицировала миграцию** без 🟢 (instruction: «жди 🟢»; memory `[[feedback_diff_on_review]]`).
- ❌ **НЕ delete'нула** ничего на проде (явно ничего и не закоммитилось — ROLLBACK сделал работу).
- ❌ **НЕ commit / push** ничего в git.

---

## 7. Решение требуется от тебя (Ольга через стратега)

**Вариант A (минимальный):** добавить `updated_at` только в `pvl_cohorts`. Phase37 проходит, 2 другие бомбы остаются на отдельный backlog ticket.

**Вариант B (рекомендуемый):** добавить `updated_at` в `pvl_cohorts` + `pvl_course_lessons` + `pvl_mentors`. Один заход — три bug'а закрыты.

**Вариант C:** что-то третье (например, удалить broken trigger вместо колонки — но это меняет семантику, я бы не стала).

После 🟢 на вариант — обновлю файл миграции (новый diff в `_session/`, жди ревью) или apply сразу с твоего одобрения.

---

## 8. Pre-check assertion / backfill assertion: НЕ упали

Per твоей инструкции «Если pre-check (orphan reverse) или backfill assertion (≠14) упадут — STOP, отчёт с фактическими цифрами, без retry» — ни один из них не упал (миграция умерла раньше, в Section 2). Это **другой** failure mode, но spirit инструкции (STOP без retry) применила. Жду 🟢.

---

## 9. Эффорт

- scp + apply attempt: ~1 мин
- detect failure mode + verify rollback: ~5 мин
- параллельный bug audit (memory-driven): ~3 мин
- _111 отчёт: ~10 мин

Итого ~20 мин на failed-apply + recovery.
