# phase37 v2 — diff на ревью

**От:** codeexec (VS Code Claude Code)
**Кому:** стратега (claude.ai) → Ольга
**Дата:** 2026-05-23
**В ответ на:** 🟢 Вариант B (add updated_at в 3 таблицы)
**Тип:** Diff v2 на ревью. **Без apply / commit / push.** Жду 🟢.

---

## TL;DR

- ✅ Обновила [`migrations/2026-05-23_phase37_pvl_onboarding_atomic.sql`](../../migrations/2026-05-23_phase37_pvl_onboarding_atomic.sql): добавила в начало BEGIN-блока новую Section 1a с тремя `ALTER TABLE ADD COLUMN IF NOT EXISTS updated_at`. Прежняя Section 1 (start_date/end_date) переименована в Section 1b.
- ✅ Шапка миграции расширена блоком «v2 (2026-05-23)» с контекстом fix'а + ссылкой на `_111` + прецедент phase25.
- ✅ Verify-блок: добавлен V0 — проверка что во всех 3 таблицах появилась колонка `updated_at` (через information_schema.columns).
- ✅ Trigger names в COMMENT'ах подтверждены SELECT'ом из pg_trigger — совпадают (`trg_pvl_cohorts_updated_at`, `trg_pvl_course_lessons_updated_at`, `trg_pvl_mentors_updated_at`).
- ❌ Никаких других изменений — FK, trigger, backfill, assertions, ensure_garden_grants — всё как было в v1.

---

## 1. Diff vs v1

### 1.1 Шапка миграции — добавлен блок «v2»

После списка «Закрывает 4 backlog тикета одной миграцией» добавлен новый блок:

```
-- v2 (2026-05-23) — параллельный латентный bug (см. _111):
--   Первый apply phase37 v1 упал в Section 2 на UPDATE pvl_cohorts —
--   trigger trg_pvl_cohorts_updated_at BEFORE UPDATE пытается писать
--   NEW.updated_at, но колонки updated_at в pvl_cohorts нет. Тот же
--   паттерн, что phase25 чинила для pvl_homework_items.
--   Audit показал: помимо pvl_cohorts ещё 2 таблицы в той же ситуации —
--   pvl_course_lessons и pvl_mentors. Никто их сейчас не UPDATE'ит,
--   поэтому не выстрелили. Закрываем класс bug'ов одной миграцией
--   (feedback "extend scope for parallel bugs"):
--     ALTER TABLE pvl_cohorts        ADD COLUMN updated_at ...
--     ALTER TABLE pvl_course_lessons ADD COLUMN updated_at ...
--     ALTER TABLE pvl_mentors        ADD COLUMN updated_at ...
--   IF NOT EXISTS — повторный apply безопасен. DEFAULT now() заполняет
--   existing rows. NOT NULL — consistent с прочими 10 pvl_* таблицами.
```

### 1.2 Section 1 → разделена на 1a + 1b

