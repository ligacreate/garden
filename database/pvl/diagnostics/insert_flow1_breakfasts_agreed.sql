-- Завтраки потока 1 (апрель–май 2026, Europe/Moscow +03) — согласованная версия для ручной выкладки.
-- В календаре для завтраков имеет значение только время начала; в БД end_at = start_at (колонка обязательна).
-- Условия: без завтрака 15.04; 23.04 — два параллельных формата (одинаковое время — ок);
-- Бондаренко: в описании только ссылка; повтор Яны без слова «повтор» в заголовке; Кокорина — заголовок с плейсхолдером темы.
-- Идемпотентно: INSERT ... WHERE NOT EXISTS по legacy_key (как 005/014).
-- Перед прогоном: при необходимости сначала удалите старые строки (delete_flow1_breakfast_events_by_legacy_key.sql).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

-- Елена Бондаренко — в описании только ссылка
INSERT INTO public.pvl_calendar_events (
  id, legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-17-bf-bondarenko',
  'Елена Бондаренко — «Моя невероятная жизнь»',
  'https://t.me/Soleilbo',
  'breakfast',
  TIMESTAMPTZ '2026-04-17 19:00:00+03',
  TIMESTAMPTZ '2026-04-17 19:00:00+03',
  DATE '2026-04-17',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-17-bf-bondarenko');

INSERT INTO public.pvl_calendar_events (
  id, legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-19-bf-kulish',
  'Инна Кулиш — «Мой год — мои правила»',
  $d$https://vk.com/psiholog_kulish
Встреча для курса. Очень жду обратную связь.$d$,
  'breakfast',
  TIMESTAMPTZ '2026-04-19 11:00:00+03',
  TIMESTAMPTZ '2026-04-19 11:00:00+03',
  DATE '2026-04-19',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-19-bf-kulish');

INSERT INTO public.pvl_calendar_events (
  id, legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-21-bf-sobol',
  'Яна Соболева — «Ближе к себе»',
  $d$https://t.me/soboleva_yana
Если будут участницы из Петербурга, возможна отдельная очная встреча для них.$d$,
  'breakfast',
  TIMESTAMPTZ '2026-04-21 14:00:00+03',
  TIMESTAMPTZ '2026-04-21 14:00:00+03',
  DATE '2026-04-21',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-21-bf-sobol');

INSERT INTO public.pvl_calendar_events (
  id, legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-22-bf-romanova',
  'Мария Романова — «Грабли», Москва',
  $d$https://t.me/mari_rroma
Офлайн, кафе «Грабли» на Пушкинской. Совместный проект московских ведущих; встречи проводим по очереди.$d$,
  'breakfast',
  TIMESTAMPTZ '2026-04-22 10:00:00+03',
  TIMESTAMPTZ '2026-04-22 10:00:00+03',
  DATE '2026-04-22',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-22-bf-romanova');

INSERT INTO public.pvl_calendar_events (
  id, legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-23-bf-gromova',
  'Юлия Громова — «Яркая, как свет»',
  'https://t.me/gromovayuliya',
  'breakfast',
  TIMESTAMPTZ '2026-04-23 11:00:00+03',
  TIMESTAMPTZ '2026-04-23 11:00:00+03',
  DATE '2026-04-23',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-23-bf-gromova');

-- Параллельный слот с Громовой; в заголовке без слова «повтор» (legacy_key прежний для идемпотентности)
INSERT INTO public.pvl_calendar_events (
  id, legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-23-bf-sobol-repeat',
  'Яна Соболева — «Ближе к себе»',
  'https://t.me/soboleva_yana',
  'breakfast',
  TIMESTAMPTZ '2026-04-23 11:00:00+03',
  TIMESTAMPTZ '2026-04-23 11:00:00+03',
  DATE '2026-04-23',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-23-bf-sobol-repeat');

INSERT INTO public.pvl_calendar_events (
  id, legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-25-bf-bardina',
  'Мария Бардина — «Утренние страницы: Весенняя уборка»',
  'https://t.me/bardina_mariya',
  'breakfast',
  TIMESTAMPTZ '2026-04-25 09:00:00+03',
  TIMESTAMPTZ '2026-04-25 09:00:00+03',
  DATE '2026-04-25',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-25-bf-bardina');

INSERT INTO public.pvl_calendar_events (
  id, legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-25-bf-skrebeyko',
  'Ольга Скребейко — «Неслучайная случайность»',
  'https://t.me/skrebeykoolga',
  'breakfast',
  TIMESTAMPTZ '2026-04-25 19:00:00+03',
  TIMESTAMPTZ '2026-04-25 19:00:00+03',
  DATE '2026-04-25',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-25-bf-skrebeyko');

INSERT INTO public.pvl_calendar_events (
  id, legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-26-bf-kulish',
  'Инна Кулиш — «Мне поздно быть идеальной»',
  $d$https://vk.com/psiholog_kulish
Встреча для курса. Очень жду обратную связь.$d$,
  'breakfast',
  TIMESTAMPTZ '2026-04-26 11:00:00+03',
  TIMESTAMPTZ '2026-04-26 11:00:00+03',
  DATE '2026-04-26',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-26-bf-kulish');

INSERT INTO public.pvl_calendar_events (
  id, legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-29-bf-romanova',
  'Мария Романова — «Грабли», Москва',
  $d$https://t.me/mari_rroma
Офлайн, кафе «Грабли» на Пушкинской. Совместный проект московских ведущих; встречи проводим по очереди.$d$,
  'breakfast',
  TIMESTAMPTZ '2026-04-29 10:00:00+03',
  TIMESTAMPTZ '2026-04-29 10:00:00+03',
  DATE '2026-04-29',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-29-bf-romanova');

INSERT INTO public.pvl_calendar_events (
  id, legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-05-02-bf-kokorina',
  'Елена Кокорина — (тему сообщим позже)',
  $d$https://t.me/helen_kokorina
Встреча бесплатная; тема будет объявлена дополнительно.$d$,
  'breakfast',
  TIMESTAMPTZ '2026-05-02 11:00:00+03',
  TIMESTAMPTZ '2026-05-02 11:00:00+03',
  DATE '2026-05-02',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-05-02-bf-kokorina');

INSERT INTO public.pvl_calendar_events (
  id, legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-05-06-bf-romanova',
  'Мария Романова — «Грабли», Москва',
  $d$https://t.me/mari_rroma
Офлайн, кафе «Грабли» на Пушкинской. Совместный проект московских ведущих; встречи проводим по очереди.$d$,
  'breakfast',
  TIMESTAMPTZ '2026-05-06 10:00:00+03',
  TIMESTAMPTZ '2026-05-06 10:00:00+03',
  DATE '2026-05-06',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-05-06-bf-romanova');

INSERT INTO public.pvl_calendar_events (
  id, legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-05-13-bf-romanova',
  'Мария Романова — «Грабли», Москва',
  $d$https://t.me/mari_rroma
Офлайн, кафе «Грабли» на Пушкинской. Совместный проект московских ведущих; встречи проводим по очереди.$d$,
  'breakfast',
  TIMESTAMPTZ '2026-05-13 10:00:00+03',
  TIMESTAMPTZ '2026-05-13 10:00:00+03',
  DATE '2026-05-13',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-05-13-bf-romanova');

INSERT INTO public.pvl_calendar_events (
  id, legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-05-20-bf-romanova',
  'Мария Романова — «Грабли», Москва',
  $d$https://t.me/mari_rroma
Офлайн, кафе «Грабли» на Пушкинской. Совместный проект московских ведущих; встречи проводим по очереди.$d$,
  'breakfast',
  TIMESTAMPTZ '2026-05-20 10:00:00+03',
  TIMESTAMPTZ '2026-05-20 10:00:00+03',
  DATE '2026-05-20',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-05-20-bf-romanova');

INSERT INTO public.pvl_calendar_events (
  id, legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-05-27-bf-romanova',
  'Мария Романова — «Грабли», Москва',
  $d$https://t.me/mari_rroma
Офлайн, кафе «Грабли» на Пушкинской. Совместный проект московских ведущих; встречи проводим по очереди.$d$,
  'breakfast',
  TIMESTAMPTZ '2026-05-27 10:00:00+03',
  TIMESTAMPTZ '2026-05-27 10:00:00+03',
  DATE '2026-05-27',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-05-27-bf-romanova');

COMMIT;
