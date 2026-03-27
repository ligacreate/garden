import crypto from 'crypto';

const normalizeValue = (v) => {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

const buildSortedBase = (flat) => Object.entries(flat || {})
  .filter(([k]) => k !== 'signature' && k !== 'sign' && k !== 'hash')
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, v]) => `${k}:${normalizeValue(v)}`)
  .join(';');

const hashHex = (algo, value) => crypto.createHash(algo).update(value, 'utf8').digest('hex');
const hmacHex = (algo, value, secret) => crypto.createHmac(algo, secret).update(value, 'utf8').digest('hex');

export const verifyProdamusSignature = (flatBody, secret) => {
  const signature = String(flatBody?.signature || flatBody?.sign || flatBody?.hash || '').trim();
  if (!signature || !secret) return false;

  const rawJson = JSON.stringify(flatBody || {});
  const sortedBase = buildSortedBase(flatBody || {});
  const normalizedSecret = String(secret || '').trim();
  const sigLower = signature.toLowerCase();

  const candidates = [
    hmacHex('sha256', rawJson, normalizedSecret),
    hmacHex('sha256', sortedBase, normalizedSecret),
    hashHex('sha256', `${sortedBase}${normalizedSecret}`),
    hashHex('md5', `${sortedBase}${normalizedSecret}`),
    hashHex('sha1', `${sortedBase}${normalizedSecret}`)
  ]
    .map((v) => String(v || '').toLowerCase())
    .filter(Boolean);

  return candidates.some((candidate) => candidate === sigLower);
};
