import React, { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { pvlDomainApi } from '../services/pvlMockApi.js';
import { ChecklistFieldsEditor, ChecklistAnswersReadonly } from './pvlChecklistShared.jsx';
import { QuestionnaireFieldsEditor, QuestionnaireAnswersReadonly } from './pvlQuestionnaireShared.jsx';
import RichEditor from '../components/RichEditor.jsx';
import { isHomeworkAnswerEmpty, pvlReadImageFileAsDataUrl, sanitizeHomeworkAnswerHtml } from '../utils/pvlHomeworkAnswerRichText.js';
import { isQuestionnaireAnswersComplete } from '../utils/pvlQuestionnaireBlocks.js';

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

/** Из ссылки или iframe: страница просмотра на kinescope.io (не /embed/). */
function kinescopeWatchPageFromEmbedLike(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    let href = s;
    if (s.includes('<iframe')) {
        const m = s.match(/src=["'](https?:\/\/[^"']+)["']/i);
        if (m) href = m[1];
    }
    try {
        const u = new URL(href);
        if (!/^https?:$/i.test(u.protocol)) return '';
        const host = u.hostname.replace(/^www\./i, '').toLowerCase();
        if (host !== 'kinescope.io') return '';
        const path = u.pathname.replace(/\/$/, '');
        const embedMatch = path.match(/^\/embed\/(.+)$/i);
        if (embedMatch) return `https://kinescope.io/${embedMatch[1]}`;
        return '';
    } catch {
        return '';
    }
}

/** Публичная ссылка «открыть на сайте» (RuTube, страница Kinescope, YouTube и т.д.). */
export function getLessonExternalWatchUrl(item) {
    const rutube = String(item?.lessonRutubeUrl || '').trim();
    if (rutube) {
        try {
            const u = new URL(rutube);
            if (/^https?:$/i.test(u.protocol)) return rutube;
        } catch {
            return '';
        }
    }
    const vid = String(item?.lessonVideoUrl || '').trim();
    if (vid) {
        try {
            const u = new URL(vid);
            if (!/^https?:$/i.test(u.protocol)) return '';
            const host = u.hostname.replace(/^www\./i, '').toLowerCase();
            if (host === 'kinescope.io' && u.pathname.includes('/embed/')) {
                const w = kinescopeWatchPageFromEmbedLike(vid);
                return w || '';
            }
            return vid;
        } catch {
            return '';
        }
    }
    const embedHtml = String(item?.lessonVideoEmbed || '').trim();
    if (embedHtml) {
        const w = kinescopeWatchPageFromEmbedLike(embedHtml);
        if (w) return w;
    }
    return '';
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

/** Санитизация HTML конспекта/материала (импорт MD → marked → хранение в fullDescription). */
const PVL_MATERIAL_HTML_PURIFY = {
    ADD_TAGS: ['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col', 'caption', 'br', 'hr', 'ol', 'ul', 'li', 'img'],
    ADD_ATTR: ['align', 'colspan', 'rowspan', 'data-pvl-wiki-ref', 'target', 'rel', 'title', 'loading', 'start', 'type', 'reversed', 'src', 'alt', 'width', 'height', 'class'],
};

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
    if (/<\s*[a-z][^>]*>/i.test(raw)) {
        return DOMPurify.sanitize(raw, PVL_MATERIAL_HTML_PURIFY);
    }
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

/**
 * Общие стили тела материала (библиотека, трекер, глоссарий, предпросмотр в учительской).
 * Не ставим overflow-x-auto на корень — иначе обрезаются маркеры нумерованных списков (10 → «0»).
 * Горизонтальный скролл только у таблиц.
 */
export const pvlMaterialBodyClass =
    'text-sm text-slate-700 leading-7 max-w-full [&_.pvl-doc-verbatim]:whitespace-pre-wrap [&_.pvl-doc-verbatim]:font-normal [&_.pvl-doc-verbatim]:text-slate-700 [&_.pvl-doc-verbatim]:leading-7 [&_.pvl-wiki-embed]:my-3 [&>h1]:mt-6 [&>h1]:mb-3 [&>h1]:text-xl [&>h1]:font-semibold [&>h1]:text-slate-900 [&>h1]:border-b [&>h1]:border-slate-200 [&>h1]:pb-2 [&>h2]:mt-5 [&>h2]:mb-2.5 [&>h2]:text-lg [&>h2]:font-semibold [&>h2]:text-slate-900 [&>h3]:mt-4 [&>h3]:mb-2 [&>h3]:text-base [&>h3]:font-semibold [&>h3]:text-slate-800 [&>h4]:mt-3 [&>h4]:mb-1.5 [&>h4]:text-base [&>h4]:font-semibold [&>h5]:mt-2 [&>h5]:mb-1 [&>h5]:text-sm [&>h5]:font-semibold [&>h6]:mt-2 [&>h6]:mb-1 [&>h6]:text-sm [&>h6]:font-semibold [&>p]:mb-3 [&>p]:leading-relaxed [&>ul]:my-3 [&>ul]:list-disc [&>ul]:list-outside [&>ul]:pl-6 [&>ul]:space-y-1 [&>ol]:my-3 [&>ol]:list-decimal [&>ol]:list-outside [&>ol]:pl-6 [&>ol]:space-y-1 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:list-outside [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:list-outside [&_ol]:pl-5 [&_li]:my-1 [&_li]:pl-0.5 [&>blockquote]:my-4 [&>blockquote]:rounded-r-lg [&>blockquote]:border-l-4 [&>blockquote]:border-emerald-200/80 [&>blockquote]:bg-emerald-50/40 [&>blockquote]:pl-4 [&>blockquote]:pr-3 [&>blockquote]:py-2.5 [&>blockquote]:text-slate-700 [&>hr]:my-6 [&>hr]:border-slate-200 [&>pre]:whitespace-pre-wrap [&>pre]:rounded-xl [&>pre]:border [&>pre]:border-slate-200 [&>pre]:bg-slate-50 [&>pre]:p-3 [&_table]:my-4 [&_table]:block [&_table]:w-full [&_table]:max-w-none [&_table]:overflow-x-auto [&_table]:min-w-[min(100%,48rem)] [&_table]:border-collapse [&_table]:border [&_table]:border-slate-200 [&_table]:text-sm [&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-50/90 [&_th]:px-2 [&_th]:py-2 [&_th]:text-left [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-2 [&_td]:align-top [&_strong]:font-semibold [&_em]:italic [&_a]:text-emerald-800 [&_a]:underline [&_img]:max-h-[min(80vh,32rem)] [&_img]:max-w-full [&_img]:rounded-lg [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em]';

const materialBodyClass = pvlMaterialBodyClass;

/**
 * Тело карточки материала: тест / видео+конспект / текст — как в библиотеке.
 */
export function PvlLibraryMaterialBody({ selectedItem, lessonVideoPlayerHtml, onQuizPassed, variant = 'library', studentId = null, navigate = null, routePrefix = '/student' }) {
    if (!selectedItem) return null;
    if (selectedItem.lessonKind === 'homework' && studentId) {
        return <HomeworkInlineForm selectedItem={selectedItem} studentId={studentId} navigate={navigate} routePrefix={routePrefix} />;
    }
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
                {(() => {
                    const watchUrl = getLessonExternalWatchUrl(selectedItem);
                    return watchUrl ? (
                        <div className="flex flex-wrap items-center gap-2">
                            <a
                                href={watchUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center rounded-full border border-[#C8855A]/50 bg-white px-4 py-2 text-sm font-medium text-[#4A3728] shadow-sm transition-colors hover:bg-[#FAF6F2] hover:border-[#C8855A]"
                            >
                                Если не открывается — смотреть урок на сайте
                            </a>
                        </div>
                    ) : null;
                })()}
                <section className="rounded-2xl border border-[#E8D5C4]/70 bg-gradient-to-br from-[#FAF6F2] via-white to-[#FAF6F2]/30 p-4 md:p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)]">
                    <div className="flex items-center gap-2.5 mb-3 pb-2 border-b border-[#E8D5C4]/50">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/80 border border-[#E8D5C4]/60 text-base" aria-hidden>📋</span>
                        <h4 className="font-display text-lg text-[#4A3728] m-0 leading-tight">Конспект</h4>
                    </div>
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

export function HomeworkInlineForm({ selectedItem, studentId, navigate, routePrefix = '/student' }) {
    const [draft, setDraft] = React.useState('');
    const [answers, setAnswers] = React.useState({});
    const [saved, setSaved] = React.useState(false);
    const [refreshTick, setRefreshTick] = React.useState(0);

    const task = React.useMemo(() => {
        return pvlDomainApi.studentApi.ensureTaskForContentItem(studentId, selectedItem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studentId, selectedItem?.id]);

    const hwMeta = React.useMemo(() => {
        const t = pvlDomainApi.db.homeworkTasks.find((x) => x.id === task?.id);
        return t?.homeworkMeta || null;
    }, [task?.id]);
    const isChecklist = hwMeta?.assignmentType === 'checklist';
    const checklistSections = hwMeta?.checklistSections || [];
    const isQuestionnaire = hwMeta?.assignmentType === 'questionnaire';
    const questionnaireBlocks = hwMeta?.questionnaireBlocks || [];
    const questionnaireTitle = hwMeta?.questionnaireTitle || '';
    const questionnaireDescription = hwMeta?.questionnaireDescription || '';

    const detail = React.useMemo(() => {
        if (!task?.id || !studentId) return null;
        return pvlDomainApi.studentApi.getStudentTaskDetail(studentId, task.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studentId, task?.id, refreshTick]);

    React.useEffect(() => {
        if (!detail?.versions) return;
        const currentVersion = detail.versions.find(v => v.isDraft) || detail.versions.find(v => v.isCurrent);
        if (currentVersion?.textContent) setDraft(currentVersion.textContent);
        if (currentVersion?.answersJson && typeof currentVersion.answersJson === 'object') {
            setAnswers({ ...currentVersion.answersJson });
        }
    }, [task?.id]);

    if (!task) return null;

    const taskState = detail?.state || pvlDomainApi.db.studentTaskStates.find(s => s.studentId === studentId && s.taskId === task.id);
    const submittedVersions = (detail?.versions || []).filter(v => !v.isDraft);
    const thread = (detail?.thread || []).filter(m => m.authorRole !== 'system');
    const deadlineAt = detail?.task?.deadlineAt || null;

    const refresh = () => setRefreshTick(t => t + 1);

    const STATUS_LABELS = {
        not_started: { label: 'Не начато', color: 'bg-slate-100 text-slate-500' },
        draft: { label: 'Черновик', color: 'bg-violet-100 text-violet-800' },
        submitted: { label: 'Отправлено', color: 'bg-sky-100 text-sky-800' },
        pending_review: { label: 'На проверке', color: 'bg-amber-100 text-amber-700' },
        revision_requested: { label: 'На доработке', color: 'bg-orange-100 text-orange-700' },
        accepted: { label: 'Принято', color: 'bg-emerald-100 text-emerald-700' },
    };
    const statusInfo = STATUS_LABELS[taskState?.status] || STATUS_LABELS.not_started;
    const isAccepted = taskState?.status === 'accepted';
    const isPending = taskState?.status === 'pending_review' || taskState?.status === 'submitted';
    const canEdit = !isAccepted && !isPending;

    const currentVersion = submittedVersions.find(v => v.isCurrent) || (submittedVersions.length ? submittedVersions[submittedVersions.length - 1] : null);
    const prevVersions = submittedVersions.filter(v => v.id !== currentVersion?.id).sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0));

    const handleSaveDraft = () => {
        if (isChecklist || isQuestionnaire) {
            pvlDomainApi.studentApi.saveStudentDraft(studentId, task.id, { textContent: '', answersJson: answers });
        } else {
            pvlDomainApi.studentApi.saveStudentDraft(studentId, task.id, { textContent: draft });
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        refresh();
    };

    const handleSubmit = () => {
        let ok;
        if (isChecklist || isQuestionnaire) {
            ok = pvlDomainApi.studentApi.submitStudentTask(studentId, task.id, { textContent: '', answersJson: answers });
        } else {
            if (isHomeworkAnswerEmpty(draft)) return;
            ok = pvlDomainApi.studentApi.submitStudentTask(studentId, task.id, { textContent: draft });
        }
        if (!ok) return;
        refresh();
    };

    return (
        <div className="mt-4 space-y-4">
            {selectedItem.fullDescription ? (
                <div
                    className={materialBodyClass}
                    dangerouslySetInnerHTML={{ __html: normalizeMaterialHtml(selectedItem.fullDescription) }}
                />
            ) : null}

            {/* Задание: заголовок, статус, дедлайн */}
            <div className="rounded-2xl border border-[#E8D5C4]/70 bg-gradient-to-br from-[#FAF6F2] via-white to-[#FAF6F2]/30 p-4 md:p-5">
                <div className="flex items-center justify-between mb-2">
                    <h4 className="font-display text-lg text-[#4A3728]">Домашнее задание</h4>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusInfo.color}`}>
                        {statusInfo.label}
                    </span>
                </div>
                {deadlineAt ? (
                    <div className="text-xs text-slate-500 mb-2">Дедлайн: {deadlineAt}</div>
                ) : null}
                {selectedItem.lessonHomework?.prompt ? (
                    <p className="text-sm text-slate-600 leading-relaxed mb-2">
                        {selectedItem.lessonHomework.prompt}
                    </p>
                ) : !selectedItem.fullDescription && selectedItem.shortDescription ? (
                    <p className="text-sm text-slate-600 leading-relaxed mb-2">
                        {selectedItem.shortDescription}
                    </p>
                ) : null}
                {selectedItem.lessonHomework?.expectedResult ? (
                    <p className="text-xs text-slate-400">Ожидаемый результат: {selectedItem.lessonHomework.expectedResult}</p>
                ) : null}
            </div>

            {/* Отправленные версии */}
            {currentVersion ? (
                <div className="rounded-2xl border border-[#E8D5C4]/70 bg-gradient-to-br from-[#FAF6F2] via-white to-[#FAF6F2]/30 p-4 md:p-5">
                    <p className="text-xs text-[#7A6758] mb-2">Текущая версия</p>
                    <HomeworkVersionItem
                        version={currentVersion}
                        isQuestionnaire={isQuestionnaire}
                        questionnaireBlocks={questionnaireBlocks}
                        questionnaireTitle={questionnaireTitle}
                        questionnaireDescription={questionnaireDescription}
                        isChecklist={isChecklist}
                        checklistSections={checklistSections}
                    />
                    {isPending ? (
                        <p className="mt-3 text-xs text-[#7A6758]">Ответ уже отправлен и ожидает решения ментора. Редактирование откроется, если ментор вернет работу на доработку.</p>
                    ) : null}
                    {prevVersions.length > 0 ? (
                        <details className="mt-3">
                            <summary className="text-xs cursor-pointer text-[#7A6758]">Предыдущие версии ({prevVersions.length})</summary>
                            <div className="grid gap-2 mt-2">
                                {prevVersions.map(v => (
                                    <HomeworkVersionItem
                                        key={v.id}
                                        version={v}
                                        isQuestionnaire={isQuestionnaire}
                                        questionnaireBlocks={questionnaireBlocks}
                                        questionnaireTitle={questionnaireTitle}
                                        questionnaireDescription={questionnaireDescription}
                                        isChecklist={isChecklist}
                                        checklistSections={checklistSections}
                                    />
                                ))}
                            </div>
                        </details>
                    ) : null}
                </div>
            ) : null}

            {/* Форма ввода ответа */}
            {canEdit ? (
                <div className="space-y-3">
                    {isQuestionnaire && questionnaireBlocks.length ? (
                        <QuestionnaireFieldsEditor
                            blocks={questionnaireBlocks}
                            questionnaireTitle={questionnaireTitle}
                            questionnaireDescription={questionnaireDescription}
                            value={answers}
                            onChange={setAnswers}
                            disabled={false}
                        />
                    ) : isChecklist && checklistSections.length ? (
                        <ChecklistFieldsEditor sections={checklistSections} value={answers} onChange={setAnswers} disabled={false} />
                    ) : (
                        <RichEditor
                            value={draft}
                            onChange={setDraft}
                            placeholder="Заголовки, жирный, курсив, подчёркивание, списки, таблица. Картинки — только загрузкой файла."
                            variant="student"
                            onUploadImage={pvlReadImageFileAsDataUrl}
                            readOnly={false}
                        />
                    )}
                    <div className="flex gap-2 flex-wrap">
                        <button
                            type="button"
                            onClick={handleSaveDraft}
                            className="px-4 py-2 rounded-xl border border-[#E8D5C4] bg-white text-sm text-[#4A3728] hover:bg-[#FAF6F2] transition-colors"
                        >
                            {saved ? 'Сохранено ✓' : 'Сохранить черновик'}
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={
                                isQuestionnaire
                                    ? !isQuestionnaireAnswersComplete(questionnaireBlocks, answers)
                                    : isChecklist
                                        ? false
                                        : isHomeworkAnswerEmpty(draft)
                            }
                            className="px-4 py-2 rounded-xl bg-[#C4956A] text-white text-sm font-medium hover:bg-[#B8845A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            Отправить на проверку
                        </button>
                    </div>
                </div>
            ) : null}

            {/* Лента по заданию */}
            {thread.length > 0 ? (
                <div className="rounded-2xl border border-[#E8D5C4]/70 bg-white p-4 md:p-5">
                    <h4 className="font-display text-xl text-[#4A3728] mb-1">Лента по заданию</h4>
                    <p className="text-xs text-[#7A6758] mb-3">Сообщения по заданию.</p>
                    <div className="grid gap-2 max-h-72 overflow-y-auto pr-1">
                        {thread.map(m => (
                            <article key={m.id} className={`rounded-xl border p-3 ${m.authorRole === 'mentor' ? 'bg-emerald-50/30 border-emerald-200/70' : 'bg-white border-slate-200'}`}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-medium text-slate-800">
                                        {m.authorName}
                                        <span className="text-xs text-slate-500 font-normal ml-1">({m.authorRole === 'mentor' ? 'ментор' : 'участница'})</span>
                                    </p>
                                    <p className="text-xs text-slate-500">{m.createdAt}</p>
                                </div>
                                <p className="mt-1 text-sm text-slate-700">{m.text}</p>
                                {m.attachments?.length ? <p className="text-xs text-slate-500 mt-1">Вложения: {m.attachments.join(', ')}</p> : null}
                            </article>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function HomeworkVersionItem({ version, isQuestionnaire, questionnaireBlocks, questionnaireTitle, questionnaireDescription, isChecklist, checklistSections }) {
    const versionDate = String(version.createdAt || '').substring(0, 16);
    return (
        <div className="rounded-xl border border-[#E8D5C4]/50 bg-white/70 p-3">
            <div className="flex items-center justify-between mb-2 text-xs text-[#7A6758]">
                <span>Версия {version.versionNumber}</span>
                <span>{versionDate}</span>
            </div>
            {isQuestionnaire && questionnaireBlocks.length ? (
                <QuestionnaireAnswersReadonly
                    blocks={questionnaireBlocks}
                    questionnaireTitle={questionnaireTitle}
                    questionnaireDescription={questionnaireDescription}
                    answersJson={version.answersJson || {}}
                />
            ) : isChecklist && checklistSections.length ? (
                <ChecklistAnswersReadonly sections={checklistSections} answersJson={version.answersJson || {}} />
            ) : version.textContent ? (
                <div
                    className="text-sm text-slate-700 whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{ __html: sanitizeHomeworkAnswerHtml(version.textContent) }}
                />
            ) : <p className="text-xs text-slate-400 italic">Нет содержимого</p>}
        </div>
    );
}
