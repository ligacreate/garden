import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PVL_PLATFORM_MODULES, PVL_TRACKER_TAG_LABEL, pvlPlatformModuleTitleFromInternal } from '../data/pvlReferenceContent';
import { buildLessonVideoPlayerHtml, isVideoLessonLayout, PvlLibraryMaterialBody } from './pvlLibraryMaterialShared';
import { formatPvlDateTime } from '../utils/pvlDateFormat';
import { pvlDomainApi, syncPvlActorsFromGarden } from '../services/pvlMockApi';

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
    navigate = null,
    routePrefix = '/student',
}) {
    const hookState = usePlatformStepChecklist(studentId);
    const checked = checkedOverride || hookState.checked;
    const toggleItem = onToggleItem || hookState.toggleItem;
    const tagLabelFor = (tag) => {
        const t = tag || 'task';
        return variant === 'lessons' ? (PVL_TRACKER_TAG_LABEL[t] || t) : (CHECKLIST_TAG_LABEL[t] || t);
    };

    const getHomeworkStatus = (item) => {
        if (!studentId || item.tag !== 'task') return null;
        const linkedLessonId = item.lessonId || item.linkedLessonId || null;
        const matchedTask = pvlDomainApi.db.homeworkTasks.find(t =>
            (linkedLessonId && (t.linkedLessonIds || []).includes(linkedLessonId)) ||
            (t.linkedContentItemId && t.title === item.text)
        );
        if (!matchedTask) return null;
        const state = pvlDomainApi.db.studentTaskStates.find(
            s => s.studentId === studentId && s.taskId === matchedTask.id
        );
        return { task: matchedTask, status: state?.status || 'not_started' };
    };

    const HW_STATUS_BADGE = {
        not_started:        { label: 'Не начато',    cls: 'bg-slate-100 text-slate-400 border-slate-200' },
        pending_review:     { label: 'На проверке',  cls: 'bg-amber-50 text-amber-600 border-amber-200' },
        revision_requested: { label: 'На доработке', cls: 'bg-orange-50 text-orange-600 border-orange-200' },
        accepted:           { label: 'Принято',      cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
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
                                    const hwInfo = getHomeworkStatus(item);
                                    const isHwStep = tag === 'task' && !!hwInfo;
                                    const hwBadge = hwInfo ? (HW_STATUS_BADGE[hwInfo.status] || HW_STATUS_BADGE.not_started) : null;
                                    return (
                                        <li key={key}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (isHwStep && navigate && hwInfo?.task) {
                                                        navigate(`${routePrefix}/results/${hwInfo.task.id}`);
                                                        return;
                                                    }
                                                    if (interactionMode === 'open' && onOpenItem) {
                                                        onOpenItem({ key, item, module: mod, index: i, isDone });
                                                        return;
                                                    }
                                                    toggleItem(key);
                                                }}
                                                className="w-full flex flex-wrap sm:flex-nowrap items-start gap-2 sm:gap-3 py-2.5 px-2.5 rounded-xl text-left transition-colors rounded-lg px-1 hover:bg-slate-50/80"
                                            >
                                                {isHwStep ? (
                                                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 text-[10px] ${
                                                        hwInfo.status === 'accepted'
                                                            ? 'border-emerald-500 bg-emerald-500 text-white'
                                                            : hwInfo.status === 'pending_review'
                                                                ? 'border-amber-400 bg-amber-50 text-amber-600'
                                                                : hwInfo.status === 'revision_requested'
                                                                    ? 'border-orange-400 bg-orange-50 text-orange-600'
                                                                    : 'border-[#C4956A]/40 bg-white text-[#C4956A]'
                                                    }`}>
                                                        {hwInfo.status === 'accepted' ? '✓' : hwInfo.status === 'pending_review' ? '…' : hwInfo.status === 'revision_requested' ? '!' : '✏'}
                                                    </span>
                                                ) : (
                                                    <span
                                                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${isDone ? 'border-emerald-500 bg-emerald-500 text-white' : item.anchor ? 'border-emerald-300' : 'border-slate-200'}`}
                                                        aria-label={isDone ? 'Шаг отмечен' : 'Шаг не отмечен'}
                                                    >
                                                        {isDone ? '✓' : ''}
                                                    </span>
                                                )}
                                                <span className={`text-sm flex-1 min-w-0 leading-snug ${isDone ? 'text-slate-500' : 'text-slate-800'}`}>{item.text}</span>
                                                <span className={`shrink-0 text-[10px] font-medium rounded-full border px-2 py-0.5 ${tagPillClass(tag)}`}>
                                                    {tagLabelFor(tag)}
                                                </span>
                                                {isHwStep && hwBadge && (
                                                    <span className={`shrink-0 text-[10px] font-medium rounded-full border px-2 py-0.5 ${hwBadge.cls}`}>
                                                        {hwBadge.label}
                                                    </span>
                                                )}
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
    routePrefix = '/student',
    navigate = null,
    gardenBridgeRef = null,
    refreshKey = 0,
}) {
    const mentorHydrationAttemptedRef = useRef('');
    const [, forceMentorRefreshTick] = useState(0);
    const resolvedModules = modulesProp || PVL_PLATFORM_MODULES;
    const { checked, toggleItem } = usePlatformStepChecklist(studentId);
    const studentProfile = (pvlDomainApi.db.studentProfiles || []).find((p) => String(p.userId) === String(studentId)) || null;
    const mentorUserId = (() => {
        const direct = studentProfile?.mentorId ? String(studentProfile.mentorId) : null;
        if (direct) {
            const byDirect = (pvlDomainApi.db.mentorProfiles || []).find((m) => (
                String(m?.userId) === direct || String(m?.id) === direct
            ));
            if (byDirect?.userId) return String(byDirect.userId);
            return direct;
        }
        const fallbackMentor = (pvlDomainApi.db.mentorProfiles || []).find((m) => (
            Array.isArray(m?.menteeIds) && m.menteeIds.some((id) => String(id) === String(studentId))
        ));
        return fallbackMentor?.userId ? String(fallbackMentor.userId) : null;
    })();
    const mentorUser = mentorUserId
        ? ((pvlDomainApi.db.users || []).find((u) => String(u.id) === mentorUserId) || null)
        : null;
    useEffect(() => {
        const sid = String(studentId || '');
        if (!sid) return;
        if (mentorUserId) {
            mentorHydrationAttemptedRef.current = '';
            return;
        }
        if (mentorHydrationAttemptedRef.current === sid) return;
        mentorHydrationAttemptedRef.current = sid;
        let mounted = true;
        (async () => {
            try {
                await syncPvlActorsFromGarden();
            } catch {
                /* noop */
            }
            if (mounted) forceMentorRefreshTick((x) => x + 1);
        })();
        return () => {
            mounted = false;
        };
    }, [studentId, mentorUserId]);
    const mentorLabel = mentorUser?.fullName || mentorUser?.name || 'Ментор';
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
    const firstStepKeyInActiveModule = activeStep
        ? (orderedSteps.find((s) => s.module?.id === activeStep.module?.id)?.key || '')
        : '';

    const contentItemId = activeStep?.item?.contentItemId ? String(activeStep.item.contentItemId).trim() : '';
    const linkedItem = useMemo(() => {
        if (!contentItemId || !studentId) return null;
        return pvlDomainApi.studentApi.getPublishedContentItemForStudent(studentId, contentItemId);
    // refreshKey — после sync БД/Сада; cohortId профиля — тот же поток, что и buildTrackerModulesFromCms
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studentId, contentItemId, checked[activeStep?.key || ''], refreshKey, studentProfile?.cohortId]);

    const lessonVideoPlayerHtml = useMemo(
        () => (linkedItem ? buildLessonVideoPlayerHtml(linkedItem) : ''),
        [linkedItem?.id, linkedItem?.lessonVideoEmbed, linkedItem?.lessonVideoUrl],
    );

    useEffect(() => {
        if (!activeStep?.key || !contentItemId || !studentId) return;
        const item = pvlDomainApi.studentApi.getPublishedContentItemForStudent(studentId, contentItemId);
        pvlDomainApi.studentApi.updateLibraryProgress(studentId, contentItemId, Math.max(10, item?.progressPercent || 10));
    }, [activeStep?.key, contentItemId, studentId]);

    useEffect(() => {
        if (!studentId) return;
        pvlDomainApi.db.homeworkTasks.forEach(task => {
            const state = pvlDomainApi.db.studentTaskStates.find(
                s => s.studentId === studentId && s.taskId === task.id
            );
            if (state?.status !== 'accepted') return;
            resolvedModules.forEach((mod) => {
                mod.items.forEach((item, i) => {
                    if (item.tag !== 'task') return;
                    const linkedLessonId = item.lessonId || item.linkedLessonId;
                    const matches = linkedLessonId && (task.linkedLessonIds || []).includes(linkedLessonId);
                    if (!matches) return;
                    const key = trackerStepKey(mod.id, item, i);
                    if (!checked[key]) toggleItem(key);
                });
            });
        });
    }, [studentId]);

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
                                {activeStep.module?.title} · {activeTagLabel}
                                {linkedItem?.completed || (activeStep.key && checked[activeStep.key]) ? ' · пройдено' : ''}
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
                                    <PvlLibraryMaterialBody
                                        key={linkedItem.id}
                                        variant="tracker"
                                        selectedItem={linkedItem}
                                        lessonVideoPlayerHtml={lessonVideoPlayerHtml}
                                        onQuizPassed={syncLibraryAndStepComplete}
                                        studentId={studentId}
                                        navigate={navigate}
                                        routePrefix={routePrefix}
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

            <section className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-sm">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Пиши, веди, люби</div>
                <h3 className="font-display text-lg text-slate-800 mt-1">Ваш ментор</h3>
                {mentorUser ? (
                    <button
                        type="button"
                        onClick={() => {
                            if (mentorUserId && gardenBridgeRef?.current?.openGardenUserProfile) {
                                gardenBridgeRef.current.openGardenUserProfile(mentorUserId);
                            }
                        }}
                        disabled={!gardenBridgeRef?.current?.openGardenUserProfile || !mentorUserId}
                        className={`mt-3 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${
                            gardenBridgeRef?.current?.openGardenUserProfile && mentorUserId
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                : 'border-slate-200 bg-slate-50 text-slate-500 cursor-default'
                        }`}
                    >
                        {mentorLabel}
                    </button>
                ) : (
                    <div className="mt-2 text-sm text-slate-500">Ментор пока не назначен.</div>
                )}
            </section>

            <div className="flex flex-wrap items-end justify-between gap-2">
                <h3 className="font-display text-lg text-slate-800">Модули курса</h3>
            </div>
            <PlatformCourseModulesGrid
                studentId={studentId}
                modules={resolvedModules}
                variant="tracker"
                checkedOverride={checked}
                onToggleItem={toggleItem}
                interactionMode="open"
                onOpenItem={({ key }) => setActiveStepKey(key)}
                navigate={navigate}
                routePrefix={routePrefix}
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
