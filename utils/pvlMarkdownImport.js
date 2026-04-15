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
 * gfm по умолчанию в marked; breaks — переносы строк как &lt;br&gt; для читаемости импорта.
 */
export function markdownToPvlHtml(markdown = '') {
    const src = preprocessObsidianEmbeds(String(markdown || '').replace(/\r\n/g, '\n'));
    const html = marked.parse(src, { async: false, gfm: true, breaks: true });
    return typeof html === 'string' ? html : '';
}

function peelYamlFrontMatter(text) {
    const normalized = String(text || '').replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    if (lines[0]?.trim() !== '---') return { body: normalized, yamlTitle: '' };
    let end = -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') {
            end = i;
            break;
        }
    }
    if (end === -1) return { body: normalized, yamlTitle: '' };
    const yamlBlock = lines.slice(1, end).join('\n');
    const body = lines.slice(end + 1).join('\n');
    let yamlTitle = '';
    yamlBlock.split('\n').forEach((line) => {
        const m = line.match(/^title:\s*(.+)$/i);
        if (!m) return;
        let v = m[1].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        yamlTitle = v.trim();
    });
    return { body, yamlTitle };
}

function isNoiseListOrHrLine(line) {
    const s = String(line || '').trim();
    if (!s) return false;
    if (/^([-*+]|\d+[.)])\s+/.test(s)) return true;
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(s)) return true;
    return false;
}

/**
 * Импорт .md/.txt: заголовок из YAML / первого ATX-заголовка / первой не списка строки;
 * тело без дублирования заголовка в HTML.
 */
export function parsePvlImportedMarkdownDoc(text = '') {
    const { body: afterYaml, yamlTitle } = peelYamlFrontMatter(text);
    const lines = afterYaml.split('\n');

    let title = String(yamlTitle || '').trim();
    let headingIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        const trimmed = String(lines[i] || '').trim();
        const hm = trimmed.match(/^#{1,6}\s+(.+)$/);
        if (hm) {
            if (!title) title = hm[1].trim();
            headingIndex = i;
            break;
        }
    }

    if (!title) {
        for (let i = 0; i < lines.length; i++) {
            const line = String(lines[i] || '').trim();
            if (!line) continue;
            if (isNoiseListOrHrLine(line)) continue;
            title = line.replace(/^#{1,6}\s*/, '').trim();
            break;
        }
    }

    if (!title) title = 'Материал из документа';

    let mdBody = afterYaml;
    if (headingIndex >= 0) {
        const nl = [...lines];
        nl.splice(headingIndex, 1);
        mdBody = nl.join('\n').replace(/^\n+/, '');
    } else if (yamlTitle && lines.length) {
        const t0 = String(lines[0] || '').trim();
        const h0 = t0.match(/^#{1,6}\s+(.+)$/);
        const firstTitle = h0 ? h0[1].trim() : t0.replace(/^#{1,6}\s*/, '').trim();
        if (firstTitle === title) {
            mdBody = lines.slice(1).join('\n').replace(/^\n+/, '');
        }
    } else if (!yamlTitle) {
        const nl = [...lines];
        for (let i = 0; i < nl.length; i++) {
            const line = String(nl[i] || '').trim();
            if (!line) continue;
            if (isNoiseListOrHrLine(line)) break;
            const cleaned = line.replace(/^#{1,6}\s*/, '').trim();
            if (cleaned === title) {
                nl.splice(i, 1);
                mdBody = nl.join('\n').replace(/^\n+/, '');
            }
            break;
        }
    }

    const html = markdownToPvlHtml(mdBody);
    const summaryLine = mdBody
        .split('\n')
        .map((x) => String(x || '').trim())
        .find((x) => x && !x.startsWith('#') && !isNoiseListOrHrLine(x) && !x.startsWith('>')) || '';

    return {
        title,
        summary: summaryLine.slice(0, 180),
        html,
    };
}
