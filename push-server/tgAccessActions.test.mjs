// Дедуп действий TG-доступа. Главный сценарий — протухшая пригласительная ссылка:
// она обязана быть основанием выписать новую, иначе человек остаётся снаружи до
// следующего платежа (Елена Соковнина, 17.07–04.08.2026).

import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupKey, upsertPlanned, executeActions } from './tgAccessActions.mjs';
import { INVITE_TTL_DAYS, TG_CHAT_ID } from './tgAccessConst.mjs';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-06T09:00:00.000Z');
const UID = 339004999;

/**
 * Мини-подмена `pg.Pool`: держит `tg_access_actions` в массиве и понимает те
 * несколько запросов, которые шлёт `tgAccessActions.mjs`. Это не эмулятор SQL —
 * каждая ветка написана под конкретный запрос модуля. Поэтому там, где важна
 * форма запроса, тесты дополнительно проверяют его текст.
 */
function makePool({ actions = [], profiles = [] } = {}) {
  let seq = actions.reduce((m, a) => Math.max(m, a.id || 0), 0);
  const rows = actions.map((a) => ({
    profile_id: null, batch_id: null, invite_link: null, tg_response: null,
    paid_until_snap: null, executed_at: null, created_at: new Date(0), ...a,
  }));
  const log = [];

  const query = async (rawSql, params = []) => {
    const sql = rawSql.replace(/\s+/g, ' ').trim();
    log.push({ sql, params });

    // hasLiveInvite — есть ли ещё не протухшая выписанная ссылка
    if (sql.includes('coalesce(executed_at, created_at) > $3')) {
      const [uid, resource, cutoff] = params;
      const hit = rows.filter((r) =>
        String(r.telegram_user_id) === String(uid) && r.resource === resource &&
        r.action === 'admit_invite' && r.status === 'executed' &&
        new Date(r.executed_at ?? r.created_at) > new Date(cutoff));
      return { rows: hit.slice(0, 1), rowCount: Math.min(hit.length, 1) };
    }

    if (sql.startsWith('insert into public.tg_access_actions')) {
      const [profile_id, telegram_user_id, resource, action, reason, paid_until_snap,
             dedup_key, batch_id, cutoff] = params;
      // Какой guard выбрал модуль — по нему и считаем «уже есть»
      const blocked = sql.includes('coalesce(executed_at, created_at) > $9')
        ? rows.some((r) =>
            String(r.telegram_user_id) === String(telegram_user_id) && r.resource === resource &&
            r.action === 'admit_invite' &&
            (r.status === 'planned' ||
             (r.status === 'executed' && new Date(r.executed_at ?? r.created_at) > new Date(cutoff))))
        : rows.some((r) => r.dedup_key === dedup_key && ['planned', 'executed'].includes(r.status));
      if (blocked) return { rows: [], rowCount: 0 };
      // Частичный уникальный индекс uq_tg_access_actions_dedup — воспроизводим,
      // чтобы поймать ключ, повторяющийся среди executed-строк.
      if (rows.some((r) => r.dedup_key === dedup_key && r.status === 'executed')) {
        throw new Error(`unique_violation: uq_tg_access_actions_dedup (${dedup_key})`);
      }
      const row = {
        id: ++seq, profile_id, telegram_user_id, resource, action, reason, paid_until_snap,
        status: 'planned', dedup_key, batch_id, invite_link: null, tg_response: null,
        created_at: new Date(), executed_at: null,
      };
      rows.push(row);
      return { rows: [{ id: row.id }], rowCount: 1 };
    }

    if (sql.startsWith("select * from public.tg_access_actions where status='planned'")) {
      const [actionsFilter, batchId] = params;
      const hit = rows.filter((r) =>
        r.status === 'planned' && actionsFilter.includes(r.action) &&
        (batchId === undefined || r.batch_id === batchId));
      return { rows: hit.sort((a, b) => a.id - b.id), rowCount: hit.length };
    }

    if (sql.includes("where dedup_key=$1 and status='executed'")) {
      const hit = rows.filter((r) => r.dedup_key === params[0] && r.status === 'executed');
      return { rows: hit.slice(0, 1), rowCount: Math.min(hit.length, 1) };
    }

    if (sql.startsWith('select paid_until, access_status')) {
      const hit = profiles.filter((p) => String(p.telegram_user_id) === String(params[0]));
      return { rows: hit.slice(0, 1), rowCount: Math.min(hit.length, 1) };
    }

    if (sql.startsWith("update public.tg_access_actions set status='skipped'")) {
      const row = rows.find((r) => r.id === params[0]);
      Object.assign(row, { status: 'skipped', tg_response: JSON.parse(params[1]) });
      return { rows: [], rowCount: 1 };
    }

    if (sql.startsWith('update public.tg_access_actions set status=$2')) {
      const row = rows.find((r) => r.id === params[0]);
      const status = params[1];
      if (status === 'executed' && rows.some((r) => r !== row && r.dedup_key === row.dedup_key && r.status === 'executed')) {
        throw new Error(`unique_violation: uq_tg_access_actions_dedup (${row.dedup_key})`);
      }
      Object.assign(row, {
        status, tg_response: JSON.parse(params[2]),
        invite_link: params[3] ?? row.invite_link, executed_at: new Date(),
      });
      return { rows: [], rowCount: 1 };
    }

    throw new Error(`Мини-pool не знает запрос: ${sql}`);
  };

  return { query, rows, log };
}

