// Фаза 3 — раннер SHADOW-прогона (standalone, НЕ подключён к Express/nightly).
// Запуск на проде (где доступен DATABASE_URL + токен):
//   set -a; . /opt/push-server/.env; set +a
//   TG_ACCESS_BOT_TOKEN=... node tgAccessShadow.mjs /path/to/roster_phase3.json
//
// Печатает человекочитаемый отчёт + JSON-хвост. НИ ОДНОГО мутирующего TG-вызова.
// Не трогает TargetHunter. Читает БД (SELECT) и TG (getChatMember) — только чтение.

import pg from 'pg';
import { readFileSync } from 'node:fs';
import { makeTgAccessClient } from './tgAccessClient.mjs';
import { runTgAccessReconcile } from './tgAccessReconcile.mjs';

const DATABASE_URL = process.env.DATABASE_URL;
const TOKEN = process.env.TG_ACCESS_BOT_TOKEN;
const rosterPath = process.argv[2];

if (!DATABASE_URL) { console.error('DATABASE_URL не задан'); process.exit(2); }
if (!TOKEN) { console.error('TG_ACCESS_BOT_TOKEN не задан'); process.exit(2); }

const roster = rosterPath ? JSON.parse(readFileSync(rosterPath, 'utf8')) : null;
if (!roster) console.warn('roster не передан — список «незнакомцев в чате» будет пуст');

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const tg = makeTgAccessClient(TOKEN);

function line(o) {
  return `  ${o.name || o.username || o.user_id} [${o.role || '—'}] uid=${o.uid || o.user_id} ${o.resource || (o.in ? o.in.join(',') : '')} paid_until=${o.paid_until || '—'} ${o.access_status || ''}`.trimEnd();
}

try {
  // sanity: бот видит оба ресурса (read)
  for (const cid of [-1002377682177, -1002432957741]) {
    const c = await tg.getChat(cid);
    console.log(`getChat ${cid}: ${c.ok ? JSON.stringify({ title: c.result.title, type: c.result.type }) : c.description}`);
  }

  const r = await runTgAccessReconcile({ mode: 'shadow', pool, tg, roster, now: new Date() });

  console.log('\n===== SHADOW RECONCILE =====');
  console.log('counts:', JSON.stringify(r.counts));
  console.log(`\n--- KICK (${r.kick.length}) — истёк + реально в ресурсе ---`);
  r.kick.forEach((o) => console.log(line(o)));
  console.log(`\n--- ADMIT (${r.admit.length}) — оплачен + НЕ в ресурсе ---`);
  r.admit.forEach((o) => console.log(line(o)));
  console.log(`\n--- SKIP exempt (${r.skip_exempt.length}) ---`);
  r.skip_exempt.forEach((o) => console.log(line(o)));
  console.log(`\n--- SKIP paused_manual (${r.skip_manual.length}) ---`);
  r.skip_manual.forEach((o) => console.log(line(o)));
  console.log(`\n--- SKIP paid_until пусто (${r.skip_unknown_paid.length}) ---`);
  r.skip_unknown_paid.forEach((o) => console.log(line(o)));
  console.log(`\n--- SKIP unknown (в чате, без профиля — НЕ трогаем) (${r.skip_unknown_members.length}) ---`);
  r.skip_unknown_members.forEach((o) => console.log(line(o)));
  if (r.errors.length) {
    console.log(`\n--- getChatMember errors (${r.errors.length}) ---`);
    r.errors.forEach((e) => console.log(`  ${e.name} uid=${e.uid} ${e.resource}: ${e.error}`));
  }
  console.log('\n===== JSON =====');
  console.log(JSON.stringify(r, null, 2));
} catch (e) {
  console.error('shadow run failed:', e);
  process.exitCode = 1;
} finally {
  await pool.end();
}
