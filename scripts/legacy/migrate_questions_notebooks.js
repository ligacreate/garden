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

const downloadFile = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download: ${res.status}`);
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const arrayBuffer = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType };
};

const uploadToBucket = async (bucket, buffer, contentType, prefix) => {
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : contentType.includes('jpeg') ? 'jpg' : 'bin';
  const fileName = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
  const { error } = await newClient.storage.from(bucket).upload(fileName, buffer, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
  const { data } = newClient.storage.from(bucket).getPublicUrl(fileName);
  return data.publicUrl;
};

const main = async () => {
  console.log('Starting migration: questions + notebooks');

  const { data: oldQuestions, error: qErr } = await oldClient
    .from('questions')
    .select('*');
  if (qErr) throw qErr;

  const { data: oldNotebooks, error: nErr } = await oldClient
    .from('notebooks')
    .select('*');
  if (nErr) throw nErr;

  console.log(`Old questions: ${oldQuestions.length}, old notebooks: ${oldNotebooks.length}`);

  const { data: newQuestions, error: nqErr } = await newClient
    .from('questions')
    .select('id, question');
  if (nqErr) throw nqErr;

  const { data: newNotebooks, error: nnErr } = await newClient
    .from('notebooks')
    .select('id, title, created_at');
  if (nnErr) throw nnErr;

  const existingQuestions = new Set((newQuestions || []).map(q => q.question));
  const existingNotebookKeys = new Set((newNotebooks || []).map(n => `${n.title}|${n.created_at}`));

  const questionsToInsert = oldQuestions
    .filter(q => q.question && !existingQuestions.has(q.question))
    .map(q => ({
      question: q.question,
      order_index: q.order_index,
      created_at: q.created_at,
    }));

  if (questionsToInsert.length > 0) {
    const { error } = await newClient.from('questions').insert(questionsToInsert);
    if (error) throw error;
  }

  let notebooksInserted = 0;
  let notebookImagesCopied = 0;

  for (const nb of oldNotebooks) {
    const key = `${nb.title}|${nb.created_at}`;
    if (existingNotebookKeys.has(key)) continue;

    let imageUrl = nb.image_url || null;
    if (imageUrl) {
      try {
        const { buffer, contentType } = await downloadFile(imageUrl);
        imageUrl = await uploadToBucket('notebook-images', buffer, contentType, 'notebook');
        notebookImagesCopied++;
      } catch (e) {
        console.warn(`Notebook image copy failed for ${nb.id}: ${e.message}. Keeping old URL.`);
      }
    }

    const { error } = await newClient.from('notebooks').insert([{
      title: nb.title,
      description: nb.description,
      image_url: imageUrl,
      pdf_url: nb.pdf_url,
      created_at: nb.created_at,
    }]);
    if (error) throw error;
    notebooksInserted++;
  }

  console.log(`Questions inserted: ${questionsToInsert.length}`);
  console.log(`Notebooks inserted: ${notebooksInserted}`);
  console.log(`Notebook images copied: ${notebookImagesCopied}`);
  console.log('Migration complete.');
};

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
