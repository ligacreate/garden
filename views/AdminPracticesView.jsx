import React, { useEffect, useMemo, useState } from 'react';
import { Search, Gem, RotateCw, Eye, EyeOff } from 'lucide-react';
import Button from '../components/Button';
import { api } from '../services/dataService';

const AdminPracticesView = ({ onNotify }) => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all'); // all | published | drafts
    const [pendingId, setPendingId] = useState(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.getAdminPractices();
            setItems(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error('Admin practices load failed:', e);
            setError(e?.message || 'Не удалось загрузить практики');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const filtered = useMemo(() => items.filter((p) => {
        if (filter === 'published' && !p.is_published) return false;
        if (filter === 'drafts' && p.is_published) return false;
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (
            p.title?.toLowerCase().includes(q)
            || p.type?.toLowerCase().includes(q)
            || p.author?.name?.toLowerCase().includes(q)
        );
    }), [items, search, filter]);

    const counters = useMemo(() => ({
        total: items.length,
        published: items.filter((p) => p.is_published).length,
        drafts: items.filter((p) => !p.is_published).length
    }), [items]);

    const handleTogglePublish = async (practice) => {
        const next = !practice.is_published;
        setPendingId(practice.id);
        try {
            const updated = await api.setPracticePublished(practice.id, next);
            setItems((prev) => prev.map((p) => (p.id === practice.id
                ? {
                    ...p,
                    is_published: updated?.is_published ?? next,
                    published_at: updated?.published_at ?? (next ? new Date().toISOString() : null)
                }
                : p)));
            onNotify?.(next ? 'Опубликовано в Сокровищнице' : 'Снято с публикации');
        } catch (e) {
            console.error('Toggle publish failed:', e);
            onNotify?.(e?.message || 'Не удалось изменить статус публикации');
        } finally {
            setPendingId(null);
        }
    };

    const FilterChip = ({ value, label, count }) => (
        <button
            onClick={() => setFilter(value)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                filter === value
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600'
            }`}
        >
            {label}{typeof count === 'number' ? ` · ${count}` : ''}
        </button>
    );

    return (
        <div className="surface-card p-6 md:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div className="flex items-center gap-3">
                    <Gem size={22} className="text-blue-600" strokeWidth={1.5} />
                    <h3 className="font-display font-semibold text-slate-900 text-lg">
                        Практики ({counters.total})
                    </h3>
                </div>
                <Button
                    variant="ghost"
                    className="!p-2 text-slate-400 hover:text-blue-600"
                    onClick={load}
                    title="Обновить"
                >
                    <RotateCw size={18} className={loading ? 'animate-spin' : ''} />
                </Button>
            </div>

            <div className="flex flex-col md:flex-row gap-3 mb-5">
                <div className="relative flex-1">
                    <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Поиск по названию, теме, автору..."
                        className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                    />
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                    <FilterChip value="all" label="Все" count={counters.total} />
                    <FilterChip value="published" label="В Сокровищнице" count={counters.published} />
                    <FilterChip value="drafts" label="Черновики" count={counters.drafts} />
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
                    <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
                    <span className="text-sm">Загружаем все практики…</span>
                </div>
            ) : error ? (
                <div className="text-center py-12">
                    <p className="text-rose-600 mb-3">{error}</p>
                    <Button onClick={load}>Попробовать ещё раз</Button>
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm border border-dashed border-slate-200 rounded-2xl">
                    Ничего не найдено
                </div>
            ) : (
                <div className="overflow-auto rounded-2xl border border-slate-100">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-3 text-left">Практика</th>
                                <th className="px-4 py-3 text-left">Автор</th>
                                <th className="px-4 py-3 text-left">Тема</th>
                                <th className="px-4 py-3 text-left">Длит.</th>
                                <th className="px-4 py-3 text-left">Статус</th>
                                <th className="px-4 py-3 text-right">Действие</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((p) => {
                                const isPending = pendingId === p.id;
                                const dur = p.duration_minutes ?? p.time;
                                return (
                                    <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                                        <td className="px-4 py-3 align-top">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="text-lg">{p.icon || '📄'}</span>
                                                <div className="min-w-0">
                                                    <div className="font-medium text-slate-800 truncate max-w-[260px]">{p.title || 'Без названия'}</div>
                                                    {p.forked_from_author_name && (
                                                        <div className="text-[11px] text-slate-400">↩ из Сокровищницы · {p.forked_from_author_name}</div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 align-top">
                                            {p.author?.name || <span className="text-slate-400">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 align-top">
                                            {p.type || <span className="text-slate-400">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 align-top whitespace-nowrap">
                                            {dur ? `${dur}${typeof dur === 'number' ? ' мин' : ''}` : <span className="text-slate-400">—</span>}
                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            {p.is_published ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-100">
                                                    <Eye size={12} /> В Сокровищнице
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold">
                                                    <EyeOff size={12} /> Черновик
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right align-top">
                                            <Button
                                                variant={p.is_published ? 'secondary' : 'primary'}
                                                className="!py-1.5 !px-3 !text-xs whitespace-nowrap"
                                                onClick={() => handleTogglePublish(p)}
                                                disabled={isPending}
                                            >
                                                {isPending
                                                    ? '...'
                                                    : p.is_published ? 'Снять' : 'Опубликовать'}
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default AdminPracticesView;
