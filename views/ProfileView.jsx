import React, { useState, useRef, useEffect } from 'react';
import { Camera, LogOut, Trash2, X, Plus, MapPin, Briefcase, Send, Copy, CheckCircle2 } from 'lucide-react';
import Button from '../components/Button';
import Card from '../components/Card';
import Input from '../components/Input';
import UserAvatar from '../components/UserAvatar';
import ModalShell from '../components/ModalShell';
import { getRoleLabel } from '../data/data';
import { getDruidTree } from '../utils/druidHoroscope';
import { normalizeSkills } from '../utils/skills';
import ConfirmationModal from '../components/ConfirmationModal';
import SubscriptionCheckout from '../components/SubscriptionCheckout';
import { api } from '../services/dataService';
import { getProfileCompletionPercent } from '../utils/profileCompleteness';

// Standing invite-ссылки в Лига-сообщество. Клик → заявка chat_join_request →
// join-поллер авто-approve оплаченного (матч по telegram_user_id/@username). Уже на проде.
const LIGA_TG_CHANNEL_URL = 'https://t.me/+dVRWs_cl2VA3OTVi';
const LIGA_TG_CHAT_URL = 'https://t.me/+GH0sjSaUzOc2N2Zi';

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
                <Button variant="secondary" onClick={addTag} className="!p-2 min-h-[44px] min-w-[44px]" icon={Plus} />
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

