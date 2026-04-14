import React, { useState } from 'react';
import PvlMenteeCardView from './PvlMenteeCardView';

export const mentorMentees = [];

export const reviewQueue = [];

export const deadlineRisks = [];

export function statusBadge(status) {
    const value = String(status || '').toLowerCase();
    if (value === 'принято') return 'bg-emerald-50 text-emerald-700 border-emerald-600/30';
    if (value === 'на доработке') return 'bg-amber-50 text-amber-700 border-amber-600/30';
    if (value === 'не принято') return 'bg-rose-50 text-rose-700 border-rose-600/30';
    if (value === 'к проверке') return 'bg-blue-50 text-blue-700 border-blue-600/30';
    if (value === 'не сдано') return 'bg-rose-50 text-rose-700 border-rose-600/30';
    if (value === 'проведена') return 'bg-emerald-50 text-emerald-700 border-emerald-600/30';
    if (value === 'не проведена') return 'bg-slate-100 text-slate-600 border-slate-300';
    return 'bg-slate-100 text-slate-600 border-slate-300';
}

export function riskBadge(riskType) {
    const value = String(riskType || '').toLowerCase();
    if (value.includes('контроль')) return 'bg-rose-50 text-rose-700 border-rose-600/30';
    if (value.includes('антидолг')) return 'bg-rose-50 text-rose-700 border-rose-600/30';
    if (value.includes('недел')) return 'bg-amber-50 text-amber-700 border-amber-600/30';
    return 'bg-slate-100 text-slate-600 border-slate-300';
}

export function navigateToMenteeCard(id, options = {}) {
    const basePath = `/mentor/mentee/${id}`;
    const url = options.focus ? `${basePath}?focus=${encodeURIComponent(options.focus)}` : basePath;
    // Mock navigation hook before router integration
    console.log('[mentor navigation]', { id, url, options });
    window.location.hash = url;
}

export function renderMentorDashboard() {
    const menteesCount = mentorMentees.length;
    const activeReviews = reviewQueue.length;
    const atRiskMentees = new Set(deadlineRisks.map((r) => r.menteeId)).size;
    const totalOverdueHw = mentorMentees.reduce((sum, m) => sum + m.overdueHomeworks, 0);
    return { menteesCount, activeReviews, atRiskMentees, totalOverdueHw };
}

