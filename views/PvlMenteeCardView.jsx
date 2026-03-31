import React, { useMemo, useState } from 'react';
import PvlTaskDetailView from './PvlTaskDetailView';

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

export function MenteeHeader({ profile, riskLevel, onBack }) {
    return (
        <section className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
            <button onClick={() => navigateBackToMentorDashboard(onBack)} className="text-xs text-[#9B8B80] hover:text-[#4A3728] mb-2">← Назад в дашборд ментора</button>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="font-display text-3xl text-[#4A3728]">{profile.fullName}</h2>
                    <p className="text-sm text-[#9B8B80] mt-1">{profile.cohort} · Неделя {profile.currentWeek} · {profile.currentModule}</p>
                </div>
                <button className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] hover:bg-[#F5EDE6]">Написать участнице</button>
            </div>
            <div className="grid md:grid-cols-5 gap-2 mt-3 text-sm">
                <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-2">Статус курса: {profile.courseStatus}</div>
                <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-2">Курсовые баллы: {profile.coursePoints}/400</div>
                <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-2">СЗ: {profile.szSelfAssessmentPoints}/54</div>
                <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-2">Просрочки: {profile.overdueHomeworkCount}</div>
                <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-2 flex items-center justify-between">
                    <span>Риски</span>
                    <Pill tone={statusTone(riskLevel)}>{riskLevel}</Pill>
                </div>
            </div>
        </section>
    );
}

export function MenteeSummaryWidgets({ stats }) {
    return (
        <section className="grid md:grid-cols-2 xl:grid-cols-5 gap-3">
            <article className="rounded-2xl border border-[#E8D5C4] bg-white p-3"><div className="text-[11px] uppercase text-[#9B8B80]">Уроки</div><div className="font-display text-3xl text-[#C8855A]">{stats.lessonsDone}/{stats.lessonsTotal}</div></article>
            <article className="rounded-2xl border border-[#E8D5C4] bg-white p-3"><div className="text-[11px] uppercase text-[#9B8B80]">Домашки</div><div className="font-display text-3xl text-[#C8855A]">{stats.homeworkDone}/{stats.homeworkTotal}</div></article>
            <article className="rounded-2xl border border-[#E8D5C4] bg-white p-3"><div className="text-[11px] uppercase text-[#9B8B80]">К проверке</div><div className="font-display text-3xl text-[#C8855A]">{stats.homeworkPendingReview}</div></article>
            <article className="rounded-2xl border border-[#E8D5C4] bg-white p-3"><div className="text-[11px] uppercase text-[#9B8B80]">На доработке</div><div className="font-display text-3xl text-[#C8855A]">{stats.homeworkRevisionCount}</div></article>
            <article className="rounded-2xl border border-[#E8D5C4] bg-white p-3"><div className="text-[11px] uppercase text-[#9B8B80]">До дедлайна</div><div className="font-display text-3xl text-[#C8855A]">{stats.daysToNextDeadline} дн</div></article>
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
            <h3 className="font-display text-2xl text-[#4A3728] mb-2">Контрольные точки</h3>
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
            <h3 className="font-display text-2xl text-[#4A3728] mb-2">Встречи с ментором</h3>
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
            <h3 className="font-display text-2xl text-[#4A3728] mb-2">Сертификация</h3>
            <div className="grid md:grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-2">План гостей: {progress.guestPlanStatus}</div>
                <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-2">Пробный завтрак: {progress.trialBreakfastStatus}</div>
                <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-2">Запись СЗ: {progress.szRecordingStatus}</div>
                <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-2">Самооценка СЗ: {progress.szSelfAssessmentStatus}</div>
                <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-2">Сертиф. пакет: {progress.certificationPackageStatus}</div>
                <div className="rounded-xl border border-[#F5EDE6] bg-[#FAF6F2] p-2">Дедлайн записи СЗ: {progress.deadlineAt}</div>
            </div>
            <p className="text-xs text-[#9B8B80] mt-2">Статус допуска: {progress.admissionStatus}. Красные флаги: {progress.redFlags.length || 0}.</p>
        </section>
    );
}

export function CertificationProgressPanel({ progress }) {
    return renderCertificationProgress(progress);
}

export function MentorQuickActions({ tasks, onOpenTask }) {
    const nextAction = getNextRequiredAction(tasks, deadlineRisks);
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

export function renderMenteeCard({
    profile,
    stats,
    tasks,
    controlPoints,
    risks,
    meetings,
    feed,
    certification,
    statusFilter,
    setStatusFilter,
    unreadOnly,
    setUnreadOnly,
    taskFilter,
    setTaskFilter,
    onOpenTask,
    onBack,
}) {
    const riskLevel = calculateMenteeRiskLevel(risks);
    return (
        <div className="space-y-3">
            <MenteeHeader profile={profile} riskLevel={riskLevel} onBack={onBack} />
            <MenteeSummaryWidgets stats={stats} />
            <div className="grid xl:grid-cols-[1fr_300px] gap-3 items-start">
                <div className="space-y-3">
                    <MenteeTasksList tasks={tasks} statusFilter={statusFilter} setStatusFilter={setStatusFilter} onOpenTask={onOpenTask} />
                    <ControlPointsPanel points={controlPoints} />
                    <DeadlineRiskPanel risks={risks} onOpenTask={onOpenTask} />
                    <MentorMeetingsPanel meetings={meetings} />
                    <MenteeThreadFeed feed={feed} unreadOnly={unreadOnly} setUnreadOnly={setUnreadOnly} taskFilter={taskFilter} setTaskFilter={setTaskFilter} />
                    <CertificationProgressPanel progress={certification} />
                </div>
                <MentorQuickActions tasks={tasks} onOpenTask={onOpenTask} />
            </div>
            {/* Open questions:
               1) порог допуска к СЗ: 400 или 500
               2) можно ли назначать ручной бонус прямо из карточки менти
               3) нужен ли общий комментарий по менти вне конкретного задания
               4) граница между риском по дедлайну и риском по качеству
               5) выделять ли "встреча не проведена" как отдельный тип риска
            */}
        </div>
    );
}

export default function PvlMenteeCardView({ menteeId = 'm-101', onBack }) {
    const [statusFilter, setStatusFilter] = useState('все');
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [taskFilter, setTaskFilter] = useState('');
    const [selectedTaskId, setSelectedTaskId] = useState(null);

    const profile = useMemo(() => ({ ...menteeProfile, id: menteeId }), [menteeId]);

    if (selectedTaskId) {
        return (
            <PvlTaskDetailView
                role="mentor"
                onBack={() => setSelectedTaskId(null)}
            />
        );
    }

    return renderMenteeCard({
        profile,
        stats: menteeStats,
        tasks: menteeTasks,
        controlPoints: controlPointStatuses,
        risks: deadlineRisks,
        meetings: mentorMeetings,
        feed: menteeThreadFeed,
        certification: certificationProgress,
        statusFilter,
        setStatusFilter,
        unreadOnly,
        setUnreadOnly,
        taskFilter,
        setTaskFilter,
        onOpenTask: (taskId) => openTaskDetail(taskId, setSelectedTaskId),
        onBack,
    });
}

