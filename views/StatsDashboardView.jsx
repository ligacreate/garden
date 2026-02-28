import React from 'react';
import { Users, Coins, BookOpen, TrendingUp, Star, Zap, MessageSquare, Target, ArrowRight, Bell, PartyPopper } from 'lucide-react';
import DOMPurify from 'dompurify';
import { getDruidTree } from '../utils/druidHoroscope';
import { getTenureParts } from '../utils/tenure';
import UserAvatar from '../components/UserAvatar';

const StatsDashboardView = ({ user, meetings = [], knowledgeBase = [], clients = [], practices = [], scenarios = [], goals = [], onNavigate, onOpenLeaderPage, newsItems = [] }) => {
    const decodeEntities = (value) => {
        let current = String(value || '');
        for (let i = 0; i < 2; i += 1) {
            const textarea = document.createElement('textarea');
            textarea.innerHTML = current;
            const next = textarea.value;
            if (next === current) break;
            current = next;
        }
        return current;
    };

    const formatNewsBody = (value) => {
        const raw = decodeEntities(value);
        const hasHtmlTags = /<\/?[a-z][\s\S]*>/i.test(raw);

        if (hasHtmlTags) return DOMPurify.sanitize(raw);

        const plain = DOMPurify.sanitize(raw, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
        return plain.replace(/\n/g, '<br />');
    };

    // Calculate Stats
    const totalMeetings = meetings.length;
    const totalEarnings = meetings.reduce((acc, m) => acc + (parseInt(m.income) || 0), 0);
    const totalGuests = meetings.reduce((acc, m) => acc + (parseInt(m.guests) || 0), 0);
    const totalReflections = meetings.filter(m => m.keep || m.change).length;
    const totalClients = clients.length;
    const totalPractices = practices ? practices.length : 0;
    const totalScenarios = scenarios ? scenarios.length : 0;

    // Tree Logic
    const seeds = user.seeds || 0;
    const druidTree = getDruidTree(user.dob);

    const getTreeStage = (s) => {
        if (s < 150) return { name: 'Семечко', next: 150, image: '/trees/tree-1.png' };
        if (s < 500) return { name: 'Росток', next: 500, image: '/trees/tree-2.png' };
        if (s < 1500) return { name: 'Саженец', next: 1500, image: '/trees/tree-3.png' };
        if (s < 3500) return { name: 'Молодое дерево', next: 3500, image: '/trees/tree-4.png' };
        if (s < 7000) return { name: 'Крепкое дерево', next: 7000, image: '/trees/tree-5.png' };
        if (s < 12000) return { name: 'Раскидистое дерево', next: 12000, image: '/trees/tree-6.png' };
        return { name: 'Плодоносящее дерево', next: 100000, image: '/trees/tree-7.png' };
    };
    const stage = getTreeStage(seeds);

    // Tenure Logic
    const tenure = getTenureParts(user.join_date);

    // Airy Stat Card
    const AiryCard = ({ icon: Icon, label, value, onClick, delay = 0 }) => (
        <div
            onClick={onClick}
            className={`surface-muted p-6 hover:shadow-[0_18px_40px_-24px_rgba(27,35,28,0.4)] hover:-translate-y-1 transition-all duration-500 cursor-pointer flex flex-col items-center justify-center text-center gap-3 group animate-in fade-in slide-in-from-bottom-4 fill-mode-both`}
            style={{ animationDelay: `${delay}ms` }}
        >
            <div className="text-slate-400 group-hover:text-blue-600 transition-colors duration-500">
                <Icon size={24} strokeWidth={1.5} />
            </div>
            <div>
                <div className="text-3xl font-display font-semibold text-slate-900 mb-1 tracking-tight group-hover:scale-105 transition-transform duration-500">{value}</div>
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.3em]">{label}</div>
            </div>
        </div>
    );

    return (
        <div className="min-h-full pb-20 pt-6 px-4 lg:px-0 font-sans text-slate-700">
            {/* Ambient Background */}
            {/* Ambient Background removed - now global in UserApp */}

            {/* Header */}
                <div className="flex justify-between items-end mb-8 animate-in fade-in duration-700">
                    <div>
                        <h1 className="text-4xl font-display font-semibold text-slate-900 tracking-tight">Мой сад</h1>
                        {/* <p className="text-slate-400 mt-1 font-light">Пространство роста</p> */}
                    </div>
                </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* 1. HERO: TREE CARD (Sky Aesthetic) */}
                <div className="lg:col-span-2 relative min-h-[320px] h-auto rounded-[2.5rem] overflow-hidden shadow-[0_20px_50px_-12px_rgba(47,111,84,0.35)] group animate-in zoom-in-95 duration-700 flex flex-col md:block">
                    {/* Meadow Gradient Background */}
                    <div className="absolute inset-0 bg-gradient-to-b from-[#6da88a] via-[#3f8b6b] to-[#2f6f54] transition-transform duration-[10s] group-hover:scale-110" />

                    {/* Clouds / Texture Overlay */}
                    <div className="absolute inset-0 opacity-30 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] mix-blend-overlay" />

                    {/* Content */}
                    <div className="relative z-10 flex flex-col md:flex-row items-stretch h-full p-6 md:p-0">
                        {/* Left Side: Info */}
                        <div className="w-full md:w-1/3 md:p-8 flex flex-col justify-between text-white relative z-20 gap-6 md:gap-0">
                            <div className="pt-2 md:pt-4">
                                <h2 className="text-3xl md:text-4xl font-display font-semibold tracking-tight leading-none mb-3">{user.name.split(' ')[0]}</h2>
                                <p className="text-base md:text-lg font-medium opacity-90 text-blue-50 leading-snug">
                                    Ваше дерево сейчас<span className="whitespace-nowrap">&nbsp;—</span> <br className="md:hidden" /> <span className="lowercase">{stage.name}</span>
                                </p>
                            </div>

                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-widest opacity-60 block mb-2">Собрано семян</span>
                                <div className="flex items-baseline gap-2">
                                <span className="text-5xl md:text-6xl font-extralight tracking-tighter leading-none">{seeds}</span>
                            </div>
                        </div>
                        </div>

                        {/* Right Side: Tree Image (Dominant) */}
                        <div className="flex-1 relative flex items-center justify-center md:justify-end md:p-8 md:pr-16 mt-4 md:mt-0">
                            {/* Circular Mask */}
                            <div className="relative w-48 h-48 md:w-64 md:h-64 rounded-full overflow-hidden border-4 border-white/20 shadow-2xl shrink-0">
                                <img
                                    src={stage.image}
                                    alt={stage.name}
                                    className="w-full h-full object-cover transform hover:scale-110 transition-transform duration-700"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. GOALS (Airy List) */}
                <div
                    onClick={() => onNavigate('mastery')}
                    className="surface-muted p-8 hover:shadow-lg transition-all cursor-pointer flex flex-col animate-in slide-in-from-right-8 duration-700"
                >
                    <div className="flex justify-between items-center mb-8">
                        <div className="flex items-center gap-3 text-slate-700">
                            <Target size={20} strokeWidth={1.5} />
                            <h3 className="text-lg font-display font-semibold">Главные цели</h3>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400 shadow-sm">
                            <ArrowRight size={14} />
                        </div>
                    </div>

                    <div className="flex-1 space-y-4">
                        {goals && goals.filter(g => !g.completed).slice(0, 3).map((goal, i) => (
                            <div key={goal.id} className="group flex items-start gap-4">
                                <div className={`mt-2 w-1.5 h-1.5 rounded-full shrink-0 transition-colors duration-300 ${i === 0 ? 'bg-blue-400' : 'bg-slate-300 group-hover:bg-blue-300'}`} />
                                <div>
                                    <p className="text-sm font-medium text-slate-700 leading-snug group-hover:text-blue-600 transition-colors">
                                        {goal.title}
                                    </p>
                                    <p className="text-[10px] text-slate-400 mt-1 truncate max-w-[180px]">
                                        {goal.related_tags?.[0] || 'В процессе'}
                                    </p>
                                </div>
                            </div>
                        ))}
                        {(!goals || goals.filter(g => !g.completed).length === 0) && (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm opacity-60">
                                <span>Пока тишина...</span>
                            </div>
                        )}
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-100/50 flex justify-between items-center text-xs text-slate-400">
                        <span>Активных: {goals ? goals.filter(g => !g.completed).length : 0}</span>
                    </div>
                </div>
            </div>

            {/* 3. METRICS GRID (Airy Cards) */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mt-6">
                <AiryCard
                    icon={Coins}
                    label="Общий доход"
                    value={totalEarnings.toLocaleString() + ' ₽'}
                    onClick={() => onNavigate('meetings')}
                    delay={50}
                />
                <AiryCard
                    icon={Zap}
                    label="Встречи"
                    value={totalMeetings}
                    onClick={() => onNavigate('meetings')}
                    delay={100}
                />
                <AiryCard
                    icon={Users}
                    label="Гости"
                    value={totalGuests}
                    onClick={() => onNavigate('meetings')}
                    delay={200}
                />
                <AiryCard
                    icon={Star}
                    label="Клиенты"
                    value={totalClients}
                    onClick={() => onNavigate('crm')}
                    delay={300}
                />
                <AiryCard
                    icon={MessageSquare}
                    label="Инсайты"
                    value={totalReflections}
                    onClick={() => onNavigate('mastery')}
                    delay={400}
                />
            </div>

            {/* 4. BOTTOM TILES (Smaller) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4 opacity-90">
                <div onClick={() => onNavigate('practices')} className="bg-white/60 hover:bg-white/90 transition-colors rounded-3xl p-5 flex items-center gap-3 cursor-pointer border border-white/60">
                    <BookOpen size={18} className="text-slate-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Практики ({totalPractices})</span>
                </div>
                <div onClick={() => onNavigate('builder')} className="bg-white/60 hover:bg-white/90 transition-colors rounded-3xl p-5 flex items-center gap-3 cursor-pointer border border-white/60">
                    <Zap size={18} className="text-slate-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Сценарии ({totalScenarios})</span>
                </div>
                <div onClick={() => onOpenLeaderPage && onOpenLeaderPage()} className="bg-white/60 hover:bg-white/90 transition-colors rounded-3xl p-5 flex items-center gap-3 cursor-pointer border border-white/60 col-span-2 sm:col-span-1">
                    <TrendingUp size={18} className="text-slate-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Моя страница ведущей</span>
                </div>
            </div>

            <div className="mt-6 surface-muted p-6 rounded-3xl border border-white/70 shadow-[0_12px_30px_-24px_rgba(27,35,28,0.45)]">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-slate-700">
                        <Bell size={18} strokeWidth={1.6} />
                        <h3 className="text-sm font-display font-semibold uppercase tracking-widest text-slate-600">Новости</h3>
                    </div>
                    <div className="text-xs text-slate-400">Всего: {newsItems.length}</div>
                </div>

                {newsItems.length > 0 ? (
                    <div className="space-y-3">
                        {newsItems.slice(0, 4).map(item => (
                            <div key={item.id} className="flex items-start gap-3">
                                {item.type === 'birthday' && item.user ? (
                                    <div className="shrink-0">
                                        <UserAvatar user={item.user} size="md" />
                                    </div>
                                ) : (
                                    <div className={`mt-1 w-2.5 h-2.5 rounded-full ${item.type === 'birthday' ? 'bg-rose-400' : 'bg-blue-400'}`} />
                                )}
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                                        <span>{item.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</span>
                                        {item.type === 'birthday' && (
                                            <span className="inline-flex items-center gap-1 text-rose-500">
                                                <PartyPopper size={12} />
                                                Поздравление
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-sm font-medium text-slate-700">{item.title}</div>
                                    {item.body && (
                                        <div
                                            className="text-xs text-slate-500 mt-1 whitespace-pre-wrap [&_a]:text-blue-700 [&_a]:underline [&_a]:break-all [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_li]:my-1"
                                            dangerouslySetInnerHTML={{ __html: formatNewsBody(item.body) }}
                                        />
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-sm text-slate-400">Пока новостей нет. Но скоро здесь будет интересно!</div>
                )}
            </div>

        </div>
    );
};

export default StatsDashboardView;
