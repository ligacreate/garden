import React, { useState, useEffect } from 'react';
import { Trash2, LogOut, Edit2, RotateCw, BarChart, MapPin, Users, TrendingUp, Calendar, ArrowUpRight } from 'lucide-react';
import Button from '../components/Button';
import Input from '../components/Input';
import RichEditor from '../components/RichEditor';
import ConfirmationModal from '../components/ConfirmationModal';
import { api } from '../services/dataService';

const AdminStatsDashboard = ({ meetings = [], users = [] }) => {
    const [period, setPeriod] = useState('month'); // 'month', 'year', 'all', 'custom'
    const [customRange, setCustomRange] = useState({ from: '', to: '' });

    // Filter meetings by period and only completed
    const filteredMeetings = meetings.filter(m => {
        const status = String(m.status || '').toLowerCase();
        if (status !== 'completed') return false;
        if (period === 'all') return true;
        const date = new Date(m.date);
        const now = new Date();
        if (Number.isNaN(date.getTime())) return false;
        if (period === 'month') {
            return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        }
        if (period === 'year') {
            return date.getFullYear() === now.getFullYear();
        }
        if (period === 'custom') {
            const from = customRange.from ? new Date(customRange.from) : null;
            const to = customRange.to ? new Date(customRange.to) : null;
            if (from && date < from) return false;
            if (to) {
                const end = new Date(to);
                end.setHours(23, 59, 59, 999);
                if (date > end) return false;
            }
            return true;
        }
        return true;
    });

    // Stats Calculations
    const totalMeetings = filteredMeetings.length;
    const totalGuests = filteredMeetings.reduce((acc, m) => acc + (parseInt(m.guests) || 0) + (parseInt(m.new_guests) || 0), 0);
    const totalIncome = filteredMeetings.reduce((acc, m) => {
        const val = parseInt((m.income || '0').toString().replace(/\D/g, '')) || 0;
        return acc + val;
    }, 0);

    // Cities Stats
    const cities = {};
    filteredMeetings.forEach(m => {
        const organizer = users.find(u => u.id === m.user_id);
        const city = m.city || organizer?.city || 'Не указан';
        cities[city] = (cities[city] || 0) + 1;
    });
    const topCities = Object.entries(cities).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Leaders Stats
    const leaders = {};
    filteredMeetings.forEach(m => {
        const leaderName = users.find(u => u.id === m.user_id)?.name || 'Неизвестный';
        leaders[leaderName] = (leaders[leaderName] || 0) + 1;
    });
    const topLeaders = Object.entries(leaders).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header / Filter */}
            <div className="flex justify-between items-center surface-card p-4">
                <h2 className="text-xl font-display font-semibold text-slate-800 flex items-center gap-2">
                    <TrendingUp className="text-blue-700" />
                    Статистика
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex bg-slate-100/80 p-1 rounded-xl">
                        {['month', 'year', 'all', 'custom'].map(p => (
                            <button
                                key={p}
                                onClick={() => setPeriod(p)}
                                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${period === p ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {p === 'month' ? 'Этот месяц' : p === 'year' ? 'Этот год' : p === 'custom' ? 'Период' : 'Все время'}
                            </button>
                        ))}
                    </div>
                    {period === 'custom' && (
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Input
                                type="date"
                                value={customRange.from}
                                onChange={e => setCustomRange({ ...customRange, from: e.target.value })}
                                className="!py-2 !px-3 !text-xs"
                            />
                            <span className="text-slate-400">—</span>
                            <Input
                                type="date"
                                value={customRange.to}
                                onChange={e => setCustomRange({ ...customRange, to: e.target.value })}
                                className="!py-2 !px-3 !text-xs"
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Key Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-blue-500 to-blue-700 p-6 rounded-3xl text-white shadow-[0_20px_40px_-24px_rgba(47,111,84,0.6)] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><Calendar size={64} /></div>
                    <div className="relative z-10">
                        <div className="text-blue-100 text-sm font-medium mb-1">Проведено встреч</div>
                        <div className="text-4xl font-bold tracking-tight">{totalMeetings}</div>
                    </div>
                </div>
                <div className="surface-card p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 text-slate-100 group-hover:scale-110 transition-transform"><Users size={64} /></div>
                    <div className="relative z-10">
                        <div className="text-slate-400 text-sm font-medium mb-1 flex items-center gap-2"><ArrowUpRight size={14} className="text-green-500" /> Гостей пришло</div>
                        <div className="text-4xl font-bold text-slate-800 tracking-tight">{totalGuests}</div>
                    </div>
                </div>
                <div className="surface-card p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 text-slate-100 group-hover:scale-110 transition-transform"><BarChart size={64} /></div>
                    <div className="relative z-10">
                        <div className="text-slate-400 text-sm font-medium mb-1">Общий доход (rub)</div>
                        <div className="text-4xl font-bold text-slate-800 tracking-tight">{totalIncome.toLocaleString()}</div>
                    </div>
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Cities */}
                <div className="surface-card p-6 min-h-[300px]">
                    <h3 className="text-lg font-display font-semibold text-slate-800 mb-6 flex items-center gap-2 border-b border-slate-50 pb-4">
                        <MapPin size={20} className="text-rose-600" />
                        Активные города
                    </h3>
                    <div className="space-y-4">
                        {topCities.map(([city, count], i) => (
                            <div key={city} className="flex items-center gap-4">
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-xs">{i + 1}</div>
                                <div className="flex-1">
                                    <div className="flex justify-between mb-1">
                                        <span className="font-medium text-slate-700">{city}</span>
                                        <span className="font-bold text-slate-900">{count}</span>
                                    </div>
                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-rose-400 rounded-full" style={{ width: `${(count / topCities[0][1]) * 100}%` }}></div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Top Leaders */}
                <div className="surface-card p-6 min-h-[300px]">
                    <h3 className="text-lg font-display font-semibold text-slate-800 mb-6 flex items-center gap-2 border-b border-slate-50 pb-4">
                        <Users size={20} className="text-indigo-600" />
                        Топ ведущих
                    </h3>
                    <div className="space-y-4">
                        {topLeaders.map(([name, count], i) => (
                            <div key={name} className="flex items-center gap-4">
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-xs">{i + 1}</div>
                                <div className="flex-1">
                                    <div className="flex justify-between mb-1">
                                        <span className="font-medium text-slate-700">{name}</span>
                                        <span className="font-bold text-slate-900">{count}</span>
                                    </div>
                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${(count / topLeaders[0][1]) * 100}%` }}></div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

const AdminPanel = ({ users, knowledgeBase, news = [], onUpdateUserRole, onRefreshUsers, onAddContent, onAddNews, onUpdateNews, onDeleteNews, onExit, onNotify, onSwitchToApp, onGetAllMeetings, onGetAllEvents, onUpdateEvent, onDeleteEvent }) => {
    const [tab, setTab] = useState('stats');
    const [newContent, setNewContent] = useState({ title: '', role: 'all', type: 'Статья', tags: '', video_link: '', file_link: '' });
    const [allMeetings, setAllMeetings] = useState([]);
    const [allEvents, setAllEvents] = useState([]);
    const [eventSearch, setEventSearch] = useState('');
    const [editingEvent, setEditingEvent] = useState(null);

    useEffect(() => {
        if (tab === 'stats' && onGetAllMeetings) {
            onGetAllMeetings().then(data => {
                if (data) setAllMeetings(data);
            });
        }
        if (tab === 'events' && onGetAllEvents) {
            onGetAllEvents().then(data => {
                if (data) setAllEvents(data);
            });
        }
    }, [tab, onGetAllMeetings, onGetAllEvents]);

    // Modal State
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => { }, variant: 'primary' });


    const parseTags = (rawTags) => {
        if (!rawTags) return [];
        if (Array.isArray(rawTags)) return rawTags;
        return rawTags
            .split(',')
            .map(t => t.trim())
            .filter(Boolean);
    };

    const handleAdd = () => {
        onAddContent({
            id: Date.now(),
            ...newContent,
            type: 'Статья',
            tags: parseTags(newContent.tags)
        });
        setNewContent({ title: '', role: 'all', type: 'Статья', tags: '', video_link: '', file_link: '' });
        onNotify("Материал добавлен в базу знаний");
    };

    const confirmAction = (title, message, onConfirm, variant = 'primary') => {
        setConfirmModal({
            isOpen: true,
            title,
            message,
            onConfirm,
            variant
        });
    };

    return (
        <div className="h-full pb-20 pt-6 px-4 lg:px-0">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex justify-between items-end mb-8 animate-in fade-in duration-700">
                    <div>
                        <h1 className="text-4xl font-display font-semibold text-slate-900 tracking-tight">Админ-панель</h1>
                        <p className="text-slate-500 mt-1 font-light">Управление приложением</p>
                    </div>
                    <Button variant="ghost" icon={LogOut} onClick={onExit}>Выйти</Button>
                </div>

                {/* App Switcher */}
                <div className="bg-blue-50/80 border border-blue-100 p-4 rounded-3xl flex justify-between items-center">
                    <span className="text-sm text-blue-800 font-medium">Хотите посмотреть, как выглядит сад?</span>
                    <Button variant="primary" className="!py-2 !px-4 text-xs" onClick={onSwitchToApp}>Открыть приложение</Button>
                </div>

                <div className="flex gap-2 items-center justify-between">
                    <div className="bg-white/70 p-1 rounded-2xl flex gap-1 w-fit border border-white/60">
                        {['stats', 'users', 'content', 'news', 'events'].map(t => (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === t
                                    ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/70'}`}
                            >
                                {t === 'stats' ? 'Статистика' : t === 'users' ? 'Пользователи' : t === 'content' ? 'Контент' : t === 'events' ? 'События' : 'Новости'}
                            </button>
                        ))}
                    </div>
                    {tab === 'users' && <Button variant="ghost" className="!p-2 text-slate-400 hover:text-blue-600" onClick={onRefreshUsers} title="Обновить список"><RotateCw size={20} /></Button>}
                </div>

                {tab === 'stats' && (
                    <AdminStatsDashboard meetings={allMeetings} users={users} />
                )}

                {tab === 'news' && (
                    <div className="surface-card p-8">
                        <h3 className="font-display font-semibold text-slate-900 mb-4">Новости ({news.length})</h3>
                        <div className="space-y-4 mb-8">
                            {news.map(n => (
                                <div key={n.id} className="p-4 bg-slate-50/80 rounded-xl border border-slate-100 flex justify-between items-start group">
                                    <div>
                                        <div className="font-bold text-slate-800">{n.title}</div>
                                        <div className="text-sm text-slate-600 mt-1" dangerouslySetInnerHTML={{ __html: n.body }} />
                                        <div className="text-xs text-slate-400 mt-2">{new Date(n.created_at || Date.now()).toLocaleDateString()}</div>
                                    </div>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => setNewContent({ ...n })} className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><Edit2 size={16} /></button>
                                        <button onClick={() => {
                                            confirmAction(
                                                "Удалить новость?",
                                                `Вы собираетесь удалить новость "${n.title}". Это действие невозможно отменить.`,
                                                () => {
                                                    if (onDeleteNews) onDeleteNews(n.id);
                                                    onNotify("Новость удалена");
                                                },
                                                'danger'
                                            );
                                        }} className="p-2 text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={16} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <h3 className="font-display font-semibold text-slate-900 mb-4">{newContent.id ? 'Редактировать новость' : 'Добавить новость'}</h3>
                        <div className="space-y-4">
                            <Input placeholder="Заголовок новости" value={newContent.title} onChange={e => setNewContent({ ...newContent, title: e.target.value })} />
                            <RichEditor
                                value={newContent.body || ''}
                                onChange={val => setNewContent({ ...newContent, body: val })}
                                placeholder="Текст новости..."
                            />
                            <div className="flex gap-2">
                                {newContent.id && <Button variant="secondary" onClick={() => setNewContent({ title: '', body: '' })}>Отмена</Button>}
                                <Button onClick={() => {
                                    if (newContent.id) {
                                        if (onUpdateNews) onUpdateNews(newContent);
                                    } else {
                                        onAddNews({ id: Date.now(), title: newContent.title, body: newContent.body, created_at: new Date().toISOString() });
                                    }
                                    setNewContent({ title: '', body: '' }); // Clear
                                }}>{newContent.id ? 'Сохранить изменения' : 'Опубликовать новость'}</Button>
                            </div>
                        </div>

                        <div className="border-t border-slate-100 my-8"></div>

                        <h3 className="font-display font-semibold text-slate-900 mb-4">Шаблоны поздравлений</h3>
                        <div className="bg-blue-50/80 p-4 rounded-xl mb-6 text-sm text-blue-800">
                            Используйте <b>{'{name}'}</b> чтобы вставить имя именинника автоматически.<br />
                            Пример: <i>"С днем рождения, {'{name}'}!"</i>
                        </div>
                        <div className="space-y-4">
                            <Input
                                placeholder="Текст поздравления..."
                                value={newContent.template || ''}
                                onChange={e => setNewContent({ ...newContent, template: e.target.value })}
                            />
                            <Button onClick={async () => {
                                if (!newContent.template) return;
                                await api.addBirthdayTemplate(newContent.template);
                                setNewContent({ ...newContent, template: '' });
                                onNotify("Шаблон добавлен!");
                            }}>Добавить вариант поздравления</Button>
                        </div>
                    </div>
                )}

                {tab === 'events' && (
                    <div className="surface-card p-8">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-display font-semibold text-slate-900">События ({allEvents.length})</h3>
                            <Button variant="ghost" className="!p-2 text-slate-400 hover:text-blue-600" onClick={async () => {
                                if (!onGetAllEvents) return;
                                const data = await onGetAllEvents();
                                if (data) setAllEvents(data);
                            }} title="Обновить список"><RotateCw size={20} /></Button>
                        </div>

                        <Input
                            placeholder="Поиск по названию или городу"
                            value={eventSearch}
                            onChange={(e) => setEventSearch(e.target.value)}
                        />

                        <div className="space-y-3 max-h-[420px] overflow-y-auto mt-4">
                            {[...allEvents]
                                .filter(ev => {
                                    const q = eventSearch.trim().toLowerCase();
                                    if (!q) return true;
                                    return (ev.title || '').toLowerCase().includes(q) || (ev.city || '').toLowerCase().includes(q);
                                })
                                .map(ev => (
                                    <div key={ev.id} className="p-4 bg-slate-50/80 rounded-xl border border-slate-100 flex justify-between items-start group">
                                        <div className="min-w-0">
                                            <div className="font-medium text-slate-800 truncate">{ev.title || 'Без названия'}</div>
                                            <div className="text-xs text-slate-400 mt-1">{ev.date || '—'} • {ev.city || '—'}</div>
                                        </div>
                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => setEditingEvent({
                                                ...ev,
                                                image_focus_x: ev.image_focus_x ?? 50,
                                                image_focus_y: ev.image_focus_y ?? 50
                                            })} className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><Edit2 size={16} /></button>
                                            <button onClick={() => {
                                                confirmAction(
                                                    "Удалить событие?",
                                                    `Вы собираетесь удалить событие "${ev.title || 'Без названия'}".`,
                                                    async () => {
                                                        if (onDeleteEvent) {
                                                            await onDeleteEvent(ev.id);
                                                            setAllEvents(allEvents.filter(e => e.id !== ev.id));
                                                            onNotify("Событие удалено");
                                                        }
                                                    },
                                                    'danger'
                                                );
                                            }} className="p-2 text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={16} /></button>
                                        </div>
                                    </div>
                                ))}
                        </div>

                        <hr className="border-slate-100 my-6" />

                        <h3 className="font-display font-semibold text-slate-900 mb-4">{editingEvent?.id ? 'Редактировать событие' : 'Выберите событие для редактирования'}</h3>
                        {editingEvent?.id && (
                            <div className="space-y-4">
                                <Input
                                    placeholder="Название"
                                    value={editingEvent.title || ''}
                                    onChange={e => setEditingEvent({ ...editingEvent, title: e.target.value })}
                                />
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <Input
                                        placeholder="Дата (например 22.02.2026)"
                                        value={editingEvent.date || ''}
                                        onChange={e => setEditingEvent({ ...editingEvent, date: e.target.value })}
                                    />
                                    <Input
                                        placeholder="Время (например 19:00)"
                                        value={editingEvent.time || ''}
                                        onChange={e => setEditingEvent({ ...editingEvent, time: e.target.value })}
                                    />
                                    <Input
                                        placeholder="Город"
                                        value={editingEvent.city || ''}
                                        onChange={e => setEditingEvent({ ...editingEvent, city: e.target.value })}
                                    />
                                </div>
                                <Input
                                    placeholder="Локация"
                                    value={editingEvent.location || ''}
                                    onChange={e => setEditingEvent({ ...editingEvent, location: e.target.value })}
                                />
                                <Input
                                    placeholder="Ссылка на фото (image_url)"
                                    value={editingEvent.image_url || ''}
                                    onChange={e => setEditingEvent({ ...editingEvent, image_url: e.target.value })}
                                />
                                {editingEvent.image_url && (
                                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">
                                        <div>
                                            <div className="text-xs text-slate-500 mb-2">Полное фото</div>
                                            <div className="w-full max-h-[320px] rounded-2xl overflow-hidden bg-slate-100">
                                                <img
                                                    src={editingEvent.image_url}
                                                    alt={editingEvent.title || 'preview'}
                                                    className="w-full h-full object-contain"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <div className="text-xs text-slate-500 mb-2">Как в расписании</div>
                                            <div className="w-full rounded-2xl overflow-hidden bg-slate-100" style={{ aspectRatio: '4 / 3' }}>
                                                <img
                                                    src={editingEvent.image_url}
                                                    alt={editingEvent.title || 'preview-crop'}
                                                    className="w-full h-full object-cover"
                                                    style={{ objectPosition: `${editingEvent.image_focus_x ?? 50}% ${editingEvent.image_focus_y ?? 50}%` }}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-xs text-slate-500 ml-1">Смещение по X</label>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    value={editingEvent.image_focus_x ?? 50}
                                                    onChange={(e) => setEditingEvent({ ...editingEvent, image_focus_x: parseInt(e.target.value, 10) })}
                                                    className="w-full"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-slate-500 ml-1">Смещение по Y</label>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    value={editingEvent.image_focus_y ?? 50}
                                                    onChange={(e) => setEditingEvent({ ...editingEvent, image_focus_y: parseInt(e.target.value, 10) })}
                                                    className="w-full"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <textarea
                                    className="w-full min-h-[140px] bg-slate-50 border border-slate-200 rounded-2xl p-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-slate-700"
                                    placeholder="Описание"
                                    value={editingEvent.description || ''}
                                    onChange={e => setEditingEvent({ ...editingEvent, description: e.target.value })}
                                />
                                <div className="flex gap-2">
                                    <Button variant="secondary" onClick={() => setEditingEvent(null)}>Отмена</Button>
                                    <Button onClick={async () => {
                                        if (!onUpdateEvent) return;
                                        try {
                                            const updated = await onUpdateEvent(editingEvent);
                                            setAllEvents(allEvents.map(e => e.id === updated.id ? updated : e));
                                            onNotify("Событие обновлено");
                                        } catch (e) {
                                            console.error(e);
                                            onNotify("Ошибка обновления");
                                        }
                                    }}>Сохранить</Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {tab === 'users' ? (
                    <div className="surface-card p-8 overflow-hidden">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-slate-100 text-xs uppercase text-slate-400">
                                    <th className="pb-4 pl-2">Пользователь</th>
                                    <th className="pb-4">Роль</th>
                                    <th className="pb-4">Действия</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {[...(users || [])].sort((a, b) => b.id - a.id).map(u => {
                                    const isNew = (Date.now() - u.id) < 24 * 60 * 60 * 1000 && u.id > 1000; // Check if registered in last 24h (and not initial seed data)
                                    return (
                                        <tr key={u.id} className={isNew ? "bg-blue-50/30" : ""}>
                                            <td className="py-4 pl-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="font-medium text-slate-800">{u.name}</div>
                                                    {isNew && <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">New</span>}
                                                </div>
                                                <div className="text-xs text-slate-400">{u.email}</div>
                                            </td>
                                            <td className="py-4">
                                                <select value={u.role} onChange={(e) => onUpdateUserRole(u.id, e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl text-xs py-2 px-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all">
                                                    <option value="applicant">Абитуриент</option>
                                                    <option value="intern">Стажер</option>
                                                    <option value="leader">Ведущая</option>
                                                    <option value="mentor">Ментор</option>
                                                    <option value="curator">Куратор</option>
                                                    <option value="admin">Администратор</option>
                                                </select>
                                            </td>
                                            <td className="py-4">
                                                <div className="flex items-center gap-2">
                                                    {u.email !== 'olga@skrebeyko.com' && (
                                                        <>
                                                            <button
                                                                onClick={async () => {
                                                                    const isSuspended = u.status === 'suspended';
                                                                    confirmAction(
                                                                        isSuspended ? "Вернуть доступ?" : "Приостановить доступ?",
                                                                        isSuspended ? `Вы хотите вернуть доступ пользователю ${u.name}?` : `Пользователь ${u.name} не сможет войти в приложение.`,
                                                                        async () => {
                                                                            try {
                                                                                await api.toggleUserStatus(u.id, isSuspended ? 'active' : 'suspended');
                                                                                onNotify("Статус обновлен (обновите страницу)");
                                                                            } catch (e) { alert(e.message); }
                                                                        },
                                                                        'primary'
                                                                    );
                                                                }}
                                                                className={`p-2 rounded-lg transition-colors ${u.status === 'suspended' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-400 hover:bg-yellow-50 hover:text-yellow-600'}`}
                                                                title={u.status === 'suspended' ? "Вернуть доступ" : "Приостановить доступ"}
                                                            >
                                                                {u.status === 'suspended' ? "⛔️" : "⏸"}
                                                            </button>
                                                            <button
                                                                onClick={async () => {
                                                                    confirmAction(
                                                                        "Удалить пользователя?",
                                                                        `Вы собираетесь удалить пользователя ${u.name}. Это действие невозможно отменить. Все данные (деревья, встречи) будут потеряны.`,
                                                                        async () => {
                                                                            try {
                                                                                await api.deleteUser(u.id);
                                                                                onNotify("Пользователь удален (обновите страницу)");
                                                                            } catch (e) { alert(e.message); }
                                                                        },
                                                                        'danger'
                                                                    );
                                                                }}
                                                                className="p-2 bg-rose-50 text-rose-500 rounded-lg hover:bg-rose-100 hover:text-rose-600 transition-colors"
                                                                title="Удалить"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : tab === 'content' && (
                    <div className="space-y-6">
                        {/* List of Knowledge Base Items */}
                        <div className="surface-card p-8">
                            <h3 className="font-display font-semibold text-slate-900 mb-4">База знаний ({knowledgeBase.length})</h3>
                            <div className="space-y-3 max-h-[420px] overflow-y-auto mb-6">
                                {Object.entries(
                                    (knowledgeBase || []).reduce((acc, item) => {
                                        const key = item.category || 'Без раздела';
                                        if (!acc[key]) acc[key] = [];
                                        acc[key].push(item);
                                        return acc;
                                    }, {})
                                ).map(([category, items]) => (
                                    <details key={category} className="group bg-white/70 rounded-2xl border border-slate-100">
                                        <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between">
                                            <div className="font-medium text-slate-800">{category}</div>
                                            <div className="text-xs text-slate-400">{items.length} материалов</div>
                                        </summary>
                                        <div className="px-4 pb-4 space-y-2">
                                            {items.map(item => (
                                                <div key={item.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-xl">{item.video_link ? '🎥' : item.file_link ? '📄' : '📝'}</span>
                                                        <div>
                                                            <div className="font-medium text-slate-800">{item.title}</div>
                                                            <div className="text-xs text-slate-400">{item.role === 'all' ? 'Для всех' : item.role}</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => setNewContent({ ...item, tags: Array.isArray(item.tags) ? item.tags.join(', ') : (item.tags || '') })} className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><Edit2 size={16} /></button>
                                                        <button onClick={async () => {
                                                            confirmAction(
                                                                "Удалить материал?",
                                                                "Этот материал будет скрыт из библиотеки безвозвратно.",
                                                                async () => {
                                                                    try {
                                                                        await api.deleteKnowledge(item.id);
                                                                        onRefreshUsers && onRefreshUsers();
                                                                        if (onAddContent) {
                                                                            onNotify("Материал удален (обновите страницу)");
                                                                        }
                                                                    } catch (e) {
                                                                        alert("Ошибка удаления: " + e.message);
                                                                    }
                                                                },
                                                                'danger'
                                                            );
                                                        }} className="p-2 text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={16} /></button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </details>
                                ))}
                            </div>

                            <hr className="border-slate-100 my-6" />

                            <h3 className="font-display font-semibold text-slate-900 mb-4">{newContent.id ? 'Редактировать материал' : 'Добавить материал'}</h3>
                            <div className="space-y-4">
                                <Input placeholder="Название" value={newContent.title} onChange={e => setNewContent({ ...newContent, title: e.target.value })} />
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs text-slate-500 ml-1">Видео (ссылка, опционально)</label>
                                        <Input placeholder="https://..." value={newContent.video_link || ''} onChange={e => setNewContent({ ...newContent, video_link: e.target.value })} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-slate-500 ml-1">Документ (ссылка, опционально)</label>
                                        <Input placeholder="https://..." value={newContent.file_link || ''} onChange={e => setNewContent({ ...newContent, file_link: e.target.value })} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-slate-500 ml-1">Курс / Раздел</label>
                                        <select
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-slate-700"
                                            value={newContent.category || ''}
                                            onChange={e => setNewContent({ ...newContent, category: e.target.value })}
                                        >
                                            <option value="">-- Выберите раздел --</option>
                                            <option value="Пиши, веди, люби">Пиши, веди, люби</option>
                                            <option value="Начало пути">Начало пути</option>
                                            <option value="Расти">Расти</option>
                                            <option value="Промты, ассистенты, лайфхаки">Промты, ассистенты, лайфхаки</option>
                                            <option value="Менторский курс">Менторский курс</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs text-slate-500 ml-1">Доступ</label>
                                        <select className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-slate-700" value={newContent.role} onChange={e => setNewContent({ ...newContent, role: e.target.value })}>
                                            <option value="all">Для всех</option>
                                            <option value="intern">Стажеры+</option>
                                            <option value="leader">Ведущие+</option>
                                        </select>
                                    </div>
                                    <div className="md:col-span-3">
                                        <Input
                                            placeholder="Теги (через запятую)"
                                            value={newContent.tags || ''}
                                            onChange={e => setNewContent({ ...newContent, tags: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <RichEditor
                                    value={newContent.content || ''}
                                    onChange={val => setNewContent({ ...newContent, content: val })}
                                    placeholder="Напишите текст материала..."
                                />

                                <div className="flex gap-2">
                                    {newContent.id && <Button variant="secondary" onClick={() => setNewContent({ title: '', role: 'all', type: 'Статья', tags: '', video_link: '', file_link: '' })}>Отмена</Button>}
                                    <Button onClick={handleAdd} className="w-full">{newContent.id ? 'Сохранить изменения' : 'Опубликовать'}</Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                confirmText="Да, продолжить"
                confirmVariant={confirmModal.variant}
            />
        </div >
    );
};

export default AdminPanel;
