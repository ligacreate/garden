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

## Итог

- [ ] Реализован полностью
- [ ] Частично (что осталось: ______)

**Корневая причина (заполнить после диагностики):** ___________
