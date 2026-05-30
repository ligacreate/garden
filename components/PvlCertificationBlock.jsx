import React, { useCallback, useEffect, useState } from 'react';
import { pvlPostgrestApi } from '../services/pvlPostgrestApi';
import PvlSzAssessmentFlow from '../views/PvlSzAssessmentFlow';

// Этап 2 / Сессия 3: switcher двустороннего parallel-blind assessment СЗ (ТЗ _144 §4.5).
// ПРАВИЛА ФОКУСА (_167): getCertificationCompare грузим ТОЛЬКО на [studentId];
// рефетч — только по onCommitted (после submit), не во время набора; key wizard'а —
// от mode/studentId, НЕ от refreshKey/status/updated_at (иначе ремаунт сотрёт ввод).

function WaitingCard({ text }) {
    return (
        <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm">
            <h3 className="font-display text-lg text-slate-800 mb-1">Сертификационный завтрак</h3>
            <p className="text-sm text-slate-600">{text}</p>
        </div>
    );
}

// Минимальная заглушка compare — полный PvlCertificationCompareView это Сессия 4.
function CompareStub({ self, mentor, admin }) {
    const selfTotal = typeof self?.score_total === 'number' ? `${self.score_total}/54` : '—';
    const mentorTotal = typeof mentor?.score_total === 'number' ? `${mentor.score_total}/54` : '—';
    return (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-6 shadow-sm space-y-2">
            <h3 className="font-display text-lg text-slate-800">Сертификация: сравнение готовится</h3>
            <p className="text-sm text-slate-600">
                {admin
                    ? 'Обзор для админа. Полное сравнение по критериям и рефлексиям откроется здесь (Сессия 4).'
                    : 'Обе стороны отправили оценки — здесь откроется сравнение по критериям и рефлексиям (готовится).'}
            </p>
            <p className="text-sm text-slate-700">
                Самооценка: <span className="font-medium tabular-nums">{selfTotal}</span>
                {' · '}Ментор: <span className="font-medium tabular-nums">{mentorTotal}</span>
            </p>
            {admin ? (
                <p className="text-xs text-slate-500">
                    Статусы: self — {self?.status || 'нет записи'} · mentor — {mentor?.status || 'нет записи'}.
                </p>
            ) : null}
        </div>
    );
}

export default function PvlCertificationBlock({
    studentId,
    viewerRole = 'student',
    viewerId = null,
    isMentorOfStudent = false,
    peerName = '',
}) {
    const [data, setData] = useState({ self: null, mentor: null });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(() => {
        if (!studentId) { setLoading(false); return; }
        setLoading(true);
        setError(null);
        pvlPostgrestApi.getCertificationCompare(studentId)
            .then((res) => setData({ self: res?.self ?? null, mentor: res?.mentor ?? null }))
            .catch((e) => setError(String(e?.message || 'Не удалось загрузить сертификацию')))
            .finally(() => setLoading(false));
    }, [studentId]);

    // fetch ТОЛЬКО на смену studentId (НЕ на refreshKey/dataTick — правило фокуса)
    useEffect(() => { load(); }, [load]);

    // рефетч только по submit (onCommitted) — не во время набора
    const onCommitted = useCallback(() => { load(); }, [load]);

    // якорь #pvl-certification (отложен из Сессии 2): hash обрабатываем ОТДЕЛЬНО от
    // route-state (его парсер режет split('/')[3]) — читаем window.location.hash,
    // скроллим один раз и чистим hash, чтобы не залипал и не скроллил повторно.
    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        if (window.location.hash !== '#pvl-certification') return undefined;
        const raf = window.requestAnimationFrame(() => {
            document.getElementById('pvl-certification')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* noop */ }
        });
        return () => window.cancelAnimationFrame(raf);
    }, [studentId, loading]);

    const isSelf = viewerId != null && String(viewerId) === String(studentId);
    const isMentor = viewerRole === 'mentor' && isMentorOfStudent;
    const isAdmin = viewerRole === 'admin';

    const { self, mentor } = data;

    let body = null;
    if (loading) {
        body = (
            <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">Загружаем сертификацию…</p>
            </div>
        );
    } else if (error) {
        body = (
            <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm">
                <h3 className="font-display text-lg text-slate-800 mb-1">Сертификационный завтрак</h3>
                <p className="text-sm text-red-600">Ошибка: {error}</p>
            </div>
        );
    } else if (isSelf) {
        if (self?.status !== 'submitted') {
            body = <PvlSzAssessmentFlow key={`self-${studentId}`} mode="self" studentId={studentId} initialData={self} onCommitted={onCommitted} />;
        } else if (mentor?.status === 'submitted') {
            body = <CompareStub self={self} mentor={mentor} />;
        } else {
            body = <WaitingCard text="Самооценка отправлена. Когда ментор отправит свою оценку — здесь откроется сравнение." />;
        }
    } else if (isMentor) {
        if (!mentor || mentor.status !== 'submitted') {
            body = <PvlSzAssessmentFlow key={`mentor-${studentId}`} mode="mentor" studentId={studentId} peerId={studentId} peerName={peerName} initialData={mentor} onCommitted={onCommitted} />;
        } else if (self?.status === 'submitted') {
            body = <CompareStub self={self} mentor={mentor} />;
        } else {
            body = <WaitingCard text="Ваша оценка отправлена. Когда менти отправит самооценку — здесь откроется сравнение." />;
        }
    } else if (isAdmin) {
        body = <CompareStub self={self} mentor={mentor} admin />;
    } else {
        // peer-зритель без прав на сертификацию (чужая когорта и т.п.) — не показываем
        body = null;
    }

    if (body === null) return null;
    return (
        <section id="pvl-certification" className="scroll-mt-4 space-y-4">
            {body}
        </section>
    );
}
