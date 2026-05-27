import React, { useEffect, useState } from 'react';
import { pvlPostgrestApi } from '../services/pvlPostgrestApi';
import { pvlDomainApi } from '../services/pvlMockApi';

function resolvePeerDisplayName(peerId) {
    if (!peerId) return '';
    const u = pvlDomainApi.db.users.find((x) => String(x.id) === String(peerId));
    return String(u?.fullName || u?.name || u?.email || peerId).trim();
}

export default function PvlPeerProfileView({ peerId, navigate, viewerRole = 'student' }) {
    const [sessions, setSessions] = useState([]);
    const [feedbackCounts, setFeedbackCounts] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        pvlPostgrestApi.listTrainingSessions(peerId)
            .then(async (rows) => {
                if (cancelled) return;
                setSessions(Array.isArray(rows) ? rows : []);
                const counts = {};
                for (const s of rows || []) {
                    // eslint-disable-next-line no-await-in-loop
                    const fb = await pvlPostgrestApi.listTrainingFeedback(s.id);
                    counts[s.id] = (fb || []).length;
                }
                if (!cancelled) {
                    setFeedbackCounts(counts);
                    setError(null);
                }
            })
            .catch((e) => { if (!cancelled) setError(String(e?.message || 'load failed')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [peerId]);

    const peerName = resolvePeerDisplayName(peerId);
    const totalFeedback = Object.values(feedbackCounts).reduce((a, b) => a + b, 0);

    return (
        <div className="space-y-4">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
                {viewerRole === 'student' ? (
                    <button
                        type="button"
                        onClick={() => navigate('/student/cohort')}
                        className="text-xs text-slate-500 hover:text-slate-800 mb-3"
                    >
                        ← К списку когорты
                    </button>
                ) : null}
                <h2 className="font-display text-2xl text-slate-800">{peerName}</h2>
                <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                    Поток 1
                </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
                <h3 className="font-display text-lg text-slate-800 mb-2">Тренировочные завтраки</h3>
                {loading ? (
                    <p className="text-sm text-slate-500">Загружаем сессии…</p>
                ) : error ? (
                    <p className="text-sm text-red-600">Ошибка: {error}</p>
                ) : (
                    <p className="text-sm text-slate-600">
                        {sessions.length} {sessions.length === 1 ? 'сессия' : 'сессий'},
                        {' '}{totalFeedback} {totalFeedback === 1 ? 'отзыв' : 'отзывов'}
                    </p>
                )}
                <p className="mt-4 text-xs text-slate-400">
                    Здесь будут тренировочные завтраки и отзывы — наполнение в Сессии 3.
                </p>
            </div>
        </div>
    );
}
