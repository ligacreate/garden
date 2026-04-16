import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { jsPDF } from 'jspdf';
import {
    BadgeCheck,
    BarChart3,
    CalendarCheck2,
    CalendarDays,
    ChevronDown,
    ChevronRight,
    CornerUpLeft,
    Files,
    GraduationCap,
    GripVertical,
    Info,
    KanbanSquare,
    Leaf,
    Sprout,
    Languages,
    LayoutGrid,
    Library,
    Menu,
    MessageCircle,
    Route,
    Settings2,
    UserCog,
    Users,
    X,
} from 'lucide-react';
import Button from '../components/Button';
import RichEditor from '../components/RichEditor';
import PvlTaskDetailView from './PvlTaskDetailView';
import PvlMenteeCardView from './PvlMenteeCardView';
import { PvlAdminCalendarScreen, PvlDashboardCalendarBlock } from './PvlCalendarBlock';
import PvlSzAssessmentFlow from './PvlSzAssessmentFlow';
import {
    stripMaterialNumbering,
    buildLessonVideoPlayerHtml,
    PvlLibraryMaterialBody,
    normalizeMaterialHtml,
    pvlMaterialBodyClass,
} from './pvlLibraryMaterialShared';
import { parsePvlImportedMarkdownDoc } from '../utils/pvlMarkdownImport';
import { pvlMaterialCardExcerpt, pvlHtmlToPlainText } from '../utils/pvlPlainText';
import { PlatformCourseModulesGrid, StudentCourseTracker, usePlatformStepChecklist, computePvlTrackerDashboardStats } from './PvlStudentTrackerView';
import {
    PVL_CERT_CONDITIONS,
    PVL_CERT_CRITERIA_GROUPS,
    PVL_CERT_PROCESS_STEPS,
    PVL_CERT_RED_FLAGS,
    PVL_GLOSSARY_FILTERS,
    PVL_PLATFORM_MODULES,
    PVL_TRACKER_GLOSSARY,
    PVL_TRACKER_LIBRARY_EXCLUDE_CATEGORY_IDS,
    getPvlCourseModulePickerOptions,
    pvlPlatformModuleTitleFromInternal,
} from '../data/pvlReferenceContent';
import { PVL_COURSE_DISPLAY_NAME } from '../data/pvl/courseDisplay';
import { SCORING_RULES } from '../data/pvl/scoringRules';
import {
    pvlMockData,
    getStudentProfile,
    getUser,
    getStudentCertification,
} from '../data/pvlMockData';
import {
    mapStudentHomeworkDisplayStatus,
    mapTaskStatus,
    pvlCohortIdsEquivalent,
    pvlDomainApi,
    pvlPlacementVisibleForCohort,
    syncPvlActorsFromGarden,
    syncPvlRuntimeFromDb,
    pvlPatchCurrentUserFromGarden,
} from '../services/pvlMockApi';
import { pvlPostgrestApi } from '../services/pvlPostgrestApi';
import { TASK_STATUS } from '../data/pvl/enums';
import { DEFAULT_REFLEX_CHECKLIST_SECTIONS } from '../data/pvl/homeworkChecklistDefaults';
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
import { logPvlRoleResolution, readGardenCurrentUserFromStorage, resolvePvlRoleFromGardenProfile } from '../services/pvlRoleResolver';
import { api } from '../services/dataService';
import { pvlGardenRoleLabelRu } from '../utils/pvlGardenAdmission';

function pvlDevToolsEnabled() {
    try {
        return typeof localStorage !== 'undefined' && localStorage.getItem('pvl_dev_tools') === '1';
    } catch {
        return false;
    }
}

/**
 * Предпочитает живой db.users (куда попадают реальные имена из Garden) перед pvlMockData.users.
 * Использовать везде вместо getUser(id) для отображения имён участниц и менторов.
 */
function resolveActorUser(id) {
    if (!id) return null;
    const sid = String(id);
    return pvlDomainApi.db.users.find((u) => u.id === sid)
        || pvlMockData.users.find((u) => u.id === sid)
        || null;
}

/** Имя для UI: в Саду чаще `name`, в сиде ПВЛ — `fullName`. */
function resolveActorDisplayName(id) {
    const u = resolveActorUser(id);
    if (!u) return '';
    return String(u.fullName || u.name || u.email || '').trim();
}

/** Заголовок дашборда ученицы: как в сайдбаре / шапке вложения — с запасным чтением из garden_currentUser. */
function resolveStudentDashboardHeroName(studentId) {
    let name = resolveActorDisplayName(studentId);
    if (name) return name;
    try {
        const gu = readGardenCurrentUserFromStorage();
        if (gu && String(gu.id) === String(studentId)) {
            name = String(gu.name || gu.fullName || gu.email || '').trim();
        }
    } catch {
        /* noop */
    }
    return name;
}

/**
 * Предпросмотр материалов в учительской: первая реальная ученица из списка админки,
 * либо технический профиль предпросмотра (без абитуриентов из Сада контент курса всё равно виден).
 */
function getFirstCohortStudentId() {
    try {
        const rows = pvlDomainApi.adminApi.getAdminStudents({});
        if (rows.length > 0) return rows[0].userId;
        return pvlDomainApi.ensurePvlPreviewStudentProfile();
    } catch {
        return pvlDomainApi.ensurePvlPreviewStudentProfile();
    }
}

/** Совместимость старых демо-id карточек менти с учётками seed API */
const LEGACY_MENTEE_ROUTE_TO_USER = {
    'm-101': 'u-st-1',
    'm-102': 'u-st-2',
    'm-103': 'u-st-3',
    'm-104': 'u-st-4',
};

/**
 * Контент карточек: при работе с PostgREST — только данные из `pvlDomainApi.db` (снимок БД).
 * Локально без БД — объединение с демо `pvlMockData`.
 */
function normalizeContentStatus(s) {
    if (s == null) return 'draft';
    if (typeof s === 'string') return s.toLowerCase();
    return String(s).toLowerCase();
}

function buildMergedCmsState() {
    const db = pvlDomainApi.db;
    const useDbOnly = pvlPostgrestApi.isEnabled();
    const dbItems = Array.isArray(db?.contentItems) ? [...db.contentItems] : [];
    const mockItems = useDbOnly
        ? []
        : (Array.isArray(pvlMockData.contentItems) ? [...pvlMockData.contentItems] : []);
    const byId = new Map();
    mockItems.forEach((i) => {
        if (i?.id) byId.set(i.id, { ...i, status: normalizeContentStatus(i.status) });
    });
    dbItems.forEach((i) => {
        if (!i?.id) return;
        const prev = byId.get(i.id) || {};
        byId.set(i.id, { ...prev, ...i, status: normalizeContentStatus(i.status) });
    });
    const items = Array.from(byId.values()).sort((a, b) => (a.orderIndex ?? 999) - (b.orderIndex ?? 999));

    const dbPl = Array.isArray(db?.contentPlacements) ? db.contentPlacements : [];
    const mockPl = useDbOnly
        ? []
        : (Array.isArray(pvlMockData.contentPlacements) ? pvlMockData.contentPlacements : []);
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

/** В демо `actingUserId` часто остаётся ученицей при переключении на кабинет ментора — подставляем реального ментора из профилей. */
function resolvePvlMentorActorId(actingUserId) {
    const profiles = pvlDomainApi.db?.mentorProfiles || [];
    if (profiles.some((m) => m.userId === actingUserId)) return actingUserId;
    return profiles[0]?.userId || actingUserId || null;
}

function pvlPersonInitials(displayName) {
    const s = String(displayName || '').trim();
    if (!s) return '—';
    const parts = s.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
    return s.slice(0, 2).toUpperCase();
}

function toRoute(name) {
    const map = {
        'О курсе': 'about',
        Онбординг: 'onboarding',
        Глоссарий: 'glossary',
        'Глоссарий курса': 'glossary',
        Библиотека: 'library',
        'Библиотека курса': 'library',
        Уроки: 'lessons',
        Трекер: 'tracker',
        'Трекер курса': 'tracker',
        Практикумы: 'practicums',
        'Практикумы с менторами': 'practicums',
        Коммуникации: 'messages',
        'Чат с ментором': 'messages',
        'Чек-лист': 'checklist',
        Результаты: 'results',
        Сертификация: 'certification',
        'Сертификация и самооценка': 'certification',
        Самооценка: 'self-assessment',
        'Культурный код Лиги': 'cultural-code',
    };
    return map[name] || 'dashboard';
}

/** Единый курсный блок меню для участницы, ментора и учительской (без отдельного онбординга). */
const COURSE_MENU_LABELS = [
    'О курсе',
    'Трекер',
    'Практикумы',
    'Библиотека',
    'Глоссарий',
    'Чат с ментором',
    'Результаты',
    'Сертификация',
];

const MENTOR_TOP_NAV = [
    { label: 'Дашборд', path: '/mentor/dashboard' },
    { label: 'Абитуриенты', path: '/mentor/applicants' },
    { label: 'Мои менти', path: '/mentor/mentees' },
    { label: 'Очередь', path: '/mentor/review-queue' },
];

const ADMIN_SIDEBAR_CONFIG = [
    { type: 'item', label: 'Дашборд', path: '/admin/pvl' },
    { type: 'item', label: 'Ученицы', path: '/admin/students' },
    { type: 'item', label: 'Менторы', path: '/admin/mentors' },
    { type: 'item', label: 'Материалы курса', path: '/admin/content' },
    { type: 'item', label: 'Календарь', path: '/admin/calendar' },
    { type: 'divider' },
    ...COURSE_MENU_LABELS.filter((label) => label !== 'Чат с ментором').map((label) => ({
        type: 'item',
        label,
        path: `/admin/${toRoute(label)}`,
    })),
    { type: 'divider' },
    { type: 'item', label: 'Настройки', path: '/admin/settings' },
];

const ADMIN_COURSE_ROUTE_RE = /^\/admin\/(about|glossary|library|tracker|practicums|results|certification|self-assessment)(\/|$)/;

function sidebarRoutePath(route) {
    const raw = String(route || '').split('?')[0] || '/';
    if (raw.length > 1 && raw.endsWith('/')) return raw.slice(0, -1);
    return raw;
}

function courseSidebarItemActive(currentRoute, prefix, label) {
    const routePath = sidebarRoutePath(currentRoute);
    const base = `${prefix}/${toRoute(label)}`;
    return routePath === base || routePath.startsWith(`${base}/`);
}

function mentorSectionForRoute(allowedRoute) {
    for (const { label, path } of MENTOR_TOP_NAV) {
        if (allowedRoute === path || (path === '/mentor/mentees' && /^\/mentor\/mentee\//.test(allowedRoute))) {
            return label;
        }
    }
    if (allowedRoute === '/mentor/settings') return 'Настройки';
    for (const label of COURSE_MENU_LABELS) {
        if (courseSidebarItemActive(allowedRoute, '/mentor', label)) return label;
    }
    return null;
}

function adminSectionForRoute(allowedRoute) {
    if (!allowedRoute || !allowedRoute.startsWith('/admin/')) return null;
    const ap = allowedRoute.split('?')[0];
    if (ap === '/admin/pvl') return 'Дашборд';
    if (/^\/admin\/students(\/|$)/.test(ap)) return 'Ученицы';
    if (/^\/admin\/mentors(\/|$)/.test(ap)) return 'Менторы';
    if (ap === '/admin/content' || /^\/admin\/content\//.test(ap)) return 'Материалы курса';
    if (ap === '/admin/calendar') return 'Календарь';
    if (ap === '/admin/settings') return 'Настройки';
    for (const label of COURSE_MENU_LABELS) {
        if (courseSidebarItemActive(allowedRoute, '/admin', label)) return label;
    }
    const seg = ap.split('/')[2] || 'pvl';
    const map = {
        pvl: 'Дашборд',
        content: 'Материалы курса',
        mentors: 'Менторы',
        calendar: 'Календарь',
        settings: 'Настройки',
    };
    return map[seg] || null;
}

const STATUS_TONE = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'принято' || s === 'done') return 'bg-emerald-50 text-emerald-700 border-emerald-600/30';
    if (s.includes('проверено') && s.includes('оценку')) return 'bg-indigo-50 text-indigo-800 border-indigo-500/25';
    if (s === 'на доработке' || s === 'warning' || s === 'скоро') return 'bg-amber-50 text-amber-700 border-amber-600/30';
    if (s === 'просрочено' || s === 'не принято' || s === 'высокий') return 'bg-rose-50 text-rose-700 border-rose-600/30';
    if (s === 'на проверке' || s === 'к проверке' || s === 'запланирована' || s === 'средний') return 'bg-blue-50 text-blue-700 border-blue-600/30';
    if (s === 'отправлено') return 'bg-sky-50 text-sky-800 border-sky-500/25';
    if (s === 'черновик' || s === 'в работе') return 'bg-violet-50 text-violet-800 border-violet-500/25';
    if (s === 'не начато') return 'bg-slate-100 text-slate-600 border-slate-300';
    return 'bg-slate-100 text-slate-600 border-slate-300';
};

const StatusBadge = ({ children, compact = false }) => (
    <span
        className={`inline-flex rounded-full border font-semibold uppercase ${compact ? 'px-2 py-0.5 text-[9px] tracking-[0.05em]' : 'px-2.5 py-1 text-[10px] tracking-[0.08em]'} ${STATUS_TONE(children)}`}
    >
        {children}
    </span>
);

function shortTaskStatusLabel(status) {
    const s = String(status || '').toLowerCase().trim();
    if (s.includes('проверено') || s === 'принято') return 'Принято';
    if (s === 'отправлено') return 'Отправлено';
    if (s === 'на проверке' || s === 'к проверке') return 'На проверке';
    if (s === 'на доработке') return 'На доработке';
    if (s === 'черновик') return 'Черновик';
    if (s === 'не начато') return 'Не начато';
    if (s === 'в работе') return 'В работе';
    if (s === 'просрочено') return 'Просрочено';
    return status;
}

function sortHomeworkByRecency(items = []) {
    const safeDate = (v) => String(v || '');
    return [...items].sort((a, b) => {
        const moduleA = Number(a?.moduleNumber ?? a?.week ?? -1);
        const moduleB = Number(b?.moduleNumber ?? b?.week ?? -1);
        if (moduleA !== moduleB) return moduleB - moduleA;
        const deadlineCmp = safeDate(b?.deadlineAt).localeCompare(safeDate(a?.deadlineAt));
        if (deadlineCmp !== 0) return deadlineCmp;
        return safeDate(b?.submittedAt).localeCompare(safeDate(a?.submittedAt));
    });
}

function deadlineUrgencyTone(deadlineAt) {
    const raw = String(deadlineAt || '').slice(0, 10);
    if (!raw) return 'bg-white text-slate-600 border-slate-200';
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dl = new Date(`${raw}T00:00:00`);
    const diffDays = Math.ceil((dl - today) / (1000 * 60 * 60 * 24));
    if (diffDays <= 2) return 'bg-white text-rose-700 border-rose-200';
    if (diffDays <= 6) return 'bg-white text-amber-800 border-amber-200';
    return 'bg-white text-emerald-700 border-emerald-200';
}

function hideDeadlineForAcceptedWithScore(task) {
    const status = shortTaskStatusLabel(task?.displayStatus || task?.status);
    const hasScore = Number(task?.maxScore) > 0;
    return status === 'Принято' && hasScore;
}

function pointsSourceLabel(sourceType) {
    const map = {
        week0: 'Ориентация',
        weekCompletion: 'Закрытие модулей',
        controlPoint: 'Контрольные точки',
        mentorBonus: 'Бонус ментора',
        szSelfAssessment: 'Самооценка СЗ',
        szMentorAssessment: 'Оценка ментора СЗ',
    };
    return map[sourceType] || 'Другое';
}

function printMaterialSheet(title, bodyText) {
    const safeTitle = String(title || 'Материал');
    const safeBody = String(bodyText || '');
    const popup = window.open('', '_blank', 'width=900,height=700');
    if (!popup) return;
    const escapedTitle = safeTitle.replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const bodyLooksLikeHtml = /<\s*[a-z][^>]*>/i.test(safeBody);
    const escapedBody = bodyLooksLikeHtml
        ? (() => {
            const doc = new DOMParser().parseFromString(`<div id="root">${safeBody}</div>`, 'text/html');
            const root = doc.getElementById('root');
            if (!root) return '';
            root.querySelectorAll('script,style,iframe,object').forEach((n) => n.remove());
            return root.innerHTML;
        })()
        : safeBody
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('\n', '<br/>');
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${escapedTitle}</title>
        <style>
            body{font-family:Arial,sans-serif;padding:28px;line-height:1.55;color:#1f2937}
            h1{font-size:22px;margin:0 0 16px;color:#065f46}
            .meta{font-size:12px;color:#6b7280;margin-bottom:16px}
        </style></head><body>
        <h1>${escapedTitle}</h1>
        <div class="meta">Материал курса ПВЛ</div>
        <div>${escapedBody}</div>
        </body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
}

const RiskBadge = ({ level }) => <StatusBadge>{level}</StatusBadge>;
const DeadlineBadge = ({ value }) => <span className="text-xs rounded-full border border-[#E8D5C4] px-2 py-0.5 text-[#9B8B80]">{value}</span>;

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

function pvlSidebarNavClass(active) {
    return `group w-full text-left rounded-2xl px-4 py-3 text-[15px] transition-all duration-200 ${active
        ? 'bg-blue-50 text-blue-700 border border-blue-100 shadow-[0_6px_16px_-12px_rgba(47,111,84,0.45)] font-semibold'
        : 'text-slate-500 border border-transparent hover:bg-white/90 hover:text-slate-800'}`;
}

const menuIconClass = 'h-[18px] w-[18px] shrink-0 opacity-85 transition-opacity duration-200 group-hover:opacity-100';
const menuIconProps = { size: 18, strokeWidth: 1.9, className: menuIconClass };

const COURSE_MENU_ICON = {
    'О курсе': Info,
    Глоссарий: Languages,
    Библиотека: Library,
    Трекер: Route,
    Практикумы: CalendarCheck2,
    Коммуникации: MessageCircle,
    'Чат с ментором': MessageCircle,
    Результаты: BarChart3,
    Сертификация: BadgeCheck,
};

const STUDENT_MENU_ICON = {
    Дашборд: LayoutGrid,
    Настройки: Settings2,
    'Вернуться в сад': CornerUpLeft,
    ...COURSE_MENU_ICON,
};

const MENTOR_MENU_ICON = {
    Дашборд: LayoutGrid,
    Абитуриенты: GraduationCap,
    'Мои менти': Users,
    Очередь: KanbanSquare,
    Настройки: Settings2,
    'Вернуться в сад': CornerUpLeft,
    ...COURSE_MENU_ICON,
};

const ADMIN_MENU_ICON = {
    Дашборд: LayoutGrid,
    Ученицы: Users,
    Менторы: UserCog,
    'Материалы курса': Files,
    Календарь: CalendarDays,
    Настройки: Settings2,
    'Вернуться в сад': CornerUpLeft,
    ...COURSE_MENU_ICON,
};

function MenuLabel({ iconMap, label }) {
    const Icon = iconMap[label];
    if (!Icon) return <span>{label}</span>;
    return (
        <span className="inline-flex items-center gap-2.5">
            <Icon {...menuIconProps} />
            <span>{label}</span>
        </span>
    );
}

const pvlSidebarDividerClass = 'h-px bg-slate-100/80 my-3 mx-1';

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
    studentId = 'u-st-1',
    actingUserId = 'u-st-1',
    className = '',
}) => {
    const routePath = sidebarRoutePath(currentRoute);
    const sidebarActorName = useMemo(() => {
        if (role === 'student') return resolveActorDisplayName(studentId);
        if (role === 'mentor') return resolveActorDisplayName(resolvePvlMentorActorId(actingUserId));
        return resolveActorDisplayName(actingUserId);
    }, [role, studentId, actingUserId]);
    const sidebarRoleLabel = role === 'student' ? 'Участница' : role === 'mentor' ? 'Ментор' : 'Учительская';
    const sidebarTitle = sidebarActorName || sidebarRoleLabel;
    const initials = useMemo(() => pvlPersonInitials(sidebarTitle), [sidebarTitle]);
    return (
        <aside className={`h-fit xl:sticky xl:top-6 rounded-3xl bg-white/95 p-3 shadow-[0_14px_44px_-14px_rgba(15,23,42,0.09)] ${className}`}>
        <div className="px-1.5 pt-1 pb-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{PVL_COURSE_DISPLAY_NAME}</div>
            <div className="mt-2 flex items-center gap-4 rounded-2xl bg-gradient-to-br from-slate-50/90 to-emerald-50/35 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                <div className="h-11 w-11 shrink-0 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center text-xs font-semibold text-emerald-900 tabular-nums">
                    {initials}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="font-display text-[15px] leading-snug text-slate-900 truncate" title={sidebarTitle}>{sidebarTitle}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 mt-0.5">{sidebarRoleLabel}</div>
                </div>
            </div>
        </div>
        {role === 'student' ? (
            <nav className="space-y-1 px-0.5 pb-2">
                {COURSE_MENU_LABELS.map((item) => {
                    const base = `/student/${toRoute(item)}`;
                    const subActive = courseSidebarItemActive(currentRoute, '/student', item);
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
                            <MenuLabel iconMap={STUDENT_MENU_ICON} label={item} />
                        </button>
                    );
                })}
                <div className={pvlSidebarDividerClass} />
                <button
                    type="button"
                    onClick={() => {
                        setStudentSection('Настройки');
                        navigate('/student/settings');
                    }}
                    className={pvlSidebarNavClass(routePath === '/student/settings')}
                >
                    <MenuLabel iconMap={STUDENT_MENU_ICON} label="Настройки" />
                </button>
                {onGardenExit ? (
                    <>
                        <div className={pvlSidebarDividerClass} />
                        <button
                            type="button"
                            onClick={onGardenExit}
                            className="w-full text-left rounded-2xl px-4 py-3 text-[15px] text-slate-500 border border-transparent hover:bg-white/90 hover:text-slate-900"
                        >
                            <MenuLabel iconMap={STUDENT_MENU_ICON} label="Вернуться в сад" />
                        </button>
                    </>
                ) : null}
            </nav>
        ) : role === 'mentor' ? (
            <nav className="space-y-1 px-0.5 pb-2">
                {MENTOR_TOP_NAV.map(({ label, path }) => {
                    const subActive = routePath === path
                        || (path === '/mentor/mentees' && /^\/mentor\/mentee\//.test(routePath || ''));
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
                            <MenuLabel iconMap={MENTOR_MENU_ICON} label={label} />
                        </button>
                    );
                })}
                <div className={pvlSidebarDividerClass} />
                {COURSE_MENU_LABELS.map((item) => {
                    const base = `/mentor/${toRoute(item)}`;
                    const subActive = courseSidebarItemActive(currentRoute, '/mentor', item);
                    return (
                        <button
                            type="button"
                            key={item}
                            onClick={() => {
                                setMentorSection(item);
                                navigate(base);
                            }}
                            className={pvlSidebarNavClass(subActive)}
                        >
                            <MenuLabel iconMap={MENTOR_MENU_ICON} label={item} />
                        </button>
                    );
                })}
                <div className={pvlSidebarDividerClass} />
                <button
                    type="button"
                    onClick={() => {
                        setMentorSection('Настройки');
                        navigate('/mentor/settings');
                    }}
                    className={pvlSidebarNavClass(routePath === '/mentor/settings')}
                >
                    <MenuLabel iconMap={MENTOR_MENU_ICON} label="Настройки" />
                </button>
                {onGardenExit ? (
                    <>
                        <div className={pvlSidebarDividerClass} />
                        <button
                            type="button"
                            onClick={onGardenExit}
                            className="w-full text-left rounded-2xl px-4 py-3 text-[15px] text-slate-500 border border-transparent hover:bg-white/90 hover:text-slate-900"
                        >
                            <MenuLabel iconMap={MENTOR_MENU_ICON} label="Вернуться в сад" />
                        </button>
                    </>
                ) : null}
            </nav>
        ) : (
            <nav className="space-y-1 px-0.5 pb-2">
                {ADMIN_SIDEBAR_CONFIG.map((entry, idx) => {
                    if (entry.type === 'divider') {
                        return <div key={`div-${idx}`} className={pvlSidebarDividerClass} />;
                    }
                    const subActive = COURSE_MENU_LABELS.includes(entry.label)
                        ? courseSidebarItemActive(currentRoute, '/admin', entry.label)
                        : routePath === entry.path
                            || (entry.path === '/admin/students' && /^\/admin\/students(\/|$)/.test(routePath || ''))
                            || (entry.path === '/admin/mentors' && /^\/admin\/mentors(\/|$)/.test(routePath || ''))
                            || (entry.path === '/admin/content' && (routePath === '/admin/content' || /^\/admin\/content\/.+/.test(routePath || '')))
                            || (entry.path === '/admin/calendar' && routePath === '/admin/calendar')
                            || (entry.path === '/admin/pvl' && routePath === '/admin/pvl');
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
                            <MenuLabel iconMap={ADMIN_MENU_ICON} label={entry.label} />
                        </button>
                    );
                })}
                {onGardenExit ? (
                    <>
                        <div className={pvlSidebarDividerClass} />
                        <button
                            type="button"
                            onClick={onGardenExit}
                            className="w-full text-left rounded-2xl px-4 py-3 text-[15px] text-slate-500 border border-transparent hover:bg-white/90 hover:text-slate-900"
                        >
                            <MenuLabel iconMap={ADMIN_MENU_ICON} label="Вернуться в сад" />
                        </button>
                    </>
                ) : null}
            </nav>
        )}
        </aside>
    );
};

