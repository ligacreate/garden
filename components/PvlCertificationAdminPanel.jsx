import React, { useState } from 'react';
import { pvlPostgrestApi } from '../services/pvlPostgrestApi';

// Этап 2 / Сессия 4: admin-only панель возврата стороны на пересдачу (ТЗ _144 §4.5).
// adminRequestRevision PATCH'ит status='revision' (RLS admin-policy); сторона снова
// становится UPDATE-able и сможет отредактировать + отправить заново.

export default function PvlCertificationAdminPanel({ studentId, self, mentor, onChanged }) {
    const [busy, setBusy] = useState(null); // 'self' | 'mentor' | null
    const [error, setError] = useState(null);

    const requestRevision = async (side) => {
        const label = side === 'self' ? 'самооценку ведущей' : 'оценку ментора';
        // eslint-disable-next-line no-alert
        if (typeof window !== 'undefined' && !window.confirm(`Вернуть ${label} на пересдачу? Сторона снова сможет отредактировать и отправить.`)) return;
        setBusy(side);
        setError(null);
        try {
            await pvlPostgrestApi.adminRequestRevision(studentId, side);
            onChanged?.();
        } catch (e) {
            setError(String(e?.message || 'Не удалось вернуть на пересдачу'));
        } finally {
            setBusy(null);
        }
    };

    const selfSubmitted = self?.status === 'submitted';
    const mentorSubmitted = mentor?.status === 'submitted';

    return (
        <div className="rounded-2xl bg-white border border-[#E8D5C4] shadow-sm p-5 space-y-3">
            <h4 className="font-display text-lg text-[#4A3728]">Админ: вернуть на пересдачу</h4>
            <p className="text-xs text-[#7A6758]">
                Доступно для отправленной стороны. После возврата статус станет «revision»,
                и сторона сможет отредактировать и отправить заново.
            </p>
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={!selfSubmitted || busy === 'self'}
                    onClick={() => requestRevision('self')}
                    className="rounded-full border border-[#E8D5C4] px-4 py-1.5 text-sm text-[#4A3728] hover:bg-[#FAF6F2] disabled:opacity-40"
                >
                    {busy === 'self' ? 'Возвращаем…' : 'Вернуть самооценку на пересдачу'}
                </button>
                <button
                    type="button"
                    disabled={!mentorSubmitted || busy === 'mentor'}
                    onClick={() => requestRevision('mentor')}
                    className="rounded-full border border-[#E8D5C4] px-4 py-1.5 text-sm text-[#4A3728] hover:bg-[#FAF6F2] disabled:opacity-40"
                >
                    {busy === 'mentor' ? 'Возвращаем…' : 'Вернуть оценку ментора на пересдачу'}
                </button>
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
    );
}
