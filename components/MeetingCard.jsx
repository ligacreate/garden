import React, { useState } from 'react';
import { Calendar, Clock, CheckCircle, XCircle, ChevronDown, ChevronUp, Edit2, AlertCircle, Trash2, Copy } from 'lucide-react';
import Button from './Button';
import { getMeetingInstant, getMeetingTimezone, isMeetingPast } from '../utils/meetingTime';

const MeetingCard = ({
    meeting,
    users = [],
    onEdit,
    onResult,
    onCancel,
    onDelete,
    onUpdate,
    onDuplicate,
    onRescheduleCancelled
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Helpers
    const isPast = isMeetingPast(meeting);
    const isPlanned = meeting.status === 'planned';

    // Auto-detect "Pending" state for UI: Planned but date passed
    const isPending = isPlanned && isPast;

    // Effective status for UI rendering
    const status = isPending ? 'pending' : (meeting.status || 'planned');

    const coHostNames = (Array.isArray(meeting.co_hosts) ? meeting.co_hosts : [])
        .map(id => users.find(u => u.id === id)?.name)
        .filter(Boolean);
    const hostUser = users.find(u => u.id === meeting.user_id);
    const isInternHosted = hostUser?.role === 'intern';

    const getStatusColor = () => {
        switch (status) {
            case 'planned': return 'bg-blue-50 text-blue-600';
            case 'pending': return 'bg-amber-50 text-amber-600';
            case 'completed': return 'bg-green-50 text-green-600';
            case 'cancelled': return 'bg-slate-100 text-slate-500';
            default: return 'bg-slate-50 text-slate-600';
        }
    };

    const getStatusLabel = () => {
        switch (status) {
            case 'planned': return 'Запланирована';
            case 'pending': return 'Ждет результата';
            case 'completed': return 'Завершена';
            case 'cancelled': return 'Не состоялась';
            default: return 'Черновик';
        }
    };

    const viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const meetingTimezone = getMeetingTimezone(meeting, viewerTz);
    const meetingInstant = meeting.time ? getMeetingInstant(meeting, viewerTz) : null;
    const timeZoneLabel = meetingInstant
        ? new Intl.DateTimeFormat('ru-RU', { timeZone: meetingTimezone, timeZoneName: 'short' })
            .formatToParts(meetingInstant)
            .find(p => p.type === 'timeZoneName')?.value
        : meetingTimezone;
    const localTimeLabel = meetingInstant
        ? new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(meetingInstant)
        : null;
    const showLocalTime = meetingInstant && meetingTimezone && meetingTimezone !== viewerTz;

    const handleDelete = (e) => {
        e.stopPropagation();
        onDelete(meeting.id);
    };

    const handleToggleChecklist = (e, index) => {
        e.stopPropagation();
        if (!onUpdate) return;

        const newChecklist = [...(meeting.checklist || [])];
        if (newChecklist[index]) {
            newChecklist[index] = {
                ...newChecklist[index],
                completed: !newChecklist[index].completed
            };
            onUpdate({ ...meeting, checklist: newChecklist });
        }
    };

    return (
        <div
            className={`surface-card p-6 relative overflow-hidden transition-all duration-300 ${status === 'cancelled' ? 'opacity-75' : 'hover:shadow-[0_20px_60px_-10px_rgba(0,0,0,0.08)] hover:-translate-y-1'}`}
        >
            {/* Header Row */}
            <div
                className="flex justify-between items-start cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getStatusColor()}`}>
                            {getStatusLabel()}
                        </div>
                        <div className="text-xs text-slate-400 font-medium flex items-center gap-1">
                            <Calendar size={12} />
                            {meeting.date ? new Date(`${meeting.date}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : 'Дата не указана'}
                        </div>
                    </div>
                    <h3 className={`text-xl font-display font-semibold text-slate-900 mb-1 ${status === 'cancelled' ? 'line-through text-slate-400' : ''}`}>
                        {meeting.title || 'Без названия'}
                    </h3>
                    {meeting.time && (
                        <div className="text-sm text-slate-600 flex flex-wrap items-center gap-2">
                            <Clock size={14} />
                            <span>{meeting.time}{timeZoneLabel ? ` ${timeZoneLabel}` : ''}</span>
                            {meeting.duration ? (
                                <span className="text-slate-500">• {meeting.duration} мин</span>
                            ) : null}
                            {showLocalTime && (
                                <span className="text-xs text-slate-400">
                                    • у вас будет {localTimeLabel}
                                </span>
                            )}
                        </div>
                    )}
                    {coHostNames.length > 0 && (
                        <div className="text-xs text-slate-500 mb-1">
                            Со‑ведущие: <span className="font-medium text-slate-700">{coHostNames.join(', ')}</span>
                        </div>
                    )}
                    {isInternHosted && (
                        <div className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full inline-flex items-center gap-1 mt-1 mb-1">
                            Встречу проводит стажер
                        </div>
                    )}
                    {status === 'planned' && (
                        <div className="text-sm text-slate-500 flex items-center gap-2">
                            <Clock size={14} />
                            {meeting.guests ? `Ожидается ~${meeting.guests} чел.` : 'Количество гостей не указано'}
                        </div>
                    )}
                    {status === 'pending' && (
                        <div className="text-sm text-amber-600 font-medium flex items-center gap-2 animate-pulse">
                            <AlertCircle size={14} />
                            Дата прошла, внесите результат!
                        </div>
                    )}
                </div>

                <div className="flex flex-col items-end gap-2">
                    <button className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors">
                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                    {status === 'completed' && (
                        <div className="flex items-center gap-1 text-green-600 font-bold text-sm bg-green-50 px-3 py-1 rounded-full">
                            +{((meeting.guests || 0) * 5) + 50} баллов
                        </div>
                    )}
                </div>
            </div>

            {/* Actions Row (Always visible for Pending) */}
            {status === 'pending' && (
                <div className="mt-6 flex gap-3 animate-in fade-in slide-in-from-top-2">
                    <Button onClick={(e) => { e.stopPropagation(); onResult(meeting); }} icon={CheckCircle} className="flex-1">Внести результат</Button>
                    <Button onClick={(e) => { e.stopPropagation(); onCancel(meeting); }} variant="secondary" icon={XCircle}>Не состоялась</Button>
                </div>
            )}

            {/* Expanded Content */}
            {isExpanded && (
                <div className="mt-6 pt-6 border-t border-slate-100 animate-in fade-in">

                    {/* PLANNED or PENDING: Checklist & Edit */}
                    {(status === 'planned' || status === 'pending') && (
                        <div>
                            <h4 className="font-bold text-slate-900 mb-4 text-sm uppercase tracking-wide">Чеклист подготовки</h4>
                            {meeting.checklist && meeting.checklist.length > 0 ? (
                                <div className="space-y-3">
                                    {meeting.checklist.map((item, idx) => (
                                        <div
                                            key={idx}
                                            className="flex items-center gap-3 text-sm text-slate-600 cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg -ml-1.5 transition-colors group/item"
                                            onClick={(e) => handleToggleChecklist(e, idx)}
                                        >
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${item.completed ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-300 group-hover/item:border-blue-400'}`}>
                                                {item.completed && <CheckCircle size={12} />}
                                            </div>
                                            <span className={item.completed ? 'line-through text-slate-400' : 'group-hover/item:text-slate-900'}>{item.text}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-slate-400 text-sm italic">Чеклист пуст...</p>
                            )}
                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={(e) => { e.stopPropagation(); onEdit(meeting); }}
                                    className="text-blue-600 text-sm font-medium hover:underline flex items-center gap-2"
                                >
                                    <Edit2 size={14} /> Редактировать
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDuplicate?.(meeting); }}
                                    className="text-indigo-600 text-sm font-medium hover:underline flex items-center gap-2"
                                >
                                    <Copy size={14} /> Дублировать
                                </button>
                                <button
                                    onClick={handleDelete}
                                    className="text-red-400 text-sm font-medium hover:underline flex items-center gap-2 hover:text-red-600"
                                >
                                    <Trash2 size={14} /> Удалить
                                </button>
                            </div>
                        </div>
                    )}

                    {/* COMPLETED: Stats & Reflection */}
                    {status === 'completed' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-slate-50 rounded-2xl p-3 text-center">
                                    <div className="text-slate-400 text-[10px] uppercase font-bold mb-1">Гостей</div>
                                    <div className="text-xl font-light text-slate-900">{meeting.guests}</div>
                                </div>
                                <div className="bg-slate-50 rounded-2xl p-3 text-center">
                                    <div className="text-slate-400 text-[10px] uppercase font-bold mb-1">Новеньких</div>
                                    <div className="text-xl font-light text-slate-900">{meeting.new_guests || 0}</div>
                                </div>
                                <div className="bg-slate-50 rounded-2xl p-3 text-center">
                                    <div className="text-slate-400 text-[10px] uppercase font-bold mb-1">Доход</div>
                                    <div className="text-xl font-light text-slate-900">{meeting.income} ₽</div>
                                </div>
                            </div>

                            <div>
                                <h4 className="font-bold text-slate-900 mb-2 text-sm flex items-center gap-2">
                                    <span className="text-green-500">✨</span> Что классно
                                </h4>
                                <p className="text-slate-600 text-sm leading-relaxed bg-green-50/50 p-4 rounded-2xl border border-green-100">
                                    {meeting.keep_notes || 'Нет записей'}
                                </p>
                            </div>

                            <div>
                                <h4 className="font-bold text-slate-900 mb-2 text-sm flex items-center gap-2">
                                    <span className="text-amber-500">🎯</span> Зона роста
                                </h4>
                                <p className="text-slate-600 text-sm leading-relaxed bg-amber-50/50 p-4 rounded-2xl border border-amber-100">
                                    {meeting.change_notes || 'Нет записей'}
                                </p>
                            </div>

                            <div className="flex gap-3 mt-4">
                                <button
                                    onClick={(e) => { e.stopPropagation(); onResult(meeting); }}
                                    className="text-blue-600 text-sm font-medium hover:underline flex items-center gap-2"
                                >
                                    <Edit2 size={14} /> Изменить итоги
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDuplicate?.(meeting); }}
                                    className="text-indigo-600 text-sm font-medium hover:underline flex items-center gap-2"
                                >
                                    <Copy size={14} /> Дублировать
                                </button>
                                <button
                                    onClick={handleDelete}
                                    className="text-red-400 text-sm font-medium hover:underline flex items-center gap-2 hover:text-red-600"
                                >
                                    <Trash2 size={14} /> Удалить
                                </button>
                            </div>
                        </div>
                    )}

                    {/* CANCELLED: Reason */}
                    {status === 'cancelled' && (
                        <div>
                            <div className="mb-4">
                                <h4 className="font-bold text-slate-900 mb-2 text-sm">Причина отмены</h4>
                                <p className="text-slate-500 italic text-sm">{meeting.fail_reason || 'Не указана'}</p>
                            </div>
                            <div className="flex gap-3 mt-4">
                                <button
                                    onClick={(e) => { e.stopPropagation(); onRescheduleCancelled?.(meeting); }}
                                    className="text-indigo-600 text-sm font-medium hover:underline flex items-center gap-2"
                                >
                                    <Copy size={14} /> Перенос встречи
                                </button>
                                <button
                                    onClick={handleDelete}
                                    className="text-red-400 text-sm font-medium hover:underline flex items-center gap-2 hover:text-red-600"
                                >
                                    <Trash2 size={14} /> Удалить
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default MeetingCard;
