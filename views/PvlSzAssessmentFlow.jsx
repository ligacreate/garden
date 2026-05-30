import React, { useRef, useState } from 'react';
import {
    SZ_ASSESSMENT_CRITICAL,
    SZ_ASSESSMENT_SECTIONS,
    SZ_REFLECTION_PROMPTS,
    SZ_REFLECTION_PROMPTS_MENTOR,
} from '../data/pvlReferenceContent';
import { pvlPostgrestApi } from '../services/pvlPostgrestApi';

// Этап 2 / Сессия 3: двусторонний parallel-blind assessment СЗ на реальном API.
// ПРАВИЛА ФОКУСА (из _167, иначе вернётся баг ментора BUG-PVL-AUTOREFRESH-BREAKS-MENTOR-INPUT):
//   - textarea и баллы живут в ЛОКАЛЬНОМ useState, инициализируются из данных/localStorage
//     ОДИН РАЗ (через initRef ниже); НИКОГДА не пере-синкаются с сервера во время набора;
//   - autosave (PATCH черновика) — только на переходе вперёд по шагам, fire-and-forget;
//     localStorage-черновик — сетевой safety-net; возвращаемую строку в стейт НЕ кладём;
//   - getCertificationCompare/рефетч делает родитель только по onCommitted, не во время набора.

const STORAGE_PREFIX = 'pvl_sz_flow_v2_';

const REFLECTION_MIN = 50;
const CRITICAL_COMMENT_MIN = 30;

function storageKey(mode, studentId) {
    return `${STORAGE_PREFIX}${mode}_${studentId}`;
}

