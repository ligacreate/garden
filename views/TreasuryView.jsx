import React, { useEffect, useMemo, useState } from 'react';
import { Search, Gem, Plus, Check, RotateCw } from 'lucide-react';
import Button from '../components/Button';
import ModalShell from '../components/ModalShell';
import { api } from '../services/dataService';

const normalizeType = (str) => {
    if (!str) return 'Общее';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
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

const TreasuryView = ({ user, practices = [], onForked, onNotify }) => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('Все');
    const [timeFilter, setTimeFilter] = useState('all');
    const [viewItem, setViewItem] = useState(null);
    const [forkingId, setForkingId] = useState(null);

    const loadTreasury = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.getTreasuryPractices();
            setItems(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error('Treasury load failed:', e);
            setError(e?.message || 'Не удалось загрузить Сокровищницу');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTreasury();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Set of original practice IDs already forked into the user's collection.
    // Используется чтобы заменить кнопку «Добавить в коллекцию» на «Уже добавлено».
    const forkedOriginalIds = useMemo(() => {
        const set = new Set();
        practices.forEach((p) => {
            if (p?.forked_from != null) set.add(String(p.forked_from));
        });
        return set;
    }, [practices]);

    const categories = useMemo(() => {
        const set = new Set();
        items.forEach((p) => {
            const norm = normalizeType(p.type);
            if (norm && norm !== 'Общее') set.add(norm);
        });
        return ['Все', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'))];
    }, [items]);

    const filtered = useMemo(() => items.filter((p) => {
        const pType = normalizeType(p.type);
        const matchesCategory = selectedCategory === 'Все' || pType === selectedCategory;
        const q = search.trim().toLowerCase();
        const matchesSearch = !q
            || p.title?.toLowerCase().includes(q)
            || p.description?.toLowerCase().includes(q)
            || p.short_goal?.toLowerCase().includes(q)
            || p.author?.name?.toLowerCase().includes(q);

        let matchesTime = true;
        if (timeFilter !== 'all') {
            const minutes = parseDurationMinutes(p) || 0;
            if (timeFilter === 'short') matchesTime = minutes >= 5 && minutes <= 15;
            else if (timeFilter === 'medium') matchesTime = minutes >= 20 && minutes <= 30;
            else if (timeFilter === 'long') matchesTime = minutes >= 40;
        }

        return matchesCategory && matchesSearch && matchesTime;
    }), [items, selectedCategory, search, timeFilter]);

    const handleFork = async (original, e) => {
        if (e) e.stopPropagation();
        if (!user?.id) {
            onNotify?.('Нужна авторизация для копирования');
            return;
        }
        if (forkedOriginalIds.has(String(original.id))) {
            onNotify?.('Эта практика уже в вашей коллекции');
            return;
        }
        setForkingId(original.id);
        try {
            const saved = await api.forkPractice(original.id, user.id);
            if (saved) {
                onForked?.(saved);
                onNotify?.(`«${saved.title || original.title}» добавлена в Мои практики`);
            }
        } catch (err) {
            console.error('Fork failed:', err);
            onNotify?.(err?.message || 'Не удалось добавить в коллекцию');
        } finally {
            setForkingId(null);
        }
    };

    return (
        <div className="h-full flex flex-col animate-in fade-in duration-700 pb-20 pt-6 px-4 lg:px-0">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 w-full gap-3">
                <div>
                    <div className="flex items-center gap-3">
                        <Gem size={32} className="text-blue-600" strokeWidth={1.5} />
                        <h1 className="text-4xl font-light text-slate-800 tracking-tight">Сокровищница</h1>
                        <span className="md:hidden inline-flex items-center justify-center px-2.5 py-1 rounded-full bg-white/80 border border-slate-200 text-xs font-mono text-blue-600">
                            {items.length}
                        </span>
                    </div>
                    <p className="text-slate-400 mt-1 font-light">
                        Общая бесплатная база практик Лиги — добавляйте в свою коллекцию
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-right hidden md:block">
                        <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">В сокровищнице</div>
                        <div className="font-mono text-xl text-blue-600">{items.length}</div>
                    </div>
                    <Button variant="ghost" className="!p-2" onClick={loadTreasury} title="Обновить">
                        <RotateCw size={18} className={loading ? 'animate-spin' : ''} />
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <div className="mb-10 w-full">
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-4 items-stretch">
                        <div className="relative w-full sm:flex-1">
                            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-full py-3 pl-12 pr-6 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm"
                                placeholder="Найти по названию, описанию, автору..."
                            />
                        </div>
                        <select
                            value={timeFilter}
                            onChange={(e) => setTimeFilter(e.target.value)}
                            className="bg-white border border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider rounded-full px-4 py-2 outline-none focus:border-blue-300 transition-all cursor-pointer h-[44px] sm:h-auto"
                        >
                            <option value="all">Любое время</option>
                            <option value="short">5–15 мин</option>
                            <option value="medium">20–30 мин</option>
                            <option value="long">40+ мин</option>
                        </select>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {categories.map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 border ${
                                    selectedCategory === cat
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

            {/* Body */}
            <div className="w-full">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
                        <div className="w-10 h-10 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
                        <span className="text-sm">Открываем Сокровищницу…</span>
                    </div>
                ) : error ? (
                    <div className="text-center py-20">
                        <div className="text-6xl mb-4">😞</div>
                        <h3 className="text-xl font-medium text-slate-900 mb-2">Не удалось загрузить</h3>
                        <p className="text-slate-500 mb-4">{error}</p>
                        <Button onClick={loadTreasury}>Попробовать ещё раз</Button>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="text-6xl mb-4">💎</div>
                        <h3 className="text-xl font-medium text-slate-900 mb-2">
                            {items.length === 0 ? 'Сокровищница пока пуста' : 'Ничего не найдено'}
                        </h3>
                        <p className="text-slate-500">
                            {items.length === 0
                                ? 'Скоро здесь появятся практики Лиги'
                                : 'Попробуйте изменить параметры поиска или фильтры'}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filtered.map((practice) => {
                            const alreadyForked = forkedOriginalIds.has(String(practice.id));
                            return (
                                <div
                                    key={practice.id}
                                    onClick={() => setViewItem(practice)}
                                    className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 flex flex-col h-full group hover:shadow-xl hover:-translate-y-1 transition-all duration-500 relative cursor-pointer"
                                >
                                    <div className="flex justify-between items-start mb-6">
                                        <div className="flex items-center gap-3">
                                            <div className="text-3xl bg-blue-50 w-12 h-12 rounded-2xl flex items-center justify-center border border-blue-100 group-hover:scale-110 transition-transform duration-300">
                                                {practice.icon || '📄'}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-slate-900 text-lg leading-tight">{practice.title}</h3>
                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                    {practice.type && (
                                                        <span className="px-3 py-1 inline-block bg-white border border-dashed border-slate-300 rounded-full text-slate-600 text-xs font-medium">
                                                            {practice.type}
                                                        </span>
                                                    )}
                                                    {getDurationLabel(practice) && (
                                                        <span className="px-3 py-1 inline-block bg-white border border-dashed border-slate-300 rounded-full text-slate-600 text-xs font-medium">
                                                            {getDurationLabel(practice)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex-1">
                                        {practice.short_goal && (
                                            <p className="text-slate-800 text-sm font-semibold mb-2 line-clamp-2">
                                                Цель: {practice.short_goal}
                                            </p>
                                        )}
                                        <p className="text-slate-600 text-[15px] leading-relaxed line-clamp-4">
                                            {practice.description || 'Описание отсутствует...'}
                                        </p>
                                    </div>

                                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                                        <div className="text-xs text-slate-500 truncate">
                                            {practice.author?.name
                                                ? <>Автор: <span className="font-semibold text-slate-700">{practice.author.name}</span></>
                                                : <span className="text-slate-400 italic">Автор скрыт</span>}
                                        </div>
                                        <Button
                                            variant={alreadyForked ? 'secondary' : 'primary'}
                                            className="!py-1.5 !px-3 !text-xs whitespace-nowrap"
                                            onClick={(e) => handleFork(practice, e)}
                                            disabled={alreadyForked || forkingId === practice.id}
                                            icon={alreadyForked ? Check : Plus}
                                        >
                                            {alreadyForked ? 'В коллекции' : forkingId === practice.id ? 'Копирую…' : 'В мою коллекцию'}
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* View modal */}
            <ModalShell
                isOpen={!!viewItem}
                onClose={() => setViewItem(null)}
                size="lg"
            >
                {viewItem && (
                    <>
                        <div className="flex items-start gap-6 mb-8">
                            <div className="text-5xl bg-blue-50 w-24 h-24 rounded-3xl flex items-center justify-center border border-blue-100 shadow-sm flex-shrink-0">
                                {viewItem.icon || '📄'}
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-3xl font-bold text-slate-900 mb-3">{viewItem.title}</h2>
                                <div className="flex flex-wrap gap-2">
                                    {viewItem.type && <span className="px-3 py-1 bg-white text-slate-600 rounded-full text-sm font-medium border border-dashed border-slate-300">{viewItem.type}</span>}
                                    {getDurationLabel(viewItem) && <span className="px-3 py-1 bg-white text-slate-600 rounded-full text-sm font-medium border border-dashed border-slate-300">{getDurationLabel(viewItem)}</span>}
                                </div>
                                {viewItem.author?.name && (
                                    <div className="text-xs text-slate-500 mt-3">
                                        Автор: <span className="font-semibold text-slate-700">{viewItem.author.name}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="prose prose-slate max-w-none">
                            {viewItem.short_goal && (
                                <div className="mb-4 p-4 rounded-2xl border border-blue-100 bg-blue-50/40">
                                    <div className="text-xs font-bold uppercase tracking-wider text-blue-700 mb-1">Краткая цель</div>
                                    <div className="text-slate-800 font-medium">{viewItem.short_goal}</div>
                                </div>
                            )}

                            {(viewItem.instruction_short || viewItem.instruction_full) && (
                                <div className="mb-6 p-5 rounded-2xl border border-slate-100 bg-white">
                                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Инструкция</div>
                                    {viewItem.instruction_short && (
                                        <p className="text-slate-700 mb-3 whitespace-pre-wrap">
                                            {renderDescriptionWithLinks(viewItem.instruction_short)}
                                        </p>
                                    )}
                                    {viewItem.instruction_full && (
                                        <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                            <summary className="cursor-pointer text-sm font-semibold text-slate-700">Показать полную инструкцию</summary>
                                            <div className="mt-3 text-slate-700 whitespace-pre-wrap">
                                                {renderDescriptionWithLinks(viewItem.instruction_full)}
                                            </div>
                                        </details>
                                    )}
                                </div>
                            )}

                            {splitReflectionQuestions(viewItem.reflection_questions).length > 0 && (
                                <div className="mb-6 p-5 rounded-2xl border border-slate-100 bg-white">
                                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Вопросы для рефлексивного отклика</div>
                                    <ul className="list-disc pl-6 text-slate-700 space-y-1">
                                        {splitReflectionQuestions(viewItem.reflection_questions).map((q, idx) => (
                                            <li key={`${q}-${idx}`}>{q}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {viewItem.description && (
                                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 text-lg text-slate-700 leading-relaxed whitespace-pre-wrap font-medium italic mb-6">
                                    {renderDescriptionWithLinks(viewItem.description)}
                                </div>
                            )}
                        </div>

                        <div className="mt-10 pt-6 border-t border-slate-100 flex flex-wrap justify-end gap-3">
                            {(() => {
                                const alreadyForked = forkedOriginalIds.has(String(viewItem.id));
                                return (
                                    <Button
                                        onClick={(e) => handleFork(viewItem, e)}
                                        disabled={alreadyForked || forkingId === viewItem.id}
                                        icon={alreadyForked ? Check : Plus}
                                    >
                                        {alreadyForked ? 'Уже в вашей коллекции' : forkingId === viewItem.id ? 'Копирую…' : 'Добавить в мою коллекцию'}
                                    </Button>
                                );
                            })()}
                            <Button variant="secondary" onClick={() => setViewItem(null)}>Закрыть</Button>
                        </div>
                    </>
                )}
            </ModalShell>
        </div>
    );
};

export default TreasuryView;
