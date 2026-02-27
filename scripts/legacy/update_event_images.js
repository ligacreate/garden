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

const NEW_URL = env.VITE_SUPABASE_URL;
const NEW_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!NEW_URL || !NEW_SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const OLD_URL = 'https://cuwqcncyjlqarvawjndb.supabase.co';
const OLD_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1d3FjbmN5amxxYXJ2YXdqbmRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5MzI4NzYsImV4cCI6MjA3OTUwODg3Nn0.Ldl0FX28nSAkiNaimAPI4wjn1FSJ5ZtfgaaDzN_5I_Q';

const oldClient = createClient(OLD_URL, OLD_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const newClient = createClient(NEW_URL, NEW_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const downloadImage = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const arrayBuffer = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType };
};

const uploadImageToNew = async (buffer, contentType, oldId) => {
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const fileName = `legacy_${oldId}_${Date.now()}.${ext}`;
  const { error } = await newClient.storage.from('event-images').upload(fileName, buffer, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
  const { data } = newClient.storage.from('event-images').getPublicUrl(fileName);
  return data.publicUrl;
};

const buildKey = (e) => `${e.date}|${e.time}|${e.title}|${e.city}`;

const main = async () => {
  console.log('Updating event images...');

  const { data: oldEvents, error: oldEventsError } = await oldClient
    .from('events')
    .select('id, date, time, title, city, image_url');
  if (oldEventsError) throw oldEventsError;

  const { data: newEvents, error: newEventsError } = await newClient
    .from('events')
    .select('id, date, time, title, city, image_url');
  if (newEventsError) throw newEventsError;

  const newMap = new Map(newEvents.map((e) => [buildKey(e), e]));

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const oldEv of oldEvents) {
    if (!oldEv.image_url) { skipped++; continue; }
    const key = buildKey(oldEv);
    const match = newMap.get(key);
    if (!match) { skipped++; continue; }

    const hasNewBucket = match.image_url && match.image_url.includes('event-images');
    if (hasNewBucket) { skipped++; continue; }

    try {
      const { buffer, contentType } = await downloadImage(oldEv.image_url);
      const newUrl = await uploadImageToNew(buffer, contentType, oldEv.id || 'old');
      const { error: updateError } = await newClient
        .from('events')
        .update({ image_url: newUrl })
        .eq('id', match.id);
      if (updateError) throw updateError;
      updated++;
    } catch (e) {
      failed++;
      console.warn(`Image update failed for key ${key}: ${e.message}`);
    }
  }

  console.log(`Done. Updated: ${updated}, skipped: ${skipped}, failed: ${failed}`);
};

main().catch((e) => {
  console.error('Image update failed:', e);
  process.exit(1);
});
