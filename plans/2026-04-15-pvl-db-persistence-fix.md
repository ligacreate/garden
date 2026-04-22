# ПВЛ: Исправление сохранения материалов и менторских привязок

**Дата:** 2026-04-15  
**Проблема:** После обновления страницы (F5) исчезают:
1. Материалы, загруженные вручную через «Материалы курса»
2. Привязка ментор ↔ менти в разделе «Ученицы»

---

## Диагноз: почему не работает

### Архитектура хранения

```
Действие пользователя
  ↓
pvlMockApi.js (in-memory db)
  ↓ (при isEnabled())
pvlPostgrestApi.js → PostgREST → PostgreSQL на Timeweb
  ↑ (при загрузке страницы)
syncPvlRuntimeFromDb() + hydrateGardenMentorAssignmentsFromDb()
```

При F5 `db` пересоздаётся из seed — без данных из БД. Если sync провален, данные потеряны.

### Цепочка сохранения материалов

1. `createContentItem()` → `pvlPostgrestApi.upsertContentItem()` → POST `/pvl_content_items`
2. При загрузке: `syncPvlRuntimeFromDb()` → `listContentItems()` → GET `/pvl_content_items`

### Цепочка сохранения менторской привязки

1. `assignStudentMentor()` → `persistGardenMentorLink()` → `upsertGardenMentorLink()` → POST `/pvl_garden_mentor_links`
2. При загрузке: `hydrateGardenMentorAssignmentsFromDb()` → `listGardenMentorLinksByStudentIds()` → GET `/pvl_garden_mentor_links`

### Возможные причины поломки (в порядке вероятности)

| # | Причина | Как проверить |
|---|---------|---------------|
| 1 | Миграция 007 не выполнена → таблица `pvl_garden_mentor_links` не создана | SQL-запрос на Timeweb |
| 2 | Миграция 004 не выполнена → нет колонок `order_index`, `lesson_video_url` и др. → INSERT падает с ошибкой схемы | SQL-запрос на Timeweb |
| 3 | PostgREST не имеет прав на WRITE (RLS или GRANT) → INSERT/PATCH возвращает 401/403 | Браузер → DevTools → Network |
| 4 | Токен не передаётся при запросе → PostgREST отклоняет как анонимный | Браузер → DevTools → Network → Headers |
| 5 | Таблицы есть, но RLS блокирует GET → `syncPvlRuntimeFromDb` возвращает пустой массив | Браузер → DevTools → Network |

---

## Фаза 1: Диагностика в браузере [ ]

Открыть страницу ПВЛ → F12 → Console → фильтр: `PVL DB`

**Что искать:**
- `[PVL DB WRITE]` с кодом 4xx/5xx → запись не работает
- `[PVL DB FALLBACK]` → PostgREST упал, пишется fallback-лог
- `[PVL DB READ]` с кодом 4xx → чтение тоже не работает
- `[PVL DB MOCK MODE]` → `VITE_POSTGREST_URL` не задан

**Что искать в Network:**
- Открыть Network → выполнить действие (загрузить материал или назначить ментора)
- Найти POST запросы к `api.skrebeyko.ru/pvl_content_items` или `pvl_garden_mentor_links`
- Посмотреть response body — там будет текст ошибки от PostgREST

## Фаза 2: Проверка таблиц в Timeweb [ ]

Выполнить на Timeweb SQL-консоль или через pgAdmin:

```sql
-- Проверка: какие таблицы ПВЛ существуют
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'pvl_%'
ORDER BY table_name;

-- Проверка: есть ли нужные колонки в pvl_content_items
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'pvl_content_items'
ORDER BY ordinal_position;

-- Проверка: существует ли таблица mentor_links
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'pvl_garden_mentor_links'
) AS mentor_links_exists;
```

