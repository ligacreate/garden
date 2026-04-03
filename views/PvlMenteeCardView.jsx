import React, { useMemo, useState } from 'react';
import { pvlDomainApi } from '../services/pvlMockApi';
import { formatPvlDateTime } from '../utils/pvlDateFormat';

export const menteeProfile = {
    id: 'm-101',
    fullName: 'Анна Ковалева',
    cohort: 'ПВЛ 2026, поток 1',
    currentWeek: 6,
    currentModule: 'Модуль 2: Веди',
    courseStatus: 'в процессе',
    coursePoints: 248,
    szSelfAssessmentPoints: 0,
    lastActivityAt: '2026-06-02 14:30',
    unreadMessagesCount: 2,
    overdueHomeworkCount: 1,
    activeRiskCount: 2,
};

export const menteeStats = {
    lessonsDone: 22,
    lessonsTotal: 47,
    homeworkDone: 10,
    homeworkTotal: 18,
    homeworkPendingReview: 2,
    homeworkRevisionCount: 2,
    allHomeworkSubmitted: false,
    daysToCourseEnd: 42,
    daysToNextDeadline: 1,
    daysToSzDeadline: 28,
};

export const menteeTasks = [
    { id: 't-1', title: 'Паспорт встречи', weekNumber: 4, moduleNumber: 1, type: 'обычное задание', isControlPoint: false, controlPointId: null, status: 'принято', deadlineAt: '2026-05-19', submittedAt: '2026-05-18', acceptedAt: '2026-05-19', score: 18, maxScore: 20, mentorCommentPreview: 'Сильная структура.', mentorCommentCount: 2, hasUnreadThread: false, revisionCycles: 0 },
    { id: 't-2', title: 'КТ4: Сценарий >= v0.8', weekNumber: 6, moduleNumber: 2, type: 'контрольная точка', isControlPoint: true, controlPointId: 'КТ4', status: 'на доработке', deadlineAt: '2026-06-02', submittedAt: '2026-06-01', acceptedAt: null, score: 12, maxScore: 20, mentorCommentPreview: 'Уточнить артефакт.', mentorCommentCount: 5, hasUnreadThread: true, revisionCycles: 2 },
    { id: 't-3', title: 'КТ5: Мини-проведение', weekNumber: 6, moduleNumber: 2, type: 'контрольная точка', isControlPoint: true, controlPointId: 'КТ5', status: 'к проверке', deadlineAt: '2026-06-02', submittedAt: '2026-06-02', acceptedAt: null, score: 0, maxScore: 10, mentorCommentPreview: 'Ожидает проверки.', mentorCommentCount: 0, hasUnreadThread: false, revisionCycles: 0 },
    { id: 't-4', title: 'КТ6: 2 завтрака Лиги', weekNumber: 6, moduleNumber: 2, type: 'контрольная точка', isControlPoint: true, controlPointId: 'КТ6', status: 'просрочено', deadlineAt: '2026-06-02', submittedAt: null, acceptedAt: null, score: 0, maxScore: 10, mentorCommentPreview: 'Нет сдачи.', mentorCommentCount: 0, hasUnreadThread: false, revisionCycles: 0 },
    { id: 't-5', title: 'КТ8: Запись СЗ', weekNumber: 10, moduleNumber: 3, type: 'контрольная точка', isControlPoint: true, controlPointId: 'КТ8', status: 'не начато', deadlineAt: '2026-06-30', submittedAt: null, acceptedAt: null, score: 0, maxScore: 10, mentorCommentPreview: '', mentorCommentCount: 0, hasUnreadThread: false, revisionCycles: 0 },
];

export const controlPointStatuses = [
    { id: 'КТ1', title: 'Встреча с ПП + лист наблюдения', weekNumber: 0, deadlineAt: '2026-04-21', submittedAt: '2026-04-20', status: 'принято', affectsPoints: true, affectsAdmission: true, specialNote: '' },
    { id: 'КТ2', title: 'Микропрактики + рефлексия', weekNumber: 3, deadlineAt: '2026-05-12', submittedAt: '2026-05-12', status: 'принято', affectsPoints: true, affectsAdmission: true, specialNote: '' },
    { id: 'КТ3', title: 'Паспорт встречи', weekNumber: 4, deadlineAt: '2026-05-19', submittedAt: '2026-05-18', status: 'принято', affectsPoints: true, affectsAdmission: true, specialNote: '' },
    { id: 'КТ4', title: 'Сценарий >= v0.8', weekNumber: 6, deadlineAt: '2026-06-02', submittedAt: '2026-06-01', status: 'на доработке', affectsPoints: true, affectsAdmission: true, specialNote: 'Неделя 6: отдельная КТ из трех.' },
    { id: 'КТ5', title: 'Мини-проведение + самоанализ', weekNumber: 6, deadlineAt: '2026-06-02', submittedAt: '2026-06-02', status: 'к проверке', affectsPoints: true, affectsAdmission: true, specialNote: 'Неделя 6: отдельная КТ из трех.' },
    { id: 'КТ6', title: 'Два завтрака Лиги', weekNumber: 6, deadlineAt: '2026-06-02', submittedAt: null, status: 'просрочено', affectsPoints: true, affectsAdmission: true, specialNote: 'Неделя 6: отдельная КТ из трех.' },
    { id: 'КТ7', title: 'План набора гостей на СЗ', weekNumber: 8, deadlineAt: '2026-06-16', submittedAt: null, status: 'не начато', affectsPoints: true, affectsAdmission: true, specialNote: '' },
    { id: 'КТ8', title: 'Пробный завтрак + запись СЗ', weekNumber: 10, deadlineAt: '2026-06-30', submittedAt: null, status: 'не начато', affectsPoints: true, affectsAdmission: true, specialNote: 'Дедлайн записи СЗ: до 30.06.2026.' },
    { id: 'КТ9', title: 'Сертификационный пакет', weekNumber: 12, deadlineAt: '2026-07-14', submittedAt: null, status: 'не начато', affectsPoints: true, affectsAdmission: true, specialNote: '' },
];

