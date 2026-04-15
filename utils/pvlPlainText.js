/**
 * Короткие описания и превью карточек ПВЛ без сырого HTML.
 */

/**
 * HTML или строка с возможными тегами → обычный текст для карточек/списков.
 */
export function pvlHtmlToPlainText(raw, maxLen = 0) {
    let s = String(raw || '');
    if (typeof document !== 'undefined') {
        try {
            const el = document.createElement('div');
            el.innerHTML = s;
            s = el.textContent || el.innerText || '';
        } catch {
            s = s.replace(/<[^>]*>/g, ' ');
        }
    } else {
        s = s.replace(/<[^>]*>/g, ' ');
    }
    s = s
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
    if (maxLen > 0 && s.length > maxLen) {
        s = `${s.slice(0, maxLen - 1).trimEnd()}…`;
    }
    return s;
}

/**
 * Текст для превью карточки: shortDescription, иначе excerpt из тела.
 */
export function pvlMaterialCardExcerpt(item, maxLen = 180) {
    if (!item) return 'Описание появится позже.';
    const short = item.shortDescription;
    if (short != null && String(short).trim() !== '') {
        const p = pvlHtmlToPlainText(String(short), maxLen);
        if (p) return p;
    }
    const body = item.fullDescription || item.description || '';
    const fromBody = pvlHtmlToPlainText(body, maxLen);
    return fromBody || 'Описание появится позже.';
}
