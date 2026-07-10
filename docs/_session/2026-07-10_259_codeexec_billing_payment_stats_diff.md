# DESIGN + DIFF-ON-REVIEW — статистика оплат по месяцам (admin)

**Дата:** 2026-07-10 · **Автор:** codeexec · **Статус:** 🟡 на ревью, **НЕ применял/не деплоил**.
**Задача:** admin-таблица «месяц → собрано ₽ / число платежей» (+опц. разбивка тариф/канал) из `payment_orders (status='paid')`.

## ⚠️ ОХВАТ ДАННЫХ (важно, отразить в UI — чтобы Оля не удивилась)
`payment_orders` наполняется **только с запуска платёжной системы** (checkout 1b/вебхук 1c/mark-paid 1e). Исторические Prodamus-платежи, которые лишь двигали `paid_until` (массовый бэкфилл), **в `payment_orders` НЕ лежат**.
**Факт на проде сейчас:** всего **4 оплаченных заказа, все в июле 2026** (первый 2026-07-01, собрано **19 500 ₽**; 2×1m, 1×3m, 1×6m; 1 manual, 3 Prodamus). Ранние месяцы = пусто/неполно — это ожидаемо, не баг.
→ В UI даём подпись: «Учитываются оплаты через платформу с июля 2026. Прежние платежи Prodamus (до запуска) здесь не отражены.»

## Механизм чтения — RPC SECURITY DEFINER (рекомендую)
RLS `payment_orders` уже разрешает админу читать всё (`payment_orders_select_own_or_admin` = `is_admin() OR user_id=auth.uid()`). Но:
- **Выбираю RPC** `admin_payment_stats_by_month()`: агрегация в Postgres (`date_trunc`+`sum`+`count`), клиенту едет уже свёрнутый мелкий результат (не сырые заказы с user_id/суммами), guard `is_admin()` внутри (defense-in-depth). Консистентно с существующими `rpc/admin_approve_registration`, `rpc/admin_delete_user_full`.
- **Альтернатива (легче, без миграции):** прямой `GET payment_orders?status=eq.paid&select=...` под админ-RLS + агрегация в JS. Минус: шлём сырые строки, агрегация на клиенте. При росте объёма/отчётности RPC всё равно понадобится. При объёме «4 строки» — тоже рабочий вариант, если не хотим миграцию прямо сейчас.

## Изменение 1 — миграция (RPC), применяется owner'ом отдельно (НЕ через FTP, окна 403 нет)
Файл: `database/pvl/migrations/2026-07-10_phase47_admin_payment_stats.sql` (идемпотентная).
```sql
CREATE OR REPLACE FUNCTION public.admin_payment_stats_by_month()
RETURNS TABLE (
  month         date,
  collected_rub bigint,
  payments      int,
  plan_1m int, plan_3m int, plan_6m int,
  ch_manual int, ch_prodamus int
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  RETURN QUERY
    SELECT
      date_trunc('month', paid_at)::date              AS month,
      sum(amount)::bigint                             AS collected_rub,
      count(*)::int                                   AS payments,
      count(*) FILTER (WHERE plan_code = '1m')::int   AS plan_1m,
      count(*) FILTER (WHERE plan_code = '3m')::int   AS plan_3m,
      count(*) FILTER (WHERE plan_code = '6m')::int   AS plan_6m,
      count(*) FILTER (WHERE provider = 'manual')::int    AS ch_manual,
      count(*) FILTER (WHERE provider <> 'manual')::int   AS ch_prodamus
    FROM public.payment_orders
    WHERE status = 'paid' AND paid_at IS NOT NULL
    GROUP BY 1
    ORDER BY 1 DESC;
END $$;

REVOKE ALL ON FUNCTION public.admin_payment_stats_by_month() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_payment_stats_by_month() TO authenticated;
-- в ensure_garden_grants() добавить GRANT EXECUTE (аддитивно), чтобы переживал пересоздание грантов.
```
Verify (в миграции): V1 — функция существует; V2 — под НЕ-админом `RAISE forbidden`; V3 — под админом возвращает ожидаемую 1 строку (июль 2026, 19500, 4).

