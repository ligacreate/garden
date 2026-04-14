/**
 * Импорт учебных .md в ПВЛ: конвертация в HTML для полей fullDescription (библиотека / уроки).
 * Сохраняются GFM-таблицы, нумерованные списки, <br> в ячейках, типовой Markdown.
 * Вставки Obsidian ![[ref]] превращаются в безопасный блок с сохранением имени файла.
 */
import { marked } from 'marked';

function escapeForCodeContent(s) {
    return String(s || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

function escapeHtmlAttr(s) {
    return String(s || '')
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('\n', ' ');
}

/**
 * Строки вида ![[Pasted image x.png]] — не стандартный MD; даём читаемый плейсхолдер без потери имени.
 */
function preprocessObsidianEmbeds(md) {
    return String(md || '').replace(/!\[\[([^\]]+)\]\]/g, (_, ref) => {
        const attr = escapeHtmlAttr(ref);
        const inner = escapeForCodeContent(ref);
        return `<p class="pvl-wiki-embed rounded-lg border border-dashed border-slate-200 bg-slate-50/90 px-3 py-2 text-sm text-slate-600" data-pvl-wiki-ref="${attr}">Вложение: <code>${inner}</code></p>`;
    });
}

/**
 * Markdown → HTML для сохранения в карточке материала (импорт .md в учительской).
 */
export function markdownToPvlHtml(markdown = '') {
    const src = preprocessObsidianEmbeds(String(markdown || '').replace(/\r\n/g, '\n'));
    const html = marked.parse(src, { async: false });
    return typeof html === 'string' ? html : '';
}
