-- Add income and related stats columns to meetings table if they don't exist

-- 1. Add income column (using TEXT to allow formatting like '1000 rub', though numeric is better long term)
ALTER TABLE meetings 
ADD COLUMN IF NOT EXISTS income TEXT;

-- 2. Add other stats columns that might be missing
ALTER TABLE meetings 
ADD COLUMN IF NOT EXISTS new_guests INTEGER DEFAULT 0;

ALTER TABLE meetings 
ADD COLUMN IF NOT EXISTS guests INTEGER DEFAULT 0; -- Total guests count

-- 3. (Optional) Comment on columns
COMMENT ON COLUMN meetings.income IS 'Total income from the meeting (e.g. "5000")';
COMMENT ON COLUMN meetings.new_guests IS 'Number of new guests who attended';
