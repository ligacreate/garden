import React from 'react';
import {
    SZ_ASSESSMENT_CRITICAL,
    SZ_ASSESSMENT_SECTIONS,
    SZ_REFLECTION_PROMPTS,
    SZ_REFLECTION_PROMPTS_MENTOR,
} from '../data/pvlReferenceContent';

// Этап 2 / Сессия 4: read-only сравнение self ↔ mentor (ТЗ _144 §4.5-4.6).
// БЕЗ «уровня»/интерпретации — только сырые суммы X/54 (продуктовое решение по
// порогам в работе; чистая точка расширения — шапка с суммами ниже).
// Подсветка строки критерия мягким тёплым #F7E3C9 при |diff| ≥ 2.

const DIFF_THRESHOLD = 2;

function fmt(n) {
    return typeof n === 'number' ? n : '—';
}

function criticalTextById(id) {
    return SZ_ASSESSMENT_CRITICAL.find((c) => c.id === id)?.text || id;
}

/** props: self/mentor (строки БД или null), peerName */
export default function PvlCertificationCompareView({
    self,
    mentor,
    peerName = '',
}) {
    // Метки колонок ФИКСИРОВАНЫ по роли, одинаковы для всех зрителей:
    // левая — ведущая (оцениваемая менти), правая — ментор. Без «Я/Вы»-логики.
    const selfLabel = peerName ? `Ведущая · ${peerName}` : 'Ведущая';
    const mentorLabel = 'Ментор';
    const mentorFlags = Array.isArray(mentor?.critical_flags) ? mentor.critical_flags : [];
    const mentorRecommendation = mentor?.reflections?.prompt_6 || '';

    return (
        <div className="space-y-4">
            {/* Шапка: имя + статус + две сырые суммы (БЕЗ уровня) */}
            <div className="rounded-2xl bg-white border border-[#E8D5C4] shadow-sm p-5">
                <h3 className="font-display text-xl text-[#4A3728]">{peerName || 'Сертификационный завтрак'}</h3>
                <p className="text-sm text-[#7A6758] mt-1">И менти, и ментор заполнили анкету после сертификационного завтрака. Теперь можно обсудить результаты!</p>
                {/* Точка расширения: сюда отдельной правкой встанет «уровень», когда пороги утвердят. */}
                <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-3 text-center">
                        <div className="text-xs text-[#7A6758]">{selfLabel}</div>
                        <div className="text-2xl font-display text-[#4A3728] tabular-nums">{fmt(self?.score_total)} / 54</div>
                    </div>
                    <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-3 text-center">
                        <div className="text-xs text-[#7A6758]">{mentorLabel}</div>
                        <div className="text-2xl font-display text-[#4A3728] tabular-nums">{fmt(mentor?.score_total)} / 54</div>
                    </div>
                </div>
            </div>

            {/* Баллы по 6 секциям A–F: аккордеоны, пары баллов рядом, маркер при |diff| ≥ 2 */}
            <div className="space-y-3">
                {SZ_ASSESSMENT_SECTIONS.map((sec) => (
                    <details key={sec.letter} open className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
                        <summary className="cursor-pointer select-none px-5 py-3 text-sm font-semibold text-[#4A3728] bg-slate-50/60">
                            {sec.letter}. {sec.name}
                        </summary>
                        <div className="px-5 py-3 space-y-2">
                            {sec.items.map((text, j) => {
                                const key = `${sec.letter}${j + 1}`;
                                const s = self?.criteria_scores?.[key];
                                const m = mentor?.criteria_scores?.[key];
                                const sNum = typeof s === 'number' ? s : null;
                                const mNum = typeof m === 'number' ? m : null;
                                const diff = sNum != null && mNum != null ? Math.abs(sNum - mNum) : null;
                                const flagged = diff != null && diff >= DIFF_THRESHOLD;
                                return (
                                    <div key={key} className={`rounded-lg p-2 ${flagged ? 'bg-[#F7E3C9]' : ''}`}>
                                        <p className="text-sm text-slate-700">{text}</p>
                                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                                            <span className="text-slate-600">{selfLabel}: <span className="font-medium tabular-nums">{fmt(sNum)}</span></span>
                                            <span className="text-slate-600">{mentorLabel}: <span className="font-medium tabular-nums">{fmt(mNum)}</span></span>
                                            {flagged ? <span className="text-xs font-medium text-[#9A6B3F]">расхождение {diff} — обсудить</span> : null}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </details>
                ))}
            </div>

            {/* Рефлексии (Часть А): пары текстов рядом, JOIN по key, без пометок */}
            <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5 space-y-4">
                <h4 className="font-display text-lg text-[#4A3728]">Рефлексия (Часть А)</h4>
                {SZ_REFLECTION_PROMPTS.map((p) => {
                    const mp = SZ_REFLECTION_PROMPTS_MENTOR.find((x) => x.key === p.key);
                    const selfAns = self?.reflections?.[p.key] || '';
                    const mentorAns = mentor?.reflections?.[p.key] || '';
                    return (
                        <div key={p.key} className="border-t border-slate-100 pt-4 first:border-0 first:pt-0">
                            <div className="grid sm:grid-cols-2 gap-3">
                                <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-3">
                                    <div className="text-xs font-medium text-[#7A6758] mb-1">{selfLabel}: {p.q}</div>
                                    <p className="text-sm text-[#4A3728] whitespace-pre-wrap">{selfAns || '—'}</p>
                                </div>
                                <div className="rounded-xl bg-[#FAF6F2] border border-[#F5EDE6] p-3">
                                    <div className="text-xs font-medium text-[#7A6758] mb-1">{mentorLabel}: {mp?.q || p.q}</div>
                                    <p className="text-sm text-[#4A3728] whitespace-pre-wrap">{mentorAns || '—'}</p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Критические условия — показываем ТОЛЬКО если ментор отметила ≥1 флаг; акцент, не блок */}
            {mentorFlags.length > 0 ? (
                <div className="rounded-2xl bg-[#FAF6F2] border border-[#E8D5C4] p-5 space-y-2">
                    <h4 className="font-display text-lg text-[#4A3728]">Акцент для разговора</h4>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-[#4A3728]">
                        {mentorFlags.map((id) => <li key={id}>{criticalTextById(id)}</li>)}
                    </ul>
                    {mentor?.critical_comment ? <p className="text-sm text-[#4A3728] whitespace-pre-wrap mt-2">{mentor.critical_comment}</p> : null}
                </div>
            ) : null}

            {/* Рекомендация ментора — переиспользуем 6-ю рефлексию (отдельного поля нет) */}
            {mentorRecommendation ? (
                <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
                    <h4 className="font-display text-lg text-[#4A3728] mb-1">Рекомендация ментора</h4>
                    <p className="text-sm text-[#4A3728] whitespace-pre-wrap">{mentorRecommendation}</p>
                </div>
            ) : null}
        </div>
    );
}
