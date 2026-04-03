import React, { useMemo, useState } from 'react';
import { pvlDomainApi } from '../services/pvlMockApi';
import { formatPvlDateTime } from '../utils/pvlDateFormat';

/** Согласовано с прототипом дедлайнов ПВЛ */
const PVL_TODAY = '2026-06-03';

export const PVL_CAL_EVENT_LABELS = {
    mentor_meeting: 'Встреча с менторами',
    live_stream: 'Прямой эфир',
    lesson_release: 'Выход урока',
};

export function calendarEventDotClass(eventType) {
    switch (String(eventType || '').toLowerCase()) {
        case 'mentor_meeting':
            return 'bg-teal-400/90';
        case 'live_stream':
            return 'bg-violet-400/85';
        case 'lesson_release':
            return 'bg-amber-400/90';
        default:
            return 'bg-slate-300';
    }
}

function eventDayKey(ev) {
    if (ev.date) return String(ev.date).slice(0, 10);
    return String(ev.startAt || '').slice(0, 10);
}

function eventsForMonth(events, year, monthIndex) {
    const y = year;
    const m = monthIndex + 1;
    const pad = (n) => String(n).padStart(2, '0');
    const prefix = `${y}-${pad(m)}`;
    return events.filter((e) => eventDayKey(e).startsWith(prefix));
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
    if (ev.eventType === 'lesson_release' && ev.linkedLessonId) {
        navigate(`${routePrefix}/lessons`);
        return;
    }
    if (ev.eventType === 'mentor_meeting') {
        navigate(`${routePrefix}/practicums`);
    }
}

/**
 * Компактный календарь (паттерн сетки как в календаре встреч сада) + ближайшие события.
 * Только просмотр для student/mentor; admin на дашборде тоже read-only здесь.
 */
