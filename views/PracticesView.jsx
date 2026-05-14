import React, { useState } from 'react';
import { Search, Plus, Pencil, Upload, Download, Gem } from 'lucide-react';
import Button from '../components/Button';
import ConfirmationModal from '../components/ConfirmationModal';
import ModalShell from '../components/ModalShell';
import PracticeFormModal from '../components/PracticeFormModal';

const CSV_TEMPLATE = `title,time,duration_minutes,type,short_goal,instruction_short,instruction_full,reflection_questions,description,icon
Дыхание 4-7-8,10 мин,10,Дыхание,Снизить уровень стресса,Сделайте 3 цикла дыхания 4-7-8,Сядьте удобно. 1) Вдох 4 счета. 2) Задержка 7. 3) Выдох 8. Повторите 3-5 циклов.,Что изменилось в теле? | Что поменялось в состоянии?,Успокаивающая практика для быстрого снижения стресса,🫁
Колесо баланса,20 мин,20,Рефлексия,Найти зону роста,Оцените 8 сфер по шкале 1-10,Нарисуйте круг, разделите на сектора, оцените каждую сферу, выберите 1 шаг на неделю.,Какая сфера проседает? | Какой первый шаг сделаете?,Проверка ключевых сфер жизни и фокус на следующем шаге,🎯`;

const parseCsvLine = (line, delimiter) => {
    const out = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        const next = line[i + 1];

        if (ch === '"' && inQuotes && next === '"') {
            current += '"';
            i += 1;
            continue;
        }
        if (ch === '"') {
            inQuotes = !inQuotes;
            continue;
        }
        if (ch === delimiter && !inQuotes) {
            out.push(current.trim());
            current = '';
            continue;
        }
        current += ch;
    }

    out.push(current.trim());
    return out;
};

const normalizeHeader = (value) => String(value || '').trim().toLowerCase();

const pickDelimiter = (headerLine) => {
    const commaCount = (headerLine.match(/,/g) || []).length;
    const semicolonCount = (headerLine.match(/;/g) || []).length;
    return semicolonCount > commaCount ? ';' : ',';
};

const parsePracticesCsv = (rawText) => {
    const text = String(rawText || '').trim();
    if (!text) return { items: [], errors: [] };

    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length < 2) {
        return { items: [], errors: ['Добавьте заголовок и хотя бы одну строку с данными.'] };
    }

    const delimiter = pickDelimiter(lines[0]);
    const headers = parseCsvLine(lines[0], delimiter).map(normalizeHeader);
    const indexByHeader = Object.fromEntries(headers.map((header, idx) => [header, idx]));

    const getValue = (cells, keys) => {
        for (const key of keys) {
            const idx = indexByHeader[key];
            if (idx === undefined) continue;
            const value = cells[idx];
            if (value !== undefined) return String(value).trim();
        }
        return '';
    };

    const items = [];
    const errors = [];

    for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
        const cells = parseCsvLine(lines[lineIndex], delimiter);
        const title = getValue(cells, ['title', 'название', 'name']);
        const time = getValue(cells, ['time', 'время']);
        const type = getValue(cells, ['type', 'тема', 'категория']);
        const description = getValue(cells, ['description', 'описание']);
        const duration_minutes = getValue(cells, ['duration_minutes', 'duration', 'длительность', 'длительность_мин']);
        const short_goal = getValue(cells, ['short_goal', 'goal', 'краткая_цель', 'цель']);
        const instruction_short = getValue(cells, ['instruction_short', 'короткая_инструкция', 'инструкция_коротко']);
        const instruction_full = getValue(cells, ['instruction_full', 'полная_инструкция', 'инструкция_полная', 'инструкция']);
        const reflection_questions = getValue(cells, ['reflection_questions', 'вопросы_рефлексии', 'вопросы']);
        const icon = getValue(cells, ['icon', 'иконка']) || '📄';

        if (!title) {
            errors.push(`Строка ${lineIndex + 1}: пустое поле title/название.`);
            continue;
        }

        items.push({
            title,
            time,
            type,
            description,
            icon,
            duration_minutes,
            short_goal,
            instruction_short,
            instruction_full,
            reflection_questions
        });
    }

    return { items, errors };
};

