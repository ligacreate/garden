-- ДИАГНОСТИКА: проверка схемы ПВЛ на Timeweb
-- Запускать в SQL-консоли Timeweb или pgAdmin
-- Результаты покажут, какие таблицы и колонки есть

-- 1. Все таблицы ПВЛ
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'pvl_%'
ORDER BY table_name;

-- 2. Колонки pvl_content_items
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'pvl_content_items'
ORDER BY ordinal_position;

-- 3. Наличие критичных таблиц
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pvl_content_items'
  ) AS content_items_exists,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pvl_garden_mentor_links'
  ) AS mentor_links_exists,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pvl_content_items'
      AND column_name = 'order_index'
  ) AS order_index_column_exists,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pvl_content_items'
      AND column_name = 'lesson_video_url'
  ) AS lesson_fields_exist;

-- 4. Права на таблицы (замени 'web_anon' на роль своего PostgREST)
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_name IN ('pvl_content_items', 'pvl_garden_mentor_links', 'pvl_content_placements')
  AND table_schema = 'public'
ORDER BY table_name, grantee;

-- 5. Проверка CHECK constraint для content_type (ключевая!)
-- Если в check_clause нет 'checklist' или 'template' → нужна миграция 009
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_schema = 'public'
  AND constraint_name = 'pvl_content_items_content_type_check';

-- 6. Количество записей (проверка: сохранялось ли что-то раньше)
SELECT 'pvl_content_items' AS tbl, COUNT(*) AS cnt
FROM pvl_content_items
UNION ALL
SELECT 'pvl_garden_mentor_links', COUNT(*)
FROM pvl_garden_mentor_links
UNION ALL
SELECT 'pvl_content_placements', COUNT(*)
FROM pvl_content_placements;
