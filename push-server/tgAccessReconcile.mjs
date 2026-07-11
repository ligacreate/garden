// Фаза 3 — ядро решения «кого впустить/кикнуть» из канала+чата Лиги по paid_until.
//
// mode='shadow' — ТОЛЬКО считаем и возвращаем списки; НИ ОДНОГО мутирующего
// TG-вызова (в клиенте их и нет). mode='live' пока не реализован (кинет ошибку) —
// придёт отдельным диффом вместе с таблицей идемпотентности действий.
//
// ХАРД-ПРАВИЛА (default-safe):
//   - «Известные» = профили ролей intern/leader/mentor с НЕПУСТЫМ telegram_user_id.
//   - unknown (нет профиля / нет telegram_user_id) — НЕ трогать НИКОГДА (в отчёт «skip»).
//   - auto_pause_exempt=true (бартер) и access_status='paused_manual' — пропускать.
//   - paid_until IS NULL у известного — НЕ кикать (не считаем истёкшим), в «skip».
//   - оба ресурса: канал -1002377682177 и чат -1002432957741, решение на каждый отдельно.

import { isInChat } from './tgAccessClient.mjs';
import { upsertPlanned, executeActions } from './tgAccessActions.mjs';
import { TG_CHANNEL_ID, TG_CHAT_ID, LIGA_ROLES, RESOURCES, graceCutoff } from './tgAccessConst.mjs';

// re-export для обратной совместимости (кто импортировал из reconcile)
export { TG_CHANNEL_ID, TG_CHAT_ID, LIGA_ROLES, RESOURCES } from './tgAccessConst.mjs';

/**
 * @param {object}   o
 * @param {'shadow'|'live'} o.mode
 * @param {import('pg').Pool} o.pool
 * @param {object}   o.tg     - makeTgAccessClient(token)
 * @param {object?}  o.roster - { members:[{user_id, username, in:[...]}] } — снимок Telethon
 *                              (для списка «незнакомцев в чате без профиля»; Bot API их не перечислит)
 * @param {Date}     o.now
 */
