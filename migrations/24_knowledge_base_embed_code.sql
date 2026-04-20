-- Migration 24: Add embed_code column to knowledge_base
-- Stores HTML iframe embed code (e.g. Kinescope) for library materials

ALTER TABLE public.knowledge_base
    ADD COLUMN IF NOT EXISTS embed_code TEXT;

COMMENT ON COLUMN public.knowledge_base.embed_code IS 'HTML iframe embed-код (Kinescope и др.) для встроенного видеоплеера в библиотеке';
