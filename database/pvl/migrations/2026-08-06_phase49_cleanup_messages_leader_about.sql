-- Фаза чистки — снос двух мёртвых сущностей.
--
-- 1. public.messages — таблица чата из прототипа CommunicationsView (миграция
--    17_create_messages_chat.sql, март 2026). Экран не дожил, во фронте к
--    таблице нет ни одного обращения: совпадения по слову «messages» в коде —
--    это ключи иконок (`iconKey: 'messages'`) и роуты (`/student/messages`)
--    прототипа ПВЛ, к базе они отношения не имеют. Внутри 4 строки, все
--    тестовые, от 17.03.2026. Содержимое выгружено в отчёт до сноса:
--    docs/_session/2026-08-06_codeexec_cleanup_deployed.md
--
-- 2. public.profiles.leader_about — колонка из 08_leader_page_fields.sql,
--    которая никогда не выводилась в форме профиля. Помечена DEPRECATED
--    2026-07-23 как кандидат в эту самую cleanup-миграцию. Пуста у 61 профиля
--    из 61 — терять нечего.
--
-- Применять как gen_user (владелец). Дроп таблицы уносит с собой её индексы,
-- политики RLS и гранты — отдельно снимать нечего.

\set ON_ERROR_STOP on

-- ─────────── ЧТО УХОДИТ (в отчёт перед сносом) ───────────
\echo === S0: содержимое public.messages ===
SELECT m.id, m.author_name, m.text, m.created_at::date AS created,
       p.name AS author_profile
  FROM public.messages m
  LEFT JOIN public.profiles p ON p.id = m.author_id
 ORDER BY m.id;

\echo === S1: непустые leader_about (ожидаем ноль строк) ===
SELECT id, name, leader_about
  FROM public.profiles
 WHERE leader_about IS NOT NULL AND btrim(leader_about) <> ''
 ORDER BY name;

-- ─────────── ПРЕДОХРАНИТЕЛЬ ───────────
-- Дропаем колонку только если она действительно пуста у всех. Появились
-- данные с момента разведки — миграция должна упасть, а не стереть их молча.
\echo === S2: предохранитель — не сносим ли непустую колонку ===
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.profiles
   WHERE leader_about IS NOT NULL AND btrim(leader_about) <> '';
  IF n > 0 THEN
    RAISE EXCEPTION 'ПРЕДОХРАНИТЕЛЬ: leader_about заполнен у % профилей — разобрать вручную, не дропать', n;
  END IF;
  RAISE NOTICE 'предохранитель чист: leader_about пуст у всех';
END $$;

BEGIN;

DROP TABLE IF EXISTS public.messages;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS leader_about;

COMMIT;

-- PostgREST держит схему в кэше: без перезагрузки он продолжит отдавать
-- отсутствующую колонку в списке и падать на обращении к ней.
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────── VERIFY (вне транзакции) ───────────────────────────
\echo
\echo === V1: таблицы messages больше нет (ожид: пусто) ===
SELECT to_regclass('public.messages') AS tbl;

\echo === V2: колонки leader_about больше нет (ожид: 0) ===
SELECT count(*) AS est FROM information_schema.columns
 WHERE table_schema='public' AND table_name='profiles' AND column_name='leader_about';

\echo === V3: соседние колонки профиля на месте (ожид: 3) ===
SELECT count(*) AS est FROM information_schema.columns
 WHERE table_schema='public' AND table_name='profiles'
   AND column_name IN ('leader_signature','leader_reviews','profile_reminder_dismissed_at');

\echo === V4: профили читаются, счёт не изменился ===
SELECT count(*) AS profiley FROM public.profiles;

\echo === V5: политик и грантов от messages не осталось (ожид: 0 и 0) ===
SELECT (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='messages') AS politik,
       (SELECT count(*) FROM information_schema.role_table_grants
         WHERE table_schema='public' AND table_name='messages') AS grantov;
