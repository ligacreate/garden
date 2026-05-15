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

/**
 * BUG-PRODAMUS-SIGNATURE-HEADER (2026-05-16): Prodamus присылает подпись
 * в HTTP-заголовке `Sign` (HMAC-SHA256, 64 hex chars), а не в теле.
 * verifyProdamusSignature ищет signature/sign/hash в теле — эта функция
 * мостит заголовок в `signature` поле payload, если его там ещё нет.
 *
 * Приоритет тела: если в payload уже есть signature/sign/hash — берём
 * оттуда (на случай альтернативной формы у других провайдеров).
 *
 * @param {object} body
 * @param {object} headers — Express req.headers (lower-case keys)
 * @returns {object} payload, готовый для verifyProdamusSignature
 */
export const pickSignatureSource = (body, headers = {}) => {
  if (!body || typeof body !== 'object') return body || {};
  if (body.signature || body.sign || body.hash) return body;
  const headerSig = String(headers?.sign || headers?.signature || '').trim();
  if (!headerSig) return body;
  return { ...body, signature: headerSig };
};

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