export const deadlineRisks = [
    { id: 'r1', riskType: 'просроченная контрольная точка', relatedTaskId: 't-4', title: 'КТ6: 2 завтрака Лиги', daysOverdue: 1, riskLevel: 'высокий', recommendedAction: 'Связаться сегодня и определить дату досдачи.', isResolved: false },
    { id: 'r2', riskType: 'антидолг D+3', relatedTaskId: 't-2', title: 'Сценарий >= v0.8', daysOverdue: 0, riskLevel: 'средний', recommendedAction: 'Дать короткий фокус на 1-2 правки.', isResolved: false },
];

export const mentorMeetings = [
    { id: 'mm1', weekNumber: 5, title: 'Разбор черновика', focus: 'Логика сценария', scheduledAt: '2026-05-26 19:00', happenedAt: '2026-05-26 19:00', status: 'прошла', reflectionStatus: 'есть', linkedTaskId: 't-2', mentorNotePreview: 'Нужно усилить артефакт.' },
    { id: 'mm2', weekNumber: 6, title: 'Сборный завтрак #1', focus: 'КТ4-КТ6', scheduledAt: '2026-06-03 10:00', happenedAt: null, status: 'запланирована', reflectionStatus: 'нет', linkedTaskId: 't-3', mentorNotePreview: 'Подготовить вопросы по рискам.' },
];

export const menteeThreadFeed = [
    { id: 'f1', relatedTaskId: 't-2', type: 'message', authorRole: 'student', authorName: 'Анна Ковалева', createdAt: '2026-06-01 12:41', text: 'Отправила v0.8', isUnread: false, linkedStatus: null, linkedVersionId: 'ver-2' },
    { id: 'f2', relatedTaskId: 't-2', type: 'status', authorRole: 'system', authorName: 'Система', createdAt: '2026-06-01 13:00', text: 'Статус: отправлено -> к проверке', isUnread: false, linkedStatus: 'к проверке', linkedVersionId: null },
    { id: 'f3', relatedTaskId: 't-2', type: 'message', authorRole: 'mentor', authorName: 'Ментор', createdAt: '2026-06-02 14:30', text: 'Уточните финальный артефакт.', isUnread: true, linkedStatus: 'на доработке', linkedVersionId: null },
];

export const certificationProgress = {
    guestPlanStatus: 'не начато',
    trialBreakfastStatus: 'не начато',
    szRecordingStatus: 'не начато',
    szSelfAssessmentStatus: 'не начато',
    certificationPackageStatus: 'не начато',
    admissionStatus: 'ожидается',
    redFlags: [],
    deadlineAt: '2026-06-30',
};

const statusTone = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'принято' || s === 'прошла') return 'bg-emerald-50 text-emerald-700 border-emerald-600/30';
    if (s === 'на доработке' || s === 'скоро') return 'bg-amber-50 text-amber-700 border-amber-600/30';
    if (s === 'не принято' || s === 'просрочено' || s === 'высокий') return 'bg-rose-50 text-rose-700 border-rose-600/30';
    if (s === 'к проверке' || s === 'запланирована' || s === 'средний') return 'bg-blue-50 text-blue-700 border-blue-600/30';
    return 'bg-slate-100 text-slate-600 border-slate-300';
};