function makeTg({ inChat = true } = {}) {
  const calls = [];
  return {
    calls,
    async createChatInviteLink(chatId, opts) {
      calls.push({ method: 'createChatInviteLink', chatId, opts });
      return { ok: true, result: { invite_link: `https://t.me/+new${calls.length}` } };
    },
    async kickChatMember(chatId, uid) {
      calls.push({ method: 'kickChatMember', chatId, uid });
      return { ok: true, result: true };
    },
    async getChatMember() {
      return { ok: true, result: { status: inChat ? 'member' : 'left' } };
    },
  };
}

/** Выписанная ссылка возрастом `ageDays` — так она лежит в журнале. */
const executedInvite = (id, ageDays, extra = {}) => ({
  id, telegram_user_id: UID, resource: 'chat', action: 'admit_invite',
  reason: 'paid_not_in_resource', status: 'executed',
  dedup_key: `admit_invite:${UID}:chat:2026-09-06`,   // старый формат — эпизод оплаты
  invite_link: 'https://t.me/+old', executed_at: new Date(NOW.getTime() - ageDays * DAY),
  created_at: new Date(NOW.getTime() - ageDays * DAY), ...extra,
});

const plannedAdmit = (pool, batch_id = 'tgacc-test') => upsertPlanned(pool, {
  profile_id: null, telegram_user_id: UID, resource: 'chat', action: 'admit_invite',
  reason: 'paid_not_in_resource', paid_until: '2026-09-06T00:00:00.000Z', batch_id, now: NOW,
});

// ─────────────────────────────── dedupKey ───────────────────────────────

test('dedupKey: у admit_invite эпизод — момент выписки, у kick — дата оплаты', () => {
  assert.equal(
    dedupKey('admit_invite', UID, 'chat', '2026-09-06T00:00:00.000Z', NOW),
    `admit_invite:${UID}:chat:inv2026-08-06T09:00:00.000Z`
  );
  assert.equal(
    dedupKey('kick', UID, 'chat', '2026-09-06T00:00:00.000Z', NOW),
    `kick:${UID}:chat:2026-09-06`
  );
  assert.equal(
    dedupKey('admit_approve', UID, 'chat', '2026-09-06T00:00:00.000Z', NOW),
    `admit_approve:${UID}:chat:2026-09-06`,
    'поллер заявок остаётся на эпизоде оплаты'
  );
  assert.equal(dedupKey('kick', UID, 'chat', null, NOW), `kick:${UID}:chat:none`);
});

test('dedupKey: два приглашения подряд получают разные ключи', () => {
  const first = dedupKey('admit_invite', UID, 'chat', '2026-09-06', NOW);
  const later = dedupKey('admit_invite', UID, 'chat', '2026-09-06', new Date(NOW.getTime() + 8 * DAY));
  assert.notEqual(first, later, 'иначе уникальный индекс по executed не даст выписать вторую');
  const sameDay = dedupKey('admit_invite', UID, 'chat', '2026-09-06', new Date(NOW.getTime() + 60_000));
  assert.notEqual(first, sameDay, 'даже в пределах одних суток ключи обязаны расходиться');
});

// ──────────────────────── планирование приглашений ────────────────────────

