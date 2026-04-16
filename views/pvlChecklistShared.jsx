import React from 'react';

export function ChecklistFieldsEditor({ sections, value, onChange, disabled }) {
    const v = value && typeof value === 'object' ? value : {};
    return (
        <div className="space-y-5">
            {(sections || []).map((sec) => (
                <div key={sec.id || sec.title} className="rounded-xl border border-[#E8D5C4]/80 bg-white/90 p-3">
                    <h4 className="text-sm font-semibold text-[#4A3728] mb-2">{sec.title}</h4>
                    <div className="space-y-3">
                        {(sec.items || []).map((item) => (
                            <label key={item.id} className="block">
                                <span className="text-xs text-slate-600">{item.prompt}</span>
                                <textarea
                                    value={v[item.id] || ''}
                                    onChange={(e) => onChange({ ...v, [item.id]: e.target.value })}
                                    disabled={disabled}
                                    rows={3}
                                    className="mt-1 w-full rounded-lg border border-[#E8D5C4] bg-white p-2 text-sm"
                                />
                            </label>
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
                    <ul className="mt-1 space-y-2">
                        {(sec.items || []).map((item) => (
                            <li key={item.id} className="text-sm">
                                <span className="text-slate-500 text-xs block">{item.prompt}</span>
                                <p className="text-slate-800 whitespace-pre-wrap mt-0.5">{a[item.id] || '—'}</p>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}
