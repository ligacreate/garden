-- Фаза 4 — подписки: гасим накопившиеся дубли и закрываем дыру в ключе.
--
-- РЕШЕНИЕ (Оля, 2026-08-06): public.subscriptions — ЖУРНАЛ подписок, а не витрина.
-- Источник правды по доступу — profiles.paid_until; здесь копится история периодов.
-- Старые строки гасим (status='finished', ended_at), НЕ удаляем.
--
-- КОРНЕВАЯ ПРИЧИНА ДУБЛЕЙ. Ключ конфликта был (provider, provider_subscription_id),
-- но provider_subscription_id никогда не был устойчивым идентификатором: на 2026-08-06
-- в 27 строках лежит id заказа (uuid), в 19 — user_id, и НИ В ОДНОЙ настоящий id
-- подписки Продамуса (он их попросту не присылает). Ключи не совпадали, do update не
-- срабатывал — и вместо обновления строки появлялась вторая, а старая оставалась
-- active со своей просроченной датой. Дубль рождался всякий раз, когда человек платил
-- не тем способом, что в прошлый раз.
--
-- ЧТО ДЕЛАЕМ. Ключом идентичности становится сам человек: частичный уникальный индекс
-- «одна active-строка на user_id». Это единственный из трёх обсуждавшихся вариантов,
-- который чинит и межпровайдерный случай: у трёх человек из четырнадцати дубль собран
-- из prodamus + manual, и ключ (user_id, provider) их бы не поймал.
--
-- Применять как gen_user (владелец таблицы). Гранты и RLS не трогаем.

\set ON_ERROR_STOP on

-- ─────────── СНИМОК ДО (для отката: какие строки были active) ───────────
\echo === S0: строки, которые изменит миграция (запомнить перед накатом) ===
WITH ranked AS (
  SELECT s.id, s.user_id,
         row_number() OVER (PARTITION BY s.user_id
                            ORDER BY s.paid_until DESC NULLS LAST, s.id DESC) AS rn
    FROM public.subscriptions s WHERE s.status = 'active'
)
SELECT s.id, p.name, s.provider, s.paid_until::date AS row_until,
       p.paid_until::date AS profile_until,
       CASE WHEN r.rn > 1 THEN 'дубль (лишняя строка)' ELSE 'протухшая (дата в прошлом)' END AS prichina
  FROM public.subscriptions s
  JOIN ranked r ON r.id = s.id
  LEFT JOIN public.profiles p ON p.id = s.user_id
 WHERE s.status = 'active' AND (r.rn > 1 OR s.paid_until < now())
 ORDER BY prichina, p.name;

-- ─────────── ПРОВЕРКА-ПРЕДОХРАНИТЕЛЬ ───────────
-- Гасить строку человека, у которого подписка ЖИВА по profiles.paid_until, нельзя.
-- Если такие найдутся — миграция должна упасть, а не молча закрыть живой доступ.
\echo === S1: предохранитель — гасим ли мы кого-то, у кого подписка ещё жива? ===
DO $$
DECLARE n int;
BEGIN
  WITH ranked AS (
    SELECT s.id, s.user_id,
           row_number() OVER (PARTITION BY s.user_id
                              ORDER BY s.paid_until DESC NULLS LAST, s.id DESC) AS rn
      FROM public.subscriptions s WHERE s.status = 'active'
  )
  SELECT count(*) INTO n
    FROM public.subscriptions s
    JOIN ranked r ON r.id = s.id
    JOIN public.profiles p ON p.id = s.user_id
   WHERE s.status = 'active' AND r.rn = 1                -- это ЕДИНСТВЕННАЯ строка человека
     AND s.paid_until < now() AND p.paid_until > now();  -- но профиль говорит «оплачено»
  IF n > 0 THEN
    RAISE EXCEPTION 'ПРЕДОХРАНИТЕЛЬ: % строк(и) гасятся у людей с живой подпиской — разобрать вручную', n;
  END IF;
  RAISE NOTICE 'предохранитель чист: живых подписок не гасим';
END $$;

BEGIN;

-- ─────────── 1. Дубли: оставить верную строку, лишние погасить ───────────
-- Верная = с самой поздней paid_until (она же, как проверено, совпадает с profiles.paid_until).
-- ended_at ставим не «сейчас», а в дату, когда период на самом деле кончился —
-- least(paid_until, now()), чтобы будущая дата не уехала в закрытую строку.
WITH ranked AS (
  SELECT s.id,
         row_number() OVER (PARTITION BY s.user_id
                            ORDER BY s.paid_until DESC NULLS LAST, s.id DESC) AS rn
    FROM public.subscriptions s WHERE s.status = 'active'
)
UPDATE public.subscriptions s
   SET status = 'finished',
       ended_at = least(coalesce(s.paid_until, now()), now())
  FROM ranked r
 WHERE s.id = r.id AND r.rn > 1;