**Ожидаемый результат:** должны быть:
- `pvl_content_items` с колонками: `order_index`, `lesson_video_url`, `lesson_rutube_url`, `lesson_video_embed`, `lesson_quiz`, `homework_config`, `glossary_payload`, `library_payload`, `updated_by`
- `pvl_garden_mentor_links` с колонками: `student_id`, `mentor_id`, `updated_at`

## Фаза 3: Применение недостающих миграций [ ]

Если таблиц нет — применить в порядке:

1. `database/pvl/migrations/002_pvl_runtime_content.sql` — основные таблицы контента
2. `database/pvl/migrations/004_pvl_content_items_lesson_fields.sql` — доп. поля контента
3. `database/pvl/migrations/007_pvl_garden_mentor_links.sql` — таблица менторских привязок

**ВАЖНО:** Перед применением проверить, что схема совпадает. Если `pvl_content_items` уже есть, но без `order_index` — достаточно только 004 и 007.

## Фаза 4: Проверка прав PostgREST [ ]

Если таблицы есть, но запись всё равно не работает — проблема в правах:

```sql
-- Проверить GRANT на PostgREST-роль (обычно 'authenticator' или 'anon' или 'web_anon')
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name IN ('pvl_content_items', 'pvl_garden_mentor_links')
  AND table_schema = 'public';

-- Дать права на запись (замени 'web_anon' на нужную роль)
GRANT SELECT, INSERT, UPDATE, DELETE ON pvl_content_items TO web_anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON pvl_garden_mentor_links TO web_anon;
```

## Фаза 5: Верификация после исправления [ ]

1. Открыть страницу ПВЛ → Материалы курса → добавить материал
2. Открыть DevTools → Network → убедиться POST к `/pvl_content_items` вернул 201
3. Обновить страницу (F5)
4. Проверить — материал присутствует

Аналогично для ментора:
1. Ученицы → назначить ментора
2. Network → POST к `/pvl_garden_mentor_links` → 201
3. F5 → ментор сохранился

---

## Фаза 6: Исправление CHECK-constraint для content_type [x]

**Проблема:** тесты (quiz) и домашние задания (homework) не сохраняются/не публикуются.
Ошибка: `pvl_content_items_content_type_check violates check constraint`.

**Причина:** Продакшн-база данных содержит СТАРУЮ версию CHECK-constraint, в которой нет значений 'checklist' и 'template'. Миграция 002 была обновлена (добавлены эти значения), но не была повторно применена к существующей БД.

JS-нормализация корректна: quiz → checklist, homework → template. Проблема только в БД.

**Исправление:** создана миграция `database/pvl/migrations/009_pvl_content_type_constraint_fix.sql`.
Применить на Timeweb SQL-консоли:
1. Открыть `database/pvl/migrations/009_pvl_content_type_constraint_fix.sql`
2. Скопировать и выполнить в SQL-консоли Timeweb
3. Проверить через `database/pvl/diagnostics/check_pvl_schema.sql` (раздел 5) — в `check_clause` должны появиться 'checklist' и 'template'

---

---

## Фаза 7: Исправление FK-ошибки при сохранении домашних заданий [x]

**Проблема (2026-04-16):** домашние задания и квизы не сохраняются при обновлении страницы.

**Диагноз:** `pvl_student_homework_submissions.student_id` и `pvl_student_course_progress.student_id` — внешние ключи на `pvl_students.id`. Реальные Garden-пользователи (с Garden UUID) **никогда не вставлялись** в `pvl_students`. Поэтому INSERT в submission-таблицы падал с FK-нарушением, ошибка поглощалась `fireAndForget`, данные пропадали.

**Исправление (код):**
- `pvlPostgrestApi.js`: добавлен метод `upsertPvlStudent(payload)` — upsert по PK через PostgREST
- `pvlMockApi.js`: добавлены `pvlStudentSyncedToDb` (Set-кэш) и `ensurePvlStudentInDb(userId)`
- `ensurePvlStudentInDb` вызывается в начале `fireAndForget` в `persistSubmissionToDb` и `persistTrackerProgressToDb`
- Квизы/тесты: `usePlatformStepChecklist.toggleItem` уже вызывал `saveTrackerChecklist` → `persistTrackerProgressToDb` — теперь работает с FK-фиксом

