import React, { useState, useEffect } from 'react';
import { Plus, X, Calendar as CalendarIcon, Users, Clock, MessageSquare, AlertCircle, CheckCircle, BarChart2, Target, Trophy, ChevronDown, Trash2, Lock } from 'lucide-react';
import Button from '../components/Button';
import Input from '../components/Input';
import MeetingCard from '../components/MeetingCard';
import ConfirmationModal from '../components/ConfirmationModal';
import { api } from '../services/dataService';

// --- Sub-Components ---

// 1. Calendar Widget
// 1. Calendar Widget
const CalendarWidget = ({ meetings, onPlanClick, currentDate, setCurrentDate, showPlanButton = true }) => {
    // Lifted state: currentDate is now passed as prop

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 is Sunday
    // Adjust for Monday start (Russian locale usually starts Monday)
    const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

    const prevMonth = () => {
        setCurrentDate(new Date(year, month - 1, 1));
    };

    const nextMonth = () => {
        setCurrentDate(new Date(year, month + 1, 1));
    };

    const monthName = currentDate.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });

    // Helper to get status color for a date
    const getDayStatusColor = (day) => {
        const checkDateStr = new Date(year, month, day).toDateString();
        const dayMeetings = meetings.filter(m => new Date(m.date).toDateString() === checkDateStr);

        if (dayMeetings.length === 0) return null;

        // Priority: Pending (Red) > Planned (Blue) > Completed (Green)
        const hasPending = dayMeetings.some(m => {
            const isPast = new Date(m.date) < new Date().setHours(0, 0, 0, 0);
            return (m.status === 'planned' && isPast) || m.status === 'pending';
        });
        if (hasPending) return 'bg-amber-400';

        const hasPlanned = dayMeetings.some(m => m.status === 'planned');
        if (hasPlanned) return 'bg-blue-400';

        const hasCompleted = dayMeetings.some(m => m.status === 'completed');
        if (hasCompleted) return 'bg-emerald-400';

        const hasCancelled = dayMeetings.some(m => m.status === 'cancelled');
        if (hasCancelled) return 'bg-slate-300';

        return 'bg-slate-300';
    };

    return (
        <div className="bg-white rounded-[2.5rem] p-4 md:p-6 shadow-sm border border-slate-100 h-fit select-none">
            <div className="flex justify-between items-center mb-6">
                <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center hover:bg-slate-50 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                    <ChevronDown className="rotate-90" size={20} />
                </button>
                <h3 className="font-bold text-slate-800 capitalize text-center text-lg">{monthName}</h3>
                <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center hover:bg-slate-50 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                    <ChevronDown className="-rotate-90" size={20} />
                </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-6">
                {/* Weekday Headers */}
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => (
                    <div key={d} className="h-8 flex items-center justify-center text-[10px] text-slate-400 font-bold uppercase">{d}</div>
                ))}

                {/* Empty slots for start of month */}
                {[...Array(startOffset)].map((_, i) => <div key={`empty-${i}`} />)}

                {/* Days */}
                {[...Array(daysInMonth)].map((_, i) => {
                    const day = i + 1;
                    const statusDot = getDayStatusColor(day);

                    // Check if this specific rendered day is TODAY
                    const today = new Date();
                    const isToday = today.getDate() === day &&
                        today.getMonth() === month &&
                        today.getFullYear() === year;

                    return (
                        <div key={i} className={`aspect-square rounded-xl flex flex-col items-center justify-center text-sm transition-all relative group
                            ${isToday ? 'bg-blue-50 text-blue-600 font-bold shadow-sm border border-blue-100' : 'text-slate-600 hover:bg-slate-50'}`}>

                            <span className="leading-none z-10">{day}</span>

                            {/* Dot Indicator */}
                            {statusDot && (
                                <div className={`absolute bottom-2 w-1 h-1 rounded-full ${statusDot}`} />
                            )}

                            {/* Today ring overlay (optional, subtle) */}
                            {isToday && !statusDot && (
                                <div className="absolute inset-0 rounded-xl border-2 border-blue-100/50" />
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="mt-2">
                {/* Hide button if requested */}
                {showPlanButton && (
                    <Button onClick={() => onPlanClick()} className="w-full justify-center !rounded-xl !py-2.5 !text-sm shadow-blue-200/50">
                        <Plus size={16} /> Запланировать
                    </Button>
                )}
            </div>
        </div>
    );
};

// 2. Month Analytics Component
const MonthAnalytics = ({ meetings, currentDate }) => {
    // Filter findings
    const currentMonthMeetings = meetings.filter(m => {
        const d = new Date(m.date);
        return d.getMonth() === currentDate.getMonth() &&
            d.getFullYear() === currentDate.getFullYear() &&
            m.status === 'completed';
    });

    const totalIncome = currentMonthMeetings.reduce((acc, m) => acc + (parseInt(m.income) || 0), 0);
    const totalGuests = currentMonthMeetings.reduce((acc, m) => acc + (parseInt(m.guests) || 0), 0);
    const totalNew = currentMonthMeetings.reduce((acc, m) => acc + (parseInt(m.new_guests) || 0), 0);
    const avgCheck = totalGuests > 0
        ? Math.round(totalIncome / totalGuests)
        : 0;

    const monthName = currentDate.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });

    const MetricCard = ({ label, value, subLabel, colorClass = "text-slate-900" }) => (
        <div className="bg-slate-50 rounded-2xl p-4 flex flex-col items-center justify-center text-center border border-slate-100">
            <div className={`text - lg font - bold ${colorClass} leading - tight mb - 1`}>{value}</div>
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">{label}</div>
        </div>
    );

    return (
        <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-6 shadow-sm border border-white/50 mt-4">
            <div className="flex items-center gap-2 mb-5">
                <span className="text-xl">📊</span>
                <h3 className="font-bold text-slate-900">Результаты {monthName}</h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <MetricCard label="Доход" value={`${totalIncome.toLocaleString()} ₽`} />
                <MetricCard label="Ср. чек" value={`${avgCheck.toLocaleString()} ₽`} colorClass="text-purple-600" />
                <MetricCard label="Гости" value={totalGuests} />
                <MetricCard label="Новенькие" value={totalNew} colorClass="text-green-600" />
            </div>
        </div>
    );
};

// 2. Meetings Tab Content
const MeetingsTab = ({ meetings, users, onPlanClick, onResultClick, onCancelClick, onDeleteClick, onUpdateMeeting }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    // 1. Filter by selected month
    const filteredMeetings = meetings.filter(m => {
        const mDate = new Date(m.date);
        return mDate.getMonth() === currentDate.getMonth() &&
            mDate.getFullYear() === currentDate.getFullYear();
    });

    // 2. Sort filtered meetings
    const sortedMeetings = [...filteredMeetings].sort((a, b) => {
        const statusPriority = { pending: 0, planned: 1, completed: 2, cancelled: 3 };
        const getStatus = (m) => {
            const isPast = new Date(m.date) < new Date().setHours(0, 0, 0, 0);
            if (m.status === 'planned' && isPast) return 'pending';
            return m.status || 'planned';
        };
        const statA = getStatus(a);
        const statB = getStatus(b);
        if (statusPriority[statA] !== statusPriority[statB]) {
            return statusPriority[statA] - statusPriority[statB];
        }
        return new Date(b.date) - new Date(a.date);
    });

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left: Calendar & Analytics (Scrolls with page) */}
            <div className="lg:col-span-4 space-y-4">
                <CalendarWidget
                    meetings={meetings} // Pass all meetings for dots in calendar
                    onPlanClick={onPlanClick}
                    currentDate={currentDate}
                    setCurrentDate={setCurrentDate}
                />

                <MonthAnalytics meetings={meetings} currentDate={currentDate} />
            </div>

            {/* Right: Feed */}
            <div className="lg:col-span-8 space-y-4">
                {sortedMeetings.length === 0 ? (
                    <div className="text-center py-20 bg-slate-50 rounded-[2.5rem] border border-dashed border-slate-200">
                        <h3 className="text-lg font-bold text-slate-400 mb-2">В этом месяце пусто</h3>
                        <p className="text-slate-400">Запланируйте первую встречу на {currentDate.toLocaleString('ru-RU', { month: 'long' })}!</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {sortedMeetings.map(meeting => (
                            <MeetingCard
                                key={meeting.id}
                                meeting={meeting}
                                users={users}
                                onEdit={onPlanClick}
                                onResult={onResultClick}
                                onCancel={onCancelClick}
                                onDelete={onDeleteClick}
                                onUpdate={onUpdateMeeting}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// 3. Mastery Tab Content
const MasteryTab = ({ meetings, goals, onAddGoal, onEditGoal, onToggleGoal, onDeleteGoal }) => {
    const [period, setPeriod] = useState('3m'); // 1m, 3m, 6m, year, all
    const [searchQuery, setSearchQuery] = useState('');

    // 1. Filter by Period
    const filteredMeetings = meetings.filter(m => {
        if (!m.date) return false;
        const mDate = new Date(m.date);
        const now = new Date();
        const diffTime = Math.abs(now - mDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        switch (period) {
            case '1m': return diffDays <= 30;
            case '3m': return diffDays <= 90;
            case '6m': return diffDays <= 180;
            case 'year': return diffDays <= 365;
            default: return true;
        }
    });

    // 2. Extract & Count Tags (Strengths)
    const strengthTags = {};
    const strengthMeetings = filteredMeetings
        .filter(m => m.keep_notes && (
            (m.keep_notes.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (m.title && m.title.toLowerCase().includes(searchQuery.toLowerCase()))
        ))
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    strengthMeetings.forEach(m => {
        const tags = (m.keep_notes || '').match(/#[\p{L}\d_]+/gu) || [];
        tags.forEach(tag => {
            const normalized = tag.toLowerCase();
            strengthTags[normalized] = (strengthTags[normalized] || 0) + 1;
        });
    });

    const topStrengthTags = Object.entries(strengthTags)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

    // 3. Extract & Count Tags (Growth Zones)
    const growthTags = {};
    // Calculate tags from ALL filtered meetings to get accurate counts for suggestions, 
    // even if search hides some cards.
    const allGrowthMeetingsForStats = filteredMeetings.filter(m => m.change_notes);
    allGrowthMeetingsForStats.forEach(m => {
        const tags = (m.change_notes || '').match(/#[\p{L}\d_]+/gu) || [];
        tags.forEach(tag => {
            const normalized = tag.toLowerCase();
            growthTags[normalized] = (growthTags[normalized] || 0) + 1;
        });
    });

    // Filter feed for display
    const growthMeetings = filteredMeetings
        .filter(m => m.change_notes && (
            (m.change_notes.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (m.title && m.title.toLowerCase().includes(searchQuery.toLowerCase()))
        ))
        .sort((a, b) => new Date(b.date) - new Date(a.date));


    const topGrowthTags = Object.entries(growthTags)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

    // Suggestion Logic: Tags with count >= 3 that are NOT in active goals
    const activeGoalTags = new Set(goals.filter(g => !g.completed).flatMap(g => g.related_tags || []).map(t => t.toLowerCase()));

    const suggestedTags = Object.entries(growthTags)
        .filter(([tag, count]) => count >= 3 && !activeGoalTags.has(tag))
        .sort(([, a], [, b]) => b - a);

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
            {/* Header: Controls */}
            <div className="flex flex-wrap gap-4 justify-between items-center mb-6">
                <div className="flex-1 min-w-[200px]">
                    <Input
                        placeholder="Поиск по рефлексиям..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-white"
                        inputClassName="focus:ring-0 focus:border-blue-500 shadow-sm"
                    />
                </div>
                <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="bg-white border-none text-slate-500 font-medium text-sm rounded-xl px-4 py-3 cursor-pointer hover:bg-slate-50 focus:ring-2 focus:ring-blue-100 outline-none shadow-sm"
                >
                    <option value="1m">Последний месяц</option>
                    <option value="3m">Последние 3 месяца</option>
                    <option value="6m">Последние 6 месяцев</option>
                    <option value="year">Весь год</option>
                    <option value="all">Всё время</option>
                </select>
            </div>

            {/* SUGGESTION BANNER */}
            {suggestedTags.length > 0 && searchQuery === '' && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-[2rem] p-6 mb-8 relative overflow-hidden">
                    <div className="relative z-10 flex items-start gap-4">
                        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm text-xl shrink-0">
                            💡
                        </div>
                        <div className="flex-1">
                            <h4 className="font-bold text-slate-800 mb-1">Пора поставить новую цель?</h4>
                            <p className="text-sm text-slate-600 mb-3">
                                Вы <strong>{suggestedTags[0][1]} раз(а)</strong> упоминали зону роста <span className="font-bold px-1.5 py-0.5 bg-white rounded-md text-slate-800">{suggestedTags[0][0]}</span>.
                                Хотите превратить это в цель?
                            </p>
                            <Button
                                variant="secondary"
                                className="text-xs h-9 px-4"
                                onClick={() => onAddGoal({
                                    title: `Улучшить ${suggestedTags[0][0]} `,
                                    description: `Проработать зону роста ${suggestedTags[0][0]}, которая часто всплывает в рефлексии.`,
                                    related_tags: [suggestedTags[0][0]]
                                })}
                            >
                                Создать цель: {suggestedTags[0][0]}
                            </Button>
                        </div>
                        <div className="hidden sm:block">
                            <Target size={80} className="text-blue-100 opacity-50" />
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

                {/* LEFT COLUMN: ACTION PLAN (GOALS) */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-blue-50/40 rounded-[2.5rem] p-6 border border-blue-100/50 sticky top-6">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">📝</span>
                                <h3 className="text-xl font-bold text-slate-800">Цели</h3>
                            </div>
                        </div>

                        <div className="mb-6">
                            <Button onClick={() => onAddGoal()} variant="secondary" className="w-full justify-center border-dashed border-2 border-blue-200 bg-blue-50/50 hover:bg-blue-100 hover:border-blue-300 text-blue-600">
                                + Добавить цель
                            </Button>
                        </div>

                        <div className="space-y-4">
                            {/* Active Goals */}
                            <div className="space-y-3">
                                {goals.filter(g => !g.completed).map(goal => (
                                    <div key={goal.id} className="bg-white p-4 rounded-2xl shadow-sm border border-blue-100 group">
                                        <div className="flex items-start gap-3">
                                            <input
                                                type="checkbox"
                                                checked={goal.completed}
                                                onChange={() => onToggleGoal(goal)}
                                                className="mt-1 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-bold text-slate-800 text-sm mb-1 leading-snug">{goal.title}</h4>
                                                {goal.description && <p className="text-xs text-slate-500 mb-2 line-clamp-2">{goal.description}</p>}

                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {(goal.related_tags || []).map((tag, i) => (
                                                        <span key={i} className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md truncate max-w-full">{tag}</span>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => onEditGoal(goal)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                                    <span className="text-[10px] font-bold">Edit</span>
                                                </button>
                                                <button onClick={() => onDeleteGoal(goal.id)} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {goals.filter(g => !g.completed).length === 0 && (
                                    <p className="text-center text-slate-400 text-xs py-4">Нет активных целей</p>
                                )}
                            </div>

                            {/* Completed Goals */}
                            {goals.some(g => g.completed) && (
                                <div className="pt-4 border-t border-blue-100/50">
                                    <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">✅ Выполнено</h5>
                                    <div className="space-y-2 opacity-60 hover:opacity-100 transition-opacity">
                                        {goals.filter(g => g.completed).map(goal => (
                                            <div key={goal.id} className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center gap-3">
                                                <input
                                                    type="checkbox"
                                                    checked={goal.completed}
                                                    onChange={() => onToggleGoal(goal)}
                                                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-medium text-slate-700 text-xs line-through truncate">{goal.title}</h4>
                                                </div>
                                                <button onClick={() => onDeleteGoal(goal.id)} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: REFLECTIONS */}
                <div className="lg:col-span-2 space-y-6">

                    {/* BLOCK 1: STRENGTHS */}
                    <div className="bg-emerald-50/40 rounded-[2.5rem] p-8 border border-emerald-100/50">
                        <div className="flex items-center gap-3 mb-6">
                            <span className="text-2xl">✨</span>
                            <h3 className="text-xl font-bold text-slate-800">Что получается классно</h3>
                        </div>

                        {/* Top Tags */}
                        {topStrengthTags.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-8">
                                {topStrengthTags.map(([tag, count]) => (
                                    <div key={tag} className="bg-white px-3 py-1.5 rounded-lg text-sm text-emerald-800 font-medium shadow-sm border border-emerald-100">
                                        {tag} <span className="opacity-60 ml-1">{count}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Reflections Feed */}
                        <div className="space-y-4">
                            {strengthMeetings.map(m => {
                                const tags = (m.keep_notes || '').match(/#[\p{L}\d_]+/gu) || [];
                                const cleanText = m.keep_notes;

                                return (
                                    <div key={m.id} className="bg-white p-6 rounded-3xl shadow-sm border border-emerald-50">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                                {new Date(m.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                                                {m.title && <span className="text-slate-300 mx-2">•</span>}
                                                {m.title && <span className="text-slate-600">{m.title}</span>}
                                            </div>
                                        </div>
                                        <p className="text-slate-800 leading-relaxed whitespace-pre-wrap mb-3">
                                            {cleanText}
                                        </p>
                                        {tags.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                {tags.map((t, i) => (
                                                    <span key={i} className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                                                        {t}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {strengthMeetings.length === 0 && (
                                <div className="text-center py-12 text-slate-400">
                                    <p>Пока нет записей об успехах за этот период</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* BLOCK 2: GROWTH ZONES */}
                    <div className="bg-amber-50/40 rounded-[2.5rem] p-8 border border-amber-100/50">
                        <div className="flex items-center gap-3 mb-6">
                            <span className="text-2xl">🎯</span>
                            <h3 className="text-xl font-bold text-slate-800">Работаю над этим</h3>
                        </div>

                        {/* Top Tags */}
                        <div className="flex flex-wrap gap-2 mb-8">
                            {topGrowthTags.length > 0 ? (
                                topGrowthTags.map(([tag, count]) => (
                                    <div key={tag} className="bg-white px-3 py-1.5 rounded-lg text-sm text-amber-900 font-medium shadow-sm border border-amber-100 flex items-center gap-1.5">
                                        {tag}
                                        <span className="opacity-60">{count}</span>
                                        {count >= 3 && <span title="Частая зона роста">⚠️</span>}
                                    </div>
                                ))
                            ) : (
                                <p className="text-slate-400 text-sm">Пока нет статистики</p>
                            )}
                        </div>

                        {/* Reflections Feed */}
                        <div className="space-y-4">
                            {growthMeetings.map(m => {
                                const tags = (m.change_notes || '').match(/#[\p{L}\d_]+/gu) || [];
                                const cleanText = m.change_notes;

                                return (
                                    <div key={m.id} className="bg-white p-6 rounded-3xl shadow-sm border border-amber-50">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                                {new Date(m.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                                                {m.title && <span className="text-slate-300 mx-2">•</span>}
                                                {m.title && <span className="text-slate-600">{m.title}</span>}
                                            </div>
                                            <div className="bg-amber-100/50 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                                {tags.length} упоминаний
                                            </div>
                                        </div>
                                        <p className="text-slate-800 leading-relaxed whitespace-pre-wrap mb-3">
                                            {cleanText}
                                        </p>
                                        {tags.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                {tags.map((t, i) => (
                                                    <span key={i} className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md">
                                                        {t}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {growthMeetings.length === 0 && (
                                <div className="text-center py-12 text-slate-400">
                                    <p>Нет записей о зонах роста за этот период</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Main Component ---

const MeetingsView = ({
    user,
    users = [],
    meetings,
    goals,
    scenarios: propScenarios, // Scenarios might not be passed, check userApp
    onAddMeeting,
    onUpdateMeeting,
    onDeleteMeeting,
    onAddGoal,
    onUpdateGoal,
    onDeleteGoal,
    onNotify,
    initialTab
}) => {
    // const [meetings, setMeetings] = useState([]); // REMOVED - Using props
    const [scenarios, setScenarios] = useState([]); // Keep local if not passed
    // const [goals, setGoals] = useState([]); // REMOVED - Using props
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isImageUploading, setIsImageUploading] = useState(false);

    const [activeTab, setActiveTab] = useState(initialTab || 'meetings'); // 'meetings' | 'mastery'

    useEffect(() => {
        if (initialTab) setActiveTab(initialTab);
    }, [initialTab]);

    // Modals State
    const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
    const [isResultModalOpen, setIsResultModalOpen] = useState(false);
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
    const [isDeleteGoalModalOpen, setIsDeleteGoalModalOpen] = useState(false);
    const [isGoalCompletionModalOpen, setIsGoalCompletionModalOpen] = useState(false);

    const [selectedMeeting, setSelectedMeeting] = useState(null);
    const [meetingToDelete, setMeetingToDelete] = useState(null);
    const [goalToDelete, setGoalToDelete] = useState(null);
    const [goalToComplete, setGoalToComplete] = useState(null);

    // Form States
    const [formData, setFormData] = useState({});
    const [goalFormData, setGoalFormData] = useState({});

    useEffect(() => {
        console.log("MeetingsView Loaded - Connected to UserApp");
        loadData();
    }, [user.id]);

    const loadData = async () => {
        try {
            // Only fetch scenarios locally as they aren't passed by UserApp (yet)
            // If UserApp updates to pass scenarios, we can remove this too.
            const s = await api.getScenarios(user.id);
            setScenarios(s);
        } catch (e) {
            console.error("Failed to load scenarios", e);
        } finally {
            setLoading(false);
        }
    };

    // --- Handlers ---

    // 1. Plan Meeting
    const handleOpenPlan = (meeting = null) => {
        const initialChecklist = [
            { text: 'Отправить приглашения', completed: false },
            { text: 'Подготовить материалы', completed: false },
            { text: 'Напомнить за день', completed: false }
        ];

        setFormData(meeting ? { ...meeting } : {
            title: '',
            date: new Date().toISOString().split('T')[0],
            time: '19:00',
            guests: '',
            scenario_id: '',
            checklist: initialChecklist,
            is_public: false,
            co_hosts: []
        });
        setIsPlanModalOpen(true);
    };

    const validatePublicFields = (data) => {
        const missing = [];

        if (!data.title) missing.push('Название');
        if (!data.date) missing.push('Дата');
        if (!data.time) missing.push('Время');

        if (data.is_public) {
            if (!data.description) missing.push('Описание');
            if (isImageUploading) missing.push('Обложка (загрузка)');
            if (!data.cover_image) missing.push('Обложка');
            if (!data.city) missing.push('Город');
            if (!data.cost) missing.push('Стоимость');
            if (!data.payment_link) missing.push('Ссылка');

            const isFree = ['Бесплатно', 'Free', 'Донат', 'Donation'].includes(data.cost);
            if (!isFree) {
                const amount = parseInt(data.cost, 10);
                if (!amount || amount <= 0) missing.push('Сумма');
            }
        }

        return missing;
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            setIsImageUploading(true);
            // Optimistic preview (use compressed file for faster preview)
            const compressedFile = await api.compressMeetingImage(file);
            const reader = new FileReader();
            reader.onload = (e) => {
                setFormData(prev => ({ ...prev, cover_image: e.target.result })); // Temp preview
            };
            reader.readAsDataURL(compressedFile);

            // Upload
            const url = await api.uploadMeetingImage(compressedFile);
            setFormData(prev => ({ ...prev, cover_image: url }));
        } catch (error) {
            console.error(error);
            onNotify("Ошибка загрузки фото");
        } finally {
            setIsImageUploading(false);
        }
    };

    const toggleCoHost = (userId) => {
        setFormData(prev => {
            const current = Array.isArray(prev.co_hosts) ? prev.co_hosts : [];
            const next = new Set(current);
            if (next.has(userId)) next.delete(userId);
            else next.add(userId);
            return { ...prev, co_hosts: Array.from(next) };
        });
    };

    const handleSavePlan = async () => {
        if (isSaving) return;
        setIsSaving(true);
        try {
            const meetingData = {
                ...formData,
                user_id: user.id,
                status: 'planned'
            };

            const missing = validatePublicFields(meetingData);
            if (missing.length > 0) {
                alert(`Пожалуйста, заполните обязательные поля:\n${missing.join(', ')}`);
                setIsSaving(false);
                return;
            }

            if (meetingData.id) {
                await onUpdateMeeting(meetingData);
            } else {
                await onAddMeeting(meetingData);
            }
            // await loadData(); // No need, parent updates seeds/state
            setIsPlanModalOpen(false);
        } catch (e) {
            console.error('Save error:', e);
            onNotify('Ошибка при сохранении: ' + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    // 2. Submit Result
    const handleOpenResult = (meeting) => {
        setSelectedMeeting(meeting);
        setFormData({
            ...meeting,
            income: meeting.income || '',
            new_guests: meeting.new_guests || '',
            keep_notes: meeting.keep_notes || '',
            change_notes: meeting.change_notes || ''
        });
        setIsResultModalOpen(true);
    };

    const handleSaveResult = async () => {
        if (isSaving) return;
        setIsSaving(true);
        try {
            await onUpdateMeeting({
                ...formData,
                status: 'completed'
            });
            // await loadData();
            setIsResultModalOpen(false);

            // Check for linked goal
            const linkedGoal = goals.find(g => g.linked_meeting_id === formData.id && !g.completed);
            if (linkedGoal) {
                setGoalToComplete(linkedGoal);
                setIsGoalCompletionModalOpen(true);
            }

        } catch (e) {
            onNotify('Ошибка: ' + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleConfirmGoalCompletion = async () => {
        if (goalToComplete) {
            await handleToggleGoal(goalToComplete);
            // alert("🎉 Отлично! Цель выполнена, так держать!"); // Optional: replace with toast later
            setGoalToComplete(null);
        }
        setIsGoalCompletionModalOpen(false);
    };

    // 3. Cancel Meeting
    const handleOpenCancel = (meeting) => {
        setSelectedMeeting(meeting);
        setFormData({ ...meeting, fail_reason: '', reschedule: false, new_date: '' });
        setIsCancelModalOpen(true);
    };

    const handleSaveCancel = async () => {
        try {
            await onUpdateMeeting({
                id: formData.id,
                status: 'cancelled',
                fail_reason: formData.fail_reason
            });

            if (formData.reschedule && formData.new_date) {
                const newMeeting = {
                    title: formData.title,
                    date: formData.new_date,
                    user_id: user.id,
                    status: 'planned',
                    checklist: formData.checklist
                };
                await onAddMeeting(newMeeting);
            }

            // await loadData();
            setIsCancelModalOpen(false);
        } catch (e) {
            onNotify('Ошибка: ' + e.message);
        }
    };

    // 4. Delete Meeting (Initiate)
    const handleDeleteMeeting = (id) => {
        setMeetingToDelete(id);
        setIsDeleteModalOpen(true);
    };

    // 5. Confirm Delete
    const handleConfirmDelete = async () => {
        try {
            await onDeleteMeeting(meetingToDelete);
            // await loadData();
            setIsDeleteModalOpen(false);
            setMeetingToDelete(null);
        } catch (e) {
            onNotify('Ошибка при удалении: ' + e.message);
        }
    };

    // --- GOAL HANDLERS ---
    const handleOpenAddGoal = (initialData = {}) => {
        setGoalFormData({
            title: initialData.title || '',
            description: initialData.description || '',
            related_tags: initialData.related_tags || [],
            linked_meeting_id: ''
        });
        setIsGoalModalOpen(true);
    };

    const handleOpenEditGoal = (goal) => {
        setGoalFormData({ ...goal });
        setIsGoalModalOpen(true);
    };

    const handleSaveGoal = async () => {
        if (isSaving) return;
        setIsSaving(true);
        try {
            const data = { ...goalFormData, user_id: user.id };

            // Fix invalid input syntax for bigint
            if (data.linked_meeting_id === '') {
                data.linked_meeting_id = null;
            }

            if (!data.title) {
                onNotify('Укажите название цели');
                setIsSaving(false);
                return;
            }

            if (data.id) {
                await onUpdateGoal(data);
            } else {
                await onAddGoal(data);
            }
            // await loadData();
            setIsGoalModalOpen(false);
        } catch (e) {
            onNotify('Ошибка при сохранении цели: ' + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleGoal = async (goal) => {
        try {
            const updated = {
                ...goal,
                completed: !goal.completed,
                completed_at: !goal.completed ? new Date().toISOString() : null
            };
            await onUpdateGoal(updated);
        } catch (e) {
            console.error("Error toggling goal", e);
        }
    };

    const handleDeleteGoal = (id) => {
        setGoalToDelete(id);
        setIsDeleteGoalModalOpen(true);
    };

    const handleConfirmDeleteGoal = async () => {
        try {
            await onDeleteGoal(goalToDelete);
            setIsDeleteGoalModalOpen(false);
            setGoalToDelete(null);
        } catch (e) {
            onNotify('Ошибка при удалении цели: ' + e.message);
        }
    };

    // Helper to extract all unique tags for multiselect
    const getAllUniqueTags = () => {
        const tags = new Set();
        meetings.forEach(m => {
            const combined = (m.keep_notes || '') + ' ' + (m.change_notes || '') + ' ' + (m.fail_reason || '');
            const found = combined.match(/#[\p{L}\d_]+/gu) || [];
            found.forEach(t => tags.add(t.toLowerCase()));
        });
        return Array.from(tags).sort();
    };

    return (
        <div className="h-full flex flex-col pt-6 overflow-hidden">
            {/* Header + Tabs */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 px-4 lg:px-0 shrink-0 gap-4">
                <div className="flex flex-col gap-4">
                    <div>
                        <h1 className="text-4xl font-light text-slate-800 tracking-tight">Встречи</h1>
                        <p className="text-slate-400 mt-1 font-light">Планирование и результаты</p>
                    </div>

                    {/* Tab Navigation */}
                    <div className="bg-slate-100/50 p-1 rounded-2xl flex gap-1 w-fit">
                        <button
                            onClick={() => setActiveTab('meetings')}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'meetings'
                                ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200'
                                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                                } `}
                        >
                            <CalendarIcon size={16} />
                            Календарь
                        </button>
                        <button
                            onClick={() => setActiveTab('mastery')}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'mastery'
                                ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200'
                                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                                } `}
                        >
                            <Trophy size={16} />
                            Мастерство
                        </button>
                    </div>
                </div>

                {activeTab === 'meetings' && (
                    <div className="bg-white px-4 py-2 rounded-2xl shadow-sm border border-slate-100 text-slate-600 text-sm font-medium">
                        Всего встреч: {meetings.length}
                    </div>
                )}
            </div>

            {/* Main Content Area - SCROLLABLE CONTAINER */}
            {user?.role === 'applicant' ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-white/50 rounded-3xl border border-white/60 shadow-sm mx-4 lg:mx-0">
                    <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6 text-blue-500">
                        <Lock size={32} />
                    </div>
                    <h2 className="text-2xl font-light text-slate-800 mb-2">Организация встреч</h2>
                    <p className="text-slate-500 max-w-md mx-auto leading-relaxed">
                        Этот раздел станет доступен, когда вы перейдете на ступень <strong>Стажер</strong>. <br />
                        А пока вы можете изучать базу знаний и планировать свои будущие сценарии в Конструкторе.
                    </p>
                </div>
            ) : (
                <div className="flex-1 min-h-0 overflow-y-auto pb-4 px-4 lg:px-0 custom-scrollbar">
                    {activeTab === 'meetings' ? (
                        <MeetingsTab
                            meetings={meetings}
                            users={users}
                            onPlanClick={handleOpenPlan}
                            onResultClick={handleOpenResult}
                            onCancelClick={handleOpenCancel}
                            onDeleteClick={handleDeleteMeeting}
                            onUpdateMeeting={onUpdateMeeting}
                        />
                    ) : (
                        <MasteryTab
                            meetings={meetings}
                            goals={goals}
                            onAddGoal={handleOpenAddGoal}
                            onEditGoal={handleOpenEditGoal}
                            onToggleGoal={handleToggleGoal}
                            onDeleteGoal={handleDeleteGoal}
                        />
                    )}
                </div>
            )}

            {/* --- MODALS (Shared) --- */}
            {
                isPlanModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-[2rem] p-0 w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                            <div className="p-8 border-b border-slate-100 flex justify-between items-center shrink-0">
                                <h2 className="text-2xl font-bold text-slate-800">
                                    {formData.id ? 'Редактировать встречу' : 'Запланировать встречу'}
                                </h2>
                                <button onClick={() => setIsPlanModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
                            </div>

                            <div className="p-8 overflow-y-auto custom-scrollbar space-y-6 flex-1">
                                {/* Top Row: Basic Info */}
                                <div className="space-y-4">
                                    <Input label="Название" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="Например: Женский круг" />

                                    <div className="grid grid-cols-2 gap-4">
                                        <Input
                                            type="date"
                                            label="Дата"
                                            value={formData.date}
                                            onChange={e => setFormData({ ...formData, date: e.target.value })}
                                            max="9999-12-31"
                                        />
                                        <Input type="time" label="Время" value={formData.time} onChange={e => setFormData({ ...formData, time: e.target.value })} />
                                    </div>
                                </div>

                                {/* Co-hosts */}
                                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                                    <div className="text-sm font-bold text-slate-700 mb-3">Со‑ведущие (необязательно)</div>
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        {(formData.co_hosts || []).length === 0 ? (
                                            <span className="text-xs text-slate-400">Не выбраны</span>
                                        ) : (
                                            (formData.co_hosts || []).map(id => {
                                                const u = users.find(x => x.id === id);
                                                return (
                                                    <span key={id} className="px-3 py-1 bg-white border border-slate-200 rounded-full text-xs text-slate-700">
                                                        {u?.name || 'Со‑ведущая'}
                                                    </span>
                                                );
                                            })
                                        )}
                                    </div>
                                    <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-2">
                                        {users.filter(u => u.id !== user.id).map(u => (
                                            <label key={u.id} className="flex items-center gap-2 text-sm text-slate-700">
                                                <input
                                                    type="checkbox"
                                                    checked={(formData.co_hosts || []).includes(u.id)}
                                                    onChange={() => toggleCoHost(u.id)}
                                                />
                                                <span>{u.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Public Schedule Section */}
                                <div className="bg-blue-50/50 rounded-2xl p-6 border border-blue-100/50 space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                                                <CalendarIcon size={20} />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-slate-800">Публичное расписание</h3>
                                                <p className="text-xs text-slate-500">Показать эту встречу в общем календаре?</p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={formData.is_public || false}
                                                onChange={e => {
                                                    const next = e.target.checked;
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        is_public: next,
                                                        cost: next ? (prev.cost || '1000 рублей') : prev.cost
                                                    }));
                                                }}
                                            />
                                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                        </label>
                                    </div>

                                    {formData.is_public && (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-2 ml-1">Описание</label>
                                                <textarea
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 min-h-[80px]"
                                                    value={formData.description || ''}
                                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                                    placeholder="О чем будет эта встреча? (видно в расписании)"
                                                />
                                            </div>
                                            {/* Cover Image */}
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2 ml-1">Обложка</label>
                                                <div className="flex items-start gap-4">
                                                    <div className="w-24 h-24 bg-slate-100 rounded-2xl overflow-hidden shadow-inner border border-slate-200 shrink-0 relative group">
                                                        {formData.cover_image ? (
                                                            <img src={formData.cover_image} alt="Cover" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                                <CalendarIcon size={24} />
                                                            </div>
                                                        )}
                                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                            <span className="text-white text-[10px] uppercase font-bold">Изменить</span>
                                                        </div>
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            onChange={handleImageUpload}
                                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                                        />
                                                    </div>
                                                    <div className="flex-1 text-sm text-slate-500">
                                                        <p className="mb-2">Загрузите красивую картинку для анонса. Рекомендуемый размер: 1200x630px.</p>
                                                        <Button variant="secondary" className="!py-1.5 !px-3 !text-xs relative">
                                                            Загрузить фото
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                onChange={handleImageUpload}
                                                                className="absolute inset-0 opacity-0 cursor-pointer"
                                                            />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <Input
                                                    label="Город"
                                                    value={formData.city}
                                                    onChange={e => setFormData({ ...formData, city: e.target.value })}
                                                    placeholder="Москва, Бали, Онлайн..."
                                                />

                                                <div>
                                                    <label className="block text-sm font-bold text-slate-700 mb-2 ml-1">Стоимость</label>
                                                    <div className="flex gap-2">
                                                        <select
                                                            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none min-w-[120px]"
                                                            value={['Бесплатно', 'Free'].includes(formData.cost) ? 'free' : ['Донат', 'Donation'].includes(formData.cost) ? 'donation' : 'paid'}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                if (val === 'free') setFormData({ ...formData, cost: 'Бесплатно' });
                                                                else if (val === 'donation') setFormData({ ...formData, cost: 'Донат' });
                                                                else setFormData({ ...formData, cost: '1000 рублей' });
                                                            }}
                                                        >
                                                            <option value="paid">Платное</option>
                                                            <option value="free">Бесплатное</option>
                                                            <option value="donation">Донат</option>
                                                        </select>

                                                        {!['Бесплатно', 'Free', 'Донат', 'Donation'].includes(formData.cost) && (
                                                            <>
                                                                <input
                                                                    type="number"
                                                                    className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                                                    placeholder="Сумма"
                                                                    value={parseInt(formData.cost) || ''}
                                                                    onChange={(e) => {
                                                                        const currency = formData.cost?.split(' ')[1] || 'рублей';
                                                                        setFormData({ ...formData, cost: `${e.target.value} ${currency}` })
                                                                    }}
                                                                />
                                                                <select
                                                                    className="w-24 bg-slate-50 border border-slate-200 rounded-xl px-2 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none text-center"
                                                                    value={formData.cost?.split(' ')[1] || 'рублей'}
                                                                    onChange={(e) => {
                                                                        const amount = parseInt(formData.cost) || 0;
                                                                        setFormData({ ...formData, cost: `${amount} ${e.target.value}` })
                                                                    }}
                                                                >
                                                                    <option value="рублей">рублей</option>
                                                                    <option value="евро">евро</option>
                                                                </select>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <Input
                                                label="Ссылка на запись / Telegram"
                                                value={formData.payment_link}
                                                onChange={e => setFormData({ ...formData, payment_link: e.target.value })}
                                                placeholder="https://t.me/username или ссылка на оплату"
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Additional Details */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1.5 ml-1">Сценарий</label>
                                        <select
                                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all appearance-none"
                                            value={formData.scenario_id || ''}
                                            onChange={e => setFormData({ ...formData, scenario_id: e.target.value })}
                                        >
                                            <option value="">Без сценария</option>
                                            {scenarios.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                                        </select>
                                    </div>

                                    <Input type="number" label="Ожидается гостей" value={formData.guests} onChange={e => setFormData({ ...formData, guests: e.target.value })} />

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2 ml-1">Чеклист подготовки</label>
                                        <div className="space-y-2">
                                            {(formData.checklist || []).map((item, idx) => (
                                                <div key={idx} className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={item.text}
                                                        onChange={(e) => {
                                                            const newChecklist = [...formData.checklist];
                                                            newChecklist[idx].text = e.target.value;
                                                            setFormData({ ...formData, checklist: newChecklist });
                                                        }}
                                                        className="flex-1 bg-slate-50 border-none rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-blue-200"
                                                    />
                                                </div>
                                            ))}
                                            <button
                                                onClick={() => setFormData({ ...formData, checklist: [...(formData.checklist || []), { text: '', completed: false }] })}
                                                className="text-xs text-blue-600 font-bold uppercase tracking-wider hover:underline ml-1"
                                            >
                                                + Добавить пункт
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 border-t border-slate-100 shrink-0">
                                <Button onClick={handleSavePlan} disabled={isSaving} className="w-full justify-center">
                                    {isSaving ? 'Сохранение...' : 'Сохранить и запланировать'}
                                </Button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* 2. Result Modal */}
            {
                isResultModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-[2rem] p-8 w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-800">Итоги встречи</h2>
                                    <p className="text-slate-400 text-sm mt-1">{formData.title}</p>
                                </div>
                                <button onClick={() => setIsResultModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
                            </div>

                            <div className="space-y-5 mb-8">
                                <div className="grid grid-cols-2 gap-4">
                                    <Input type="number" label="Всего гостей" value={formData.guests} onChange={e => setFormData({ ...formData, guests: e.target.value })} />
                                    <Input type="number" label="Из них новых" value={formData.new_guests} onChange={e => setFormData({ ...formData, new_guests: e.target.value })} />
                                </div>
                                <Input type="number" label="Доход (₽)" value={formData.income} onChange={e => setFormData({ ...formData, income: e.target.value })} />

                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2 ml-1 flex items-center gap-2"><span className="text-green-500">✨</span> Что получилось классно?</label>
                                    <textarea
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500/20 min-h-[80px]"
                                        value={formData.keep_notes}
                                        onChange={e => setFormData({ ...formData, keep_notes: e.target.value })}
                                        placeholder="Ваши победы и инсайты..."
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2 ml-1 flex items-center gap-2"><span className="text-amber-500">🎯</span> Что можно улучшить?</label>
                                    <textarea
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 min-h-[80px]"
                                        value={formData.change_notes}
                                        onChange={e => setFormData({ ...formData, change_notes: e.target.value })}
                                        placeholder="Зоны роста на будущее..."
                                    />
                                </div>
                            </div>

                            <Button onClick={handleSaveResult} disabled={isSaving} className="w-full justify-center">
                                {isSaving ? 'Сохранение...' : 'Сохранить результат'}
                            </Button>
                        </div>
                    </div>
                )
            }

            {/* 3. Cancel Modal */}
            {
                isCancelModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-[2rem] p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-2xl font-bold text-slate-800">Отмена встречи</h2>
                                <button onClick={() => setIsCancelModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
                            </div>

                            <div className="space-y-4 mb-8">
                                <p className="text-slate-500 text-sm">Встреча: <strong>{formData.title}</strong></p>

                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2 ml-1">Почему не состоялась?</label>
                                    <textarea
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 min-h-[80px]"
                                        value={formData.fail_reason}
                                        onChange={e => setFormData({ ...formData, fail_reason: e.target.value })}
                                        placeholder="Например: перенесли, заболела..."
                                    />
                                </div>

                                <div className="bg-blue-50 p-4 rounded-xl flex items-start gap-3">
                                    <input
                                        type="checkbox"
                                        checked={formData.reschedule}
                                        onChange={e => setFormData({ ...formData, reschedule: e.target.checked })}
                                        className="mt-1 w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
                                    />
                                    <div className="flex-1">
                                        <label className="block text-sm font-bold text-slate-900 mb-1">Перенести встречу</label>
                                        <p className="text-xs text-slate-500 leading-tight mb-2">Создать новую карточку с новой датой</p>

                                        {formData.reschedule && (
                                            <Input type="date" value={formData.new_date} onChange={e => setFormData({ ...formData, new_date: e.target.value })} className="bg-white" />
                                        )}
                                    </div>
                                </div>
                            </div>

                            <Button onClick={handleSaveCancel} variant="secondary" className="w-full justify-center">Подтвердить отмену</Button>
                        </div>
                    </div>
                )
            }

            {/* 4. Delete Confirmation Modal */}
            {
                isDeleteModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                        <div className="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
                            <div className="text-center mb-6">
                                <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Trash2 size={32} />
                                </div>
                                <h2 className="text-xl font-bold text-slate-900 mb-2">Удалить встречу?</h2>
                                <p className="text-slate-500 text-sm">Это действие нельзя будет отменить.</p>
                            </div>

                            <div className="flex gap-3">
                                <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)} className="flex-1 justify-center">
                                    Отмена
                                </Button>
                                <Button onClick={handleConfirmDelete} className="flex-1 justify-center bg-red-500 hover:bg-red-600 text-white shadow-red-500/20">
                                    Удалить
                                </Button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* 5. Goal Modal */}
            {
                isGoalModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-[2rem] p-8 w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-2xl font-bold text-slate-800">
                                    {goalFormData.id ? 'Редактировать цель' : 'Новая цель'}
                                </h2>
                                <button onClick={() => setIsGoalModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
                            </div>

                            <div className="space-y-4 mb-8">
                                <Input
                                    label="Название цели"
                                    value={goalFormData.title}
                                    onChange={e => setGoalFormData({ ...goalFormData, title: e.target.value })}
                                    placeholder="Например: Улучшить тайминг"
                                />

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2 ml-1">План действий / Описание</label>
                                    <textarea
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 min-h-[100px]"
                                        value={goalFormData.description}
                                        onChange={e => setGoalFormData({ ...goalFormData, description: e.target.value })}
                                        placeholder="Что конкретно нужно сделать?"
                                    />
                                </div>

                                {/* Link to Meeting */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2 ml-1">Привязать к встрече (попробовать на практике)</label>
                                    <select
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none"
                                        value={goalFormData.linked_meeting_id || ''}
                                        onChange={e => setGoalFormData({ ...goalFormData, linked_meeting_id: e.target.value })}
                                    >
                                        <option value="">Не привязывать</option>
                                        {meetings
                                            .filter(m => m.status === 'planned' && new Date(m.date) >= new Date().setHours(0, 0, 0, 0))
                                            .map(m => (
                                                <option key={m.id} value={m.id}>
                                                    {new Date(m.date).toLocaleDateString()} — {m.title}
                                                </option>
                                            ))
                                        }
                                    </select>
                                </div>
                            </div>

                            <Button onClick={handleSaveGoal} disabled={isSaving} className="w-full justify-center">
                                {isSaving ? 'Сохранение...' : 'Сохранить цели'}
                            </Button>
                        </div>
                    </div>
                )
            }

            {/* 6. Delete Goal Confirmation Modal */}
            <ConfirmationModal
                isOpen={isDeleteGoalModalOpen}
                onClose={() => setIsDeleteGoalModalOpen(false)}
                onConfirm={handleConfirmDeleteGoal}
                title="Удалить цель?"
                message="Вы уверены, что хотите удалить эту цель? Это действие необратимо."
                confirmText="Удалить"
                confirmVariant="danger"
            />
            {/* 7. Goal Completion Confirmation Modal */}
            <ConfirmationModal
                isOpen={isGoalCompletionModalOpen}
                onClose={() => setIsGoalCompletionModalOpen(false)}
                onConfirm={handleConfirmGoalCompletion}
                title="Отличная работа! 🎉"
                message={`У вас была цель "${goalToComplete?.title}" на эту встречу.Получилось её выполнить ? `}
                confirmText="Да, получилось!"
                confirmVariant="success"
                icon={Trophy}
            />
        </div >
    );
};

export default MeetingsView;
