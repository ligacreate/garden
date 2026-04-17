import React, { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { loadViewPreferences, saveViewPreferences } from '../services/pvlAppKernel';
import { pvlCohortIdsEquivalent, pvlDomainApi } from '../services/pvlMockApi';
import { formatPvlDateTime } from '../utils/pvlDateFormat';

/** Согласовано с прототипом дедлайнов ПВЛ */
const PVL_TODAY = '2026-04-15';

const CALENDAR_UI_PREFS_KEY = 'admin.calendar';

function readCalendarUiPrefs() {
    try {
        const p = loadViewPreferences(CALENDAR_UI_PREFS_KEY);
        return p && typeof p === 'object' ? p : null;
    } catch {
        return null;
    }
}

function monthDateFromPrefsYm(ym) {
    if (!ym || typeof ym !== 'string' || !/^(\d{4})-(\d{2})$/.test(ym)) return null;
    const [y, m] = ym.split('-').map(Number);
    if (!y || m < 1 || m > 12) return null;
    return new Date(y, m - 1, 1, 12, 0, 0);
}

export const PVL_CAL_EVENT_LABELS = {
    lesson: 'Урок',
    practicum: 'Практикум',
    practicum_done: 'Проведенный практикум',
    breakfast: 'Завтрак',
    mentor_meeting: 'Практикум',
    live_stream: 'Завтрак',
    lesson_release: 'Урок',
};

export function calendarEventDotClass(eventType) {
    switch (String(eventType || '').toLowerCase()) {
        case 'lesson':
        case 'lesson_release':
            return 'bg-amber-400/90';
        case 'practicum':
        case 'mentor_meeting':
            return 'bg-teal-400/90';
        case 'practicum_done':
            return 'bg-emerald-500/90';
        case 'breakfast':
        case 'live_stream':
            return 'bg-violet-400/85';
        default:
            return 'bg-slate-300';
    }
}

const CAL_WEEKDAYS_LOWER = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

function formatCalendarMonthYearRu(d) {
    const y = d.getFullYear();
    const m = d.toLocaleString('ru-RU', { month: 'long' });
    const cap = m.charAt(0).toUpperCase() + m.slice(1);
    return `${cap} ${y} г.`;
}

/** Ключ дня YYYY-MM-DD для сетки: учитывает date в YYYY-MM-DD и ДД-ММ-ГГГГ из формы учительской. */
function eventDayKey(ev) {
    if (!ev) return '';
    const raw = ev.date != null && ev.date !== '' ? String(ev.date).trim() : '';
    if (raw) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(0, 10);
        const dmY = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
        if (dmY) return `${dmY[3]}-${dmY[1]}-${dmY[2]}`;
    }
    return String(ev.startAt || '').slice(0, 10);
}

function eventsForMonth(events, year, monthIndex) {
    const y = year;
    const m = monthIndex + 1;
    const pad = (n) => String(n).padStart(2, '0');
    const prefix = `${y}-${pad(m)}`;
    return events.filter((e) => eventDayKey(e).startsWith(prefix));
}

function parseCalendarEventIdFromRoute(route) {
    if (!route || typeof route !== 'string') return '';
    const q = route.includes('?') ? route.split('?')[1] : '';
    if (!q) return '';
    try {
        return new URLSearchParams(q).get('event') || '';
    } catch {
        return '';
    }
}

function groupByDay(list) {
    const m = new Map();
    list.forEach((e) => {
        const k = eventDayKey(e);
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(e);
    });
    return m;
}

function openEventNavigation(ev, navigate, routePrefix) {
    if (!navigate || !routePrefix) return;
    if (routePrefix === '/admin') {
        navigate('/admin/calendar');
        return;
    }
    if ((ev.eventType === 'lesson' || ev.eventType === 'lesson_release') && ev.linkedLessonId) {
        navigate(`${routePrefix}/lessons`);
        return;
    }
    if (ev.eventType === 'practicum' || ev.eventType === 'mentor_meeting' || ev.eventType === 'breakfast' || ev.eventType === 'live_stream') {
        navigate(`${routePrefix}/practicums`);
    }
}

/**
 * Компактный календарь (паттерн сетки как в календаре встреч сада) + ближайшие события.
 * Только просмотр для student/mentor; admin на дашборде тоже read-only здесь.
 */
