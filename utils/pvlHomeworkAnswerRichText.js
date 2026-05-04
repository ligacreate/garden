import DOMPurify from 'dompurify';

/**
 * Префильтр перед DOMPurify: вырезает Office/Word-мусор целиком (с содержимым).
 * DOMPurify в whitelist-режиме при KEEP_CONTENT:true по умолчанию режет тег, но
 * оставляет текст внутри — поэтому CSS из <style> и т.п. иначе вылезают как plain text.
 */
export function stripMsOfficeHtmlNoise(dirty) {
    return String(dirty || '')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<\/?[a-z]+:[a-z][^>]*>/gi, '');
}

/** Те же семантические теги, что и в RichEditor (ответы менти / ментора). */
const PURIFY_OPTS = {
    ALLOWED_TAGS: [
        'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 's',
        'a', 'img', 'blockquote', 'pre', 'code',
        'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'span',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'colspan', 'rowspan'],
    ALLOW_DATA_ATTR: false,
};

/**
 * Безопасный HTML ответа домашки (в т.ч. data:image из загрузки файла).
 */
export function sanitizeHomeworkAnswerHtml(dirty) {
    const cleaned = stripMsOfficeHtmlNoise(dirty);
    return DOMPurify.sanitize(String(cleaned || ''), PURIFY_OPTS);
}

/** Проверка «пустого» ответа с учётом HTML (для чек-листа и валидации). */
export function homeworkAnswerPlainText(html) {
    const cleaned = stripMsOfficeHtmlNoise(html);
    const t = DOMPurify.sanitize(String(cleaned || ''), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    return String(t || '').replace(/\u00a0/g, ' ').trim();
}

export function isHomeworkAnswerEmpty(html) {
    return homeworkAnswerPlainText(html).length === 0;
}

/** PostgREST/старые записи могут отдавать JSON объектом или строкой. */
export function coerceAnswersJsonObject(raw) {
    if (raw == null) return null;
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        const t = raw.trim();
        if (!t) return null;
        try {
            const p = JSON.parse(t);
            return p && typeof p === 'object' && !Array.isArray(p) ? p : null;
        } catch {
            return null;
        }
    }
    return null;
}

/** Чистит HTML-поля анкеты/чек-листа перед сохранением (мусор буфера, комментарии Word). */
export function normalizeAnswersJsonForStore(answersJson) {
    if (!answersJson || typeof answersJson !== 'object') return answersJson;
    const out = { ...answersJson };
    for (const k of Object.keys(out)) {
        const v = out[k];
        if (typeof v === 'string') {
            out[k] = sanitizeHomeworkAnswerHtml(v);
        }
    }
    return out;
}

/** Загрузка картинки в ответ: только data URL, без внешних URL. */
export function pvlReadImageFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ''));
        r.onerror = () => reject(new Error('Не удалось прочитать файл'));
        r.readAsDataURL(file);
    });
}
