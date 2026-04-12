import React, { useState } from 'react';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import Button from './Button';

const CalendarWidget = ({ meetings, onPlanClick, selectedMonth, onMonthChange }) => {
    // Helper to get days in a month
    const getDaysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const daysInMonth = getDaysInMonth(selectedMonth);

    // Helper to get day of week for the 1st of the month (0 = Sunday, 1 = Monday, etc.)
    // We want Monday to be 0 for grid offset if we were doing a real calendar, 
    // but the request asked for a "Generic Grid" logic or "Compact Calendar".
    // Let's stick to the visual grid requested: "Just dates".

    const handlePrevMonth = () => {
        onMonthChange(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        onMonthChange(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1));
    };

    return (
        <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="font-bold text-slate-900">Календарь</h3>
                    <div className="flex items-center gap-2 mt-1">
                        <button onClick={handlePrevMonth} className="p-1 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600">
                            <ChevronLeft size={16} />
                        </button>
                        <span className="text-slate-500 text-sm capitalize font-medium min-w-[90px] text-center">
                            {selectedMonth.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}
                        </span>
                        <button onClick={handleNextMonth} className="p-1 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600">
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-2 mb-6 text-sm">
                <div className="text-center text-slate-300 text-[10px] uppercase font-bold py-2">Пн</div>
                <div className="text-center text-slate-300 text-[10px] uppercase font-bold py-2">Вт</div>
                <div className="text-center text-slate-300 text-[10px] uppercase font-bold py-2">Ср</div>
                <div className="text-center text-slate-300 text-[10px] uppercase font-bold py-2">Чт</div>
                <div className="text-center text-slate-300 text-[10px] uppercase font-bold py-2">Пт</div>
                <div className="text-center text-slate-300 text-[10px] uppercase font-bold py-2">Сб</div>
                <div className="text-center text-slate-300 text-[10px] uppercase font-bold py-2">Вс</div>

                {/* Days */}
                {/* 1. Empty slots for previous month (simplified: assuming 1st is Mon for now or just listing) 
                    Let's do it properly:
                */}
                {(() => {
                    const firstDay = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1).getDay(); // 0 = Sun
                    const offset = firstDay === 0 ? 6 : firstDay - 1; // Mon=0, Sun=6
                    const blanks = Array(offset).fill(null);
                    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

                    return [...blanks, ...days].map((day, i) => {
                        if (!day) return <div key={`blank-${i}`} />;

                        // Check for meetings on this day
                        const dateStr = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), day).toDateString();

                        const dayMeetings = meetings.filter(m => new Date(m.date).toDateString() === dateStr);
                        let indicator = null;

                        // Priority: Red (Pending result) > Blue (Planned) > Green (Completed)
                        // Actually spec says: Red (Pending), Blue (Planned), Green (Completed)
                        // If multiple, show the most critical? Or multiple dots? 
                        // Spec says "colored dots". Let's show single dot with priority.

                        const now = new Date();
                        now.setHours(0, 0, 0, 0);
                        const currentDayDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), day);

                        if (dayMeetings.length > 0) {
                            if (dayMeetings.some(m => !['completed', 'cancelled'].includes(m.status) && new Date(m.date) < now)) {
                                indicator = 'bg-red-500'; // Pending result
                            } else if (dayMeetings.some(m => m.status === 'completed')) {
                                indicator = 'bg-emerald-500';
                            } else if (dayMeetings.some(m => m.status === 'planned')) {
                                indicator = 'bg-blue-500';
                            }
                        }

                        return (
                            <div key={i} className={`aspect-square rounded-full flex flex-col items-center justify-center relative cursor-pointer hover:bg-slate-50 transition-colors ${indicator ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
                                {day}
                                {indicator && <div className={`w-1.5 h-1.5 rounded-full ${indicator} absolute bottom-1.5`} />}
                            </div>
                        );
                    });
                })()}
            </div>

            <div className="mt-auto">
                <Button onClick={onPlanClick} className="w-full justify-center">
                    <Plus size={18} /> Запланировать
                </Button>
            </div>
        </div>
    );
};

export default CalendarWidget;
