import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink, Image, Sparkles } from 'lucide-react';
import Button from '../components/Button';
import Card from '../components/Card';
import UserAvatar from '../components/UserAvatar';
import { getRoleLabel } from '../utils/roles';
import { normalizeSkills } from '../utils/skills';
import { api } from '../services/dataService';

const REVIEW_COLORS = [
    { key: 'milk', label: 'Молочный', value: '#ffffff' },
    { key: 'sand', label: 'Песок', value: '#fff9f2' },
    { key: 'beige', label: 'Беж', value: '#f7f6f3' },
    { key: 'mint', label: 'Мята', value: '#f8fffb' },
    { key: 'mist', label: 'Туман', value: '#f3f6f4' },
    { key: 'powder', label: 'Пудра', value: '#f6f2ed' },
];

const normalizeReviews = (raw) => {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
};

const openReviewCard = (review) => {
    const color = review.color || '#ffffff';
    const text = review.text || '';
    const author = review.author || 'Без имени';
    const win = window.open('', '_blank', 'width=740,height=740');
    if (!win) return;
    win.document.write(`<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Карточка отзыва</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f7f6f3;font-family:Onest,Arial,sans-serif;}
  .card{width:560px;min-height:420px;padding:36px;border-radius:24px;background:${color};box-shadow:0 24px 60px rgba(28,28,28,0.12);display:flex;flex-direction:column;gap:18px;}
  .title{font-size:12px;letter-spacing:0.28em;text-transform:uppercase;color:#7a7a7a;font-weight:600;}
  .text{font-size:20px;line-height:1.5;color:#1f1f1f;}
  .author{margin-top:auto;font-weight:600;color:#2b2b2b;}
  .badge{align-self:flex-start;padding:6px 10px;border-radius:999px;background:#eef4ef;color:#3a6d57;font-size:11px;font-weight:700;letter-spacing:0.08em;}
</style>
</head>
<body>
  <div class="card">
    <span class="badge">ОТЗЫВ</span>
    <div class="text">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    <div class="author">${author.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
  </div>
</body>
</html>`);
    win.document.close();
};

