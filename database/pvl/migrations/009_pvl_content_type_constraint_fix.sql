-- ПВЛ: исправление CHECK-constraint для content_type.
-- Применять если на продакшн-базе нет 'checklist' и 'template' в pvl_content_items_content_type_check.
-- Причина: migration 002 менялась уже после применения к базе.
-- Результат: quiz-уроки → checklist, домашние задания → template начнут сохраняться.

BEGIN;

-- 1. Удаляем старый constraint (если есть)
ALTER TABLE public.pvl_content_items
  DROP CONSTRAINT IF EXISTS pvl_content_items_content_type_check;

-- 2. Добавляем актуальный constraint со всеми типами
ALTER TABLE public.pvl_content_items
  ADD CONSTRAINT pvl_content_items_content_type_check
    CHECK (content_type IN (
      'video', 'text', 'pdf', 'checklist', 'template', 'link', 'audio', 'fileBundle'
    ));

COMMIT;
