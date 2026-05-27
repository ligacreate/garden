import React from 'react';
import { pvlDomainApi } from '../services/pvlMockApi';
import { readGardenCurrentUserFromStorage } from '../services/pvlRoleResolver';
import PvlTrainingSessionBlock from '../components/PvlTrainingSessionBlock';

function resolvePeerDisplayName(peerId) {
    if (!peerId) return '';
    const u = pvlDomainApi.db.users.find((x) => String(x.id) === String(peerId));
    return String(u?.fullName || u?.name || u?.email || peerId).trim();
}

/**
 * Self-id из garden_currentUser в localStorage — синхронный source of truth.
 * Надёжнее async prop viewerId (PvlPrototypeApp ставит studentId в useEffect
 * после mount; на первом render это default 'u-st-1' → кнопка «Я провела»
 * не показывалась на своей странице).
 */
function resolveSelfId(viewerId) {
    try {
        const gu = readGardenCurrentUserFromStorage();
        if (gu?.id != null && String(gu.id) !== '') return String(gu.id);
    } catch {
        /* noop */
    }
    return viewerId != null ? String(viewerId) : null;
}

export default function PvlPeerProfileView({
    peerId,
    navigate,
    viewerRole = 'student',
    viewerId = null,
    isMentorOfPeer = false,
}) {
    const peerName = resolvePeerDisplayName(peerId);
    const effectiveViewerId = resolveSelfId(viewerId);

    return (
        <div className="space-y-4">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
                {viewerRole === 'student' ? (
                    <button
                        type="button"
                        onClick={() => navigate('/student/cohort')}
                        className="text-xs text-slate-500 hover:text-slate-800 mb-3"
                    >
                        ← К списку участниц
                    </button>
                ) : null}
                <h2 className="font-display text-2xl text-slate-800">{peerName}</h2>
                <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                    Поток 1
                </div>
            </div>

            <PvlTrainingSessionBlock
                studentId={peerId}
                viewerId={effectiveViewerId}
                viewerRole={viewerRole}
                isMentorOfStudent={isMentorOfPeer}
            />
        </div>
    );
}
