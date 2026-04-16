ALTER TABLE public.pvl_calendar_events
  ADD COLUMN IF NOT EXISTS recording_url TEXT,
  ADD COLUMN IF NOT EXISTS recap_text TEXT;

ALTER TABLE public.pvl_calendar_events
  DROP CONSTRAINT IF EXISTS pvl_calendar_events_event_type_check;

ALTER TABLE public.pvl_calendar_events
  ADD CONSTRAINT pvl_calendar_events_event_type_check
    CHECK (
      event_type IN (
        'lesson',
        'practicum',
        'practicum_done',
        'breakfast',
        'mentor_meeting',
        'live_stream',
        'lesson_release',
        'deadline',
        'other'
      )
    );