## Изменение 2 — `services/dataService.js` (метод чтения)
Рядом с `getBillingPlans()` (~строка 1796), паттерн `postgrestFetch('rpc/...')`:
```js
async getPaymentStatsByMonth() {
  const { data } = await postgrestFetch('rpc/admin_payment_stats_by_month', {}, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
  });
  return Array.isArray(data) ? data : [];
}
```
*(точную сигнатуру `postgrestFetch` для RPC свериваю с `admin_approve_registration` при написании — тот же вызов.)*

## Изменение 3 — `views/AdminPanel.jsx` (UI-таблица в табе «Статистика»)
- Состояние: `const [payStats, setPayStats] = useState([]);`
- Фетч при активном табе `stats` (рядом с useEffect на строке 545):
```js
useEffect(() => {
  if (tab !== 'stats') return;
  let alive = true;
  api.getPaymentStatsByMonth().then(r => { if (alive) setPayStats(r); }).catch(() => {});
  return () => { alive = false; };
}, [tab]);
```
- Разметка — после `<AdminStatsDashboard/>` (строка 804), внутри `tab === 'stats'`:
```diff
                 {tab === 'stats' && (
-                    <AdminStatsDashboard meetings={allMeetings} users={users} />
+                    <>
+                        <AdminStatsDashboard meetings={allMeetings} users={users} />
+                        <div className="surface-card p-6 mt-6">
+                            <h3 className="font-display font-semibold text-slate-900 mb-1">Оплаты подписки Лиги по месяцам</h3>
+                            <p className="text-xs text-slate-400 mb-4">
+                                Учитываются оплаты через платформу с июля 2026. Прежние платежи Prodamus (до запуска) здесь не отражены.
+                            </p>
+                            {payStats.length === 0 ? (
+                                <div className="text-sm text-slate-400">Пока нет оплат.</div>
+                            ) : (
+                                <div className="overflow-x-auto">
+                                    <table className="w-full text-sm">
+                                        <thead>
+                                            <tr className="text-left text-slate-400 border-b border-slate-100">
+                                                <th className="py-2 pr-4 font-medium">Месяц</th>
+                                                <th className="py-2 pr-4 font-medium text-right">Собрано, ₽</th>
+                                                <th className="py-2 pr-4 font-medium text-right">Платежей</th>
+                                                <th className="py-2 pr-4 font-medium text-right">1м / 3м / 6м</th>
+                                                <th className="py-2 font-medium text-right">Prodamus / вручную</th>
+                                            </tr>
+                                        </thead>
+                                        <tbody>
+                                            {payStats.map((r) => (
+                                                <tr key={r.month} className="border-b border-slate-50">
+                                                    <td className="py-2 pr-4 text-slate-700">
+                                                        {new Date(r.month).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
+                                                    </td>
+                                                    <td className="py-2 pr-4 text-right font-semibold text-slate-900">{Number(r.collected_rub).toLocaleString('ru-RU')}</td>
+                                                    <td className="py-2 pr-4 text-right text-slate-700">{r.payments}</td>
+                                                    <td className="py-2 pr-4 text-right text-slate-500">{r.plan_1m} / {r.plan_3m} / {r.plan_6m}</td>
+                                                    <td className="py-2 text-right text-slate-500">{r.ch_prodamus} / {r.ch_manual}</td>
+                                                </tr>
+                                            ))}
+                                        </tbody>
+                                    </table>
+                                </div>
+                            )}
+                        </div>
+                    </>
                 )}
```
- Стиль (`surface-card`, `font-display`, slate-палитра) повторяет соседние admin-блоки.

## Поведение
- Админ открывает таб «Статистика» → под дашбордом встреч видит таблицу по месяцам: собрано ₽, число платежей, разбивка 1м/3м/6м и Prodamus/вручную.
- Сейчас = 1 строка (июль 2026: 19 500 ₽, 4 платежа). Дальше растёт по мере оплат.
- Не-админ RPC не вызовет (guard + RLS).

## Раскатка
1. 🟢 ревью.
2. **Миграция (изм.1)** — применяю owner'ом на прод-БД (diff-on-review, dry verify → apply). **Окна 403 не требует** (это БД, не FTP).
3. **Фронт (изм.2-3)** — батчить в то же окно 403, что кнопки «Вступить» (258). Верификация после деплоя: админ видит июль-строку 19500/4.

## Не трогаю
- `payment_orders` данные/RLS/запись, курс/роли, биллинг-логику вебхука.
- Ничего не применял/не деплоил.

**На ревью. Жду 🟢 (+ выбор: RPC или прямой read; по умолчанию беру RPC).**