const PracticesView = ({ user, practices, onAddPractice, onUpdatePractice, onDeletePractice, onNotify }) => {
    const [search, setSearch] = useState('');
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingPractice, setEditingPractice] = useState(null);
    const [viewPractice, setViewPractice] = useState(null); // The practice currently being viewed
    const [deletePracticeId, setDeletePracticeId] = useState(null);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [csvText, setCsvText] = useState('');
    const [csvErrors, setCsvErrors] = useState([]);
    const [parsedPractices, setParsedPractices] = useState([]);
    const [isImporting, setIsImporting] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState('Все');
    const [timeFilter, setTimeFilter] = useState('all');
    const isAdmin = user?.role === 'admin';

    // Helper to normalize text (capitalize first letter)
    const normalize = (str) => {
        if (!str) return 'Общее';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    };

    const renderDescriptionWithLinks = (text) => {
        if (!text) return null;
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urlOnlyRegex = /^https?:\/\/[^\s]+$/;
        const parts = String(text).split(urlRegex);

        return parts.map((part, idx) => {
            if (urlOnlyRegex.test(part)) {
                return (
                    <a
                        key={`link-${idx}`}
                        href={part}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-700 underline decoration-blue-300 hover:text-blue-800 break-all"
                    >
                        {part}
                    </a>
                );
            }

            return <React.Fragment key={`txt-${idx}`}>{part}</React.Fragment>;
        });
    };

    const parseDurationMinutes = (practice) => {
        const direct = parseInt(practice?.duration_minutes, 10);
        if (!Number.isNaN(direct) && direct > 0) return direct;
        const fallback = parseInt(practice?.time, 10);
        if (!Number.isNaN(fallback) && fallback > 0) return fallback;
        return null;
    };

    const getDurationLabel = (practice) => {
        const minutes = parseDurationMinutes(practice);
        if (minutes) return `${minutes} мин`;
        if (practice?.time) return practice.time;
        return '';
    };

    const splitReflectionQuestions = (value) =>
        String(value || '')
            .split(/\r?\n|\|/)
            .map((item) => item.trim())
            .filter(Boolean);

    // Get unique categories with normalized names (excluding 'Общее' from filters as requested)
    const categories = ['Все', ...new Set(practices.map(p => normalize(p.type)).filter(c => c !== 'Общее'))];

    const filteredPractices = practices.filter(p => {
        const pType = normalize(p.type);
        const matchesCategory = selectedCategory === 'Все' || pType === selectedCategory;
        const matchesSearch = p.title.toLowerCase().includes(search.toLowerCase()) ||
            p.description?.toLowerCase().includes(search.toLowerCase()) ||
            p.short_goal?.toLowerCase().includes(search.toLowerCase()) ||
            p.instruction_short?.toLowerCase().includes(search.toLowerCase()) ||
            p.instruction_full?.toLowerCase().includes(search.toLowerCase()) ||
            p.reflection_questions?.toLowerCase().includes(search.toLowerCase());

        let matchesTime = true;
        if (timeFilter !== 'all') {
            const minutes = parseDurationMinutes(p) || 0;
            if (timeFilter === 'short') matchesTime = minutes >= 5 && minutes <= 15;
            else if (timeFilter === 'medium') matchesTime = minutes >= 20 && minutes <= 30;
            else if (timeFilter === 'long') matchesTime = minutes >= 40;
        }

        return matchesCategory && matchesSearch && matchesTime;
    });

    const handleFormSubmit = async (payload) => {
        if (payload.id) {
            await onUpdatePractice(payload);
        } else {
            await onAddPractice({ ...payload, id: Date.now() });
        }
        setIsEditModalOpen(false);
        setEditingPractice(null);
    };

    const openAddModal = () => {
        setEditingPractice(null);
        setIsEditModalOpen(true);
    };

    const openEditModal = (practice, e) => {
        if (e?.stopPropagation) e.stopPropagation();
        setEditingPractice(practice);
        setIsEditModalOpen(true);
    };

    const handleFormDelete = (id) => {
        setDeletePracticeId(id);
    };

    const openImportModal = () => {
        setCsvText('');
        setCsvErrors([]);
        setParsedPractices([]);
        setIsImportModalOpen(true);
    };

    const refreshCsvPreview = (nextText) => {
        setCsvText(nextText);
        const parsed = parsePracticesCsv(nextText);
        setParsedPractices(parsed.items);
        setCsvErrors(parsed.errors);
    };

    const handleCsvFile = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            refreshCsvPreview(text);
        } catch (error) {
            console.error(error);
            onNotify('Не удалось прочитать CSV-файл');
        } finally {
            event.target.value = '';
        }
    };

    const handleDownloadTemplate = () => {
        const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'practices-template.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleImportCsv = async () => {
        if (parsedPractices.length === 0) {
            onNotify('Нет данных для импорта');
            return;
        }

        const existingTitles = new Set(practices.map((p) => String(p.title || '').trim().toLowerCase()));
        const uniqueIncoming = [];
        const skipped = [];

        for (const item of parsedPractices) {
            const titleKey = String(item.title || '').trim().toLowerCase();
            if (!titleKey || existingTitles.has(titleKey)) {
                skipped.push(item.title || '(без названия)');
                continue;
            }
            existingTitles.add(titleKey);
            uniqueIncoming.push(item);
        }

        if (uniqueIncoming.length === 0) {
            onNotify('Все практики из файла уже есть в базе');
            return;
        }

        setIsImporting(true);
        let addedCount = 0;
        let failedCount = 0;

        for (const item of uniqueIncoming) {
            try {
                await onAddPractice(
                    { ...item, id: Date.now() + addedCount },
                    { silent: true, grantSeeds: false, propagateError: true }
                );
                addedCount += 1;
            } catch (error) {
                console.error('Practice import failed:', item.title, error);
                failedCount += 1;
            }
        }

        setIsImporting(false);
        onNotify(`Импорт завершен: добавлено ${addedCount}, пропущено ${skipped.length}, с ошибкой ${failedCount}`);
        if (addedCount > 0) setIsImportModalOpen(false);
    };

    const canEditPractices = true;

    return (
        <div className="h-full flex flex-col animate-in fade-in duration-700 pb-20 pt-6 px-4 lg:px-0">

            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 w-full gap-3">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-4xl font-light text-slate-800 tracking-tight">Мои практики</h1>
                        <span className="md:hidden inline-flex items-center justify-center px-2.5 py-1 rounded-full bg-white/80 border border-slate-200 text-xs font-mono text-blue-600">
                            {practices.length}
                        </span>
                    </div>
                    <p className="text-slate-400 mt-1 font-light">Ваши практики</p>
                </div>
                <div className="text-right hidden md:block">
                    <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">В базе</div>
                    <div className="font-mono text-xl text-blue-600">{practices.length}</div>
                </div>
            </div>

            {/* Search & Filter Controls */}
            <div className="mb-10 w-full">
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-4 items-stretch">
                        <div className="relative w-full sm:flex-1">
                            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-full py-3 pl-12 pr-6 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm"
                                placeholder="Найти практику..."
                            />
                        </div>

                        {/* Time Filter */}
                        <select
                            value={timeFilter}
                            onChange={(e) => setTimeFilter(e.target.value)}
                            className="bg-white border border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider rounded-full px-4 py-2 outline-none focus:border-blue-300 transition-all cursor-pointer h-[44px] sm:h-auto"
                        >
                            <option value="all">Любое время</option>
                            <option value="short">5-15 мин</option>
                            <option value="medium">20-30 мин</option>
                            <option value="long">40+ мин</option>
                        </select>
                        {canEditPractices && (
                            <Button variant="secondary" onClick={openImportModal} className="!rounded-full !px-4 !py-2 !text-xs h-[44px] sm:h-auto" icon={Upload}>
                                Импорт CSV
                            </Button>
                        )}
                    </div>

                    {/* Filter Pills */}
                    <div className="flex flex-wrap gap-2">
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 border ${selectedCategory === cat
                                    ? 'bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-900/20'
                                    : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600'
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Practices Grid */}
            <div className="w-full">
                {filteredPractices.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredPractices.map((practice) => (
                            <div
                                key={practice.id}
                                onClick={() => setViewPractice(practice)}
                                className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 flex flex-col h-full group hover:shadow-xl hover:-translate-y-1 transition-all duration-500 relative cursor-pointer"
                            >
                                {/* Header: Icon/Brand & Edit */}
                                <div className="flex justify-between items-start mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="text-3xl bg-slate-50 w-12 h-12 rounded-2xl flex items-center justify-center border border-slate-100 group-hover:scale-110 transition-transform duration-300">
                                            {practice.icon || '📄'}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-900 text-lg leading-tight">{practice.title}</h3>
                                            {practice.type && (
                                                <span className="px-3 py-1 mt-2 inline-block bg-white border border-dashed border-slate-300 rounded-full text-slate-600 text-xs font-medium">
                                                    {practice.type}
                                                </span>
                                            )}
                                            {getDurationLabel(practice) && (
                                                <span className="px-3 py-1 mt-2 ml-2 inline-block bg-white border border-dashed border-slate-300 rounded-full text-slate-600 text-xs font-medium">
                                                    {getDurationLabel(practice)}
                                                </span>
                                            )}
                                            {practice.is_published && (
                                                <span className="px-3 py-1 mt-2 ml-2 inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded-full text-emerald-700 text-xs font-semibold">
                                                    <Gem size={11} strokeWidth={2} /> В Сокровищнице
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Edit Button (Instead of Rating) */}
                                    {canEditPractices && (
                                        <button
                                            onClick={(e) => openEditModal(practice, e)}
                                            className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-all"
                                        >
                                            <Pencil size={18} />
                                        </button>
                                    )}
                                </div>

                                {/* Body: Description */}
                                <div className="flex-1">
                                    {practice.short_goal && (
                                        <p className="text-slate-800 text-sm font-semibold mb-2 line-clamp-2">
                                            Цель: {practice.short_goal}
                                        </p>
                                    )}
                                    <p className="text-slate-600 text-[15px] leading-relaxed line-clamp-4">
                                        {practice.description || "Описание отсутствует..."}
                                    </p>
                                </div>

                                {/* Footer Removed as requested */}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20">
                        <div className="text-6xl mb-4">🌪️</div>
                        <h3 className="text-xl font-medium text-slate-900 mb-2">Ничего не найдено</h3>
                        <p className="text-slate-500">Попробуйте изменить параметры поиска или фильтры</p>
                    </div>
                )}
            </div>

            {/* Admin Add Button */}
            {canEditPractices && (
                <div className="fixed bottom-8 right-8 z-30">
                    <button
                        onClick={openAddModal}
                        className="p-4 bg-slate-900 text-white rounded-full hover:bg-slate-800 hover:scale-105 transition-all shadow-xl shadow-slate-900/30"
                    >
                        <Plus size={24} />
                    </button>
                </div>
            )}

            <PracticeFormModal
                isOpen={isEditModalOpen}
                onClose={() => { setIsEditModalOpen(false); setEditingPractice(null); }}
                initial={editingPractice}
                onSubmit={handleFormSubmit}
                onDelete={handleFormDelete}
            />

            <ModalShell
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                title="Массовый импорт практик"
                size="lg"
            >
                <div className="space-y-4">
                    <div className="flex flex-wrap gap-3">
                        <Button variant="secondary" icon={Download} onClick={handleDownloadTemplate}>
                            Скачать шаблон
                        </Button>
                        <label className="inline-flex">
                            <span className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-blue-300">
                                <Upload size={16} />
                                Загрузить CSV
                            </span>
                            <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFile} />
                        </label>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-slate-700 mb-2 block">CSV-данные</label>
                        <textarea
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 outline-none h-40 resize-y text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-mono"
                            placeholder="Вставьте CSV или загрузите файл. Колонки: title,time,duration_minutes,type,short_goal,instruction_short,instruction_full,reflection_questions,description,icon"
                            value={csvText}
                            onChange={(e) => refreshCsvPreview(e.target.value)}
                        />
                    </div>

                    {csvErrors.length > 0 && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                            {csvErrors.slice(0, 5).map((err) => (
                                <div key={err}>• {err}</div>
                            ))}
                            {csvErrors.length > 5 && <div>• Еще ошибок: {csvErrors.length - 5}</div>}
                        </div>
                    )}

                    {parsedPractices.length > 0 && (
                        <div className="rounded-2xl border border-slate-200 overflow-hidden">
                            <div className="px-4 py-2 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                Предпросмотр ({parsedPractices.length})
                            </div>
                            <div className="max-h-52 overflow-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-white sticky top-0 border-b border-slate-100">
                                        <tr className="text-left text-slate-500">
                                            <th className="px-4 py-2">Название</th>
                                            <th className="px-4 py-2">Время</th>
                                            <th className="px-4 py-2">Тема</th>
                                            <th className="px-4 py-2">Иконка</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parsedPractices.slice(0, 30).map((item, idx) => (
                                            <tr key={`${item.title}-${idx}`} className="border-b border-slate-100 last:border-b-0">
                                                <td className="px-4 py-2 text-slate-800">{item.title}</td>
                                                <td className="px-4 py-2 text-slate-600">{item.time || '—'}</td>
                                                <td className="px-4 py-2 text-slate-600">{item.type || '—'}</td>
                                                <td className="px-4 py-2 text-slate-600">{item.icon || '📄'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <Button variant="secondary" onClick={() => setIsImportModalOpen(false)} className="flex-1">Отмена</Button>
                        <Button onClick={handleImportCsv} className="flex-1" disabled={isImporting || parsedPractices.length === 0}>
                            {isImporting ? 'Импортируем...' : 'Импортировать'}
                        </Button>
                    </div>
                </div>
            </ModalShell>

            {/* View Full Practice Modal */}
            <ModalShell
                isOpen={!!viewPractice}
                onClose={() => setViewPractice(null)}
                size="lg"
            >
                {viewPractice && (
                    <>
                        <div className="flex items-start gap-6 mb-8">
                            <div className="text-5xl bg-blue-50 w-24 h-24 rounded-3xl flex items-center justify-center border border-blue-100 shadow-sm flex-shrink-0">
                                {viewPractice.icon || '📄'}
                            </div>
                            <div>
                                <h2 className="text-3xl font-bold text-slate-900 mb-3">{viewPractice.title}</h2>
                                <div className="flex gap-2">
                                    {viewPractice.type && <span className="px-3 py-1 bg-white text-slate-600 rounded-full text-sm font-medium border border-dashed border-slate-300">{viewPractice.type}</span>}
                                    {getDurationLabel(viewPractice) && <span className="px-3 py-1 bg-white text-slate-600 rounded-full text-sm font-medium border border-dashed border-slate-300">{getDurationLabel(viewPractice)}</span>}
                                </div>
                            </div>
                        </div>

                        <div className="prose prose-slate max-w-none">
                            {viewPractice.short_goal && (
                                <div className="mb-4 p-4 rounded-2xl border border-blue-100 bg-blue-50/40">
                                    <div className="text-xs font-bold uppercase tracking-wider text-blue-700 mb-1">Краткая цель</div>
                                    <div className="text-slate-800 font-medium">{viewPractice.short_goal}</div>
                                </div>
                            )}

                            {(viewPractice.instruction_short || viewPractice.instruction_full) && (
                                <div className="mb-6 p-5 rounded-2xl border border-slate-100 bg-white">
                                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Инструкция</div>
                                    {viewPractice.instruction_short && (
                                        <p className="text-slate-700 mb-3 whitespace-pre-wrap">
                                            {renderDescriptionWithLinks(viewPractice.instruction_short)}
                                        </p>
                                    )}
                                    {viewPractice.instruction_full && (
                                        <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                            <summary className="cursor-pointer text-sm font-semibold text-slate-700">Показать полную инструкцию</summary>
                                            <div className="mt-3 text-slate-700 whitespace-pre-wrap">
                                                {renderDescriptionWithLinks(viewPractice.instruction_full)}
                                            </div>
                                        </details>
                                    )}
                                </div>
                            )}

                            {splitReflectionQuestions(viewPractice.reflection_questions).length > 0 && (
                                <div className="mb-6 p-5 rounded-2xl border border-slate-100 bg-white">
                                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Вопросы для рефлексивного отклика</div>
                                    <ul className="list-disc pl-6 text-slate-700 space-y-1">
                                        {splitReflectionQuestions(viewPractice.reflection_questions).map((question, idx) => (
                                            <li key={`${question}-${idx}`}>{question}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {viewPractice.description && (
                                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 text-lg text-slate-700 leading-relaxed whitespace-pre-wrap font-medium italic mb-6">
                                    {renderDescriptionWithLinks(viewPractice.description)}
                                </div>
                            )}
                        </div>

                        <div className="mt-10 pt-6 border-t border-slate-100 flex justify-end gap-3">
                            {isAdmin && (
                                <Button variant="secondary" onClick={() => { setViewPractice(null); openEditModal(viewPractice, { stopPropagation: () => { } }); }}>Редактировать</Button>
                            )}
                            <Button onClick={() => setViewPractice(null)}>Закрыть</Button>
                        </div>
                    </>
                )}
            </ModalShell>

            <ConfirmationModal
                isOpen={!!deletePracticeId}
                onClose={() => setDeletePracticeId(null)}
                onConfirm={() => {
                    if (onDeletePractice && deletePracticeId) onDeletePractice(deletePracticeId);
                    setIsEditModalOpen(false);
                    setDeletePracticeId(null);
                }}
                title="Удалить практику?"
                message="Это действие невозможно отменить."
                confirmText="Удалить"
                confirmVariant="danger"
            />
        </div>
    );
};

export default PracticesView;
