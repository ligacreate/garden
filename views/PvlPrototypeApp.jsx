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

const STUDENT_MENU = ['О курсе', 'Глоссарий курса', 'Библиотека курса', 'Уроки', 'Практикумы с менторами', 'Чек-лист', 'Результаты', 'Сертификация', 'Культурный код Лиги'];

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

const SidebarMenu = ({ role, studentSection, setStudentSection, navigate }) => (
    <aside className="surface-card border border-[#E8D5C4] bg-white p-3 h-fit xl:sticky xl:top-6">
        <h3 className="font-display text-2xl text-[#4A3728] mb-2">{role === 'student' ? 'Кабинет участницы' : 'Зона ментора'}</h3>
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
            <nav className="space-y-1">
                <button onClick={() => navigate('/mentor/dashboard')} className="w-full text-left rounded-xl px-3 py-2 text-sm text-[#9B8B80] hover:bg-[#FAF6F2]">Дашборд ментора</button>
            </nav>
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
    </div>
);

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
    const profile = getStudentProfile(studentId);
    const tasks = getStudentTasks(studentId);
    const risks = getStudentRisks(studentId);
    const cpDone = tasks.filter((t) => t.isControlPoint && t.status === 'принято').length;
    const cpTotal = 9;
    const done = tasks.filter((t) => t.status === 'принято').length;
    const total = tasks.length || 1;
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
                <DashboardWidget title="Курсовые баллы" value={`${profile.coursePoints}/400`} hint="Как получить баллы: недели, КТ, сдача в срок." />
                <DashboardWidget title="Антидолги" value="D+1 · D+3 · D+7 · D+10" hint="Проверяйте просрочки в Результатах." />
            </div>
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
    const [filter, setFilter] = useState('все');
    const tasks = getStudentTasks(studentId).filter((t) => (filter === 'все' ? true : filter === 'контрольные точки' ? t.isControlPoint : t.status === filter));
    return (
        <div className="space-y-3">
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-3xl text-[#4A3728]">Результаты</h2>
                <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-xl border border-[#E8D5C4] p-2 text-sm">
                    <option value="все">все</option><option value="к проверке">к проверке</option><option value="на доработке">на доработке</option><option value="просрочено">просрочено</option><option value="принято">принято</option><option value="контрольные точки">контрольные точки</option>
                </select>
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

function StudentPage({ route, studentId, navigate }) {
    if (route === '/student/dashboard') return <StudentDashboard studentId={studentId} navigate={navigate} />;
    if (route === '/student/results') return <StudentResults studentId={studentId} navigate={navigate} />;
    if (route.startsWith('/student/results/')) return <PvlTaskDetailView role="student" onBack={() => navigate('/student/results')} />;
    if (route === '/student/about') return <StudentGeneric title="О курсе"><div className="rounded-2xl border border-[#E8D5C4] bg-white p-4 text-sm">Онбординг и стартовые материалы встроены сюда, без отдельного «Мой путь».</div></StudentGeneric>;
    if (route === '/student/glossary') return <StudentGeneric title="Глоссарий курса"><div className="grid md:grid-cols-2 gap-3">{pvlMockData.glossaryItems.map((g) => <article key={g.id} className="rounded-2xl border border-[#E8D5C4] bg-white p-4"><h4 className="font-display text-xl text-[#4A3728]">{g.term}</h4><p className="text-sm">{g.definition}</p></article>)}</div></StudentGeneric>;
    if (route === '/student/library') return <StudentGeneric title="Библиотека курса"><div className="grid md:grid-cols-2 gap-3">{pvlMockData.libraryItems.map((l) => <article key={l.id} className="rounded-2xl border border-[#E8D5C4] bg-white p-4"><div className="text-xs text-[#9B8B80]">{l.category}</div><h4 className="text-sm font-medium text-[#4A3728]">{l.title}</h4><p className="text-xs text-[#9B8B80]">{l.contentType} · {l.duration}</p></article>)}</div></StudentGeneric>;
    if (route === '/student/lessons') return <StudentGeneric title="Уроки"><div className="grid gap-2">{pvlMockData.courseWeeks.map((w) => <article key={w.weekNumber} className="rounded-xl border border-[#E8D5C4] bg-white p-3 text-sm">Неделя {w.weekNumber}: {w.title} · дедлайн {w.deadlineAt}</article>)}</div></StudentGeneric>;
    if (route === '/student/practicums') return <StudentGeneric title="Практикумы с менторами"><div className="grid gap-2">{pvlMockData.mentorMeetings.filter((m) => m.studentId === studentId).map((m) => <article key={m.id} className="rounded-xl border border-[#E8D5C4] bg-white p-3 text-sm">{m.title} · {m.scheduledAt} · <StatusBadge>{m.status}</StatusBadge></article>)}</div></StudentGeneric>;
    if (route === '/student/checklist') return <StudentGeneric title="Чек-лист"><div className="rounded-2xl border border-[#E8D5C4] bg-white p-4 text-sm">Маршрут прохождения с обязательными точками, просрочками и впереди стоящими шагами.</div></StudentGeneric>;
    if (route === '/student/certification') {
        const cert = getStudentCertification(studentId);
        return <StudentGeneric title="Сертификация"><div className="rounded-2xl border border-[#E8D5C4] bg-white p-4 text-sm">Курсовые баллы: {getStudentProfile(studentId).coursePoints}/400 · СЗ: {getStudentProfile(studentId).szSelfAssessmentPoints}/54 · Дедлайн записи СЗ: {cert?.deadlineAt || '2026-06-30'}</div></StudentGeneric>;
    }
    if (route === '/student/cultural-code') return <StudentGeneric title="Культурный код Лиги"><div className="grid md:grid-cols-2 gap-3">{['Бережность', 'Ясность', 'Без советов', 'Поддержка сообщества'].map((x) => <article key={x} className="rounded-xl border border-[#E8D5C4] bg-white p-3 text-sm">{x}</article>)}</div></StudentGeneric>;
    return <StudentDashboard studentId={studentId} navigate={navigate} />;
}

function MentorDashboard({ navigate }) {
    const menteeIds = pvlMockData.mentorProfiles[0].menteeIds;
    const mentees = menteeIds.map((id) => ({ user: getUser(id), profile: getStudentProfile(id), tasks: getStudentTasks(id), risks: getStudentRisks(id) }));
    const queue = pvlMockData.homeworkTasks.filter((t) => t.status === 'к проверке' || t.status === 'на доработке');
    return (
        <div className="space-y-3">
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4"><h2 className="font-display text-3xl text-[#4A3728]">Дашборд ментора</h2></div>
            <div className="grid md:grid-cols-4 gap-3">
                <DashboardWidget title="Всего менти" value={mentees.length} />
                <DashboardWidget title="Активных проверок" value={queue.length} />
                <DashboardWidget title="Менти в риске" value={mentees.filter((m) => m.risks.length > 0).length} />
                <DashboardWidget title="Просроченных ДЗ" value={pvlMockData.homeworkTasks.filter((t) => t.status === 'просрочено').length} />
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
                    {pvlMockData.deadlineRisks.map((r) => (
                        <article key={r.id} className="rounded-xl border border-[#E8D5C4] bg-white p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span>{r.title} · {r.riskType}</span>
                            <RiskBadge level={r.riskLevel} />
                            <button onClick={() => navigate(`/mentor/mentee/${r.studentId}/task/${r.relatedTaskId}`)} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A]">Открыть</button>
                        </article>
                    ))}
                </div>
            </StudentGeneric>
        </div>
    );
}

function MentorPage({ route, navigate }) {
    if (route === '/mentor/dashboard') return <MentorDashboard navigate={navigate} />;
    if (/^\/mentor\/mentee\/[^/]+\/task\/[^/]+$/.test(route)) {
        const [, , , menteeId] = route.split('/');
        return <PvlTaskDetailView role="mentor" onBack={() => navigate(`/mentor/mentee/${menteeId}`)} />;
    }
    if (/^\/mentor\/mentee\/[^/]+$/.test(route)) {
        const [, , , menteeId] = route.split('/');
        return <PvlMenteeCardView menteeId={menteeId} onBack={() => navigate('/mentor/dashboard')} />;
    }
    return <MentorDashboard navigate={navigate} />;
}

export default function PvlPrototypeApp() {
    const [role, setRole] = useState('student');
    const [studentId] = useState('u-st-1');
    const [route, setRoute] = useState('/student/dashboard');
    const [studentSection, setStudentSection] = useState('О курсе');

    const navigate = (nextRoute) => {
        setRoute(nextRoute);
        if (nextRoute.startsWith('/student/')) {
            setRole('student');
            const seg = nextRoute.split('/')[2] || 'dashboard';
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
        } else if (nextRoute.startsWith('/mentor/')) {
            setRole('mentor');
        }
    };

    const content = useMemo(() => {
        if (role === 'mentor') return <MentorPage route={route} navigate={navigate} />;
        return <StudentPage route={route} studentId={studentId} navigate={navigate} />;
    }, [role, route, studentId]);

    return (
        <div className="grid grid-cols-1 xl:grid-cols-[240px_1fr] gap-4">
            <SidebarMenu role={role} studentSection={studentSection} setStudentSection={setStudentSection} navigate={navigate} />
            <main className="space-y-3">
                <div className="rounded-2xl border border-[#E8D5C4] bg-white p-3 flex flex-wrap items-center justify-between gap-2">
                    <Breadcrumbs path={route} navigate={navigate} />
                    <RoleSwitcher role={role} setRole={setRole} navigate={navigate} />
                </div>
                {content}
                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                    Open question: в материалах есть расхождение по порогу допуска к СЗ (400 vs 500). Зафиксировано как методологический вопрос, без самостоятельного решения в прототипе.
                </div>
            </main>
        </div>
    );
}

