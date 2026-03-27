import React, { useRef, useState, useEffect } from 'react';
import { Bold, Italic, Link, List, ListOrdered, Type, Image, Upload } from 'lucide-react';

const RichEditor = ({ value, onChange, placeholder, onUploadImage = null }) => {
    const editorRef = useRef(null);
    const fileInputRef = useRef(null);
    const uploadSelectionRef = useRef(null);
    const [isUploading, setIsUploading] = useState(false);
    /** Предотвращает перезапись DOM из props сразу после правок пользователя (иначе «теряется» текст при сохранении без blur). */
    const skipExternalSyncRef = useRef(false);

    const sanitizeIncomingHtml = (rawHtml) => {
        const html = String(rawHtml || '');
        if (!html.trim()) return '';
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div id="root">${html}</div>`, 'text/html');
        const root = doc.getElementById('root');
        if (!root) return '';

        const allowedTags = new Set([
            'P', 'BR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
            'UL', 'OL', 'LI', 'A', 'B', 'STRONG', 'I', 'EM',
            'U', 'S', 'BLOCKQUOTE', 'PRE', 'CODE', 'IMG',
            'DIV', 'SPAN'
        ]);

        const walk = (node) => {
            Array.from(node.children || []).forEach((child) => {
                const tag = child.tagName;
                if (!allowedTags.has(tag)) {
                    const fragment = doc.createDocumentFragment();
                    while (child.firstChild) fragment.appendChild(child.firstChild);
                    child.replaceWith(fragment);
                    return;
                }

                child.removeAttribute('style');
                child.removeAttribute('class');
                child.removeAttribute('id');

                if (tag === 'A') {
                    const href = (child.getAttribute('href') || '').trim();
                    if (!/^https?:\/\//i.test(href)) {
                        child.removeAttribute('href');
                    } else {
                        child.setAttribute('href', href);
                        child.setAttribute('target', '_blank');
                        child.setAttribute('rel', 'noopener noreferrer');
                    }
                    Array.from(child.attributes).forEach((attr) => {
                        if (!['href', 'target', 'rel'].includes(attr.name)) child.removeAttribute(attr.name);
                    });
                } else if (tag === 'IMG') {
                    const src = (child.getAttribute('src') || '').trim();
                    if (!/^https?:\/\//i.test(src) && !/^data:image\//i.test(src)) {
                        child.remove();
                        return;
                    }
                    child.setAttribute('src', src);
                    Array.from(child.attributes).forEach((attr) => {
                        if (!['src', 'alt'].includes(attr.name)) child.removeAttribute(attr.name);
                    });
                } else {
                    Array.from(child.attributes).forEach((attr) => child.removeAttribute(attr.name));
                }

                walk(child);
            });
        };

        walk(root);
        return root.innerHTML;
    };

    const normalizeEditorHtml = () => {
        if (!editorRef.current) return '';
        const sanitized = sanitizeIncomingHtml(editorRef.current.innerHTML);
        if (editorRef.current.innerHTML !== sanitized) {
            editorRef.current.innerHTML = sanitized;
        }
        return sanitized;
    };

    /** Во время набора не переписываем innerHTML — иначе сбивается курсор. Сырой HTML чистится при blur и на сервере. */
    const pushToParent = () => {
        skipExternalSyncRef.current = true;
        onChange(editorRef.current ? editorRef.current.innerHTML : '');
        window.setTimeout(() => {
            skipExternalSyncRef.current = false;
        }, 0);
    };

    const flushSanitized = () => {
        skipExternalSyncRef.current = true;
        onChange(normalizeEditorHtml());
        window.setTimeout(() => {
            skipExternalSyncRef.current = false;
        }, 0);
    };

    useEffect(() => {
        if (!editorRef.current || skipExternalSyncRef.current) return;
        const sanitized = sanitizeIncomingHtml(value || '');
        if (editorRef.current.innerHTML === sanitized) return;
        editorRef.current.innerHTML = sanitized;
    }, [value]);

    const escapeHtml = (text) => String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const parseTextLineType = (line) => {
        const trimmed = String(line || '').trim();
        if (!trimmed) return { type: 'empty', value: '' };

        const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
            const lvl = Math.min(6, heading[1].length);
            return { type: 'heading', level: lvl, value: heading[2].trim() };
        }

        const ordered = trimmed.match(/^(\d+)[\.\)]\s+(.+)$/);
        if (ordered) {
            return { type: 'ol', value: ordered[2].trim() };
        }

        const unordered = trimmed.match(/^[-*•]\s+(.+)$/);
        if (unordered) {
            return { type: 'ul', value: unordered[1].trim() };
        }

        return { type: 'p', value: trimmed };
    };

    const plainTextToStructuredHtml = (text) => {
        const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
        const out = [];
        let list = null;

        const closeList = () => {
            if (!list) return;
            out.push(`<${list.type}>${list.items.join('')}</${list.type}>`);
            list = null;
        };

        for (const line of lines) {
            const token = parseTextLineType(line);
            if (token.type === 'empty') {
                closeList();
                continue;
            }

            if (token.type === 'ul' || token.type === 'ol') {
                if (!list || list.type !== token.type) {
                    closeList();
                    list = { type: token.type, items: [] };
                }
                list.items.push(`<li>${escapeHtml(token.value)}</li>`);
                continue;
            }

            closeList();
            if (token.type === 'heading') {
                out.push(`<h${token.level}>${escapeHtml(token.value)}</h${token.level}>`);
            } else {
                out.push(`<p>${escapeHtml(token.value)}</p>`);
            }
        }

        closeList();
        return out.join('');
    };

    const saveSelection = () => {
        const selection = window.getSelection();
        return selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
    };

    const restoreSelection = (range) => {
        if (!range) return;
        const selection = window.getSelection();
        if (!selection) return;
        selection.removeAllRanges();
        selection.addRange(range);
    };

    const handleCommand = (e, command, val = null) => {
        e.preventDefault();
        document.execCommand(command, false, val);
        pushToParent();
    };

    const handleInsertImageByUrl = (e) => {
        e.preventDefault();
        const range = saveSelection();
        setTimeout(() => {
            const url = prompt('Введите ссылку на изображение:');
            if (!url) return;
            const trimmed = url.trim();
            if (!/^https?:\/\//i.test(trimmed)) return;
            restoreSelection(range);
            document.execCommand('insertImage', false, trimmed);
            flushSanitized();
        }, 0);
    };

    const handleUploadImage = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !onUploadImage) return;

        const range = uploadSelectionRef.current || saveSelection();
        setIsUploading(true);
        try {
            const url = await onUploadImage(file);
            if (!url) return;
            restoreSelection(range);
            document.execCommand('insertImage', false, url);
            flushSanitized();
        } catch (error) {
            console.error('Rich image upload failed:', error);
            alert('Не удалось загрузить изображение');
        } finally {
            uploadSelectionRef.current = null;
            setIsUploading(false);
        }
    };

    const handlePaste = (e) => {
        const html = e.clipboardData?.getData('text/html') || '';
        const text = e.clipboardData?.getData('text/plain') || '';
        if (!html && !text) return;
        e.preventDefault();
        const normalized = html
            ? sanitizeIncomingHtml(html)
            : plainTextToStructuredHtml(text);
        document.execCommand('insertHTML', false, normalized);
        flushSanitized();
    };

    return (
        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white/90 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 p-2 border-b border-slate-100 bg-slate-50/95 backdrop-blur supports-[backdrop-filter]:bg-slate-50/80">
                <button type="button" onMouseDown={(e) => handleCommand(e, 'bold')} className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded" title="Жирный"><Bold size={16} /></button>
                <button type="button" onMouseDown={(e) => handleCommand(e, 'italic')} className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded" title="Курсив"><Italic size={16} /></button>
                <button type="button" onMouseDown={(e) => handleCommand(e, 'formatBlock', '<h3>')} className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded" title="Заголовок"><Type size={16} /></button>
                <button type="button" onMouseDown={(e) => handleCommand(e, 'insertUnorderedList')} className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded" title="Маркированный список"><List size={16} /></button>
                <button type="button" onMouseDown={(e) => handleCommand(e, 'insertOrderedList')} className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded" title="Нумерованный список"><ListOrdered size={16} /></button>
                <button type="button" onMouseDown={(e) => {
                    e.preventDefault();
                    const selection = window.getSelection();
                    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

                    setTimeout(() => {
                        const url = prompt('Введите ссылку:');
                        if (range) {
                            selection.removeAllRanges();
                            selection.addRange(range);
                        }
                        if (url) {
                            document.execCommand('createLink', false, url);
                            flushSanitized();
                        }
                    }, 0);
                }} className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded" title="Ссылка"><Link size={16} /></button>
                <button type="button" onMouseDown={handleInsertImageByUrl} className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded" title="Изображение по ссылке"><Image size={16} /></button>
                <button
                    type="button"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        uploadSelectionRef.current = saveSelection();
                        if (!isUploading) fileInputRef.current?.click();
                    }}
                    className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded disabled:opacity-50"
                    title={isUploading ? 'Загрузка...' : 'Загрузить изображение'}
                    disabled={isUploading || !onUploadImage}
                >
                    <Upload size={16} />
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleUploadImage}
                />
            </div>
            <div
                ref={editorRef}
                className="p-4 min-h-[220px] max-h-[420px] overflow-y-auto outline-none text-slate-700 max-w-none [&_h3]:text-xl [&_h3]:font-display [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-4 [&_a]:text-blue-700 [&_a]:underline [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_li]:mb-1"
                contentEditable
                suppressContentEditableWarning
                data-placeholder={placeholder || ''}
                onInput={pushToParent}
                onBlur={flushSanitized}
                onPaste={handlePaste}
            />
            <style>{`
                [data-placeholder]:empty:before {
                    content: attr(data-placeholder);
                    color: rgb(148 163 184);
                    pointer-events: none;
                }
            `}</style>
        </div>
    );
};

export default RichEditor;
