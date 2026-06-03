import React, { useEffect, useState } from 'react';
import { pvlPostgrestApi } from '../services/pvlPostgrestApi';
import { formatPvlDateTime } from '../utils/pvlDateFormat';
import ModalShell from './ModalShell';
import PvlTrainingFeedbackList from './PvlTrainingFeedbackList';

const SESSION_LIMIT = 2;

function toLocalDateTimeValue(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function CreateSessionModal({ isOpen, onClose, studentId, onCreated, onLimitExceeded }) {
    const [conductedAt, setConductedAt] = useState(toLocalDateTimeValue(new Date()));
    const [topic, setTopic] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen) {
            setConductedAt(toLocalDateTimeValue(new Date()));
            setTopic('');
            setError(null);
        }
    }, [isOpen]);

    const valid = topic.trim().length >= 1;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!valid || saving) return;
        setSaving(true);
        setError(null);
        try {
            const result = await pvlPostgrestApi.createTrainingSession({
                student_id: studentId,
                conducted_at: new Date(conductedAt).toISOString(),
                scenario_topic: topic.trim(),
            });
            if (result.limitExceeded) {
                onLimitExceeded?.(result.error || `Лимит ${SESSION_LIMIT} достигнут`);
                return;
            }
            if (result.row) {
                onCreated?.(result.row);
            }
        } catch (err) {
            setError(String(err?.message || 'Не удалось создать сессию'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <ModalShell
            isOpen={isOpen}
            onClose={onClose}
            title="Я провела тренировочный завтрак"
            size="md"
            footer={
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="text-sm text-[#7A6758] px-4 py-2">Отмена</button>
                    <button
                        type="submit"
                        form="pvl-training-session-form"
                        disabled={!valid || saving}
                        className="text-sm bg-[#4A3728] text-white rounded-full px-5 py-2 disabled:opacity-50"
                    >
                        {saving ? 'Сохраняем…' : 'Сохранить'}
                    </button>
                </div>
            }
        >
            <form id="pvl-training-session-form" onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-[#4A3728] mb-1">Дата и время</label>
                    <input
                        type="datetime-local"
                        value={conductedAt}
                        onChange={(e) => setConductedAt(e.target.value)}
                        className="w-full rounded-xl border border-[#E8D5C4] bg-[#FAF6F2] px-3 py-2 text-sm text-[#4A3728]"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-[#4A3728] mb-1">Тема сценария встречи <span className="text-red-500">*</span></label>
                    <input
                        type="text"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        className="w-full rounded-xl border border-[#E8D5C4] bg-[#FAF6F2] px-3 py-2 text-sm text-[#4A3728]"
                        placeholder="Что обсуждали"
                    />
                </div>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </form>
        </ModalShell>
    );
}

export default function PvlTrainingSessionBlock({
    studentId,
    viewerId,
    viewerRole,
    isMentorOfStudent = false,
}) {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [toast, setToast] = useState(null);

    const refresh = () => {
        setLoading(true);
        pvlPostgrestApi.listTrainingSessions(studentId)
            .then((rows) => setSessions(Array.isArray(rows) ? rows : []))
            .catch((e) => setError(String(e?.message || 'load failed')))
            .finally(() => setLoading(false));
    };

    useEffect(() => { refresh(); }, [studentId]);

    const isOwnPage = String(viewerId) === String(studentId);
    const canCreate = isOwnPage && sessions.length < SESSION_LIMIT;
    const limitReached = isOwnPage && sessions.length >= SESSION_LIMIT;
    const canSeeAllFeedback = isOwnPage || isMentorOfStudent || viewerRole === 'admin';

    return (
        <section className="rounded-2xl bg-white border border-[#E8D5C4] shadow-sm p-5">
            <header className="flex items-center justify-between mb-4">
                <h3 className="font-display text-lg text-[#4A3728]">Тренировочные завтраки</h3>
                {canCreate ? (
                    <button
                        type="button"
                        onClick={() => setCreateOpen(true)}
                        className="text-sm bg-[#4A3728] text-white rounded-full px-4 py-1.5 hover:opacity-90"
                    >
                        Я провела тренировочный завтрак
                    </button>
                ) : null}
            </header>

            {limitReached ? (
                <p className="text-xs text-[#7A6758] mb-3">
                    Лимит {SESSION_LIMIT} достигнут. Чтобы добавить ещё — обратитесь к админу.
                </p>
            ) : null}

            {loading ? <p className="text-sm text-[#7A6758]">Загружаем сессии…</p> : null}
            {error ? <p className="text-sm text-red-600">Ошибка: {error}</p> : null}
            {!loading && !error && sessions.length === 0 ? (
                <p className="text-sm text-[#7A6758]">Тренировочных завтраков пока нет.</p>
            ) : null}

            <div className="space-y-4">
                {sessions.map((s) => (
                    <article key={s.id} className="rounded-xl border border-[#E8D5C4] bg-[#FAF6F2] p-4">
                        <div className="text-sm font-medium text-[#4A3728]">{formatPvlDateTime(s.conducted_at)}</div>
                        <p className="mt-1 text-sm text-[#4A3728] whitespace-pre-wrap">{s.scenario_topic}</p>
                        <PvlTrainingFeedbackList
                            sessionId={s.id}
                            sessionStudentId={studentId}
                            viewerId={viewerId}
                            viewerRole={viewerRole}
                            canSeeAll={canSeeAllFeedback}
                            isMentorOfStudent={isMentorOfStudent}
                        />
                    </article>
                ))}
            </div>

            <CreateSessionModal
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                studentId={studentId}
                onCreated={(row) => {
                    setSessions((prev) => [row, ...prev].sort((a, b) => (a.conducted_at < b.conducted_at ? 1 : -1)));
                    setCreateOpen(false);
                }}
                onLimitExceeded={(msg) => {
                    setToast(msg);
                    setCreateOpen(false);
                    setTimeout(() => setToast(null), 4000);
                }}
            />

            {toast ? (
                <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-white text-[#4A3728] border border-[#E8D5C4] rounded-full px-5 py-2 shadow-md text-sm">
                    {toast}
                </div>
            ) : null}
        </section>
    );
}
