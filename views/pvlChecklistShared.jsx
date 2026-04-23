import React from 'react';
import RichEditor from '../components/RichEditor';
import { pvlMaterialBodyClass } from './pvlMaterialBodyStyles.js';
import { pvlReadImageFileAsDataUrl, sanitizeHomeworkAnswerHtml, homeworkAnswerPlainText } from '../utils/pvlHomeworkAnswerRichText';

export function ChecklistFieldsEditor({ sections, value, onChange, disabled }) {
    const v = value && typeof value === 'object' ? value : {};
    return (
        <div className="space-y-5">
            {(sections || []).map((sec) => (
                <div key={sec.id || sec.title} className="rounded-xl border border-[#E8D5C4]/80 bg-white/90 p-3">
                    <h4 className="text-sm font-semibold text-[#4A3728] mb-2">{sec.title}</h4>
                    <div className="space-y-4">
                        {(sec.items || []).map((item) => (
                            <div key={item.id} className="block">
                                <span className="text-xs text-slate-600 block mb-1">{item.prompt}</span>
                                <RichEditor
                                    value={v[item.id] || ''}
                                    onChange={(html) => onChange({ ...v, [item.id]: html })}
                                    placeholder=""
                                    variant="student"
                                    onUploadImage={pvlReadImageFileAsDataUrl}
                                    readOnly={!!disabled}
                                    editorClassName="!min-h-[120px] !max-h-[320px] p-3"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

export function ChecklistAnswersReadonly({ sections, answersJson }) {
    const a = answersJson && typeof answersJson === 'object' ? answersJson : {};
    return (
        <div className="mt-2 space-y-4 border-t border-slate-100 pt-3">
            {(sections || []).map((sec) => (
                <div key={sec.id || sec.title}>
                    <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{sec.title}</h5>
                    <ul className="mt-1 space-y-3">
                        {(sec.items || []).map((item) => (
                            <li key={item.id} className="text-sm">
                                <span className="text-slate-500 text-xs block">{item.prompt}</span>
                                <div
                                    className={`${pvlMaterialBodyClass} mt-1 text-slate-800`}
                                    dangerouslySetInnerHTML={{
                                        __html: homeworkAnswerPlainText(a[item.id])
                                            ? sanitizeHomeworkAnswerHtml(a[item.id])
                                            : '<p class="text-slate-400">—</p>',
                                    }}
                                />
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}