function loadDraft(mode, studentId) {
    try {
        const raw = localStorage.getItem(storageKey(mode, studentId));
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function saveDraft(mode, studentId, data) {
    try {
        localStorage.setItem(storageKey(mode, studentId), JSON.stringify(data));
    } catch {
        /* ignore */
    }
}

function clearLocalDraft(mode, studentId) {
    try {
        localStorage.removeItem(storageKey(mode, studentId));
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
    return Array(SZ_ASSESSMENT_CRITICAL.length).fill(false);
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

// ── маппинг локальные массивы ↔ JSONB-колонки БД ─────────────────────────────
// criteria_scores: { "A1": 2, …, "F3": 3 } (ключ = letter+index из SZ_ASSESSMENT_SECTIONS)
function criteriaToJsonb(scores) {
    const out = {};
    SZ_ASSESSMENT_SECTIONS.forEach((sec, si) => {
        sec.items.forEach((_, j) => {
            const v = scores[si * 3 + j];
            if (typeof v === 'number') out[`${sec.letter}${j + 1}`] = v;
        });
    });
    return out;
}

// reflections: { "prompt_1": "…", … } по prompt.key выбранного режима
function reflectionsToJsonb(reflections, prompts) {
    const out = {};
    prompts.forEach((p, i) => { out[p.key] = reflections[i] ?? ''; });
    return out;
}

// critical_flags: ["critical_1", "critical_5", …] — id отмеченных условий
function criticalToFlags(critical) {
    return SZ_ASSESSMENT_CRITICAL.filter((_, i) => critical[i]).map((c) => c.id);
}

// ── init ОДИН РАЗ: сервер-черновик (initialData) → иначе localStorage → иначе пусто ──
function computeInitial(initialData, mode, studentId, prompts) {
    if (initialData) {
        const scores = emptyScores();
        SZ_ASSESSMENT_SECTIONS.forEach((sec, si) => sec.items.forEach((_, j) => {
            const v = initialData.criteria_scores?.[`${sec.letter}${j + 1}`];
            if (typeof v === 'number') scores[si * 3 + j] = v;
        }));
        const reflections = emptyReflections();
        prompts.forEach((p, i) => { reflections[i] = String(initialData.reflections?.[p.key] ?? ''); });
        const flags = Array.isArray(initialData.critical_flags) ? initialData.critical_flags : [];
        const critical = SZ_ASSESSMENT_CRITICAL.map((c) => flags.includes(c.id));
        return { step: 0, reflections, scores, critical, criticalComment: initialData.critical_comment ?? '' };
    }
    const d = loadDraft(mode, studentId);
    if (d) {
        return {
            step: typeof d.step === 'number' ? d.step : 0,
            reflections: Array.isArray(d.reflections) && d.reflections.length === 6 ? d.reflections : emptyReflections(),
            scores: Array.isArray(d.scores) && d.scores.length === 18 ? d.scores : emptyScores(),
            critical: Array.isArray(d.critical) && d.critical.length === SZ_ASSESSMENT_CRITICAL.length ? d.critical : emptyCritical(),
            criticalComment: d.criticalComment ?? '',
        };
    }
    return { step: 0, reflections: emptyReflections(), scores: emptyScores(), critical: emptyCritical(), criticalComment: '' };
}

/**
 * Пошаговый бланк СЗ. mode='self' (менти о себе) | 'mentor' (ментор о менти).
 * studentId — оцениваемая менти (в обоих режимах это student_id строки БД);
 * mentor_id проставляет триггер БД. onCommitted — родитель рефетчит после submit.
 */
export default function PvlSzAssessmentFlow({ studentId, mode = 'self', peerId, peerName = '', initialData = null, onCommitted }) {
    const isMentor = mode === 'mentor';
    const prompts = isMentor ? SZ_REFLECTION_PROMPTS_MENTOR : SZ_REFLECTION_PROMPTS;

    // init ОДИН РАЗ (компонент ремаунтится по key=`${mode}-${studentId}` в родителе)
    const initRef = useRef(null);
    if (initRef.current === null) initRef.current = computeInitial(initialData, mode, studentId, prompts);
    const init = initRef.current;

    const [step, setStep] = useState(init.step);
    const [reflections, setReflections] = useState(init.reflections);
    const [scores, setScores] = useState(init.scores);
    const [critical, setCritical] = useState(init.critical);
    const [criticalComment, setCriticalComment] = useState(init.criticalComment);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState(null);

    const persistLocal = (patch) => {
        saveDraft(mode, studentId, {
            step: patch.step ?? step,
            reflections: patch.reflections ?? reflections,
            scores: patch.scores ?? scores,
            critical: patch.critical ?? critical,
            criticalComment: patch.criticalComment ?? criticalComment,
        });
    };

    const buildPayload = () => ({
        student_id: studentId,
        criteria_scores: criteriaToJsonb(scores),
        score_total: totalScores(scores),
        reflections: reflectionsToJsonb(reflections, prompts),
        // Критические — ТОЛЬКО режим ментора (микроправка Сессии 4): self их не пишет.
        critical_flags: isMentor ? criticalToFlags(critical) : [],
        critical_comment: isMentor && criticalComment.trim() ? criticalComment.trim() : null,
    });

    // autosave черновика на сервер; результат в стейт НЕ кладём (правило фокуса)
    const saveDraftToServer = async () => {
        const payload = buildPayload();
        if (isMentor) return pvlPostgrestApi.upsertCertificationMentorDraft(payload);
        return pvlPostgrestApi.upsertCertificationSelfDraft(payload);
    };

    const setScore = (idx, val) => {
        const next = [...scores];
        next[idx] = val;
        setScores(next);
        persistLocal({ scores: next });
    };

    const goStep = (n) => { setStep(n); persistLocal({ step: n }); };
    const goForward = (n) => {
        goStep(n);
        // PATCH черновика на переходе вперёд (≤ нескольких раз за flow); localStorage — safety-net
        saveDraftToServer().catch(() => { /* сетевой сбой — черновик уже в localStorage */ });
    };

    // ── валидации (ТЗ _144 §4.5, _146 §5) ─────────────────────────────────────
    const reflectionOk = (i) => reflections[i].trim().length >= REFLECTION_MIN;
    const reflectionsOk = reflections.every((_, i) => reflectionOk(i));
    const scoresOk = scores.every((s) => s === 1 || s === 2 || s === 3);
    const anyCritical = isMentor && critical.some(Boolean);
    const criticalOk = !anyCritical || criticalComment.trim().length >= CRITICAL_COMMENT_MIN;
    const allValid = reflectionsOk && scoresOk && criticalOk;

    const total = totalScores(scores);
    const secSums = sectionSums(scores);

    const handleSubmit = async () => {
        if (!allValid || submitting) return;
        setSubmitting(true);
        setSubmitError(null);
        try {
            await saveDraftToServer(); // гарантируем строку + финальные данные
            if (isMentor) await pvlPostgrestApi.submitCertificationMentor(studentId);
            else await pvlPostgrestApi.submitCertificationSelf(studentId);
            clearLocalDraft(mode, studentId);
            onCommitted?.();
        } catch (e) {
            setSubmitError(String(e?.message || 'Не удалось отправить. Черновик сохранён локально — попробуйте ещё раз.'));
        } finally {
            setSubmitting(false);
        }
    };

    const title = isMentor
        ? 'Сертификационный завтрак'
        : 'Моя самооценка сертификационного завтрака';

    // Критические условия — отдельный шаг (n=3) ТОЛЬКО у ментора (микроправка Сессии 4);
    // менти себя по критическим условиям не оценивает и этот шаг пропускает.
    const stepsMeta = isMentor
        ? [
            { n: 0, title: 'Как это работает' },
            { n: 1, title: 'Рефлексия' },
            { n: 2, title: '18 критериев' },
            { n: 3, title: 'Критические условия' },
            { n: 4, title: 'Отправка' },
        ]
        : [
            { n: 0, title: 'Как это работает' },
            { n: 1, title: 'Рефлексия' },
            { n: 2, title: '18 критериев' },
            { n: 4, title: 'Отправка' },
        ];

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-sm">
                <h2 className="font-display text-2xl text-slate-800">{title}</h2>
                <p className="text-sm text-slate-500 mt-1">
                    {isMentor
                        ? `Оценка ведущей${peerName ? `: ${peerName}` : ''} — заполняйте после прослушивания записи встречи.`
                        : 'Заполни в течение 24 часов после встречи — пока впечатления свежие.'}
                </p>
                <div className="flex flex-wrap gap-2 mt-4">
                    {stepsMeta.map((s, i) => (
                        <span
                            key={s.n}
                            className={`text-xs rounded-full px-3 py-1 border ${step === s.n ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-100 text-slate-500'}`}
                        >
                            {i + 1}. {s.title}
                        </span>
                    ))}
                </div>
            </div>

            {step === 0 && (
                <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm space-y-4 text-sm text-slate-700 leading-relaxed">
                    {isMentor ? (
                        <p>
                            Вы оцениваете работу ведущей по 18 критериям и шести вопросам рефлексии.
                            Ваши ответы и самооценка ведущей сравниваются <strong>только после того, как обе стороны отправят анкету</strong>
                            {' '}(parallel-blind): до этого вы не видите её оценок, а она — ваших.
                        </p>
                    ) : (
                        <p>Эта анкета поможет поисследовать, как прошла встреча: что получилось, что хочется усилить, где были сложности.</p>
                    )}
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Шкала для критериев (шаг 3)</div>
                        <ul className="space-y-1 text-slate-600">
                            <li><span className="font-medium text-slate-800">1</span> — не удалось / получилось слабо / совсем не получилось</li>
                            <li><span className="font-medium text-slate-800">2</span> — нормально / в целом справилась</li>
                            <li><span className="font-medium text-slate-800">3</span> — {isMentor ? 'отлично удалось / на высоком уровне' : 'отлично удалось / именно так я и задумывала'}</li>
                        </ul>
                    </div>
                    <p className="text-slate-500">Сначала будут блоки для свободных ответов и размышлений, а потом – тест.</p>
                    <button
                        type="button"
                        className="rounded-xl bg-slate-800 text-white px-5 py-2.5 text-sm font-medium hover:bg-slate-900"
                        onClick={() => goForward(1)}
                    >
                        Начать
                    </button>
                </div>
            )}

            {step === 1 && (
                <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm space-y-5">
                    <h3 className="font-display text-lg text-slate-800">Шаг 1 — рефлексия (каждый ответ ≥ {REFLECTION_MIN} символов)</h3>
                    {prompts.map((p, i) => {
                        const len = reflections[i].trim().length;
                        return (
                            <label key={p.key} className="block space-y-2">
                                <span className="text-sm font-medium text-slate-800">{i + 1}. {p.q}</span>
                                <span className="text-xs text-slate-500 block">{p.hint}</span>
                                <textarea
                                    className="w-full min-h-[88px] rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800"
                                    value={reflections[i]}
                                    onChange={(e) => {
                                        const next = [...reflections];
                                        next[i] = e.target.value;
                                        setReflections(next);
                                        persistLocal({ reflections: next });
                                    }}
                                />
                                <span className={`text-[11px] ${len >= REFLECTION_MIN ? 'text-emerald-600' : 'text-slate-400'}`}>{len}/{REFLECTION_MIN}</span>
                            </label>
                        );
                    })}
                    <div className="flex flex-wrap gap-2 items-center">
                        <button type="button" className="rounded-xl border border-slate-200 px-4 py-2 text-sm" onClick={() => goStep(0)}>Назад</button>
                        <button
                            type="button"
                            disabled={!reflectionsOk}
                            className="rounded-xl bg-slate-800 text-white px-5 py-2 text-sm font-medium disabled:opacity-40"
                            onClick={() => goForward(2)}
                        >
                            Дальше
                        </button>
                        {!reflectionsOk ? <span className="text-xs text-slate-400">Каждый из 6 ответов — минимум {REFLECTION_MIN} символов.</span> : null}
                    </div>
                </div>
            )}

            {step === 2 && (
                <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm space-y-6">
                    <h3 className="font-display text-lg text-slate-800">Шаг 2 — оценка по критериям (1–3 балла)</h3>
                    <p className="text-sm text-slate-600">{isMentor ? 'Оцените работу ведущей по каждому критерию.' : 'Оцените себя по каждому критерию.'}</p>
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
                    <div className="flex flex-wrap gap-2 items-center">
                        <button type="button" className="rounded-xl border border-slate-200 px-4 py-2 text-sm" onClick={() => goStep(1)}>Назад</button>
                        <button
                            type="button"
                            disabled={!scoresOk}
                            className="rounded-xl bg-slate-800 text-white px-5 py-2 text-sm font-medium disabled:opacity-40"
                            onClick={() => goForward(isMentor ? 3 : 4)}
                        >
                            Дальше
                        </button>
                        {!scoresOk ? <span className="text-xs text-slate-400">Проставьте балл по всем 18 критериям.</span> : null}
                    </div>
                </div>
            )}

            {step === 3 && isMentor && (
                <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-sm space-y-4">
                    <h3 className="font-display text-lg text-slate-800">Шаг 3 — критические условия</h3>
                    <p className="text-sm text-slate-600">Отметьте только то, что <strong>реально было</strong> на встрече. Если отмечено хоть одно — обязательно поясните в комментарии (≥ {CRITICAL_COMMENT_MIN} символов).</p>
                    <ul className="space-y-2">
                        {SZ_ASSESSMENT_CRITICAL.map((item, i) => (
                            <li key={item.id} className="flex gap-3 items-start text-sm text-slate-700">
                                <input
                                    type="checkbox"
                                    className="mt-1 rounded border-slate-300"
                                    checked={critical[i]}
                                    onChange={() => {
                                        const next = [...critical];
                                        next[i] = !next[i];
                                        setCritical(next);
                                        persistLocal({ critical: next });
                                    }}
                                />
                                <span>{item.text}</span>
                            </li>
                        ))}
                    </ul>
                    <label className="block space-y-1">
                        <span className="text-xs font-medium text-slate-500">Комментарий {anyCritical ? `(обязательно, ≥ ${CRITICAL_COMMENT_MIN})` : '(если нужно)'}</span>
                        <textarea
                            className="w-full min-h-[80px] rounded-xl border border-slate-200 p-3 text-sm"
                            value={criticalComment}
                            onChange={(e) => {
                                setCriticalComment(e.target.value);
                                persistLocal({ criticalComment: e.target.value });
                            }}
                        />
                    </label>
                    <div className="flex flex-wrap gap-2 items-center">
                        <button type="button" className="rounded-xl border border-slate-200 px-4 py-2 text-sm" onClick={() => goStep(2)}>Назад</button>
                        <button
                            type="button"
                            disabled={anyCritical && !criticalOk}
                            className="rounded-xl bg-slate-800 text-white px-5 py-2 text-sm font-medium disabled:opacity-40"
                            onClick={() => goForward(4)}
                        >
                            Дальше
                        </button>
                        {anyCritical && !criticalOk ? <span className="text-xs text-slate-400">Поясните отмеченные условия (≥ {CRITICAL_COMMENT_MIN} символов).</span> : null}
                    </div>
                </div>
            )}

            {step === 4 && (
                <div className="space-y-4">
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-6 shadow-sm">
                        <h3 className="font-display text-xl text-slate-800">{isMentor ? 'Итог оценки' : 'Итог самооценки'}</h3>
                        <p className="text-3xl font-display text-slate-900 mt-2 tabular-nums">{total} / 54</p>
                    </div>

                    {isMentor ? (anyCritical ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 text-sm text-rose-900">
                            <div className="font-medium mb-2">Отмечены критические условия</div>
                            <ul className="list-disc pl-5 space-y-1">
                                {SZ_ASSESSMENT_CRITICAL.map((item, i) => (critical[i] ? <li key={item.id}>{item.text}</li> : null))}
                            </ul>
                            {criticalComment ? <p className="mt-3 text-rose-800/90 whitespace-pre-wrap">{criticalComment}</p> : null}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-slate-100 bg-white p-4 text-sm text-slate-600">Критические условия не отмечены.</div>
                    )) : null}

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

                    <div className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-sm space-y-3">
                        <p className="text-sm text-slate-600">
                            Внесите изменения, если нужно, и отправляйте анкету. Когда и менти, и ментор заполнят анкету, можно будет посмотреть результаты.
                        </p>
                        {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}
                        <div className="flex flex-wrap gap-2 items-center">
                            <button type="button" className="rounded-xl border border-slate-200 px-4 py-2 text-sm" onClick={() => goStep(isMentor ? 3 : 2)}>Назад к правкам</button>
                            <button
                                type="button"
                                disabled={!allValid || submitting}
                                className="rounded-xl bg-emerald-700 text-white px-5 py-2 text-sm font-medium hover:bg-emerald-800 disabled:opacity-40"
                                onClick={handleSubmit}
                            >
                                {submitting ? 'Отправляем…' : 'Отправить'}
                            </button>
                            {!allValid ? (
                                <span className="text-xs text-slate-400">
                                    Заполните все поля: 18 баллов, 6 рефлексий ≥ {REFLECTION_MIN} симв.{anyCritical ? `, комментарий к критическим ≥ ${CRITICAL_COMMENT_MIN}` : ''}.
                                </span>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