export function PvlDashboardCalendarBlock({
    viewerRole,
    cohortId,
    navigate,
    routePrefix = '/student',
    title = 'Календарь курса',
    onOpenFullCalendar,
    fullCalendarLabel = 'Открыть календарь',
}) {
    const [currentDate, setCurrentDate] = useState(() => new Date(`${PVL_TODAY}T12:00:00`));
    /** YYYY-MM-DD в видимом месяце или null — тогда справа «ближайшие» */
    const [selectedDayKey, setSelectedDayKey] = useState(null);
    const events = useMemo(() => pvlDomainApi.calendarApi.listForViewer(viewerRole, cohortId), [viewerRole, cohortId]);
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
    const monthEvents = eventsForMonth(events, year, month);
    const byDay = useMemo(() => groupByDay(monthEvents), [monthEvents]);

    const upcoming = useMemo(() => {
        return events
            .filter((e) => String(eventDayKey(e)) >= PVL_TODAY)
            .sort((a, b) => String(eventDayKey(a)).localeCompare(String(eventDayKey(b))) || String(a.startAt || '').localeCompare(String(b.startAt || '')))
            .slice(0, 8);
    }, [events]);

    const monthLabel = currentDate.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });

    const listEvents = useMemo(() => {
        if (!selectedDayKey) return upcoming;
        const dayList = (byDay.get(selectedDayKey) || []).slice().sort((a, b) => String(a.startAt || '').localeCompare(String(b.startAt || '')));
        return dayList;
    }, [selectedDayKey, byDay, upcoming]);

    const listTitle = selectedDayKey
        ? `События · ${new Date(`${selectedDayKey}T12:00:00`).toLocaleString('ru-RU', { day: 'numeric', month: 'long' })}`
        : 'Ближайшие события';

    const handleMonthNav = (delta) => {
        setSelectedDayKey(null);
        setCurrentDate(new Date(year, month + delta, 1));
    };

    return (
        <section className="rounded-2xl border border-slate-100/90 bg-white p-5 md:p-6 shadow-sm shadow-slate-200/40">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                    <h3 className="font-display text-xl text-slate-800">{title}</h3>
                    <p className="text-xs text-slate-500 mt-1">События потока: встречи, эфиры, выход уроков.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => handleMonthNav(-1)}
                        className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                    >
                        ←
                    </button>
                    <span className="text-sm font-medium text-slate-700 capitalize min-w-[10rem] text-center">{monthLabel}</span>
                    <button
                        type="button"
                        onClick={() => handleMonthNav(1)}
                        className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                    >
                        →
                    </button>
                    {onOpenFullCalendar ? (
                        <button
                            type="button"
                            onClick={onOpenFullCalendar}
                            className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1.5 text-[#C8855A] hover:bg-[#FAF6F2]"
                        >
                            {fullCalendarLabel}
                        </button>
                    ) : null}
                </div>
            </div>

            <div className="flex flex-wrap gap-4 text-[10px] text-slate-500 mb-3">
                <span className="inline-flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${calendarEventDotClass('mentor_meeting')}`} /> Встречи</span>
                <span className="inline-flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${calendarEventDotClass('live_stream')}`} /> Эфиры</span>
                <span className="inline-flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${calendarEventDotClass('lesson_release')}`} /> Уроки</span>
            </div>

            <div className="flex flex-col lg:flex-row gap-5 lg:gap-6 items-stretch">
                <div className="w-full lg:w-[min(100%,280px)] shrink-0 rounded-2xl border border-slate-100 bg-[#fafaf8] p-3 md:p-4 select-none">
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
                        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => <div key={d}>{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: startOffset }).map((_, i) => (
                            <div key={`empty-${i}`} className="aspect-square rounded-xl bg-transparent" />
                        ))}
                        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                            const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const dayEvts = byDay.get(key) || [];
                            const isToday = key === PVL_TODAY;
                            const isSelected = selectedDayKey === key;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setSelectedDayKey((prev) => (prev === key ? null : key))}
                                    className={`aspect-square rounded-xl border flex flex-col items-center justify-start pt-1 text-xs transition-colors cursor-pointer ${
                                        isSelected
                                            ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200/80'
                                            : isToday
                                              ? 'border-teal-200 bg-teal-50/50'
                                              : 'border-slate-100/80 bg-white hover:border-slate-200'
                                    }`}
                                >
                                    <span
                                        className={`tabular-nums ${isSelected || isToday ? 'font-semibold text-teal-900' : 'text-slate-600'}`}
                                    >
                                        {day}
                                    </span>
                                    <div className="flex flex-wrap gap-0.5 justify-center mt-0.5 px-0.5 min-h-[10px]">
                                        {Array.from(new Set(dayEvts.map((e) => e.eventType))).slice(0, 3).map((t) => (
                                            <span key={t} className={`w-1.5 h-1.5 rounded-full ${calendarEventDotClass(t)}`} title={PVL_CAL_EVENT_LABELS[t] || t} />
                                        ))}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-3 leading-snug">Нажмите на дату — справа список событий. Повторный клик снимает выбор.</p>
                </div>

                <div className="flex-1 min-w-0 flex flex-col rounded-2xl border border-slate-100/90 bg-slate-50/40 p-4 md:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <h4 className="text-sm font-semibold text-slate-800">{listTitle}</h4>
                        {selectedDayKey ? (
                            <button
                                type="button"
                                onClick={() => setSelectedDayKey(null)}
                                className="text-[11px] text-[#C8855A] hover:underline"
                            >
                                Показать ближайшие
                            </button>
                        ) : null}
                    </div>
                    <div className="flex-1 min-h-[200px] max-h-[320px] overflow-y-auto pr-1 -mr-1">
                        {listEvents.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-200 bg-white/80 px-4 py-8 text-center">
                                <p className="text-sm text-slate-500">
                                    {selectedDayKey ? 'В этот день событий нет.' : 'Нет предстоящих событий в выбранном потоке.'}
                                </p>
                            </div>
                        ) : (
                            <ul className="space-y-2">
                                {listEvents.map((ev) => (
                                    <li key={ev.id}>
                                        <button
                                            type="button"
                                            onClick={() => openEventNavigation(ev, navigate, routePrefix)}
                                            className="w-full text-left rounded-xl border border-white bg-white px-3 py-2.5 shadow-sm shadow-slate-200/30 hover:border-emerald-100 hover:bg-emerald-50/20 transition-colors"
                                        >
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${calendarEventDotClass(ev.eventType)}`} />
                                                <span className="text-sm font-medium text-slate-800">{ev.title}</span>
                                            </div>
                                            <div className="text-[11px] text-slate-500 mt-1">
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
        </section>
    );
}

/**
 * Полный экран календаря в учительской: сетка, список, CRUD.
 */
export function PvlAdminCalendarScreen({ navigate, refresh }) {
    const [tick, setTick] = useState(0);
    const [currentDate, setCurrentDate] = useState(() => new Date(`${PVL_TODAY}T12:00:00`));
    const [filterType, setFilterType] = useState('all');
    const [filterRole, setFilterRole] = useState('all');
    const [filterCohort, setFilterCohort] = useState('all');
    const [editingId, setEditingId] = useState('');
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
        .filter((e) => (filterCohort === 'all' ? true : e.cohortId === filterCohort)), [events, filterType, filterRole, filterCohort]);

    const editing = editingId ? pvlDomainApi.calendarApi.getById(editingId) : null;

    const bump = () => {
        setTick((x) => x + 1);
        refresh?.();
    };

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
    const monthEvents = eventsForMonth(filtered, year, month);
    const byDay = groupByDay(monthEvents);
    const monthLabel = currentDate.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });

    const cohorts = pvlDomainApi.adminApi.getAdminCohorts();

    return (
        <div className="space-y-5">
            <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm">
                <h2 className="font-display text-2xl text-slate-800">Календарь курса</h2>
                <p className="text-sm text-slate-500 mt-1">Создание и редактирование событий потока. Участницы и менторы видят календарь только для чтения.</p>
            </div>

            <div className="rounded-2xl border border-slate-100/90 bg-white p-4 flex flex-wrap gap-3 shadow-sm">
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="rounded-xl border border-slate-200 p-2 text-sm">
                    <option value="all">Все типы</option>
                    <option value="mentor_meeting">Встречи с менторами</option>
                    <option value="live_stream">Прямые эфиры</option>
                    <option value="lesson_release">Выход уроков</option>
                </select>
                <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="rounded-xl border border-slate-200 p-2 text-sm">
                    <option value="all">Все роли видимости</option>
                    <option value="all_vis">Только all</option>
                    <option value="student">student</option>
                    <option value="mentor">mentor</option>
                    <option value="admin">admin</option>
                </select>
                <select value={filterCohort} onChange={(e) => setFilterCohort(e.target.value)} className="rounded-xl border border-slate-200 p-2 text-sm">
                    <option value="all">Все потоки</option>
                    {cohorts.map((c) => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                </select>
                <button
                    type="button"
                    onClick={() => {
                        const row = pvlDomainApi.adminApi.createCalendarEvent({});
                        setEditingId(row.id);
                        bump();
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 ml-auto"
                >
                    + Событие
                </button>
            </div>

            <div className="grid lg:grid-cols-2 gap-4 items-start">
                <div className="rounded-2xl border border-slate-100/90 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <button type="button" onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="rounded-xl border border-slate-200 px-2 py-1 text-sm">←</button>
                        <span className="text-sm font-medium capitalize">{monthLabel}</span>
                        <button type="button" onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="rounded-xl border border-slate-200 px-2 py-1 text-sm">→</button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-slate-400 font-semibold mb-1">
                        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => <div key={d}>{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: startOffset }).map((_, i) => <div key={`e-${i}`} className="aspect-square" />)}
                        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                            const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const dayEvts = byDay.get(key) || [];
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => {
                                        if (dayEvts[0]) setEditingId(dayEvts[0].id);
                                    }}
                                    className={`aspect-square rounded-lg border text-xs flex flex-col items-center justify-start pt-0.5 ${dayEvts.length ? 'border-teal-100 bg-teal-50/40' : 'border-slate-50 bg-slate-50/30'}`}
                                >
                                    <span className="tabular-nums text-slate-600">{day}</span>
                                    <div className="flex gap-0.5 flex-wrap justify-center">
                                        {Array.from(new Set(dayEvts.map((e) => e.eventType))).slice(0, 3).map((t) => (
                                            <span key={t} className={`w-1.5 h-1.5 rounded-full ${calendarEventDotClass(t)}`} />
                                        ))}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-100/90 bg-white p-4 shadow-sm space-y-3">
                    <h3 className="font-display text-lg text-slate-800">События (отфильтровано)</h3>
                    <div className="max-h-[280px] overflow-y-auto space-y-2 pr-1">
                        {filtered.map((ev) => (
                            <button
                                key={ev.id}
                                type="button"
                                onClick={() => setEditingId(ev.id)}
                                className={`w-full text-left rounded-xl border px-3 py-2 text-sm transition-colors ${editingId === ev.id ? 'border-blue-200 bg-blue-50/50' : 'border-slate-100 hover:bg-slate-50'}`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${calendarEventDotClass(ev.eventType)}`} />
                                    <span className="font-medium text-slate-800">{ev.title}</span>
                                </div>
                                <div className="text-[11px] text-slate-500 mt-1">{formatPvlDateTime(ev.startAt)} · {ev.visibilityRole} · {ev.cohortId}</div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {editing ? (
                <div className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-sm space-y-3">
                    <h3 className="font-display text-lg text-slate-800">Редактирование</h3>
                    <div className="grid md:grid-cols-2 gap-3">
                        <label className="block text-xs text-slate-500">Название
                            <input
                                className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-sm"
                                value={editing.title}
                                onChange={(e) => {
                                    pvlDomainApi.adminApi.updateCalendarEvent(editing.id, { title: e.target.value });
                                    bump();
                                }}
                            />
                        </label>
                        <label className="block text-xs text-slate-500">Тип
                            <select
                                className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-sm"
                                value={editing.eventType}
                                onChange={(e) => {
                                    const eventType = e.target.value;
                                    pvlDomainApi.adminApi.updateCalendarEvent(editing.id, { eventType, colorToken: eventType });
                                    bump();
                                }}
                            >
                                <option value="mentor_meeting">Встреча с менторами</option>
                                <option value="live_stream">Прямой эфир</option>
                                <option value="lesson_release">Выход урока</option>
                            </select>
                        </label>
                        <label className="block text-xs text-slate-500 md:col-span-2">Описание
                            <textarea
                                className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-sm min-h-[72px]"
                                value={editing.description || ''}
                                onChange={(e) => {
                                    pvlDomainApi.adminApi.updateCalendarEvent(editing.id, { description: e.target.value });
                                    bump();
                                }}
                            />
                        </label>
                        <label className="block text-xs text-slate-500">Дата (YYYY-MM-DD)
                            <input
                                className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-sm"
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
                                className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-sm"
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
                                className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-sm"
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
                        <label className="block text-xs text-slate-500">Связанный урок (id)
                            <input
                                className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-sm"
                                value={editing.linkedLessonId || ''}
                                placeholder="les-7"
                                onChange={(e) => {
                                    pvlDomainApi.adminApi.updateCalendarEvent(editing.id, { linkedLessonId: e.target.value || null });
                                    bump();
                                }}
                            />
                        </label>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                        <button
                            type="button"
                            onClick={() => {
                                if (window.confirm('Удалить событие?')) {
                                    pvlDomainApi.adminApi.deleteCalendarEvent(editing.id);
                                    setEditingId('');
                                    bump();
                                }
                            }}
                            className="text-sm rounded-xl border border-rose-200 text-rose-700 px-4 py-2 hover:bg-rose-50"
                        >
                            Удалить
                        </button>
                        <button type="button" onClick={() => setEditingId('')} className="text-sm rounded-xl border border-slate-200 px-4 py-2 text-slate-600 hover:bg-slate-50 ml-auto">
                            Закрыть форму
                        </button>
                    </div>
                </div>
            ) : null}

            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 text-xs text-slate-600">
                <span className="font-medium text-slate-700">Предпросмотр для участницы / ментора:</span>
                {' '}
                те же цвета и список, без кнопок редактирования. Переход по событию на дашборде ведёт в «Практикумы» или «Уроки», если задана связь.
            </div>
        </div>
    );
}
