-- Превентив (RLS-аудит 2026-07-23): у public.course_progress не было ни одной
-- PERMISSIVE-политики на UPDATE и DELETE — только permissive INSERT/SELECT
-- («Insert own progress» / «Read own progress») и RESTRICTIVE-гварды
-- has_platform_access. В Postgres RLS команда без permissive-политики запрещена
-- ВСЕМ (restrictive только сужает), поэтому UPDATE/DELETE тут молча затрагивали
-- 0 строк — та же дыра, что была на public.news.
--
-- Сейчас фронт в эту дыру не упирается: он делает только INSERT
-- (markCourseLessonCompleted → POST) и SELECT. Но как только появится «снять
-- отметку о прохождении» или «сбросить прогресс», оно молча не сработает и
-- покажет ложный успех. Закрываем заранее.
--
-- Область — строго «своё», зеркалим существующую пару политик этой таблицы:
-- роль public, предикат (auth.uid() = user_id). Админа намеренно НЕ добавляем:
-- на этой таблице и SELECT ограничен своим, так что админ-запись без
-- админ-чтения была бы рассинхроном. Понадобится админ-сброс прогресса —
-- заводим отдельно и вместе с SELECT.
--
-- Идемпотентно: DROP IF EXISTS + CREATE.

DROP POLICY IF EXISTS "Update own progress" ON public.course_progress;
CREATE POLICY "Update own progress"
  ON public.course_progress
  FOR UPDATE
  TO public
  USING ( auth.uid() = user_id )
  WITH CHECK ( auth.uid() = user_id );

DROP POLICY IF EXISTS "Delete own progress" ON public.course_progress;
CREATE POLICY "Delete own progress"
  ON public.course_progress
  FOR DELETE
  TO public
  USING ( auth.uid() = user_id );

-- ── Верификация ──────────────────────────────────────────────────────────────
\echo === Политики course_progress после миграции (ожидание: появились UPDATE и DELETE) ===
SELECT policyname, cmd, permissive, roles::text AS roles, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='course_progress'
ORDER BY cmd, permissive DESC;
