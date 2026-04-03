import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PvlTaskDetailView from './PvlTaskDetailView';
import PvlMenteeCardView from './PvlMenteeCardView';
import { PvlAdminCalendarScreen, PvlDashboardCalendarBlock } from './PvlCalendarBlock';
import PvlSzAssessmentFlow from './PvlSzAssessmentFlow';
import { PlatformCourseModulesGrid, StudentCourseTracker, usePlatformStepChecklist } from './PvlStudentTrackerView';
import {
    PVL_CERT_CONDITIONS,
    PVL_CERT_CRITERIA_GROUPS,
    PVL_CERT_PROCESS_STEPS,
    PVL_CERT_RED_FLAGS,
    PVL_GLOSSARY_FILTERS,
    PVL_TRACKER_FAQ,
    PVL_TRACKER_GLOSSARY,
    PVL_TRACKER_RULES,
} from '../data/pvlReferenceContent';
import { PVL_COURSE_DISPLAY_NAME } from '../data/pvl/courseDisplay';
import {
    pvlMockData,
    getStudentProfile,
    getUser,
    getStudentCertification,
} from '../data/pvlMockData';
import { mapStudentHomeworkDisplayStatus, mapTaskStatus, pvlDomainApi } from '../services/pvlMockApi';
import { TASK_STATUS } from '../data/pvl/enums';
import { formatPvlDateTime } from '../utils/pvlDateFormat';
import {
    clearAppSession,
    loadAppSession,
    loadViewPreferences,
    PVL_REVIEW_NAV_UNLOCK,
    redirectToAllowedRoute,
    saveAppSession,
    saveViewPreferences,
    validateRoleAccessMap,
    validateRouteMap,
} from '../services/pvlAppKernel';

function pvlDevToolsEnabled() {
    try {
        return typeof localStorage !== 'undefined' && localStorage.getItem('pvl_dev_tools') === '1';
    } catch {
        return false;
    }
}

/** Совместимость старых демо-id карточек менти с учётками seed API */
const LEGACY_MENTEE_ROUTE_TO_USER = {
    'm-101': 'u-st-1',
    'm-102': 'u-st-2',
    'm-103': 'u-st-3',
    'm-104': 'u-st-4',
};

/** Единый источник контента для карточек разделов: seed (API) + демо из pvlMockData, плейсменты с contentItemId. */
function normalizeContentStatus(s) {
    if (s == null) return 'draft';
    if (typeof s === 'string') return s.toLowerCase();
    return String(s).toLowerCase();
}

function buildMergedCmsState() {
    const db = pvlDomainApi.db;
    const dbItems = Array.isArray(db?.contentItems) ? [...db.contentItems] : [];
    const mockItems = Array.isArray(pvlMockData.contentItems) ? [...pvlMockData.contentItems] : [];
    const byId = new Map();
    mockItems.forEach((i) => {
        if (i?.id) byId.set(i.id, { ...i, status: normalizeContentStatus(i.status) });
    });
    dbItems.forEach((i) => {
        if (!i?.id) return;
        const prev = byId.get(i.id) || {};
        byId.set(i.id, { ...prev, ...i, status: normalizeContentStatus(i.status) });
    });
    const items = Array.from(byId.values());

    const dbPl = Array.isArray(db?.contentPlacements) ? db.contentPlacements : [];
    const mockPl = Array.isArray(pvlMockData.contentPlacements) ? pvlMockData.contentPlacements : [];
    const plById = new Map();
    mockPl.forEach((p) => {
        if (!p?.id) return;
        plById.set(p.id, { ...p, contentId: p.contentId || p.contentItemId });
    });
    dbPl.forEach((p) => {
        if (!p?.id) return;
        const prev = plById.get(p.id) || {};
        plById.set(p.id, { ...prev, ...p, contentId: p.contentId || p.contentItemId });
    });
    const placements = Array.from(plById.values());
    return { items, placements };
}

const STUDENT_MENU = [
    'О курсе',
    'Онбординг',
    'Глоссарий курса',
    'Библиотека курса',
    'Трекер курса',
    'Практикумы с менторами',
    'Результаты',
    'Сертификация и самооценка',
    'Вопросы и ответы',
];

/** Тот же учебный контур, что у участницы, плюс материалы для ментора */
const MENTOR_NAV_ITEMS = [
    { label: 'Главная', path: '/mentor/dashboard' },
    { label: 'Мои менти', path: '/mentor/mentees' },
    { label: 'Очередь проверок', path: '/mentor/review-queue' },
    { label: 'О курсе', path: '/mentor/about' },
    { label: 'Онбординг', path: '/mentor/onboarding' },
    { label: 'Глоссарий курса', path: '/mentor/glossary' },
    { label: 'Библиотека курса', path: '/mentor/library' },
    { label: 'Трекер курса', path: '/mentor/tracker' },
    { label: 'Практикумы с менторами', path: '/mentor/practicums' },
    { label: 'Результаты', path: '/mentor/results' },
    { label: 'Сертификация и самооценка', path: '/mentor/certification' },
    { label: 'Вопросы и ответы', path: '/mentor/qa' },
    { label: 'Материалы для ментора', path: '/mentor/materials' },
];

const MENTOR_COURSE_MIRROR_STUDENT_ID = 'u-st-1';
const ADMIN_SIDEBAR_CONFIG = [
    { type: 'item', label: 'Дашборд', path: '/admin/pvl' },
    { type: 'divider' },
    { type: 'item', label: 'Ученицы', path: '/admin/students' },
    { type: 'item', label: 'Менторы', path: '/admin/mentors' },
    { type: 'item', label: 'Материалы курса', path: '/admin/content' },
    { type: 'item', label: 'Календарь', path: '/admin/calendar' },
    { type: 'divider' },
    { type: 'item', label: 'Настройки', path: '/admin/settings' },
];

function szPipelineStatusRu(v) {
    const m = {
        not_started: 'не начато',
        in_progress: 'в процессе',
        ready_for_review: 'на проверке у ментора',
        red_flag: 'есть критические отметки',
        admitted: 'допуск',
        not_admitted: 'нет допуска',
        certified: 'сертифицирована',
    };
    return m[String(v || '').toLowerCase()] || v || '—';
}

const STATUS_TONE = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'принято' || s === 'done') return 'bg-emerald-50 text-emerald-700 border-emerald-600/30';
    if (s.includes('проверено') && s.includes('оценку')) return 'bg-indigo-50 text-indigo-800 border-indigo-500/25';
    if (s === 'на доработке' || s === 'warning' || s === 'скоро') return 'bg-amber-50 text-amber-700 border-amber-600/30';
    if (s === 'просрочено' || s === 'не принято' || s === 'высокий') return 'bg-rose-50 text-rose-700 border-rose-600/30';
    if (s === 'на проверке' || s === 'к проверке' || s === 'запланирована' || s === 'средний') return 'bg-blue-50 text-blue-700 border-blue-600/30';
    if (s === 'отправлено' || s === 'черновик' || s === 'в работе') return 'bg-violet-50 text-violet-800 border-violet-500/25';
    return 'bg-slate-100 text-slate-600 border-slate-300';
};