function CalendarLegendDot({ eventType }) {
    return (
        <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${calendarEventDotClass(eventType)}`}
            aria-hidden
        />
    );
}

function CalendarDayButton({
    day,
    dayEvts,
    isSelected,
    isToday,
    showTodayHighlight,
    onClick,
}) {
    const types = Array.from(new Set(dayEvts.map((e) => e.eventType))).slice(0, 3);
    const base =
        'flex aspect-square w-full min-h-0 min-w-0 flex-col items-stretch rounded-xl border text-[13px] tabular-nums transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[#8FC4B3]/50 focus-visible:ring-offset-1';
    let state = '';
    if (isSelected) {
        state =
            ' border-[#6FA68C]/55 bg-[#D4EBE2] text-[#0F3428] font-semibold ring-1 ring-[#6FA68C]/25';
    } else if (showTodayHighlight && isToday) {
        state = ' border-[#8FC4B3] bg-white text-[#3D342B] font-semibold';
    } else {
        state =
            ' border-[#E8E0D4]/70 bg-[#FAF8F5] text-[#3D342B] font-medium hover:border-[#D4C8BC] hover:bg-[#F3EDE6]';
    }
    return (
        <button type="button" onClick={onClick} className={`${base} ${state}`}>
            <span className="flex flex-1 items-center justify-center leading-none">{day}</span>
            <div className="flex h-2.5 shrink-0 items-center justify-center gap-1 px-1 pb-1">
                {types.map((t) => (
                    <span
                        key={t}
                        title={PVL_CAL_EVENT_LABELS[t] || t}
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${calendarEventDotClass(t)}`}
                    />
                ))}
            </div>
        </button>
    );
}

function sortEventsChronologically(list) {
    return list.slice().sort((a, b) => {
        const c = String(eventDayKey(a)).localeCompare(String(eventDayKey(b)));
        if (c !== 0) return c;
        return String(a.startAt || '').localeCompare(String(b.startAt || ''));
    });
}

function sanitizePracticumEmbedHtml(snippet = '') {
    const raw = String(snippet || '')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&amp;', '&')
        .replaceAll('&quot;', '"')
        .trim();
    if (!raw) return '';
    return DOMPurify.sanitize(raw, {
        ADD_TAGS: ['iframe', 'div'],
        ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'src', 'title', 'referrerpolicy', 'loading', 'style', 'class', 'width', 'height'],
    });
}

