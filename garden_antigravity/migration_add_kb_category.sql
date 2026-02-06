-- Migration to add 'category' column to knowledge_base table for content organization
ALTER TABLE knowledge_base 
ADD COLUMN IF NOT EXISTS category TEXT;

-- Optional: Comment explaining standard values
COMMENT ON COLUMN knowledge_base.category IS 'Course or section name, e.g. "Пиши, веди, люби", "Расти", etc.';
