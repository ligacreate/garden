-- Напоминалка о незаполненном профиле: флаг «больше не показывать».
--
-- Храним в profiles, а НЕ в localStorage: иначе флаг слетает при смене
-- устройства/браузера и человек получает уже закрытое уведомление заново.
--
-- timestamptz, а не boolean: NULL = не закрывал, дата = когда закрыл. Стоит
-- столько же, но даёт ответ на вопрос «когда», если понадобится разбор.
--
-- Права доделывать не нужно: у profiles уже есть permissive-политика
-- profiles_update_own (UPDATE своей строки) + RESTRICTIVE-гвард
-- has_platform_access, который активный пользователь проходит.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_reminder_dismissed_at timestamptz;

COMMENT ON COLUMN public.profiles.profile_reminder_dismissed_at IS
  'Когда пользователь нажал «Больше не показывать» в напоминалке о незаполненном профиле. NULL = не закрывал. В профиле, а не в localStorage — чтобы не слетало при смене устройства.';

-- Заодно помечаем leader_about как кандидата в общую cleanup-миграцию:
-- колонка никогда не выводилась в форме профиля, поэтому пуста у 100% (44/44).
COMMENT ON COLUMN public.profiles.leader_about IS
  'DEPRECATED / кандидат в cleanup-миграцию (2026-07-23): колонка никогда не выводилась в форме профиля — пуста у 44 из 44 профилей. Не использовать и не включать в проверки заполненности. Дроп — общей cleanup-миграцией.';

-- PostgREST кэширует схему: без перезагрузки новая колонка ему не видна и
-- PATCH по ней падает с PGRST204 «column not found».
NOTIFY pgrst, 'reload schema';

-- ── Верификация ──────────────────────────────────────────────────────────────
\echo === Колонка на месте ===
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles'
  AND column_name='profile_reminder_dismissed_at';

\echo === Комментарии (флаг + deprecated leader_about) ===
SELECT a.attname AS column_name, col_description(a.attrelid, a.attnum) AS comment
FROM pg_attribute a
WHERE a.attrelid='public.profiles'::regclass
  AND a.attname IN ('profile_reminder_dismissed_at','leader_about');

\echo === Гранты authenticated на profiles: табличный UPDATE (ожидание t) ===
SELECT has_table_privilege('authenticated','public.profiles','UPDATE') AS table_level_update;

\echo === Колоночные гранты на profiles (если пусто — действует табличный, доделывать нечего) ===
SELECT column_name, privilege_type
FROM information_schema.column_privileges
WHERE table_schema='public' AND table_name='profiles' AND grantee='authenticated'
  AND privilege_type='UPDATE'
ORDER BY column_name;
