# Phase 25 миграция — проектирование (БЕЗ APPLY)

**Адресат:** VS Code Claude Code (executor).
**Автор:** стратег (claude.ai).
**Создано:** 2026-05-07.

DB-recon стратега: [`2026-05-07_03_strategist_db_recon.md`](2026-05-07_03_strategist_db_recon.md)
Code-recon твой: [`2026-05-07_02_codeexec_recon_feat016_017_report.md`](2026-05-07_02_codeexec_recon_feat016_017_report.md)

**Режим:** Recon + проектирование. **НЕ apply, НЕ commit.**

## Что должна делать миграция

### 1. Schema changes (`ALTER TABLE pvl_homework_items`)

- `module_number integer NULL`
- `is_module_feedback boolean NOT NULL DEFAULT false`

### 2. Backfill в той же транзакции

Без отдельного data-файла, упрощаем.

- `module_number` — text-парсинг `title` по паттернам:
  - «модуль 1», «модуль 2»
  - «(модуль N)»
  - «по модулю N»
  - «Тест к уроку «...»» → unmatched (NULL остаётся)
- `is_module_feedback = true` для title-паттернов:
  - «Рефлексия по модулю»
  - «Анкета обратной связи»
- Verify-блок:
  ```sql
  SELECT module_number, is_module_feedback, count(*)
  FROM pvl_homework_items GROUP BY 1, 2;
  ```

### 3. CREATE OR REPLACE FUNCTION `pvl_admin_progress_summary(p_cohort_id uuid)`

```
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
```

**Permission check:**
```sql
IF NOT public.is_admin() THEN
  RAISE EXCEPTION 'forbidden: admin role required';
END IF;
```

**Возвращает массив объектов** (по студенту в когорте):

```jsonc
{
  "student_id": "uuid",
  "full_name": "text",
  "status": "text",
  "cohort_id": "uuid",
  "mentor_id": "uuid | null",        // через pvl_garden_mentor_links,
                                     // fallback на pvl_students.mentor_id
  "mentor_name": "text | null",      // через pvl_mentors
  "hw_total": "int",                 // count(pvl_homework_items) в когорте
  "hw_accepted": "int",
  "hw_in_review": "int",
  "hw_revision": "int",
  "hw_not_started": "int",           // hw_total - count(submissions для student)
  "hw_overdue": "int",
  "last_activity": "timestamptz | null",
  "module_progress": "jsonb",        // {0:{done,total}, 1:{...}, 2:{...}, 3:{...}}
  "state_line": "text"               // 'в ритме' | 'есть долги' | 'нужна проверка' | 'ДЗ не начаты'
}
```

**Логику `state_line`** взять из `pvlMockApi.js` `buildMentorMenteeRows` /
`mentorApi` (см. свой recon section 3.2):

- `'ДЗ не начаты'` если `hw_accepted + hw_in_review + hw_revision = 0`
- `'нужна проверка'` если `hw_in_review > 0` (и нет долгов)
- `'есть долги'` если `hw_overdue > 0` ИЛИ `hw_revision > 0`
- `'в ритме'` иначе

### 4. Grant

```sql
GRANT EXECUTE ON FUNCTION public.pvl_admin_progress_summary(uuid)
  TO authenticated;
```

### 5. RUNBOOK 1.3 safety-net

```sql
SELECT public.ensure_garden_grants();
```

ДО `COMMIT`, в той же транзакции. Это DDL-миграция, без safety-net
рискуем 3-м GRANT WIPEOUT.

## Verify-блок (вне транзакции)

- **V1:** функция создана, `SECURITY DEFINER`, args правильные.
- **V2:** `GRANT EXECUTE` для `authenticated`.
- **V3:** counts grants 158/4 (RUNBOOK 1.3 sanity).
- **V4:** `SELECT pvl_admin_progress_summary(NULL)` — ожидание
  permission denied (под `gen_user` `is_admin=false`) →
  `'forbidden: admin role required'`.
- **V5:** Backfill результат — distribution `module_number` /
  `is_module_feedback` по 19 hw_items. Сверить с реальностью —
  значительная часть hw имеет «модуль» в title.

## Что вернуть

Положи план в файл:

```
docs/_session/2026-05-07_05_codeexec_phase25_plan.md
```

Структура:
- **Section 1:** Полный текст миграции (готов к apply).
- **Section 2:** Verify-блок (отдельно, после COMMIT).
- **Section 3:** Open questions от executor (если что-то непонятно по
  бизнес-логике `state_line` или regex'ам для title).
- **Section 4:** Rollback-стратегия (DROP FUNCTION + DROP COLUMN +
  `ensure_garden_grants`).

**НЕ apply, НЕ commit.** Жду 🟢 после ревью стратега.
