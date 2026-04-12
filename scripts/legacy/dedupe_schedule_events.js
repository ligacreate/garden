import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.resolve(__dirname, '..', '.env');

const parseEnv = (content) => {
  const out = {};
  content.split(/\r?\n/).forEach((line) => {
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

if (!fs.existsSync(ENV_PATH)) {
  console.error(`.env not found at ${ENV_PATH}`);
  process.exit(1);
}

const env = parseEnv(fs.readFileSync(ENV_PATH, 'utf8'));
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const normalize = (v) => (v || '').toString().trim().toLowerCase();

const eventSort = (a, b) => {
  const aTs = a.created_at ? new Date(a.created_at).getTime() : 0;
  const bTs = b.created_at ? new Date(b.created_at).getTime() : 0;
  if (aTs !== bTs) return bTs - aTs;
  return Number(b.id) - Number(a.id);
};

const buildGroups = (events) => {
  const groupsByGardenId = new Map();
  const groupsByContent = new Map();

  for (const ev of events) {
    if (ev.garden_id != null) {
      const key = String(ev.garden_id);
      if (!groupsByGardenId.has(key)) groupsByGardenId.set(key, []);
      groupsByGardenId.get(key).push(ev);
    }

    const contentKey = [
      normalize(ev.date),
      normalize(ev.time),
      normalize(ev.title),
      normalize(ev.city),
    ].join('|');
    if (!groupsByContent.has(contentKey)) groupsByContent.set(contentKey, []);
    groupsByContent.get(contentKey).push(ev);
  }

  const duplicatesByGardenId = [...groupsByGardenId.values()].filter((g) => g.length > 1);
  const duplicatesByContent = [...groupsByContent.values()].filter((g) => g.length > 1);
  return { duplicatesByGardenId, duplicatesByContent };
};

const collectDeleteIds = (groups) => {
  const ids = new Set();
  const keepByGroup = [];

  for (const group of groups) {
    const sorted = [...group].sort(eventSort);
    const keep = sorted[0];
    const remove = sorted.slice(1);
    keepByGroup.push({ keep, remove });
    remove.forEach((ev) => ids.add(ev.id));
  }

  return { ids, keepByGroup };
};

const printPreview = (label, keepByGroup) => {
  if (keepByGroup.length === 0) {
    console.log(`${label}: duplicates not found`);
    return;
  }
  console.log(`${label}: ${keepByGroup.length} duplicate group(s)`);
  keepByGroup.forEach((entry, idx) => {
    const k = entry.keep;
    console.log(
      `  ${idx + 1}) keep id=${k.id} | garden_id=${k.garden_id ?? 'null'} | ${k.date} ${k.time} | ${k.title} | ${k.city}`
    );
    entry.remove.forEach((r) => {
      console.log(
        `     remove id=${r.id} | garden_id=${r.garden_id ?? 'null'} | ${r.date} ${r.time} | ${r.title} | ${r.city}`
      );
    });
  });
};

const main = async () => {
  const apply = process.argv.includes('--apply');
  const modeArg = process.argv.find((a) => a.startsWith('--mode='));
  const mode = modeArg ? modeArg.split('=')[1] : 'all';
  const allowedModes = new Set(['all', 'garden', 'content']);
  if (!allowedModes.has(mode)) {
    console.error('Unknown mode. Use --mode=all|garden|content');
    process.exit(1);
  }

  const { data: events, error } = await client
    .from('events')
    .select('id, garden_id, date, time, title, city, created_at')
    .order('id', { ascending: true });

  if (error) {
    console.error('Failed to fetch events:', error.message);
    process.exit(1);
  }

  const { duplicatesByGardenId, duplicatesByContent } = buildGroups(events || []);
  const gardenSelection = mode === 'all' || mode === 'garden' ? duplicatesByGardenId : [];
  const contentSelection = mode === 'all' || mode === 'content' ? duplicatesByContent : [];

  const { ids: removeByGarden, keepByGroup: gardenPreview } = collectDeleteIds(gardenSelection);
  const { ids: removeByContent, keepByGroup: contentPreview } = collectDeleteIds(contentSelection);

  const deleteIds = new Set([...removeByGarden, ...removeByContent]);

  console.log(`Total events: ${(events || []).length}`);
  printPreview('Duplicate by garden_id', gardenPreview);
  printPreview('Duplicate by content', contentPreview);
  console.log(`Unique rows to remove: ${deleteIds.size}`);

  if (!apply) {
    console.log('Dry run complete. Re-run with --apply to delete duplicates.');
    return;
  }

  if (deleteIds.size === 0) {
    console.log('Nothing to delete.');
    return;
  }

  const idsArray = [...deleteIds];
  const { error: delError } = await client.from('events').delete().in('id', idsArray);
  if (delError) {
    console.error('Failed to delete duplicates:', delError.message);
    process.exit(1);
  }

  console.log(`Deleted rows: ${idsArray.length}`);
};

main().catch((e) => {
  console.error('Script failed:', e.message);
  process.exit(1);
});
