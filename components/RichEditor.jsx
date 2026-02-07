import React, { useState } from 'react';
import { Bold, Italic, Link, List, Type } from 'lucide-react';

const RichEditor = ({ value, onChange, placeholder }) => {
    const handleCommand = (e, command, val = null) => {
        e.preventDefault(); // Prevent button from stealing focus
        document.execCommand(command, false, val);
    };

    return (
        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white/90 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
            <div className="flex items-center gap-1 p-2 border-b border-slate-100 bg-slate-50/80">
                <button onMouseDown={(e) => handleCommand(e, 'bold')} className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded" title="Жирный"><Bold size={16} /></button>
                <button onMouseDown={(e) => handleCommand(e, 'italic')} className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded" title="Курсив"><Italic size={16} /></button>
                <button onMouseDown={(e) => handleCommand(e, 'formatBlock', '<h3>')} className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded" title="Заголовок"><Type size={16} /></button>
                <button onMouseDown={(e) => handleCommand(e, 'insertUnorderedList')} className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded" title="Список"><List size={16} /></button>
                <button onMouseDown={(e) => {
                    e.preventDefault();
                    // Save selection immediately
                    const selection = window.getSelection();
                    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

                    // Use timeout to allow UI to settle, though prompt blocks
                    setTimeout(() => {
                        const url = prompt('Введите ссылку:');
                        // Restore selection and execute
                        if (range) {
                            selection.removeAllRanges();
                            selection.addRange(range);
                        }
                        if (url) {
                            document.execCommand('createLink', false, url);
                        }
                    }, 0);
                }} className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded" title="Ссылка"><Link size={16} /></button>
            </div>
            <div
                className="p-4 min-h-[150px] outline-none text-slate-700 max-w-none [&_h3]:text-xl [&_h3]:font-display [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-4 [&_a]:text-blue-700 [&_a]:underline [&_b]:font-bold [&_i]:italic [&_li]:mb-1"
                contentEditable
                dangerouslySetInnerHTML={{ __html: value }}
                onBlur={(e) => onChange(e.currentTarget.innerHTML)}
                placeholder={placeholder}
            />
        </div>
    );
};

export default RichEditor;
