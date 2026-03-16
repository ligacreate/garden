import React, { useState, useEffect, useMemo } from 'react';
import { jsPDF } from "jspdf";
import html2canvas from 'html2canvas';
import { FileText, Download, Plus, X, Printer, Leaf, ArrowUp, ArrowDown, Save, FolderOpen, Trash2, Globe, Layout, GripVertical, PenLine, Upload } from 'lucide-react';
import Button from '../components/Button';
import { api } from '../services/dataService';
import ConfirmationModal from '../components/ConfirmationModal';
import ModalShell from '../components/ModalShell';
import DOMPurify from 'dompurify';

const CheckBoxLine = ({ text }) => (
    <div className="flex items-start gap-4 mb-3">
        <div className="w-5 h-5 rounded border-2 border-slate-300 flex-shrink-0 mt-0.5"></div>
        <div className="text-slate-700 leading-snug">{text}</div>
    </div>
);

const escapeHtml = (text) => String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const splitUrlAndPunctuation = (raw) => {
    const match = raw.match(/^(.*?)([),.;!?]+)?$/);
    const core = (match?.[1] || raw).trim();
    const trailing = match?.[2] || '';
    return { core, trailing };
};

const linkifyEscapedText = (escapedText) => {
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    return escapedText.replace(urlRegex, (raw) => {
        const { core, trailing } = splitUrlAndPunctuation(raw);
        if (!core) return raw;
        return `<a href="${core}" target="_blank" rel="noopener noreferrer">${core}</a>${trailing}`;
    });
};

const plainTextToHtml = (text) => {
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let inList = false;

    lines.forEach((line) => {
        const trimmed = line.trim();
        const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);

        if (!trimmed) {
            if (inList) {
                html.push('</ul>');
                inList = false;
            }
            html.push('<p><br /></p>');
            return;
        }

        if (bulletMatch) {
            if (!inList) {
                html.push('<ul>');
                inList = true;
            }
            const escaped = escapeHtml(bulletMatch[1]);
            html.push(`<li>${linkifyEscapedText(escaped)}</li>`);
            return;
        }

        if (inList) {
            html.push('</ul>');
            inList = false;
        }

        const escaped = escapeHtml(line);
        html.push(`<p>${linkifyEscapedText(escaped)}</p>`);
    });

    if (inList) html.push('</ul>');
    return html.join('');
};