const LeaderPageView = ({ leader, currentUser, onBack, onUpdateProfile }) => {
    const [loadingStats, setLoadingStats] = useState(false);
    const [practices, setPractices] = useState([]);
    const [scenarios, setScenarios] = useState([]);

    const isOwner = currentUser?.id && leader?.id && currentUser.id === leader.id;

    const [reviews, setReviews] = useState(() => normalizeReviews(leader?.leader_reviews));
    const [reviewDraft, setReviewDraft] = useState({ text: '', author: '', color: REVIEW_COLORS[0].value });
    const [editingReviewId, setEditingReviewId] = useState(null);

    useEffect(() => {
        setReviews(normalizeReviews(leader?.leader_reviews));
        setReviewDraft({ text: '', author: '', color: REVIEW_COLORS[0].value });
        setEditingReviewId(null);
    }, [leader?.id]);

    useEffect(() => {
        if (!leader?.id) return;
        let isMounted = true;
        setLoadingStats(true);
        Promise.all([
            api.getPractices(leader.id),
            api.getScenarios(leader.id)
        ])
            .then(([practicesData, scenariosData]) => {
                if (!isMounted) return;
                setPractices(practicesData || []);
                setScenarios(scenariosData || []);
            })
            .catch((e) => {
                console.warn('Leader stats fetch failed', e);
            })
            .finally(() => {
                if (isMounted) setLoadingStats(false);
            });

        return () => { isMounted = false; };
    }, [leader?.id]);

    const publicScenarios = useMemo(() => {
        return (scenarios || []).filter((s) => s.is_public);
    }, [scenarios]);

    const skills = useMemo(() => normalizeSkills(leader?.skills), [leader?.skills]);
    const signatureText = leader?.leader_signature || '';
    const telegramLink = leader?.telegram || leader?.telegram_link || '';

    if (!leader) {
        return (
            <div className="min-h-screen flex items-center justify-center text-slate-400">Лидер не найден</div>
        );
    }

    const handleSaveReviews = async () => {
        if (!isOwner) return;
        const updated = {
            ...leader,
            leader_reviews: reviews
        };
        await onUpdateProfile(updated);
    };

    const handleEditReview = (review) => {
        setEditingReviewId(review.id);
        setReviewDraft({
            text: review.text || '',
            author: review.author || '',
            color: review.color || REVIEW_COLORS[0].value
        });
    };

    const handleSaveReview = () => {
        if (!reviewDraft.text.trim()) return;
        if (editingReviewId) {
            setReviews(reviews.map((r) => r.id === editingReviewId ? { ...r, ...reviewDraft } : r));
        } else {
            const next = {
                id: Date.now(),
                text: reviewDraft.text.trim(),
                author: reviewDraft.author.trim() || 'Без имени',
                color: reviewDraft.color
            };
            setReviews([next, ...reviews]);
        }
        setReviewDraft({ text: '', author: '', color: REVIEW_COLORS[0].value });
        setEditingReviewId(null);
    };

    const handleDeleteReview = (id) => {
        setReviews(reviews.filter((r) => r.id !== id));
        if (editingReviewId === id) {
            setEditingReviewId(null);
            setReviewDraft({ text: '', author: '', color: REVIEW_COLORS[0].value });
        }
    };

    return (
        <div className="min-h-full pb-20 pt-6 px-4 lg:px-0 font-sans text-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition">
                    <ArrowLeft size={18} />
                    <span className="text-sm font-medium">Назад в Сад</span>
                </button>
                {isOwner && (
                    <div className="flex items-center gap-2">
                        <Button
                            onClick={handleSaveReviews}
                            className="!rounded-xl !px-4"
                        >
                            Сохранить отзывы
                        </Button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8">
                    <div className="bg-white/90 backdrop-blur-xl rounded-[2.5rem] shadow-[0_20px_60px_-24px_rgba(45,70,56,0.35)] border border-white/60 p-8 relative overflow-hidden">
                        <div className="absolute -right-20 -top-20 w-56 h-56 bg-gradient-to-br from-emerald-100 via-emerald-50 to-transparent rounded-full opacity-70" />
                        <div className="relative z-10 flex flex-col md:flex-row gap-6 items-start">
                            <UserAvatar user={leader} size="xl" className="w-28 h-28 md:w-32 md:h-32 rounded-3xl shadow-lg" />
                            <div className="flex-1">
                                <div className="flex flex-wrap items-center gap-3 mb-2">
                                    <h1 className="text-3xl md:text-4xl font-display font-semibold text-slate-900 tracking-tight">{leader.name}</h1>
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] leading-none text-emerald-700">
                                        {getRoleLabel(leader.role)}
                                    </span>
                                </div>
                                <div className="text-sm text-slate-500 flex items-center gap-2">
                                    {leader.city || 'Город не указан'}
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {skills.length > 0 ? skills.map((tag) => (
                                        <span key={tag} className="px-3 py-1.5 rounded-xl bg-emerald-50/60 border border-emerald-100 text-emerald-800 text-xs font-semibold">
                                            {tag}
                                        </span>
                                    )) : (
                                        <span className="text-xs text-slate-400">Компетенции не указаны</span>
                                    )}
                                </div>
                                <div className="mt-5 grid gap-3">
                                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Чем могу быть полезна</div>
                                        <p className="text-sm text-slate-700 leading-relaxed">{leader.offer || 'Пока без описания.'}</p>
                                    </div>
                                    <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-2xl p-4">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-1 flex items-center gap-1">
                                            <Sparkles size={12} /> Суперсила
                                        </div>
                                        <p className="text-sm text-slate-700 leading-relaxed">{leader.unique_abilities || '—'}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col gap-3 min-w-[160px] self-start md:items-end">
                                {telegramLink ? (
                                    <Button className="!rounded-xl" onClick={() => window.open(telegramLink, '_blank')}>
                                        Написать ведущей
                                    </Button>
                                ) : (
                                    <Button className="!rounded-xl opacity-50 pointer-events-none">
                                        Написать ведущей
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 grid gap-6">
                        <Card title="Что я хочу, чтобы вы про меня знали" className="!rounded-[2rem]">
                            <div className="text-lg font-display text-slate-800 leading-relaxed">
                                {signatureText || 'Пока нет описания.'}
                            </div>
                        </Card>

                        <Card title="Вклад" className="!rounded-[2rem]">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {[
                                    { label: 'Практик собрано', value: practices.length },
                                    { label: 'Сценариев создано', value: scenarios.length },
                                    { label: 'В Сценариях Лиги', value: publicScenarios.length }
                                ].map((stat) => (
                                    <div key={stat.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{stat.label}</div>
                                        <div className="text-3xl font-semibold text-slate-900 mt-2">
                                            {loadingStats ? '—' : stat.value}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        <Card title="Сценарии Лиги" className="!rounded-[2rem]">
                            {publicScenarios.length === 0 ? (
                                <div className="text-sm text-slate-400">Пока нет опубликованных сценариев.</div>
                            ) : (
                                <div className="grid gap-2">
                                    {publicScenarios.slice(0, 4).map((scenario) => (
                                        <div key={scenario.id} className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                                            <span className="text-sm text-slate-700">{scenario.title}</span>
                                            <ExternalLink size={14} className="text-slate-300" />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>

                        <Card title="Отзывы" className="!rounded-[2rem]">
                            {reviews.length === 0 ? (
                                <div className="text-sm text-slate-400">Пока нет отзывов.</div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {reviews.map((review) => (
                                        <div
                                            key={review.id}
                                            className="rounded-2xl p-5 border border-slate-100 shadow-sm"
                                            style={{ background: review.color || '#fff' }}
                                        >
                                            <div className="text-sm text-slate-800 leading-relaxed">{review.text}</div>
                                            <div className="mt-3 text-xs font-semibold text-slate-700">{review.author}</div>
                                            {isOwner && (
                                                <div className="mt-4 flex flex-wrap gap-2">
                                                    <button className="text-xs px-2 py-1 rounded-lg bg-white/70 border border-white/80" onClick={() => handleEditReview(review)}>Редактировать</button>
                                                    <button className="text-xs px-2 py-1 rounded-lg bg-white/70 border border-white/80" onClick={() => openReviewCard(review)}>
                                                        Открыть карточку
                                                    </button>
                                                    <button className="text-xs px-2 py-1 rounded-lg bg-white/70 border border-white/80" onClick={() => handleDeleteReview(review.id)}>
                                                        Удалить
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-6">
                    {isOwner && (
                        <Card title="Новый отзыв" className="!rounded-[2rem]">
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Текст отзыва</label>
                                    <textarea
                                        className="w-full mt-2 bg-white border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-emerald-400"
                                        value={reviewDraft.text}
                                        onChange={(e) => setReviewDraft({ ...reviewDraft, text: e.target.value })}
                                        rows={4}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Имя участницы</label>
                                    <input
                                        className="w-full mt-2 bg-white border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-emerald-400"
                                        value={reviewDraft.author}
                                        onChange={(e) => setReviewDraft({ ...reviewDraft, author: e.target.value })}
                                        placeholder="Например: Анна К."
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Цвет карточки</label>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {REVIEW_COLORS.map((color) => (
                                            <button
                                                key={color.key}
                                                className={`w-10 h-10 rounded-xl border-2 transition ${reviewDraft.color === color.value ? 'border-slate-700' : 'border-transparent'}`}
                                                style={{ background: color.value }}
                                                onClick={() => setReviewDraft({ ...reviewDraft, color: color.value })}
                                                type="button"
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button className="!rounded-xl" onClick={handleSaveReview}>Сохранить отзыв</Button>
                                    {editingReviewId && (
                                        <Button
                                            variant="secondary"
                                            className="!rounded-xl"
                                            onClick={() => {
                                                setEditingReviewId(null);
                                                setReviewDraft({ text: '', author: '', color: REVIEW_COLORS[0].value });
                                            }}
                                        >
                                            Сбросить
                                        </Button>
                                    )}
                                </div>
                                <div className="rounded-2xl border border-slate-100 p-4" style={{ background: reviewDraft.color }}>
                                    <div className="text-sm text-slate-800 leading-relaxed">
                                        {reviewDraft.text || 'Превью отзыва...'}
                                    </div>
                                    <div className="mt-3 text-xs font-semibold text-slate-700">
                                        {reviewDraft.author || 'Имя участницы'}
                                    </div>
                                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                                        <Image size={14} />
                                        <span>Карточку удобно скринить или открыть отдельно</span>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LeaderPageView;
