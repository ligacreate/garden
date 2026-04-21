import DOMPurify from 'dompurify';

/**
 * Word/браузер при вставке часто добавляют HTML-комментарии; DOMPurify их удаляет,
 * из‑за чего текст между ними пропадает при рендере через innerHTML.
 */
export function stripMsOfficeHtmlNoise(dirty) {
    return String(dirty || '')
        .replace(/<!--\s*StartFragment\s*-->/gi, '')
        .replace(/<!--\s*EndFragment\s*-->/gi, '');
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

/** Загрузка картинки в ответ: только data URL, без внешних URL. */
export function pvlReadImageFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ''));
        r.onerror = () => reject(new Error('Не удалось прочитать файл'));
        r.readAsDataURL(file);
    });
}
