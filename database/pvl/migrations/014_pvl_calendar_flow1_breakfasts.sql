-- Поток 1 · завтраки Лиги (апрель–май 2026, время Europe/Moscow +03).
-- Идемпотентно через legacy_key (как 005).
-- Явный id: на части деплоев INSERT...SELECT не подставляет DEFAULT gen_random_uuid() для id.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

INSERT INTO public.pvl_calendar_events (
  id,
  legacy_key,
  title,
  description,
  event_type,
  start_at,
  end_at,
  date_hint,
  visibility_role,
  cohort_id,
  is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-17-bf-bondarenko',
  'Елена Бондаренко — «Моя невероятная жизнь»',
  '',
  'breakfast',
  TIMESTAMPTZ '2026-04-17 19:00:00+03',
  TIMESTAMPTZ '2026-04-17 20:30:00+03',
  DATE '2026-04-17',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-17-bf-bondarenko'
);

INSERT INTO public.pvl_calendar_events (
  id,
  legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-21-bf-sobol',
  'Яна Соболева — «Ближе к себе» (Zoom)',
  $d$https://t.me/soboleva_yana
Если будут участницы из Петербурга, возможна отдельная очная встреча для них.$d$,
  'breakfast',
  TIMESTAMPTZ '2026-04-21 14:00:00+03',
  TIMESTAMPTZ '2026-04-21 15:00:00+03',
  DATE '2026-04-21',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-21-bf-sobol');

INSERT INTO public.pvl_calendar_events (
  id,
  legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-23-bf-gromova',
  'Юлия Громова — «Яркая, как свет» (Яндекс Телемост)',
  'https://t.me/gromovayuliya',
  'breakfast',
  TIMESTAMPTZ '2026-04-23 11:00:00+03',
  TIMESTAMPTZ '2026-04-23 12:00:00+03',
  DATE '2026-04-23',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-23-bf-gromova');

INSERT INTO public.pvl_calendar_events (
  id,
  legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-23-bf-sobol-repeat',
  'Яна Соболева — «Ближе к себе» (повтор, Zoom)',
  'https://t.me/soboleva_yana',
  'breakfast',
  TIMESTAMPTZ '2026-04-23 11:00:00+03',
  TIMESTAMPTZ '2026-04-23 12:00:00+03',
  DATE '2026-04-23',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-23-bf-sobol-repeat');

INSERT INTO public.pvl_calendar_events (
  id,
  legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-25-bf-bardina',
  'Мария Бардина — «Утренние страницы: Весенняя уборка»',
  'https://t.me/bardina_mariya',
  'breakfast',
  TIMESTAMPTZ '2026-04-25 09:00:00+03',
  TIMESTAMPTZ '2026-04-25 10:30:00+03',
  DATE '2026-04-25',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-25-bf-bardina');

INSERT INTO public.pvl_calendar_events (
  id,
  legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-25-bf-skrebeyko',
  'Ольга Скребейко — «Неслучайная случайность»',
  'https://t.me/skrebeykoolga',
  'breakfast',
  TIMESTAMPTZ '2026-04-25 19:00:00+03',
  TIMESTAMPTZ '2026-04-25 21:00:00+03',
  DATE '2026-04-25',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-25-bf-skrebeyko');

INSERT INTO public.pvl_calendar_events (
  id,
  legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-19-bf-kulish',
  'Инна Кулиш — первая встреча: «Мой год — мои правила» (19.04, 11:00)',
  $d$https://vk.com/psiholog_kulish
Первая встреча для курса. Очень жду обратную связь.$d$,
  'breakfast',
  TIMESTAMPTZ '2026-04-19 11:00:00+03',
  TIMESTAMPTZ '2026-04-19 12:30:00+03',
  DATE '2026-04-19',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-19-bf-kulish');

INSERT INTO public.pvl_calendar_events (
  id,
  legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-26-bf-kulish',
  'Инна Кулиш — вторая встреча: «Мне поздно быть идеальной» (26.04, 11:00)',
  $d$https://vk.com/psiholog_kulish
Вторая встреча для курса. Очень жду обратную связь.$d$,
  'breakfast',
  TIMESTAMPTZ '2026-04-26 11:00:00+03',
  TIMESTAMPTZ '2026-04-26 12:30:00+03',
  DATE '2026-04-26',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-26-bf-kulish');

INSERT INTO public.pvl_calendar_events (
  id,
  legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-05-02-bf-kokorina',
  'Елена Кокорина — встреча Лиги (тему сообщим позже)',
  $d$https://t.me/helen_kokorina
Встреча бесплатная; тема будет объявлена дополнительно.$d$,
  'breakfast',
  TIMESTAMPTZ '2026-05-02 11:00:00+03',
  TIMESTAMPTZ '2026-05-02 12:30:00+03',
  DATE '2026-05-02',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-05-02-bf-kokorina');

INSERT INTO public.pvl_calendar_events (
  id,
  legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-15-bf-romanova',
  'Мария Романова — «Грабли», Москва (офлайн)',
  $d$https://t.me/mari_rroma
Офлайн, кафе «Грабли» на Пушкинской. Совместный проект московских ведущих; встречи проводим по очереди.$d$,
  'breakfast',
  TIMESTAMPTZ '2026-04-15 10:00:00+03',
  TIMESTAMPTZ '2026-04-15 11:30:00+03',
  DATE '2026-04-15',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-15-bf-romanova');

INSERT INTO public.pvl_calendar_events (
  id,
  legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-22-bf-romanova',
  'Мария Романова — «Грабли», Москва (офлайн)',
  $d$https://t.me/mari_rroma
Офлайн, кафе «Грабли» на Пушкинской. Совместный проект московских ведущих; встречи проводим по очереди.$d$,
  'breakfast',
  TIMESTAMPTZ '2026-04-22 10:00:00+03',
  TIMESTAMPTZ '2026-04-22 11:30:00+03',
  DATE '2026-04-22',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-22-bf-romanova');

INSERT INTO public.pvl_calendar_events (
  id,
  legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-29-bf-romanova',
  'Мария Романова — «Грабли», Москва (офлайн)',
  $d$https://t.me/mari_rroma
Офлайн, кафе «Грабли» на Пушкинской. Совместный проект московских ведущих; встречи проводим по очереди.$d$,
  'breakfast',
  TIMESTAMPTZ '2026-04-29 10:00:00+03',
  TIMESTAMPTZ '2026-04-29 11:30:00+03',
  DATE '2026-04-29',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-04-29-bf-romanova');

INSERT INTO public.pvl_calendar_events (
  id,
  legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-05-06-bf-romanova',
  'Мария Романова — «Грабли», Москва (офлайн)',
  $d$https://t.me/mari_rroma
Офлайн, кафе «Грабли» на Пушкинской. Совместный проект московских ведущих; встречи проводим по очереди.$d$,
  'breakfast',
  TIMESTAMPTZ '2026-05-06 10:00:00+03',
  TIMESTAMPTZ '2026-05-06 11:30:00+03',
  DATE '2026-05-06',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-05-06-bf-romanova');

INSERT INTO public.pvl_calendar_events (
  id,
  legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-05-13-bf-romanova',
  'Мария Романова — «Грабли», Москва (офлайн)',
  $d$https://t.me/mari_rroma
Офлайн, кафе «Грабли» на Пушкинской. Совместный проект московских ведущих; встречи проводим по очереди.$d$,
  'breakfast',
  TIMESTAMPTZ '2026-05-13 10:00:00+03',
  TIMESTAMPTZ '2026-05-13 11:30:00+03',
  DATE '2026-05-13',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-05-13-bf-romanova');

INSERT INTO public.pvl_calendar_events (
  id,
  legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-05-20-bf-romanova',
  'Мария Романова — «Грабли», Москва (офлайн)',
  $d$https://t.me/mari_rroma
Офлайн, кафе «Грабли» на Пушкинской. Совместный проект московских ведущих; встречи проводим по очереди.$d$,
  'breakfast',
  TIMESTAMPTZ '2026-05-20 10:00:00+03',
  TIMESTAMPTZ '2026-05-20 11:30:00+03',
  DATE '2026-05-20',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-05-20-bf-romanova');

INSERT INTO public.pvl_calendar_events (
  id,
  legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-05-27-bf-romanova',
  'Мария Романова — «Грабли», Москва (офлайн)',
  $d$https://t.me/mari_rroma
Офлайн, кафе «Грабли» на Пушкинской. Совместный проект московских ведущих; встречи проводим по очереди.$d$,
  'breakfast',
  TIMESTAMPTZ '2026-05-27 10:00:00+03',
  TIMESTAMPTZ '2026-05-27 11:30:00+03',
  DATE '2026-05-27',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.pvl_calendar_events e WHERE e.legacy_key = 'flow1-2026-05-27-bf-romanova');

COMMIT;
