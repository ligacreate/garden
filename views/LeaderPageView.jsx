import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, ExternalLink, Image, Sparkles } from 'lucide-react';
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
    if (Array.isArray(raw)) {
        return raw
            .filter((item) => item && typeof item === 'object')
            .map((item, index) => {
                const fallbackId = `${Date.now()}-${index}`;
                return {
                    id: item.id ?? fallbackId,
                    text: String(item.text || ''),
                    author: String(item.author || 'Без имени'),
                    color: item.color || REVIEW_COLORS[0].value,
                    breakfastDate: item.breakfastDate || '',
                    breakfastTopic: item.breakfastTopic || ''
                };
            });
    }
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return normalizeReviews(parsed);
        } catch {
            return [];
        }
    }
    return [];
};

const escapeHtml = (value) => String(value || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const formatReviewDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('ru-RU');
};

const openReviewCard = (review) => {
    const color = review.color || '#ffffff';
    const text = review.text || '';
    const author = review.author || 'Без имени';
    const breakfastTopic = String(review.breakfastTopic || '').trim();
    const breakfastDate = formatReviewDate(review.breakfastDate);
    const hasMeta = Boolean(breakfastDate || breakfastTopic);
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
  .meta{display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,0.55);border:1px solid rgba(255,255,255,0.9);}
  .meta-row{font-size:13px;color:#3e3e3e;}
  .meta-label{font-weight:600;color:#606060;}
  .author{margin-top:auto;font-weight:600;color:#2b2b2b;}
  .badge{align-self:flex-start;padding:6px 10px;border-radius:999px;background:#eef4ef;color:#3a6d57;font-size:11px;font-weight:700;letter-spacing:0.08em;}
</style>
</head>
<body>
  <div class="card">
    <span class="badge">ОТЗЫВ</span>
    <div class="text">${escapeHtml(text)}</div>
    ${hasMeta ? `<div class="meta">
      ${breakfastDate ? `<div class="meta-row"><span class="meta-label">Дата завтрака:</span> ${escapeHtml(breakfastDate)}</div>` : ''}
      ${breakfastTopic ? `<div class="meta-row"><span class="meta-label">Тема завтрака:</span> ${escapeHtml(breakfastTopic)}</div>` : ''}
    </div>` : ''}
    <div class="author">${escapeHtml(author)}</div>
  </div>
</body>
</html>`);
    win.document.close();
};

const safeFilePart = (value) =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-zа-я0-9-_]+/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48) || 'review';

const buildReviewCardNode = (review) => {
    const card = document.createElement('div');
    card.style.width = '1080px';
    card.style.minHeight = '1080px';
    card.style.padding = '72px';
    card.style.borderRadius = '48px';
    card.style.background = review.color || '#ffffff';
    card.style.boxShadow = '0 24px 60px rgba(28, 28, 28, 0.12)';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '24px';
    card.style.fontFamily = 'Onest, Arial, sans-serif';

    const badge = document.createElement('span');
    badge.textContent = 'ОТЗЫВ';
    badge.style.alignSelf = 'flex-start';
    badge.style.padding = '10px 16px';
    badge.style.borderRadius = '999px';
    badge.style.background = '#eef4ef';
    badge.style.color = '#3a6d57';
    badge.style.fontSize = '20px';
    badge.style.fontWeight = '700';
    badge.style.letterSpacing = '0.08em';

    const text = document.createElement('div');
    text.textContent = review.text || '';
    text.style.whiteSpace = 'pre-wrap';
    text.style.fontSize = '40px';
    text.style.lineHeight = '1.45';
    text.style.color = '#1f1f1f';

    const author = document.createElement('div');
    author.textContent = review.author || 'Без имени';
    author.style.marginTop = 'auto';
    author.style.fontWeight = '600';
    author.style.fontSize = '28px';
    author.style.color = '#2b2b2b';

    const breakfastDate = formatReviewDate(review.breakfastDate);
    const breakfastTopic = String(review.breakfastTopic || '').trim();
    let meta = null;
    if (breakfastDate || breakfastTopic) {
        meta = document.createElement('div');
        meta.style.display = 'flex';
        meta.style.flexDirection = 'column';
        meta.style.gap = '8px';
        meta.style.padding = '16px 20px';
        meta.style.borderRadius = '20px';
        meta.style.background = 'rgba(255, 255, 255, 0.55)';
        meta.style.border = '1px solid rgba(255, 255, 255, 0.9)';

        if (breakfastDate) {
            const dateRow = document.createElement('div');
            dateRow.textContent = `Дата завтрака: ${breakfastDate}`;
            dateRow.style.fontSize = '22px';
            dateRow.style.color = '#3e3e3e';
            meta.appendChild(dateRow);
        }
        if (breakfastTopic) {
            const topicRow = document.createElement('div');
            topicRow.textContent = `Тема завтрака: ${breakfastTopic}`;
            topicRow.style.fontSize = '22px';
            topicRow.style.color = '#3e3e3e';
            meta.appendChild(topicRow);
        }
    }

    if (meta) {
        card.append(badge, text, meta, author);
    } else {
        card.append(badge, text, author);
    }
    return card;
};

const LeaderPageView = ({ leader, currentUser, onBack, onUpdateProfile }) => {
    const [loadingStats, setLoadingStats] = useState(false);
    const [practices, setPractices] = useState([]);
    const [scenarios, setScenarios] = useState([]);

    const isOwner = currentUser?.id && leader?.id && currentUser.id === leader.id;

    const [reviews, setReviews] = useState(() => normalizeReviews(leader?.leader_reviews));
    const [reviewDraft, setReviewDraft] = useState({
        text: '',
        author: '',
        color: REVIEW_COLORS[0].value,
        breakfastDate: '',
        breakfastTopic: ''
    });
    const [editingReviewId, setEditingReviewId] = useState(null);

    useEffect(() => {
        setReviews(normalizeReviews(leader?.leader_reviews));
        setReviewDraft({
            text: '',
            author: '',
            color: REVIEW_COLORS[0].value,
            breakfastDate: '',
            breakfastTopic: ''
        });
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

    const handleSaveReviews = async (nextReviews = reviews) => {
        if (!isOwner) return;
        const updated = {
            ...leader,
            leader_reviews: nextReviews
        };
        await onUpdateProfile(updated);
    };

    const handleEditReview = (review) => {
        setEditingReviewId(review.id);
        setReviewDraft({
            text: review.text || '',
            author: review.author || '',
            color: review.color || REVIEW_COLORS[0].value,
            breakfastDate: review.breakfastDate || '',
            breakfastTopic: review.breakfastTopic || ''
        });
    };

    const handleSaveReview = () => {
        if (!reviewDraft.text.trim()) return;
        let nextReviews;
        if (editingReviewId) {
            nextReviews = reviews.map((r) => r.id === editingReviewId ? { ...r, ...reviewDraft } : r);
        } else {
            const next = {
                id: Date.now(),
                text: reviewDraft.text.trim(),
                author: reviewDraft.author.trim() || 'Без имени',
                color: reviewDraft.color,
                breakfastDate: reviewDraft.breakfastDate || '',
                breakfastTopic: reviewDraft.breakfastTopic.trim()
            };
            nextReviews = [next, ...reviews];
        }
        setReviews(nextReviews);
        setReviewDraft({
            text: '',
            author: '',
            color: REVIEW_COLORS[0].value,
            breakfastDate: '',
            breakfastTopic: ''
        });
        setEditingReviewId(null);
        handleSaveReviews(nextReviews);
    };

    const handleDeleteReview = (id) => {
        const nextReviews = reviews.filter((r) => r.id !== id);
        setReviews(nextReviews);
        if (editingReviewId === id) {
            setEditingReviewId(null);
            setReviewDraft({
                text: '',
                author: '',
                color: REVIEW_COLORS[0].value,
                breakfastDate: '',
                breakfastTopic: ''
            });
        }
        handleSaveReviews(nextReviews);
    };

    const handleDownloadReviewCard = async (review) => {
        let host = null;
        try {
            const { default: html2canvas } = await import('html2canvas');
            host = document.createElement('div');
            host.style.position = 'fixed';
            host.style.left = '-10000px';
            host.style.top = '0';
            host.style.padding = '40px';
            host.style.background = '#f7f6f3';
            host.style.zIndex = '-1';

            const cardNode = buildReviewCardNode(review);
            host.appendChild(cardNode);
            document.body.appendChild(host);

            const canvas = await html2canvas(cardNode, {
                backgroundColor: review.color || '#ffffff',
                scale: 2,
                useCORS: true
            });

            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            link.download = `otzyv-${safeFilePart(review.author)}-${safeFilePart(review.id)}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            onNotify?.('Карточка отзыва скачана');
        } catch (e) {
            console.error('Review card download failed', e);
            onNotify?.('Не удалось скачать карточку. Попробуйте снова.');
        } finally {
            if (host && document.body.contains(host)) document.body.removeChild(host);
        }
    };

    return (
        <div className="min-h-full pb-20 pt-6 px-4 lg:px-0 font-sans text-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition">
                    <ArrowLeft size={18} />
                    <span className="text-sm font-medium">Назад в Сад</span>
                </button>
                {/* Top action removed: reviews save handled in form */}
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
                                            {(review.breakfastDate || review.breakfastTopic) && (
                                                <div className="mt-3 rounded-xl border border-white/70 bg-white/55 px-3 py-2 text-xs text-slate-600 space-y-1">
                                                    {review.breakfastDate && (
                                                        <div>
                                                            <span className="font-semibold">Дата завтрака:</span> {formatReviewDate(review.breakfastDate)}
                                                        </div>
                                                    )}
                                                    {review.breakfastTopic && (
                                                        <div>
                                                            <span className="font-semibold">Тема завтрака:</span> {review.breakfastTopic}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            <div className="mt-3 text-xs font-semibold text-slate-700">{review.author}</div>
                                            <div className="mt-4 flex flex-wrap gap-2">
                                                <button
                                                    className="text-xs px-2 py-1 rounded-lg bg-white/70 border border-white/80 inline-flex items-center gap-1"
                                                    onClick={() => handleDownloadReviewCard(review)}
                                                >
                                                    <Download size={12} />
                                                    Скачать карточку
                                                </button>
                                                {isOwner && (
                                                    <>
                                                    <button className="text-xs px-2 py-1 rounded-lg bg-white/70 border border-white/80" onClick={() => handleEditReview(review)}>Редактировать</button>
                                                    <button className="text-xs px-2 py-1 rounded-lg bg-white/70 border border-white/80" onClick={() => openReviewCard(review)}>
                                                        Открыть карточку
                                                    </button>
                                                    <button className="text-xs px-2 py-1 rounded-lg bg-white/70 border border-white/80" onClick={() => handleDeleteReview(review.id)}>
                                                        Удалить
                                                    </button>
                                                    </>
                                                )}
                                            </div>
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
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Дата завтрака (опционально)</label>
                                        <input
                                            type="date"
                                            className="w-full mt-2 bg-white border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-emerald-400"
                                            value={reviewDraft.breakfastDate}
                                            onChange={(e) => setReviewDraft({ ...reviewDraft, breakfastDate: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Тема завтрака (опционально)</label>
                                        <input
                                            className="w-full mt-2 bg-white border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-emerald-400"
                                            value={reviewDraft.breakfastTopic}
                                            onChange={(e) => setReviewDraft({ ...reviewDraft, breakfastTopic: e.target.value })}
                                            placeholder="Например: Ресурс и устойчивость"
                                        />
                                    </div>
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
                                                setReviewDraft({
                                                    text: '',
                                                    author: '',
                                                    color: REVIEW_COLORS[0].value,
                                                    breakfastDate: '',
                                                    breakfastTopic: ''
                                                });
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
                                    {(reviewDraft.breakfastDate || reviewDraft.breakfastTopic) && (
                                        <div className="mt-3 rounded-xl border border-white/70 bg-white/55 px-3 py-2 text-xs text-slate-600 space-y-1">
                                            {reviewDraft.breakfastDate && (
                                                <div>
                                                    <span className="font-semibold">Дата завтрака:</span> {formatReviewDate(reviewDraft.breakfastDate)}
                                                </div>
                                            )}
                                            {reviewDraft.breakfastTopic && (
                                                <div>
                                                    <span className="font-semibold">Тема завтрака:</span> {reviewDraft.breakfastTopic}
                                                </div>
                                            )}
                                        </div>
                                    )}
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
