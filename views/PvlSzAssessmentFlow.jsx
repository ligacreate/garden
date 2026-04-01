import React, { useCallback, useMemo, useState } from 'react';
import {
    SZ_ASSESSMENT_CRITICAL,
    SZ_ASSESSMENT_SECTIONS,
    SZ_REFLECTION_PROMPTS,
} from '../data/pvlReferenceContent';

const STORAGE_PREFIX = 'pvl_sz_flow_v1_';

function loadDraft(studentId) {
    try {
        const raw = localStorage.getItem(`${STORAGE_PREFIX}${studentId}`);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function saveDraft(studentId, data) {
    try {
        localStorage.setItem(`${STORAGE_PREFIX}${studentId}`, JSON.stringify(data));
    } catch {
        /* ignore */
    }
}

function emptyReflections() {
    return Array(6).fill('');
}

function emptyScores() {
    return Array(18).fill(null);
}

function emptyCritical() {
    return Array(10).fill(false);
}

function totalScores(arr) {
    return arr.reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
}

function sectionSums(scores) {
    return SZ_ASSESSMENT_SECTIONS.map((sec, si) => {
        const slice = scores.slice(si * 3, si * 3 + 3);
        return { letter: sec.letter, name: sec.name, sum: totalScores(slice) };
    });
}

function levelLabel(total) {
    if (total <= 30) return 'базовый уровень';
    if (total <= 45) return 'рабочий уровень';
    return 'сильный уровень';
}

/** Пошаговая самооценка СЗ по референсу pvl_assessment.html */
export default function PvlSzAssessmentFlow({ studentId, navigate, certPoints }) {
    const draft = useMemo(() => loadDraft(studentId), [studentId]);
    const [step, setStep] = useState(draft?.step ?? 0);
    const [reflections, setReflections] = useState(draft?.reflections ?? emptyReflections());
    const [scores, setScores] = useState(draft?.scores ?? emptyScores());
    const [critical, setCritical] = useState(draft?.critical ?? emptyCritical());
    const [criticalComment, setCriticalComment] = useState(draft?.criticalComment ?? '');
    const [mentorScores, setMentorScores] = useState(draft?.mentorScores ?? emptyScores());
    const [showMentorCompare, setShowMentorCompare] = useState(!!draft?.showMentorCompare);

    const persist = useCallback(
        (patch) => {
            const next = {
                step: patch.step ?? step,
                reflections: patch.reflections ?? reflections,
                scores: patch.scores ?? scores,
                critical: patch.critical ?? critical,
                criticalComment: patch.criticalComment ?? criticalComment,
                mentorScores: patch.mentorScores ?? mentorScores,
                showMentorCompare: patch.showMentorCompare ?? showMentorCompare,
            };
            saveDraft(studentId, next);
        },
        [studentId, step, reflections, scores, critical, criticalComment, mentorScores, showMentorCompare],
    );

    const setScore = (idx, val) => {
        const next = [...scores];
        next[idx] = val;
        setScores(next);
        persist({ scores: next });
    };

    const setMentorScore = (idx, val) => {
        const next = [...mentorScores];
        next[idx] = val;
        setMentorScores(next);
        persist({ mentorScores: next });
    };

    const reflectionsOk = reflections.every((t) => String(t).trim().length > 0);
    const scoresOk = scores.every((s) => s === 1 || s === 2 || s === 3);
    const anyCritical = critical.some(Boolean);
    const criticalOk = !anyCritical || String(criticalComment).trim().length > 0;

    const total = totalScores(scores);
    const secSums = sectionSums(scores);

    const comparisonRows = useMemo(() => {
        const rows = [];
        let idx = 0;
        SZ_ASSESSMENT_SECTIONS.forEach((sec) => {
            sec.items.forEach((text, j) => {
                const self = scores[idx];
                const men = mentorScores[idx];
                const diff = typeof self === 'number' && typeof men === 'number' ? Math.abs(self - men) : null;
                rows.push({
                    idx,
                    section: sec.letter,
                    text,
                    self,
                    men,
                    flag: diff != null && diff >= 3,
                });
                idx += 1;
            });
        });
        return rows;
    }, [scores, mentorScores]);

    const stepsMeta = [
        { n: 0, title: 'Как это работает' },
        { n: 1, title: 'Рефлексия' },
        { n: 2, title: '18 критериев' },
        { n: 3, title: 'Критические условия' },
        { n: 4, title: 'Итог' },
    ];

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-sm">
                <h2 className="font-display text-2xl text-slate-800">Самооценка сертификационного завтрака</h2>
                <p className="text-sm text-slate-500 mt-1">Заполни в течение 24 часов после встречи — пока впечатления свежие.</p>
                <div className="flex flex-wrap gap-2 mt-4">
                    {stepsMeta.map((s) => (
                        <span
                            key={s.n}
                            className={`text-xs rounded-full px-3 py-1 border ${step === s.n ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-100 text-slate-500'}`}
                        >
                            {s.n + 1}. {s.title}
                        </span>
                    ))}
                </div>
            </div>

            {step === 0 && (
                <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm space-y-4 text-sm text-slate-700 leading-relaxed">
                    <p>
                        Этот бланк помогает честно зафиксировать, как прошла встреча: что получилось, что хочется усилить и где были сложности.
                        Ответы нужны <strong>только тебе и ментору</strong> — для развития, а не для оценки «хорошо / плохо».
                    </p>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Шкала для критериев (шаг 3)</div>
                        <ul className="space-y-1 text-slate-600">
                            <li><span className="font-medium text-slate-800">1</span> — слабо / не удалось / было срывом</li>
                            <li><span className="font-medium text-slate-800">2</span> — нормально / в целом справилась</li>
                            <li><span className="font-medium text-slate-800">3</span> — сильно / именно так и задумывала</li>
                        </ul>
                    </div>
                    <p className="text-slate-500">Сначала — свободные ответы, затем оценки по блокам A–F, затем критические условия и итог.</p>
                    <button
                        type="button"
                        className="rounded-xl bg-slate-800 text-white px-5 py-2.5 text-sm font-medium hover:bg-slate-900"
                        onClick={() => {
                            setStep(1);
                            persist({ step: 1 });
                        }}
                    >
                        Начать
                    </button>
                </div>
            )}

            {step === 1 && (
                <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm space-y-5">
                    <h3 className="font-display text-lg text-slate-800">Шаг 1 — рефлексия (обязательно)</h3>
                    {SZ_REFLECTION_PROMPTS.map((p, i) => (
                        <label key={p.q} className="block space-y-2">
                            <span className="text-sm font-medium text-slate-800">{i + 1}. {p.q}</span>
                            <span className="text-xs text-slate-500 block">{p.hint}</span>
                            <textarea
                                className="w-full min-h-[88px] rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800"
                                value={reflections[i]}
                                onChange={(e) => {
                                    const next = [...reflections];
                                    next[i] = e.target.value;
                                    setReflections(next);
                                    persist({ reflections: next });
                                }}
                            />
                        </label>
                    ))}
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="rounded-xl border border-slate-200 px-4 py-2 text-sm" onClick={() => { setStep(0); persist({ step: 0 }); }}>Назад</button>
                        <button
                            type="button"
                            disabled={!reflectionsOk}
                            className="rounded-xl bg-slate-800 text-white px-5 py-2 text-sm font-medium disabled:opacity-40"
                            onClick={() => { setStep(2); persist({ step: 2 }); }}
                        >
                            Дальше
                        </button>
                    </div>
                </div>
            )}

            {step === 2 && (
                <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm space-y-6">
                    <h3 className="font-display text-lg text-slate-800">Шаг 2 — оценка по критериям (1–3 балла)</h3>
                    {SZ_ASSESSMENT_SECTIONS.map((sec, si) => (
                        <section key={sec.letter} className="rounded-xl border border-slate-100 bg-slate-50/40 p-4 space-y-3">
                            <div className="text-sm font-semibold text-slate-800">{sec.letter}. {sec.name}</div>
                            {sec.items.map((itemText, j) => {
                                const idx = si * 3 + j;
                                return (
                                    <div key={idx} className="border-t border-slate-100/80 pt-3 first:border-0 first:pt-0">
                                        <p className="text-sm text-slate-700 mb-2">{itemText}</p>
                                        <div className="flex flex-wrap gap-2">
                                            {[1, 2, 3].map((v) => (
                                                <button
                                                    key={v}
                                                    type="button"
                                                    onClick={() => setScore(idx, v)}
                                                    className={`rounded-lg border px-3 py-1.5 text-sm ${scores[idx] === v ? 'border-blue-400 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white text-slate-600'}`}
                                                >
                                                    {v}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </section>
                    ))}
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="rounded-xl border border-slate-200 px-4 py-2 text-sm" onClick={() => { setStep(1); persist({ step: 1 }); }}>Назад</button>
                        <button
                            type="button"
                            disabled={!scoresOk}
                            className="rounded-xl bg-slate-800 text-white px-5 py-2 text-sm font-medium disabled:opacity-40"
                            onClick={() => { setStep(3); persist({ step: 3 }); }}
                        >
                            Дальше
                        </button>
                    </div>
                </div>
            )}

            {step === 3 && (
                <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm space-y-4">
                    <h3 className="font-display text-lg text-slate-800">Шаг 3 — критические условия</h3>
                    <p className="text-sm text-slate-600">Отметь только то, что <strong>реально было</strong> на встрече. Если отмечено хоть одно — обязательно поясни в комментарии.</p>
                    <ul className="space-y-2">
                        {SZ_ASSESSMENT_CRITICAL.map((line, i) => (
                            <li key={i} className="flex gap-3 items-start text-sm text-slate-700">
                                <input
                                    type="checkbox"
                                    className="mt-1 rounded border-slate-300"
                                    checked={critical[i]}
                                    onChange={() => {
                                        const next = [...critical];
                                        next[i] = !next[i];
                                        setCritical(next);
                                        persist({ critical: next });
                                    }}
                                />
                                <span>{line}</span>
                            </li>
                        ))}
                    </ul>
                    <label className="block space-y-1">
                        <span className="text-xs font-medium text-slate-500">Комментарий {anyCritical ? '(обязательно)' : '(если нужно)'}</span>
                        <textarea
                            className="w-full min-h-[80px] rounded-xl border border-slate-200 p-3 text-sm"
                            value={criticalComment}
                            onChange={(e) => {
                                setCriticalComment(e.target.value);
                                persist({ criticalComment: e.target.value });
                            }}
                        />
                    </label>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="rounded-xl border border-slate-200 px-4 py-2 text-sm" onClick={() => { setStep(2); persist({ step: 2 }); }}>Назад</button>
                        <button
                            type="button"
                            disabled={anyCritical && !criticalOk}
                            className="rounded-xl bg-slate-800 text-white px-5 py-2 text-sm font-medium disabled:opacity-40"
                            onClick={() => { setStep(4); persist({ step: 4 }); }}
                        >
                            Завершить и посмотреть итог
                        </button>
                    </div>
                </div>
            )}

            {step === 4 && (
                <div className="space-y-4">
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-6 shadow-sm">
                        <h3 className="font-display text-xl text-slate-800">Итог самооценки</h3>
                        <p className="text-3xl font-display text-slate-900 mt-2 tabular-nums">{total} / 54</p>
                        <p className="text-sm text-slate-600 mt-1">Уровень: <span className="font-medium text-slate-800">{levelLabel(total)}</span></p>
                        <p className="text-xs text-slate-500 mt-3">
                            18–30 = базовый · 31–45 = рабочий · 46–54 = сильный (как в материалах по СЗ).
                        </p>
                    </div>

                    {anyCritical ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 text-sm text-rose-900">
                            <div className="font-medium mb-2">Отмечены критические условия</div>
                            <ul className="list-disc pl-5 space-y-1">
                                {SZ_ASSESSMENT_CRITICAL.map((line, i) => (critical[i] ? <li key={i}>{line}</li> : null))}
                            </ul>
                            {criticalComment ? <p className="mt-3 text-rose-800/90 whitespace-pre-wrap">{criticalComment}</p> : null}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-slate-100 bg-white p-4 text-sm text-slate-600">Критические условия не отмечены.</div>
                    )}

                    <div className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-sm">
                        <h4 className="font-display text-lg text-slate-800 mb-3">Суммы по блокам</h4>
                        <ul className="text-sm space-y-1 text-slate-700">
                            {secSums.map((s) => (
                                <li key={s.letter} className="flex justify-between border-b border-slate-50 py-1">
                                    <span>{s.letter}. {s.name}</span>
                                    <span className="tabular-nums font-medium">{s.sum} / 9</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {certPoints != null ? (
                        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 text-sm text-slate-600">
                            В кабинете уже учтено: самооценка <span className="font-medium tabular-nums">{certPoints.szSelfAssessmentTotal}/54</span>
                            {' · '}ментор <span className="font-medium tabular-nums">{certPoints.szMentorAssessmentTotal}/54</span>
                            {' '}(данные демо/API; черновик бланка хранится локально в браузере).
                        </div>
                    ) : null}

                    <div className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-sm">
                        <button
                            type="button"
                            className="text-sm font-medium text-blue-700 hover:underline"
                            onClick={() => {
                                const next = !showMentorCompare;
                                setShowMentorCompare(next);
                                persist({ showMentorCompare: next });
                            }}
                        >
                            {showMentorCompare ? 'Скрыть сравнение с оценкой ментора' : 'Сравнить с оценкой ментора (ввод вручную)'}
                        </button>
                        {showMentorCompare ? (
                            <div className="mt-4 space-y-4">
                                <p className="text-xs text-slate-500">Введите баллы ментора по тем же 18 критериям. Разница ≥ 3 баллов по пункту — повод для разговора (как в регламенте СЗ).</p>
                                {SZ_ASSESSMENT_SECTIONS.map((sec, si) => (
                                    <div key={sec.letter} className="text-sm space-y-2">
                                        <div className="font-medium text-slate-800">{sec.letter}. {sec.name}</div>
                                        {sec.items.map((itemText, j) => {
                                            const idx = si * 3 + j;
                                            return (
                                                <div key={idx} className="pl-2 border-l-2 border-slate-100">
                                                    <p className="text-slate-600 text-xs mb-1">{itemText}</p>
                                                    <div className="flex gap-2">
                                                        {[1, 2, 3].map((v) => (
                                                            <button
                                                                key={v}
                                                                type="button"
                                                                onClick={() => setMentorScore(idx, v)}
                                                                className={`rounded border px-2 py-1 text-xs ${mentorScores[idx] === v ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`}
                                                            >
                                                                {v}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                                <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 text-xs space-y-1 max-h-48 overflow-y-auto">
                                    {comparisonRows.filter((r) => r.flag).length === 0 ? (
                                        <span className="text-slate-600">Нет расхождений ≥ 3 баллов (при заполненных парах баллов).</span>
                                    ) : (
                                        comparisonRows
                                            .filter((r) => r.flag)
                                            .map((r) => (
                                                <div key={r.idx} className="text-amber-900">
                                                    <span className="font-medium">{r.section}:</span> {r.text.slice(0, 80)}
                                                    … (ты: {r.self}, ментор: {r.men})
                                                </div>
                                            ))
                                    )}
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="rounded-xl border border-slate-200 px-4 py-2 text-sm" onClick={() => { setStep(3); persist({ step: 3 }); }}>Назад к правкам</button>
                        <button type="button" className="rounded-xl border border-slate-200 px-4 py-2 text-sm" onClick={() => navigate('/student/certification')}>
                            К разделу «Сертификация»
                        </button>
                        <button type="button" className="rounded-xl border border-slate-200 px-4 py-2 text-sm" onClick={() => navigate('/student/dashboard')}>
                            На главную
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
