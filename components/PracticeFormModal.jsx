import React, { useEffect, useState } from 'react';
import { X, Gem } from 'lucide-react';
import Button from './Button';
import Input from './Input';
import ModalShell from './ModalShell';

const ICON_OPTIONS = ['📄', '🎥', '🧘‍♀️', '✨', '🎧', '⚡️', '🌱', '🔮', '🧠', '❤️'];

const buildEmpty = (defaultIsPublished) => ({
    id: null,
    title: '',
    duration_minutes: '',
    type: '',
    short_goal: '',
    instruction_short: '',
    instruction_full: '',
    reflection_questions: '',
    description: '',
    icon: '📄',
    is_published: !!defaultIsPublished
});

const PracticeFormModal = ({
    isOpen,
    onClose,
    initial = null,
    defaultIsPublished = false,
    onSubmit,
    onDelete,
    titleOverride
}) => {
    const [formData, setFormData] = useState(buildEmpty(defaultIsPublished));
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        if (initial) {
            setFormData({
                ...buildEmpty(defaultIsPublished),
                ...initial,
                duration_minutes: initial?.duration_minutes ?? '',
                is_published: !!initial?.is_published
            });
        } else {
            setFormData(buildEmpty(defaultIsPublished));
        }
    }, [isOpen, initial, defaultIsPublished]);

    const isEdit = !!formData.id;
    const wasPublishedInitially = !!initial?.is_published;

    const handleSave = async () => {
        if (!formData.title?.trim() || saving) return;
        const duration = parseInt(formData.duration_minutes, 10);
        const normalizedDuration = Number.isNaN(duration) || duration <= 0 ? null : duration;
        const payload = {
            ...formData,
            duration_minutes: normalizedDuration,
            // time оставляем для backward-compat: старые места читают
            // через parseDurationMinutes, который умеет fallback на time.
            // Колонку time дропнем отдельной миграцией позже.
            time: normalizedDuration ? `${normalizedDuration} мин` : (formData.time || '')
        };
        setSaving(true);
        try {
            await onSubmit(payload);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = () => {
        if (!isEdit || !onDelete) return;
        onDelete(formData.id);
    };

    const modalTitle = titleOverride || (isEdit ? 'Редактировать практику' : 'Новая практика');

    return (
        <ModalShell isOpen={isOpen} onClose={onClose} title={modalTitle} size="full" align="start">
            <div className="space-y-4">
                <Input
                    label="Название"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Например: Утренняя настройка"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                        label="Длительность (мин)"
                        type="number"
                        value={formData.duration_minutes}
                        onChange={e => setFormData({ ...formData, duration_minutes: e.target.value })}
                        placeholder="15"
                    />
                    <Input
                        label="Тема"
                        value={formData.type}
                        onChange={e => setFormData({ ...formData, type: e.target.value })}
                        placeholder="Отношения, рост"
                    />
                </div>
                <Input
                    label="Краткая цель"
                    value={formData.short_goal}
                    onChange={e => setFormData({ ...formData, short_goal: e.target.value })}
                    placeholder="Что должна дать практика?"
                />
                <div>
                    <label className="text-sm font-medium text-slate-700 mb-2 block">Иконка</label>
                    <div className="grid grid-cols-5 gap-2">
                        {ICON_OPTIONS.map(ico => (
                            <button
                                key={ico}
                                type="button"
                                onClick={() => setFormData({ ...formData, icon: ico })}
                                className={`h-10 rounded-xl border flex items-center justify-center text-lg transition-all ${formData.icon === ico ? 'border-blue-500 bg-blue-50 scale-105' : 'border-slate-200 hover:border-slate-300'}`}
                            >
                                {ico}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="text-sm font-medium text-slate-700 mb-2 block">Инструкция (короткая)</label>
                    <textarea
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 outline-none h-24 resize-none text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                        placeholder="Короткий формат для карточки"
                        value={formData.instruction_short}
                        onChange={e => setFormData({ ...formData, instruction_short: e.target.value })}
                    />
                </div>
                <div>
                    <label className="text-sm font-medium text-slate-700 mb-2 block">Инструкция (полная)</label>
                    <textarea
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 outline-none h-32 resize-y text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                        placeholder="Полный пошаговый вариант (раскрывающийся блок)"
                        value={formData.instruction_full}
                        onChange={e => setFormData({ ...formData, instruction_full: e.target.value })}
                    />
                </div>
                <div>
                    <label className="text-sm font-medium text-slate-700 mb-2 block">Вопросы для рефлексивного отклика</label>
                    <textarea
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 outline-none h-28 resize-y text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                        placeholder="По одному вопросу на строку"
                        value={formData.reflection_questions}
                        onChange={e => setFormData({ ...formData, reflection_questions: e.target.value })}
                    />
                </div>
                <div>
                    <label className="text-sm font-medium text-slate-700 mb-2 block">Описание</label>
                    <textarea
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 outline-none h-32 resize-none text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                        placeholder="Описание практики и контекст применения"
                        value={formData.description}
                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                    />
                </div>

                {/* Treasury publish toggle */}
                <label className="flex items-start gap-3 p-4 rounded-2xl border border-slate-200 bg-slate-50/60 cursor-pointer hover:border-blue-300 transition-all">
                    <input
                        type="checkbox"
                        className="mt-1 h-5 w-5 accent-blue-600 cursor-pointer"
                        checked={!!formData.is_published}
                        onChange={(e) => setFormData({ ...formData, is_published: e.target.checked })}
                    />
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                            <Gem size={16} className="text-blue-600" strokeWidth={1.8} />
                            Опубликовать в Сокровищнице
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                            Видна всем ведущим в общей библиотеке. {!wasPublishedInitially && '+40 семян за первую публикацию.'}
                        </div>
                    </div>
                </label>

                <div className="flex gap-3 pt-2">
                    {isEdit && onDelete && (
                        <Button
                            variant="danger"
                            className="!w-auto"
                            icon={X}
                            onClick={handleDelete}
                        />
                    )}
                    <Button variant="secondary" onClick={onClose} className="flex-1" disabled={saving}>Отмена</Button>
                    <Button onClick={handleSave} className="flex-1" disabled={saving || !formData.title?.trim()}>
                        {saving ? 'Сохраняем…' : 'Сохранить'}
                    </Button>
                </div>
            </div>
        </ModalShell>
    );
};

export default PracticeFormModal;