**Исправление (БД):** создана миграция `012_pvl_student_upsert_permissions.sql` — выдаёт GRANT на INSERT/UPDATE в `pvl_students` для роли `web_anon`.

**Важно:** применить миграцию 012 на продакшн (Timeweb SQL-консоль), заменив `web_anon` на реальную роль PostgREST.

---

## Фаза 8: Прогресс трекера не сохраняется в БД (2026-04-22) [x]

**Проблема:** Все ученицы ПВЛ жалуются — прогресс трекера (галочки) исчезает при смене устройства или очистке браузера.

**Диагноз:** `pvl_course_weeks` строки вставлены сидом (`001_demo_minimal.sql`) БЕЗ `external_key`. Поле добавлено миграцией 003, но не заполнено для существующих строк. В `ensureDbTrackerHomeworkStructure` код делал:
```js
const byWeekExternal = new Map((weekRows || []).map((r) => [String(r.external_key || ''), r]));
if (byWeekExternal.size === 0) { // ← ОШИБКА: size === 1, т.к. все null → ''
```
Map имел размер 1 (все null-значения схлопывались в ключ `''`), условие не срабатывало, `sqlWeekIdByMockWeekId` оставалась пустой. `persistTrackerProgressToDb` находил `sqlWeekId = null` и уходил без записи.

**Исправление (код):**
- `pvlMockApi.js`: исправлено условие — теперь фильтрует null external_key, проверяет каких недель не хватает
- `pvlPostgrestApi.js`: добавлен `on_conflict: 'week_number'` в `upsertCourseWeek` (иначе дублирование)
- `PvlStudentTrackerView.jsx`: в `usePlatformStepChecklist` при загрузке авто-синхронизирует прогресс из localStorage в БД, если в БД меньше галочек (переносит накопленный прогресс)

**Исправление (БД):** создана миграция `016_pvl_weeks_external_key_backfill.sql`:
```sql
UPDATE public.pvl_course_weeks SET external_key = 'cohort-2026-1-w' || week_number WHERE external_key IS NULL;
```

**КРИТИЧЕСКИ ВАЖНО:** применить `016_pvl_weeks_external_key_backfill.sql` на продакшн Timeweb прямо сейчас.

---

## Итог

- [x] Частично (что осталось: применить миграции 007/009/012/016 на продакшн)

**Корневая причина 1 (контент):** CHECK constraint `pvl_content_items_content_type_check` в продакшн-БД не содержит 'checklist' и 'template' — эти значения были добавлены в migration 002 уже после первого применения.

**Корневая причина 2 (ментор слетает):** Таблица `pvl_garden_mentor_links` скорее всего не создана в production (миграция 007 не применена). Ошибка сохранения ранее проглатывалась → UI не знал о сбое. Исправлено: `persistGardenMentorLink` теперь пробрасывает ошибку → пользователь увидит alert при неудачной записи.

**Корневая причина 3 (стажеры в менти):** После коммита `a6424ce` стажеры (intern) классифицировались как `gardenRole: 'student'` и попадали в admin-список учениц. Исправлено: теперь `gardenRole: 'intern'`, `getAdminStudents` их фильтрует, но в studentProfiles они остаются (доступ к урокам не нарушен).

**Корневая причина 4 (трекер теряет прогресс):** `pvl_course_weeks.external_key = NULL` для всех продакшн-строк → `sqlWeekIdByMockWeekId` пустая → прогресс трекера никогда не писался в БД. Хранился только в localStorage. Исправлено: миграция 016 + код-фикс + авто-синхронизация при загрузке.
