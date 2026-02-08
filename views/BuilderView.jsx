import React, { useState, useEffect } from 'react';
import { jsPDF } from "jspdf";
import html2canvas from 'html2canvas';
import { FileText, Download, Plus, X, Printer, Leaf, ArrowUp, ArrowDown, Save, FolderOpen, Trash2, Globe, Layout, User, GripVertical } from 'lucide-react';
import Button from '../components/Button';
import { api } from '../services/dataService';
import ConfirmationModal from '../components/ConfirmationModal';
import ModalShell from '../components/ModalShell';

const CheckBoxLine = ({ text }) => (
    <div className="flex items-start gap-4 mb-3">
        <div className="w-5 h-5 rounded border-2 border-slate-300 flex-shrink-0 mt-0.5"></div>
        <div className="text-slate-700 leading-snug">{text}</div>
    </div>
);

const DocumentPreviewModal = ({ type, timeline, title, user, onClose, onNotify }) => {
    return (
        <ModalShell
            isOpen
            onClose={onClose}
            size="lg"
            title={type === 'workbook' ? 'Воркбук участницы' : 'Сценарий ведущей'}
            description="Предпросмотр документа"
        >
            <div className="flex justify-end gap-2 mb-4">
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
                                <CheckBoxLine text="Получение разрешения на фото и видеосъемку" />
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

const ScenarioList = ({ scenarios, variant, onLoad, onDelete, emptyMessage, user }) => (
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
                        {variant === 'league' && s.author_name && (
                            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 p-2 rounded-xl mb-2">
                                <User size={12} className="text-blue-500" />
                                <span>Автор: <span className="font-medium text-slate-700">{s.author_name}</span></span>
                            </div>
                        )}
                        <div className="text-xs text-slate-400 line-clamp-3 italic">
                            {s.timeline.slice(0, 3).map(i => i.title).join(', ')}{s.timeline.length > 3 ? '...' : ''}
                        </div>
                    </div>
                    <div className="pt-4 border-t border-slate-50 flex justify-between items-center mt-4">
                        <Button variant="ghost" onClick={() => onLoad(s)} className="!text-blue-600 !px-0 text-xs font-medium hover:!bg-transparent">Открыть</Button>
                        {(variant === 'my' || (variant === 'league' && s.user_id === user.id)) && (
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

const BuilderView = ({ practices, timeline, setTimeline, onNotify, user, onSave }) => {
    const [activeTab, setActiveTab] = useState('builder'); // 'builder', 'my', 'league'
    const [previewType, setPreviewType] = useState(null);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [scenarioTitle, setScenarioTitle] = useState('');
    const [timeFilter, setTimeFilter] = useState('all');
    const [deleteConfirmation, setDeleteConfirmation] = useState({ isOpen: false, scenarioId: null });
    const [dragOverIndex, setDragOverIndex] = useState(null);
    const [draggedTimelineId, setDraggedTimelineId] = useState(null);
    const [isDraggingFromLibrary, setIsDraggingFromLibrary] = useState(false);

    // Lists
    const [myScenarios, setMyScenarios] = useState([]);
    const [leagueScenarios, setLeagueScenarios] = useState([]);

    const totalTime = timeline.reduce((acc, item) => acc + (parseInt(item.time) || 0), 0) + 40;

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
        setTimeline(scenario.timeline);
        setScenarioTitle(scenario.title);
        setActiveTab('builder');
        onNotify(`Загружен сценарий: ${scenario.title}`);
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
                            <Button variant="secondary" icon={Save} onClick={() => setShowSaveModal(true)} disabled={timeline.length === 0} className="!py-2 !text-xs">Сохранить текущий сценарий</Button>
                        </div>

                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 min-h-0">
                            <div className="overflow-y-auto pr-2 space-y-3 pb-20 h-[calc(100vh-250px)] md:h-auto">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-xs font-medium uppercase tracking-widest text-slate-400">База практик</h3>
                                    <select
                                        value={timeFilter}
                                        onChange={(e) => setTimeFilter(e.target.value)}
                                        className="bg-slate-50 border-none text-xs text-slate-500 font-medium rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-blue-200 cursor-pointer"
                                    >
                                        <option value="all">Любое время</option>
                                        <option value="short">5-15 мин</option>
                                        <option value="medium">20-30 мин</option>
                                        <option value="long">40+ мин</option>
                                    </select>
                                </div>
                                {practices.filter(p => {
                                    if (timeFilter === 'all') return true;
                                    const minutes = parseInt(p.time) || 0;
                                    if (timeFilter === 'short') return minutes >= 5 && minutes <= 15;
                                    if (timeFilter === 'medium') return minutes >= 20 && minutes <= 30;
                                    if (timeFilter === 'long') return minutes >= 40;
                                    return true;
                                }).map(practice => (
                                    <div
                                        key={practice.id}
                                        draggable
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData('application/x-garden-practice', JSON.stringify(practice));
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
                                                {dragOverIndex === index && (
                                                    <div className="absolute -top-1 left-8 right-3 h-0.5 rounded-full bg-blue-400/80 shadow-[0_0_0_3px_rgba(191,219,254,0.6)]" />
                                                )}
                                                <div
                                                    draggable
                                                    onDragStart={(e) => {
                                                        e.dataTransfer.setData('application/x-garden-timeline', String(item.uniqueId));
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
                                                            <div className="font-medium text-slate-800">{item.title}</div>
                                                            <div className="text-xs text-slate-400 flex justify-between mt-1 gap-2"><span>{item.icon} {item.type}</span><span>{item.time}</span></div>
                                                        </div>
                                                        <button onClick={() => removeFromTimeline(item.uniqueId)} className="text-slate-300 hover:text-rose-500 transition-colors"><X size={14} /></button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
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
                            user={user}
                        />
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto animate-in fade-in duration-300">
                        <ScenarioList
                            scenarios={leagueScenarios}
                            variant="league"
                            onLoad={handleLoadScenario}
                            onDelete={(id) => setDeleteConfirmation({ isOpen: true, scenarioId: id })}
                            emptyMessage="В библиотеке Лиги пока пусто"
                            user={user}
                        />
                    </div>
                )}
            </div>

            {previewType && <DocumentPreviewModal type={previewType} timeline={timeline} title={scenarioTitle} user={user} onClose={() => setPreviewType(null)} onNotify={onNotify} />}
            {showSaveModal && <SaveScenarioModal onSave={handleSave} onClose={() => setShowSaveModal(false)} user={user} onNotify={onNotify} />}

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
