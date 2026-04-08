/** Единый формат дат в ПВЛ: «ДД-ММ-ГГГГ», при наличии времени — «ДД-ММ-ГГГГ, ЧЧ:ММ». */

function pad2(n) {
    return String(n).padStart(2, '0');
}

function parseToDate(input) {
    if (input == null || input === '') return null;
    if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
    const s = String(input).trim();
    if (!s) return null;
    const iso = new Date(s);
    if (!Number.isNaN(iso.getTime())) return iso;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
    if (m) {
        const [, y, mo, dayNum, hh, mm] = m;
        const dt = new Date(Number(y), Number(mo) - 1, Number(dayNum), hh != null ? Number(hh) : 0, mm != null ? Number(mm) : 0);
        return Number.isNaN(dt.getTime()) ? null : dt;
    }
    const dm = s.match(/^(\d{2})-(\d{2})-(\d{4})(?:[T\s,](\d{2}):(\d{2}))?/);
    if (dm) {
        const [, dayNum, mo, y, hh, mm] = dm;
        const dt = new Date(Number(y), Number(mo) - 1, Number(dayNum), hh != null ? Number(hh) : 0, mm != null ? Number(mm) : 0);
        return Number.isNaN(dt.getTime()) ? null : dt;
    }
    return null;
}

/**
 * @param {string|Date|null|undefined} input
 * @returns {string}
 */
export function formatPvlDateTime(input) {
    const d = parseToDate(input);
    if (!d) {
        if (input == null || input === '') return '—';
        return String(input);
    }
    const dateOnly = `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
    const hasTime = (() => {
        const s = String(input).trim();
        return /[T\s,]\d{2}:\d{2}/.test(s)
            || (s.length > 10 && /^\d{4}-\d{2}-\d{2}/.test(s) && (d.getHours() !== 0 || d.getMinutes() !== 0));
    })();
    if (hasTime) {
        return `${dateOnly}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    }
    return dateOnly;
}

export function formatPvlDateOnly(input) {
    const d = parseToDate(input);
    if (!d) {
        if (input == null || input === '') return '—';
        return String(input);
    }
    return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
}