const ProfileView = ({ user, onUpdateProfile, onProfileRefresh, onLogout, onDeleteAccount, onNotify, skillOptions = [], onOpenLeaderPage, paidReturn = false }) => {
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
        telegram: user.telegram || '',
        vk: user.vk || '',
        avatar_focus_x: Number.isFinite(Number(user.avatar_focus_x)) ? Math.max(0, Math.min(100, Number(user.avatar_focus_x))) : 50,
        avatar_focus_y: Number.isFinite(Number(user.avatar_focus_y)) ? Math.max(0, Math.min(100, Number(user.avatar_focus_y))) : 50,
    });

    const fileInputRef = useRef(null);
    /** Новое фото выбрано вне режима редактирования — на сервер уходит только после «Сохранить фото». */
    const [avatarPickPending, setAvatarPickPending] = useState(null);
    const [savingPendingAvatar, setSavingPendingAvatar] = useState(false);

    useEffect(() => {
        return () => {
            if (avatarPickPending?.previewUrl) {
                URL.revokeObjectURL(avatarPickPending.previewUrl);
            }
        };
    }, [avatarPickPending]);

    useEffect(() => {
        if (isEditing) return;
        if (avatarPickPending) return;
        setForm((prev) => ({
            ...prev,
            name: user.name || '',
            city: user.city || '',
            email: user.email || '',
            dob: user.dob ? new Date(user.dob).toISOString().split('T')[0] : '',
            skills: normalizeSkills(user.skills),
            offer: user.offer || '',
            unique_abilities: user.unique_abilities || '',
            join_date: user.join_date ? new Date(user.join_date).toISOString().split('T')[0] : '',
            leader_signature: user.leader_signature || '',
            leader_reviews: Array.isArray(user.leader_reviews) ? user.leader_reviews : [],
            telegram: user.telegram || '',
            vk: user.vk || '',
            avatar_focus_x: Number.isFinite(Number(user.avatar_focus_x)) ? Math.max(0, Math.min(100, Number(user.avatar_focus_x))) : prev.avatar_focus_x,
            avatar_focus_y: Number.isFinite(Number(user.avatar_focus_y)) ? Math.max(0, Math.min(100, Number(user.avatar_focus_y))) : prev.avatar_focus_y,
        }));
    }, [user, isEditing, avatarPickPending]);

    // Заполненность считаем тем же единым источником, что и напоминалка о
    // незаполненном профиле (utils/profileCompleteness). Раньше здесь был свой
    // набор из 7 полей — он противоречил тексту напоминалки.
    const progress = getProfileCompletionPercent(user);

    // Druid Horoscope Logic
    const druidTree = user.dob ? getDruidTree(user.dob) : null;

    const avatarForDisplay = avatarPickPending
        ? { ...user, avatar: avatarPickPending.previewUrl, avatar_url: undefined }
        : user;
    const showAvatarFocusSliders =
        (isEditing && (user.avatar || user.avatar_url)) || Boolean(avatarPickPending);
    const useFormAvatarFocus = isEditing || Boolean(avatarPickPending);

    const handleSave = () => {
        if (!form.telegram || !form.telegram.trim()) {
            onNotify && onNotify('Telegram обязателен. Заполните поле «Ссылка на Telegram».');
            return;
        }

        // Recalculate tree based on current form DOB
        const treeData = form.dob ? getDruidTree(form.dob) : null;

        onUpdateProfile({
            ...user,
            ...form,
            skills: normalizeSkills(form.skills),
            avatar_focus_x: form.avatar_focus_x,
            avatar_focus_y: form.avatar_focus_y,
            tree: treeData ? treeData.name : null,
            treeDesc: treeData ? treeData.description : null
        });
        setIsEditing(false);
    };

    const handlePendingAvatarSave = async () => {
        if (!avatarPickPending?.file) return;
        try {
            setSavingPendingAvatar(true);
            const url = await api.uploadAvatar(avatarPickPending.file);
            onUpdateProfile({
                ...user,
                avatar: url,
                avatar_focus_x: form.avatar_focus_x,
                avatar_focus_y: form.avatar_focus_y
            });
            setAvatarPickPending(null);
        } catch (e) {
            console.error(e);
            alert(`Ошибка загрузки: ${e.message || e.error_description || JSON.stringify(e)}`);
            onNotify('Ошибка загрузки фото');
        } finally {
            setSavingPendingAvatar(false);
        }
    };

    const handlePendingAvatarCancel = () => {
        setAvatarPickPending(null);
        setForm((prev) => ({
            ...prev,
            avatar_focus_x: Number.isFinite(Number(user.avatar_focus_x)) ? Math.max(0, Math.min(100, Number(user.avatar_focus_x))) : 50,
            avatar_focus_y: Number.isFinite(Number(user.avatar_focus_y)) ? Math.max(0, Math.min(100, Number(user.avatar_focus_y))) : 50
        }));
    };

    const handlePhotoUpload = async (e) => {
        const file = e.target.files[0];
        const input = e.target;
        if (input) input.value = '';
        if (!file) return;

        if (isEditing) {
            try {
                    const url = await api.uploadAvatar(file);
                onUpdateProfile({ ...user, avatar: url, avatar_focus_x: 50, avatar_focus_y: 50 });
                setForm((f) => ({ ...f, avatar_focus_x: 50, avatar_focus_y: 50 }));
            } catch (err) {
                console.error(err);
                alert(`Ошибка загрузки: ${err.message || err.error_description || JSON.stringify(err)}`);
                onNotify('Ошибка загрузки фото');
            }
            return;
        }

        setAvatarPickPending((prev) => {
            if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
            return { file, previewUrl: URL.createObjectURL(file) };
        });
        setForm((f) => ({ ...f, avatar_focus_x: 50, avatar_focus_y: 50 }));
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
            await api.updatePassword(passwordForm.next);
            setPasswordForm({ next: '', confirm: '', loading: false });
            onNotify("Пароль обновлен");
        } catch (e) {
            console.error(e);
            onNotify(e?.message || "Не удалось обновить пароль");
            setPasswordForm(prev => ({ ...prev, loading: false }));
        }
    };

    // FEAT-024 — TG linking state.
    const [tgLinkModal, setTgLinkModal] = useState(null); // { code, deep_link } | null
    const [tgLinkLoading, setTgLinkLoading] = useState(false);
    const [tgUnlinkConfirm, setTgUnlinkConfirm] = useState(false);
    const [tgUnlinkLoading, setTgUnlinkLoading] = useState(false);
    const [tgCodeCopied, setTgCodeCopied] = useState(false);

    // ФАЗА 1d — «Моя подписка». Выбор плана + checkout вынесены в общий
    // <SubscriptionCheckout/> (переиспользуется на экране продления).
    const [subPolling, setSubPolling] = useState(paidReturn);   // авто-опрос после возврата с оплаты
    // Замороженный baseline paid_until на маунте — успех poll'а = РОСТ (не «в будущем»),
    // чтобы продление (baseline уже будущий) детектилось по увеличению даты.
    // Новая оплата: baseline=0 (null/прошлое) → любая будущая дата пройдёт.
    const paidBaselineRef = useRef(user.paid_until ? new Date(user.paid_until).getTime() : 0);

    // Активна ли подписка сейчас (derive-on-read из одного paid_until).
    const paidUntilDate = user.paid_until ? new Date(user.paid_until) : null;
    const subActive = !!(paidUntilDate && paidUntilDate.getTime() > Date.now());
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('ru-RU') : '—';

    // Авто-poll после возврата с оплаты: getCurrentUser каждые 3с, до 5 попыток
    // или пока paid_until не «перещёлкнется» в будущее. Ручная кнопка — fallback.
    useEffect(() => {
        if (!paidReturn) return;
        let attempts = 0, alive = true, timer = null;
        const tick = async () => {
            if (!alive) return;
            attempts += 1;
            try {
                const fresh = await api.getCurrentUser();
                if (fresh && onProfileRefresh) onProfileRefresh(fresh);
                const freshMs = fresh?.paid_until ? new Date(fresh.paid_until).getTime() : 0;
                if (freshMs > paidBaselineRef.current || attempts >= 5) { setSubPolling(false); return; }
            } catch { /* игнор, продолжаем попытки */ }
            timer = setTimeout(tick, 3000);
        };
        timer = setTimeout(tick, 1500);
        return () => { alive = false; if (timer) clearTimeout(timer); };
    }, [paidReturn]);   // eslint-disable-line react-hooks/exhaustive-deps

    const handleRefreshSubStatus = async () => {
        setSubPolling(true);
        try {
            const fresh = await api.getCurrentUser();
            if (fresh && onProfileRefresh) onProfileRefresh(fresh);
        } catch (e) {
            onNotify(e?.message || 'Не удалось обновить статус');
        } finally {
            setSubPolling(false);
        }
    };

    const handleGenerateTgLinkCode = async () => {
        try {
            setTgLinkLoading(true);
            const data = await api.generateTelegramLinkCode();
            setTgLinkModal({ code: data.code, deep_link: data.deep_link });
            setTgCodeCopied(false);
        } catch (e) {
            console.error(e);
            onNotify(e?.message || 'Не удалось сгенерировать код привязки');
        } finally {
            setTgLinkLoading(false);
        }
    };

    const handleUnlinkTelegram = async () => {
        setTgUnlinkConfirm(false);
        try {
            setTgUnlinkLoading(true);
            await api.unlinkTelegram();
            onNotify('Telegram отвязан');
            try {
                const fresh = await api.getCurrentUser();
                if (fresh && onProfileRefresh) onProfileRefresh(fresh);
            } catch (refreshErr) {
                console.warn('refresh после unlink не удался', refreshErr);
            }
        } catch (e) {
            console.error(e);
            onNotify(e?.message || 'Не удалось отвязать Telegram');
        } finally {
            setTgUnlinkLoading(false);
        }
    };

    const handleCopyTgCode = async () => {
        if (!tgLinkModal?.code) return;
        try {
            await navigator.clipboard.writeText(tgLinkModal.code);
            setTgCodeCopied(true);
            setTimeout(() => setTgCodeCopied(false), 2000);
        } catch (e) {
            // clipboard может быть закрыт (insecure context) — fallback на manual copy
            console.warn('clipboard write failed', e);
        }
    };

    // Polling каждые 5с пока открыт modal линка — проверяем привязался ли TG.
    useEffect(() => {
        if (!tgLinkModal) return;
        let cancelled = false;
        const tick = async () => {
            if (cancelled) return;
            try {
                const fresh = await api.getCurrentUser();
                if (cancelled) return;
                if (fresh?.telegram_user_id) {
                    setTgLinkModal(null);
                    onNotify('Привязано! Теперь будем слать уведомления в TG');
                    if (onProfileRefresh) onProfileRefresh(fresh);
                }
            } catch (e) {
                // тихо игнорим — на следующем тике попробуем ещё раз
            }
        };
        const id = setInterval(tick, 5000);
        return () => { cancelled = true; clearInterval(id); };
    }, [tgLinkModal, onNotify, onProfileRefresh]);

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12 w-full">
            {/* Page Header */}
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h1 className="h-display text-slate-800 mb-1">Профиль</h1>
                    <p className="text-slate-500">Ваше пространство в Лиге</p>
                </div>
            </div>

            <div className={`grid grid-cols-1 ${isEditing ? 'lg:grid-cols-1' : 'lg:grid-cols-12'} gap-8 items-start`}>
                {/* LEFT COLUMN: Visual Identity Card */}
                <div className={`${isEditing ? '' : 'lg:col-span-4 lg:sticky lg:top-6'}`}>
                    <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 overflow-hidden relative group border border-slate-100/50">
                        {/* Status Bar */}
                        <div className="absolute top-0 left-0 right-0 z-20 p-6 flex justify-between items-start">
                            <div className="bg-white/30 backdrop-blur-md px-3 py-1 rounded-full border border-white/40 text-white text-[10px] font-bold shadow-sm">
                                {progress}% заполнено
                            </div>
                            {druidTree && (
                                <div className="bg-black/20 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-white text-[10px] font-bold shadow-sm">
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
                                    <UserAvatar
                                        user={avatarForDisplay}
                                        size="xl"
                                        className="w-32 h-32 rounded-full border-4 border-white/20 shadow-2xl object-cover"
                                        focusX={useFormAvatarFocus ? form.avatar_focus_x : undefined}
                                        focusY={useFormAvatarFocus ? form.avatar_focus_y : undefined}
                                    />
                                    <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity backdrop-blur-[2px]">
                                        <Camera size={24} className="text-white" />
                                    </div>
                                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                                </div>
                                {showAvatarFocusSliders ? (
                                    <div className="w-full max-w-sm mx-auto mb-4 rounded-2xl border border-white/20 bg-black/30 backdrop-blur-sm p-4 text-left space-y-3">
                                        <div>
                                            <label className="block text-[11px] font-semibold text-white/90 mb-1">Положение по горизонтали</label>
                                            <input
                                                type="range"
                                                min="0"
                                                max="100"
                                                value={form.avatar_focus_x}
                                                onChange={(e) => setForm({ ...form, avatar_focus_x: parseInt(e.target.value, 10) })}
                                                className="w-full accent-emerald-400"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-semibold text-white/90 mb-1">Положение по вертикали</label>
                                            <input
                                                type="range"
                                                min="0"
                                                max="100"
                                                value={form.avatar_focus_y}
                                                onChange={(e) => setForm({ ...form, avatar_focus_y: parseInt(e.target.value, 10) })}
                                                className="w-full accent-emerald-400"
                                            />
                                        </div>
                                        {avatarPickPending ? (
                                            <div className="flex flex-wrap gap-2 pt-1">
                                                <Button
                                                    type="button"
                                                    variant="primary"
                                                    className="!rounded-xl !text-sm"
                                                    disabled={savingPendingAvatar}
                                                    onClick={(ev) => {
                                                        ev.stopPropagation();
                                                        handlePendingAvatarSave();
                                                    }}
                                                >
                                                    {savingPendingAvatar ? 'Сохранение…' : 'Сохранить фото'}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    className="!rounded-xl !text-sm bg-white/15 border-white/30 text-white hover:bg-white/25"
                                                    disabled={savingPendingAvatar}
                                                    onClick={(ev) => {
                                                        ev.stopPropagation();
                                                        handlePendingAvatarCancel();
                                                    }}
                                                >
                                                    Отмена
                                                </Button>
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}
                                <h2 className="h-section text-white mb-1 shadow-black/50 drop-shadow-md">{user.name}</h2>
                                <p className="text-white/80 text-sm font-medium mb-4">{user.city || 'Город не указан'}</p>

                                {druidTree && (
                                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 text-left w-full mt-4">
                                        <div className="text-[10px] text-white/60 mb-1 font-bold">Сила дерева</div>
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
                            <div className="flex items-center gap-2 text-slate-400 text-xs font-bold mb-2">
                                <span className={`w-2 h-2 rounded-full ${user.role === 'admin' ? 'bg-purple-500' : 'bg-blue-500'}`}></span>
                                {getRoleLabel(user.role)}
                            </div>
                            <h2 className="h-display text-slate-900">{user.name}</h2>
                            <div className="flex items-center gap-4 mt-2 text-slate-500 text-sm">
                                <span className="flex items-center gap-1"><MapPin size={14} /> {user.city || 'Не указан'}</span>
                                <span className="text-slate-300">|</span>
                                <span className="flex items-center gap-1"><Briefcase size={14} /> {user.role === 'admin' ? 'Администратор' : 'Участник Лиги'}</span>
                            </div>
                        </div>
                        {!isEditing && !avatarPickPending && (
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
                        {/* ФАЗА 1d — Моя подписка */}
                        <Card title="Моя подписка" className="!rounded-[2rem]">
                            {subPolling ? (
                                <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-center gap-3">
                                    <div className="h-4 w-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                                    <div className="text-sm text-amber-800">Обрабатываем оплату… статус обновится автоматически.</div>
                                </div>
                            ) : (
                                <div className={`p-4 rounded-2xl border ${subActive ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                                    <div className="text-sm font-semibold text-slate-800">
                                        {subActive ? 'Подписка активна' : (paidUntilDate ? 'Подписка истекла' : 'Подписка не оплачена')}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-0.5">
                                        {paidUntilDate ? `Оплачено до ${fmtDate(paidUntilDate)}` : 'Выберите план и оплатите доступ к Лиге.'}
                                    </div>
                                </div>
                            )}

                            {subActive && (
                                <div className="mt-4 space-y-2">
                                    <div className="text-sm font-medium text-slate-700">Доступ в сообщество Лиги</div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <a
                                            href={LIGA_TG_CHANNEL_URL}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-center gap-2 p-3 rounded-2xl border border-emerald-500 bg-emerald-50/40 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-all"
                                        >
                                            <Send className="w-4 h-4" /> Вступить в канал Лиги
                                        </a>
                                        <a
                                            href={LIGA_TG_CHAT_URL}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-center gap-2 p-3 rounded-2xl border border-emerald-500 bg-emerald-50/40 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-all"
                                        >
                                            <Send className="w-4 h-4" /> Вступить в чат Лиги
                                        </a>
                                    </div>
                                    <div className="text-[11px] text-slate-400 leading-relaxed">
                                        По ссылке отправится заявка — бот одобрит её автоматически, если ваш Telegram привязан к профилю. Если вы уже участник — ссылка просто откроет канал/чат.
                                    </div>
                                </div>
                            )}

                            <SubscriptionCheckout
                                heading={subActive ? 'Продлить' : 'Выбрать план'}
                                ctaLabel={subActive ? 'Продлить подписку' : 'Оплатить'}
                                onNotify={onNotify}
                                footer={paidReturn && !subPolling ? (
                                    <button type="button" onClick={handleRefreshSubStatus} className="w-full text-xs text-slate-400 hover:text-slate-600 py-1">
                                        Обновить статус вручную
                                    </button>
                                ) : null}
                            />
                        </Card>

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
                                            <label className="text-[10px] text-slate-400 font-bold mb-1 block">Имя</label>
                                            <div className="text-slate-800 font-medium">{user.name}</div>
                                        </div>
                                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                            <label className="text-[10px] text-slate-400 font-bold mb-1 block">Город</label>
                                            <div className="text-slate-800">{user.city || '—'}</div>
                                        </div>
                                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                            <label className="text-[10px] text-slate-400 font-bold mb-1 block">Дата рождения</label>
                                            <div className="text-slate-800">{user.dob ? new Date(user.dob).toLocaleDateString('ru-RU') : '—'}</div>
                                        </div>
                                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                            <label className="text-[10px] text-slate-400 font-bold mb-1 block">В Лиге с</label>
                                            <div className="text-slate-800">{user.join_date ? new Date(user.join_date).toLocaleDateString('ru-RU') : '—'}</div>
                                        </div>
                                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 col-span-1 md:col-span-2">
                                            <label className="text-[10px] text-slate-400 font-bold mb-1 block">Email</label>
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
                                            <label className="text-[10px] text-slate-400 font-bold block mb-3">Компетенции</label>
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
                                                <label className="text-[10px] text-slate-400 font-bold block mb-2">Чем могу быть полезна</label>
                                                <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">{user.offer || '—'}</p>
                                            </div>
                                            <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-5 rounded-2xl border border-amber-100">
                                                <label className="text-[10px] text-amber-400 font-bold block mb-2">⚡️ Superpower</label>
                                                <p className="text-slate-800 text-sm whitespace-pre-wrap leading-relaxed">{user.unique_abilities || '—'}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </Card>

                        <Card title="Telegram-уведомления" className="!rounded-[2rem]">
                            <div className="space-y-4">
                                {user.telegram_user_id ? (
                                    <>
                                        <div className="flex items-center gap-3 bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                                            <CheckCircle2 className="text-emerald-600 flex-shrink-0" size={22} />
                                            <div className="flex-1">
                                                <p className="text-emerald-900 text-sm font-medium">Привязан к Telegram</p>
                                                {user.telegram_linked_at && (
                                                    <p className="text-emerald-700 text-xs mt-0.5">
                                                        с {new Date(user.telegram_linked_at).toLocaleDateString('ru-RU')}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <p className="text-slate-500 text-sm">
                                            Будем писать в TG, когда студентка сдаст ДЗ или ментор проверит вашу работу. Тихие часы: 23:00–08:00 МСК.
                                        </p>
                                        <Button
                                            variant="secondary"
                                            onClick={() => setTgUnlinkConfirm(true)}
                                            disabled={tgUnlinkLoading}
                                            className="!rounded-xl"
                                        >
                                            {tgUnlinkLoading ? 'Отвязываем…' : 'Отвязать Telegram'}
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-slate-600 text-sm leading-relaxed">
                                            Привяжите телеграм, чтобы получать уведомления по курсу Пиши, веди, люби. Тихие часы: 23:00–08:00 МСК.
                                        </p>
                                        <Button
                                            variant="primary"
                                            icon={Send}
                                            onClick={handleGenerateTgLinkCode}
                                            disabled={tgLinkLoading}
                                            className="!rounded-xl"
                                        >
                                            {tgLinkLoading ? 'Готовим код…' : 'Привязать Telegram'}
                                        </Button>
                                    </>
                                )}
                            </div>
                        </Card>

                        <Card title="Страница ведущей" className="!rounded-[2rem]">
                            <div className="space-y-6">
                                {isEditing ? (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-700">Ссылка на Telegram (обязательно)</label>
                                            <Input
                                                value={form.telegram}
                                                onChange={e => setForm({ ...form, telegram: e.target.value })}
                                                placeholder="https://t.me/username"
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-700">Ссылка на ВКонтакте (необязательно)</label>
                                            <Input
                                                value={form.vk}
                                                onChange={e => setForm({ ...form, vk: e.target.value })}
                                                placeholder="https://vk.me/username или vk.com/id123"
                                            />
                                            <p className="text-[11px] text-slate-400">
                                                Если у вас есть ВК — это альтернативный канал связи в публичных встречах. Можно ввести как https://vk.com/username, мы автоматически приведём к ссылке на личку.
                                            </p>
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
                                            <label className="text-[10px] text-slate-400 font-bold block mb-2">Telegram</label>
                                            <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">{user.telegram || '—'}</p>
                                        </div>
                                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                                            <label className="text-[10px] text-slate-400 font-bold block mb-2">ВКонтакте</label>
                                            <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">{user.vk || '—'}</p>
                                        </div>
                                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                                            <label className="text-[10px] text-slate-400 font-bold block mb-2">Что я хочу, чтобы вы про меня знали</label>
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
                        <h3 className="text-xs font-bold text-slate-400">Управление аккаунтом</h3>
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

            <ModalShell
                isOpen={Boolean(tgLinkModal)}
                onClose={() => setTgLinkModal(null)}
                title="Привязка Telegram"
                description="Откройте бота — он привяжет ваш профиль автоматически."
                size="md"
            >
                <div className="space-y-6">
                    <div>
                        <p className="text-sm text-slate-600 mb-3">Шаг 1. Откройте бота:</p>
                        <a
                            href={tgLinkModal?.deep_link || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 w-full justify-center bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-xl transition-colors"
                        >
                            <Send size={18} />
                            Открыть @garden_pvl_bot
                        </a>
                    </div>
                    <div>
                        <p className="text-sm text-slate-600 mb-3">
                            Шаг 2. Если бот не открылся автоматически — отправьте боту командой:
                        </p>
                        <div className="bg-slate-100 px-3 py-2 rounded font-mono text-sm text-slate-800 mb-3 select-all">
                            /start {tgLinkModal?.code || 'КОД'}
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-mono text-lg text-slate-800 tracking-wider text-center">
                                {tgLinkModal?.code || ''}
                            </div>
                            <button
                                type="button"
                                onClick={handleCopyTgCode}
                                aria-label="Скопировать код"
                                className="p-3 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-xl text-slate-600 transition-colors"
                            >
                                {tgCodeCopied ? <CheckCircle2 size={18} className="text-emerald-600" /> : <Copy size={18} />}
                            </button>
                        </div>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                        Код активен 15 минут. Когда бот привяжет ваш профиль — здесь появится подтверждение, а у бота — приветственное сообщение.
                    </p>
                </div>
            </ModalShell>

            <ConfirmationModal
                isOpen={tgUnlinkConfirm}
                onClose={() => setTgUnlinkConfirm(false)}
                onConfirm={handleUnlinkTelegram}
                title="Отвязать Telegram?"
                message="Уведомления о ДЗ перестанут приходить в Telegram. Привязать обратно можно в любой момент."
                confirmText="Отвязать"
                confirmVariant="secondary"
            />
        </div>
    );
};

export default ProfileView;
