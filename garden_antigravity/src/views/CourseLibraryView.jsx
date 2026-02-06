import React, { useState } from 'react';
import { Search, Bell, Moon, BookOpen, Star, MoreHorizontal, MessageSquare, Play, FileText, Video } from 'lucide-react';
import Button from '../components/Button';
import Input from '../components/Input';

const COURSES = [
    {
        id: 1,
        title: "Пиши, веди, люби",
        description: "Курс для ведущих встреч с письменными практиками. Освойте искусство бережной модерации и создания смыслов.",
        image: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&q=80&w=800",
        access: "Доступен для абитуриентов, стажеров, ведущих",
        tag: "Курсы"
    },
    {
        id: 2,
        title: "Расти",
        description: "Курс для развития личного бренда ведущей. Как проявляться, привлекать своих людей и монетизировать талант.",
        image: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&q=80&w=800",
        access: "Доступен для стажеров, ведущих",
        tag: "Курсы"
    },
    {
        id: 3,
        title: "Промты, ассистенты, лайфхаки",
        description: "Полезные рекомендации для ведущих. Коллекция проверенных инструментов для упрощения работы.",
        image: "https://images.unsplash.com/photo-1488190211105-8b0e65b80b4e?auto=format&fit=crop&q=80&w=800",
        access: "Доступен для стажеров, ведущих",
        tag: "Полезное"
    },
    {
        id: 4,
        title: "Менторский курс",
        description: "Курс для кураторов ПВЛ. Углубленное обучение наставничеству и поддержке других ведущих.",
        image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=800",
        access: "Доступен для ведущих",
        tag: "Курсы"
    }
];

const CourseLibraryView = ({ user, knowledgeBase = [] }) => {
    const [selectedFilter, setSelectedFilter] = useState('Все');
    const filters = ['Все', 'Курсы', 'Полезное'];

    const filteredCourses = COURSES.filter(course => {
        const role = user?.role;

        // Applicant: Only PVL
        if (role === 'applicant' && course.title !== "Пиши, веди, люби") {
            return false;
        }

        // Intern: PVL and Prompts only
        if (role === 'intern') {
            const allowed = ["Пиши, веди, люби", "Промты, ассистенты, лайфхаки"];
            if (!allowed.includes(course.title)) return false;
        }

        // Filter tag
        if (selectedFilter !== 'Все' && course.tag !== selectedFilter) {
            return false;
        }
        return true;
    });

    return (
        <div className="h-full flex flex-col pt-6 px-4 lg:px-0 animate-in fade-in pb-12">

            {/* Header / Top Bar */}
            <div className="flex justify-between items-end mb-10">
                <div>
                    <h1 className="text-4xl font-light text-slate-800 tracking-tight">Библиотека</h1>
                    <p className="text-slate-400 mt-1 font-light">Обучающие материалы и курсы</p>
                </div>
                <div className="text-right hidden md:block">
                    <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Материалов</div>
                    <div className="font-mono text-xl text-blue-600">{COURSES.length}</div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-8 mb-8">
                <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-none">
                    {filters.map(f => (
                        <button
                            key={f}
                            onClick={() => setSelectedFilter(f)}
                            className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all ${selectedFilter === f
                                ? 'bg-slate-900 text-white shadow-lg shadow-slate-200'
                                : 'bg-white/80 text-slate-600 hover:bg-white border border-white/50'
                                }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Course Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredCourses.map(course => {
                    const materials = knowledgeBase.filter(k => k.category === course.title);

                    return (
                        <div key={course.id} className="bg-white/80 backdrop-blur-xl p-4 rounded-[2.5rem] shadow-sm hover:shadow-md transition-all border border-white/50 group flex flex-col h-full">

                            {/* Image */}
                            <div className="h-48 w-full rounded-[30px] overflow-hidden mb-5 relative flex-shrink-0">
                                <img src={course.image} alt={course.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                            </div>

                            {/* Content */}
                            <div className="px-2 pb-2 flex-1 flex flex-col">
                                <div className="mb-3">
                                    <h3 className="text-xl font-bold text-slate-900 leading-tight mb-2">{course.title}</h3>
                                </div>

                                <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                                    {course.description}
                                </p>

                                {/* Materials Section */}
                                <div className="mb-6 space-y-2">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Материалы</h4>
                                    {materials.length === 0 ? (
                                        <p className="text-xs text-slate-400 italic">Нет материалов</p>
                                    ) : (
                                        <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                                            {materials.map(m => (
                                                <a key={m.id} href={m.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 bg-white/50 hover:bg-white rounded-2xl transition-all border border-transparent hover:border-blue-100 group/item">
                                                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover/item:scale-110 transition-transform shadow-sm">
                                                        {m.type === 'Видео' ? <Video size={14} /> : <FileText size={14} />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-medium text-slate-800 truncate group-hover/item:text-blue-700 transition-colors">{m.title}</div>
                                                    </div>
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="mt-auto pt-4 border-t border-slate-50">
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold">
                                        <Star size={12} className="fill-blue-700" />
                                        {course.access}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default CourseLibraryView;
