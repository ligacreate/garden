import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PVL_PLATFORM_MODULES, PVL_TRACKER_TAG_LABEL, pvlPlatformModuleTitleFromInternal } from '../data/pvlReferenceContent';
import { buildLessonVideoPlayerHtml, PvlLibraryMaterialBody } from './pvlLibraryMaterialShared';
import { formatPvlDateTime } from '../utils/pvlDateFormat';
import { pvlDomainApi, syncPvlActorsFromGarden } from '../services/pvlMockApi';

export function platformStepsStorageKey(studentId) {
    return `pvl_checked_${studentId}`;
}

const PVL_TRACKER_STYLES = `
@keyframes pvl-check-pop {
    0%   { opacity:0; transform:scale(0.2) rotate(-15deg); }
    60%  { transform:scale(1.25) rotate(4deg); }
    100% { opacity:1; transform:scale(1) rotate(0deg); }
}
@keyframes pvl-row-in {
    from { opacity:0; transform:translateY(7px); }
    to   { opacity:1; transform:translateY(0); }
}
@keyframes pvl-sk {
    0%,100% { opacity:.85; }
    50%      { opacity:.4; }
}
.pvl-check-pop { animation: pvl-check-pop 0.28s cubic-bezier(0.34,1.56,0.64,1) both; }
.pvl-row-in    { animation: pvl-row-in 0.3s ease-out both; }
.pvl-sk        { animation: pvl-sk 1.4s ease-in-out infinite; }
`;

