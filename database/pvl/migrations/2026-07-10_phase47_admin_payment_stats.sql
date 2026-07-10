-- phase47 — admin RPC: статистика оплат по месяцам
-- ────────────────────────────────────────────────────────────────────
-- Аддитивная, идемпотентная. Только ДОБАВЛЯЕТ функцию-агрегатор поверх
-- public.payment_orders (status='paid'). Данные/RLS/записи не трогает.
--
-- Механизм: SECURITY DEFINER + guard public.is_admin() внутри (defense-in-depth
-- поверх RLS payment_orders_select_own_or_admin). Клиенту едет свёрнутый
-- результат (не сырые заказы). Вызов из фронта: rpc/admin_payment_stats_by_month.
--
-- ⚠️ ОХВАТ: payment_orders наполняется с запуска платёжной системы (checkout/
-- вебхук/mark-paid). Исторические Prodamus-платежи, что двигали только paid_until
-- (бэкфилл), сюда НЕ попадают → ранние месяцы неполны. Это ожидаемо (см. UI-подпись).
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_payment_stats_by_month()
RETURNS TABLE (
  month         date,
  collected_rub bigint,
  payments      int,
  plan_1m int, plan_3m int, plan_6m int,
  ch_manual int, ch_prodamus int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  RETURN QUERY
    SELECT
      date_trunc('month', paid_at)::date               AS month,
      sum(amount)::bigint                              AS collected_rub,
      count(*)::int                                    AS payments,
      count(*) FILTER (WHERE plan_code = '1m')::int    AS plan_1m,
      count(*) FILTER (WHERE plan_code = '3m')::int    AS plan_3m,
      count(*) FILTER (WHERE plan_code = '6m')::int    AS plan_6m,
      count(*) FILTER (WHERE provider = 'manual')::int     AS ch_manual,
      count(*) FILTER (WHERE provider <> 'manual')::int    AS ch_prodamus
    FROM public.payment_orders
    WHERE status = 'paid' AND paid_at IS NOT NULL
    GROUP BY 1
    ORDER BY 1 DESC;
END $$;

REVOKE ALL ON FUNCTION public.admin_payment_stats_by_month() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_payment_stats_by_month() TO authenticated;

-- ── Verify ──────────────────────────────────────────────────────────
\echo === V1: функция существует (ожидаем 1) ===
SELECT count(*) FROM pg_proc WHERE proname = 'admin_payment_stats_by_month';

\echo === V2: EXECUTE выдан authenticated (ожидаем 1) ===
SELECT count(*) FROM information_schema.role_routine_grants
WHERE routine_name = 'admin_payment_stats_by_month' AND grantee = 'authenticated' AND privilege_type = 'EXECUTE';

\echo === V3: как owner (is_admin() = ? — owner НЕ admin, guard может кинуть forbidden) ===
-- V3 прогоняем осознанно: под gen_user/owner is_admin() зависит от JWT-claim'ов;
-- если owner не проходит is_admin(), функция бросит forbidden — это КОРРЕКТНО (guard работает).
-- Реальную проверку данных делаем прямым SELECT ниже (owner в обход RLS).
\echo === V3-data: прямой контроль агрегата (owner) — ожидаем июль 2026: 19500 / 4 ===
SELECT date_trunc('month', paid_at)::date AS month, sum(amount)::bigint AS collected_rub, count(*)::int AS payments
FROM public.payment_orders WHERE status='paid' AND paid_at IS NOT NULL GROUP BY 1 ORDER BY 1 DESC;