**Новая Section 1a (schema-fix латентного bug'а):**

```sql
-- ── 1a. SCHEMA-fix: латентный bug pvl_set_updated_at без колонки ──────
ALTER TABLE public.pvl_cohorts
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.pvl_course_lessons
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.pvl_mentors
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.pvl_cohorts.updated_at IS '…';
COMMENT ON COLUMN public.pvl_course_lessons.updated_at IS '…';
COMMENT ON COLUMN public.pvl_mentors.updated_at IS '…';
```

**Section 1b (прежняя Section 1, без изменений):**

```sql
-- ── 1b. SCHEMA: pvl_cohorts.start_date / end_date ─────────────────────
ALTER TABLE public.pvl_cohorts
    ADD COLUMN IF NOT EXISTS start_date date,
    ADD COLUMN IF NOT EXISTS end_date   date;
... (CHECK + COMMENT'ы — без изменений)
```

### 1.3 Verify-блок — добавлен V0

Перед V1 добавлен:

```sql
\echo === V0: updated_at колонка добавлена во все 3 таблицы (v2 fix) ===
SELECT table_name,
       EXISTS (SELECT 1 FROM information_schema.columns c
                WHERE c.table_schema='public'
                  AND c.table_name = t.table_name
                  AND c.column_name = 'updated_at') AS has_updated_at
  FROM (VALUES ('pvl_cohorts'), ('pvl_course_lessons'), ('pvl_mentors')) AS t(table_name)
 ORDER BY table_name;
```

Ожидание: 3 строки, все с `has_updated_at = t`.

### 1.4 Что НЕ менялось

- Section 2 (backfill дат Поток 1 + INSERT Поток 2) — без изменений
- Section 3 (pre-check orphan reverse) — без изменений
- Section 4 (FK pvl_students.id → profiles(id)) — без изменений
- Section 5 (trigger function SECURITY DEFINER) — без изменений
- Section 6 (CREATE TRIGGER механизм c) — без изменений
- Section 7 (backfill 14 interns + assertion) — без изменений
- Section 8 (ensure_garden_grants) — без изменений
- V1..V8 verify — без изменений

---

## 2. Подтверждения корректности v2

### 2.1 Trigger names совпадают с COMMENT'ами

Проверила SELECT'ом из pg_trigger:

```
     table_name     |           trigger_name            
--------------------+-----------------------------------
 pvl_cohorts        | trg_pvl_cohorts_updated_at
 pvl_course_lessons | trg_pvl_course_lessons_updated_at
 pvl_mentors        | trg_pvl_mentors_updated_at
```

COMMENT'ы в миграции упоминают эти trigger'ы 1:1.

### 2.2 Идемпотентность повторного apply сохранена

- `ADD COLUMN IF NOT EXISTS` — повторный apply не падает.
- DEFAULT now() заполняет existing rows на момент ALTER'а — все pvl_cohorts (1 row), pvl_course_lessons (N rows), pvl_mentors (N rows) получают `updated_at = NOW()` единожды.
- NOT NULL безопасно — DEFAULT гарантирует что после ALTER'а ни одна row не имеет NULL.

### 2.3 Order rationale

Section 1a → Section 1b → Section 2:
- 1a добавляет updated_at → trigger trg_pvl_cohorts_updated_at теперь может писать → разблокирует Section 2's UPDATE.
- 1b добавляет start_date/end_date → Section 2 их UPDATE'ит.
- Section 2 UPDATE проходит без error (1a сделала trigger счастливым).

### 2.4 Side-effects — анализ

**pvl_course_lessons / pvl_mentors — додаём колонку. Что ломается?**

- PostgREST: новая колонка появится в API responses. Это **additive** — не ломает существующих клиентов. Frontend читает `SELECT *` или explicit fields; новая колонка не мешает.
- ETL / импорт: если кто-то делает `INSERT INTO pvl_mentors (id, full_name)` — продолжит работать (updated_at имеет DEFAULT, не требуется в INSERT).
- RLS: политики на этих таблицах не ссылаются на updated_at (проверено `_108` — RLS использует только `id`, `is_admin()`, `has_platform_access()`).
- Backfill timestamp: все existing rows получат `updated_at = <момент apply>`. Это не «настоящий» updated_at для исторических rows — это маркер «когда мы добавили колонку». Если кто-то построит логику на `WHERE updated_at > X` — увидит всю историю как «обновлённую в момент apply». Это **не баг**, это нормальное поведение для backfilled-колонки. Дополнительный комментарий писать не стала — обычная практика.

**pvl_cohorts — додаём колонку + UPDATE на одной row.**

- Section 2 UPDATE триггерит trg_pvl_cohorts_updated_at → перепишет updated_at второй раз тем же значением (NOW() в той же транзакции). Не баг.

---

## 3. Что НЕ сделано (явно)

- ❌ Не делала apply.
- ❌ Не commit / push.
- ❌ Не модифицировала никаких других файлов.
- ❌ Не trogol старый Section 1 кода — он целиком сохранён под именем Section 1b.

---

## 4. После 🟢 — план apply

Тот же что в `_109` workflow:

1. scp `phase37_pvl_onboarding_atomic.sql` (v2) на прод в `/tmp/`.
2. `psql -v ON_ERROR_STOP=1 -f /tmp/phase37...sql`.
3. Если транзакция COMMIT'нулась — verify V0..V8 идёт автоматически после COMMIT'а, в том же psql выводе.
4. Парсю V0..V8, кладу цифры в новый `_113_codeexec_pvl_onboarding_applied.md` (или продолжаю в _111, как скажешь).
5. STOP без retry если pre-check / backfill-assertion упадёт. STOP без retry если v0 покажет что у какой-то из 3 таблиц `has_updated_at = f` (нонсенс, но защита есть).

---

## 5. Эффорт

- Edit миграции: ~3 мин
- Verify trigger names через ssh: ~1 мин
- _112 отчёт: ~10 мин

Итого ~15 мин.