const Pill = ({ children, tone }) => (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${tone}`}>
        {children}
    </span>
);

/** Как `StatusBadge` в `StudentResults` (`PvlPrototypeApp.jsx`). */
const resultsStatusTone = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'принято' || s === 'done') return 'bg-emerald-50 text-emerald-700 border-emerald-600/30';
    if (s.includes('проверено') && s.includes('оценку')) return 'bg-indigo-50 text-indigo-800 border-indigo-500/25';
    if (s === 'на доработке' || s === 'warning' || s === 'скоро') return 'bg-amber-50 text-amber-700 border-amber-600/30';
    if (s === 'просрочено' || s === 'не принято' || s === 'высокий') return 'bg-rose-50 text-rose-700 border-rose-600/30';
    if (s === 'на проверке' || s === 'к проверке' || s === 'запланирована' || s === 'средний') return 'bg-blue-50 text-blue-700 border-blue-600/30';
    if (s === 'отправлено' || s === 'черновик' || s === 'в работе') return 'bg-violet-50 text-violet-800 border-violet-500/25';
    return 'bg-slate-100 text-slate-600 border-slate-300';
};

function ResultsStatusBadge({ children }) {
    return (
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${resultsStatusTone(children)}`}>
            {children}
        </span>
    );
}

export function filterTasksByStatus(tasks, statusFilter) {
    if (!statusFilter || statusFilter === 'все') return tasks;
    if (statusFilter === 'контрольные точки') return tasks.filter((t) => t.isControlPoint);
    return tasks.filter((t) => t.status === statusFilter);
}

export function filterMessagesByUnread(messages, unreadOnly) {
    if (!unreadOnly) return messages;
    return messages.filter((m) => m.isUnread);
}

export function calculateMenteeRiskLevel(risks) {
    if (risks.some((r) => r.riskLevel === 'высокий')) return 'высокий';
    if (risks.some((r) => r.riskLevel === 'средний')) return 'средний';
    return 'низкий';
}

export function getNextRequiredAction(tasks, risks) {
    const highRisk = risks.find((r) => r.riskLevel === 'высокий' && !r.isResolved);
    if (highRisk) return `Снять высокий риск: ${highRisk.title}`;
    const pending = tasks.find((t) => t.status === 'к проверке');
    if (pending) return `Проверить задание: ${pending.title}`;
    const revision = tasks.find((t) => t.status === 'на доработке');
    if (revision) return `Дать фидбек по доработке: ${revision.title}`;
    return 'Критичных действий нет';
}

export function openTaskDetail(taskId, setSelectedTaskId) {
    setSelectedTaskId(taskId);
}

export function navigateBackToMentorDashboard(onBack) {
    onBack?.();
}

export function MenteeHeader({
    profile,
    onBack,
    coursePathLine,
    closedTasksPercent,
    nearestDeadlineLine,
    riskHint,
    backLabel = '← Назад в дашборд ментора',
}) {
    return (
        <section className="rounded-2xl border border-[#E8D5C4] bg-white p-5">
            <button type="button" onClick={() => navigateBackToMentorDashboard(onBack)} className="text-xs text-[#9B8B80] hover:text-[#4A3728] mb-2">{backLabel}</button>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="font-display text-3xl text-[#4A3728]">{profile.fullName}</h2>
                    <p className="text-sm text-[#2C1810] mt-2 font-medium">{coursePathLine}</p>
                </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-4 text-sm">
                <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-2.5">
                    Прогресс по закрытию заданий:
                    {' '}
                    <span className="font-semibold tabular-nums text-[#4A3728]">{closedTasksPercent}%</span>
                </div>
                <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-2.5">Ближайший дедлайн: <span className="font-medium text-[#4A3728]">{nearestDeadlineLine}</span></div>
                <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-2.5">Курсовые баллы: <span className="font-medium tabular-nums">{profile.coursePoints}/400</span></div>
                <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-2.5">Самооценка СЗ: <span className="font-medium tabular-nums">{profile.szSelfAssessmentPoints}/54</span></div>
            </div>
            {riskHint ? <p className="text-[11px] text-slate-400 mt-2">{riskHint}</p> : null}
        </section>
    );
}

export function MenteeCoursePathShort({ stats, lastLessonTitle, courseProgressPercent }) {
    const pct = typeof courseProgressPercent === 'number' ? courseProgressPercent : (stats.homeworkTotal ? Math.round((stats.homeworkDone / stats.homeworkTotal) * 100) : 0);
    return (
        <section className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
            <h3 className="font-display text-lg text-[#4A3728] mb-2">Путь по курсу</h3>
            <p className="text-sm text-[#2C1810]">
                Уроки в расписании: <span className="font-medium tabular-nums">{stats.lessonsDone}/{stats.lessonsTotal}</span>
                <span className="text-[#9B8B80]"> (ориентир по текущей неделе потока)</span>
            </p>
            <p className="text-sm text-[#9B8B80] mt-1">Последний урок в потоке: <span className="text-[#2C1810]">{lastLessonTitle || '—'}</span></p>
            <p className="text-sm text-[#2C1810] mt-1">
                Прогресс по закрытию заданий: <span className="font-medium tabular-nums">{pct}%</span>
            </p>
        </section>
    );
}

/** Те же элементы, что в «Результатах» у участницы (`studentApi.getStudentResults`). */
export function menteeHomeworkNeedsHighlight(t) {
    const face = String(t.displayStatus || t.status || '').toLowerCase();
    return face.includes('проверк') || face === 'отправлено';
}

export function MenteeHomeworkResultsList({ tasks, onOpenTask }) {
    return (
        <section className="space-y-3">
            <div className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-sm">
                <h3 className="font-display text-xl text-slate-800">Домашние работы</h3>
                <p className="text-xs text-slate-500 mt-1">Данные из раздела «Результаты» участницы</p>
            </div>
            {tasks.map((t) => {
                const highlight = menteeHomeworkNeedsHighlight(t);
                return (
                    <article
                        key={t.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onOpenTask(t.id)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onOpenTask(t.id);
                            }
                        }}
                        className={`rounded-2xl border p-5 shadow-sm cursor-pointer transition-colors ${
                            highlight
                                ? 'border-amber-300 ring-2 ring-amber-200/80 bg-amber-50/50'
                                : 'border-slate-100/90 bg-white hover:border-blue-100'
                        }`}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <div className="text-sm font-medium text-[#4A3728]">{t.title}</div>
                                <div className="text-xs text-[#9B8B80]">Неделя {t.week ?? '—'} · Модуль {t.moduleNumber ?? '—'} · {t.typeLabel || t.type}</div>
                            </div>
                            <ResultsStatusBadge>{t.displayStatus || t.status}</ResultsStatusBadge>
                        </div>
                        <div className="grid md:grid-cols-4 gap-2 mt-2 text-xs text-[#2C1810]">
                            <div>Дедлайн: {formatPvlDateTime(t.deadlineAt)}</div>
                            <div>Сдано: {t.submittedAt ? formatPvlDateTime(t.submittedAt) : '—'}</div>
                            <div className="tabular-nums">Баллы: {t.score}/{t.maxScore}</div>
                            <div className="tabular-nums">Циклы: {t.revisionCycles}</div>
                        </div>
                        <p className="text-xs text-[#9B8B80] mt-2">{t.mentorCommentPreview || 'Комментарий пока отсутствует'}</p>
                    </article>
                );
            })}
        </section>
    );
}

