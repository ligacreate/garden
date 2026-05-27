import React, { useEffect, useState } from 'react';
import { pvlPostgrestApi } from '../services/pvlPostgrestApi';

export default function PvlMyCohortView({ selfStudentId, navigate, viewerRole = 'student' }) {
    const [peers, setPeers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        pvlPostgrestApi.listMyCohortPeers()
            .then((rows) => {
                if (cancelled) return;
                setPeers(Array.isArray(rows) ? rows : []);
                setError(null);
            })
            .catch((e) => { if (!cancelled) setError(String(e?.message || 'load failed')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [selfStudentId]);

    const myRow = peers.find((p) => p.id === selfStudentId);
    const myCohortId = myRow?.cohort_id || null;
    const peersOfCohort = myCohortId
        ? peers.filter((p) => p.cohort_id === myCohortId && p.id !== selfStudentId)
        : [];

    if (loading) return <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">Загружаем когорту…</div>;
    if (error) return <div className="rounded-2xl bg-white p-6 text-sm text-red-600 shadow-sm">Ошибка: {error}</div>;

    if (!myCohortId) {
        return (
            <div className="rounded-2xl bg-white p-6 shadow-sm">
                <h2 className="font-display text-xl text-slate-800 mb-2">Менти моей когорты</h2>
                <p className="text-sm text-slate-500">Когорта не назначена, обратитесь к админу.</p>
            </div>
        );
    }

    return (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="font-display text-xl text-slate-800 mb-1">Менти моей когорты</h2>
            <div className="text-xs text-slate-400 mb-4">Поток 1</div>
            {peersOfCohort.length === 0 ? (
                <p className="text-sm text-slate-500">В когорте пока никого, кроме вас.</p>
            ) : (
                <ul className="space-y-2">
                    {peersOfCohort.map((p) => (
                        <li key={p.id}>
                            <button
                                type="button"
                                onClick={() => navigate(`/${viewerRole}/peer/${p.id}`)}
                                className="text-left w-full rounded-xl px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                            >
                                {p.full_name || p.id}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <p className="mt-6 text-xs text-slate-400">Здесь будут карточки — стиль в Сессии 3.</p>
        </div>
    );
}
