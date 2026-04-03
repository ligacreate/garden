import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PVL_PLATFORM_MODULES, PVL_TRACKER_TAG_LABEL } from '../data/pvlReferenceContent';
import { formatPvlDateTime } from '../utils/pvlDateFormat';
import { pvlDomainApi } from '../services/pvlMockApi';

export function platformStepsStorageKey(studentId) {
    return `pvl_checked_${studentId}`;
}

/** Как в pvl_platform.html */
const CHECKLIST_TAG_LABEL = {
    video: '🎬 Видео',
    task: '✏️ Задание',
    live: '🤝 Живое',
    anchor: '⚓ Якорь',
    pdf: '📄 PDF',
    quiz: '📝 Квиз',
};

function moduleNumClass(cls) {
    if (cls === 'mod-0') return 'bg-[#9B8B80] text-white';
    if (cls === 'mod-1') return 'bg-[#C8855A] text-white';
    if (cls === 'mod-2') return 'bg-[#4A3728] text-white';
    return 'bg-[#3D5A6B] text-white';
}

function tagPillClass(tag) {
    const t = String(tag || '');
    if (t === 'video') return 'bg-sky-50 text-sky-800 border-sky-100';
    if (t === 'task') return 'bg-amber-50 text-amber-900 border-amber-100';
    if (t === 'live') return 'bg-violet-50 text-violet-800 border-violet-100';
    if (t === 'anchor') return 'bg-emerald-50 text-emerald-800 border-emerald-100';
    if (t === 'pdf') return 'bg-slate-100 text-slate-700 border-slate-200';
    return 'bg-slate-50 text-slate-600 border-slate-100';
}

function stepLessonStatus(isDone, tag) {
    const t = tag || 'task';
    if (t === 'video' || t === 'pdf') {
        if (isDone) return 'просмотрено';
        return 'не начато';
    }
    if (t === 'task' || t === 'quiz') {
        if (isDone) return 'выполнено';
        return 'не начато';
    }
    if (isDone) return 'просмотрено';
    return 'не начато';
}

function TrackerStatusBadge({ children }) {
    const s = String(children || '').toLowerCase();
    let cls = 'bg-slate-100 text-slate-700 border-slate-200';
    if (s.includes('просмотрено') || s === 'принято' || s === 'выполнено') cls = 'bg-emerald-50 text-emerald-800 border-emerald-200';
    else if (s.includes('проверено') || s.includes('оценку')) cls = 'bg-indigo-50 text-indigo-900 border-indigo-200';
    else if (s.includes('проверке') || s.includes('отправлено')) cls = 'bg-sky-50 text-sky-900 border-sky-200';
    else if (s.includes('доработке')) cls = 'bg-amber-50 text-amber-900 border-amber-200';
    else if (s.includes('просроч')) cls = 'bg-rose-50 text-rose-800 border-rose-200';
    else if (s.includes('работе') || s.includes('черновик')) cls = 'bg-violet-50 text-violet-900 border-violet-200';
    return (
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
            {children}
        </span>
    );
}

function computePlatformStepStats(checked) {
    let totalSteps = 0;
    let doneSteps = 0;
    let anchorsTotal = 0;
    let anchorsDone = 0;
    PVL_PLATFORM_MODULES.forEach((mod) => {
        mod.items.forEach((item, i) => {
            totalSteps += 1;
            const key = `${mod.id}-${i}`;
            if (checked[key]) doneSteps += 1;
            if (item.anchor) {
                anchorsTotal += 1;
                if (checked[key]) anchorsDone += 1;
            }
        });
    });
    const pct = totalSteps ? Math.round((doneSteps / totalSteps) * 100) : 0;
    return { totalSteps, doneSteps, anchorsTotal, anchorsDone, pct };
}

export function usePlatformStepChecklist(studentId) {
    const storageKey = platformStepsStorageKey(studentId);
    const [checked, setChecked] = useState(() => {
        try {
            return JSON.parse(typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) || '{}' : '{}');
        } catch {
            return {};
        }
    });
    useEffect(() => {
        try {
            setChecked(JSON.parse(localStorage.getItem(storageKey) || '{}'));
        } catch {
            setChecked({});
        }
    }, [storageKey]);

    const toggleItem = useCallback((key) => {
        setChecked((prev) => {
            const next = { ...prev, [key]: !prev[key] };
            try {
                localStorage.setItem(storageKey, JSON.stringify(next));
            } catch {
                /* ignore */
            }
            return next;
        });
    }, [storageKey]);

    const stats = useMemo(() => computePlatformStepStats(checked), [checked]);
    return { checked, toggleItem, stats };
}