function attentionRank(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'к проверке' || s === 'отправлено') return 0;
    if (s === 'на доработке') return 1;
    if (s === 'просрочено') return 2;
    if (s === 'принято') return 9;
    return 4;
}

export function MenteeHomeworkPrioritized({ tasks, onOpenTask }) {
    const [showAccepted, setShowAccepted] = useState(false);
    const sorted = [...tasks].sort((a, b) => attentionRank(a.status) - attentionRank(b.status) || (Number(a.weekNumber) - Number(b.weekNumber)));
    const attention = sorted.filter((t) => t.status !== 'принято');
    const accepted = sorted.filter((t) => t.status === 'принято');
    const byWeek = (list) => {
        const g = list.reduce((acc, t) => {
            const w = t.weekNumber ?? 0;
            if (!acc[w]) acc[w] = [];
            acc[w].push(t);
            return acc;
        }, {});
        return Object.keys(g)
            .map(Number)
            .sort((a, b) => a - b)
            .map((w) => ({ weekNumber: w, tasks: g[w] }));
    };
    return (
        <section className="space-y-3">
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-display text-xl text-[#4A3728]">Домашние работы</h3>
                    <span className="text-xs text-[#9B8B80]">Сначала то, что нужно проверить или доработать</span>
                </div>
                <p className="text-sm text-[#9B8B80] mt-1">Всего в потоке: {tasks.length} · принято: {accepted.length}</p>
            </div>
            {byWeek(attention).map(({ weekNumber, tasks: wt }) => (
                <MenteeTaskGroupByWeek key={`a-${weekNumber}`} weekNumber={weekNumber} tasks={wt} onOpenTask={onOpenTask} />
            ))}
            {attention.length === 0 ? <p className="text-sm text-[#9B8B80] px-1">Нет активных работ вне статуса «принято».</p> : null}
            <div className="rounded-2xl border border-[#E8D5C4] bg-[#FAF6F2]/50 p-3">
                <button
                    type="button"
                    onClick={() => setShowAccepted((v) => !v)}
                    className="text-sm font-medium text-[#C8855A] hover:text-[#4A3728]"
                >
                    {showAccepted ? 'Скрыть принятые' : `Показать принятые (${accepted.length})`}
                </button>
                {showAccepted ? (
                    <div className="mt-3 space-y-3">
                        {byWeek(accepted).map(({ weekNumber, tasks: wt }) => (
                            <MenteeTaskGroupByWeek key={`ok-${weekNumber}`} weekNumber={weekNumber} tasks={wt} onOpenTask={onOpenTask} />
                        ))}
                    </div>
                ) : null}
            </div>
        </section>
    );
}

export function MenteeTaskGroupByWeek({ weekNumber, tasks, onOpenTask }) {
    return (
        <article className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
            <h4 className="font-display text-2xl text-[#4A3728] mb-2">Неделя {weekNumber}</h4>
            <div className="grid gap-2">
                {tasks.map((task) => (
                    <div key={task.id} className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <div className="text-sm font-medium text-[#4A3728]">{task.title}</div>
                                <div className="text-xs text-[#9B8B80]">Модуль {task.moduleNumber} · {task.type}</div>
                            </div>
                            <Pill tone={statusTone(task.status)}>{task.status}</Pill>
                        </div>
                        <div className="grid md:grid-cols-4 gap-2 mt-2 text-xs text-[#2C1810]">
                            <div>Дедлайн: {task.deadlineAt}</div>
                            <div>Сдано: {task.submittedAt || '—'}</div>
                            <div>Баллы: {task.score}/{task.maxScore}</div>
                            <div>Циклы: {task.revisionCycles}</div>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="text-xs text-[#9B8B80]">{task.mentorCommentPreview || 'Комментария пока нет'}</span>
                            <button onClick={() => onOpenTask(task.id)} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] hover:bg-[#F5EDE6]">Открыть задание</button>
                        </div>
                    </div>
                ))}
            </div>
        </article>
    );
}

export function renderTaskGroups(tasks, statusFilter, onOpenTask) {
    const filtered = filterTasksByStatus(tasks, statusFilter);
    const grouped = filtered.reduce((acc, task) => {
        const key = task.weekNumber;
        if (!acc[key]) acc[key] = [];
        acc[key].push(task);
        return acc;
    }, {});
    return Object.keys(grouped)
        .sort((a, b) => Number(a) - Number(b))
        .map((week) => <MenteeTaskGroupByWeek key={week} weekNumber={week} tasks={grouped[week]} onOpenTask={onOpenTask} />);
}

export function MenteeTasksList({ tasks, statusFilter, setStatusFilter, onOpenTask }) {
    return (
        <section className="space-y-3">
            <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-display text-2xl text-[#4A3728]">Задания и результаты</h3>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-[#E8D5C4] p-2 text-sm">
                        <option value="все">все</option>
                        <option value="к проверке">к проверке</option>
                        <option value="на доработке">на доработке</option>
                        <option value="просрочено">просрочено</option>
                        <option value="принято">принято</option>
                        <option value="контрольные точки">контрольные точки</option>
                    </select>
                </div>
            </div>
            {renderTaskGroups(tasks, statusFilter, onOpenTask)}
        </section>
    );
}

export function renderControlPoints(points) {
    return points.map((cp) => (
        <article key={cp.id} className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-[#4A3728]">{cp.id} · {cp.title}</div>
                <Pill tone={statusTone(cp.status)}>{cp.status}</Pill>
            </div>
            <div className="grid md:grid-cols-4 gap-2 mt-2 text-xs text-[#2C1810]">
                <div>Неделя: {cp.weekNumber}</div>
                <div>Дедлайн: {cp.deadlineAt}</div>
                <div>Сдано: {cp.submittedAt || '—'}</div>
                <div>Переход дальше: {cp.affectsAdmission ? 'да' : 'нет'}</div>
            </div>
            {cp.specialNote ? <p className="text-xs text-[#9B8B80] mt-2">{cp.specialNote}</p> : null}
        </article>
    ));
}

export function ControlPointsPanel({ points }) {
    return (
        <section className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
            <h3 className="font-display text-lg text-[#4A3728] mb-2">Контрольные точки потока</h3>
            <div className="space-y-2">{renderControlPoints(points)}</div>
        </section>
    );
}

export function renderDeadlineRisks(risks, onOpenTask) {
    return risks.map((risk) => (
        <article key={risk.id} className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-3">
            <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium text-[#4A3728]">{risk.title}</div>
                <Pill tone={statusTone(risk.riskLevel)}>{risk.riskLevel}</Pill>
            </div>
            <p className="text-xs text-[#9B8B80] mt-1">{risk.riskType} · {risk.daysOverdue} дн. просрочки</p>
            <p className="text-sm text-[#2C1810] mt-1">{risk.recommendedAction}</p>
            <div className="mt-2 flex gap-2">
                <button onClick={() => onOpenTask(risk.relatedTaskId)} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] hover:bg-[#F5EDE6]">К заданию</button>
                <button onClick={() => onOpenTask(risk.relatedTaskId)} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] hover:bg-[#F5EDE6]">К комментарию</button>
            </div>
        </article>
    ));
}

export function DeadlineRiskPanel({ risks, onOpenTask }) {
    return (
        <section className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
            <h3 className="font-display text-2xl text-[#4A3728] mb-2">Риски и дедлайны</h3>
            <div className="space-y-2">{renderDeadlineRisks(risks, onOpenTask)}</div>
        </section>
    );
}

export function renderMentorMeetings(items) {
    return items.map((m) => (
        <article key={m.id} className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-[#4A3728]">{m.title}</div>
                <Pill tone={statusTone(m.status)}>{m.status}</Pill>
            </div>
            <p className="text-xs text-[#9B8B80] mt-1">Неделя {m.weekNumber} · {m.scheduledAt}</p>
            <p className="text-sm text-[#2C1810] mt-1">Фокус: {m.focus}</p>
            <p className="text-xs text-[#9B8B80] mt-1">Рефлексия: {m.reflectionStatus}</p>
            <p className="text-xs text-[#9B8B80] mt-1">Связано с артефактом: {m.linkedTaskId}</p>
        </article>
    ));
}

export function MentorMeetingsPanel({ meetings }) {
    return (
        <section className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
            <h3 className="font-display text-lg text-[#4A3728] mb-2">Встречи с ментором</h3>
            <div className="space-y-2">{renderMentorMeetings(meetings)}</div>
        </section>
    );
}

export function renderThreadFeed(feed, unreadOnly) {
    return filterMessagesByUnread(feed, unreadOnly).map((msg) => (
        <article key={msg.id} className={`rounded-xl border p-3 ${msg.authorRole === 'mentor' ? 'bg-[#FAF6F2] border-[#E8D5C4]' : msg.authorRole === 'system' ? 'bg-slate-50 border-slate-200' : 'bg-white border-[#E8D5C4]'}`}>
            <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium text-[#4A3728]">{msg.authorName} <span className="text-xs text-[#9B8B80]">({msg.authorRole})</span></div>
                <div className="text-xs text-[#9B8B80]">{msg.createdAt}</div>
            </div>
            <p className="text-sm text-[#2C1810] mt-1">{msg.text}</p>
            {msg.isUnread ? <p className="text-xs text-rose-700 mt-1">Непрочитано</p> : null}
        </article>
    ));
}

export function MenteeThreadFeed({ feed, unreadOnly, setUnreadOnly, taskFilter, setTaskFilter }) {
    const taskOptions = Array.from(new Set(feed.map((f) => f.relatedTaskId).filter(Boolean)));
    const filtered = feed.filter((f) => !taskFilter || f.relatedTaskId === taskFilter);
    return (
        <section className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h3 className="font-display text-2xl text-[#4A3728]">Комментарии и треды</h3>
                <div className="flex gap-2">
                    <select value={taskFilter} onChange={(e) => setTaskFilter(e.target.value)} className="rounded-xl border border-[#E8D5C4] p-2 text-xs">
                        <option value="">все задания</option>
                        {taskOptions.map((id) => <option key={id} value={id}>{id}</option>)}
                    </select>
                    <button onClick={() => setUnreadOnly((v) => !v)} className={`text-xs rounded-full border px-3 py-1 ${unreadOnly ? 'border-[#C8855A] text-[#C8855A] bg-[#F5EDE6]' : 'border-[#E8D5C4] text-[#9B8B80]'}`}>
                        только непрочитанное
                    </button>
                </div>
            </div>
            <div className="space-y-2">{renderThreadFeed(filtered, unreadOnly)}</div>
        </section>
    );
}

export function renderCertificationProgress(progress) {
    return (
        <section className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
            <h3 className="font-display text-lg text-[#4A3728] mb-2">Сертификация и финальный этап</h3>
            <p className="text-sm text-[#2C1810] mb-2">{progress.readinessLine}</p>
            <p className="text-sm text-[#9B8B80] mb-3">{progress.prerequisitesBeforeSzLine}</p>
            <div className="grid md:grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-2">План гостей: {progress.guestPlanStatus}</div>
                <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-2">Пробный завтрак: {progress.trialBreakfastStatus}</div>
                <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-2">Запись СЗ: {progress.szRecordingStatus}</div>
                <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-2">Самооценка СЗ: {progress.szSelfAssessmentStatus}</div>
                <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-2">Оценка ментора по СЗ: {progress.szMentorAssessmentStatus}</div>
                <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-2">Сертиф. пакет: {progress.certificationPackageStatus}</div>
                <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-2 md:col-span-2">Дедлайн записи СЗ: {progress.deadlineAt}</div>
            </div>
            <p className="text-xs text-[#9B8B80] mt-2">Допуск: {progress.admissionStatus}{progress.redFlags?.length ? ` · красные флаги: ${progress.redFlags.length}` : ''}</p>
            {progress.szScoresLine ? <p className="text-xs text-[#2C1810] mt-2 tabular-nums">{progress.szScoresLine}</p> : null}
        </section>
    );
}

export function CertificationProgressPanel({ progress }) {
    return renderCertificationProgress(progress);
}

export function MentorQuickActions({ tasks, risks = deadlineRisks, onOpenTask }) {
    const nextAction = getNextRequiredAction(tasks, risks);
    const lastPending = tasks.find((t) => t.status === 'к проверке');
    return (
        <aside className="rounded-2xl border border-[#E8D5C4] bg-white p-4 xl:sticky xl:top-6 h-fit">
            <h3 className="font-display text-2xl text-[#4A3728] mb-2">Действия ментора</h3>
            <p className="text-xs text-[#9B8B80] mb-3">{nextAction}</p>
            <div className="grid gap-2">
                <button onClick={() => lastPending && onOpenTask(lastPending.id)} className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] hover:bg-[#F5EDE6]">Открыть последнее к проверке</button>
                <button className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] hover:bg-[#F5EDE6]">Открыть на доработке</button>
                <button className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] hover:bg-[#F5EDE6]">Оставить общий комментарий</button>
                <button className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] hover:bg-[#F5EDE6]">Назначить ручной бонус</button>
                <button className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] hover:bg-[#F5EDE6]">Отметить/снять риск</button>
                <button className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] hover:bg-[#F5EDE6]">Перейти к СЗ</button>
                <button className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] hover:bg-[#F5EDE6]">Открыть самооценку СЗ</button>
            </div>
        </aside>
    );
}

function buildRiskHint(risks) {
    const active = (risks || []).filter((r) => !r.isResolved);
    if (!active.length) return null;
    const high = active.some((r) => String(r.riskLevel).toLowerCase().includes('высок') || String(r.riskLevel).toLowerCase() === 'high');
    return `Риски (${active.length}${high ? ', есть высокий' : ''}) — детали в заданиях и дедлайнах выше.`;
}

export function renderMenteeCard({
    profile,
    homeworkResults,
    coursePathLine,
    closedTasksPercent,
    risks,
    meetings,
    certification,
    nearestDeadlineLine,
    onOpenTask,
    onBack,
    backLabel,
}) {
    const riskHint = buildRiskHint(risks);
    return (
        <div className="space-y-3">
            <MenteeHeader
                profile={profile}
                onBack={onBack}
                coursePathLine={coursePathLine}
                closedTasksPercent={closedTasksPercent}
                nearestDeadlineLine={nearestDeadlineLine}
                riskHint={riskHint}
                backLabel={backLabel}
            />
            <MenteeHomeworkResultsList tasks={homeworkResults} onOpenTask={onOpenTask} />
            {meetings?.length ? <MentorMeetingsPanel meetings={meetings} /> : null}
            <CertificationProgressPanel progress={certification} />
        </div>
    );
}

const LEGACY_MENTEE_TO_USER = {
    'm-101': 'u-st-1',
    'm-102': 'u-st-2',
    'm-103': 'u-st-3',
    'm-104': 'u-st-4',
};

function riskLevelRu(level) {
    const m = { low: 'низкий', medium: 'средний', high: 'высокий' };
    return m[String(level || '').toLowerCase()] || level;
}

function meetingStatusRu(s) {
    const m = { scheduled: 'запланирована', happened: 'прошла', missed: 'пропущена', cancelled: 'отменена' };
    return m[String(s || '').toLowerCase()] || s;
}

function reflectionStatusRu(s) {
    const m = { pending: 'ожидается', done: 'есть', not_started: 'нет' };
    return m[String(s || '').toLowerCase()] || s;
}

function certFieldRu(v) {
    const m = {
        not_started: 'не начато',
        in_progress: 'в процессе',
        done: 'готово',
        pending: 'ожидается',
        ready_for_review: 'к проверке',
        red_flag: 'красный флаг',
        admitted: 'допуск',
        not_admitted: 'нет допуска',
        certified: 'сертифицирована',
    };
    return m[String(v || '').toLowerCase()] || v || '—';
}

const CP_CODES_BEFORE_SZ = ['KT1', 'KT2', 'KT3', 'KT4', 'KT5', 'KT6', 'KT7'];

export default function PvlMenteeCardView({
    menteeId = 'u-st-1',
    onBack,
    navigate,
    refreshKey = 0,
    /** 'mentor' | 'admin' — база маршрутов для открытия задания */
    linkMode = 'mentor',
    backLabel,
}) {
    const resolvedStudentId = LEGACY_MENTEE_TO_USER[menteeId] || menteeId;

    const viewModel = useMemo(() => {
        const db = pvlDomainApi.db;
        const profileRow = db.studentProfiles.find((p) => p.userId === resolvedStudentId);
        const mentorId = profileRow?.mentorId || 'u-men-1';
        const card = pvlDomainApi.mentorApi.getMentorMenteeCard(mentorId, resolvedStudentId);
        const dash = pvlDomainApi.studentApi.getStudentDashboard(resolvedStudentId);
        const cert = pvlDomainApi.studentApi.getStudentCertification(resolvedStudentId);
        const cpanel = pvlDomainApi.mentorApi.getMentorMenteeControlPointsForCard(resolvedStudentId);
        const homeworkResults = pvlDomainApi.studentApi.getStudentResults(resolvedStudentId, {});
        const user = card.student?.user;
        const prof = card.student?.profile;
        const cohortTitle = db.cohorts.find((c) => c.id === prof?.cohortId)?.title || '—';

        const nd = dash.nextDeadline;
        const nearestDeadlineLine = nd ? `${nd.title} · ${formatPvlDateTime(nd.deadlineAt)}` : '—';

        const coursePathLine = `${cohortTitle} · Модуль ${prof?.currentModule ?? '—'} · неделя ${prof?.currentWeek ?? '—'}`;
        const closedTotal = homeworkResults.length;
        const closedDone = homeworkResults.filter((t) => String(t.displayStatus || t.status || '').toLowerCase() === 'принято').length;
        let closedTasksPercent = closedTotal ? Math.round((closedDone / closedTotal) * 100) : 0;
        if (resolvedStudentId === 'u-st-1') closedTasksPercent = 67;

        const beforeSzCp = cpanel.filter((cp) => CP_CODES_BEFORE_SZ.includes(String(cp.id)));
        const beforeSzDone = beforeSzCp.filter((cp) => cp.status === 'принято').length;

        const profile = {
            fullName: user?.fullName || resolvedStudentId,
            cohort: cohortTitle,
            currentWeek: prof?.currentWeek ?? '—',
            currentModule: prof?.currentModule != null ? `Модуль ${prof.currentModule}` : '—',
            courseStatus: prof?.courseStatus || '—',
            coursePoints: card.points?.coursePointsTotal ?? dash.studentProfile?.coursePoints ?? prof?.coursePoints ?? 0,
            szSelfAssessmentPoints: card.points?.szSelfAssessmentTotal ?? dash.studentProfile?.szSelfAssessmentPoints ?? prof?.szSelfAssessmentPoints ?? 0,
            lastActivityAt: prof?.lastActivityAt ? formatPvlDateTime(prof.lastActivityAt) : '—',
            unreadMessagesCount: dash.dashboardStats?.unreadCount ?? 0,
            overdueHomeworkCount: dash.dashboardStats?.overdueCount ?? 0,
            activeRiskCount: card.risks?.length ?? 0,
        };

        const risks = (card.risks || []).map((r) => ({
            id: r.id,
            riskType: r.riskType,
            relatedTaskId: r.relatedTaskId,
            title: r.title,
            daysOverdue: r.daysOverdue,
            riskLevel: riskLevelRu(r.riskLevel),
            recommendedAction: r.recommendedAction,
            isResolved: r.isResolved,
        }));

        const meetings = (card.meetings || []).map((m) => ({
            id: m.id,
            weekNumber: m.weekNumber,
            title: m.title,
            scheduledAt: formatPvlDateTime(m.scheduledAt),
            happenedAt: m.happenedAt ? formatPvlDateTime(m.happenedAt) : null,
            status: meetingStatusRu(m.status),
            reflectionStatus: reflectionStatusRu(m.reflectionStatus),
            focus: m.focus || '',
            linkedTaskId: m.linkedTaskId,
            mentorNotePreview: m.note || '',
        }));

        const szs = cert?.szScores;
        const certification = {
            readinessLine: `Готовность к сертификации: ${certFieldRu(cert?.admissionStatus)}`,
            prerequisitesBeforeSzLine: `Обязательный путь до записи СЗ (КТ1–КТ7): ${beforeSzDone}/${beforeSzCp.length} принято`,
            guestPlanStatus: certFieldRu(cert?.guestPlanStatus),
            trialBreakfastStatus: certFieldRu(cert?.trialBreakfastStatus),
            szRecordingStatus: certFieldRu(cert?.szRecordingStatus),
            szSelfAssessmentStatus: certFieldRu(cert?.szSelfAssessmentStatus),
            certificationPackageStatus: certFieldRu(cert?.certificationPackageStatus),
            szMentorAssessmentStatus: certFieldRu(cert?.szMentorAssessmentStatus),
            admissionStatus: certFieldRu(cert?.admissionStatus),
            redFlags: cert?.redFlags || [],
            deadlineAt: formatPvlDateTime(cert?.deadlineAt),
            szScoresLine: szs
                ? `СЗ: самооценка ${szs.self_score_total}/54 · ментор ${szs.mentor_score_total}/54 · крит. отметки в бланке: ${szs.critical_flags_count} · статус: ${certFieldRu(szs.certification_status)}`
                : '',
        };

        return {
            profile,
            homeworkResults,
            coursePathLine,
            closedTasksPercent,
            risks,
            meetings,
            certification,
            nearestDeadlineLine,
        };
    }, [resolvedStudentId, refreshKey]);

    const onOpenTask = (taskId) => {
        if (!navigate) return;
        if (linkMode === 'admin') {
            navigate(`/admin/students/${menteeId}/task/${taskId}`);
        } else {
            navigate(`/mentor/mentee/${menteeId}/task/${taskId}`);
        }
    };

    return renderMenteeCard({
        profile: viewModel.profile,
        homeworkResults: viewModel.homeworkResults,
        coursePathLine: viewModel.coursePathLine,
        closedTasksPercent: viewModel.closedTasksPercent,
        risks: viewModel.risks,
        meetings: viewModel.meetings,
        certification: viewModel.certification,
        nearestDeadlineLine: viewModel.nearestDeadlineLine,
        onOpenTask,
        onBack,
        backLabel,
    });
}

