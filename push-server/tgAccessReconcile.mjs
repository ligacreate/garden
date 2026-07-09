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

export const TG_CHANNEL_ID = -1002377682177;
export const TG_CHAT_ID = -1002432957741;
export const LIGA_ROLES = ['intern', 'leader', 'mentor'];
export const RESOURCES = [
  { key: 'channel', id: TG_CHANNEL_ID },
  { key: 'chat', id: TG_CHAT_ID },
];

/**
 * @param {object}   o
 * @param {'shadow'|'live'} o.mode
 * @param {import('pg').Pool} o.pool
 * @param {object}   o.tg     - makeTgAccessClient(token)
 * @param {object?}  o.roster - { members:[{user_id, username, in:[...]}] } — снимок Telethon
 *                              (для списка «незнакомцев в чате без профиля»; Bot API их не перечислит)
 * @param {Date}     o.now
 */
export async function runTgAccessReconcile({ mode = 'shadow', pool, tg, roster = null, now = new Date(), logger = console }) {
  if (mode !== 'shadow') {
    throw new Error(`runTgAccessReconcile: mode='${mode}' не поддержан (пока только shadow)`);
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
  const errors = [];
  const membership = []; // полная матрица для отчёта/аудита

  for (const p of known) {
    const uid = String(p.telegram_user_id);
    const paidUntil = p.paid_until ? new Date(p.paid_until) : null;
    const paid = paidUntil ? paidUntil >= now : null; // null = неизвестно (paid_until пусто)
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
      if (paid === false && inChat) { kick.push(base); }             // истёк + в ресурсе → KICK
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

  const counts = {
    known: known.length,
    kick: kick.length,
    admit: admit.length,
    skip_exempt: skip_exempt.length,
    skip_manual: skip_manual.length,
    skip_unknown_paid: skip_unknown_paid.length,
    skip_unknown_members: skip_unknown_members.length,
    errors: errors.length,
  };
  logger?.info?.(`[tg-access-reconcile ${mode}] ` + JSON.stringify(counts));

  return {
    mode, now: now.toISOString(), counts,
    kick, admit, skip_exempt, skip_manual, skip_unknown_paid, skip_unknown_members,
    errors, membership,
  };
}
