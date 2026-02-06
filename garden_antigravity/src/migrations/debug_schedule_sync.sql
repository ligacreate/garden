-- Debug Script: Check why meetings aren't syncing

-- 1. Ensure Public Read Access is definitely ON for events table
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read events check" ON public.events;
CREATE POLICY "Public read events check" ON public.events FOR SELECT USING (true);

-- 2. Check Sync Status
-- Run this query to see if meetings are actually in the events table
SELECT 
    m.id as meeting_id, 
    m.title as meeting_title, 
    m.city as meeting_city,
    m.date as meeting_date, 
    m.is_public, 
    e.id as event_id, 
    e.title as event_title, 
    e.date as event_date,
    e.city as event_city 
FROM public.meetings m
LEFT JOIN public.events e ON e.garden_id = m.id
WHERE m.is_public = true
ORDER BY m.id DESC;

-- If 'event_id' is NULL for your meeting, try editing and saving the meeting again in the Garden app.
-- If 'event_id' shows up here but not in the Schedule App, check the 'event_city' column matches the Schedule App tabs.
