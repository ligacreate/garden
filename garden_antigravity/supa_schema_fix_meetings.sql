-- Run this in your Supabase SQL Editor to fix the meetings save error

ALTER TABLE meetings 
ADD COLUMN keep text,
ADD COLUMN change text;

-- Optional: Add generated column for search or simple index if needed later
-- CREATE INDEX idx_meetings_user_id ON meetings(user_id);
