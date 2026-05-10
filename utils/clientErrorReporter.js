// MON-001 — клиентский репортер ошибок для @garden_grants_monitor_bot.
// Шлёт JS exceptions, unhandledrejections и ErrorBoundary catches на
// бэкенд /api/client-error (auth.skrebeyko.ru), который пересылает в TG.
//
// Защита от шторма:
//   - локальный rate-limit через sessionStorage: один и тот же
//     `message+stack`-hash отправляем не чаще раза в 60 секунд.
//   - на сервере отдельный rate-limit (per IP+messageHash, 60s окно
//     + 50/час потолок).
//
// Не падаем рекурсивно: catch + console.warn, ничего не репортим.

const AUTH_URL = import.meta.env.VITE_AUTH_URL || 'https://auth.skrebeyko.ru';
const ENDPOINT = `${AUTH_URL}/api/client-error`;
const RATE_LIMIT_MS = 60 * 1000;
const RATE_LIMIT_KEY = 'garden_clienterror_seen';
const RATE_LIMIT_MAX_ENTRIES = 50;

// Build ID прокинут через vite define (vite.config.js).
// Если по какой-то причине не определён — пишем 'unknown'.
const BUILD_ID = (typeof __BUILD_ID__ !== 'undefined') ? __BUILD_ID__ : 'unknown';

const safeStringify = (value) => {
    try { return typeof value === 'string' ? value : JSON.stringify(value); }
    catch { return String(value); }
};

// Простой 32-bit hash (FNV-1a) — нам важна только дедупликация в окне 60с.
const hash = (str) => {
    let h = 0x811c9dc5;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
};

const readSeen = () => {
    try {
        const raw = sessionStorage.getItem(RATE_LIMIT_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
};

const writeSeen = (seen) => {
    try {
        const keys = Object.keys(seen);
        if (keys.length > RATE_LIMIT_MAX_ENTRIES) {
            const sorted = keys.sort((a, b) => seen[a] - seen[b]);
            sorted.slice(0, keys.length - RATE_LIMIT_MAX_ENTRIES).forEach((k) => delete seen[k]);
        }
        sessionStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(seen));
    } catch { /* sessionStorage недоступен — переживём */ }
};

const isThrottled = (key) => {
    const seen = readSeen();
    const last = seen[key] || 0;
    const now = Date.now();
    if (now - last < RATE_LIMIT_MS) return true;
    seen[key] = now;
    writeSeen(seen);
    return false;
};

const getCurrentUserSummary = () => {
    try {
        const raw = localStorage.getItem('garden_currentUser');
        if (!raw) return null;
        const u = JSON.parse(raw);
        return {
            id: u?.id || null,
            email: u?.email || null,
            name: u?.name || null,
        };
    } catch { return null; }
};

let inFlight = false;

export const reportClientError = (payload = {}) => {
    if (inFlight) return; // не нагружаем сеть параллельными штормами
    const message = String(payload.message || 'unknown error');
    const stack = payload.stack ? String(payload.stack).slice(0, 4000) : '';
    const dedupeKey = hash(`${message}::${stack.slice(0, 200)}`);
    if (isThrottled(dedupeKey)) return;

    const body = {
        message,
        stack,
        source: payload.source || 'window',
        url: typeof window !== 'undefined' ? window.location?.href : '',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        bundleId: BUILD_ID,
        bundleScript: getCurrentBundleScript(),
        user: getCurrentUserSummary(),
        ts: new Date().toISOString(),
        extra: payload.extra ? safeStringify(payload.extra).slice(0, 2000) : undefined,
    };

    inFlight = true;

    // keepalive: позволяет долететь, даже если страница закрывается.
    fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
        credentials: 'omit',
    })
        .catch((err) => {
            // Не репортим ошибку репортера, чтобы не словить рекурсию.
            console.warn('[clientErrorReporter] report failed:', err?.message || err);
        })
        .finally(() => { inFlight = false; });
};

const getCurrentBundleScript = () => {
    try {
        const scripts = document.querySelectorAll('script[src*="assets/index-"]');
        if (!scripts.length) return null;
        const src = scripts[scripts.length - 1].getAttribute('src') || '';
        const match = src.match(/assets\/index-[A-Za-z0-9_-]+\.js/);
        return match ? match[0] : src;
    } catch { return null; }
};

export const installGlobalErrorHandlers = () => {
    if (typeof window === 'undefined') return;
    if (window.__gardenClientErrorHandlersInstalled) return;
    window.__gardenClientErrorHandlersInstalled = true;

    window.addEventListener('error', (event) => {
        const err = event.error;
        const message = err?.message || event.message || 'window.error';
        reportClientError({
            source: 'window.error',
            message,
            stack: err?.stack || '',
            extra: {
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
            },
        });
    });

    window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason;
        const message = reason?.message || (typeof reason === 'string' ? reason : 'unhandledrejection');
        reportClientError({
            source: 'unhandledrejection',
            message,
            stack: reason?.stack || '',
        });
    });
};
