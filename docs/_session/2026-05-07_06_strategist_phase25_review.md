# Phase 25 — ответы стратега на open questions

**Адресат:** VS Code Claude Code (executor).
**Автор:** стратег (claude.ai).
**Создано:** 2026-05-07.
**Источник:** [`2026-05-07_05_codeexec_phase25_plan.md`](2026-05-07_05_codeexec_phase25_plan.md)
**Режим:** ревью + ответы на questions 3.1-3.6.

## Решения

### 3.1. control_points в `hw_total` — **ИСКЛЮЧАЕМ** (как в плане)

Подтверждаю текущее решение. Аргументы:
- control_points — другой тип задач (запись СЗ, пилот завтрака), не
  «домашка с feedback».
- Для дашборда прогресса включение control_points шумит metrics.
- Если позже понадобится дашборд по control_points — отдельная фича.

**Никаких изменений в SQL не нужно.**

### 3.2. «Домашка 1» — **ОСТАВЛЯЕМ NULL** (как в плане)

Без префикса «модул» — `module_number=NULL`. Не добавлять второй паттерн
для `'^Домашка (\d+)'`. Это задача с неоднозначным контекстом: лучше Ольга
явно поставит её в нужный модуль вручную через CRUD интерфейс
(NB-RESTORE или future PVL-content-admin), чем регекс ошибётся.

**Никаких изменений в SQL не нужно.**

### 3.3. «Рефлексия по модулю» (без цифры) — **`is_module_feedback=t`, `module_number=NULL`** (как в плане)

Подтверждаю. Это feedback общего характера, в выгрузке FEAT-016 будет помечен
как «общая рефлексия без модуля». Ольга позже отредактирует руками если
понадобится. Никаких дефолтных назначений модуля не делать.

**Никаких изменений в SQL не нужно.**

### 3.4. `mentor_name` — **ДОБАВИТЬ FALLBACK на `profiles.name`**

Поправка к плану. Аргументы:
- В Garden админ-структуре Ольга/Настя/Ирина — админы и могут выступать
  менторами через `pvl_garden_mentor_links.mentor_id` указывая на их
  **`profiles.id`**, не на `pvl_mentors.id`.
- После CLEAN-013 закрытия (тестовых снесём) — реальные люди как менторы
  останутся актуальным сценарием.
- Сейчас у нас 18 mentor_links и только 1 строка в `pvl_mentors` —
  значит большинство mentor_id указывают именно на `profiles`.

**Что поменять в SQL** (Section 1, около строки 180):

```sql
            LEFT JOIN public.pvl_mentors m ON m.id = ml.resolved_mentor_id
            LEFT JOIN public.profiles p_mentor ON p_mentor.id = ml.resolved_mentor_id
```

И в `jsonb_build_object` (около строки 150) заменить:

```sql
                    'mentor_name',    m.full_name,
```

на:

```sql
                    'mentor_name',    COALESCE(m.full_name, p_mentor.name),
```

(где `profiles.name` — текущее поле имени в `profiles`; уточнить если
называется иначе — `full_name` / `display_name` / etc., через `\d
public.profiles`).

### 3.5. `module_progress` ключи как text — **OK** (jsonb-стандарт)

Подтверждаю. Frontend сделает `Object.keys().map(Number).sort()` для
итерации в порядке. Никаких изменений в SQL.

### 3.6. Сортировка по `full_name` — **OK**

Подтверждаю. Стабильная default-сортировка, легко находить студента.
Любые другие сортировки (по `state_line`, по проценту прогресса) фронт
сделает client-side через React-state.

## Итог

**Одно изменение в SQL:**
- В `pvl_admin_progress_summary` добавить LEFT JOIN на `profiles` и
  заменить `mentor_name` на `COALESCE(m.full_name, p_mentor.name)`.

Перед apply — уточни через `\d public.profiles` точное имя колонки имени
(если оно не `name`, замени на правильное в COALESCE).

## 🟢 на apply после поправки

После того как:
1. Проверишь имя колонки в `profiles` (`name` / `full_name` / `display_name`).
2. Внесёшь поправку 3.4 в SQL.
3. Положишь файл миграции на диск
   `migrations/2026-05-07_phase25_pvl_admin_progress_summary.sql`.

— **🟢 apply** через ssh+psql под `gen_user`. Verify V1-V5 (+V6) выполнить
после COMMIT, сырой вывод вернуть в файл:

```
docs/_session/2026-05-07_07_codeexec_phase25_apply_report.md
```

(После apply — **НЕ commit миграцию в git, НЕ push.** Этот шаг отдельный
🟢 после verify.)

## Что НЕ делаем сейчас

- Frontend (FEAT-017 UI) — отдельной сессией после успешного apply phase 25.
- FEAT-016 (CSV-выгрузка) — следующей сессией после FEAT-017 UI.
- UX-002 (sortable + full-width админка) — встроится в FEAT-017 UI.
