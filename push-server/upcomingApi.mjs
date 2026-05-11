// Public read-only API: GET /api/v1/upcoming.json
// План: plans/2026-05-04-public-upcoming-api.md

export const UPCOMING_CACHE_TTL_MS = 5 * 60 * 1000;

export const ROLE_LABELS = {
  applicant: 'Абитуриент',
  intern: 'Стажёр',
  leader: 'Ведущая',
  mentor: 'Ментор',
  curator: 'Куратор',
  admin: 'Главный садовник'
};

export const formatRoleLabel = (role) =>
  ROLE_LABELS[String(role || '').toLowerCase()] || 'Ведущая';

export const todayInMoscow = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const map = Object.fromEntries(
    parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
  );
  return `${map.year}-${map.month}-${map.day}`;
};

export const parseDateParam = (raw) => {
  const v = String(raw || '').trim();
  if (!v) return todayInMoscow();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return v;
};

export const parseDaysParam = (raw, fallback = 8) => {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  if (n > 60) return 60;
  return n;
};

export const parsePriceRub = (raw) => {
  if (raw == null) return 0;
  const m = String(raw).match(/\d+/g);
  if (!m) return 0;
  return Number.parseInt(m.join(''), 10) || 0;
};

export const normalizeFormat = (raw) =>
  String(raw || '').toLowerCase() === 'online' ? 'online' : 'offline';

export const normalizeCity = (raw, format) => {
  if (format === 'online') return null;
  const v = String(raw || '').trim();
  if (!v) return null;
  const lower = v.toLowerCase();
  if (lower === 'онлайн' || lower === 'online') return null;
  return v;
};

export const normalizeDescription = (raw) => {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  return trimmed === '' ? null : trimmed;
};

export const UPCOMING_SQL = `
  WITH window_events AS (
    SELECT
      e.id,
      e.starts_at,
      e.title,
      e.description,
      e.meeting_format,
      e.city,
      e.price,
      m.user_id,
      p.name AS host_name,
      p.role AS host_role,
      p.avatar_url AS host_photo,
      to_char(e.starts_at AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD"T"HH24:MI:SS') || '+03:00' AS starts_at_iso,
      lower(btrim(coalesce(e.title, ''))) AS title_norm,
      extract(dow from e.starts_at AT TIME ZONE 'Europe/Moscow')::int AS dow,
      to_char(e.starts_at AT TIME ZONE 'Europe/Moscow', 'HH24:MI') AS hhmm
    FROM public.events e
    JOIN public.meetings m ON m.id = e.garden_id
    JOIN public.profiles p ON p.id = m.user_id
    WHERE e.starts_at >= ($1::date::timestamp AT TIME ZONE 'Europe/Moscow')
      AND e.starts_at <  (($1::date + $2::int)::timestamp AT TIME ZONE 'Europe/Moscow')
  ),
  recurring_groups AS (
    SELECT
      m2.user_id,
      lower(btrim(coalesce(e2.title, ''))) AS title_norm,
      extract(dow from e2.starts_at AT TIME ZONE 'Europe/Moscow')::int AS dow,
      to_char(e2.starts_at AT TIME ZONE 'Europe/Moscow', 'HH24:MI') AS hhmm,
      count(*) AS cnt
    FROM public.events e2
    JOIN public.meetings m2 ON m2.id = e2.garden_id
    WHERE e2.starts_at >= (($1::date - 60)::timestamp AT TIME ZONE 'Europe/Moscow')
      AND e2.starts_at <  (($1::date + 60)::timestamp AT TIME ZONE 'Europe/Moscow')
    GROUP BY 1, 2, 3, 4
  )
  SELECT
    we.id,
    we.starts_at_iso,
    we.title,
    we.description,
    we.meeting_format,
    we.city,
    we.price,
    we.host_name,
    we.host_role,
    we.host_photo,
    coalesce(rg.cnt, 1) AS recurring_cnt
  FROM window_events we
  LEFT JOIN recurring_groups rg
    ON rg.user_id = we.user_id
   AND rg.title_norm = we.title_norm
   AND rg.dow = we.dow
   AND rg.hhmm = we.hhmm
  ORDER BY we.starts_at ASC, we.id ASC
`;

export const rowToUpcomingItem = (row) => {
  const format = normalizeFormat(row.meeting_format);
  return {
    id: `evt_${row.id}`,
    starts_at: row.starts_at_iso,
    title: row.title || '',
    description: normalizeDescription(row.description),
    format,
    city: normalizeCity(row.city, format),
    price_rub: parsePriceRub(row.price),
    is_recurring: Number(row.recurring_cnt) >= 2,
    host: {
      name: row.host_name || '',
      role: formatRoleLabel(row.host_role),
      photo_url: row.host_photo || null
    }
  };
};

export const buildUpcomingPayload = async (pool, from, days) => {
  const { rows } = await pool.query(UPCOMING_SQL, [from, days]);
  return rows.map(rowToUpcomingItem);
};

export const createUpcomingHandler = ({ pool, cache, now = () => Date.now() }) => async (req, res) => {
  const from = parseDateParam(req.query.from);
  const days = parseDaysParam(req.query.days, 8);
  if (from === null) {
    return res.status(400).json({ error: 'Invalid `from` (expected YYYY-MM-DD)' });
  }
  if (days === null) {
    return res.status(400).json({ error: 'Invalid `days` (expected integer ≥ 1)' });
  }

  const cacheKey = `${from}|${days}`;
  const ts = now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > ts) {
    res.setHeader('X-Cache', 'HIT');
    res.setHeader(
      'Cache-Control',
      `public, max-age=${Math.max(1, Math.round((cached.expiresAt - ts) / 1000))}`
    );
    return res.json(cached.body);
  }

  try {
    const body = await buildUpcomingPayload(pool, from, days);
    cache.set(cacheKey, { expiresAt: ts + UPCOMING_CACHE_TTL_MS, body });
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Cache-Control', `public, max-age=${UPCOMING_CACHE_TTL_MS / 1000}`);
    return res.json(body);
  } catch (error) {
    console.error('[upcoming.json] query failed', error);
    return res.status(503).json({ error: 'Upstream unavailable' });
  }
};
