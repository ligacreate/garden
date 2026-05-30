import React, { useCallback, useEffect, useState } from 'react';
import { pvlPostgrestApi } from '../services/pvlPostgrestApi';
import PvlSzAssessmentFlow from '../views/PvlSzAssessmentFlow';
import PvlCertificationCompareView from './PvlCertificationCompareView';
import PvlCertificationAdminPanel from './PvlCertificationAdminPanel';

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

// phase42: спокойное locked-состояние, когда приём по когорте ещё закрыт
// (certification_open=false) и зритель не admin. Wizard НЕ монтируется.
function LockedCard() {
    return (
        <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm">
            <h3 className="font-display text-lg text-slate-800 mb-1">Сертификационный завтрак</h3>
            <p className="text-sm text-slate-600">
                Приём сертификационных завтраков откроется позже. Пока изучите раздел
                о сертификации, собирайте группу и готовьте сценарий. Мы в вас верим!
            </p>
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
    const [certOpen, setCertOpen] = useState(false); // phase42: приём по когорте (fail-closed)
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(() => {
        if (!studentId) { setLoading(false); return; }
        setLoading(true);
        setError(null);
        Promise.all([
            pvlPostgrestApi.getCertificationCompare(studentId),
            // certOpen не фатален: ошибка чтения → закрыто (fail-closed), compare не ломаем
            pvlPostgrestApi.getStudentCertificationOpen(studentId).catch(() => false),
        ])
            .then(([res, open]) => {
                setData({ self: res?.self ?? null, mentor: res?.mentor ?? null });
                setCertOpen(Boolean(open));
            })
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
    } else if ((isSelf || isMentor) && !certOpen && !isAdmin) {
        // phase42: приём по когорте закрыт и зритель не admin → locked, wizard не монтируем.
        // admin (ниже) видит превью всегда, независимо от флага.
        body = <LockedCard />;
    } else if (isSelf) {
        if (self?.status !== 'submitted') {
            body = <PvlSzAssessmentFlow key={`self-${studentId}`} mode="self" studentId={studentId} initialData={self} onCommitted={onCommitted} />;
        } else if (mentor?.status === 'submitted') {
            body = <PvlCertificationCompareView self={self} mentor={mentor} peerName={peerName} />;
        } else {
            body = <WaitingCard text="Самооценка отправлена. Когда ментор отправит свою оценку — здесь откроется сравнение." />;
        }
    } else if (isMentor) {
        if (!mentor || mentor.status !== 'submitted') {
            body = <PvlSzAssessmentFlow key={`mentor-${studentId}`} mode="mentor" studentId={studentId} peerId={studentId} peerName={peerName} initialData={mentor} onCommitted={onCommitted} />;
        } else if (self?.status === 'submitted') {
            body = <PvlCertificationCompareView self={self} mentor={mentor} peerName={peerName} />;
        } else {
            body = <WaitingCard text="Ваша оценка отправлена. Когда менти отправит самооценку — здесь откроется сравнение." />;
        }
    } else if (isAdmin) {
        // showDraftsExplicitly: админ видит сравнение даже когда стороны ещё в draft.
        body = (
            <>
                <PvlCertificationCompareView self={self} mentor={mentor} peerName={peerName} />
                <PvlCertificationAdminPanel studentId={studentId} self={self} mentor={mentor} onChanged={onCommitted} />
            </>
        );
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