test('ссылка выписана 8 дней назад, человек не вошёл → выписываем новую', async () => {
  const pool = makePool({ actions: [executedInvite(69, 8)] });

  const id = await plannedAdmit(pool);

  assert.ok(id, 'новое приглашение должно быть запланировано');
  const fresh = pool.rows.find((r) => r.id === id);
  assert.equal(fresh.status, 'planned');
  assert.equal(fresh.dedup_key, `admit_invite:${UID}:chat:inv2026-08-06T09:00:00.000Z`);
  assert.notEqual(fresh.dedup_key, pool.rows[0].dedup_key, 'ключ не должен совпасть со старым executed');
});

test('ссылка выписана 2 дня назад → вторую не выписываем, старая ещё живёт', async () => {
  const pool = makePool({ actions: [executedInvite(69, 2)] });

  assert.equal(await plannedAdmit(pool), null);
  assert.equal(pool.rows.length, 1, 'в журнале не должно появиться лишней строки');
});

test('граница срока жизни ссылки: ровно TTL — ещё держим, TTL+минута — выписываем', async () => {
  const justAlive = makePool({ actions: [executedInvite(69, INVITE_TTL_DAYS - 0.001)] });
  assert.equal(await plannedAdmit(justAlive), null, 'ссылка ещё не протухла');

  const justDead = makePool({ actions: [executedInvite(69, INVITE_TTL_DAYS + 0.001)] });
  assert.ok(await plannedAdmit(justDead), 'ссылка протухла — можно новую');
});

test('незакрытая planned-строка блокирует второе приглашение', async () => {
  const pool = makePool({ actions: [{
    id: 70, telegram_user_id: UID, resource: 'chat', action: 'admit_invite',
    reason: 'paid_not_in_resource', status: 'planned',
    dedup_key: `admit_invite:${UID}:chat:inv2026-08-05`, created_at: new Date(NOW.getTime() - DAY),
  }] });

  assert.equal(await plannedAdmit(pool), null, 'приглашение уже ждёт исполнения');
});

test('провалившееся приглашение не считается выданным — планируем заново', async () => {
  const pool = makePool({ actions: [executedInvite(69, 1, { status: 'failed', invite_link: null })] });

  assert.ok(await plannedAdmit(pool), 'failed не даёт человеку ссылку, значит блокировать нечем');
});

test('второй ресурс не блокируется живой ссылкой на первый', async () => {
  const pool = makePool({ actions: [executedInvite(69, 2)] }); // resource: 'chat'

  const id = await upsertPlanned(pool, {
    profile_id: null, telegram_user_id: UID, resource: 'channel', action: 'admit_invite',
    reason: 'paid_not_in_resource', paid_until: '2026-09-06', batch_id: 'b', now: NOW,
  });
  assert.ok(id, 'канал и чат считаются отдельно');
});

test('kick: дедуп по эпизоду оплаты не тронут', async () => {
  const pool = makePool({ actions: [{
    id: 40, telegram_user_id: UID, resource: 'chat', action: 'kick', reason: 'expired',
    status: 'executed', dedup_key: `kick:${UID}:chat:2026-07-16`,
    executed_at: new Date(NOW.getTime() - 20 * DAY),
  }] });

  const again = { profile_id: null, telegram_user_id: UID, resource: 'chat', action: 'kick',
                  reason: 'expired', batch_id: 'b', now: NOW };
  assert.equal(await upsertPlanned(pool, { ...again, paid_until: '2026-07-16' }), null,
    'тот же эпизод оплаты — повторно не кикаем, даже спустя 20 дней');
  assert.ok(await upsertPlanned(pool, { ...again, paid_until: '2026-08-16' }),
    'оплата сдвинулась и снова истекла — новый эпизод, кик можно планировать');
});

// ──────────────────────────── исполнение ────────────────────────────

test('сквозняк: протухшая ссылка → планируем → исполняем, уникальный индекс не задет', async () => {
  const pool = makePool({ actions: [executedInvite(69, 8)] });
  const tg = makeTg();

  const id = await plannedAdmit(pool, 'tgacc-2026-08-06T0900');
  const done = await executeActions(pool, tg, { filter: 'admit', batchId: 'tgacc-2026-08-06T0900', now: NOW });

  assert.equal(done.length, 1);
  assert.equal(done[0].result, 'executed');
  assert.match(done[0].invite_link, /^https:\/\/t\.me\/\+new/);

  const fresh = pool.rows.find((r) => r.id === id);
  assert.equal(fresh.status, 'executed');
  assert.equal(pool.rows.filter((r) => r.action === 'admit_invite' && r.status === 'executed').length, 2,
    'старая строка остаётся в журнале, новая ложится рядом');
});

