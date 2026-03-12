/**
 * Нормализует payment_link в meetings и registration_link в events:
 * @username -> https://t.me/username
 * Исправляет старые записи (например @AneleRay).
 *
 * Запуск: node scripts/normalize-payment-links.mjs
 * Требуется .env с VITE_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const parseEnv = (content) => {
  const out = {};
  (content || '').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  });
  return out;
};

const normalizeLink = (val) => {
  const s = String(val || '').trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) return s;
  const tg = s.replace(/^@/, '').replace(/^(?:https?:\/\/)?(?:t\.me\/)?/i, '').replace(/\s+/g, '');
  return tg ? `https://t.me/${tg}` : s;
};

const envPath = path.resolve(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.error('.env не найден. Создайте .env с VITE_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const env = parseEnv(fs.readFileSync(envPath, 'utf8'));
const url = env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('В .env нужны VITE_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function main() {
  let updatedMeetings = 0;
  let updatedEvents = 0;

  // Meetings
  const { data: meetings, error: meErr } = await supabase
    .from('meetings')
    .select('id, payment_link')
    .not('payment_link', 'is', null);

  if (meErr) {
    console.error('Ошибка загрузки meetings:', meErr.message);
    process.exit(1);
  }

  for (const m of meetings || []) {
    const link = m.payment_link?.trim();
    if (!link || /^https?:\/\//i.test(link)) continue;

    const normalized = normalizeLink(link);
    const { error } = await supabase
      .from('meetings')
      .update({ payment_link: normalized })
      .eq('id', m.id);

    if (error) {
      console.warn(`meetings.id=${m.id}: ${error.message}`);
    } else {
      console.log(`meetings: ${link} -> ${normalized}`);
      updatedMeetings++;
    }
  }

  // Events (registration_link)
  const { data: events, error: evErr } = await supabase
    .from('events')
    .select('id, registration_link')
    .not('registration_link', 'is', null);

  if (evErr) {
    console.warn('events (возможно колонка отсутствует):', evErr.message);
  } else {
    for (const e of events || []) {
      const link = e.registration_link?.trim();
      if (!link || /^https?:\/\//i.test(link)) continue;

      const normalized = normalizeLink(link);
      const { error } = await supabase
        .from('events')
        .update({ registration_link: normalized })
        .eq('id', e.id);

      if (error) {
        console.warn(`events.id=${e.id}: ${error.message}`);
      } else {
        console.log(`events: ${link} -> ${normalized}`);
        updatedEvents++;
      }
    }
  }

  console.log(`\nГотово. Обновлено: meetings=${updatedMeetings}, events=${updatedEvents}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