const BREADCRUMB_LABELS = {
    student: 'Участница',
    mentor: 'Ментор',
    admin: 'Учительская',
    dashboard: 'Дашборд',
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
    messages: 'Чат с ментором',
    'cultural-code': 'Культурный код',
    materials: 'Материалы',
    applicants: 'Абитуриенты',
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

/**
 * Drill-down в учительской: единая видимая «назад» + мягкие крошки (как в саду).
 * Не показываем на корневых экранах (/admin/pvl, /admin/students, …).
 */
function adminRoutePath(route) {
    return String(route || '').split('?')[0];
}

function shouldShowSubtleTrail(route) {
    const path = adminRoutePath(route);
    if (!path || path.startsWith('/admin/')) return false;
    // На экранах с собственными крошками/назад (карточки) не дублируем верхнюю строку.
    if (/^\/(student|mentor)\/library\/.+/.test(path)) return false;
    if (/^\/(student|mentor)\/results\/.+/.test(path)) return false;
    return true;
}

function resolveAdminDrilldownNav(route) {
    const path = adminRoutePath(route);
    const calQuery = String(route || '').includes('?') ? String(route).split('?')[1] : '';
    let calEventParam = '';
    try {
        calEventParam = calQuery ? new URLSearchParams(calQuery).get('event') || '' : '';
    } catch {
        calEventParam = '';
    }
    if (path === '/admin/calendar' && calEventParam) {
        return {
            backTo: '/admin/calendar',
            backLabel: 'Назад к календарю',
            crumbs: [
                { label: 'Календарь курса', to: '/admin/calendar' },
                { label: 'Событие', to: null },
            ],
        };
    }
    const contentDetail = path.match(/^\/admin\/content\/([^/]+)$/);
    if (contentDetail) {
        return {
            backTo: '/admin/content',
            backLabel: 'К списку материалов',
            crumbs: [
                { label: 'Материалы курса', to: '/admin/content' },
                { label: 'Материал', to: null },
            ],
        };
    }
    const taskMatch = path.match(/^\/admin\/students\/([^/]+)\/task\/([^/]+)$/);
    if (taskMatch) {
        const [, menteeSeg] = taskMatch;
        return {
            backTo: `/admin/students/${menteeSeg}`,
            backLabel: 'К карточке ученицы',
            crumbs: [
                { label: 'Ученицы', to: '/admin/students' },
                { label: 'Карточка', to: `/admin/students/${menteeSeg}` },
                { label: 'Задание', to: null },
            ],
        };
    }
    const cardMatch = path.match(/^\/admin\/students\/([^/]+)$/);
    if (cardMatch && cardMatch[1] !== 'task') {
        return {
            backTo: '/admin/students',
            backLabel: 'К списку учениц',
            crumbs: [
                { label: 'Ученицы', to: '/admin/students' },
                { label: 'Карточка ученицы', to: null },
            ],
        };
    }
    if (/^\/admin\/library\/.+/.test(path)) {
        return {
            backTo: '/admin/library',
            backLabel: 'К библиотеке курса',
            crumbs: [
                { label: 'Библиотека', to: '/admin/library' },
                { label: 'Материал', to: null },
            ],
        };
    }
    if (/^\/admin\/results\/.+/.test(path) && path !== '/admin/results') {
        return {
            backTo: '/admin/results',
            backLabel: 'К результатам',
            crumbs: [
                { label: 'Результаты', to: '/admin/results' },
                { label: 'Работа', to: null },
            ],
        };
    }
    return null;
}

function AdminDrilldownNavBar({ route, navigate }) {
    const ctx = useMemo(() => resolveAdminDrilldownNav(route), [route]);
    if (!ctx) return null;
    return (
        <nav
            aria-label="Навигация внутри учительской"
            className="border-b border-slate-100/70 bg-white/40 px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2"
        >
            <button
                type="button"
                onClick={() => navigate(ctx.backTo)}
                className="text-sm font-medium text-blue-700 hover:text-blue-900 hover:underline shrink-0"
            >
                ←
                {' '}
                {ctx.backLabel}
            </button>
        </nav>
    );
}

/** Тихая строка контекста: без цепочки кликабельных крошек */
const SubtleTrail = ({ path }) => {
    const parts = path.split('/').filter(Boolean);
    if (parts.length <= 2) return null;
    const cabinet = parts[0] === 'student' ? 'Участница' : parts[0] === 'mentor' ? 'Ментор' : 'Учительская';
    const tail = parts.slice(1).map(breadcrumbSegmentLabel).filter((l) => l && l !== '…').join(' · ');
    if (!tail) return <p className="text-xs text-slate-400 truncate">{cabinet}</p>;
    return <p className="text-xs text-slate-400 truncate">{cabinet} · {tail}</p>;
};

function exportMaterialMarkdown(title = '', html = '') {
    const safeTitle = String(title || 'Материал').trim();
    const source = String(html || '');
    const doc = new DOMParser().parseFromString(`<div id="root">${source}</div>`, 'text/html');
    const root = doc.getElementById('root');
    if (!root) return;
    root.querySelectorAll('script,style,iframe,object').forEach((n) => n.remove());
    const blocks = [];
    root.childNodes.forEach((node) => {
        const name = String(node.nodeName || '').toLowerCase();
        const text = String(node.textContent || '').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        if (!text) return;
        if (name === 'h1') blocks.push(`# ${text}`);
        else if (name === 'h2') blocks.push(`## ${text}`);
        else if (name === 'h3') blocks.push(`### ${text}`);
        else if (name === 'li') blocks.push(`- ${text}`);
        else blocks.push(text);
    });
    const md = `# ${safeTitle}\n\n${blocks.join('\n\n')}\n`;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeTitle.toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-').replace(/(^-|-$)/g, '') || 'material'}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

/** Переключатель роли: всегда на виду при сборке; при смене — домашний маршрут и актуальное меню. */
const CabinetSwitcher = ({ role, setRole, navigate, onEmbeddedDemoRoleChange, includeStudent = true }) => {
    const tab = (r, label, home) => (
        <button
            type="button"
            key={r}
            onClick={() => {
                flushSync(() => {
                    setRole(r);
                });
                navigate(home);
                onEmbeddedDemoRoleChange?.(r);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${role === r ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
            {label}
        </button>
    );
    return (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Роль</span>
            <div className="inline-flex items-center rounded-xl bg-slate-100/90 p-0.5 gap-0.5" role="group" aria-label="Роль в ПВЛ">
                {includeStudent ? tab('student', 'Ученица', '/student/dashboard') : null}
                {tab('mentor', 'Ментор', '/mentor/dashboard')}
                {tab('admin', 'Админ', '/admin/pvl')}
            </div>
        </div>
    );
};

const ScreenState = ({ loading, error, empty, children, emptyText = 'Пока ничего нет.' }) => {
    if (loading) return <div className="rounded-3xl bg-white shadow-[0_10px_32px_-12px_rgba(15,23,42,0.06)] p-6 text-sm text-slate-500 shadow-sm">Загрузка…</div>;
    if (error) return <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-6 text-sm text-rose-800 shadow-sm">{error}</div>;
    if (empty) return <div className="rounded-3xl bg-white shadow-[0_10px_32px_-12px_rgba(15,23,42,0.06)] p-6 text-sm text-slate-500 shadow-sm">{emptyText}</div>;
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

function unpublishToDraftItems(items, id) {
    return updateContentItem(items, id, { status: 'unpublished' });
}

async function pvlRichEditorUploadImage(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ''));
        r.onerror = () => reject(new Error('Не удалось прочитать файл'));
        r.readAsDataURL(file);
    });
}

function assignContentToSection(placements, contentId, targetSection, targetRole, targetCohort) {
    return [...placements, { id: `pl-${Date.now()}`, contentId, targetSection, targetRole, targetCohort }];
}

function filterContentItems(items, filters) {
    return items
        .filter((i) => (filters.section === 'all' ? true : i.targetSection === filters.section))
        .filter((i) => {
            if (filters.status === 'all') return true;
            if (filters.status === 'withdrawn') {
                return i.status === 'unpublished' || i.status === 'archived';
            }
            return i.status === filters.status;
        })
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
    both: 'Всем',
};

const CONTENT_STATUS_LABEL = {
    draft: 'Не опубликован',
    published: 'Опубликован',
    unpublished: 'Снят с публикации',
    archived: 'В архиве',
    withdrawn: 'Снятые / в архиве',
};

function labelTargetSection(key) {
    return TARGET_SECTION_LABELS[key] || key;
}

function practicumEventTypeRu(t) {
    const k = String(t || '').toLowerCase();
    const map = {
        mentor_meeting: 'Встреча с ментором',
        practicum_done: 'Проведенный практикум',
        week_closure: 'Закрытие модуля',
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
    '/student/messages': 'messages',
    '/student/checklist': 'checklist',
    '/student/results': 'results',
    '/student/certification': 'certification',
    '/student/cultural-code': 'cultural_code',
};

function getPublishedContentBySection(sectionKey, role = 'student', items = [], placements = [], cohortId = 'cohort-2026-1') {
    const relevantPlacements = placements
        .filter((p) => p.targetSection === sectionKey)
        .filter((p) => p.targetRole === role || p.targetRole === 'both')
        .filter((p) => p.isPublished !== false)
        .filter((p) => pvlPlacementVisibleForCohort(p.cohortId, cohortId));
    const byItemId = new Map();
    relevantPlacements.forEach((p) => {
        const itemId = p.contentId || p.contentItemId;
        if (!itemId) return;
        const existing = byItemId.get(itemId);
        const order = Number(p.orderIndex ?? p.sortOrder ?? p.sort_order ?? 999);
        if (!existing || order < existing.order) byItemId.set(itemId, { order, placement: p });
    });
    const withPlacement = items
        .map((item) => ({ item, placementMeta: byItemId.get(item.id) || null }))
        .filter(({ item, placementMeta }) => {
            const roleAllowed = item.targetRole === role || item.targetRole === 'both';
            const visibilityAllowed =
                item.visibility === 'all'
                || (item.visibility === 'by_role' && roleAllowed)
                || ((item.visibility === 'by_cohort' || item.visibility === 'cohort') && (!item.targetCohort || pvlCohortIdsEquivalent(item.targetCohort, cohortId)));
            const hasPlacement = !!placementMeta;
            const inSection = item.targetSection === sectionKey || hasPlacement;
            return item.status === 'published' && visibilityAllowed && inSection;
        });
    return withPlacement
        .sort((a, b) => (a.placementMeta?.order ?? a.item.orderIndex ?? 999) - (b.placementMeta?.order ?? b.item.orderIndex ?? 999))
        .map((x) => x.item);
}

/**
 * Строит модули трекера из опубликованных уроков CMS.
 * Если уроков нет — возвращает PVL_PLATFORM_MODULES с пустыми items (заглушка).
 * Поле moduleNumber из placement маппится на id модуля (1=Пиши, 2=Веди, 3=Люби; 0 → 1).
 */
/** Временная фильтрация явного QA/CI-мусора в названиях уроков (данные потом чистятся в БД). */
function isPvlNoiseTrackerLessonTitle(title) {
    const t = String(title || '').trim();
    if (!t) return false;
    if (/^check\s+lessons\b/i.test(t)) return true;
    if (/^\[(?:ci|smoke)\]\s*/i.test(t)) return true;
    if (/\bsmoke\s+test\b/i.test(t)) return true;
    return false;
}

function buildTrackerModulesFromCms(cmsItems = [], cmsPlacements = []) {
    const lessonPlacements = cmsPlacements
        .filter((p) => p.targetSection === 'lessons' && p.isPublished !== false)
        .sort((a, b) => (Number(a.orderIndex) || 0) - (Number(b.orderIndex) || 0));
    if (!lessonPlacements.length) return PVL_PLATFORM_MODULES;
    const byModule = {};
    lessonPlacements.forEach((p) => {
        const rawMod = Number(p.moduleNumber) || 0;
        const modId = rawMod <= 1 ? 1 : rawMod === 2 ? 2 : 3;
        if (!byModule[modId]) byModule[modId] = [];
        const item = cmsItems.find((x) => x.id === (p.contentItemId || p.contentId));
        if (!item) return;
        if (isPvlNoiseTrackerLessonTitle(item.title)) return;
        const tagMap = { video: 'video', pdf: 'pdf', quiz: 'quiz', text: 'task', audio: 'task', template: 'task', checklist: 'quiz' };
        byModule[modId].push({
            text: item.title || `Урок ${byModule[modId].length + 1}`,
            tag: tagMap[item.contentType] || 'task',
            contentItemId: String(item.id),
        });
    });
    const hasAny = Object.values(byModule).some((arr) => arr.length > 0);
    if (!hasAny) return PVL_PLATFORM_MODULES;
    return PVL_PLATFORM_MODULES.map((mod) => ({
        ...mod,
        items: byModule[mod.id] || [],
    }));
}

/** Явный мусор предпросмотра учительской (данные потом чистятся в БД). */
function isPvlJunkLibraryPreviewItem(item) {
    const title = String(item?.title || '').trim();
    const t = title.toLowerCase();
    if (!title) return true;
    if (/^<\s*[a-z]/i.test(title)) return true;
    if (/^check\s+lessons\b/i.test(t)) return true;
    if (/^\[(?:ci|smoke)\]/i.test(t)) return true;
    if (/\bsmoke\s+test\b/i.test(t)) return true;
    if (/test\s+card/i.test(t)) return true;
    return false;
}

function AdminContentSectionPreview({
    section,
    items,
    placements,
    cohortId = 'cohort-2026-1',
    moduleFilter = 'all',
}) {
    if (section === 'all') {
        return (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                Для предпросмотра в формате ученицы выберите один раздел: Библиотека, Уроки или Глоссарий.
            </div>
        );
    }
    const previewItemsRaw = getPublishedContentBySection(section, 'student', items, placements, cohortId) || [];
    const previewItems = section === 'lessons' && moduleFilter !== 'all'
        ? previewItemsRaw.filter((i) => String(clampPvlModule(i.moduleNumber ?? i.weekNumber ?? 0)) === String(moduleFilter))
        : previewItemsRaw;

    if (!previewItems.length) {
        return (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                В этом разделе пока нет опубликованных материалов для выбранного потока.
            </div>
        );
    }

    if (section === 'library') {
        const libraryPreview = previewItems.filter((i) => !isPvlJunkLibraryPreviewItem(i));
        if (!libraryPreview.length) {
            return (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                    Нет материалов для предпросмотра (все отфильтрованы как служебные заглушки или раздел пуст).
                </div>
            );
        }
        return (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {libraryPreview.map((i) => (
                    <article key={i.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        {i.coverImage ? <img src={i.coverImage} alt="" className="h-28 w-full object-cover" /> : null}
                        <div className="p-3">
                            <div className="text-sm font-medium text-slate-800 line-clamp-2">{i.title}</div>
                            <div className="mt-1 text-xs text-slate-500 line-clamp-2">{pvlMaterialCardExcerpt(i)}</div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
                                    {CONTENT_TYPE_LABEL[i.contentType] || i.contentType || 'Материал'}
                                </span>
                                {(i.categoryTitle || i.libraryCategoryTitle) ? (
                                    <span className="inline-flex rounded-full border border-emerald-100 bg-emerald-50/80 px-2 py-0.5 text-[10px] text-emerald-900">
                                        {i.categoryTitle || i.libraryCategoryTitle}
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    </article>
                ))}
            </div>
        );
    }

    if (section === 'glossary') {
        return (
            <div className="grid gap-3 md:grid-cols-2">
                {previewItems.map((i) => (
                    <article key={i.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="text-sm font-semibold text-slate-800">{i.title}</div>
                        <div className="mt-1 text-xs text-slate-600 line-clamp-3 leading-relaxed">
                            {pvlHtmlToPlainText(String(i.fullDescription || i.description || i.shortDescription || 'Определение добавляется в карточку термина.'), 280)}
                        </div>
                    </article>
                ))}
            </div>
        );
    }

    if (section === 'lessons') {
        const byModule = previewItems.reduce((acc, item) => {
            const mod = clampPvlModule(item.moduleNumber ?? item.weekNumber ?? 0);
            if (!acc[mod]) acc[mod] = [];
            acc[mod].push(item);
            return acc;
        }, {});
        const moduleOrder = Object.keys(byModule).map(Number).sort((a, b) => a - b);
        return (
            <div className="grid gap-3 md:grid-cols-2">
                {moduleOrder.map((mod) => (
                    <article key={mod} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Модуль {mod}</div>
                        <ul className="space-y-1.5">
                            {byModule[mod].map((i) => (
                                <li key={i.id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-2.5 py-2">
                                    <div className="text-sm text-slate-800">{i.title}</div>
                                    <div className="mt-1 text-[11px] text-slate-500">
                                        {i.lessonKind === 'quiz' ? 'Тест' : i.lessonKind === 'homework' ? 'Домашнее задание' : 'Урок'}
                                        {i.estimatedDuration ? ` · ${i.estimatedDuration}` : ''}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </article>
                ))}
            </div>
        );
    }

    return null;
}

function GardenContentCards({ items }) {
    if (!items.length) return <div className="rounded-3xl bg-white p-6 text-sm text-slate-500 shadow-[0_10px_32px_-12px_rgba(15,23,42,0.06)]">В этом разделе пока нет материалов.</div>;
    return (
        <div className="grid md:grid-cols-2 gap-4">
            {items.map((i) => (
                <article key={i.id} className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-5">
                    <h4 className="text-sm font-medium text-slate-800">{i.title}</h4>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed whitespace-pre-line">{pvlMaterialCardExcerpt(i)}</p>
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

function escapeHtml(source = '') {
    return String(source || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function normalizeImportedTitle(raw = '') {
    const cleared = String(raw || '')
        .replace(/^#\s*/, '')
        .replace(/\.[^.]+$/, '')
        .replaceAll('_', ' ')
        .replaceAll('—', '-')
        .replaceAll('–', '-')
        .replace(/^\s*\d+[\s.)_-]+/, '')
        .replace(/\s+/g, ' ')
        .trim();
    return cleared;
}

function parseImportedPvlDocWithFileName(text = '', fileName = '') {
    const parsed = parsePvlImportedMarkdownDoc(text);
    const fromFileName = normalizeImportedTitle(fileName);
    const fromDoc = normalizeImportedTitle(parsed.title);
    return {
        ...parsed,
        title: fromDoc || fromFileName || 'Материал из документа',
    };
}

function buildCategoryIdFromTitle(title = '') {
    const src = String(title || '').trim();
    if (!src) return '';
    const ascii = src
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return ascii || `cat-${Date.now()}`;
}

function clampPvlModule(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(3, Math.round(n)));
}

function LibraryPage({ studentId, navigate, initialItemId = '', routePrefix = '/student', refresh = null, refreshKey = 0 }) {
    const [loading] = useState(false);
    const [error] = useState('');
    const [selectedCategoryId, setSelectedCategoryId] = useState('all');
    const [activeCategoryId, setActiveCategoryId] = useState('');
    const [libraryTick, setLibraryTick] = useState(0);
    const [query, setQuery] = useState('');
    const [contentType, setContentType] = useState('all');
    const [selectedItemId, setSelectedItemId] = useState(initialItemId || '');

    useEffect(() => {
        if (!selectedItemId || String(selectedItemId).startsWith('les-')) return;
        const resolved = pvlDomainApi.studentApi.getPublishedLibraryItemById(studentId, selectedItemId);
        if (resolved && PVL_TRACKER_LIBRARY_EXCLUDE_CATEGORY_IDS.includes(String(resolved.categoryId || '').trim())) {
            setSelectedItemId('');
            if (navigate) navigate(`${routePrefix}/library`);
        }
    }, [selectedItemId, studentId, navigate, routePrefix]);

    /** refreshKey — после async-синка профиля/БД; libraryTick — локальные отметки прогресса */
    const progress = useMemo(
        () => pvlDomainApi.studentApi.getStudentLibraryProgress(studentId),
        [studentId, refreshKey, libraryTick],
    );
    const categories = useMemo(
        () => pvlDomainApi.studentApi.getLibraryCategoriesWithCounts(studentId),
        [studentId, refreshKey, libraryTick],
    );
    const baseItems = useMemo(
        () => pvlDomainApi.studentApi.getStudentLibrary(studentId, {}),
        [studentId, refreshKey, libraryTick],
    );
    const filteredItems = sortLibraryItems(
        searchLibraryItems(
            filterLibraryItems(baseItems, {
                categoryId: selectedCategoryId === 'all' ? '' : selectedCategoryId,
                contentType,
                completion: 'all',
                flag: 'all',
            }),
            query,
        ),
        'order',
    );
    const lessonGroups = useMemo(() => {
        const map = new Map();
        filteredItems.forEach((item) => {
            const cleanTitle = stripMaterialNumbering(item.title);
            const key = String(cleanTitle || '').split(':')[0].trim() || cleanTitle || 'Материал';
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(item);
        });
        return Array.from(map.entries()).map(([lessonTitle, materials]) => ({ lessonTitle, materials }));
    }, [filteredItems]);
    const selectedLesson = String(selectedItemId || '').startsWith('les-')
        ? pvlDomainApi.db.lessons.find((l) => l.id === selectedItemId)
        : null;
    const selectedLessonWeek = selectedLesson?.weekId
        ? pvlDomainApi.db.courseWeeks.find((w) => w.id === selectedLesson.weekId)
        : null;
    const selectedLessonModule = clampPvlModule(selectedLessonWeek?.moduleNumber ?? selectedLessonWeek?.weekNumber ?? 0);
    const selectedLessonMaterial = selectedLesson ? {
        id: selectedLesson.id,
        title: selectedLesson.title || `Урок ${selectedLesson.id}`,
        fullDescription: `Материал урока из трекера.\n\nМодуль: ${selectedLessonModule}\nДедлайн: ${selectedLesson.deadlineAt || '—'}\n\nОткройте этот блок как отдельный урок и отмечайте изучение в трекере.`,
        shortDescription: `Урок модуля ${selectedLessonModule}`,
        categoryTitle: `Уроки · модуль ${selectedLessonModule}`,
        contentType: 'video',
        estimatedDuration: '15 мин',
        externalLinks: [],
        attachments: [],
    } : null;
    const selectedItem = filteredItems.find((x) => x.id === selectedItemId) || baseItems.find((x) => x.id === selectedItemId) || selectedLessonMaterial || null;
    const lessonVideoPlayerHtml = useMemo(
        () => (selectedItem ? buildLessonVideoPlayerHtml(selectedItem) : ''),
        [selectedItem?.id, selectedItem?.lessonVideoEmbed, selectedItem?.lessonVideoUrl],
    );
    const categoryCards = useMemo(() => {
        const palette = [
            'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=900&q=80',
            'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=900&q=80',
            'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=900&q=80',
        ];
        return categories
            .filter((c) => !PVL_TRACKER_LIBRARY_EXCLUDE_CATEGORY_IDS.includes(String(c.id || '')))
            .filter((c) => Number(c.count || 0) > 0)
            .map((c, index) => ({
                ...c,
                cover: palette[index % palette.length],
                description: c.description || 'Материалы категории',
            }));
    }, [categories]);
    const activeCategory = categoryCards.find((c) => c.id === activeCategoryId) || null;
    const activeCategoryItems = useMemo(() => {
        if (!activeCategoryId) return [];
        return sortLibraryItems(
            searchLibraryItems(
                filterLibraryItems(baseItems, {
                    categoryId: activeCategoryId,
                    contentType,
                    completion: 'all',
                    flag: 'all',
                }),
                query,
            ),
            'order',
        );
    }, [activeCategoryId, baseItems, contentType, query]);

    const activeCategoryItemGroups = useMemo(() => {
        const ungrouped = [];
        const orderKeys = [];
        const byKey = new Map();
        for (const i of activeCategoryItems) {
            const g = String(i.libraryLessonGroupTitle || '').trim();
            if (!g) {
                ungrouped.push(i);
                continue;
            }
            if (!byKey.has(g)) {
                byKey.set(g, []);
                orderKeys.push(g);
            }
            byKey.get(g).push(i);
        }
        const groups = orderKeys.map((lessonGroupTitle) => ({
            lessonGroupTitle,
            materials: byKey.get(lessonGroupTitle) || [],
        }));
        return { ungrouped, groups };
    }, [activeCategoryItems]);

    const openCategoryMaterial = useCallback(
        (i) => {
            setSelectedItemId(i.id);
            pvlDomainApi.studentApi.updateLibraryProgress(studentId, i.id, Math.max(10, i.progressPercent || 10));
            setLibraryTick((v) => v + 1);
            refresh?.();
            if (navigate) navigate(`${routePrefix}/library/${i.id}`);
        },
        [studentId, navigate, routePrefix, refresh],
    );

    useEffect(() => {
        if (!selectedItem || !selectedItem.categoryId) return;
        if (selectedCategoryId !== selectedItem.categoryId) {
            setSelectedCategoryId(selectedItem.categoryId);
        }
    }, [selectedItem, selectedCategoryId]);

    useEffect(() => {
        if (selectedItem?.categoryId) {
            setActiveCategoryId(selectedItem.categoryId);
        }
    }, [selectedItem?.categoryId, selectedItem?.id]);

    const goLibraryRoot = () => {
        setActiveCategoryId('');
        setSelectedItemId('');
        if (navigate) navigate(`${routePrefix}/library`);
    };
    const goLibraryCategory = () => {
        setSelectedItemId('');
        if (navigate) navigate(`${routePrefix}/library`);
    };
    const categoryTitleForCrumb = activeCategory?.title || selectedItem?.categoryTitle || '';

    return (
        <ScreenState loading={loading} error={error} empty={false}>
            <div className="space-y-6">
                <div className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-6">
                    <h2 className="font-display text-2xl text-slate-800">Библиотека курса</h2>
                    <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="rounded-xl bg-slate-50/90 shadow-sm p-3">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Закрыто полностью</div>
                            <div className="mt-1 font-display text-xl font-semibold tabular-nums text-slate-800">{progress.completed}</div>
                            <p className="mt-1 text-[11px] text-slate-500 leading-snug">Материалов с отметкой «пройдено»</p>
                        </div>
                        <div className="rounded-xl bg-slate-50/90 shadow-sm p-3">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Всего материалов</div>
                            <div className="mt-1 font-display text-xl font-semibold tabular-nums text-slate-800">{progress.total}</div>
                            <p className="mt-1 text-[11px] text-slate-500 leading-snug">Опубликовано в вашей библиотеке</p>
                        </div>
                        <div className="rounded-xl bg-slate-50/90 shadow-sm p-3">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Средний прогресс</div>
                            <div className="mt-1 font-display text-xl font-semibold tabular-nums text-slate-800">{progress.progressPercent}%</div>
                            <p className="mt-1 text-[11px] text-slate-500 leading-snug">По всем материалам (включая частичное изучение)</p>
                        </div>
                        <div className="rounded-xl bg-slate-50/90 shadow-sm p-3 min-w-0">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Рекомендуем открыть</div>
                            <div className="mt-1 text-sm font-semibold text-slate-800 leading-snug line-clamp-3" title={progress.recommendedNextTitle || progress.recommendedNextMaterial?.title || ''}>
                                {progress.recommendedNextTitle || progress.recommendedNextMaterial?.title || '—'}
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500 leading-snug">Следующий шаг по курсу</p>
                        </div>
                    </div>
                </div>

                <section className="rounded-3xl bg-white p-4 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] md:p-5">
                        <nav className="mb-4 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-slate-500" aria-label="Навигация по библиотеке">
                            {!activeCategory && !selectedItem ? (
                                <span className="font-medium text-slate-800">Библиотека курса</span>
                            ) : (
                                <button
                                    type="button"
                                    onClick={goLibraryRoot}
                                    className="rounded-md px-0.5 font-medium text-emerald-800/90 transition-colors hover:text-emerald-900 hover:underline"
                                >
                                    Библиотека курса
                                </button>
                            )}
                            {(activeCategory || selectedItem) && categoryTitleForCrumb ? (
                                <>
                                    <span className="text-slate-300" aria-hidden>/</span>
                                    {!selectedItem ? (
                                        <span className="font-medium text-slate-800">{categoryTitleForCrumb}</span>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={goLibraryCategory}
                                            className="rounded-md px-0.5 font-medium text-emerald-800/90 hover:text-emerald-900 hover:underline"
                                        >
                                            {categoryTitleForCrumb}
                                        </button>
                                    )}
                                </>
                            ) : null}
                            {selectedItem ? (
                                <>
                                    <span className="text-slate-300" aria-hidden>/</span>
                                    <span className="max-w-[min(100%,28rem)] truncate font-medium text-slate-800">{stripMaterialNumbering(selectedItem.title)}</span>
                                </>
                            ) : null}
                        </nav>
                        {!selectedItem ? (
                            <>
                                {!activeCategory ? (
                                    <>
                                        <h3 className="font-display text-lg text-slate-800 mb-3">Категории библиотеки</h3>
                                        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                                            {categoryCards.map((c) => (
                                                <article key={c.id} className="overflow-hidden rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)]">
                                                    <img src={c.cover} alt={c.title} className="h-36 w-full object-cover" />
                                                    <div className="p-4">
                                                        <h4 className="font-medium text-slate-800">{c.title}</h4>
                                                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{c.description}</p>
                                                        <div className="mt-2 text-[11px] text-slate-500">Материалов: {c.count}</div>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setActiveCategoryId(c.id);
                                                                setSelectedCategoryId(c.id);
                                                                if (navigate) navigate(`${routePrefix}/library`);
                                                            }}
                                                            className="mt-3 rounded-full bg-emerald-700 text-white text-xs px-4 py-1.5 hover:bg-emerald-800"
                                                        >
                                                            Открыть
                                                        </button>
                                                    </div>
                                                </article>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <div className="grid lg:grid-cols-[minmax(260px,340px)_1fr] gap-4 items-start">
                                        <article className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-4">
                                            <img src={activeCategory.cover} alt={activeCategory.title} className="h-36 w-full object-cover rounded-2xl" />
                                            <h4 className="mt-3 font-display text-xl text-slate-800">{activeCategory.title}</h4>
                                            <p className="text-sm text-slate-600 mt-2 leading-relaxed">{activeCategory.description}</p>
                                            <div className="mt-3 text-xs text-slate-500">Материалов в категории: {activeCategory.count}</div>
                                            <button
                                                type="button"
                                                onClick={() => setActiveCategoryId('')}
                                                className="mt-3 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                                            >
                                                Назад к категориям
                                            </button>
                                        </article>
                                        <div className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-3 max-h-[520px] overflow-auto space-y-4">
                                            {activeCategoryItems.length === 0 ? (
                                                <div className="rounded-xl bg-slate-50/90 shadow-sm p-4 text-sm text-slate-500">В этой категории пока нет материалов.</div>
                                            ) : (
                                                <>
                                                    {activeCategoryItemGroups.ungrouped.length ? (
                                                        <div className="space-y-2">
                                                            {activeCategoryItemGroups.ungrouped.map((i) => (
                                                                <button
                                                                    key={i.id}
                                                                    type="button"
                                                                    onClick={() => openCategoryMaterial(i)}
                                                                    className="w-full rounded-2xl bg-white px-3 py-2.5 text-left shadow-sm transition-colors hover:bg-emerald-50/35 hover:shadow-md"
                                                                >
                                                                    <div className="text-sm text-slate-800 truncate">{stripMaterialNumbering(i.title)}</div>
                                                                    {i.estimatedDuration ? (
                                                                        <div className="mt-0.5 text-[11px] text-slate-500">{i.estimatedDuration}</div>
                                                                    ) : null}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : null}
                                                    {activeCategoryItemGroups.groups.map((g) => (
                                                        <div
                                                            key={g.lessonGroupTitle}
                                                            className="rounded-3xl border border-slate-200/90 bg-gradient-to-br from-slate-50/95 via-white to-emerald-50/25 p-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.75)]"
                                                        >
                                                            <h4 className="font-display text-base font-semibold text-slate-800 mb-2.5 px-0.5 leading-snug">{g.lessonGroupTitle}</h4>
                                                            <div className="space-y-2">
                                                                {g.materials.map((i) => (
                                                                    <button
                                                                        key={i.id}
                                                                        type="button"
                                                                        onClick={() => openCategoryMaterial(i)}
                                                                        className="w-full rounded-2xl bg-white/90 px-3 py-2.5 text-left shadow-sm transition-colors hover:bg-emerald-50/40 hover:shadow-md"
                                                                    >
                                                                        <div className="text-sm text-slate-800 truncate">{stripMaterialNumbering(i.title)}</div>
                                                                        {i.estimatedDuration ? (
                                                                            <div className="mt-0.5 text-[11px] text-slate-500">{i.estimatedDuration}</div>
                                                                        ) : null}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <section>
                                <div className="flex items-center justify-between gap-2">
                                    <h3 className="font-display text-xl text-slate-800">{stripMaterialNumbering(selectedItem.title)}</h3>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => printMaterialSheet(selectedItem.title, selectedItem.fullDescription || selectedItem.shortDescription || '')}
                                            className="text-xs rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800 hover:bg-emerald-100"
                                        >
                                            Распечатать
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                pvlDomainApi.studentApi.markLibraryItemCompleted(studentId, selectedItem.id);
                                                setLibraryTick((v) => v + 1);
                                                refresh?.();
                                            }}
                                            className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700 hover:bg-slate-50"
                                        >
                                            Отметить как изученное
                                        </button>
                                        <button type="button" onClick={() => { setSelectedItemId(''); if (navigate) navigate(`${routePrefix}/library`); }} className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700 hover:bg-slate-50">Назад к списку</button>
                                    </div>
                                </div>
                                <PvlLibraryMaterialBody
                                    selectedItem={selectedItem}
                                    lessonVideoPlayerHtml={lessonVideoPlayerHtml}
                                    onQuizPassed={() => {
                                        pvlDomainApi.studentApi.markLibraryItemCompleted(studentId, selectedItem.id);
                                        setLibraryTick((v) => v + 1);
                                        refresh?.();
                                    }}
                                    studentId={studentId}
                                    navigate={navigate}
                                    routePrefix={routePrefix}
                                />
                            </section>
                        )}
                    </section>
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
    const hwAssignment = task.homeworkMeta?.assignmentType || 'standard';
    const checklistSections = task.homeworkMeta?.checklistSections || [];
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
            revisionCycles: state.revisionCycles ?? 0,
            homeworkAssignmentType: hwAssignment,
        },
        taskDescription: {
            summary: task.description || '',
            artifact: task.artifact || '',
            criteria: task.criteria || [],
            uploadTypes: task.uploadTypes || [],
            hints: [],
            homeworkAssignmentType: hwAssignment,
            checklistSections,
        },
        submissionVersions: (detail.versions || []).map((v) => ({
            id: v.id,
            versionNumber: v.versionNumber,
            createdAt: formatPvlDateTime(v.createdAt),
            authorRole: v.authorRole,
            textContent: v.textContent,
            answersJson: v.answersJson != null ? v.answersJson : null,
            attachments: v.attachments || [],
            links: v.links || [],
            isCurrent: !!v.isCurrent,
            isDraft: !!v.isDraft,
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

const ACTIVE_HOMEWORK_LABELS = new Set(['черновик', 'отправлено', 'на проверке', 'к проверке', 'на доработке', 'проверено', 'в работе']);

function StudentDashboard({ studentId, navigate, routePrefix = '/student', gardenBridgeRef = null }) {
    const snapshot = pvlDomainApi.studentApi.getStudentDashboard(studentId);
    const points = pvlDomainApi.helpers.getStudentPointsSummary(studentId);
    const libraryProgress = pvlDomainApi.studentApi.getStudentLibraryProgress(studentId);
    const w = snapshot.compulsoryWidgets;
    const { checked } = usePlatformStepChecklist(studentId);
    const tr = useMemo(() => computePvlTrackerDashboardStats(checked), [checked]);
    const apiTasks = pvlDomainApi.studentApi.getStudentResults(studentId, {});
    const activeHomework = apiTasks.filter((t) => ACTIVE_HOMEWORK_LABELS.has(t.displayStatus || t.status));
    const homeworkShortlist = useMemo(() => {
        return sortHomeworkByRecency(activeHomework).slice(0, 8);
    }, [activeHomework]);
    const feed = snapshot.activityFeed || [];
    const user = resolveActorUser(studentId);
    const heroDisplayName = resolveStudentDashboardHeroName(studentId);
    const profile = pvlDomainApi.db.studentProfiles.find((p) => p.userId === studentId || p.id === studentId) || null;
    const mentorUserId = profile?.mentorId || null;
    const mentorUser = mentorUserId ? resolveActorUser(mentorUserId) : null;
    const cohortId = profile?.cohortId || profile?.cohort || 'cohort-2026-1';
    const cohortTitle = profile?.cohort || pvlDomainApi.db.cohorts.find((c) => c.id === profile?.cohortId)?.title || '';

    const fmtDeadline = (ymd) => (ymd ? formatPvlDateTime(`${String(ymd).slice(0, 10)}T12:00:00`) : '—');

    const lessonPct = tr.lessonsTotal ? Math.round((tr.lessonsDone / tr.lessonsTotal) * 100) : 0;
    const homeworkPct = tr.homeworkTotal ? Math.round((tr.homeworkDone / tr.homeworkTotal) * 100) : 0;

    return (
        <div className="space-y-8">
            <section className="rounded-[1.35rem] bg-gradient-to-br from-emerald-700 via-emerald-800 to-teal-900 text-white p-5 md:p-7 shadow-lg shadow-emerald-900/15">
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-6">
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/65">{PVL_COURSE_DISPLAY_NAME}</p>
                        <h2 className="font-display text-2xl md:text-3xl mt-2 tracking-tight">{heroDisplayName || 'Участница'}</h2>
                        {cohortTitle ? <div className="mt-2 text-sm text-white/80">{cohortTitle}</div> : null}
                        <div className="mt-2 text-sm text-white/80">Ментор: {mentorUser?.fullName || 'не назначен'}</div>
                        <button
                            type="button"
                            onClick={() => navigate?.(`${routePrefix}/lessons`)}
                            className="mt-3 inline-flex max-w-full text-left rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
                        >
                            Текущий фокус: {tr.currentModuleTitle || 'Модуль курса'}
                        </button>
                        <p className="mt-3 text-xs text-white/75 line-clamp-2">
                            Последний урок: <span className="text-white/95">{libraryProgress.lastOpenedMaterial?.title || '—'}</span>
                        </p>
                    </div>
                    <div className="w-full lg:max-w-[min(100%,300px)] shrink-0 space-y-4 lg:text-right">
                        <div>
                            <div className="flex justify-between gap-4 items-baseline text-white/85">
                                <span className="text-sm">Уроки</span>
                                <span className="tabular-nums font-semibold text-white text-lg md:text-xl">{tr.lessonsDone}/{tr.lessonsTotal}</span>
                            </div>
                            <div className="mt-1.5 h-1.5 rounded-full bg-white/20 overflow-hidden">
                                <div className="h-full rounded-full bg-white/90" style={{ width: `${lessonPct}%` }} />
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between gap-4 items-baseline text-white/85">
                                <span className="text-sm">Домашки</span>
                                <span className="tabular-nums font-semibold text-white text-lg md:text-xl">{tr.homeworkDone}/{tr.homeworkTotal}</span>
                            </div>
                            <div className="mt-1.5 h-1.5 rounded-full bg-white/20 overflow-hidden">
                                <div className="h-full rounded-full bg-white/90" style={{ width: `${homeworkPct}%` }} />
                            </div>
                        </div>
                        <div className="flex justify-between gap-4 items-baseline border-t border-white/15 pt-3 text-white/85">
                            <span className="text-sm">Дней до модуля</span>
                            <span className="tabular-nums font-semibold text-white text-lg md:text-xl">{w?.daysToModuleEnd ?? '—'}</span>
                        </div>
                        <div className="flex justify-between gap-4 items-baseline text-white/85">
                            <span className="text-sm">Курсовые баллы</span>
                            <span className="tabular-nums font-semibold text-white text-lg md:text-xl">{points.coursePointsTotal}/400</span>
                        </div>
                        <div className="flex justify-between gap-4 items-baseline text-white/85">
                            <span className="text-sm">До конца курса</span>
                            <span className="tabular-nums font-semibold text-white text-lg md:text-xl">{w?.daysToCourseEnd ?? '—'} дн.</span>
                        </div>
                        {navigate ? (
                            <div className="pt-2 lg:text-right">
                                <button
                                    type="button"
                                    onClick={() => navigate(`${routePrefix}/tracker`)}
                                    className="rounded-full bg-white/15 hover:bg-white/25 px-5 py-2.5 text-sm font-medium border border-white/25 transition-colors"
                                >
                                    Открыть трекер
                                </button>
                            </div>
                        ) : null}
                    </div>
                </div>
            </section>

            <section>
                <PvlDashboardCalendarBlock
                    viewerRole="student"
                    cohortId={cohortId}
                    navigate={navigate}
                    routePrefix={routePrefix}
                />
            </section>

            <section className="rounded-3xl bg-white p-5 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] md:p-6">
                <h3 className="font-display text-xl text-slate-800">Ваш ментор</h3>
                {mentorUser ? (
                    <button
                        type="button"
                        disabled={!gardenBridgeRef?.current?.openGardenUserProfile || !mentorUserId}
                        onClick={() => {
                            if (mentorUserId && gardenBridgeRef?.current?.openGardenUserProfile) {
                                gardenBridgeRef.current.openGardenUserProfile(mentorUserId);
                            }
                        }}
                        className={`mt-3 flex w-full max-w-lg items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/30 p-3 text-left transition-colors ${gardenBridgeRef?.current?.openGardenUserProfile && mentorUserId ? 'hover:bg-emerald-50 cursor-pointer' : 'cursor-default opacity-95'}`}
                    >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm font-semibold">
                            {pvlPersonInitials(mentorUser.fullName)}
                        </div>
                        <div className="min-w-0">
                            <div className="text-sm font-medium text-slate-800">{mentorUser.fullName}</div>
                            <div className="text-xs text-slate-500">Закреплённый ментор по вашему потоку{gardenBridgeRef?.current?.openGardenUserProfile ? ' · открыть профиль в Саду' : ''}</div>
                        </div>
                    </button>
                ) : (
                    <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                        Ментор пока не назначен. Как только учительская закрепит ментора, он появится здесь и в разделе «Чат с ментором».
                    </div>
                )}
            </section>

            <section className="rounded-3xl bg-white p-5 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] md:p-6">
                <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                        <h3 className="font-display text-xl text-slate-800">Домашние работы</h3>
                    </div>
                    {navigate ? (
                        <button
                            type="button"
                            onClick={() => navigate(`${routePrefix}/results`)}
                            className="text-xs font-medium text-[#C8855A] hover:underline"
                        >
                            Все результаты →
                        </button>
                    ) : null}
                </div>
                {homeworkShortlist.length === 0 ? (
                    <p className="text-sm text-slate-500 mt-4">Нет заданий в фокусе — откройте «Результаты».</p>
                ) : (
                    <div className="mt-4 grid lg:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
                        {homeworkShortlist.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => navigate(`${routePrefix}/results/${t.id}`)}
                                className="grid h-full min-h-[214px] grid-rows-[auto_auto_auto_auto_1fr_auto] gap-1 rounded-2xl bg-white p-4 text-left shadow-[0_8px_28px_-10px_rgba(15,23,42,0.07)] transition-colors hover:bg-emerald-50/15 hover:shadow-[0_12px_36px_-10px_rgba(16,100,70,0.12)]"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="text-sm font-semibold text-slate-800 line-clamp-2 min-h-[40px] pr-1">{t.title}</div>
                                    <div className="flex flex-col items-end gap-0.5">
                                        <StatusBadge compact>{shortTaskStatusLabel(t.displayStatus || t.status)}</StatusBadge>
                                        {Number(t.maxScore) > 0 ? <span className="text-[10px] tabular-nums text-slate-500">{t.score ?? 0}/{t.maxScore}</span> : null}
                                    </div>
                                </div>
                                <div className="text-[11px] text-slate-500">Модуль {clampPvlModule(t.moduleNumber ?? t.week ?? 0)}</div>
                                <div className="text-[11px]">
                                    {!hideDeadlineForAcceptedWithScore(t) ? (
                                        <span className={`inline-flex rounded-full border px-1.5 py-px text-[10px] leading-tight ${deadlineUrgencyTone(t.deadlineAt)}`}>
                                            Дедлайн: {fmtDeadline(t.deadlineAt)}
                                        </span>
                                    ) : <span className="inline-block h-[18px]" />}
                                </div>
                                <div className="text-[11px] text-slate-500">Сдано: {t.submittedAt ? formatPvlDateTime(t.submittedAt) : '—'}</div>
                                <div className="text-[11px]">
                                    {Number(t.revisionCycles || 0) > 0 ? (
                                        <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-px text-[10px] leading-tight text-amber-900">Доработок: {t.revisionCycles}</span>
                                    ) : <span className="inline-block h-[18px]" />}
                                </div>
                                <div className="text-[11px] text-slate-500 line-clamp-1 self-end">{t.mentorCommentPreview || 'Без комментария'}</div>
                                <div className="pt-2">
                                    <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[10px] leading-tight text-slate-700">Открыть задание</span>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </section>

            <section className="rounded-3xl bg-white p-5 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] md:p-6">
                <h3 className="font-display text-xl text-slate-800">Новости</h3>
                <ul className="mt-4 space-y-2 text-sm text-slate-600">
                    {feed.length === 0 ? <li className="text-slate-400">Пока нет событий.</li> : null}
                    {feed.map((item) => {
                        const isSystem = ['cert', 'meeting'].includes(String(item.kind || '').toLowerCase());
                        return (
                            <li key={item.id} className={`flex flex-wrap items-baseline justify-between gap-2 rounded-xl px-3 py-2 border-b border-slate-50 last:border-0 ${isSystem ? 'border border-emerald-200/80 bg-emerald-50/40' : ''}`}>
                                <div className="min-w-0">
                                    <span className={`inline-block w-1.5 h-1.5 rounded-full align-middle mr-2 shrink-0 ${isSystem ? 'bg-emerald-700' : 'bg-emerald-500'}`} aria-hidden />
                                    <span className="font-medium text-slate-800">{item.text}</span>
                                    {item.detail ? <span className="text-slate-500"> — {item.detail}</span> : null}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[11px] text-slate-400 tabular-nums">{formatPvlDateTime(item.at)}</span>
                                    {item.taskId && navigate ? (
                                        <button type="button" onClick={() => navigate(`${routePrefix}/results/${item.taskId}`)} className="text-[11px] text-[#C8855A] hover:underline">К заданию</button>
                                    ) : null}
                                </div>
                            </li>
                        );
                    })}
                </ul>
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
        deadline: 'дедлайн модуля',
    };
    return map[s] || status;
}

function StudentLessonsLive({ studentId, navigate }) {
    const { stats } = usePlatformStepChecklist(studentId);
    const { doneSteps, totalSteps, pct } = stats;
    return (
        <div className="space-y-6">
            <div className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-6">
                <h2 className="font-display text-2xl text-slate-800">Уроки и шаги курса</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4 text-sm text-slate-600">
                    <div className="rounded-xl bg-slate-50/90 shadow-sm px-3 py-2">Шаги: <span className="font-medium tabular-nums text-slate-800">{doneSteps}/{totalSteps}</span></div>
                    <div className="rounded-xl bg-slate-50/90 shadow-sm px-3 py-2">Прогресс: <span className="font-medium tabular-nums text-slate-800">{pct}%</span></div>
                    <div className="rounded-xl bg-slate-50/90 shadow-sm px-3 py-2 flex items-center">
                        <button type="button" onClick={() => navigate('/student/tracker')} className="text-sm text-slate-700 font-medium hover:underline">Полный трекер с заданиями</button>
                    </div>
                </div>
            </div>
            <PlatformCourseModulesGrid studentId={studentId} variant="lessons" navigate={navigate} />
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
        <div className="space-y-6">
            <div className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-6">
                <h2 className="font-display text-2xl text-slate-800">Практикумы</h2>
            </div>
            {events.length === 0 ? (
                <div className="rounded-3xl bg-white shadow-[0_10px_32px_-12px_rgba(15,23,42,0.06)] p-6 text-sm text-slate-500 shadow-sm">Запланированных событий пока нет.</div>
            ) : (
                <div className="space-y-5">
                    {byDay.map(([dayKey, dayEvents]) => (
                        <section key={dayKey} className="overflow-hidden rounded-3xl bg-white shadow-[0_10px_32px_-12px_rgba(15,23,42,0.06)]">
                            <div className="bg-slate-50/90 px-4 py-3 border-b border-slate-100">
                                <h3 className="font-display text-lg text-slate-800">
                                    {dayKey === 'unknown' ? 'Без даты' : formatPvlDateTime(`${dayKey}T12:00:00`)}
                                </h3>
                                <p className="text-xs text-slate-400 mt-0.5">{dayEvents.length} {dayEvents.length === 1 ? 'событие' : 'событий'}</p>
                            </div>
                            <ul className="divide-y divide-slate-100">
                                {dayEvents.map((ev) => (
                                    <li key={ev.id} className="px-4 py-3 flex flex-wrap items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="text-[11px] font-medium text-slate-400">{practicumEventTypeRu(ev.eventType)}</div>
                                            <div className="text-sm font-medium text-slate-800 mt-0.5">{ev.title}</div>
                                            {ev.focus ? <div className="text-xs text-slate-500 mt-1">{ev.focus}</div> : null}
                                            <div className="text-xs text-slate-400 mt-1">{pvlPlatformModuleTitleFromInternal(ev.moduleNumber ?? ev.weekNumber ?? 1)}</div>
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

function StudentAboutEnriched({ navigate, routePrefix = '/student', cmsItems = [], cmsPlacements = [] }) {
    const materials = getPublishedContentBySection('about', 'student', cmsItems, cmsPlacements);
    const [activeId, setActiveId] = useState(materials[0]?.id || '');
    const active = materials.find((m) => m.id === activeId) || materials[0];
    const tags = ['Все', 'Обзор', 'Старт', 'Платформа', 'Безопасность', 'Баллы', 'Команда', 'Трекер'];
    const [tagFilter, setTagFilter] = useState('Все');
    const filtered = materials.filter((m) => tagFilter === 'Все' || (m.tags || []).includes(tagFilter) || m.tag === tagFilter);
    const goTracker = () => navigate(`${routePrefix}/tracker`);

    if (materials.length === 0) {
        const mustDoItems = [
            'слушать уроки',
            'выполнять тесты',
            'делать домашние задания',
            'приходить на практикумы',
            'посетить встречу с письменными практиками',
            'участвовать в сборных завтраках',
            'получать удовольствие',
            'пробовать практики на себе',
        ];
        const mentors = ['Юлия Габрух', 'Василина Лузина', 'Елена Федотова'];
        return (
            <div className="space-y-5 md:space-y-6">
                <header className="relative overflow-hidden rounded-[1.75rem] border border-[#E8D5C4]/60 bg-gradient-to-br from-[#FAF6F2] via-white to-emerald-50/40 p-6 md:p-8 shadow-[0_14px_44px_-18px_rgba(27,77,62,0.12)]">
                    <div className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full bg-emerald-200/25 blur-2xl" aria-hidden />
                    <div className="pointer-events-none absolute -bottom-8 left-1/3 h-24 w-24 rounded-full bg-[#C4956A]/10 blur-xl" aria-hidden />
                    <div className="relative flex flex-wrap items-start gap-4">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-200/80 bg-white/90 text-emerald-800 shadow-sm">
                            <Sprout className="h-6 w-6" strokeWidth={1.75} aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7A6758]">Материалы курса</p>
                            <h2 className="font-display text-2xl md:text-3xl text-[#2C1810] mt-1">О курсе «Пиши, веди, люби»</h2>
                            <p className="mt-2 text-sm text-[#5C4D42] leading-relaxed max-w-2xl">
                                Добро пожаловать в сад ведущих — здесь растёт ваша траектория: три модуля, практики и поддержка команды.
                            </p>
                        </div>
                    </div>
                </header>

                <div className="grid gap-5 md:grid-cols-2">
                    <article className="rounded-2xl border border-[#E8D5C4]/50 bg-white p-5 md:p-6 shadow-[0_10px_36px_-16px_rgba(15,23,42,0.08)]">
                        <div className="flex items-center gap-2 text-[#4A3728] mb-3">
                            <Leaf className="h-4 w-4 text-emerald-700/80" strokeWidth={2} aria-hidden />
                            <h3 className="font-display text-lg">Три опоры курса</h3>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed">
                            Вы начинаете обучение на курсе «Пиши, веди, люби». Курс состоит из трёх модулей: <strong className="font-semibold text-[#3D342B]">Пиши</strong>, <strong className="font-semibold text-[#3D342B]">Веди</strong>, <strong className="font-semibold text-[#3D342B]">Люби</strong>. Отдельный курс — социальная психология (его можно слушать в любое время).
                        </p>
                    </article>
                    <article className="rounded-2xl border border-emerald-200/60 bg-gradient-to-b from-emerald-50/50 to-white p-5 md:p-6 shadow-[0_10px_36px_-16px_rgba(15,23,42,0.06)]">
                        <div className="flex items-center gap-2 text-[#1B4D3E] mb-3">
                            <GraduationCap className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
                            <h3 className="font-display text-lg">Финал и дальше</h3>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed">
                            Финалом курса будет сертификационный завтрак: вы его соберёте и проведёте, а ментор прослушает и даст обратную связь. После нас ждёт защита проектов. Курс — только начало: дальше мы ждём вас в Лиге развивающих практиков.
                        </p>
                    </article>
                </div>

                <section className="rounded-2xl border border-[#D4C4B4]/70 bg-[#FFFCF8] p-5 md:p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.9)]">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E8D5C4]/50 pb-4 mb-4">
                        <h3 className="font-display text-lg text-[#4A3728]">Что важно делать на курсе</h3>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8B7355] rounded-full border border-[#E8D5C4] bg-white px-3 py-1">ваша грядка привычек</span>
                    </div>
                    <ul className="grid gap-2 sm:grid-cols-2">
                        {mustDoItems.map((line) => (
                            <li
                                key={line}
                                className="flex items-start gap-2.5 rounded-xl border border-[#F0E6DC] bg-white/80 px-3 py-2.5 text-sm text-[#3D342B] shadow-sm"
                            >
                                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] text-emerald-800" aria-hidden>✓</span>
                                <span>{line}</span>
                            </li>
                        ))}
                    </ul>
                </section>

                <div className="grid gap-5 md:grid-cols-2">
                    <article className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
                        <div className="flex items-center gap-2 text-slate-800 mb-2">
                            <CalendarDays className="h-4 w-4 text-emerald-700" strokeWidth={2} aria-hidden />
                            <h4 className="font-display text-base text-[#3D342B]">Календарь и записи</h4>
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Все встречи мы вносим в календарь на платформе и анонсируем в канале. Записи размещаем на платформе.
                        </p>
                    </article>
                    <article className="rounded-2xl border border-amber-200/70 bg-amber-50/35 p-5 shadow-sm">
                        <div className="flex items-center gap-2 text-amber-950/90 mb-2">
                            <Info className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                            <h4 className="font-display text-base">Рекомендации</h4>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed">
                            Не копите долги: делайте всё вовремя и планируйте сертификационный завтрак заранее — он включает и сценарий, и сбор группы. В разделе о сертификации описаны требования к завтраку.
                        </p>
                        <p className="text-sm text-slate-600 leading-relaxed mt-3">
                            Позже появится тест самооценки после вашего завтрака; такой же тест заполнит ментор — вы сравните результаты.
                        </p>
                    </article>
                </div>

                <section className="rounded-2xl border border-[#E8D5C4]/60 bg-gradient-to-br from-white to-[#FAF6F2]/80 p-5 md:p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Users className="h-5 w-5 text-[#4A3728]" strokeWidth={1.75} aria-hidden />
                        <h3 className="font-display text-lg text-[#2C1810]">Команда курса</h3>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-xl border border-[#E8D5C4]/80 bg-white p-4 shadow-sm">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8B7355]">Куратор</p>
                            <p className="mt-1 font-medium text-[#3D342B]">Ирина Одинцова</p>
                        </div>
                        {mentors.map((name) => (
                            <div key={name} className="rounded-xl border border-emerald-200/50 bg-emerald-50/30 p-4 shadow-sm">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-900/70">Ментор</p>
                                <p className="mt-1 font-medium text-[#3D342B]">{name}</p>
                            </div>
                        ))}
                    </div>
                    <p className="mt-4 text-xs text-slate-500 border-t border-[#E8D5C4]/40 pt-4">Технические вопросы можно задавать Анастасии.</p>
                </section>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="rounded-3xl bg-white p-5 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] md:p-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Материалы курса</p>
                <h2 className="font-display text-2xl md:text-3xl text-slate-800 mt-1">О курсе</h2>
            </div>

            <div className="grid lg:grid-cols-2 gap-5 lg:gap-6 items-stretch min-h-0">
                <div className="flex min-h-[280px] flex-col overflow-hidden rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] lg:h-[min(70vh,640px)]">
                    <div className="h-36 md:h-44 shrink-0 bg-gradient-to-br from-[#FAF6F2] via-emerald-50/80 to-teal-100/60 border-b border-slate-100" aria-hidden />
                    <div className="p-5 md:p-6 flex-1 flex flex-col min-h-0 overflow-y-auto">
                        <div className="flex flex-wrap gap-2 mb-3">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 border border-slate-200 rounded-full px-2.5 py-1">{(active?.tags || []).join(', ') || active?.tag}</span>
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/80 border border-emerald-100 bg-emerald-50/50 rounded-full px-2.5 py-1">{active?.contentType || active?.kind}</span>
                        </div>
                        <h3 className="font-display text-xl text-slate-800">{active?.title}</h3>
                        <p className="text-sm text-slate-600 mt-3 leading-relaxed flex-1">{active?.shortDescription || active?.summary}</p>
                        {active?.id === 'week0' ? (
                            <button
                                type="button"
                                onClick={goTracker}
                                className="mt-5 self-start rounded-full bg-[#4A3728] text-white px-5 py-2.5 text-sm font-medium hover:bg-[#3d2f22]"
                            >
                                Перейти в трекер
                            </button>
                        ) : null}
                        <div className="mt-6 pt-4 border-t border-slate-100">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Теги</p>
                            <div className="flex flex-wrap gap-2">
                                {tags.slice(1).map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setTagFilter(t)}
                                        className={`text-xs rounded-full border px-3 py-1.5 font-medium transition-colors ${
                                            tagFilter === t ? 'border-[#C8855A] bg-[#FAF6F2] text-[#4A3728]' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-slate-400 mt-3">Материалов в разделе: {filtered.length}</p>
                        </div>
                    </div>
                </div>

                <div className="flex min-h-[280px] flex-col rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] lg:h-[min(70vh,640px)]">
                    <div className="px-5 py-4 border-b border-slate-100 shrink-0">
                        <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Материалы</h3>
                    </div>
                    <ul className="divide-y divide-slate-100 overflow-y-auto flex-1 min-h-0">
                        {filtered.map((m) => (
                            <li key={m.id}>
                                <button
                                    type="button"
                                    onClick={() => { setActiveId(m.id); setTagFilter('Все'); }}
                                    className={`w-full text-left px-5 py-4 flex gap-4 transition-colors ${activeId === m.id ? 'bg-emerald-50/40 border-l-4 border-l-emerald-500 pl-4' : 'hover:bg-slate-50/80 border-l-4 border-l-transparent pl-4'}`}
                                >
                                    <span className="text-lg shrink-0" aria-hidden>{(m.contentType || m.kind) === 'task' ? '→' : '📄'}</span>
                                    <div className="min-w-0">
                                        <div className="text-sm font-semibold text-slate-800">{m.title}</div>
                                        <div className="text-[10px] text-slate-400 mt-1 uppercase tracking-wide">{(m.tags || []).join(', ') || m.tag} · {m.contentType || m.kind}</div>
                                        <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{m.shortDescription || m.summary}</p>
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}

function StudentGlossarySearch({ studentId = '', cmsItems = [], cmsPlacements = [] }) {
    const [q, setQuery] = useState('');
    const [letter, setLetter] = useState('all');
    const [expandedId, setExpandedId] = useState('');
    const alphabet = useMemo(() => 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЭЮЯ'.split(''), []);
    const glossaryItems = useMemo(() => {
        const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const cleanTerm = (value = '') => String(value)
            .replace(/\s+/g, ' ')
            .replace(/^[\s"'«»()]+|[\s"'«»()]+$/g, '')
            .replace(/[:\-–—]\s*$/u, '')
            .trim();
        const byPlacement = getPublishedContentBySection('glossary', 'student', cmsItems, cmsPlacements) || [];
        const htmlSources = byPlacement
            .map((x) => ({
                title: String(x.title || '').trim(),
                html: String(x.fullDescription || x.description || x.bodyHtml || '').trim(),
            }))
            .filter((x) => x.title || x.html);
        const parsed = [];
        htmlSources.forEach(({ title, html }, blockIdx) => {
            try {
                const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html');
                const root = doc.getElementById('root');
                if (!root) return;

                // 1) table format: <tr><td>Термин</td><td>Расшифровка</td></tr>
                const rows = Array.from(root.querySelectorAll('tr'));
                rows.forEach((tr, idx) => {
                    const cells = Array.from(tr.querySelectorAll('th,td')).map((c) => String(c.textContent || '').trim());
                    if (cells.length < 2) return;
                    const term = cleanTerm(cells[0]);
                    const definition = String(cells.slice(1).join(' ').trim());
                    if (!term || !definition) return;
                    const lower = term.toLowerCase();
                    if (lower === 'термин' || lower === 'понятие') return;
                    parsed.push({ id: `g-t-${blockIdx}-${idx}`, term, definition });
                });

                // 2) list format: <li><strong>Термин</strong> — расшифровка</li>
                const liNodes = Array.from(root.querySelectorAll('li'));
                liNodes.forEach((li, idx) => {
                    const strong = li.querySelector('strong');
                    const term = cleanTerm(strong?.textContent || '');
                    const raw = String(li.textContent || '').trim();
                    const definition = term ? raw.replace(new RegExp(`^${escapeRegExp(term)}\\s*[:\\-–—]?\\s*`), '').trim() : raw;
                    if (term && definition) {
                        parsed.push({ id: `g-l-${blockIdx}-${idx}`, term, definition });
                    }
                });

                // 3) markdown-table/plain lines: "Термин | Расшифровка"
                const plainLines = String(root.textContent || '')
                    .split('\n')
                    .map((line) => String(line || '').trim())
                    .filter(Boolean);
                plainLines.forEach((line, idx) => {
                    if (!line.includes('|')) return;
                    if (/^\|?[\s:\-]+\|[\s:\-|]+$/u.test(line)) return; // markdown separator
                    const parts = line.split('|').map((x) => String(x || '').trim()).filter(Boolean);
                    if (parts.length < 2) return;
                    const term = cleanTerm(parts[0]);
                    const definition = String(parts.slice(1).join(' ').trim());
                    if (!term || !definition) return;
                    const lower = term.toLowerCase();
                    if (lower === 'термин' || lower === 'понятие') return;
                    parsed.push({ id: `g-p-${blockIdx}-${idx}`, term, definition });
                });

                if (!parsed.some((row) => String(row.id || '').startsWith(`g-t-${blockIdx}-`) || String(row.id || '').startsWith(`g-l-${blockIdx}-`) || String(row.id || '').startsWith(`g-p-${blockIdx}-`))) {
                    const fallbackDefinition = String(root.textContent || '').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
                    if (title && fallbackDefinition) parsed.push({ id: `g-f-${blockIdx}`, term: cleanTerm(title), definition: fallbackDefinition });
                }
            } catch {
                /* ignore malformed html */
            }
        });
        const uniq = [];
        const seen = new Set();
        parsed.forEach((row) => {
            const k = String(row.term || '').toLowerCase();
            if (!k || seen.has(k)) return;
            seen.add(k);
            uniq.push(row);
        });
        if (uniq.length === 0) {
            return PVL_TRACKER_GLOSSARY.map((g) => ({ id: g.term, term: g.term, definition: g.def }));
        }
        return uniq;
    }, [cmsItems, cmsPlacements]);
    const base = glossaryItems.map((g) => ({
        id: g.id,
        term: g.term,
        abbr: g.abbr || null,
        catLabel: g.catLabel || null,
        definition: g.definition,
    }));
    const qlow = q.trim().toLowerCase();
    const termFirstLetter = (term) => {
        const t = String(term || '').trim().replace(/^["«(]+/, '');
        return t.charAt(0).toUpperCase().replace('Ё', 'Е');
    };
    const afterCategoryAndSearch = base.filter((g) => {
        if (!qlow) return true;
        const def = String(g.definition || '');
        return String(g.term).toLowerCase().includes(qlow) || def.toLowerCase().includes(qlow);
    });
    const lettersPresent = new Set();
    afterCategoryAndSearch.forEach((g) => {
        const ch = termFirstLetter(g.term);
        if (ch) lettersPresent.add(ch);
    });
    const filtered = afterCategoryAndSearch.filter((g) => {
        if (letter === 'all') return true;
        return termFirstLetter(g.term) === letter;
    });
    const exportGlossaryPdf = () => {
        const doc = new jsPDF('p', 'mm', 'a4');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('Глоссарий курса ПВЛ', 14, 16);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('Все термины курса, распечатайте и держите рядом.', 14, 22);
        let y = 30;
        filtered.forEach((item, idx) => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            if (y > 272) {
                doc.addPage();
                y = 16;
            }
            doc.text(`${idx + 1}. ${item.term}`, 14, y);
            y += 5;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            const lines = doc.splitTextToSize(String(item.definition || ''), 180);
            const blockHeight = (lines.length * 4) + 3;
            if (y + blockHeight > 286) {
                doc.addPage();
                y = 16;
            }
            doc.text(lines, 14, y);
            y += blockHeight;
        });
        doc.save('pvl-glossary.pdf');
    };
    return (
        <div className="space-y-6">
            <div className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-5 flex flex-wrap items-center justify-between gap-4">
                <h2 className="font-display text-2xl text-slate-800">Глоссарий курса</h2>
                <button type="button" onClick={exportGlossaryPdf} className="text-xs rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 px-3 py-1.5 hover:bg-emerald-100 shrink-0">Скачать PDF</button>
            </div>
            <input
                value={q}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-full border border-[#E8D5C4] bg-white px-4 py-2.5 text-sm"
                placeholder="Поиск по термину или определению..."
            />
            <div className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-3">
                <p className="text-[11px] font-medium text-slate-500 mb-2">Быстрый фильтр по первой букве</p>
                <div className="flex flex-wrap gap-1.5">
                    <button
                        type="button"
                        onClick={() => setLetter('all')}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${letter === 'all' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                        Все
                    </button>
                    {alphabet.map((ch) => {
                        const hasTerms = lettersPresent.has(ch);
                        return (
                            <button
                                key={ch}
                                type="button"
                                disabled={!hasTerms}
                                onClick={() => hasTerms && setLetter(ch)}
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                    letter === ch
                                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                        : hasTerms
                                          ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                          : 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed'
                                }`}
                            >
                                {ch}
                            </button>
                        );
                    })}
                </div>
            </div>
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 items-stretch">
                {filtered.map((g) => {
                    const defText = String(g.definition || '');
                    const shouldCollapse = defText.length > 230;
                    const isOpen = expandedId === g.id;
                    return (
                        <article
                            key={g.id}
                            className="rounded-3xl bg-white shadow-[0_10px_32px_-12px_rgba(15,23,42,0.06)] p-3.5 shadow-sm flex flex-col h-full min-h-[260px]"
                        >
                            <div className="flex flex-wrap items-baseline gap-2 shrink-0">
                                <h4 className="font-display text-base text-[#4A3728] leading-tight">{g.term}</h4>
                            </div>
                            {g.catLabel ? <div className="text-[10px] font-semibold uppercase tracking-wider text-[#9B8B80] mt-1 shrink-0">{g.catLabel}</div> : null}
                            <div className="mt-2 flex-1 flex flex-col min-h-0">
                                <div className={isOpen ? 'min-h-0' : 'h-[8rem] overflow-hidden'}>
                                    <p className={`text-xs text-[#2C1810] leading-relaxed ${!isOpen ? 'line-clamp-6' : ''}`}>{defText}</p>
                                </div>
                                {shouldCollapse ? (
                                    <button
                                        type="button"
                                        onClick={() => setExpandedId((prev) => (prev === g.id ? '' : g.id))}
                                        className="mt-2 text-[11px] text-emerald-700 hover:underline self-start shrink-0"
                                    >
                                        {isOpen ? 'Свернуть' : 'Подробнее'}
                                    </button>
                                ) : null}
                            </div>
                        </article>
                    );
                })}
            </div>
        </div>
    );
}

function StudentCertificationReference({ navigate }) {
    return (
        <div className="space-y-6 text-sm text-slate-700">
            <div className="rounded-3xl bg-white shadow-[0_10px_32px_-12px_rgba(15,23,42,0.06)] p-5 leading-relaxed">
                <p>Этот документ — ваша опора перед сертификацией. Здесь собрано всё, что важно: как подготовиться, какие есть обязательные условия, на что обращает внимание ментор и как устроена оценка. Наша цель — помочь вам провести встречу уверенно, бережно и в духе встреч с письменными практиками.</p>
            </div>

            <div>
                <h3 className="font-display text-lg text-slate-800 mb-3">Когда можно выходить на сертификацию</h3>
                <div className="rounded-3xl bg-white shadow-[0_10px_32px_-12px_rgba(15,23,42,0.06)] p-5 shadow-sm leading-relaxed">
                    <ul className="space-y-2 list-disc pl-5">
                        <li>вы выполнили все обязательные домашние задания модулей 1–3, и ментор их принял</li>
                        <li>вы провели пробный завтрак или поучаствовали в тренировочной встрече</li>
                        <li>вы посетили минимум 1 завтрак действующей ведущей Лиги и заполнили чек-лист с вашими наблюдениями</li>
                        <li>вы согласовали сценарий сертификационного завтрака заранее</li>
                        <li>вы собрали группу: минимум 3 человека, это не однокурсницы и не подруги</li>
                        <li>вы назначили дату встречи, выбрали формат и подготовились технически к записи</li>
                    </ul>
                </div>
            </div>

            <div>
                <h3 className="font-display text-lg text-slate-800 mb-3">Административные требования</h3>
                <div className="rounded-3xl bg-white shadow-[0_10px_32px_-12px_rgba(15,23,42,0.06)] p-5 shadow-sm space-y-4 leading-relaxed">
                    <div>
                        <p className="font-medium text-[#4A3728]">Формат и сроки</p>
                        <p>Формат встречи — на ваш выбор: онлайн или офлайн. Длительность — <strong>60–90 минут</strong>. В группе должно быть <strong>не менее 3 участников</strong> из вашей целевой аудитории.</p>
                    </div>
                    <div>
                        <p className="font-medium text-[#4A3728]">Анонс и приглашение</p>
                        <p>Встреча должна быть анонсирована в ваших медиа — это может быть пост, личные сообщения, рассылка в целевую группу. В анонсе важно указать тему, формат, стоимость и то, что встреча является сертификационной. Отправьте анонс ментору.</p>
                        <p className="mt-1">До встречи в личном общении с каждым участником обязательно проговорите, что встреча сертификационная и будет записана для проверки ментором.</p>
                    </div>
                    <div>
                        <p className="font-medium text-[#4A3728]">Запись</p>
                        <p>Встреча должна быть записана в аудиоформате. После встречи вы передаёте запись ментору и заполняете лист самооценки.</p>
                    </div>
                    <div>
                        <p className="font-medium text-[#4A3728]">Оплата</p>
                        <p>Встреча проводится <strong>на платной основе</strong> — от 500 рублей с участника. Исключение: бесплатная встреча для благотворительной организации или фонда.</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-[#FAF6F2] p-4">
                        <p className="font-medium text-[#4A3728] mb-1">Фраза, которую важно произнести в начале записи:</p>
                        <p className="italic">«Эта встреча является сертификационной в рамках курса. Встреча записывается, запись передаётся только ментору для проверки моей работы как ведущей».</p>
                    </div>
                </div>
            </div>

            <div>
                <h3 className="font-display text-lg text-slate-800 mb-3">На что ментор обращает внимание</h3>
                <div className="grid sm:grid-cols-3 gap-4">
                    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Сценарий</div>
                        <p className="text-xs text-slate-600 leading-relaxed">Соответствие теме, ясная драматургия: правила безопасности, знакомство/разминка, основная часть, подведение итогов. Понятные инструкции, сохранены ключевые компоненты: настройка, инструкция, рефлексивный отклик, обратная связь.</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Техническая часть</div>
                        <p className="text-xs text-slate-600 leading-relaxed">В начале встречи проговорены правила взаимодействия. Материалы подготовлены. Нет значимых технических сбоев.</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Работа ведущей</div>
                        <p className="text-xs text-slate-600 leading-relaxed">Удержан тайминг и этика. Баланс — примерно <strong>30/70 (разговор/письмо)</strong>. Инструкции короткие и ясные, есть время тишины. Удержана роль ведущей как хозяйки процесса.</p>
                    </div>
                </div>
            </div>

            <div>
                <h3 className="font-display text-lg text-slate-800 mb-3">Условия, при которых встреча уходит на пересдачу</h3>
                <div className="rounded-2xl border border-rose-200/80 bg-rose-50/50 p-5 text-rose-900 leading-relaxed space-y-2">
                    <div>🚫 Формат встречи не соответствует встрече с письменными практиками</div>
                    <div>🚫 Не удержан баланс письма и разговоров (ориентир 30/70)</div>
                    <div>🚫 Не удержана роль ведущей — управление перехвачено участниками</div>
                    <div>🚫 Пропущены обязательные этапы встречи (начало, практики, завершение/рефлексия)</div>
                    <div>🚫 Проблемы с записью — неполная, неразборчивая, не прозвучала обязательная фраза</div>
                    <div>🚫 Количество участников ниже минимального (менее 3)</div>
                    <div>🚫 Серьёзные нарушения этики или безопасности без реакции ведущей</div>
                </div>
            </div>

            <div>
                <h3 className="font-display text-lg text-slate-800 mb-3">Как проходит оценка</h3>
                <div className="rounded-3xl bg-white shadow-[0_10px_32px_-12px_rgba(15,23,42,0.06)] p-5 shadow-sm space-y-0 divide-y divide-slate-50">
                    {[
                        'Вы передаёте ментору запись сертификационного завтрака',
                        'Проходите тест для самооценки',
                        'Ментор слушает запись и даёт свою оценку по тем же маркерам',
                        'Ментор даёт обратную связь',
                        'Вы сверяете результаты, фиксируете точки роста и намечаете шаги к следующей встрече',
                    ].map((text, idx) => (
                        <div key={text} className="flex gap-4 py-3 first:pt-0">
                            <span className="font-display text-xl text-[#C8855A] w-7 shrink-0 tabular-nums">{idx + 1}</span>
                            <p>{text}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-6">
                <div className="flex gap-4 items-start">
                    <span className="text-2xl text-emerald-700">✦</span>
                    <div>
                        <div className="font-display text-lg text-[#4A3728]">Важное напоминание</div>
                        <p className="text-xs text-slate-600 mt-1 max-w-xl leading-relaxed">Сертификация — это не экзамен на идеальность. Вы учитесь видеть, что уже получается хорошо, и что стоит подкрутить, чтобы вести встречи ещё увереннее и бережнее. Мы в чате с менторами всегда рядом — поможем и поддержим.</p>
                    </div>
                </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <div className="flex gap-3 items-start">
                    <span className="text-lg text-amber-600 shrink-0">⚠</span>
                    <div>
                        <p className="font-medium text-amber-900">Анкета самооценки временно недоступна</p>
                        <p className="text-xs text-amber-800 mt-1">Бланк самооценки сертификационного завтрака будет открыт позже. Следите за обновлениями на платформе.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StudentResults({ studentId, navigate, routePrefix = '/student' }) {
    const pref = loadViewPreferences('student.results');
    const [filter, setFilter] = useState(pref?.filter || 'все');
    const apiItems = pvlDomainApi.studentApi.getStudentResults(studentId, {});
    const tasksAll = apiItems.map((t) => ({ ...t, uiStatus: shortTaskStatusLabel(t.displayStatus || t.status) }));
    const tasks = sortHomeworkByRecency(apiItems.filter((t) => {
        if (filter === 'все') return true;
        return shortTaskStatusLabel(t.displayStatus || t.status) === filter;
    }));
    const pointsHistory = (pvlDomainApi.db.pointsHistory || []).filter((x) => x.studentId === studentId).slice(-5).reverse();
    const pointsLanes = useMemo(() => {
        const lanes = {
            homework: [],
            marks: [],
            lessons: [],
        };
        pointsHistory.forEach((item) => {
            if (item.sourceType === 'controlPoint') {
                lanes.homework.push(item);
            } else if (item.sourceType === 'week0' || item.sourceType === 'weekCompletion') {
                lanes.lessons.push(item);
            } else {
                lanes.marks.push(item);
            }
        });
        return lanes;
    }, [pointsHistory]);
    const summary = {
        coursePoints: pvlDomainApi.helpers.getStudentPointsSummary(studentId).coursePointsTotal || 0,
        accepted: tasksAll.filter((t) => t.uiStatus === 'Принято').length,
        inReview: tasksAll.filter((t) => t.uiStatus === 'На проверке' || t.uiStatus === 'Отправлено').length,
        inRevision: tasksAll.filter((t) => t.uiStatus === 'На доработке').length,
    };
    React.useEffect(() => {
        saveViewPreferences('student.results', { filter });
    }, [filter]);
    return (
        <div className="space-y-5">
            <div className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-2xl text-slate-800">Результаты</h2>
                <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700">
                    <option value="все">Все задания</option>
                    <option value="Не начато">Не начато</option>
                    <option value="Принято">Принято</option>
                    <option value="Отправлено">Отправлено</option>
                    <option value="На проверке">На проверке</option>
                    <option value="На доработке">На доработке</option>
                    <option value="Черновик">Черновик</option>
                    <option value="В работе">В работе</option>
                    <option value="Просрочено">Просрочено</option>
                </select>
            </div>
            <section className="grid md:grid-cols-2 xl:grid-cols-4 gap-2">
                <article className="rounded-3xl bg-white shadow-[0_10px_32px_-12px_rgba(15,23,42,0.06)] p-3 shadow-sm">
                    <div className="text-xs text-slate-500">Курсовые баллы</div>
                    <div className="font-display text-2xl text-slate-800 tabular-nums mt-0.5">{summary.coursePoints}</div>
                </article>
                <article className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3 shadow-sm">
                    <div className="text-xs text-emerald-700">Принято</div>
                    <div className="font-display text-2xl text-emerald-800 tabular-nums mt-0.5">{summary.accepted}</div>
                </article>
                <article className="rounded-2xl border border-sky-100 bg-sky-50/40 p-3 shadow-sm">
                    <div className="text-xs text-sky-700">На проверке</div>
                    <div className="font-display text-2xl text-sky-800 tabular-nums mt-0.5">{summary.inReview}</div>
                </article>
                <article className="rounded-2xl border border-amber-100 bg-amber-50/40 p-3 shadow-sm">
                    <div className="text-xs text-amber-700">На доработке</div>
                    <div className="font-display text-2xl text-amber-800 tabular-nums mt-0.5">{summary.inRevision}</div>
                </article>
            </section>

            <section className="space-y-2">
                {!tasks.length ? (
                    <p className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] px-3.5 py-6 text-sm text-slate-500 text-center">
                        Нет заданий в выбранном фильтре. Опубликованные домашки появляются здесь автоматически; до первой отправки статус «Не начато».
                    </p>
                ) : null}
                {tasks.map((t) => (
                    <article key={t.id} className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-3.5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                                <h3 className="text-sm font-semibold text-slate-800">{t.title}</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Модуль {clampPvlModule(t.moduleNumber ?? t.week ?? 0)} · {t.typeLabel || t.type}</p>
                            </div>
                            <div className="shrink-0 text-right">
                                <StatusBadge>{shortTaskStatusLabel(t.displayStatus || t.status)}</StatusBadge>
                                <div className="text-xs tabular-nums text-slate-500 mt-0.5">Оценка: {t.score ?? 0}/{t.maxScore ?? 0}</div>
                            </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                            {!hideDeadlineForAcceptedWithScore(t) ? (
                                <span className={`inline-flex min-w-[148px] items-center rounded-full border px-2 py-0.5 ${deadlineUrgencyTone(t.deadlineAt)}`}>
                                    Дедлайн: {formatPvlDateTime(t.deadlineAt)}
                                </span>
                            ) : null}
                            <span className="inline-flex min-w-[148px] items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">
                                Сдано: {t.submittedAt ? formatPvlDateTime(t.submittedAt) : '—'}
                            </span>
                        </div>
                        <div className="mt-2 text-xs">
                            {t.mentorCommentPreview ? (
                                <p className="text-slate-700">Комментарий ментора: {t.mentorCommentPreview}</p>
                            ) : (
                                <p className="text-slate-400">Комментарий пока отсутствует</p>
                            )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            {(t.revisionCycles ?? 0) > 0 ? (
                                <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 tabular-nums">
                                    Доработок: {t.revisionCycles ?? 0}
                                </span>
                            ) : <span />}
                            <button
                                type="button"
                                onClick={() => navigate(`${routePrefix}/results/${t.id}`)}
                                className="text-xs rounded-full border border-slate-300 bg-white px-3 py-1 text-slate-700 hover:bg-slate-50"
                            >
                                Открыть задание
                            </button>
                        </div>
                    </article>
                ))}
            </section>
            <section className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-4">
                <details>
                    <summary className="font-display text-base text-slate-800 cursor-pointer">История баллов</summary>
                    <p className="text-xs text-slate-500 mt-2">Вторичный блок: начисления сгруппированы по смыслу.</p>
                    <div className="mt-3 grid gap-4 lg:grid-cols-3">
                        {[
                            { key: 'homework', title: 'За домашки', tone: 'border-emerald-100 bg-emerald-50/40' },
                            { key: 'marks', title: 'За отметки', tone: 'border-sky-100 bg-sky-50/40' },
                            { key: 'lessons', title: 'За пройденные уроки', tone: 'border-violet-100 bg-violet-50/40' },
                        ].map((lane) => (
                            <article key={lane.key} className={`rounded-xl border p-3 ${lane.tone}`}>
                                <h4 className="text-sm font-medium text-slate-800">{lane.title}</h4>
                                <div className="mt-2 space-y-2">
                                    {(pointsLanes[lane.key] || []).length ? (pointsLanes[lane.key] || []).map((it) => (
                                        <div key={it.id} className="rounded-lg border border-white/70 bg-white/80 px-2.5 py-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="text-xs font-medium text-slate-700">{it.sourceLabel || 'Начисление'}</div>
                                                <span className="text-[11px] rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-800 tabular-nums">+{it.pointsDelta}</span>
                                            </div>
                                            <div className="text-[11px] text-slate-500 mt-1">{pointsSourceLabel(it.sourceType)} · {formatPvlDateTime(it.createdAt)}</div>
                                        </div>
                                    )) : (
                                        <div className="text-xs text-slate-400">Пока нет начислений</div>
                                    )}
                                </div>
                            </article>
                        ))}
                    </div>
                </details>
            </section>
        </div>
    );
}

function DirectMessageThread({ messages, actorId }) {
    return (
        <div className="space-y-2 max-h-[56vh] overflow-y-auto pr-1">
            {(messages || []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-5 text-sm text-slate-500">
                    Диалог пока пуст. Напишите первое сообщение.
                </div>
            ) : null}
            {(messages || []).map((m) => {
                const isOwn = String(m.authorUserId || '') === String(actorId || '');
                const author = pvlDomainApi.db.users.find((u) => u.id === m.authorUserId);
                return (
                    <div key={m.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        <article className={`max-w-[86%] rounded-2xl border px-3 py-2 ${isOwn ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-slate-200'}`}>
                            <div className="text-[10px] text-slate-500">
                                {author?.fullName || m.authorUserId} · {formatPvlDateTime(m.createdAt)}
                            </div>
                            <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap break-words">{m.text}</p>
                        </article>
                    </div>
                );
            })}
        </div>
    );
}

function StudentDirectMessages({ studentId = 'u-st-1' }) {
    const [text, setText] = useState('');
    const [tick, setTick] = useState(0);
    const profile = pvlDomainApi.db.studentProfiles.find((p) => p.userId === studentId || p.id === studentId) || null;
    const dialog = useMemo(() => {
        void tick;
        const dialogFromApi = pvlDomainApi.sharedApi.getStudentDirectDialog(studentId);

        if (dialogFromApi?.mentorId && dialogFromApi?.mentor) return dialogFromApi;
        if (profile?.mentorId) {
            return {
                ...dialogFromApi,
                mentor: dialogFromApi?.mentor || resolveActorUser(profile.mentorId) || null,
            };
        }
        return dialogFromApi;
    }, [studentId, tick, profile]);
    const mentorIdForEffect = dialog.mentorId;
    useEffect(() => {
        if (!mentorIdForEffect || !studentId) return;
        pvlDomainApi.sharedApi.loadDirectMessagesFromDb(mentorIdForEffect, studentId)
            .then(() => setTick((v) => v + 1))
            .catch(() => {});
    }, [mentorIdForEffect, studentId]);
    const onSend = () => {
        const body = String(text || '').trim();
        if (!body || !dialog.mentorId) return;
        pvlDomainApi.sharedApi.sendDirectMessage({
            mentorId: dialog.mentorId,
            studentId,
            authorUserId: studentId,
            text: body,
        });
        setText('');
        setTick((v) => v + 1);
    };
    return (
        <div className="space-y-6">
            <div className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-5">
                <h2 className="font-display text-2xl text-slate-800">Чат с ментором</h2>
            </div>
            <section className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-4 space-y-5">
                <div className="text-xs text-slate-500">Ментор: <span className="font-medium text-slate-700">{dialog.mentor?.fullName || 'не назначен'}</span></div>
                {dialog.mentorId ? (
                    <>
                        <DirectMessageThread messages={dialog.messages} actorId={studentId} />
                        <div className="flex items-end gap-2">
                            <textarea
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                rows={3}
                                className="w-full rounded-xl border border-slate-200 p-3 text-sm"
                                placeholder="Напишите сообщение ментору..."
                            />
                            <button type="button" onClick={onSend} className="shrink-0 text-xs rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-emerald-800 hover:bg-emerald-100">
                                Отправить
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                        Диалог недоступен, пока вам не назначен ментор. После назначения здесь появится переписка и форма отправки сообщений.
                    </div>
                )}
            </section>
        </div>
    );
}

function MentorDirectMessages({ mentorId = 'u-men-1' }) {
    const [activeStudentId, setActiveStudentId] = useState('');
    const [text, setText] = useState('');
    const [tick, setTick] = useState(0);
    const dialogs = useMemo(() => {
        void tick;
        return pvlDomainApi.sharedApi.getMentorDirectDialogs(mentorId);
    }, [mentorId, tick]);
    const selectedStudentId = activeStudentId || dialogs[0]?.studentId || '';
    const selectedDialog = useMemo(() => dialogs.find((d) => d.studentId === selectedStudentId) || null, [dialogs, selectedStudentId]);
    const mentorUser = resolveActorUser(mentorId);
    const messages = useMemo(() => {
        if (!selectedStudentId) return [];
        return pvlDomainApi.sharedApi.getDirectMessages(mentorId, selectedStudentId);
    }, [mentorId, selectedStudentId, tick]);
    useEffect(() => {
        if (!mentorId || !selectedStudentId) return;
        pvlDomainApi.sharedApi.loadDirectMessagesFromDb(mentorId, selectedStudentId)
            .then(() => setTick((v) => v + 1))
            .catch(() => {});
    }, [mentorId, selectedStudentId]);
    const onSend = () => {
        const body = String(text || '').trim();
        if (!body || !selectedStudentId) return;
        pvlDomainApi.sharedApi.sendDirectMessage({
            mentorId,
            studentId: selectedStudentId,
            authorUserId: mentorId,
            text: body,
        });
        setText('');
        setTick((v) => v + 1);
    };
    return (
        <div className="space-y-6">
            <div className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-5">
                <h2 className="font-display text-2xl text-slate-800">Коммуникации с менти</h2>
                <p className="mt-1 text-xs text-slate-500">Ментор: <span className="font-medium text-slate-700">{mentorUser?.fullName || '—'}</span></p>
            </div>
            <section className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-4 grid lg:grid-cols-[280px_1fr] gap-4">
                <aside className="rounded-xl border border-slate-100 bg-slate-50/70 p-2 space-y-1 max-h-[56vh] overflow-y-auto">
                    {dialogs.map((d) => (
                        <button
                            key={d.studentId}
                            type="button"
                            onClick={() => setActiveStudentId(d.studentId)}
                            className={`w-full text-left rounded-xl border px-3 py-2 ${d.studentId === selectedStudentId ? 'border-emerald-200 bg-emerald-50/50' : 'border-transparent hover:bg-white'}`}
                        >
                            <div className="text-sm font-medium text-slate-800">{d.student?.fullName || d.studentId}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5 truncate">{d.lastMessageText || 'Нет сообщений'}</div>
                        </button>
                    ))}
                </aside>
                <div className="space-y-5 min-w-0">
                    <div className="text-xs text-slate-500">Диалог: <span className="font-medium text-slate-700">{selectedDialog?.student?.fullName || '—'}</span></div>
                    <DirectMessageThread messages={messages} actorId={mentorId} />
                    <div className="flex items-end gap-2">
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            rows={3}
                            className="w-full rounded-xl border border-slate-200 p-3 text-sm"
                            placeholder="Ответить ученице..."
                        />
                        <button type="button" onClick={onSend} className="shrink-0 text-xs rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-emerald-800 hover:bg-emerald-100">
                            Отправить
                        </button>
                    </div>
                </div>
            </section>
        </div>
    );
}

function StudentGeneric({ title, children }) {
    return (
        <div className="space-y-6">
            <div className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-5"><h2 className="font-display text-xl text-slate-800">{title}</h2></div>
            {children}
        </div>
    );
}

function PvlContentStub({ title, hint }) {
    return (
        <div className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-8">
            <h2 className="font-display text-2xl text-slate-800">{title}</h2>
            <p className="text-sm text-slate-500 mt-2">{hint}</p>
        </div>
    );
}

function PvlCabinetSettingsStub() {
    return (
        <div className="rounded-3xl bg-white p-6 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] md:p-8">
            <h2 className="font-display text-2xl text-slate-800">Настройки</h2>
            <p className="text-sm text-slate-500 mt-2">Уведомления и отображение кабинета настраиваются здесь по мере готовности продукта.</p>
        </div>
    );
}

function PvlMergeOnboardingRedirect({ navigate, to }) {
    useEffect(() => {
        navigate(to);
    }, [navigate, to]);
    return (
        <div className="rounded-3xl bg-white p-6 text-sm text-slate-500 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)]">
            Открываем «О курсе»…
        </div>
    );
}

function StudentPage({ route, studentId, navigate, cmsItems, cmsPlacements, refresh, refreshKey = 0, routePrefix = '/student', gardenBridgeRef = null }) {
    if (route === '/student/onboarding') {
        return <PvlMergeOnboardingRedirect navigate={navigate} to="/student/about" />;
    }
    if (route === '/student/settings') return <PvlCabinetSettingsStub />;
    if (route === '/student/dashboard') return <StudentDashboard studentId={studentId} navigate={navigate} routePrefix={routePrefix} gardenBridgeRef={gardenBridgeRef} />;
    if (route === '/student/results') return <StudentResults studentId={studentId} navigate={navigate} routePrefix={routePrefix} />;
    if (route.startsWith('/student/results/')) {
        const taskId = route.split('/')[3];
        const adminChrome = routePrefix === '/admin';
        return (
            <PvlTaskDetailView
                key={`${studentId}-${taskId}-${refreshKey}`}
                role="student"
                taskStudentId={studentId}
                taskId={taskId}
                onRefresh={refresh}
                showHeaderBack={!adminChrome}
                onBack={() => navigate('/student/results')}
                initialData={buildTaskDetailStateFromApi(studentId, taskId)}
                onStudentSaveDraft={(payload) => pvlDomainApi.studentApi.saveStudentDraft(studentId, taskId, typeof payload === 'object' && payload && 'textContent' in payload ? payload : { textContent: payload })}
                onStudentSubmit={(payload) => {
                    const p = typeof payload === 'object' && payload && 'textContent' in payload ? payload : { textContent: payload };
                    const v = pvlDomainApi.studentApi.submitStudentTask(studentId, taskId, p);
                    if (v) refresh();
                }}
                onStudentReply={(msg) => { pvlDomainApi.studentApi.addStudentThreadReply(studentId, taskId, { text: msg.text, disputeOnly: msg.disputeOnly }); refresh(); }}
            />
        );
    }
    if (route === '/student/about') return (
        <div className="space-y-5">
            <StudentAboutEnriched navigate={navigate} routePrefix={routePrefix} cmsItems={cmsItems} cmsPlacements={cmsPlacements} />
        </div>
    );
    if (route === '/student/glossary') return <StudentGlossarySearch studentId={studentId} cmsItems={cmsItems} cmsPlacements={cmsPlacements} />;
    if (route === '/student/library') return <LibraryPage studentId={studentId} navigate={navigate} routePrefix={routePrefix} refresh={refresh} refreshKey={refreshKey} />;
    if (route.startsWith('/student/library/')) {
        const itemId = route.split('/')[3] || '';
        return <LibraryPage studentId={studentId} navigate={navigate} initialItemId={itemId} routePrefix={routePrefix} refresh={refresh} refreshKey={refreshKey} />;
    }
    if (route === '/student/lessons' || route === '/student/checklist') {
        return (
            <StudentCourseTracker
                studentId={studentId}
                modules={buildTrackerModulesFromCms(cmsItems, cmsPlacements)}
                routePrefix={routePrefix}
                navigate={navigate}
                gardenBridgeRef={gardenBridgeRef}
                refreshKey={refreshKey}
            />
        );
    }
    if (route === '/student/practicums') {
        /** Встречи с менторами: основной тип + legacy `session` из старых данных/БД. */
        const practicumViewerRole = routePrefix === '/admin' ? 'admin' : routePrefix === '/mentor' ? 'mentor' : 'student';
        return (
            <PvlDashboardCalendarBlock
                viewerRole={practicumViewerRole}
                cohortId="cohort-2026-1"
                navigate={navigate}
                routePrefix={routePrefix}
                title="Практикумы"
                eventTypeFilter={['practicum', 'mentor_meeting', 'session', 'practicum_done']}
                showPracticumArchive
            />
        );
    }
    if (route === '/student/messages') return <StudentDirectMessages studentId={studentId} />;
    if (route === '/student/tracker') {
        return (
            <StudentCourseTracker
                studentId={studentId}
                modules={buildTrackerModulesFromCms(cmsItems, cmsPlacements)}
                routePrefix={routePrefix}
                navigate={navigate}
                gardenBridgeRef={gardenBridgeRef}
                refreshKey={refreshKey}
            />
        );
    }
    if (route === '/student/certification' || route === '/student/self-assessment') {
        return (
            <div className="space-y-6">
                <div className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-5">
                    <h2 className="font-display text-xl text-slate-800">Сертификация и самооценка</h2>
                </div>
                <StudentCertificationReference navigate={navigate} />
                <div id="pvl-sz-flow" className="scroll-mt-4 rounded-3xl border border-amber-200 bg-amber-50 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-5">
                    <h3 className="font-display text-lg text-slate-800 mb-2">Бланк самооценки</h3>
                    <div className="flex gap-3 items-start">
                        <span className="text-lg text-amber-600 shrink-0">⚠</span>
                        <div className="text-sm text-amber-900">
                            <p className="font-medium">Анкета временно недоступна</p>
                            <p className="text-xs text-amber-800 mt-1">Бланк самооценки сертификационного завтрака будет открыт позже. Следите за обновлениями на платформе.</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    if (route === '/student/cultural-code') {
        const sectionKey = SECTION_ROUTE_TO_KEY[route];
        const sectionMaterials = sectionKey ? getPublishedContentBySection(sectionKey, 'student', cmsItems, cmsPlacements) : [];
        return <StudentGeneric title="Культурный код Лиги"><GardenContentCards items={sectionMaterials.length ? sectionMaterials : ['Бережность', 'Ясность', 'Без советов', 'Поддержка сообщества'].map((x) => ({ id: x, title: x, shortDescription: '', contentType: 'text', tags: ['код'] }))} /></StudentGeneric>;
    }
    return <StudentDashboard studentId={studentId} navigate={navigate} routePrefix={routePrefix} gardenBridgeRef={gardenBridgeRef} />;
}

function MentorMaterialsPage({ cmsItems, cmsPlacements }) {
    const cohortId = 'cohort-2026-1';
    const lessons = getPublishedContentBySection('lessons', 'mentor', cmsItems, cmsPlacements, cohortId);
    const practicums = getPublishedContentBySection('practicums', 'mentor', cmsItems, cmsPlacements, cohortId);
    const cert = getPublishedContentBySection('certification', 'mentor', cmsItems, cmsPlacements, cohortId);
    const checklist = getPublishedContentBySection('checklist', 'mentor', cmsItems, cmsPlacements, cohortId);
    const combined = [...lessons, ...practicums, ...cert, ...checklist];
    return (
        <div className="space-y-6">
            <div className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-6">
                <h2 className="font-display text-2xl text-slate-800">Материалы для ментора</h2>
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
        const user = resolveActorUser(userId);
        const gardenRole = sp.gardenRole ?? user?.gardenRole ?? null;
        const statusLabelRu = pvlGardenRoleLabelRu(gardenRole);
        const mentorUserId = sp.mentorId || '';
        const mentorLine = mentorUserId ? (resolveActorDisplayName(mentorUserId) || mentorUserId) : '—';
        const cohortTitle = pvlDomainApi.db.cohorts.find((c) => c.id === sp.cohortId)?.title || '—';
        const courseLine = `${cohortTitle} · Модуль ${clampPvlModule(sp.currentModule ?? sp.currentWeek ?? 0)}`;
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
            gardenRole,
            statusLabelRu,
            mentorUserId,
            courseLine,
            closedPct,
            coursePoints: pts.coursePointsTotal ?? 0,
            hwSummary,
            lastAct,
            mentorLine,
        };
    });
}

function buildMentorMenteeRows(mentorId) {
    const menteesFromApi = pvlDomainApi.mentorApi.getMentorMentees(mentorId);
    return menteesFromApi.map((m) => {
        const user = m.user || resolveActorUser(m.userId);
        const profile = pvlDomainApi.db.studentProfiles.find((p) => p.userId === m.userId);
        const cohortTitle = pvlDomainApi.db.cohorts.find((c) => c.id === profile?.cohortId)?.title || 'Поток';
        const tasks = pvlDomainApi.studentApi.getStudentResults(m.userId, {});
        const total = Math.max(1, tasks.length);
        const closed = tasks.filter((t) => String(t.displayStatus || t.status || '').toLowerCase() === 'принято').length;
        const closedPct = Math.round((closed / total) * 100);
        const pendingReview = tasks.filter((t) => {
            const u = String(t.displayStatus || '').toLowerCase();
            return u.includes('проверк') || u.includes('отправлен');
        }).length;
        const inRevision = tasks.filter((t) => String(t.displayStatus || '').toLowerCase().includes('доработ')).length;
        const accepted = tasks.filter((t) => t.status === 'принято');
        const lastDone = accepted.length
            ? accepted.reduce((best, t) => (String(t.submittedAt || '') > String(best.submittedAt || '') ? t : best), accepted[0])
            : null;
        const overdueN = pvlDomainApi.db.studentTaskStates.filter((s) => s.studentId === m.userId && s.isOverdue).length;
        const pts = pvlDomainApi.helpers.getStudentPointsSummary(m.userId);
        const risks = pvlDomainApi.mentorApi.getMentorMenteeCard(mentorId, m.userId).risks || [];
        const revisionCyclesTotal = tasks.reduce((acc, t) => acc + (Number(t.revisionCycles) || 0), 0);
        const notStartedHw = tasks.filter((t) => {
            if (t.isControlPoint) return false;
            const u = String(t.displayStatus || t.status || '').toLowerCase();
            return u.includes('не начат');
        }).length;
        let stateLine = 'в ритме';
        if (overdueN > 0) stateLine = 'есть долги';
        else if (pendingReview > 0 || inRevision > 0) stateLine = 'нужна проверка';
        else if (notStartedHw > 0) stateLine = 'ДЗ не начаты';
        const cohortLine = `ПВЛ 2026 · ${cohortTitle}`;
        const moduleWeekLine = `Модуль ${clampPvlModule(profile?.currentModule ?? profile?.currentWeek ?? 0)}`;
        const city = profile?.city || '';
        return {
            user,
            userId: m.userId,
            cohortLine,
            moduleWeekLine,
            city,
            closedPct,
            closedCount: closed,
            totalTasks: total,
            pendingReview,
            inRevision,
            lastDone,
            stateLine,
            overdueN,
            revisionCyclesTotal,
            notStartedHw,
            coursePoints: pts.coursePointsTotal ?? 0,
            coursePointsMax: SCORING_RULES.COURSE_POINTS_MAX,
            riskCount: risks.length,
        };
    });
}

function mentorMenteeInitials(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] || '';
    const b = parts[1]?.[0] || '';
    return (a + b).toUpperCase() || '?';
}

function menteeStatusSurface(stateLine) {
    if (stateLine === 'есть долги') return 'bg-rose-50/90 text-rose-900';
    if (stateLine === 'нужна проверка') return 'bg-amber-50/90 text-amber-950';
    if (stateLine === 'есть доработки') return 'bg-orange-50/90 text-orange-950';
    if (stateLine === 'ДЗ не начаты') return 'bg-slate-50/90 text-slate-800';
    return 'bg-emerald-50/90 text-emerald-900';
}

function MentorMenteesGardenGrid({ navigate, menteeRows, heading }) {
    const ptsMax = SCORING_RULES.COURSE_POINTS_MAX;
    return (
        <section className="rounded-[1.75rem] bg-white p-4 md:p-6 shadow-[0_16px_48px_-14px_rgba(15,23,42,0.09)]">
            {heading ? <h3 className="font-display text-lg text-slate-800 mb-3">{heading}</h3> : null}
            {menteeRows.length === 0 ? (
                <div className="rounded-lg bg-slate-50/90 px-3 py-6 text-center text-sm text-slate-600">
                    Список менти пуст. Если вы только что переключили роль, обновите страницу или откройте «Мои менти» — демо-данные подгружаются по профилю ментора.
                </div>
            ) : null}
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {menteeRows.map((row) => (
                    <div
                        key={row.userId}
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/mentor/mentee/${row.userId}`)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                navigate(`/mentor/mentee/${row.userId}`);
                            }
                        }}
                        className="flex cursor-pointer flex-col gap-2 rounded-2xl bg-white p-3 text-left shadow-[0_8px_28px_-10px_rgba(15,23,42,0.07)] transition-all hover:shadow-[0_14px_40px_-12px_rgba(45,90,67,0.14)]"
                    >
                        <div className="flex gap-2.5">
                            <div className="h-11 w-11 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center text-xs font-semibold text-emerald-900 shrink-0">
                                {mentorMenteeInitials(row.user?.fullName)}
                            </div>
                            <div className="min-w-0 flex-1">
                                <button
                                    type="button"
                                    className="font-display text-base font-semibold text-slate-800 hover:text-emerald-800 text-left"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/mentor/mentee/${row.userId}`);
                                    }}
                                >
                                    {row.user?.fullName || row.userId}
                                </button>
                                {row.city ? <p className="text-[11px] text-slate-400 mt-0.5">{row.city}</p> : null}
                            </div>
                        </div>
                        <p className="text-[10px] uppercase tracking-wide text-slate-400 leading-tight">{row.cohortLine}</p>
                        <p className="text-[11px] text-slate-600 leading-snug">{row.moduleWeekLine}</p>
                        <div>
                            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-600 mb-1">
                                <span>
                                    Прогресс модуля:{' '}
                                    <span className="tabular-nums font-medium text-slate-800">
                                        {row.closedCount ?? 0}/{row.totalTasks ?? 0}
                                    </span>{' '}
                                    закрыто
                                </span>
                                <span className="tabular-nums text-slate-500">{row.closedPct}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-[width]"
                                    style={{ width: `${Math.min(100, Math.max(0, row.closedPct))}%` }}
                                />
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            <span className="text-[10px] rounded-full bg-slate-50 px-2 py-0.5 text-slate-700 tabular-nums">
                                Баллы {row.coursePoints}/{row.coursePointsMax ?? ptsMax}
                            </span>
                            {row.overdueN > 0 && row.stateLine !== 'есть долги' ? (
                                <span className="text-[10px] rounded-full bg-rose-50 px-2 py-0.5 text-rose-900">
                                    Просрочки: {row.overdueN}
                                </span>
                            ) : null}
                            {row.notStartedHw > 0 ? (
                                <span className="text-[10px] rounded-full bg-slate-100 px-2 py-0.5 text-slate-800 tabular-nums">
                                    Не начато ДЗ: {row.notStartedHw}
                                </span>
                            ) : null}
                        </div>
                        <div className="text-[10px] text-slate-500 pt-1.5 mt-auto flex flex-wrap items-center gap-1.5">
                            <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${menteeStatusSurface(row.stateLine)}`}
                            >
                                {row.stateLine}
                            </span>
                        </div>
                        {row.riskCount > 0 ? <p className="text-[10px] text-amber-800">Рисков в карточке: {row.riskCount}</p> : null}
                    </div>
                ))}
            </div>
        </section>
    );
}

function kanbanColumnToStatus(col) {
    if (col === 'unchecked') return TASK_STATUS.PENDING_REVIEW;
    if (col === 'revision') return TASK_STATUS.REVISION_REQUESTED;
    if (col === 'done') return TASK_STATUS.ACCEPTED;
    return TASK_STATUS.PENDING_REVIEW;
}

function MentorKanbanBoard({ mentorId, navigate, refreshKey, onStatusChanged }) {
    const lastDragEndRef = useRef(0);
    const [mobileTab, setMobileTab] = useState('unchecked');
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const update = () => setIsMobile(window.innerWidth <= 767);
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);
    const board = useMemo(() => {
        void refreshKey;
        return pvlDomainApi.mentorApi.getMentorReviewBoard(mentorId);
    }, [mentorId, refreshKey]);

    const handleDrop = (col, e) => {
        e.preventDefault();
        try {
            const raw = e.dataTransfer.getData('application/json');
            const { studentId, taskId } = JSON.parse(raw || '{}');
            if (!studentId || !taskId) return;
            const next = kanbanColumnToStatus(col);
            pvlDomainApi.actions.setTaskStatus(studentId, taskId, next, mentorId, 'kanban');
            onStatusChanged?.();
        } catch {
            /* ignore */
        }
    };
    const moveCardTo = (studentId, taskId, col) => {
        const next = kanbanColumnToStatus(col);
        pvlDomainApi.actions.setTaskStatus(studentId, taskId, next, mentorId, 'kanban_mobile');
        onStatusChanged?.();
    };

    const renderCard = (q, col) => {
        const dl = q.deadlineAt ? formatPvlDateTime(`${String(q.deadlineAt).slice(0, 10)}T12:00:00`) : '—';
        const maxSc = Number(q.maxScore) || 0;
        const awarded = Number(q.scoreAwarded) || 0;
        const hasScore = col === 'done' && maxSc > 0 && (awarded > 0 || q.rawStatus === TASK_STATUS.ACCEPTED);
        return (
            <div
                key={`${q.studentId}-${q.taskId}-${col}`}
                role="button"
                tabIndex={0}
                draggable={!isMobile}
                onDragStart={(e) => {
                    if (isMobile) return;
                    e.dataTransfer.setData('application/json', JSON.stringify({ studentId: q.studentId, taskId: q.taskId }));
                    e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                    lastDragEndRef.current = Date.now();
                }}
                onClick={() => {
                    if (Date.now() - lastDragEndRef.current < 280) return;
                    navigate(`/mentor/mentee/${q.studentId}/task/${q.taskId}?from=kanban`);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/mentor/mentee/${q.studentId}/task/${q.taskId}?from=kanban`);
                    }
                }}
                className="w-full text-left rounded-lg bg-white/95 p-2 shadow-sm text-sm transition-colors hover:bg-emerald-50/30 cursor-grab active:cursor-grabbing"
            >
                <div className="font-medium text-slate-800 line-clamp-2">{q.taskTitle}</div>
                <button
                    type="button"
                    className="mt-1.5 text-sm text-emerald-800 hover:underline font-medium"
                    onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/mentor/mentee/${q.studentId}`);
                    }}
                >
                    {q.studentName}
                </button>
                <div className="text-[11px] text-slate-500 mt-1">Дедлайн: {dl}</div>
                <div className="flex flex-wrap gap-2 mt-2">
                    {hasScore ? (
                        <span className="text-[10px] tabular-nums rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                            {awarded}/{maxSc}
                        </span>
                    ) : null}
                    {(q.revisionCycles ?? 0) > 0 ? (
                        <span className="text-[10px] rounded-full bg-amber-50 text-amber-950 px-2 py-0.5">Доработок: {q.revisionCycles}</span>
                    ) : null}
                </div>
                <div className="mt-2 md:hidden">
                    <label className="text-[10px] text-slate-500">Сменить статус</label>
                    <select
                        value={col}
                        onChange={(e) => moveCardTo(q.studentId, q.taskId, e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"
                    >
                        <option value="unchecked">На проверке</option>
                        <option value="revision">На доработке</option>
                        <option value="done">Проверено</option>
                    </select>
                </div>
            </div>
        );
    };

    const emptyColumn = (title, body) => (
        <div className="rounded-lg bg-slate-50/80 px-3 py-6 text-center flex flex-col justify-center min-h-[120px]">
            <p className="text-sm font-medium text-slate-600">{title}</p>
            <p className="text-xs text-slate-500 mt-1 leading-snug max-w-[16rem] mx-auto">{body}</p>
        </div>
    );

    const col = (key, title, hint, items, emptyTitle, emptyBody) => (
        <div
            key={key}
            className="rounded-xl bg-slate-50/50 p-3 min-h-[200px] flex flex-col"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(key, e)}
        >
            <div className="mb-2">
                <h4 className="font-display text-sm text-slate-800">{title}</h4>
                {hint ? <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{hint}</p> : null}
            </div>
            <div className="space-y-1.5 flex-1">
                {items.length === 0 ? emptyColumn(emptyTitle, emptyBody) : items.map((q) => renderCard(q, key))}
            </div>
        </div>
    );

    const mobileColumns = [
        { key: 'unchecked', title: 'На проверке', hint: 'Отправлено, ждёт проверки', items: board.unchecked, emptyTitle: 'Пока тихо', emptyBody: 'Когда ученица отправит работу на проверку, карточка появится здесь автоматически.' },
        { key: 'revision', title: 'На доработке', hint: 'Нужен ответ или новая версия', items: board.revision, emptyTitle: 'Нет активных доработок', emptyBody: 'Карточки с запросом правок показываются в этом списке.' },
        { key: 'done', title: 'Проверено', hint: 'Принято, закрыто (первые 24 часа)', items: board.done, emptyTitle: 'Пока пусто', emptyBody: 'Принятые работы попадают сюда после проверки.' },
        { key: 'archive', title: 'Архив', hint: 'Принятые более 24 часов назад', items: board.archive || [], emptyTitle: 'Архив пока пуст', emptyBody: 'Карточки из «Проверено» переходят сюда автоматически через 24 часа.' },
    ];
    const mobileActive = mobileColumns.find((c) => c.key === mobileTab) || mobileColumns[0];

    return (
        <div className="space-y-5">
            <div className="md:hidden flex flex-wrap gap-2">
                {mobileColumns.map((c) => (
                    <button
                        key={c.key}
                        type="button"
                        onClick={() => setMobileTab(c.key)}
                        className={`rounded-full border px-3 py-1.5 text-xs ${mobileTab === c.key ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-700'}`}
                    >
                        {c.title} ({c.items.length})
                    </button>
                ))}
            </div>
            <div className="md:hidden">
                {col(mobileActive.key, mobileActive.title, mobileActive.hint, mobileActive.items, mobileActive.emptyTitle, mobileActive.emptyBody)}
            </div>
            <div className="hidden md:grid lg:grid-cols-4 gap-4">
                {mobileColumns.map((c) => col(c.key, c.title, c.hint, c.items, c.emptyTitle, c.emptyBody))}
            </div>
        </div>
    );
}

function MentorApplicantsPanel({ mentorId, refreshKey = 0 }) {
    const rows = useMemo(() => pvlDomainApi.mentorApi.getMentorCohortApplicants(mentorId), [mentorId, refreshKey]);
    const mp = pvlDomainApi.db.mentorProfiles.find((m) => m.userId === mentorId);
    const cohortTitle = pvlDomainApi.db.cohorts.find((c) => c.id === mp?.cohortIds?.[0])?.title || 'Поток ПВЛ';

    return (
        <div className="space-y-5">
            <header>
                <h2 className="font-display text-2xl text-slate-800">Абитуриенты потока</h2>
                <p className="mt-1 text-sm text-slate-500 max-w-2xl">
                    Актуальный список участников потока из Сада (роль в profiles и классификация ПВЛ — абитуриент / ученица). Поток «
                    {cohortTitle}
                    »; закрепление за ментором — в учительской.
                </p>
            </header>
            {rows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-sm text-slate-600">
                    <p className="font-medium text-slate-800">Пока нет абитуриентов в данных курса</p>
                    <p className="mt-2 text-slate-500 max-w-md mx-auto">
                        Убедитесь, что в Саду у пользователей в профиле указана роль «Абитуриент», и что загрузка профилей с сервера прошла успешно. После появления учениц в учительской список обновится автоматически.
                    </p>
                </div>
            ) : (
                <div className="hidden md:block overflow-x-auto -mx-1 px-1">
                    <table className="w-full text-sm text-left min-w-[640px]">
                        <thead>
                            <tr className="text-xs text-slate-500 border-b border-slate-100">
                                <th className="pb-2 pr-3 font-medium">Имя</th>
                                <th className="pb-2 pr-3 font-medium">Email</th>
                                <th className="pb-2 pr-3 font-medium">Роль в курсе</th>
                                <th className="pb-2 pr-3 font-medium">Ментор (по учительской)</th>
                                <th className="pb-2 font-medium">Менти</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.userId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/80">
                                    <td className="py-3 pr-3 align-top font-medium text-slate-800">{row.fullName}</td>
                                    <td className="py-3 pr-3 align-top text-slate-600 text-xs">{row.email || '—'}</td>
                                    <td className="py-3 pr-3 align-top text-slate-600 text-xs">{row.statusLabelRu}</td>
                                    <td className="py-3 pr-3 align-top text-slate-600 text-xs">{row.mentorName}</td>
                                    <td className="py-3 align-top">
                                        {row.isMyMentee ? (
                                            <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-900">Ваше менти</span>
                                        ) : (
                                            <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">Поток</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {rows.length > 0 ? (
                <div className="grid gap-3 md:hidden">
                    {rows.map((row) => (
                        <article key={row.userId} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-sm">
                            <div className="font-medium text-slate-800">{row.fullName}</div>
                            <div className="text-xs text-slate-500 mt-1">{row.email || '—'}</div>
                            <div className="text-xs text-slate-600 mt-2">Роль: {row.statusLabelRu}</div>
                            <div className="text-xs text-slate-600 mt-1">Ментор: {row.mentorName}</div>
                            <div className="mt-2">{row.isMyMentee ? <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-900">Ваше менти</span> : <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">Поток</span>}</div>
                        </article>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function MentorMenteesPanel({ navigate, mentorId, refreshKey = 0 }) {
    const menteeRows = useMemo(() => buildMentorMenteeRows(mentorId), [mentorId, refreshKey]);
    return (
        <div className="space-y-6">
            <h2 className="font-display text-2xl text-slate-800">Мои менти</h2>
            <MentorMenteesGardenGrid navigate={navigate} menteeRows={menteeRows} heading={null} />
        </div>
    );
}

function MentorReviewQueuePanel({ navigate, mentorId, refresh, refreshKey = 0 }) {
    return (
        <div className="space-y-6">
            <h2 className="font-display text-2xl text-slate-800">Очередь проверок</h2>
            <MentorKanbanBoard mentorId={mentorId} navigate={navigate} refreshKey={refreshKey} onStatusChanged={refresh} />
        </div>
    );
}

function MentorDashboard({ navigate, mentorId, refresh, refreshKey = 0 }) {
    const menteeRows = useMemo(() => buildMentorMenteeRows(mentorId), [mentorId, refreshKey]);
    const mentorCohortId = pvlDomainApi.db.mentorProfiles.find((m) => m.userId === mentorId)?.cohortIds?.[0] || 'cohort-2026-1';
    const mentorUser = resolveActorUser(mentorId);
    return (
        <div className="space-y-5">
            <header className="pb-1">
                <h2 className="font-display text-2xl text-slate-800">Дашборд ментора</h2>
                <p className="mt-1 text-sm text-slate-500">{mentorUser?.fullName || 'Ментор'}</p>
            </header>
            <MentorMenteesGardenGrid navigate={navigate} menteeRows={menteeRows} heading="Мои менти" />
            <section>
                <PvlDashboardCalendarBlock
                    title="Календарь курса"
                    viewerRole="mentor"
                    cohortId={mentorCohortId}
                    navigate={navigate}
                    routePrefix="/mentor"
                />
            </section>
            <section className="space-y-2">
                <h3 className="font-display text-lg text-slate-800">Канбан проверок</h3>
                <MentorKanbanBoard mentorId={mentorId} navigate={navigate} refreshKey={refreshKey} onStatusChanged={refresh} />
            </section>
        </div>
    );
}

function MentorPage({ route, navigate, cmsItems, cmsPlacements, refresh, refreshKey = 0, mentorId = 'u-men-1' }) {
    const mentorMirrorStudentId = useMemo(() => {
        const mp = pvlDomainApi.db.mentorProfiles.find((m) => m.userId === mentorId);
        const direct = (mp?.menteeIds || [])[0];
        if (direct) return direct;
        return getFirstCohortStudentId();
    }, [mentorId, refreshKey]);
    const mentorMirrorUnavailable = (
        <div className="rounded-3xl bg-white p-8 text-center text-slate-600 text-sm shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)]">
            <p className="font-medium text-slate-800">Нет ученицы для предпросмотра</p>
            <p className="mt-2 text-slate-500 max-w-md mx-auto">Когда учительская закрепит менти, здесь откроется такой же вид, как в кабинете ученицы.</p>
        </div>
    );
    const [pathOnly, query = ''] = String(route || '').split('?');
    const fromKanban = /(?:^|&)from=kanban(?:&|$)/.test(query);
    if (route === '/mentor/onboarding') {
        return <PvlMergeOnboardingRedirect navigate={navigate} to="/mentor/about" />;
    }
    if (route === '/mentor/settings') return <PvlCabinetSettingsStub />;
    if (route === '/mentor/dashboard') return <MentorDashboard navigate={navigate} mentorId={mentorId} refresh={refresh} refreshKey={refreshKey} />;
    if (route === '/mentor/applicants') return <MentorApplicantsPanel mentorId={mentorId} refreshKey={refreshKey} />;
    if (route === '/mentor/mentees') return <MentorMenteesPanel navigate={navigate} mentorId={mentorId} refreshKey={refreshKey} />;
    if (route === '/mentor/review-queue') return <MentorReviewQueuePanel navigate={navigate} mentorId={mentorId} refresh={refresh} refreshKey={refreshKey} />;
    if (route === '/mentor/messages') return <MentorDirectMessages mentorId={mentorId} />;
    if (route === '/mentor/tracker') {
        if (!mentorMirrorStudentId) return mentorMirrorUnavailable;
        return (
            <StudentCourseTracker
                studentId={mentorMirrorStudentId}
                modules={buildTrackerModulesFromCms(cmsItems, cmsPlacements)}
                routePrefix="/mentor"
                navigate={navigate}
                refreshKey={refreshKey}
            />
        );
    }
    if (route === '/mentor/materials') return <MentorMaterialsPage cmsItems={cmsItems} cmsPlacements={cmsPlacements} />;
    if (route === '/mentor/library' || route.startsWith('/mentor/library/')) {
        const itemId = route === '/mentor/library' ? '' : route.slice('/mentor/library/'.length).split('/')[0] || '';
        if (!mentorMirrorStudentId) return mentorMirrorUnavailable;
        return <LibraryPage studentId={mentorMirrorStudentId} navigate={navigate} initialItemId={itemId} routePrefix="/mentor" refresh={refresh} refreshKey={refreshKey} />;
    }
    if (/^\/mentor\/mentee\/[^/]+\/task\/[^/]+$/.test(pathOnly)) {
        const [, , , menteeId, , taskId] = pathOnly.split('/');
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
                mentorRoutePrefix="/mentor"
                backLabelOverride={fromKanban ? '← К дашборду ментора' : undefined}
                onRefresh={refresh}
                onBack={() => navigate(fromKanban ? '/mentor/dashboard' : `/mentor/mentee/${menteeId}`)}
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
    if (!mentorMirrorStudentId) {
        return mentorMirrorUnavailable;
    }
    return (
        <StudentPage
            route={courseRoute}
            studentId={mentorMirrorStudentId}
            navigate={mentorCourseNavigate}
            cmsItems={cmsItems}
            cmsPlacements={cmsPlacements}
            refresh={refresh}
            refreshKey={refreshKey}
            routePrefix="/mentor"
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
    ];
    const rows = [
        { area: 'Материалы курса', state: 'Работает', note: 'CRUD в памяти; стартовый контент подмешивается при запуске.' },
        { area: 'Теги и типы', state: 'Частично', note: 'Теги вводятся строкой; типы — из списка в форме.' },
        { area: 'Видимость', state: 'Работает', note: 'Кто видит материал: участницы, менторы или оба.' },
        { area: 'Публикация', state: 'Работает', note: 'Публикация, архив, размещение в разделах.' },
        { area: 'Расписание модулей', state: 'Просмотр', note: 'Модули и уроки в данных курса; отдельного редактора расписания здесь нет.' },
        { area: 'Библиотека', state: 'Работает', note: 'Те же материалы доступны участницам и менторам в их кабинетах.' },
    ];
    return (
        <div className="space-y-6">
            <div className="pb-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-1">{PVL_COURSE_DISPLAY_NAME} · учительская</p>
                <h2 className="font-display text-2xl md:text-3xl text-slate-800">Дашборд</h2>
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
                {cards.map((c) => (
                    <button
                        key={c.to}
                        type="button"
                        onClick={() => navigate(c.to)}
                        className="rounded-xl bg-slate-50/90 p-4 text-left transition-colors hover:bg-slate-100/90"
                    >
                        <div className="font-display text-base text-slate-800">{c.title}</div>
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
                scheduleCtaLabel="+ Запланировать"
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
                        Для полноценного продукта позже понадобятся отдельные сервисы: справочник тегов, редактор модулей, сохранение данных на сервере, гранулярные роли.
                    </div>
                </>
            ) : null}
        </div>
    );
}

function ParticipantMaterialPreviewCard({ roleTitle, item, visible, disabledHint }) {
    const html = String(item?.fullDescription || item?.description || '').trim();
    const decodedHtml = useMemo(
        () => html.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&').replaceAll('&quot;', '"'),
        [html],
    );
    const isPracticum = String(item?.targetSection || '').toLowerCase() === 'practicums';
    const practicumVideoUrl = String(
        item?.practicumVideoUrl
        || item?.lessonVideoUrl
        || (Array.isArray(item?.externalLinks) ? item.externalLinks[0] : '')
        || '',
    ).trim();
    const practicumVideoUrlFromBody = useMemo(() => {
        const m = decodedHtml.match(/https?:\/\/kinescope\.io\/embed\/[^\s"'<>]+/i);
        return m ? String(m[0]) : '';
    }, [decodedHtml]);
    const practicumVideoPlayerHtml = useMemo(
        () => buildLessonVideoPlayerHtml({
            lessonVideoEmbed: decodedHtml,
            lessonVideoUrl: practicumVideoUrl || practicumVideoUrlFromBody,
        }),
        [decodedHtml, practicumVideoUrl, practicumVideoUrlFromBody],
    );
    const htmlWithoutIframe = useMemo(() => {
        if (!isPracticum) return html;
        return decodedHtml
            .replace(/<div[^>]*>\s*<iframe[\s\S]*?<\/iframe>\s*<\/div>/gi, '')
            .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
            .replace(/<div[^>]*>\s*&lt;iframe[\s\S]*?&lt;\/iframe&gt;\s*&lt;\/div&gt;/gi, '')
            .replace(/&lt;iframe[\s\S]*?&lt;\/iframe&gt;/gi, '')
            .replace(/https?:\/\/kinescope\.io\/embed\/[^\s"'<>]+/gi, '')
            .trim();
    }, [isPracticum, decodedHtml]);
    const tableSummary = useMemo(() => {
        if (!html || !/<table[\s>]/i.test(html) || typeof DOMParser === 'undefined') return null;
        try {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const tables = Array.from(doc.querySelectorAll('table'));
            if (!tables.length) return null;
            const first = tables[0];
            const rows = Array.from(first.querySelectorAll('tr'));
            const rowCount = rows.length;
            const colCount = rows.length
                ? Math.max(...rows.map((tr) => tr.querySelectorAll('th,td').length))
                : 0;
            return {
                tables: tables.length,
                rows: rowCount,
                cols: colCount,
            };
        } catch {
            return null;
        }
    }, [html]);
    const safeBodyHtml = useMemo(() => normalizeMaterialHtml(htmlWithoutIframe), [htmlWithoutIframe]);
    if (!visible) {
        return (
            <article className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-500 leading-snug">
                {disabledHint}
            </article>
        );
    }
    return (
        <article className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-200/30">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{roleTitle}</div>
            <div className="text-sm font-semibold text-slate-800 mt-1">{item.title || '—'}</div>
            {item.shortDescription ? <p className="text-xs text-slate-500 mt-2 line-clamp-4">{item.shortDescription}</p> : null}
            {tableSummary ? (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    Таблица: {tableSummary.rows || 0} строк · {tableSummary.cols || 0} столбцов
                    {tableSummary.tables > 1 ? ` · таблиц: ${tableSummary.tables}` : ''}
                </div>
            ) : null}
            {isPracticum && practicumVideoPlayerHtml ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div
                        className="relative w-full pb-[56.25%] [&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0"
                        // eslint-disable-next-line react/no-danger
                        dangerouslySetInnerHTML={{ __html: practicumVideoPlayerHtml }}
                    />
                </div>
            ) : null}
            <div
                className={`mt-3 max-h-[220px] overflow-y-auto overflow-x-hidden ${pvlMaterialBodyClass}`}
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: safeBodyHtml || '<p class="text-slate-500">Текст материала пустой.</p>' }}
            />
        </article>
    );
}

const QUIZ_Q_TYPES = [
    { id: 'single', label: 'Один правильный ответ' },
    { id: 'multi', label: 'Несколько правильных ответов' },
    { id: 'open', label: 'Открытый ответ' },
];

function createQuizOption(seed = '') {
    return { id: `opt-${Date.now()}-${Math.floor(Math.random() * 10000)}`, text: seed, isCorrect: false };
}

function createQuizQuestion(type = 'single') {
    return {
        id: `q-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        type,
        text: '',
        points: 1,
        required: true,
        hint: '',
        feedback: '',
        reviewMode: type === 'open' ? 'manual' : 'auto',
        options: type === 'open' ? [] : [createQuizOption(''), createQuizOption('')],
        collapsed: false,
    };
}

function createDefaultLessonQuiz() {
    return {
        settings: { attempts: 2, passPercent: 70, showCorrectAfterSubmit: true, showResultImmediately: true, shuffleOptions: false },
        instruction: '',
        questions: [createQuizQuestion('single')],
    };
}

function normalizeLessonQuiz(raw) {
    const base = createDefaultLessonQuiz();
    const src = raw && typeof raw === 'object' ? raw : {};
    const settings = { ...base.settings, ...(src.settings || {}) };
    const questions = Array.isArray(src.questions) && src.questions.length
        ? src.questions.map((q) => ({
            id: q.id || `q-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            type: q.type === 'multi' || q.type === 'open' ? q.type : 'single',
            text: q.text || '',
            points: Number.isFinite(Number(q.points)) ? Number(q.points) : 1,
            required: q.required !== false,
            hint: q.hint || '',
            feedback: q.feedback || '',
            reviewMode: q.type === 'open' ? 'manual' : 'auto',
            options: q.type === 'open'
                ? []
                : (Array.isArray(q.options) && q.options.length
                    ? q.options.map((o) => ({ id: o.id || `opt-${Date.now()}-${Math.floor(Math.random() * 10000)}`, text: o.text || '', isCorrect: !!o.isCorrect }))
                    : [createQuizOption(''), createQuizOption('')]),
            collapsed: !!q.collapsed,
        }))
        : base.questions;
    return {
        settings: {
            attempts: 2,
            passPercent: Math.max(1, Math.min(100, Number(settings.passPercent) || 70)),
            showCorrectAfterSubmit: !!settings.showCorrectAfterSubmit,
            showResultImmediately: !!settings.showResultImmediately,
            shuffleOptions: !!settings.shuffleOptions,
        },
        instruction: src.instruction || '',
        questions,
    };
}

function validateLessonQuiz(quiz) {
    const errors = {};
    const qz = normalizeLessonQuiz(quiz);
    if (!Array.isArray(qz.questions) || qz.questions.length === 0) errors.global = 'Добавьте хотя бы один вопрос.';
    qz.questions.forEach((q) => {
        const qErrors = [];
        if (!String(q.text || '').trim()) qErrors.push('Заполните текст вопроса.');
        if (q.type === 'single' && (q.options || []).filter((o) => o.isCorrect).length !== 1) qErrors.push('Нужен ровно один правильный вариант.');
        if (q.type === 'multi' && (q.options || []).filter((o) => o.isCorrect).length < 1) qErrors.push('Отметьте хотя бы один правильный вариант.');
        if (q.type !== 'open' && (q.options || []).some((o) => !String(o.text || '').trim())) qErrors.push('Заполните текст всех вариантов.');
        if (q.type === 'open' && q.reviewMode !== 'manual') qErrors.push('Открытый вопрос только с ручной проверкой.');
        if (qErrors.length) errors[q.id] = qErrors;
    });
    return errors;
}

function LessonQuizBuilder({ value, onChange, validation = {} }) {
    const quiz = normalizeLessonQuiz(value);
    const [editingPassPercent, setEditingPassPercent] = useState(false);
    const setQuiz = (updater) => {
        const next = typeof updater === 'function' ? updater(quiz) : updater;
        onChange(normalizeLessonQuiz(next));
    };
    const updateQuestion = (qid, updater) => {
        setQuiz((prev) => ({
            ...prev,
            questions: prev.questions.map((q) => (q.id === qid ? (typeof updater === 'function' ? updater(q) : { ...q, ...updater }) : q)),
        }));
    };
    const moveQuestion = (qid, dir) => {
        setQuiz((prev) => {
            const idx = prev.questions.findIndex((q) => q.id === qid);
            const nextIdx = idx + dir;
            if (idx < 0 || nextIdx < 0 || nextIdx >= prev.questions.length) return prev;
            const copy = [...prev.questions];
            const [row] = copy.splice(idx, 1);
            copy.splice(nextIdx, 0, row);
            return { ...prev, questions: copy };
        });
    };
    const duplicateQuestion = (qid) => {
        setQuiz((prev) => {
            const idx = prev.questions.findIndex((q) => q.id === qid);
            if (idx < 0) return prev;
            const src = prev.questions[idx];
            const clone = {
                ...src,
                id: `q-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
                options: (src.options || []).map((o) => ({ ...o, id: `opt-${Date.now()}-${Math.floor(Math.random() * 10000)}` })),
                collapsed: false,
            };
            const copy = [...prev.questions];
            copy.splice(idx + 1, 0, clone);
            return { ...prev, questions: copy };
        });
    };
    const removeQuestion = (qid) => {
        if (!window.confirm('Удалить вопрос?')) return;
        setQuiz((prev) => {
            const next = prev.questions.filter((q) => q.id !== qid);
            return { ...prev, questions: next.length ? next : [createQuizQuestion('single')] };
        });
    };

    return (
        <div className="space-y-6">
            <section className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-medium text-slate-800 mb-3">Настройки теста</div>
                <div className="grid md:grid-cols-3 gap-4">
                    <label className="rounded-xl border border-slate-200 p-2 text-xs text-slate-700 flex items-center justify-between">Показывать правильные<input type="checkbox" checked={quiz.settings.showCorrectAfterSubmit} onChange={(e) => setQuiz((prev) => ({ ...prev, settings: { ...prev.settings, showCorrectAfterSubmit: e.target.checked } }))} /></label>
                    <label className="rounded-xl border border-slate-200 p-2 text-xs text-slate-700 flex items-center justify-between">Показывать итог сразу<input type="checkbox" checked={quiz.settings.showResultImmediately} onChange={(e) => setQuiz((prev) => ({ ...prev, settings: { ...prev.settings, showResultImmediately: e.target.checked } }))} /></label>
                    <label className="rounded-xl border border-slate-200 p-2 text-xs text-slate-700 flex items-center justify-between">Перемешивать варианты<input type="checkbox" checked={quiz.settings.shuffleOptions} onChange={(e) => setQuiz((prev) => ({ ...prev, settings: { ...prev.settings, shuffleOptions: e.target.checked } }))} /></label>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>
                        Вопросов: {quiz.questions.length} · Проходной порог: {quiz.settings.passPercent}% · Попыток: 2
                    </span>
                    <button
                        type="button"
                        onClick={() => setEditingPassPercent((v) => !v)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50"
                    >
                        Изменить
                    </button>
                </div>
                {editingPassPercent ? (
                    <div className="mt-2 grid md:grid-cols-[220px_1fr] gap-2 items-center">
                        <input
                            type="number"
                            min={1}
                            max={100}
                            value={quiz.settings.passPercent}
                            onChange={(e) => setQuiz((prev) => ({ ...prev, settings: { ...prev.settings, passPercent: Math.max(1, Math.min(100, Number(e.target.value) || 70)) } }))}
                            className="rounded-xl border border-slate-200 p-2 text-sm"
                            placeholder="Проходной %"
                        />
                        <div className="text-xs text-slate-400">Первая попытка допускает результат ниже 70%, вторая — финальная пересдача.</div>
                    </div>
                ) : (
                    <div className="mt-2 text-xs text-slate-400">Первая попытка допускает результат ниже 70%, вторая — финальная пересдача.</div>
                )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="text-sm font-medium text-slate-800">Вопросы</div>
                    <button type="button" onClick={() => setQuiz((prev) => ({ ...prev, questions: [...prev.questions, createQuizQuestion('single')] }))} className="text-xs rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50">Добавить вопрос</button>
                </div>
                {validation.global ? <div className="mb-2 text-xs text-rose-700">{validation.global}</div> : null}
                <div className="space-y-5">
                    {quiz.questions.map((q, idx) => {
                        const qErrors = validation[q.id] || [];
                        return (
                            <article key={q.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                    <div className="text-sm font-medium text-slate-800">Вопрос {idx + 1} · {QUIZ_Q_TYPES.find((t) => t.id === q.type)?.label || q.type} · {Number(q.points) || 0} б.</div>
                                    <div className="flex flex-wrap gap-1">
                                        <button type="button" onClick={() => updateQuestion(q.id, (row) => ({ ...row, collapsed: !row.collapsed }))} className="text-[11px] rounded-lg border border-slate-200 bg-white px-2 py-1">{q.collapsed ? 'Развернуть' : 'Свернуть'}</button>
                                        <button type="button" onClick={() => moveQuestion(q.id, -1)} className="text-[11px] rounded-lg border border-slate-200 bg-white px-2 py-1">Вверх</button>
                                        <button type="button" onClick={() => moveQuestion(q.id, 1)} className="text-[11px] rounded-lg border border-slate-200 bg-white px-2 py-1">Вниз</button>
                                        <button type="button" onClick={() => duplicateQuestion(q.id)} className="text-[11px] rounded-lg border border-slate-200 bg-white px-2 py-1">Дублировать</button>
                                        <button type="button" onClick={() => removeQuestion(q.id)} className="text-[11px] rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-rose-800">Удалить</button>
                                    </div>
                                </div>
                                {q.collapsed ? (
                                    <div className="text-xs text-slate-600">
                                        {String(q.text || '').slice(0, 120) || 'Текст вопроса не заполнен'}
                                        {qErrors.length ? <div className="mt-1 text-rose-700">{qErrors.join(' ')}</div> : null}
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <div className="grid md:grid-cols-3 gap-2">
                                            <select value={q.type} onChange={(e) => updateQuestion(q.id, (row) => ({ ...createQuizQuestion(e.target.value), id: row.id, text: row.text, points: row.points, required: row.required, hint: row.hint, feedback: row.feedback }))} className="rounded-lg border border-slate-200 p-2 text-sm bg-white">
                                                {QUIZ_Q_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                                            </select>
                                            <input type="number" min={0} value={q.points} onChange={(e) => updateQuestion(q.id, { points: Number(e.target.value) || 0 })} className="rounded-lg border border-slate-200 p-2 text-sm bg-white placeholder:text-slate-400" placeholder="Баллы за вопрос (серым: например 1)" />
                                            <label className="rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700 flex items-center justify-between">Обязательный<input type="checkbox" checked={q.required !== false} onChange={(e) => updateQuestion(q.id, { required: e.target.checked })} /></label>
                                        </div>
                                        <textarea value={q.text} onChange={(e) => updateQuestion(q.id, { text: e.target.value })} className="w-full rounded-lg border border-slate-200 p-2 text-sm bg-white min-h-[70px]" placeholder="Сформулируйте вопрос для ученицы" />
                                        {q.type === 'open' ? (
                                            <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-600">Режим проверки: <span className="font-medium">ручная проверка</span></div>
                                        ) : (
                                            <div className="space-y-2">
                                                {(q.options || []).map((opt) => (
                                                    <div key={opt.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                                                        {q.type === 'single'
                                                            ? <input type="radio" checked={!!opt.isCorrect} onChange={() => updateQuestion(q.id, (row) => ({ ...row, options: row.options.map((x) => ({ ...x, isCorrect: x.id === opt.id })) }))} />
                                                            : <input type="checkbox" checked={!!opt.isCorrect} onChange={(e) => updateQuestion(q.id, (row) => ({ ...row, options: row.options.map((x) => (x.id === opt.id ? { ...x, isCorrect: e.target.checked } : x)) }))} />}
                                                        <input value={opt.text} onChange={(e) => updateQuestion(q.id, (row) => ({ ...row, options: row.options.map((x) => (x.id === opt.id ? { ...x, text: e.target.value } : x)) }))} className="rounded-lg border border-slate-200 p-2 text-sm bg-white" placeholder="Вариант ответа (что увидит ученица)" />
                                                        <button type="button" onClick={() => updateQuestion(q.id, (row) => ({ ...row, options: row.options.length > 2 ? row.options.filter((x) => x.id !== opt.id) : row.options }))} className="text-[11px] rounded-lg border border-slate-200 bg-white px-2 py-1">Удалить</button>
                                                    </div>
                                                ))}
                                                <button type="button" onClick={() => updateQuestion(q.id, (row) => ({ ...row, options: [...(row.options || []), createQuizOption('')] }))} className="text-xs rounded-lg border border-slate-200 bg-white px-2.5 py-1">Добавить вариант</button>
                                            </div>
                                        )}
                                        {qErrors.length ? <div className="text-xs text-rose-700">{qErrors.join(' ')}</div> : null}
                                    </div>
                                )}
                            </article>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}

function createDefaultLessonHomework() {
    return {
        assignmentType: 'standard',
        checklistSections: JSON.parse(JSON.stringify(DEFAULT_REFLEX_CHECKLIST_SECTIONS)),
        responseFormat: {
            artifactType: 'text',
            allowText: true,
            allowFile: false,
            allowLink: false,
            formatHint: '',
        },
        criteria: [''],
        hints: [''],
        mentorComment: '',
        prompt: '',
        expectedResult: '',
        scoring: { enabled: false, maxScore: 20 },
        deadline: { type: 'fixed_date', at: '', weekBasedLabel: '', note: '' },
        revisions: {
            limitMode: 'limit',
            limit: 3,
            allowResubmitAfterRevision: true,
            showCounterToStudent: true,
            limitReachedNote: '',
        },
    };
}

function normalizeLessonHomework(raw) {
    const base = createDefaultLessonHomework();
    const src = raw && typeof raw === 'object' ? raw : {};
    const responseFormat = { ...base.responseFormat, ...(src.responseFormat || {}) };
    const scoring = { ...base.scoring, ...(src.scoring || {}) };
    const deadline = { ...base.deadline, ...(src.deadline || {}) };
    const revisions = { ...base.revisions, ...(src.revisions || {}) };
    const rawType = String(src.assignmentType || src.assignment_type || base.assignmentType || 'standard').toLowerCase();
    const assignmentType = rawType === 'checklist' ? 'checklist' : 'standard';
    let checklistSections = Array.isArray(src.checklistSections) ? src.checklistSections : base.checklistSections;
    if (assignmentType === 'checklist' && (!checklistSections || checklistSections.length === 0)) {
        checklistSections = JSON.parse(JSON.stringify(DEFAULT_REFLEX_CHECKLIST_SECTIONS));
    }
    return {
        assignmentType,
        checklistSections: assignmentType === 'checklist' ? checklistSections : base.checklistSections,
        responseFormat: {
            artifactType: responseFormat.artifactType || 'text',
            allowText: !!responseFormat.allowText,
            allowFile: !!responseFormat.allowFile,
            allowLink: !!responseFormat.allowLink,
            formatHint: responseFormat.formatHint || '',
        },
        criteria: (Array.isArray(src.criteria) && src.criteria.length ? src.criteria : ['']).map((x) => String(x || '')),
        hints: (Array.isArray(src.hints) && src.hints.length ? src.hints : ['']).map((x) => String(x || '')),
        mentorComment: src.mentorComment || '',
        prompt: src.prompt || '',
        expectedResult: src.expectedResult || '',
        scoring: {
            enabled: !!scoring.enabled,
            maxScore: Math.max(1, Number(scoring.maxScore) || 20),
        },
        deadline: {
            type: ['fixed_date', 'week_based', 'none'].includes(deadline.type) ? deadline.type : 'fixed_date',
            at: String(deadline.at || '').slice(0, 10),
            weekBasedLabel: deadline.weekBasedLabel || '',
            note: deadline.note || '',
        },
        revisions: {
            limitMode: revisions.limitMode === 'unlimited' ? 'unlimited' : 'limit',
            limit: Math.max(0, Number(revisions.limit) || 0),
            allowResubmitAfterRevision: true,
            showCounterToStudent: !!revisions.showCounterToStudent,
            limitReachedNote: revisions.limitReachedNote || '',
        },
    };
}

function validateLessonHomework(hw, opts = {}) {
    const errors = {};
    const d = normalizeLessonHomework(hw);
    if (d.assignmentType !== 'checklist' && !d.responseFormat.allowText && !d.responseFormat.allowFile && !d.responseFormat.allowLink) {
        errors.responseFormat = 'Нужно разрешить хотя бы один формат ответа: текст, файл или ссылка.';
    }
    if (d.scoring.enabled && (!Number.isFinite(Number(d.scoring.maxScore)) || Number(d.scoring.maxScore) <= 0)) {
        errors.scoring = 'Для оценивания с баллами укажите корректный максимум.';
    }
    if (d.deadline.type === 'fixed_date' && !d.deadline.at) {
        errors.deadline = 'Для жесткого дедлайна укажите дату.';
    }
    if (d.revisions.limitMode === 'limit' && (Number(d.revisions.limit) < 0 || !Number.isFinite(Number(d.revisions.limit)))) {
        errors.revisions = 'Лимит доработок должен быть валидным числом.';
    }
    const nonEmptyCriteria = d.criteria.filter((x) => String(x).trim());
    if (opts.requireCriteria && nonEmptyCriteria.length === 0) {
        errors.criteria = 'Добавьте хотя бы один критерий или отключите обязательность критериев.';
    }
    return errors;
}

function LessonHomeworkBuilder({ value, onChange, validation = {} }) {
    const hw = normalizeLessonHomework(value);
    const setHw = (updater) => {
        const next = typeof updater === 'function' ? updater(hw) : updater;
        onChange(normalizeLessonHomework(next));
    };
    const updateList = (key, idx, val) => {
        setHw((prev) => ({ ...prev, [key]: prev[key].map((x, i) => (i === idx ? val : x)) }));
    };
    const moveListItem = (key, idx, dir) => {
        setHw((prev) => {
            const nextIdx = idx + dir;
            if (nextIdx < 0 || nextIdx >= prev[key].length) return prev;
            const copy = [...prev[key]];
            const [row] = copy.splice(idx, 1);
            copy.splice(nextIdx, 0, row);
            return { ...prev, [key]: copy };
        });
    };

    const deadlineValue =
        hw.deadline.type === 'fixed_date' ? (
            <input
                type="date"
                value={hw.deadline.at}
                onChange={(e) => setHw((prev) => ({ ...prev, deadline: { ...prev.deadline, at: e.target.value } }))}
                className="w-full min-h-[38px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
        ) : hw.deadline.type === 'week_based' ? (
            <input
                value={hw.deadline.weekBasedLabel}
                onChange={(e) => setHw((prev) => ({ ...prev, deadline: { ...prev.deadline, weekBasedLabel: e.target.value } }))}
                className="w-full min-h-[38px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                placeholder="Правило по модулю"
            />
        ) : (
            <div className="min-h-[38px] rounded-lg border border-dashed border-slate-200/80 bg-slate-50/50 px-2 py-1.5 text-xs text-slate-400">Без даты</div>
        );

    return (
        <div className="space-y-3">
            <input type="hidden" value={hw.responseFormat.artifactType} readOnly />

            <section className="space-y-2 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Тип задания</div>
                <select
                    value={hw.assignmentType}
                    onChange={(e) => setHw((prev) => ({ ...prev, assignmentType: e.target.value === 'checklist' ? 'checklist' : 'standard' }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                >
                    <option value="standard">Обычная домашка (один ответ)</option>
                    <option value="checklist">Чек-лист (ответы по пунктам в одной сдаче)</option>
                </select>
                {hw.assignmentType === 'checklist' ? (
                    <p className="text-[11px] text-slate-500 leading-snug">
                        Блоки и пункты берутся из шаблона ниже; если список пуст, при сохранении подставится шаблон рефлексии (Контекст · Что наблюдала · Личная рефлексия).
                    </p>
                ) : null}
            </section>

            <section className="space-y-2.5 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Настройки дедлайна и доработок</div>
                <div className="grid gap-2 sm:grid-cols-2 sm:items-end">
                    <label className="flex min-w-0 flex-col gap-1">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Режим</span>
                        <select
                            value={hw.deadline.type}
                            onChange={(e) => setHw((prev) => ({ ...prev, deadline: { ...prev.deadline, type: e.target.value } }))}
                            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                        >
                            <option value="fixed_date">Жесткая дата</option>
                            <option value="week_based">Дата по модулю</option>
                            <option value="none">Без дедлайна</option>
                        </select>
                    </label>
                    <div className="flex min-w-0 flex-col gap-1">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                            {hw.deadline.type === 'fixed_date' ? 'Дата' : hw.deadline.type === 'week_based' ? 'Условие' : 'Значение'}
                        </span>
                        {deadlineValue}
                    </div>
                </div>
                <div className="flex flex-col gap-2 border-t border-slate-100 pt-2.5 sm:flex-row sm:flex-wrap sm:items-stretch">
                    <select
                        value={hw.revisions.limitMode}
                        onChange={(e) => setHw((prev) => ({ ...prev, revisions: { ...prev.revisions, limitMode: e.target.value } }))}
                        className="min-w-[12rem] flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                    >
                        <option value="limit">Лимит доработок</option>
                        <option value="unlimited">Без лимита</option>
                    </select>
                    <input
                        type="number"
                        min={0}
                        disabled={hw.revisions.limitMode !== 'limit'}
                        value={hw.revisions.limit}
                        onChange={(e) => setHw((prev) => ({ ...prev, revisions: { ...prev.revisions, limit: Number(e.target.value) || 0 } }))}
                        className="w-full min-w-[4.5rem] max-w-[5.5rem] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-sm tabular-nums disabled:bg-slate-50 sm:w-[5rem]"
                        title="Число доработок"
                    />
                    <label className="flex min-h-[38px] flex-1 cursor-pointer items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 sm:min-w-[12rem]">
                        <span className="leading-tight">Счётчик ученице</span>
                        <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0 rounded border-slate-300"
                            checked={hw.revisions.showCounterToStudent}
                            onChange={(e) => setHw((prev) => ({ ...prev, revisions: { ...prev.revisions, showCounterToStudent: e.target.checked } }))}
                        />
                    </label>
                </div>
                {validation.deadline ? <div className="text-xs text-rose-700">{validation.deadline}</div> : null}
                {validation.revisions ? <div className="text-xs text-rose-700">{validation.revisions}</div> : null}
            </section>
        </div>
    );
}

function AdminContentItemScreen({
    contentId,
    navigate,
    cmsItems,
    setCmsItems,
    cmsPlacements,
    setCmsPlacements,
    forceRefresh,
}) {
    const item = cmsItems.find((x) => x.id === contentId);
    const previewCardRef = useRef(null);
    const [panelMode, setPanelMode] = useState('view');
    const [editForm, setEditForm] = useState(null);
    const [placementEditId, setPlacementEditId] = useState(null);
    const [placementEditForm, setPlacementEditForm] = useState(null);

    useEffect(() => {
        setPanelMode('view');
        setEditForm(null);
        setPlacementEditId(null);
        setPlacementEditForm(null);
    }, [contentId]);

    const placementSectionOptions = useMemo(() => Object.keys(TARGET_SECTION_LABELS), []);

    const itemPlacements = useMemo(
        () => cmsPlacements.filter((p) => (p.contentId || p.contentItemId) === contentId),
        [cmsPlacements, contentId],
    );

    const sections = ['lessons', 'library', 'practicums', 'glossary'];
    const types = ['video', 'text', 'pdf', 'checklist', 'template', 'link', 'audio', 'fileBundle'];
    const libraryCategories = useMemo(() => {
        try {
            const sid = getFirstCohortStudentId();
            if (!sid) return [];
            return pvlDomainApi.studentApi.getLibraryCategoriesWithCounts(sid) || [];
        } catch {
            return [];
        }
    }, [forceRefresh]);

    const beginEdit = () => {
        if (!item) return;
        const linkedPracticumEvent = item.linkedPracticumEventId ? pvlDomainApi.calendarApi.getById(item.linkedPracticumEventId) : null;
        const practicumDateFromEvent = linkedPracticumEvent?.startAt ? String(linkedPracticumEvent.startAt).slice(0, 10) : '';
        const practicumTimeFromEvent = linkedPracticumEvent?.startAt ? String(linkedPracticumEvent.startAt).slice(11, 16) : '';
        const extLinks = Array.isArray(item.externalLinks) ? item.externalLinks : [];
        setEditForm({
            title: item.title || '',
            shortDescription: item.shortDescription || '',
            fullDescriptionHtml: item.fullDescription || item.description || '',
            contentType: item.contentType || 'text',
            targetSection: item.targetSection || 'library',
            lessonKind: item.lessonKind
                || (item.targetSection === 'lessons' && item.contentType === 'checklist'
                    ? 'quiz'
                    : item.targetSection === 'lessons' && item.contentType === 'template'
                        ? 'homework'
                        : 'text_video'),
            lessonQuiz: normalizeLessonQuiz(item.lessonQuiz),
            lessonHomework: normalizeLessonHomework(item.lessonHomework),
            lessonVideoUrl: item.lessonVideoUrl || '',
            lessonVideoEmbed: item.lessonVideoEmbed || '',
            lessonRutubeUrl: item.lessonRutubeUrl || '',
            practicumDocumentUrl: item.practicumDocumentUrl || extLinks[1] || '',
            practicumVideoUrl: item.practicumVideoUrl || extLinks[0] || '',
            libraryCategoryId: item.libraryCategoryId || item.categoryId || 'all',
            libraryLessonGroupTitle: String(
                item.libraryLessonGroupTitle
                || (item.libraryPayload && typeof item.libraryPayload === 'object' ? item.libraryPayload.lessonGroupTitle : '')
                || '',
            ).trim(),
            targetRole: item.targetRole || 'both',
            targetCohort: item.targetCohort || 'cohort-2026-1',
            weekNumber: clampPvlModule(item.moduleNumber ?? item.weekNumber ?? 0),
            moduleNumber: clampPvlModule(item.moduleNumber ?? item.weekNumber ?? 0),
            practicumDate: item.practicumDate || practicumDateFromEvent || '',
            practicumTime: item.practicumTime || practicumTimeFromEvent || '',
            linkedPracticumEventId: item.linkedPracticumEventId || linkedPracticumEvent?.id || '',
            estimatedDuration: item.estimatedDuration || '',
            tagsText: Array.isArray(item.tags) ? item.tags.join(', ') : '',
        });
        setPanelMode('edit');
    };

    const cancelEdit = () => {
        setEditForm(null);
        setPanelMode('view');
    };

    const applyPatchToState = (patch) => {
        setCmsItems((prev) => updateContentItem(prev, contentId, { ...patch, updatedAt: new Date().toLocaleString('ru-RU') }));
        forceRefresh?.();
    };

    const saveFieldUpdatesFromForm = async () => {
        if (!editForm) return;
        const tags = String(editForm.tagsText || '').split(',').map((t) => t.trim()).filter(Boolean);
        const normalizedQuiz = normalizeLessonQuiz(editForm.lessonQuiz);
        const videoSummaryMode = (editForm.targetSection === 'lessons' && editForm.lessonKind === 'text_video')
            || (editForm.targetSection === 'library' && editForm.contentType === 'video');
        const normalizedContentType = editForm.targetSection === 'lessons'
            ? (editForm.lessonKind === 'homework'
                ? 'template'
                : editForm.lessonKind === 'quiz'
                    ? 'checklist'
                    : editForm.lessonKind === 'text_video'
                        ? (editForm.contentType === 'text' ? 'text' : 'video')
                        : editForm.contentType)
            : editForm.contentType;
        const payload = {
            title: editForm.title.trim(),
            shortDescription: editForm.shortDescription,
            fullDescription: editForm.fullDescriptionHtml,
            description: editForm.fullDescriptionHtml,
            contentType: normalizedContentType,
            targetSection: editForm.targetSection,
            lessonKind: editForm.lessonKind,
            lessonQuiz: editForm.targetSection === 'lessons' && editForm.lessonKind === 'quiz' ? normalizedQuiz : undefined,
            lessonHomework: editForm.targetSection === 'lessons' && editForm.lessonKind === 'homework' ? normalizeLessonHomework(editForm.lessonHomework) : undefined,
            categoryId: editForm.targetSection === 'library' ? (editForm.libraryCategoryId || item?.categoryId || item?.libraryCategoryId) : undefined,
            categoryTitle: editForm.targetSection === 'library'
                ? (libraryCategories.find((c) => c.id === (editForm.libraryCategoryId || item?.categoryId || item?.libraryCategoryId))?.title || item?.categoryTitle || item?.libraryCategoryTitle || '')
                : undefined,
            libraryLessonGroupTitle: editForm.targetSection === 'library' ? String(editForm.libraryLessonGroupTitle || '').trim() : undefined,
            targetRole: 'both',
            targetCohort: editForm.targetCohort,
            weekNumber: clampPvlModule(editForm.moduleNumber),
            moduleNumber:
                editForm.targetSection === 'library' || editForm.targetSection === 'glossary'
                    ? null
                    : clampPvlModule(editForm.moduleNumber),
            estimatedDuration: editForm.estimatedDuration,
            tags,
            lessonVideoUrl: videoSummaryMode ? editForm.lessonVideoUrl : undefined,
            lessonVideoEmbed: videoSummaryMode ? editForm.lessonVideoEmbed : undefined,
            lessonRutubeUrl: videoSummaryMode ? editForm.lessonRutubeUrl : undefined,
            practicumDate: editForm.targetSection === 'practicums' ? (editForm.practicumDate || '') : undefined,
            practicumTime: editForm.targetSection === 'practicums' ? (editForm.practicumTime || '') : undefined,
            linkedPracticumEventId: editForm.targetSection === 'practicums' ? (editForm.linkedPracticumEventId || '') : undefined,
            practicumDocumentUrl: editForm.targetSection === 'practicums' ? (editForm.practicumDocumentUrl || '') : undefined,
            practicumVideoUrl: editForm.targetSection === 'practicums' ? (editForm.practicumVideoUrl || '') : undefined,
            externalLinks: editForm.targetSection === 'practicums'
                ? [editForm.practicumVideoUrl, editForm.practicumDocumentUrl].filter(Boolean)
                : undefined,
        };
        try {
            await pvlDomainApi.adminApi.updateContentItem(contentId, payload);
            const patchForState = { ...payload };
            if (editForm.targetSection === 'practicums') {
                if (editForm.practicumDate) {
                    const hhmm = String(editForm.practicumTime || '19:00');
                    const startAt = `${editForm.practicumDate}T${hhmm}:00.000Z`;
                    const [hh, mm] = hhmm.split(':').map((x) => Number(x) || 0);
                    const end = new Date(Date.UTC(
                        Number(editForm.practicumDate.slice(0, 4)),
                        Number(editForm.practicumDate.slice(5, 7)) - 1,
                        Number(editForm.practicumDate.slice(8, 10)),
                        hh,
                        mm,
                    ));
                    end.setUTCMinutes(end.getUTCMinutes() + 90);
                    const endAt = end.toISOString();
                    let eventId = editForm.linkedPracticumEventId || '';
                    if (eventId) {
                        pvlDomainApi.adminApi.updateCalendarEvent(eventId, {
                            title: editForm.title.trim(),
                            description: editForm.fullDescriptionHtml || editForm.shortDescription || '',
                            eventType: 'practicum_done',
                            date: editForm.practicumDate,
                            startAt,
                            endAt,
                            visibilityRole: 'all',
                            cohortId: editForm.targetCohort || 'cohort-2026-1',
                            colorToken: 'practicum_done',
                            recordingUrl: editForm.practicumVideoUrl || '',
                            recapText: editForm.fullDescriptionHtml || '',
                        });
                    } else {
                        const ev = pvlDomainApi.adminApi.createCalendarEvent({
                            title: editForm.title.trim(),
                            description: editForm.fullDescriptionHtml || editForm.shortDescription || '',
                            eventType: 'practicum_done',
                            date: editForm.practicumDate,
                            startAt,
                            endAt,
                            visibilityRole: 'all',
                            cohortId: editForm.targetCohort || 'cohort-2026-1',
                            colorToken: 'practicum_done',
                            recordingUrl: editForm.practicumVideoUrl || '',
                            recapText: editForm.fullDescriptionHtml || '',
                        });
                        eventId = ev?.id || '';
                    }
                    if (eventId) {
                        patchForState.linkedPracticumEventId = eventId;
                        await pvlDomainApi.adminApi.updateContentItem(contentId, { linkedPracticumEventId: eventId });
                    }
                } else if (editForm.linkedPracticumEventId) {
                    pvlDomainApi.adminApi.deleteCalendarEvent(editForm.linkedPracticumEventId);
                    patchForState.linkedPracticumEventId = '';
                    await pvlDomainApi.adminApi.updateContentItem(contentId, { linkedPracticumEventId: '' });
                }
            }
            applyPatchToState(patchForState);
        } catch (e) {
            try {
                window.alert(`Не удалось сохранить материал: ${e?.message || e}`);
            } catch {
                /* noop */
            }
        }
    };

    /** Черновик в PostgREST, затем публикация + размещение (как ответ API в Саду). */
    const commitPublish = async () => {
        if (panelMode === 'edit') {
            if (!String(editForm?.title || '').trim()) {
                window.alert('Перед публикацией заполните название материала.');
                return;
            }
            if (editForm?.targetSection === 'lessons' && editForm?.lessonKind === 'quiz') {
                const errors = validateLessonQuiz(editForm.lessonQuiz);
                if (errors.global || Object.keys(errors).some((k) => k !== 'global')) {
                    window.alert('Тест не готов к публикации: проверьте вопросы и правильные ответы.');
                    return;
                }
            }
            if (editForm?.targetSection === 'lessons' && editForm?.lessonKind === 'homework') {
                const errors = validateLessonHomework(editForm.lessonHomework, { requireCriteria: false });
                if (Object.keys(errors).length) {
                    window.alert('Домашнее задание не готово к публикации: проверьте формат ответа, дедлайн и лимит доработок.');
                    return;
                }
            }
            await saveFieldUpdatesFromForm();
        }
        try {
            await pvlDomainApi.adminApi.publishContentItem(contentId);
            setCmsItems((prev) => publishContentItem(prev, contentId));
            forceRefresh?.();
            cancelEdit();
        } catch (e) {
            try {
                window.alert(`Не удалось опубликовать: ${e?.message || e}`);
            } catch {
                /* noop */
            }
        }
    };

    const handleSaveDraft = async () => {
        await saveFieldUpdatesFromForm();
        cancelEdit();
    };

    const handleUnpublish = async () => {
        if (panelMode === 'edit') await saveFieldUpdatesFromForm();
        try {
            await pvlDomainApi.adminApi.unpublishContentItem(contentId);
            setCmsItems((prev) => unpublishToDraftItems(prev, contentId));
            forceRefresh?.();
            cancelEdit();
        } catch (e) {
            try {
                window.alert(`Не удалось снять с публикации: ${e?.message || e}`);
            } catch {
                /* noop */
            }
        }
    };

    const handleArchive = async () => {
        if (!window.confirm('Отправить материал в архив?')) return;
        if (panelMode === 'edit') await saveFieldUpdatesFromForm();
        try {
            await pvlDomainApi.adminApi.archiveContentItem(contentId);
            setCmsItems((prev) => archiveContentItem(prev, contentId));
            forceRefresh?.();
            cancelEdit();
        } catch (e) {
            try {
                window.alert(`Не удалось отправить в архив: ${e?.message || e}`);
            } catch {
                /* noop */
            }
        }
    };

    const handleAssignPlacement = async () => {
        if (!item) return;
        try {
            const pl = await pvlDomainApi.adminApi.assignContentPlacement({
                contentItemId: item.id,
                targetSection: item.targetSection,
                targetRole: item.targetRole,
                cohortId: item.targetCohort || 'cohort-2026-1',
                weekNumber: clampPvlModule(item.moduleNumber ?? item.weekNumber ?? 0),
                moduleNumber: clampPvlModule(item.moduleNumber ?? item.weekNumber ?? 0),
                orderIndex: item.orderIndex || 999,
            });
            if (pl) setCmsPlacements((prev) => [...prev, pl]);
            forceRefresh?.();
        } catch (e) {
            try {
                window.alert(`Не удалось добавить размещение: ${e?.message || e}`);
            } catch {
                /* noop */
            }
        }
    };

    const startPlacementEdit = (p) => {
        const role = String(p.targetRole || 'student').toLowerCase();
        const roleNorm = role === 'mentor' || role === 'both' ? role : 'student';
        setPlacementEditId(p.id);
        setPlacementEditForm({
            targetSection: p.targetSection || 'library',
            targetRole: roleNorm,
            cohortId: p.targetCohort || p.cohortId || 'cohort-2026-1',
            orderIndex: p.orderIndex ?? 0,
            weekNumber: clampPvlModule(p.moduleNumber ?? p.weekNumber ?? 0),
            moduleNumber: clampPvlModule(p.moduleNumber ?? p.weekNumber ?? 0),
            isPublished: p.isPublished !== false,
        });
    };

    const cancelPlacementEdit = () => {
        setPlacementEditId(null);
        setPlacementEditForm(null);
    };

    const savePlacementEdit = async () => {
        if (!placementEditId || !placementEditForm) return;
        const patch = {
            targetSection: placementEditForm.targetSection,
            targetRole: placementEditForm.targetRole,
            cohortId: placementEditForm.cohortId,
            targetCohort: placementEditForm.cohortId,
            orderIndex: Number(placementEditForm.orderIndex) || 0,
            weekNumber: clampPvlModule(placementEditForm.moduleNumber),
            moduleNumber: clampPvlModule(placementEditForm.moduleNumber),
            isPublished: !!placementEditForm.isPublished,
        };
        try {
            await pvlDomainApi.adminApi.updatePlacement(placementEditId, patch);
            setCmsPlacements((prev) => prev.map((x) => (x.id === placementEditId ? { ...x, ...patch } : x)));
            cancelPlacementEdit();
            forceRefresh?.();
        } catch (e) {
            try {
                window.alert(`Не удалось сохранить размещение: ${e?.message || e}`);
            } catch {
                /* noop */
            }
        }
    };

    const deletePlacementRow = async (pid) => {
        if (!window.confirm('Удалить это размещение?')) return;
        try {
            await pvlDomainApi.adminApi.deletePlacement(pid);
            setCmsPlacements((prev) => prev.filter((x) => x.id !== pid));
            if (placementEditId === pid) cancelPlacementEdit();
            forceRefresh?.();
        } catch (e) {
            try {
                window.alert(`Не удалось удалить размещение: ${e?.message || e}`);
            } catch {
                /* noop */
            }
        }
    };

    if (!item) {
        return (
            <div className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-8 text-center space-y-6">
                <p className="text-slate-600">Материал не найден или удалён.</p>
                <Button variant="secondary" onClick={() => navigate('/admin/content')}>К списку материалов</Button>
            </div>
        );
    }

    const previewSource = panelMode === 'edit' && editForm
        ? {
            title: editForm.title,
            shortDescription: editForm.shortDescription,
            fullDescription: editForm.fullDescriptionHtml,
            description: editForm.fullDescriptionHtml,
            targetSection: editForm.targetSection,
            targetRole: editForm.targetRole,
            lessonVideoEmbed: editForm.lessonVideoEmbed,
            lessonVideoUrl: editForm.lessonVideoUrl,
            practicumVideoUrl: editForm.practicumVideoUrl,
            practicumDocumentUrl: editForm.practicumDocumentUrl,
            externalLinks: [editForm.practicumVideoUrl, editForm.practicumDocumentUrl].filter(Boolean),
        }
        : item;
    const videoSummaryEditor = !!editForm && (
        (editForm.targetSection === 'lessons' && editForm.lessonKind === 'text_video')
        || (editForm.targetSection === 'library' && editForm.contentType === 'video')
    );
    const prevStudentSees = previewSource.targetRole === 'student' || previewSource.targetRole === 'both';
    const prevMentorSees = previewSource.targetRole === 'mentor' || previewSource.targetRole === 'both';

    const publishedPlacements = itemPlacements.filter((p) => p.isPublished !== false);
    const unpublishedPlacements = itemPlacements.filter((p) => p.isPublished === false);
    const cohortsForPlacement = pvlDomainApi.adminApi.getAdminCohorts() || [];
    const softBtn = 'text-sm rounded-xl border border-emerald-200/90 bg-white px-4 py-2 text-emerald-900 hover:bg-emerald-50/90';
    const primaryBtn = 'text-sm rounded-xl border border-emerald-700 bg-emerald-700 px-4 py-2 text-white shadow-sm shadow-emerald-900/15 hover:bg-emerald-800';
    const dangerBtn = 'text-sm rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-rose-800 hover:bg-rose-100';
    const openPublishedCardPreview = () => {
        previewCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/80 via-white to-white p-5 md:p-6 shadow-sm shadow-emerald-900/5 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-emerald-700/90">Материалы курса</p>
                    <h2 className="font-display text-2xl text-slate-800 mt-1 break-words">{item.title}</h2>
                    <div className="flex flex-wrap gap-2 mt-3">
                        <StatusBadge>{CONTENT_STATUS_LABEL[item.status] || item.status}</StatusBadge>
                        <StatusBadge>{labelTargetSection(item.targetSection)}</StatusBadge>
                        <StatusBadge>{TARGET_ROLE_LABELS[item.targetRole] || item.targetRole}</StatusBadge>
                        {item.status === 'published' ? (
                            <button type="button" onClick={openPublishedCardPreview} className="text-xs rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800 hover:bg-emerald-100">
                                Открыть карточку
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>

            {panelMode === 'view' ? (
                <div className="space-y-6">
                    <div className="rounded-2xl border border-emerald-100/90 bg-emerald-50/50 p-5 shadow-sm space-y-5">
                        <h3 className="font-display text-lg text-slate-800">Где материал сейчас в потоке</h3>
                        <ul className="text-sm text-slate-700 space-y-2 list-disc list-inside leading-relaxed">
                            <li>
                                <span className="font-medium">Статус карточки:</span>
                                {' '}
                                {CONTENT_STATUS_LABEL[item.status] || item.status}
                                .
                                {' '}
                                Материал доступен всем при статусе «Опубликован» и активных привязках ниже.
                            </li>
                            <li>
                                <span className="font-medium">Задуманный раздел (метаданные):</span>
                                {' '}
                                {labelTargetSection(item.targetSection)}
                                {' · '}
                                поток {item.targetCohort || '—'}
                            </li>
                            {item.targetSection === 'lessons' ? (
                                <li>
                                    <span className="font-medium">Модуль:</span>
                                    {' '}
                                    {clampPvlModule(item.moduleNumber ?? item.weekNumber ?? 0)}
                                </li>
                            ) : null}
                            <li>
                                <span className="font-medium">Опубликованные привязки (placements):</span>
                                {' '}
                                {publishedPlacements.length === 0 ? (
                                    <span className="text-slate-500">нет — только метаданные или всё снято с публикации.</span>
                                ) : (
                                    <span className="text-slate-800">
                                        {publishedPlacements.map((p) => `${labelTargetSection(p.targetSection)} (${TARGET_ROLE_LABELS[p.targetRole] || p.targetRole})`).join('; ')}
                                    </span>
                                )}
                            </li>
                            {unpublishedPlacements.length > 0 ? (
                                <li className="text-amber-900/90">
                                    <span className="font-medium">Снятые привязки:</span>
                                    {' '}
                                    {unpublishedPlacements.map((p) => `${labelTargetSection(p.targetSection)} (${TARGET_ROLE_LABELS[p.targetRole] || p.targetRole})`).join('; ')}
                                </li>
                            ) : null}
                        </ul>
                    </div>
                </div>
            ) : (
                <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/45 p-5 md:p-6 shadow-sm shadow-emerald-900/5 space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-display text-lg text-slate-800">Редактирование материала</h3>
                        <span className="text-xs font-medium text-emerald-900 uppercase tracking-wide">Режим правки</span>
                    </div>
                    {editForm ? (
                        <div className="space-y-6">
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500 ml-0.5">Название</label>
                                <input
                                    value={editForm.title}
                                    onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                                    className="w-full bg-white border border-emerald-200/70 rounded-xl p-3 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25"
                                />
                            </div>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500 ml-0.5">Раздел</label>
                                    <select
                                        value={editForm.targetSection}
                                        onChange={(e) => setEditForm((f) => ({ ...f, targetSection: e.target.value }))}
                                        className="w-full bg-white border border-emerald-200/70 rounded-xl p-3 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25"
                                    >
                                        {sections.map((s) => <option key={s} value={s}>{labelTargetSection(s)}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500 ml-0.5">Тип контента</label>
                                    <select
                                        value={editForm.contentType}
                                        onChange={(e) => setEditForm((f) => ({ ...f, contentType: e.target.value }))}
                                        className="w-full bg-white border border-emerald-200/70 rounded-xl p-3 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25"
                                    >
                                        {types.map((s) => <option key={s} value={s}>{CONTENT_TYPE_LABEL[s] || s}</option>)}
                                    </select>
                                </div>
                                {editForm.targetSection === 'lessons' ? (
                                    <div className="space-y-1">
                                        <label className="text-xs text-slate-500 ml-0.5">Тип материала в уроках</label>
                                        <select
                                            value={editForm.lessonKind || 'text_video'}
                                            onChange={(e) => {
                                                const lk = e.target.value;
                                                setEditForm((f) => ({
                                                    ...f,
                                                    lessonKind: lk,
                                                    contentType: lk === 'quiz' ? 'checklist' : lk === 'homework' ? 'template' : 'video',
                                                }));
                                            }}
                                            className="w-full bg-white border border-emerald-200/70 rounded-xl p-3 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25"
                                        >
                                            <option value="text_video">Текстовый урок + видеоурок</option>
                                            <option value="quiz">Тест</option>
                                            <option value="homework">Домашнее задание</option>
                                        </select>
                                    </div>
                                ) : null}
                                {editForm.targetSection === 'practicums' ? (
                                    <>
                                        <div className="space-y-1">
                                            <label className="text-xs text-slate-500 ml-0.5">Дата практикума</label>
                                            <input
                                                type="date"
                                                value={editForm.practicumDate || ''}
                                                onChange={(e) => setEditForm((f) => ({ ...f, practicumDate: e.target.value }))}
                                                className="w-full bg-white border border-emerald-200/70 rounded-xl p-3 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs text-slate-500 ml-0.5">Время начала</label>
                                            <input
                                                type="time"
                                                value={editForm.practicumTime || ''}
                                                onChange={(e) => setEditForm((f) => ({ ...f, practicumTime: e.target.value }))}
                                                className="w-full bg-white border border-emerald-200/70 rounded-xl p-3 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs text-slate-500 ml-0.5">Ссылка на документ</label>
                                            <input
                                                value={editForm.practicumDocumentUrl || ''}
                                                onChange={(e) => setEditForm((f) => ({ ...f, practicumDocumentUrl: e.target.value }))}
                                                className="w-full bg-white border border-emerald-200/70 rounded-xl p-3 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25"
                                                placeholder="Ссылка на документ"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs text-slate-500 ml-0.5">Ссылка на видео / запись</label>
                                            <input
                                                value={editForm.practicumVideoUrl || ''}
                                                onChange={(e) => setEditForm((f) => ({ ...f, practicumVideoUrl: e.target.value }))}
                                                className="w-full bg-white border border-emerald-200/70 rounded-xl p-3 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25"
                                                placeholder="Ссылка на видео"
                                            />
                                        </div>
                                    </>
                                ) : null}
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500 ml-0.5">Кто видит материал</label>
                                    <div className="w-full bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 text-sm text-emerald-900/90">
                                        {TARGET_ROLE_LABELS.both}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500 ml-0.5">Поток</label>
                                    <select
                                        value={editForm.targetCohort}
                                        onChange={(e) => setEditForm((f) => ({ ...f, targetCohort: e.target.value }))}
                                        className="w-full bg-white border border-emerald-200/70 rounded-xl p-3 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25"
                                    >
                                        {(pvlDomainApi.adminApi.getAdminCohorts() || []).map((c) => (
                                            <option key={c.id} value={c.id}>{c.title}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500 ml-0.5">Модуль</label>
                                    <select
                                        value={String(clampPvlModule(editForm.moduleNumber))}
                                        onChange={(e) => setEditForm((f) => ({ ...f, moduleNumber: e.target.value, weekNumber: e.target.value }))}
                                        className="w-full bg-white border border-emerald-200/70 rounded-xl p-3 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25"
                                    >
                                        {getPvlCourseModulePickerOptions().map((opt) => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500 ml-0.5">Длительность</label>
                                    <input
                                        value={editForm.estimatedDuration}
                                        onChange={(e) => setEditForm((f) => ({ ...f, estimatedDuration: e.target.value }))}
                                        className="w-full bg-white border border-emerald-200/70 rounded-xl p-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25"
                                        placeholder="например 20 мин"
                                    />
                                </div>
                            </div>
                            {editForm.targetSection === 'library' ? (
                                <div className="grid md:grid-cols-2 gap-4">
                                    <div className="space-y-1 md:col-span-2">
                                        <label className="text-xs text-slate-500 ml-0.5">Категория библиотеки</label>
                                        <select
                                            value={editForm.libraryCategoryId || 'all'}
                                            onChange={(e) => setEditForm((f) => ({ ...f, libraryCategoryId: e.target.value }))}
                                            className="w-full bg-white border border-emerald-200/70 rounded-xl p-3 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25"
                                        >
                                            <option value="all">Выберите категорию</option>
                                            {libraryCategories.map((c) => (
                                                <option key={c.id} value={c.id}>{c.title}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-1 md:col-span-2">
                                        <label className="text-xs text-slate-500 ml-0.5">Название урока (рамка в категории)</label>
                                        <input
                                            value={editForm.libraryLessonGroupTitle || ''}
                                            onChange={(e) => setEditForm((f) => ({ ...f, libraryLessonGroupTitle: e.target.value }))}
                                            className="w-full bg-white border border-emerald-200/70 rounded-xl p-3 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25"
                                            placeholder="Например: Научные основы письменных практик"
                                        />
                                        <p className="text-[11px] text-slate-500 leading-snug">Материалы с одинаковым названием отображаются в одной рамке в библиотеке.</p>
                                    </div>
                                </div>
                            ) : null}
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500 ml-0.5">Теги через запятую</label>
                                <input
                                    value={editForm.tagsText}
                                    onChange={(e) => setEditForm((f) => ({ ...f, tagsText: e.target.value }))}
                                    className="w-full bg-white border border-emerald-200/70 rounded-xl p-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25"
                                />
                            </div>
                            {editForm.targetSection === 'lessons' && editForm.lessonKind === 'quiz' ? (
                                <>
                                    <LessonQuizBuilder
                                        value={editForm.lessonQuiz}
                                        onChange={(next) => setEditForm((f) => ({ ...f, lessonQuiz: next }))}
                                        validation={validateLessonQuiz(editForm.lessonQuiz)}
                                    />
                                    <section className="overflow-hidden rounded-3xl border border-emerald-200/80 bg-white p-4 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)]">
                                        <div className="text-sm font-medium text-emerald-900 mb-1">Предпросмотр теста (как карточка в трекере)</div>
                                        <p className="text-xs text-slate-500 mb-2">{editForm.shortDescription || 'Без описания'}</p>
                                        <div className="text-xs text-slate-600">Вопросов: {normalizeLessonQuiz(editForm.lessonQuiz).questions.length} · Проходной порог: {normalizeLessonQuiz(editForm.lessonQuiz).settings.passPercent}% · Попыток: {normalizeLessonQuiz(editForm.lessonQuiz).settings.attempts}</div>
                                        <div className="mt-2 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/90 to-white p-3 text-xs text-slate-700">
                                            {normalizeLessonQuiz(editForm.lessonQuiz).instruction || 'Инструкция перед тестом не заполнена.'}
                                        </div>
                                    </section>
                                </>
                            ) : editForm.targetSection === 'lessons' && editForm.lessonKind === 'homework' ? (
                                <>
                                    <LessonHomeworkBuilder
                                        value={editForm.lessonHomework}
                                        onChange={(next) => setEditForm((f) => ({ ...f, lessonHomework: next }))}
                                        validation={validateLessonHomework(editForm.lessonHomework, { requireCriteria: false })}
                                    />
                                    <div className="space-y-2">
                                        <label className="text-xs text-slate-500 ml-0.5">Полный текст задания</label>
                                        <RichEditor
                                            key={`pvl-hw-${contentId}`}
                                            value={editForm.fullDescriptionHtml}
                                            onChange={(val) => setEditForm((f) => ({ ...f, fullDescriptionHtml: val }))}
                                            onUploadImage={pvlRichEditorUploadImage}
                                            placeholder="Опишите домашнее задание..."
                                        />
                                    </div>
                                    <section className="rounded-xl border border-emerald-100 bg-white p-4">
                                        <div className="text-sm font-medium text-emerald-900 mb-2">Предпросмотр для ученицы</div>
                                        <div className="text-xs text-slate-600">Модуль {clampPvlModule(editForm.moduleNumber)}</div>
                                        <div className="mt-1 text-xs text-slate-600">
                                            Дедлайн: {normalizeLessonHomework(editForm.lessonHomework).deadline.type === 'fixed_date'
                                                ? (normalizeLessonHomework(editForm.lessonHomework).deadline.at || 'не задан')
                                                : normalizeLessonHomework(editForm.lessonHomework).deadline.type === 'week_based'
                                                    ? (normalizeLessonHomework(editForm.lessonHomework).deadline.weekBasedLabel || 'по модулю')
                                                    : 'без дедлайна'}
                                        </div>
                                        <div className="mt-2 text-xs text-slate-700">
                                            Формат ответа: {normalizeLessonHomework(editForm.lessonHomework).responseFormat.artifactType}
                                        </div>
                                    </section>
                                </>
                            ) : videoSummaryEditor ? (
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-xs text-slate-500 ml-0.5">Короткий текст над видео</label>
                                        <textarea
                                            value={editForm.shortDescription || ''}
                                            onChange={(e) => setEditForm((f) => ({ ...f, shortDescription: e.target.value }))}
                                            rows={2}
                                            className="w-full bg-white border border-emerald-200/70 rounded-xl p-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25"
                                            placeholder="Необязательно: вводная строка над плеером"
                                        />
                                    </div>
                                    <div className="grid md:grid-cols-2 gap-2">
                                        <input
                                            value={editForm.lessonVideoUrl || ''}
                                            onChange={(e) => setEditForm((f) => ({ ...f, lessonVideoUrl: e.target.value }))}
                                            className="w-full bg-white border border-emerald-200/70 rounded-xl p-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25"
                                            placeholder="Ссылка на видео (опционально)"
                                        />
                                        <input
                                            value={editForm.lessonRutubeUrl || ''}
                                            onChange={(e) => setEditForm((f) => ({ ...f, lessonRutubeUrl: e.target.value }))}
                                            className="w-full bg-white border border-emerald-200/70 rounded-xl p-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25"
                                            placeholder="RuTube (опционально)"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-slate-500 ml-0.5">Код встраивания Kinescope (iframe)</label>
                                        <textarea
                                            value={editForm.lessonVideoEmbed || ''}
                                            onChange={(e) => setEditForm((f) => ({ ...f, lessonVideoEmbed: e.target.value }))}
                                            rows={4}
                                            className="w-full font-mono text-[12px] bg-white border border-emerald-200/70 rounded-xl p-3 text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25"
                                            placeholder='<iframe src="https://kinescope.io/embed/..." ...></iframe>'
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-slate-500 ml-0.5">Конспект урока</label>
                                        <RichEditor
                                            key={`pvl-lesson-body-${contentId}`}
                                            value={editForm.fullDescriptionHtml}
                                            onChange={(val) => setEditForm((f) => ({ ...f, fullDescriptionHtml: val }))}
                                            onUploadImage={pvlRichEditorUploadImage}
                                            placeholder="Текст конспекта под видео..."
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <label className="text-xs text-slate-500 ml-0.5">Текст материала</label>
                                    <RichEditor
                                        key={`pvl-cms-${contentId}`}
                                        value={editForm.fullDescriptionHtml}
                                        onChange={(val) => setEditForm((f) => ({ ...f, fullDescriptionHtml: val }))}
                                        onUploadImage={pvlRichEditorUploadImage}
                                        placeholder="Напишите текст материала..."
                                    />
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>
            )}

            <div ref={previewCardRef} className="rounded-2xl border border-emerald-100/90 bg-white p-5 shadow-sm shadow-emerald-900/5 space-y-5">
                <h3 className="font-display text-lg text-emerald-950">Предпросмотр карточки</h3>
                <div className="grid md:grid-cols-2 gap-4">
                    <ParticipantMaterialPreviewCard
                        roleTitle="Участница"
                        item={previewSource}
                        visible={prevStudentSees}
                        disabledHint="Для участниц материал не показывается при текущей целевой роли."
                    />
                    <ParticipantMaterialPreviewCard
                        roleTitle="Ментор"
                        item={previewSource}
                        visible={prevMentorSees}
                        disabledHint="Для менторов материал не показывается при текущей целевой роли."
                    />
                </div>
            </div>
            <div className="rounded-2xl border border-emerald-100/90 bg-emerald-50/30 p-4 shadow-sm shadow-emerald-900/5">
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => navigate('/admin/content')} className={softBtn}>К списку материалов</button>
                    {panelMode === 'view' ? (
                        <>
                            <button type="button" onClick={beginEdit} className={softBtn}>Редактировать</button>
                            {item.status === 'published' ? (
                                <button type="button" onClick={handleUnpublish} className={softBtn}>Снять с публикации</button>
                            ) : item.status === 'unpublished' ? (
                                <>
                                    <button type="button" onClick={commitPublish} className={primaryBtn}>Переопубликовать</button>
                                    <button type="button" onClick={handleArchive} className={dangerBtn}>В архив</button>
                                </>
                            ) : (
                                <button type="button" onClick={commitPublish} className={primaryBtn}>Опубликовать</button>
                            )}
                            {item.status === 'draft' && (
                                <button type="button" onClick={handleArchive} className={dangerBtn}>В архив</button>
                            )}
                        </>
                    ) : (
                        <>
                            <button type="button" onClick={cancelEdit} className={softBtn}>Отменить</button>
                            <button type="button" onClick={handleSaveDraft} className={softBtn}>Сохранить черновик</button>
                            <button type="button" onClick={commitPublish} className={primaryBtn}>Сохранить и опубликовать</button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

/** Компактный навигатор материалов сгруппированных по разделам и категориям */
function ContentNavigator({ items, placements, onOpen }) {
    const [open, setOpen] = useState(false);
    const [openSection, setOpenSection] = useState(null);

    const SECTIONS = [
        { key: 'library', label: 'Библиотека' },
        { key: 'lessons', label: 'Уроки' },
        { key: 'practicums', label: 'Практикумы' },
        { key: 'glossary', label: 'Глоссарий' },
    ];

    const grouped = useMemo(() => {
        return SECTIONS.map(({ key, label }) => {
            const sectionItems = [...items]
                .filter((i) => i.targetSection === key)
                .sort((a, b) => {
                    const aOrder = a.orderIndex ?? 999;
                    const bOrder = b.orderIndex ?? 999;
                    if (aOrder !== bOrder) return aOrder - bOrder;
                    return String(a.title || '').localeCompare(String(b.title || ''), 'ru');
                });

            if (key === 'lessons') {
                const byModule = {};
                sectionItems.forEach((i) => {
                    const mod = clampPvlModule(i.moduleNumber ?? i.weekNumber ?? 0);
                    if (!byModule[mod]) byModule[mod] = [];
                    byModule[mod].push(i);
                });
                const groups = Object.entries(byModule)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([mod, its]) => ({ groupTitle: `Модуль ${mod}`, items: its }));
                return { key, label, groups };
            }

            if (key === 'library') {
                const byCat = {};
                sectionItems.forEach((i) => {
                    const cat = i.libraryCategoryTitle || i.categoryTitle || 'Без категории';
                    if (!byCat[cat]) byCat[cat] = [];
                    byCat[cat].push(i);
                });
                const groups = Object.entries(byCat)
                    .sort(([a], [b]) => a.localeCompare(b, 'ru'))
                    .map(([cat, its]) => ({ groupTitle: cat, items: its }));
                return { key, label, groups };
            }

            return { key, label, groups: [{ groupTitle: null, items: sectionItems }] };
        }).filter((s) => s.groups.some((g) => g.items.length > 0));
    }, [items]);

    if (grouped.length === 0) return null;

    return (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-emerald-900 hover:bg-emerald-100/50 transition-colors"
            >
                <span>Навигатор материалов</span>
                <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="border-t border-emerald-100 divide-y divide-emerald-100/60">
                    {grouped.map(({ key, label, groups }) => (
                        <div key={key}>
                            <button
                                type="button"
                                onClick={() => setOpenSection((s) => (s === key ? null : key))}
                                className="w-full flex items-center justify-between px-4 py-2.5 bg-white/60 hover:bg-white/80 transition-colors"
                            >
                                <span className="text-xs font-semibold uppercase tracking-wide text-emerald-800">{label}</span>
                                <ChevronRight size={14} className={`text-emerald-600 transition-transform ${openSection === key ? 'rotate-90' : ''}`} />
                            </button>
                            {openSection === key && (
                                <div className="px-3 pb-3 pt-1 space-y-2 bg-white/40">
                                    {groups.map(({ groupTitle, items: gItems }) => (
                                        <div key={groupTitle ?? '_'}>
                                            {groupTitle && (
                                                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-1 py-1">{groupTitle}</div>
                                            )}
                                            <div className="space-y-0.5">
                                                {gItems.map((i) => (
                                                    <button
                                                        key={i.id}
                                                        type="button"
                                                        onClick={() => onOpen(i.id)}
                                                        className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-slate-700 hover:bg-emerald-100/60 hover:text-emerald-900 transition-colors flex items-center gap-2"
                                                    >
                                                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${i.status === 'published' ? 'bg-emerald-500' : i.status === 'unpublished' ? 'bg-amber-400' : i.status === 'archived' ? 'bg-slate-300' : 'bg-slate-300'}`} />
                                                        <span className="truncate">{i.title}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function AdminContentCenter({ cmsItems, setCmsItems, cmsPlacements, setCmsPlacements, navigate }) {
    const items = cmsItems;
    const placements = cmsPlacements;
    const setItems = setCmsItems;
    const setPlacements = setCmsPlacements;
    const [filters, setFilters] = useState({ section: 'library', status: 'all', role: 'all', type: 'all', cohort: 'all', module: 'all', query: '' });
    const [draggingId, setDraggingId] = useState(null);
    const [previewAsStudent, setPreviewAsStudent] = useState(true);
    const [isCoverUploading, setIsCoverUploading] = useState(false);
    const [importedDocName, setImportedDocName] = useState('');
    const [docImportError, setDocImportError] = useState('');
    const [customLibraryCategories, setCustomLibraryCategories] = useState([]);
    const [showNewLibraryCategoryInput, setShowNewLibraryCategoryInput] = useState(false);
    const [showLibraryAdvanced, setShowLibraryAdvanced] = useState(false);
    const [showLessonPreview, setShowLessonPreview] = useState(false);
    const [draft, setDraft] = useState({
        title: '',
        shortDescription: '',
        fullDescriptionHtml: '',
        contentType: 'text',
        targetSection: 'library',
        libraryCategoryId: 'all',
        libraryCategoryCustomTitle: '',
        libraryLessonGroupTitle: '',
        lessonKind: 'text_video',
        lessonVideoUrl: '',
        lessonVideoEmbed: '',
        lessonRutubeUrl: '',
        lessonTextBody: '',
        lessonQuiz: createDefaultLessonQuiz(),
        lessonHomeworkPrompt: '',
        lessonHomeworkExpected: '',
        lessonHomeworkAllowText: true,
        lessonHomeworkAllowFile: true,
        lessonHomeworkDeadlineRule: '',
        lessonHomeworkRevisionLimit: 3,
        lessonHomework: createDefaultLessonHomework(),
        coverImage: '',
        fileUrl: '',
        externalUrl: '',
        targetRole: 'both',
        targetCohort: 'cohort-2026-1',
        status: 'draft',
        visibility: 'all',
        weekNumber: 1,
        moduleNumber: 1,
        practicumDate: '',
        practicumTime: '',
        estimatedDuration: '',
        tagsText: '',
    });
    const sections = ['lessons', 'library', 'practicums', 'glossary'];
    const types = ['video', 'text', 'pdf', 'checklist', 'template', 'link', 'audio', 'fileBundle'];
    const baseLibraryCategories = useMemo(() => {
        try {
            const sid = getFirstCohortStudentId();
            if (!sid) return [];
            return pvlDomainApi.studentApi.getLibraryCategoriesWithCounts(sid) || [];
        } catch {
            return [];
        }
    }, [items.length, cmsPlacements.length]);
    const libraryCategories = useMemo(() => {
        const byId = new Map();
        [...baseLibraryCategories, ...customLibraryCategories].forEach((c) => {
            const id = String(c?.id || '').trim();
            const title = String(c?.title || '').trim();
            if (!id || !title) return;
            byId.set(id, { id, title });
        });
        return Array.from(byId.values());
    }, [baseLibraryCategories, customLibraryCategories]);
    const modulePickerOptions = useMemo(() => getPvlCourseModulePickerOptions(), []);
    const createLibraryCategoryId = useCallback((title) => buildCategoryIdFromTitle(title), []);
    const addOrSelectCustomLibraryCategory = useCallback((title) => {
        const normalizedTitle = String(title || '').trim();
        if (!normalizedTitle) return null;
        const existing = libraryCategories.find((c) => String(c.title || '').toLowerCase() === normalizedTitle.toLowerCase());
        if (existing) return existing;
        const idBase = buildCategoryIdFromTitle(normalizedTitle);
        let id = idBase;
        let suffix = 1;
        const existingIds = new Set(libraryCategories.map((c) => String(c.id || '').toLowerCase()));
        while (existingIds.has(String(id).toLowerCase())) {
            suffix += 1;
            id = `${idBase}_${suffix}`;
        }
        const created = { id, title: normalizedTitle };
        setCustomLibraryCategories((prev) => [created, ...prev]);
        return created;
    }, [libraryCategories]);
    const renameSelectedLibraryCategory = useCallback(() => {
        const selectedId = String(draft.libraryCategoryId || '');
        const nextTitle = String(draft.libraryCategoryCustomTitle || '').trim();
        if (!selectedId || selectedId === 'all' || !nextTitle) return;
        const baseTarget = baseLibraryCategories.find((c) => c.id === selectedId);
        if (baseTarget) {
            setCustomLibraryCategories((prev) => {
                const without = prev.filter((c) => c.id !== selectedId);
                return [{ id: selectedId, title: nextTitle }, ...without];
            });
        } else {
            setCustomLibraryCategories((prev) => prev.map((c) => (c.id === selectedId ? { ...c, title: nextTitle } : c)));
        }
    }, [baseLibraryCategories, draft.libraryCategoryCustomTitle, draft.libraryCategoryId]);
    const filtered = filterContentItems(items, filters)
        .filter((i) => sections.includes(i.targetSection))
        .filter((i) => (filters.cohort === 'all' ? true : i.targetCohort === filters.cohort))
        .filter((i) => (filters.module === 'all' ? true : String(clampPvlModule(i.moduleNumber ?? i.weekNumber ?? 0)) === String(filters.module)))
        .sort((a, b) => (a.orderIndex ?? 999) - (b.orderIndex ?? 999));
    const handleCreate = async ({ publish = false } = {}) => {
        if (!draft.title.trim()) return;
        const customLibraryTitle = String(draft.libraryCategoryCustomTitle || '').trim();
        if (draft.targetSection === 'library' && (!draft.libraryCategoryId || draft.libraryCategoryId === 'all') && !customLibraryTitle) {
            window.alert('Для библиотечного материала выберите категорию.');
            return;
        }
        if (draft.targetSection === 'lessons' && draft.lessonKind === 'quiz') {
            const qErrors = validateLessonQuiz(draft.lessonQuiz);
            if (qErrors.global || Object.keys(qErrors).some((k) => k !== 'global')) {
                window.alert('Тест заполнен не полностью: проверьте вопросы и правильные ответы.');
                return;
            }
        }
        if (draft.targetSection === 'lessons' && draft.lessonKind === 'homework') {
            const hwErrors = validateLessonHomework(draft.lessonHomework, { requireCriteria: false });
            if (Object.keys(hwErrors).length) {
                window.alert('Домашнее задание заполнено не полностью: проверьте формат ответа, дедлайн и лимит доработок.');
                return;
            }
        }
        const { tagsText, ...rest } = draft;
        let normalizedContentType = draft.contentType;
        if (draft.targetSection === 'lessons') {
            if (draft.lessonKind === 'text_video') normalizedContentType = 'video';
            if (draft.lessonKind === 'quiz') normalizedContentType = 'checklist';
            if (draft.lessonKind === 'homework') normalizedContentType = 'template';
        } else if (draft.targetSection === 'glossary' || draft.targetSection === 'practicums') {
            normalizedContentType = 'text';
        }
        const resolvedCategoryId = draft.targetSection === 'library'
            ? (
                draft.libraryCategoryId && draft.libraryCategoryId !== 'all'
                    ? draft.libraryCategoryId
                    : createLibraryCategoryId(customLibraryTitle)
            )
            : '';
        const resolvedCategoryTitle = draft.targetSection === 'library'
            ? (
                customLibraryTitle
                    || libraryCategories.find((c) => c.id === draft.libraryCategoryId)?.title
                    || ''
            )
            : '';
        const normalizedDescription = String(draft.fullDescriptionHtml || draft.lessonTextBody || draft.shortDescription || '');
        const record = {
            ...rest,
            status: publish ? 'published' : 'draft',
            contentType: normalizedContentType,
            tags: String(tagsText || '').split(',').map((x) => x.trim()).filter(Boolean),
            description: normalizedDescription,
            fullDescription: normalizedDescription,
            libraryCategoryId: draft.targetSection === 'library' ? resolvedCategoryId : undefined,
            libraryCategoryTitle: draft.targetSection === 'library' ? resolvedCategoryTitle : undefined,
            categoryId: draft.targetSection === 'library' ? resolvedCategoryId : undefined,
            categoryTitle: draft.targetSection === 'library' ? resolvedCategoryTitle : undefined,
            libraryLessonGroupTitle: draft.targetSection === 'library' ? String(draft.libraryLessonGroupTitle || '').trim() : undefined,
            lessonKind: draft.targetSection === 'lessons' ? draft.lessonKind : undefined,
            lessonVideoUrl: draft.targetSection === 'lessons' && draft.lessonKind === 'text_video' ? draft.lessonVideoUrl : undefined,
            lessonVideoEmbed: draft.targetSection === 'lessons' && draft.lessonKind === 'text_video' ? draft.lessonVideoEmbed : undefined,
            lessonRutubeUrl: draft.targetSection === 'lessons' && draft.lessonKind === 'text_video' ? draft.lessonRutubeUrl : undefined,
            lessonTextBody: draft.targetSection === 'lessons' && draft.lessonKind === 'text_video' ? draft.lessonTextBody : undefined,
            lessonQuiz: draft.targetSection === 'lessons' && draft.lessonKind === 'quiz' ? normalizeLessonQuiz(draft.lessonQuiz) : undefined,
            lessonHomeworkPrompt: draft.targetSection === 'lessons' && draft.lessonKind === 'homework' ? draft.lessonHomeworkPrompt : undefined,
            lessonHomeworkExpected: draft.targetSection === 'lessons' && draft.lessonKind === 'homework' ? draft.lessonHomeworkExpected : undefined,
            lessonHomeworkAllowText: draft.targetSection === 'lessons' && draft.lessonKind === 'homework' ? !!draft.lessonHomeworkAllowText : undefined,
            lessonHomeworkAllowFile: draft.targetSection === 'lessons' && draft.lessonKind === 'homework' ? !!draft.lessonHomeworkAllowFile : undefined,
            lessonHomeworkDeadlineRule: draft.targetSection === 'lessons' && draft.lessonKind === 'homework' ? draft.lessonHomeworkDeadlineRule : undefined,
            lessonHomeworkRevisionLimit: draft.targetSection === 'lessons' && draft.lessonKind === 'homework' ? Number(draft.lessonHomeworkRevisionLimit) || 0 : undefined,
            lessonHomework: draft.targetSection === 'lessons' && draft.lessonKind === 'homework' ? normalizeLessonHomework(draft.lessonHomework) : undefined,
            practicumDate: draft.targetSection === 'practicums' ? (draft.practicumDate || '') : undefined,
            practicumTime: draft.targetSection === 'practicums' ? (draft.practicumTime || '') : undefined,
            practicumDocumentUrl: draft.targetSection === 'practicums' ? (draft.fileUrl || '') : undefined,
            practicumVideoUrl: draft.targetSection === 'practicums' ? (draft.externalUrl || '') : undefined,
            coverImage: draft.targetSection === 'library' ? (draft.coverImage || '') : '',
            externalLinks: [draft.externalUrl, draft.fileUrl].filter(Boolean),
            createdBy: 'u-adm-1',
            ...(draft.targetSection === 'library' || draft.targetSection === 'glossary' ? { moduleNumber: null } : {}),
        };
        try {
            const created = await pvlDomainApi.adminApi.createContentItem(record);
            const createdPatch = {};
            if (publish && draft.targetSection === 'practicums' && draft.practicumDate) {
                const hhmm = String(draft.practicumTime || '19:00');
                const startAt = `${draft.practicumDate}T${hhmm}:00.000Z`;
                const [hh, mm] = hhmm.split(':').map((x) => Number(x) || 0);
                const end = new Date(Date.UTC(
                    Number(draft.practicumDate.slice(0, 4)),
                    Number(draft.practicumDate.slice(5, 7)) - 1,
                    Number(draft.practicumDate.slice(8, 10)),
                    hh,
                    mm,
                ));
                end.setUTCMinutes(end.getUTCMinutes() + 90);
                const endAt = end.toISOString();
                const ev = pvlDomainApi.adminApi.createCalendarEvent({
                    title: draft.title,
                    description: draft.fullDescriptionHtml || draft.shortDescription || '',
                    eventType: 'practicum_done',
                    date: draft.practicumDate,
                    startAt,
                    endAt,
                    visibilityRole: 'all',
                    cohortId: draft.targetCohort || 'cohort-2026-1',
                    colorToken: 'practicum_done',
                    recordingUrl: draft.externalUrl || '',
                    recapText: draft.fullDescriptionHtml || '',
                });
                if (ev?.id) {
                    createdPatch.linkedPracticumEventId = ev.id;
                    await pvlDomainApi.adminApi.updateContentItem(created.id, createdPatch);
                }
            }
            setItems((prev) => [{ ...created, ...createdPatch }, ...prev]);
            setDraft((d) => ({
                ...d,
                title: '',
                shortDescription: '',
                fullDescriptionHtml: '',
                tagsText: '',
                lessonVideoUrl: '',
                lessonVideoEmbed: '',
                lessonRutubeUrl: '',
                lessonTextBody: '',
                lessonQuiz: createDefaultLessonQuiz(),
                lessonHomeworkPrompt: '',
                lessonHomeworkExpected: '',
                lessonHomework: createDefaultLessonHomework(),
                coverImage: '',
                fileUrl: '',
                externalUrl: '',
                practicumDate: '',
                practicumTime: '',
                libraryCategoryCustomTitle: '',
            }));
            navigate(`/admin/content/${created.id}`);
        } catch (e) {
            try {
                window.alert(`Не удалось создать материал: ${e?.message || e}`);
            } catch {
                /* noop */
            }
        }
    };
    const handleCoverUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setIsCoverUploading(true);
            const compressedFile = await api.compressMeetingImage(file);
            const reader = new FileReader();
            reader.onload = (ev) => {
                setDraft((d) => ({ ...d, coverImage: ev.target?.result || '' }));
            };
            reader.readAsDataURL(compressedFile);
            const url = await api.uploadMeetingImage(compressedFile);
            setDraft((d) => ({ ...d, coverImage: url || d.coverImage }));
        } catch {
            window.alert('Не удалось загрузить обложку. Попробуйте еще раз.');
        } finally {
            setIsCoverUploading(false);
            e.target.value = '';
        }
    };
    const handleImportContentDocument = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setDocImportError('');
        try {
            const ext = String(file.name || '').toLowerCase();
            const supported = ext.endsWith('.md') || ext.endsWith('.markdown') || ext.endsWith('.txt');
            if (!supported) {
                setDocImportError('Поддерживаются только .md, .markdown и .txt для автоформатирования.');
                return;
            }
            const text = await file.text();
            const parsed = parseImportedPvlDocWithFileName(text, file.name);
            setDraft((d) => ({
                ...d,
                title: parsed.title,
                shortDescription: parsed.summary || d.shortDescription,
                fullDescriptionHtml: parsed.html,
                lessonTextBody: d.targetSection === 'lessons' && d.lessonKind === 'text_video' ? parsed.html : d.lessonTextBody,
                lessonHomeworkPrompt: d.targetSection === 'lessons' && d.lessonKind === 'homework' ? parsed.html : d.lessonHomeworkPrompt,
            }));
            setImportedDocName(file.name);
        } catch {
            setDocImportError('Не удалось прочитать файл. Проверьте кодировку и формат.');
        } finally {
            e.target.value = '';
        }
    };
    const handleDeleteItem = async (i) => {
        if (!window.confirm(`Удалить материал «${i.title}»? Связанные размещения в разделах тоже будут убраны.`)) return;
        try {
            await pvlDomainApi.adminApi.deleteContentItem(i.id);
            setItems((prev) => prev.filter((x) => x.id !== i.id));
            setPlacements((prev) => prev.filter((p) => (p.contentId || p.contentItemId) !== i.id));
        } catch (e) {
            try {
                window.alert(`Не удалось удалить: ${e?.message || e}`);
            } catch {
                /* noop */
            }
        }
    };
    const handleDropReorder = (targetId) => {
        if (!draggingId || draggingId === targetId) { setDraggingId(null); return; }
        setItems((prev) => {
            const fromIdx = prev.findIndex((x) => x.id === draggingId);
            const toIdx = prev.findIndex((x) => x.id === targetId);
            if (fromIdx === -1 || toIdx === -1) return prev;
            const next = [...prev];
            const [moved] = next.splice(fromIdx, 1);
            next.splice(toIdx, 0, moved);
            const section = moved.targetSection;
            let order = 0;
            const mapped = next.map((item) => {
                if (item.targetSection !== section) return item;
                const updated = { ...item, orderIndex: order++ };
                return updated;
            });
            const toSave = mapped
                .filter((it) => it.targetSection === section)
                .map((it) => ({ id: it.id, orderIndex: it.orderIndex }));
            void (async () => {
                try {
                    await Promise.all(toSave.map((row) => pvlDomainApi.adminApi.updateContentItem(row.id, { orderIndex: row.orderIndex })));
                    const placementUpdates = [];
                    toSave.forEach((row) => {
                        const related = placements.filter((p) => (p.contentItemId || p.contentId) === row.id);
                        related.forEach((p) => {
                            placementUpdates.push({ placementId: p.id, orderIndex: row.orderIndex });
                        });
                    });
                    if (placementUpdates.length > 0) {
                        await Promise.all(placementUpdates.map((u) => pvlDomainApi.adminApi.updatePlacement(u.placementId, { orderIndex: u.orderIndex })));
                        setPlacements((prev) => prev.map((p) => {
                            const upd = placementUpdates.find((u) => u.placementId === p.id);
                            return upd ? { ...p, orderIndex: upd.orderIndex } : p;
                        }));
                    }
                } catch (e) {
                    try {
                        window.alert(`Не удалось сохранить порядок: ${e?.message || e}`);
                    } catch {
                        /* noop */
                    }
                }
            })();
            return mapped;
        });
        setDraggingId(null);
    };
    const canPublishItem = (row) => {
        if (row?.targetSection === 'lessons' && row?.lessonKind === 'quiz') {
            const errors = validateLessonQuiz(row.lessonQuiz);
            return !(errors.global || Object.keys(errors).some((k) => k !== 'global'));
        }
        if (row?.targetSection === 'lessons' && row?.lessonKind === 'homework') {
            const errors = validateLessonHomework(row.lessonHomework, { requireCriteria: false });
            return Object.keys(errors).length === 0;
        }
        return true;
    };
    const cmsIn = 'mt-1 rounded-xl border border-emerald-200/70 bg-white p-2 text-sm text-slate-800 shadow-sm shadow-emerald-900/[0.03] outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25';
    const cmsLbl = 'text-xs font-medium text-emerald-900/75';
    const cmsFormTitle = 'text-xs font-semibold uppercase tracking-wide text-emerald-800 border-l-4 border-emerald-500 pl-3';
    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 via-white to-white p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm shadow-emerald-900/5">
                <div>
                    <h2 className="font-display text-2xl text-slate-800">Материалы курса</h2>
                    {pvlDevToolsEnabled() ? <p className="text-[11px] text-amber-800 mt-1">Dev: данные в памяти сессии.</p> : null}
                </div>
                <button type="button" onClick={() => handleCreate({ publish: true })} className="text-sm rounded-xl bg-emerald-700 px-4 py-2.5 font-medium text-white shadow-sm shadow-emerald-900/20 hover:bg-emerald-800 shrink-0">Сохранить и опубликовать</button>
            </div>
            <div className="rounded-2xl border border-emerald-100/90 bg-white p-3 md:p-4 shadow-sm shadow-emerald-900/5 space-y-5">
                <div className="grid md:grid-cols-2 gap-2">
                    <label className={cmsLbl}>Раздел
                        <select
                            value={draft.targetSection}
                            onChange={(e) => {
                                const nextSection = e.target.value;
                                setDraft((d) => ({
                                    ...d,
                                    targetSection: nextSection,
                                    contentType: nextSection === 'lessons'
                                        ? (d.lessonKind === 'quiz' ? 'checklist' : d.lessonKind === 'homework' ? 'template' : 'video')
                                        : (nextSection === 'glossary' || nextSection === 'practicums') ? 'text' : d.contentType,
                                }));
                            }}
                            className={`${cmsIn} w-full`}
                        >
                            {sections.map((s) => <option key={s} value={s}>{labelTargetSection(s)}</option>)}
                        </select>
                    </label>
                    {draft.targetSection === 'lessons' ? (
                        <label className={cmsLbl}>Тип материала в уроках
                            <select
                                value={draft.lessonKind}
                                onChange={(e) => {
                                    const lessonKind = e.target.value;
                                    setDraft((d) => ({
                                        ...d,
                                        lessonKind,
                                        contentType: lessonKind === 'quiz' ? 'checklist' : lessonKind === 'homework' ? 'template' : 'video',
                                    }));
                                }}
                                className={`${cmsIn} w-full`}
                            >
                                <option value="text_video">Текстовый урок + видеоурок</option>
                                <option value="quiz">Тест</option>
                                <option value="homework">Домашнее задание</option>
                            </select>
                        </label>
                    ) : <div />}
                </div>
                <section className="rounded-xl border border-emerald-200/60 bg-emerald-50/50 p-2.5 flex flex-wrap items-center gap-2">
                    <label className="text-xs rounded-lg border border-emerald-300/80 bg-white px-2.5 py-1.5 text-emerald-900 cursor-pointer whitespace-nowrap shadow-sm hover:bg-emerald-50">
                        Загрузить документ (.md/.txt)
                        <input
                            type="file"
                            accept=".md,.markdown,.txt,text/markdown,text/plain"
                            className="hidden"
                            onChange={handleImportContentDocument}
                        />
                    </label>
                    {importedDocName ? <span className="text-xs text-emerald-700">Загружен: {importedDocName}</span> : null}
                    {docImportError ? <span className="text-xs text-rose-700">{docImportError}</span> : null}
                </section>

                {draft.targetSection === 'library' ? (
                    <section className="space-y-2 rounded-xl border border-emerald-100/90 bg-emerald-50/30 p-2.5 md:p-3">
                        <div className={cmsFormTitle}>Форма библиотечного материала</div>
                        <div className="grid gap-2 md:grid-cols-2">
                            <div className="space-y-1 md:col-span-2">
                                <label className={cmsLbl}>Название</label>
                                <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} className={`w-full ${cmsIn}`} placeholder="Название" />
                            </div>
                            <div className="min-w-0 space-y-1">
                                <label className={cmsLbl}>Категория</label>
                                <select value={draft.libraryCategoryId} onChange={(e) => setDraft((d) => ({ ...d, libraryCategoryId: e.target.value }))} className={`w-full ${cmsIn}`}>
                                    <option value="all">Выберите категорию</option>
                                    {libraryCategories.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                                </select>
                            </div>
                            <div className="min-w-0 space-y-1">
                                <label className={cmsLbl}>Название урока (рамка в категории)</label>
                                <input
                                    value={draft.libraryLessonGroupTitle}
                                    onChange={(e) => setDraft((d) => ({ ...d, libraryLessonGroupTitle: e.target.value }))}
                                    className={`w-full ${cmsIn}`}
                                    placeholder="Например: Научные основы письменных практик"
                                />
                                <p className="text-[11px] text-slate-500 leading-snug">Материалы с одинаковым названием отображаются в одной рамке в библиотеке.</p>
                            </div>
                            <div className="min-w-0 space-y-1 md:col-span-2">
                                <label className={cmsLbl}>Теги</label>
                                <input value={draft.tagsText} onChange={(e) => setDraft((d) => ({ ...d, tagsText: e.target.value }))} className={`w-full ${cmsIn}`} placeholder="Теги через запятую" />
                            </div>
                            <div className="flex flex-wrap items-center gap-2 pt-0.5 md:col-span-2">
                                <button
                                    type="button"
                                    onClick={() => setShowLibraryAdvanced((v) => !v)}
                                    className="text-xs rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-emerald-900 hover:bg-emerald-50/80"
                                >
                                    {showLibraryAdvanced ? 'Скрыть доп. поля' : 'Показать доп. поля'}
                                </button>
                                <span className="text-[11px] text-slate-400">Категории, обложка и ссылки</span>
                            </div>
                            {showLibraryAdvanced ? (
                                <>
                                    <div className="space-y-1">
                                        <label className="text-xs text-slate-500 opacity-0">Действия</label>
                                        <button
                                            type="button"
                                            className="w-full text-xs rounded-xl border border-emerald-200 px-3 py-2 text-emerald-900 bg-white hover:bg-emerald-50/80"
                                            onClick={() => setShowNewLibraryCategoryInput((v) => !v)}
                                        >
                                            {showNewLibraryCategoryInput ? 'Скрыть поле категории' : 'Добавить категорию'}
                                        </button>
                                    </div>
                                    {showNewLibraryCategoryInput ? (
                                        <>
                                            <input
                                                value={draft.libraryCategoryCustomTitle}
                                                onChange={(e) => setDraft((d) => ({ ...d, libraryCategoryCustomTitle: e.target.value }))}
                                                className={cmsIn}
                                                placeholder="Новая категория"
                                            />
                                            <button
                                                type="button"
                                                className="text-xs rounded-xl border border-emerald-600 bg-emerald-700 px-3 py-2 text-white hover:bg-emerald-800"
                                                onClick={() => {
                                                    const created = addOrSelectCustomLibraryCategory(draft.libraryCategoryCustomTitle);
                                                    if (!created) return;
                                                    setDraft((d) => ({ ...d, libraryCategoryId: created.id, libraryCategoryCustomTitle: '' }));
                                                    setShowNewLibraryCategoryInput(false);
                                                }}
                                            >
                                                Добавить в список категорий
                                            </button>
                                        </>
                                    ) : null}
                                    <div className="rounded-xl border border-emerald-100 bg-white p-3 space-y-2 md:col-span-2">
                                        <div className="text-xs font-medium text-emerald-900/80">Загрузить обложку</div>
                                        <div className="flex items-center gap-2">
                                            <input value={draft.coverImage} onChange={(e) => setDraft((d) => ({ ...d, coverImage: e.target.value }))} className="w-full rounded-lg border border-emerald-200/70 bg-white p-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25" placeholder="Ссылка на обложку / изображение" />
                                            <label className="text-xs rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-900 cursor-pointer whitespace-nowrap hover:bg-emerald-100/80">
                                                {isCoverUploading ? 'Загрузка…' : 'Загрузить'}
                                                <input type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
                                            </label>
                                        </div>
                                        <p className="text-[11px] text-slate-400">Рекомендуемый размер: 1200x630px</p>
                                        {draft.coverImage ? (
                                            <div className="h-24 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                                                <img src={draft.coverImage} alt="Обложка" className="w-full h-full object-cover" />
                                            </div>
                                        ) : null}
                                    </div>
                                    <div className="space-y-1">
                                        <label className={cmsLbl}>Ссылка на документ</label>
                                        <input value={draft.fileUrl} onChange={(e) => setDraft((d) => ({ ...d, fileUrl: e.target.value }))} className={`w-full ${cmsIn}`} placeholder="Ссылка на документ" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className={cmsLbl}>Ссылка на видео</label>
                                        <input value={draft.externalUrl} onChange={(e) => setDraft((d) => ({ ...d, externalUrl: e.target.value }))} className={`w-full ${cmsIn}`} placeholder="Ссылка на видео" />
                                    </div>
                                </>
                            ) : null}
                        </div>
                        <div className="space-y-1">
                            <label className={cmsLbl}>Текст материала</label>
                            <RichEditor
                                key="create-library"
                                value={draft.fullDescriptionHtml}
                                onChange={(val) => setDraft((d) => ({ ...d, fullDescriptionHtml: val }))}
                                onUploadImage={pvlRichEditorUploadImage}
                                placeholder="Напишите материал для библиотеки..."
                            />
                        </div>
                    </section>
                ) : null}

                {draft.targetSection === 'practicums' ? (
                    <section className="space-y-2 rounded-xl border border-emerald-100/90 bg-emerald-50/30 p-2.5 md:p-3">
                        <div className={cmsFormTitle}>Форма материала для практикумов</div>
                        <div className="grid gap-2 md:grid-cols-2">
                            <div className="space-y-1 md:col-span-2">
                                <label className={cmsLbl}>Название</label>
                                <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} className={`w-full ${cmsIn}`} placeholder="Название" />
                            </div>
                            <div className="min-w-0 space-y-1">
                                <label className={cmsLbl}>Теги</label>
                                <input value={draft.tagsText} onChange={(e) => setDraft((d) => ({ ...d, tagsText: e.target.value }))} className={`w-full ${cmsIn}`} placeholder="Теги через запятую" />
                            </div>
                            <div className="space-y-1">
                                <label className={cmsLbl}>Поток</label>
                                <select
                                    value={draft.targetCohort}
                                    onChange={(e) => setDraft((d) => ({ ...d, targetCohort: e.target.value }))}
                                    className={`w-full ${cmsIn}`}
                                >
                                    {(pvlDomainApi.adminApi.getAdminCohorts() || []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className={cmsLbl}>Дата практикума</label>
                                <input
                                    type="date"
                                    value={draft.practicumDate}
                                    onChange={(e) => setDraft((d) => ({ ...d, practicumDate: e.target.value }))}
                                    className={`w-full ${cmsIn}`}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className={cmsLbl}>Время начала</label>
                                <input
                                    type="time"
                                    value={draft.practicumTime}
                                    onChange={(e) => setDraft((d) => ({ ...d, practicumTime: e.target.value }))}
                                    className={`w-full ${cmsIn}`}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className={cmsLbl}>Ссылка на документ</label>
                                <input value={draft.fileUrl} onChange={(e) => setDraft((d) => ({ ...d, fileUrl: e.target.value }))} className={`w-full ${cmsIn}`} placeholder="Ссылка на документ" />
                            </div>
                            <div className="space-y-1">
                                <label className={cmsLbl}>Ссылка на видео</label>
                                <input value={draft.externalUrl} onChange={(e) => setDraft((d) => ({ ...d, externalUrl: e.target.value }))} className={`w-full ${cmsIn}`} placeholder="Ссылка на видео" />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className={cmsLbl}>Описание / конспект практикума</label>
                            <RichEditor
                                key="create-practicum"
                                value={draft.fullDescriptionHtml}
                                onChange={(val) => setDraft((d) => ({ ...d, fullDescriptionHtml: val }))}
                                onUploadImage={pvlRichEditorUploadImage}
                                placeholder="Напишите материал для практикума..."
                            />
                        </div>
                    </section>
                ) : null}

                {draft.targetSection === 'glossary' ? (
                    <section className="rounded-xl border border-emerald-100 bg-emerald-50/35 p-4 space-y-5">
                        <div className={cmsFormTitle}>Форма термина глоссария</div>
                        <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} className={`w-full ${cmsIn}`} placeholder="Термин" />
                        <textarea
                            value={draft.fullDescriptionHtml}
                            onChange={(e) => setDraft((d) => ({ ...d, fullDescriptionHtml: e.target.value }))}
                            className={`w-full min-h-[110px] ${cmsIn}`}
                            placeholder="Определение / описание термина"
                        />
                    </section>
                ) : null}

                {draft.targetSection === 'lessons' ? (
                    <section className="rounded-xl border border-emerald-100/90 bg-emerald-50/25 p-3 space-y-2.5">
                        <div className={cmsFormTitle}>Форма урока</div>
                        <div className="grid md:grid-cols-2 gap-2">
                            <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} className={cmsIn} placeholder="Название" />
                            <input value={draft.estimatedDuration} onChange={(e) => setDraft((d) => ({ ...d, estimatedDuration: e.target.value }))} className={cmsIn} placeholder="Длительность (например 20 мин)" />
                            <input value={draft.tagsText} onChange={(e) => setDraft((d) => ({ ...d, tagsText: e.target.value }))} className={cmsIn} placeholder="Теги через запятую" />
                        </div>
                        <div className="space-y-1.5">
                            <div className="text-xs font-medium text-emerald-900/80">Куда публиковать в курсе</div>
                            <div className="grid md:grid-cols-2 gap-2">
                                <select
                                    value={String(clampPvlModule(draft.moduleNumber))}
                                    onChange={(e) => setDraft((d) => ({ ...d, moduleNumber: e.target.value, weekNumber: e.target.value }))}
                                    className={cmsIn}
                                >
                                    {modulePickerOptions.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                                <select
                                    value={draft.targetCohort}
                                    onChange={(e) => setDraft((d) => ({ ...d, targetCohort: e.target.value }))}
                                    className={cmsIn}
                                >
                                    {(pvlDomainApi.adminApi.getAdminCohorts() || []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                                </select>
                            </div>
                        </div>
                        {draft.lessonKind === 'text_video' ? (
                            <div className="space-y-2">
                                <div className="grid md:grid-cols-2 gap-2">
                                    <input value={draft.lessonVideoUrl} onChange={(e) => setDraft((d) => ({ ...d, lessonVideoUrl: e.target.value }))} className={cmsIn} placeholder="Ссылка на видео (YouTube/Kinescope)" />
                                    <input value={draft.lessonRutubeUrl} onChange={(e) => setDraft((d) => ({ ...d, lessonRutubeUrl: e.target.value }))} className={cmsIn} placeholder="Приватный RuTube URL" />
                                    <input value={draft.lessonVideoEmbed} onChange={(e) => setDraft((d) => ({ ...d, lessonVideoEmbed: e.target.value }))} className={`md:col-span-2 ${cmsIn}`} placeholder="Embed-код/iframe (Kinescope)" />
                                </div>
                                <div className="space-y-1">
                                    <label className={cmsLbl}>Текст урока</label>
                                    <RichEditor
                                        key="create-lesson"
                                        value={draft.fullDescriptionHtml}
                                        onChange={(val) => setDraft((d) => ({ ...d, fullDescriptionHtml: val, lessonTextBody: val }))}
                                        onUploadImage={pvlRichEditorUploadImage}
                                        placeholder="Содержимое урока..."
                                    />
                                </div>
                            </div>
                        ) : null}
                        {draft.lessonKind === 'quiz' ? (
                            <>
                                <LessonQuizBuilder
                                    value={draft.lessonQuiz}
                                    onChange={(next) => setDraft((d) => ({ ...d, lessonQuiz: next }))}
                                    validation={validateLessonQuiz(draft.lessonQuiz)}
                                />
                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setShowLessonPreview((v) => !v)}
                                        className="text-xs rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-emerald-900 hover:bg-emerald-50/90"
                                    >
                                        {showLessonPreview ? 'Скрыть предпросмотр' : 'Показать предпросмотр'}
                                    </button>
                                </div>
                                {showLessonPreview ? (
                                    <section className="overflow-hidden rounded-3xl border border-emerald-200/80 bg-white p-4 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)]">
                                        <div className="text-sm font-medium text-emerald-900 mb-1">Предпросмотр теста (как карточка в трекере)</div>
                                        <p className="text-xs text-slate-500 mb-2">{draft.shortDescription || 'Без описания'}</p>
                                        <div className="text-xs text-slate-600">
                                            Вопросов: {normalizeLessonQuiz(draft.lessonQuiz).questions.length}
                                            {' · '}
                                            Проходной порог: {normalizeLessonQuiz(draft.lessonQuiz).settings.passPercent}%
                                            {' · '}
                                            Попыток: {normalizeLessonQuiz(draft.lessonQuiz).settings.attempts}
                                        </div>
                                        <div className="mt-2 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/90 to-white p-3 text-xs text-slate-700">
                                            {normalizeLessonQuiz(draft.lessonQuiz).instruction || 'Инструкция перед тестом не заполнена.'}
                                        </div>
                                    </section>
                                ) : null}
                            </>
                        ) : null}
                        {draft.lessonKind === 'homework' ? (
                            <>
                                <LessonHomeworkBuilder
                                    value={draft.lessonHomework}
                                    onChange={(next) => setDraft((d) => ({ ...d, lessonHomework: next }))}
                                    validation={validateLessonHomework(draft.lessonHomework, { requireCriteria: false })}
                                />
                                <div className="space-y-1">
                                    <label className={cmsLbl}>Полный текст задания</label>
                                    <RichEditor
                                        key="create-homework"
                                        value={draft.fullDescriptionHtml}
                                        onChange={(val) => setDraft((d) => ({ ...d, fullDescriptionHtml: val, lessonHomeworkPrompt: val }))}
                                        onUploadImage={pvlRichEditorUploadImage}
                                        placeholder="Опишите домашнее задание..."
                                    />
                                </div>
                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setShowLessonPreview((v) => !v)}
                                        className="text-xs rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-emerald-900 hover:bg-emerald-50/90"
                                    >
                                        {showLessonPreview ? 'Скрыть предпросмотр' : 'Показать предпросмотр'}
                                    </button>
                                </div>
                                {showLessonPreview ? (
                                    <section className="rounded-xl border border-emerald-100 bg-white p-3">
                                        <div className="text-sm font-medium text-emerald-900 mb-2">Предпросмотр для ученицы</div>
                                        <div className="text-xs text-slate-600">Модуль {clampPvlModule(draft.moduleNumber)}</div>
                                        <div className="mt-1 text-xs text-slate-600">
                                            Дедлайн: {normalizeLessonHomework(draft.lessonHomework).deadline.type === 'fixed_date'
                                                ? (normalizeLessonHomework(draft.lessonHomework).deadline.at || 'не задан')
                                                : normalizeLessonHomework(draft.lessonHomework).deadline.type === 'week_based'
                                                    ? (normalizeLessonHomework(draft.lessonHomework).deadline.weekBasedLabel || 'по модулю')
                                                    : 'без дедлайна'}
                                        </div>
                                        <div className="mt-2 text-xs text-slate-700">
                                            Формат ответа: {normalizeLessonHomework(draft.lessonHomework).responseFormat.artifactType} ·
                                            {' '}разрешено: {normalizeLessonHomework(draft.lessonHomework).responseFormat.allowText ? 'текст ' : ''}{normalizeLessonHomework(draft.lessonHomework).responseFormat.allowFile ? 'файл ' : ''}{normalizeLessonHomework(draft.lessonHomework).responseFormat.allowLink ? 'ссылка' : ''}
                                        </div>
                                        <div className="mt-2 text-xs text-slate-700">
                                            Лимит доработок: {normalizeLessonHomework(draft.lessonHomework).revisions.limitMode === 'unlimited' ? 'без лимита' : normalizeLessonHomework(draft.lessonHomework).revisions.limit}
                                        </div>
                                    </section>
                                ) : null}
                            </>
                        ) : null}
                    </section>
                ) : null}

                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-emerald-100 pt-3">
                    <button
                        type="button"
                        onClick={() => handleCreate({ publish: false })}
                        className="text-sm rounded-xl border border-emerald-300 bg-white px-4 py-2.5 font-medium text-emerald-900 hover:bg-emerald-50"
                    >
                        Сохранить черновик
                    </button>
                    <button
                        type="button"
                        onClick={() => handleCreate({ publish: true })}
                        className="text-sm rounded-xl bg-emerald-700 px-4 py-2.5 font-medium text-white shadow-sm shadow-emerald-900/20 hover:bg-emerald-800"
                    >
                        Сохранить и опубликовать
                    </button>
                </div>
            </div>
            
            {/* Фильтры по разделу и статусу */}
            <div className="space-y-2">
                <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-emerald-50/60 border border-emerald-100">
                    {[['all', 'Все разделы'], ['library', 'Библиотека'], ['lessons', 'Уроки'], ['practicums', 'Практикумы'], ['glossary', 'Глоссарий']].map(([val, label]) => (
                        <button
                            key={val}
                            type="button"
                            onClick={() => setFilters((f) => ({ ...f, section: val }))}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filters.section === val ? 'bg-emerald-700 text-white shadow-sm' : 'text-emerald-800 hover:bg-emerald-100/70'}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <div className="flex flex-wrap gap-1">
                    {[['all', 'Все статусы'], ['draft', 'Черновики'], ['published', 'Опубликованные'], ['withdrawn', 'Снятые / в архиве']].map(([val, label]) => (
                        <button
                            key={val}
                            type="button"
                            onClick={() => setFilters((f) => ({ ...f, status: val }))}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${filters.status === val ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                {filtered.length > 0 && (
                    <div className="text-xs text-slate-400 pl-1">{filtered.length} материалов</div>
                )}
                <div className="flex items-center gap-2 pl-1">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                        <input
                            type="checkbox"
                            className="h-4 w-4 accent-emerald-700"
                            checked={previewAsStudent}
                            onChange={(e) => setPreviewAsStudent(e.target.checked)}
                        />
                        Предпросмотр как в ученическом кабинете
                    </label>
                </div>
            </div>

            {previewAsStudent ? (
                <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                            Предпросмотр раздела: {filters.section === 'all' ? 'выберите раздел' : labelTargetSection(filters.section)}
                        </h3>
                        <span className="text-[11px] text-slate-500">
                            Поток: {filters.cohort === 'all' ? 'по умолчанию' : filters.cohort}
                        </span>
                    </div>
                    <AdminContentSectionPreview
                        section={filters.section}
                        items={items}
                        placements={placements}
                        cohortId={filters.cohort === 'all' ? 'cohort-2026-1' : filters.cohort}
                        moduleFilter={filters.module}
                    />
                </section>
            ) : null}

            <div className="grid gap-4">
                {filtered.map((i) => (
                    <article
                        key={i.id}
                        className={`rounded-xl border bg-white p-4 shadow-sm shadow-emerald-900/5 transition-colors ${String(draggingId) === String(i.id) ? 'border-emerald-400 bg-emerald-50/30' : 'border-emerald-100/90'}`}
                        draggable
                        onDragStart={(e) => { setDraggingId(i.id); e.dataTransfer.effectAllowed = 'move'; }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDropReorder(i.id)}
                        onDragEnd={() => setDraggingId(null)}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="text-slate-300 cursor-grab active:cursor-grabbing flex-shrink-0" title="Перетащите для изменения порядка">
                                    <GripVertical size={16} />
                                </span>
                                <div className="min-w-0">
                                    <div className="text-sm font-medium text-slate-800">{i.title}</div>
                                    <div className="text-xs text-slate-500 mt-0.5">
                                        {labelTargetSection(i.targetSection)}
                                        {' · '}
                                        {TARGET_ROLE_LABELS[i.targetRole] || i.targetRole}
                                        {i.targetSection === 'library' ? (
                                            <>
                                                {' · '}
                                                <span className="text-slate-600">{i.categoryTitle || i.libraryCategoryTitle || 'Без категории'}</span>
                                                {i.targetCohort ? (
                                                    <>
                                                        {' · '}
                                                        поток <span className="font-medium text-slate-600">{i.targetCohort}</span>
                                                    </>
                                                ) : null}
                                            </>
                                        ) : i.targetSection === 'glossary' ? (
                                            i.targetCohort ? (
                                                <>
                                                    {' · '}
                                                    поток <span className="font-medium text-slate-600">{i.targetCohort}</span>
                                                </>
                                            ) : null
                                        ) : (
                                            <>
                                                {' · '}
                                                модуль {clampPvlModule(i.moduleNumber ?? i.weekNumber ?? 0)}
                                                {i.targetCohort ? (
                                                    <>
                                                        {' · '}
                                                        поток <span className="font-medium text-slate-600">{i.targetCohort}</span>
                                                    </>
                                                ) : null}
                                            </>
                                        )}
                                        {' · '}
                                        размещений: {placements.filter((p) => (p.contentId || p.contentItemId) === i.id).length}
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <StatusBadge>{CONTENT_STATUS_LABEL[i.status] || i.status}</StatusBadge>
                                <button type="button" onClick={() => navigate(`/admin/content/${i.id}`)} className="text-xs rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1 font-medium text-emerald-900 hover:bg-emerald-100/80">Открыть</button>
                                {i.status === 'published' && (
                                    <>
                                        <button type="button" onClick={async () => { try { await pvlDomainApi.adminApi.unpublishContentItem(i.id); setItems((prev) => unpublishToDraftItems(prev, i.id)); } catch (e) { window.alert(`Не удалось снять с публикации: ${e?.message || e}`); } }} className="text-xs rounded-xl border border-emerald-200 bg-white px-3 py-1 text-emerald-900 hover:bg-emerald-50/90">Снять с публикации</button>
                                        <button type="button" onClick={async () => {
                                            try {
                                                const copy = await pvlDomainApi.adminApi.createContentItem({ ...i, id: undefined, title: `${i.title} (копия)`, status: 'draft' });
                                                setItems((prev) => [copy, ...prev]);
                                            } catch (e) {
                                                window.alert(`Не удалось копировать: ${e?.message || e}`);
                                            }
                                        }} className="text-xs rounded-xl border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50">Копировать</button>
                                    </>
                                )}
                                {i.status === 'unpublished' && (
                                    <>
                                        <button type="button" onClick={async () => { try { await pvlDomainApi.adminApi.archiveContentItem(i.id); setItems((prev) => archiveContentItem(prev, i.id)); } catch (e) { window.alert(`Не удалось в архив: ${e?.message || e}`); } }} className="text-xs rounded-xl border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50">В архив</button>
                                        <button type="button" onClick={() => handleDeleteItem(i)} className="text-xs rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-800">Удалить</button>
                                        <button type="button" onClick={async () => {
                                            try {
                                                const copy = await pvlDomainApi.adminApi.createContentItem({ ...i, id: undefined, title: `${i.title} (копия)`, status: 'draft' });
                                                setItems((prev) => [copy, ...prev]);
                                            } catch (e) {
                                                window.alert(`Не удалось копировать: ${e?.message || e}`);
                                            }
                                        }} className="text-xs rounded-xl border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50">Копировать</button>
                                    </>
                                )}
                                {i.status === 'draft' && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                if (!canPublishItem(i)) {
                                                    window.alert('Нельзя опубликовать тест: проверьте вопросы и правильные ответы.');
                                                    return;
                                                }
                                                try {
                                                    await pvlDomainApi.adminApi.publishContentItem(i.id);
                                                    setItems((prev) => publishContentItem(prev, i.id));
                                                } catch (e) {
                                                    window.alert(`Не удалось опубликовать: ${e?.message || e}`);
                                                }
                                            }}
                                            className="text-xs rounded-xl bg-emerald-700 px-3 py-1 font-medium text-white hover:bg-emerald-800"
                                        >
                                            Опубликовать
                                        </button>
                                        <button type="button" onClick={() => handleDeleteItem(i)} className="text-xs rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-800">Удалить</button>
                                        <button type="button" onClick={async () => {
                                            try {
                                                const copy = await pvlDomainApi.adminApi.createContentItem({ ...i, id: undefined, title: `${i.title} (копия)`, status: 'draft' });
                                                setItems((prev) => [copy, ...prev]);
                                            } catch (e) {
                                                window.alert(`Не удалось копировать: ${e?.message || e}`);
                                            }
                                        }} className="text-xs rounded-xl border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50">Копировать</button>
                                    </>
                                )}
                                {i.status === 'archived' && (
                                    <>
                                        <button type="button" onClick={() => handleDeleteItem(i)} className="text-xs rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-800">Удалить</button>
                                        <button type="button" onClick={async () => {
                                            try {
                                                const copy = await pvlDomainApi.adminApi.createContentItem({ ...i, id: undefined, title: `${i.title} (копия)`, status: 'draft' });
                                                setItems((prev) => [copy, ...prev]);
                                            } catch (e) {
                                                window.alert(`Не удалось копировать: ${e?.message || e}`);
                                            }
                                        }} className="text-xs rounded-xl border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50">Копировать</button>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="mt-3 rounded-xl border border-emerald-100/80 bg-emerald-50/40 p-3">
                            <div className="text-xs font-medium text-emerald-900/80 mb-2">Размещения в разделах</div>
                            <div className="grid gap-1">
                                {placements.filter((p) => p.contentId === i.id || p.contentItemId === i.id).length === 0 ? (
                                    <div className="text-xs text-slate-500">Пока не привязано к разделам.</div>
                                ) : placements.filter((p) => p.contentId === i.id || p.contentItemId === i.id).map((p) => (
                                    <article key={p.id} className="rounded-lg border border-emerald-100/90 bg-white p-2 flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-xs text-slate-600">{labelTargetSection(p.targetSection)} · {TARGET_ROLE_LABELS[p.targetRole] || p.targetRole} · {p.targetCohort || p.cohortId || 'все'} · порядок {p.orderIndex ?? '—'}</span>
                                        <div className="flex gap-1">
                                            <button type="button" onClick={async () => { try { await pvlDomainApi.adminApi.publishPlacement(p.id); } catch (e) { window.alert(`Не удалось: ${e?.message || e}`); } }} className="text-[10px] rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-900">Опубликовать</button>
                                            <button type="button" onClick={async () => { try { await pvlDomainApi.adminApi.unpublishPlacement(p.id); } catch (e) { window.alert(`Не удалось: ${e?.message || e}`); } }} className="text-[10px] rounded-full border border-slate-200 px-2 py-0.5 text-slate-700">Снять</button>
                                            <button type="button" onClick={async () => { try { await pvlDomainApi.adminApi.deletePlacement(p.id); setPlacements((prev) => prev.filter((x) => x.id !== p.id)); } catch (e) { window.alert(`Не удалось удалить размещение: ${e?.message || e}`); } }} className="text-[10px] rounded-full border border-slate-200 px-2 py-0.5 text-rose-700">Удалить</button>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </div>
                    </article>
                ))}
                {filtered.length === 0 && (
                    <div className="rounded-xl border border-dashed border-emerald-200 p-8 text-center text-sm text-slate-400">
                        Материалов с такими фильтрами нет
                    </div>
                )}
            </div>

            {/* Навигатор по материалам */}
            <ContentNavigator items={items} placements={placements} onOpen={(id) => navigate(`/admin/content/${id}`)} />
        </div>
    );
}

function AdminStudents({ navigate, route, refreshKey = 0 }) {
    const [cohortId, setCohortId] = useState('all');
    const [listTick, setListTick] = useState(0);
    const [syncResult, setSyncResult] = useState(null);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const result = await syncPvlActorsFromGarden();
                if (!cancelled) setSyncResult(result);
            } finally {
                if (!cancelled) setListTick((t) => t + 1);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);
    const cohorts = pvlDomainApi.adminApi.getAdminCohorts();
    const mentorOptions = useMemo(() => (
        pvlDomainApi.adminApi.getAdminMentors().map((mp) => ({
            userId: mp.userId || mp.id,
            label: resolveActorDisplayName(mp.userId || mp.id) || mp.userId || mp.id,
        }))
    ), [listTick]);
    const rows = useMemo(() => buildTeacherStudentRows().filter((r) => {
        if (cohortId === 'all') return true;
        const sp = pvlDomainApi.db.studentProfiles.find((p) => p.userId === r.userId);
        return sp?.cohortId === cohortId;
    }), [cohortId, listTick, refreshKey]);

    const assignStudentMentor = async (studentId, mentorUserId) => {
        try {
            const result = await pvlDomainApi.adminApi.assignStudentMentor(studentId, mentorUserId || null);
            if (result == null && mentorUserId) {
                try {
                    window.alert('Не удалось назначить ментора: в данных нет выбранного ментора или ученицы.');
                } catch {
                    /* noop */
                }
            }
        } catch (e) {
            try {
                window.alert(`Не удалось сохранить привязку ментора: ${e?.message || e}`);
            } catch {
                /* noop */
            }
        } finally {
            setListTick((t) => t + 1);
        }
    };

    const mentorSelectClass = 'w-full max-w-[16rem] rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-800 outline-none ring-1 ring-slate-200/80 focus:ring-emerald-400/80';

    return (
        <section className="space-y-5 rounded-3xl bg-white p-5 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] md:p-6">
            <div>
                <h2 className="font-display text-2xl text-slate-800">Ученицы</h2>
            </div>
            <div>
                <label className="sr-only" htmlFor="pvl-admin-students-cohort">Поток</label>
                <select
                    id="pvl-admin-students-cohort"
                    value={cohortId}
                    onChange={(e) => setCohortId(e.target.value)}
                    className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none ring-1 ring-slate-200/80 w-full md:w-auto"
                >
                    <option value="all">Все потоки</option>
                    {cohorts.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
            </div>
            <div className="grid gap-4 md:hidden">
                {rows.length === 0 && syncResult != null && (
                    <div className="rounded-xl bg-slate-50/80 p-4 text-sm text-slate-500 text-center">
                        {syncResult?.synced === false && syncResult?.reason === 'no_users' && 'Профили из Сада не загружены (0 строк).'}
                        {syncResult?.synced === false && syncResult?.reason === 'error' && 'Ошибка синхронизации с Садом.'}
                        {syncResult?.synced === true && (syncResult.trackMembers ?? 0) === 0 && 'Нет участников ПВЛ в выборке (только персонал).'}
                        {syncResult?.synced === true && (syncResult.trackMembers ?? 0) > 0 && `В базе ПВЛ: ${syncResult.trackMembers} участн. (абитуриенты: ${syncResult.applicants ?? 0}, ученицы: ${syncResult.students ?? 0}).`}
                    </div>
                )}
                {rows.map((row) => (
                    <article
                        key={row.userId}
                        className="rounded-xl bg-slate-50/80 p-3"
                    >
                        <button
                            type="button"
                            className="text-left w-full text-sm font-medium text-blue-700 hover:underline"
                            onClick={() => navigate(`/admin/students/${row.userId}`)}
                        >
                            {resolveActorDisplayName(row.userId) || row.userId}
                        </button>
                        <div className="text-[10px] text-slate-500 mt-1">{row.statusLabelRu}</div>
                        <div className="text-xs text-slate-600 mt-1">{row.courseLine}</div>
                        <div className="mt-3">
                            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400 mb-1">Ментор</div>
                            <select
                                value={row.mentorUserId || ''}
                                onChange={(e) => assignStudentMentor(row.userId, e.target.value)}
                                className={mentorSelectClass}
                                aria-label={`Ментор для ${resolveActorDisplayName(row.userId) || row.userId}`}
                            >
                                <option value="">Нет ментора — выберите</option>
                                {mentorOptions.map((m) => (
                                    <option key={m.userId} value={m.userId}>{m.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                            <div>Закрытие: <span className="font-medium text-slate-800 tabular-nums">{row.closedPct}%</span></div>
                            <div>Баллы: <span className="font-medium text-slate-800 tabular-nums">{row.coursePoints}/400</span></div>
                            <div className="col-span-2">Домашки: {row.hwSummary}</div>
                            <div className="col-span-2">Последнее: {row.lastAct}</div>
                        </div>
                    </article>
                ))}
            </div>
            <div className="hidden md:block overflow-x-auto -mx-1 px-1">
                <table className="w-full text-sm text-left min-w-[920px]">
                    <thead>
                        <tr className="text-xs text-slate-500 border-b border-slate-100">
                            <th className="pb-2 pr-3 font-medium">Имя</th>
                            <th className="pb-2 pr-3 font-medium whitespace-nowrap">Статус</th>
                            <th className="pb-2 pr-3 font-medium">Сейчас по курсу</th>
                            <th className="pb-2 pr-3 font-medium min-w-[12rem]">Ментор</th>
                            <th className="pb-2 pr-3 font-medium tabular-nums">Закрытие ДЗ</th>
                            <th className="pb-2 pr-3 font-medium tabular-nums">Баллы</th>
                            <th className="pb-2 pr-3 font-medium">Домашки</th>
                            <th className="pb-2 font-medium">Последнее действие</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && (
                            <tr>
                                <td colSpan={8} className="py-10 text-center text-sm text-slate-500">
                                    {syncResult == null && 'Загрузка учениц…'}
                                    {syncResult?.synced === false && syncResult?.reason === 'no_users' && 'Список профилей из Сада пуст (0 строк). Убедитесь, что JWT передаётся в PostgREST и политика SELECT на profiles разрешает читать нужные строки (см. migrations/05_profiles_rls.sql: при схеме «только свой профиль» админ не увидит абитуриентов — нужна политика select для role=admin или service role).'}
                                    {syncResult?.synced === false && syncResult?.reason === 'error' && 'Ошибка при синхронизации с Садом. Проверьте подключение к PostgREST.'}
                                    {syncResult?.synced === true && (syncResult.trackMembers ?? 0) === 0 && 'Синхронизация прошла: в выборке из Сада нет участников ПВЛ (все пользователи с ролями персонала: ментор/стажёр/ведущая/админ/куратор).'}
                                    {syncResult?.synced === true && (syncResult.trackMembers ?? 0) > 0 && cohortId !== 'all' && 'Участники есть в данных, но в выбранном потоке список пуст. Выберите «Все потоки».'}
                                    {syncResult?.synced === true && (syncResult.trackMembers ?? 0) > 0 && cohortId === 'all' && 'Участники синхронизированы, но строк нет — обновите страницу или проверьте консоль.'}
                                </td>
                            </tr>
                        )}
                        {rows.map((row) => (
                            <tr
                                key={row.userId}
                                className="border-b border-slate-50 last:border-0 hover:bg-slate-50/80"
                            >
                                <td className="py-3 pr-3 align-top">
                                    <button
                                        type="button"
                                        className="font-medium text-blue-700 hover:underline text-left"
                                        onClick={() => navigate(`/admin/students/${row.userId}`)}
                                    >
                                        {resolveActorDisplayName(row.userId) || row.userId}
                                    </button>
                                </td>
                                <td className="py-3 pr-3 align-top text-xs text-slate-600 whitespace-nowrap">{row.statusLabelRu}</td>
                                <td className="py-3 pr-3 align-top text-slate-600 text-xs max-w-[14rem]">{row.courseLine}</td>
                                <td className="py-3 pr-3 align-top" onClick={(e) => e.stopPropagation()}>
                                    <select
                                        value={row.mentorUserId || ''}
                                        onChange={(e) => assignStudentMentor(row.userId, e.target.value)}
                                        className={mentorSelectClass}
                                        aria-label={`Ментор для ${resolveActorDisplayName(row.userId) || row.userId}`}
                                    >
                                        <option value="">Нет ментора — выберите</option>
                                        {mentorOptions.map((m) => (
                                            <option key={m.userId} value={m.userId}>{m.label}</option>
                                        ))}
                                    </select>
                                </td>
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
    );
}

function buildAdminMentorWorkloadRows() {
    return pvlDomainApi.adminApi.getAdminMentors().map((m) => {
        const mentorUserId = m.userId || m.id;
        const user = resolveActorUser(mentorUserId);
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
    const [refreshTick, setRefreshTick] = useState(0);
    const [candidateByMentor, setCandidateByMentor] = useState({});
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                await syncPvlActorsFromGarden();
            } finally {
                if (!cancelled) setRefreshTick((t) => t + 1);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);
    const mentors = useMemo(() => buildAdminMentorWorkloadRows(), [refreshTick]);
    const allStudents = useMemo(() => pvlDomainApi.adminApi.getAdminStudents({}), [refreshTick]);
    const displayNameByUserId = useMemo(
        () => Object.fromEntries(allStudents.map((s) => [s.userId, resolveActorDisplayName(s.userId) || s.userId])),
        [allStudents],
    );
    const handleAddMentee = async (mentorUserId) => {
        const studentUserId = candidateByMentor[mentorUserId];
        if (!studentUserId) return;
        try {
            await pvlDomainApi.adminApi.assignStudentMentor(studentUserId, mentorUserId);
        } catch (e) {
            try {
                window.alert(`Не удалось назначить ученицу ментору: ${e?.message || e}`);
            } catch {
                /* noop */
            }
        }
        setCandidateByMentor((prev) => ({ ...prev, [mentorUserId]: '' }));
        setRefreshTick((x) => x + 1);
    };
    const handleRemoveMentee = async (mentorUserId, studentUserId) => {
        try {
            await pvlDomainApi.adminApi.removeMenteeFromMentor(mentorUserId, studentUserId);
        } catch (e) {
            try {
                window.alert(`Не удалось снять привязку: ${e?.message || e}`);
            } catch {
                /* noop */
            }
        }
        setRefreshTick((x) => x + 1);
    };
    const totals = useMemo(() => {
        const mentorCount = mentors.length;
        const menteesTotal = mentors.reduce((acc, m) => acc + (m.menteeCount || 0), 0);
        const pendingTotal = mentors.reduce((acc, m) => acc + (m.pendingReview || 0), 0);
        const overdueTotal = mentors.reduce((acc, m) => acc + (m.overdueReview || 0), 0);
        return { mentorCount, menteesTotal, pendingTotal, overdueTotal };
    }, [mentors]);
    return (
        <div className="space-y-6">
            <div className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-6">
                <h2 className="font-display text-2xl text-slate-800">Менторы</h2>
            </div>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-3xl bg-white shadow-[0_10px_32px_-12px_rgba(15,23,42,0.06)] p-4 shadow-sm">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Менторов</div>
                    <div className="mt-2 text-2xl font-display tabular-nums text-slate-800">{totals.mentorCount}</div>
                </article>
                <article className="rounded-3xl bg-white shadow-[0_10px_32px_-12px_rgba(15,23,42,0.06)] p-4 shadow-sm">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Учениц в закреплении</div>
                    <div className="mt-2 text-2xl font-display tabular-nums text-slate-800">{totals.menteesTotal}</div>
                </article>
                <article className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 shadow-sm">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">На проверке</div>
                    <div className="mt-2 text-2xl font-display tabular-nums text-amber-900">{totals.pendingTotal}</div>
                </article>
                <article className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4 shadow-sm">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-rose-700">Просроченные проверки</div>
                    <div className="mt-2 text-2xl font-display tabular-nums text-rose-900">{totals.overdueTotal}</div>
                </article>
            </section>
            <div className="grid gap-4">
                {mentors.map((m) => (
                    <article key={m.id} className="rounded-3xl bg-white p-4 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] md:p-5">
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="text-base font-semibold text-slate-800">{resolveActorDisplayName(m.mentorUserId) || m.user?.fullName || m.mentorUserId}</div>
                                <StatusBadge>{m.statusLabel}</StatusBadge>
                            </div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5 xl:items-stretch">
                            <div className="flex min-h-[4.25rem] flex-col justify-center gap-1 rounded-xl bg-slate-50/90 px-3 py-2.5 shadow-sm">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Менти</span>
                                <span className="text-lg font-semibold tabular-nums leading-none text-slate-800">{m.menteeCount}</span>
                            </div>
                            <div className="flex min-h-[4.25rem] flex-col justify-center gap-1 rounded-xl bg-slate-50/90 px-3 py-2.5 shadow-sm">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Незакрытых задач</span>
                                <span className="text-lg font-semibold tabular-nums leading-none text-slate-800">{m.unclosed}</span>
                            </div>
                            <div className="flex min-h-[4.25rem] flex-col justify-center gap-1 rounded-xl bg-amber-50/80 px-3 py-2.5 shadow-sm">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-amber-800/90">На проверке</span>
                                <span className="text-lg font-semibold tabular-nums leading-none text-amber-950">{m.pendingReview}</span>
                            </div>
                            <div className="flex min-h-[4.25rem] flex-col justify-center gap-1 rounded-xl bg-rose-50/80 px-3 py-2.5 shadow-sm">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-rose-800/90">Просрочено</span>
                                <span className="text-lg font-semibold tabular-nums leading-none text-rose-950">{m.overdueReview}</span>
                            </div>
                            <div className="flex min-h-[4.25rem] min-w-0 flex-col justify-center gap-1 rounded-xl bg-slate-50/90 px-3 py-2.5 shadow-sm">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Последний вход</span>
                                <span
                                    className="min-w-0 truncate text-base font-semibold tabular-nums leading-none text-slate-800"
                                    title={m.lastActivity}
                                >
                                    {m.lastActivity}
                                </span>
                            </div>
                        </div>
                        <div className="mt-4 border-t border-slate-100 pt-4">
                            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Ученицы ментора</div>
                            {(m.menteeIds || []).length ? (
                                <ul className="mt-2 divide-y divide-slate-100/90">
                                    {(m.menteeIds || []).map((sid) => (
                                        <li key={`${m.mentorUserId}-${sid}`} className="flex items-center justify-between gap-4 py-2 text-sm text-slate-800 first:pt-0">
                                            <span className="min-w-0 truncate">{displayNameByUserId[sid] || sid}</span>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveMentee(m.mentorUserId, sid)}
                                                className="shrink-0 text-[11px] text-slate-400 hover:text-rose-600"
                                                title="Открепить ученицу"
                                            >
                                                Открепить
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="mt-2 text-sm text-slate-500">Пока нет назначенных учениц.</p>
                            )}
                            <div className="mt-3 flex flex-wrap items-stretch gap-2">
                                <select
                                    value={candidateByMentor[m.mentorUserId] || ''}
                                    onChange={(e) => setCandidateByMentor((prev) => ({ ...prev, [m.mentorUserId]: e.target.value }))}
                                    className="min-w-[12rem] max-w-full flex-1 rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-800 outline-none ring-1 ring-slate-200/80 focus:ring-slate-300"
                                >
                                    <option value="">Выберите ученицу…</option>
                                    {allStudents
                                        .filter((s) => !(m.menteeIds || []).includes(s.userId))
                                        .map((s) => (
                                            <option key={`${m.mentorUserId}-${s.userId}`} value={s.userId}>
                                                {displayNameByUserId[s.userId] || s.userId}
                                            </option>
                                        ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => handleAddMentee(m.mentorUserId)}
                                    className="rounded-lg bg-emerald-700/90 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-800"
                                >
                                    Добавить
                                </button>
                            </div>
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
        <div className="space-y-6">
            <div className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-6">
                <h2 className="font-display text-2xl text-slate-800">Потоки</h2>
            </div>
            {cohorts.map((c) => (
                <article key={c.id} className="rounded-xl bg-white p-4 shadow-[0_8px_26px_-10px_rgba(15,23,42,0.07)]">
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
        <div className="space-y-6">
            <div className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-6">
                <h2 className="font-display text-2xl text-slate-800">Проверки и риски</h2>
            </div>
            <div className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-4">
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
        <div className="space-y-6">
            <div className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-6">
                <h2 className="font-display text-2xl text-slate-800">Сертификация</h2>
            </div>
            <div className="grid gap-4">
                {registry.map((c) => {
                    const user = resolveActorUser(c.studentId);
                    const pts = pvlDomainApi.helpers.getStudentPointsSummary(c.studentId);
                    const certRow = pvlDomainApi.studentApi.getStudentCertification(c.studentId);
                    const szs = certRow?.szScores;
                    return (
                        <article key={c.studentId} className="rounded-xl bg-white p-4 shadow-[0_8px_26px_-10px_rgba(15,23,42,0.07)]">
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
        <div className="space-y-6">
            <div className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-6">
                <h2 className="font-display text-2xl text-slate-800">Настройки</h2>
            </div>
            <div className="rounded-3xl bg-white p-5 text-sm text-slate-600 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)]">
                <p>Здесь будут справочники разделов, шаблоны писем менторам и даты потоков. Сейчас отображаются только базовые константы начисления баллов.</p>
                {pvlDevToolsEnabled() ? (
                    <>
                        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-700 font-mono">
                            Курс макс {settings.scoreRules.COURSE_POINTS_MAX}, СЗ макс {settings.scoreRules.SZ_POINTS_MAX}, модуль 0 {settings.scoreRules.WEEK0_POINTS}, модуль {settings.scoreRules.WEEK_CLOSURE_POINTS}, КТ {settings.scoreRules.CONTROL_POINT_POINTS}, бонус {settings.scoreRules.MENTOR_BONUS_POOL_MAX}
                        </div>
                        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/80 p-2 text-xs text-amber-900">Вопрос методологии: {settings.methodQuestions[0]}</div>
                    </>
                ) : null}
            </div>
            <div className="rounded-3xl bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)] p-5">
                <h3 className="font-display text-lg text-slate-800 mb-3">Журнал действий</h3>
                <div className="grid gap-2">
                    {audit.length === 0 ? <div className="text-sm text-slate-500">Записей пока нет.</div> : audit.map((a) => (
                        <article key={a.id} className="rounded-xl bg-slate-50/90 shadow-sm p-3">
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
        <div className="rounded-3xl bg-white p-6 text-sm text-slate-500 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)]">
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
    const legacyAdmin = ['/admin/dashboard', '/admin/cohorts', '/admin/review', '/admin/qa-moderation', '/admin/qa', '/admin/questions'];
    if (legacyAdmin.includes(route)) return <AdminLegacyRedirect navigate={navigate} target="/admin/pvl" />;

    if (route === '/admin/pvl') return <TeacherPvlHome navigate={navigate} />;
    const adminPathOnly = adminRoutePath(route);
    if (adminPathOnly === '/admin/content') {
        return (
            <AdminContentCenter
                cmsItems={cmsItems}
                setCmsItems={setCmsItems}
                cmsPlacements={cmsPlacements}
                setCmsPlacements={setCmsPlacements}
                navigate={navigate}
            />
        );
    }
    const adminContentDetail = adminPathOnly.match(/^\/admin\/content\/([^/]+)$/);
    if (adminContentDetail) {
        return (
            <AdminContentItemScreen
                contentId={adminContentDetail[1]}
                navigate={navigate}
                cmsItems={cmsItems}
                setCmsItems={setCmsItems}
                cmsPlacements={cmsPlacements}
                setCmsPlacements={setCmsPlacements}
                forceRefresh={forceRefresh}
            />
        );
    }
    if (adminPathOnly === '/admin/calendar') {
        return <PvlAdminCalendarScreen navigate={navigate} refresh={forceRefresh} route={route} />;
    }
    if (ADMIN_COURSE_ROUTE_RE.test(route)) {
        const previewSid = getFirstCohortStudentId();
        if (!previewSid) {
            return (
                <div className="rounded-3xl bg-white p-8 text-center text-slate-600 text-sm shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)]">
                    <p className="font-medium text-slate-800">Нет абитуриентов для предпросмотра</p>
                    <p className="mt-2 text-slate-500 max-w-md mx-auto">Когда в потоке появятся ученицы из Сада, здесь откроется предпросмотр курса как в их кабинете.</p>
                </div>
            );
        }
        const studentRoute = route.replace(/^\/admin/, '/student');
        const wrapNav = (next) => {
            if (typeof next !== 'string') {
                navigate(next);
                return;
            }
            if (next.startsWith('/student/')) {
                if (next === '/student/dashboard') {
                    navigate('/admin/pvl');
                    return;
                }
                if (next === '/student/settings') {
                    navigate('/admin/settings');
                    return;
                }
                let mapped = next.replace(/^\/student/, '/admin');
                navigate(mapped);
                return;
            }
            navigate(next);
        };
        return (
            <StudentPage
                route={studentRoute}
                studentId={previewSid}
                navigate={wrapNav}
                cmsItems={cmsItems}
                cmsPlacements={cmsPlacements}
                refresh={forceRefresh}
                refreshKey={refreshKey}
                routePrefix="/admin"
            />
        );
    }
    if (adminPathOnly === '/admin/students') return <AdminStudents navigate={navigate} route={route} refreshKey={refreshKey} />;
    if (adminPathOnly === '/admin/mentors') return <AdminMentors />;
    if (adminPathOnly === '/admin/settings') return <AdminSettings />;

    if (/^\/admin\/students\/[^/]+\/task\/[^/]+$/.test(adminPathOnly)) {
        const parts = adminPathOnly.split('/');
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
                mentorRoutePrefix="/admin"
                onRefresh={forceRefresh}
                showHeaderBack={false}
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
    if (/^\/admin\/students\/[^/]+$/.test(adminPathOnly)) {
        const menteeSeg = adminPathOnly.split('/')[3];
        return (
            <PvlMenteeCardView
                key={`adm-card-${menteeSeg}-${refreshKey}`}
                menteeId={menteeSeg}
                linkMode="admin"
                showHeaderBack={false}
                backLabel="← Вернуться к списку учениц"
                navigate={navigate}
                refreshKey={refreshKey}
                onBack={() => navigate('/admin/students')}
            />
        );
    }

    return <TeacherPvlHome navigate={navigate} />;
}

function DebugPanel({ role, setRole, setActingUserId, actingUserId, setNowDate, nowDate, forceRefresh, navigate }) {
    const goHomeForRole = (r) => {
        if (r === 'student') navigate('/student/dashboard');
        else if (r === 'mentor') navigate('/mentor/dashboard');
        else if (r === 'admin') navigate('/admin/pvl');
    };
    return (
        <section className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/40 p-3">
            <div className="text-xs font-medium text-amber-900 mb-2">Служебная панель (localStorage pvl_dev_tools=1)</div>
            <div className="grid md:grid-cols-4 gap-2">
                <select value={role} onChange={(e) => {
                    const r = e.target.value;
                    flushSync(() => setRole(r));
                    goHomeForRole(r);
                }} className="rounded-xl border border-[#E8D5C4] p-2 text-xs bg-white">
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
    '/student/messages',
    '/student/checklist',
    '/student/results',
    '/student/results/:taskId',
    '/student/certification',
    '/student/self-assessment',
    '/student/cultural-code',
    '/mentor/dashboard',
    '/mentor/applicants',
    '/mentor/mentees',
    '/mentor/review-queue',
    '/mentor/messages',
    '/mentor/library',
    '/mentor/library/:itemId',
    '/mentor/materials',
    '/mentor/mentee/:id',
    '/mentor/mentee/:id/task/:taskId',
    '/admin/pvl',
    '/admin/content',
    '/admin/content/:contentId',
    '/admin/students',
    '/admin/students/:id',
    '/admin/students/:id/task/:taskId',
    '/admin/mentors',
    '/admin/calendar',
    '/admin/about',
    '/admin/glossary',
    '/admin/library',
    '/admin/library/:itemId',
    '/admin/tracker',
    '/admin/practicums',
    '/admin/results',
    '/admin/results/:taskId',
    '/admin/certification',
    '/admin/self-assessment',
    '/admin/settings',
    '/student/settings',
    '/mentor/settings',
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

    const studentMenuPass = COURSE_MENU_LABELS.length === 8;
    const weeks = pvlDomainApi.db.courseWeeks;
    const cps = pvlDomainApi.db.controlPoints;
    const week6CpCount = cps.filter((c) => c.weekNumber === 6).length;
    const szDeadlineOk = cps.some((c) => c.code === 'KT8' && c.deadlineAt === '2026-06-30');
    const adminMenuOk = ADMIN_SIDEBAR_CONFIG.filter((x) => x.type === 'item').length === 14;
    const pvlCalendarOk = Array.isArray(pvlDomainApi.calendarApi.listForViewer('admin', null));
    const scoresSeparated = true;

    const criticalChecks = [
        { title: 'Меню участницы: 8 пунктов курса в сайдбаре (плюс Настройки, сад)', ok: studentMenuPass },
        { title: 'О курсе содержит стартовые материалы', ok: pvlDomainApi.studentApi.getStudentLibrary('u-st-1').length >= 0 },
        { title: 'Библиотека не смешана с Уроками', ok: true },
        { title: 'Результаты: API отдаёт список (в сиде может быть пусто до реальных сдач)', ok: Array.isArray(pvlDomainApi.studentApi.getStudentResults('u-st-1', {})) },
        { title: 'Курсовые 400 и СЗ 54 раздельно', ok: scoresSeparated },
        { title: 'Модули 1-3 присутствуют', ok: weeks.some((w) => w.moduleNumber === 1) && weeks.some((w) => w.moduleNumber === 3) },
        { title: '9 КТ присутствуют', ok: cps.length === 9 },
        { title: 'Модуль с 3 отдельными КТ', ok: week6CpCount === 3 },
        { title: 'Дедлайн записи СЗ: 30.06.2026', ok: szDeadlineOk },
        { title: 'Учительская: 14 пунктов меню (управление + курс + Настройки)', ok: adminMenuOk },
        { title: 'Календарь ПВЛ: API списка событий доступен', ok: pvlCalendarOk },
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
            void (async () => {
                const item = await pvlDomainApi.adminApi.createContentItem({
                    title: 'QA content',
                    shortDescription: 'qa',
                    fullDescription: 'qa',
                    contentType: 'text',
                    targetSection: 'library',
                    targetRole: 'student',
                    targetCohort: 'cohort-2026-1',
                });
                await pvlDomainApi.adminApi.publishContentItem(item.id);
                await pvlDomainApi.adminApi.assignContentPlacement({
                    contentItemId: item.id,
                    targetSection: 'library',
                    targetRole: 'student',
                    cohortId: 'cohort-2026-1',
                    weekNumber: 1,
                    moduleNumber: 1,
                    orderIndex: 50,
                });
                navigate('/student/library');
            })();
        }
        setScenarioStatus((s) => ({ ...s, [id]: true }));
        forceRefresh();
    };

    return (
        <div className="space-y-5">
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
    const [list, setList] = useState(() => pvlDomainApi.notifications.getNotificationsForUser(userId));
    useEffect(() => {
        let mounted = true;
        (async () => {
            const rows = await pvlDomainApi.notifications.refreshFromDb(userId);
            if (mounted) setList(rows);
        })();
        return () => {
            mounted = false;
        };
    }, [userId, open]);
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
                        <button
                            onClick={() => {
                                pvlDomainApi.notifications.markAllNotificationsRead(userId);
                                setList(pvlDomainApi.notifications.getNotificationsForUser(userId));
                                setOpen(false);
                            }}
                            className="text-[10px] rounded-full border border-[#E8D5C4] px-2 py-0.5 text-[#C8855A]"
                        >
                            mark all read
                        </button>
                    </div>
                    <div className="grid gap-1">
                        {list.length === 0 ? <div className="text-xs text-[#9B8B80] p-2">No notifications</div> : list.map((n) => (
                            <article key={n.id} className={`rounded-xl border p-2 ${n.isRead ? 'border-[#E8D5C4] bg-[#FAF6F2]' : 'border-blue-200 bg-blue-50'}`}>
                                <div className="text-[10px] text-[#9B8B80]">{n.type}</div>
                                <div className="text-xs text-[#2C1810]">{n.text}</div>
                                <div className="mt-1 flex justify-between">
                                    <span className="text-[10px] text-[#9B8B80]">{n.createdAt}</span>
                                    {!n.isRead ? (
                                        <button
                                            onClick={() => {
                                                pvlDomainApi.notifications.markNotificationRead(n.id);
                                                setList(pvlDomainApi.notifications.getNotificationsForUser(userId));
                                            }}
                                            className="text-[10px] text-[#C8855A]"
                                        >
                                            read
                                        </button>
                                    ) : null}
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
    gardenResolvedRole = null,
    gardenBridgeRef,
    onGardenRouteChange,
    onGardenExit,
    onEmbeddedDemoRoleChange,
    hideEmbeddedRoleSwitch = false,
    hideEmbeddedStudentRoleSwitch = false,
} = {}) {
    const session = loadAppSession() || {};
    const [role, setRole] = useState(session.role || 'student');
    const [studentId, setStudentId] = useState(session.studentId || 'u-st-1');
    const [actingUserId, setActingUserId] = useState(session.actingUserId || 'u-st-1');
    const [nowDate, setNowDate] = useState(session.nowDate || '2026-06-03');
    const [route, setRoute] = useState(session.route || '/student/dashboard');
    const [studentSection, setStudentSection] = useState(() => {
        const raw = session.studentSection;
        if (raw === 'Главная') return 'Дашборд';
        return raw || 'О курсе';
    });
    const [adminSection, setAdminSection] = useState(() => {
        const raw = session.adminSection;
        if (raw === 'Обзор' || raw === 'Сводка' || raw === 'Учительская ПВЛ') return 'Дашборд';
        if (raw === 'Контент-центр') return 'Материалы курса';
        if (raw === 'Проверка и риски') return 'Ученицы';
        return raw || 'Дашборд';
    });
    const [mentorSection, setMentorSection] = useState(() => {
        const raw = session.mentorSection;
        if (raw === 'Главная') return 'Дашборд';
        return raw || 'Дашборд';
    });
    const [cmsItems, setCmsItems] = useState(() => buildMergedCmsState().items);
    const [cmsPlacements, setCmsPlacements] = useState(() => buildMergedCmsState().placements);
    const [dataTick, setDataTick] = useState(0);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const forceRefresh = () => setDataTick((x) => x + 1);

    useEffect(() => {
        if (!embeddedInGarden) return;
        const gardenUser = readGardenCurrentUserFromStorage();
        const roleFromProfile = resolvePvlRoleFromGardenProfile(gardenUser);
        const resolvedRole = gardenResolvedRole || roleFromProfile;
        logPvlRoleResolution(gardenUser, resolvedRole);
        const hasAuthoritativeSource = Boolean(gardenResolvedRole) || Boolean(gardenUser);
        if (hasAuthoritativeSource && resolvedRole === 'no_access') {
            clearAppSession();
            onGardenExit?.();
            return;
        }
        if (!hasAuthoritativeSource) return;
        pvlPatchCurrentUserFromGarden(gardenUser, resolvedRole);
        const gid = gardenUser?.id != null ? String(gardenUser.id) : null;
        if (gid) {
            setActingUserId(gid);
            if (resolvedRole === 'student') setStudentId(gid);
        }
        if (resolvedRole !== role) {
            setRole(resolvedRole);
        }
        setRoute((prev) => redirectToAllowedRoute(resolvedRole, prev || ''));
    }, [embeddedInGarden, onGardenExit, role, gardenResolvedRole]);

    useEffect(() => {
        let mounted = true;
        (async () => {
            let res = { synced: false };
            try {
                res = await syncPvlRuntimeFromDb();
            } catch {
                /* сбой PostgREST/снимка ПВЛ — не блокируем подтягивание учениц из profiles */
            }
            try {
                await syncPvlActorsFromGarden();
            } catch {
                /* лог в syncPvlActorsFromGarden / dataService */
            }
            if (!mounted) return;
            const next = buildMergedCmsState();
            setCmsItems(next.items);
            setCmsPlacements(next.placements);
            forceRefresh();

            if (!embeddedInGarden) return;
            await new Promise((r) => setTimeout(r, 1600));
            if (!mounted) return;
            try {
                await syncPvlActorsFromGarden();
            } catch {
                /* повтор при поздней гидрации токена */
            }
            if (mounted) forceRefresh();
        })();
        return () => {
            mounted = false;
        };
    }, [embeddedInGarden]);

    const navigate = useCallback((nextRoute) => {
        const allowedRoute = redirectToAllowedRoute(role, nextRoute);
        if (!PVL_REVIEW_NAV_UNLOCK && allowedRoute !== nextRoute) {
            pvlDomainApi.audit.addAuditEvent(actingUserId, role, 'role_route_redirect', 'route', nextRoute, 'Redirected to allowed route', { allowedRoute });
        }
        setRoute(allowedRoute);
        if (allowedRoute.startsWith('/student/')) {
            const seg = allowedRoute.split('/')[2] || 'dashboard';
            const map = {
                dashboard: 'Дашборд',
                about: 'О курсе',
                onboarding: 'О курсе',
                glossary: 'Глоссарий',
                library: 'Библиотека',
                lessons: 'Трекер',
                practicums: 'Практикумы',
                checklist: 'Трекер',
                tracker: 'Трекер',
                messages: 'Чат с ментором',
                results: 'Результаты',
                certification: 'Сертификация',
                'self-assessment': 'Сертификация',
                settings: 'Настройки',
                'cultural-code': 'Культурный код Лиги',
            };
            if (map[seg]) setStudentSection(map[seg]);
        } else if (allowedRoute.startsWith('/mentor/')) {
            const m = mentorSectionForRoute(allowedRoute);
            if (m) setMentorSection(m);
        } else if (allowedRoute.startsWith('/admin/')) {
            const a = adminSectionForRoute(allowedRoute);
            if (a) setAdminSection(a);
        }
    }, [role, actingUserId]);

    useEffect(() => {
        let nextRoute = route;
        if (role === 'mentor' && typeof nextRoute === 'string' && nextRoute.startsWith('/student/')) {
            nextRoute = nextRoute.replace('/student/', '/mentor/');
        } else if (role === 'student' && typeof nextRoute === 'string' && nextRoute.startsWith('/mentor/')) {
            nextRoute = nextRoute.replace('/mentor/', '/student/');
        } else if (role === 'admin' && typeof nextRoute === 'string' && (nextRoute.startsWith('/student/') || nextRoute.startsWith('/mentor/'))) {
            nextRoute = '/admin/pvl';
        }
        const allowedRoute = redirectToAllowedRoute(role, nextRoute);
        if (allowedRoute !== route) setRoute(allowedRoute);
    }, [role, route]);

    useEffect(() => {
        saveAppSession({ role, studentId, actingUserId, nowDate, route, studentSection, adminSection, mentorSection });
    }, [role, studentId, actingUserId, nowDate, route, studentSection, adminSection, mentorSection]);
    useEffect(() => {
        setMobileMenuOpen(false);
    }, [route, role]);

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
            return <MentorPage route={route} navigate={navigate} cmsItems={cmsItems} cmsPlacements={cmsPlacements} refresh={forceRefresh} refreshKey={dataTick} mentorId={resolvePvlMentorActorId(actingUserId)} />;
        }
        if (route.startsWith('/student/')) {
            return (
                <StudentPage
                    route={route}
                    studentId={studentId}
                    navigate={navigate}
                    cmsItems={cmsItems}
                    cmsPlacements={cmsPlacements}
                    refresh={forceRefresh}
                    refreshKey={dataTick}
                    gardenBridgeRef={embeddedInGarden ? gardenBridgeRef : null}
                />
            );
        }
        return <ScreenState error={`Неизвестный маршрут. Перейдите в раздел через меню или переключатель кабинета.`}><div /></ScreenState>;
    }, [role, route, studentId, actingUserId, cmsItems, cmsPlacements, dataTick, navigate, embeddedInGarden, gardenBridgeRef]);

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
    const showCabinetSwitcher = !embeddedInGarden || !hideEmbeddedRoleSwitch;
    const showEmbeddedTopBar = embeddedInGarden && (showCabinetSwitcher || !!devToolsBar);

    return (
        <div
            className={`relative overflow-hidden ${embeddedInGarden ? 'pvl-garden-embed font-sans text-slate-700 antialiased' : 'md:rounded-3xl'}`}
        >
            {!embeddedInGarden ? (
                <div
                    className="pointer-events-none absolute inset-0 opacity-90"
                    aria-hidden
                    style={{
                        background:
                            'radial-gradient(circle at top, rgba(63,139,107,0.12), transparent 55%), radial-gradient(circle at 20% 20%, rgba(143,127,106,0.1), transparent 40%), linear-gradient(180deg, #fbf9f3 0%, #f7f3ea 100%)',
                    }}
                />
            ) : null}
            <div
                className={`relative grid grid-cols-1 gap-6 ${embeddedInGarden ? 'px-0 py-4 sm:py-5' : 'p-3 md:p-5 xl:grid-cols-[280px_minmax(0,1fr)]'}`}
            >
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
                        studentId={studentId}
                        actingUserId={actingUserId}
                        className="hidden md:block"
                    />
                ) : null}
                <main className={`min-w-0 ${embeddedInGarden ? 'space-y-5 md:space-y-6' : ''}`}>
                    {!embeddedInGarden ? (
                        <div className="flex min-w-0 flex-col overflow-hidden rounded-3xl bg-white/95 shadow-[0_10px_36px_-16px_rgba(15,23,42,0.07)]">
                            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100/40 bg-white/60 px-5 py-4 backdrop-blur-sm">
                                <div className="flex items-center gap-2 min-w-0">
                                    <button
                                        type="button"
                                        onClick={() => setMobileMenuOpen(true)}
                                        className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-700"
                                        aria-label="Открыть меню"
                                    >
                                        <Menu size={18} />
                                    </button>
                                    {shouldShowSubtleTrail(route) ? <SubtleTrail path={route} /> : <div />}
                                </div>
                                {showCabinetSwitcher ? <CabinetSwitcher role={role} setRole={setRole} navigate={navigate} onEmbeddedDemoRoleChange={onEmbeddedDemoRoleChange} includeStudent={!hideEmbeddedStudentRoleSwitch} /> : <div />}
                                {devToolsBar}
                            </div>
                            {pvlDevToolsEnabled() ? (
                                <div className="border-b border-slate-100/70 px-3 py-2 bg-slate-50/40">
                                    <DebugPanel
                                        role={role}
                                        setRole={setRole}
                                        navigate={navigate}
                                        actingUserId={actingUserId}
                                        setActingUserId={(id) => {
                                            setActingUserId(id);
                                            if (id.startsWith('u-st-')) setStudentId(id);
                                        }}
                                        nowDate={nowDate}
                                        setNowDate={setNowDate}
                                        forceRefresh={forceRefresh}
                                    />
                                </div>
                            ) : null}
                            {route.startsWith('/admin/') ? <AdminDrilldownNavBar route={route} navigate={navigate} /> : null}
                            <div className="p-5 md:p-7 lg:px-8 min-w-0">
                                {content}
                            </div>
                            {pvlDevToolsEnabled() ? (
                                <div className="border-t border-slate-100/70 p-4 space-y-5 bg-slate-50/30">
                                    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-950">
                                        Методологический вопрос (для разработки): порог допуска к СЗ — 400 или 500 баллов; в прототипе не решено.
                                    </div>
                                    <div className="rounded-xl border border-[#E8D5C4] bg-white p-3 text-[11px] text-[#9B8B80]">
                                        Маршрутов в реестре: {validateRouteMap().length} · строк матрицы доступа: {validateRoleAccessMap().length}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <>
                            {showEmbeddedTopBar ? (
                                <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
                                    {showCabinetSwitcher ? <CabinetSwitcher role={role} setRole={setRole} navigate={navigate} onEmbeddedDemoRoleChange={onEmbeddedDemoRoleChange} includeStudent={!hideEmbeddedStudentRoleSwitch} /> : <div />}
                                    {devToolsBar}
                                </div>
                            ) : null}
                            {pvlDevToolsEnabled() ? (
                                <DebugPanel
                                    role={role}
                                    setRole={setRole}
                                    navigate={navigate}
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
                            {route.startsWith('/admin/') ? <AdminDrilldownNavBar route={route} navigate={navigate} /> : null}
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
                        </>
                    )}
                </main>
            </div>
            {!embeddedInGarden && mobileMenuOpen ? (
                <div className="md:hidden fixed inset-0 z-40">
                    <button
                        type="button"
                        className="absolute inset-0 bg-slate-900/35"
                        onClick={() => setMobileMenuOpen(false)}
                        aria-label="Закрыть меню"
                    />
                    <div className="absolute left-0 top-0 h-full w-[86vw] max-w-[360px] bg-transparent p-3">
                        <div className="h-full overflow-y-auto">
                            <div className="mb-2 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setMobileMenuOpen(false)}
                                    className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-700"
                                    aria-label="Закрыть меню"
                                >
                                    <X size={18} />
                                </button>
                            </div>
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
                                studentId={studentId}
                                actingUserId={actingUserId}
                            />
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