test('два полных цикла подряд не спотыкаются об уникальный индекс', async () => {
  // Ровно сценарий Соковниной: выписали, человек не вошёл, ссылка протухла, выписываем снова.
  const pool = makePool();
  const tg = makeTg();
  const later = new Date(NOW.getTime() + (INVITE_TTL_DAYS + 1) * DAY);

  const first = await upsertPlanned(pool, {
    profile_id: null, telegram_user_id: UID, resource: 'chat', action: 'admit_invite',
    reason: 'paid_not_in_resource', paid_until: '2026-09-06', batch_id: 'b1', now: NOW,
  });
  await executeActions(pool, tg, { filter: 'admit', batchId: 'b1', now: NOW });

  const second = await upsertPlanned(pool, {
    profile_id: null, telegram_user_id: UID, resource: 'chat', action: 'admit_invite',
    reason: 'paid_not_in_resource', paid_until: '2026-09-06', batch_id: 'b2', now: later,
  });
  assert.ok(second, 'протухла — выписываем новую');
  // Мини-pool воспроизводит uq_tg_access_actions_dedup и бросит на совпадении ключей.
  const done = await executeActions(pool, tg, { filter: 'admit', batchId: 'b2', now: later });

  assert.equal(done[0].result, 'executed');
  const keys = pool.rows.map((r) => r.dedup_key);
  assert.equal(new Set(keys).size, 2, 'у двух executed-строк ключи разные');
  assert.equal(pool.rows.find((r) => r.id === first).status, 'executed', 'первая осталась в журнале');
});

test('исполнение: живая ссылка появилась между планом и запуском → skipped_dup', async () => {
  const pool = makePool({ actions: [{
    id: 70, telegram_user_id: UID, resource: 'chat', action: 'admit_invite',
    reason: 'paid_not_in_resource', status: 'planned', batch_id: 'b',
    dedup_key: `admit_invite:${UID}:chat:inv2026-08-06`, created_at: NOW,
  }] });
  pool.rows.push(executedInvite(71, 1)); // кто-то успел выписать ссылку параллельно
  const tg = makeTg();

  const done = await executeActions(pool, tg, { filter: 'admit', batchId: 'b', now: NOW });

  assert.equal(done[0].result, 'skipped_dup');
  assert.equal(tg.calls.length, 0, 'в Telegram не ходим');
  assert.equal(pool.rows.find((r) => r.id === 70).status, 'skipped');
});

test('срок жизни ссылки в Telegram совпадает с тем, по которому считаем дедуп', async () => {
  const pool = makePool();
  const tg = makeTg();

  await plannedAdmit(pool, 'b');
  await executeActions(pool, tg, { filter: 'admit', batchId: 'b', now: NOW });

  const call = tg.calls.find((c) => c.method === 'createChatInviteLink');
  assert.equal(call.chatId, TG_CHAT_ID);
  assert.equal(call.opts.member_limit, 1);
  assert.equal(
    call.opts.expire_date,
    Math.floor(NOW.getTime() / 1000) + INVITE_TTL_DAYS * 24 * 3600,
    'разъедутся — вернётся баг «протухшая ссылка блокирует новую»'
  );
});

test('kick исполняется по живой перепроверке, а оплаченного щадит', async () => {
  const expired = {
    id: 80, telegram_user_id: UID, resource: 'chat', action: 'kick', reason: 'expired',
    status: 'planned', batch_id: 'b', dedup_key: `kick:${UID}:chat:2026-07-01`, created_at: NOW,
  };
  const pool = makePool({
    actions: [expired],
    profiles: [{ telegram_user_id: UID, paid_until: '2026-07-01T00:00:00.000Z', access_status: 'active', exempt: false }],
  });
  const tg = makeTg();

  const done = await executeActions(pool, tg, { filter: 'kick', batchId: 'b', now: NOW });
  assert.equal(done[0].result, 'executed');
  assert.equal(tg.calls[0].method, 'kickChatMember');

  const paidPool = makePool({
    actions: [{ ...expired, id: 81 }],
    profiles: [{ telegram_user_id: UID, paid_until: '2026-09-06T00:00:00.000Z', access_status: 'active', exempt: false }],
  });
  const paidTg = makeTg();
  const spared = await executeActions(paidPool, paidTg, { filter: 'kick', batchId: 'b', now: NOW });
  assert.equal(spared[0].result, 'skipped_recheck');
  assert.equal(spared[0].reason, 'paid_or_grace');
  assert.equal(paidTg.calls.length, 0);
});