-- ─────────── 2. Шире дублей: любая active-строка с датой в прошлом ───────────
UPDATE public.subscriptions s
   SET status = 'finished',
       ended_at = least(coalesce(s.paid_until, now()), now())
 WHERE s.status = 'active' AND s.paid_until < now();

-- ─────────── 3. Ключ идентичности: одна active-строка на человека ───────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_one_active_per_user
  ON public.subscriptions (user_id) WHERE status = 'active';

-- Прежний ключ сужаем до active-строк. Без этого журнал перестал бы расти:
-- у человека, чей период закрыт, повторная оплата с тем же id подписки упёрлась
-- бы в уникальность со СТАРОЙ, уже закрытой строкой.
DROP INDEX IF EXISTS public.subscriptions_provider_subscription_uidx;
CREATE UNIQUE INDEX subscriptions_provider_subscription_uidx
  ON public.subscriptions (provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL AND status = 'active';

-- ─────────── 4. Пометки: что здесь историческое, а что настоящее ───────────
COMMENT ON TABLE public.subscriptions IS
  'Журнал подписок: одна active-строка на человека, прошлые периоды закрыты (status=finished, ended_at). '
  'Источник правды по доступу — profiles.paid_until, НЕ эта таблица.';

COMMENT ON COLUMN public.subscriptions.ended_at IS
  'Когда период закончился. ВНИМАНИЕ: у строк, погашенных бэкфиллом 2026-08-06 (миграция phase48), '
  'дата ИСТОРИЧЕСКАЯ — восстановлена из paid_until задним числом, а не зафиксирована в момент события. '
  'Отчётам не путать с реальной датой окончания. Такие строки: status=finished и updated_at за 2026-08-06.';

COMMENT ON COLUMN public.subscriptions.provider_subscription_id IS
  'Идентификатор подписки на стороне провайдера, если провайдер его даёт (Продамус не даёт). '
  'НЕ ключ идентичности: до 2026-08-06 сюда клали то id заказа, то user_id, из-за чего on conflict '
  'не срабатывал и плодились дубли. Ключ идентичности теперь — user_id у active-строки.';

COMMIT;

-- ─────────────────────────── VERIFY (вне транзакции) ───────────────────────────
\echo
\echo === V1: сколько погашено и сколько осталось ===
SELECT status, count(*) AS strok, count(DISTINCT user_id) AS lyudey
  FROM public.subscriptions GROUP BY status ORDER BY strok DESC;

\echo === V2: нарушений инварианта «одна active на человека» (ожид: 0) ===
SELECT count(*) AS narusheniy
  FROM (SELECT user_id FROM public.subscriptions WHERE status='active'
         GROUP BY user_id HAVING count(*) > 1) x;

\echo === V3: active-строки с датой в прошлом (ожид: 0) ===
SELECT count(*) AS protuhshih FROM public.subscriptions
 WHERE status='active' AND paid_until < now();

\echo === V4: расхождения active-строк с profiles.paid_until (ожид: 0) ===
SELECT count(*) AS rashodyatsya
  FROM public.subscriptions s JOIN public.profiles p ON p.id = s.user_id
 WHERE s.status='active' AND s.paid_until::date IS DISTINCT FROM p.paid_until::date;

\echo === V5: индексы на месте ===
SELECT indexname, indexdef FROM pg_indexes
 WHERE tablename='subscriptions' AND indexname IN
   ('uq_subscriptions_one_active_per_user','subscriptions_provider_subscription_uidx')
 ORDER BY indexname;

\echo === V6: дубль больше не рождается (в откатываемой транзакции) ===
BEGIN;
DO $$
DECLARE uid uuid; before_rows int; after_rows int;
BEGIN
  SELECT user_id INTO uid FROM public.subscriptions WHERE status='active' LIMIT 1;
  SELECT count(*) INTO before_rows FROM public.subscriptions WHERE user_id = uid;
  -- «оплата другим способом»: тот же человек, другой провайдер, свой id заказа
  INSERT INTO public.subscriptions(user_id, provider, provider_subscription_id, status, paid_until, last_payment_at, ended_at, updated_at)
  VALUES (uid, 'manual', NULL, 'active', now() + interval '30 days', now(), NULL, now())
  ON CONFLICT (user_id) WHERE status = 'active' DO UPDATE
    SET provider = excluded.provider,
        paid_until = excluded.paid_until,
        last_payment_at = now(),
        ended_at = NULL;
  SELECT count(*) INTO after_rows FROM public.subscriptions WHERE user_id = uid;
  IF after_rows = before_rows THEN
    RAISE NOTICE 'V6 OK: оплата другим способом ОБНОВИЛА строку (было %, стало %)', before_rows, after_rows;
  ELSE
    RAISE WARNING 'V6 FAIL: появилась вторая строка (было %, стало %)', before_rows, after_rows;
  END IF;
END $$;
ROLLBACK;  -- тестовую правку не сохраняем
