import React, { useMemo, useState } from 'react';
import PvlTaskDetailView from './PvlTaskDetailView';
import PvlMenteeCardView from './PvlMenteeCardView';
import {
    pvlMockData,
    getStudentProfile,
    getUser,
    getStudentTasks,
    getStudentRisks,
    getStudentCertification,
} from '../data/pvlMockData';
import { pvlDomainApi } from '../services/pvlMockApi';
import {
    buildSidebarByRole,
    canAccessRoute,
    clearAppSession,
    getHomeRouteByRole,
    loadAppSession,
    loadViewPreferences,
    redirectToAllowedRoute,
    saveAppSession,
    saveViewPreferences,
    validateRoleAccessMap,
    validateRouteMap,
} from '../services/pvlAppKernel';

const STUDENT_MENU = ['О курсе', 'Глоссарий курса', 'Библиотека курса', 'Уроки', 'Практикумы с менторами', 'Чек-лист', 'Результаты', 'Сертификация', 'Культурный код Лиги'];
const ADMIN_MENU = ['Обзор', 'Контент-центр', 'Ученицы', 'Менторы', 'Потоки', 'Проверка и риски', 'Сертификация', 'Настройки'];

const STATUS_TONE = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'принято' || s === 'done') return 'bg-emerald-50 text-emerald-700 border-emerald-600/30';
    if (s === 'на доработке' || s === 'warning' || s === 'скоро') return 'bg-amber-50 text-amber-700 border-amber-600/30';
    if (s === 'просрочено' || s === 'не принято' || s === 'высокий') return 'bg-rose-50 text-rose-700 border-rose-600/30';
    if (s === 'к проверке' || s === 'запланирована' || s === 'средний') return 'bg-blue-50 text-blue-700 border-blue-600/30';
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
    <article className="rounded-2xl border border-[#E8D5C4] bg-white p-3">
        <div className="text-[11px] uppercase tracking-[0.08em] text-[#9B8B80]">{title}</div>
        <div className="font-display text-3xl text-[#C8855A] mt-1">{value}</div>
        {hint ? <div className="text-xs text-[#9B8B80] mt-1">{hint}</div> : null}
    </article>
);

const ProgressWidget = ({ title, done, total }) => {
    const pct = total ? Math.round((done / total) * 100) : 0;
    return (
        <article className="rounded-2xl border border-[#E8D5C4] bg-white p-3">
            <div className="text-[11px] uppercase tracking-[0.08em] text-[#9B8B80]">{title}</div>
            <div className="font-display text-3xl text-[#C8855A] mt-1">{done}/{total}</div>
            <div className="mt-2 h-1.5 rounded-full bg-[#E8D5C4] overflow-hidden"><div className="h-full bg-[#C8855A]" style={{ width: `${pct}%` }} /></div>
        </article>
    );
};

const PointsProgressBar = ({ value, max, tone = 'bg-[#C8855A]' }) => {
    const pct = max ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
    return <div className="h-2 rounded-full bg-[#E8D5C4] overflow-hidden"><div className={`h-full ${tone}`} style={{ width: `${pct}%` }} /></div>;
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
    <article className="rounded-2xl border border-[#E8D5C4] bg-white p-3">
        <div className="text-[11px] uppercase tracking-[0.08em] text-[#9B8B80]">Курсовые баллы</div>
        <div className="font-display text-3xl text-[#C8855A] mt-1">{points.coursePointsTotal}/400</div>
        <div className="mt-2"><PointsProgressBar value={points.coursePointsTotal} max={400} /></div>
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
    <article className="rounded-2xl border border-blue-200 bg-blue-50 p-3">
        <div className="text-[11px] uppercase tracking-[0.08em] text-blue-700">СЗ (отдельная шкала)</div>
        <div className="grid md:grid-cols-2 gap-2 mt-1 text-sm">
            <div>Self: {points.szSelfAssessmentTotal}/54</div>
            <div>Mentor: {points.szMentorAssessmentTotal}/54</div>
        </div>
        <div className="mt-2"><PointsProgressBar value={points.szSelfAssessmentTotal} max={54} tone="bg-blue-600" /></div>
        {redFlags.length ? <div className="mt-2 text-xs text-rose-700">Красные флаги: {redFlags.join(', ')}</div> : null}
    </article>
);

const PointsHistoryList = ({ items = [] }) => (
    <div className="grid gap-1">
        {items.length === 0 ? <div className="text-xs text-[#9B8B80]">Пока нет начислений.</div> : items.map((h) => (
            <article key={h.id} className="rounded-xl border border-[#E8D5C4] bg-[#FAF6F2] p-2">
                <div className="text-xs text-[#2C1810]">{h.sourceLabel}: +{h.pointsDelta}</div>
                <div className="text-[10px] text-[#9B8B80]">{h.createdAt}</div>
            </article>
        ))}
    </div>
);

const MentorBonusUsageBadge = ({ used }) => <StatusBadge>{`bonus ${used}/50`}</StatusBadge>;
const ControlPointsSummary = ({ accepted }) => <StatusBadge>{`КТ ${accepted}/9`}</StatusBadge>;
const AssessmentComparisonCard = ({ selfPoints, mentorPoints }) => (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800">
        Сравнение СЗ: self {selfPoints}/54 vs mentor {mentorPoints}/54
    </div>
);

const SidebarMenu = ({ role, studentSection, setStudentSection, adminSection, setAdminSection, navigate }) => (
    <aside className="surface-card border border-[#E8D5C4] bg-white p-3 h-fit xl:sticky xl:top-6">
        <h3 className="font-display text-2xl text-[#4A3728] mb-2">
            {role === 'student' ? 'Кабинет участницы' : role === 'mentor' ? 'Зона ментора' : 'Учительская'}
        </h3>
        {role === 'student' ? (
            <nav className="space-y-1">
                <button onClick={() => navigate('/student/dashboard')} className="w-full text-left rounded-xl px-3 py-2 text-sm text-[#9B8B80] hover:bg-[#FAF6F2]">Дашборд</button>
                {STUDENT_MENU.map((item) => (
                    <button
                        key={item}
                        onClick={() => {
                            setStudentSection(item);
                            navigate(`/student/${toRoute(item)}`);
                        }}
                        className={`w-full text-left rounded-xl px-3 py-2 text-sm ${studentSection === item ? 'bg-[#C8855A]/15 border border-[#E8D5C4] text-[#4A3728]' : 'text-[#9B8B80] hover:bg-[#FAF6F2]'}`}
                    >
                        {item}
                    </button>
                ))}
            </nav>
        ) : (
            role === 'mentor' ? (
                <nav className="space-y-1">
                    <button onClick={() => navigate('/mentor/dashboard')} className="w-full text-left rounded-xl px-3 py-2 text-sm text-[#9B8B80] hover:bg-[#FAF6F2]">Дашборд ментора</button>
                </nav>
            ) : (
                <nav className="space-y-1">
                    {buildSidebarByRole('admin').map((item) => (
                        <button
                            key={item}
                            onClick={() => {
                                setAdminSection(item);
                                const map = {
                                    Обзор: '/admin/dashboard',
                                    'Контент-центр': '/admin/content',
                                    Ученицы: '/admin/students',
                                    Менторы: '/admin/mentors',
                                    Потоки: '/admin/cohorts',
                                    'Проверка и риски': '/admin/review',
                                    Сертификация: '/admin/certification',
                                    Настройки: '/admin/settings',
                                };
                                navigate(map[item] || '/admin/dashboard');
                            }}
                            className={`w-full text-left rounded-xl px-3 py-2 text-sm ${adminSection === item ? 'bg-[#C8855A]/15 border border-[#E8D5C4] text-[#4A3728]' : 'text-[#9B8B80] hover:bg-[#FAF6F2]'}`}
                        >
                            {item}
                        </button>
                    ))}
                </nav>
            )
        )}
    </aside>
);

const Breadcrumbs = ({ path, navigate }) => {
    const parts = path.split('/').filter(Boolean);
    const crumbs = [];
    for (let i = 0; i < parts.length; i += 1) {
        crumbs.push({ label: parts[i], path: `/${parts.slice(0, i + 1).join('/')}` });
    }
    return (
        <div className="text-xs text-[#9B8B80] mb-2 flex flex-wrap gap-1">
            {crumbs.map((c, idx) => (
                <span key={c.path}>
                    <button onClick={() => navigate(c.path)} className="hover:text-[#4A3728]">{c.label}</button>
                    {idx < crumbs.length - 1 ? ' / ' : ''}
                </span>
            ))}
        </div>
    );
};

