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

// Old (meetings) project credentials from mini.zip
const OLD_URL = 'https://cuwqcncyjlqarvawjndb.supabase.co';
const OLD_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1d3FjbmN5amxxYXJ2YXdqbmRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5MzI4NzYsImV4cCI6MjA3OTUwODg3Nn0.Ldl0FX28nSAkiNaimAPI4wjn1FSJ5ZtfgaaDzN_5I_Q';

const oldClient = createClient(OLD_URL, OLD_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const newClient = createClient(NEW_URL, NEW_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const getExtFromUrl = (url) => {
  try {
    const u = new URL(url);
    const pathname = u.pathname || '';
    const ext = path.extname(pathname).replace('.', '').toLowerCase();
    return ext || 'jpg';
  } catch {
    return 'jpg';
  }
};

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

const main = async () => {
  console.log('Starting migration: events + cities');

  // Check cities table exists in new project
  let citiesSupported = true;
  const citiesCheck = await newClient.from('cities').select('id').limit(1);
  if (citiesCheck.error) {
    citiesSupported = false;
    console.warn('Warning: cities table not found in new project. Skipping cities migration.');
  }

  // Fetch old data
  const { data: oldEvents, error: oldEventsError } = await oldClient
    .from('events')
    .select('*');
  if (oldEventsError) throw oldEventsError;

  const { data: oldCities, error: oldCitiesError } = citiesSupported
    ? await oldClient.from('cities').select('*')
    : { data: [], error: null };
  if (oldCitiesError) throw oldCitiesError;

  console.log(`Old events: ${oldEvents.length}, old cities: ${oldCities.length}`);

  // Fetch existing events in new project to avoid duplicates
  const { data: newEvents, error: newEventsError } = await newClient
    .from('events')
    .select('id, title, date, time, city');
  if (newEventsError) throw newEventsError;

  const existingKeys = new Set(
    (newEvents || []).map((e) => `${e.date}|${e.time}|${e.title}|${e.city}`)
  );

  const eventsToInsert = [];
  let copiedImages = 0;
  let skipped = 0;

  for (const ev of oldEvents) {
    const key = `${ev.date}|${ev.time}|${ev.title}|${ev.city}`;
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }

    let imageUrl = ev.image_url || null;
    if (imageUrl) {
      try {
        const { buffer, contentType } = await downloadImage(imageUrl);
        imageUrl = await uploadImageToNew(buffer, contentType, ev.id || 'old');
        copiedImages++;
      } catch (e) {
        console.warn(`Image copy failed for event ${ev.id}: ${e.message}. Keeping old URL.`);
      }
    }

    eventsToInsert.push({
      date: ev.date,
      title: ev.title,
      category: ev.category,
      time: ev.time,
      speaker: ev.speaker,
      location: ev.location,
      city: ev.city,
      description: ev.description,
      image_gradient: ev.image_gradient,
      image_url: imageUrl,
      registration_link: ev.registration_link,
      created_at: ev.created_at,
      price: ev.price || null,
      garden_id: ev.garden_id || null,
    });
  }

  console.log(`Events to insert: ${eventsToInsert.length} (skipped: ${skipped})`);

  if (eventsToInsert.length > 0) {
    const { error: insertError } = await newClient.from('events').insert(eventsToInsert);
    if (insertError) throw insertError;
  }

  if (citiesSupported && oldCities.length > 0) {
    const { data: newCities, error: newCitiesError } = await newClient
      .from('cities')
      .select('name');
    if (newCitiesError) throw newCitiesError;

    const existingCityNames = new Set((newCities || []).map((c) => c.name));
    const citiesToInsert = oldCities
      .map((c) => c.name)
      .filter((name) => name && !existingCityNames.has(name))
      .map((name) => ({ name }));

    if (citiesToInsert.length > 0) {
      const { error: cityInsertError } = await newClient.from('cities').insert(citiesToInsert);
      if (cityInsertError) throw cityInsertError;
    }

    console.log(`Cities inserted: ${citiesToInsert.length}`);
  }

  console.log(`Migration complete. Images copied: ${copiedImages}`);
};

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
