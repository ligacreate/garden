-- ПВЛ: поля материалов под видео/Kinescope, тесты и учительскую (PostgREST).
-- Применять после 001–003. Идемпотентно (IF NOT EXISTS).

BEGIN;

ALTER TABLE public.pvl_content_items
  ADD COLUMN IF NOT EXISTS lesson_video_url TEXT,
  ADD COLUMN IF NOT EXISTS lesson_rutube_url TEXT,
  ADD COLUMN IF NOT EXISTS lesson_video_embed TEXT,
  ADD COLUMN IF NOT EXISTS lesson_quiz JSONB,
  ADD COLUMN IF NOT EXISTS homework_config JSONB,
  ADD COLUMN IF NOT EXISTS glossary_payload JSONB,
  ADD COLUMN IF NOT EXISTS library_payload JSONB,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS order_index INT NOT NULL DEFAULT 999;

COMMENT ON COLUMN public.pvl_content_items.lesson_video_embed IS 'HTML iframe Kinescope и т.п.';
COMMENT ON COLUMN public.pvl_content_items.lesson_quiz IS 'JSON структуры теста (вопросы, порог, попытки)';

-- В 002 у событий календаря не было флага публикации; клиент шлёт is_published.
ALTER TABLE public.pvl_calendar_events
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT TRUE;

COMMIT;
