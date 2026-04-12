import React, { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';

export function stripMaterialNumbering(title) {
    const source = String(title || '').trim();
    return source.replace(/^\s*\d+(?:[.)]\d+)*(?:[.)]|[\-:])?\s+/u, '');
}

function escapeHtml(source = '') {
    return String(source || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

/** Урок с Kinescope/видео: отдельная вёрстка «видео + конспект» в библиотеке и в трекере. */
export function isVideoLessonLayout(item) {
    if (!item) return false;
    return !!(String(item.lessonVideoEmbed || '').trim() || String(item.lessonVideoUrl || '').trim());
}

function sanitizeLessonVideoEmbedHtml(snippet = '') {
    const raw = String(snippet || '').trim();
    if (!raw) return '';
    return DOMPurify.sanitize(raw, {
        ADD_TAGS: ['iframe', 'div'],
        ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'src', 'title', 'referrerpolicy', 'loading', 'style', 'class', 'width', 'height'],
    });
}

export function buildLessonVideoPlayerHtml(item) {
    const embed = sanitizeLessonVideoEmbedHtml(item?.lessonVideoEmbed);
    if (embed) return embed;
    const url = String(item?.lessonVideoUrl || '').trim();
    if (!url) return '';
    try {
        const u = new URL(url);
        if (!/^https?:$/i.test(u.protocol)) return '';
        const host = u.hostname.replace(/^www\./i, '').toLowerCase();
        if (host === 'kinescope.io' && u.pathname.includes('/embed/')) {
            return sanitizeLessonVideoEmbedHtml(
                `<iframe src="${escapeHtml(u.href)}" title="Видео урока" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>`,
            );
        }
    } catch {
        return '';
    }
    return '';
}

export function normalizeMaterialHtml(source = '') {
    const raw = String(source || '').trim();
    if (!raw) return '';
    const preMatch = raw.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    if (preMatch) {
        const unwrapped = String(preMatch[1] || '')
            .replaceAll('&lt;', '<')
            .replaceAll('&gt;', '>')
            .replaceAll('&amp;', '&')
            .trim();
        const escaped = escapeHtml(unwrapped).replaceAll('\n', '<br/>');
        return `<div class="pvl-doc-verbatim">${escaped}</div>`;
    }
    if (/<\s*[a-z][^>]*>/i.test(raw)) return raw;
    const escaped = escapeHtml(raw).replaceAll('\n', '<br/>');
    return `<div class="pvl-doc-verbatim">${escaped}</div>`;
}

export function scorePvlQuizAttempt(rawQuiz, selections) {
    const questions = Array.isArray(rawQuiz?.questions) ? rawQuiz.questions : [];
    let earned = 0;
    let max = 0;
    for (const q of questions) {
        const pts = Number.isFinite(Number(q.points)) ? Number(q.points) : 1;
        if (q.type === 'open') {
            continue;
        }
        max += pts;
        const correctIds = new Set((q.options || []).filter((o) => o.isCorrect).map((o) => o.id));
        if (q.type === 'multi') {
            const sel = new Set(Array.isArray(selections[q.id]) ? selections[q.id] : []);
            const ok = correctIds.size > 0 && correctIds.size === sel.size && [...correctIds].every((id) => sel.has(id));
            if (ok) earned += pts;
        } else if (correctIds.has(selections[q.id])) {
            earned += pts;
        }
    }
    const pct = max ? Math.round((earned / max) * 100) : 0;
    const passPercent = Math.max(1, Math.min(100, Number(rawQuiz?.settings?.passPercent) || 70));
    return { earned, max, pct, passed: pct >= passPercent, passPercent };
}

/**
 * Прохождение теста (библиотека и трекер).
 */
export function LibraryQuizRunner({ quiz: rawQuiz, onPassed }) {
    const quiz = rawQuiz && typeof rawQuiz === 'object' ? rawQuiz : {};
    const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
    const settings = quiz.settings && typeof quiz.settings === 'object' ? quiz.settings : {};
    const passPercent = Math.max(1, Math.min(100, Number(settings.passPercent) || 70));
    const maxAttempts = Math.max(1, Number(settings.attempts) || 2);
    const showCorrect = settings.showCorrectAfterSubmit !== false;

    const [selections, setSelections] = useState({});
    const [openText, setOpenText] = useState({});
    const [submitted, setSubmitted] = useState(false);
    const [attempt, setAttempt] = useState(1);
    const [lastResult, setLastResult] = useState(null);

    useEffect(() => {
        setSelections({});
        setOpenText({});
        setSubmitted(false);
        setAttempt(1);
        setLastResult(null);
    }, [rawQuiz]);

    const result = submitted && lastResult ? lastResult : null;

    const handleSubmit = () => {
        const missing = questions.filter((q) => {
            if (q.type === 'open') return q.required !== false && !String(openText[q.id] || '').trim();
            if (q.type === 'multi') return !Array.isArray(selections[q.id]) || selections[q.id].length === 0;
            return !selections[q.id];
        });
        if (missing.length) {
            window.alert('Ответьте на все обязательные вопросы.');
            return;
        }
        const scored = scorePvlQuizAttempt(quiz, selections);
        setLastResult(scored);
        setSubmitted(true);
        if (scored.passed) onPassed?.();
    };

    const handleRetry = () => {
        if (attempt >= maxAttempts) return;
        setSelections({});
        setOpenText({});
        setSubmitted(false);
        setLastResult(null);
        setAttempt((a) => a + 1);
    };

    return (
        <div className="mt-4 space-y-5">
            {quiz.instruction ? (
                <div className="rounded-xl border border-[#E8D5C4] bg-[#FAF6F2]/50 p-3 text-sm text-slate-700 leading-relaxed">{quiz.instruction}</div>
            ) : null}
            <div className="space-y-6">
                {questions.map((q, idx) => (
                    <fieldset key={q.id} className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
                        <legend className="text-sm font-semibold text-slate-800 px-1">
                            Вопрос {idx + 1}
                            {Number(q.points) ? <span className="text-slate-500 font-normal"> · {q.points} б.</span> : null}
                        </legend>
                        <p className="text-sm text-slate-700 mt-2 mb-3">{q.text || '—'}</p>
                        {q.type === 'open' ? (
                            <textarea
                                value={openText[q.id] || ''}
                                onChange={(e) => setOpenText((prev) => ({ ...prev, [q.id]: e.target.value }))}
                                rows={4}
                                disabled={submitted}
                                className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-800 disabled:bg-slate-50"
                                placeholder="Ваш ответ…"
                            />
                        ) : (
                            <ul className="space-y-2">
                                {(q.options || []).map((opt) => {
                                    const sel = selections[q.id];
                                    const picked = q.type === 'multi' ? (Array.isArray(sel) ? sel.includes(opt.id) : false) : sel === opt.id;
                                    const reveal = submitted && showCorrect;
                                    const markCorrect = reveal && opt.isCorrect;
                                    const markWrong = reveal && picked && !opt.isCorrect;
                                    return (
                                        <li key={opt.id}>
                                            <label
                                                className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                                                    markCorrect ? 'border-emerald-300 bg-emerald-50/80' : ''
                                                } ${markWrong ? 'border-rose-200 bg-rose-50/60' : 'border-slate-200 hover:bg-slate-50/80'}`}
                                            >
                                                {q.type === 'multi' ? (
                                                    <input
                                                        type="checkbox"
                                                        className="mt-1"
                                                        disabled={submitted}
                                                        checked={picked}
                                                        onChange={(e) => {
                                                            const cur = Array.isArray(sel) ? [...sel] : [];
                                                            if (e.target.checked) cur.push(opt.id);
                                                            else {
                                                                const i = cur.indexOf(opt.id);
                                                                if (i >= 0) cur.splice(i, 1);
                                                            }
                                                            setSelections((prev) => ({ ...prev, [q.id]: cur }));
                                                        }}
                                                    />
                                                ) : (
                                                    <input
                                                        type="radio"
                                                        name={q.id}
                                                        className="mt-1"
                                                        disabled={submitted}
                                                        checked={picked}
                                                        onChange={() => setSelections((prev) => ({ ...prev, [q.id]: opt.id }))}
                                                    />
                                                )}
                                                <span className="text-slate-800 leading-snug">{opt.text || '—'}</span>
                                            </label>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        {q.type === 'open' && submitted ? (
                            <p className="mt-2 text-xs text-slate-500">Открытый ответ не автопроверяется; при необходимости его проверит ментор или учительская.</p>
                        ) : null}
                    </fieldset>
                ))}
            </div>
            {!submitted ? (
                <button
                    type="button"
                    onClick={handleSubmit}
                    className="rounded-full bg-[#4A3728] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#3d2f22]"
                >
                    Проверить ответы
                </button>
            ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-2">
                    <p className="text-sm font-medium text-slate-800">
                        Результат: {result?.pct ?? 0}% (порог {passPercent}%)
                        {result?.passed ? <span className="text-emerald-700"> — зачёт</span> : <span className="text-amber-800"> — нужно подтянуть материал</span>}
                    </p>
                    <p className="text-xs text-slate-500">Попытка {attempt} из {maxAttempts}</p>
                    {!result?.passed && attempt < maxAttempts ? (
                        <button
                            type="button"
                            onClick={handleRetry}
                            className="text-sm rounded-full border border-slate-300 bg-white px-4 py-2 text-slate-800 hover:bg-slate-50"
                        >
                            Повторить попытку
                        </button>
                    ) : null}
                </div>
            )}
        </div>
    );
}

const materialBodyClass =
    'text-sm text-slate-700 leading-7 [&_.pvl-doc-verbatim]:whitespace-pre-wrap [&_.pvl-doc-verbatim]:font-normal [&_.pvl-doc-verbatim]:text-slate-700 [&_.pvl-doc-verbatim]:leading-7 [&>h2]:mt-4 [&>h2]:mb-2 [&>h2]:text-lg [&>h2]:font-semibold [&>h3]:mt-3 [&>h3]:mb-1 [&>h3]:text-base [&>h3]:font-semibold [&>p]:mb-2 [&>ul]:my-2 [&>ul]:list-disc [&>ul]:pl-5 [&>ol]:my-2 [&>ol]:list-decimal [&>ol]:pl-5 [&>pre]:whitespace-pre-wrap [&>pre]:rounded-xl [&>pre]:border [&>pre]:border-slate-200 [&>pre]:bg-slate-50 [&>pre]:p-3';

/**
 * Тело карточки материала: тест / видео+конспект / текст — как в библиотеке.
 */
export function PvlLibraryMaterialBody({ selectedItem, lessonVideoPlayerHtml, onQuizPassed, variant = 'library' }) {
    if (!selectedItem) return null;
    if (
        selectedItem.contentType === 'checklist'
        && selectedItem.lessonQuiz
        && Array.isArray(selectedItem.lessonQuiz.questions)
        && selectedItem.lessonQuiz.questions.length
    ) {
        return (
            <div className="mt-4 space-y-4">
                <h4 className="font-display text-lg text-[#4A3728]">Тест</h4>
                {selectedItem.shortDescription ? (
                    <p className="text-sm text-slate-500 leading-relaxed">{selectedItem.shortDescription}</p>
                ) : null}
                {selectedItem.fullDescription ? (
                    <div
                        className={`${materialBodyClass} text-slate-600`}
                        dangerouslySetInnerHTML={{ __html: normalizeMaterialHtml(selectedItem.fullDescription || '') }}
                    />
                ) : null}
                <LibraryQuizRunner quiz={selectedItem.lessonQuiz} onPassed={onQuizPassed} />
                <div className="text-xs text-slate-500">{selectedItem.estimatedDuration || '—'}</div>
                {(selectedItem.externalLinks || []).length ? (
                    <p className="text-xs text-slate-500">Ссылки: {(selectedItem.externalLinks || []).join(', ')}</p>
                ) : null}
                {(selectedItem.attachments || []).length ? (
                    <p className="text-xs text-slate-500">Вложения: {(selectedItem.attachments || []).join(', ')}</p>
                ) : null}
            </div>
        );
    }
    if (isVideoLessonLayout(selectedItem)) {
        return (
            <div className="mt-4 space-y-6">
                {selectedItem.shortDescription ? (
                    <p className="text-sm text-slate-500 leading-relaxed">{selectedItem.shortDescription}</p>
                ) : null}
                <div className="overflow-hidden rounded-2xl border border-[#E8D5C4] bg-[#FAF6F2]/40 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.1)]">
                    <div className="relative aspect-video w-full bg-slate-900/[0.04]">
                        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-black/55 to-transparent" aria-hidden />
                        <div className="pointer-events-none absolute left-3 top-2.5 z-10 max-w-[min(100%,20rem)] truncate text-sm font-medium text-white drop-shadow-md">
                            {stripMaterialNumbering(selectedItem.title)}
                        </div>
                        {lessonVideoPlayerHtml ? (
                            <div
                                className="absolute inset-0 [&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0"
                                dangerouslySetInnerHTML={{ __html: lessonVideoPlayerHtml }}
                            />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-500">
                                Видео ещё не подключено. В учительской укажите код встраивания Kinescope (поле «Embed / iframe»).
                            </div>
                        )}
                    </div>
                </div>
                <section>
                    <h4 className="font-display text-lg text-[#4A3728] mb-2">Конспект</h4>
                    <div
                        className={materialBodyClass}
                        dangerouslySetInnerHTML={{ __html: normalizeMaterialHtml(selectedItem.fullDescription || '') }}
                    />
                </section>
                <p className="text-xs text-slate-500">
                    {variant === 'tracker'
                        ? 'После урока перейдите к следующему шагу в трекере курса (кнопка «Следующий шаг» или список слева).'
                        : 'После урока откройте в этой же категории следующий материал — тест по пройденной теме.'}
                </p>
                <div className="text-xs text-slate-500">{selectedItem.estimatedDuration || '—'}</div>
                {(selectedItem.externalLinks || []).length ? (
                    <p className="text-xs text-slate-500">Ссылки: {(selectedItem.externalLinks || []).join(', ')}</p>
                ) : null}
                {(selectedItem.attachments || []).length ? (
                    <p className="text-xs text-slate-500">Вложения: {(selectedItem.attachments || []).join(', ')}</p>
                ) : null}
            </div>
        );
    }
    return (
        <>
            <div
                className={`${materialBodyClass} mt-3`}
                dangerouslySetInnerHTML={{ __html: normalizeMaterialHtml(selectedItem.fullDescription || selectedItem.shortDescription || '') }}
            />
            <div className="mt-2 text-xs text-slate-500">{selectedItem.estimatedDuration || '—'}</div>
            {(selectedItem.externalLinks || []).length ? (
                <p className="text-xs text-slate-500 mt-1">Ссылки: {(selectedItem.externalLinks || []).join(', ')}</p>
            ) : null}
            {(selectedItem.attachments || []).length ? (
                <p className="text-xs text-slate-500 mt-1">Вложения: {(selectedItem.attachments || []).join(', ')}</p>
            ) : null}
        </>
    );
}
