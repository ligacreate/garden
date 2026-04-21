import React, { useRef, useState, useEffect } from 'react';
import { Bold, Italic, Underline, Link, List, ListOrdered, Type, Image, Upload, Table } from 'lucide-react';
import { stripMsOfficeHtmlNoise } from '../utils/pvlHomeworkAnswerRichText';

const RichEditor = ({
    value,
    onChange,
    placeholder,
    onUploadImage = null,
    /** `student` — без вставки картинки по URL, только загрузка файла (data URL). */
    variant = 'default',
    readOnly = false,
    editorClassName = '',
}) => {
    const editorRef = useRef(null);
    const fileInputRef = useRef(null);
    const uploadSelectionRef = useRef(null);
    const [isUploading, setIsUploading] = useState(false);
    /** Предотвращает перезапись DOM из props сразу после правок пользователя (иначе «теряется» текст при сохранении без blur). */
    const skipExternalSyncRef = useRef(false);

    /** Word/браузер вставляют HTML-комментарии; они не попадают в `.children`, поэтому раньше «залипали» в innerHTML. */
    const removeHtmlCommentNodes = (rootNode) => {
        if (!rootNode?.ownerDocument) return;
        const doc = rootNode.ownerDocument;
        const tw = doc.createTreeWalker(rootNode, NodeFilter.SHOW_COMMENT);
        const dead = [];
        while (tw.nextNode()) dead.push(tw.currentNode);
        dead.forEach((n) => n.parentNode?.removeChild(n));
    };

    const sanitizeIncomingHtml = (rawHtml) => {
        const html = stripMsOfficeHtmlNoise(String(rawHtml || ''));
        if (!html.trim()) return '';
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div id="root">${html}</div>`, 'text/html');
        const root = doc.getElementById('root');
        if (!root) return '';
        removeHtmlCommentNodes(root);

        const allowedTags = new Set([
            'P', 'BR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
            'UL', 'OL', 'LI', 'A', 'B', 'STRONG', 'I', 'EM',
            'U', 'S', 'BLOCKQUOTE', 'PRE', 'CODE', 'IMG',
            'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
            'DIV', 'SPAN'
        ]);

        const styleToSemantic = (node) => {
            const style = String(node?.getAttribute?.('style') || '').toLowerCase();
            const className = String(node?.getAttribute?.('class') || '').toLowerCase();
            if (!style && !className) return node;

            const parseFontSizePx = () => {
                const m = style.match(/font-size\s*:\s*([\d.]+)\s*(px|pt)/);
                if (!m) return null;
                const value = parseFloat(m[1]);
                if (!Number.isFinite(value)) return null;
                return m[2] === 'pt' ? value * 1.333 : value;
            };

            const replaceTag = (sourceNode, nextTag) => {
                if (!sourceNode || sourceNode.tagName === nextTag.toUpperCase()) return sourceNode;
                const replacement = doc.createElement(nextTag);
                while (sourceNode.firstChild) replacement.appendChild(sourceNode.firstChild);
                sourceNode.replaceWith(replacement);
                return replacement;
            };

            let current = node;
            const sizePx = parseFontSizePx();
            const isBold = /font-weight\s*:\s*(bold|[6-9]00)/.test(style);
            const isItalic = /font-style\s*:\s*italic/.test(style);
            const isBlock = ['DIV', 'P', 'SPAN'].includes(current.tagName);
            const classLooksHeading = /(heading|title|subtitle|msoheading|ql-size-huge|ql-size-large)/.test(className);

            if (isBlock && (sizePx != null || classLooksHeading)) {
                if (sizePx >= 24) current = replaceTag(current, 'h2');
                else if (sizePx >= 19) current = replaceTag(current, 'h3');
                else if (sizePx >= 16 && isBold) current = replaceTag(current, 'h4');
                else if (classLooksHeading && isBold) current = replaceTag(current, 'h3');
            }

            if (current.tagName === 'SPAN' && isBold) current = replaceTag(current, 'strong');
            if (current.tagName === 'SPAN' && isItalic) current = replaceTag(current, 'em');

            return current;
        };

        const walk = (node) => {
            Array.from(node.children || []).forEach((child) => {
                let current = styleToSemantic(child);
                const tag = current.tagName;
                if (!allowedTags.has(tag)) {
                    const fragment = doc.createDocumentFragment();
                    while (current.firstChild) fragment.appendChild(current.firstChild);
                    current.replaceWith(fragment);
                    return;
                }

                current.removeAttribute('style');
                current.removeAttribute('class');
                current.removeAttribute('id');

                if (tag === 'A') {
                    const href = (current.getAttribute('href') || '').trim();
                    if (!/^https?:\/\//i.test(href)) {
                        current.removeAttribute('href');
                    } else {
                        current.setAttribute('href', href);
                        current.setAttribute('target', '_blank');
                        current.setAttribute('rel', 'noopener noreferrer');
                    }
                    Array.from(current.attributes).forEach((attr) => {
                        if (!['href', 'target', 'rel'].includes(attr.name)) current.removeAttribute(attr.name);
                    });
                } else if (tag === 'IMG') {
                    const src = (current.getAttribute('src') || '').trim();
                    if (!/^https?:\/\//i.test(src) && !/^data:image\//i.test(src)) {
                        current.remove();
                        return;
                    }
                    current.setAttribute('src', src);
                    Array.from(current.attributes).forEach((attr) => {
                        if (!['src', 'alt'].includes(attr.name)) current.removeAttribute(attr.name);
                    });
                } else if (tag === 'INPUT') {
                    // Checklists from Notion/Docs often have checkbox inputs in list items.
                    current.remove();
                    return;
                } else if (tag === 'TD' || tag === 'TH') {
                    const colspan = current.getAttribute('colspan');
                    const rowspan = current.getAttribute('rowspan');
                    Array.from(current.attributes).forEach((attr) => current.removeAttribute(attr.name));
                    if (colspan && /^\d+$/.test(colspan)) current.setAttribute('colspan', colspan);
                    if (rowspan && /^\d+$/.test(rowspan)) current.setAttribute('rowspan', rowspan);
                } else {
                    Array.from(current.attributes).forEach((attr) => current.removeAttribute(attr.name));
                }

                walk(current);
            });
        };

        // Pre-normalize common foreign clipboard structures before attribute cleanup.
        Array.from(root.querySelectorAll('p,div')).forEach((el) => {
            const className = String(el.getAttribute('class') || '').toLowerCase();
            if (/(heading|title|subtitle|msoheading)/.test(className) && el.tagName !== 'H2' && el.tagName !== 'H3') {
                const heading = doc.createElement('h3');
                while (el.firstChild) heading.appendChild(el.firstChild);
                el.replaceWith(heading);
            }
        });

        // Flatten nested block containers from Office/Notion exports where possible.
        Array.from(root.querySelectorAll('div')).forEach((div) => {
            const hasOnlyInlineChildren = Array.from(div.children).every((c) => ['SPAN', 'A', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'BR'].includes(c.tagName));
            if (hasOnlyInlineChildren && div.parentElement && !['LI', 'TD', 'TH'].includes(div.parentElement.tagName)) {
                const p = doc.createElement('p');
                while (div.firstChild) p.appendChild(div.firstChild);
                div.replaceWith(p);
            }
        });

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
        const normalizedText = String(text || '').replace(/\r\n/g, '\n');
        const tableRows = normalizedText
            .split('\n')
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);

        // Excel / Google Sheets usually copy as tab-separated rows.
        if (tableRows.length >= 2 && tableRows.every((line) => line.includes('\t'))) {
            const matrix = tableRows.map((line) => line.split('\t').map((cell) => cell.trim()));
            const colCount = matrix[0]?.length || 0;
            const isRectangular = colCount > 1 && matrix.every((row) => row.length === colCount);
            if (isRectangular) {
                const head = matrix[0].map((cell) => `<th>${escapeHtml(cell)}</th>`).join('');
                const body = matrix
                    .slice(1)
                    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
                    .join('');
                return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
            }
        }

        const lines = normalizedText.split('\n');
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

    const handleKeyDown = (e) => {
        if (e.key !== 'Enter') return;
        // Unify Enter and Shift+Enter: always create a new paragraph block.
        e.preventDefault();
        document.execCommand('insertParagraph');
        pushToParent();
    };

    const handleInsertTable = (e) => {
        e.preventDefault();
        const rows = Math.min(20, Math.max(1, parseInt(prompt('Сколько строк? (1-20)', '3') || '3', 10) || 3));
        const cols = Math.min(10, Math.max(1, parseInt(prompt('Сколько колонок? (1-10)', '2') || '2', 10) || 2));
        const theadCells = Array.from({ length: cols }, (_, i) => `<th>Колонка ${i + 1}</th>`).join('');
        const bodyRows = Array.from({ length: rows - 1 }, () => `<tr>${Array.from({ length: cols }, () => '<td><br></td>').join('')}</tr>`).join('');
        const html = `<table><thead><tr>${theadCells}</tr></thead><tbody>${bodyRows || `<tr>${Array.from({ length: cols }, () => '<td><br></td>').join('')}</tr>`}</tbody></table><p><br></p>`;
        document.execCommand('insertHTML', false, html);
        flushSanitized();
    };

    return (
        <div className={`border border-slate-200 rounded-2xl overflow-hidden bg-white/90 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all ${readOnly ? 'opacity-90' : ''}`}>
            <div className={`sticky top-0 z-10 flex flex-wrap items-center gap-1 p-2 border-b border-slate-100 bg-slate-50/95 backdrop-blur supports-[backdrop-filter]:bg-slate-50/80 ${readOnly ? 'pointer-events-none opacity-60' : ''}`}>
                <button type="button" onMouseDown={(e) => handleCommand(e, 'bold')} className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded" title="Жирный"><Bold size={16} /></button>
                <button type="button" onMouseDown={(e) => handleCommand(e, 'italic')} className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded" title="Курсив"><Italic size={16} /></button>
                <button type="button" onMouseDown={(e) => handleCommand(e, 'underline')} className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded" title="Подчёркивание"><Underline size={16} /></button>
                <button type="button" onMouseDown={(e) => handleCommand(e, 'formatBlock', '<h2>')} className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded" title="Заголовок H2">H2</button>
                <button type="button" onMouseDown={(e) => handleCommand(e, 'formatBlock', '<h3>')} className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded" title="Подзаголовок H3"><Type size={16} /></button>
                <button type="button" onMouseDown={(e) => handleCommand(e, 'insertUnorderedList')} className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded" title="Маркированный список"><List size={16} /></button>
                <button type="button" onMouseDown={(e) => handleCommand(e, 'insertOrderedList')} className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded" title="Нумерованный список"><ListOrdered size={16} /></button>
                <button type="button" onMouseDown={handleInsertTable} className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded" title="Таблица"><Table size={16} /></button>
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
                {variant !== 'student' ? (
                    <button type="button" onMouseDown={handleInsertImageByUrl} className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded" title="Изображение по ссылке"><Image size={16} /></button>
                ) : null}
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
                className={`p-4 min-h-[220px] max-h-[420px] overflow-y-auto outline-none text-slate-700 max-w-none [&_h2]:text-2xl [&_h2]:font-display [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h3]:text-xl [&_h3]:font-display [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-4 [&_a]:text-blue-700 [&_a]:underline [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_p]:my-2 [&_p]:leading-relaxed [&_div]:my-2 [&_div]:leading-relaxed [&_li]:mb-1 [&_table]:w-full [&_table]:border-collapse [&_table]:my-4 [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-1.5 [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1.5 [&_img]:max-w-full [&_img]:h-auto ${editorClassName}`}
                contentEditable={!readOnly}
                suppressContentEditableWarning
                data-placeholder={placeholder || ''}
                onInput={pushToParent}
                onBlur={flushSanitized}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
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
