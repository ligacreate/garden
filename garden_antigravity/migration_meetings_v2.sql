-- Добавление новых полей в таблицу meetings
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS status text default 'planned';
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS new_guests int default 0;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS scenario_id text;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS fail_reason text;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS checklist jsonb default '[]'::jsonb;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS rescheduled_to bigint references meetings(id);

-- Обновление существующих записей (опционально)
UPDATE meetings SET status = 'completed' WHERE status IS NULL;
