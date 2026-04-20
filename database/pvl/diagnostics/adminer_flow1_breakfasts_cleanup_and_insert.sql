-- =============================================================================
-- Adminer / psql: почистить старые завтраки потока 1 и вставить согласованный набор
-- Таблица: public.pvl_calendar_events
-- Для завтраков в календаре используется только время начала; в БД end_at = start_at.
-- Не трогает: legacy_key из миграции 005 (старт курса, вопрошание), practicum_done и прочие события.
-- Перед прогоном: по возможности бэкап или хотя бы выполните ШАГ 2 и убедитесь, что список верный.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ШАГ 1. Расширение для gen_random_uuid() (выполнить один раз, если ещё не стоит)
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- ШАГ 2. Просмотр: какие строки будут УДАЛЕНЫ (старый набор по legacy_key)
-- -----------------------------------------------------------------------------
SELECT id, legacy_key, title, event_type, start_at
FROM public.pvl_calendar_events
WHERE legacy_key IN (
  'flow1-2026-04-15-bf-romanova',
  'flow1-2026-04-17-bf-bondarenko',
  'flow1-2026-04-19-bf-kulish',
  'flow1-2026-04-21-bf-sobol',
  'flow1-2026-04-22-bf-romanova',
  'flow1-2026-04-23-bf-gromova',
  'flow1-2026-04-23-bf-sobol-repeat',
  'flow1-2026-04-23-bf-kulish-2000',
  'flow1-2026-04-25-bf-bardina',
  'flow1-2026-04-25-bf-skrebeyko',
  'flow1-2026-04-26-bf-kulish',
  'flow1-2026-04-29-bf-romanova',
  'flow1-2026-05-02-bf-kokorina',
  'flow1-2026-05-06-bf-romanova',
  'flow1-2026-05-13-bf-romanova',
  'flow1-2026-05-20-bf-romanova',
  'flow1-2026-05-27-bf-romanova'
)
ORDER BY start_at;

-- -----------------------------------------------------------------------------
-- ШАГ 3 (по желанию). Завтраки потока 2026 без legacy_key — смотреть глазами, удалять вручную по id
-- -----------------------------------------------------------------------------
-- SELECT id, legacy_key, title, start_at
-- FROM public.pvl_calendar_events
-- WHERE event_type = 'breakfast'
--   AND legacy_key IS NULL
--   AND cohort_id IN (SELECT id FROM public.pvl_cohorts WHERE year = 2026)
-- ORDER BY start_at;

-- -----------------------------------------------------------------------------
-- ШАГ 4. Удаление старого + вставка нового (одна транзакция — выполнить целиком)
-- -----------------------------------------------------------------------------
BEGIN;

DELETE FROM public.pvl_calendar_events
WHERE legacy_key IN (
  'flow1-2026-04-15-bf-romanova',
  'flow1-2026-04-17-bf-bondarenko',
  'flow1-2026-04-19-bf-kulish',
  'flow1-2026-04-21-bf-sobol',
  'flow1-2026-04-22-bf-romanova',
  'flow1-2026-04-23-bf-gromova',
  'flow1-2026-04-23-bf-sobol-repeat',
  'flow1-2026-04-23-bf-kulish-2000',
  'flow1-2026-04-25-bf-bardina',
  'flow1-2026-04-25-bf-skrebeyko',
  'flow1-2026-04-26-bf-kulish',
  'flow1-2026-04-29-bf-romanova',
  'flow1-2026-05-02-bf-kokorina',
  'flow1-2026-05-06-bf-romanova',
  'flow1-2026-05-13-bf-romanova',
  'flow1-2026-05-20-bf-romanova',
  'flow1-2026-05-27-bf-romanova'
);

-- Ниже — 16 завтраков (без 15.04), согласованные тексты; время Europe/Moscow (+03); end_at дублирует start_at.

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
  TRUE;

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
  TRUE;

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
  TRUE;

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
  TRUE;

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
  TRUE;

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
  TRUE;

INSERT INTO public.pvl_calendar_events (
  id, legacy_key, title, description, event_type, start_at, end_at, date_hint, visibility_role, cohort_id, is_published
)
SELECT
  gen_random_uuid(),
  'flow1-2026-04-23-bf-kulish-2000',
  'Инна Кулиш — «Мне поздно быть идеальной»',
  $d$https://vk.me/psiholog_kulish
Не идеальна — да, но какая?
Встреча для курса. Очень жду обратную связь.$d$,
  'breakfast',
  TIMESTAMPTZ '2026-04-23 20:00:00+03',
  TIMESTAMPTZ '2026-04-23 20:00:00+03',
  DATE '2026-04-23',
  'all',
  (SELECT c.id FROM public.pvl_cohorts c WHERE c.year = 2026 ORDER BY c.created_at ASC NULLS LAST LIMIT 1),
  TRUE;

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
  TRUE;

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
  TRUE;

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
  TRUE;

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
  TRUE;

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
  TRUE;

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
  TRUE;

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
  TRUE;

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
  TRUE;

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
  TRUE;

COMMIT;

-- -----------------------------------------------------------------------------
-- ШАГ 5. Проверка после коммита
-- -----------------------------------------------------------------------------
-- SELECT legacy_key, title, start_at, end_at FROM public.pvl_calendar_events
-- WHERE legacy_key LIKE 'flow1-%-bf-%'
-- ORDER BY start_at;

-- -----------------------------------------------------------------------------
-- ШАГ 6 (опционально). Уже лежащие в БД завтраки потока: выровнять end_at = start_at без полного DELETE/INSERT
-- -----------------------------------------------------------------------------
-- UPDATE public.pvl_calendar_events
-- SET end_at = start_at, updated_at = NOW()
-- WHERE event_type = 'breakfast' AND legacy_key LIKE 'flow1-%-bf-%';