export async function runTgAccessReconcile({ mode = 'shadow', pool, tg, roster = null, now = new Date(), autoKick = false, logger = console }) {
  if (!['shadow', 'admit', 'live'].includes(mode)) {
    throw new Error(`runTgAccessReconcile: mode='${mode}' неизвестен`);
  }

  // 1. Известные профили (enforce-скоуп).
  const { rows: known } = await pool.query(
    `select id, name, role, telegram_user_id, paid_until, access_status,
            coalesce(auto_pause_exempt, false) as exempt
       from public.profiles
      where role = any($1::text[]) and telegram_user_id is not null`,
    [LIGA_ROLES]
  );

  // Множество ВСЕХ привязанных tg_user_id (любая роль) — чтобы отличить «нет профиля» от «есть, но не enforce».
  const { rows: allLinked } = await pool.query(
    `select telegram_user_id, role, name from public.profiles where telegram_user_id is not null`
  );
  const uidToProfile = new Map(allLinked.map((p) => [String(p.telegram_user_id), p]));

  const kick = [];
  const admit = [];
  const skip_exempt = [];
  const skip_manual = [];
  const skip_unknown_paid = []; // известный, но paid_until NULL → не трогаем
  const skip_grace = [];        // истёк, но в пределах grace → пока НЕ кикаем
  const errors = [];
  const membership = []; // полная матрица для отчёта/аудита

  for (const p of known) {
    const uid = String(p.telegram_user_id);
    const paidUntil = p.paid_until ? new Date(p.paid_until) : null;
    const paid = paidUntil ? paidUntil >= now : null; // null = неизвестно (paid_until пусто)
    // Кик — только если истёк ДОЛЬШЕ grace: paid_until < now - GRACE_DAYS.
    const expiredBeyondGrace = paidUntil !== null && paidUntil < graceCutoff(now);
    const exempt = p.exempt === true;
    const manual = p.access_status === 'paused_manual';

    for (const r of RESOURCES) {
      let inChat = false;
      let memErr = null;
      try {
        const res = await tg.getChatMember(r.id, p.telegram_user_id);
        if (res && res.ok) inChat = isInChat(res.result);
        else memErr = res ? `${res.error_code}:${res.description}` : 'no_response';
      } catch (e) {
        memErr = e?.message || 'exception';
      }
      if (memErr) errors.push({ name: p.name, uid, resource: r.key, error: memErr });

      const base = {
        id: p.id, name: p.name, role: p.role, uid,
        paid_until: p.paid_until, access_status: p.access_status,
        resource: r.key, inChat,
      };
      membership.push({ ...base, memErr, exempt, manual, paid });

      // Классификация (default-safe порядок):
      if (exempt) { skip_exempt.push(base); continue; }
      if (manual) { skip_manual.push(base); continue; }
      if (paid === null) { skip_unknown_paid.push(base); continue; } // paid_until NULL → не кикать
      if (expiredBeyondGrace && inChat) { kick.push(base); }         // истёк дольше grace + в ресурсе → KICK
      else if (paid === false && inChat) { skip_grace.push(base); }  // истёк, но в grace → щадим
      else if (paid === true && !inChat) { admit.push(base); }       // оплачен + не в ресурсе → ADMIT
    }
  }

  // 3. «Незнакомцы» в чате/канале без профиля вообще — НЕ трогать (для осознания).
  const skip_unknown_members = [];
  if (roster && Array.isArray(roster.members)) {
    for (const m of roster.members) {
      if (!uidToProfile.has(String(m.user_id))) {
        skip_unknown_members.push({ user_id: m.user_id, username: m.username || null, in: m.in || [] });
      }
    }
  }

  // ── ADMIT/LIVE: материализуем план в tg_access_actions + исполняем ──
  //    shadow → сюда не заходим (ноль записей, ноль мутаций).
  let batch_id = null;
  const executed = { admit: [], kick: [] };
  if (mode !== 'shadow') {
    batch_id = `tgacc-${now.toISOString().replace(/[:.]/g, '').slice(0, 15)}`;
    for (const d of admit) {
      await upsertPlanned(pool, { profile_id: d.id, telegram_user_id: Number(d.uid), resource: d.resource,
        action: 'admit_invite', reason: 'paid_not_in_resource', paid_until: d.paid_until, batch_id });
    }
    for (const d of kick) {
      await upsertPlanned(pool, { profile_id: d.id, telegram_user_id: Number(d.uid), resource: d.resource,
        action: 'kick', reason: 'expired', paid_until: d.paid_until, batch_id });
    }
    // ADMIT исполняем сразу (admit и live) — впуск оплаченного безопасен.
    executed.admit = await executeActions(pool, tg, { filter: 'admit', batchId: batch_id, now });
    // KICK — ТОЛЬКО live И autoKick. Иначе остаётся planned → ждёт confirm-эндпоинта (первый батч).
    if (mode === 'live' && autoKick) {
      executed.kick = await executeActions(pool, tg, { filter: 'kick', batchId: batch_id, now });
    }
  }

  const counts = {
    known: known.length,
    kick: kick.length,
    admit: admit.length,
    skip_exempt: skip_exempt.length,
    skip_manual: skip_manual.length,
    skip_unknown_paid: skip_unknown_paid.length,
    skip_grace: skip_grace.length,
    skip_unknown_members: skip_unknown_members.length,
    errors: errors.length,
    executed_admit: executed.admit.length,
    executed_kick: executed.kick.length,
  };
  logger?.info?.(`[tg-access-reconcile ${mode}] ` + JSON.stringify(counts));

  return {
    mode, now: now.toISOString(), batch_id, counts,
    kick, admit, skip_exempt, skip_manual, skip_unknown_paid, skip_unknown_members,
    skip_grace,
    errors, membership, executed,
  };
}
