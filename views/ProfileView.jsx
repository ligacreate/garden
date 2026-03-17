import React, { useState, useRef, useEffect } from 'react';
import { Camera, LogOut, Trash2, X, Plus, MapPin, Briefcase, Bell } from 'lucide-react';
import Button from '../components/Button';
import Card from '../components/Card';
import Input from '../components/Input';
import UserAvatar from '../components/UserAvatar';
import { getRoleLabel } from '../data/data';
import { getDruidTree } from '../utils/druidHoroscope';
import { normalizeSkills } from '../utils/skills';
import ConfirmationModal from '../components/ConfirmationModal';

const TagsInput = ({ label, value = [], onChange, placeholder = "Добавить...", options = [] }) => {
    const [input, setInput] = useState('');

    const commitTag = (raw) => {
        const cleaned = raw.replace(/,+$/, '').toLowerCase();
        const parts = cleaned
            .split(',')
            .map(t => t.trim())
            .filter(Boolean);
        if (parts.length === 0) return;
        const next = [...value];
        parts.forEach(tag => {
            if (!next.includes(tag)) next.push(tag);
        });
        onChange(next);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            commitTag(input);
            setInput('');
        }
        if (e.key === ',' || e.key === 'Tab') {
            e.preventDefault();
            commitTag(input.replace(',', ''));
            setInput('');
        }
    };

    const addTag = () => {
        commitTag(input);
        setInput('');
    };

    const removeTag = (tagToRemove) => {
        onChange(value.filter(tag => tag !== tagToRemove));
    };

    const normalizedInput = input.trim().toLowerCase();
    const suggestions = normalizedInput
        ? options
            .map((opt) => String(opt || '').trim())
            .filter(Boolean)
            .filter((opt) => !value.includes(opt))
            .filter((opt) => opt.toLowerCase().includes(normalizedInput))
            .slice(0, 8)
        : [];

    const addSuggestion = (suggestion) => {
        if (!suggestion) return;
        if (!value.includes(suggestion)) onChange([...value, suggestion]);
        setInput('');
    };

    const renderHighlighted = (text) => {
        if (!normalizedInput) return text;
        const idx = text.toLowerCase().indexOf(normalizedInput);
        if (idx === -1) return text;
        const before = text.slice(0, idx);
        const match = text.slice(idx, idx + normalizedInput.length);
        const after = text.slice(idx + normalizedInput.length);
        return (
            <>
                {before}
                <span className="text-blue-600 font-semibold">{match}</span>
                {after}
            </>
        );
    };

    return (
        <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">{label}</label>
            <div className="flex flex-wrap gap-2 mb-2">
                {value.map((tag, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-sm border border-blue-100">
                        {tag}
                        <button onClick={() => removeTag(tag)} className="hover:text-blue-900"><X size={14} /></button>
                    </span>
                ))}
            </div>
            <div className="flex gap-2">
                <input
                    className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={() => {
                        if (input.trim()) {
                            commitTag(input);
                            setInput('');
                        }
                    }}
                    placeholder={placeholder}
                />
                <Button variant="secondary" onClick={addTag} className="!p-2" icon={Plus} />
            </div>
            {suggestions.length > 0 && (
                <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-2 flex flex-wrap gap-2">
                    {suggestions.map((opt) => (
                        <button
                            key={opt}
                            type="button"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                addSuggestion(opt);
                            }}
                            className="px-2.5 py-1 rounded-lg text-sm bg-slate-50 border border-slate-100 text-slate-700 hover:border-blue-200 hover:text-blue-700 transition-colors"
                        >
                            {renderHighlighted(opt)}
                        </button>
                    ))}
                </div>
            )}
            <p className="text-[10px] text-slate-400">Можно нажать Enter, Tab или поставить запятую</p>
        </div>
    );
};

