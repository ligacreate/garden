import React, { useEffect, useState } from 'react';
import { pvlPostgrestApi } from '../services/pvlPostgrestApi';
import { pvlDomainApi } from '../services/pvlMockApi';

function resolveProfile(peerId) {
    return pvlDomainApi.db.users.find((u) => String(u.id) === String(peerId)) || null;
}

function resolveMentorName(peer) {
    if (!peer?.mentor_id) return null;
    const m = pvlDomainApi.db.users.find((u) => String(u.id) === String(peer.mentor_id));
    return m?.fullName || m?.name || null;
}

function getInitials(fullName, peerId) {
    const src = String(fullName || peerId || '??').trim();
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
    return src.slice(0, 2).toUpperCase();
}

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
    }, []);

    if (loading) return <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">Загружаем…</div>;
    if (error) return <div className="rounded-2xl bg-white p-6 text-sm text-red-600 shadow-sm">Ошибка: {error}</div>;

    const visible = viewerRole === 'admin'
        ? peers.filter((p) => p.role === 'applicant' && p.id !== selfStudentId)
        : (function () {
              const me = peers.find((p) => p.id === selfStudentId);
              const cohortId = me?.cohort_id;
              if (!cohortId) return [];
              return peers.filter((p) => p.cohort_id === cohortId && p.id !== selfStudentId);
          })();

    const myCohortMissing = viewerRole === 'student' && !peers.find((p) => p.id === selfStudentId)?.cohort_id;

    return (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="font-display text-xl text-[#4A3728] mb-1">Участницы курса</h2>
            <div className="text-xs text-[#7A6758] mb-4">Поток 1</div>

            {myCohortMissing ? (
                <p className="text-sm text-[#7A6758]">Когорта не назначена, обратитесь к админу.</p>
            ) : visible.length === 0 ? (
                <p className="text-sm text-[#7A6758]">Список пока пуст.</p>
            ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {visible.map((p) => {
                        const u = resolveProfile(p.id);
                        const mentorName = resolveMentorName(p);
                        const initials = getInitials(p.full_name || u?.fullName, p.id);
                        return (
                            <li key={p.id}>
                                <button
                                    type="button"
                                    onClick={() => navigate(`/${viewerRole}/peer/${p.id}`)}
                                    className="text-left w-full rounded-2xl border border-[#E8D5C4] bg-[#FAF6F2] px-4 py-3 hover:bg-white transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        {u?.avatarUrl ? (
                                            <img src={u.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-[#E8D5C4] flex items-center justify-center text-sm text-[#4A3728] font-medium">{initials}</div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="text-sm font-medium text-[#4A3728] truncate">{p.full_name || u?.fullName || p.id}</div>
                                            <div className="text-[11px] text-[#7A6758] truncate">
                                                {mentorName ? `ментор: ${mentorName}` : 'без ментора'}
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
