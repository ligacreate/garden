import React, { useState, useEffect, useMemo } from 'react';
import { Trash2, LogOut, Edit2, RotateCw, BarChart, MapPin, Users, TrendingUp, Calendar, ArrowUpRight, GripVertical, ChevronDown, ChevronUp, Archive, Eye, EyeOff } from 'lucide-react';
import Button from '../components/Button';
import Input from '../components/Input';
import RichEditor from '../components/RichEditor';
import ConfirmationModal from '../components/ConfirmationModal';
import ModalShell from '../components/ModalShell';
import AdminPvlProgress from './AdminPvlProgress';
import { api } from '../services/dataService';
import { getMeetingInstant } from '../utils/meetingTime';
import { DEFAULT_TIMEZONE, resolveCityTimezone } from '../utils/timezone';

const COURSE_TITLES = [
    "Инструкции",
    "Пиши, веди, люби",
    "Начало пути",
    "Расти",
    "Промты, ассистенты, лайфхаки",
    "Менторский курс",
    "Социальная психология"
];

const AdminStatsDashboard = ({ meetings = [], users = [] }) => {
    const [period, setPeriod] = useState('month'); // 'month', 'year', 'all', 'custom'
    const [customRange, setCustomRange] = useState({ from: '', to: '' });

    const isInPeriod = (date) => {
        if (period === 'all') return true;
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
    };

    // Filter meetings by period and status
    const filteredMeetings = meetings.filter(m => {
        const status = String(m.status || '').toLowerCase();
        if (status !== 'completed') return false;
        const date = new Date(m.date);
        return isInPeriod(date);
    });

    const filteredCancelledMeetings = meetings.filter(m => {
        const status = String(m.status || '').toLowerCase();
        if (status !== 'cancelled') return false;
        const date = new Date(m.date);
        return isInPeriod(date);
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

    // Cancelled by Leaders
    const cancelledLeaders = {};
    filteredCancelledMeetings.forEach(m => {
        const leaderName = users.find(u => u.id === m.user_id)?.name || 'Неизвестный';
        cancelledLeaders[leaderName] = (cancelledLeaders[leaderName] || 0) + 1;
    });
    const topCancelledLeaders = Object.entries(cancelledLeaders).sort((a, b) => b[1] - a[1]).slice(0, 5);

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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-blue-500 to-blue-700 p-6 rounded-3xl text-white shadow-[0_20px_40px_-24px_rgba(47,111,84,0.6)] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><Calendar size={64} /></div>
                    <div className="relative z-10">
                        <div className="text-blue-100 text-sm font-medium mb-1">Проведено встреч</div>
                        <div className="text-4xl font-bold tracking-tight">{totalMeetings}</div>
                    </div>
                </div>
                <div className="surface-card p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 text-slate-100 group-hover:scale-110 transition-transform"><Trash2 size={64} /></div>
                    <div className="relative z-10">
                        <div className="text-slate-400 text-sm font-medium mb-1">Не состоялись</div>
                        <div className="text-4xl font-bold text-slate-800 tracking-tight">{filteredCancelledMeetings.length}</div>
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

                {/* Cancelled by Leaders */}
                <div className="surface-card p-6 min-h-[300px]">
                    <h3 className="text-lg font-display font-semibold text-slate-800 mb-6 flex items-center gap-2 border-b border-slate-50 pb-4">
                        <Trash2 size={20} className="text-slate-500" />
                        Не состоялись по ведущим
                    </h3>
                    <div className="space-y-4">
                        {topCancelledLeaders.length === 0 ? (
                            <div className="text-sm text-slate-400">Пока без отмен в этом периоде</div>
                        ) : topCancelledLeaders.map(([name, count], i) => (
                            <div key={name} className="flex items-center gap-4">
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-xs">{i + 1}</div>
                                <div className="flex-1">
                                    <div className="flex justify-between mb-1">
                                        <span className="font-medium text-slate-700">{name}</span>
                                        <span className="font-bold text-slate-900">{count}</span>
                                    </div>
                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-slate-400 rounded-full" style={{ width: `${(count / topCancelledLeaders[0][1]) * 100}%` }}></div>
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

const SHOP_EMPTY_FORM = {
    name: '', description: '', price: '', old_price: '',
    image_url: '', contact_telegram: '', contact_whatsapp: '',
    promo_code: '', link_url: '', download_url: '',
    sort_order: '0', is_active: true,
    options_label: '', options_values: ''
};

const ShopAdmin = ({ onNotify }) => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(SHOP_EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [confirm, setConfirm] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });

    const load = async () => {
        setLoading(true);
        try {
            const data = await api.getShopItems();
            setItems(data || []);
        } catch (e) {
            onNotify(e?.message || 'Ошибка загрузки товаров');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const openNew = () => {
        setEditing(null);
        setForm(SHOP_EMPTY_FORM);
        setModalOpen(true);
    };

    const openEdit = (item) => {
        setEditing(item);
        setForm({
            name: item.name || '',
            description: item.description || '',
            price: String(item.price || ''),
            old_price: String(item.old_price || ''),
            image_url: item.image_url || '',
            contact_telegram: item.contact_telegram || '',
            contact_whatsapp: item.contact_whatsapp || '',
            promo_code: item.promo_code || '',
            link_url: item.link_url || '',
            download_url: item.download_url || '',
            sort_order: String(item.sort_order ?? 0),
            is_active: item.is_active !== false,
            options_label: item.options?.label || '',
            options_values: (item.options?.values || []).join(', ')
        });
        setModalOpen(true);
    };

    const f = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }));

    const handleSave = async () => {
        if (!form.name.trim()) { onNotify('Введите название'); return; }
        if (!form.price && !form.promo_code.trim()) { onNotify('Укажите цену или промокод'); return; }

        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                description: form.description.trim() || null,
                price: form.price ? parseInt(form.price, 10) : null,
                old_price: form.old_price ? parseInt(form.old_price, 10) : null,
                image_url: form.image_url.trim() || null,
                contact_telegram: form.contact_telegram.trim() || null,
                contact_whatsapp: form.contact_whatsapp.trim() || null,
                promo_code: form.promo_code.trim() || null,
                link_url: form.link_url.trim() || null,
                download_url: form.download_url.trim() || null,
                sort_order: parseInt(form.sort_order, 10) || 0,
                is_active: form.is_active,
                options: form.options_label.trim()
                    ? {
                        label: form.options_label.trim(),
                        values: form.options_values.split(',').map(v => v.trim()).filter(Boolean)
                    }
                    : null
            };

            if (editing) {
                await api.updateShopItem(editing.id, payload);
                onNotify('Товар обновлён');
            } else {
                await api.createShopItem(payload);
                onNotify('Товар добавлен');
            }
            setModalOpen(false);
            await load();
        } catch (e) {
            onNotify(e?.message || 'Ошибка сохранения');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (item) => {
        setConfirm({
            isOpen: true,
            title: 'Удалить товар?',
            message: `«${item.name}» будет удалён без возможности восстановления.`,
            onConfirm: async () => {
                try {
                    await api.deleteShopItem(item.id);
                    onNotify('Товар удалён');
                    await load();
                } catch (e) {
                    onNotify(e?.message || 'Ошибка удаления');
                }
            }
        });
    };

    return (
        <div className="surface-card p-8 space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="font-display font-semibold text-slate-900">Товары магазина ({items.length})</h3>
                <Button variant="primary" onClick={openNew}>Добавить товар</Button>
            </div>

            {loading ? (
                <div className="text-sm text-slate-400 py-4 text-center">Загрузка...</div>
            ) : items.length === 0 ? (
                <div className="text-sm text-slate-400 py-8 text-center">Нет товаров</div>
            ) : (
                <div className="space-y-3">
                    {items.map(item => (
                        <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50/80 rounded-2xl border border-slate-100 group">
                            <div className="flex items-center gap-4 min-w-0">
                                {item.image_url ? (
                                    <img src={item.image_url} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                                ) : (
                                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                                        <span className="text-slate-300 text-lg">📦</span>
                                    </div>
                                )}
                                <div className="min-w-0">
                                    <div className="font-medium text-slate-800 truncate flex items-center gap-2">
                                        <span className="truncate">{item.name}</span>
                                        {item.download_url && (
                                            <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full text-xs font-normal flex-shrink-0">
                                                🔽 Цифровой товар
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                                        {item.price != null && <span>{item.price.toLocaleString('ru-RU')} ₽</span>}
                                        {item.promo_code && <span className="text-blue-600 font-mono">{item.promo_code}</span>}
                                        {item.old_price && <span className="line-through">{item.old_price.toLocaleString('ru-RU')} ₽</span>}
                                        <span>•</span>
                                        <span className="uppercase tracking-wide">#{item.sort_order}</span>
                                        <span>•</span>
                                        <span className={item.is_active ? 'text-blue-600' : 'text-slate-400'}>
                                            {item.is_active ? 'активен' : 'скрыт'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => openEdit(item)} className="p-2 text-slate-400 hover:text-blue-600 transition-colors" title="Редактировать">
                                    <Edit2 size={16} />
                                </button>
                                <button onClick={() => handleDelete(item)} className="p-2 text-slate-400 hover:text-rose-500 transition-colors" title="Удалить">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <ModalShell
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editing ? 'Редактировать товар' : 'Новый товар'}
                size="md"
                align="start"
            >
                <div className="space-y-4">
                    <Input label="Название *" value={form.name} onChange={f('name')} placeholder="Название товара" />
                    <Input label="Описание" value={form.description} onChange={f('description')} placeholder="Короткое описание" />
                    <div className="grid grid-cols-2 gap-4">
                        <Input label="Цена (₽) *" type="number" value={form.price} onChange={f('price')} placeholder="3500" />
                        <Input label="Старая цена (₽)" type="number" value={form.old_price} onChange={f('old_price')} placeholder="4900" />
                    </div>
                    <Input label="Ссылка на фото" value={form.image_url} onChange={f('image_url')} placeholder="https://..." />
                    <div className="grid grid-cols-2 gap-4">
                        <Input label="Telegram" value={form.contact_telegram} onChange={f('contact_telegram')} placeholder="@username" />
                        <Input label="WhatsApp" value={form.contact_whatsapp} onChange={f('contact_whatsapp')} placeholder="79001234567" />
                    </div>
                    <div className="bg-blue-50/60 rounded-2xl p-4 space-y-3">
                        <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">Для товаров со скидкой по промокоду</div>
                        <Input label="Промокод" value={form.promo_code} onChange={f('promo_code')} placeholder="GARDEN50" />
                        <Input label="Ссылка перехода" value={form.link_url} onChange={f('link_url')} placeholder="https://izdatelstvo.skrebeyko.ru/..." />
                    </div>
                    <div className="bg-purple-50/60 rounded-2xl p-4 space-y-3">
                        <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">Для цифровых товаров (скачать по ссылке)</div>
                        <Input label="URL для скачивания" value={form.download_url} onChange={f('download_url')} placeholder="https://drive.google.com/..." />
                        <div className="text-xs text-slate-500">При заполнении на витрине показывается «Скачать» — приоритет над «Перейти» и «Связаться».</div>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                        <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">Варианты выбора (опционально)</div>
                        <Input label="Метка" value={form.options_label} onChange={f('options_label')} placeholder="Материал кейса" />
                        <Input label="Значения через запятую" value={form.options_values} onChange={f('options_values')} placeholder="Эко-кожа, Экозамша" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Input label="Порядок сортировки" type="number" value={form.sort_order} onChange={f('sort_order')} />
                        <label className="flex items-center gap-3 mt-6 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.is_active}
                                onChange={e => setForm(prev => ({ ...prev, is_active: e.target.checked }))}
                                className="w-4 h-4 rounded accent-blue-600"
                            />
                            <span className="text-sm text-slate-700">Активен (виден в магазине)</span>
                        </label>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Отмена</Button>
                        <Button onClick={handleSave} disabled={saving} className="flex-1">
                            {saving ? 'Сохраняем...' : (editing ? 'Сохранить' : 'Добавить')}
                        </Button>
                    </div>
                </div>
            </ModalShell>

            <ConfirmationModal
                isOpen={confirm.isOpen}
                onClose={() => setConfirm(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirm.onConfirm}
                title={confirm.title}
                message={confirm.message}
                confirmText="Удалить"
                confirmVariant="danger"
            />
        </div>
    );
};

const AdminPanel = ({ users, hiddenGardenUserIds = [], onToggleUserVisibilityInGarden, knowledgeBase, news = [], librarySettings, onSetCourseVisible, onReorderCourseMaterials, onUpdateUserRole, onRefreshUsers, onAddContent, onNormalizeKnowledgeContent, onGetLeagueScenarios, onImportLeagueScenarios, onDeleteLeagueScenario, onUpdateLeagueScenario, onAddNews, onUpdateNews, onDeleteNews, onExit, onNotify, onSwitchToApp, onGetAllMeetings, onGetAllEvents, onUpdateEvent, onDeleteEvent }) => {
    const [tab, setTab] = useState(() => sessionStorage.getItem('adminTab') || 'stats');
    const [contentTab, setContentTab] = useState(() => sessionStorage.getItem('adminContentTab') || 'library');
    const [newContent, setNewContent] = useState({ title: '', role: 'all', type: 'Статья', tags: '', video_link: '', file_link: '', embed_code: '' });
    const [leagueScenarios, setLeagueScenarios] = useState([]);
    const [newScenario, setNewScenario] = useState({ id: null, title: '', role: 'all', content: '' });
    const [isImportingScenarios, setIsImportingScenarios] = useState(false);
    const [allMeetings, setAllMeetings] = useState([]);
    const [allEvents, setAllEvents] = useState([]);
    const [eventSearch, setEventSearch] = useState('');
    const [eventArchiveOpen, setEventArchiveOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState(null);
    const [draggingItemId, setDraggingItemId] = useState(null);
    const [sendPushOnNews, setSendPushOnNews] = useState(true);
    const [editingMaterialId, setEditingMaterialId] = useState(null);
    const [isNormalizingKnowledge, setIsNormalizingKnowledge] = useState(false);

    useEffect(() => {
        if (tab === 'stats' && onGetAllMeetings) {
            onGetAllMeetings().then(data => {
                if (data) setAllMeetings(data);
            });
        }
        if (tab === 'events') {
            if (onGetAllEvents) onGetAllEvents().then(data => { if (data) setAllEvents(data); });
            if (onGetAllMeetings) onGetAllMeetings().then(data => { if (data) setAllMeetings(data); });
        }
    }, [tab, onGetAllMeetings, onGetAllEvents]);

    useEffect(() => {
        if (tab !== 'content' || contentTab !== 'scenarios' || !onGetLeagueScenarios) return;
        onGetLeagueScenarios().then((items) => {
            setLeagueScenarios(Array.isArray(items) ? items : []);
        });
    }, [tab, contentTab, onGetLeagueScenarios]);

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

    const stripHtml = (html) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const normalizeEventDateToIso = (value) => {
        const raw = String(value || '').trim();
        if (!raw) return '';
        const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
        const ru = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (ru) {
            const d = ru[1].padStart(2, '0');
            const m = ru[2].padStart(2, '0');
            return `${ru[3]}-${m}-${d}`;
        }
        return '';
    };
    const getEventMoscowTimeLabel = (event) => {
        const startsAt = String(event?.starts_at || '').trim();
        if (startsAt) {
            const instant = new Date(startsAt);
            if (!Number.isNaN(instant.getTime())) {
                return new Intl.DateTimeFormat('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                    timeZone: 'Europe/Moscow'
                }).format(instant);
            }
        }
        const isoDate = normalizeEventDateToIso(event?.date);
        const localTime = String(event?.time || '').trim();
        if (!isoDate || !localTime) return '';
        const tz = resolveCityTimezone(event?.city, DEFAULT_TIMEZONE) || DEFAULT_TIMEZONE;
        const instant = getMeetingInstant({ date: isoDate, time: localTime, city: event?.city, timezone: tz }, DEFAULT_TIMEZONE);
        if (!instant || Number.isNaN(instant.getTime())) return '';
        return new Intl.DateTimeFormat('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'Europe/Moscow'
        }).format(instant);
    };

    const refreshLeagueScenarios = async () => {
        if (!onGetLeagueScenarios) return;
        const items = await onGetLeagueScenarios();
        setLeagueScenarios(Array.isArray(items) ? items : []);
    };

    const handlePublishScenario = async () => {
        if (!onImportLeagueScenarios) return;

        const title = String(newScenario.title || '').trim();
        if (!title) {
            onNotify('Введите название сценария');
            return;
        }

        const content = String(newScenario.content || '').trim();
        if (!stripHtml(content)) {
            onNotify('Добавьте текст сценария');
            return;
        }

        const timeline = [{
            title: 'Полный сценарий',
            time: '',
            type: 'Текст',
            description: content
        }];

        setIsImportingScenarios(true);
        try {
            if (newScenario.id && onUpdateLeagueScenario) {
                await onUpdateLeagueScenario(newScenario.id, { title, timeline });
                await refreshLeagueScenarios();
                onNotify('Сценарий обновлен');
            } else {
                const result = await onImportLeagueScenarios([{ title, timeline }]);
                const inserted = result?.inserted || 0;
                const skipped = result?.skipped || 0;
                await refreshLeagueScenarios();
                if (newScenario.role !== 'all') {
                    onNotify(`Сценарий добавлен (${inserted}), но фильтрация по роли пока не применяется в лиге`);
                } else {
                    onNotify(`Сценарий добавлен: ${inserted}. Пропущено: ${skipped}`);
                }
            }
            setNewScenario({ id: null, title: '', role: 'all', content: '' });
        } catch (e) {
            onNotify(e?.message || 'Ошибка публикации сценария');
        } finally {
            setIsImportingScenarios(false);
        }
    };

    const handleEditLeagueScenario = (scenario) => {
        const firstStep = Array.isArray(scenario?.timeline) ? scenario.timeline[0] : null;
        const content = String(firstStep?.description || '');
        setNewScenario({
            id: scenario?.id || null,
            title: scenario?.title || '',
            role: 'all',
            content
        });
    };

    const hiddenCourses = librarySettings?.hiddenCourses || [];
    const materialOrder = librarySettings?.materialOrder || {};

    const getSortedItems = (category, items) => {
        const order = materialOrder[category];
        if (!Array.isArray(order) || order.length === 0) return items;
        const rank = new Map(order.map((id, idx) => [String(id), idx]));
        return [...items].sort((a, b) => {
            const aRank = rank.has(String(a.id)) ? rank.get(String(a.id)) : Number.MAX_SAFE_INTEGER;
            const bRank = rank.has(String(b.id)) ? rank.get(String(b.id)) : Number.MAX_SAFE_INTEGER;
            if (aRank !== bRank) return aRank - bRank;
            return String(a.title || '').localeCompare(String(b.title || ''), 'ru');
        });
    };

    const groupedKnowledgeBase = useMemo(() => {
        const grouped = (knowledgeBase || []).reduce((acc, item) => {
            const key = item.category || 'Без раздела';
            if (!acc[key]) acc[key] = [];
            acc[key].push(item);
            return acc;
        }, {});

        return Object.entries(grouped).map(([category, items]) => ({
            category,
            items: getSortedItems(category, items)
        }));
    }, [knowledgeBase, materialOrder]);

    const handleDropMaterial = (category, targetIndex) => {
        if (!draggingItemId) return;
        const group = groupedKnowledgeBase.find(g => g.category === category);
        if (!group) return;
        const currentIndex = group.items.findIndex(item => String(item.id) === String(draggingItemId));
        if (currentIndex === -1 || currentIndex === targetIndex) {
            setDraggingItemId(null);
            return;
        }

        const next = [...group.items];
        const [moved] = next.splice(currentIndex, 1);
        next.splice(targetIndex, 0, moved);
        const orderedIds = next.map(item => String(item.id));
        setDraggingItemId(null);
        if (onReorderCourseMaterials) onReorderCourseMaterials(category, orderedIds);
    };

    const handleAdd = () => {
        const isEdit = editingMaterialId != null && editingMaterialId !== '';
        const payload = {
            ...newContent,
            type: 'Статья',
            tags: parseTags(newContent.tags)
        };
        if (isEdit) {
            payload.id = editingMaterialId;
        }
        onAddContent(payload, { isEdit });
        setEditingMaterialId(null);
        setNewContent({ title: '', role: 'all', type: 'Статья', tags: '', video_link: '', file_link: '', embed_code: '' });
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
        <div className="h-full pb-20 pt-6 px-4 sm:px-6 lg:px-8 xl:px-12">
            <div className="space-y-6">
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
                        {['stats', 'users', 'content', 'pvl-progress', 'news', 'events', 'shop'].map(t => (
                            <button
                                key={t}
                                onClick={() => { setTab(t); sessionStorage.setItem('adminTab', t); }}
                                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === t
                                    ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/70'}`}
                            >
                                {t === 'stats' ? 'Статистика' : t === 'users' ? 'Пользователи' : t === 'content' ? 'Контент' : t === 'pvl-progress' ? 'Прогресс ПВЛ' : t === 'events' ? 'События' : t === 'shop' ? 'Магазин' : 'Новости'}
                            </button>
                        ))}
                    </div>
                    {tab === 'users' && <Button variant="ghost" className="!p-2 text-slate-400 hover:text-blue-600" onClick={onRefreshUsers} title="Обновить список"><RotateCw size={20} /></Button>}
                </div>

                {tab === 'stats' && (
                    <AdminStatsDashboard meetings={allMeetings} users={users} />
                )}

                {tab === 'pvl-progress' && (
                    <AdminPvlProgress hiddenIds={hiddenGardenUserIds} />
                )}

                {tab === 'news' && (
                    <div className="surface-card p-8">
                        <h3 className="font-display font-semibold text-slate-900 mb-4">Новости ({news.length})</h3>
                        <div className="space-y-4 mb-8">
                            {news.map(n => (
                                <div key={n.id} className="p-4 bg-slate-50/80 rounded-xl border border-slate-100 flex justify-between items-start group">
                                    <div>
                                        <div className="font-bold text-slate-800">{n.title}</div>
                                        <div className="text-sm text-slate-600 mt-1 clean-rich-text" dangerouslySetInnerHTML={{ __html: n.body }} />
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
                                key={newContent.id != null ? `news-${newContent.id}` : 'news-new'}
                                value={newContent.body || ''}
                                onChange={(val) => setNewContent((prev) => ({ ...prev, body: val }))}
                                onUploadImage={api.uploadMeetingImage.bind(api)}
                                placeholder="Текст новости..."
                            />
                            <div className="flex gap-2">
                                {newContent.id && <Button variant="secondary" onClick={() => setNewContent({ title: '', body: '' })}>Отмена</Button>}
                                {!newContent.id && (
                                    <label className="inline-flex items-center gap-2 text-xs text-slate-500 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
                                        <input
                                            type="checkbox"
                                            checked={sendPushOnNews}
                                            onChange={(e) => setSendPushOnNews(e.target.checked)}
                                            className="h-4 w-4 accent-blue-600"
                                        />
                                        Отправить push-уведомление
                                    </label>
                                )}
                                <Button onClick={() => {
                                    if (newContent.id) {
                                        if (onUpdateNews) onUpdateNews(newContent);
                                    } else {
                                        onAddNews(
                                            { id: Date.now(), title: newContent.title, body: newContent.body, created_at: new Date().toISOString() },
                                            { sendPush: sendPushOnNews }
                                        );
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
                                try {
                                    await api.addBirthdayTemplate(newContent.template);
                                    setNewContent({ ...newContent, template: '' });
                                    onNotify("Шаблон добавлен!");
                                } catch (e) {
                                    console.error(e);
                                    onNotify(e.message || "Ошибка сохранения шаблона");
                                }
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
                            placeholder="Поиск по названию, городу или ведущему"
                            value={eventSearch}
                            onChange={(e) => setEventSearch(e.target.value)}
                        />

                        <div className="space-y-4 max-h-[520px] overflow-y-auto mt-4">
                            {(() => {
                                const filtered = [...allEvents].filter(ev => {
                                    const q = eventSearch.trim().toLowerCase();
                                    if (!q) return true;
                                    const meeting = allMeetings.find(m => String(m.id) === String(ev.garden_id));
                                    const leader = meeting ? users.find(u => u.id === meeting.user_id) : null;
                                    const leaderName = (leader?.name || '').toLowerCase();
                                    return (ev.title || '').toLowerCase().includes(q) || (ev.city || '').toLowerCase().includes(q) || leaderName.includes(q);
                                });
                                const parseDate = (d) => {
                                    const s = String(d || '').trim();
                                    const dm = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
                                    const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
                                    if (dm) {
                                        return new Date(parseInt(dm[3], 10), parseInt(dm[2], 10) - 1, parseInt(dm[1], 10));
                                    }
                                    if (iso) {
                                        return new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
                                    }
                                    return new Date(0);
                                };
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                const upcoming = filtered.filter(ev => parseDate(ev.date) >= today).sort((a, b) => parseDate(a.date) - parseDate(b.date));
                                const past = filtered.filter(ev => parseDate(ev.date) < today).sort((a, b) => parseDate(b.date) - parseDate(a.date));
                                const todayStr = today.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
                                const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
                                const groupByMonth = (events) => {
                                    return events.reduce((acc, ev) => {
                                        const d = parseDate(ev.date);
                                        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
                                        if (!acc[key]) acc[key] = [];
                                        acc[key].push(ev);
                                        return acc;
                                    }, {});
                                };
                                const renderEventCard = (ev) => {
                                    const meeting = allMeetings.find(m => String(m.id) === String(ev.garden_id));
                                    const leader = meeting ? users.find(u => u.id === meeting.user_id) : null;
                                    const leaderName = leader?.name || '—';
                                    const contactLink = meeting?.payment_link || ev.registration_link || null;
                                    const localTime = String(ev.time || '').trim();
                                    const moscowTime = getEventMoscowTimeLabel(ev);
                                    const showMoscowTime = Boolean(moscowTime && moscowTime !== localTime);
                                    return (
                                        <div key={ev.id} className="p-4 bg-slate-50/80 rounded-xl border border-slate-100 flex justify-between items-start group">
                                            <div className="min-w-0 flex-1">
                                                <div className="font-medium text-slate-800 truncate">{ev.title || 'Без названия'}</div>
                                                <div className="text-xs text-slate-400 mt-1">
                                                    {ev.date || '—'} • {ev.city || '—'}
                                                    {localTime ? (
                                                        <>
                                                            {' '}
                                                            •{' '}
                                                            <span className="text-slate-500">{localTime}</span>
                                                            {showMoscowTime && (
                                                                <>
                                                                    <span className="text-slate-300"> · </span>
                                                                    <span className="text-slate-400 tabular-nums">{moscowTime} мск</span>
                                                                </>
                                                            )}
                                                        </>
                                                    ) : null}
                                                </div>
                                                <div className="text-xs text-emerald-600 mt-0.5">{leaderName}</div>
                                                {contactLink && (
                                                    <div className="text-xs text-slate-500 mt-1.5 break-all" title="Ссылка на контакт / кнопку «Записаться»">
                                                        <span className="text-slate-400">Контакт:</span>{' '}
                                                        <a href={contactLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{contactLink}</a>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => setEditingEvent({ ...ev, image_focus_x: ev.image_focus_x ?? 50, image_focus_y: ev.image_focus_y ?? 50 })} className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><Edit2 size={16} /></button>
                                                <button onClick={() => confirmAction("Удалить событие?", `Вы собираетесь удалить событие "${ev.title || 'Без названия'}".`, async () => { if (onDeleteEvent) { await onDeleteEvent(ev.id); setAllEvents(allEvents.filter(e => e.id !== ev.id)); onNotify("Событие удалено"); } }, 'danger')} className="p-2 text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={16} /></button>
                                            </div>
                                        </div>
                                    );
                                };
                                const renderMonthGroups = (byMonth) => Object.entries(byMonth).map(([key, events]) => (
                                    <div key={key} className="space-y-2">
                                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider sticky top-0 bg-white/95 py-1 -mx-1 px-1 z-10">
                                            {(() => { const [y, m] = key.split('-').map(Number); return `${monthNames[(m || 1) - 1]} ${y}`; })()}
                                        </div>
                                        {events.map(renderEventCard)}
                                    </div>
                                ));
                                return (
                                    <>
                                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider bg-emerald-50/80 rounded-xl px-3 py-2 border border-emerald-100">
                                            Сегодня: {todayStr}
                                        </div>
                                        <div className="space-y-3">
                                            {upcoming.length > 0 ? renderMonthGroups(groupByMonth(upcoming)) : (
                                                <div className="text-sm text-slate-400 py-4">Нет предстоящих событий</div>
                                            )}
                                        </div>
                                        <div className="border-t border-slate-200 pt-4">
                                            <button
                                                onClick={() => setEventArchiveOpen(!eventArchiveOpen)}
                                                className="w-full flex items-center justify-between gap-2 py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200/80 transition-colors text-left"
                                            >
                                                <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                                    <Archive size={18} className="text-slate-500" />
                                                    Архив ({past.length} прошедших)
                                                </span>
                                                {eventArchiveOpen ? <ChevronUp size={20} className="text-slate-500" /> : <ChevronDown size={20} className="text-slate-500" />}
                                            </button>
                                            {eventArchiveOpen && past.length > 0 && (
                                                <div className="space-y-3 mt-3 max-h-[320px] overflow-y-auto">
                                                    {renderMonthGroups(groupByMonth(past))}
                                                </div>
                                            )}
                                            {eventArchiveOpen && past.length === 0 && (
                                                <div className="text-sm text-slate-400 py-4">В архиве пусто</div>
                                            )}
                                        </div>
                                    </>
                                );
                            })()}
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
                                    onChange={e => setEditingEvent({
                                        ...editingEvent,
                                        image_url: e.target.value,
                                        image_focus_x: 50,
                                        image_focus_y: 50
                                    })}
                                />
                                <div className="flex items-center gap-3">
                                    <Button variant="secondary" className="!py-2 !px-3 !text-xs relative">
                                        Загрузить фото
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                try {
                                                    const url = await api.uploadMeetingImage(file);
                                                    setEditingEvent({
                                                        ...editingEvent,
                                                        image_url: url,
                                                        image_focus_x: 50,
                                                        image_focus_y: 50
                                                    });
                                                    onNotify("Фото загружено");
                                                } catch (err) {
                                                    console.error(err);
                                                    onNotify("Ошибка загрузки фото");
                                                } finally {
                                                    e.target.value = '';
                                                }
                                            }}
                                        />
                                    </Button>
                                    <span className="text-xs text-slate-400">Фото сохранится в хранилище сервиса</span>
                                </div>
                                {editingEvent.image_url && (
                                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-5">
                                        <div>
                                            <div className="text-xs text-slate-500 mb-3">Как выглядит в расписании</div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <div className="text-[11px] text-slate-400">Компьютер (широкое)</div>
                                                    <div className="w-full rounded-2xl overflow-hidden bg-slate-100" style={{ aspectRatio: '16 / 9' }}>
                                                        <img
                                                            src={editingEvent.image_url}
                                                            alt={editingEvent.title || 'preview-desktop'}
                                                            className="w-full h-full object-cover"
                                                            style={{ objectPosition: `${editingEvent.image_focus_x ?? 50}% ${editingEvent.image_focus_y ?? 50}%` }}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="text-[11px] text-slate-400">Телефон (квадрат)</div>
                                                    <div className="w-full rounded-2xl overflow-hidden bg-slate-100" style={{ aspectRatio: '1 / 1' }}>
                                                        <img
                                                            src={editingEvent.image_url}
                                                            alt={editingEvent.title || 'preview-mobile'}
                                                            className="w-full h-full object-cover"
                                                            style={{ objectPosition: `${editingEvent.image_focus_x ?? 50}% ${editingEvent.image_focus_y ?? 50}%` }}
                                                        />
                                                    </div>
                                                </div>
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
                    <div className="surface-card p-8 overflow-hidden space-y-6">
                        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                            <div className="flex items-center justify-between gap-4 mb-3">
                                <div className="text-sm font-semibold text-slate-700">Email всех пользователей</div>
                                <Button
                                    variant="ghost"
                                    className="!py-1 !px-3 text-xs"
                                    onClick={async () => {
                                        const emails = (users || [])
                                            .map(u => (u.email || '').trim())
                                            .filter(Boolean)
                                            .join('\n');
                                        try {
                                            await navigator.clipboard.writeText(emails);
                                            onNotify("Email-список скопирован");
                                        } catch (e) {
                                            onNotify("Не удалось скопировать");
                                        }
                                    }}
                                >
                                    Скопировать
                                </Button>
                            </div>
                            <textarea
                                className="w-full min-h-[120px] bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-700"
                                readOnly
                                value={(users || [])
                                    .map(u => (u.email || '').trim())
                                    .filter(Boolean)
                                    .join('\n')}
                            />
                        </div>
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-slate-100 text-xs uppercase text-slate-400">
                                    <th className="pb-4 pl-2">Пользователь</th>
                                    <th className="pb-4">Роль</th>
                                    <th className="pb-4">Видимость</th>
                                    <th className="pb-4">Действия</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {[...(users || [])].sort((a, b) => b.id - a.id).map(u => {
                                    const isNew = (Date.now() - u.id) < 24 * 60 * 60 * 1000 && u.id > 1000; // Check if registered in last 24h (and not initial seed data)
                                    const isHiddenInGarden = hiddenGardenUserIds.includes(String(u.id));
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
                                                <button
                                                    type="button"
                                                    onClick={() => onToggleUserVisibilityInGarden?.(u.id)}
                                                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition-colors ${isHiddenInGarden
                                                        ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                                        : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                                        }`}
                                                    title={isHiddenInGarden ? 'Сделать видимым в саду' : 'Скрыть из сада'}
                                                >
                                                    {isHiddenInGarden ? <EyeOff size={14} /> : <Eye size={14} />}
                                                    {isHiddenInGarden ? 'Скрыт' : 'Виден'}
                                                </button>
                                            </td>
                                            <td className="py-4">
                                                <div className="flex items-center gap-2">
                                                    {String(u.role || '').toLowerCase() !== 'admin' && (
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
                                                                                onNotify("Пользователь удалён");
                                                                                if (onRefreshUsers) await onRefreshUsers();
                                                                            } catch (e) {
                                                                                const msg = String(e?.message || '');
                                                                                if (msg.includes('forbidden')) {
                                                                                    onNotify('Нет прав: требуется роль администратора');
                                                                                } else if (msg.includes('p_user_id is null')) {
                                                                                    onNotify('Внутренняя ошибка: пустой UUID');
                                                                                } else {
                                                                                    onNotify('Ошибка удаления: ' + (msg || 'неизвестная'));
                                                                                }
                                                                            }
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
                        <div className="bg-white/70 p-1 rounded-2xl flex gap-1 w-fit border border-white/60">
                            <button
                                onClick={() => { setContentTab('library'); sessionStorage.setItem('adminContentTab', 'library'); }}
                                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${contentTab === 'library'
                                    ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/70'}`}
                            >
                                Библиотека
                            </button>
                            <button
                                onClick={() => { setContentTab('scenarios'); sessionStorage.setItem('adminContentTab', 'scenarios'); }}
                                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${contentTab === 'scenarios'
                                    ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/70'}`}
                            >
                                Сценарии
                            </button>
                        </div>

                        {contentTab === 'library' && (
                            <div className="surface-card p-8">
                            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-6">
                                <div className="text-sm font-semibold text-slate-700 mb-3">Видимость курсов в библиотеке</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {COURSE_TITLES.map((title) => {
                                        const isVisible = !hiddenCourses.includes(title);
                                        return (
                                            <label key={title} className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-3 py-2.5">
                                                <span className="text-sm text-slate-700">{title}</span>
                                                <input
                                                    type="checkbox"
                                                    checked={isVisible}
                                                    onChange={(e) => onSetCourseVisible && onSetCourseVisible(title, e.target.checked)}
                                                    className="h-4 w-4 accent-blue-600"
                                                />
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex items-center justify-between gap-3 mb-4">
                                <h3 className="font-display font-semibold text-slate-900">База знаний ({knowledgeBase.length})</h3>
                                <Button
                                    variant="secondary"
                                    className="!py-2 !px-3 text-xs"
                                    disabled={!onNormalizeKnowledgeContent || isNormalizingKnowledge}
                                    onClick={() => {
                                        confirmAction(
                                            "Нормализовать все материалы?",
                                            "Система массово пересохранит rich-текст материалов по новым правилам (заголовки/абзацы/внешняя вставка).",
                                            async () => {
                                                try {
                                                    setIsNormalizingKnowledge(true);
                                                    await onNormalizeKnowledgeContent?.();
                                                } catch (e) {
                                                    onNotify(e?.message || 'Ошибка нормализации материалов');
                                                } finally {
                                                    setIsNormalizingKnowledge(false);
                                                }
                                            },
                                            'primary'
                                        );
                                    }}
                                >
                                    {isNormalizingKnowledge ? 'Нормализация...' : 'Нормализовать все материалы'}
                                </Button>
                            </div>
                            <div className="space-y-3 max-h-[420px] overflow-y-auto mb-6">
                                {groupedKnowledgeBase.map(({ category, items }) => (
                                    <details key={category} className="group bg-white/70 rounded-2xl border border-slate-100">
                                        <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between">
                                            <div className="font-medium text-slate-800">{category}</div>
                                            <div className="text-xs text-slate-400">{items.length} материалов</div>
                                        </summary>
                                        <div className="px-4 pb-4 space-y-2">
                                            {items.map((item, idx) => (
                                                <div
                                                    key={item.id}
                                                    className={`flex justify-between items-center p-3 rounded-xl transition-colors border ${String(draggingItemId) === String(item.id)
                                                        ? 'bg-blue-50 border-blue-200'
                                                        : 'bg-slate-50 border-transparent hover:bg-slate-100'
                                                        }`}
                                                    draggable
                                                    onDragStart={(e) => {
                                                        setDraggingItemId(String(item.id));
                                                        e.dataTransfer.effectAllowed = 'move';
                                                        e.dataTransfer.setData('text/plain', String(item.id));
                                                    }}
                                                    onDragOver={(e) => e.preventDefault()}
                                                    onDrop={(e) => {
                                                        e.preventDefault();
                                                        handleDropMaterial(category, idx);
                                                    }}
                                                    onDragEnd={() => setDraggingItemId(null)}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-slate-400 cursor-grab active:cursor-grabbing" title="Перетащите для изменения порядка">
                                                            <GripVertical size={16} />
                                                        </span>
                                                        <span className="text-xl">{item.video_link ? '🎥' : item.file_link ? '📄' : '📝'}</span>
                                                        <div>
                                                            <div className="font-medium text-slate-800">{item.title}</div>
                                                            <div className="text-xs text-slate-400">{item.role === 'all' ? 'Для всех' : item.role}</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => {
                                                            setEditingMaterialId(item?.id ?? null);
                                                            setNewContent({ ...item, tags: Array.isArray(item.tags) ? item.tags.join(', ') : (item.tags || '') });
                                                        }} className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><Edit2 size={16} /></button>
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

                            <h3 className="font-display font-semibold text-slate-900 mb-4">{editingMaterialId != null ? 'Редактировать материал' : 'Добавить материал'}</h3>
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
                                            <option value="Инструкции">Инструкции</option>
                                            <option value="Пиши, веди, люби">Пиши, веди, люби</option>
                                            <option value="Начало пути">Начало пути</option>
                                            <option value="Расти">Расти</option>
                                            <option value="Промты, ассистенты, лайфхаки">Промты, ассистенты, лайфхаки</option>
                                            <option value="Менторский курс">Менторский курс</option>
                                            <option value="Социальная психология">Социальная психология</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500 ml-1">Embed-код / iframe (Kinescope)</label>
                                    <textarea
                                        rows={3}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-slate-700 text-sm font-mono resize-y"
                                        placeholder='<iframe src="https://kinescope.io/embed/..." allow="autoplay; fullscreen" allowfullscreen></iframe>'
                                        value={newContent.embed_code || ''}
                                        onChange={e => setNewContent({ ...newContent, embed_code: e.target.value })}
                                    />
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
                                    key={editingMaterialId != null ? `kb-${editingMaterialId}` : 'kb-new'}
                                    value={newContent.content || ''}
                                    onChange={(val) => setNewContent((prev) => ({ ...prev, content: val }))}
                                    onUploadImage={api.uploadMeetingImage.bind(api)}
                                    placeholder="Напишите текст материала..."
                                />

                                <div className="flex gap-2">
                                    {editingMaterialId != null && <Button variant="secondary" onClick={() => {
                                        setEditingMaterialId(null);
                                        setNewContent({ title: '', role: 'all', type: 'Статья', tags: '', video_link: '', file_link: '', embed_code: '' });
                                    }}>Отмена</Button>}
                                    <Button onClick={handleAdd} className="w-full">{editingMaterialId != null ? 'Сохранить изменения' : 'Опубликовать'}</Button>
                                </div>
                            </div>
                        </div>
                        )}

                        {contentTab === 'scenarios' && (
                            <div className="surface-card p-8 space-y-6">
                                <div className="flex items-center justify-between gap-2">
                                    <h3 className="font-display font-semibold text-slate-900">Сценарии лиги ({leagueScenarios.length})</h3>
                                    <Button
                                        variant="ghost"
                                        className="!p-2 text-slate-400 hover:text-blue-600"
                                        onClick={refreshLeagueScenarios}
                                        title="Обновить список"
                                    >
                                        <RotateCw size={20} />
                                    </Button>
                                </div>

                                <div className="space-y-3 max-h-[380px] overflow-y-auto">
                                    {leagueScenarios.length === 0 ? (
                                        <div className="text-sm text-slate-400 py-8 text-center border border-dashed border-slate-200 rounded-2xl">
                                            Общие сценарии пока не загружены
                                        </div>
                                    ) : leagueScenarios.map((scenario) => (
                                        <div key={scenario.id} className="p-4 bg-slate-50/80 rounded-xl border border-slate-100 flex justify-between items-start gap-3">
                                            <div className="min-w-0">
                                                <div className="font-medium text-slate-800 truncate">{scenario.title || 'Без названия'}</div>
                                                <div className="text-xs text-slate-500 mt-1">
                                                    Практик: {Array.isArray(scenario.timeline) ? scenario.timeline.length : 0}
                                                    {scenario.author_name ? ` • Автор: ${scenario.author_name}` : ''}
                                                </div>
                                                <div className="text-xs text-slate-400 mt-1">
                                                    {scenario.created_at ? new Date(scenario.created_at).toLocaleDateString() : '—'}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleEditLeagueScenario(scenario)}
                                                className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                                                title="Редактировать сценарий"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <hr className="border-slate-100 my-6" />

                                <h3 className="font-display font-semibold text-slate-900 mb-4">{newScenario.id ? 'Редактировать сценарий' : 'Добавить сценарий'}</h3>
                                <div className="space-y-4">
                                    <Input
                                        placeholder="Название"
                                        value={newScenario.title}
                                        onChange={(e) => setNewScenario({ ...newScenario, title: e.target.value })}
                                    />
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-xs text-slate-500 ml-1">Доступ</label>
                                            <select
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-slate-700"
                                                value={newScenario.role}
                                                onChange={(e) => setNewScenario({ ...newScenario, role: e.target.value })}
                                            >
                                                <option value="all">Для всех</option>
                                                <option value="intern">Стажеры+</option>
                                                <option value="leader">Ведущие+</option>
                                            </select>
                                        </div>
                                    </div>

                                    <RichEditor
                                        key={newScenario.id != null ? `scenario-${newScenario.id}` : 'scenario-new'}
                                        value={newScenario.content || ''}
                                        onChange={(val) => setNewScenario((prev) => ({ ...prev, content: val }))}
                                        onUploadImage={api.uploadMeetingImage.bind(api)}
                                        placeholder="Текст сценария..."
                                    />

                                    <div className="flex gap-2">
                                        <Button
                                            variant="secondary"
                                            onClick={() => setNewScenario({ id: null, title: '', role: 'all', content: '' })}
                                            disabled={isImportingScenarios}
                                        >
                                            Очистить
                                        </Button>
                                        <Button
                                            onClick={handlePublishScenario}
                                            disabled={isImportingScenarios}
                                            className="w-full"
                                        >
                                            {isImportingScenarios ? 'Сохраняем...' : (newScenario.id ? 'Сохранить изменения' : 'Опубликовать')}
                                        </Button>
                                    </div>
                                </div>

                            </div>
                        )}
                    </div>
                )}

                {tab === 'shop' && <ShopAdmin onNotify={onNotify} />}
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
