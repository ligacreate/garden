import React, { useState } from 'react';
import { Search, Plus, Filter, Pencil, X } from 'lucide-react';
import Button from '../components/Button';
import Input from '../components/Input';
import { getRoleLabel } from '../utils/roles';
import ConfirmationModal from '../components/ConfirmationModal';
import ModalShell from '../components/ModalShell';

const PracticesView = ({ user, practices, onAddPractice, onUpdatePractice, onDeletePractice, onNotify }) => {
    const [search, setSearch] = useState('');
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [viewPractice, setViewPractice] = useState(null); // The practice currently being viewed
    const [deletePracticeId, setDeletePracticeId] = useState(null);
    const [formData, setFormData] = useState({ id: null, title: '', time: '', type: '', description: '', icon: '📄' });
    const [selectedCategory, setSelectedCategory] = useState('Все');
    const [timeFilter, setTimeFilter] = useState('all');
    const isAdmin = user?.role === 'admin';

    // Helper to normalize text (capitalize first letter)
    const normalize = (str) => {
        if (!str) return 'Общее';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    };

    // Get unique categories with normalized names (excluding 'Общее' from filters as requested)
    const categories = ['Все', ...new Set(practices.map(p => normalize(p.type)).filter(c => c !== 'Общее'))];

    const filteredPractices = practices.filter(p => {
        const pType = normalize(p.type);
        const matchesCategory = selectedCategory === 'Все' || pType === selectedCategory;
        const matchesSearch = p.title.toLowerCase().includes(search.toLowerCase()) ||
            p.description?.toLowerCase().includes(search.toLowerCase());

        let matchesTime = true;
        if (timeFilter !== 'all') {
            const minutes = parseInt(p.time) || 0;
            if (timeFilter === 'short') matchesTime = minutes >= 5 && minutes <= 15;
            else if (timeFilter === 'medium') matchesTime = minutes >= 20 && minutes <= 30;
            else if (timeFilter === 'long') matchesTime = minutes >= 40;
        }

        return matchesCategory && matchesSearch && matchesTime;
    });

    const handleSave = () => {
        if (!formData.title) return;

        if (formData.id) {
            // Update existing
            onUpdatePractice(formData);
            onNotify("Практика обновлена");
        } else {
            // Create new
            onAddPractice({ ...formData, id: Date.now() });
            onNotify("Практика добавлена");
        }

        setIsEditModalOpen(false);
        setFormData({ id: null, title: '', time: '', type: '', description: '', icon: '📄' });
    };

    const openAddModal = () => {
        setFormData({ id: null, title: '', time: '', type: '', description: '', icon: '📄' });
        setIsEditModalOpen(true);
    };

    const openEditModal = (practice, e) => {
        e.stopPropagation(); // Prevent opening the view modal
        setFormData({ ...practice });
        setIsEditModalOpen(true);
    };

    const canEditPractices = true;

    return (
        <div className="h-full flex flex-col animate-in fade-in duration-700 pb-20 pt-6 px-4 lg:px-0">

            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 w-full gap-3">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-4xl font-light text-slate-800 tracking-tight">База практик</h1>
                        <span className="md:hidden inline-flex items-center justify-center px-2.5 py-1 rounded-full bg-white/80 border border-slate-200 text-xs font-mono text-blue-600">
                            {practices.length}
                        </span>
                    </div>
                    <p className="text-slate-400 mt-1 font-light">Ваша коллекция практик</p>
                </div>
                <div className="text-right hidden md:block">
                    <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">В базе</div>
                    <div className="font-mono text-xl text-blue-600">{practices.length}</div>
                </div>
            </div>

            {/* Search & Filter Controls */}
            <div className="mb-10 w-full">
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-4 items-stretch">
                        <div className="relative w-full sm:flex-1">
                            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-full py-3 pl-12 pr-6 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm"
                                placeholder="Найти практику..."
                            />
                        </div>

                        {/* Time Filter */}
                        <select
                            value={timeFilter}
                            onChange={(e) => setTimeFilter(e.target.value)}
                            className="bg-white border border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider rounded-full px-4 py-2 outline-none focus:border-blue-300 transition-all cursor-pointer h-[44px] sm:h-auto"
                        >
                            <option value="all">Любое время</option>
                            <option value="short">5-15 мин</option>
                            <option value="medium">20-30 мин</option>
                            <option value="long">40+ мин</option>
                        </select>
                    </div>

                    {/* Filter Pills */}
                    <div className="flex flex-wrap gap-2">
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 border ${selectedCategory === cat
                                    ? 'bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-900/20'
                                    : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600'
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Practices Grid */}
            <div className="w-full">
                {filteredPractices.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredPractices.map((practice) => (
                            <div
                                key={practice.id}
                                onClick={() => setViewPractice(practice)}
                                className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 flex flex-col h-full group hover:shadow-xl hover:-translate-y-1 transition-all duration-500 relative cursor-pointer"
                            >
                                {/* Header: Icon/Brand & Edit */}
                                <div className="flex justify-between items-start mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="text-3xl bg-slate-50 w-12 h-12 rounded-2xl flex items-center justify-center border border-slate-100 group-hover:scale-110 transition-transform duration-300">
                                            {practice.icon || '📄'}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-900 text-lg leading-tight">{practice.title}</h3>
                                            {practice.type && (
                                                <span className="px-3 py-1 mt-2 inline-block bg-white border border-dashed border-slate-300 rounded-full text-slate-600 text-xs font-medium">
                                                    {practice.type}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Edit Button (Instead of Rating) */}
                                    {canEditPractices && (
                                        <button
                                            onClick={(e) => openEditModal(practice, e)}
                                            className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-all"
                                        >
                                            <Pencil size={18} />
                                        </button>
                                    )}
                                </div>

                                {/* Body: Description */}
                                <div className="flex-1">
                                    <p className="text-slate-600 text-[15px] leading-relaxed line-clamp-4">
                                        {practice.description || "Описание отсутствует..."}
                                    </p>
                                </div>

                                {/* Footer Removed as requested */}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20">
                        <div className="text-6xl mb-4">🌪️</div>
                        <h3 className="text-xl font-medium text-slate-900 mb-2">Ничего не найдено</h3>
                        <p className="text-slate-500">Попробуйте изменить параметры поиска или фильтры</p>
                    </div>
                )}
            </div>

            {/* Admin Add Button */}
            {canEditPractices && (
                <div className="fixed bottom-8 right-8 z-30">
                    <button
                        onClick={openAddModal}
                        className="p-4 bg-slate-900 text-white rounded-full hover:bg-slate-800 hover:scale-105 transition-all shadow-xl shadow-slate-900/30"
                    >
                        <Plus size={24} />
                    </button>
                </div>
            )}

            {/* Edit/Create Modal */}
            <ModalShell
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                title={formData.id ? 'Редактировать практику' : 'Новая практика'}
                size="md"
            >
                <div className="space-y-4">
                    <Input
                        label="Название"
                        value={formData.title}
                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                        placeholder="Например: Утренняя настройка"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input
                            label="Время"
                            value={formData.time}
                            onChange={e => setFormData({ ...formData, time: e.target.value })}
                            placeholder="15 мин"
                        />
                        <Input
                            label="Тема"
                            value={formData.type}
                            onChange={e => setFormData({ ...formData, type: e.target.value })}
                            placeholder="Отношения, рост"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-700 mb-2 block">Иконка</label>
                        <div className="grid grid-cols-5 gap-2">
                            {['📄', '🎥', '🧘‍♀️', '✨', '🎧', '⚡️', '🌱', '🔮', '🧠', '❤️'].map(ico => (
                                <button
                                    key={ico}
                                    onClick={() => setFormData({ ...formData, icon: ico })}
                                    className={`h-10 rounded-xl border flex items-center justify-center text-lg transition-all ${formData.icon === ico ? 'border-blue-500 bg-blue-50 scale-105' : 'border-slate-200 hover:border-slate-300'}`}
                                >
                                    {ico}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-700 mb-2 block">Описание</label>
                        <textarea
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 outline-none h-32 resize-none text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                            placeholder="Описание практики, физический и смысловой результат, вопросы для рефлексивного отклика"
                            value={formData.description}
                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                        />
                    </div>
                    <div className="flex gap-3 pt-2">
                        {formData.id && (
                            <Button
                                variant="danger"
                                className="!w-auto"
                                icon={X}
                                onClick={() => setDeletePracticeId(formData.id)}
                            />
                        )}
                        <Button variant="secondary" onClick={() => setIsEditModalOpen(false)} className="flex-1">Отмена</Button>
                        <Button onClick={handleSave} className="flex-1">Сохранить</Button>
                    </div>
                </div>
            </ModalShell>

            {/* View Full Practice Modal */}
            <ModalShell
                isOpen={!!viewPractice}
                onClose={() => setViewPractice(null)}
                size="lg"
            >
                {viewPractice && (
                    <>
                        <div className="flex items-start gap-6 mb-8">
                            <div className="text-5xl bg-blue-50 w-24 h-24 rounded-3xl flex items-center justify-center border border-blue-100 shadow-sm flex-shrink-0">
                                {viewPractice.icon || '📄'}
                            </div>
                            <div>
                                <h2 className="text-3xl font-bold text-slate-900 mb-3">{viewPractice.title}</h2>
                                <div className="flex gap-2">
                                    {viewPractice.type && <span className="px-3 py-1 bg-white text-slate-600 rounded-full text-sm font-medium border border-dashed border-slate-300">{viewPractice.type}</span>}
                                    {viewPractice.time && <span className="px-3 py-1 bg-white text-slate-600 rounded-full text-sm font-medium border border-dashed border-slate-300">{viewPractice.time}</span>}
                                </div>
                            </div>
                        </div>

                        <div className="prose prose-slate max-w-none">
                            {viewPractice.description && (
                                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 text-lg text-slate-700 leading-relaxed whitespace-pre-wrap font-medium italic mb-6">
                                    {viewPractice.description}
                                </div>
                            )}
                        </div>

                        <div className="mt-10 pt-6 border-t border-slate-100 flex justify-end gap-3">
                            {isAdmin && (
                                <Button variant="secondary" onClick={() => { setViewPractice(null); openEditModal(viewPractice, { stopPropagation: () => { } }); }}>Редактировать</Button>
                            )}
                            <Button onClick={() => setViewPractice(null)}>Закрыть</Button>
                        </div>
                    </>
                )}
            </ModalShell>

            <ConfirmationModal
                isOpen={!!deletePracticeId}
                onClose={() => setDeletePracticeId(null)}
                onConfirm={() => {
                    if (onDeletePractice && deletePracticeId) onDeletePractice(deletePracticeId);
                    setIsEditModalOpen(false);
                    setDeletePracticeId(null);
                }}
                title="Удалить практику?"
                message="Это действие невозможно отменить."
                confirmText="Удалить"
                confirmVariant="danger"
            />
        </div>
    );
};

export default PracticesView;