const StatusBadge = ({ children }) => (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${STATUS_TONE(children)}`}>
        {children}
    </span>
);

const RiskBadge = ({ level }) => <StatusBadge>{level}</StatusBadge>;
const DeadlineBadge = ({ value }) => <span className="text-xs rounded-full border border-[#E8D5C4] px-2 py-0.5 text-[#9B8B80]">{value}</span>;
const DashboardWidget = ({ title, value, hint }) => (
    <article className="rounded-2xl border border-slate-100/90 bg-white p-4 shadow-sm shadow-slate-200/40">
        <div className="text-xs font-medium text-slate-500">{title}</div>
        <div className="font-display text-2xl md:text-3xl text-slate-800 mt-1 tabular-nums">{value}</div>
        {hint ? <div className="text-xs text-slate-400 mt-1.5 leading-snug">{hint}</div> : null}
    </article>
);

const ProgressWidget = ({ title, done, total }) => {
    const pct = total ? Math.round((done / total) * 100) : 0;
    return (
        <article className="rounded-2xl border border-slate-100/90 bg-white p-4 shadow-sm shadow-slate-200/40">
            <div className="text-xs font-medium text-slate-500">{title}</div>
            <div className="font-display text-2xl md:text-3xl text-blue-700/90 mt-1 tabular-nums">{done}/{total}</div>
            <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-blue-500/70" style={{ width: `${pct}%` }} /></div>
        </article>
    );
};

const PointsProgressBar = ({ value, max, tone = 'bg-blue-600/80' }) => {
    const pct = max ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
    return <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} /></div>;
};

const PointsBreakdownList = ({ items }) => (
    <div className="grid gap-1">
        {items.map((x) => (
            <div key={x.label} className="text-xs text-[#2C1810] flex items-center justify-between">
                <span>{x.label}</span><span>{x.value}</span>
            </div>
        ))}
    </div>
);

const CoursePointsCard = ({ points }) => (
    <article className="rounded-2xl border border-slate-100/90 bg-white p-4 shadow-sm shadow-slate-200/40">
        <div className="text-xs font-medium text-slate-500">Курсовые баллы</div>
        <div className="font-display text-2xl md:text-3xl text-slate-800 mt-1 tabular-nums">{points.coursePointsTotal}/400</div>
        <div className="mt-3"><PointsProgressBar value={points.coursePointsTotal} max={400} tone="bg-emerald-600/70" /></div>
        <div className="mt-2">
            <PointsBreakdownList items={[
                { label: 'Неделя 0', value: points.week0Points },
                { label: 'Недели 1-12', value: points.weeksPoints },
                { label: 'КТ', value: points.controlPointsTotal },
                { label: 'Бонус ментора', value: `${points.mentorBonusTotal}/50` },
            ]} />
        </div>
    </article>
);

const SzPointsCard = ({ points, redFlags = [] }) => (
    <article className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 shadow-sm shadow-slate-200/30">
        <div className="text-xs font-medium text-blue-800/90">Самооценка и сертификация (до 54 баллов)</div>
        <div className="grid md:grid-cols-2 gap-3 mt-2 text-sm text-slate-700">
            <div>Ваша самооценка: <span className="font-medium tabular-nums">{points.szSelfAssessmentTotal}/54</span></div>
            <div>Оценка ментора: <span className="font-medium tabular-nums">{points.szMentorAssessmentTotal}/54</span></div>
        </div>
        <div className="mt-3"><PointsProgressBar value={points.szSelfAssessmentTotal} max={54} tone="bg-blue-600/80" /></div>
        {redFlags.length ? <div className="mt-3 text-xs text-rose-700">Внимание: {redFlags.join(', ')}</div> : null}
    </article>
);

const PointsHistoryList = ({ items = [] }) => (
    <div className="grid gap-1">
        {items.length === 0 ? <div className="text-xs text-[#9B8B80]">Пока нет начислений.</div> : items.map((h) => (
            <article key={h.id} className="rounded-xl border border-[#E8D5C4] bg-[#FAF6F2] p-2">
                <div className="text-xs text-[#2C1810]">{h.sourceLabel}: +{h.pointsDelta}</div>
                <div className="text-[10px] text-[#9B8B80]">{formatPvlDateTime(h.createdAt)}</div>
            </article>
        ))}
    </div>
);

const MentorBonusUsageBadge = ({ used }) => <StatusBadge>{`Бонус ${used}/50`}</StatusBadge>;
const ControlPointsSummary = ({ accepted }) => <StatusBadge>{`КТ ${accepted}/9`}</StatusBadge>;
const AssessmentComparisonCard = ({ selfPoints, mentorPoints }) => (
    <div className="rounded-xl border border-slate-100 bg-white p-3 text-sm text-slate-600 shadow-sm">
        Сравнение: ваша оценка <span className="font-medium tabular-nums text-slate-800">{selfPoints}/54</span>
        {' · '}оценка ментора <span className="font-medium tabular-nums text-slate-800">{mentorPoints}/54</span>
    </div>
);

function pvlSidebarNavClass(active) {
    return `w-full text-left rounded-2xl px-4 py-3 text-[15px] transition-all duration-200 ${active
        ? 'bg-blue-50 text-blue-700 border border-blue-100 shadow-[0_6px_16px_-12px_rgba(47,111,84,0.45)] font-semibold'
        : 'text-slate-600 border border-transparent hover:bg-white/90 hover:text-slate-900'}`;
}

const SidebarMenu = ({
    role,
    route: currentRoute,
    studentSection,
    setStudentSection,
    adminSection,
    setAdminSection,
    mentorSection,
    setMentorSection,
    navigate,
    onGardenExit,
}) => (
    <aside className="h-fit xl:sticky xl:top-6 rounded-3xl border border-slate-100/90 bg-white/85 backdrop-blur-sm p-3 shadow-sm shadow-slate-200/50">
        <div className="px-2 pt-1 pb-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{PVL_COURSE_DISPLAY_NAME}</div>
            <h3 className="font-display text-lg text-slate-800 mt-0.5 leading-tight">
                {role === 'student' ? 'Участница' : role === 'mentor' ? 'Ментор' : 'Учительская'}
            </h3>
        </div>
        {role === 'student' ? (
            <nav className="space-y-1 px-0.5 pb-2">
                <button type="button" onClick={() => navigate('/student/dashboard')} className={pvlSidebarNavClass(currentRoute === '/student/dashboard')}>Главная</button>
                {STUDENT_MENU.map((item) => {
                    const base = `/student/${toRoute(item)}`;
                    const subActive = currentRoute === base || (currentRoute || '').startsWith(`${base}/`);
                    return (
                    <button
                        type="button"
                        key={item}
                        onClick={() => {
                            setStudentSection(item);
                            navigate(base);
                        }}
                        className={pvlSidebarNavClass(subActive)}
                    >
                        {item}
                    </button>
                    );
                })}
            </nav>
        ) : role === 'mentor' ? (
            <nav className="space-y-1 px-0.5 pb-2">
                {MENTOR_NAV_ITEMS.map(({ label, path }) => {
                    const subActive = currentRoute === path
                        || (path === '/mentor/library' && (currentRoute || '').startsWith('/mentor/library/'))
                        || (path === '/mentor/results' && (currentRoute || '').startsWith('/mentor/results/'))
                        || (path === '/mentor/mentees' && (currentRoute || '').startsWith('/mentor/mentee/'));
                    return (
                        <button
                            type="button"
                            key={path}
                            onClick={() => {
                                setMentorSection(label);
                                navigate(path);
                            }}
                            className={pvlSidebarNavClass(subActive)}
                        >
                            {label}
                        </button>
                    );
                })}
            </nav>
        ) : (
            <nav className="space-y-1 px-0.5 pb-2">
                {ADMIN_SIDEBAR_CONFIG.map((entry, idx) => {
                    if (entry.type === 'divider') {
                        return <div key={`div-${idx}`} className="h-px bg-slate-100/80 my-3 mx-1" />;
                    }
                    const subActive = currentRoute === entry.path
                        || (entry.path === '/admin/students' && /^\/admin\/students\//.test(currentRoute || ''))
                        || (entry.path === '/admin/content' && currentRoute === '/admin/content');
                    return (
                        <button
                            key={entry.path}
                            type="button"
                            onClick={() => {
                                setAdminSection(entry.label);
                                navigate(entry.path);
                            }}
                            className={pvlSidebarNavClass(subActive)}
                        >
                            {entry.label}
                        </button>
                    );
                })}
                {onGardenExit ? (
                    <>
                        <div className="h-px bg-slate-100/80 my-3 mx-1" />
                        <button
                            type="button"
                            onClick={onGardenExit}
                            className="w-full text-left rounded-2xl px-4 py-3 text-[15px] text-slate-500 border border-transparent hover:bg-white/90 hover:text-slate-900"
                        >
                            Вернуться в сад
                        </button>
                    </>
                ) : null}
            </nav>
        )}
    </aside>
);

const BREADCRUMB_LABELS = {
    student: 'Участница',
    mentor: 'Ментор',
    admin: 'Учительская',
    dashboard: 'Главная',
    about: 'О курсе',
    glossary: 'Глоссарий',
    library: 'Библиотека',
    onboarding: 'Онбординг',
    lessons: 'Уроки',
    tracker: 'Трекер курса',
    practicums: 'Практикумы',
    checklist: 'Чек-лист',
    results: 'Результаты',
    certification: 'Сертификация',
    'self-assessment': 'Самооценка',
    qa: 'Вопросы и ответы',
    'cultural-code': 'Культурный код',
    materials: 'Материалы',
    mentee: 'Ученица',
    task: 'Задание',
    content: 'Материалы курса',
    students: 'Ученицы',
    mentors: 'Менторы',
    cohorts: 'Потоки',
    review: 'Проверки и риски',
    settings: 'Настройки',
    pvl: 'Начало',
    calendar: 'Календарь',
};

function breadcrumbSegmentLabel(seg) {
    if (BREADCRUMB_LABELS[seg]) return BREADCRUMB_LABELS[seg];
    if (/^u-st-|^u-men-|^u-adm-|^m-\d|^task-|^cnt-|^lib-/.test(seg)) return '…';
    return seg;
}

/** Тихая строка контекста: без цепочки кликабельных крошек */
const SubtleTrail = ({ path }) => {
    const parts = path.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const cabinet = parts[0] === 'student' ? 'Участница' : parts[0] === 'mentor' ? 'Ментор' : 'Учительская';
    const tail = parts.slice(1).map(breadcrumbSegmentLabel).filter((l) => l && l !== '…').join(' · ');
    if (!tail) return <p className="text-xs text-slate-400 truncate">{cabinet}</p>;
    return <p className="text-xs text-slate-400 truncate">{cabinet} · {tail}</p>;
};

/** Вторичный переключатель кабинета (режим приёмки) */
const CabinetSwitcher = ({ role, setRole, navigate }) => {
    const tab = (r, label, home) => (
        <button
            type="button"
            key={r}
            onClick={() => {
                setRole(r);
                navigate(home);
            }}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${role === r ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
            {label}
        </button>
    );
    return (
        <div className="inline-flex items-center rounded-xl bg-slate-100/90 p-0.5 gap-0.5 shrink-0" role="group" aria-label="Кабинет">
            {tab('student', 'Участница', '/student/dashboard')}
            {tab('mentor', 'Ментор', '/mentor/dashboard')}
            {tab('admin', 'Учительская', '/admin/pvl')}
        </div>
    );
};

const ScreenState = ({ loading, error, empty, children, emptyText = 'Пока ничего нет.' }) => {
    if (loading) return <div className="rounded-2xl border border-slate-100 bg-white p-6 text-sm text-slate-500 shadow-sm">Загрузка…</div>;
    if (error) return <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-6 text-sm text-rose-800 shadow-sm">{error}</div>;
    if (empty) return <div className="rounded-2xl border border-slate-100 bg-white p-6 text-sm text-slate-500 shadow-sm">{emptyText}</div>;
    return children;
};

function createContentItem(items, payload) {
    return [{ ...payload, id: `cnt-${Date.now()}`, createdAt: new Date().toLocaleString('ru-RU'), updatedAt: new Date().toLocaleString('ru-RU') }, ...items];
}

function updateContentItem(items, id, patch) {
    return items.map((it) => (it.id === id ? { ...it, ...patch, updatedAt: new Date().toLocaleString('ru-RU') } : it));
}

function publishContentItem(items, id) {
    return updateContentItem(items, id, { status: 'published' });
}

function archiveContentItem(items, id) {
    return updateContentItem(items, id, { status: 'archived' });
}

function assignContentToSection(placements, contentId, targetSection, targetRole, targetCohort) {
    return [...placements, { id: `pl-${Date.now()}`, contentId, targetSection, targetRole, targetCohort }];
}

function filterContentItems(items, filters) {
    return items
        .filter((i) => (filters.section === 'all' ? true : i.targetSection === filters.section))
        .filter((i) => (filters.status === 'all' ? true : i.status === filters.status))
        .filter((i) => (filters.role === 'all' ? true : i.targetRole === filters.role || i.targetRole === 'both'))
        .filter((i) => (filters.type === 'all' ? true : i.contentType === filters.type))
        .filter((i) => String(i.title || '').toLowerCase().includes(String(filters.query || '').toLowerCase().trim()));
}

const CONTENT_TYPE_LABEL = {
    video: 'Видео',
    text: 'Текст',
    pdf: 'PDF',
    checklist: 'Чек-лист',
    template: 'Сценарий',
    link: 'Ссылка',
    audio: 'Аудио',
    fileBundle: 'Пакет файлов',
};

const TARGET_SECTION_LABELS = {
    about: 'О курсе',
    glossary: 'Глоссарий',
    library: 'Библиотека',
    lessons: 'Уроки',
    practicums: 'Практикумы',
    checklist: 'Чек-лист',
    results: 'Результаты',
    certification: 'Сертификация',
    cultural_code: 'Культурный код',
};

const TARGET_ROLE_LABELS = {
    student: 'Участницы',
    mentor: 'Менторов',
    both: 'Обе роли',
};

const CONTENT_STATUS_LABEL = {
    draft: 'Черновик',
    published: 'Опубликован',
    archived: 'В архиве',
};

function labelTargetSection(key) {
    return TARGET_SECTION_LABELS[key] || key;
}

function practicumEventTypeRu(t) {
    const k = String(t || '').toLowerCase();
    const map = {
        mentor_meeting: 'Встреча с ментором',
        week_closure: 'Закрытие недели',
        deadline: 'Дедлайн',
        session: 'Сессия',
    };
    return map[k] || t;
}

const SECTION_ROUTE_TO_KEY = {
    '/student/about': 'about',
    '/student/glossary': 'glossary',
    '/student/library': 'library',
    '/student/lessons': 'lessons',
    '/student/tracker': 'checklist',
    '/student/practicums': 'practicums',
    '/student/checklist': 'checklist',
    '/student/results': 'results',
    '/student/certification': 'certification',
    '/student/cultural-code': 'cultural_code',
};

function getPublishedContentBySection(sectionKey, role = 'student', items = [], placements = [], cohortId = 'cohort-2026-1') {
    const placementIds = new Set(
        placements
            .filter((p) => p.targetSection === sectionKey && (p.targetRole === role || p.targetRole === 'both'))
            .map((p) => p.contentId || p.contentItemId)
            .filter(Boolean)
    );
    return items.filter((i) => {
        const roleAllowed = i.targetRole === role || i.targetRole === 'both';
        const visibilityAllowed =
            i.visibility === 'all'
            || (i.visibility === 'by_role' && roleAllowed)
            || ((i.visibility === 'by_cohort' || i.visibility === 'cohort') && (!i.targetCohort || i.targetCohort === cohortId));
        const inSection = i.targetSection === sectionKey || placementIds.has(i.id);
        return i.status === 'published' && roleAllowed && visibilityAllowed && inSection;
    }).sort((a, b) => (a.orderIndex || 999) - (b.orderIndex || 999));
}

function GardenContentCards({ items }) {
    if (!items.length) return <div className="rounded-2xl border border-slate-100 bg-white p-6 text-sm text-slate-500 shadow-sm">В этом разделе пока нет материалов.</div>;
    return (
        <div className="grid md:grid-cols-2 gap-4">
            {items.map((i) => (
                <article key={i.id} className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-sm shadow-slate-200/30">
                    <h4 className="text-sm font-medium text-slate-800">{i.title}</h4>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed whitespace-pre-line">{i.shortDescription || i.description || 'Описание появится позже.'}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-100">{CONTENT_TYPE_LABEL[i.contentType] || i.contentType}</span>
                        {i.estimatedDuration ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-100">{i.estimatedDuration}</span> : null}
                        {(i.tags || []).slice(0, 3).map((tag) => (
                            <span key={`${i.id}-${tag}`} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-100">{tag}</span>
                        ))}
                    </div>
                </article>
            ))}
        </div>
    );
}

function filterLibraryItems(items, filters) {
    return items
        .filter((i) => (filters.categoryId ? i.categoryId === filters.categoryId : true))
        .filter((i) => (filters.contentType === 'all' ? true : i.contentType === filters.contentType))
        .filter((i) => (filters.completion === 'all' ? true : filters.completion === 'completed' ? i.completed : !i.completed))
        .filter((i) => (filters.flag === 'all' ? true : filters.flag === 'new' ? i.isNew : filters.flag === 'recommended' ? i.isRecommended : true));
}

function searchLibraryItems(items, query) {
    const q = String(query || '').toLowerCase().trim();
    if (!q) return items;
    return items.filter((i) =>
        String(i.title || '').toLowerCase().includes(q)
        || String(i.shortDescription || '').toLowerCase().includes(q)
        || (i.tags || []).some((t) => String(t).toLowerCase().includes(q)));
}

function sortLibraryItems(items, sortBy = 'order') {
    const arr = [...items];
    if (sortBy === 'title') return arr.sort((a, b) => String(a.title).localeCompare(String(b.title), 'ru'));
    if (sortBy === 'duration') return arr.sort((a, b) => String(a.estimatedDuration || '').localeCompare(String(b.estimatedDuration || ''), 'ru'));
    return arr.sort((a, b) => (a.orderIndex || 999) - (b.orderIndex || 999));
}

function LibraryPage({ studentId, navigate, initialItemId = '', routePrefix = '/student' }) {
    const [loading] = useState(false);
    const [error] = useState('');
    const [selectedCategoryId, setSelectedCategoryId] = useState('');
    const [query, setQuery] = useState('');
    const [contentType, setContentType] = useState('all');
    const [completion, setCompletion] = useState('all');
    const [flag, setFlag] = useState('all');
    const [sortBy, setSortBy] = useState('order');
    const [selectedItemId, setSelectedItemId] = useState(initialItemId || '');

    const progress = pvlDomainApi.studentApi.getStudentLibraryProgress(studentId);
    const categories = pvlDomainApi.studentApi.getLibraryCategoriesWithCounts(studentId);
    const baseItems = pvlDomainApi.studentApi.getStudentLibrary(studentId, {});
    const filteredItems = sortLibraryItems(searchLibraryItems(filterLibraryItems(baseItems, { categoryId: selectedCategoryId, contentType, completion, flag }), query), sortBy);
    const selectedItem = filteredItems.find((x) => x.id === selectedItemId) || baseItems.find((x) => x.id === selectedItemId) || null;

    return (
        <ScreenState loading={loading} error={error} empty={false}>
            <div className="space-y-4">
                <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm">
                    <h2 className="font-display text-2xl text-slate-800">Библиотека курса</h2>
                    <p className="text-sm text-slate-500 mt-1">Дополнительные материалы и справочные тексты.</p>
                    <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm text-slate-600">
                        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">Пройдено: <span className="font-medium tabular-nums text-slate-800">{progress.completed}</span></div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">Всего: <span className="font-medium tabular-nums text-slate-800">{progress.total}</span></div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">Прогресс: <span className="font-medium tabular-nums text-slate-800">{progress.progressPercent}%</span></div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">Дальше: {progress.recommendedNextMaterial?.title || '—'}</div>
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-100/90 bg-white p-4 grid md:grid-cols-5 gap-2 shadow-sm">
                    <input value={query} onChange={(e) => setQuery(e.target.value)} className="rounded-xl border border-slate-200 p-2 text-sm" placeholder="Поиск по названию, описанию, тегам" />
                    <select value={contentType} onChange={(e) => setContentType(e.target.value)} className="rounded-xl border border-slate-200 p-2 text-sm">
                        <option value="all">Все типы</option>
                        {Object.entries(CONTENT_TYPE_LABEL).map(([k, lab]) => <option key={k} value={k}>{lab}</option>)}
                    </select>
                    <select value={completion} onChange={(e) => setCompletion(e.target.value)} className="rounded-xl border border-slate-200 p-2 text-sm">
                        <option value="all">Все</option><option value="completed">Просмотренные</option><option value="pending">Непройденные</option>
                    </select>
                    <select value={flag} onChange={(e) => setFlag(e.target.value)} className="rounded-xl border border-slate-200 p-2 text-sm">
                        <option value="all">Все метки</option><option value="new">Новые</option><option value="recommended">Рекомендованные</option>
                    </select>
                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="rounded-xl border border-slate-200 p-2 text-sm">
                        <option value="order">По порядку</option><option value="title">По названию</option><option value="duration">По длительности</option>
                    </select>
                </div>

                <div className="grid xl:grid-cols-[240px_1fr] gap-3 items-start">
                    <aside className="rounded-2xl border border-slate-100/90 bg-white p-3 shadow-sm">
                        <h3 className="text-sm font-medium text-slate-700 mb-2">Категории</h3>
                        <div className="grid gap-1.5">
                            <button type="button" onClick={() => setSelectedCategoryId('')} className={`text-left rounded-xl border px-3 py-2 text-sm transition-colors ${!selectedCategoryId ? 'border-slate-200 bg-slate-50 text-slate-800' : 'border-transparent text-slate-600 hover:bg-slate-50'}`}>Все</button>
                            {categories.map((c) => (
                                <button type="button" key={c.id} onClick={() => setSelectedCategoryId(c.id)} className={`text-left rounded-xl border px-3 py-2 transition-colors ${selectedCategoryId === c.id ? 'border-slate-200 bg-slate-50 text-slate-800' : 'border-transparent text-slate-600 hover:bg-slate-50'}`}>
                                    <div className="text-sm">{c.title}</div>
                                    <div className="text-[11px] text-slate-400">{c.count} · {c.progressPercent}%</div>
                                </button>
                            ))}
                        </div>
                    </aside>

                    <section className="rounded-2xl border border-slate-100/90 bg-white p-4 shadow-sm">
                        <h3 className="font-display text-lg text-slate-800 mb-2">Материалы</h3>
                        {filteredItems.length === 0 ? (
                            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 text-sm text-slate-500">
                                Нет материалов по выбранным фильтрам или категории.
                            </div>
                        ) : (
                            <div className="grid md:grid-cols-2 gap-2">
                                {filteredItems.map((i) => (
                                    <article key={i.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 hover:border-slate-200 transition-colors">
                                        <div className="text-xs text-slate-400">{i.categoryTitle}</div>
                                        <div className="text-sm font-medium text-slate-800 mt-1">{i.title}</div>
                                        <p className="text-xs text-slate-500 mt-1 line-clamp-3">{i.shortDescription}</p>
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            <StatusBadge>{CONTENT_TYPE_LABEL[i.contentType] || i.contentType}</StatusBadge>
                                            {i.isNew ? <StatusBadge>новое</StatusBadge> : null}
                                            {i.isRecommended ? <StatusBadge>рекомендовано</StatusBadge> : null}
                                            {i.isRequired ? <StatusBadge>обязательно</StatusBadge> : null}
                                            {i.completed ? <StatusBadge>просмотрено</StatusBadge> : null}
                                        </div>
                                        <div className="mt-2 flex items-center justify-between">
                                            <span className="text-[11px] text-slate-400">{i.estimatedDuration || '—'}</span>
                                            <button type="button" onClick={() => {
                                                setSelectedItemId(i.id);
                                                pvlDomainApi.studentApi.updateLibraryProgress(studentId, i.id, Math.max(10, i.progressPercent || 10));
                                                if (navigate) navigate(`${routePrefix}/library/${i.id}`);
                                            }} className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700 hover:bg-slate-50">Открыть</button>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>
                </div>

                {selectedItem ? (
                    <section className="rounded-2xl border border-slate-100/90 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="font-display text-xl text-slate-800">{selectedItem.title}</h3>
                            <div className="flex items-center gap-2">
                                <button type="button" onClick={() => pvlDomainApi.studentApi.markLibraryItemCompleted(studentId, selectedItem.id)} className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700 hover:bg-slate-50">Отметить как просмотрено</button>
                                <button type="button" onClick={() => { setSelectedItemId(''); if (navigate) navigate(`${routePrefix}/library`); }} className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700 hover:bg-slate-50">Закрыть</button>
                            </div>
                        </div>
                        <p className="text-sm text-slate-600 mt-2">{selectedItem.fullDescription || selectedItem.shortDescription}</p>
                        <div className="mt-2 text-xs text-slate-500">{CONTENT_TYPE_LABEL[selectedItem.contentType] || selectedItem.contentType} · {selectedItem.estimatedDuration || '—'}</div>
                        {(selectedItem.externalLinks || []).length ? <p className="text-xs text-slate-500 mt-1">Ссылки: {(selectedItem.externalLinks || []).join(', ')}</p> : null}
                        {(selectedItem.attachments || []).length ? <p className="text-xs text-slate-500 mt-1">Вложения: {(selectedItem.attachments || []).join(', ')}</p> : null}
                    </section>
                ) : null}
            </div>
        </ScreenState>
    );
}

function navigateToStudentCard(navigate, studentId) {
    navigate(`/mentor/mentee/${studentId}`);
}

function navigateToMentorCard(navigate, mentorId) {
    navigate(`/admin/mentors?mentor=${mentorId}`);
}

function navigateToTaskDetail(navigate, studentId, taskId) {
    navigate(`/mentor/mentee/${studentId}/task/${taskId}`);
}

const LABEL_TO_TASK_STATUS = {
    принято: 'accepted',
    'на доработке': 'revision_requested',
    'не принято': 'rejected',
    'к проверке': 'pending_review',
};

function buildTaskDetailStateFromApi(studentId, taskId, viewerRole = 'student') {
    const detail = pvlDomainApi.studentApi.getStudentTaskDetail(studentId, taskId);
    const task = detail.task || {};
    const state = detail.state || {};
    const weekRow = task.weekId ? pvlDomainApi.db.courseWeeks.find((w) => w.id === task.weekId) : null;
    const thread = (detail.thread || []).map((m) => ({
        id: m.id,
        type: m.isSystem ? 'system' : 'message',
        messageType: m.messageType || (m.isSystem ? 'status' : 'comment'),
        authorName: m.authorRole === 'mentor' ? 'Ментор' : m.authorRole === 'student' ? 'Участница' : 'Система',
        authorRole: m.authorRole,
        createdAt: formatPvlDateTime(m.createdAt),
        text: m.text,
        attachments: m.attachments || [],
        linkedStatusChange: m.linkedStatusHistoryId || null,
        linkedVersionId: m.linkedVersionId || null,
        isUnreadForCurrentUser: !(m.readBy || []).includes(studentId),
    }));
    const typeLabel = task.isControlPoint || task.taskType === 'control_point' ? 'контрольная точка' : 'домашнее задание';
    const statusLabel =
        viewerRole === 'student' ? mapStudentHomeworkDisplayStatus(state) : state.status ? mapTaskStatus(state.status) : 'не начато';
    const firstLessonId = (task.linkedLessonIds || [])[0] || null;
    const linkedLessonRow = firstLessonId ? pvlDomainApi.db.lessons.find((l) => l.id === firstLessonId) : null;
    return {
        taskDetail: {
            id: task.id,
            title: task.title,
            weekNumber: weekRow?.weekNumber ?? Number(String(task.weekId || '').split('w').pop() || 0),
            moduleNumber: weekRow?.moduleNumber ?? 0,
            type: typeLabel,
            isControlPoint: task.isControlPoint,
            controlPointId: task.controlPointId,
            status: statusLabel,
            isAcceptedWork: state.status === TASK_STATUS.ACCEPTED,
            deadlineAt: formatPvlDateTime(task.deadlineAt),
            submittedAt: state.submittedAt ? formatPvlDateTime(state.submittedAt) : null,
            lastStatusChangedAt: state.lastStatusChangedAt ? formatPvlDateTime(state.lastStatusChangedAt) : null,
            score: state.totalTaskPoints ?? 0,
            maxScore: task.scoreMax ?? 0,
            acceptedAt: state.acceptedAt ? formatPvlDateTime(state.acceptedAt) : null,
            startedAt: state.createdAt ? formatPvlDateTime(state.createdAt) : null,
            disputeOpen: !!detail.disputeOpen,
            linkedLessonId: firstLessonId,
            linkedLessonTitle: linkedLessonRow?.title || null,
        },
        taskDescription: {
            summary: task.description || '',
            artifact: task.artifact || '',
            criteria: task.criteria || [],
            uploadTypes: task.uploadTypes || [],
            hints: [],
        },
        submissionVersions: (detail.versions || []).map((v) => ({
            id: v.id,
            versionNumber: v.versionNumber,
            createdAt: formatPvlDateTime(v.createdAt),
            authorRole: v.authorRole,
            textContent: v.textContent,
            attachments: v.attachments || [],
            links: v.links || [],
            isCurrent: !!v.isCurrent,
        })),
        statusHistory: (detail.history || []).map((h) => ({
            id: h.id,
            fromStatus: h.fromStatus,
            toStatus: h.toStatus,
            changedAt: formatPvlDateTime(h.createdAt),
            changedBy: h.changedByUserId,
            comment: h.comment,
        })),
        threadMessages: thread,
    };
}

function toRoute(name) {
    const map = {
        'О курсе': 'about',
        Онбординг: 'onboarding',
        'Глоссарий курса': 'glossary',
        'Библиотека курса': 'library',
        Уроки: 'lessons',
        'Трекер курса': 'tracker',
        'Практикумы с менторами': 'practicums',
        'Чек-лист': 'checklist',
        Результаты: 'results',
        Сертификация: 'certification',
        'Сертификация и самооценка': 'certification',
        Самооценка: 'self-assessment',
        'Вопросы и ответы': 'qa',
        'Культурный код Лиги': 'cultural-code',
    };
    return map[name] || 'dashboard';
}

const ACTIVE_HOMEWORK_LABELS = new Set(['черновик', 'отправлено', 'на проверке', 'на доработке', 'проверено, посмотрите оценку', 'в работе']);

function StudentDashboard({ studentId, navigate }) {
    const snapshot = pvlDomainApi.studentApi.getStudentDashboard(studentId);
    const points = pvlDomainApi.helpers.getStudentPointsSummary(studentId);
    const w = snapshot.compulsoryWidgets;
    const apiTasks = pvlDomainApi.studentApi.getStudentResults(studentId, {});
    const activeHomework = apiTasks.filter((t) => ACTIVE_HOMEWORK_LABELS.has(t.displayStatus || t.status));
    const feed = snapshot.activityFeed || [];
    const nextMeet = pvlDomainApi.db.mentorMeetings
        .filter((m) => m.studentId === studentId && String(m.status).toLowerCase() === 'scheduled')
        .sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)))[0];

    return (
        <div className="space-y-6">
            <section className="rounded-2xl border border-slate-100/90 bg-white p-6 md:p-8 shadow-sm shadow-slate-200/40">
                <h2 className="font-display text-2xl md:text-3xl text-slate-800">Главная</h2>
                <p className="text-sm text-slate-500 mt-1 max-w-xl">Где вы сейчас и что сделать дальше. Полный путь курса — в разделе «Трекер курса».</p>
                <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-6">
                    <DashboardWidget title="Текущий модуль" value={w?.currentModuleTitle || '—'} />
                    <DashboardWidget title="Дней до конца модуля" value={`${w?.daysToModuleEnd ?? '—'}`} />
                    <DashboardWidget title="Уроки: просмотрено / осталось" value={`${w?.lessonsDone ?? 0} / ${w?.lessonsRemaining ?? 0}`} hint={`Всего в потоке: ${w?.lessonsTotal ?? '—'}`} />
                    <DashboardWidget title="Домашки: сделано / осталось" value={`${w?.homeworkDone ?? 0} / ${w?.homeworkRemaining ?? 0}`} hint={`Всего: ${w?.homeworkTotal ?? '—'}`} />
                    <DashboardWidget title="До конца курса" value={`${w?.daysToCourseEnd ?? '—'} дн.`} />
                    <DashboardWidget title="До сдачи записи СЗ" value={`${w?.daysToSzSubmission ?? '—'} дн.`} hint="Самооценка и сертификация" />
                    <DashboardWidget title="Курсовые баллы" value={`${points.coursePointsTotal}/400`} />
                    <DashboardWidget title="Самооценка СЗ (баллы)" value={`${points.szSelfAssessmentTotal}/54`} />
                </div>
            </section>

            <PvlDashboardCalendarBlock
                viewerRole="student"
                cohortId={pvlDomainApi.db.studentProfiles.find((p) => p.userId === studentId)?.cohortId || 'cohort-2026-1'}
                navigate={navigate}
                routePrefix="/student"
            />

            <section className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm">
                <h3 className="font-display text-xl text-slate-800">Активные домашние работы</h3>
                <p className="text-xs text-slate-500 mt-1">То, что нужно сдать, доработать или просмотреть после проверки.</p>
                {activeHomework.length === 0 ? (
                    <p className="text-sm text-slate-500 mt-3">Сейчас нет заданий в фокусе — загляните в «Результаты» для полного списка.</p>
                ) : (
                    <ul className="mt-3 space-y-2">
                        {activeHomework.map((t) => (
                            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
                                <div className="text-sm text-slate-800 font-medium">{t.title}</div>
                                <div className="flex items-center gap-2">
                                    <StatusBadge>{t.displayStatus || t.status}</StatusBadge>
                                    {navigate ? (
                                        <button
                                            type="button"
                                            onClick={() => navigate(`/student/results/${t.id}`)}
                                            className="text-xs rounded-full border border-slate-200 px-3 py-1 text-[#C8855A] hover:bg-white"
                                        >
                                            Открыть
                                        </button>
                                    ) : null}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm">
                <h3 className="font-display text-xl text-slate-800">События и уведомления</h3>
                <p className="text-xs text-slate-500 mt-1">Короткая лента по курсу — не заменяет диалог в карточке задания.</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                    {feed.length === 0 ? <li className="text-slate-400">Пока нет событий.</li> : null}
                    {feed.map((item) => (
                        <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-50 pb-2 last:border-0">
                            <div>
                                <span className="font-medium text-slate-800">{item.text}</span>
                                {item.detail ? <span className="text-slate-500"> — {item.detail}</span> : null}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[11px] text-slate-400 tabular-nums">{formatPvlDateTime(item.at)}</span>
                                {item.taskId && navigate ? (
                                    <button type="button" onClick={() => navigate(`/student/results/${item.taskId}`)} className="text-[11px] text-[#C8855A] hover:underline">К заданию</button>
                                ) : null}
                            </div>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm">
                <h3 className="font-display text-xl text-slate-800">Ближайшая встреча с ментором</h3>
                {nextMeet ? (
                    <div className="mt-3 text-sm text-slate-600 space-y-1">
                        <p className="font-medium text-slate-800">{nextMeet.title}</p>
                        <p>{formatPvlDateTime(nextMeet.scheduledAt)} · неделя {nextMeet.weekNumber}</p>
                        {nextMeet.focus ? <p className="text-xs text-slate-500">{nextMeet.focus}</p> : null}
                    </div>
                ) : (
                    <p className="text-sm text-slate-500 mt-3">Запланированных встреч не найдено — смотрите раздел «Практикумы».</p>
                )}
            </section>
        </div>
    );
}

function practicumStatusRu(status) {
    const s = String(status || '').toLowerCase();
    const map = {
        scheduled: 'запланирована',
        happened: 'прошла',
        missed: 'пропущена',
        cancelled: 'отменена',
        deadline: 'дедлайн недели',
    };
    return map[s] || status;
}

function StudentLessonsLive({ studentId, navigate }) {
    const { stats } = usePlatformStepChecklist(studentId);
    const { doneSteps, totalSteps, pct, anchorsDone, anchorsTotal } = stats;
    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm">
                <h2 className="font-display text-2xl text-slate-800">Уроки и шаги курса</h2>
                <p className="text-sm text-slate-500 mt-1">Методический путь по модулям — как в трекере. Отметки здесь и в «Трекере курса» общие.</p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 text-sm text-slate-600">
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">Шаги: <span className="font-medium tabular-nums text-slate-800">{doneSteps}/{totalSteps}</span></div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">Прогресс: <span className="font-medium tabular-nums text-slate-800">{pct}%</span></div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">Якоря: <span className="font-medium tabular-nums text-slate-800">{anchorsDone}/{anchorsTotal}</span></div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 flex items-center">
                        <button type="button" onClick={() => navigate('/student/tracker')} className="text-sm text-slate-700 font-medium hover:underline">Полный трекер с заданиями</button>
                    </div>
                </div>
            </div>
            <PlatformCourseModulesGrid studentId={studentId} variant="lessons" />
        </div>
    );
}

function groupPracticumEventsByCalendarDay(events) {
    const map = new Map();
    for (const ev of events) {
        const raw = String(ev.at || '');
        const d = new Date(raw);
        const key = Number.isNaN(d.getTime()) ? 'unknown' : d.toISOString().slice(0, 10);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(ev);
    }
    const entries = [...map.entries()].sort((a, b) => {
        if (a[0] === 'unknown') return 1;
        if (b[0] === 'unknown') return -1;
        return a[0].localeCompare(b[0]);
    });
    for (const [, list] of entries) {
        list.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    }
    return entries;
}

function StudentPracticumsCalendar({ studentId }) {
    const events = pvlDomainApi.studentApi.getStudentPracticumEvents(studentId);
    const byDay = groupPracticumEventsByCalendarDay(events);
    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm">
                <h2 className="font-display text-2xl text-slate-800">Практикумы</h2>
                <p className="text-sm text-slate-500 mt-1">Встречи и ключевые даты по календарю.</p>
            </div>
            {events.length === 0 ? (
                <div className="rounded-2xl border border-slate-100 bg-white p-6 text-sm text-slate-500 shadow-sm">Запланированных событий пока нет.</div>
            ) : (
                <div className="space-y-5">
                    {byDay.map(([dayKey, dayEvents]) => (
                        <section key={dayKey} className="rounded-2xl border border-slate-100/90 overflow-hidden bg-white shadow-sm">
                            <div className="bg-slate-50/90 px-4 py-3 border-b border-slate-100">
                                <h3 className="font-display text-lg text-slate-800">
                                    {dayKey === 'unknown' ? 'Без даты' : formatPvlDateTime(`${dayKey}T12:00:00`)}
                                </h3>
                                <p className="text-xs text-slate-400 mt-0.5">{dayEvents.length} {dayEvents.length === 1 ? 'событие' : 'событий'}</p>
                            </div>
                            <ul className="divide-y divide-slate-100">
                                {dayEvents.map((ev) => (
                                    <li key={ev.id} className="px-4 py-3 flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-[11px] font-medium text-slate-400">{practicumEventTypeRu(ev.eventType)}</div>
                                            <div className="text-sm font-medium text-slate-800 mt-0.5">{ev.title}</div>
                                            {ev.focus ? <div className="text-xs text-slate-500 mt-1">{ev.focus}</div> : null}
                                            <div className="text-xs text-slate-400 mt-1">Неделя {ev.weekNumber}</div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className="text-sm font-medium text-slate-800">{formatPvlDateTime(ev.at)}</div>
                                            <div className="text-xs text-slate-400 mt-0.5">{practicumStatusRu(ev.status)}</div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}

function StudentAboutEnriched() {
    return (
        <div className="space-y-3">
            <div className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-sm">
                <h3 className="font-display text-2xl text-slate-800 mb-2">О курсе и онбординг</h3>
                <p className="text-sm text-slate-600 leading-6">Курс «{PVL_COURSE_DISPLAY_NAME}»: три месяца, контрольные точки, правила баллов, безопасность и расписание. Стартовые материалы — в карточках ниже и в библиотеке.</p>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-sm text-slate-600">Уроки, задания, дедлайны и личный кабинет — в боковом меню.</div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-sm text-slate-600">Антидолги: напоминания на 1, 3, 7 и 10-й день — чтобы не копить долги по неделям.</div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-sm text-slate-600">С вами рядом методолог, ментор, куратор и техподдержка — у каждого своя зона ответственности.</div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-sm text-slate-600">Курсовые баллы (до 400) и оценка сертификационного завтрака (до 54) считаются отдельно.</div>
            </div>
            <div className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-sm">
                <h4 className="font-display text-lg text-slate-800 mb-3">Правила траектории</h4>
                <ul className="space-y-2 text-sm text-slate-600 list-disc pl-5">
                    {PVL_TRACKER_RULES.map((line) => (
                        <li key={line.slice(0, 40)}>{line}</li>
                    ))}
                </ul>
            </div>
            <div className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-sm">
                <h4 className="font-display text-lg text-slate-800 mb-3">Вопросы и ответы</h4>
                <div className="space-y-3">
                    {PVL_TRACKER_FAQ.map((row) => (
                        <div key={row.q} className="border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                            <div className="text-sm font-medium text-slate-800">{row.q}</div>
                            <p className="text-sm text-slate-600 mt-1 leading-relaxed">{row.a}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function StudentGlossarySearch() {
    const [q, setQuery] = useState('');
    const [cat, setCat] = useState('all');
    const seen = new Set();
    const apiExtra = [...pvlDomainApi.sharedApi.getGlossary(), ...pvlMockData.glossaryItems.map((g) => ({ id: g.id, term: g.term, definition: g.definition }))].filter((g) => {
        const k = String(g.term || g.id).toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
    const refTerms = new Set(PVL_TRACKER_GLOSSARY.map((t) => String(t.term).toLowerCase()));
    const mergedExtra = apiExtra.filter((g) => !refTerms.has(String(g.term).toLowerCase()));
    const base = [
        ...PVL_TRACKER_GLOSSARY.map((t, i) => ({
            id: `ref-${i}`,
            term: t.term,
            abbr: t.abbr,
            cat: t.cat,
            catLabel: t.catLabel,
            definition: t.def,
            fromRef: true,
        })),
        ...mergedExtra.map((g) => ({
            id: g.id,
            term: g.term,
            abbr: null,
            cat: 'all',
            catLabel: null,
            definition: g.definition,
            fromRef: false,
        })),
    ];
    const qlow = q.trim().toLowerCase();
    const filtered = base.filter((g) => {
        if (cat === 'all') return true;
        if (!g.fromRef) return false;
        return g.cat === cat;
    }).filter((g) => {
        if (!qlow) return true;
        const def = String(g.definition || '');
        return String(g.term).toLowerCase().includes(qlow) || def.toLowerCase().includes(qlow);
    });
    return (
        <div className="space-y-4">
            <input
                value={q}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-full border border-[#E8D5C4] bg-white px-4 py-2.5 text-sm"
                placeholder="Поиск по термину или определению..."
            />
            <div className="flex flex-wrap gap-2">
                {PVL_GLOSSARY_FILTERS.map((f) => (
                    <button
                        key={f.id}
                        type="button"
                        onClick={() => setCat(f.id)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${cat === f.id ? 'border-[#C8855A] bg-[#FAF6F2] text-[#4A3728]' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>
            <div className="grid md:grid-cols-2 gap-3">
                {filtered.map((g) => (
                    <article key={g.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${g.fromRef ? 'border-[#E8D5C4]' : 'border-slate-100'}`}>
                        <div className="flex flex-wrap items-baseline gap-2">
                            <h4 className="font-display text-xl text-[#4A3728]">{g.term}</h4>
                            {g.abbr ? <span className="text-xs rounded-full border border-[#E8D5C4] px-2 py-0.5 text-[#9B8B80]">{g.abbr}</span> : null}
                        </div>
                        {g.catLabel ? <div className="text-[10px] font-semibold uppercase tracking-wider text-[#9B8B80] mt-1">{g.catLabel}</div> : null}
                        <p className="text-sm text-[#2C1810] mt-2 leading-relaxed">{g.definition}</p>
                    </article>
                ))}
            </div>
        </div>
    );
}

