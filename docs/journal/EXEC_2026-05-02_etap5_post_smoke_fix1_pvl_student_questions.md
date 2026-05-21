---
title: SEC-001 пост-smoke fix #1 — pvl_student_questions seed cleanup
type: execution-log
phase: "etap-5-post-smoke-fix-1"
created: 2026-05-03
status: ✅ COMPLETED
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
prev_phase: docs/EXEC_2026-05-02_etap5_caddy_open.md
related_lessons: docs/RUNBOOK_garden.md (раздел 1.1 — нуждается в апдейте)
related_backlog: CLEAN-007 (миграция таблицы на uuid)
---

# Пост-smoke fix #1: `pvl_student_questions` seed cleanup

**Время:** 2026-05-03 ≈ 02:50 MSK.
**Триггер:** Live smoke 15.7. Ольга залогинила Настин фиксик (`zobyshka@gmail.com`, role=mentor) — у пользователя в браузере проблемы с видимостью студентов / PVL-функционалом.
**Найденная корневая причина:** **не RLS-логика и не привязка ментора**, а seed-данные в `pvl_student_questions`.

---

## Симптом

Настин фиксик (mentor, `1b10d2ef-8504-4778-9b7b-5b04b24f8751`) при логине в браузер не получает корректный набор данных для PVL-функционала.

## Диагностика (read-only под gen_user)

### 1. Кто такой `zobyshka@gmail.com`

```
                  id                  |       email        |  role  |     name
--------------------------------------+--------------------+--------+---------------
 1b10d2ef-8504-4778-9b7b-5b04b24f8751 | zobyshka@gmail.com | mentor | Настин фиксик
```

✅ Профиль есть, role=mentor.

### 2-3. Связки в `pvl_garden_mentor_links`

| Как ментор | Как студент |
|---|---|
| 4 | 0 |

✅ В таблице 4 строки, где она `mentor_id`. Привязка корректная.

### 4. Список её студентов

| student_id | email | name | role |
|---|---|---|---|
| `037603f7-…` | `https://t.me/fedotova_elen` | Лена Ф | applicant |
| `49c267b1-…` | `yaroschuk@creativemarket.ru` | Екатерина Салама | applicant |
| `3746da91-…` | `gatikoeva.rv@gmail.com` | Рита | applicant |
| `1085e06d-…` | `viktorovna7286@gmail.com` | Настина фея | applicant |

### 5. Симуляция RLS под её JWT (через `set_config('request.jwt.claim.sub', mentor_id, true)` + `SET LOCAL ROLE authenticated`)

| Таблица | Видит | Ожидание | ✅ |
|---|---|---|---|
| `pvl_students` | 4 | 4 (через `is_mentor_for(id)`) | ✅ |
| `pvl_garden_mentor_links` | 4 | 4 | ✅ |
| `pvl_student_homework_submissions` | 7 | ДЗ её 4 студентов | ✅ |
| `profiles` | 59 | все (open policy) | ✅ |
| `pvl_audit_log` | 0 | только админ | ✅ |
| `pvl_course_weeks` | 13 | контент курса (template A — все) | ✅ |
| `pvl_homework_items` | 19 | то же | ✅ |
| `pvl_student_certification_scores` | 0 | у её студентов нет | ✅ |
| `pvl_student_disputes` | 0 | у её студентов нет | ✅ |
| **`pvl_student_questions`** | **❌ ERROR** | `invalid input syntax for type uuid: "u-st-1"` | 🔴 |

### Корневая причина

```sql
-- Под gen_user (owner-bypass, видит всё):
SELECT id, student_id FROM public.pvl_student_questions;
```

```
          id           | student_id
-----------------------+------------
 smoke_q_1775732420829 | u-st-1
 ui_q_1775733016205    | u-st-1
 q-1775743555194-9536  | u-st-1
 q-1775748084535-1785  | u-st-1
 q-1775748337541-8935  | u-st-1
(5 rows)
```

**Все 5 строк в таблице — seed/QA-тесты от 2026-04-09** (3+ недели до начала SEC-001). Поле `student_id` имеет тип `text` (legacy от Supabase), и в этих 5 строках содержит `'u-st-1'` — placeholder, не валидный UUID.

RLS-политика `pvl_student_questions_select_own_or_mentor_or_admin` делает cast `student_id::uuid` для передачи в `is_mentor_for(uuid)`. Cast `'u-st-1'::uuid` падает с `invalid input syntax for type uuid`. Под `authenticated` ошибка пропагирует наверх — весь `SELECT count(*) FROM pvl_student_questions` обваливается.

📝 **Замечание про runbook 1.1:** документ утверждает «Postgres интерпретирует такую ошибку как ‘строка не прошла политику’ — fail-closed». Реальное поведение: error пропагирует. Runbook нужно обновить.

---

## Why This Broke Live Smoke (предполагаемо)

