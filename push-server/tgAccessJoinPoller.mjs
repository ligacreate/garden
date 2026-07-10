// Фаза 3 (live) — long-poll заявок на вступление (approve-on-request).
// Слушает chat_join_request, авто-одобряет ИЗВЕСТНОГО ОПЛАЧЕННОГО (или бартер).
// Незнакомца / истёкшего / paused_manual — НЕ трогает (заявка висит, в лог).
// Запускается ТОЛЬКО при mode∈{admit,live} и наличии токена (из server.mjs).
// Не конфликтует с TargetHunter: одобряет только заявки (кто пришёл по join-request-ссылке);
// прямые TH-ссылки идут мимо, TH продолжает добавлять сам во время admit-фазы.

import { TG_CHANNEL_ID, TG_CHAT_ID } from './tgAccessConst.mjs';
import { dedupKey } from './tgAccessActions.mjs';

const RES_BY_ID = { [String(TG_CHANNEL_ID)]: 'channel', [String(TG_CHAT_ID)]: 'chat' };

async function shouldAdmit(pool, uid) {
  const { rows } = await pool.query(
    `select id, role, paid_until, access_status, coalesce(auto_pause_exempt,false) as exempt
       from public.profiles where telegram_user_id = $1 limit 1`, [uid]);
  const p = rows[0];
  if (!p) return { ok: false, why: 'unknown', profile: null };
  if (p.access_status === 'paused_manual') return { ok: false, why: 'paused_manual', profile: p };
  const paid = p.paid_until && new Date(p.paid_until) >= new Date();
  if (p.exempt || paid) return { ok: true, why: p.exempt ? 'exempt' : 'paid', profile: p };
  return { ok: false, why: 'expired_or_unpaid', profile: p };
}

export function startJoinPoller({ pool, tg, mode, logger = console }) {
  if (!['admit', 'live'].includes(mode)) { logger.info?.(`[join-poller] mode=${mode} → не стартуем`); return { stop() {} }; }
  let offset = 0;
  let running = true;
  logger.info?.('[join-poller] старт (allowed_updates=chat_join_request)');

  (async function loop() {
    while (running) {
      try {
        const upd = await tg.getUpdates({ offset, timeout: 30, allowed_updates: ['chat_join_request'] });
        if (!upd?.ok) { await sleep(3000); continue; }
        for (const u of upd.result) {
          offset = u.update_id + 1;
          const req = u.chat_join_request;
          if (!req) continue;
          const uid = req.from?.id;
          const resource = RES_BY_ID[String(req.chat?.id)];
          if (!uid || !resource) continue;
          const verdict = await shouldAdmit(pool, uid);
          if (verdict.ok) {
            const res = await tg.approveChatJoinRequest(req.chat.id, uid);
            await logApprove(pool, { profile: verdict.profile, uid, resource, ok: res.ok, res });
            logger.info?.(`[join-poller] approve ${uid}@${resource} (${verdict.why}) ok=${res.ok}`);
          } else {
            logger.info?.(`[join-poller] SKIP ${uid}@${resource} (${verdict.why}) — заявка висит`);
          }
        }
      } catch (e) {
        logger.error?.('[join-poller] loop error', e?.message);
        await sleep(5000);
      }
    }
  })();

  return { stop() { running = false; } };
}

async function logApprove(pool, { profile, uid, resource, ok, res }) {
  const key = dedupKey('admit_approve', uid, resource, profile?.paid_until);
  await pool.query(
    `insert into public.tg_access_actions
       (profile_id, telegram_user_id, resource, action, reason, paid_until_snap, status, dedup_key, tg_response, executed_at)
     select $1,$2,$3,'admit_approve','join_request',$4,$5,$6,$7::jsonb, now()
      where not exists (select 1 from public.tg_access_actions where dedup_key=$6 and status='executed')`,
    [profile?.id || null, uid, resource, profile?.paid_until || null,
     ok ? 'executed' : 'failed', key, JSON.stringify(res || {})]
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