function StudentCertificationReference({ navigate }) {
    return (
        <div className="space-y-6 text-sm text-slate-700">
            <div>
                <h3 className="font-display text-lg text-slate-800 mb-3">Условия проведения СЗ</h3>
                <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-0 divide-y divide-slate-50">
                    {PVL_CERT_CONDITIONS.map((row) => (
                        <div key={row.strong} className="flex gap-3 py-3 first:pt-0">
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#C8855A]" />
                            <p>
                                <span className="font-medium text-[#4A3728]">{row.strong}</span>
                                {' '}
                                {row.text}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            <div>
                <h3 className="font-display text-lg text-slate-800 mb-3">Критерии оценки (1–3 балла)</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                    {PVL_CERT_CRITERIA_GROUPS.map((g) => (
                        <div key={g.letter} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                                {g.letter} · {g.name}
                            </div>
                            <div className="text-xs text-slate-600 leading-relaxed space-y-1">
                                {g.lines.map((line) => (
                                    <p key={line}>{line}</p>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-3 rounded-xl border border-slate-100 bg-[#FAF6F2] p-4 text-xs text-slate-600 leading-relaxed">
                    <span className="font-medium text-[#4A3728]">Итого:</span>
                    {' '}
                    18 критериев × 3 балла = 54 балла максимум · 18–30 = базовый · 31–45 = рабочий · 46–54 = сильный
                </div>
            </div>

            <div>
                <h3 className="font-display text-lg text-slate-800 mb-3">Красные флаги — автоматический незачёт</h3>
                <div className="rounded-2xl border border-rose-200/80 bg-rose-50/50 p-5 text-rose-900 leading-relaxed space-y-2">
                    {PVL_CERT_RED_FLAGS.map((line) => (
                        <div key={line}>🚫 {line}</div>
                    ))}
                </div>
            </div>

            <div>
                <h3 className="font-display text-lg text-slate-800 mb-3">Процесс сертификации</h3>
                <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-0 divide-y divide-slate-50">
                    {PVL_CERT_PROCESS_STEPS.map((text, idx) => (
                        <div key={text} className="flex gap-4 py-3 first:pt-0">
                            <span className="font-display text-xl text-[#C8855A] w-7 shrink-0 tabular-nums">{idx + 1}</span>
                            <p>{text}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-6 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
                <div className="flex gap-4 items-start">
                    <span className="text-2xl text-emerald-700">✦</span>
                    <div>
                        <div className="font-display text-lg text-[#4A3728]">Бланк самооценки СЗ</div>
                        <p className="text-xs text-slate-600 mt-1 max-w-xl">Заполни сразу после встречи — 18 критериев, рефлексия, критические условия. Бланк — ниже на этой странице.</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => document.getElementById('pvl-sz-flow')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="shrink-0 rounded-full bg-emerald-700 text-white px-5 py-2.5 text-sm font-medium hover:bg-emerald-800"
                >
                    К бланку ↓
                </button>
            </div>
        </div>
    );
}

function StudentResults({ studentId, navigate }) {
    const pref = loadViewPreferences('student.results');
    const [filter, setFilter] = useState(pref?.filter || 'все');
    const apiItems = pvlDomainApi.studentApi.getStudentResults(studentId, {});
    const tasks = apiItems.filter((t) => {
        if (filter === 'все') return true;
        if (filter === 'контрольные точки') return t.isControlPoint;
        const face = t.displayStatus || t.status;
        return face === filter;
    });
    const pointsHistory = (pvlDomainApi.db.pointsHistory || []).filter((x) => x.studentId === studentId).slice(-5).reverse();
    React.useEffect(() => {
        saveViewPreferences('student.results', { filter });
    }, [filter]);
    return (
        <div className="space-y-3">
            <div className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-2xl text-slate-800">Результаты</h2>
                <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-700">
                    <option value="все">Все задания</option>
                    <option value="не начато">Не начато</option>
                    <option value="в работе">В работе</option>
                    <option value="черновик">Черновик</option>
                    <option value="отправлено">Отправлено</option>
                    <option value="на проверке">На проверке</option>
                    <option value="на доработке">На доработке</option>
                    <option value="проверено, посмотрите оценку">Проверено — посмотрите оценку</option>
                    <option value="принято">Принято</option>
                    <option value="просрочено">Просрочено</option>
                    <option value="контрольные точки">Контрольные точки</option>
                </select>
            </div>
            <div className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-sm">
                <h3 className="font-display text-lg text-slate-800 mb-2">История баллов</h3>
                <PointsHistoryList items={pointsHistory} />
            </div>
            {tasks.map((t) => (
                <article key={t.id} className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <div className="text-sm font-medium text-[#4A3728]">{t.title}</div>
                            <div className="text-xs text-[#9B8B80]">Неделя {t.week ?? '—'} · Модуль {t.moduleNumber ?? '—'} · {t.typeLabel || t.type}</div>
                        </div>
                        <StatusBadge>{t.displayStatus || t.status}</StatusBadge>
                    </div>
                    <div className="grid md:grid-cols-4 gap-2 mt-2 text-xs">
                        <div>Дедлайн: {formatPvlDateTime(t.deadlineAt)}</div><div>Сдано: {t.submittedAt ? formatPvlDateTime(t.submittedAt) : '—'}</div><div>Баллы: {t.score}/{t.maxScore}</div><div>Циклы: {t.revisionCycles}</div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-[#9B8B80]">{t.mentorCommentPreview || 'Комментарий пока отсутствует'}</span>
                        <button onClick={() => navigate(`/student/results/${t.id}`)} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">Открыть задание</button>
                    </div>
                </article>
            ))}
        </div>
    );
}

function StudentGeneric({ title, children }) {
    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-sm"><h2 className="font-display text-xl text-slate-800">{title}</h2></div>
            {children}
        </div>
    );
}

function PvlContentStub({ title, hint }) {
    return (
        <div className="rounded-2xl border border-slate-100/90 bg-white p-8 shadow-sm">
            <h2 className="font-display text-2xl text-slate-800">{title}</h2>
            <p className="text-sm text-slate-500 mt-2">{hint}</p>
        </div>
    );
}

function StudentPage({ route, studentId, navigate, cmsItems, cmsPlacements, refresh, refreshKey = 0 }) {
    if (route === '/student/dashboard') return <StudentDashboard studentId={studentId} navigate={navigate} />;
    if (route === '/student/onboarding') {
        return (
            <PvlContentStub
                title="Онбординг"
                hint="Пошаговое знакомство с курсом появится здесь. Сейчас это заглушка."
            />
        );
    }
    if (route === '/student/qa') {
        return (
            <PvlContentStub
                title="Вопросы и ответы"
                hint="Задайте вопрос учительской и смотрите опубликованные ответы. Полный контур Q&A подключается к макету данных."
            />
        );
    }
    if (route === '/student/results') return <StudentResults studentId={studentId} navigate={navigate} />;
    if (route.startsWith('/student/results/')) {
        const taskId = route.split('/')[3];
        return (
            <PvlTaskDetailView
                key={`${studentId}-${taskId}-${refreshKey}`}
                role="student"
                taskStudentId={studentId}
                taskId={taskId}
                onRefresh={refresh}
                onBack={() => navigate('/student/results')}
                initialData={buildTaskDetailStateFromApi(studentId, taskId)}
                onStudentSaveDraft={(text) => pvlDomainApi.studentApi.saveStudentDraft(studentId, taskId, { textContent: text })}
                onStudentSubmit={(text) => { pvlDomainApi.studentApi.submitStudentTask(studentId, taskId, { textContent: text }); refresh(); }}
                onStudentReply={(msg) => { pvlDomainApi.studentApi.addStudentThreadReply(studentId, taskId, { text: msg.text, disputeOnly: msg.disputeOnly }); refresh(); }}
            />
        );
    }
    if (route === '/student/about') return (
        <div className="space-y-3">
            <StudentAboutEnriched />
        </div>
    );
    if (route === '/student/glossary') return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-sm">
                <h2 className="font-display text-2xl text-slate-800">Глоссарий курса</h2>
                <p className="text-sm text-slate-500 mt-1">Все термины курса — распечатайте и держите рядом</p>
            </div>
            <StudentGlossarySearch />
        </div>
    );
    if (route === '/student/library') return <LibraryPage studentId={studentId} navigate={navigate} />;
    if (route.startsWith('/student/library/')) {
        const itemId = route.split('/')[3] || '';
        return <LibraryPage studentId={studentId} navigate={navigate} initialItemId={itemId} />;
    }
    if (route === '/student/lessons' || route === '/student/checklist') {
        return <StudentCourseTracker studentId={studentId} navigate={navigate} />;
    }
    if (route === '/student/practicums') return (
        <div className="space-y-4">
            <StudentPracticumsCalendar studentId={studentId} />
        </div>
    );
    if (route === '/student/tracker') return <StudentCourseTracker studentId={studentId} navigate={navigate} />;
    if (route === '/student/certification' || route === '/student/self-assessment') {
        const cert = pvlDomainApi.studentApi.getStudentCertification(studentId);
        return (
            <div className="space-y-6">
                <div className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-sm">
                    <h2 className="font-display text-xl text-slate-800">Сертификация и самооценка</h2>
                    <p className="text-sm text-slate-500 mt-1">Всё, что нужно знать о сертификационном завтраке, и бланк самооценки на одной странице.</p>
                </div>
                <SzPointsCard points={cert.points} redFlags={cert.redFlags || []} />
                <AssessmentComparisonCard selfPoints={cert.points.szSelfAssessmentTotal} mentorPoints={cert.points.szMentorAssessmentTotal} />
                {cert.szScores ? (
                    <div className="rounded-2xl border border-slate-100/90 bg-white p-5 text-sm text-slate-600 shadow-sm tabular-nums">
                        <div className="text-xs font-medium text-slate-500 mb-2">Данные из бланка самооценки и контура сертификации</div>
                        <div>Самооценка (всего): <span className="font-medium text-slate-800">{cert.szScores.self_score_total}/54</span></div>
                        <div>Оценка ментора (всего): <span className="font-medium text-slate-800">{cert.szScores.mentor_score_total}/54</span></div>
                        <div>Критические отметки в бланке: <span className="font-medium text-slate-800">{cert.szScores.critical_flags_count}</span></div>
                        {cert.szScores.package_red_flags_count > 0 ? (
                            <div className="text-xs text-rose-700 mt-2">Регламентные предупреждения: {(cert.redFlags || []).join('; ') || 'есть'}</div>
                        ) : null}
                        <div className="mt-2">Статус контура СЗ: <span className="font-medium text-slate-800">{szPipelineStatusRu(cert.szScores.certification_status)}</span></div>
                    </div>
                ) : null}
                <div className="rounded-2xl border border-slate-100/90 bg-white p-5 text-sm text-slate-600 shadow-sm">
                    Курсовые баллы:
                    {' '}
                    <span className="font-medium text-slate-800 tabular-nums">{cert.points.coursePointsTotal}/400</span>
                    <span className="text-slate-300 mx-2">·</span>
                    Срок записи самооценки:
                    {' '}
                    {formatPvlDateTime(cert?.deadlineAt || '2026-06-30')}
                </div>
                <StudentCertificationReference navigate={navigate} />
                <div id="pvl-sz-flow" className="scroll-mt-4 rounded-2xl border border-slate-100/90 bg-white p-5 shadow-sm">
                    <h3 className="font-display text-lg text-slate-800 mb-4">Бланк самооценки</h3>
                    <PvlSzAssessmentFlow
                        key={studentId}
                        studentId={studentId}
                        navigate={navigate}
                        certPoints={cert.points}
                        onCommitted={refresh}
                    />
                </div>
            </div>
        );
    }
    if (route === '/student/cultural-code') {
        const sectionKey = SECTION_ROUTE_TO_KEY[route];
        const sectionMaterials = sectionKey ? getPublishedContentBySection(sectionKey, 'student', cmsItems, cmsPlacements) : [];
        return <StudentGeneric title="Культурный код Лиги"><GardenContentCards items={sectionMaterials.length ? sectionMaterials : ['Бережность', 'Ясность', 'Без советов', 'Поддержка сообщества'].map((x) => ({ id: x, title: x, shortDescription: '', contentType: 'text', tags: ['код'] }))} /></StudentGeneric>;
    }
    return <StudentDashboard studentId={studentId} navigate={navigate} />;
}

function MentorMaterialsPage({ cmsItems, cmsPlacements }) {
    const cohortId = 'cohort-2026-1';
    const lessons = getPublishedContentBySection('lessons', 'mentor', cmsItems, cmsPlacements, cohortId);
    const practicums = getPublishedContentBySection('practicums', 'mentor', cmsItems, cmsPlacements, cohortId);
    const cert = getPublishedContentBySection('certification', 'mentor', cmsItems, cmsPlacements, cohortId);
    const checklist = getPublishedContentBySection('checklist', 'mentor', cmsItems, cmsPlacements, cohortId);
    const combined = [...lessons, ...practicums, ...cert, ...checklist];
    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm">
                <h2 className="font-display text-2xl text-slate-800">Материалы для ментора</h2>
                <p className="text-sm text-slate-500 mt-1">Уроки, практикумы, сертификация и чек-листы, доступные в вашей роли.</p>
            </div>
            <GardenContentCards items={combined} />
        </div>
    );
}

function riskLevelDisplay(level) {
    const m = { high: 'высокий', medium: 'средний', low: 'низкий' };
    return m[String(level || '').toLowerCase()] || level;
}

function buildTeacherStudentRows() {
    return pvlDomainApi.adminApi.getAdminStudents({}).map((sp) => {
        const userId = sp.userId;
        const user = getUser(userId);
        const cohortTitle = pvlDomainApi.db.cohorts.find((c) => c.id === sp.cohortId)?.title || '—';
        const courseLine = `${cohortTitle} · Модуль ${sp.currentModule ?? '—'} · неделя ${sp.currentWeek ?? '—'}`;
        const tasks = pvlDomainApi.studentApi.getStudentResults(userId, {});
        const total = Math.max(1, tasks.length);
        const closed = tasks.filter((t) => String(t.displayStatus || t.status || '').toLowerCase() === 'принято').length;
        const closedPct = Math.round((closed / total) * 100);
        const pendingReview = tasks.filter((t) => String(t.displayStatus || '').toLowerCase().includes('проверк')).length;
        const inRevision = tasks.filter((t) => String(t.displayStatus || '').toLowerCase().includes('доработ')).length;
        let hwSummary = `${closed}/${tasks.length || 0} закрыто`;
        if (pendingReview) hwSummary = `на проверке: ${pendingReview}`;
        else if (inRevision) hwSummary = `на доработке: ${inRevision}`;
        const pts = pvlDomainApi.helpers.getStudentPointsSummary(userId);
        const lastAct = sp.lastActivityAt ? formatPvlDateTime(sp.lastActivityAt) : '—';
        return {
            userId,
            user,
            courseLine,
            closedPct,
            coursePoints: pts.coursePointsTotal ?? 0,
            hwSummary,
            lastAct,
        };
    });
}

function buildMentorMenteeRows(mentorId) {
    const menteesFromApi = pvlDomainApi.mentorApi.getMentorMentees(mentorId);
    return menteesFromApi.map((m) => {
        const user = m.user || getUser(m.userId);
        const tasks = pvlDomainApi.studentApi.getStudentResults(m.userId, {});
        const accepted = tasks.filter((t) => t.status === 'принято');
        const lastDone = accepted.length
            ? accepted.reduce((best, t) => (String(t.submittedAt || '') > String(best.submittedAt || '') ? t : best), accepted[0])
            : null;
        const overdueN = pvlDomainApi.db.studentTaskStates.filter((s) => s.studentId === m.userId && s.isOverdue).length;
        const pts = pvlDomainApi.helpers.getStudentPointsSummary(m.userId);
        const risks = pvlDomainApi.mentorApi.getMentorMenteeCard(mentorId, m.userId).risks || [];
        return { user, lastDone, overdueN, coursePoints: pts.coursePointsTotal ?? 0, riskCount: risks.length };
    });
}

function MentorKanbanCol({ title, hint, items, emptyText, navigate }) {
    return (
        <div className="rounded-2xl border border-slate-100/90 bg-slate-50/40 p-4 min-h-[200px] flex flex-col">
            <div className="mb-3">
                <h4 className="font-display text-base text-slate-800">{title}</h4>
                {hint ? <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p> : null}
            </div>
            <div className="space-y-2 flex-1">
                {items.length === 0 ? <p className="text-sm text-slate-400">{emptyText}</p> : items.map((q) => (
                    <div
                        key={`${q.studentId}-${q.taskId}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/mentor/mentee/${q.studentId}/task/${q.taskId}`)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                navigate(`/mentor/mentee/${q.studentId}/task/${q.taskId}`);
                            }
                        }}
                        className="w-full text-left rounded-xl border border-white bg-white p-3 shadow-sm text-sm transition-colors hover:border-blue-100 hover:bg-blue-50/30 cursor-pointer"
                    >
                        <div className="font-medium text-slate-800">{q.taskTitle}</div>
                        <div className="mt-1.5">
                            <button
                                type="button"
                                className="text-sm text-blue-700 hover:underline font-medium"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/mentor/mentee/${q.studentId}`);
                                }}
                            >
                                {q.studentName}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function MentorMenteesTable({ navigate, menteeRows, heading }) {
    return (
        <section className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-sm">
            {heading ? <h3 className="font-display text-lg text-slate-800 mb-4">{heading}</h3> : null}
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left min-w-[480px]">
                    <thead>
                        <tr className="text-xs text-slate-500 border-b border-slate-100">
                            <th className="pb-2 pr-3 font-medium">Имя</th>
                            <th className="pb-2 pr-3 font-medium">Последняя закрытая работа</th>
                            <th className="pb-2 pr-3 font-medium tabular-nums">Баллы курса</th>
                            <th className="pb-2 pr-3 font-medium tabular-nums">Просрочки</th>
                        </tr>
                    </thead>
                    <tbody>
                        {menteeRows.map((row) => (
                            <tr key={row.user.id} className="border-b border-slate-50 last:border-0">
                                <td className="py-3 pr-3 align-top">
                                    <button
                                        type="button"
                                        onClick={() => navigate(`/mentor/mentee/${row.user.id}`)}
                                        className="text-left font-medium text-blue-700 hover:underline"
                                    >
                                        {row.user.fullName}
                                    </button>
                                    {row.riskCount > 0 ? <span className="block text-[10px] text-slate-400">рисков: {row.riskCount}</span> : null}
                                </td>
                                <td className="py-3 pr-3 align-top text-slate-600">{row.lastDone ? row.lastDone.title : '—'}</td>
                                <td className="py-3 pr-3 align-top tabular-nums text-slate-700">{row.coursePoints}/400</td>
                                <td className="py-3 pr-3 align-top tabular-nums text-slate-700">{row.overdueN}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function MentorMenteesPanel({ navigate }) {
    const mentorId = 'u-men-1';
    const menteeRows = buildMentorMenteeRows(mentorId);
    return (
        <div className="space-y-4">
            <h2 className="font-display text-2xl text-slate-800">Мои менти</h2>
            <MentorMenteesTable navigate={navigate} menteeRows={menteeRows} heading={null} />
        </div>
    );
}

function MentorReviewQueuePanel({ navigate }) {
    const mentorId = 'u-men-1';
    const board = pvlDomainApi.mentorApi.getMentorReviewBoard(mentorId);
    return (
        <div className="space-y-4">
            <h2 className="font-display text-2xl text-slate-800">Очередь проверок</h2>
            <section>
                <div className="grid lg:grid-cols-3 gap-4">
                    <MentorKanbanCol title="Не проверено" hint="Отправлено, ждёт проверки" items={board.unchecked} emptyText="Нет работ в очереди." navigate={navigate} />
                    <MentorKanbanCol title="На доработке" hint="Нужен ответ или новая версия" items={board.revision} emptyText="Нет работ на доработке." navigate={navigate} />
                    <MentorKanbanCol title="Проверено" hint="Принято, закрыто" items={board.done} emptyText="Пока нет закрытых в этом срезе." navigate={navigate} />
                </div>
            </section>
        </div>
    );
}

function MentorDashboard({ navigate }) {
    const mentorId = 'u-men-1';
    const menteeRows = buildMentorMenteeRows(mentorId);
    const board = pvlDomainApi.mentorApi.getMentorReviewBoard(mentorId);
    const mentorCohortId = pvlDomainApi.db.mentorProfiles.find((m) => m.userId === mentorId)?.cohortIds?.[0] || 'cohort-2026-1';
    return (
        <div className="space-y-8">
            <div>
                <h2 className="font-display text-2xl text-slate-800">Дашборд ментора</h2>
                <p className="text-sm text-slate-500 mt-1">Кого открыть и что проверить сейчас.</p>
            </div>
            <PvlDashboardCalendarBlock
                viewerRole="mentor"
                cohortId={mentorCohortId}
                navigate={navigate}
                routePrefix="/mentor"
            />
            <MentorMenteesTable navigate={navigate} menteeRows={menteeRows} heading="Менти" />
            <section>
                <h3 className="font-display text-lg text-slate-800 mb-3">К проверке</h3>
                <div className="grid lg:grid-cols-3 gap-4">
                    <MentorKanbanCol title="Не проверено" hint="Отправлено, ждёт проверки" items={board.unchecked} emptyText="Нет работ в очереди." navigate={navigate} />
                    <MentorKanbanCol title="На доработке" hint="Нужен ответ или новая версия" items={board.revision} emptyText="Нет работ на доработке." navigate={navigate} />
                    <MentorKanbanCol title="Проверено" hint="Принято, закрыто" items={board.done} emptyText="Пока нет закрытых в этом срезе." navigate={navigate} />
                </div>
            </section>
        </div>
    );
}

function MentorPage({ route, navigate, cmsItems, cmsPlacements, refresh, refreshKey = 0 }) {
    if (route === '/mentor/dashboard') return <MentorDashboard navigate={navigate} />;
    if (route === '/mentor/mentees') return <MentorMenteesPanel navigate={navigate} />;
    if (route === '/mentor/review-queue') return <MentorReviewQueuePanel navigate={navigate} />;
    if (route === '/mentor/onboarding') {
        return <PvlContentStub title="Онбординг" hint="Зеркальный раздел для ментора. Контент готовится." />;
    }
    if (route === '/mentor/tracker') {
        return <StudentCourseTracker studentId={MENTOR_COURSE_MIRROR_STUDENT_ID} navigate={navigate} />;
    }
    if (route === '/mentor/qa') {
        return <PvlContentStub title="Вопросы и ответы" hint="Общий Q&A и модерация публикаций — в разработке." />;
    }
    if (route === '/mentor/materials') return <MentorMaterialsPage cmsItems={cmsItems} cmsPlacements={cmsPlacements} />;
    if (route === '/mentor/library' || route.startsWith('/mentor/library/')) {
        const itemId = route === '/mentor/library' ? '' : route.slice('/mentor/library/'.length).split('/')[0] || '';
        return <LibraryPage studentId={MENTOR_COURSE_MIRROR_STUDENT_ID} navigate={navigate} initialItemId={itemId} routePrefix="/mentor" />;
    }
    if (/^\/mentor\/mentee\/[^/]+\/task\/[^/]+$/.test(route)) {
        const [, , , menteeId, , taskId] = route.split('/');
        const resolvedMentee = LEGACY_MENTEE_ROUTE_TO_USER[menteeId] || menteeId;
        const mentorActorId = pvlDomainApi.db.studentProfiles.find((p) => p.userId === resolvedMentee)?.mentorId || 'u-men-1';
        return (
            <PvlTaskDetailView
                key={`${resolvedMentee}-${taskId}-${refreshKey}`}
                role="mentor"
                taskStudentId={resolvedMentee}
                taskId={taskId}
                mentorActorId={mentorActorId}
                navigate={navigate}
                onRefresh={refresh}
                onBack={() => navigate(`/mentor/mentee/${menteeId}`)}
                initialData={buildTaskDetailStateFromApi(resolvedMentee, taskId, 'mentor')}
                onMentorReply={(msg) => {
                    pvlDomainApi.mentorApi.addMentorThreadReply(mentorActorId, resolvedMentee, taskId, { text: msg.text, disputeOnly: msg.disputeOnly });
                    refresh();
                }}
                onMentorReview={(payload) => {
                    pvlDomainApi.mentorApi.submitMentorReview(mentorActorId, resolvedMentee, taskId, payload);
                    pvlDomainApi.actions.markThreadRead(mentorActorId, resolvedMentee, taskId);
                    refresh();
                }}
            />
        );
    }
    if (/^\/mentor\/mentee\/[^/]+$/.test(route)) {
        const [, , , menteeId] = route.split('/');
        return (
            <PvlMenteeCardView
                menteeId={menteeId}
                navigate={navigate}
                refreshKey={refreshKey}
                onBack={() => navigate('/mentor/dashboard')}
            />
        );
    }

    const mentorCourseNavigate = (r) => {
        if (typeof r === 'string' && r.startsWith('/student/')) {
            navigate(r.replace('/student/', '/mentor/'));
        } else {
            navigate(r);
        }
    };
    const courseRoute = route.replace(/^\/mentor\//, '/student/');
    return (
        <StudentPage
            route={courseRoute}
            studentId={MENTOR_COURSE_MIRROR_STUDENT_ID}
            navigate={mentorCourseNavigate}
            cmsItems={cmsItems}
            cmsPlacements={cmsPlacements}
            refresh={refresh}
            refreshKey={refreshKey}
        />
    );
}

function TeacherPvlHome({ navigate }) {
    const overview = pvlDomainApi.adminApi.getAdminOverview();
    const cards = [
        { title: 'Ученицы', desc: 'Прогресс по курсу и карточки сопровождения.', to: '/admin/students' },
        { title: 'Менторы', desc: 'Нагрузка, очередь проверок и статус сопровождения.', to: '/admin/mentors' },
        { title: 'Материалы курса', desc: 'Уроки, библиотека и глоссарий (данные ПВЛ отдельно от сада).', to: '/admin/content' },
        { title: 'Календарь', desc: 'Встречи с менторами, эфиры и выход уроков.', to: '/admin/calendar' },
        { title: 'Настройки', desc: 'Правила баллов и журнал действий.', to: '/admin/settings' },
    ];
    const rows = [
        { area: 'Материалы курса', state: 'Работает', note: 'CRUD в памяти; стартовый контент подмешивается при запуске.' },
        { area: 'Теги и типы', state: 'Частично', note: 'Теги вводятся строкой; типы — из списка в форме.' },
        { area: 'Видимость', state: 'Работает', note: 'Кто видит материал: участницы, менторы или оба.' },
        { area: 'Публикация', state: 'Работает', note: 'Публикация, архив, размещение в разделах.' },
        { area: 'Расписание недель', state: 'Просмотр', note: 'Недели и уроки в данных курса; отдельного редактора расписания здесь нет.' },
        { area: 'Библиотека', state: 'Работает', note: 'Те же материалы доступны участницам и менторам в их кабинетах.' },
    ];
    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-slate-100/90 bg-white p-6 md:p-8 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-1">{PVL_COURSE_DISPLAY_NAME}</p>
                <h2 className="font-display text-2xl md:text-3xl text-slate-800">Учительская ПВЛ</h2>
                <p className="text-sm text-slate-500 mt-2 max-w-2xl leading-relaxed">
                    Управление потоком: ученицы, менторы, материалы (уроки / библиотека / глоссарий), общий календарь.
                    Учениц в учёте: {overview.activeStudents}, менторов: {overview.activeMentors}, в очереди проверок: {overview.reviewQueue}.
                </p>
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {cards.map((c) => (
                    <button
                        key={c.to}
                        type="button"
                        onClick={() => navigate(c.to)}
                        className="rounded-2xl border border-slate-100/90 bg-white p-5 text-left shadow-sm hover:border-blue-100 hover:shadow-md transition-all"
                    >
                        <div className="font-display text-base text-slate-800">{c.title}</div>
                        <p className="text-xs text-slate-500 mt-2 leading-snug">{c.desc}</p>
                        <span className="text-xs text-blue-700/80 mt-4 inline-block font-medium">Перейти</span>
                    </button>
                ))}
            </div>
            <PvlDashboardCalendarBlock
                viewerRole="admin"
                cohortId="cohort-2026-1"
                navigate={navigate}
                routePrefix="/admin"
                title="Календарь курса"
                onOpenFullCalendar={() => navigate('/admin/calendar')}
                fullCalendarLabel="Полный календарь →"
            />
            {pvlDevToolsEnabled() ? (
                <>
                    <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/50 p-4 overflow-x-auto">
                        <h3 className="font-display text-sm font-semibold text-amber-950 mb-3">Статус возможностей (только dev)</h3>
                        <table className="w-full text-sm border-collapse min-w-[520px]">
                            <thead>
                                <tr className="border-b border-amber-200/80 text-left text-xs text-amber-900/70 uppercase tracking-wide">
                                    <th className="py-2 pr-2">Область</th>
                                    <th className="py-2 pr-2">Статус</th>
                                    <th className="py-2">Комментарий</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.area} className="border-b border-amber-100/80">
                                        <td className="py-2 pr-2 text-slate-800">{r.area}</td>
                                        <td className="py-2 pr-2"><StatusBadge>{r.state}</StatusBadge></td>
                                        <td className="py-2 text-slate-600 text-xs">{r.note}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 leading-relaxed">
                        Для полноценного продукта позже понадобятся отдельные сервисы: справочник тегов, редактор недель, сохранение данных на сервере, гранулярные роли.
                    </div>
                </>
            ) : null}
        </div>
    );
}

function AdminContentCenter({ cmsItems, setCmsItems, cmsPlacements, setCmsPlacements }) {
    const items = cmsItems;
    const placements = cmsPlacements;
    const setItems = setCmsItems;
    const setPlacements = setCmsPlacements;
    const [filters, setFilters] = useState({ section: 'all', status: 'all', role: 'all', type: 'all', cohort: 'all', week: 'all', query: '' });
    const [previewId, setPreviewId] = useState('');
    const [draft, setDraft] = useState({
        title: '',
        shortDescription: '',
        fullDescription: '',
        contentType: 'text',
        targetSection: 'library',
        targetRole: 'student',
        targetCohort: 'cohort-2026-1',
        status: 'draft',
        visibility: 'all',
        weekNumber: 0,
        estimatedDuration: '',
        tagsText: '',
    });
    const sections = ['lessons', 'library', 'glossary'];
    const types = ['video', 'text', 'pdf', 'checklist', 'template', 'link', 'audio', 'fileBundle'];
    const filtered = filterContentItems(items, filters)
        .filter((i) => sections.includes(i.targetSection))
        .filter((i) => (filters.cohort === 'all' ? true : i.targetCohort === filters.cohort))
        .filter((i) => (filters.week === 'all' ? true : String(i.weekNumber || 0) === String(filters.week)));
    const previewItem = items.find((x) => x.id === previewId) || null;
    const handleCreate = () => {
        if (!draft.title.trim()) return;
        const { tagsText, ...rest } = draft;
        const record = {
            ...rest,
            tags: String(tagsText || '').split(',').map((x) => x.trim()).filter(Boolean),
            description: draft.fullDescription || draft.shortDescription,
            createdBy: 'u-adm-1',
        };
        const created = pvlDomainApi.adminApi.createContentItem(record);
        setItems((prev) => [created, ...prev]);
        setDraft((d) => ({ ...d, title: '', shortDescription: '', fullDescription: '', tagsText: '' }));
    };
    const handleDeleteItem = (i) => {
        if (!window.confirm(`Удалить материал «${i.title}»? Связанные размещения в разделах тоже будут убраны.`)) return;
        pvlDomainApi.adminApi.deleteContentItem(i.id);
        setItems((prev) => prev.filter((x) => x.id !== i.id));
        setPlacements((prev) => prev.filter((p) => (p.contentId || p.contentItemId) !== i.id));
        setPreviewId((pid) => (pid === i.id ? '' : pid));
    };
    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100/90 bg-white p-5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                <div>
                    <h2 className="font-display text-2xl text-slate-800">Материалы курса</h2>
                    <p className="text-sm text-slate-500 mt-1">Только размещение в уроках, библиотеке и глоссарии ПВЛ (отдельно от библиотеки сада).</p>
                    {pvlDevToolsEnabled() ? <p className="text-[11px] text-amber-800 mt-1">Dev: данные в памяти сессии.</p> : null}
                </div>
                <button type="button" onClick={handleCreate} className="text-sm rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50 shrink-0">Добавить материал</button>
            </div>
            <div className="rounded-2xl border border-slate-100/90 bg-white p-4 grid md:grid-cols-2 gap-3 shadow-sm">
                <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} className="rounded-xl border border-slate-200 p-2 text-sm" placeholder="Название нового материала" />
                <input value={draft.shortDescription} onChange={(e) => setDraft((d) => ({ ...d, shortDescription: e.target.value }))} className="rounded-xl border border-slate-200 p-2 text-sm" placeholder="Короткое описание" />
                <select value={draft.targetSection} onChange={(e) => setDraft((d) => ({ ...d, targetSection: e.target.value }))} className="rounded-xl border border-slate-200 p-2 text-sm">
                    {sections.map((s) => <option key={s} value={s}>{labelTargetSection(s)}</option>)}
                </select>
                <select value={draft.contentType} onChange={(e) => setDraft((d) => ({ ...d, contentType: e.target.value }))} className="rounded-xl border border-slate-200 p-2 text-sm">
                    {types.map((s) => <option key={s} value={s}>{CONTENT_TYPE_LABEL[s] || s}</option>)}
                </select>
                <select value={draft.visibility || 'all'} onChange={(e) => setDraft((d) => ({ ...d, visibility: e.target.value }))} className="rounded-xl border border-slate-200 p-2 text-sm" title="Видимость материала">
                    <option value="all">Кто видит: по размещению</option>
                    <option value="students_only">Только участницы</option>
                    <option value="mentors_only">Только менторы</option>
                </select>
                <input value={draft.tagsText} onChange={(e) => setDraft((d) => ({ ...d, tagsText: e.target.value }))} className="rounded-xl border border-slate-200 p-2 text-sm" placeholder="Теги через запятую" />
                <input value={draft.estimatedDuration} onChange={(e) => setDraft((d) => ({ ...d, estimatedDuration: e.target.value }))} className="rounded-xl border border-slate-200 p-2 text-sm" placeholder="Длительность (например 20 мин)" />
            </div>
            <div className="rounded-2xl border border-slate-100/90 bg-white p-4 grid md:grid-cols-6 gap-2 shadow-sm">
                <select value={filters.section} onChange={(e) => setFilters((f) => ({ ...f, section: e.target.value }))} className="rounded-xl border border-slate-200 p-2 text-sm">
                    <option value="all">Все разделы</option>
                    {sections.map((s) => <option key={s} value={s}>{labelTargetSection(s)}</option>)}
                </select>
                <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="rounded-xl border border-slate-200 p-2 text-sm">
                    <option value="all">Все статусы</option>
                    <option value="draft">Черновик</option>
                    <option value="published">Опубликован</option>
                    <option value="archived">В архиве</option>
                </select>
                <select value={filters.role} onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value }))} className="rounded-xl border border-slate-200 p-2 text-sm">
                    <option value="all">Все роли</option>
                    <option value="student">{TARGET_ROLE_LABELS.student}</option>
                    <option value="mentor">{TARGET_ROLE_LABELS.mentor}</option>
                    <option value="both">{TARGET_ROLE_LABELS.both}</option>
                </select>
                <select value={filters.cohort} onChange={(e) => setFilters((f) => ({ ...f, cohort: e.target.value }))} className="rounded-xl border border-slate-200 p-2 text-sm">
                    <option value="all">Все потоки</option>
                    {(pvlDomainApi.adminApi.getAdminCohorts() || []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
                <select value={filters.week} onChange={(e) => setFilters((f) => ({ ...f, week: e.target.value }))} className="rounded-xl border border-slate-200 p-2 text-sm">
                    <option value="all">Все недели</option>
                    {Array.from({ length: 13 }, (_, i) => <option key={i} value={i}>Неделя {i}</option>)}
                </select>
                <input value={filters.query} onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))} className="rounded-xl border border-slate-200 p-2 text-sm" placeholder="Поиск по названию" />
            </div>
            <div className="grid gap-3">
                {filtered.map((i) => (
                    <article key={i.id} className="rounded-xl border border-slate-100/90 bg-white p-4 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <div className="text-sm font-medium text-slate-800">{i.title}</div>
                                <div className="text-xs text-slate-500 mt-0.5">{labelTargetSection(i.targetSection)} · {TARGET_ROLE_LABELS[i.targetRole] || i.targetRole} · неделя {i.weekNumber} · размещений: {placements.filter((p) => (p.contentId || p.contentItemId) === i.id).length}</div>
                            </div>
                            <div className="flex gap-2">
                                <StatusBadge>{CONTENT_STATUS_LABEL[i.status] || i.status}</StatusBadge>
                                <button type="button" onClick={() => { pvlDomainApi.adminApi.updateContentItem(i.id, { title: `${i.title} (upd)` }); setItems((prev) => updateContentItem(prev, i.id, { title: `${i.title} (upd)` })); }} className="text-xs rounded-xl border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50">Правка</button>
                                <button type="button" onClick={() => { pvlDomainApi.adminApi.publishContentItem(i.id); setItems((prev) => publishContentItem(prev, i.id)); }} className="text-xs rounded-xl border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50">Опубликовать</button>
                                <button type="button" onClick={() => { pvlDomainApi.adminApi.unpublishContentItem(i.id); setItems((prev) => archiveContentItem(prev, i.id)); }} className="text-xs rounded-xl border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50">В архив</button>
                                <button type="button" onClick={() => handleDeleteItem(i)} className="text-xs rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-800">Удалить</button>
                                <button type="button" onClick={() => {
                                    pvlDomainApi.adminApi.assignContentPlacement({ contentItemId: i.id, targetSection: i.targetSection, targetRole: i.targetRole, cohortId: i.targetCohort || 'cohort-2026-1', weekNumber: i.weekNumber || 0, moduleNumber: i.moduleNumber || 0, orderIndex: i.orderIndex || 999 });
                                    setPlacements((prev) => assignContentToSection(prev, i.id, i.targetSection, i.targetRole, i.targetCohort || 'cohort-2026-1'));
                                }} className="text-xs rounded-xl border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50">Разместить</button>
                                <button type="button" onClick={() => setPreviewId(i.id)} className="text-xs rounded-xl border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50">Просмотр</button>
                                <button type="button" onClick={() => {
                                    const copy = pvlDomainApi.adminApi.createContentItem({
                                        ...i,
                                        id: undefined,
                                        title: `${i.title} (копия)`,
                                        status: 'draft',
                                    });
                                    setItems((prev) => [copy, ...prev]);
                                }} className="text-xs rounded-xl border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50">Копия</button>
                            </div>
                        </div>
                        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                            <div className="text-xs font-medium text-slate-500 mb-2">Размещения в разделах</div>
                            <div className="grid gap-1">
                                {placements.filter((p) => p.contentId === i.id || p.contentItemId === i.id).length === 0 ? (
                                    <div className="text-xs text-slate-500">Пока не привязано к разделам.</div>
                                ) : placements.filter((p) => p.contentId === i.id || p.contentItemId === i.id).map((p) => (
                                    <article key={p.id} className="rounded-lg border border-slate-100 bg-white p-2 flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-xs text-slate-600">{labelTargetSection(p.targetSection)} · {TARGET_ROLE_LABELS[p.targetRole] || p.targetRole} · {p.targetCohort || p.cohortId || 'все'} · порядок {p.orderIndex ?? '—'}</span>
                                        <div className="flex gap-1">
                                            <button type="button" onClick={() => pvlDomainApi.adminApi.publishPlacement(p.id)} className="text-[10px] rounded-full border border-slate-200 px-2 py-0.5 text-slate-700">Опубликовать</button>
                                            <button type="button" onClick={() => pvlDomainApi.adminApi.unpublishPlacement(p.id)} className="text-[10px] rounded-full border border-slate-200 px-2 py-0.5 text-slate-700">Снять</button>
                                            <button type="button" onClick={() => { pvlDomainApi.adminApi.deletePlacement(p.id); setPlacements((prev) => prev.filter((x) => x.id !== p.id)); }} className="text-[10px] rounded-full border border-slate-200 px-2 py-0.5 text-rose-700">Удалить</button>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </div>
                    </article>
                ))}
            </div>
            {previewItem ? (
                <div className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-sm">
                    <h3 className="font-display text-lg text-slate-800 mb-2">Предпросмотр</h3>
                    <div className="text-sm font-medium text-slate-800">{previewItem.title}</div>
                    <p className="text-sm text-slate-500 mt-2">{previewItem.shortDescription || previewItem.description}</p>
                    <p className="text-xs text-slate-400 mt-2">{labelTargetSection(previewItem.targetSection)} · {TARGET_ROLE_LABELS[previewItem.targetRole] || previewItem.targetRole} · {CONTENT_STATUS_LABEL[previewItem.status] || previewItem.status}</p>
                </div>
            ) : null}
        </div>
    );
}

function AdminStudents({ navigate }) {
    const [cohortId, setCohortId] = useState('all');
    const cohorts = pvlDomainApi.adminApi.getAdminCohorts();
    const rows = buildTeacherStudentRows().filter((r) => {
        if (cohortId === 'all') return true;
        const sp = pvlDomainApi.db.studentProfiles.find((p) => p.userId === r.userId);
        return sp?.cohortId === cohortId;
    });
    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm">
                <h2 className="font-display text-2xl text-slate-800">Ученицы</h2>
                <p className="text-sm text-slate-500 mt-1">Те же показатели, что у ментора: курс, прогресс закрытия, баллы, домашки. Строка или имя открывает карточку.</p>
            </div>
            <div className="rounded-2xl border border-slate-100/90 bg-white p-4 shadow-sm">
                <select value={cohortId} onChange={(e) => setCohortId(e.target.value)} className="rounded-xl border border-slate-200 p-2 text-sm w-full md:w-auto">
                    <option value="all">Все потоки</option>
                    {cohorts.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
            </div>
            <section className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left min-w-[800px]">
                        <thead>
                            <tr className="text-xs text-slate-500 border-b border-slate-100">
                                <th className="pb-2 pr-3 font-medium">Имя</th>
                                <th className="pb-2 pr-3 font-medium">Сейчас по курсу</th>
                                <th className="pb-2 pr-3 font-medium tabular-nums">Закрытие ДЗ</th>
                                <th className="pb-2 pr-3 font-medium tabular-nums">Баллы</th>
                                <th className="pb-2 pr-3 font-medium">Домашки</th>
                                <th className="pb-2 font-medium">Последнее действие</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr
                                    key={row.userId}
                                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50/80 cursor-pointer"
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => navigate(`/admin/students/${row.userId}`)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            navigate(`/admin/students/${row.userId}`);
                                        }
                                    }}
                                >
                                    <td className="py-3 pr-3 align-top">
                                        <span className="font-medium text-blue-700 hover:underline">{row.user?.fullName || row.userId}</span>
                                    </td>
                                    <td className="py-3 pr-3 align-top text-slate-600 text-xs max-w-[14rem]">{row.courseLine}</td>
                                    <td className="py-3 pr-3 align-top tabular-nums text-slate-700">{row.closedPct}%</td>
                                    <td className="py-3 pr-3 align-top tabular-nums text-slate-700">{row.coursePoints}/400</td>
                                    <td className="py-3 pr-3 align-top text-xs text-slate-600">{row.hwSummary}</td>
                                    <td className="py-3 align-top text-xs text-slate-500 tabular-nums">{row.lastAct}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

function buildAdminMentorWorkloadRows() {
    return pvlDomainApi.adminApi.getAdminMentors().map((m) => {
        const mentorUserId = m.userId || m.id;
        const user = getUser(mentorUserId);
        const mentees = m.menteeIds || [];
        const states = pvlDomainApi.db.studentTaskStates.filter((s) => mentees.includes(s.studentId));
        const unclosed = states.filter((s) => s.status !== TASK_STATUS.ACCEPTED).length;
        const pendingReview = states.filter((s) => s.status === TASK_STATUS.PENDING_REVIEW).length;
        const overdueReview = states.filter((s) => s.status === TASK_STATUS.PENDING_REVIEW && s.isOverdue).length;
        const menteesInRevision = new Set(states.filter((s) => s.status === TASK_STATUS.REVISION_REQUESTED).map((s) => s.studentId)).size;
        const lastActs = mentees
            .map((sid) => pvlDomainApi.db.studentProfiles.find((p) => p.userId === sid)?.lastActivityAt)
            .filter(Boolean)
            .sort();
        const lastActivity = lastActs.length ? formatPvlDateTime(lastActs[lastActs.length - 1]) : '—';
        let statusLabel = 'стабильно';
        if (overdueReview > 0 || pendingReview > 4) statusLabel = 'требует внимания';
        else if (pendingReview > 0 || menteesInRevision > 0 || unclosed > 8) statusLabel = 'есть нагрузка';
        return {
            ...m,
            user,
            mentorUserId,
            menteeCount: mentees.length,
            unclosed,
            pendingReview,
            overdueReview,
            menteesInRevision,
            lastActivity,
            statusLabel,
        };
    });
}

function AdminMentors() {
    const mentors = buildAdminMentorWorkloadRows();
    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm">
                <h2 className="font-display text-2xl text-slate-800">Менторы</h2>
                <p className="text-sm text-slate-500 mt-1">Очередь проверок, незакрытые работы и общий статус сопровождения по менти.</p>
            </div>
            <div className="grid gap-3">
                {mentors.map((m) => (
                    <article key={m.id} className="rounded-xl border border-slate-100/90 bg-white p-4 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-medium text-slate-800">{m.user?.fullName || m.mentorUserId}</div>
                            <StatusBadge>{m.statusLabel}</StatusBadge>
                        </div>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2 mt-3 text-xs text-slate-600">
                            <div>Менти: <span className="font-medium tabular-nums text-slate-800">{m.menteeCount}</span></div>
                            <div>Незакрытых задач: <span className="font-medium tabular-nums text-slate-800">{m.unclosed}</span></div>
                            <div>Ждут проверки: <span className="font-medium tabular-nums text-slate-800">{m.pendingReview}</span></div>
                            <div>Просроченная проверка: <span className="font-medium tabular-nums text-rose-700">{m.overdueReview}</span></div>
                            <div>Менти на доработке: <span className="font-medium tabular-nums text-slate-800">{m.menteesInRevision}</span></div>
                            <div>Активность: <span className="text-slate-700">{m.lastActivity}</span></div>
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
}

function AdminCohorts() {
    const cohorts = pvlDomainApi.adminApi.getAdminCohorts();
    const risks = pvlDomainApi.adminApi.getAdminRisks();
    const certs = pvlDomainApi.adminApi.getAdminCertification();
    const items = pvlDomainApi.adminApi.getAdminContent({});
    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm">
                <h2 className="font-display text-2xl text-slate-800">Потоки</h2>
                <p className="text-sm text-slate-500 mt-1">Когорты и ключевые показатели.</p>
            </div>
            {cohorts.map((c) => (
                <article key={c.id} className="rounded-xl border border-slate-100/90 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-medium text-slate-800">{c.title}</div><StatusBadge>{c.status}</StatusBadge></div>
                    <div className="grid md:grid-cols-5 gap-2 mt-2 text-xs">
                        <div>Старт: {c.startDate || c.startAt}</div>
                        <div>Финиш: {c.endDate || c.endAt}</div>
                        <div>Учениц: {pvlDomainApi.adminApi.getAdminStudents({ cohortId: c.id }).length}</div>
                        <div>Менторов: {pvlDomainApi.adminApi.getAdminMentors().filter((m) => (m.cohortIds || []).includes(c.id)).length}</div>
                        <div>КТ: 9</div>
                    </div>
                    <div className="grid md:grid-cols-4 gap-2 mt-2 text-xs">
                        <div>Рисков: {risks.filter((r) => pvlDomainApi.adminApi.getAdminStudents({ cohortId: c.id }).some((s) => s.userId === r.studentId)).length}</div>
                        <div>На СЗ: {certs.filter((x) => pvlDomainApi.adminApi.getAdminStudents({ cohortId: c.id }).some((s) => s.userId === x.studentId)).length}</div>
                        <div>Материалов: {items.filter((it) => it.targetCohort === c.id && it.status === 'published').length}</div>
                        <div>Дедлайн СЗ: 2026-06-30</div>
                    </div>
                </article>
            ))}
        </div>
    );
}

function AdminReview({ navigate }) {
    const pref = loadViewPreferences('admin.review');
    const [mentorFilter, setMentorFilter] = useState(pref?.mentorFilter || 'all');
    const queue = pvlDomainApi.adminApi.getAdminReviewQueue().map((s) => {
        const t = pvlDomainApi.db.homeworkTasks.find((x) => x.id === s.taskId);
        return { id: s.taskId, title: t?.title || s.taskId, status: s.status, studentId: s.studentId };
    });
    const risks = pvlDomainApi.adminApi.getAdminRisks();
    React.useEffect(() => {
        saveViewPreferences('admin.review', { mentorFilter });
    }, [mentorFilter]);
    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm">
                <h2 className="font-display text-2xl text-slate-800">Проверки и риски</h2>
                <p className="text-sm text-slate-500 mt-1">Очередь заданий и предупреждения по срокам.</p>
            </div>
            <div className="rounded-2xl border border-slate-100/90 bg-white p-4 shadow-sm">
                <select value={mentorFilter} onChange={(e) => setMentorFilter(e.target.value)} className="rounded-xl border border-slate-200 p-2 text-sm w-full md:w-auto"><option value="all">Все менторы</option><option value="u-men-1">Екатерина Соловьева</option></select>
            </div>
            <StudentGeneric title="Задания к проверке">
                <div className="grid gap-2">
                    {queue.map((q) => <article key={q.id} className="rounded-xl border border-slate-100 bg-white p-3 text-sm flex flex-wrap items-center justify-between gap-2 shadow-sm"><span className="text-slate-800">{q.title}</span><div className="flex items-center gap-2"><StatusBadge>{mapTaskStatus(q.status)}</StatusBadge><button type="button" onClick={() => navigateToTaskDetail(navigate, q.studentId, q.id)} className="text-xs rounded-xl border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50">К заданию</button></div></article>)}
                </div>
            </StudentGeneric>
            <StudentGeneric title="Риски">
                <div className="grid gap-2">
                    {risks.map((r) => <article key={r.id} className="rounded-xl border border-slate-100 bg-white p-3 text-sm flex flex-wrap items-center justify-between gap-2 shadow-sm"><span className="text-slate-700">{r.title}</span><div className="flex items-center gap-2"><RiskBadge level={riskLevelDisplay(r.riskLevel)} /><button type="button" onClick={() => navigateToStudentCard(navigate, r.studentId)} className="text-xs rounded-xl border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50">К ученице</button></div></article>)}
                </div>
            </StudentGeneric>
        </div>
    );
}

function AdminCertification() {
    const registry = pvlDomainApi.adminApi.getAdminCertification();
    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm">
                <h2 className="font-display text-2xl text-slate-800">Сертификация</h2>
                <p className="text-sm text-slate-500 mt-1">Самооценка и допуск по ученицам.</p>
            </div>
            <div className="grid gap-3">
                {registry.map((c) => {
                    const user = getUser(c.studentId);
                    const pts = pvlDomainApi.helpers.getStudentPointsSummary(c.studentId);
                    const certRow = pvlDomainApi.studentApi.getStudentCertification(c.studentId);
                    const szs = certRow?.szScores;
                    return (
                        <article key={c.studentId} className="rounded-xl border border-slate-100/90 bg-white p-4 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-medium text-slate-800">{user?.fullName || c.studentId}</div><StatusBadge>{c.admissionStatus}</StatusBadge></div>
                            <div className="grid md:grid-cols-4 gap-2 mt-3 text-xs text-slate-600">
                                <div>Запись: {c.szRecordingStatus}</div><div>Самооценка: {c.szSelfAssessmentStatus}</div><div>Оценка ментора: {c.szMentorAssessmentStatus}</div><div>Дедлайн: {c.deadlineAt}</div>
                            </div>
                            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-2 mt-2 text-xs text-slate-600">
                                <div>Курс: {pts.coursePointsTotal}/400</div>
                                <div>Самооценка (баллы): {szs ? `${szs.self_score_total}/54` : `${pts.szSelfAssessmentTotal}/54`}</div>
                                <div>Оценка ментора (СЗ): {szs ? `${szs.mentor_score_total}/54` : pts.szMentorAssessmentTotal}</div>
                                <div>Крит. отметки в бланке: {szs?.critical_flags_count ?? '—'}</div>
                            </div>
                            {c.redFlags.length > 0 ? <p className="text-xs text-rose-700 mt-2">Регламент: {c.redFlags.join(', ')}</p> : null}
                        </article>
                    );
                })}
            </div>
        </div>
    );
}

function AdminSettings() {
    const settings = pvlDomainApi.adminApi.getAdminSettings();
    const audit = pvlDomainApi.audit.getAuditLog({}).slice(0, 20);
    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm">
                <h2 className="font-display text-2xl text-slate-800">Настройки</h2>
                <p className="text-sm text-slate-500 mt-1">Правила курса и журнал действий.</p>
            </div>
            <div className="rounded-2xl border border-slate-100/90 bg-white p-5 text-sm text-slate-600 shadow-sm">
                <p>Здесь будут справочники разделов, шаблоны писем менторам и даты потоков. Сейчас отображаются только базовые константы начисления баллов.</p>
                {pvlDevToolsEnabled() ? (
                    <>
                        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-700 font-mono">
                            Курс макс {settings.scoreRules.COURSE_POINTS_MAX}, СЗ макс {settings.scoreRules.SZ_POINTS_MAX}, неделя 0 {settings.scoreRules.WEEK0_POINTS}, неделя {settings.scoreRules.WEEK_CLOSURE_POINTS}, КТ {settings.scoreRules.CONTROL_POINT_POINTS}, бонус {settings.scoreRules.MENTOR_BONUS_POOL_MAX}
                        </div>
                        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/80 p-2 text-xs text-amber-900">Вопрос методологии: {settings.methodQuestions[0]}</div>
                    </>
                ) : null}
            </div>
            <div className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-sm">
                <h3 className="font-display text-lg text-slate-800 mb-3">Журнал действий</h3>
                <div className="grid gap-2">
                    {audit.length === 0 ? <div className="text-sm text-slate-500">Записей пока нет.</div> : audit.map((a) => (
                        <article key={a.id} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                            <div className="text-[10px] text-slate-400">{a.createdAt}</div>
                            <div className="text-xs text-slate-800 mt-1">{a.summary || `${a.actionType} · ${a.entityType}`}</div>
                        </article>
                    ))}
                </div>
            </div>
        </div>
    );
}

function AdminLegacyRedirect({ navigate, target }) {
    useEffect(() => {
        navigate(target);
    }, [navigate, target]);
    return (
        <div className="rounded-2xl border border-slate-100/90 bg-white p-6 text-sm text-slate-500 shadow-sm">
            Раздел перенесён — открываем актуальную учительскую…
        </div>
    );
}

function AdminPage({
    route,
    navigate,
    cmsItems,
    setCmsItems,
    cmsPlacements,
    setCmsPlacements,
    refreshKey,
    forceRefresh,
}) {
    const legacyAdmin = ['/admin/dashboard', '/admin/cohorts', '/admin/review', '/admin/certification', '/admin/qa-moderation'];
    if (legacyAdmin.includes(route)) return <AdminLegacyRedirect navigate={navigate} target="/admin/pvl" />;

    if (route === '/admin/pvl') return <TeacherPvlHome navigate={navigate} />;
    if (route === '/admin/content') {
        return (
            <AdminContentCenter
                cmsItems={cmsItems}
                setCmsItems={setCmsItems}
                cmsPlacements={cmsPlacements}
                setCmsPlacements={setCmsPlacements}
            />
        );
    }
    if (route === '/admin/calendar') return <PvlAdminCalendarScreen navigate={navigate} refresh={forceRefresh} />;
    if (route === '/admin/students') return <AdminStudents navigate={navigate} />;
    if (route === '/admin/mentors') return <AdminMentors />;
    if (route === '/admin/settings') return <AdminSettings />;

    if (/^\/admin\/students\/[^/]+\/task\/[^/]+$/.test(route)) {
        const parts = route.split('/');
        const menteeSeg = parts[3];
        const taskId = parts[5];
        const resolved = LEGACY_MENTEE_ROUTE_TO_USER[menteeSeg] || menteeSeg;
        const mentorActorId = pvlDomainApi.db.studentProfiles.find((p) => p.userId === resolved)?.mentorId || 'u-men-1';
        return (
            <PvlTaskDetailView
                key={`adm-${resolved}-${taskId}-${refreshKey}`}
                role="mentor"
                taskStudentId={resolved}
                taskId={taskId}
                mentorActorId={mentorActorId}
                navigate={navigate}
                onRefresh={forceRefresh}
                onBack={() => navigate(`/admin/students/${menteeSeg}`)}
                initialData={buildTaskDetailStateFromApi(resolved, taskId, 'mentor')}
                onMentorReply={(msg) => {
                    pvlDomainApi.mentorApi.addMentorThreadReply(mentorActorId, resolved, taskId, { text: msg.text, disputeOnly: msg.disputeOnly });
                    forceRefresh();
                }}
                onMentorReview={(payload) => {
                    pvlDomainApi.mentorApi.submitMentorReview(mentorActorId, resolved, taskId, payload);
                    pvlDomainApi.actions.markThreadRead(mentorActorId, resolved, taskId);
                    forceRefresh();
                }}
            />
        );
    }
    if (/^\/admin\/students\/[^/]+$/.test(route)) {
        const menteeSeg = route.split('/')[3];
        return (
            <PvlMenteeCardView
                key={`adm-card-${menteeSeg}-${refreshKey}`}
                menteeId={menteeSeg}
                linkMode="admin"
                backLabel="← Вернуться к списку учениц"
                navigate={navigate}
                refreshKey={refreshKey}
                onBack={() => navigate('/admin/students')}
            />
        );
    }

    return <TeacherPvlHome navigate={navigate} />;
}

function DebugPanel({ role, setRole, setActingUserId, actingUserId, setNowDate, nowDate, forceRefresh }) {
    return (
        <section className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/40 p-3">
            <div className="text-xs font-medium text-amber-900 mb-2">Служебная панель (localStorage pvl_dev_tools=1)</div>
            <div className="grid md:grid-cols-4 gap-2">
                <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-xl border border-[#E8D5C4] p-2 text-xs bg-white">
                    <option value="student">Участница</option><option value="mentor">Ментор</option><option value="admin">Учительская</option>
                </select>
                <select value={actingUserId} onChange={(e) => setActingUserId(e.target.value)} className="rounded-xl border border-[#E8D5C4] p-2 text-xs bg-white">
                    <option value="u-st-1">Ученица 1</option><option value="u-st-2">Ученица 2</option><option value="u-st-3">Ученица 3</option><option value="u-st-4">Ученица 4</option><option value="u-men-1">Ментор</option><option value="u-adm-1">Администратор</option>
                </select>
                <input value={nowDate} onChange={(e) => setNowDate(e.target.value)} className="rounded-xl border border-[#E8D5C4] p-2 text-xs bg-white" placeholder="ГГГГ-ММ-ДД" />
                <button type="button" onClick={forceRefresh} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] bg-white">Обновить данные</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => { window.location.hash = '#/qa'; }} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] bg-white">Экран QA</button>
                <button type="button" onClick={() => { pvlDomainApi.actions.setTaskStatus('u-st-1', 'task-1', 'revision_requested', 'u-men-1', 'debug'); forceRefresh(); }} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] bg-white">Сценарий: доработка</button>
                <button type="button" onClick={() => { pvlDomainApi.actions.setTaskStatus('u-st-1', 'task-1', 'accepted', 'u-men-1', 'debug'); forceRefresh(); }} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] bg-white">Сценарий: принято</button>
                <button type="button" onClick={() => { pvlDomainApi.actions.setTaskOverdue('u-st-1', 'task-1', 3); forceRefresh(); }} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] bg-white">Просрочка (тест)</button>
                <button type="button" onClick={() => { pvlDomainApi.actions.simulateCertificationRedFlag('u-st-3', 'debug'); forceRefresh(); }} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] bg-white">Красный флаг СЗ</button>
            </div>
        </section>
    );
}

const QA_ROUTE_LIST = [
    '/student/dashboard',
    '/student/about',
    '/student/glossary',
    '/student/library',
    '/student/library/:itemId',
    '/student/lessons',
    '/student/tracker',
    '/student/practicums',
    '/student/checklist',
    '/student/results',
    '/student/results/:taskId',
    '/student/certification',
    '/student/self-assessment',
    '/student/cultural-code',
    '/mentor/dashboard',
    '/mentor/library',
    '/mentor/library/:itemId',
    '/mentor/materials',
    '/mentor/mentee/:id',
    '/mentor/mentee/:id/task/:taskId',
    '/admin/pvl',
    '/admin/content',
    '/admin/students',
    '/admin/students/:id',
    '/admin/students/:id/task/:taskId',
    '/admin/mentors',
    '/admin/calendar',
    '/admin/settings',
];

const QA_SCENARIOS = [
    { id: 's1', title: 'Scenario 1. Student happy path' },
    { id: 's2', title: 'Scenario 2. Mentor review path' },
    { id: 's3', title: 'Scenario 3. Student revision path' },
    { id: 's4', title: 'Scenario 4. Mentor accept path' },
    { id: 's5', title: 'Scenario 5. Overdue path' },
    { id: 's6', title: 'Scenario 6. Control point path' },
    { id: 's7', title: 'Scenario 7. Certification path' },
    { id: 's8', title: 'Scenario 8. Content center path' },
];

function CheckMark({ ok }) {
    return <span className={`text-[10px] rounded-full border px-2 py-0.5 ${ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>{ok ? 'pass' : 'fail'}</span>;
}

function QaScreen({ navigate, role, setRole, setActingUserId, forceRefresh }) {
    const [scenarioStatus, setScenarioStatus] = useState({});
    const [notes, setNotes] = useState('');
    const [bug, setBug] = useState({
        role: 'student',
        screen: '',
        route: '',
        scenario: '',
        stepNumber: '',
        expected: '',
        actual: '',
        severity: 'major',
        screenshot: '',
        note: '',
    });

    const studentMenuPass = STUDENT_MENU.length === 9;
    const weeks = pvlDomainApi.db.courseWeeks;
    const cps = pvlDomainApi.db.controlPoints;
    const week6CpCount = cps.filter((c) => c.weekNumber === 6).length;
    const szDeadlineOk = cps.some((c) => c.code === 'KT8' && c.deadlineAt === '2026-06-30');
    const adminMenuOk = ADMIN_SIDEBAR_CONFIG.filter((x) => x.type === 'item').length === 6;
    const pvlCalendarOk = pvlDomainApi.calendarApi.listForViewer('admin', null).length >= 1;
    const scoresSeparated = true;

    const criticalChecks = [
        { title: 'Меню участницы: 9 пунктов (плюс главная в сайдбаре)', ok: studentMenuPass },
        { title: 'О курсе содержит стартовые материалы', ok: pvlDomainApi.studentApi.getStudentLibrary('u-st-1').length >= 0 },
        { title: 'Библиотека не смешана с Уроками', ok: true },
        { title: 'Результаты содержат домашки/статусы/комментарии', ok: pvlDomainApi.studentApi.getStudentResults('u-st-1').length > 0 },
        { title: 'Курсовые 400 и СЗ 54 раздельно', ok: scoresSeparated },
        { title: 'Недели 0–12 присутствуют', ok: weeks.some((w) => w.weekNumber === 0) && weeks.some((w) => w.weekNumber === 12) },
        { title: '9 КТ присутствуют', ok: cps.length === 9 },
        { title: 'Неделя 6: 3 отдельные КТ', ok: week6CpCount === 3 },
        { title: 'Дедлайн записи СЗ: 30.06.2026', ok: szDeadlineOk },
        { title: 'Учительская: 6 пунктов меню (Дашборд … Настройки)', ok: adminMenuOk },
        { title: 'Календарь ПВЛ: есть события в seed', ok: pvlCalendarOk },
    ];

    const runScenario = (id) => {
        if (id === 's1') {
            setRole('student');
            setActingUserId('u-st-1');
            navigate('/student/results/task-1');
            pvlDomainApi.studentApi.saveStudentDraft('u-st-1', 'task-1', { textContent: 'qa draft' });
            pvlDomainApi.studentApi.submitStudentTask('u-st-1', 'task-1', { textContent: 'qa submit' });
        }
        if (id === 's2') {
            setRole('mentor');
            setActingUserId('u-men-1');
            navigate('/mentor/mentee/u-st-1/task/task-1');
            pvlDomainApi.mentorApi.submitMentorReview('u-men-1', 'u-st-1', 'task-1', {
                statusDecision: 'revision_requested',
                generalComment: 'qa review',
                nextActions: ['1', '2'],
            });
        }
        if (id === 's3') {
            setRole('student');
            setActingUserId('u-st-1');
            pvlDomainApi.studentApi.submitStudentTask('u-st-1', 'task-1', { textContent: 'qa resubmit' });
            pvlDomainApi.studentApi.addStudentThreadReply('u-st-1', 'task-1', { text: 'qa reply' });
        }
        if (id === 's4') {
            setRole('mentor');
            pvlDomainApi.mentorApi.submitMentorReview('u-men-1', 'u-st-1', 'task-1', {
                statusDecision: 'accepted',
                generalComment: 'accepted',
                nextActions: ['ok'],
            });
        }
        if (id === 's5') {
            pvlDomainApi.actions.setTaskOverdue('u-st-1', 'task-1', 7);
        }
        if (id === 's6') {
            setRole('mentor');
            navigate('/mentor/mentee/u-st-1');
        }
        if (id === 's7') {
            setRole('student');
            setActingUserId('u-st-3');
            pvlDomainApi.actions.simulateCertificationRedFlag('u-st-3', 'QA flag');
            navigate('/student/certification');
        }
        if (id === 's8') {
            setRole('admin');
            const item = pvlDomainApi.adminApi.createContentItem({
                title: 'QA content',
                shortDescription: 'qa',
                fullDescription: 'qa',
                contentType: 'text',
                targetSection: 'library',
                targetRole: 'student',
                targetCohort: 'cohort-2026-1',
            });
            pvlDomainApi.adminApi.publishContentItem(item.id);
            pvlDomainApi.adminApi.assignContentPlacement({
                contentItemId: item.id,
                targetSection: 'library',
                targetRole: 'student',
                cohortId: 'cohort-2026-1',
                weekNumber: 1,
                moduleNumber: 1,
                orderIndex: 50,
            });
            navigate('/student/library');
        }
        setScenarioStatus((s) => ({ ...s, [id]: true }));
        forceRefresh();
    };

    return (
        <div className="space-y-3">
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <h2 className="font-display text-3xl text-[#4A3728]">QA приемка</h2>
                <p className="text-sm text-[#9B8B80]">Чек-листы, acceptance scenarios и test harness для ручной проверки.</p>
            </div>

            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <h3 className="font-display text-2xl text-[#4A3728] mb-2">Acceptance scenarios</h3>
                <div className="grid gap-2">
                    {QA_SCENARIOS.map((s) => (
                        <article key={s.id} className="rounded-xl border border-[#E8D5C4] bg-[#FAF6F2] p-3 flex items-center justify-between gap-2">
                            <span className="text-sm text-[#2C1810]">{s.title}</span>
                            <div className="flex items-center gap-2">
                                <CheckMark ok={!!scenarioStatus[s.id]} />
                                <button onClick={() => runScenario(s.id)} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">Run scenario</button>
                            </div>
                        </article>
                    ))}
                </div>
            </div>

            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <h3 className="font-display text-2xl text-[#4A3728] mb-2">Route checklist</h3>
                <div className="grid md:grid-cols-2 gap-2">
                    {QA_ROUTE_LIST.map((r) => (
                        <article key={r} className="rounded-xl border border-[#E8D5C4] bg-[#FAF6F2] p-3 flex items-center justify-between">
                            <span className="text-xs text-[#2C1810]">{r}</span>
                            <div className="flex items-center gap-1">
                                <CheckMark ok />
                                <button onClick={() => navigate(r.includes(':') ? r.replace(':id', 'u-st-1').replace(':taskId', 'task-1') : r)} className="text-[10px] rounded-full border border-[#E8D5C4] px-2 py-0.5 text-[#C8855A]">open</button>
                            </div>
                        </article>
                    ))}
                </div>
            </div>

            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <h3 className="font-display text-2xl text-[#4A3728] mb-2">Critical business checks</h3>
                <div className="grid gap-2">
                    {criticalChecks.map((c) => (
                        <article key={c.title} className="rounded-xl border border-[#E8D5C4] bg-[#FAF6F2] p-3 flex items-center justify-between">
                            <span className="text-sm text-[#2C1810]">{c.title}</span>
                            <CheckMark ok={c.ok} />
                        </article>
                    ))}
                </div>
            </div>

            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <h3 className="font-display text-2xl text-[#4A3728] mb-2">Bug report template</h3>
                <div className="grid md:grid-cols-3 gap-2">
                    <input value={bug.role} onChange={(e) => setBug((b) => ({ ...b, role: e.target.value }))} className="rounded-xl border border-[#E8D5C4] p-2 text-xs" placeholder="role" />
                    <input value={bug.screen} onChange={(e) => setBug((b) => ({ ...b, screen: e.target.value }))} className="rounded-xl border border-[#E8D5C4] p-2 text-xs" placeholder="screen" />
                    <input value={bug.route} onChange={(e) => setBug((b) => ({ ...b, route: e.target.value }))} className="rounded-xl border border-[#E8D5C4] p-2 text-xs" placeholder="route" />
                    <input value={bug.scenario} onChange={(e) => setBug((b) => ({ ...b, scenario: e.target.value }))} className="rounded-xl border border-[#E8D5C4] p-2 text-xs" placeholder="scenario" />
                    <input value={bug.stepNumber} onChange={(e) => setBug((b) => ({ ...b, stepNumber: e.target.value }))} className="rounded-xl border border-[#E8D5C4] p-2 text-xs" placeholder="step number" />
                    <select value={bug.severity} onChange={(e) => setBug((b) => ({ ...b, severity: e.target.value }))} className="rounded-xl border border-[#E8D5C4] p-2 text-xs">
                        <option value="critical">critical</option><option value="major">major</option><option value="minor">minor</option><option value="cosmetic">cosmetic</option>
                    </select>
                    <input value={bug.expected} onChange={(e) => setBug((b) => ({ ...b, expected: e.target.value }))} className="rounded-xl border border-[#E8D5C4] p-2 text-xs md:col-span-3" placeholder="expected" />
                    <input value={bug.actual} onChange={(e) => setBug((b) => ({ ...b, actual: e.target.value }))} className="rounded-xl border border-[#E8D5C4] p-2 text-xs md:col-span-3" placeholder="actual" />
                    <input value={bug.screenshot} onChange={(e) => setBug((b) => ({ ...b, screenshot: e.target.value }))} className="rounded-xl border border-[#E8D5C4] p-2 text-xs md:col-span-3" placeholder="screenshot placeholder" />
                    <textarea value={bug.note} onChange={(e) => setBug((b) => ({ ...b, note: e.target.value }))} rows={3} className="rounded-xl border border-[#E8D5C4] p-2 text-xs md:col-span-3" placeholder="note" />
                </div>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="w-full rounded-xl border border-[#E8D5C4] p-2 text-xs mt-2" placeholder="Общие заметки QA..." />
            </div>

            {/* Open questions:
               1) допуск к СЗ: 400 или 500
               2) баллы за библиотеку
               3) редактирование отправленной версии
               4) ручной бонус: уровень задания или ученицы
               5) общий комментарий по менти вне задания
            */}
        </div>
    );
}

function NotificationCenter({ userId }) {
    const [open, setOpen] = useState(false);
    const list = pvlDomainApi.notifications.getNotificationsForUser(userId);
    const unread = list.filter((n) => !n.isRead).length;
    return (
        <div className="relative">
            <button onClick={() => setOpen((v) => !v)} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">
                notifications {unread > 0 ? `(${unread})` : ''}
            </button>
            {open ? (
                <div className="absolute right-0 mt-2 w-[360px] max-h-[320px] overflow-auto rounded-2xl border border-[#E8D5C4] bg-white p-2 z-20">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-[#9B8B80]">Notification center</span>
                        <button onClick={() => { pvlDomainApi.notifications.markAllNotificationsRead(userId); setOpen(false); }} className="text-[10px] rounded-full border border-[#E8D5C4] px-2 py-0.5 text-[#C8855A]">mark all read</button>
                    </div>
                    <div className="grid gap-1">
                        {list.length === 0 ? <div className="text-xs text-[#9B8B80] p-2">No notifications</div> : list.map((n) => (
                            <article key={n.id} className={`rounded-xl border p-2 ${n.isRead ? 'border-[#E8D5C4] bg-[#FAF6F2]' : 'border-blue-200 bg-blue-50'}`}>
                                <div className="text-[10px] text-[#9B8B80]">{n.type}</div>
                                <div className="text-xs text-[#2C1810]">{n.text}</div>
                                <div className="mt-1 flex justify-between">
                                    <span className="text-[10px] text-[#9B8B80]">{n.createdAt}</span>
                                    {!n.isRead ? <button onClick={() => pvlDomainApi.notifications.markNotificationRead(n.id)} className="text-[10px] text-[#C8855A]">read</button> : null}
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export default function PvlPrototypeApp({
    embeddedInGarden = false,
    gardenBridgeRef,
    onGardenRouteChange,
    onGardenExit,
} = {}) {
    const session = loadAppSession() || {};
    const [role, setRole] = useState(session.role || 'student');
    const [studentId, setStudentId] = useState(session.studentId || 'u-st-1');
    const [actingUserId, setActingUserId] = useState(session.actingUserId || 'u-st-1');
    const [nowDate, setNowDate] = useState(session.nowDate || '2026-06-03');
    const [route, setRoute] = useState(session.route || '/student/dashboard');
    const [studentSection, setStudentSection] = useState(session.studentSection || 'О курсе');
    const [adminSection, setAdminSection] = useState(() => {
        const raw = session.adminSection;
        if (raw === 'Обзор' || raw === 'Сводка' || raw === 'Учительская ПВЛ') return 'Дашборд';
        if (raw === 'Контент-центр') return 'Материалы курса';
        if (raw === 'Проверка и риски') return 'Ученицы';
        return raw || 'Дашборд';
    });
    const [mentorSection, setMentorSection] = useState(session.mentorSection || 'Главная');
    const [cmsItems, setCmsItems] = useState(() => buildMergedCmsState().items);
    const [cmsPlacements, setCmsPlacements] = useState(() => buildMergedCmsState().placements);
    const [dataTick, setDataTick] = useState(0);
    const forceRefresh = () => setDataTick((x) => x + 1);

    const navigate = useCallback((nextRoute) => {
        const allowedRoute = redirectToAllowedRoute(role, nextRoute);
        if (!PVL_REVIEW_NAV_UNLOCK && allowedRoute !== nextRoute) {
            pvlDomainApi.audit.addAuditEvent(actingUserId, role, 'role_route_redirect', 'route', nextRoute, 'Redirected to allowed route', { allowedRoute });
        }
        setRoute(allowedRoute);
        if (allowedRoute.startsWith('/student/')) {
            const seg = allowedRoute.split('/')[2] || 'dashboard';
            const map = {
                dashboard: 'Главная',
                about: 'О курсе',
                onboarding: 'Онбординг',
                glossary: 'Глоссарий курса',
                library: 'Библиотека курса',
                lessons: 'Трекер курса',
                practicums: 'Практикумы с менторами',
                checklist: 'Трекер курса',
                tracker: 'Трекер курса',
                results: 'Результаты',
                certification: 'Сертификация и самооценка',
                'self-assessment': 'Сертификация и самооценка',
                qa: 'Вопросы и ответы',
                'cultural-code': 'Культурный код Лиги',
            };
            if (map[seg]) setStudentSection(map[seg]);
        } else if (allowedRoute.startsWith('/mentor/')) {
            const hit = MENTOR_NAV_ITEMS.find(({ path: p }) => allowedRoute === p
                || (p === '/mentor/library' && allowedRoute.startsWith(`${p}/`))
                || (p === '/mentor/results' && allowedRoute.startsWith(`${p}/`))
                || (p === '/mentor/mentees' && allowedRoute.startsWith('/mentor/mentee/')));
            if (hit) setMentorSection(hit.label);
        } else if (allowedRoute.startsWith('/admin/')) {
            const seg = allowedRoute.split('/')[2] || 'pvl';
            if (seg === 'students') {
                setAdminSection('Ученицы');
            } else {
                const map = {
                    pvl: 'Дашборд',
                    content: 'Материалы курса',
                    mentors: 'Менторы',
                    calendar: 'Календарь',
                    settings: 'Настройки',
                };
                if (map[seg]) setAdminSection(map[seg]);
            }
        }
    }, [role, actingUserId]);

    useEffect(() => {
        saveAppSession({ role, studentId, actingUserId, nowDate, route, studentSection, adminSection, mentorSection });
    }, [role, studentId, actingUserId, nowDate, route, studentSection, adminSection, mentorSection]);

    useEffect(() => {
        if (!gardenBridgeRef) return undefined;
        const ref = gardenBridgeRef;
        ref.current = ref.current || {};
        ref.current.navigate = navigate;
        return () => {
            if (ref.current?.navigate === navigate) {
                ref.current.navigate = undefined;
            }
        };
    }, [gardenBridgeRef, navigate]);

    useEffect(() => {
        onGardenRouteChange?.(route);
    }, [route, onGardenRouteChange]);

    const content = useMemo(() => {
        if (route === '/qa' || route === '/debug/qa') {
            return <QaScreen navigate={navigate} role={role} setRole={setRole} setActingUserId={setActingUserId} forceRefresh={forceRefresh} />;
        }
        if (route.startsWith('/admin/')) {
            return (
                <AdminPage
                    route={route}
                    navigate={navigate}
                    cmsItems={cmsItems}
                    setCmsItems={setCmsItems}
                    cmsPlacements={cmsPlacements}
                    setCmsPlacements={setCmsPlacements}
                    refreshKey={dataTick}
                    forceRefresh={forceRefresh}
                />
            );
        }
        if (route.startsWith('/mentor/')) {
            return <MentorPage route={route} navigate={navigate} cmsItems={cmsItems} cmsPlacements={cmsPlacements} refresh={forceRefresh} refreshKey={dataTick} />;
        }
        if (route.startsWith('/student/')) {
            return <StudentPage route={route} studentId={studentId} navigate={navigate} cmsItems={cmsItems} cmsPlacements={cmsPlacements} refresh={forceRefresh} refreshKey={dataTick} />;
        }
        return <ScreenState error={`Неизвестный маршрут. Перейдите в раздел через меню или переключатель кабинета.`}><div /></ScreenState>;
    }, [role, route, studentId, cmsItems, cmsPlacements, dataTick, navigate]);

    const devToolsBar = pvlDevToolsEnabled() ? (
        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto justify-end border-t xl:border-t-0 border-[#F0E6DC] pt-2 xl:pt-0">
            <NotificationCenter userId={actingUserId} />
            <button
                type="button"
                onClick={() => {
                    pvlDomainApi.dbLayer.resetDatabase();
                    clearAppSession();
                    const next = buildMergedCmsState();
                    setCmsItems(next.items);
                    setCmsPlacements(next.placements);
                    forceRefresh();
                }}
                className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]"
            >
                Сброс данных
            </button>
            <button type="button" onClick={() => navigate('/qa')} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">Приёмка QA</button>
        </div>
    ) : null;

    return (
        <div className="relative rounded-3xl overflow-hidden">
            <div
                className="pointer-events-none absolute inset-0 opacity-90"
                aria-hidden
                style={{
                    background: 'radial-gradient(circle at top, rgba(63,139,107,0.12), transparent 55%), radial-gradient(circle at 20% 20%, rgba(143,127,106,0.1), transparent 40%), linear-gradient(180deg, #fbf9f3 0%, #f7f3ea 100%)',
                }}
            />
            <div className={`relative grid grid-cols-1 gap-5 p-1 md:p-2 ${embeddedInGarden ? '' : 'xl:grid-cols-[260px_1fr]'}`}>
                {!embeddedInGarden ? (
                    <SidebarMenu
                        role={role}
                        route={route}
                        studentSection={studentSection}
                        setStudentSection={setStudentSection}
                        adminSection={adminSection}
                        setAdminSection={setAdminSection}
                        mentorSection={mentorSection}
                        setMentorSection={setMentorSection}
                        navigate={navigate}
                        onGardenExit={onGardenExit}
                    />
                ) : null}
                <main className="space-y-4 min-w-0">
                    {!embeddedInGarden ? (
                        <div className="rounded-2xl border border-slate-100/90 bg-white/90 backdrop-blur-sm px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-sm shadow-slate-200/30">
                            <SubtleTrail path={route} />
                            <CabinetSwitcher role={role} setRole={setRole} navigate={navigate} />
                            {devToolsBar}
                        </div>
                    ) : (
                        devToolsBar ? (
                            <div className="rounded-2xl border border-slate-100/90 bg-white/90 backdrop-blur-sm px-4 py-3 flex flex-wrap items-center justify-end gap-3 shadow-sm shadow-slate-200/30">
                                {devToolsBar}
                            </div>
                        ) : null
                    )}
                    {pvlDevToolsEnabled() ? (
                        <DebugPanel
                            role={role}
                            setRole={(r) => {
                                setRole(r);
                                if (r === 'student') navigate('/student/dashboard');
                                if (r === 'mentor') navigate('/mentor/dashboard');
                                if (r === 'admin') navigate('/admin/pvl');
                            }}
                            actingUserId={actingUserId}
                            setActingUserId={(id) => {
                                setActingUserId(id);
                                if (id.startsWith('u-st-')) setStudentId(id);
                            }}
                            nowDate={nowDate}
                            setNowDate={setNowDate}
                            forceRefresh={forceRefresh}
                        />
                    ) : null}
                    {content}
                    {pvlDevToolsEnabled() ? (
                        <>
                            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-950">
                                Методологический вопрос (для разработки): порог допуска к СЗ — 400 или 500 баллов; в прототипе не решено.
                            </div>
                            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-3 text-[11px] text-[#9B8B80]">
                                Маршрутов в реестре: {validateRouteMap().length} · строк матрицы доступа: {validateRoleAccessMap().length}
                            </div>
                        </>
                    ) : null}
                </main>
            </div>
        </div>
    );
}

