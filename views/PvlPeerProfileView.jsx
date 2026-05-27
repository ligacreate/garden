import React from 'react';
import { pvlDomainApi } from '../services/pvlMockApi';
import PvlTrainingSessionBlock from '../components/PvlTrainingSessionBlock';

function resolvePeerDisplayName(peerId) {
    if (!peerId) return '';
    const u = pvlDomainApi.db.users.find((x) => String(x.id) === String(peerId));
    return String(u?.fullName || u?.name || u?.email || peerId).trim();
}

export default function PvlPeerProfileView({
    peerId,
    navigate,
    viewerRole = 'student',
    viewerId = null,
    isMentorOfPeer = false,
}) {
    const peerName = resolvePeerDisplayName(peerId);

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
                viewerId={viewerId}
                viewerRole={viewerRole}
                isMentorOfStudent={isMentorOfPeer}
            />
        </div>
    );
}
