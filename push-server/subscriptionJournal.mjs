// Журнал подписок (public.subscriptions) — одна дверь на все записи.
//
// МОДЕЛЬ (решение Оли, 2026-08-06): это ЖУРНАЛ, а не витрина. Источник правды по
// доступу — profiles.paid_until. Здесь копится история периодов: у человека ровно
// одна active-строка, прошлые закрыты (status='finished'/'deactivated', ended_at).
//
// КЛЮЧ ИДЕНТИЧНОСТИ — сам человек (user_id), а не provider_subscription_id. Раньше
// ключом была пара (provider, provider_subscription_id), но устойчивости в ней не
// было: разные пути оплаты клали туда разное — то id заказа, то user_id. Ключи не
// совпадали, do update не срабатывал, и вместо обновления строки рождалась вторая,
// а старая оставалась active со своей просроченной датой. Дубль появлялся всякий
// раз, когда человек платил не тем способом, что в прошлый раз.
// Инвариант держит частичный уникальный индекс uq_subscriptions_one_active_per_user
// (миграция phase48).

/** Оплата: обновляем действующую строку человека, а если её нет — заводим. */
export const RECORD_PAYMENT_SQL = `
  insert into public.subscriptions
      (user_id, provider, provider_subscription_id, status, paid_until, last_payment_at, ended_at, updated_at)
  values ($1, $2, $3, 'active', $4, now(), null, now())
  on conflict (user_id) where status = 'active' do update
     set provider = excluded.provider,
         provider_subscription_id = coalesce(excluded.provider_subscription_id,
                                             subscriptions.provider_subscription_id),
         paid_until = excluded.paid_until,
         last_payment_at = now(),
         ended_at = null,
         updated_at = now()
  returning id`;

/** Конец периода: закрываем действующую строку. Нет её — писать нечего. */
export const CLOSE_SUBSCRIPTION_SQL = `
  update public.subscriptions
     set status = $2,
         paid_until = coalesce($3::timestamptz, paid_until),
         ended_at = now(),
         updated_at = now()
   where user_id = $1 and status = 'active'
  returning id`;

/**
 * Записать оплату в журнал.
 *
 * provider перезаписываем: строка отвечает на вопрос «чем оплачено в последний раз».
 * providerSubscriptionId, наоборот, только дописываем (coalesce) — если провайдер
 * once отдал настоящий id подписки, ручная оплата не должна его затирать.
 *
 * @returns {Promise<number|null>} id строки журнала
 */
export async function recordPayment(db, { userId, provider, providerSubscriptionId = null, paidUntil }) {
  const { rows } = await db.query(RECORD_PAYMENT_SQL, [
    userId,
    provider,
    String(providerSubscriptionId || '').trim() || null,
    paidUntil ?? null,
  ]);
  return rows[0]?.id ?? null;
}

/**
 * Закрыть действующую подписку человека.
 *
 * Ищем по user_id, а не по провайдеру: у человека одна действующая строка, и
 * закрыть её должен любой провайдер, от которого пришёл конец периода.
 *
 * @returns {Promise<number|null>} id закрытой строки, либо null — закрывать было нечего
 */
export async function closeSubscription(db, { userId, status, paidUntil = null }) {
  const { rows } = await db.query(CLOSE_SUBSCRIPTION_SQL, [userId, status, paidUntil ?? null]);
  return rows[0]?.id ?? null;
}
