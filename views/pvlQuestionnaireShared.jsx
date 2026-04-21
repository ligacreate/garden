import React from 'react';
import RichEditor from '../components/RichEditor';
import { pvlReadImageFileAsDataUrl, sanitizeHomeworkAnswerHtml, homeworkAnswerPlainText } from '../utils/pvlHomeworkAnswerRichText';

/** Ученица: заполнение анкеты в стиле Google Forms. */
export function QuestionnaireFieldsEditor({ blocks, questionnaireTitle, questionnaireDescription, value, onChange, disabled }) {
    const v = value && typeof value === 'object' ? value : {};
    const qaPairs = (blocks || []).filter((b) => b && b.type === 'qa_pair');
    const hasLegacy = (blocks || []).some((b) => b && (b.type === 'text' || b.type === 'short_text' || b.type === 'long_text'));
    return (
        <div className="space-y-3 max-w-2xl">
            {/* Шапка анкеты */}
            <div className="rounded-xl border-t-[6px] border-emerald-600 bg-white shadow-md p-6">
                <h2 className="text-xl font-normal text-slate-800">
                    {questionnaireTitle || 'Анкета'}
                </h2>
                {questionnaireDescription ? (
                    <p className="mt-2 text-sm text-slate-600 whitespace-pre-wrap">{questionnaireDescription}</p>
                ) : null}
            </div>

            {/* Новые блоки qa_pair */}
            {qaPairs.map((b, idx) => (
                <div key={b.id} className="rounded-xl bg-white shadow-md p-5 space-y-3">
                    <p className="text-sm text-slate-800">
                        <span className="text-slate-400 mr-2">{idx + 1}.</span>
                        {b.question || <span className="text-slate-400 italic">Вопрос</span>}
                    </p>
                    <textarea
                        value={v[b.id] || ''}
                        onChange={(e) => !disabled && onChange({ ...v, [b.id]: e.target.value })}
                        disabled={!!disabled}
                        rows={4}
                        className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-400/25 disabled:opacity-60"
                        placeholder="Ваш ответ…"
                    />
                </div>
            ))}

            {/* Устаревший формат — обратная совместимость */}
            {hasLegacy ? (
                <div className="space-y-4">
                    {(blocks || []).map((b) => {
                        if (!b) return null;
                        if (b.type === 'qa_pair') return null;
                        if (b.type === 'text') {
                            return (
                                <div
                                    key={b.id}
                                    className="rounded-xl border border-slate-200/90 bg-slate-50/50 p-4 text-sm text-slate-700 max-w-none [&_p]:my-1"
                                    dangerouslySetInnerHTML={{
                                        __html: sanitizeHomeworkAnswerHtml(b.content || '<p></p>'),
                                    }}
                                />
                            );
                        }
                        if (b.type === 'short_text') {
                            return (
                                <label key={b.id} className="block space-y-1">
                                    <span className="text-sm text-slate-800">
                                        {b.label || 'Вопрос'}
                                        {b.required ? <span className="text-rose-600"> *</span> : null}
                                    </span>
                                    <input
                                        type="text"
                                        value={v[b.id] || ''}
                                        onChange={(e) => onChange({ ...v, [b.id]: e.target.value })}
                                        disabled={!!disabled}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                                        placeholder="Ответ…"
                                    />
                                </label>
                            );
                        }
                        if (b.type === 'long_text') {
                            return (
                                <div key={b.id} className="space-y-1">
                                    <span className="text-sm text-slate-800 block">
                                        {b.label || 'Вопрос'}
                                        {b.required ? <span className="text-rose-600"> *</span> : null}
                                    </span>
                                    <RichEditor
                                        value={v[b.id] || ''}
                                        onChange={(html) => onChange({ ...v, [b.id]: html })}
                                        placeholder="Развёрнутый ответ…"
                                        variant="student"
                                        onUploadImage={pvlReadImageFileAsDataUrl}
                                        readOnly={!!disabled}
                                        editorClassName="!min-h-[140px] !max-h-[360px] p-3"
                                    />
                                </div>
                            );
                        }
                        return null;
                    })}
                </div>
            ) : null}
        </div>
    );
}

/** Ментор / история: только чтение ответов. */
export function QuestionnaireAnswersReadonly({ blocks, questionnaireTitle, questionnaireDescription, answersJson }) {
    const a = answersJson && typeof answersJson === 'object' ? answersJson : {};
    const qaPairs = (blocks || []).filter((b) => b && b.type === 'qa_pair');
    const legacyBlocks = (blocks || []).filter((b) => b && b.type !== 'qa_pair');
    return (
        <div className="space-y-3 mt-2">
            {(questionnaireTitle || questionnaireDescription) ? (
                <div className="rounded-lg border-t-4 border-emerald-500 bg-white p-4 shadow-sm">
                    {questionnaireTitle ? <div className="text-base font-medium text-slate-800">{questionnaireTitle}</div> : null}
                    {questionnaireDescription ? <div className="text-sm text-slate-500 mt-1 whitespace-pre-wrap">{questionnaireDescription}</div> : null}
                </div>
            ) : null}

            {qaPairs.map((b, idx) => {
                const raw = a[b.id];
                const answer = raw != null ? String(raw).trim() : '';
                return (
                    <div key={b.id} className="rounded-lg bg-white p-4 shadow-sm border border-slate-100 space-y-2">
                        <div className="text-xs font-medium text-slate-500">
                            {idx + 1}. {b.question || 'Вопрос'}
                        </div>
                        <p className="text-sm text-slate-800 whitespace-pre-wrap">{answer || <span className="text-slate-400">—</span>}</p>
                    </div>
                );
            })}

            {legacyBlocks.length > 0 ? (
                <div className="mt-2 space-y-4 border-t border-slate-100 pt-3">
                    {legacyBlocks.map((b) => {
                        if (!b) return null;
                        if (b.type === 'text') {
                            return (
                                <div
                                    key={b.id}
                                    className="text-sm text-slate-600 max-w-none [&_p]:my-1 rounded-lg bg-slate-50/80 p-2 border border-slate-100"
                                    dangerouslySetInnerHTML={{
                                        __html: sanitizeHomeworkAnswerHtml(b.content || ''),
                                    }}
                                />
                            );
                        }
                        const raw = a[b.id];
                        const has = raw != null && String(raw).trim() !== '' && (b.type === 'long_text' ? homeworkAnswerPlainText(String(raw)).trim() : String(raw).trim());
                        return (
                            <div key={b.id} className="text-sm">
                                <div className="text-xs font-medium text-slate-500">{b.label || b.id}</div>
                                {b.type === 'long_text' ? (
                                    <div
                                        className="text-slate-800 mt-1 max-w-none text-sm [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5"
                                        dangerouslySetInnerHTML={{
                                            __html: has ? sanitizeHomeworkAnswerHtml(String(raw)) : '<p class="text-slate-400">—</p>',
                                        }}
                                    />
                                ) : (
                                    <p className="text-slate-800 mt-1 whitespace-pre-wrap">{has ? String(raw) : '—'}</p>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