const Pill = ({ children, tone }) => (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${tone}`}>
        {children}
    </span>
);

export default function MentorDashboardView() {
    const [selectedMenteeId, setSelectedMenteeId] = useState(null);
    const summary = renderMentorDashboard();

    if (selectedMenteeId) {
        return (
            <PvlMenteeCardView
                menteeId={selectedMenteeId}
                onBack={() => setSelectedMenteeId(null)}
            />
        );
    }

    return (
        <div className="space-y-4">
            <section className="surface-card p-5 border border-[#E8D5C4] bg-white">
                <h2 className="font-display text-3xl text-[#4A3728] mb-1">ЛК ментора</h2>
                <p className="text-sm text-[#9B8B80] mb-4">Сводка по менти, проверкам и рискам. Переходы подготовлены на карточку менти.</p>
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                    <div className="rounded-2xl border border-[#E8D5C4] bg-[#FAF6F2] p-3">
                        <div className="font-display text-4xl leading-none text-[#C8855A]">{summary.menteesCount}</div>
                        <div className="text-[11px] text-[#9B8B80] uppercase tracking-[0.08em] mt-1">Всего менти</div>
                    </div>
                    <div className="rounded-2xl border border-[#E8D5C4] bg-[#FAF6F2] p-3">
                        <div className="font-display text-4xl leading-none text-[#C8855A]">{summary.activeReviews}</div>
                        <div className="text-[11px] text-[#9B8B80] uppercase tracking-[0.08em] mt-1">Активных проверок</div>
                    </div>
                    <div className="rounded-2xl border border-[#E8D5C4] bg-[#FAF6F2] p-3">
                        <div className="font-display text-4xl leading-none text-[#C8855A]">{summary.atRiskMentees}</div>
                        <div className="text-[11px] text-[#9B8B80] uppercase tracking-[0.08em] mt-1">Менти в риске</div>
                    </div>
                    <div className="rounded-2xl border border-[#E8D5C4] bg-[#FAF6F2] p-3">
                        <div className="font-display text-4xl leading-none text-[#C8855A]">{summary.totalOverdueHw}</div>
                        <div className="text-[11px] text-[#9B8B80] uppercase tracking-[0.08em] mt-1">Просроченных ДЗ</div>
                    </div>
                </div>
            </section>

            <section className="surface-card p-5 border border-[#E8D5C4] bg-white overflow-x-auto">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-display text-2xl text-[#4A3728]">Мои менти</h3>
                    <span className="text-xs text-[#9B8B80]">Курсовые баллы: только шкала до 400</span>
                </div>
                <table className="w-full min-w-[980px] border-separate border-spacing-0">
                    <thead>
                        <tr>
                            {['Менти', 'Неделя', 'Встреча', 'Последняя домашка', 'Статус сдачи', 'Баллы', 'Просрочки', 'Переход'].map((h) => (
                                <th key={h} className="text-left text-[11px] uppercase tracking-[0.08em] text-[#9B8B80] border-b border-[#F5EDE6] p-2">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {mentorMentees.map((m) => (
                            <tr key={m.id} className="hover:bg-[#FAF6F2]">
                                <td className="p-2 border-b border-[#F5EDE6]">
                                    <div className="text-sm font-medium text-[#4A3728]">
                                        {m.fullName}
                                        {m.hasUnreadMessage ? <span className="inline-block w-2 h-2 rounded-full bg-rose-600 ml-2" /> : null}
                                    </div>
                                    <div className="text-xs text-[#9B8B80]">{m.id}</div>
                                </td>
                                <td className="p-2 border-b border-[#F5EDE6] text-sm">{m.currentWeek}</td>
                                <td className="p-2 border-b border-[#F5EDE6]"><Pill tone={statusBadge(m.meetingStatus)}>{m.meetingStatus}</Pill></td>
                                <td className="p-2 border-b border-[#F5EDE6] text-sm">{m.lastHomework}</td>
                                <td className="p-2 border-b border-[#F5EDE6]"><Pill tone={statusBadge(m.lastSubmissionStatus)}>{m.lastSubmissionStatus}</Pill></td>
                                <td className="p-2 border-b border-[#F5EDE6] text-sm">{Math.min(400, m.coursePoints)}</td>
                                <td className="p-2 border-b border-[#F5EDE6] text-sm">{m.overdueHomeworks}</td>
                                <td className="p-2 border-b border-[#F5EDE6]">
                                    <button
                                        onClick={() => {
                                            navigateToMenteeCard(m.id);
                                            setSelectedMenteeId(m.id);
                                        }}
                                        className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] hover:bg-[#F5EDE6]"
                                    >
                                        Открыть карточку
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            <section className="surface-card p-5 border border-[#E8D5C4] bg-white overflow-x-auto">
                <h3 className="font-display text-2xl text-[#4A3728] mb-3">Очередь проверок</h3>
                <table className="w-full min-w-[860px] border-separate border-spacing-0">
                    <thead>
                        <tr>
                            {['Менти', 'Задание', 'Тип', 'Отправка', 'Дедлайн', 'Статус', 'Переход'].map((h) => (
                                <th key={h} className="text-left text-[11px] uppercase tracking-[0.08em] text-[#9B8B80] border-b border-[#F5EDE6] p-2">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {reviewQueue.map((q) => (
                            <tr key={q.id} className="hover:bg-[#FAF6F2]">
                                <td className="p-2 border-b border-[#F5EDE6] text-sm">{q.menteeName}</td>
                                <td className="p-2 border-b border-[#F5EDE6] text-sm">{q.assignmentTitle}</td>
                                <td className="p-2 border-b border-[#F5EDE6] text-sm">{q.assignmentType}</td>
                                <td className="p-2 border-b border-[#F5EDE6] text-sm">{q.submittedAt}</td>
                                <td className="p-2 border-b border-[#F5EDE6] text-sm">{q.deadlineAt}</td>
                                <td className="p-2 border-b border-[#F5EDE6]">
                                    <Pill tone={q.isOverdue ? 'bg-rose-50 text-rose-700 border-rose-600/30' : 'bg-emerald-50 text-emerald-700 border-emerald-600/30'}>
                                        {q.isOverdue ? 'просрочено' : 'в срок'}
                                    </Pill>
                                </td>
                                <td className="p-2 border-b border-[#F5EDE6]">
                                    <button
                                        onClick={() => {
                                            navigateToMenteeCard(q.menteeId, { focus: q.id });
                                            setSelectedMenteeId(q.menteeId);
                                        }}
                                        className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] hover:bg-[#F5EDE6]"
                                    >
                                        Перейти в карточку
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            <section className="surface-card p-5 border border-[#E8D5C4] bg-white">
                <h3 className="font-display text-2xl text-[#4A3728] mb-3">Риски по дедлайнам</h3>
                <div className="grid md:grid-cols-2 gap-3">
                    {deadlineRisks.map((r) => (
                        <article key={r.id} className="rounded-2xl border border-[#E8D5C4] bg-[#FAF6F2] p-3">
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="text-sm font-medium text-[#4A3728]">{r.menteeName}</div>
                                <Pill tone={riskBadge(r.riskType)}>{r.riskType}</Pill>
                            </div>
                            <div className="text-sm text-[#2C1810] mb-2">{r.overdueItem}</div>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-[#9B8B80]">{r.overdueDays} дн. просрочки</span>
                                <button
                                    onClick={() => {
                                        navigateToMenteeCard(r.menteeId);
                                        setSelectedMenteeId(r.menteeId);
                                    }}
                                    className="text-xs rounded-full border border-[#E8D5C4] px-3 py-1 text-[#C8855A] hover:bg-[#F5EDE6]"
                                >
                                    Открыть карточку
                                </button>
                            </div>
                        </article>
                    ))}
                </div>
            </section>
        </div>
    );
}