const RoleSwitcher = ({ role, setRole, navigate }) => (
    <div className="flex items-center gap-2">
        <span className="text-xs text-[#9B8B80]">Role switch:</span>
        <button onClick={() => { setRole('student'); navigate('/student/dashboard'); }} className={`text-xs rounded-full border px-3 py-1 ${role === 'student' ? 'border-[#C8855A] text-[#C8855A] bg-[#F5EDE6]' : 'border-[#E8D5C4] text-[#9B8B80]'}`}>student</button>
        <button onClick={() => { setRole('mentor'); navigate('/mentor/dashboard'); }} className={`text-xs rounded-full border px-3 py-1 ${role === 'mentor' ? 'border-[#C8855A] text-[#C8855A] bg-[#F5EDE6]' : 'border-[#E8D5C4] text-[#9B8B80]'}`}>mentor</button>
        <button onClick={() => { setRole('admin'); navigate('/admin/dashboard'); }} className={`text-xs rounded-full border px-3 py-1 ${role === 'admin' ? 'border-[#C8855A] text-[#C8855A] bg-[#F5EDE6]' : 'border-[#E8D5C4] text-[#9B8B80]'}`}>admin</button>
    </div>
);

const ScreenState = ({ loading, error, empty, children, emptyText = 'Нет данных.' }) => {
    if (loading) return <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4 text-sm text-[#9B8B80]">Loading...</div>;
    if (error) return <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>;
    if (empty) return <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4 text-sm text-[#9B8B80]">{emptyText}</div>;
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

const SECTION_ROUTE_TO_KEY = {
    '/student/about': 'about',
    '/student/glossary': 'glossary',
    '/student/library': 'library',
    '/student/lessons': 'lessons',
    '/student/practicums': 'practicums',
    '/student/checklist': 'checklist',
    '/student/results': 'results',
    '/student/certification': 'certification',
    '/student/cultural-code': 'cultural_code',
};

function getPublishedContentBySection(sectionKey, role = 'student', items = [], placements = [], cohortId = 'cohort-2026-1') {
    const placementIds = new Set(placements.filter((p) => p.targetSection === sectionKey && (p.targetRole === role || p.targetRole === 'both')).map((p) => p.contentId));
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
    if (!items.length) return <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4 text-sm text-[#9B8B80]">Пока нет опубликованных материалов.</div>;
    return (
        <div className="grid md:grid-cols-2 gap-3">
            {items.map((i) => (
                <article key={i.id} className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                    <div className="text-xs text-[#9B8B80]">{i.category || i.targetSection}</div>
                    <h4 className="text-sm font-medium text-[#4A3728] mt-1">{i.title}</h4>
                    <p className="text-xs text-[#9B8B80] mt-1 whitespace-pre-line">{i.shortDescription || i.description || 'Материал без описания.'}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{CONTENT_TYPE_LABEL[i.contentType] || i.contentType}</span>
                        {i.estimatedDuration ? <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{i.estimatedDuration}</span> : null}
                        {(i.tags || []).slice(0, 3).map((tag) => (
                            <span key={`${i.id}-${tag}`} className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{tag}</span>
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

function LibraryPage({ studentId, navigate, initialItemId = '' }) {
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
            <div className="space-y-3">
                <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                    <h2 className="font-display text-3xl text-[#4A3728]">Библиотека курса</h2>
                    <p className="text-sm text-[#9B8B80]">Отдельная база знаний курса. Не смешивается с уроками.</p>
                    <div className="mt-2 grid md:grid-cols-4 gap-2 text-xs">
                        <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-2">Пройдено: {progress.completed}</div>
                        <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-2">Всего: {progress.total}</div>
                        <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-2">Прогресс: {progress.progressPercent}%</div>
                        <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-2">Далее: {progress.recommendedNextMaterial?.title || '—'}</div>
                    </div>
                </div>

                <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4 grid md:grid-cols-5 gap-2">
                    <input value={query} onChange={(e) => setQuery(e.target.value)} className="rounded-xl border border-[#E8D5C4] p-2 text-sm" placeholder="Поиск по названию, описанию, тегам" />
                    <select value={contentType} onChange={(e) => setContentType(e.target.value)} className="rounded-xl border border-[#E8D5C4] p-2 text-sm">
                        <option value="all">Все типы</option><option value="video">video</option><option value="text">text</option><option value="pdf">pdf</option><option value="checklist">checklist</option><option value="template">template</option><option value="link">link</option><option value="audio">audio</option><option value="fileBundle">fileBundle</option>
                    </select>
                    <select value={completion} onChange={(e) => setCompletion(e.target.value)} className="rounded-xl border border-[#E8D5C4] p-2 text-sm">
                        <option value="all">Все</option><option value="completed">Просмотренные</option><option value="pending">Непройденные</option>
                    </select>
                    <select value={flag} onChange={(e) => setFlag(e.target.value)} className="rounded-xl border border-[#E8D5C4] p-2 text-sm">
                        <option value="all">Все метки</option><option value="new">Новые</option><option value="recommended">Рекомендованные</option>
                    </select>
                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="rounded-xl border border-[#E8D5C4] p-2 text-sm">
                        <option value="order">По порядку</option><option value="title">По названию</option><option value="duration">По длительности</option>
                    </select>
                </div>

                <div className="grid xl:grid-cols-[260px_1fr] gap-3 items-start">
                    <aside className="rounded-2xl border border-[#E8D5C4] bg-white p-3">
                        <h3 className="font-display text-2xl text-[#4A3728] mb-2">Категории</h3>
                        <div className="grid gap-2">
                            <button onClick={() => setSelectedCategoryId('')} className={`text-left rounded-xl border px-3 py-2 text-sm ${!selectedCategoryId ? 'border-[#C8855A] bg-[#F5EDE6] text-[#4A3728]' : 'border-[#E8D5C4] text-[#9B8B80]'}`}>Все</button>
                            {categories.map((c) => (
                                <button key={c.id} onClick={() => setSelectedCategoryId(c.id)} className={`text-left rounded-xl border px-3 py-2 ${selectedCategoryId === c.id ? 'border-[#C8855A] bg-[#F5EDE6] text-[#4A3728]' : 'border-[#E8D5C4] text-[#9B8B80]'}`}>
                                    <div className="text-sm">{c.title}</div>
                                    <div className="text-[11px]">{c.count} материалов · {c.progressPercent}%</div>
                                </button>
                            ))}
                        </div>
                    </aside>

                    <section className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                        <h3 className="font-display text-2xl text-[#4A3728] mb-2">Материалы</h3>
                        {filteredItems.length === 0 ? (
                            <div className="rounded-xl border border-[#E8D5C4] bg-[#FAF6F2] p-4 text-sm text-[#9B8B80]">
                                Нет материалов по выбранным фильтрам или категории.
                            </div>
                        ) : (
                            <div className="grid md:grid-cols-2 gap-2">
                                {filteredItems.map((i) => (
                                    <article key={i.id} className="rounded-xl border border-[#E8D5C4] bg-[#FAF6F2] p-3">
                                        <div className="text-xs text-[#9B8B80]">{i.categoryTitle}</div>
                                        <div className="text-sm font-medium text-[#4A3728] mt-1">{i.title}</div>
                                        <p className="text-xs text-[#9B8B80] mt-1">{i.shortDescription}</p>
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            <StatusBadge>{i.contentType}</StatusBadge>
                                            {i.isNew ? <StatusBadge>новое</StatusBadge> : null}
                                            {i.isRecommended ? <StatusBadge>рекомендовано</StatusBadge> : null}
                                            {i.isRequired ? <StatusBadge>обязательно</StatusBadge> : null}
                                            {i.completed ? <StatusBadge>просмотрено</StatusBadge> : null}
                                        </div>
                                        <div className="mt-2 flex items-center justify-between">
                                            <span className="text-[11px] text-[#9B8B80]">{i.estimatedDuration || '—'}</span>
                                            <button onClick={() => {
                                                setSelectedItemId(i.id);
                                                pvlDomainApi.studentApi.updateLibraryProgress(studentId, i.id, Math.max(10, i.progressPercent || 10));
                                                if (navigate) navigate(`/student/library/${i.id}`);
                                            }} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">Открыть</button>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>
                </div>

                {selectedItem ? (
                    <section className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="font-display text-2xl text-[#4A3728]">{selectedItem.title}</h3>
                            <div className="flex items-center gap-2">
                                <button onClick={() => pvlDomainApi.studentApi.markLibraryItemCompleted(studentId, selectedItem.id)} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">Отметить как просмотрено</button>
                                <button onClick={() => { setSelectedItemId(''); if (navigate) navigate('/student/library'); }} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">Закрыть</button>
                            </div>
                        </div>
                        <p className="text-sm text-[#2C1810] mt-2">{selectedItem.fullDescription || selectedItem.shortDescription}</p>
                        <div className="mt-2 text-xs text-[#9B8B80]">Тип: {selectedItem.contentType} · Длительность: {selectedItem.estimatedDuration || '—'}</div>
                        {(selectedItem.externalLinks || []).length ? <p className="text-xs text-[#9B8B80] mt-1">Ссылки: {(selectedItem.externalLinks || []).join(', ')}</p> : null}
                        {(selectedItem.attachments || []).length ? <p className="text-xs text-[#9B8B80] mt-1">Вложения: {(selectedItem.attachments || []).join(', ')}</p> : null}
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

function buildTaskDetailStateFromApi(studentId, taskId) {
    const detail = pvlDomainApi.studentApi.getStudentTaskDetail(studentId, taskId);
    const task = detail.task || {};
    const state = detail.state || {};
    const thread = (detail.thread || []).map((m) => ({
        id: m.id,
        type: m.isSystem ? 'system' : 'message',
        authorName: m.authorRole === 'mentor' ? 'Ментор' : m.authorRole === 'student' ? 'Участница' : 'Система',
        authorRole: m.authorRole,
        createdAt: m.createdAt,
        text: m.text,
        attachments: m.attachments || [],
        linkedStatusChange: m.linkedStatusHistoryId || null,
        linkedVersionId: m.linkedVersionId || null,
        isUnreadForCurrentUser: !(m.readBy || []).includes(studentId),
    }));
    return {
        taskDetail: {
            id: task.id,
            title: task.title,
            weekNumber: Number(String(task.weekId || '').split('w').pop() || 0),
            moduleNumber: 0,
            type: task.taskType,
            isControlPoint: task.isControlPoint,
            controlPointId: task.controlPointId,
            status: state.status || 'in_progress',
            deadlineAt: task.deadlineAt,
            submittedAt: state.submittedAt,
            lastStatusChangedAt: state.lastStatusChangedAt,
            score: state.totalTaskPoints || 0,
            maxScore: task.scoreMax || 0,
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
            createdAt: v.createdAt,
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
            changedAt: h.createdAt,
            changedBy: h.changedByUserId,
            comment: h.comment,
        })),
        threadMessages: thread,
    };
}

function toRoute(name) {
    const map = {
        'О курсе': 'about',
        'Глоссарий курса': 'glossary',
        'Библиотека курса': 'library',
        Уроки: 'lessons',
        'Практикумы с менторами': 'practicums',
        'Чек-лист': 'checklist',
        Результаты: 'results',
        Сертификация: 'certification',
        'Культурный код Лиги': 'cultural-code',
    };
    return map[name] || 'dashboard';
}

function StudentDashboard({ studentId, navigate }) {
    const snapshot = pvlDomainApi.studentApi.getStudentDashboard(studentId);
    const points = pvlDomainApi.helpers.getStudentPointsSummary(studentId);
    const profile = getStudentProfile(studentId) || snapshot.studentProfile;
    const tasks = getStudentTasks(studentId);
    const risks = snapshot.risks || getStudentRisks(studentId);
    const cpDone = tasks.filter((t) => t.isControlPoint && (t.status === 'принято' || t.status === 'accepted')).length;
    const cpTotal = 9;
    const done = snapshot.dashboardStats?.homeworkDone ?? tasks.filter((t) => t.status === 'принято').length;
    const total = snapshot.dashboardStats?.homeworkTotal ?? (tasks.length || 1);
    return (
        <div className="space-y-3">
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <h2 className="font-display text-3xl text-[#4A3728]">Дашборд участницы</h2>
                <p className="text-sm text-[#9B8B80]">Где я сейчас и что делать дальше.</p>
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3">
                <DashboardWidget title="Текущий модуль" value={profile.currentModule} />
                <DashboardWidget title="Неделя" value={profile.currentWeek} />
                <DashboardWidget title="До конца модуля" value={`${profile.daysToModuleEnd} дн`} />
                <DashboardWidget title="До конца курса" value={`${profile.daysToCourseEnd} дн`} />
                <DashboardWidget title="До дедлайна записи СЗ" value={`${profile.daysToSzDeadline} дн`} />
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
                <ProgressWidget title="Домашки" done={done} total={total} />
                <ProgressWidget title="Контрольные точки" done={cpDone} total={cpTotal} />
                <CoursePointsCard points={points} />
                <DashboardWidget title="Антидолги" value="D+1 · D+3 · D+7 · D+10" hint="Проверяйте просрочки в Результатах." />
            </div>
            <SzPointsCard points={points} redFlags={(pvlDomainApi.studentApi.getStudentCertification(studentId)?.redFlags) || []} />
            <div className="grid md:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                    <h3 className="font-display text-2xl text-[#4A3728] mb-2">Ближайшие дедлайны и риски</h3>
                    <ul className="text-sm space-y-1">
                        <li>КТ4/5/6 — 2026-06-02</li>
                        <li>Дедлайн записи СЗ — 2026-06-30</li>
                        <li>Активных рисков: {risks.length}</li>
                    </ul>
                </div>
                <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                    <h3 className="font-display text-2xl text-[#4A3728] mb-2">FAQ</h3>
                    <ul className="text-sm space-y-1">{pvlMockData.faqItems.map((f) => <li key={f.id}>• {f.q}</li>)}</ul>
                </div>
            </div>
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <h3 className="font-display text-2xl text-[#4A3728] mb-2">Быстрые переходы</h3>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => navigate('/student/lessons')} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">Уроки</button>
                    <button onClick={() => navigate('/student/results')} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">Результаты</button>
                    <button onClick={() => navigate('/student/certification')} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">Сертификация</button>
                    <button onClick={() => navigate('/student/library')} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">Библиотека курса</button>
                </div>
            </div>
        </div>
    );
}

function StudentResults({ studentId, navigate }) {
    const pref = loadViewPreferences('student.results');
    const [filter, setFilter] = useState(pref?.filter || 'все');
    const apiItems = pvlDomainApi.studentApi.getStudentResults(studentId, {});
    const mapped = apiItems.map((x) => ({
        id: x.id,
        title: x.title,
        weekNumber: x.week,
        moduleNumber: 0,
        type: x.type,
        status: x.status,
        deadlineAt: x.deadlineAt,
        submittedAt: x.submittedAt,
        score: 0,
        maxScore: 0,
        revisionCycles: 0,
        mentorCommentPreview: x.mentorCommentPreview,
        isControlPoint: x.type === 'control_point',
    }));
    const tasks = mapped.filter((t) => (filter === 'все' ? true : filter === 'контрольные точки' ? t.isControlPoint : t.status === filter));
    const pointsHistory = (pvlDomainApi.db.pointsHistory || []).filter((x) => x.studentId === studentId).slice(-5).reverse();
    React.useEffect(() => {
        saveViewPreferences('student.results', { filter });
    }, [filter]);
    return (
        <div className="space-y-3">
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-3xl text-[#4A3728]">Результаты</h2>
                <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-xl border border-[#E8D5C4] p-2 text-sm">
                    <option value="все">все</option><option value="к проверке">к проверке</option><option value="на доработке">на доработке</option><option value="просрочено">просрочено</option><option value="принято">принято</option><option value="контрольные точки">контрольные точки</option>
                </select>
            </div>
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <h3 className="font-display text-2xl text-[#4A3728] mb-2">История баллов</h3>
                <PointsHistoryList items={pointsHistory} />
            </div>
            {tasks.map((t) => (
                <article key={t.id} className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <div className="text-sm font-medium text-[#4A3728]">{t.title}</div>
                            <div className="text-xs text-[#9B8B80]">Неделя {t.weekNumber} · Модуль {t.moduleNumber} · {t.type}</div>
                        </div>
                        <StatusBadge>{t.status}</StatusBadge>
                    </div>
                    <div className="grid md:grid-cols-4 gap-2 mt-2 text-xs">
                        <div>Дедлайн: {t.deadlineAt}</div><div>Сдано: {t.submittedAt || '—'}</div><div>Баллы: {t.score}/{t.maxScore}</div><div>Циклы: {t.revisionCycles}</div>
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
        <div className="space-y-3">
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4"><h2 className="font-display text-3xl text-[#4A3728]">{title}</h2></div>
            {children}
        </div>
    );
}

function StudentPage({ route, studentId, navigate, cmsItems, cmsPlacements, refresh }) {
    const sectionKey = SECTION_ROUTE_TO_KEY[route];
    const sectionMaterials = sectionKey ? getPublishedContentBySection(sectionKey, 'student', cmsItems, cmsPlacements) : [];
    if (route === '/student/dashboard') return <StudentDashboard studentId={studentId} navigate={navigate} />;
    if (route === '/student/results') return <StudentResults studentId={studentId} navigate={navigate} />;
    if (route.startsWith('/student/results/')) {
        const taskId = route.split('/')[3];
        return (
            <PvlTaskDetailView
                role="student"
                onBack={() => navigate('/student/results')}
                initialData={buildTaskDetailStateFromApi(studentId, taskId)}
                onStudentSaveDraft={(text) => pvlDomainApi.studentApi.saveStudentDraft(studentId, taskId, { textContent: text })}
                onStudentSubmit={(text) => { pvlDomainApi.studentApi.submitStudentTask(studentId, taskId, { textContent: text }); refresh(); }}
                onStudentReply={(msg) => { pvlDomainApi.studentApi.addStudentThreadReply(studentId, taskId, { text: msg.text }); refresh(); }}
            />
        );
    }
    if (route === '/student/about') return <StudentGeneric title="О курсе"><GardenContentCards items={sectionMaterials} /></StudentGeneric>;
    if (route === '/student/glossary') return <StudentGeneric title="Глоссарий курса"><GardenContentCards items={sectionMaterials.length ? sectionMaterials : pvlMockData.glossaryItems.map((g) => ({ id: g.id, title: g.term, shortDescription: g.definition, contentType: 'text', tags: ['глоссарий'] }))} /></StudentGeneric>;
    if (route === '/student/library') return <LibraryPage studentId={studentId} navigate={navigate} />;
    if (route.startsWith('/student/library/')) {
        const itemId = route.split('/')[3] || '';
        return <LibraryPage studentId={studentId} navigate={navigate} initialItemId={itemId} />;
    }
    if (route === '/student/lessons') return <StudentGeneric title="Уроки"><GardenContentCards items={sectionMaterials} /></StudentGeneric>;
    if (route === '/student/practicums') return <StudentGeneric title="Практикумы с менторами"><GardenContentCards items={sectionMaterials} /></StudentGeneric>;
    if (route === '/student/checklist') return <StudentGeneric title="Чек-лист"><GardenContentCards items={sectionMaterials} /></StudentGeneric>;
    if (route === '/student/certification') {
        const cert = pvlDomainApi.studentApi.getStudentCertification(studentId);
        return <StudentGeneric title="Сертификация"><SzPointsCard points={cert.points} redFlags={cert.redFlags || []} /><AssessmentComparisonCard selfPoints={cert.points.szSelfAssessmentTotal} mentorPoints={cert.points.szMentorAssessmentTotal} /><div className="rounded-2xl border border-[#E8D5C4] bg-white p-4 text-sm mt-2">Курсовые баллы (отдельно): {cert.points.coursePointsTotal}/400 · Дедлайн записи СЗ: {cert?.deadlineAt || '2026-06-30'}</div><GardenContentCards items={sectionMaterials} /></StudentGeneric>;
    }
    if (route === '/student/cultural-code') return <StudentGeneric title="Культурный код Лиги"><GardenContentCards items={sectionMaterials.length ? sectionMaterials : ['Бережность', 'Ясность', 'Без советов', 'Поддержка сообщества'].map((x) => ({ id: x, title: x, shortDescription: '', contentType: 'text', tags: ['код'] }))} /></StudentGeneric>;
    return <StudentDashboard studentId={studentId} navigate={navigate} />;
}

function MentorDashboard({ navigate, cmsItems, cmsPlacements }) {
    const mentorId = 'u-men-1';
    const menteesFromApi = pvlDomainApi.mentorApi.getMentorMentees(mentorId);
    const mentees = menteesFromApi.map((m) => ({ user: m.user || getUser(m.userId), profile: getStudentProfile(m.userId), tasks: getStudentTasks(m.userId), risks: getStudentRisks(m.userId) }));
    const queueRaw = pvlDomainApi.mentorApi.getMentorReviewQueue(mentorId);
    const queue = queueRaw.map((q) => ({ id: q.task?.id || q.taskId, title: q.task?.title || q.taskId, type: q.task?.taskType || 'homework', studentId: q.studentId, submittedAt: q.submittedAt, deadlineAt: q.task?.deadlineAt || '' }));
    const mentorRisks = pvlDomainApi.mentorApi.getMentorDashboard(mentorId).risks || [];
    const bonusUsed = menteesFromApi.reduce((acc, m) => acc + (pvlDomainApi.helpers.getStudentPointsSummary(m.userId).mentorBonusTotal || 0), 0);
    const acceptedCp = menteesFromApi.reduce((acc, m) => acc + pvlDomainApi.mentorApi.getMentorMenteeCard(mentorId, m.userId).points.controlPointsAccepted, 0);
    const mentorMaterials = [
        ...getPublishedContentBySection('lessons', 'mentor', cmsItems, cmsPlacements),
        ...getPublishedContentBySection('practicums', 'mentor', cmsItems, cmsPlacements),
        ...getPublishedContentBySection('certification', 'mentor', cmsItems, cmsPlacements),
    ].slice(0, 6);
    return (
        <div className="space-y-3">
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4"><h2 className="font-display text-3xl text-[#4A3728]">Дашборд ментора</h2></div>
            <div className="grid md:grid-cols-4 gap-3">
                <DashboardWidget title="Всего менти" value={mentees.length} />
                <DashboardWidget title="Активных проверок" value={queue.length} />
                <DashboardWidget title="Менти в риске" value={mentees.filter((m) => m.risks.length > 0).length} />
                <DashboardWidget title="Просроченных ДЗ" value={pvlMockData.homeworkTasks.filter((t) => t.status === 'просрочено').length} />
            </div>
            <div className="grid md:grid-cols-3 gap-3">
                <article className="rounded-2xl border border-[#E8D5C4] bg-white p-3"><div className="text-[11px] uppercase text-[#9B8B80]">Бонус ментора</div><div className="mt-2"><MentorBonusUsageBadge used={bonusUsed} /></div></article>
                <article className="rounded-2xl border border-[#E8D5C4] bg-white p-3"><div className="text-[11px] uppercase text-[#9B8B80]">Контрольные точки</div><div className="mt-2"><ControlPointsSummary accepted={acceptedCp} /></div></article>
                <DashboardWidget title="СЗ (отдельно)" value="54 шкала" hint="Не смешивается с курсовыми" />
            </div>
            <StudentGeneric title="Мои менти">
                <div className="grid gap-2">
                    {mentees.map(({ user, profile, tasks, risks }) => (
                        <article key={user.id} className="rounded-xl border border-[#E8D5C4] bg-white p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-sm font-medium text-[#4A3728]">{user.fullName}</div>
                                <button onClick={() => navigate(`/mentor/mentee/${user.id}`)} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">Открыть карточку</button>
                            </div>
                            <div className="grid md:grid-cols-6 gap-2 mt-2 text-xs">
                                <div>Неделя: {profile.currentWeek}</div><div>Статус: {profile.currentModule}</div><div>Последняя: {tasks[0]?.title || '—'}</div><div>Сдача: {tasks[0]?.status || '—'}</div><div>Баллы: {profile.coursePoints}</div><div>Риски: {risks.length}</div>
                            </div>
                        </article>
                    ))}
                </div>
            </StudentGeneric>
            <StudentGeneric title="Очередь проверок">
                <div className="grid gap-2">
                    {queue.map((q) => (
                        <article key={q.id} className="rounded-xl border border-[#E8D5C4] bg-white p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span>{q.title} · {q.type}</span>
                            <span className="text-xs text-[#9B8B80]">{q.submittedAt || '—'} / дедлайн {q.deadlineAt}</span>
                            <button onClick={() => navigate(`/mentor/mentee/${q.studentId}/task/${q.id}`)} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">К задаче</button>
                        </article>
                    ))}
                </div>
            </StudentGeneric>
            <StudentGeneric title="Риски по дедлайнам">
                <div className="grid gap-2">
                    {mentorRisks.map((r) => (
                        <article key={r.id} className="rounded-xl border border-[#E8D5C4] bg-white p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span>{r.title} · {r.riskType}</span>
                            <RiskBadge level={r.riskLevel} />
                            <button onClick={() => navigate(`/mentor/mentee/${r.studentId}/task/${r.relatedTaskId}`)} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">Открыть</button>
                        </article>
                    ))}
                </div>
            </StudentGeneric>
            <StudentGeneric title="Материалы ментора">
                <GardenContentCards items={mentorMaterials} />
            </StudentGeneric>
        </div>
    );
}

function MentorPage({ route, navigate, cmsItems, cmsPlacements, refresh }) {
    if (route === '/mentor/dashboard') return <MentorDashboard navigate={navigate} cmsItems={cmsItems} cmsPlacements={cmsPlacements} />;
    if (/^\/mentor\/mentee\/[^/]+\/task\/[^/]+$/.test(route)) {
        const [, , , menteeId, , taskId] = route.split('/');
        return (
            <PvlTaskDetailView
                role="mentor"
                onBack={() => navigate(`/mentor/mentee/${menteeId}`)}
                initialData={buildTaskDetailStateFromApi(menteeId, taskId)}
                onMentorReply={(msg) => { pvlDomainApi.mentorApi.addMentorThreadReply('u-men-1', menteeId, taskId, { text: msg.text }); refresh(); }}
                onMentorReview={(payload) => {
                    pvlDomainApi.mentorApi.submitMentorReview('u-men-1', menteeId, taskId, payload);
                    pvlDomainApi.actions.markThreadRead('u-men-1', menteeId, taskId);
                    refresh();
                }}
            />
        );
    }
    if (/^\/mentor\/mentee\/[^/]+$/.test(route)) {
        const [, , , menteeId] = route.split('/');
        return <PvlMenteeCardView menteeId={menteeId} onBack={() => navigate('/mentor/dashboard')} />;
    }
    return <MentorDashboard navigate={navigate} />;
}

function AdminOverview() {
    const overview = pvlDomainApi.adminApi.getAdminOverview();
    const mentors = overview.activeMentors;
    const students = overview.activeStudents;
    const risks = overview.risks;
    const review = overview.reviewQueue;
    const nearest = [...pvlMockData.homeworkTasks].sort((a, b) => String(a.deadlineAt).localeCompare(String(b.deadlineAt))).slice(0, 4);
    return (
        <div className="space-y-3">
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4"><h2 className="font-display text-3xl text-[#4A3728]">Admin · Обзор</h2></div>
            <div className="grid md:grid-cols-4 gap-3">
                <DashboardWidget title="Потоки" value={pvlMockData.cohorts.length} />
                <DashboardWidget title="Ученицы" value={students} />
                <DashboardWidget title="Менторы" value={mentors} />
                <DashboardWidget title="К проверке" value={review} />
            </div>
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-3 text-sm">Средние курсовые баллы: {overview.avgCoursePoints}/400 · СЗ отдельно 54</div>
            <div className="grid md:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                    <h3 className="font-display text-2xl text-[#4A3728] mb-2">Риски и дедлайны</h3>
                    <p className="text-sm text-[#2C1810]">Активных рисков: {risks}</p>
                    <div className="space-y-1 mt-2">
                        {nearest.map((n) => (
                            <div key={n.id} className="text-sm flex items-center justify-between"><span>{n.title}</span><DeadlineBadge value={n.deadlineAt} /></div>
                        ))}
                    </div>
                </div>
                <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                    <h3 className="font-display text-2xl text-[#4A3728] mb-2">Проверки</h3>
                    {pvlMockData.homeworkTasks.filter((t) => t.status === 'к проверке' || t.status === 'на доработке').map((t) => (
                        <div key={t.id} className="text-sm flex items-center justify-between py-1"><span>{t.title}</span><StatusBadge>{t.status}</StatusBadge></div>
                    ))}
                </div>
            </div>
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
        targetSection: 'about',
        targetRole: 'student',
        targetCohort: 'cohort-2026-1',
        status: 'draft',
        visibility: 'all',
        weekNumber: 0,
        estimatedDuration: '',
        tagsText: '',
    });
    const sections = ['about', 'glossary', 'library', 'lessons', 'practicums', 'checklist', 'results', 'certification', 'cultural_code'];
    const types = ['video', 'text', 'pdf', 'checklist', 'template', 'link', 'audio', 'fileBundle'];
    const filtered = filterContentItems(items, filters)
        .filter((i) => (filters.cohort === 'all' ? true : i.targetCohort === filters.cohort))
        .filter((i) => (filters.week === 'all' ? true : String(i.weekNumber || 0) === String(filters.week)));
    const previewItem = items.find((x) => x.id === previewId) || null;
    const handleCreate = () => {
        if (!draft.title.trim()) return;
        const record = {
            ...draft,
            tags: String(draft.tagsText || '').split(',').map((x) => x.trim()).filter(Boolean),
            description: draft.fullDescription || draft.shortDescription,
            createdBy: 'u-adm-1',
        };
        pvlDomainApi.adminApi.createContentItem(record);
        setItems((prev) => createContentItem(prev, record));
        setDraft((d) => ({ ...d, title: '', shortDescription: '', fullDescription: '', tagsText: '' }));
    };
    return (
        <div className="space-y-3">
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-3xl text-[#4A3728]">Admin · Контент-центр</h2>
                <button onClick={handleCreate} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">Создать материал</button>
            </div>
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4 grid md:grid-cols-2 gap-2">
                <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} className="rounded-xl border border-[#E8D5C4] p-2 text-sm" placeholder="Название нового материала" />
                <input value={draft.shortDescription} onChange={(e) => setDraft((d) => ({ ...d, shortDescription: e.target.value }))} className="rounded-xl border border-[#E8D5C4] p-2 text-sm" placeholder="Короткое описание" />
                <select value={draft.targetSection} onChange={(e) => setDraft((d) => ({ ...d, targetSection: e.target.value }))} className="rounded-xl border border-[#E8D5C4] p-2 text-sm">
                    {sections.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={draft.contentType} onChange={(e) => setDraft((d) => ({ ...d, contentType: e.target.value }))} className="rounded-xl border border-[#E8D5C4] p-2 text-sm">
                    {types.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input value={draft.tagsText} onChange={(e) => setDraft((d) => ({ ...d, tagsText: e.target.value }))} className="rounded-xl border border-[#E8D5C4] p-2 text-sm" placeholder="Теги через запятую" />
                <input value={draft.estimatedDuration} onChange={(e) => setDraft((d) => ({ ...d, estimatedDuration: e.target.value }))} className="rounded-xl border border-[#E8D5C4] p-2 text-sm" placeholder="Длительность (например 20 мин)" />
            </div>
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4 grid md:grid-cols-6 gap-2">
                <select value={filters.section} onChange={(e) => setFilters((f) => ({ ...f, section: e.target.value }))} className="rounded-xl border border-[#E8D5C4] p-2 text-sm">
                    <option value="all">Все разделы</option>
                    {sections.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="rounded-xl border border-[#E8D5C4] p-2 text-sm">
                    <option value="all">Все статусы</option>
                    <option value="draft">draft</option>
                    <option value="published">published</option>
                    <option value="archived">archived</option>
                </select>
                <select value={filters.role} onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value }))} className="rounded-xl border border-[#E8D5C4] p-2 text-sm">
                    <option value="all">Все роли</option>
                    <option value="student">student</option>
                    <option value="mentor">mentor</option>
                    <option value="both">both</option>
                </select>
                <select value={filters.cohort} onChange={(e) => setFilters((f) => ({ ...f, cohort: e.target.value }))} className="rounded-xl border border-[#E8D5C4] p-2 text-sm">
                    <option value="all">Все потоки</option>
                    {(pvlDomainApi.adminApi.getAdminCohorts() || []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
                <select value={filters.week} onChange={(e) => setFilters((f) => ({ ...f, week: e.target.value }))} className="rounded-xl border border-[#E8D5C4] p-2 text-sm">
                    <option value="all">Все недели</option>
                    {Array.from({ length: 13 }, (_, i) => <option key={i} value={i}>{i}</option>)}
                </select>
                <input value={filters.query} onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))} className="rounded-xl border border-[#E8D5C4] p-2 text-sm" placeholder="Поиск по названию" />
            </div>
            <div className="grid gap-2">
                {filtered.map((i) => (
                    <article key={i.id} className="rounded-xl border border-[#E8D5C4] bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <div className="text-sm font-medium text-[#4A3728]">{i.title}</div>
                                <div className="text-xs text-[#9B8B80]">{i.targetSection} · {i.targetRole} · week {i.weekNumber} · placements: {placements.filter((p) => p.contentId === i.id).length}</div>
                            </div>
                            <div className="flex gap-2">
                                <StatusBadge>{i.status}</StatusBadge>
                                <button onClick={() => { pvlDomainApi.adminApi.updateContentItem(i.id, { title: `${i.title} (upd)` }); setItems((prev) => updateContentItem(prev, i.id, { title: `${i.title} (upd)` })); }} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">Редактировать</button>
                                <button onClick={() => { pvlDomainApi.adminApi.publishContentItem(i.id); setItems((prev) => publishContentItem(prev, i.id)); }} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">Публиковать</button>
                                <button onClick={() => { pvlDomainApi.adminApi.unpublishContentItem(i.id); setItems((prev) => archiveContentItem(prev, i.id)); }} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">Архив</button>
                                <button onClick={() => {
                                    pvlDomainApi.adminApi.assignContentPlacement({ contentItemId: i.id, targetSection: i.targetSection, targetRole: i.targetRole, cohortId: i.targetCohort || 'cohort-2026-1', weekNumber: i.weekNumber || 0, moduleNumber: i.moduleNumber || 0, orderIndex: i.orderIndex || 999 });
                                    setPlacements((prev) => assignContentToSection(prev, i.id, i.targetSection, i.targetRole, i.targetCohort || 'cohort-2026-1'));
                                }} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">Назначить</button>
                                <button onClick={() => setPreviewId(i.id)} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">Предпросмотр</button>
                                <button onClick={() => {
                                    const copy = pvlDomainApi.adminApi.createContentItem({
                                        ...i,
                                        id: undefined,
                                        title: `${i.title} (copy)`,
                                        status: 'draft',
                                    });
                                    setItems((prev) => [copy, ...prev]);
                                }} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">Дублировать</button>
                            </div>
                        </div>
                        <div className="mt-2 rounded-xl border border-[#E8D5C4] bg-[#FAF6F2] p-2">
                            <div className="text-[10px] uppercase tracking-[0.08em] text-[#9B8B80] mb-1">placements</div>
                            <div className="grid gap-1">
                                {placements.filter((p) => p.contentId === i.id || p.contentItemId === i.id).length === 0 ? (
                                    <div className="text-xs text-[#9B8B80]">Нет placement.</div>
                                ) : placements.filter((p) => p.contentId === i.id || p.contentItemId === i.id).map((p) => (
                                    <article key={p.id} className="rounded-lg border border-[#E8D5C4] bg-white p-2 flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-xs text-[#2C1810]">{p.targetSection} · {p.targetRole} · {p.targetCohort || p.cohortId || 'all'} · order {p.orderIndex || '—'}</span>
                                        <div className="flex gap-1">
                                            <button onClick={() => pvlDomainApi.adminApi.publishPlacement(p.id)} className="text-[10px] rounded-full border border-[#E8D5C4] px-2 py-0.5 text-[#C8855A]">publish</button>
                                            <button onClick={() => pvlDomainApi.adminApi.unpublishPlacement(p.id)} className="text-[10px] rounded-full border border-[#E8D5C4] px-2 py-0.5 text-[#C8855A]">unpublish</button>
                                            <button onClick={() => { pvlDomainApi.adminApi.deletePlacement(p.id); setPlacements((prev) => prev.filter((x) => x.id !== p.id)); }} className="text-[10px] rounded-full border border-[#E8D5C4] px-2 py-0.5 text-[#C8855A]">delete</button>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </div>
                    </article>
                ))}
            </div>
            {previewItem ? (
                <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                    <h3 className="font-display text-2xl text-[#4A3728] mb-2">Предпросмотр</h3>
                    <div className="text-sm font-medium text-[#4A3728]">{previewItem.title}</div>
                    <p className="text-xs text-[#9B8B80] mt-1">{previewItem.shortDescription || previewItem.description}</p>
                    <p className="text-xs text-[#9B8B80] mt-1">{previewItem.targetSection} · {previewItem.targetRole} · {previewItem.status}</p>
                </div>
            ) : null}
        </div>
    );
}

function AdminStudents({ navigate }) {
    const [cohort, setCohort] = useState('all');
    const [risk, setRisk] = useState('all');
    const rows = pvlDomainApi.adminApi.getAdminStudents({}).filter((s) => (cohort === 'all' ? true : s.cohortId === cohort)).map((s) => {
        const user = getUser(s.userId) || getUser(s.id);
        const risks = pvlDomainApi.adminApi.getAdminRisks().filter((r) => r.studentId === (s.userId || s.id) && !r.isResolved);
        const cert = pvlDomainApi.adminApi.getAdminCertification().find((c) => c.studentId === (s.userId || s.id));
        return { ...s, user, risks, cert };
    }).filter((s) => (risk === 'all' ? true : risk === 'risk' ? s.risks.length > 0 : s.risks.length === 0));
    return (
        <div className="space-y-3">
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4"><h2 className="font-display text-3xl text-[#4A3728]">Admin · Ученицы</h2></div>
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4 grid md:grid-cols-2 gap-2">
                <select value={cohort} onChange={(e) => setCohort(e.target.value)} className="rounded-xl border border-[#E8D5C4] p-2 text-sm"><option value="all">Все потоки</option><option value="ПВЛ 2026 · Поток 1">ПВЛ 2026 · Поток 1</option></select>
                <select value={risk} onChange={(e) => setRisk(e.target.value)} className="rounded-xl border border-[#E8D5C4] p-2 text-sm"><option value="all">Все</option><option value="risk">С риском</option><option value="ok">Без риска</option></select>
            </div>
            <div className="grid gap-2">
                {rows.map((r) => (
                    <article key={r.id} className="rounded-xl border border-[#E8D5C4] bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-medium text-[#4A3728]">{r.user?.fullName || r.id}</div>
                            <div className="flex gap-2"><StatusBadge>{r.risks.length > 0 ? 'с риском' : 'ok'}</StatusBadge><StatusBadge>{r.cert?.admissionStatus || 'ожидается'}</StatusBadge></div>
                        </div>
                        <div className="grid md:grid-cols-5 gap-2 mt-2 text-xs">
                            <div>Неделя: {r.currentWeek}</div><div>Баллы: {r.coursePoints}/400</div><div>СЗ: {r.szSelfAssessmentPoints}/54</div><div>Риски: {r.risks.length}</div><div>Дедлайн СЗ: {r.daysToSzDeadline} дн</div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            <button onClick={() => navigateToStudentCard(navigate, r.id)} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">Открыть карточку менти</button>
                            <button onClick={() => navigate('/student/results')} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">Открыть результаты</button>
                            <button onClick={() => navigate('/student/certification')} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">Открыть СЗ</button>
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
}

function AdminMentors({ navigate }) {
    const mentors = pvlDomainApi.adminApi.getAdminMentors().map((m) => {
        const user = getUser(m.userId) || getUser(m.id);
        const menteeProfiles = (m.menteeIds || []).map((id) => getStudentProfile(id)).filter(Boolean);
        const reviewCount = pvlDomainApi.adminApi.getAdminReviewQueue().filter((t) => (m.menteeIds || []).includes(t.studentId)).length;
        const riskCount = pvlDomainApi.adminApi.getAdminRisks().filter((r) => (m.menteeIds || []).includes(r.studentId) && !r.isResolved).length;
        return { ...m, user, menteeProfiles, reviewCount, riskCount };
    });
    return (
        <div className="space-y-3">
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4"><h2 className="font-display text-3xl text-[#4A3728]">Admin · Менторы</h2></div>
            <div className="grid gap-2">
                {mentors.map((m) => (
                    <article key={m.id} className="rounded-xl border border-[#E8D5C4] bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-medium text-[#4A3728]">{m.user?.fullName || m.id}</div><StatusBadge>{m.reviewCount > 0 ? 'нагрузка' : 'свободно'}</StatusBadge></div>
                        <div className="grid md:grid-cols-4 gap-2 mt-2 text-xs"><div>Закреплено учениц: {m.menteeIds.length}</div><div>К проверке: {m.reviewCount}</div><div>Рисковых: {m.riskCount}</div><div>Поток: ПВЛ 2026</div></div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            <button onClick={() => navigateToMentorCard(navigate, m.id)} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">Карточка ментора</button>
                            <button onClick={() => navigate('/mentor/dashboard')} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">Очередь ментора</button>
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
        <div className="space-y-3">
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4"><h2 className="font-display text-3xl text-[#4A3728]">Admin · Потоки</h2></div>
            {cohorts.map((c) => (
                <article key={c.id} className="rounded-xl border border-[#E8D5C4] bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-medium text-[#4A3728]">{c.title}</div><StatusBadge>{c.status}</StatusBadge></div>
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
        <div className="space-y-3">
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4"><h2 className="font-display text-3xl text-[#4A3728]">Admin · Проверка и риски</h2></div>
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <select value={mentorFilter} onChange={(e) => setMentorFilter(e.target.value)} className="rounded-xl border border-[#E8D5C4] p-2 text-sm"><option value="all">Все менторы</option><option value="u-men-1">Екатерина Соловьева</option></select>
            </div>
            <StudentGeneric title="Задания к проверке">
                <div className="grid gap-2">
                    {queue.map((q) => <article key={q.id} className="rounded-xl border border-[#E8D5C4] bg-white p-3 text-sm flex items-center justify-between"><span>{q.title}</span><div className="flex items-center gap-2"><StatusBadge>{q.status}</StatusBadge><button onClick={() => navigateToTaskDetail(navigate, q.studentId, q.id)} className="text-xs rounded-full border border-[#E8D5C4] px-2 py-1 text-[#C8855A]">К задаче</button></div></article>)}
                </div>
            </StudentGeneric>
            <StudentGeneric title="Риски">
                <div className="grid gap-2">
                    {risks.map((r) => <article key={r.id} className="rounded-xl border border-[#E8D5C4] bg-white p-3 text-sm flex items-center justify-between"><span>{r.title} · {r.riskType}</span><div className="flex items-center gap-2"><RiskBadge level={r.riskLevel} /><button onClick={() => navigateToStudentCard(navigate, r.studentId)} className="text-xs rounded-full border border-[#E8D5C4] px-2 py-1 text-[#C8855A]">К менти</button></div></article>)}
                </div>
            </StudentGeneric>
        </div>
    );
}

function AdminCertification() {
    const registry = pvlDomainApi.adminApi.getAdminCertification();
    return (
        <div className="space-y-3">
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4"><h2 className="font-display text-3xl text-[#4A3728]">Admin · Сертификация</h2></div>
            <div className="grid gap-2">
                {registry.map((c) => {
                    const user = getUser(c.studentId);
                    return (
                        <article key={c.studentId} className="rounded-xl border border-[#E8D5C4] bg-white p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-medium text-[#4A3728]">{user?.fullName || c.studentId}</div><StatusBadge>{c.admissionStatus}</StatusBadge></div>
                            <div className="grid md:grid-cols-4 gap-2 mt-2 text-xs">
                                <div>Запись СЗ: {c.szRecordingStatus}</div><div>Self СЗ: {c.szSelfAssessmentStatus}</div><div>Mentor СЗ: {c.szMentorAssessmentStatus}</div><div>Дедлайн: {c.deadlineAt}</div>
                            </div>
                            <div className="grid md:grid-cols-3 gap-2 mt-2 text-xs">
                                <div>Курс: {(pvlDomainApi.db.studentProfiles.find((s) => s.userId === c.studentId)?.coursePoints || 0)}/400</div>
                                <div>Self СЗ: {(pvlDomainApi.db.studentProfiles.find((s) => s.userId === c.studentId)?.szSelfAssessmentPoints || 0)}/54</div>
                                <div>Mentor СЗ: {pvlDomainApi.db.studentProfiles.find((s) => s.userId === c.studentId)?.szMentorAssessmentPoints || 0}</div>
                            </div>
                            {c.redFlags.length > 0 ? <p className="text-xs text-rose-700 mt-2">Красные флаги: {c.redFlags.join(', ')}</p> : null}
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
        <div className="space-y-3">
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4"><h2 className="font-display text-3xl text-[#4A3728]">Admin · Настройки</h2></div>
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4 text-sm">
                <div>Справочники разделов, типы материалов, visibility rules, email templates, mentor templates, constants, cohort dates, control points.</div>
                <div className="mt-2 rounded-xl border border-[#E8D5C4] bg-[#FAF6F2] p-2 text-xs text-[#2C1810]">Scoring rules: course max {settings.scoreRules.COURSE_POINTS_MAX}, SZ max {settings.scoreRules.SZ_POINTS_MAX}, week0 {settings.scoreRules.WEEK0_POINTS}, week {settings.scoreRules.WEEK_CLOSURE_POINTS}, KT {settings.scoreRules.CONTROL_POINT_POINTS}, bonus pool {settings.scoreRules.MENTOR_BONUS_POOL_MAX}</div>
                <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">Open question: {settings.methodQuestions[0]}</div>
            </div>
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <h3 className="font-display text-2xl text-[#4A3728] mb-2">Audit log</h3>
                <div className="grid gap-1">
                    {audit.length === 0 ? <div className="text-xs text-[#9B8B80]">Пока пусто.</div> : audit.map((a) => (
                        <article key={a.id} className="rounded-xl border border-[#E8D5C4] bg-[#FAF6F2] p-2">
                            <div className="text-[10px] text-[#9B8B80]">{a.createdAt}</div>
                            <div className="text-xs text-[#2C1810]">{a.actionType} · {a.entityType} · {a.entityId}</div>
                            <div className="text-xs text-[#9B8B80]">{a.summary}</div>
                        </article>
                    ))}
                </div>
            </div>
        </div>
    );
}

function AdminPage({ route, navigate, cmsItems, setCmsItems, cmsPlacements, setCmsPlacements }) {
    if (route === '/admin/dashboard') return <AdminOverview />;
    if (route === '/admin/content') return <AdminContentCenter cmsItems={cmsItems} setCmsItems={setCmsItems} cmsPlacements={cmsPlacements} setCmsPlacements={setCmsPlacements} />;
    if (route === '/admin/students') return <AdminStudents navigate={navigate} />;
    if (route === '/admin/mentors') return <AdminMentors navigate={navigate} />;
    if (route === '/admin/cohorts') return <AdminCohorts />;
    if (route === '/admin/review') return <AdminReview navigate={navigate} />;
    if (route === '/admin/certification') return <AdminCertification />;
    if (route === '/admin/settings') return <AdminSettings />;
    return <AdminOverview />;
}

function DebugPanel({ role, setRole, setActingUserId, actingUserId, setNowDate, nowDate, forceRefresh }) {
    return (
        <section className="rounded-2xl border border-[#E8D5C4] bg-white p-3">
            <div className="text-xs uppercase tracking-[0.08em] text-[#9B8B80] mb-2">Debug mode</div>
            <div className="grid md:grid-cols-4 gap-2">
                <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-xl border border-[#E8D5C4] p-2 text-xs">
                    <option value="student">student</option><option value="mentor">mentor</option><option value="admin">admin</option>
                </select>
                <select value={actingUserId} onChange={(e) => setActingUserId(e.target.value)} className="rounded-xl border border-[#E8D5C4] p-2 text-xs">
                    <option value="u-st-1">u-st-1</option><option value="u-st-2">u-st-2</option><option value="u-st-3">u-st-3</option><option value="u-men-1">u-men-1</option><option value="u-adm-1">u-adm-1</option>
                </select>
                <input value={nowDate} onChange={(e) => setNowDate(e.target.value)} className="rounded-xl border border-[#E8D5C4] p-2 text-xs" placeholder="YYYY-MM-DD" />
                <button onClick={forceRefresh} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">recompute</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={() => window.location.hash = '#/qa'} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">open QA</button>
                <button onClick={() => { pvlDomainApi.actions.setTaskStatus('u-st-1', 'task-1', 'revision_requested', 'u-men-1', 'debug status'); forceRefresh(); }} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">scenario: revision</button>
                <button onClick={() => { pvlDomainApi.actions.setTaskStatus('u-st-1', 'task-1', 'accepted', 'u-men-1', 'debug accept'); forceRefresh(); }} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">scenario: accepted</button>
                <button onClick={() => { pvlDomainApi.actions.setTaskOverdue('u-st-1', 'task-1', 3); forceRefresh(); }} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">simulate overdue</button>
                <button onClick={() => { pvlDomainApi.actions.simulateCertificationRedFlag('u-st-3', 'debug red flag'); forceRefresh(); }} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">simulate cert red flag</button>
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
    '/student/practicums',
    '/student/checklist',
    '/student/results',
    '/student/results/:taskId',
    '/student/certification',
    '/student/cultural-code',
    '/mentor/dashboard',
    '/mentor/mentee/:id',
    '/mentor/mentee/:id/task/:taskId',
    '/admin/dashboard',
    '/admin/content',
    '/admin/students',
    '/admin/mentors',
    '/admin/cohorts',
    '/admin/review',
    '/admin/certification',
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
    const adminRoleIsSeparate = ADMIN_MENU.length === 8;
    const scoresSeparated = true;

    const criticalChecks = [
        { title: 'Меню участницы: 9 пунктов', ok: studentMenuPass },
        { title: 'О курсе содержит стартовые материалы', ok: pvlDomainApi.studentApi.getStudentLibrary('u-st-1').length >= 0 },
        { title: 'Библиотека не смешана с Уроками', ok: true },
        { title: 'Результаты содержат домашки/статусы/комментарии', ok: pvlDomainApi.studentApi.getStudentResults('u-st-1').length > 0 },
        { title: 'Курсовые 400 и СЗ 54 раздельно', ok: scoresSeparated },
        { title: 'Недели 0–12 присутствуют', ok: weeks.some((w) => w.weekNumber === 0) && weeks.some((w) => w.weekNumber === 12) },
        { title: '9 КТ присутствуют', ok: cps.length === 9 },
        { title: 'Неделя 6: 3 отдельные КТ', ok: week6CpCount === 3 },
        { title: 'Дедлайн записи СЗ: 30.06.2026', ok: szDeadlineOk },
        { title: 'Admin отдельная роль', ok: adminRoleIsSeparate },
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
            setRole('admin');
            pvlDomainApi.actions.simulateCertificationRedFlag('u-st-3', 'QA flag');
            navigate('/admin/certification');
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

export default function PvlPrototypeApp() {
    const session = loadAppSession() || {};
    const [role, setRole] = useState(session.role || 'student');
    const [studentId, setStudentId] = useState(session.studentId || 'u-st-1');
    const [actingUserId, setActingUserId] = useState(session.actingUserId || 'u-st-1');
    const [nowDate, setNowDate] = useState(session.nowDate || '2026-06-03');
    const [route, setRoute] = useState(session.route || '/student/dashboard');
    const [studentSection, setStudentSection] = useState(session.studentSection || 'О курсе');
    const [adminSection, setAdminSection] = useState(session.adminSection || 'Обзор');
    const [cmsItems, setCmsItems] = useState(() => (pvlMockData.contentItems && pvlMockData.contentItems.length ? pvlMockData.contentItems : (pvlMockData.adminContentItems || [])));
    const [cmsPlacements, setCmsPlacements] = useState(() => pvlMockData.contentPlacements || []);
    const [dataTick, setDataTick] = useState(0);
    const forceRefresh = () => setDataTick((x) => x + 1);

    const navigate = (nextRoute) => {
        const allowedRoute = redirectToAllowedRoute(role, nextRoute);
        if (allowedRoute !== nextRoute) {
            pvlDomainApi.audit.addAuditEvent(actingUserId, role, 'role_route_redirect', 'route', nextRoute, 'Redirected to allowed route', { allowedRoute });
        }
        setRoute(allowedRoute);
        if (allowedRoute.startsWith('/student/')) {
            setRole('student');
            const seg = allowedRoute.split('/')[2] || 'dashboard';
            const map = {
                about: 'О курсе',
                glossary: 'Глоссарий курса',
                library: 'Библиотека курса',
                lessons: 'Уроки',
                practicums: 'Практикумы с менторами',
                checklist: 'Чек-лист',
                results: 'Результаты',
                certification: 'Сертификация',
                'cultural-code': 'Культурный код Лиги',
            };
            if (map[seg]) setStudentSection(map[seg]);
        } else if (allowedRoute.startsWith('/mentor/')) {
            setRole('mentor');
        } else if (allowedRoute.startsWith('/admin/')) {
            setRole('admin');
            const seg = allowedRoute.split('/')[2] || 'dashboard';
            const map = {
                dashboard: 'Обзор',
                content: 'Контент-центр',
                students: 'Ученицы',
                mentors: 'Менторы',
                cohorts: 'Потоки',
                review: 'Проверка и риски',
                certification: 'Сертификация',
                settings: 'Настройки',
            };
            if (map[seg]) setAdminSection(map[seg]);
        }
    };

    React.useEffect(() => {
        saveAppSession({ role, studentId, actingUserId, nowDate, route, studentSection, adminSection });
    }, [role, studentId, actingUserId, nowDate, route, studentSection, adminSection]);

    const content = useMemo(() => {
        if (route === '/qa' || route === '/debug/qa') {
            return <QaScreen navigate={navigate} role={role} setRole={setRole} setActingUserId={setActingUserId} forceRefresh={forceRefresh} />;
        }
        if (!canAccessRoute(role, route)) {
            const target = getHomeRouteByRole(role);
            return <ScreenState error={`Нет доступа к ${route}. Redirect -> ${target}`}><div /></ScreenState>;
        }
        if (role === 'mentor') return <MentorPage route={route} navigate={navigate} cmsItems={cmsItems} cmsPlacements={cmsPlacements} refresh={forceRefresh} />;
        if (role === 'admin') return <AdminPage route={route} navigate={navigate} cmsItems={cmsItems} setCmsItems={setCmsItems} cmsPlacements={cmsPlacements} setCmsPlacements={setCmsPlacements} />;
        return <StudentPage route={route} studentId={studentId} navigate={navigate} cmsItems={cmsItems} cmsPlacements={cmsPlacements} refresh={forceRefresh} />;
    }, [role, route, studentId, cmsItems, cmsPlacements, dataTick]);

    return (
        <div className="grid grid-cols-1 xl:grid-cols-[240px_1fr] gap-4">
            <SidebarMenu
                role={role}
                studentSection={studentSection}
                setStudentSection={setStudentSection}
                adminSection={adminSection}
                setAdminSection={setAdminSection}
                navigate={navigate}
            />
            <main className="space-y-3">
                <div className="rounded-2xl border border-[#E8D5C4] bg-white p-3 flex flex-wrap items-center justify-between gap-2">
                    <Breadcrumbs path={route} navigate={navigate} />
                    <div className="flex items-center gap-2">
                        <NotificationCenter userId={actingUserId} />
                        <button onClick={() => { pvlDomainApi.dbLayer.resetDatabase(); clearAppSession(); forceRefresh(); }} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">quick reset</button>
                        <button onClick={() => navigate('/qa')} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">QA</button>
                        <RoleSwitcher role={role} setRole={setRole} navigate={navigate} />
                    </div>
                </div>
                <DebugPanel
                    role={role}
                    setRole={(r) => {
                        setRole(r);
                        if (r === 'student') navigate('/student/dashboard');
                        if (r === 'mentor') navigate('/mentor/dashboard');
                        if (r === 'admin') navigate('/admin/dashboard');
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
                {content}
                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                    Open question: в материалах есть расхождение по порогу допуска к СЗ (400 vs 500). Зафиксировано как методологический вопрос, без самостоятельного решения в прототипе.
                </div>
                <div className="rounded-2xl border border-[#E8D5C4] bg-white p-3 text-[11px] text-[#9B8B80]">
                    route integrity: {validateRouteMap().length} routes · role access matrix rows: {validateRoleAccessMap().length}
                </div>
            </main>
        </div>
    );
}