const ProfileView = ({ user, onUpdateProfile, onLogout, onDeleteAccount, onNotify, skillOptions = [], onOpenLeaderPage, onEnablePushNotifications, pushStatus = {} }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ next: '', confirm: '', loading: false });
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);

    // Initialize form with safe defaults, ensuring arrays for tags
    const [form, setForm] = useState({
        name: user.name || '',
        city: user.city || '',
        email: user.email || '',
        dob: user.dob ? new Date(user.dob).toISOString().split('T')[0] : '', // Format for input type="date"
        skills: normalizeSkills(user.skills),
        offer: user.offer || '',
        unique_abilities: user.unique_abilities || '',
        join_date: user.join_date ? new Date(user.join_date).toISOString().split('T')[0] : '',
        leader_signature: user.leader_signature || '',
        leader_reviews: Array.isArray(user.leader_reviews) ? user.leader_reviews : [],
        telegram: user.telegram || ''
    });

    const fileInputRef = useRef(null);

    // Calculate Progress
    const calculateProgress = () => {
        let completed = 0;
        const total = 7; // Name, City, Avatar, Skills, Offer, Unique, JoinDate
        if (user.name) completed++;
        if (user.city) completed++;
        if (user.avatar) completed++;
        if (user.skills && user.skills.length > 0) completed++;
        if (user.offer) completed++;
        if (user.unique_abilities) completed++;
        if (user.join_date) completed++;
        return Math.round((completed / total) * 100);
    };

    const progress = calculateProgress();

    // Druid Horoscope Logic
    const druidTree = user.dob ? getDruidTree(user.dob) : null;

    const handleSave = () => {
        // Recalculate tree based on current form DOB
        const treeData = form.dob ? getDruidTree(form.dob) : null;

        onUpdateProfile({
            ...user,
            ...form,
            skills: normalizeSkills(form.skills),
            tree: treeData ? treeData.name : null,
            treeDesc: treeData ? treeData.description : null
        });
        setIsEditing(false);
    };

    const handlePhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                onNotify("Загружаю фото...");
                const { api } = await import('../services/dataService');
                const url = await api.uploadAvatar(file);
                onUpdateProfile({ ...user, avatar: url }); // Update user immediately with new avatar
                onNotify("Фото профиля обновлено");
            } catch (e) {
                console.error(e);
                alert(`Ошибка загрузки: ${e.message || e.error_description || JSON.stringify(e)}`);
                onNotify("Ошибка загрузки фото");
            }
        }
    };

    const handlePasswordUpdate = async () => {
        if (!passwordForm.next || passwordForm.next.length < 8) {
            onNotify("Пароль должен быть не короче 8 символов");
            return;
        }
        if (passwordForm.next !== passwordForm.confirm) {
            onNotify("Пароли не совпадают");
            return;
        }
        try {
            setPasswordForm(prev => ({ ...prev, loading: true }));
            const { api } = await import('../services/dataService');
            await api.updatePassword(passwordForm.next);
            setPasswordForm({ next: '', confirm: '', loading: false });
            onNotify("Пароль обновлен");
        } catch (e) {
            console.error(e);
            onNotify(e?.message || "Не удалось обновить пароль");
            setPasswordForm(prev => ({ ...prev, loading: false }));
        }
    };

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12 w-full">
            {/* Page Header */}
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-4xl font-light text-slate-800 tracking-tight mb-1">Профиль</h1>
                    <p className="text-slate-500">Ваше пространство в Лиге</p>
                </div>
            </div>

            <div className={`grid grid-cols-1 ${isEditing ? 'lg:grid-cols-1' : 'lg:grid-cols-12'} gap-8 items-start`}>
                {/* LEFT COLUMN: Visual Identity Card */}
                <div className={`${isEditing ? '' : 'lg:col-span-4 lg:sticky lg:top-6'}`}>
                    <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 overflow-hidden relative group border border-slate-100/50">
                        {/* Status Bar */}
                        <div className="absolute top-0 left-0 right-0 z-20 p-6 flex justify-between items-start">
                            <div className="bg-white/30 backdrop-blur-md px-3 py-1 rounded-full border border-white/40 text-white text-[10px] font-bold uppercase tracking-widest shadow-sm">
                                {progress}% заполнено
                            </div>
                            {druidTree && (
                                <div className="bg-black/20 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-white text-[10px] font-bold uppercase tracking-widest shadow-sm">
                                    {druidTree.name}
                                </div>
                            )}
                        </div>

                        {/* Cover Image */}
                        <div className="h-[350px] md:h-[500px] lg:h-[600px] relative bg-slate-200 overflow-hidden">
                            {druidTree?.image ? (
                                <>
                                    <img
                                        src={druidTree.image}
                                        alt={druidTree.name}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-[30s]"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                                </>
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-blue-400 to-indigo-600" />
                            )}

                            {/* Avatar & Info Overlay */}
                            <div className="absolute bottom-0 left-0 right-0 p-8 text-center flex flex-col items-center">
                                <div className="relative group/avatar cursor-pointer mb-4" onClick={() => fileInputRef.current.click()}>
                                    <UserAvatar user={user} size="xl" className="w-32 h-32 rounded-full border-4 border-white/20 shadow-2xl object-cover" />
                                    <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity backdrop-blur-[2px]">
                                        <Camera size={24} className="text-white" />
                                    </div>
                                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                                </div>
                                <h2 className="text-2xl font-bold text-white mb-1 shadow-black/50 drop-shadow-md">{user.name}</h2>
                                <p className="text-white/80 text-sm font-medium mb-4">{user.city || 'Город не указан'}</p>

                                {druidTree && (
                                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 text-left w-full mt-4">
                                        <div className="text-[10px] uppercase tracking-widest text-white/60 mb-1 font-bold">Сила дерева</div>
                                        <p className="text-white/90 text-xs italic leading-relaxed">{druidTree.description}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: Data & Forms */}
                <div className={`${isEditing ? '' : 'lg:col-span-8'} space-y-6`}>
                    {/* Header Row */}
                    <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        <div>
                            <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
                                <span className={`w-2 h-2 rounded-full ${user.role === 'admin' ? 'bg-purple-500' : 'bg-blue-500'}`}></span>
                                {getRoleLabel(user.role)}
                            </div>
                            <h2 className="text-3xl font-bold text-slate-900">{user.name}</h2>
                            <div className="flex items-center gap-4 mt-2 text-slate-500 text-sm">
                                <span className="flex items-center gap-1"><MapPin size={14} /> {user.city || 'Не указан'}</span>
                                <span className="text-slate-300">|</span>
                                <span className="flex items-center gap-1"><Briefcase size={14} /> {user.role === 'admin' ? 'Администратор' : 'Участник Лиги'}</span>
                            </div>
                        </div>
                        {!isEditing && (
                            <Button
                                onClick={() => setIsEditing(true)}
                                variant="secondary"
                                className="w-full md:w-auto !rounded-xl !px-6 !py-2.5 border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-700 shadow-sm"
                            >
                                Редактировать профиль
                            </Button>
                        )}
                    </div>

                    {/* Forms Grid */}
                    <div className="grid gap-6">
                        <Card title="Личные данные" className="!rounded-[2rem]">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                {isEditing ? (
                                    <>
                                        <Input label="Имя и фамилия" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                                        <Input label="Город" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
                                        <Input label="Дата рождения" type="date" max="9999-12-31" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} />
                                        <Input label="Дата вступления в Лигу" type="date" max="9999-12-31" value={form.join_date} onChange={e => setForm({ ...form, join_date: e.target.value })} />
                                        <div className="space-y-1">
                                            <label className="text-sm font-medium text-slate-700">Email (нельзя изменить)</label>
                                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 text-sm">{form.email}</div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                            <label className="text-[10px] uppercase text-slate-400 font-bold tracking-wider mb-1 block">Имя</label>
                                            <div className="text-slate-800 font-medium">{user.name}</div>
                                        </div>
                                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                            <label className="text-[10px] uppercase text-slate-400 font-bold tracking-wider mb-1 block">Город</label>
                                            <div className="text-slate-800">{user.city || '—'}</div>
                                        </div>
                                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                            <label className="text-[10px] uppercase text-slate-400 font-bold tracking-wider mb-1 block">Дата рождения</label>
                                            <div className="text-slate-800">{user.dob ? new Date(user.dob).toLocaleDateString('ru-RU') : '—'}</div>
                                        </div>
                                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                            <label className="text-[10px] uppercase text-slate-400 font-bold tracking-wider mb-1 block">В Лиге с</label>
                                            <div className="text-slate-800">{user.join_date ? new Date(user.join_date).toLocaleDateString('ru-RU') : '—'}</div>
                                        </div>
                                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 col-span-1 md:col-span-2">
                                            <label className="text-[10px] uppercase text-slate-400 font-bold tracking-wider mb-1 block">Email</label>
                                            <div className="text-slate-800">{user.email}</div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </Card>

                        <Card title="Профессиональный профиль" className="!rounded-[2rem]">
                            <div className="space-y-6">
                                {isEditing ? (
                                    <>
                                        <TagsInput
                                            label="Мои компетенции"
                                            placeholder="Коучинг, психология, нейрографика, игропрактика, дизайн..."
                                            value={form.skills}
                                            onChange={newTags => setForm({ ...form, skills: newTags })}
                                            options={skillOptions}
                                        />
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-700">Чем я могу быть полезна другим участникам?</label>
                                            <textarea
                                                className="w-full bg-white border border-slate-200 rounded-xl p-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm min-h-[100px]"
                                                value={form.offer}
                                                onChange={e => setForm({ ...form, offer: e.target.value })}
                                                placeholder="Например: могу провести супервизию, помочь с организацией мероприятий..."
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-700">Суперсила</label>
                                            <textarea
                                                className="w-full bg-white border border-slate-200 rounded-xl p-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm min-h-[80px]"
                                                value={form.unique_abilities}
                                                onChange={e => setForm({ ...form, unique_abilities: e.target.value })}
                                                placeholder="Что-то необычное, что вы умеете..."
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <div className="space-y-8">
                                        <div>
                                            <label className="text-[10px] uppercase text-slate-400 font-bold tracking-wider block mb-3">Компетенции</label>
                                            <div className="flex flex-wrap gap-2">
                                                {normalizeSkills(user.skills).length > 0 ?
                                                    normalizeSkills(user.skills).map((tag, i) => (
                                                        <span key={i} className="px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-blue-700 text-sm font-medium">{tag}</span>
                                                    ))
                                                    : <span className="text-slate-400 text-sm italic">Не указано</span>
                                                }
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                                                <label className="text-[10px] uppercase text-slate-400 font-bold tracking-wider block mb-2">Чем могу быть полезна</label>
                                                <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">{user.offer || '—'}</p>
                                            </div>
                                            <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-5 rounded-2xl border border-amber-100">
                                                <label className="text-[10px] uppercase text-amber-400 font-bold tracking-wider block mb-2">⚡️ Superpower</label>
                                                <p className="text-slate-800 text-sm whitespace-pre-wrap leading-relaxed">{user.unique_abilities || '—'}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </Card>

                        <Card title="Страница ведущей" className="!rounded-[2rem]">
                            <div className="space-y-6">
                                {isEditing ? (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-700">Ссылка на Telegram</label>
                                            <Input
                                                value={form.telegram}
                                                onChange={e => setForm({ ...form, telegram: e.target.value })}
                                                placeholder="https://t.me/username"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-700">Что я хочу, чтобы вы про меня знали</label>
                                            <textarea
                                                className="w-full bg-white border border-slate-200 rounded-xl p-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm min-h-[120px]"
                                                value={form.leader_signature}
                                                onChange={e => setForm({ ...form, leader_signature: e.target.value })}
                                                placeholder="Поделитесь тем, что важно знать участницам о вас"
                                            />
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                variant="secondary"
                                                className="!rounded-xl"
                                                onClick={() => onOpenLeaderPage && onOpenLeaderPage()}
                                            >
                                                Открыть страницу ведущей
                                            </Button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                                            <label className="text-[10px] uppercase text-slate-400 font-bold tracking-wider block mb-2">Telegram</label>
                                            <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">{user.telegram || '—'}</p>
                                        </div>
                                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                                            <label className="text-[10px] uppercase text-slate-400 font-bold tracking-wider block mb-2">Что я хочу, чтобы вы про меня знали</label>
                                            <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">{user.leader_signature || '—'}</p>
                                        </div>
                                        <Button
                                            variant="secondary"
                                            className="!rounded-xl w-full md:w-auto"
                                            onClick={() => onOpenLeaderPage && onOpenLeaderPage()}
                                        >
                                            Открыть страницу ведущей
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </Card>

                        <Card title="Безопасность" className="!rounded-[2rem]">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input
                                    label="Новый пароль"
                                    type="password"
                                    value={passwordForm.next}
                                    onChange={e => setPasswordForm({ ...passwordForm, next: e.target.value })}
                                    placeholder="Минимум 8 символов"
                                />
                                <Input
                                    label="Повторите пароль"
                                    type="password"
                                    value={passwordForm.confirm}
                                    onChange={e => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                                    placeholder="Повторите новый пароль"
                                />
                            </div>
                            <div className="mt-4">
                                <Button
                                    variant="secondary"
                                    onClick={handlePasswordUpdate}
                                    className="!px-6"
                                    disabled={passwordForm.loading}
                                >
                                    {passwordForm.loading ? 'Сохранение...' : 'Обновить пароль'}
                                </Button>
                            </div>
                        </Card>

                        <Card title="Уведомления" className="!rounded-[2rem]">
                            <div className="space-y-4">
                                <div className="text-sm text-slate-600">
                                    Для iPhone уведомления работают, когда сайт добавлен на экран "Домой" и открыт как приложение.
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                                        <div className="text-slate-400 uppercase tracking-wider mb-1">Поддержка</div>
                                        <div className="text-slate-700 font-medium">{pushStatus.supported ? 'Да' : 'Нет'}</div>
                                    </div>
                                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                                        <div className="text-slate-400 uppercase tracking-wider mb-1">Режим PWA</div>
                                        <div className="text-slate-700 font-medium">{pushStatus.isStandalone ? 'Да' : 'Нет'}</div>
                                    </div>
                                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                                        <div className="text-slate-400 uppercase tracking-wider mb-1">Разрешение</div>
                                        <div className="text-slate-700 font-medium">{pushStatus.permission || 'default'}</div>
                                    </div>
                                </div>
                                <Button
                                    variant="secondary"
                                    icon={Bell}
                                    onClick={onEnablePushNotifications}
                                    disabled={Boolean(pushStatus.loading)}
                                >
                                    {pushStatus.loading ? 'Включаем...' : (pushStatus.enabled ? 'Переустановить push' : 'Включить push-уведомления')}
                                </Button>
                            </div>
                        </Card>
                    </div>

                    {isEditing && (
                        <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
                            <div className="text-sm text-slate-500">
                                Все изменения сохраняются в профиле и отражаются на странице ведущей.
                            </div>
                            <Button
                                onClick={handleSave}
                                variant="primary"
                                className="w-full md:w-auto !rounded-xl !px-6 !py-2.5 shadow-sm"
                            >
                                Сохранить изменения
                            </Button>
                        </div>
                    )}

                    {/* Account Actions */}
                    <div className="pt-8 border-t border-slate-200 flex flex-wrap gap-4 items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Управление аккаунтом</h3>
                        <div className="flex gap-3">
                            <Button variant="secondary" icon={LogOut} onClick={onLogout} className="!text-xs !py-2 !px-4">Выйти</Button>
                            <Button variant="danger" icon={Trash2} onClick={() => setIsDeleteOpen(true)} className="!text-xs !py-2 !px-4 hover:bg-red-50 hover:text-red-600 hover:border-red-200">Удалить профиль</Button>
                        </div>
                    </div>
                </div>
            </div>

            <ConfirmationModal
                isOpen={isDeleteOpen}
                onClose={() => setIsDeleteOpen(false)}
                onConfirm={() => {
                    setIsDeleteOpen(false);
                    if (onDeleteAccount) onDeleteAccount();
                }}
                title="Удалить профиль?"
                message="Это действие невозможно отменить."
                confirmText="Удалить"
                confirmVariant="danger"
            />
        </div>
    );
};

export default ProfileView;
