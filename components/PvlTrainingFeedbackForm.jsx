import React, { useEffect, useState } from 'react';
import ModalShell from './ModalShell';
import { pvlPostgrestApi } from '../services/pvlPostgrestApi';

const MIN_WHAT_WORKED = 50;

function Field({ label, hint, required, children }) {
    return (
        <div>
            <label className="block text-sm font-medium text-[#4A3728] mb-1">
                {label}{required ? <span className="text-red-500"> *</span> : null}
            </label>
            {hint ? <p className="text-[11px] text-[#7A6758] mb-2">{hint}</p> : null}
            {children}
        </div>
    );
}

export default function PvlTrainingFeedbackForm({
    isOpen,
    onClose,
    sessionId,
    authorId,
    existingFeedback = null,
    onSaved,
}) {
    const [whatWorked, setWhatWorked] = useState('');
    const [whatToStrengthen, setWhatToStrengthen] = useState('');
    const [oneTechnique, setOneTechnique] = useState('');
    const [openQuestion, setOpenQuestion] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!isOpen) return;
        setWhatWorked(existingFeedback?.text_what_worked || '');
        setWhatToStrengthen(existingFeedback?.text_what_to_strengthen || '');
        setOneTechnique(existingFeedback?.text_one_technique || '');
        setOpenQuestion(existingFeedback?.text_open_question || '');
        setError(null);
    }, [isOpen, existingFeedback]);

    const valid = whatWorked.trim().length >= MIN_WHAT_WORKED;
    const isEdit = !!existingFeedback;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!valid || saving) return;
        setSaving(true);
        setError(null);
        try {
            const row = await pvlPostgrestApi.upsertTrainingFeedback({
                session_id: sessionId,
                author_id: authorId,
                text_what_worked: whatWorked.trim(),
                text_what_to_strengthen: whatToStrengthen.trim(),
                text_one_technique: oneTechnique.trim(),
                text_open_question: openQuestion.trim(),
            });
            onSaved?.(row);
            onClose?.();
        } catch (err) {
            setError(String(err?.message || 'Не удалось сохранить отзыв'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <ModalShell
            isOpen={isOpen}
            onClose={onClose}
            title={isEdit ? 'Редактировать отзыв' : 'Оставить отзыв'}
            size="lg"
            footer={
                <div className="flex items-start justify-between gap-3">
                    <p className="text-xs text-[#7A6758] max-w-sm">
                        Дедлайн методички — 48 часов после встречи. Платформа форму не закрывает,
                        но лучше успеть пока в памяти.
                    </p>
                    <div className="flex gap-2 shrink-0">
                        <button type="button" onClick={onClose} className="text-sm text-[#7A6758] hover:text-[#4A3728] px-4 py-2">Отмена</button>
                        <button
                            type="submit"
                            form="pvl-training-feedback-form"
                            disabled={!valid || saving}
                            className="text-sm bg-[#4A3728] text-white rounded-full px-5 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {saving ? 'Сохраняем…' : (isEdit ? 'Сохранить изменения' : 'Отправить отзыв')}
                        </button>
                    </div>
                </div>
            }
        >
            <form id="pvl-training-feedback-form" onSubmit={handleSubmit} className="space-y-5">
                <Field label="Что в этой встрече сработало" required hint={`Минимум ${MIN_WHAT_WORKED} символов — пара предложений.`}>
                    <textarea
                        value={whatWorked}
                        onChange={(e) => setWhatWorked(e.target.value)}
                        rows={4}
                        className="w-full rounded-xl border border-[#E8D5C4] bg-[#FAF6F2] px-3 py-2 text-sm text-[#4A3728]"
                        placeholder="Два-три конкретных момента."
                    />
                    <div className={`text-[11px] mt-1 ${valid ? 'text-green-600' : 'text-[#7A6758]'}`}>{whatWorked.trim().length}/{MIN_WHAT_WORKED}</div>
                </Field>
                <Field label="Что можно усилить" hint="Безоценочно и конкретно. Если ничего — можно оставить пустым.">
                    <textarea value={whatToStrengthen} onChange={(e) => setWhatToStrengthen(e.target.value)} rows={3} className="w-full rounded-xl border border-[#E8D5C4] bg-[#FAF6F2] px-3 py-2 text-sm text-[#4A3728]" />
                </Field>
                <Field label="Один приём ведущей, который вы заметили и запомнили" hint="Короткое — одно предложение или название приёма.">
                    <textarea value={oneTechnique} onChange={(e) => setOneTechnique(e.target.value)} rows={2} className="w-full rounded-xl border border-[#E8D5C4] bg-[#FAF6F2] px-3 py-2 text-sm text-[#4A3728]" />
                </Field>
                <Field label="Вопрос, который у вас остался после встречи" hint="Опционально.">
                    <textarea value={openQuestion} onChange={(e) => setOpenQuestion(e.target.value)} rows={2} className="w-full rounded-xl border border-[#E8D5C4] bg-[#FAF6F2] px-3 py-2 text-sm text-[#4A3728]" />
                </Field>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </form>
        </ModalShell>
    );
}
