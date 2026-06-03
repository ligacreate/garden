import React, { useEffect, useState } from 'react';
import { pvlPostgrestApi } from '../services/pvlPostgrestApi';
import { pvlDomainApi } from '../services/pvlMockApi';
import { formatPvlDateTime } from '../utils/pvlDateFormat';
import PvlTrainingFeedbackForm from './PvlTrainingFeedbackForm';

function resolveAuthorName(authorId) {
    if (!authorId) return '';
    const u = pvlDomainApi.db.users.find((x) => String(x.id) === String(authorId));
    return String(u?.fullName || u?.name || u?.email || authorId).trim();
}

const FEEDBACK_RULES = [
    'Безоценочно — про факт, не про человека.',
    'Конкретно — пример, не обобщение.',
    'С опорой на то, что сработало.',
    'Без советов — формулируйте как вопрос или наблюдение.',
];

function FieldLine({ label, text }) {
    if (!text || !text.trim()) return null;
    return (
        <div>
            <div className="text-[11px] uppercase tracking-wide text-[#7A6758]">{label}</div>
            <div className="whitespace-pre-wrap">{text}</div>
        </div>
    );
}

function FeedbackBody({ fb }) {
    return (
        <div className="mt-2 space-y-2 text-sm text-[#4A3728]">
            <FieldLine label="Что сработало" text={fb.text_what_worked} />
            <FieldLine label="Что можно усилить" text={fb.text_what_to_strengthen} />
            <FieldLine label="Приём ведущей" text={fb.text_one_technique} />
            <FieldLine label="Вопрос после встречи" text={fb.text_open_question} />
        </div>
    );
}

export default function PvlTrainingFeedbackList({
    sessionId,
    sessionStudentId,
    viewerId,
    viewerRole,
    canSeeAll,
    isMentorOfStudent = false,
}) {
    const [feedback, setFeedback] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showRules, setShowRules] = useState(false);
    const [showMine, setShowMine] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    const [editTarget, setEditTarget] = useState(null);

    const refresh = () => {
        setLoading(true);
        pvlPostgrestApi.listTrainingFeedback(sessionId)
            .then((rows) => setFeedback(Array.isArray(rows) ? rows : []))
            .catch(() => setFeedback([]))
            .finally(() => setLoading(false));
    };

    useEffect(() => { refresh(); }, [sessionId]);

    const myFeedback = feedback.find((f) => f.author_id === viewerId) || null;
    const isPeerOnly = viewerRole === 'student' && sessionStudentId !== viewerId;
    // Ментор СВОИХ менти может оставить/редактировать свой отзыв (phase44: RLS
    // pvl_training_feedback_insert_mentor через is_mentor_for). Запись держит RLS,
    // здесь — только точка входа в существующую форму. Свой отзыв ментор видит в
    // общем списке (canSeeAll), поэтому отдельный «Мой отзыв»-блок не дублируем.
    const isMentorHere = viewerRole === 'mentor' && isMentorOfStudent;

    return (
        <div className="mt-3 border-t border-[#E8D5C4] pt-3">
            <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-[#4A3728]">Отзывы ({feedback.length})</h4>
                <button
                    type="button"
                    onClick={() => setShowRules((v) => !v)}
                    className="text-[11px] text-[#7A6758] hover:text-[#4A3728]"
                >
                    {showRules ? '−' : '+'} Правила обратной связи
                </button>
            </div>
            {showRules ? (
                <ul className="mb-3 text-[12px] text-[#7A6758] space-y-1 list-disc list-inside">
                    {FEEDBACK_RULES.map((r) => <li key={r}>{r}</li>)}
                </ul>
            ) : null}

            {loading ? <p className="text-xs text-[#7A6758]">Загружаем отзывы…</p> : null}

            {!loading && isPeerOnly ? (
                myFeedback ? (
                    <div>
                        <button type="button" onClick={() => setShowMine((v) => !v)} className="text-sm text-[#4A3728] underline-offset-2 hover:underline">
                            {showMine ? '▾' : '▸'} Мой отзыв
                        </button>
                        {showMine ? <FeedbackBody fb={myFeedback} /> : null}
                        <button
                            type="button"
                            onClick={() => { setEditTarget(myFeedback); setFormOpen(true); }}
                            className="mt-2 ml-3 text-xs text-[#4A3728] underline"
                        >
                            Редактировать
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => { setEditTarget(null); setFormOpen(true); }}
                        className="text-sm bg-[#4A3728] text-white rounded-full px-4 py-1.5"
                    >
                        Оставить отзыв
                    </button>
                )
            ) : null}

            {!loading && isMentorHere ? (
                <div className="mb-3">
                    {myFeedback ? (
                        <button
                            type="button"
                            onClick={() => { setEditTarget(myFeedback); setFormOpen(true); }}
                            className="text-sm text-[#4A3728] underline underline-offset-2 hover:opacity-80"
                        >
                            Редактировать мой отзыв
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => { setEditTarget(null); setFormOpen(true); }}
                            className="text-sm bg-[#4A3728] text-white rounded-full px-4 py-1.5 hover:opacity-90"
                        >
                            Оставить отзыв
                        </button>
                    )}
                </div>
            ) : null}

            {!loading && canSeeAll && feedback.length > 0 ? (
                <ul className="space-y-3">
                    {feedback.map((fb) => (
                        <li key={fb.id} className="rounded-xl bg-[#FAF6F2] border border-[#E8D5C4] p-3">
                            <div className="flex items-baseline justify-between gap-3">
                                <span className="text-sm font-medium text-[#4A3728]">{resolveAuthorName(fb.author_id)}</span>
                                <span className="text-[11px] text-[#7A6758]">{formatPvlDateTime(fb.created_at)}</span>
                            </div>
                            <FeedbackBody fb={fb} />
                        </li>
                    ))}
                </ul>
            ) : null}

            {!loading && canSeeAll && feedback.length === 0 ? (
                <p className="text-xs text-[#7A6758]">Отзывов пока нет.</p>
            ) : null}

            <PvlTrainingFeedbackForm
                isOpen={formOpen}
                onClose={() => setFormOpen(false)}
                sessionId={sessionId}
                authorId={viewerId}
                existingFeedback={editTarget}
                onSaved={() => refresh()}
            />
        </div>
    );
}
