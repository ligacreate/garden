---
title: RLS-cast на TEXT-id ломает весь запрос, не «фильтрует тихо»
type: lesson
date: 2026-05-03
related:
  - docs/EXEC_2026-05-02_phase10_2_pvl_student_questions.md
  - docs/EXEC_2026-05-02_etap5_post_smoke_fix1_pvl_student_questions.md
  - docs/RUNBOOK_garden.md (раздел 1.1)
  - plans/BACKLOG.md (CLEAN-007, BUG-001)
---

# Урок: RLS-cast на TEXT-id ломает весь запрос, не «фильтрует тихо»

## Симптом

После открытия Caddy в финале SEC-001 (2026-05-03 ~01:30 МСК):

- Под логином ментора **`zobyshka@gmail.com`** на сайте `liga.skrebeyko.ru` **учительская / список менти не подгружался** — пустой UI вместо ожидаемых 4 студентов.
- На уровне БД RLS работала правильно: под ментор-uid `SELECT count(*) FROM public.pvl_students` возвращал 4 (его menti через `is_mentor_for(id)`).
- В DevTools Console — серия HTTP 500 на `GET https://api.skrebeyko.ru/pvl_student_questions?...`, плюс 17 ошибок 403 на `POST .../pvl_students?on_conflict=id` (отдельная проблема, см. ARCH-012).

## Корневая причина

В таблице `public.pvl_student_questions` колонка `student_id` имеет тип **`text`**, а не `uuid` (см. v3 audit, схема таблицы — единственная PVL-таблица с TEXT-id). В этой колонке **5 seed/smoke-тестовых строк** имели значение `'u-st-1'` — невалидный UUID.

RLS-политика `pvl_student_questions_select_own_or_mentor_or_admin` для проверки прав ментора делает:

```sql
USING (
  student_id = auth.uid()::text
  OR is_admin()
  OR public.is_mentor_for(student_id::uuid)  -- ← здесь cast
)
```

Postgres на каждой строке таблицы пытается привести `student_id::uuid`. На строках с `'u-st-1'` cast падает с:

```
ERROR: invalid input syntax for type uuid: "u-st-1"
```

**Эта ошибка пропагирует наружу как ошибка всего SQL-запроса**. PostgREST возвращает 500/400, фронт получает rejected promise.

Дополнительный мультипликатор: `PvlPrototypeApp` использует `Promise.all` для batch-инициализации нескольких PVL-таблиц. Один rejected → все остальные результаты теряются → кэш `pvlMockApi` остаётся пустым → mentor view рендерит пустоту. См. **BUG-001** в backlog.

## Почему пропустили

Три причины наслоились:

**1. Неверная ментальная модель «fail-closed».**
В RUNBOOK 1.1 при первом написании я (стратег) написала: «cast падает → строка не проходит политику → fail-closed (битые строки невидимы, остальные видны)». Это **неверно**. Postgres при ошибке в RLS-предикате не «пропускает строку как false», а **ломает запрос целиком**. Это базовый факт SQL-семантики, который я недоучитывала, когда писала шаблон B (фаза 10.2 миграции SEC-001).

**2. Smoke-тесты в фазе 15 проходили под `gen_user`.**
В фазе 15 (smoke-тесты после миграции) я писала запросы вроде:

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT count(*) FROM public.pvl_students;
ROLLBACK;
```

Но без явного `request.jwt.claim.sub` и без живых данных в `auth.uid()`. Под gen_user (owner) сработал owner-bypass — RLS не оценивалась — никаких cast-ошибок не было видно. Реальная ошибка вылезла только под живым JWT после открытия Caddy.

**3. Тестовые данные в проде.**
В `pvl_student_questions` лежали seed/smoke-строки от 2026-04-09 (префиксы `smoke_q_`, `ui_q_`, `q-...-...`) — артефакты разработческих тестов с невалидными `student_id`. В проде их быть не должно, но никто их не зачищал. После включения RLS они и стали миной.

## Как починили

**Hotfix (2026-05-03 ~01:35 МСК):**

```sql
DELETE FROM public.pvl_student_questions WHERE student_id = 'u-st-1';
-- 5 rows
```

Все 5 строк подтверждены как тестовые: содержимое `«Smoke check»` / `«UI smoke»` от 2026-04-09. После DELETE'а под ментор-uid SELECT на `pvl_student_questions` возвращает 0 без error, batch-fetch на фронте проходит.

EXEC-лог: `docs/EXEC_2026-05-02_etap5_post_smoke_fix1_pvl_student_questions.md`.

**Долгосрочный фикс — CLEAN-007** (поднят с P3 → P2 после этого инцидента): миграция колонки `pvl_student_questions.student_id` с TEXT на UUID + FK на `pvl_students(id)`. Это:

- Гарантирует, что в колонку нельзя положить невалидный UUID (типобезопасность).
- Убирает необходимость cast в RLS-политике вообще.
- Удаляет целый класс «невидимых мин».

**Защитный fallback (если CLEAN-007 не сразу) — обновить RLS-политику с regex pre-check перед cast:**

```sql
USING (
  student_id = auth.uid()::text
  OR is_admin()
  OR (
    student_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.is_mentor_for(student_id::uuid)
  )
)
```

Минус: битые строки становятся невидимы для UI (что и есть истинный fail-closed), но **не валят запрос**. Не применено сейчас — пошли по простому DELETE'у.

## Что проверить в будущем

**Перед включением RLS на любой таблице с TEXT-id:**

1. Проверить, что **все существующие значения** в id-колонках, которые будут cast'иться в политике, проходят cast без ошибки:
   ```sql
   SELECT id, student_id
   FROM public.<table>
   WHERE NOT student_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
   ```
   Если что-то возвращается — сначала зачистить или мигрировать в UUID, потом включать RLS.

2. **Smoke-тесты RLS гонять под живым JWT, а не только `SET ROLE authenticated`** под gen_user. `SET LOCAL request.jwt.claim.sub TO '<реальный_user_uuid>'` — минимум. Лучше — настоящий curl с Bearer-токеном на staging.

3. Помнить: **ошибка в RLS-предикате — это ошибка всего запроса**, не «строка невидима». Это касается:
   - cast (`::uuid`, `::int` и т.п.)
   - division by zero
   - null-arithmetic в строгих контекстах
   - вызовов функций, которые могут throw

4. **Frontend паттерны для batch-fetch.** Если фронт делает `Promise.all` для нескольких независимых API-вызовов — один rejected ломает все. Заменить на `Promise.allSettled` + per-result handling. Применили этот паттерн в `App.jsx init()` в фазе 4 SEC-001 (через `loadAndApplyInitialData`), но в `PvlPrototypeApp` ещё нет — это BUG-001 в backlog.

5. **Тестовые/seed-данные с маркерными префиксами не должны быть в проде.** Стоит ввести правило: смок-тесты создают записи с конкретным префиксом (например, `__test_`), и есть периодический cleanup. Для будущих миграций — pre-flight grep по таблицам на такие префиксы.

## Меняется в RUNBOOK

Раздел 1.1 RUNBOOK обновлён 2026-05-03:

- Симптом расширен с «студент не видит свой вопрос» до «весь PVL UI ложится при логине» (потому что cascade через `Promise.all`).
- Корректировка: «fail-closed» → «error propagates outward, ломает весь запрос».
- Добавлены: диагностика под `SET LOCAL ROLE authenticated` + `request.jwt.claim.sub`, три пути решения (DELETE / RLS regex / CLEAN-007), ссылка на этот lesson.
