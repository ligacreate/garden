import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PVL_PLATFORM_MODULES, PVL_TRACKER_TAG_LABEL, pvlPlatformModuleTitleFromInternal } from '../data/pvlReferenceContent';
import { buildLessonVideoPlayerHtml, isVideoLessonLayout, PvlLibraryMaterialBody } from './pvlLibraryMaterialShared';
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
    if (cls === 'mod-0') return 'bg-amber-700 text-white';
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

function trackerStepKey(moduleId, item, index) {
    const extId = String(item?.id || '').trim();
    if (extId) return `sid:${extId}`;
    const textSlug = String(item?.text || '')
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '');
    return `m:${moduleId}:s:${textSlug || index}`;
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
            const key = trackerStepKey(mod.id, item, i);
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
            const key = trackerStepKey(mod.id, item, i);
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
        currentModule = PVL_PLATFORM_MODULES[0] || null;
    }

    const base = computePlatformStepStats(checked);
    return {
        ...base,
        currentModuleTitle: currentModule?.title || pvlPlatformModuleTitleFromInternal(1),
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
            const local = JSON.parse(localStorage.getItem(storageKey) || '{}');
            const fromDb = pvlDomainApi.studentApi.getTrackerChecklist(studentId) || {};
            const source = Object.keys(fromDb).length ? fromDb : local;
            const migrated = { ...source };
            PVL_PLATFORM_MODULES.forEach((mod) => {
                mod.items.forEach((item, i) => {
                    const oldKey = `${mod.id}-${i}`;
                    const newKey = trackerStepKey(mod.id, item, i);
                    if (source[oldKey] && !source[newKey]) migrated[newKey] = true;
                });
            });
            const merged = migrated;
            setChecked(merged);
            localStorage.setItem(storageKey, JSON.stringify(merged));
        } catch {
            setChecked({});
        }
    }, [storageKey, studentId]);

    const toggleItem = useCallback((key) => {
        setChecked((prev) => {
            const next = { ...prev, [key]: !prev[key] };
            try {
                localStorage.setItem(storageKey, JSON.stringify(next));
            } catch {
                /* ignore */
            }
            pvlDomainApi.studentApi.saveTrackerChecklist(studentId, next);
            return next;
        });
    }, [storageKey, studentId]);

    const stats = useMemo(() => computePlatformStepStats(checked), [checked]);
    return { checked, toggleItem, stats };
}

/**
 * Та же карта модулей и шагов, что в трекере (общее localStorage). variant: tracker — как в трекере; lessons — спокойнее для раздела «Уроки».
 */
