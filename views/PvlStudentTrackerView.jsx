import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PVL_PLATFORM_MODULES, PVL_TRACKER_TAG_LABEL } from '../data/pvlReferenceContent';
import { formatPvlDateTime } from '../utils/pvlDateFormat';

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
    if (cls === 'mod-0') return 'bg-emerald-700 text-white';
    if (cls === 'mod-1') return 'bg-emerald-600 text-white';
    if (cls === 'mod-2') return 'bg-teal-700 text-white';
    return 'bg-teal-800 text-white';
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

const TRACKER_LESSON_TAGS = new Set(['video', 'pdf', 'live']);
const TRACKER_HOMEWORK_TAGS = new Set(['task', 'quiz']);

/**
 * Показатели дашборда из тех же отметок, что «Трекер курса» (localStorage + PVL_PLATFORM_MODULES).
 */
export function computePvlTrackerDashboardStats(checked) {
    let lessonsDone = 0;
    let lessonsTotal = 0;
    let homeworkDone = 0;
    let homeworkTotal = 0;
    let currentModule = null;

    PVL_PLATFORM_MODULES.forEach((mod) => {
        let moduleHasIncomplete = false;
        mod.items.forEach((item, i) => {
            const key = `${mod.id}-${i}`;
            const done = !!checked[key];
            const tag = item.tag || 'task';
            if (TRACKER_LESSON_TAGS.has(tag)) {
                lessonsTotal += 1;
                if (done) lessonsDone += 1;
            }
            if (TRACKER_HOMEWORK_TAGS.has(tag)) {
                homeworkTotal += 1;
                if (done) homeworkDone += 1;
            }
            if (!done) moduleHasIncomplete = true;
        });
        if (moduleHasIncomplete && currentModule === null) currentModule = mod;
    });

    if (!currentModule) {
        currentModule = PVL_PLATFORM_MODULES[PVL_PLATFORM_MODULES.length - 1] || null;
    }

    const base = computePlatformStepStats(checked);
    return {
        ...base,
        currentModuleTitle: currentModule?.title || '—',
        lessonsDone,
        lessonsTotal,
        lessonsRemaining: Math.max(0, lessonsTotal - lessonsDone),
        homeworkDone,
        homeworkTotal,
        homeworkRemaining: Math.max(0, homeworkTotal - homeworkDone),
    };
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
export function PlatformCourseModulesGrid({
    studentId,
    variant = 'tracker',
    checkedOverride = null,
    onToggleItem = null,
    onOpenItem = null,
    interactionMode = 'toggle',
}) {
    const hookState = usePlatformStepChecklist(studentId);
    const checked = checkedOverride || hookState.checked;
    const toggleItem = onToggleItem || hookState.toggleItem;
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
                                                onClick={() => {
                                                    if (interactionMode === 'open' && onOpenItem) {
                                                        onOpenItem({ key, item, module: mod, index: i, isDone });
                                                        return;
                                                    }
                                                    toggleItem(key);
                                                }}
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
 * Полный путь курса: модули (включая модуль 0), шаги, прогресс и задания потока со статусами.
 * Не дублирует дашборд — только траектория и статусы шагов.
 */
export function StudentCourseTracker({ studentId, navigate }) {
    const { checked, toggleItem, stats } = usePlatformStepChecklist(studentId);
    const { doneSteps, totalSteps, pct } = stats;
    const [activeStepKey, setActiveStepKey] = useState('');
    const orderedSteps = useMemo(
        () => PVL_PLATFORM_MODULES.flatMap((mod) => mod.items.map((item, i) => ({ key: `${mod.id}-${i}`, item, module: mod, index: i }))),
        [],
    );
    const activeStepIndex = useMemo(() => orderedSteps.findIndex((s) => s.key === activeStepKey), [orderedSteps, activeStepKey]);
    const activeStep = activeStepIndex >= 0 ? orderedSteps[activeStepIndex] : null;
    const prevStep = activeStepIndex > 0 ? orderedSteps[activeStepIndex - 1] : null;
    const nextStep = activeStepIndex >= 0 && activeStepIndex < orderedSteps.length - 1 ? orderedSteps[activeStepIndex + 1] : null;
    const activeTagLabel = activeStep ? (PVL_TRACKER_TAG_LABEL[activeStep.item?.tag] || activeStep.item?.tag || 'материал') : 'материал';
    const activeStatus = activeStep ? stepLessonStatus(!!checked[activeStep.key], activeStep.item?.tag) : '';

    if (activeStep) {
        const moduleItems = activeStep.module?.items || [];
        return (
            <div className="space-y-4">
                <div className="rounded-2xl border border-slate-100/90 bg-white p-4 shadow-sm">
                    <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-800">Трекер</span>
                        <span> / </span>
                        <span>{activeStep.module?.title || 'Модуль'}</span>
                        <span> / </span>
                        <span className="text-slate-700">{activeStep.item?.text}</span>
                    </div>
                    <div className="grid lg:grid-cols-[280px_1fr] gap-4">
                        <aside className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3">
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Шаги текущего блока</div>
                            <div className="space-y-1.5">
                                {moduleItems.map((item, i) => {
                                    const key = `${activeStep.module.id}-${i}`;
                                    const isActive = key === activeStep.key;
                                    const isDone = !!checked[key];
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => setActiveStepKey(key)}
                                            className={`w-full text-left rounded-xl border px-2.5 py-2 text-xs transition-colors ${isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="line-clamp-2">{item.text}</span>
                                                {isDone ? <span className="text-[10px] text-emerald-700">✓</span> : null}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </aside>
                        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                            <div className="text-[10px] uppercase tracking-wider text-slate-400">Материал</div>
                            <h3 className="font-display text-2xl text-slate-800 mt-1">{activeStep.item?.text}</h3>
                            <p className="text-xs text-slate-500 mt-2">
                                {activeStep.module?.title} · {activeTagLabel} · {activeStatus}
                            </p>
                            <div className="mt-4 text-sm text-slate-700 leading-relaxed rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                                Это экран урока в логике трекера. Изучите материал и отметьте прохождение кнопкой ниже.
                            </div>
                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setActiveStepKey('')}
                                    className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                                >
                                    Назад к трекеру
                                </button>
                                <button
                                    type="button"
                                    disabled={!prevStep}
                                    onClick={() => prevStep && setActiveStepKey(prevStep.key)}
                                    className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    Предыдущий урок
                                </button>
                                <button
                                    type="button"
                                    disabled={!nextStep}
                                    onClick={() => nextStep && setActiveStepKey(nextStep.key)}
                                    className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    Следующий урок
                                </button>
                                <button
                                    type="button"
                                    onClick={() => toggleItem(activeStep.key)}
                                    className="text-xs rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 px-3 py-1.5 hover:bg-emerald-100"
                                >
                                    {checked[activeStep.key] ? 'Снять отметку «Изучено»' : 'Отметить как изучено'}
                                </button>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-700/95 via-emerald-800/95 to-teal-900 p-6 text-slate-50 shadow-sm">
                <h3 className="font-display text-2xl font-light tracking-tight">Трекер курса</h3>
                <p className="text-sm text-white/75 mt-1">Полный путь по модулям, начиная с <span className="text-white font-medium">модуля 0 (вход и настройка)</span>. Клик по строке открывает урок справа, отметка ставится только внутри урока.</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 pt-4 border-t border-white/10">
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
                </div>
            </div>

            <PlatformCourseModulesGrid
                studentId={studentId}
                variant="tracker"
                checkedOverride={checked}
                onToggleItem={toggleItem}
                interactionMode="open"
                onOpenItem={(payload) => setActiveStepKey(payload.key)}
            />

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
                Здесь можно держать личные пометки по текущему модулю. Полная карта курса, модулей, уроков и статусов заданий — в отдельном разделе «Трекер курса».
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