В фронте `views/PvlPrototypeApp.jsx` при логине ментора, по всей видимости, делается batch-запрос на несколько PVL-таблиц для подгрузки рабочей панели. Если в этом батче есть `GET /pvl_student_questions` (например, виджет «вопросы моих студентов»), запрос возвращает 500 от PostgREST. Один проблемный запрос валит общую инициализацию вью либо отображает generic-error.

После SEC-001 с RLS под `authenticated` это стало видимым; до SEC-001 фронт работал под `gen_user` (owner-bypass) и проблему не замечал.

---

## Fix

### SQL

```sql
BEGIN;

-- Pre-DELETE: что будет удалено
SELECT id, student_id, left(coalesce(question, question_text, '<empty>'), 60) AS preview, created_at
FROM public.pvl_student_questions
WHERE student_id = 'u-st-1'
ORDER BY created_at;

DELETE FROM public.pvl_student_questions WHERE student_id = 'u-st-1';

-- Post-DELETE: count
SELECT count(*) AS remaining FROM public.pvl_student_questions;

COMMIT;
```

### Output

```
=== Pre-DELETE: 5 строк ===
          id           | student_id |             preview             |          created_at
-----------------------+------------+---------------------------------+-------------------------------
 smoke_q_1775732420829 | u-st-1     | Smoke student question          | 2026-04-09 14:00:21.513386+03
 ui_q_1775733016205    | u-st-1     | UI smoke question               | 2026-04-09 14:10:17.193049+03
 q-1775743555194-9536  | u-st-1     | Smoke question 1775743555194    | 2026-04-09 17:05:56.478153+03
 q-1775748084535-1785  | u-st-1     | UI Smoke question 1775748084535 | 2026-04-09 18:21:25.531959+03
 q-1775748337541-8935  | u-st-1     | UI Smoke question 1775748337541 | 2026-04-09 18:25:38.597464+03

=== DELETE 5 ===

=== remaining = 0 ===

COMMIT
```

### Verify под mentor-JWT

```sql
BEGIN;
SELECT set_config('request.jwt.claim.sub', '1b10d2ef-8504-4778-9b7b-5b04b24f8751', true);
SET LOCAL ROLE authenticated;

SELECT count(*) FROM public.pvl_student_questions;     -- 0 ✅ (раньше: ERROR)
SELECT count(*) FROM public.pvl_students;              -- 4 ✅ (контроль — не сломали)
ROLLBACK;
```

✅ Под `authenticated` для Настин фиксик `pvl_student_questions` теперь возвращает 0 без error. Видимость студентов (4) не изменилась.

---

## Что это значит для прод-фронта

После DELETE:
- Любой залогиненный mentor/student может читать `pvl_student_questions` без падения.
- Таблица пуста — это естественное состояние для новой фичи (вопросы появятся, когда студенты их зададут).
- Когда придёт первый реальный INSERT через PostgREST под authenticated с правильным JWT, `student_id` должен быть валидным UUID (фронт пишет `auth.uid()::text`, что соответствует UUID-shape строки).

⚠ **Проверить отдельно (related task):** в `services/pvlPostgrestApi.js` или вью `PvlPrototypeApp.jsx` — что INSERT в `pvl_student_questions` пишет валидный UUID-shape в `student_id`. Если там пишется не UUID — баг повторится. Это часть **CLEAN-007** в backlog.

---

## Что нужно обновить

1. **`docs/RUNBOOK_garden.md` раздел 1.1** — текущая формулировка про «fail-closed» неверна. Реально error пропагирует наверх, и diagnostic под gen_user вместе с DELETE — единственный способ. Добавлю «UPDATE 2026-05-03: реально error не fail-closed, а пропагирует — пользователь видит 500/400».

2. **`plans/BACKLOG.md` CLEAN-007** — поднять приоритет с P3 до P2 как «всплывало в проде после SEC-001, требует решения до того, как пользователи начнут массово писать вопросы». Также — добавить в DOD проверку INSERT-формы.

3. **Backlog: BUG-NEW (создать)** — «Frontend: возможный fragile batch-init в `PvlPrototypeApp.jsx` валит весь компонент при single-endpoint failure». Связано с пост-смок: одна 500-ка по `pvl_student_questions` вероятно ломала весь PVL-вью у Настин фиксик. Решение — обернуть init в Promise.allSettled (как мы сделали в `App.jsx`) либо разнести запросы по lazy-load.

---

## Что осталось проверить с Ольгой

После этого fix'а Настин фиксик должен:
1. Полностью разлогиниться (Cmd+Shift+R / очистить localStorage если фронт-патч ещё не задеплоен в её сессии).
2. Зайти в браузер заново на liga.skrebeyko.ru.
3. Проверить — видит ли своих 4 студентов, открывается ли её панель ментора, можно ли проверить ДЗ.

Если PVL-вью всё равно деградирует — вероятно второй симптом, не связанный с этой строкой; смотрим DevTools Console + Network.

---

## Статус

✅ **Fix #1 ЗАКРЫТ.** Seed-данные удалены, RLS под mentor-JWT работает. Live smoke 15.7 продолжается.