function escapeHtml(source = '') {
    return String(source || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

/** Плоский текст описания → безопасный HTML: переносы строк и кликабельные https-ссылки. */
function linkifyCalendarDescriptionToHtml(text = '') {
    const raw = String(text || '');
    if (!raw.trim()) return '';
    const lines = raw.split('\n');
    const urlRe = /(https?:\/\/[^\s<]+)/gi;
    const lineToHtml = (line) => {
        const s = String(line || '');
        const parts = [];
        let last = 0;
        let m;
        const re = new RegExp(urlRe.source, urlRe.flags);
        while ((m = re.exec(s)) !== null) {
            if (m.index > last) parts.push(escapeHtml(s.slice(last, m.index)));
            const url = m[1];
            try {
                const u = new URL(url);
                if (!/^https?:$/i.test(u.protocol)) {
                    parts.push(escapeHtml(url));
                } else {
                    const href = escapeHtml(u.href);
                    parts.push(
                        `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline hover:text-blue-700">${href}</a>`,
                    );
                }
            } catch {
                parts.push(escapeHtml(url));
            }
            last = m.index + url.length;
        }
        if (last < s.length) parts.push(escapeHtml(s.slice(last)));
        return parts.join('');
    };
    const inner = lines.map(lineToHtml).join('<br/>');
    return DOMPurify.sanitize(inner, {
        ALLOWED_TAGS: ['a', 'br'],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    });
}

function buildPracticumRecordingEmbedHtml(source = '') {
    const raw = String(source || '')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&amp;', '&')
        .replaceAll('&quot;', '"')
        .trim();
    if (!raw) return '';
    if (/<\s*iframe[\s>]/i.test(raw)) return sanitizePracticumEmbedHtml(raw);
    try {
        const u = new URL(raw);
        if (!/^https?:$/i.test(u.protocol)) return '';
        const host = u.hostname.replace(/^www\./i, '').toLowerCase();
        if (host === 'kinescope.io' && u.pathname.includes('/embed/')) {
            return sanitizePracticumEmbedHtml(
                `<div style="position:relative;padding-top:56.25%;width:100%"><iframe src="${escapeHtml(u.href)}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media; gyroscope; accelerometer; clipboard-write; screen-wake-lock;" frameborder="0" allowfullscreen style="position:absolute;top:0;left:0;width:100%;height:100%;border:0"></iframe></div>`,
            );
        }
    } catch {
        return '';
    }
    return '';
}

function normalizePracticumRecapHtml(source = '') {
    const raw = String(source || '')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&amp;', '&')
        .replaceAll('&quot;', '"')
        .trim();
    if (!raw) return '';
    if (/<\s*[a-z][^>]*>/i.test(raw)) return sanitizePracticumEmbedHtml(raw);
    return `<div>${escapeHtml(raw).replaceAll('\n', '<br/>')}</div>`;
}

export function PvlDashboardCalendarBlock({
    viewerRole,
    cohortId,
    navigate,
    routePrefix = '/student',
    title = 'Календарь курса',
    onOpenFullCalendar,
    /** Текст зелёной кнопки под сеткой (если передан onOpenFullCalendar) */
    scheduleCtaLabel = '+ Запланировать',
    eventTypeFilter = [],
    showPracticumArchive = false,
}) {
    const [currentDate, setCurrentDate] = useState(() => new Date(`${PVL_TODAY}T12:00:00`));
    /** YYYY-MM-DD в видимом месяце или null — тогда справа список за месяц */
    const [selectedDayKey, setSelectedDayKey] = useState(null);
    const monthNavigatedByUser = useRef(false);
    const monthInitializedFromEvents = useRef(false);
    const events = useMemo(() => {
        const all = pvlDomainApi.calendarApi.listForViewer(viewerRole, cohortId);
        if (!Array.isArray(eventTypeFilter) || eventTypeFilter.length === 0) return all;
        const allowed = new Set(eventTypeFilter.map((t) => String(t || '').toLowerCase()));
        return all.filter((ev) => allowed.has(String(ev.eventType || '').toLowerCase()));
    }, [viewerRole, cohortId, eventTypeFilter]);

    /** Один раз подстраиваем месяц под данные календаря (как на экране «Календарь»), чтобы точки и список совпадали. */
    useEffect(() => {
        if (monthNavigatedByUser.current || monthInitializedFromEvents.current || !events.length) return;
        const sorted = sortEventsChronologically(events);
        const anchor = sorted.find((e) => String(eventDayKey(e)) >= PVL_TODAY) || sorted[0];
        const k = eventDayKey(anchor);
        if (!k || k.length < 10) return;
        const y = Number(k.slice(0, 4));
        const m = Number(k.slice(5, 7));
        if (!y || !m) return;
        monthInitializedFromEvents.current = true;
        setCurrentDate(new Date(y, m - 1, 1, 12, 0, 0));
    }, [events]);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
    const monthEvents = eventsForMonth(events, year, month);
    const byDay = useMemo(() => groupByDay(monthEvents), [monthEvents]);

    const monthEventsSorted = useMemo(() => sortEventsChronologically(monthEvents), [monthEvents]);

    const monthHeading = formatCalendarMonthYearRu(currentDate);

    const listEvents = useMemo(() => {
        if (!selectedDayKey) return monthEventsSorted;
        const dayList = sortEventsChronologically(byDay.get(selectedDayKey) || []);
        return dayList;
    }, [selectedDayKey, byDay, monthEventsSorted]);

    const listTitle = selectedDayKey
        ? `События · ${new Date(`${selectedDayKey}T12:00:00`).toLocaleString('ru-RU', { day: 'numeric', month: 'long' })}`
        : 'События в этом месяце';
    const practicumArchive = useMemo(() => {
        if (!showPracticumArchive) return [];
        return events
            .filter((ev) => String(ev.eventType || '').toLowerCase() === 'practicum_done')
            .sort((a, b) => String(b.startAt || '').localeCompare(String(a.startAt || '')));
    }, [events, showPracticumArchive]);

    const handleMonthNav = (delta) => {
        monthNavigatedByUser.current = true;
        setSelectedDayKey(null);
        setCurrentDate(new Date(year, month + delta, 1));
    };

    return (
        <section className="space-y-4">
            <div>
                <h3 className="font-display text-xl text-[#3D342B]">{title}</h3>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-[#7A6B5C]">
                <span className="inline-flex items-center gap-2">
                    <CalendarLegendDot eventType="lesson" />
                    Урок
                </span>
                <span className="inline-flex items-center gap-2">
                    <CalendarLegendDot eventType="practicum" />
                    Практикум
                </span>
                <span className="inline-flex items-center gap-2">
                    <CalendarLegendDot eventType="practicum_done" />
                    Проведённый практикум
                </span>
                <span className="inline-flex items-center gap-2">
                    <CalendarLegendDot eventType="breakfast" />
                    Завтрак
                </span>
            </div>

            <div className="rounded-2xl border border-[#E8E0D4]/55 bg-[#FAF8F5] p-4 md:p-5">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-0">
                <div className="w-full shrink-0 select-none lg:w-[min(100%,320px)] lg:border-r lg:border-[#E8E0D4]/45 lg:pr-6">
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={() => handleMonthNav(-1)}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg text-[#5C4D42] transition-colors hover:bg-[#EDE6DE]/90"
                            aria-label="Предыдущий месяц"
                        >
                            ‹
                        </button>
                        <span className="min-w-0 flex-1 text-center font-display text-base font-semibold tracking-tight text-[#3D342B]">{monthHeading}</span>
                        <button
                            type="button"
                            onClick={() => handleMonthNav(1)}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg text-[#5C4D42] transition-colors hover:bg-[#EDE6DE]/90"
                            aria-label="Следующий месяц"
                        >
                            ›
                        </button>
                    </div>
                    <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium text-[#9B8B80]">
                        {CAL_WEEKDAYS_LOWER.map((d) => (
                            <div key={d} className="flex items-center justify-center py-1">
                                {d}
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1.5">
                        {Array.from({ length: startOffset }).map((_, i) => (
                            <div
                                key={`empty-${i}`}
                                className="aspect-square min-h-0 min-w-0 rounded-lg bg-[#EDE6DE]/15"
                                aria-hidden
                            />
                        ))}
                        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                            const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const dayEvts = byDay.get(key) || [];
                            const isToday = key === PVL_TODAY;
                            const isSelected = selectedDayKey === key;
                            return (
                                <CalendarDayButton
                                    key={key}
                                    day={day}
                                    dayEvts={dayEvts}
                                    isSelected={isSelected}
                                    isToday={isToday}
                                    showTodayHighlight
                                    onClick={() => setSelectedDayKey((prev) => (prev === key ? null : key))}
                                />
                            );
                        })}
                    </div>
                    {onOpenFullCalendar ? (
                        <button
                            type="button"
                            onClick={onOpenFullCalendar}
                            className="mt-5 w-full rounded-xl bg-[#1B4D3E] py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-[#164535]"
                        >
                            {scheduleCtaLabel}
                        </button>
                    ) : null}
                </div>

                <div className="flex min-w-0 flex-1 flex-col lg:pl-6">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold text-[#3D342B]">{listTitle}</h4>
                        {selectedDayKey ? (
                            <button
                                type="button"
                                onClick={() => setSelectedDayKey(null)}
                                className="text-[11px] text-[#8B6F52] hover:underline"
                            >
                                Показать ближайшие
                            </button>
                        ) : null}
                    </div>
                    <div className="min-h-[140px] max-h-[220px] flex-1 overflow-y-auto">
                        {listEvents.length === 0 ? (
                            <p className="py-6 text-center text-sm text-[#6B5D4F]">
                                {selectedDayKey ? 'В этот день событий нет.' : 'В этом месяце нет событий в выбранном потоке.'}
                            </p>
                        ) : (
                            <ul className="divide-y divide-[#E8E0D4]/50">
                                {listEvents.map((ev) => (
                                    <li key={ev.id}>
                                        <button
                                            type="button"
                                            onClick={() => openEventNavigation(ev, navigate, routePrefix)}
                                            className="w-full rounded-md px-1 py-2.5 text-left transition-colors hover:bg-[#EDE6DE]/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8FC4B3]/60"
                                        >
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span
                                                    className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${calendarEventDotClass(ev.eventType)}`}
                                                    title={PVL_CAL_EVENT_LABELS[ev.eventType] || ev.eventType}
                                                />
                                                <span className="text-sm font-medium text-[#3D342B]">{ev.title}</span>
                                            </div>
                                            <div className="mt-1 text-[11px] text-[#6B5D4F]">
                                                {PVL_CAL_EVENT_LABELS[ev.eventType] || ev.eventType}
                                                {' · '}
                                                {formatPvlDateTime(ev.startAt)}
                                            </div>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
                </div>
            </div>
            {showPracticumArchive ? (
                <div className="rounded-2xl border border-[#E8E0D4]/55 bg-white p-4 md:p-5">
                    <h4 className="text-base font-semibold text-[#3D342B]">Записи проведенных практикумов</h4>
                    {practicumArchive.length === 0 ? (
                        <p className="mt-3 text-sm text-[#6B5D4F]">Пока нет добавленных записей.</p>
                    ) : (
                        <ul className="mt-3 space-y-3">
                            {practicumArchive.map((ev) => (
                                <li key={ev.id} className="rounded-xl border border-[#E8E0D4]/70 bg-[#FAF8F5] p-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className={`h-2 w-2 rounded-full ${calendarEventDotClass(ev.eventType)}`} aria-hidden />
                                        <span className="text-sm font-medium text-[#3D342B]">{ev.title}</span>
                                        <span className="text-[11px] text-[#6B5D4F]">{formatPvlDateTime(ev.startAt)}</span>
                                    </div>
                                    {buildPracticumRecordingEmbedHtml(ev.recordingUrl) ? (
                                        <div
                                            className="mt-2 overflow-hidden rounded-lg border border-[#E8E0D4]/70 bg-white"
                                            dangerouslySetInnerHTML={{ __html: buildPracticumRecordingEmbedHtml(ev.recordingUrl) }}
                                        />
                                    ) : null}
                                    {ev.recordingUrl ? (
                                        <a
                                            href={ev.recordingUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="mt-2 inline-flex text-xs font-medium text-[#1B4D3E] hover:underline"
                                        >
                                            Смотреть запись
                                        </a>
                                    ) : null}
                                    {ev.recapText ? (
                                        <div
                                            className="mt-2 text-sm text-[#5C4D42] clean-rich-text"
                                            dangerouslySetInnerHTML={{ __html: normalizePracticumRecapHtml(ev.recapText) }}
                                        />
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ) : null}
        </section>
    );
}

/**
 * Полный экран календаря в учительской: сетка, список, CRUD.
 */
export function PvlAdminCalendarScreen({ navigate, refresh, route = '/admin/calendar' }) {
    const [tick, setTick] = useState(0);
    const [currentDate, setCurrentDate] = useState(() => {
        const p = readCalendarUiPrefs();
        const d = p?.monthYm ? monthDateFromPrefsYm(p.monthYm) : null;
        return d || new Date(`${PVL_TODAY}T12:00:00`);
    });
    const [filterType, setFilterType] = useState(() => readCalendarUiPrefs()?.filterType || 'all');
    const [filterRole, setFilterRole] = useState(() => readCalendarUiPrefs()?.filterRole || 'all');
    const [filterCohort, setFilterCohort] = useState(() => readCalendarUiPrefs()?.filterCohort || 'all');
    const [editingId, setEditingId] = useState('');
    /** Подсветка рамкой только у выбранного дня (не у всех дней с событиями). */
    const [selectedDayKey, setSelectedDayKey] = useState(null);
    /** Один раз подстроить месяц под данные (как на дашборде), если в сохранённом месяце нет событий. */
    const initialMonthAlignedRef = useRef(false);

    useEffect(() => {
        const fromUrl = parseCalendarEventIdFromRoute(route);
        setEditingId(fromUrl || '');
    }, [route]);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    useEffect(() => {
        setSelectedDayKey(null);
    }, [year, month]);

    useEffect(() => {
        saveViewPreferences(CALENDAR_UI_PREFS_KEY, {
            monthYm: `${year}-${String(month + 1).padStart(2, '0')}`,
            filterType,
            filterRole,
            filterCohort,
        });
    }, [year, month, filterType, filterRole, filterCohort]);
    const events = useMemo(() => {
        void tick;
        return pvlDomainApi.calendarApi.listForViewer('admin', null);
    }, [tick]);

    const filtered = useMemo(() => events.filter((e) => (filterType === 'all' ? true : e.eventType === filterType))
        .filter((e) => {
            if (filterRole === 'all') return true;
            if (filterRole === 'all_vis') return e.visibilityRole === 'all';
            return e.visibilityRole === filterRole;
        })
        .filter((e) => (filterCohort === 'all' ? true : pvlCohortIdsEquivalent(e.cohortId, filterCohort))), [events, filterType, filterRole, filterCohort]);

    const editing = editingId ? pvlDomainApi.calendarApi.getById(editingId) : null;

    useEffect(() => {
        if (initialMonthAlignedRef.current) return;
        if (!filtered.length) return;
        const y = currentDate.getFullYear();
        const mo = currentDate.getMonth();
        if (eventsForMonth(filtered, y, mo).length > 0) {
            initialMonthAlignedRef.current = true;
            return;
        }
        const sorted = sortEventsChronologically(filtered);
        const k = eventDayKey(sorted[0]);
        if (!k || k.length < 10) {
            initialMonthAlignedRef.current = true;
            return;
        }
        const y2 = Number(k.slice(0, 4));
        const m2 = Number(k.slice(5, 7));
        if (!y2 || !m2) {
            initialMonthAlignedRef.current = true;
            return;
        }
        setCurrentDate(new Date(y2, m2 - 1, 1, 12, 0, 0));
        initialMonthAlignedRef.current = true;
    }, [filtered, currentDate]);

    useEffect(() => {
        if (!editingId || !editing) return;
        const k = eventDayKey(editing);
        if (k) setSelectedDayKey(k);
    }, [editingId, editing]);

    const bump = () => {
        setTick((x) => x + 1);
        refresh?.();
    };

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
    const monthEvents = eventsForMonth(filtered, year, month);
    const monthEventsSorted = useMemo(() => sortEventsChronologically(monthEvents), [monthEvents]);
    const byDay = groupByDay(monthEvents);
    const monthHeading = formatCalendarMonthYearRu(currentDate);

    const cohorts = pvlDomainApi.adminApi.getAdminCohorts();

    const createNewCalendarEvent = () => {
        const row = pvlDomainApi.adminApi.createCalendarEvent({});
        bump();
        navigate?.(`/admin/calendar?event=${encodeURIComponent(row.id)}`);
    };

    return (
        <div className="space-y-3">
            <div className="space-y-3 rounded-2xl bg-white p-4 shadow-[0_14px_44px_-14px_rgba(15,23,42,0.08)] md:p-5">
                <h2 className="font-display text-2xl text-slate-800">Календарь курса</h2>
                <div className="flex flex-wrap gap-2">
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm bg-white">
                    <option value="all">Все типы</option>
                    <option value="lesson">Урок</option>
                    <option value="practicum">Практикум</option>
                    <option value="practicum_done">Проведенный практикум</option>
                    <option value="breakfast">Завтрак</option>
                </select>
                <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm bg-white">
                    <option value="all">Все роли видимости</option>
                    <option value="all_vis">Только all</option>
                    <option value="student">student</option>
                    <option value="mentor">mentor</option>
                    <option value="admin">admin</option>
                </select>
                <select value={filterCohort} onChange={(e) => setFilterCohort(e.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm bg-white">
                    <option value="all">Все потоки</option>
                    {cohorts.map((c) => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                </select>
                <button
                    type="button"
                    onClick={createNewCalendarEvent}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 ml-auto"
                >
                    + Событие
                </button>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-600">
                    <span className="inline-flex items-center gap-2">
                        <CalendarLegendDot eventType="lesson" />
                        Урок
                    </span>
                    <span className="inline-flex items-center gap-2">
                        <CalendarLegendDot eventType="practicum" />
                        Практикум
                    </span>
                    <span className="inline-flex items-center gap-2">
                        <CalendarLegendDot eventType="practicum_done" />
                        Проведенный практикум
                    </span>
                    <span className="inline-flex items-center gap-2">
                        <CalendarLegendDot eventType="breakfast" />
                        Завтрак
                    </span>
                </div>
            </div>

            {editing ? (
                <div className="space-y-2 rounded-2xl bg-white p-3 shadow-[0_12px_36px_-12px_rgba(15,23,42,0.07)]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-display text-base text-slate-800">Редактирование события</h3>
                        <button type="button" onClick={() => navigate?.('/admin/calendar')} className="text-xs rounded-xl border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50">
                            ← К календарю
                        </button>
                    </div>
                    <div className="grid md:grid-cols-3 gap-2">
                        <label className="block text-xs text-slate-500 md:col-span-2">Название
                            <input
                                className="mt-1 w-full rounded-xl border border-slate-200 px-2.5 py-1.5 text-sm"
                                value={editing.title}
                                onChange={(e) => {
                                    pvlDomainApi.adminApi.updateCalendarEvent(editing.id, { title: e.target.value });
                                    bump();
                                }}
                            />
                        </label>
                        <label className="block text-xs text-slate-500">Тип
                            <select
                                className="mt-1 w-full rounded-xl border border-slate-200 px-2.5 py-1.5 text-sm"
                                value={editing.eventType}
                                onChange={(e) => {
                                    const eventType = e.target.value;
                                    pvlDomainApi.adminApi.updateCalendarEvent(editing.id, { eventType, colorToken: eventType });
                                    bump();
                                }}
                            >
                                <option value="lesson">Урок</option>
                                <option value="practicum">Практикум</option>
                                <option value="practicum_done">Проведенный практикум</option>
                                <option value="breakfast">Завтрак</option>
                            </select>
                        </label>
                        <label className="block text-xs text-slate-500 md:col-span-3">Описание
                            <textarea
                                className="mt-1 w-full rounded-xl border border-slate-200 px-2.5 py-1.5 text-sm min-h-[60px]"
                                value={editing.description || ''}
                                onChange={(e) => {
                                    pvlDomainApi.adminApi.updateCalendarEvent(editing.id, { description: e.target.value });
                                    bump();
                                }}
                            />
                            {String(editing.description || '').trim() ? (
                                <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50/90 px-2.5 py-2 text-sm text-slate-800 [&_a]:break-all">
                                    <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                        Просмотр (ссылки кликабельны)
                                    </span>
                                    <div
                                        className="leading-relaxed"
                                        // eslint-disable-next-line react/no-danger
                                        dangerouslySetInnerHTML={{ __html: linkifyCalendarDescriptionToHtml(editing.description) }}
                                    />
                                </div>
                            ) : null}
                        </label>
                        <label className="block text-xs text-slate-500 md:col-span-3">Ссылка на запись (видео)
                            <input
                                className="mt-1 w-full rounded-xl border border-slate-200 px-2.5 py-1.5 text-sm"
                                value={editing.recordingUrl || ''}
                                placeholder="https://..."
                                onChange={(e) => {
                                    pvlDomainApi.adminApi.updateCalendarEvent(editing.id, { recordingUrl: e.target.value.trim() });
                                    bump();
                                }}
                            />
                        </label>
                        <label className="block text-xs text-slate-500 md:col-span-3">Описание проведенного практикума
                            <textarea
                                className="mt-1 w-full rounded-xl border border-slate-200 px-2.5 py-1.5 text-sm min-h-[60px]"
                                value={editing.recapText || ''}
                                onChange={(e) => {
                                    pvlDomainApi.adminApi.updateCalendarEvent(editing.id, { recapText: e.target.value });
                                    bump();
                                }}
                            />
                        </label>
                        <label className="block text-xs text-slate-500">Дата (ДД-ММ-ГГГГ)
                            <input
                                className="mt-1 w-full rounded-xl border border-slate-200 px-2.5 py-1.5 text-sm"
                                value={editing.date || ''}
                                onChange={(e) => {
                                    const date = e.target.value;
                                    pvlDomainApi.adminApi.updateCalendarEvent(editing.id, {
                                        date,
                                        startAt: `${date}T12:00:00.000Z`,
                                        endAt: `${date}T13:00:00.000Z`,
                                    });
                                    bump();
                                }}
                            />
                        </label>
                        <label className="block text-xs text-slate-500">Видимость
                            <select
                                className="mt-1 w-full rounded-xl border border-slate-200 px-2.5 py-1.5 text-sm"
                                value={editing.visibilityRole || 'all'}
                                onChange={(e) => {
                                    pvlDomainApi.adminApi.updateCalendarEvent(editing.id, { visibilityRole: e.target.value });
                                    bump();
                                }}
                            >
                                <option value="all">all</option>
                                <option value="student">student</option>
                                <option value="mentor">mentor</option>
                                <option value="admin">admin</option>
                            </select>
                        </label>
                        <label className="block text-xs text-slate-500">Поток
                            <select
                                className="mt-1 w-full rounded-xl border border-slate-200 px-2.5 py-1.5 text-sm"
                                value={editing.cohortId || 'cohort-2026-1'}
                                onChange={(e) => {
                                    pvlDomainApi.adminApi.updateCalendarEvent(editing.id, { cohortId: e.target.value });
                                    bump();
                                }}
                            >
                                {cohorts.map((c) => (
                                    <option key={c.id} value={c.id}>{c.title}</option>
                                ))}
                            </select>
                        </label>
                        <label className="block text-xs text-slate-500 md:col-span-3">Связанный урок (id)
                            <input
                                className="mt-1 w-full rounded-xl border border-slate-200 px-2.5 py-1.5 text-sm"
                                value={editing.linkedLessonId || ''}
                                placeholder="les-7"
                                onChange={(e) => {
                                    pvlDomainApi.adminApi.updateCalendarEvent(editing.id, { linkedLessonId: e.target.value || null });
                                    bump();
                                }}
                            />
                        </label>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                        <button
                            type="button"
                            onClick={() => {
                                if (window.confirm('Удалить событие?')) {
                                    pvlDomainApi.adminApi.deleteCalendarEvent(editing.id);
                                    navigate?.('/admin/calendar');
                                    bump();
                                }
                            }}
                            className="text-xs rounded-xl border border-rose-200 text-rose-700 px-3 py-1.5 hover:bg-rose-50"
                        >
                            Удалить
                        </button>
                    </div>
                </div>
            ) : null}

            <div className="grid items-start gap-5 lg:grid-cols-2">
                <div className="rounded-[1.75rem] bg-white p-4 pb-4 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)]">
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg text-[#5C4D42] transition-colors hover:bg-[#EDE6DE]/90"
                            aria-label="Предыдущий месяц"
                        >
                            ‹
                        </button>
                        <span className="min-w-0 flex-1 text-center font-display text-base font-semibold tracking-tight text-[#3D342B]">{monthHeading}</span>
                        <button
                            type="button"
                            onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg text-[#5C4D42] transition-colors hover:bg-[#EDE6DE]/90"
                            aria-label="Следующий месяц"
                        >
                            ›
                        </button>
                    </div>
                    <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium text-[#9B8B80]">
                        {CAL_WEEKDAYS_LOWER.map((d) => (
                            <div key={d} className="flex items-center justify-center py-1">
                                {d}
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1.5 pb-1">
                        {Array.from({ length: startOffset }).map((_, i) => (
                            <div
                                key={`e-${i}`}
                                className="aspect-square min-h-0 min-w-0 rounded-lg bg-[#EDE6DE]/15"
                                aria-hidden
                            />
                        ))}
                        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                            const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const dayEvts = byDay.get(key) || [];
                            const isSelected = selectedDayKey === key;
                            const isToday = key === PVL_TODAY;
                            return (
                                <CalendarDayButton
                                    key={key}
                                    day={day}
                                    dayEvts={dayEvts}
                                    isSelected={isSelected}
                                    isToday={isToday}
                                    showTodayHighlight
                                    onClick={() => {
                                        setSelectedDayKey(key);
                                        if (dayEvts[0] && navigate) navigate(`/admin/calendar?event=${encodeURIComponent(dayEvts[0].id)}`);
                                    }}
                                />
                            );
                        })}
                    </div>
                    <button
                        type="button"
                        onClick={createNewCalendarEvent}
                        className="mt-5 w-full rounded-2xl bg-[#1B4D3E] py-3.5 text-center text-sm font-semibold text-white shadow-[0_12px_28px_-14px_rgba(27,77,62,0.55)] transition-colors hover:bg-[#164535]"
                    >
                        + Запланировать
                    </button>
                </div>

                <div className="space-y-2 rounded-2xl bg-white p-3 shadow-[0_12px_36px_-12px_rgba(15,23,42,0.07)]">
                    <h3 className="font-display text-lg text-slate-800">События</h3>
                    <div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-1">
                        {monthEventsSorted.length === 0 ? (
                            <p className="text-sm text-slate-500 px-1 py-2">Пока нет событий в этом месяце.</p>
                        ) : (
                            monthEventsSorted.map((ev) => (
                                <button
                                    key={ev.id}
                                    type="button"
                                    onClick={() => navigate?.(`/admin/calendar?event=${encodeURIComponent(ev.id)}`)}
                                    className={`w-full text-left rounded-lg px-2.5 py-1.5 text-sm transition-colors ${editingId === ev.id ? 'bg-blue-50/80 ring-1 ring-inset ring-blue-200/80' : 'hover:bg-slate-50/90'}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span
                                            className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${calendarEventDotClass(ev.eventType)}`}
                                            title={PVL_CAL_EVENT_LABELS[ev.eventType] || ev.eventType}
                                        />
                                        <span className="font-medium text-slate-800">{ev.title}</span>
                                    </div>
                                    <div className="text-[11px] text-slate-500 mt-1">{formatPvlDateTime(ev.startAt)}</div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>

            <div className="rounded-lg bg-slate-50/90 p-3 text-xs text-slate-600">
                <span className="font-medium text-slate-700">Предпросмотр для участницы / ментора:</span>
                {' '}
                те же цвета и список, без кнопок редактирования. Переход по событию на дашборде ведёт в «Практикумы» или «Уроки», если задана связь.
            </div>
        </div>
    );
}