const enhanceLinksInHtml = (html) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="root">${html}</div>`, 'text/html');
    const root = doc.getElementById('root');
    if (!root) return html;

    const textNodes = [];
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
        textNodes.push(node);
        node = walker.nextNode();
    }

    textNodes.forEach((textNode) => {
        const parentEl = textNode.parentElement;
        const value = textNode.nodeValue || '';
        if (!value || !parentEl || parentEl.closest('a')) return;
        if (!/(https?:\/\/[^\s<]+)/.test(value)) return;

        const frag = doc.createDocumentFragment();
        const parts = value.split(/(https?:\/\/[^\s<]+)/g);

        parts.forEach((part) => {
            if (!part) return;
            if (/^https?:\/\/[^\s<]+$/.test(part)) {
                const { core, trailing } = splitUrlAndPunctuation(part);
                if (core) {
                    const a = doc.createElement('a');
                    a.href = core;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.textContent = core;
                    frag.appendChild(a);
                    if (trailing) frag.appendChild(doc.createTextNode(trailing));
                } else {
                    frag.appendChild(doc.createTextNode(part));
                }
            } else {
                frag.appendChild(doc.createTextNode(part));
            }
        });

        textNode.parentNode?.replaceChild(frag, textNode);
    });

    return root.innerHTML;
};

const formatMaterialContent = (content) => {
    const raw = String(content || '').trim();
    if (!raw) return '<p>Материал в процессе подготовки.</p>';

    const hasHtmlTags = /<\/?[a-z][\s\S]*>/i.test(raw);
    const baseHtml = hasHtmlTags ? raw : plainTextToHtml(raw);
    const sanitized = DOMPurify.sanitize(baseHtml);
    const withLinks = enhanceLinksInHtml(sanitized);
    return DOMPurify.sanitize(withLinks, {
        ADD_ATTR: ['target', 'rel'],
        FORBID_TAGS: ['style', 'script']
    });
};

const DocumentPreviewModal = ({ type, timeline, title, user, onClose, onNotify, extraAction, materialContentHtml, materialTags = [] }) => {
    return (
        <ModalShell
            isOpen
            onClose={onClose}
            size="lg"
            title={type === 'workbook' ? 'Воркбук участницы' : (type === 'material' ? 'Материал сценария' : 'Сценарий ведущей')}
            description="Предпросмотр документа"
        >
            <div className="flex justify-end gap-2 mb-4">
                {type !== 'material' && (
                    <Button variant="ghost" className="!px-3 !py-2 text-xs" icon={Download} onClick={async () => {
                            try {
                                const element = document.getElementById('preview-content');
                                if (!element) throw new Error('Preview content not found');

                                const safeTitle = (title || (type === 'workbook' ? 'workbook' : 'scenario')).replace(/[^a-zа-яё0-9\s.-]/gi, '_').trim();
                                const filename = `${safeTitle}.pdf`;

                                onNotify('Генерация PDF...');

                                const original = document.getElementById('preview-content');
                                const clone = original.cloneNode(true);

                                Object.assign(clone.style, {
                                    position: 'absolute',
                                    top: '-9999px',
                                    left: '0',
                                    width: '800px',
                                    height: 'auto',
                                    overflow: 'visible',
                                    maxHeight: 'none'
                                });
                                document.body.appendChild(clone);

                                const canvas = await html2canvas(clone, {
                                    scale: 2,
                                    useCORS: true,
                                    logging: false,
                                    windowWidth: 800
                                });

                                document.body.removeChild(clone);

                                const imgData = canvas.toDataURL('image/jpeg', 0.98);
                                const pdfWidth = 190;
                                const pageHeight = 297;
                                const imgProps = { width: canvas.width, height: canvas.height };
                                const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

                                const doc = new jsPDF('p', 'mm', 'a4');

                                let heightLeft = pdfHeight;
                                let position = 10;

                                doc.addImage(imgData, 'JPEG', 10, position, pdfWidth, pdfHeight);
                                heightLeft -= (pageHeight - 20);

                                while (heightLeft > 0) {
                                    position -= 297;
                                    doc.addPage();
                                    doc.addImage(imgData, 'JPEG', 10, position, pdfWidth, pdfHeight);
                                    heightLeft -= 297;
                                }

                                doc.save(filename);

                            } catch (e) {
                                console.error('PDF Error:', e);
                                alert('Ошибка при создании PDF: ' + e.message);
                            }
                        }}>PDF</Button>
                )}
                {type !== 'material' && (
                    <Button variant="secondary" className="!px-3 !py-2 text-xs" icon={Printer} onClick={() => {
                            try {
                                onNotify('Подготовка к печати...');
                                const content = document.getElementById('preview-content');
                                if (!content) throw new Error('Content not found');

                                const iframe = document.createElement('iframe');
                                iframe.style.position = 'fixed';
                                iframe.style.right = '0';
                                iframe.style.bottom = '0';
                                iframe.style.width = '0';
                                iframe.style.height = '0';
                                iframe.style.border = '0';
                                document.body.appendChild(iframe);

                                const doc = iframe.contentWindow.document;
                                const styles = document.querySelectorAll('style, link[rel="stylesheet"]');
                                styles.forEach(s => doc.head.appendChild(s.cloneNode(true)));

                                doc.body.innerHTML = content.innerHTML;
                                doc.body.className = 'p-8 bg-white text-black';

                                setTimeout(() => {
                                    iframe.contentWindow.focus();
                                    iframe.contentWindow.print();
                                    setTimeout(() => document.body.removeChild(iframe), 5000);
                                }, 1000);
                            } catch (e) {
                                console.error('Print Error:', e);
                                alert('Ошибка печати: ' + e.message);
                            }
                        }}>Печать</Button>
                )}
                {type !== 'material' && extraAction}
                <Button variant="ghost" className="!px-3 !py-2 text-xs" icon={X} onClick={onClose}>Закрыть</Button>
            </div>
            <div id="preview-content" className="max-h-[70vh] overflow-y-auto p-6 bg-white text-slate-800">
                    {type === 'workbook' ? (
                        <div className="space-y-12 max-w-md mx-auto">
                            <div className="text-center space-y-4 border-b pb-8">
                                <div className="w-16 h-16 mx-auto bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mb-4"><Leaf size={32} /></div>
                                <h1 className="text-3xl font-serif italic text-slate-900">{title || 'Мой путь'}</h1>
                                <p className="text-slate-400 uppercase tracking-widest text-xs">Рабочая тетрадь встречи</p>
                            </div>
                            {timeline.map((item, i) => (
                                <div key={i} className="space-y-4 break-inside-avoid">
                                    <h3 className="text-lg font-medium flex items-center gap-3 text-slate-800"><span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">{i + 1}</span>{item.title}</h3>
                                    <div className="h-32 border border-slate-100 bg-slate-50/50 rounded-2xl p-4 text-slate-300 text-sm italic">
                                        <div className="border-b border-slate-200 h-6 mb-6"></div><div className="border-b border-slate-200 h-6 mb-6"></div><div className="border-b border-slate-200 h-6"></div>
                                    </div>
                                </div>
                            ))}
                            <div className="text-center pt-8 text-xs text-slate-400 font-serif italic">С любовью, {user.name}</div>
                        </div>
                    ) : type === 'material' ? (
                        <div className="max-w-4xl mx-auto">
                            <div className="mb-6 border-b border-slate-100 pb-4">
                                <div className="text-xs uppercase tracking-wider text-slate-400">Материал</div>
                                <div className="text-2xl font-medium text-slate-900">{title || 'Без названия'}</div>
                                <div className="text-xs text-slate-400 mt-1">Сценарии лиги</div>
                            </div>
                            <div className="flex flex-wrap gap-2 mb-6">
                                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">Сценарий</span>
                                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Документ</span>
                                {materialTags.map((tag) => (
                                    <span key={tag} className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{tag}</span>
                                ))}
                            </div>
                            <div
                                className="prose prose-slate max-w-none text-sm [&_a]:text-blue-700 [&_a]:underline [&_a]:break-all [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_li]:my-1 [&_img]:w-full [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-2xl [&_img]:my-4 [&_img]:border [&_img]:border-slate-200"
                                dangerouslySetInnerHTML={{ __html: materialContentHtml || '<p>Материал в процессе подготовки.</p>' }}
                            />
                            <div className="border-t border-slate-100 pt-5 mt-8 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap gap-2">
                                    <Button variant="primary" className="!px-3 !py-2 text-xs" icon={Download} onClick={async () => {
                                        try {
                                            const element = document.getElementById('preview-content');
                                            if (!element) throw new Error('Preview content not found');

                                            const safeTitle = (title || 'scenario').replace(/[^a-zа-яё0-9\s.-]/gi, '_').trim();
                                            const filename = `${safeTitle}.pdf`;

                                            onNotify('Генерация PDF...');
                                            const clone = element.cloneNode(true);
                                            Object.assign(clone.style, {
                                                position: 'absolute',
                                                top: '-9999px',
                                                left: '0',
                                                width: '800px',
                                                height: 'auto',
                                                overflow: 'visible',
                                                maxHeight: 'none'
                                            });
                                            document.body.appendChild(clone);
                                            const canvas = await html2canvas(clone, {
                                                scale: 2,
                                                useCORS: true,
                                                logging: false,
                                                windowWidth: 800
                                            });
                                            document.body.removeChild(clone);

                                            const imgData = canvas.toDataURL('image/jpeg', 0.98);
                                            const pdfWidth = 190;
                                            const pageHeight = 297;
                                            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
                                            const doc = new jsPDF('p', 'mm', 'a4');
                                            let heightLeft = pdfHeight;
                                            let position = 10;

                                            doc.addImage(imgData, 'JPEG', 10, position, pdfWidth, pdfHeight);
                                            heightLeft -= (pageHeight - 20);
                                            while (heightLeft > 0) {
                                                position -= 297;
                                                doc.addPage();
                                                doc.addImage(imgData, 'JPEG', 10, position, pdfWidth, pdfHeight);
                                                heightLeft -= 297;
                                            }
                                            doc.save(filename);
                                        } catch (e) {
                                            console.error('PDF Error:', e);
                                            alert('Ошибка при создании PDF: ' + e.message);
                                        }
                                    }}>
                                        PDF
                                    </Button>
                                    <Button variant="secondary" className="!px-3 !py-2 text-xs" icon={Printer} onClick={() => {
                                        try {
                                            onNotify('Подготовка к печати...');
                                            const content = document.getElementById('preview-content');
                                            if (!content) throw new Error('Content not found');

                                            const iframe = document.createElement('iframe');
                                            iframe.style.position = 'fixed';
                                            iframe.style.right = '0';
                                            iframe.style.bottom = '0';
                                            iframe.style.width = '0';
                                            iframe.style.height = '0';
                                            iframe.style.border = '0';
                                            document.body.appendChild(iframe);

                                            const doc = iframe.contentWindow.document;
                                            const styles = document.querySelectorAll('style, link[rel="stylesheet"]');
                                            styles.forEach(s => doc.head.appendChild(s.cloneNode(true)));

                                            doc.body.innerHTML = content.innerHTML;
                                            doc.body.className = 'p-8 bg-white text-black';

                                            setTimeout(() => {
                                                iframe.contentWindow.focus();
                                                iframe.contentWindow.print();
                                                setTimeout(() => document.body.removeChild(iframe), 5000);
                                            }, 1000);
                                        } catch (e) {
                                            console.error('Print Error:', e);
                                            alert('Ошибка печати: ' + e.message);
                                        }
                                    }}>
                                        Печать
                                    </Button>
                                </div>
                                {extraAction}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-8 font-sans max-w-xl mx-auto">
                            <div className="bg-slate-900 text-white p-6 rounded-3xl mb-8 flex justify-between items-center">
                                <div>
                                    <h2 className="text-xl font-bold mb-1">Сценарий встречи</h2>
                                    <div className="text-slate-400 text-xs text-slate-300">Ведущая: {user.name}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-slate-400 text-xs uppercase tracking-widest">Время</div>
                                    <span className="text-white font-mono text-xl">{timeline.reduce((acc, i) => acc + (parseInt(i.time) || 0), 0) + 40} мин</span>
                                </div>
                            </div>

                            <div className="mb-8">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4 border-b pb-2 flex justify-between"><span>Начало встречи</span><span>20 мин</span></h3>
                                <CheckBoxLine text="Рассказ про Издательство, блокноты Tesoro notes, встречи" />
                                <CheckBoxLine text="Правила встречи, техника безопасности" />
                                <CheckBoxLine text="Узнать, не против ли участницы общего фото и видеосъемки" />
                                <CheckBoxLine text="Настройка (заземление, медитация, дыхание)" />
                                <CheckBoxLine text="Введение в тему" />
                                <CheckBoxLine text="Знакомство с участницами" />
                            </div>

                            <div className="relative border-l-2 border-slate-100 ml-3 space-y-8 pb-8">
                                {timeline.map((item, i) => (
                                    <div key={i} className="pl-8 relative break-inside-avoid">
                                        <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-4 border-blue-500" />
                                        <div className="flex items-baseline justify-between mb-1"><h3 className="font-bold text-slate-900 text-lg">{item.title}</h3><span className="font-mono text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded">{item.time}</span></div>
                                        <div className="mb-3"><span className="text-[10px] uppercase tracking-wider text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded">{item.type}</span></div>
                                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-sm text-slate-600 leading-relaxed">{item.description || "Нет описания для этой практики."}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-8 pt-8 border-t-2 border-slate-100">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4 border-b pb-2 flex justify-between"><span>Завершение встречи</span><span>20 мин</span></h3>
                                <CheckBoxLine text="Рефлексивный отклик по завтраку (письменно/устно)" />
                                <CheckBoxLine text="Формулирование намерений (2–3 шага)" />
                                <CheckBoxLine text="Сбор отзывов (устно, письменно, видео)" />
                                <CheckBoxLine text="Сделать общее фото (если все согласны)" />
                                <CheckBoxLine text="Анонс следующей встречи (дата, тема)" />
                                <CheckBoxLine text="Предложение абонемента / сертификата / Tesoro notes" />
                                <CheckBoxLine text="Подведение итогов от ведущей" />
                            </div>
                        </div>
                    )}
            </div>
        </ModalShell>
    )
};

const SaveScenarioModal = ({ onSave, checkActionTimer, onClose, user, onNotify }) => {
    const [title, setTitle] = useState(`Встреча ${new Date().toLocaleDateString()}`);
    const [isPublic, setIsPublic] = useState(false);

    const canPublish = user?.role !== 'applicant' && user?.role !== 'intern';

    return (
        <ModalShell isOpen onClose={onClose} title="Сохранить сценарий" size="sm">
            <input
                autoFocus
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-slate-700"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Название сценария"
            />

                {canPublish ? (
                    <div onClick={() => setIsPublic(!isPublic)} className="flex items-center gap-3 mb-6 cursor-pointer p-2 hover:bg-slate-50 rounded-xl transition-colors">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${isPublic ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                            {isPublic && <div className="w-2 h-2 bg-white rounded-full" />}
                        </div>
                        <div className="flex-1">
                            <div className="text-sm font-medium text-slate-700">Опубликовать в Лиге</div>
                            <div className="text-xs text-slate-400">Сценарий будет виден всем ведущим</div>
                        </div>
                    </div>
                ) : (
                    <div
                        className="flex items-center gap-3 mb-6 p-2 opacity-50 cursor-not-allowed"
                        onClick={() => onNotify && onNotify("Публикация в Лиге станет доступна, когда вы получите роль ведущей. Сейчас можно сохранить сценарий только себе.")}
                    >
                        <div className="w-5 h-5 rounded border-2 border-slate-200 flex items-center justify-center"></div>
                        <div className="flex-1">
                            <div className="text-sm font-medium text-slate-400">Опубликовать в Лиге</div>
                            <div className="text-xs text-slate-400">Доступно для ведущих</div>
                        </div>
                    </div>
                )}

            <div className="flex gap-2">
                <Button variant="secondary" onClick={onClose}>Отмена</Button>
                <Button onClick={() => onSave(title, isPublic)} disabled={!title.trim()}>Сохранить</Button>
            </div>
        </ModalShell>
    );
};

const ScenarioList = ({ scenarios, variant, onLoad, onDelete, emptyMessage }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
        {scenarios.length === 0 ? <p className="text-slate-400 col-span-full text-center py-20">{emptyMessage}</p> :
            scenarios.map(s => (
                <div key={s.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group h-full">
                    <div onClick={() => onLoad(s)} className="cursor-pointer flex-1">
                        <h3 className="font-medium text-lg text-slate-800 mb-2 group-hover:text-blue-600 transition-colors line-clamp-2">{s.title || 'Без названия'}</h3>
                        <div className="flex flex-wrap gap-2 text-xs text-slate-400 mb-4">
                            <span>{new Date(s.created_at).toLocaleDateString()}</span>
                            <span>•</span>
                            <span>{s.timeline.length} практик</span>
                        </div>
                        {variant !== 'league' && (
                            <div className="text-xs text-slate-400 line-clamp-3 italic">
                                {s.timeline.slice(0, 3).map(i => i.title).join(', ')}{s.timeline.length > 3 ? '...' : ''}
                            </div>
                        )}
                    </div>
                    <div className="pt-4 border-t border-slate-50 flex justify-between items-center mt-4">
                        <Button variant="ghost" onClick={() => onLoad(s)} className="!text-blue-600 !px-0 text-xs font-medium hover:!bg-transparent">
                            {variant === 'league' ? 'Открыть как материал' : 'Открыть'}
                        </Button>
                        {variant === 'my' && (
                            <Button variant="ghost" onClick={(e) => { e.stopPropagation(); onDelete(s.id); }} className="!text-rose-400 hover:!bg-rose-50 !py-1 !px-3 text-xs" icon={Trash2}>Удалить</Button>
                        )}
                    </div>
                </div>
            ))
        }
        {scenarios.length > 0 && (
            <div className="col-span-full text-center text-xs text-slate-300 mt-8 mb-8">
                Показано {scenarios.length} сценариев
            </div>
        )}
    </div>
);

const ImportScenarioModal = ({ onImport, onClose }) => {
    const [text, setText] = useState('');
    const [replaceCurrent, setReplaceCurrent] = useState(false);

    return (
        <ModalShell isOpen onClose={onClose} title="Быстрый импорт сценария" size="md">
            <p className="text-sm text-slate-500 mb-3">
                Вставьте готовый сценарий текстом: по одному шагу на строку. Можно указывать время, например: `15 мин - Приветствие`.
            </p>
            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={"15 мин - Приветствие\n20 мин - Практика: Письмо себе\n10 мин - Рефлексия"}
                className="w-full h-52 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            />
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                <input
                    type="checkbox"
                    checked={replaceCurrent}
                    onChange={(e) => setReplaceCurrent(e.target.checked)}
                />
                Заменить текущий таймлайн
            </label>
            <div className="mt-4 flex gap-2 justify-end">
                <Button variant="secondary" onClick={onClose}>Отмена</Button>
                <Button
                    onClick={() => onImport(text, replaceCurrent)}
                    disabled={!text.trim()}
                >
                    Импортировать
                </Button>
            </div>
        </ModalShell>
    );
};

const BuilderView = ({ practices, timeline, setTimeline, onNotify, user, onSave, onCompleteLeagueScenario }) => {
    const [activeTab, setActiveTab] = useState('builder'); // 'builder', 'my', 'league'
    const [previewType, setPreviewType] = useState(null);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [scenarioTitle, setScenarioTitle] = useState('');
    const [timeFilter, setTimeFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [practiceSearch, setPracticeSearch] = useState('');
    const [deleteConfirmation, setDeleteConfirmation] = useState({ isOpen: false, scenarioId: null });
    const [dragOverIndex, setDragOverIndex] = useState(null);
    const [draggedTimelineId, setDraggedTimelineId] = useState(null);
    const [isDraggingFromLibrary, setIsDraggingFromLibrary] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [leaguePreviewScenario, setLeaguePreviewScenario] = useState(null);
    const [isCompletingLeagueScenario, setIsCompletingLeagueScenario] = useState(false);

    // Lists
    const [myScenarios, setMyScenarios] = useState([]);
    const [leagueScenarios, setLeagueScenarios] = useState([]);

    const totalTime = timeline.reduce((acc, item) => acc + (parseInt(item.time) || 0), 0) + 40;

    const practiceTypes = useMemo(() => {
        const types = new Set();
        (practices || []).forEach((p) => {
            const t = String(p?.type || '').trim();
            if (t) types.add(t);
        });
        return ['all', ...Array.from(types)];
    }, [practices]);

    const filteredPractices = useMemo(() => {
        const needle = practiceSearch.trim().toLowerCase();
        return (practices || []).filter((p) => {
            const minutes = parseInt(p.time) || 0;
            if (timeFilter === 'short' && !(minutes >= 5 && minutes <= 15)) return false;
            if (timeFilter === 'medium' && !(minutes >= 20 && minutes <= 30)) return false;
            if (timeFilter === 'long' && !(minutes >= 40)) return false;

            if (typeFilter !== 'all' && String(p.type || '') !== typeFilter) return false;

            if (!needle) return true;
            const hay = `${p.title || ''} ${p.description || ''} ${p.type || ''}`.toLowerCase();
            return hay.includes(needle);
        });
    }, [practices, timeFilter, typeFilter, practiceSearch]);

    useEffect(() => {
        if (activeTab === 'my') {
            api.getScenarios(user.id).then(setMyScenarios);
        } else if (activeTab === 'league') {
            api.getPublicScenarios().then(setLeagueScenarios);
        }
    }, [activeTab, user.id]);

    const addToTimeline = (practice) => {
        setTimeline([...timeline, { ...practice, uniqueId: Date.now() + Math.random() }]);
        onNotify("Практика добавлена");
    };

    const addFreeInputStep = () => {
        const customItem = {
            uniqueId: Date.now() + Math.random(),
            title: 'Новый шаг',
            description: '',
            type: 'Свободный ввод',
            time: '10 мин',
            icon: '✍️',
            custom: true
        };
        setTimeline([...timeline, customItem]);
        onNotify("Добавлен шаг для свободного ввода");
    };

    const removeFromTimeline = (uniqueId) => setTimeline(timeline.filter(item => item.uniqueId !== uniqueId));

    const moveItem = (index, direction) => {
        const newTimeline = [...timeline];
        if (direction === 'up' && index > 0) {
            [newTimeline[index], newTimeline[index - 1]] = [newTimeline[index - 1], newTimeline[index]];
        } else if (direction === 'down' && index < newTimeline.length - 1) {
            [newTimeline[index], newTimeline[index + 1]] = [newTimeline[index + 1], newTimeline[index]];
        }
        setTimeline(newTimeline);
    };

    const insertIntoTimeline = (item, index) => {
        const next = [...timeline];
        const insertIndex = typeof index === 'number' ? index : next.length;
        next.splice(insertIndex, 0, item);
        setTimeline(next);
    };

    const moveTimelineItemToIndex = (dragId, index) => {
        const fromIndex = timeline.findIndex(i => String(i.uniqueId) === String(dragId));
        if (fromIndex === -1) return;
        const next = [...timeline];
        const [moved] = next.splice(fromIndex, 1);
        const targetIndex = typeof index === 'number' ? index : next.length;
        const adjustedIndex = fromIndex < targetIndex ? Math.max(targetIndex - 1, 0) : targetIndex;
        next.splice(adjustedIndex, 0, moved);
        setTimeline(next);
    };

    const updateTimelineItem = (uniqueId, patch) => {
        setTimeline(prev => prev.map(item => String(item.uniqueId) === String(uniqueId) ? { ...item, ...patch } : item));
    };

    const parseImportedText = (rawText) => {
        const lines = String(rawText || '')
            .replace(/\r\n/g, '\n')
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean);

        return lines.map((line, idx) => {
            let cleaned = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '');

            let time = '10 мин';
            const timeMatch = cleaned.match(/(\d{1,3})\s*мин/i);
            if (timeMatch) {
                time = `${timeMatch[1]} мин`;
                cleaned = cleaned.replace(timeMatch[0], '').replace(/^[\s\-–—:]+/, '').trim();
            }

            let title = cleaned;
            let description = '';
            const split = cleaned.split(/\s[—-]\s/);
            if (split.length > 1) {
                title = split[0].trim();
                description = split.slice(1).join(' - ').trim();
            }

            return {
                uniqueId: Date.now() + Math.random() + idx,
                title: title || `Шаг ${idx + 1}`,
                description,
                type: 'Импорт',
                time,
                icon: '📝',
                custom: true
            };
        });
    };

    const handleImportScenario = (text, replaceCurrent) => {
        const imported = parseImportedText(text);
        if (imported.length === 0) {
            onNotify("Не удалось распознать шаги в тексте");
            return;
        }

        if (replaceCurrent) setTimeline(imported);
        else setTimeline([...timeline, ...imported]);

        setShowImportModal(false);
        onNotify(`Импортировано шагов: ${imported.length}`);
    };

    const handleTimelineDrop = (event, index = null) => {
        event.preventDefault();
        const practiceData = event.dataTransfer.getData('application/x-garden-practice');
        const timelineId = event.dataTransfer.getData('application/x-garden-timeline');

        if (practiceData) {
            try {
                const practice = JSON.parse(practiceData);
                const newItem = { ...practice, uniqueId: Date.now() + Math.random() };
                insertIntoTimeline(newItem, index);
                onNotify("Практика добавлена");
            } catch (e) {
                console.error('Failed to parse practice data', e);
            }
        } else if (timelineId) {
            moveTimelineItemToIndex(timelineId, index);
        }

        setDragOverIndex(null);
        setDraggedTimelineId(null);
        setIsDraggingFromLibrary(false);
    };

    const handleSave = async (title, isPublic) => {
        try {
            const canPublish = user?.role !== 'applicant' && user?.role !== 'intern';
            await api.addScenario({
                user_id: user.id,
                title,
                timeline,
                is_public: canPublish ? isPublic : false,
                author_name: user.name
            });
            // onNotify handled in parent now? No, we mostly use onNotify for generic toasts.
            // But onSave in parent will also trigger a notification about seeds.
            // We can keep a simple log or rely on parent.
            // Actually, parent notification is "Scenario added! +seeds". We can skip duplicate notify here if parent does it.
            // But wait, the parent sends "Scenario added...".
            // Let's just call onSave and let parent handle the notification.
            if (onSave) onSave(isPublic);

            setScenarioTitle(title);
            setShowSaveModal(false);
        } catch (e) {
            console.error(e);
            onNotify("Ошибка сохранения");
        }
    };

    const handleDeleteScenario = async () => {
        try {
            await api.deleteScenario(deleteConfirmation.scenarioId);
            onNotify("Сценарий удален");
            setDeleteConfirmation({ isOpen: false, scenarioId: null });
            // Refresh lists
            api.getScenarios(user.id).then(setMyScenarios);
            api.getPublicScenarios().then(setLeagueScenarios);
        } catch (e) {
            console.error(e);
            onNotify("Ошибка удаления");
        }
    };

    const handleLoadScenario = (scenario) => {
        const hydratedTimeline = (scenario.timeline || []).map((item, idx) => ({
            ...item,
            uniqueId: item.uniqueId || `${Date.now()}-${idx}-${Math.random()}`
        }));
        setTimeline(hydratedTimeline);
        setScenarioTitle(scenario.title);
        setActiveTab('builder');
        onNotify(`Загружен сценарий: ${scenario.title}`);
    };

    const handleOpenLeagueScenario = (scenario) => {
        setLeaguePreviewScenario(scenario);
    };

    const leaguePreviewMaterialHtml = useMemo(() => {
        if (!leaguePreviewScenario) return '<p>Материал в процессе подготовки.</p>';
        const scenarioTimeline = Array.isArray(leaguePreviewScenario.timeline) ? leaguePreviewScenario.timeline : [];
        const mainContent = String(
            scenarioTimeline.find((step) => String(step?.description || '').trim())?.description || ''
        ).trim();
        if (mainContent) return formatMaterialContent(mainContent);

        const fallbackText = scenarioTimeline
            .map((step, index) => `${index + 1}. ${step?.title || `Шаг ${index + 1}`}`)
            .join('\n');
        return formatMaterialContent(fallbackText || 'Материал в процессе подготовки.');
    }, [leaguePreviewScenario]);

    const leaguePreviewMaterialTags = useMemo(() => {
        if (!leaguePreviewScenario) return [];
        const scenarioTimeline = Array.isArray(leaguePreviewScenario.timeline) ? leaguePreviewScenario.timeline : [];
        const types = Array.from(new Set(scenarioTimeline.map((step) => String(step?.type || '').trim()).filter(Boolean)));
        return types.slice(0, 4);
    }, [leaguePreviewScenario]);

    const handleCompleteLeagueScenario = async () => {
        if (!leaguePreviewScenario?.id) return;
        setIsCompletingLeagueScenario(true);
        try {
            const result = await api.markCourseLessonCompleted(
                user.id,
                `league-scenario-${leaguePreviewScenario.id}`,
                'Сценарии лиги'
            );
            if (result?.inserted) {
                if (onCompleteLeagueScenario) onCompleteLeagueScenario(leaguePreviewScenario);
                else onNotify('Сценарий изучен');
            } else {
                onNotify('Этот сценарий уже отмечен как изученный');
            }
        } catch (e) {
            console.error(e);
            onNotify('Не удалось отметить сценарий как изученный');
        } finally {
            setIsCompletingLeagueScenario(false);
        }
    };

    return (
        <div className="h-full flex flex-col pt-6 px-4 lg:px-0">
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h1 className="text-4xl font-light text-slate-800 tracking-tight">Сценарии</h1>
                    <p className="text-slate-400 mt-1 font-light">
                        {activeTab === 'builder' && 'Конструктор встреч'}
                        {activeTab === 'my' && 'Ваша коллекция'}
                        {activeTab === 'league' && 'Библиотека сообщества'}
                    </p>
                </div>
                {activeTab === 'builder' && (
                    <div className="flex items-center gap-4">
                        <div className="text-right hidden md:block">
                            <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Время</div>
                            <div className="font-mono text-xl text-blue-600">{totalTime} мин</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Navigation Tabs */}
            <div className="flex flex-col md:flex-row p-1 bg-slate-100 rounded-2xl w-full md:w-fit max-w-full mb-6">
                <button
                    onClick={() => setActiveTab('builder')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'builder' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <div className="flex items-center justify-center md:justify-start gap-2"><Layout size={16} /> Конструктор</div>
                </button>
                <button
                    onClick={() => setActiveTab('my')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'my' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <div className="flex items-center justify-center md:justify-start gap-2"><FolderOpen size={16} /> Мои сценарии</div>
                </button>
                {user?.role !== 'applicant' && (
                    <button
                        onClick={() => setActiveTab('league')}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'league' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <div className="flex items-center justify-center md:justify-start gap-2"><Globe size={16} /> Сценарии лиги</div>
                    </button>
                )}
            </div>

            {/* Content Area */}
            <div className="flex-1 flex flex-col min-h-0">
                {activeTab === 'builder' ? (
                    <div className="flex-1 flex flex-col min-h-0 animate-in fade-in duration-300 pb-10">
                        <div className="flex justify-start mb-4">
                            <div className="flex flex-wrap gap-2">
                                <Button variant="secondary" icon={Save} onClick={() => setShowSaveModal(true)} disabled={timeline.length === 0} className="!py-2 !text-xs">Сохранить текущий сценарий</Button>
                                <Button variant="secondary" icon={PenLine} onClick={addFreeInputStep} className="!py-2 !text-xs">Свободный шаг</Button>
                                <Button variant="secondary" icon={Upload} onClick={() => setShowImportModal(true)} className="!py-2 !text-xs">Импорт текста</Button>
                            </div>
                        </div>

                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 min-h-0">
                            <div className="overflow-y-auto pr-2 space-y-3 pb-20 h-[calc(100vh-250px)] md:h-auto">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-xs font-medium uppercase tracking-widest text-slate-400">База практик</h3>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                                    <input
                                        value={practiceSearch}
                                        onChange={(e) => setPracticeSearch(e.target.value)}
                                        placeholder="Поиск практик..."
                                        className="sm:col-span-2 bg-white border border-slate-200 text-sm text-slate-700 rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-blue-200"
                                    />
                                    <select
                                        value={timeFilter}
                                        onChange={(e) => setTimeFilter(e.target.value)}
                                        className="bg-slate-50 border border-slate-200 text-xs text-slate-500 font-medium rounded-xl px-2 py-2 outline-none focus:ring-1 focus:ring-blue-200 cursor-pointer"
                                    >
                                        <option value="all">Любое время</option>
                                        <option value="short">5-15 мин</option>
                                        <option value="medium">20-30 мин</option>
                                        <option value="long">40+ мин</option>
                                    </select>
                                    <select
                                        value={typeFilter}
                                        onChange={(e) => setTypeFilter(e.target.value)}
                                        className="sm:col-span-3 bg-slate-50 border border-slate-200 text-xs text-slate-500 font-medium rounded-xl px-2 py-2 outline-none focus:ring-1 focus:ring-blue-200 cursor-pointer"
                                    >
                                        <option value="all">Все типы</option>
                                        {practiceTypes.filter(t => t !== 'all').map((type) => (
                                            <option key={type} value={type}>{type}</option>
                                        ))}
                                    </select>
                                </div>
                                {filteredPractices.map(practice => (
                                    <div
                                        key={practice.id}
                                        draggable
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData('application/x-garden-practice', JSON.stringify(practice));
                                            e.dataTransfer.setData('text/plain', String(practice.id));
                                            e.dataTransfer.effectAllowed = 'copy';
                                            setIsDraggingFromLibrary(true);
                                        }}
                                        onDragEnd={() => setIsDraggingFromLibrary(false)}
                                        onClick={() => addToTimeline(practice)}
                                        className="group bg-white p-4 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-200 cursor-pointer transition-all flex justify-between items-center"
                                    >
                                        <div className="flex items-center gap-3"><span className="text-2xl">{practice.icon}</span><div><div className="font-medium text-slate-800">{practice.title}</div><div className="text-xs text-slate-400">{practice.type} • {practice.time}</div></div></div>
                                        <Plus size={16} className="text-slate-300 group-hover:text-blue-500" />
                                    </div>
                                ))}
                                {filteredPractices.length === 0 && (
                                    <div className="text-sm text-slate-400 text-center py-8 border border-dashed border-slate-200 rounded-2xl">
                                        Ничего не найдено. Измените фильтры.
                                    </div>
                                )}
                            </div>
                            <div className="bg-slate-50 rounded-3xl p-6 flex flex-col border border-slate-200/50 h-[calc(100vh-250px)] md:h-auto overflow-hidden">
                                <div className="mb-4">
                                    <h3 className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-1">Таймлайн встречи</h3>
                                    {scenarioTitle && (
                                        <div onClick={() => setShowSaveModal(true)} className="text-lg font-medium text-blue-600 cursor-pointer hover:text-blue-700 transition-colors flex items-center gap-2 group w-fit">
                                            {scenarioTitle}
                                            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400"><Save size={14} /></span>
                                        </div>
                                    )}
                                </div>
                                <div
                                    className={`flex-1 overflow-y-auto space-y-3 mb-4 pr-1 scroll-smooth ${isDraggingFromLibrary ? 'ring-2 ring-blue-200/70 rounded-3xl' : ''}`}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = isDraggingFromLibrary ? 'copy' : 'move';
                                    }}
                                    onDrop={(e) => handleTimelineDrop(e)}
                                >
                                    {timeline.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-3xl">
                                            <FileText size={32} className="mb-2 opacity-50" />
                                            <span className="text-sm">Перетащите практики сюда</span>
                                        </div>
                                    ) : (
                                        timeline.map((item, index) => (
                                            <div key={item.uniqueId} className="relative">
                                                <div
                                                    className="h-3"
                                                    onDragOver={(e) => {
                                                        e.preventDefault();
                                                        setDragOverIndex(index);
                                                    }}
                                                    onDrop={(e) => handleTimelineDrop(e, index)}
                                                >
                                                    {dragOverIndex === index && (
                                                        <div className="h-0.5 rounded-full bg-blue-400/80 shadow-[0_0_0_3px_rgba(191,219,254,0.6)]" />
                                                    )}
                                                </div>
                                                <div
                                                    draggable
                                                    onDragStart={(e) => {
                                                        e.dataTransfer.setData('application/x-garden-timeline', String(item.uniqueId));
                                                        e.dataTransfer.setData('text/plain', String(item.uniqueId));
                                                        e.dataTransfer.effectAllowed = 'move';
                                                        setDraggedTimelineId(item.uniqueId);
                                                    }}
                                                    onDragEnd={() => {
                                                        setDraggedTimelineId(null);
                                                        setDragOverIndex(null);
                                                    }}
                                                    onDragOver={(e) => {
                                                        e.preventDefault();
                                                        setDragOverIndex(index);
                                                    }}
                                                    onDrop={(e) => handleTimelineDrop(e, index)}
                                                    className={`flex gap-2 items-center group rounded-2xl transition-colors ${dragOverIndex === index ? 'bg-blue-50/70' : ''}`}
                                                >
                                                    <div className="flex flex-col gap-1 opacity-10 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => moveItem(index, 'up')} disabled={index === 0} className="p-1 hover:bg-slate-200 rounded text-slate-500 disabled:opacity-30"><ArrowUp size={14} /></button>
                                                        <button onClick={() => moveItem(index, 'down')} disabled={index === timeline.length - 1} className="p-1 hover:bg-slate-200 rounded text-slate-500 disabled:opacity-30"><ArrowDown size={14} /></button>
                                                    </div>
                                                    <div className={`flex-1 bg-white p-3 rounded-2xl shadow-sm border text-sm flex items-start gap-2 ${dragOverIndex === index ? 'border-blue-200' : 'border-slate-100'} ${draggedTimelineId === item.uniqueId ? 'opacity-60' : ''}`}>
                                                        <div className="text-slate-300 mt-0.5 cursor-grab active:cursor-grabbing">
                                                            <GripVertical size={16} />
                                                        </div>
                                                        <div className="flex-1">
                                                            {item.custom ? (
                                                                <div className="space-y-2">
                                                                    <input
                                                                        value={item.title || ''}
                                                                        onChange={(e) => updateTimelineItem(item.uniqueId, { title: e.target.value })}
                                                                        placeholder="Название шага"
                                                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-200"
                                                                    />
                                                                    <textarea
                                                                        value={item.description || ''}
                                                                        onChange={(e) => updateTimelineItem(item.uniqueId, { description: e.target.value })}
                                                                        placeholder="Описание шага (опционально)"
                                                                        className="w-full h-20 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-blue-200 resize-none"
                                                                    />
                                                                    <div className="grid grid-cols-2 gap-2">
                                                                        <input
                                                                            value={item.type || ''}
                                                                            onChange={(e) => updateTimelineItem(item.uniqueId, { type: e.target.value })}
                                                                            placeholder="Тип"
                                                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-blue-200"
                                                                        />
                                                                        <input
                                                                            value={item.time || ''}
                                                                            onChange={(e) => updateTimelineItem(item.uniqueId, { time: e.target.value })}
                                                                            placeholder="Время (например, 10 мин)"
                                                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-blue-200"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <div className="font-medium text-slate-800">{item.title}</div>
                                                                    <div className="text-xs text-slate-400 flex justify-between mt-1 gap-2"><span>{item.icon} {item.type}</span><span>{item.time}</span></div>
                                                                </>
                                                            )}
                                                        </div>
                                                        <button onClick={() => removeFromTimeline(item.uniqueId)} className="text-slate-300 hover:text-rose-500 transition-colors"><X size={14} /></button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                    {timeline.length > 0 && (
                                        <div
                                            className="h-4"
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                setDragOverIndex(timeline.length);
                                            }}
                                            onDrop={(e) => handleTimelineDrop(e, timeline.length)}
                                        >
                                            {dragOverIndex === timeline.length && (
                                                <div className="h-0.5 rounded-full bg-blue-400/80 shadow-[0_0_0_3px_rgba(191,219,254,0.6)]" />
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-3 mt-auto pt-4 border-t border-slate-200 bg-slate-50 z-10">
                                    <Button variant="secondary" icon={Download} onClick={() => setPreviewType('workbook')} disabled={timeline.length === 0}><span className="text-xs">Воркбук</span></Button>
                                    <Button variant="primary" icon={FileText} onClick={() => setPreviewType('scenario')} disabled={timeline.length === 0}><span className="text-xs">Сценарий</span></Button>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : activeTab === 'my' ? (
                    <div className="flex-1 overflow-y-auto animate-in fade-in duration-300">
                        <ScenarioList
                            scenarios={myScenarios}
                            variant="my"
                            onLoad={handleLoadScenario}
                            onDelete={(id) => setDeleteConfirmation({ isOpen: true, scenarioId: id })}
                            emptyMessage="Вы еще не сохранили ни одного сценария"
                        />
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto animate-in fade-in duration-300">
                        <ScenarioList
                            scenarios={leagueScenarios}
                            variant="league"
                            onLoad={handleOpenLeagueScenario}
                            emptyMessage="В библиотеке Лиги пока пусто"
                        />
                    </div>
                )}
            </div>

            {previewType && <DocumentPreviewModal type={previewType} timeline={timeline} title={scenarioTitle} user={user} onClose={() => setPreviewType(null)} onNotify={onNotify} />}
            {leaguePreviewScenario && (
                <DocumentPreviewModal
                    type="material"
                    timeline={Array.isArray(leaguePreviewScenario.timeline) ? leaguePreviewScenario.timeline : []}
                    title={leaguePreviewScenario.title}
                    user={user}
                    onClose={() => setLeaguePreviewScenario(null)}
                    onNotify={onNotify}
                    materialContentHtml={leaguePreviewMaterialHtml}
                    materialTags={leaguePreviewMaterialTags}
                    extraAction={
                        <Button
                            variant="primary"
                            className="!px-3 !py-2 text-xs"
                            onClick={handleCompleteLeagueScenario}
                            disabled={isCompletingLeagueScenario}
                        >
                            {isCompletingLeagueScenario ? 'Сохраняем...' : 'Изучено (+20 семян)'}
                        </Button>
                    }
                />
            )}
            {showSaveModal && <SaveScenarioModal onSave={handleSave} onClose={() => setShowSaveModal(false)} user={user} onNotify={onNotify} />}
            {showImportModal && <ImportScenarioModal onImport={handleImportScenario} onClose={() => setShowImportModal(false)} />}

            <ConfirmationModal
                isOpen={deleteConfirmation.isOpen}
                onClose={() => setDeleteConfirmation({ isOpen: false, scenarioId: null })}
                onConfirm={handleDeleteScenario}
                title="Удалить сценарий?"
                message="Вы уверены? Это действие нельзя отменить."
                confirmText="Удалить"
                confirmVariant="danger"
            />
        </div>
    );
};

export default BuilderView;
