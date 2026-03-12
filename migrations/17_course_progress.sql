-- Course progress: хранит пройденные уроки для каждого пользователя (стажёры, ведущие)
-- Нужно для кнопки «Отметить как пройденное» в библиотеке

CREATE TABLE IF NOT EXISTS public.course_progress (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    material_id TEXT NOT NULL,
    course_title TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, material_id, course_title)
);

CREATE INDEX IF NOT EXISTS course_progress_user_course_idx ON public.course_progress (user_id, course_title);

ALTER TABLE public.course_progress ENABLE ROW LEVEL SECURITY;

-- Пользователь видит только свой прогресс
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'course_progress' AND policyname = 'course_progress_select_own'
  ) THEN
    CREATE POLICY course_progress_select_own ON public.course_progress
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'course_progress' AND policyname = 'course_progress_insert_own'
  ) THEN
    CREATE POLICY course_progress_insert_own ON public.course_progress
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