function TrackerLoadingSkeleton() {
    return (
        <>
            <style>{PVL_TRACKER_STYLES}</style>
            <div className="grid gap-6 md:grid-cols-2">
                {[0, 1].map((mi) => (
                    <div key={mi} className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
                        <div className="flex gap-4 p-4 border-b border-slate-100">
                            <div className="pvl-sk h-11 w-11 rounded-full bg-slate-200 shrink-0" style={{ animationDelay: `${mi * 180}ms` }} />
                            <div className="flex-1 space-y-2 pt-1">
                                <div className="pvl-sk h-4 rounded bg-slate-200" style={{ width: '55%', animationDelay: `${mi * 180 + 80}ms` }} />
                                <div className="pvl-sk h-3 rounded bg-slate-100" style={{ width: '75%', animationDelay: `${mi * 180 + 130}ms` }} />
                            </div>
                        </div>
                        <div className="p-4 divide-y divide-slate-50">
                            {[72, 88, 64, 78].map((w, i) => (
                                <div key={i} className="py-2.5 flex items-center gap-3">
                                    <div className="pvl-sk h-5 w-5 rounded border-2 border-slate-200 bg-slate-100 shrink-0" style={{ animationDelay: `${mi * 180 + i * 70}ms` }} />
                                    <div className="pvl-sk h-3.5 rounded bg-slate-100 flex-1" style={{ maxWidth: `${w}%`, animationDelay: `${mi * 180 + i * 70 + 35}ms` }} />
                                    <div className="pvl-sk h-4 w-14 rounded-full bg-slate-100 shrink-0" style={{ animationDelay: `${mi * 180 + i * 70 + 55}ms` }} />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
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
    const extId = String(item?.id || item?.contentItemId || '').trim();
    if (extId) return `sid:${extId}`;
    const textSlug = String(item?.text || '')
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '');
    return `m:${moduleId}:s:${textSlug || index}`;
}

function computePlatformStepStats(checked, modules = PVL_PLATFORM_MODULES) {
    let totalSteps = 0;
    let doneSteps = 0;
    let anchorsTotal = 0;
    let anchorsDone = 0;
    modules.forEach((mod) => {
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
 * Показатели дашборда из тех же отметок, что «Трекер курса».
 * modules — CMS-populated модули из buildTrackerModulesFromCms; без них stats будут нулями.
 */
export function computePvlTrackerDashboardStats(checked, modules = PVL_PLATFORM_MODULES) {
    let lessonsDone = 0;
    let lessonsTotal = 0;
    let homeworkDone = 0;
    let homeworkTotal = 0;
    let currentModule = null;

    modules.forEach((mod) => {
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
        currentModule = modules[0] || PVL_PLATFORM_MODULES[0] || null;
    }

    const base = computePlatformStepStats(checked, modules);
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

export function usePlatformStepChecklist(studentId, refreshKey = 0) {
    const storageKey = platformStepsStorageKey(studentId);
    // localStorage — только кэш для мгновенного первого рендера.
    // Единственный источник правды — БД (getTrackerChecklist).
    const [checked, setChecked] = useState(() => {
        try {
            return JSON.parse(typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) || '{}' : '{}');
        } catch {
            return {};
        }
    });
    // true когда DB подтвердила своё состояние (профиль студента загружен syncPvlActorsFromGarden)
    const dbConfirmedRef = useRef(false);
    // toggles выполненные до подтверждения DB — применяем поверх DB при её загрузке
    const pendingTogglesRef = useRef(new Map());

    useEffect(() => {
        try {
            const fromDb = pvlDomainApi.studentApi.getTrackerChecklist(studentId) || {};
            const dbHasData = Object.values(fromDb).some(Boolean);
            // Профиль студента загружен = syncPvlActorsFromGarden завершился = DB синхронизирована
            const studentLoaded = (pvlDomainApi.db.studentProfiles || []).some(
                (p) => String(p.userId) === String(studentId)
            );

            if (dbHasData || studentLoaded) {
                dbConfirmedRef.current = true;
                // Применяем pending-toggles поверх DB-состояния
                const merged = { ...fromDb };
                pendingTogglesRef.current.forEach((val, key) => { merged[key] = val; });
                const hasPending = pendingTogglesRef.current.size > 0;
                pendingTogglesRef.current.clear();

                setChecked(merged);
                localStorage.setItem(storageKey, JSON.stringify(merged));
                if (hasPending || Object.values(merged).some((v, i) => v !== Object.values(fromDb)[i])) {
                    // Есть расхождение (pending toggles) — пишем объединённое состояние в DB
                    pvlDomainApi.studentApi.saveTrackerChecklist(studentId, merged);
                }
            }
            // Если DB ещё не загружена — продолжаем показывать localStorage, не трогаем DB.
        } catch {
            /* ignore */
        }
    }, [storageKey, studentId, refreshKey]);

    const toggleItem = useCallback((key) => {
        setChecked((prev) => {
            const next = { ...prev, [key]: !prev[key] };
            try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }

            if (dbConfirmedRef.current) {
                // DB подтверждена — пишем напрямую
                pvlDomainApi.studentApi.saveTrackerChecklist(studentId, next);
            } else {
                // DB ещё не загружена — ставим в очередь, запишем поверх DB при её загрузке
                pendingTogglesRef.current.set(key, next[key]);
            }
            return next;
        });
    }, [storageKey, studentId]);

    const stats = useMemo(() => computePlatformStepStats(checked), [checked]);
    return { checked, toggleItem, stats };
}

export const HW_STATUS_BADGE = {
    not_started:        { label: 'Не начато',    cls: 'bg-slate-100 text-slate-400 border-slate-200' },
    draft:              { label: 'Черновик',     cls: 'bg-violet-50 text-violet-600 border-violet-200' },
    submitted:          { label: 'Отправлено',   cls: 'bg-amber-50 text-amber-600 border-amber-200' },
    pending_review:     { label: 'На проверке',  cls: 'bg-amber-50 text-amber-600 border-amber-200' },
    revision_requested: { label: 'На доработке', cls: 'bg-orange-50 text-orange-600 border-orange-200' },
    accepted:           { label: 'Принято',      cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
};

export function getHomeworkStatusForItem(studentId, item) {
    if (!studentId || item.tag !== 'task') return null;
    const linkedLessonId = item.lessonId || item.linkedLessonId || null;
    const ciId = item.contentItemId ? String(item.contentItemId) : null;
    const matchedTask = pvlDomainApi.db.homeworkTasks.find(t =>
        (linkedLessonId && (t.linkedLessonIds || []).includes(linkedLessonId)) ||
        (ciId && (t.linkedContentItemId === ciId || t.id === `task-ci-${ciId}`)) ||
        (t.linkedContentItemId && t.title === item.text)
    );
    if (!matchedTask) return null;
    const state = pvlDomainApi.db.studentTaskStates.find(
        s => s.studentId === studentId && s.taskId === matchedTask.id
    );
    return { task: matchedTask, status: state?.status || 'not_started' };
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

    const getHomeworkStatus = (item) => getHomeworkStatusForItem(studentId, item);
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
        <>
        <style>{PVL_TRACKER_STYLES}</style>
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
                                        <li key={key} className="pvl-row-in" style={{ animationDelay: `${i * 35}ms` }}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (interactionMode === 'open' && onOpenItem) {
                                                        onOpenItem({ key, item, module: mod, index: i, isDone });
                                                        return;
                                                    }
                                                    toggleItem(key);
                                                }}
                                                className="w-full flex flex-wrap sm:flex-nowrap items-start gap-2 sm:gap-3 py-2.5 px-2.5 rounded-xl text-left transition-colors rounded-lg px-1 hover:bg-slate-50/80"
                                            >
                                                {isHwStep ? (
                                                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 text-[10px] transition-colors duration-200 ${
                                                        hwInfo.status === 'accepted'
                                                            ? 'border-emerald-500 bg-emerald-500 text-white'
                                                            : hwInfo.status === 'pending_review' || hwInfo.status === 'submitted'
                                                                ? 'border-amber-400 bg-amber-50 text-amber-600'
                                                                : hwInfo.status === 'revision_requested'
                                                                    ? 'border-orange-400 bg-orange-50 text-orange-600'
                                                                    : 'border-[#C4956A]/40 bg-white text-[#C4956A]'
                                                    }`}>
                                                        {hwInfo.status === 'accepted' ? <span className="pvl-check-pop">✓</span> : hwInfo.status === 'pending_review' || hwInfo.status === 'submitted' ? '…' : hwInfo.status === 'revision_requested' ? '!' : ''}
                                                    </span>
                                                ) : (
                                                    <span
                                                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors duration-200 ${isDone ? 'border-emerald-500 bg-emerald-500 text-white' : item.anchor ? 'border-emerald-300' : 'border-slate-200'}`}
                                                        aria-label={isDone ? 'Шаг отмечен' : 'Шаг не отмечен'}
                                                    >
                                                        {isDone ? <span className="pvl-check-pop">✓</span> : null}
                                                    </span>
                                                )}
                                                <span className={`text-sm flex-1 min-w-0 leading-snug transition-colors duration-200 ${isDone ? 'text-slate-500' : 'text-slate-800'}`}>{item.text}</span>
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
        </>
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
    const [syncTick, setSyncTick] = useState(0);
    const resolvedModules = modulesProp || PVL_PLATFORM_MODULES;
    const { checked, toggleItem } = usePlatformStepChecklist(studentId, syncTick + refreshKey);
    // Хранит studentId, для которого миграция уже запущена (null = не запускалась)
    const legacyMigrationDoneRef = useRef(null);
    // Снимок localStorage до того, как DB-wins может его перезаписать
    const originalStorageRef = useRef(null);
    const originalStorageForRef = useRef(null);
    if (originalStorageForRef.current !== String(studentId || '')) {
        originalStorageForRef.current = String(studentId || '');
        try {
            originalStorageRef.current = JSON.parse(
                localStorage.getItem(platformStepsStorageKey(studentId)) || '{}'
            );
        } catch {
            originalStorageRef.current = {};
        }
    }
    useEffect(() => {
        if (legacyMigrationDoneRef.current === String(studentId)) return;
        if (!studentId || !resolvedModules?.length) return;
        const hasCmsItems = resolvedModules.some((mod) => mod.items.some((item) => item.contentItemId));
        if (!hasCmsItems) return;
        // Ждём, пока БД загрузится, чтобы стартовать от актуального состояния БД
        const fromDb = pvlDomainApi.studentApi.getTrackerChecklist(studentId) || {};
        const studentLoaded = (pvlDomainApi.db.studentProfiles || []).some(
            (p) => String(p.userId) === String(studentId)
        );
        if (!studentLoaded && !Object.values(fromDb).some(Boolean)) return;
        legacyMigrationDoneRef.current = String(studentId);
        const storageKey = platformStepsStorageKey(studentId);
        try {
            const originalRaw = originalStorageRef.current || {};
            const slugify = (text) =>
                String(text || '').trim().toLowerCase()
                    .replace(/[^\p{L}\p{N}]+/gu, '-')
                    .replace(/^-+|-+$/g, '');
            // Стартуем от состояния БД, чтобы не потерять данные с других устройств
            const next = { ...fromDb };
            let migrated = false;
            // Проход 1: сопоставление по текстовому слагу (текущее название)
            resolvedModules.forEach((mod) => {
                mod.items.forEach((item, i) => {
                    if (!item.contentItemId) return;
                    const oldKey = `m:${mod.id}:s:${slugify(item.text) || i}`;
                    const newKey = `sid:${item.contentItemId}`;
                    if (originalRaw[oldKey] && !next[newKey]) {
                        next[newKey] = true;
                        migrated = true;
                    }
                });
            });
            // Проход 2: fallback по позиции для переименованных уроков
            resolvedModules.forEach((mod) => {
                const prefix = `m:${mod.id}:s:`;
                const unmatchedItems = mod.items.filter(
                    (item) => item.contentItemId && !next[`sid:${item.contentItemId}`]
                );
                if (unmatchedItems.length === 0) return;
                const allOldCheckedKeys = Object.keys(originalRaw).filter(
                    (k) => k.startsWith(prefix) && originalRaw[k]
                );
                // Ключи, уже использованные в проходе 1
                const claimedKeys = new Set();
                mod.items.forEach((item, i) => {
                    if (!item.contentItemId) return;
                    const oldKey = `m:${mod.id}:s:${slugify(item.text) || i}`;
                    if (originalRaw[oldKey]) claimedKeys.add(oldKey);
                });
                const unclaimedOldKeys = allOldCheckedKeys.filter((k) => !claimedKeys.has(k));
                // Сопоставляем по порядку: i-й незанятый ключ → i-й несопоставленный элемент
                unmatchedItems.forEach((item, idx) => {
                    if (idx < unclaimedOldKeys.length) {
                        next[`sid:${item.contentItemId}`] = true;
                        migrated = true;
                    }
                });
            });
            if (migrated) {
                localStorage.setItem(storageKey, JSON.stringify(next));
                pvlDomainApi.studentApi.saveTrackerChecklist(studentId, next);
                setSyncTick((x) => x + 1);
            }
        } catch { /* ignore */ }
    }, [studentId, resolvedModules, refreshKey]);
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
            if (mounted) {
                forceMentorRefreshTick((x) => x + 1);
                setSyncTick((x) => x + 1);
            }
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
    const [asideOpen, setAsideOpen] = useState(false);
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

    const totalModuleItems = resolvedModules.reduce((s, m) => s + m.items.length, 0);
    useEffect(() => {
        if (!studentId || totalModuleItems === 0) return;
        pvlDomainApi.db.homeworkTasks.forEach(task => {
            const state = pvlDomainApi.db.studentTaskStates.find(
                s => s.studentId === studentId && s.taskId === task.id
            );
            if (state?.status !== 'accepted') return;
            resolvedModules.forEach((mod) => {
                mod.items.forEach((item, i) => {
                    if (item.tag !== 'task') return;
                    const ciId = item.contentItemId ? String(item.contentItemId) : null;
                    const linkedLessonId = item.lessonId || item.linkedLessonId;
                    const matchesByLesson = linkedLessonId && (task.linkedLessonIds || []).includes(linkedLessonId);
                    const matchesByCi = ciId && (task.linkedContentItemId === ciId || task.id === `task-ci-${ciId}`);
                    if (!matchesByLesson && !matchesByCi) return;
                    const key = trackerStepKey(mod.id, item, i);
                    if (!checked[key]) toggleItem(key);
                });
            });
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studentId, totalModuleItems]);

    const syncLibraryAndStepComplete = useCallback(() => {
        if (contentItemId) pvlDomainApi.studentApi.markLibraryItemCompleted(studentId, contentItemId);
        if (activeStep && !checked[activeStep.key]) toggleItem(activeStep.key);
    }, [activeStep, checked, contentItemId, studentId, toggleItem]);

    useEffect(() => { setAsideOpen(false); }, [activeStepKey]);

    if (activeStep) {
        const moduleItems = activeStep.module?.items || [];
        const isChecklistStep = linkedItem?.contentType === 'checklist';
        const isQuizStep = activeStep.item?.tag === 'quiz' && !isChecklistStep;
        const completionLabel = isChecklistStep
            ? 'Готово'
            : (activeStep.item?.tag === 'task' || isQuizStep ? 'Выполнено' : 'Изучено');
        const pillBase = 'inline-flex min-h-[36px] flex-1 basis-[calc(50%-0.25rem)] items-center justify-center rounded-full border px-2.5 py-1.5 text-[13px] font-medium transition-colors sm:min-w-[8.5rem] sm:flex-none sm:basis-auto sm:px-4 sm:text-sm';
        const StepNav = ({ className = '' }) => {
            return (
                <nav className={`flex flex-wrap gap-2 ${className}`} aria-label="Навигация по шагу">
                    <button
                        type="button"
                        disabled={!nextStep}
                        onClick={() => nextStep && setActiveStepKey(nextStep.key)}
                        className={`${pillBase} border-slate-200 bg-white text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                        Дальше
                    </button>
                    <button
                        type="button"
                        disabled={!!checked[activeStep.key]}
                        aria-pressed={checked[activeStep.key] ? 'true' : 'false'}
                        onClick={() => {
                            if (!checked[activeStep.key]) {
                                if (contentItemId) pvlDomainApi.studentApi.markLibraryItemCompleted(studentId, contentItemId);
                                toggleItem(activeStep.key);
                            }
                        }}
                        className={`${pillBase} border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 disabled:cursor-default disabled:opacity-55`}
                    >
                        {completionLabel}
                    </button>
                </nav>
            );
        };
        return (
            <div className="space-y-3 pb-20 md:space-y-4 md:pb-0">
                <div className="max-lg:border-0 max-lg:bg-transparent max-lg:p-0 max-lg:shadow-none lg:rounded-2xl lg:border lg:border-slate-100/90 lg:bg-white lg:p-4 lg:shadow-sm">
                    <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 sm:text-[11px]">
                        <button
                            type="button"
                            onClick={() => setActiveStepKey('')}
                            className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-800 hover:bg-emerald-100"
                        >
                            Трекер
                        </button>
                        <span aria-hidden> / </span>
                        <button
                            type="button"
                            onClick={() => firstStepKeyInActiveModule && setActiveStepKey(firstStepKeyInActiveModule)}
                            className="max-w-[40vw] truncate text-left hover:underline sm:max-w-none"
                        >
                            {activeStep.module?.title || 'Модуль'}
                        </button>
                        <span className="max-lg:hidden" aria-hidden> / </span>
                        <span className="max-lg:hidden min-w-0 text-slate-700">{activeStep.item?.text}</span>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[280px_1fr] lg:gap-4">
                        <aside className="max-lg:border-0 max-lg:bg-transparent max-lg:p-0 lg:rounded-2xl lg:border lg:border-slate-100 lg:bg-slate-50/50 lg:p-3">
                            <button
                                type="button"
                                className="flex w-full items-center justify-between border-b border-slate-200/90 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 lg:hidden"
                                onClick={() => setAsideOpen((v) => !v)}
                            >
                                <span>Шаги блока ({activeModuleStepIndex + 1}/{moduleItems.length})</span>
                                <span className="text-slate-400">{asideOpen ? '▲' : '▼'}</span>
                            </button>
                            <div className="mb-2 hidden text-xs font-semibold uppercase tracking-wide text-slate-500 lg:block">Шаги текущего блока</div>
                            <div
                                className={`max-lg:divide-y max-lg:divide-slate-200/80 max-lg:rounded-lg max-lg:border max-lg:border-slate-200/70 max-lg:bg-white lg:space-y-1.5 ${asideOpen ? 'block' : 'hidden lg:block'}`}
                            >
                                {moduleItems.map((item, i) => {
                                    const key = trackerStepKey(activeStep.module.id, item, i);
                                    const isActive = key === activeStep.key;
                                    const isDone = !!checked[key];
                                    const hwInfo = getHomeworkStatusForItem(studentId, item);
                                    const hwBadge = hwInfo && hwInfo.status !== 'not_started' ? (HW_STATUS_BADGE[hwInfo.status] || null) : null;
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => { setActiveStepKey(key); setAsideOpen(false); }}
                                            className={`w-full px-2.5 py-2.5 text-left text-xs transition-colors max-lg:rounded-none max-lg:border-0 lg:rounded-xl lg:border ${isActive ? 'max-lg:bg-emerald-50/90 lg:border-emerald-200 lg:bg-emerald-50 lg:text-emerald-900' : 'max-lg:bg-white lg:border-slate-200 lg:bg-white lg:text-slate-700 lg:hover:bg-slate-50'}`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="line-clamp-2">{item.text}</span>
                                                {hwBadge ? (
                                                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-medium ${hwBadge.cls}`}>{hwBadge.label}</span>
                                                ) : isDone ? <span className="text-[10px] text-emerald-700">✓</span> : null}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </aside>
                        <section className="min-w-0 max-lg:border-0 max-lg:bg-transparent max-lg:p-0 max-lg:shadow-none lg:rounded-2xl lg:border lg:border-slate-100 lg:bg-white lg:p-5 lg:shadow-sm">
                            <div className="text-[10px] uppercase tracking-wider text-slate-400 max-lg:hidden">Материал</div>
                            <h3 className="font-display mt-1 text-xl leading-snug text-slate-800 max-lg:mt-0 sm:text-2xl lg:mt-1">{activeStep.item?.text}</h3>
                            <p className="text-xs text-slate-500 mt-2">
                                {activeStep.module?.title} · {activeTagLabel}
                                {linkedItem?.completed || (activeStep.key && checked[activeStep.key]) ? ' · пройдено' : ''}
                            </p>
                            {activeStep.item?.tag !== 'task' ? (
                                <StepNav className="mt-3 max-lg:mb-3 lg:hidden" />
                            ) : null}
                            {contentItemId && !linkedItem ? (
                                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm leading-relaxed text-amber-800 max-lg:border-0 max-lg:bg-amber-50/50 sm:p-4">
                                    Материал привязан к шагу, но не найден в данных курса для вашего потока (проверьте seed, БД или учительскую).
                                </div>
                            ) : null}
                            {linkedItem ? (
                                <div className="mt-4">
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
                                <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-sm leading-relaxed text-slate-700 max-lg:border-0 max-lg:bg-slate-50/40 sm:p-4">
                                    Этот шаг пока без привязанного материала. Изучите материал по программе курса и отметьте прохождение кнопкой ниже.
                                </div>
                            ) : null}
                            <StepNav className="mt-4" />
                        </section>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 pb-20 md:pb-0">
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
                {refreshKey === 0 && (
                    <span className="text-xs text-slate-400 animate-pulse">Загружаем данные…</span>
                )}
            </div>
            {refreshKey === 0 ? (
                <TrackerLoadingSkeleton />
            ) : (
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
            )}

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
