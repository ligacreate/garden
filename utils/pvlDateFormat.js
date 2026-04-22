import { instantFromWallClockInTimeZone } from './meetingTime';

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

const PVL_MS_TZ = 'Europe/Moscow';

/**
 * Событие календаря ПВЛ хранит время в мск (наивные ISO без Z) либо как момент (ISO с Z/offset).
 * @param {string|Date|null|undefined} raw
 * @returns {Date|null}
 */
export function getPvlCalendarEventInstant(raw) {
    if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
    const s = String(raw || '').trim();
    if (!s) return null;
    if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s.replace(/\.\d+/, ''))) {
        const d = new Date(s);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    const m = s.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}):(\d{2})/);
    if (m) {
        const inst = instantFromWallClockInTimeZone(m[1], `${m[2]}:${m[3]}`, PVL_MS_TZ);
        return inst && !Number.isNaN(inst.getTime()) ? inst : null;
    }
    const d2 = parseToDate(s);
    return d2;
}

/**
 * Подстрока для списков календаря: дата в мск; время — «локально · мск» вне Москвы, иначе одна метка мск.
 * @param {string|Date|null|undefined} raw
 */
export function formatPvlCalendarEventDateTimeUserFacing(raw) {
    const instant = getPvlCalendarEventInstant(raw);
    if (!instant) {
        if (raw == null || raw === '') return { dateStr: '—', timeLine: '—', mode: 'invalid' };
        return { dateStr: String(raw), timeLine: '', mode: 'invalid' };
    }
    let viewerTz = '';
    try {
        viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
        viewerTz = '';
    }
    const dateMsk = new Intl.DateTimeFormat('en-CA', {
        timeZone: PVL_MS_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(instant);
    const [y, mo, d] = dateMsk.split('-');
    const dateStr = `${d}-${mo}-${y}`;

    const mskTime = new Intl.DateTimeFormat('ru-RU', {
        timeZone: PVL_MS_TZ,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(instant);
    const localTime = new Intl.DateTimeFormat('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(instant);

    const inMoscow = viewerTz === PVL_MS_TZ;
    if (inMoscow) {
        return { dateStr, timeLine: `${mskTime} мск`, mode: 'msk_only', mskTime, localTime };
    }
    return { dateStr, timeLine: `${localTime} · ${mskTime} мск`, mode: 'dual', mskTime, localTime };
}

/**
 * Разобранные части для вёрстки: локальное время обычным цветом, мск — приглушённо (как во «встречах»).
 * @param {string|Date|null|undefined} raw
 */
export function getPvlCalendarEventTimeDisplay(raw) {
    const base = formatPvlCalendarEventDateTimeUserFacing(raw);
    if (base.mode === 'dual' && base.localTime && base.mskTime) {
        return {
            dateStr: base.dateStr,
            mode: 'dual',
            localTime: base.localTime,
            mskTime: base.mskTime,
        };
    }
    if (base.mode === 'msk_only' && base.mskTime) {
        return { dateStr: base.dateStr, mode: 'msk_only', mskTime: base.mskTime };
    }
    return {
        dateStr: base.dateStr,
        mode: 'invalid',
        timeLine: base.timeLine && base.timeLine !== '—' ? base.timeLine : (base.timeLine || '—'),
    };
}