/**
 * Та же карта модулей и шагов, что в трекере (общее localStorage). variant: tracker — как в трекере; lessons — спокойнее для раздела «Уроки».
 */
export function PlatformCourseModulesGrid({ studentId, variant = 'tracker' }) {
    const { checked, toggleItem } = usePlatformStepChecklist(studentId);
    const tagLabelFor = (tag) => {
        const t = tag || 'task';
        return variant === 'lessons' ? (PVL_TRACKER_TAG_LABEL[t] || t) : (CHECKLIST_TAG_LABEL[t] || t);
    };
    const articleClass = variant === 'lessons'
        ? 'rounded-2xl border border-slate-100/90 bg-white/90 shadow-sm shadow-slate-200/20 overflow-hidden'
        : 'rounded-2xl border border-slate-100/90 bg-white shadow-sm shadow-slate-200/30 overflow-hidden';

    return (
        <div className="grid gap-6 md:grid-cols-2">
            {PVL_PLATFORM_MODULES.map((mod) => {
                const modTotal = mod.items.length;
                const modDone = mod.items.filter((_, i) => checked[`${mod.id}-${i}`]).length;
                const modPct = modTotal ? Math.round((modDone / modTotal) * 100) : 0;
                const numCls = variant === 'lessons' ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-display font-semibold bg-slate-100 text-slate-700 border border-slate-200/80' : `flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-display font-semibold ${moduleNumClass(mod.cls)}`;
                return (
                    <article key={mod.id} className={articleClass}>
                        <div className={`flex gap-4 p-4 md:p-5 border-b ${variant === 'lessons' ? 'border-slate-100' : 'border-slate-100'}`}>
                            <div className={numCls}>
                                {mod.label}
                            </div>
                            <div>
                                <h4 className={`font-display leading-snug ${variant === 'lessons' ? 'text-base text-slate-800' : 'text-lg text-slate-900'}`}>{mod.title}</h4>
                                <p className="text-xs text-slate-500 mt-0.5">{mod.sub}</p>
                            </div>
                        </div>
                        <div className="p-4 md:p-5">
                            <div className="flex justify-between text-xs text-slate-500 mb-2">
                                <span>{modDone} из {modTotal}</span>
                                <span className="tabular-nums">{modPct}%</span>
                            </div>
                            <div className="h-1 rounded-full bg-slate-100 overflow-hidden mb-4">
                                <div className="h-full rounded-full bg-gradient-to-r from-emerald-600/50 to-[#C8855A]/70" style={{ width: `${modPct}%` }} />
                            </div>
                            <ul className="space-y-0 divide-y divide-slate-50">
                                {mod.items.map((item, i) => {
                                    const key = `${mod.id}-${i}`;
                                    const isDone = !!checked[key];
                                    const tag = item.tag || 'task';
                                    const stLabel = stepLessonStatus(isDone, tag);
                                    return (
                                        <li key={key}>
                                            <button
                                                type="button"
                                                onClick={() => toggleItem(key)}
                                                className="w-full flex flex-wrap sm:flex-nowrap items-start gap-2 sm:gap-3 py-2.5 px-1 rounded-lg text-left hover:bg-slate-50/80 transition-colors"
                                            >
                                                <span
                                                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${isDone ? 'border-emerald-500 bg-emerald-500 text-white' : item.anchor ? 'border-emerald-300' : 'border-slate-200'}`}
                                                >
                                                    {isDone ? '✓' : ''}
                                                </span>
                                                <span className={`text-sm flex-1 min-w-0 leading-snug ${isDone ? 'text-slate-500' : 'text-slate-800'}`}>{item.text}</span>
                                                <span className={`shrink-0 text-[10px] font-medium rounded-full border px-2 py-0.5 ${tagPillClass(tag)}`}>
                                                    {tagLabelFor(tag)}
                                                </span>
                                                <TrackerStatusBadge>{stLabel}</TrackerStatusBadge>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    </article>
                );
            })}
        </div>
    );
}

/**
 * Полный путь курса (pvl_platform.html): модули, шаги, прогресс + задания потока и КТ со статусами.
 * Не дублирует дашборд — только траектория и статусы шагов.
 */
export function StudentCourseTracker({ studentId, navigate }) {
    const { stats } = usePlatformStepChecklist(studentId);
    const { doneSteps, totalSteps, anchorsDone, anchorsTotal, pct } = stats;

    const homework = useMemo(() => pvlDomainApi.studentApi.getStudentResults(studentId, {}), [studentId]);
    const controlPoints = useMemo(() => pvlDomainApi.studentApi.getStudentControlPointsProgress(studentId), [studentId]);

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-700/90 to-slate-800/95 p-6 text-slate-50 shadow-sm">
                <h3 className="font-display text-2xl font-light tracking-tight">Трекер курса</h3>
                <p className="text-sm text-white/75 mt-1">Полный путь по модулям — как в методическом маршруте. Отмечайте шаги по мере прохождения (те же отметки, что в «Уроках»).</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-4 border-t border-white/10">
                    <div className="text-center">
                        <div className="font-display text-3xl tabular-nums">{doneSteps}</div>
                        <div className="text-[10px] uppercase tracking-[0.12em] text-white/55 mt-1">Шагов отмечено</div>
                    </div>
                    <div className="text-center">
                        <div className="font-display text-3xl tabular-nums">{totalSteps}</div>
                        <div className="text-[10px] uppercase tracking-[0.12em] text-white/55 mt-1">Всего шагов</div>
                    </div>
                    <div className="text-center">
                        <div className="font-display text-3xl tabular-nums">{pct}%</div>
                        <div className="text-[10px] uppercase tracking-[0.12em] text-white/55 mt-1">Прогресс</div>
                    </div>
                    <div className="text-center">
                        <div className="font-display text-3xl tabular-nums">{anchorsDone}/{anchorsTotal}</div>
                        <div className="text-[10px] uppercase tracking-[0.12em] text-white/55 mt-1">Якоря</div>
                    </div>
                </div>
            </div>

            <PlatformCourseModulesGrid studentId={studentId} variant="tracker" />

            <section className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-sm">
                <h4 className="font-display text-lg text-slate-800 mb-1">Задания вашего потока</h4>
                <p className="text-xs text-slate-500 mb-3">Статусы как в личном кабинете: от «не начато» до «проверено, посмотрите оценку».</p>
                <ul className="space-y-2">
                    {homework.map((t) => (
                        <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                            <div className="min-w-0">
                                <div className="text-sm font-medium text-slate-800">{t.title}</div>
                                <div className="text-[11px] text-slate-500">Неделя {t.week ?? '—'} · модуль {t.moduleNumber ?? '—'}</div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <TrackerStatusBadge>{t.displayStatus || t.status}</TrackerStatusBadge>
                                {navigate ? (
                                    <button
                                        type="button"
                                        onClick={() => navigate(`/student/results/${t.id}`)}
                                        className="text-[11px] rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[#C8855A] hover:bg-amber-50/80"
                                    >
                                        Открыть
                                    </button>
                                ) : null}
                            </div>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-sm">
                <h4 className="font-display text-lg text-slate-800 mb-1">Контрольные точки</h4>
                <p className="text-xs text-slate-500 mb-3">Якоря допуска и сертификации по неделям.</p>
                <ul className="space-y-2">
                    {controlPoints.map((cp) => (
                        <li key={cp.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm">
                            <div>
                                <span className="font-medium text-slate-800">{cp.id}</span>
                                <span className="text-slate-600"> · {cp.title}</span>
                                <span className="text-[11px] text-slate-400 ml-1">(нед. {cp.weekNumber})</span>
                            </div>
                            <TrackerStatusBadge>{cp.statusLabel}</TrackerStatusBadge>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="rounded-2xl border border-amber-100 bg-amber-50/40 p-5 text-sm text-slate-700 shadow-sm">
                <div className="font-display text-lg text-[#4A3728] mb-1">Финал: сертификация и СЗ</div>
                <p className="text-xs text-slate-600 leading-relaxed">
                    После прохождения модулей — сертификационный завтрак, запись, самооценка по бланку и оценка ментора. Разделы «Сертификация» и «Самооценка» в меню ведут через весь сценарий.
                </p>
            </section>
        </div>
    );
}

/** Короткий чек-лист без полного трекера — ссылка на отдельный экран. */
export function StudentWeeklyChecklistStub({ navigate }) {
    return (
        <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm space-y-3">
            <h2 className="font-display text-2xl text-slate-800">Чек-лист</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
                Здесь можно держать личные пометки по текущей неделе. Полная карта курса, модулей, уроков и статусов заданий — в отдельном разделе «Трекер курса».
            </p>
            <button
                type="button"
                onClick={() => navigate('/student/tracker')}
                className="rounded-full bg-[#4A3728] text-white px-5 py-2.5 text-sm font-medium hover:bg-[#3d2f22]"
            >
                Открыть трекер курса
            </button>
        </div>
    );
}
