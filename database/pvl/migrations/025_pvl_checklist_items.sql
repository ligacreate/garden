-- Migration 025: pvl_checklist_items — отметки трекера курса.
-- Одна строка на (студент × контент-айтем).
-- Уникальный ключ исключает конфликт устройств (как course_progress в саду).
-- Данные мигрируются из pvl_student_course_progress.payload.checkedKeys.

BEGIN;

CREATE TABLE IF NOT EXISTS pvl_checklist_items (
    id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id      uuid        NOT NULL REFERENCES pvl_students(id) ON DELETE CASCADE,
    content_item_id text        NOT NULL,   -- UUID контент-айтема (без префикса 'sid:')
    checked_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (student_id, content_item_id)
);

CREATE INDEX IF NOT EXISTS idx_pvl_checklist_items_student_id
    ON pvl_checklist_items(student_id);

ALTER TABLE pvl_checklist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pvl_checklist_items_all ON pvl_checklist_items;
CREATE POLICY pvl_checklist_items_all
    ON pvl_checklist_items
    FOR ALL
    USING (true)
    WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE
    ON pvl_checklist_items TO gen_user;

-- Миграция данных из pvl_student_course_progress.payload.checkedKeys
-- Берём все sid:-ключи, стрипаем префикс, вставляем с игнором дублей
INSERT INTO pvl_checklist_items (student_id, content_item_id)
SELECT
    p.student_id,
    substring(elem FROM 5)   -- strip 'sid:' (4 символа)
FROM pvl_student_course_progress p,
     jsonb_array_elements_text(p.payload -> 'checkedKeys') AS elem
WHERE p.payload IS NOT NULL
  AND jsonb_typeof(p.payload -> 'checkedKeys') = 'array'
  AND elem LIKE 'sid:%'
  AND length(elem) > 4
ON CONFLICT (student_id, content_item_id) DO NOTHING;

COMMIT;
