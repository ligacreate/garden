/**
 * Схема анкеты в homework_config: assignmentType questionnaire + blocks[].
 * Новый тип блока qa_pair: { id, type: 'qa_pair', question: string }
 * Ответы ученицы — answersJson[id] = строка (plain text для qa_pair).
 * Устаревшие типы text/short_text/long_text поддерживаются для обратной совместимости.
 */

import { homeworkAnswerPlainText } from './pvlHomeworkAnswerRichText';

export function createDefaultQuestionnaireBlocks() {
    return [
        { id: 'qb-qa-1', type: 'qa_pair', question: '' },
    ];
}

export function newQuestionnaireBlockId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `qb-${crypto.randomUUID().slice(0, 8)}`;
    return `qb-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export function normalizeQuestionnaireBlocks(blocks) {
    if (!Array.isArray(blocks) || blocks.length === 0) return createDefaultQuestionnaireBlocks();
    return blocks.map((b, i) => {
        const typeRaw = String(b?.type || 'qa_pair').toLowerCase();
        const id = String(b?.id || '').trim() || newQuestionnaireBlockId();
        if (typeRaw === 'qa_pair') {
            return { id, type: 'qa_pair', question: String(b.question || '').trim() };
        }
        // Устаревшие типы
        const type = typeRaw === 'text' ? 'text' : typeRaw === 'long_text' ? 'long_text' : 'short_text';
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

/** Все обязательные поля заполнены (qa_pair не обязательны). */
export function isQuestionnaireAnswersComplete(blocks, answersJson) {
    const a = answersJson && typeof answersJson === 'object' ? answersJson : {};
    for (const b of blocks || []) {
        if (!b || b.type === 'text' || b.type === 'qa_pair') continue;
        if (!b.required) continue;
        if (b.type !== 'short_text' && b.type !== 'long_text') continue;
        if (!answerNonEmpty(a[b.id], b.type)) return false;
    }
    return true;
}

/** Хотя бы один блок с ответом (вопрос). */
export function questionnaireHasAnswerBlocks(blocks) {
    return (blocks || []).some((b) => b && (b.type === 'short_text' || b.type === 'long_text' || b.type === 'qa_pair'));
}
