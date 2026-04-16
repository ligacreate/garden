import React from 'react';
import RichEditor from '../components/RichEditor';
import { pvlReadImageFileAsDataUrl, sanitizeHomeworkAnswerHtml, homeworkAnswerPlainText } from '../utils/pvlHomeworkAnswerRichText';

/** Ученица: заполнение анкеты (черновик / отправка). */
export function QuestionnaireFieldsEditor({ blocks, value, onChange, disabled }) {
    const v = value && typeof value === 'object' ? value : {};
    return (
        <div className="space-y-5">
            {(blocks || []).map((b) => {
                if (!b) return null;
                if (b.type === 'text') {
                    return (
                        <div
                            key={b.id}
                            className="rounded-xl border border-slate-200/90 bg-slate-50/50 p-3 text-sm text-slate-700 max-w-none [&_p]:my-1"
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
    );
}

/** Ментор / история: только чтение ответов по полям. */
export function QuestionnaireAnswersReadonly({ blocks, answersJson }) {
    const a = answersJson && typeof answersJson === 'object' ? answersJson : {};
    return (
        <div className="mt-2 space-y-4 border-t border-slate-100 pt-3">
            {(blocks || []).map((b) => {
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
    );
}