export function PlatformCourseModulesGrid({
    studentId,
    modules: modulesProp = null,
    variant = 'tracker',
    checkedOverride = null,
    onToggleItem = null,
    onOpenItem = null,
    interactionMode = 'toggle',
    /** Показать один модуль (шаги уроков/тестов) — после выбора карточки на корне трекера */
    onlyModuleId = null,
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

    const resolvedModules = modulesProp || PVL_PLATFORM_MODULES;
    const modulesToShow = useMemo(() => {
        if (onlyModuleId == null) return resolvedModules;
        return resolvedModules.filter((m) => Number(m.id) === Number(onlyModuleId));
    }, [onlyModuleId, resolvedModules]);

    const gridClass =
        onlyModuleId != null ? 'grid gap-6 grid-cols-1 max-w-3xl' : 'grid gap-6 md:grid-cols-2';

    return (
        <div className={gridClass}>
            {modulesToShow.map((mod) => {
                const numCls = variant === 'lessons'
                    ? 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl leading-none bg-slate-100 text-slate-700 border border-slate-200/80'
                    : `flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl leading-none ${moduleNumClass(mod.cls)}`;
                return (
                    <article key={mod.id} className={articleClass}>
                        <div className={`flex gap-4 p-4 md:p-5 border-b ${variant === 'lessons' ? 'border-slate-100' : 'border-slate-100'}`}>
                            <div
                                className={numCls}
                                aria-label={mod.icon && mod.label ? `Модуль ${mod.label}` : undefined}
                            >
                                {mod.icon ? (
                                    <span aria-hidden>{mod.icon}</span>
                                ) : (
                                    <span className="text-[10px] font-display font-semibold text-center leading-tight px-0.5">{mod.label}</span>
                                )}
                            </div>
                            <div>
                                <h4 className={`font-display leading-snug ${variant === 'lessons' ? 'text-base text-slate-800' : 'text-lg text-slate-900'}`}>{mod.title}</h4>
                                <p className="text-xs text-slate-500 mt-0.5">{mod.sub}</p>
                            </div>
                        </div>
                        <div className="p-4 md:p-5">
                            <ul className="space-y-0 divide-y divide-slate-50">
                                {!mod.items?.length ? (
                                    <li className="py-6 px-2 text-sm text-slate-500 text-center leading-relaxed">
                                        Здесь скоро появятся уроки
                                    </li>
                                ) : (
                                    mod.items.map((item, i) => {
                                    const key = trackerStepKey(mod.id, item, i);
                                    const isDone = !!checked[key];
                                    const tag = item.tag || 'task';
                                    const stLabel = stepLessonStatus(isDone, tag);
                                    const quizCard = tag === 'quiz';
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
                                                className={`w-full flex flex-wrap sm:flex-nowrap items-start gap-2 sm:gap-3 py-2.5 px-2.5 rounded-xl text-left transition-colors ${
                                                    quizCard
                                                        ? 'border border-emerald-200/70 bg-gradient-to-br from-emerald-50/90 to-white shadow-[0_8px_24px_-14px_rgba(15,23,42,0.08)] hover:from-emerald-50 hover:to-emerald-50/50'
                                                        : 'rounded-lg px-1 hover:bg-slate-50/80'
                                                }`}
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
                                })
                                )}
                            </ul>
                        </div>
                    </article>
                );
            })}
        </div>
    );
}

/**
 * Полный путь курса: три опоры (Пиши / Веди / Люби), шаги, прогресс и задания потока со статусами.
 * Не дублирует дашборд — только траектория и статусы шагов.
 */
export function StudentCourseTracker({
    studentId,
    modules: modulesProp = null,
    navigate = null,
    routePrefix = '/student',
}) {
    const resolvedModules = modulesProp || PVL_PLATFORM_MODULES;
    const { checked, toggleItem } = usePlatformStepChecklist(studentId);
    const { doneSteps, totalSteps, pct } = useMemo(() => {
        let done = 0;
        let total = 0;
        resolvedModules.forEach((mod) => {
            mod.items.forEach((item, i) => {
                total += 1;
                if (checked[trackerStepKey(mod.id, item, i)]) done += 1;
            });
        });
        return { doneSteps: done, totalSteps: total, pct: total ? Math.round((done / total) * 100) : 0 };
    }, [resolvedModules, checked]);
    /** Пусто = сетка карточек модулей; иначе открыт шаг (слева список шага модуля, справа материал). */
    const [activeStepKey, setActiveStepKey] = useState('');
    const orderedSteps = useMemo(
        () => resolvedModules.flatMap((mod) => mod.items.map((item, i) => ({ key: trackerStepKey(mod.id, item, i), item, module: mod, index: i }))),
        [resolvedModules],
    );
    const activeStepIndex = useMemo(() => orderedSteps.findIndex((s) => s.key === activeStepKey), [orderedSteps, activeStepKey]);
    const activeStep = activeStepIndex >= 0 ? orderedSteps[activeStepIndex] : null;
    const moduleOrderedSteps = useMemo(() => {
        if (!activeStep?.module?.items) return [];
        return activeStep.module.items.map((item, i) => ({
            key: trackerStepKey(activeStep.module.id, item, i),
            item,
            module: activeStep.module,
            index: i,
        }));
    }, [activeStep?.module?.id, activeStep?.module?.items]);
    const activeModuleStepIndex = useMemo(
        () => moduleOrderedSteps.findIndex((s) => s.key === activeStepKey),
        [moduleOrderedSteps, activeStepKey],
    );
    const prevStep = activeModuleStepIndex > 0 ? moduleOrderedSteps[activeModuleStepIndex - 1] : null;
    const nextStep = activeModuleStepIndex >= 0 && activeModuleStepIndex < moduleOrderedSteps.length - 1
        ? moduleOrderedSteps[activeModuleStepIndex + 1]
        : null;
    const activeTagLabel = activeStep ? (PVL_TRACKER_TAG_LABEL[activeStep.item?.tag] || activeStep.item?.tag || 'материал') : 'материал';
    const activeStatus = activeStep ? stepLessonStatus(!!checked[activeStep.key], activeStep.item?.tag) : '';
    const firstStepKeyInActiveModule = activeStep
        ? (orderedSteps.find((s) => s.module?.id === activeStep.module?.id)?.key || '')
        : '';

    const contentItemId = activeStep?.item?.contentItemId ? String(activeStep.item.contentItemId).trim() : '';
    const linkedItem = useMemo(() => {
        if (!contentItemId || !studentId) return null;
        return pvlDomainApi.studentApi.getPublishedLibraryItemById(studentId, contentItemId);
    }, [studentId, contentItemId, checked[activeStep?.key || '']]);

    const lessonVideoPlayerHtml = useMemo(
        () => (linkedItem ? buildLessonVideoPlayerHtml(linkedItem) : ''),
        [linkedItem?.id, linkedItem?.lessonVideoEmbed, linkedItem?.lessonVideoUrl],
    );

    useEffect(() => {
        if (!activeStep?.key || !contentItemId || !studentId) return;
        const item = pvlDomainApi.studentApi.getPublishedLibraryItemById(studentId, contentItemId);
        pvlDomainApi.studentApi.updateLibraryProgress(studentId, contentItemId, Math.max(10, item?.progressPercent || 10));
    }, [activeStep?.key, contentItemId, studentId]);

    const syncLibraryAndStepComplete = useCallback(() => {
        if (contentItemId) pvlDomainApi.studentApi.markLibraryItemCompleted(studentId, contentItemId);
        if (activeStep && !checked[activeStep.key]) toggleItem(activeStep.key);
    }, [activeStep, checked, contentItemId, studentId, toggleItem]);

    if (activeStep) {
        const moduleItems = activeStep.module?.items || [];
        return (
            <div className="space-y-4">
                <div className="rounded-2xl border border-slate-100/90 bg-white p-4 shadow-sm">
                    <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                        <button
                            type="button"
                            onClick={() => setActiveStepKey('')}
                            className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-800 hover:bg-emerald-100"
                        >
                            Трекер
                        </button>
                        <span> / </span>
                        <button
                            type="button"
                            onClick={() => firstStepKeyInActiveModule && setActiveStepKey(firstStepKeyInActiveModule)}
                            className="hover:underline"
                        >
                            {activeStep.module?.title || 'Модуль'}
                        </button>
                        <span> / </span>
                        <span className="text-slate-700">{activeStep.item?.text}</span>
                    </div>
                    <div className="grid lg:grid-cols-[280px_1fr] gap-4">
                        <aside className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3">
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Шаги текущего блока</div>
                            <div className="space-y-1.5">
                                {moduleItems.map((item, i) => {
                                    const key = trackerStepKey(activeStep.module.id, item, i);
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
                                {activeStep.module?.title} · {activeTagLabel} · {linkedItem?.completed ? 'пройдено' : activeStatus}
                            </p>
                            {contentItemId && !linkedItem ? (
                                <div className="mt-4 text-sm text-amber-800 leading-relaxed rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                                    Материал привязан к шагу, но не найден в данных курса для вашего потока (проверьте seed, БД или учительскую).
                                </div>
                            ) : null}
                            {linkedItem ? (
                                <div
                                    className={
                                        isVideoLessonLayout(linkedItem)
                                            ? 'mt-4'
                                            : 'mt-4 max-h-[min(70vh,640px)] overflow-y-auto pr-1'
                                    }
                                >
                                    {contentItemId && navigate ? (
                                        <div className="mb-3 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => navigate(`${routePrefix}/library/${contentItemId}`)}
                                                className="text-xs rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-900 hover:bg-emerald-100"
                                            >
                                                Открыть урок полностью (как в библиотеке)
                                            </button>
                                        </div>
                                    ) : null}
                                    <PvlLibraryMaterialBody
                                        key={linkedItem.id}
                                        variant="tracker"
                                        selectedItem={linkedItem}
                                        lessonVideoPlayerHtml={lessonVideoPlayerHtml}
                                        onQuizPassed={syncLibraryAndStepComplete}
                                    />
                                </div>
                            ) : !contentItemId ? (
                                <div className="mt-4 text-sm text-slate-700 leading-relaxed rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                                    Этот шаг пока без привязанного материала. Изучите материал по программе курса и отметьте прохождение кнопкой ниже.
                                </div>
                            ) : null}
                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setActiveStepKey('')}
                                    className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                                >
                                    Назад к модулям
                                </button>
                                <button
                                    type="button"
                                    disabled={!prevStep}
                                    onClick={() => prevStep && setActiveStepKey(prevStep.key)}
                                    className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    Предыдущий шаг
                                </button>
                                <button
                                    type="button"
                                    disabled={!nextStep}
                                    onClick={() => nextStep && setActiveStepKey(nextStep.key)}
                                    className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    Следующий шаг
                                </button>
                                <button
                                    type="button"
                                    disabled={!!checked[activeStep.key]}
                                    onClick={() => {
                                        if (!checked[activeStep.key]) {
                                            if (contentItemId) pvlDomainApi.studentApi.markLibraryItemCompleted(studentId, contentItemId);
                                            toggleItem(activeStep.key);
                                        }
                                    }}
                                    className="text-xs rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 px-3 py-1.5 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {checked[activeStep.key] ? 'Отмечено как изучено' : 'Отметить как изучено'}
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

            <div className="flex flex-wrap items-end justify-between gap-2">
                <h3 className="font-display text-lg text-slate-800">Модули курса</h3>
                <p className="text-xs text-slate-500 max-w-xl">
                    Модульный контур: шаги каждого модуля доступны сразу внизу. Клик по шагу открывает урок справа в рабочем режиме трекера.
                </p>
            </div>
            <PlatformCourseModulesGrid
                studentId={studentId}
                modules={resolvedModules}
                variant="tracker"
                checkedOverride={checked}
                onToggleItem={toggleItem}
                interactionMode="open"
                onOpenItem={({ key }) => setActiveStepKey(key)}
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
