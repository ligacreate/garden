// Фаза 3 (live) — материализация и исполнение действий доступа с идемпотентностью.
// Все мутации TG проходят ТОЛЬКО здесь (executeActions). Таблица public.tg_access_actions
// (миграция phase46) — журнал «что решили / что сделали». dedup по эпизоду оплаты.

import { RESOURCE_ID, graceCutoff } from './tgAccessConst.mjs';
import { isInChat } from './tgAccessClient.mjs';

/** action:uid:resource:эпизод(paid_until YYYY-MM-DD). Смена оплаты → новый эпизод → снова можно действовать. */
export function dedupKey(action, uid, resource, paidUntil) {
  const ep = paidUntil ? new Date(paidUntil).toISOString().slice(0, 10) : 'none';
  return `${action}:${uid}:${resource}:${ep}`;
}

/**
 * Кладёт planned-действие, если по этому dedup_key ещё нет ни planned, ни executed.
 * Возвращает id вставленной строки или null (если уже есть).
 */
export async function upsertPlanned(pool, a) {
  const key = dedupKey(a.action, a.telegram_user_id, a.resource, a.paid_until);
  const { rows } = await pool.query(
    `insert into public.tg_access_actions
       (profile_id, telegram_user_id, resource, action, reason, paid_until_snap, status, dedup_key, batch_id)
     select $1,$2,$3,$4,$5,$6,'planned',$7,$8
      where not exists (
        select 1 from public.tg_access_actions
         where dedup_key = $7 and status in ('planned','executed'))
     returning id`,
    [a.profile_id || null, a.telegram_user_id, a.resource, a.action, a.reason,
     a.paid_until || null, key, a.batch_id]
  );
  return rows[0]?.id || null;
}

/**
 * Исполняет planned-действия. filter: 'admit' | 'kick'. batchId опционально сужает.
 * Идемпотентность: перед вызовом TG проверяем, что нет executed с тем же dedup_key.
 * ADMIT → createChatInviteLink (персональная одноразовая ссылка, отдаём Оле на пересылку).
 * KICK  → kickChatMember (ban+unban).
 * approve заявок делает poller отдельно (action='admit_approve').
 */
export async function executeActions(pool, tg, { filter, batchId = null, now = new Date() }) {
  const actionsForFilter = filter === 'kick' ? ['kick'] : ['admit_invite'];
  const params = [actionsForFilter];
  let sql = `select * from public.tg_access_actions
              where status='planned' and action = any($1::text[])`;
  if (batchId) { params.push(batchId); sql += ` and batch_id = $${params.length}`; }
  sql += ` order by id`;
  const { rows } = await pool.query(sql, params);

  const done = [];
  for (const a of rows) {
    // защита от гонок: уже исполнено в этом эпизоде?
    const dup = await pool.query(
      `select 1 from public.tg_access_actions where dedup_key=$1 and status='executed' limit 1`, [a.dedup_key]);
    if (dup.rowCount) {
      await pool.query(`update public.tg_access_actions set status='skipped', tg_response=$2::jsonb where id=$1`,
        [a.id, JSON.stringify({ skip: 'dedup_executed' })]);
      done.push({ id: a.id, action: a.action, uid: a.telegram_user_id, resource: a.resource, result: 'skipped_dup' });
      continue;
    }

    const chatId = RESOURCE_ID[a.resource];

    // ── TOCTOU-перепроверка перед КИКОМ (обязательна для confirm-пути: между планом и
    //    подтверждением человек мог оплатить / уйти сам / стать exempt). Кикаем ТОЛЬКО если
    //    по ЖИВОЙ БД всё ещё истёк+не exempt+не manual И по ЖИВОМУ getChatMember всё ещё в ресурсе.
    if (a.action === 'kick') {
      const skip = await kickRecheck(pool, tg, a, chatId, now);
      if (skip) {
        await pool.query(
          `update public.tg_access_actions set status='skipped', tg_response=$2::jsonb, executed_at=now() where id=$1`,
          [a.id, JSON.stringify({ recheck_skip: skip })]);
        done.push({ id: a.id, action: a.action, uid: a.telegram_user_id, resource: a.resource, result: 'skipped_recheck', reason: skip });
        continue;
      }
    }
    let res, inviteLink = null;
    try {
      if (a.action === 'kick') {
        res = await tg.kickChatMember(chatId, Number(a.telegram_user_id));
      } else if (a.action === 'admit_invite') {
        // одноразовая именная ссылка; TH-ссылки не трогаем
        const expire = Math.floor(now.getTime() / 1000) + 7 * 24 * 3600;
        res = await tg.createChatInviteLink(chatId, {
          member_limit: 1, expire_date: expire, name: `liga-${a.telegram_user_id}`.slice(0, 32),
          creates_join_request: false,
        });
        inviteLink = res?.result?.invite_link || null;
      }
    } catch (e) {
      res = { ok: false, error: e?.message || 'exception' };
    }

    const ok = !!res?.ok;
    await pool.query(
      `update public.tg_access_actions
          set status=$2, tg_response=$3::jsonb, invite_link=coalesce($4, invite_link), executed_at=now()
        where id=$1`,
      [a.id, ok ? 'executed' : 'failed', JSON.stringify(res || {}), inviteLink]
    );
    done.push({ id: a.id, action: a.action, uid: a.telegram_user_id, resource: a.resource,
                result: ok ? 'executed' : 'failed', invite_link: inviteLink });
  }
  return done;
}

/**
 * TOCTOU-перепроверка перед kick по ЖИВЫМ данным. Возвращает reason-строку для skip, либо null (кикать можно).
 */
async function kickRecheck(pool, tg, a, chatId, now) {
  const { rows } = await pool.query(
    `select paid_until, access_status, coalesce(auto_pause_exempt,false) as exempt
       from public.profiles where telegram_user_id = $1 limit 1`,
    [a.telegram_user_id]
  );
  const p = rows[0];
  if (!p) return 'no_profile';
  if (p.exempt) return 'became_exempt';
  if (p.access_status === 'paused_manual') return 'became_paused_manual';
  // Grace-симметрия с reconcile: щадим и тех, кто истёк, но в пределах GRACE_DAYS.
  if (!p.paid_until || new Date(p.paid_until) >= graceCutoff(now)) return 'paid_or_grace';
  try {
    const mem = await tg.getChatMember(chatId, Number(a.telegram_user_id));
    if (!(mem?.ok && isInChat(mem.result))) return 'left_resource';
  } catch {
    return 'left_resource';
  }
  return null; // всё ещё валидный кандидат на кик
}
