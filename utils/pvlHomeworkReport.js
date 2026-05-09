import { homeworkAnswerPlainText, coerceAnswersJsonObject } from './pvlHomeworkAnswerRichText.js';

/**
 * Иконки и подписи для статусов submission.
 * После listStudentHomeworkSubmissions статус нормализован
 * (`pending_review`, `revision_requested`, `accepted`, `draft`, `rejected`).
 */
export const STATUS_ICONS = {
    accepted: '✅',
    pending_review: '⏳',
    revision_requested: '🔄',
    draft: '📝',
    rejected: '❌',
    overdue: '❌',
    submitted: '📨',
    not_submitted: '❌',
};

export const STATUS_LABELS = {
    accepted: 'Принято',
    pending_review: 'На проверке',
    revision_requested: 'На доработке',
    draft: 'Черновик',
    rejected: 'Отклонено',
    overdue: 'Просрочено',
    submitted: 'Отправлено',
    not_submitted: 'Не сдано',
};

export function safeFileName(text) {
    return String(text || 'Без_имени')
        .replace(/[\\/:*?"<>|]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

export function todayIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function formatDateRu(value) {
    if (!value) return '';
    try {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return '';
    }
}

function formatDateIso(value) {
    if (!value) return '';
    try {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    } catch {
        return '';
    }
}

function buildContentItemMap(contentItems) {
    const byId = new Map();
    for (const ci of contentItems || []) {
        if (ci?.id) byId.set(String(ci.id), ci);
    }
    return byId;
}

export function buildWeeksById(weeks) {
    const byId = new Map();
    for (const w of weeks || []) {
        if (w?.id) byId.set(String(w.id), w);
    }
    return byId;
}

export function buildLessonsById(lessons) {
    const byId = new Map();
    for (const l of lessons || []) {
        if (l?.id) byId.set(String(l.id), l);
    }
    return byId;
}

/**
 * Модуль ДЗ. Цепочка фолбэков, в порядке достоверности источника:
 *   1) pvl_content_items.module_number — основной источник на проде
 *      (админка ПВЛ ставит модуль через UI «Управление контентом»),
 *      связь через homework_item.external_key === `task-ci-${ci.id}`.
 *   2) homework_item.module_number — backfill phase 25 из title по
 *      regex «модул[ьюяе] N»; покрывает только записи с подходящим
 *      title.
 *   3) pvl_course_weeks.module_number по week_id.
 *   4) pvl_course_lessons.module_number по lesson_id.
 *   5) pvl_course_weeks по lesson.week_id (если у lesson нет
 *      module_number).
 * Возвращает null если ни один путь не сработал.
 */
export function effectiveModuleNumber(homeworkItem, weeksById, lessonsById, contentItemsById) {
    if (!homeworkItem) return null;

    if (contentItemsById) {
        const ci = resolveContentItemForHomework(homeworkItem, contentItemsById);
        if (ci?.module_number != null) return Number(ci.module_number);
    }

    if (homeworkItem.module_number != null) return Number(homeworkItem.module_number);

    const weekId = homeworkItem.week_id;
    if (weekId && weeksById) {
        const w = weeksById.get(String(weekId));
        if (w?.module_number != null) return Number(w.module_number);
    }

    const lessonId = homeworkItem.lesson_id;
    if (lessonId && lessonsById) {
        const l = lessonsById.get(String(lessonId));
        if (l?.module_number != null) return Number(l.module_number);
        if (l?.week_id && weeksById) {
            const lw = weeksById.get(String(l.week_id));
            if (lw?.module_number != null) return Number(lw.module_number);
        }
    }
    return null;
}

/**
 * external_key у homework_item может быть:
 *   - `task-ci-<content_item.id>` (синхронизация из content_items)
 *   - произвольный mock-ключ (legacy)
 *   - сам content_item.id (если так заполнили вручную)
 * Возвращает соответствующий content_item или null.
 */
function resolveContentItemForHomework(homeworkItem, contentItemsById) {
    const ek = String(homeworkItem?.external_key || '');
    if (!ek) return null;
    const taskCiPrefix = 'task-ci-';
    if (ek.startsWith(taskCiPrefix)) {
        return contentItemsById.get(ek.slice(taskCiPrefix.length)) || null;
    }
    return contentItemsById.get(ek) || null;
}

/**
 * Из content_item.homework_config.questionnaireBlocks собирает
 * Map<qb-id, question-text>. Возвращает null, если блоков нет.
 */
export function buildQuestionnaireMap(homeworkItem, contentItemsById) {
    const ci = resolveContentItemForHomework(homeworkItem, contentItemsById);
    const blocks = ci?.homework_config?.questionnaireBlocks;
    if (!Array.isArray(blocks) || blocks.length === 0) return null;
    const map = new Map();
    for (const b of blocks) {
        if (b?.id) map.set(String(b.id), String(b.question || '').trim());
    }
    return map.size ? map : null;
}

function pickCurrentVersion(payload) {
    const versions = Array.isArray(payload?.versions) ? payload.versions : [];
    if (!versions.length) return null;
    const currentId = payload?.currentVersionId;
    if (currentId) {
        const found = versions.find((v) => v?.id === currentId);
        if (found) return found;
    }
    const marked = versions.find((v) => v?.isCurrent);
    if (marked) return marked;
    return versions[versions.length - 1];
}

function moduleWeekRange(weeks, moduleNumber) {
    const list = (weeks || []).filter((w) => Number(w?.module_number) === Number(moduleNumber));
    if (!list.length) return null;
    let starts = null;
    let ends = null;
    for (const w of list) {
        if (w.starts_at) {
            const t = Date.parse(w.starts_at);
            if (!Number.isNaN(t)) starts = starts == null || t < starts ? t : starts;
        }
        if (w.ends_at) {
            const t = Date.parse(w.ends_at);
            if (!Number.isNaN(t)) ends = ends == null || t > ends ? t : ends;
        }
    }
    if (starts == null && ends == null) return null;
    return {
        starts: starts != null ? formatDateRu(starts) : '',
        ends: ends != null ? formatDateRu(ends) : '',
    };
}

function renderAnswers(version, questionnaireMap) {
    const answersRaw = coerceAnswersJsonObject(version?.answersJson);
    const text = String(version?.textContent || '').trim();
    const lines = [];
    if (answersRaw && questionnaireMap) {
        for (const [qbId, question] of questionnaireMap.entries()) {
            const html = answersRaw[qbId];
            const plain = homeworkAnswerPlainText(html);
            lines.push(`**В: ${question || '(вопрос не найден)'}**`);
            lines.push('');
            lines.push(plain || '_(пусто)_');
            lines.push('');
        }
        for (const key of Object.keys(answersRaw)) {
            if (questionnaireMap.has(key)) continue;
            const plain = homeworkAnswerPlainText(answersRaw[key]);
            if (!plain) continue;
            lines.push(`**${key}:**`);
            lines.push('');
            lines.push(plain);
            lines.push('');
        }
    } else if (answersRaw) {
        for (const [k, v] of Object.entries(answersRaw)) {
            const plain = homeworkAnswerPlainText(v);
            lines.push(`**${k}:**`);
            lines.push('');
            lines.push(plain || '_(пусто)_');
            lines.push('');
        }
    }
    if (text) {
        const plain = homeworkAnswerPlainText(text);
        if (plain) {
            if (lines.length) lines.push('');
            lines.push(plain);
            lines.push('');
        }
    }
    if (!lines.length) return '_(пусто)_';
    return lines.join('\n').trim();
}

function renderMentorThread(thread, mentorsById, fallbackMentorName) {
    const list = Array.isArray(thread) ? thread : [];
    const reviews = list.filter((m) => m?.messageType === 'mentor_review' && !m?.isSystem);
    if (!reviews.length) return '';
    const out = ['### Комментарии ментора', ''];
    for (const r of reviews) {
        const name = (r?.authorUserId && mentorsById?.get(String(r.authorUserId)))
            || fallbackMentorName
            || 'Ментор';
        const date = formatDateRu(r?.createdAt);
        const verdict = r?.verdict || r?.statusAfter || '';
        let suffix = '';
        if (verdict === 'accepted' || verdict === 'approved') suffix = ' — принято';
        else if (verdict === 'revision' || verdict === 'revision_requested') suffix = ' — на доработку';
        else if (verdict === 'rejected') suffix = ' — отклонено';
        const head = [name, date].filter(Boolean).join(', ');
        out.push(`**${head}${suffix}:**`);
        out.push('');
        const text = homeworkAnswerPlainText(r?.text || r?.message || '');
        out.push(text || '_(пусто)_');
        out.push('');
    }
    return out.join('\n').trim();
}

function statusKey(status, hasSubmission) {
    if (!hasSubmission) return 'not_submitted';
    return status || 'draft';
}

function renderHomeworkSection({
    homeworkItem,
    submission,
    history,
    contentItemsById,
    mentorsById,
    fallbackMentorName,
}) {
    const titleText = String(homeworkItem?.title || 'Без названия').trim();
    const sortOrder = homeworkItem?.sort_order ?? '';
    const head = sortOrder !== '' && sortOrder !== null && sortOrder !== undefined
        ? `## ДЗ ${sortOrder}: «${titleText}»`
        : `## ДЗ: «${titleText}»`;
    const lines = [head, ''];

    const status = submission ? submission.status : null;
    const sk = statusKey(status, !!submission);
    const icon = STATUS_ICONS[sk] || '•';
    const label = STATUS_LABELS[sk] || sk;
    const score = submission && submission.status === 'accepted' && submission.score != null
        ? ` · ${submission.score}/${homeworkItem?.max_score ?? '?'} баллов`
        : '';
    lines.push(`**Статус:** ${icon} ${label}${score}`);

    if (!submission) {
        lines.push('');
        return lines.join('\n').trim();
    }

    const submittedAt = submission.submitted_at || submission.created_at || null;
    const acceptedAt = submission.accepted_at || null;
    const histList = Array.isArray(history) ? history : [];
    const revisionEntries = histList.filter((h) => h?.to_status === 'revision_requested').length;
    const meta = [];
    if (submittedAt) meta.push(`**Сдано:** ${formatDateRu(submittedAt)}`);
    if (acceptedAt) meta.push(`**Принято:** ${formatDateRu(acceptedAt)}`);
    if (revisionEntries > 0) meta.push(`**Ревизий:** ${revisionEntries}`);
    if (meta.length) lines.push(meta.join(' · '));
    lines.push('');

    const version = pickCurrentVersion(submission.payload || {});
    const questionnaireMap = buildQuestionnaireMap(homeworkItem, contentItemsById);
    const answers = renderAnswers(version || {}, questionnaireMap);
    lines.push('### Ответ');
    lines.push('');
    lines.push(answers);
    lines.push('');

    const mentorBlock = renderMentorThread(
        submission.payload?.thread,
        mentorsById,
        fallbackMentorName,
    );
    if (mentorBlock) {
        lines.push(mentorBlock);
        lines.push('');
    }
    return lines.join('\n').trim();
}

/**
 * Главная функция — собирает MD-отчёт по одной студентке.
 *
 * args:
 *   student: { full_name, ... }
 *   mentorName: string | null
 *   cohortTitle: string
 *   moduleNumber: number | 'all'
 *   homeworkItems: [...]                    — отфильтрованные по модулю (или все для 'all')
 *   submissions: [...]                      — все submissions студентки
 *   statusHistoryBySubmission: Map<id, []>  — history per submission
 *   contentItems: [...]                     — для маппинга qb-id → текст
 *   weeks: [...]                            — для расчёта периода модуля
 *   mentorsById: Map<uuid, full_name> | null
 *
 * → string (markdown)
 */
export function buildStudentMarkdownReport({
    student,
    mentorName,
    cohortTitle,
    moduleNumber,
    homeworkItems,
    submissions,
    statusHistoryBySubmission,
    contentItems,
    weeks,
    lessons,
    mentorsById,
}) {
    const contentItemsById = buildContentItemMap(contentItems);
    const weeksById = buildWeeksById(weeks);
    const lessonsById = buildLessonsById(lessons);
    const submissionByItemId = new Map();
    for (const s of submissions || []) {
        const hwId = s?.homework_item_id;
        if (!hwId) continue;
        const prev = submissionByItemId.get(hwId);
        const prevTime = prev ? Date.parse(prev.updated_at || prev.created_at || 0) : -Infinity;
        const curTime = Date.parse(s.updated_at || s.created_at || 0);
        if (!prev || (Number.isFinite(curTime) && curTime > prevTime)) {
            submissionByItemId.set(hwId, s);
        }
    }

    const studentName = student?.full_name || 'Без имени';
    const fullName = String(studentName).trim();

    const sortedItems = [...(homeworkItems || [])]
        .filter((hi) => {
            if (!hi) return false;
            const t = String(hi.item_type || 'homework');
            if (t !== 'homework') return false;
            if (hi.is_control_point) return false;
            return true;
        })
        .map((hi) => ({ ...hi, __module: effectiveModuleNumber(hi, weeksById, lessonsById, contentItemsById) }))
        .sort((a, b) => {
            const ma = a.__module == null ? Infinity : Number(a.__module);
            const mb = b.__module == null ? Infinity : Number(b.__module);
            if (ma !== mb) return ma - mb;
            const sa = Number(a?.sort_order ?? Infinity);
            const sb = Number(b?.sort_order ?? Infinity);
            return sa - sb;
        });

    const isAll = moduleNumber === 'all';
    const moduleHeading = isAll
        ? 'Все модули'
        : `Модуль ${moduleNumber}`;

    const header = [`# ${fullName} — ${moduleHeading}`, ''];
    if (cohortTitle) header.push(`**Курс:** ${cohortTitle}`);
    if (mentorName) header.push(`**Ментор:** ${mentorName}`);
    if (!isAll) {
        const range = moduleWeekRange(weeks, moduleNumber);
        if (range && (range.starts || range.ends)) {
            header.push(`**Период:** ${range.starts || '—'} — ${range.ends || '—'}`);
        }
    }
    header.push(`**Сгенерировано:** ${todayIso()}`);
    header.push('');
    header.push('---');
    header.push('');

    const sections = [];
    if (isAll) {
        const byModule = new Map();
        for (const item of sortedItems) {
            const m = item.__module ?? null;
            if (!byModule.has(m)) byModule.set(m, []);
            byModule.get(m).push(item);
        }
        const moduleKeys = [...byModule.keys()].sort((a, b) => {
            if (a == null) return 1;
            if (b == null) return -1;
            return Number(a) - Number(b);
        });
        for (const m of moduleKeys) {
            const heading = m == null ? '## (без модуля)' : `# Модуль ${m}`;
            sections.push(heading);
            sections.push('');
            const range = m != null ? moduleWeekRange(weeks, m) : null;
            if (range && (range.starts || range.ends)) {
                sections.push(`**Период:** ${range.starts || '—'} — ${range.ends || '—'}`);
                sections.push('');
            }
            for (const item of byModule.get(m)) {
                const submission = submissionByItemId.get(item.id) || null;
                const history = submission
                    ? (statusHistoryBySubmission?.get?.(submission.id) || [])
                    : [];
                sections.push(renderHomeworkSection({
                    homeworkItem: item,
                    submission,
                    history,
                    contentItemsById,
                    mentorsById,
                    fallbackMentorName: mentorName,
                }));
                sections.push('');
                sections.push('---');
                sections.push('');
            }
        }
    } else {
        for (const item of sortedItems) {
            if (Number(item.__module) !== Number(moduleNumber)) continue;
            const submission = submissionByItemId.get(item.id) || null;
            const history = submission
                ? (statusHistoryBySubmission?.get?.(submission.id) || [])
                : [];
            sections.push(renderHomeworkSection({
                homeworkItem: item,
                submission,
                history,
                contentItemsById,
                mentorsById,
                fallbackMentorName: mentorName,
            }));
            sections.push('');
            sections.push('---');
            sections.push('');
        }
        if (!sections.length) {
            sections.push(`_В модуле ${moduleNumber} нет заданий._`);
            sections.push('');
        }
    }

    return [header.join('\n'), sections.join('\n')].join('').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function downloadAsMarkdownFile(filename, content) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadAsZipFile(filename, files) {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    for (const [name, content] of files) zip.file(name, content);
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function groupBySubmissionId(historyRows) {
    const map = new Map();
    for (const row of historyRows || []) {
        const id = row?.submission_id;
        if (!id) continue;
        if (!map.has(id)) map.set(id, []);
        map.get(id).push(row);
    }
    return map;
}

// Вспомогательные экспорты для упрощения тестов / DI.
export const __internals__ = {
    pickCurrentVersion,
    renderAnswers,
    renderMentorThread,
    moduleWeekRange,
    statusKey,
};

// Также экспортируем formatDateIso/formatDateRu — могут пригодиться в UI.
export { formatDateRu, formatDateIso };

// Дефолтный formatter заголовка имени файла (для bulk).
export function defaultStudentFilename({ student, moduleNumber }) {
    const moduleSlug = moduleNumber === 'all' ? 'все_модули' : `Модуль_${moduleNumber}`;
    return `${safeFileName(student?.full_name)}_${moduleSlug}.md`;
}
