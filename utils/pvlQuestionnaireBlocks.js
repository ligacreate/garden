/**
 * Схема анкеты в homework_config: assignmentType questionnaire + blocks[].
 * Ответы ученицы — answersJson[id] = строка (short_text / long_text) или HTML для long при необходимости.
 */

import { homeworkAnswerPlainText } from './pvlHomeworkAnswerRichText';

export function createDefaultQuestionnaireBlocks() {
    return [
        { id: 'qb-text-1', type: 'text', content: '<p>Заполните поля ниже.</p>' },
        { id: 'qb-q-1', type: 'short_text', label: 'Краткий ответ', required: false },
        { id: 'qb-q-2', type: 'long_text', label: 'Развёрнутый ответ', required: false },
    ];
}

export function newQuestionnaireBlockId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `qb-${crypto.randomUUID().slice(0, 8)}`;
    return `qb-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export function normalizeQuestionnaireBlocks(blocks) {
    if (!Array.isArray(blocks) || blocks.length === 0) return createDefaultQuestionnaireBlocks();
    return blocks.map((b, i) => {
        const typeRaw = String(b?.type || 'short_text').toLowerCase();
        const type = typeRaw === 'text' ? 'text' : typeRaw === 'long_text' ? 'long_text' : 'short_text';
        const id = String(b?.id || '').trim() || newQuestionnaireBlockId();
        if (type === 'text') {
            return { id, type: 'text', content: String(b.content || '') };
        }
        return {
            id,
            type,
            label: String(b.label || `Вопрос ${i + 1}`).trim(),
            required: !!b.required,
        };
    });
}

function answerNonEmpty(raw, blockType) {
    if (raw == null) return false;
    const s = String(raw).trim();
    if (!s) return false;
    if (blockType === 'long_text') {
        const plain = homeworkAnswerPlainText(s);
        return plain.trim().length > 0;
    }
    return s.length > 0;
}

/** Все обязательные поля short_text / long_text заполнены. */
export function isQuestionnaireAnswersComplete(blocks, answersJson) {
    const a = answersJson && typeof answersJson === 'object' ? answersJson : {};
    for (const b of blocks || []) {
        if (!b || b.type === 'text' || !b.required) continue;
        if (b.type !== 'short_text' && b.type !== 'long_text') continue;
        if (!answerNonEmpty(a[b.id], b.type)) return false;
    }
    return true;
}

/** Хотя бы один ответный блок (вопрос). */
export function questionnaireHasAnswerBlocks(blocks) {
    return (blocks || []).some((b) => b && (b.type === 'short_text' || b.type === 'long_text'));
}
