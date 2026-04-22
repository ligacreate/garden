import { seed } from '../data/pvl/seed';
import { LOCAL_DEMO_LESSON_ITEMS, LOCAL_DEMO_LESSON_PLACEMENTS } from '../data/pvl/localDemoLessons';
import { capSzMentor, capSzSelf, computeCourseBreakdown } from './pvlScoringEngine';
import { CANONICAL_SCHEDULE_2026 } from '../data/pvl/constants';
import { CERTIFICATION_STATUS, CONTENT_STATUS, COURSE_STATUS, ROLES, TASK_STATUS } from '../data/pvl/enums';
import { PVL_PLATFORM_MODULES, PVL_TRACKER_LIBRARY_EXCLUDE_CATEGORY_IDS, pvlPlatformModuleTitleFromInternal } from '../data/pvlReferenceContent';
import { SCORING_METHOD_QUESTION, SCORING_RULES } from '../data/pvl/scoringRules';
import { pvlPostgrestApi } from './pvlPostgrestApi';
import {
    buildAdminRisks,
    buildAntiDebtProtocol,
    buildMentorRisks,
    buildStudentRisks,
    calculateCoursePoints,
    calculateCourseProgress,
    calculateLibraryProgress,
    calculateRiskLevel,
    calculateSzSelfAssessment,
    detectTooManyRevisions,
    getCertificationReadiness,
    getCertificationRedFlags,
    getCertificationTimeline,
    getDaysToSzDeadline,
    getNextControlPoint,
    getNextDeadline,
    getPendingNotifications,
    getPendingReviewTasks,
    getUnreadThreadCount,
} from '../selectors/pvlCalculators';
import { api } from './dataService';
import { ROLES as GARDEN_ROLES } from '../utils/roles';
import { classifyGardenProfileForPvlStudent, pvlGardenRoleLabelRu } from '../utils/pvlGardenAdmission';
import { DEFAULT_REFLEX_CHECKLIST_SECTIONS } from '../data/pvl/homeworkChecklistDefaults';
import { isHomeworkAnswerEmpty, normalizeAnswersJsonForStore } from '../utils/pvlHomeworkAnswerRichText';
import {
    createDefaultQuestionnaireBlocks,
    normalizeQuestionnaireBlocks,
    isQuestionnaireAnswersComplete,
} from '../utils/pvlQuestionnaireBlocks';

/** Согласовано с калькуляторами дедлайнов в прототипе */
const DASHBOARD_TODAY = '2026-06-03';

function diffCourseDays(firstYmd, secondYmd) {
    const toDate = (x) => new Date(`${String(x).slice(0, 10)}T00:00:00.000Z`);
    return Math.floor((toDate(firstYmd) - toDate(secondYmd)) / 86400000);
}

function cloneSeedData(src) {
    try {
        if (typeof structuredClone === 'function') return structuredClone(src);
    } catch {
        /* fall through */
    }
    return JSON.parse(JSON.stringify(src));
}

const db = cloneSeedData(seed);

function hasPublishedLessonsInDb() {
    return (db.contentItems || []).some(
        (i) => i && i.status === CONTENT_STATUS.PUBLISHED && String(i.targetSection || '') === 'lessons',
    );
}

/** У seed пустой CMS-слой: без PostgREST в трекере нечего показывать — подмешиваем демо-уроки. */
function ensureLocalDemoLessonContent() {
    if (hasPublishedLessonsInDb()) return;
    if (!Array.isArray(db.contentItems)) db.contentItems = [];
    if (!Array.isArray(db.contentPlacements)) db.contentPlacements = [];
    db.contentItems.push(...structuredClone(LOCAL_DEMO_LESSON_ITEMS));
    db.contentPlacements.push(...structuredClone(LOCAL_DEMO_LESSON_PLACEMENTS));
}

if (import.meta.env.DEV) {
    ensureLocalDemoLessonContent();
}
const eventLog = [];
let auditLog = [];
let notifications = [];
if (!Array.isArray(db.studentLibraryProgress)) db.studentLibraryProgress = [];
if (!Array.isArray(db.taskDisputes)) db.taskDisputes = [];
if (!Array.isArray(db.calendarEvents)) db.calendarEvents = [];
if (!Array.isArray(db.faqItems)) db.faqItems = [];
if (!db.studentTrackerChecks || typeof db.studentTrackerChecks !== 'object') db.studentTrackerChecks = {};
const IS_DEV = import.meta.env.DEV;

/** UUID студентов, которых уже вставили/обновили в pvl_students за текущую сессию. */
const pvlStudentSyncedToDb = new Set();

const STUDENT_SQL_ID_BY_USER_ID = Object.freeze({
    'u-st-1': '33333333-3333-3333-3333-333333333301',
    'u-st-2': '33333333-3333-3333-3333-333333333302',
    'u-st-3': '33333333-3333-3333-3333-333333333303',
    'u-st-4': '33333333-3333-3333-3333-333333333304',
});
let sqlWeekIdByMockWeekId = new Map();
let sqlHomeworkIdByMockTaskId = new Map();
let mockTaskIdBySqlHomeworkId = new Map();

function logDbFallback(payload = {}) {
    const table = String(payload.table || '');
    const err = String(payload.error || '');
    if (IS_DEV) {
        try {
            // eslint-disable-next-line no-console
            console.info('[PVL DB FALLBACK]', payload);
        } catch {
            /* noop */
        }
        return;
    }
    /** В проде иначе «тихие» сбои PostgREST — данные исчезают после F5. */
    if (table.includes('pvl_')) {
        try {
            // eslint-disable-next-line no-console
            console.warn('[PVL DB]', table, err.slice(0, 200), payload.id || '');
        } catch {
            /* noop */
        }
    }
}

function fireAndForget(promiseFactory, meta = {}) {
    try {
        Promise.resolve().then(promiseFactory).catch((error) => {
            logDbFallback({
                endpoint: meta.endpoint || '',
                status: 'error',
                table: meta.table || '',
                id: meta.id || null,
                error: String(error?.message || error || 'Unknown error'),
            });
        });
    } catch {
        logDbFallback({
            endpoint: meta.endpoint || '',
            status: 'error',
            table: meta.table || '',
            id: meta.id || null,
            error: 'Unexpected sync error',
        });
    }
}

/** UUID потока из database/pvl/seed/001_demo_minimal.sql ↔ строковый id в mock (data/pvl/seed.js). */
const PVL_SQL_COHORT_UUID_TO_SEED = Object.freeze({
    '11111111-1111-1111-1111-111111111101': 'cohort-2026-1',
});
const PVL_SEED_COHORT_TO_SQL_UUID = Object.freeze({
    'cohort-2026-1': '11111111-1111-1111-1111-111111111101',
});

function isUuidString(v) {
    if (v == null || v === '') return false;
    const s = String(v).trim();
    /** RFC-подобный UUID (в т.ч. v6/v7/v8 из auth/БД); строгая проверка версии ломала сохранение профилей. */
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/** Сопоставление id карточек и размещений из PostgREST и строк в UI (регистр UUID). */
function normalizePvlEntityId(id) {
    if (id == null || id === '') return '';
    const s = String(id).trim();
    return isUuidString(s) ? s.toLowerCase() : s;
}

/** PostgREST: created_by/updated_by — UUID; строки вида u-adm-1 в колонку UUID не пишем. */
function uuidOrNull(v) {
    return isUuidString(v) ? String(v).trim() : null;
}

function sqlCohortUuidToSeedId(sqlId) {
    if (sqlId == null || sqlId === '') return null;
    const s = String(sqlId);
    return PVL_SQL_COHORT_UUID_TO_SEED[s] || s;
}

function seedCohortIdToSqlUuid(seedOrSql) {
    if (seedOrSql == null || seedOrSql === '') return null;
    const s = String(seedOrSql).trim();
    if (isUuidString(s)) return s;
    return PVL_SEED_COHORT_TO_SQL_UUID[s] || null;
}

/** Статус материала для PostgreSQL (CHECK: draft | published | archived). */
function contentStatusToDb(status) {
    const s = String(status || '').toLowerCase();
    if (s === CONTENT_STATUS.UNPUBLISHED || s === 'unpublished') return 'draft';
    if (s === CONTENT_STATUS.PUBLISHED || s === 'published') return 'published';
    if (s === CONTENT_STATUS.ARCHIVED || s === 'archived') return 'archived';
    return 'draft';
}

/**
 * Эквивалентность id потока: UUID из БД и строка seed (cohort-2026-1) сопоставляются.
 */
export function pvlCohortIdsEquivalent(a, b) {
    const na = a == null || a === '' ? null : sqlCohortUuidToSeedId(a) || String(a);
    const nb = b == null || b === '' ? null : sqlCohortUuidToSeedId(b) || String(b);
    return na === nb;
}

/** Placement без cohort_id в БД = виден всем потокам; иначе — только совпадающему потоку. */
export function pvlPlacementVisibleForCohort(placementCohortId, profileCohortId) {
    if (placementCohortId == null || placementCohortId === '') return true;
    if (profileCohortId == null || profileCohortId === '') return false;
    return pvlCohortIdsEquivalent(placementCohortId, profileCohortId);
}

function newPvlPersistedEntityId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `pvl-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

/** Согласовано с CHECK pvl_content_items_content_type_check (миграция 002_pvl_runtime_content.sql). */
const PVL_DB_CONTENT_TYPES = new Set(['video', 'text', 'pdf', 'checklist', 'template', 'link', 'audio', 'fileBundle']);

/** CamelCase и snake_case (ответ PostgREST / частичный merge) — одна точка правды для полей материала. */
function resolvePvlTargetSection(item) {
    const s = item?.targetSection ?? item?.target_section;
    return (s != null && String(s).trim() !== '' ? String(s).trim() : null) || 'library';
}

/**
 * После Object.assign на item могут одновременно быть lessonKind и lesson_kind с разным смыслом.
 * Не используем ?? (первый выигрывает): для уроков приоритет quiz/homework над text_video.
 */
function resolvePvlLessonKind(item) {
    const raw = [item?.lessonKind, item?.lesson_kind].filter((v) => v != null && v !== '');
    if (raw.length === 0) return null;
    const lowered = raw.map((v) => String(v).trim().toLowerCase());
    if (lowered.includes('quiz')) return 'quiz';
    if (lowered.includes('homework')) return 'homework';
    if (lowered.includes('text_video')) return 'text_video';
    return null;
}

function matchPvlDbContentTypeToken(raw) {
    const s = String(raw || '').trim();
    if (PVL_DB_CONTENT_TYPES.has(s)) return s;
    const lower = s.toLowerCase();
    if (lower === 'filebundle') return 'fileBundle';
    for (const t of PVL_DB_CONTENT_TYPES) {
        if (t.toLowerCase() === lower) return t;
    }
    return null;
}

/** Из строки с запятой, массива или одного токена — одно сырое значение для нормализации. */
function pickBestRawContentTypeParts(parts) {
    const list = parts.map((p) => String(p).trim()).filter(Boolean);
    if (list.length === 0) return 'text';
    if (list.length === 1) return list[0];
    const lower = list.map((p) => p.toLowerCase());
    if (lower.includes('checklist')) return 'checklist';
    if (lower.includes('template')) return 'template';
    for (const p of list) {
        const m = matchPvlDbContentTypeToken(p);
        if (m && m !== 'text') return m;
    }
    for (const p of list) {
        const m = matchPvlDbContentTypeToken(p);
        if (m) return m;
    }
    return list[list.length - 1];
}

function coalesceScalarContentTypeValue(v) {
    if (v == null || v === '') return '';
    if (Array.isArray(v)) {
        const flat = v.map((x) => (x == null ? '' : String(x).trim())).filter(Boolean);
        return pickBestRawContentTypeParts(flat.length ? flat : ['text']);
    }
    const s = String(v).trim();
    if (s.includes(',')) {
        return pickBestRawContentTypeParts(s.split(','));
    }
    return s;
}

/**
 * Нельзя использовать contentType ?? content_type: часто остаётся устаревший contentType: "text",
 * а актуальный тип приходит вторым полем из PostgREST — тогда в нормализацию попадало "text" и строки вида "text,checklist".
 */
function resolvePvlContentTypeRaw(item) {
    const camel = coalesceScalarContentTypeValue(item?.contentType);
    const snake = coalesceScalarContentTypeValue(item?.content_type);
    if (!camel && !snake) return 'text';
    if (!camel) return snake || 'text';
    if (!snake) return camel || 'text';
    if (camel === snake) return camel;
    const mc = matchPvlDbContentTypeToken(camel);
    const ms = matchPvlDbContentTypeToken(snake);
    if (mc && !ms) return camel;
    if (ms && !mc) return snake;
    if (camel !== 'text' && snake === 'text') return camel;
    if (snake !== 'text' && camel === 'text') return snake;
    return snake;
}

function sanitizeMetadataForDbPayload(meta) {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
    const out = { ...meta };
    delete out.content_type;
    delete out.contentType;
    return out;
}

/**
 * Колонка content_type в PostgreSQL НЕ содержит 'quiz' / 'homework' (см. CHECK в 002_pvl_runtime_content.sql).
 * Семантика «тест» = checklist, «ДЗ» = template; слово quiz допустимо только в lesson_kind.
 */
function finalizePvlContentTypeColumnForPostgres(candidate) {
    let s = String(candidate ?? 'text').trim();
    const lower = s.toLowerCase();
    if (lower === 'quiz') return 'checklist';
    if (lower === 'homework') return 'template';
    if (PVL_DB_CONTENT_TYPES.has(s)) return s;
    const m = matchPvlDbContentTypeToken(s);
    if (m) return m;
    return 'text';
}

/**
 * В БД content_type — базовый тип материала; lesson_kind отдельно (text_video | quiz | homework).
 * Последняя линия защиты: только whitelist CHECK + запрет quiz/homework в колонке content_type.
 */
function normalizePvlContentTypeForDb(item) {
    const section = resolvePvlTargetSection(item);
    const lk = resolvePvlLessonKind(item);
    const raw = resolvePvlContentTypeRaw(item);
    const rawLc = raw.toLowerCase();

    let out;
    if (lk === 'quiz') out = 'checklist';
    else if (lk === 'homework') out = 'template';
    else if (section === 'lessons' && lk === 'text_video') {
        if (rawLc === 'text' || rawLc === 'video') out = rawLc;
        else out = 'video';
    } else {
        const matched = matchPvlDbContentTypeToken(raw);
        if (matched) out = matched;
        else if (rawLc === 'quiz') out = 'checklist';
        else if (rawLc === 'homework') out = 'template';
        else if (rawLc === 'article' || rawLc === 'lesson') out = 'text';
        else out = 'text';
    }
    return finalizePvlContentTypeColumnForPostgres(out);
}

/** Сборка JSON для колонки library_payload: lessonGroupTitle и прочие ключи из CMS. */
function buildLibraryPayloadColumn(item) {
    const base = item.libraryPayload && typeof item.libraryPayload === 'object' ? { ...item.libraryPayload } : {};
    if (item.libraryLessonGroupTitle !== undefined && item.libraryLessonGroupTitle !== null) {
        const t = String(item.libraryLessonGroupTitle || '').trim();
        if (t) base.lessonGroupTitle = t;
        else delete base.lessonGroupTitle;
    }
    return Object.keys(base).length ? base : null;
}

function contentItemToDbPayload(item) {
    const status = contentStatusToDb(item.status);
    const links = Array.isArray(item.externalLinks) ? item.externalLinks : [];
    const targetSection = resolvePvlTargetSection(item);
    const lessonKindForDb = targetSection === 'lessons' ? resolvePvlLessonKind(item) : null;
    /** Одно значение для колонки content_type; без spread из item (там могли быть дубли ключей). */
    const content_type = normalizePvlContentTypeForDb(item);
    const metadataBase = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    const metadata = sanitizeMetadataForDbPayload({
        ...metadataBase,
        practicumDate: item.practicumDate || '',
        practicumTime: item.practicumTime || '',
        practicumVideoUrl: item.practicumVideoUrl || '',
        practicumDocumentUrl: item.practicumDocumentUrl || '',
        linkedPracticumEventId: item.linkedPracticumEventId || '',
    });
    return {
        title: item.title || '',
        short_description: item.shortDescription || '',
        body_html: item.fullDescription || item.description || '',
        content_type,
        target_section: targetSection,
        target_role: item.targetRole || 'both',
        visibility: item.visibility || 'all',
        target_cohort_id: seedCohortIdToSqlUuid(item.targetCohort),
        module_number:
            targetSection === 'library' || targetSection === 'glossary'
                ? null
                : (item.moduleNumber != null ? Number(item.moduleNumber) : null),
        week_number: item.weekNumber != null ? Number(item.weekNumber) : null,
        order_index: Number(item.orderIndex) || 999,
        category_id: item.categoryId || null,
        category_title: item.categoryTitle || null,
        tags: Array.isArray(item.tags) ? item.tags : [],
        cover_image: item.coverImage || null,
        external_links: links,
        estimated_duration: item.estimatedDuration || null,
        metadata,
        lesson_video_url: item.lessonVideoUrl || null,
        lesson_rutube_url: item.lessonRutubeUrl || null,
        lesson_video_embed: item.lessonVideoEmbed || null,
        lesson_quiz: item.lessonQuiz || null,
        homework_config: item.lessonHomework || null,
        glossary_payload: item.glossaryPayload || null,
        library_payload: buildLibraryPayloadColumn(item),
        lesson_kind: lessonKindForDb,
        status,
        updated_by: uuidOrNull(item.updatedBy) || uuidOrNull(item.createdBy),
    };
}

function mapDbContentItemToRuntime(row) {
    const targetCohortSeed = row.target_cohort_id ? sqlCohortUuidToSeedId(row.target_cohort_id) : null;
    const extLinks = row.external_links;
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    return {
        id: row.id,
        title: row.title || '',
        shortDescription: row.short_description || '',
        fullDescription: row.body_html || '',
        description: row.body_html || '',
        contentType: row.content_type || 'text',
        targetSection: row.target_section || 'library',
        targetRole: row.target_role || 'both',
        visibility: row.visibility || 'all',
        targetCohort: targetCohortSeed || undefined,
        moduleNumber: row.module_number ?? 0,
        weekNumber: row.week_number ?? 0,
        orderIndex: Number(row.order_index) || 999,
        categoryId: row.category_id || '',
        categoryTitle: row.category_title || '',
        tags: Array.isArray(row.tags) ? row.tags : [],
        coverImage: row.cover_image || '',
        externalLinks: Array.isArray(extLinks) ? extLinks : [],
        estimatedDuration: row.estimated_duration || '',
        metadata,
        practicumDate: metadata.practicumDate || '',
        practicumTime: metadata.practicumTime || '',
        practicumVideoUrl: metadata.practicumVideoUrl || '',
        practicumDocumentUrl: metadata.practicumDocumentUrl || '',
        linkedPracticumEventId: metadata.linkedPracticumEventId || '',
        lessonVideoUrl: row.lesson_video_url || '',
        lessonRutubeUrl: row.lesson_rutube_url || '',
        lessonVideoEmbed: row.lesson_video_embed || '',
        lessonQuiz: row.lesson_quiz || null,
        lessonHomework: row.homework_config || null,
        glossaryPayload: row.glossary_payload || null,
        libraryPayload: row.library_payload || null,
        libraryLessonGroupTitle:
            row.library_payload && typeof row.library_payload === 'object' && row.library_payload.lessonGroupTitle
                ? String(row.library_payload.lessonGroupTitle).trim()
                : '',
        lessonKind: row.lesson_kind || undefined,
        status: row.status || 'draft',
        createdBy: row.created_by || 'u-adm-1',
        updatedBy: row.updated_by || row.created_by || 'u-adm-1',
        createdAt: row.created_at || nowIso(),
        updatedAt: row.updated_at || nowIso(),
    };
}

function mapDbPlacementToRuntime(row) {
    const cohortSeed = row.cohort_id ? sqlCohortUuidToSeedId(row.cohort_id) : null;
    return {
        id: row.id,
        contentItemId: row.content_item_id,
        targetRole: row.target_role || 'both',
        targetSection: row.target_section || 'library',
        /** null = все потоки (не подменять на дефолт — иначе ломается фильтр выдачи). */
        cohortId: cohortSeed,
        targetCohort: cohortSeed,
        moduleNumber: row.module_number ?? 0,
        weekNumber: row.week_number ?? 0,
        orderIndex: Number(row.order_index ?? row.sort_order ?? 0),
        isPublished: row.is_published !== false,
        createdAt: row.created_at || nowIso(),
        updatedAt: row.updated_at || nowIso(),
    };
}

function mapDbEventToRuntime(row) {
    const eventTypeMap = {
        lesson: 'lesson',
        practicum: 'practicum',
        practicum_done: 'practicum_done',
        breakfast: 'breakfast',
        deadline: 'deadline',
        other: 'other',
        // legacy types → new types:
        mentor_meeting: 'practicum',
        lesson_release: 'lesson',
        live_stream: 'breakfast',
        session: 'practicum',
        week_closure: 'deadline',
    };
    const normalizedEventType = eventTypeMap[String(row.event_type || '').toLowerCase()] || 'other';
    return {
        id: row.id,
        legacyKey: row.legacy_key || null,
        title: row.title || 'Событие',
        description: row.description || '',
        eventType: normalizedEventType,
        visibilityRole: row.visibility_role || 'all',
        cohortId: row.cohort_id ? sqlCohortUuidToSeedId(row.cohort_id) : null,
        moduleNumber: row.module_number ?? 0,
        weekNumber: row.week_number ?? 0,
        linkedLessonId: row.linked_lesson_id || null,
        linkedPracticumId: row.linked_practicum_id || null,
        recordingUrl: row.recording_url || '',
        recapText: row.recap_text || '',
        /** YYYY-MM-DD для сетки календаря (date_hint в БД или из start_at). */
        date: row.date_hint ? String(row.date_hint).slice(0, 10) : String(row.start_at || row.starts_at || '').slice(0, 10),
        startAt: row.start_at || row.starts_at || nowIso(),
        endAt: row.end_at || row.ends_at || nowIso(),
        colorToken: row.color_token || row.event_type || 'other',
        isPublished: row.is_published !== false,
        createdAt: row.created_at || nowIso(),
        updatedAt: row.updated_at || nowIso(),
    };
}

function normalizeCalendarEventTypeForDb(value) {
    const raw = String(value || '').toLowerCase().trim();
    const map = {
        lesson: 'lesson',
        practicum: 'practicum',
        practicum_done: 'practicum_done',
        breakfast: 'breakfast',
        deadline: 'deadline',
        other: 'other',
        // legacy types:
        mentor_meeting: 'practicum',
        lesson_release: 'lesson',
        live_stream: 'breakfast',
        session: 'practicum',
        week_closure: 'deadline',
    };
    return map[raw] || 'other';
}

function mapDbFaqToRuntime(row) {
    return {
        id: row.id,
        title: row.question || '',
        answer: row.answer || row.answer_html || '',
        targetRole: row.target_role || 'all',
        isPublished: row.is_published !== false,
        orderIndex: Number(row.order_index ?? row.sort_order ?? 0),
    };
}

function studentSqlIdByUserId(userId) {
    if (!userId) return null;
    /** Мок-пользователи (u-st-*) → фиксированный UUID из сида; реальные пользователи → их UUID и есть SQL-идентификатор. */
    return STUDENT_SQL_ID_BY_USER_ID[userId] || (isUuidString(userId) ? String(userId) : null);
}

/** Статусы в pvl_student_homework_submissions (Postgres) → TASK_STATUS в рантайме (канбан, «Результаты»). */
function homeworkDbStatusToTaskStatus(dbStatus) {
    const raw = String(dbStatus || '').toLowerCase().trim();
    const map = {
        draft: TASK_STATUS.DRAFT,
        submitted: TASK_STATUS.SUBMITTED,
        in_review: TASK_STATUS.PENDING_REVIEW,
        revision: TASK_STATUS.REVISION_REQUESTED,
        accepted: TASK_STATUS.ACCEPTED,
        rejected: TASK_STATUS.REJECTED,
        overdue: TASK_STATUS.OVERDUE,
    };
    if (map[raw]) return map[raw];
    if (Object.values(TASK_STATUS).includes(raw)) return raw;
    return TASK_STATUS.PENDING_REVIEW;
}

/**
 * Ранняя строка в pvl_students (FK) — для абитуриентов трека: профиль Сада «заявитель», applicant, и т.д.
 * Ученица/стажёр — не здесь (ensure при сдаче ДЗ / записи прогресса).
 * Смотрим studentProfiles.gardenRole и fallback на db.users.gardenRole после syncPvlActorsFromGarden.
 */
function shouldEarlyEnsurePvlStudentRow(studentProfile) {
    if (!studentProfile?.userId) return false;
    const u = (db.users || []).find((x) => String(x.id) === String(studentProfile.userId));
    const effective = studentProfile.gardenRole ?? u?.gardenRole ?? null;
    if (effective === 'student' || effective === 'intern') return false;
    return effective === 'applicant';
}

/**
 * Гарантирует строку в pvl_students для Garden UUID (= тот же id, что profiles.id).
 * Ранняя синхронизация из Сада — только для абитуриентов; иначе — при записи submission/прогресса/вопроса.
 * Без этого INSERT в pvl_student_* с FK на pvl_students падает, если строку не создали вручную.
 */
async function ensurePvlStudentInDb(userId) {
    if (!pvlPostgrestApi.isEnabled()) return;
    const sqlId = studentSqlIdByUserId(userId);
    if (!sqlId) return;
    if (pvlStudentSyncedToDb.has(sqlId)) return;
    pvlStudentSyncedToDb.add(sqlId);
    const user = (db.users || []).find((u) => String(u.id) === String(userId));
    const fullName = user?.fullName || user?.name || 'Участница';
    try {
        await pvlPostgrestApi.upsertPvlStudent({
            id: sqlId,
            full_name: fullName,
            status: 'active',
            cohort_id: null,
            mentor_id: null,
        });
    } catch (err) {
        pvlStudentSyncedToDb.delete(sqlId);
        // eslint-disable-next-line no-console
        console.warn('[PVL DB] ensurePvlStudentInDb failed for', sqlId, String(err?.message || err));
    }
}

async function ensureDbTrackerHomeworkStructure() {
    const [weekRows, lessonRows, hwRows] = await Promise.all([
        pvlPostgrestApi.listCourseWeeks(),
        pvlPostgrestApi.listCourseLessons(),
        pvlPostgrestApi.listHomeworkItems(),
    ]);
    const byWeekExternal = new Map(
        (weekRows || [])
            .filter((r) => r.external_key)
            .map((r) => [String(r.external_key), r]),
    );
    const weeksMissingExternalKey = (db.courseWeeks || []).filter((w) => !byWeekExternal.has(w.id));
    if (weeksMissingExternalKey.length > 0) {
        for (const w of weeksMissingExternalKey) {
            // eslint-disable-next-line no-await-in-loop
            await pvlPostgrestApi.upsertCourseWeek({
                week_number: Number(w.weekNumber ?? 0),
                title: w.title || `Неделя ${w.weekNumber ?? 0}`,
                module_number: Number(w.moduleNumber ?? 0),
                is_active: true,
                starts_at: w.startDate || null,
                ends_at: w.endDate || null,
                external_key: w.id,
            });
        }
    }
    const weeks = await pvlPostgrestApi.listCourseWeeks();
    sqlWeekIdByMockWeekId = new Map((weeks || [])
        .filter((w) => w.external_key)
        .map((w) => [String(w.external_key), w.id]));

    const byLessonExternal = new Map((lessonRows || []).map((r) => [String(r.external_key || ''), r]));
    if (byLessonExternal.size === 0) {
        const lessons = db.lessons || [];
        for (const l of lessons) {
            const sqlWeekId = sqlWeekIdByMockWeekId.get(String(l.weekId));
            if (!sqlWeekId) continue;
            // eslint-disable-next-line no-await-in-loop
            await pvlPostgrestApi.upsertCourseLesson({
                week_id: sqlWeekId,
                module_number: Number(l.moduleNumber ?? 0),
                title: l.title || 'Урок',
                lesson_type: l.contentType || 'lesson',
                sort_order: Number(l.orderIndex ?? 0),
                external_key: l.id,
            });
        }
    }
    const byHomeworkExternal = new Map((hwRows || []).map((r) => [String(r.external_key || ''), r]));
    /** Upsert каждой домашки которой ещё нет в БД (не только при size === 0 — db.homeworkTasks заполняется лениво). */
    for (const t of db.homeworkTasks || []) {
        if (!byHomeworkExternal.has(String(t.id))) {
            const sqlWeekId = sqlWeekIdByMockWeekId.get(String(t.weekId));
            // eslint-disable-next-line no-await-in-loop
            await pvlPostgrestApi.upsertHomeworkItem({
                week_id: sqlWeekId || null,
                title: t.title || 'Домашка',
                item_type: t.isControlPoint ? 'control_point' : 'homework',
                max_score: Number(t.scoreMax ?? 20),
                is_control_point: !!t.isControlPoint,
                sort_order: Number(t.orderIndex ?? 0),
                external_key: t.id,
            });
        }
    }
    const homeworkRows = await pvlPostgrestApi.listHomeworkItems();
    sqlHomeworkIdByMockTaskId = new Map((homeworkRows || [])
        .filter((r) => r.external_key)
        .map((r) => [String(r.external_key), r.id]));
    mockTaskIdBySqlHomeworkId = new Map((homeworkRows || [])
        .filter((r) => r.external_key)
        .map((r) => [String(r.id), String(r.external_key)]));
}

async function syncTrackerAndHomeworkFromDb() {
    await ensureDbTrackerHomeworkStructure();
    for (const student of db.studentProfiles || []) {
        const userId = student.userId;
        if (shouldEarlyEnsurePvlStudentRow(student)) {
            // eslint-disable-next-line no-await-in-loop
            await ensurePvlStudentInDb(userId);
        }
        const sqlStudentId = studentSqlIdByUserId(userId);
        if (!sqlStudentId) continue;
        // eslint-disable-next-line no-await-in-loop
        const progressRows = await pvlPostgrestApi.getStudentCourseProgress(sqlStudentId);
        const checked = {};
        (progressRows || []).forEach((row) => {
            const keys = row?.payload?.checkedKeys;
            if (Array.isArray(keys)) keys.forEach((k) => { checked[String(k)] = true; });
            const mockWeekId = Array.from(sqlWeekIdByMockWeekId.entries()).find(([, sqlId]) => sqlId === row.week_id)?.[0];
            const week = (db.courseWeeks || []).find((w) => w.id === mockWeekId);
            if (week) {
                upsertWeekCompletion(userId, week.weekNumber, {
                    weekClosed: !!row.is_week_closed,
                    studiedCompleted: Number(row.lessons_completed || 0) > 0,
                    taskCompleted: Number(row.homework_completed || 0) > 0,
                    submittedCompleted: Number(row.homework_completed || 0) > 0,
                });
            }
        });
        db.studentTrackerChecks[userId] = checked;

        /** Чтобы при сабмишне из БД уже были task/state (частично совпадает с уроками CMS). */
        syncPublishedHomeworkTasksForStudent(userId);

        // eslint-disable-next-line no-await-in-loop
        const subs = await pvlPostgrestApi.listStudentHomeworkSubmissions(sqlStudentId);
        for (const row of subs || []) {
            const taskId = mockTaskIdBySqlHomeworkId.get(String(row.homework_item_id));
            if (!taskId) continue;
            const mapped = homeworkDbStatusToTaskStatus(row.status);
            let state = db.studentTaskStates.find((s) => s.studentId === userId && s.taskId === taskId);
            if (!state) {
                state = {
                    id: uid('sts'),
                    studentId: userId,
                    taskId,
                    status: mapped,
                    totalTaskPoints: 0,
                    autoPoints: 0,
                    mentorBonusPoints: 0,
                    revisionCycles: Number(row.revision_cycles || 0),
                    submittedAt: row.submitted_at ? String(row.submitted_at).slice(0, 10) : null,
                    acceptedAt: row.accepted_at ? String(row.accepted_at).slice(0, 10) : null,
                    lastStatusChangedAt: null,
                    isOverdue: false,
                    createdAt: nowIso(),
                    updatedAt: nowIso(),
                };
                if (row.score != null) {
                    state.autoPoints = Number(row.score);
                    state.totalTaskPoints = (state.autoPoints || 0) + (state.mentorBonusPoints || 0);
                }
                db.studentTaskStates.push(state);
            } else {
                state.status = mapped;
                state.submittedAt = row.submitted_at ? String(row.submitted_at).slice(0, 10) : state.submittedAt;
                state.acceptedAt = row.accepted_at ? String(row.accepted_at).slice(0, 10) : state.acceptedAt;
                state.revisionCycles = Number(row.revision_cycles || 0);
                if (row.score != null) state.autoPoints = Number(row.score);
                state.totalTaskPoints = (state.autoPoints || 0) + (state.mentorBonusPoints || 0);
            }
            let sub = db.submissions.find((s) => s.studentId === userId && s.taskId === taskId);
            if (!sub) {
                sub = { id: uid('sub'), studentId: userId, taskId, currentVersionId: null, draftVersionId: null, createdAt: nowIso(), updatedAt: nowIso() };
                db.submissions.push(sub);
            }
            const payload = row.payload || {};
            const versions = Array.isArray(payload.versions) ? payload.versions : [];
            if (versions.length) {
                db.submissionVersions = db.submissionVersions.filter((v) => v.submissionId !== sub.id);
                versions.forEach((v) => db.submissionVersions.push({ ...v, submissionId: sub.id }));
                sub.currentVersionId = payload.currentVersionId || versions.find((v) => v.isCurrent)?.id || null;
                sub.draftVersionId = payload.draftVersionId || versions.find((v) => v.isDraft)?.id || null;
            }
            const thread = Array.isArray(payload.thread) ? payload.thread : [];
            if (thread.length) {
                db.threadMessages = db.threadMessages.filter((m) => !(m.studentId === userId && m.taskId === taskId));
                thread.forEach((m) => db.threadMessages.push({ ...m, studentId: userId, taskId }));
            }
            // eslint-disable-next-line no-await-in-loop
            const hist = await pvlPostgrestApi.listHomeworkStatusHistory(row.id);
            if (Array.isArray(hist) && hist.length) {
                db.statusHistory = db.statusHistory.filter((h) => !(h.studentId === userId && h.taskId === taskId));
                hist.forEach((h) => db.statusHistory.push({
                    id: h.id || uid('sh'),
                    studentId: userId,
                    taskId,
                    fromStatus: h.from_status || null,
                    toStatus: h.to_status || null,
                    changedByUserId: h.changed_by || 'system',
                    comment: h.comment || '',
                    createdAt: h.changed_at || nowIso(),
                }));
            }
        }

        // eslint-disable-next-line no-await-in-loop
        const contentProgressRows = await pvlPostgrestApi.listStudentContentProgress(sqlStudentId).catch(() => []);
        for (const row of contentProgressRows || []) {
            const itemId = row.content_item_id;
            if (!itemId) continue;
            let pr = (db.studentLibraryProgress || []).find((x) => x.studentId === userId && x.libraryItemId === itemId);
            if (!pr) {
                pr = { id: uid('slp'), studentId: userId, libraryItemId: itemId, progressPercent: 0, completed: false, lastOpenedAt: null, completedAt: null };
                db.studentLibraryProgress.push(pr);
            }
            pr.progressPercent = Number(row.progress_percent || 0);
            pr.completed = !!row.completed;
            pr.lastOpenedAt = row.last_opened_at || pr.lastOpenedAt;
            pr.completedAt = row.completed_at || pr.completedAt;
        }
    }
}

/** Демо-id учениц из seed — убираем из db, когда из Сада подгружены реальные абитуриенты. */
const SEED_PVL_STUDENT_ID_RE = /^u-st-\d+$/;

function isSeedPvlDemoStudentId(id) {
    return SEED_PVL_STUDENT_ID_RE.test(String(id || '').trim());
}

/**
 * Удаляет строки seed-учениц (u-st-*) и связанные записи, чтобы в учительской не оставались «Анна Лаврова» и т.п.
 * Вызывается после syncPvlActorsFromGarden, если из profiles пришли абитуриенты.
 */
export function pruneSeedPvlDemoStudentRows() {
    const drop = isSeedPvlDemoStudentId;
    db.users = (db.users || []).filter((u) => !(drop(u.id) && u.role === ROLES.STUDENT));
    db.studentProfiles = (db.studentProfiles || []).filter((p) => !drop(p.userId));
    (db.mentorProfiles || []).forEach((m) => {
        m.menteeIds = (m.menteeIds || []).filter((id) => !drop(id));
    });

    const strip = (key) => {
        const arr = db[key];
        if (!Array.isArray(arr)) return;
        const next = arr.filter((row) => !drop(row?.studentId));
        arr.length = 0;
        next.forEach((x) => arr.push(x));
    };

    strip('studentTaskStates');
    strip('submissions');
    strip('statusHistory');
    strip('threadMessages');
    strip('mentorMeetings');
    strip('certificationProgress');
    strip('deadlineRisks');
    strip('directMessages');
    strip('studentPoints');
    strip('weekCompletionState');
    strip('controlPointState');
    strip('mentorBonusEvents');
    strip('szAssessmentState');

    if (Array.isArray(db.submissionVersions) && Array.isArray(db.submissions)) {
        const keep = new Set(db.submissions.map((s) => s.id));
        db.submissionVersions = db.submissionVersions.filter((v) => keep.has(v.submissionId));
    }

    if (db.studentLibraryProgress && Array.isArray(db.studentLibraryProgress)) {
        db.studentLibraryProgress = db.studentLibraryProgress.filter((r) => !drop(r.studentId));
    }

    if (db.studentTrackerChecks && typeof db.studentTrackerChecks === 'object') {
        Object.keys(db.studentTrackerChecks).forEach((k) => {
            if (drop(k)) delete db.studentTrackerChecks[k];
        });
    }
}

export async function syncPvlRuntimeFromDb() {
    if (!pvlPostgrestApi.isEnabled()) return { synced: false, reason: 'disabled' };
    const snapshot = await pvlPostgrestApi.loadRuntimeSnapshot();
    const mappedItems = snapshot.items.map(mapDbContentItemToRuntime);
    const mappedPlacements = snapshot.placements.map(mapDbPlacementToRuntime);
    const mappedEvents = snapshot.events.map(mapDbEventToRuntime);
    const mappedFaq = snapshot.faq.map(mapDbFaqToRuntime);
    /** Состояние рантайма = ответ PostgREST (включая пустые списки — источник правды в БД). */
    db.contentItems = mappedItems;
    applyPvlWritingModuleLibraryLessonGroupPatch();
    db.contentPlacements = mappedPlacements;
    if (
        import.meta.env.DEV
        && mappedItems.length === 0
        && mappedPlacements.length === 0
    ) {
        ensureLocalDemoLessonContent();
    }
    if (mappedEvents.length) {
        const dbIds = new Set(mappedEvents.map((e) => e.id));
        const seedOnly = (db.calendarEvents || []).filter((e) => !dbIds.has(e.id));
        db.calendarEvents = [...mappedEvents, ...seedOnly];
    }
    db.faqItems = mappedFaq;
    await syncTrackerAndHomeworkFromDb();
    return { synced: true };
}

function applyGardenMentorLinkRow(row) {
    const studentId = row?.student_id != null ? String(row.student_id).trim() : '';
    if (!studentId) return;
    const mentorId = row?.mentor_id != null && row.mentor_id !== '' ? String(row.mentor_id).trim() : null;
    const profile = (db.studentProfiles || []).find((p) => String(p.userId) === studentId);
    if (!profile) return;
    for (const m of db.mentorProfiles || []) {
        if (!Array.isArray(m.menteeIds)) continue;
        if (!m.menteeIds.includes(studentId)) continue;
        m.menteeIds = m.menteeIds.filter((id) => id !== studentId);
        m.updatedAt = nowIso();
    }
    profile.mentorId = mentorId;
    profile.updatedAt = nowIso();
    if (mentorId) {
        const mentor = (db.mentorProfiles || []).find(
            (mp) => String(mp.userId) === mentorId || String(mp.id) === mentorId,
        );
        if (mentor) {
            const next = new Set(mentor.menteeIds || []);
            next.add(studentId);
            mentor.menteeIds = Array.from(next);
            mentor.updatedAt = nowIso();
        }
    }
}

async function hydrateGardenMentorAssignmentsFromDb() {
    if (!pvlPostgrestApi.isEnabled()) return;
    const ids = [
        ...new Set(
            (db.studentProfiles || [])
                .map((p) => String(p.userId || '').trim())
                .filter((id) => isUuidString(id)),
        ),
    ];
    if (ids.length === 0) return;
    const rows = await pvlPostgrestApi.listGardenMentorLinksByStudentIds(ids);
    for (const row of rows || []) {
        applyGardenMentorLinkRow(row);
    }
}

async function persistGardenMentorLink(studentUserId, mentorUserId) {
    if (!pvlPostgrestApi.isEnabled()) return;
    const sid = String(studentUserId || '').trim();
    if (!isUuidString(sid)) {
        try {
            // eslint-disable-next-line no-console
            console.warn('[PVL] mentor link: некорректный student_id (ожидается UUID):', studentUserId);
        } catch { /* noop */ }
        return;
    }
    const rawMentor = mentorUserId != null && mentorUserId !== '' ? String(mentorUserId).trim() : null;
    if (rawMentor != null && !isUuidString(rawMentor)) {
        try {
            // eslint-disable-next-line no-console
            console.warn('[PVL] mentor link: некорректный mentor_id (ожидается UUID):', mentorUserId);
        } catch { /* noop */ }
        return;
    }
    try {
        await pvlPostgrestApi.upsertGardenMentorLink({
            student_id: sid,
            mentor_id: rawMentor,
            updated_at: new Date().toISOString(),
        });
    } catch (error) {
        try {
            // eslint-disable-next-line no-console
            console.warn('[PVL] mentor link: не сохранилось в БД:', error?.message || error);
        } catch { /* noop */ }
        logDbFallback({
            endpoint: '/public.pvl_garden_mentor_links',
            status: 'error',
            table: 'pvl_garden_mentor_links',
            id: sid,
            error: String(error?.message || error || 'upsert failed'),
        });
        /** Пробрасываем ошибку наверх, чтобы UI мог показать уведомление.
         *  Без этого ошибка проглатывалась и ментор «сохранялся» только в памяти,
         *  а при обновлении страницы сбрасывался. */
        throw error;
    }
}

export async function syncPvlActorsFromGarden() {
    try {
        let users = [];
        const waitBeforeAttemptMs = [0, 400, 800, 1200];
        for (let i = 0; i < waitBeforeAttemptMs.length; i += 1) {
            if (waitBeforeAttemptMs[i] > 0) {
                // eslint-disable-next-line no-await-in-loop
                await new Promise((r) => setTimeout(r, waitBeforeAttemptMs[i]));
            }
            // eslint-disable-next-line no-await-in-loop
            users = await api.getUsers();
            if (Array.isArray(users) && users.length > 0) break;
        }
        if (!Array.isArray(users) || users.length === 0) return { synced: false, reason: 'no_users' };

        const roleOnly = (u) => String(u?.role ?? '').trim().toLowerCase();
        const canActAsCourseMentor = (u) => {
            const role = roleOnly(u);
            // Принимаем английские и русские варианты, как в pvlRoleResolver.normalizeGardenRoleValue
            return role === 'mentor' || role === 'ментор'
                || role === 'admin' || role === 'админ' || role === 'администратор'
                || role === GARDEN_ROLES.MENTOR || role === GARDEN_ROLES.ADMIN;
        };

        /** В курсе ПВЛ админ площадки также может выступать как ментор. */
        const mentors = users.filter((u) => canActAsCourseMentor(u));

        /** Участники ПВЛ (абитуриенты и ученицы курса), без персонала — см. utils/pvlGardenAdmission.js */
        const pvlTrackMembers = users
            .map((u) => ({ profile: u, admission: classifyGardenProfileForPvlStudent(u) }))
            .filter((x) => x.admission != null);

        mentors.forEach((u) => {
            if (!u?.id) return;
            const userId = String(u.id);
            const gardenRole = roleOnly(u);
            const realName = u.name || u.fullName || u.email || userId;
            const existingUser = (db.users || []).find((x) => String(x.id) === userId);
            if (!existingUser) {
                db.users.push({
                    id: userId,
                    role: gardenRole === GARDEN_ROLES.ADMIN ? ROLES.ADMIN : ROLES.MENTOR,
                    fullName: realName,
                    email: u.email || '',
                    avatar: u.avatar || '',
                    isActive: true,
                    gardenRole,
                    createdAt: nowIso(),
                    updatedAt: nowIso(),
                });
            } else {
                if (realName && realName !== userId) existingUser.fullName = realName;
                existingUser.gardenRole = gardenRole;
            }
            const existsMentor = (db.mentorProfiles || []).some((x) => String(x.userId) === userId);
            if (!existsMentor) {
                db.mentorProfiles.push({
                    id: uid('mp'),
                    userId,
                    cohortIds: ['cohort-2026-1'],
                    menteeIds: [],
                    activeReviewCount: 0,
                    activeRiskCount: 0,
                    createdAt: nowIso(),
                    updatedAt: nowIso(),
                });
            }
        });

        pvlTrackMembers.forEach(({ profile: u, admission }) => {
            if (!u?.id) return;
            const userId = String(u.id);
            const gr = admission.gardenRole;
            const realName = u.name || u.fullName || u.email || userId;
            const existingUser = (db.users || []).find((x) => String(x.id) === userId);
            if (!existingUser) {
                db.users.push({
                    id: userId,
                    role: ROLES.STUDENT,
                    fullName: realName,
                    email: u.email || '',
                    avatar: u.avatar || '',
                    isActive: true,
                    gardenRole: gr,
                    gardenRoleSource: admission.sourceRole || '',
                    createdAt: nowIso(),
                    updatedAt: nowIso(),
                });
            } else {
                if (realName && realName !== userId) existingUser.fullName = realName;
                existingUser.gardenRole = gr;
                existingUser.gardenRoleSource = admission.sourceRole || '';
                existingUser.updatedAt = nowIso();
            }
            const sp = (db.studentProfiles || []).find((x) => String(x.userId) === userId);
            if (!sp) {
                db.studentProfiles.push({
                    id: uid('sp'),
                    userId,
                    cohortId: 'cohort-2026-1',
                    mentorId: null,
                    currentWeek: 0,
                    currentModule: 1,
                    courseStatus: COURSE_STATUS.ACTIVE,
                    coursePoints: 0,
                    szSelfAssessmentPoints: 0,
                    szMentorAssessmentPoints: 0,
                    szAdmissionStatus: CERTIFICATION_STATUS.NOT_STARTED,
                    gardenRole: gr,
                    lastActivityAt: nowIso().slice(0, 10),
                    unreadCount: 0,
                    createdAt: nowIso(),
                    updatedAt: nowIso(),
                });
            } else {
                sp.gardenRole = gr;
                sp.updatedAt = nowIso();
            }
        });

        /** Только абитуриенты: ранняя строка в pvl_students (FK). Ученицы/стажёры — через ensure при сдаче ДЗ и т.п. */
        for (const { profile: u, admission } of pvlTrackMembers) {
            if (!u?.id || admission?.gardenRole !== 'applicant') continue;
            // eslint-disable-next-line no-await-in-loop
            await ensurePvlStudentInDb(String(u.id));
        }

        /** Есть синхронизированные из Сада участники трека — админка и ментор не показывают демо u-st-* */
        db._pvlGardenApplicantsSynced = pvlTrackMembers.length > 0;
        if (pvlTrackMembers.length > 0) {
            pruneSeedPvlDemoStudentRows();
        }

        try {
            await hydrateGardenMentorAssignmentsFromDb();
        } catch (e) {
            logDbFallback({
                endpoint: '/pvl_garden_mentor_links',
                status: 'error',
                table: 'pvl_garden_mentor_links',
                id: null,
                error: String(e?.message || e || 'hydrate mentor links failed'),
            });
        }

        /** Загружаем сабмишны и прогресс для только что добавленных реальных участников.
         * syncPvlRuntimeFromDb запускается ДО syncPvlActorsFromGarden, поэтому на момент
         * первого syncTrackerAndHomeworkFromDb в db.studentProfiles ещё нет реальных пользователей. */
        if (pvlPostgrestApi.isEnabled() && pvlTrackMembers.length > 0) {
            try {
                await syncTrackerAndHomeworkFromDb();
            } catch (e) {
                logDbFallback({
                    endpoint: '/pvl_student_homework_submissions',
                    status: 'error',
                    table: 'pvl_student_homework_submissions',
                    id: null,
                    error: String(e?.message || e || 'syncTrackerAndHomeworkFromDb failed'),
                });
            }
        }

        return {
            synced: true,
            mentors: mentors.length,
            applicants: pvlTrackMembers.filter((x) => x.admission.gardenRole === 'applicant').length,
            students: pvlTrackMembers.filter((x) => x.admission.gardenRole === 'student').length,
            trackMembers: pvlTrackMembers.length,
        };
    } catch (error) {
        logDbFallback({
            endpoint: '/profiles',
            status: 'error',
            table: 'profiles',
            id: null,
            error: String(error?.message || error || 'garden sync failed'),
        });
        return { synced: false, reason: 'error' };
    }
}

/** Технический userId для предпросмотра курса в учительской/менторе без реальных абитуриентов. Не показывается в списке «Ученицы». */
export const PVL_PREVIEW_STUDENT_ID = 'pvl-preview-cohort';

export function isPvlPreviewStudentId(userId) {
    return String(userId || '') === PVL_PREVIEW_STUDENT_ID;
}

/**
 * Гарантирует наличие профиля ученицы для отображения CMS (трекер, библиотека, глоссарий) без зависимости от абитуриентов из Сада.
 * Идемпотентно.
 */
export function ensurePvlPreviewStudentProfile() {
    if ((db.studentProfiles || []).some((p) => String(p.userId) === PVL_PREVIEW_STUDENT_ID)) {
        return PVL_PREVIEW_STUDENT_ID;
    }
    if (!(db.users || []).some((u) => String(u.id) === PVL_PREVIEW_STUDENT_ID)) {
        db.users.push({
            id: PVL_PREVIEW_STUDENT_ID,
            role: ROLES.STUDENT,
            fullName: 'Предпросмотр курса',
            email: '',
            avatar: '',
            isActive: true,
            gardenRole: 'preview',
            gardenRoleSource: '',
            createdAt: nowIso(),
            updatedAt: nowIso(),
        });
    }
    db.studentProfiles.push({
        id: uid('sp'),
        userId: PVL_PREVIEW_STUDENT_ID,
        cohortId: 'cohort-2026-1',
        mentorId: null,
        currentWeek: 0,
        currentModule: 1,
        courseStatus: COURSE_STATUS.ACTIVE,
        coursePoints: 0,
        szSelfAssessmentPoints: 0,
        szMentorAssessmentPoints: 0,
        szAdmissionStatus: CERTIFICATION_STATUS.NOT_STARTED,
        gardenRole: 'preview',
        lastActivityAt: nowIso().slice(0, 10),
        unreadCount: 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
    });
    return PVL_PREVIEW_STUDENT_ID;
}

function isTaskDisputeOpen(studentId, taskId) {
    return (db.taskDisputes || []).some((d) => d.studentId === studentId && d.taskId === taskId && d.status === 'open');
}

/** Обычные сообщения: запрещены, если работа принята и спор не открыт. Сообщения спора — только при открытом споре. */
export function canPostTaskThread(studentId, taskId, opts = {}) {
    const disputeOnly = !!opts.disputeOnly;
    const state = db.studentTaskStates.find((s) => s.studentId === studentId && s.taskId === taskId);
    const open = isTaskDisputeOpen(studentId, taskId);
    if (disputeOnly) {
        return state?.status === TASK_STATUS.ACCEPTED && open;
    }
    if (!state || state.status !== TASK_STATUS.ACCEPTED) return true;
    return false;
}

function openTaskDisputeCore(actorUserId, studentId, taskId, openedByRole) {
    const state = db.studentTaskStates.find((s) => s.studentId === studentId && s.taskId === taskId);
    if (!state || state.status !== TASK_STATUS.ACCEPTED) return { ok: false, reason: 'not_accepted' };
    if (isTaskDisputeOpen(studentId, taskId)) return { ok: false, reason: 'already_open' };
    db.taskDisputes.push({
        id: uid('td'),
        studentId,
        taskId,
        status: 'open',
        openedBy: openedByRole,
        openedAt: nowIso(),
    });
    const label = openedByRole === 'mentor' ? 'Ментор' : 'Участница';
    db.threadMessages.push({
        id: uid('tm'),
        studentId,
        taskId,
        authorUserId: 'system',
        authorRole: 'system',
        messageType: 'dispute_opened',
        text: `${label} открыл(а) спор по оценке. Дальнейшие сообщения — только в рамках спора.`,
        attachments: [],
        linkedVersionId: null,
        linkedStatusHistoryId: null,
        isSystem: true,
        createdAt: nowIso(),
        readBy: [],
    });
    addAuditEvent(actorUserId, openedByRole === 'mentor' ? ROLES.MENTOR : ROLES.STUDENT, 'dispute_opened', 'task', taskId, 'Task dispute opened', { studentId });
    persistSubmissionToDb(studentId, taskId);
    return { ok: true };
}

const uid = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const nowIso = () => new Date().toISOString();

const LIBRARY_CATEGORIES = [
    { id: 'evidence', title: 'Доказательная база', description: 'Исследования и проверенные источники' },
    { id: 'practice_map', title: 'Карта практик', description: 'Навигация по практикам курса' },
    { id: 'safety', title: 'Техника безопасности', description: 'Границы и экологичность ведения' },
    { id: 'myths', title: 'Мифы и объяснения', description: 'Разбор частых заблуждений' },
    { id: 'mentor_materials', title: 'Материалы для ведущих и менторов', description: 'Методические опоры' },
    { id: 'scenarios', title: 'Сценарии', description: 'Готовые сценарные заготовки' },
    { id: 'deep', title: 'Углубления', description: 'Продвинутые материалы' },
    { id: 'social_psy', title: 'Социальная психология', description: 'Психология групп и взаимодействий' },
    { id: 'online_offline', title: 'Онлайн и офлайн', description: 'Форматы и адаптация' },
    { id: 'mak', title: 'МАК', description: 'Работа с метафорическими картами' },
    { id: 'body_breath', title: 'Телесные и дыхательные практики', description: 'Тело и дыхание в группе' },
    { id: 'meeting_formats', title: 'Форматы встреч', description: 'Выбор формата под цель' },
    { id: 'cultural_code', title: 'Культурный код Лиги', description: 'Ценности и нормы участия' },
];

/** Демо-наполнение библиотеки отключено — материалы только из учительской / БД. */
const LIBRARY_MOCK_ITEMS = [];

/** Заголовок рамки для первых материалов модуля «Пиши» (категория доп. материалов). */
const PVL_WRITING_MODULE_LESSON_GROUP_TITLE = 'Научные основы письменных практик';

/**
 * Одно и то же название в БД/админке может иметь разные символы тире (U+2013/2014, ASCII -),
 * из-за чего миграция 011 и патч «шести материалов» не находят строку — материал без lessonGroupTitle.
 */
function normalizePvlContentTitleKey(title) {
    let s = String(title || '').trim().replace(/\s+/g, ' ');
    s = s.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '\u2014');
    s = s.replace(/\s-\s/g, ' \u2014 ');
    return s.trim();
}

/** Шесть материалов из библиотеки к модулю «Пиши» — общая рамка в UI. */
const PVL_WRITING_MODULE_LIBRARY_MATERIAL_TITLE_KEYS = new Set(
    [
        'Книги о письменных практиках и вокруг них',
        'Исследования о письменных практиках',
        'Лестница письменных практик — модель Кэтлин Адамс',
        'Карта письменных практик',
        'Польза групповых встреч',
        'Правила встречи с письменными практиками',
    ].map(normalizePvlContentTitleKey),
);

/**
 * Проставляет lessonGroupTitle для известных материалов (после загрузки из PostgREST и в памяти).
 * Постоянное хранение — миграция `011_pvl_library_writing_module_lesson_group.sql`.
 */
function applyPvlWritingModuleLibraryLessonGroupPatch() {
    const items = db.contentItems;
    if (!Array.isArray(items) || !items.length) return;
    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it || String(it.targetSection || '') !== 'library') continue;
        const key = normalizePvlContentTitleKey(it.title);
        if (!PVL_WRITING_MODULE_LIBRARY_MATERIAL_TITLE_KEYS.has(key)) continue;
        const prevLp = it.libraryPayload && typeof it.libraryPayload === 'object' ? it.libraryPayload : {};
        const nextLp = { ...prevLp, lessonGroupTitle: PVL_WRITING_MODULE_LESSON_GROUP_TITLE };
        items[i] = {
            ...it,
            libraryPayload: nextLp,
            libraryLessonGroupTitle: PVL_WRITING_MODULE_LESSON_GROUP_TITLE,
        };
    }
}

const pushEvent = (type, payload = {}) => {
    eventLog.push({ id: uid('evt'), type, payload, createdAt: nowIso() });
};

const addAuditEvent = (actorUserId, actorRole, actionType, entityType, entityId, summary, payload = {}) => {
    const row = {
        id: uid('aud'),
        actorUserId,
        actorRole,
        actionType,
        entityType,
        entityId,
        summary,
        payload,
        createdAt: nowIso(),
    };
    auditLog.push(row);
    fireAndForget(() => pvlPostgrestApi.createAuditLog({
        id: row.id,
        actor_user_id: actorUserId || null,
        action: actionType,
        entity_type: entityType,
        entity_id: entityId || null,
        payload: {
            actorRole: actorRole || 'system',
            summary,
            payload,
        },
        created_at: row.createdAt,
    }), { table: 'pvl_audit_log', endpoint: '/public.pvl_audit_log', id: row.id });
};

const addNotification = (userId, role, type, text, payload = {}) => {
    notifications.push({
        id: uid('ntf'),
        userId,
        role,
        type,
        text,
        payload,
        isRead: false,
        createdAt: nowIso(),
    });
};

const ensurePointsRecord = (studentId) => {
    let rec = db.studentPoints.find((x) => x.studentId === studentId);
    if (!rec) {
        rec = { id: uid('pts'), studentId, coursePointsTotal: 0, week0Points: 0, weeksPoints: 0, controlPointsTotal: 0, mentorBonusTotal: 0, szSelfAssessmentTotal: 0, szMentorAssessmentTotal: 0, updatedAt: nowIso() };
        db.studentPoints.push(rec);
    }
    return rec;
};

function upsertWeekCompletion(studentId, weekNumber, payload) {
    let row = db.weekCompletionState.find((x) => x.studentId === studentId && x.weekNumber === weekNumber);
    if (!row) {
        row = { id: uid('wk'), studentId, weekNumber, studiedCompleted: false, taskCompleted: false, submittedCompleted: false, weekClosed: false, autoPointsAwarded: 0, awardedAt: null };
        db.weekCompletionState.push(row);
    }
    Object.assign(row, payload);
    return row;
}

function upsertControlPointState(studentId, controlPointId, payload) {
    let row = db.controlPointState.find((x) => x.studentId === studentId && x.controlPointId === controlPointId);
    if (!row) {
        row = { id: uid('cpst'), studentId, controlPointId, status: 'not_started', pointsAwarded: 0, awardedAt: null, acceptedByUserId: null };
        db.controlPointState.push(row);
    }
    Object.assign(row, payload);
    return row;
}

function addPointsHistory(studentId, sourceType, sourceId, pointsDelta, sourceLabel, comment = '') {
    const exists = db.pointsHistory.find((x) => x.studentId === studentId && x.sourceType === sourceType && x.sourceId === sourceId);
    if (exists) return exists;
    const row = { id: uid('ph'), studentId, sourceType, sourceId, pointsDelta, sourceLabel, comment, createdAt: nowIso() };
    db.pointsHistory.push(row);
    return row;
}

function syncDerivedStatesForStudent(studentId) {
    const states = db.studentTaskStates.filter((s) => s.studentId === studentId);
    const tasks = db.homeworkTasks.filter((t) => states.some((s) => s.taskId === t.id));
    const byWeek = {};
    tasks.forEach((task) => {
        const st = states.find((s) => s.taskId === task.id);
        const weekNumber = Number(String(task.weekId || '').split('w').pop() || 0);
        if (!byWeek[weekNumber]) byWeek[weekNumber] = [];
        byWeek[weekNumber].push({ task, st });
        if (task.isControlPoint) {
            const accepted = st?.status === TASK_STATUS.ACCEPTED;
            const existingCp = db.controlPointState.find((x) => x.studentId === studentId && x.controlPointId === task.controlPointId);
            const keepAccepted = existingCp?.status === 'accepted';
            const effectiveAccepted = accepted || keepAccepted;
            upsertControlPointState(studentId, task.controlPointId, {
                status: effectiveAccepted ? 'accepted' : (st?.status || 'not_started'),
                pointsAwarded: effectiveAccepted ? SCORING_RULES.CONTROL_POINT_POINTS : 0,
                awardedAt: effectiveAccepted ? nowIso() : null,
                acceptedByUserId: effectiveAccepted ? 'system' : null,
            });
        }
    });

    Object.keys(byWeek).forEach((wk) => {
        const weekNumber = Number(wk);
        const items = byWeek[wk];
        const studiedCompleted = items.every((x) => x.st && x.st.status !== TASK_STATUS.NOT_STARTED);
        const taskCompleted = items.every((x) => x.st && [TASK_STATUS.SUBMITTED, TASK_STATUS.PENDING_REVIEW, TASK_STATUS.ACCEPTED, TASK_STATUS.REVISION_REQUESTED].includes(x.st.status));
        const submittedCompleted = items.every((x) => x.st && [TASK_STATUS.PENDING_REVIEW, TASK_STATUS.ACCEPTED, TASK_STATUS.REVISION_REQUESTED].includes(x.st.status));
        const derivedWeekClosed = items.every((x) => x.st && x.st.status === TASK_STATUS.ACCEPTED);
        const existingWk = db.weekCompletionState.find((x) => x.studentId === studentId && x.weekNumber === weekNumber);
        const weekClosed = !!existingWk?.weekClosed || derivedWeekClosed;
        upsertWeekCompletion(studentId, weekNumber, {
            studiedCompleted: studiedCompleted || !!existingWk?.studiedCompleted,
            taskCompleted: taskCompleted || !!existingWk?.taskCompleted,
            submittedCompleted: submittedCompleted || !!existingWk?.submittedCompleted,
            weekClosed,
            autoPointsAwarded: weekClosed ? SCORING_RULES.WEEK_CLOSURE_POINTS : 0,
            awardedAt: weekClosed ? nowIso() : null,
        });
    });

    // Week 0: seed может зафиксировать закрытие; иначе — по currentWeek > 0
    const profile = db.studentProfiles.find((p) => p.userId === studentId);
    const existing0 = db.weekCompletionState.find((x) => x.studentId === studentId && x.weekNumber === 0);
    const derived0Closed = (profile?.currentWeek || 0) > 0;
    const week0Closed = !!existing0?.weekClosed || derived0Closed;
    upsertWeekCompletion(studentId, 0, {
        studiedCompleted: true,
        taskCompleted: true,
        submittedCompleted: true,
        weekClosed: week0Closed,
        autoPointsAwarded: week0Closed ? SCORING_RULES.WEEK0_POINTS : 0,
        awardedAt: week0Closed ? nowIso() : null,
    });
}

function calculatePointsSummary(studentId) {
    syncDerivedStatesForStudent(studentId);
    const week0 = db.weekCompletionState.find((w) => w.studentId === studentId && w.weekNumber === 0);
    const week0Closed = !!week0?.weekClosed;
    const closedWeeks = db.weekCompletionState.filter((w) => w.studentId === studentId && w.weekNumber >= 1 && w.weekNumber <= 12 && w.weekClosed).length;
    const acceptedCp = db.controlPointState.filter((c) => c.studentId === studentId && c.status === 'accepted').length;
    const mentorBonusRaw = db.mentorBonusEvents.filter((e) => e.studentId === studentId).reduce((acc, e) => acc + (e.points || 0), 0);
    const courseBlock = computeCourseBreakdown({
        week0Closed,
        closedWeeks1to12: closedWeeks,
        acceptedControlPoints: acceptedCp,
        mentorBonusSum: mentorBonusRaw,
    });
    const { week0Points, weeksPoints, controlPointsTotal, mentorBonusTotal, coursePointsTotal } = courseBlock;
    const sz = db.szAssessmentState.find((x) => x.studentId === studentId);
    const szSelfAssessmentTotal = capSzSelf(sz?.selfAssessmentPoints || 0);
    const szMentorAssessmentTotal = capSzMentor(sz?.mentorAssessmentPoints || 0);

    // history append-once events
    if (week0Points > 0) addPointsHistory(studentId, 'week0', 'week0', SCORING_RULES.WEEK0_POINTS, 'Ориентация пройдена', '');
    db.weekCompletionState.filter((w) => w.studentId === studentId && w.weekNumber >= 1 && w.weekNumber <= 12 && w.weekClosed).forEach((w) => {
        const cw = db.courseWeeks.find((row) => row.weekNumber === w.weekNumber);
        const modLabel = cw?.moduleNumber ?? w.weekNumber;
        addPointsHistory(studentId, 'weekCompletion', String(w.weekNumber), SCORING_RULES.WEEK_CLOSURE_POINTS, `Закрыт модуль ${modLabel}`, '');
    });
    db.controlPointState.filter((c) => c.studentId === studentId && c.status === 'accepted').forEach((c) => {
        addPointsHistory(studentId, 'controlPoint', c.controlPointId, SCORING_RULES.CONTROL_POINT_POINTS, `Принята ${c.controlPointId}`, '');
    });
    db.mentorBonusEvents.filter((e) => e.studentId === studentId).forEach((e) => {
        addPointsHistory(studentId, 'mentorBonus', e.id, e.points, 'Бонус ментора', e.reason || '');
    });
    if (szSelfAssessmentTotal > 0) addPointsHistory(studentId, 'szSelfAssessment', studentId, szSelfAssessmentTotal, 'Самооценка СЗ', '');
    if (szMentorAssessmentTotal > 0) addPointsHistory(studentId, 'szMentorAssessment', studentId, szMentorAssessmentTotal, 'Оценка ментора СЗ', '');

    const rec = ensurePointsRecord(studentId);
    Object.assign(rec, { week0Points, weeksPoints, controlPointsTotal, mentorBonusTotal, coursePointsTotal, szSelfAssessmentTotal, szMentorAssessmentTotal, updatedAt: nowIso() });
    return rec;
}

function mapRuDecisionToTaskStatus(ru) {
    const r = String(ru || '').toLowerCase().trim();
    if (r === 'принято') return TASK_STATUS.ACCEPTED;
    if (r === 'на доработке') return TASK_STATUS.REVISION_REQUESTED;
    if (r === 'не принято') return TASK_STATUS.REJECTED;
    if (Object.values(TASK_STATUS).includes(ru)) return ru;
    return TASK_STATUS.REVISION_REQUESTED;
}

export function mapTaskStatus(status) {
    const map = {
        [TASK_STATUS.NOT_STARTED]: 'не начато',
        [TASK_STATUS.IN_PROGRESS]: 'в работе',
        [TASK_STATUS.DRAFT]: 'черновик',
        [TASK_STATUS.SUBMITTED]: 'отправлено',
        [TASK_STATUS.PENDING_REVIEW]: 'к проверке',
        [TASK_STATUS.ACCEPTED]: 'принято',
        [TASK_STATUS.REVISION_REQUESTED]: 'на доработке',
        [TASK_STATUS.REJECTED]: 'не принято',
        [TASK_STATUS.OVERDUE]: 'просрочено',
    };
    return map[status] || status;
}

/** Плашки для менти (отличаются от служебного mapTaskStatus: «на проверке», «проверено»). */
export function mapStudentHomeworkDisplayStatus(state) {
    if (!state) return 'не начато';
    const s = state.status;
    if (state.isOverdue && s !== TASK_STATUS.ACCEPTED) return 'просрочено';
    if (s === TASK_STATUS.ACCEPTED) {
        if (state.acceptedAt && !state.reviewSeenByStudentAt) return 'проверено';
        return 'принято';
    }
    if (s === TASK_STATUS.NOT_STARTED) return 'не начато';
    if (s === TASK_STATUS.IN_PROGRESS) return 'в работе';
    if (s === TASK_STATUS.DRAFT) return 'черновик';
    if (s === TASK_STATUS.SUBMITTED) return 'отправлено';
    if (s === TASK_STATUS.PENDING_REVIEW) return 'на проверке';
    if (s === TASK_STATUS.REVISION_REQUESTED) return 'на доработке';
    if (s === TASK_STATUS.REJECTED) return 'не принято';
    if (s === TASK_STATUS.OVERDUE) return 'просрочено';
    return mapTaskStatus(s);
}

export function mapStudentControlPointDisplayStatus(cpState, deadlineAt, today = DASHBOARD_TODAY) {
    const raw = cpState?.status || 'not_started';
    if (raw === 'accepted') return 'принято';
    const overdue = deadlineAt && diffCourseDays(today, deadlineAt) > 0 && raw !== 'accepted';
    if (overdue) return 'просрочено';
    if (raw === 'pending_review' || raw === TASK_STATUS.PENDING_REVIEW) return 'на проверке';
    if (raw === 'not_started' || raw === undefined) return 'не начато';
    return 'выполнено';
}

function computeStudentDashboardWidgets(studentId) {
    const profile = db.studentProfiles.find((p) => p.userId === studentId);
    const cohort = db.cohorts.find((c) => c.id === profile?.cohortId);
    const today = DASHBOARD_TODAY;
    const mod = profile?.currentModule ?? 1;
    const modWeeks = CANONICAL_SCHEDULE_2026.weeks.filter((w) => w.moduleNumber === mod);
    const moduleEndDate = modWeeks.length
        ? modWeeks.reduce((a, w) => (String(w.endDate) > String(a) ? w.endDate : a), modWeeks[0].endDate)
        : cohort?.endDate;
    const daysToModuleEnd = moduleEndDate ? Math.max(0, diffCourseDays(moduleEndDate, today)) : 0;
    const daysToCourseEnd = cohort?.endDate ? Math.max(0, diffCourseDays(cohort.endDate, today)) : 0;
    const daysToSzSubmission = Math.max(0, getDaysToSzDeadline(today));

    const lessons = db.lessons.filter((l) => {
        const w = db.courseWeeks.find((cw) => cw.id === l.weekId);
        return w?.cohortId === profile?.cohortId;
    });
    const lessonsTotal = Math.max(1, lessons.length);
    const cw = profile?.currentWeek ?? 0;
    const lessonsDone = lessons.filter((l) => {
        const w = db.courseWeeks.find((x) => x.id === l.weekId);
        return w && w.weekNumber <= cw;
    }).length;
    const lessonsRemaining = Math.max(0, lessonsTotal - lessonsDone);

    const taskStates = db.studentTaskStates.filter((s) => s.studentId === studentId);
    const homeworkTotal = Math.max(1, taskStates.length);
    const homeworkDone = taskStates.filter((s) => s.status === TASK_STATUS.ACCEPTED).length;
    const homeworkRemaining = Math.max(0, taskStates.length - homeworkDone);

    const modTitle = pvlPlatformModuleTitleFromInternal(mod);

    const pts = calculatePointsSummary(studentId);

    return {
        currentModuleTitle: modTitle,
        currentModuleNumber: mod,
        daysToModuleEnd,
        lessonsDone,
        lessonsRemaining,
        lessonsTotal,
        homeworkDone,
        homeworkRemaining,
        homeworkTotal: taskStates.length,
        daysToCourseEnd,
        daysToSzSubmission,
        coursePoints: pts.coursePointsTotal,
        szSelfAssessmentPoints: pts.szSelfAssessmentTotal,
    };
}

function buildStudentActivityFeed(studentId, limit = 10) {
    const items = [];
    const msgs = db.threadMessages
        .filter((m) => m.studentId === studentId)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, 40);
    for (const m of msgs) {
        const task = m.taskId ? db.homeworkTasks.find((t) => t.id === m.taskId) : null;
        const taskHint = task?.title || m.taskId || '';
        if (m.messageType === 'dispute_opened' || (m.isSystem && String(m.text).includes('спор'))) {
            items.push({ id: m.id, kind: 'dispute', text: 'Открыт спор по оценке', detail: taskHint, at: m.createdAt, taskId: m.taskId });
            continue;
        }
        if (m.authorRole === ROLES.MENTOR && !m.isSystem && m.messageType !== 'mentor_review') {
            items.push({ id: m.id, kind: 'mentor_comment', text: 'Ментор оставил комментарий', detail: taskHint, at: m.createdAt, taskId: m.taskId });
            continue;
        }
        if (m.messageType === 'mentor_review') {
            items.push({ id: m.id, kind: 'review', text: 'Домашка проверена, посмотрите оценку', detail: taskHint, at: m.createdAt, taskId: m.taskId });
            continue;
        }
        if (m.isSystem && String(m.text).toLowerCase().includes('принят')) {
            items.push({ id: m.id, kind: 'accepted', text: 'Работа принята', detail: taskHint, at: m.createdAt, taskId: m.taskId });
        }
    }
    items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const seen = new Set();
    const out = [];
    for (const it of items) {
        const k = `${it.kind}-${it.taskId || ''}-${it.text}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(it);
        if (out.length >= limit) break;
    }
    return out;
}

function getStudentSnapshot(studentId) {
    const profile = db.studentProfiles.find((p) => p.userId === studentId);
    const user = db.users.find((u) => u.id === studentId);
    return { user, profile };
}

/**
 * Демо без actingUserId: берём profiles[0] чтобы канбан не был пустым.
 * В продакшне (реальный UUID передан) — всегда возвращаем сам ID, иначе при наличии
 * нескольких менторов в базе всегда показывались бы менти первого ментора.
 */
function resolveMentorActorId(mentorId) {
    const profiles = db.mentorProfiles || [];
    if (!mentorId) return profiles[0]?.userId || null;
    if (profiles.some((m) => m.userId === mentorId)) return mentorId;
    // Есть ID, но профиль ещё не синхронизирован — возвращаем ID напрямую.
    // Fallback на profiles[0] допустим только в демо (нет актуального actingUserId).
    const isDemoId = /^u-(men|st|adm)-/.test(String(mentorId));
    return isDemoId ? (profiles[0]?.userId || mentorId) : mentorId;
}

function getMentorMenteeIds(mentorId) {
    const resolved = resolveMentorActorId(mentorId);
    if (!resolved) return [];
    const mentorProfile = (db.mentorProfiles || []).find((m) => m.userId === resolved);
    const fromMentorProfile = Array.isArray(mentorProfile?.menteeIds) ? mentorProfile.menteeIds : [];
    const fromStudentProfiles = db.studentProfiles.filter((p) => p.mentorId === resolved).map((p) => p.userId);
    let ids = Array.from(new Set([...fromMentorProfile, ...fromStudentProfiles].map((id) => String(id))));
    if (db._pvlGardenApplicantsSynced) {
        ids = ids.filter((id) => !isSeedPvlDemoStudentId(id));
    }
    return ids;
}

/**
 * Все абитуриенты потока ментора (по cohortIds профиля): актуальный список из Сада после syncPvlActorsFromGarden.
 * Отличается от «Мои менти»: здесь весь поток, с отметкой «ваш менти».
 */
function buildMentorCohortApplicantRows(mentorId) {
    const resolved = resolveMentorActorId(mentorId);
    if (!resolved) return [];
    const mp = (db.mentorProfiles || []).find((m) => m.userId === resolved);
    const cohortIds = mp?.cohortIds?.length ? mp.cohortIds : ['cohort-2026-1'];
    let profiles = (db.studentProfiles || []).filter((p) => cohortIds.includes(p.cohortId));
    if (db._pvlGardenApplicantsSynced) {
        profiles = profiles.filter((p) => !isSeedPvlDemoStudentId(p.userId));
    }
    return profiles
        .map((p) => {
            const user = db.users.find((u) => u.id === p.userId);
            const gr = p.gardenRole ?? user?.gardenRole ?? null;
            const mentorUid = p.mentorId;
            const mentorUser = mentorUid ? db.users.find((u) => u.id === mentorUid) : null;
            const mentorName = mentorUid ? (mentorUser?.fullName || String(mentorUid)) : '—';
            const isMyMentee = !!mentorUid && (mentorUid === resolved || (mp?.menteeIds || []).includes(p.userId));
            return {
                userId: p.userId,
                fullName: user?.fullName || p.userId,
                email: user?.email || '',
                cohortId: p.cohortId,
                mentorId: mentorUid || null,
                mentorName,
                isMyMentee,
                gardenRole: gr || null,
                statusLabelRu: pvlGardenRoleLabelRu(gr),
            };
        })
        .filter((r) => !isPvlPreviewStudentId(r.userId));
}

function getTaskDetail(studentId, taskId) {
    const task = db.homeworkTasks.find((t) => t.id === taskId);
    const state = db.studentTaskStates.find((s) => s.studentId === studentId && s.taskId === taskId);
    const submission = db.submissions.find((s) => s.studentId === studentId && s.taskId === taskId);
    const versions = db.submissionVersions.filter((v) => v.submissionId === submission?.id).sort((a, b) => a.versionNumber - b.versionNumber);
    const history = db.statusHistory.filter((h) => h.studentId === studentId && h.taskId === taskId);
    const thread = db.threadMessages
        .filter((m) => m.studentId === studentId && m.taskId === taskId)
        .slice()
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    return {
        task,
        state,
        submission,
        versions,
        history,
        thread,
        disputeOpen: isTaskDisputeOpen(studentId, taskId),
    };
}

function buildSubmissionPayload(studentId, taskId, submissionId) {
    const versions = db.submissionVersions
        .filter((v) => v.submissionId === submissionId)
        .sort((a, b) => Number(a.versionNumber || 0) - Number(b.versionNumber || 0));
    const thread = db.threadMessages
        .filter((m) => m.studentId === studentId && m.taskId === taskId)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const currentVersionId = versions.find((v) => v.isCurrent)?.id || null;
    const draftVersionId = versions.find((v) => v.isDraft)?.id || null;
    return { versions, thread, currentVersionId, draftVersionId };
}

function persistTrackerProgressToDb(studentId) {
    const sqlStudentId = studentSqlIdByUserId(studentId);
    if (!sqlStudentId) return;
    const checkedMap = db.studentTrackerChecks?.[studentId] || {};
    const checkedKeys = Object.keys(checkedMap).filter((k) => checkedMap[k]);
    const moduleByStepKey = new Map();
    PVL_PLATFORM_MODULES.forEach((mod) => {
        mod.items.forEach((item, index) => {
            const stepId = String(item?.id || '').trim();
            if (stepId) moduleByStepKey.set(`sid:${stepId}`, Number(mod.id));
            const textSlug = String(item?.text || '')
                .trim()
                .toLowerCase()
                .replace(/[^\p{L}\p{N}]+/gu, '-')
                .replace(/^-+|-+$/g, '');
            moduleByStepKey.set(`m:${mod.id}:s:${textSlug || index}`, Number(mod.id));
            moduleByStepKey.set(`${mod.id}-${index}`, Number(mod.id)); // backward-compatible legacy key
        });
    });
    const groupedByModule = new Map();
    checkedKeys.forEach((k) => {
        const moduleId = moduleByStepKey.get(String(k));
        if (!Number.isFinite(moduleId)) return;
        if (!groupedByModule.has(moduleId)) groupedByModule.set(moduleId, []);
        groupedByModule.get(moduleId).push(k);
    });
    groupedByModule.forEach((keys, moduleId) => {
        const week = (db.courseWeeks || []).find((w) => Number(w.moduleNumber ?? -1) === Number(moduleId))
            || (db.courseWeeks || []).find((w) => Number(w.weekNumber ?? -1) === Number(moduleId));
        const sqlWeekId = week ? sqlWeekIdByMockWeekId.get(String(week.id)) : null;
        if (!sqlWeekId) return;
        fireAndForget(async () => {
            await ensurePvlStudentInDb(studentId);
            return pvlPostgrestApi.upsertStudentCourseProgress(sqlStudentId, {
                week_id: sqlWeekId,
                lessons_completed: keys.length,
                lessons_total: keys.length,
                homework_completed: 0,
                homework_total: 0,
                is_week_closed: keys.length > 0,
                auto_points_awarded: false,
                payload: { checkedKeys: keys },
            });
        }, { table: 'pvl_student_course_progress', endpoint: '/pvl_student_course_progress', id: `${sqlStudentId}:${sqlWeekId}` });
    });
}

async function doPersistSubmissionToDb(studentId, taskId) {
    const sqlStudentId = studentSqlIdByUserId(studentId);
    if (!sqlStudentId) return;
    const state = db.studentTaskStates.find((s) => s.studentId === studentId && s.taskId === taskId);
    const submission = db.submissions.find((s) => s.studentId === studentId && s.taskId === taskId);
    if (!state || !submission) return;
    const payload = buildSubmissionPayload(studentId, taskId, submission.id);

    /** Сначала гарантируем наличие строки студента в pvl_students (FK-ограничение). */
    await ensurePvlStudentInDb(studentId);

    /**
     * sqlHomeworkIdByMockTaskId заполняется в ensureDbTrackerHomeworkStructure во время syncPvlRuntimeFromDb.
     * Но db.homeworkTasks заполняется лениво (syncPublishedHomeworkTasksForStudent), поэтому
     * к моменту первого сабмита карта может быть пустой — вызываем инициализацию повторно.
     */
    let sqlHomeworkId = sqlHomeworkIdByMockTaskId.get(String(taskId));
    if (!sqlHomeworkId) {
        await ensureDbTrackerHomeworkStructure();
        sqlHomeworkId = sqlHomeworkIdByMockTaskId.get(String(taskId));
    }
    if (!sqlHomeworkId) {
        throw new Error(`sqlHomeworkId not found for taskId=${taskId}`);
    }

    const existing = await pvlPostgrestApi.listStudentHomeworkSubmissions(sqlStudentId);
    const row = (existing || []).find((x) => String(x.homework_item_id) === String(sqlHomeworkId));
    const patch = {
        student_id: sqlStudentId,
        homework_item_id: sqlHomeworkId,
        status: state.status || 'draft',
        score: Number.isFinite(Number(state.autoPoints)) ? Number(state.autoPoints) : null,
        mentor_bonus_score: Number(state.mentorBonusPoints || 0),
        submitted_at: state.submittedAt ? `${String(state.submittedAt).slice(0, 10)}T00:00:00Z` : null,
        checked_at: state.lastStatusChangedAt ? `${String(state.lastStatusChangedAt).slice(0, 10)}T00:00:00Z` : null,
        accepted_at: state.acceptedAt ? `${String(state.acceptedAt).slice(0, 10)}T00:00:00Z` : null,
        revision_cycles: Number(state.revisionCycles || 0),
        payload,
    };
    if (!row) {
        await pvlPostgrestApi.createHomeworkSubmission(patch);
        return;
    }
    await pvlPostgrestApi.updateHomeworkSubmission(row.id, patch);
    const historyRows = db.statusHistory.filter((h) => h.studentId === studentId && h.taskId === taskId);
    for (const h of historyRows.slice(-3)) {
        // eslint-disable-next-line no-await-in-loop
        await pvlPostgrestApi.appendHomeworkStatusHistory({
            submission_id: row.id,
            from_status: h.fromStatus || null,
            to_status: h.toStatus || null,
            comment: h.comment || '',
            changed_by: null,
            changed_at: h.createdAt || nowIso(),
            payload: { studentId, taskId },
        });
    }
}

function persistSubmissionToDb(studentId, taskId) {
    const RETRY_DELAYS_MS = [0, 2000, 5000];
    fireAndForget(async () => {
        let lastErr;
        for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
            if (RETRY_DELAYS_MS[attempt] > 0) {
                // eslint-disable-next-line no-await-in-loop
                await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
            }
            try {
                // eslint-disable-next-line no-await-in-loop
                await doPersistSubmissionToDb(studentId, taskId);
                return; // сохранено — выходим
            } catch (e) {
                lastErr = e;
            }
        }
        // Все попытки исчерпаны — уведомляем ученицу
        addNotification(
            studentId,
            ROLES.STUDENT,
            'db_save_error',
            'Не удалось сохранить домашнее задание на сервере. Попробуй обновить страницу и отправить ещё раз.',
            { taskId, error: String(lastErr?.message || lastErr || 'unknown') },
        );
        logDbFallback({
            endpoint: '/pvl_student_homework_submissions',
            status: 'error',
            table: 'pvl_student_homework_submissions',
            id: `${studentId}:${taskId}`,
            error: String(lastErr?.message || lastErr || 'unknown'),
        });
    }, { table: 'pvl_student_homework_submissions', endpoint: '/pvl_student_homework_submissions', id: `${studentId}:${taskId}` });
}

function persistContentProgressToDb(studentId, itemId) {
    if (!pvlPostgrestApi.isEnabled()) return;
    if (!itemId) return;
    const sqlStudentId = studentSqlIdByUserId(studentId);
    if (!sqlStudentId) return;
    fireAndForget(async () => {
        await ensurePvlStudentInDb(studentId);
        const pr = (db.studentLibraryProgress || []).find(
            (x) => x.studentId === studentId && x.libraryItemId === itemId,
        );
        if (!pr) return;
        await pvlPostgrestApi.upsertStudentContentProgress(sqlStudentId, {
            content_item_id: itemId,
            progress_percent: pr.progressPercent || 0,
            completed: !!pr.completed,
            last_opened_at: pr.lastOpenedAt || null,
            completed_at: pr.completedAt || null,
        });
    }, { table: 'pvl_student_content_progress', endpoint: '/pvl_student_content_progress', id: `${studentId}:${itemId}` });
}

function placementTargetRoleMatchesStudentOrMentor(p, role) {
    const pr = String(p?.targetRole ?? 'both').toLowerCase();
    const want = String(role ?? '').toLowerCase();
    return pr === want || pr === 'both';
}

function contentItemIdFromPlacement(p) {
    const raw = p?.contentItemId ?? p?.contentId;
    return raw == null ? '' : String(raw);
}

/**
 * Опубликованные материалы раздела для роли и потока.
 * Важно: искать материал по contentItemId || contentId (как в hasPublishedPlacementForStudentContent);
 * isPublished — не строгая truthy-проверка; роль — безопасное сравнение.
 */
function getPublishedContentFor(role, section, cohortId) {
    return (db.contentPlacements || [])
        .filter((p) => p && String(p.targetSection || '') === String(section || ''))
        .filter((p) => p.isPublished !== false)
        .filter((p) => pvlPlacementVisibleForCohort(p.cohortId, cohortId))
        .filter((p) => placementTargetRoleMatchesStudentOrMentor(p, role))
        .map((p) => {
            const cid = contentItemIdFromPlacement(p);
            const want = cid ? normalizePvlEntityId(cid) : '';
            const item = want ? (db.contentItems || []).find((ci) => normalizePvlEntityId(ci.id) === want) : null;
            return { placement: p, item };
        })
        .filter((x) => {
            if (!x.item || x.item.status !== CONTENT_STATUS.PUBLISHED) return false;
            return publishedContentVisibleToRole(x.item, cohortId, role);
        })
        .sort((a, b) => Number(a.placement.orderIndex ?? 0) - Number(b.placement.orderIndex ?? 0))
        .map((x) => x.item);
}

function getVisibleContentItems(userId, role, section) {
    const profile = db.studentProfiles.find((p) => p.userId === userId);
    const cohortId = profile?.cohortId || 'cohort-2026-1';
    return getPublishedContentFor(role, section, cohortId);
}

/** Неделя курса для материала урока: к `weekId` из CMS или по week/module номеру ученицы. */
function resolveWeekRowForStudentContentItem(contentItem, studentId) {
    const profile = db.studentProfiles.find((p) => p.userId === studentId);
    const cohortId = profile?.cohortId || 'cohort-2026-1';
    const weeks = (db.courseWeeks || []).filter((w) => w.cohortId === cohortId);
    if (contentItem?.weekId && weeks.some((w) => w.id === contentItem.weekId)) {
        return weeks.find((w) => w.id === contentItem.weekId);
    }
    const wn = contentItem?.weekNumber != null ? Number(contentItem.weekNumber) : NaN;
    if (Number.isFinite(wn)) {
        return weeks.find((w) => Number(w.weekNumber) === wn) || null;
    }
    const mn = contentItem?.moduleNumber != null ? Number(contentItem.moduleNumber) : NaN;
    if (Number.isFinite(mn)) {
        return weeks.find((w) => Number(w.moduleNumber) === mn) || null;
    }
    return null;
}

/**
 * Создаёт `homeworkTasks` + `studentTaskStates` + `submissions` для всех опубликованных уроков с lesson_kind = homework.
 * Единый контур с канбаном и «Результатами» (источник истины — studentTaskStates после синка).
 */
function syncPublishedHomeworkTasksForStudent(studentId) {
    if (!studentId) return;
    const items = getVisibleContentItems(studentId, ROLES.STUDENT, 'lessons');
    for (const item of items) {
        if (resolvePvlLessonKind(item) === 'homework') {
            ensureTaskForContentItem(studentId, item);
        }
    }
}

function syncPublishedHomeworkTasksForMentorMentees(mentorId) {
    const ids = getMentorMenteeIds(mentorId);
    ids.forEach((id) => syncPublishedHomeworkTasksForStudent(id));
}

/** Согласовано с getPublishedContentBySection в PvlPrototypeApp.jsx */
function publishedContentVisibleToRole(item, cohortId, role) {
    const vis = item.visibility || 'all';
    const ir = String(item.targetRole ?? 'both').toLowerCase();
    const want = String(role ?? '').toLowerCase();
    const roleAllowed = ir === want || ir === 'both';
    return (
        vis === 'all'
        || (vis === 'by_role' && roleAllowed)
        || ((vis === 'by_cohort' || vis === 'cohort')
            && (!item.targetCohort || pvlCohortIdsEquivalent(item.targetCohort, cohortId)))
    );
}

/** Разделы, в которых размещение даёт ученице доступ к материалу для трекера / чтения (не весь список разделов CMS). */
const STUDENT_CONTENT_RESOLVER_PLACEMENT_SECTIONS = new Set(['lessons', 'library', 'glossary']);

function hasPublishedPlacementForStudentContent(contentId, cohortId) {
    const want = normalizePvlEntityId(contentId);
    if (!want) return false;
    return (db.contentPlacements || []).some((p) => {
        const pid = normalizePvlEntityId(p.contentItemId ?? p.contentId);
        if (pid !== want) return false;
        if (p.isPublished === false) return false;
        if (!placementTargetRoleMatchesStudentOrMentor(p, ROLES.STUDENT)) return false;
        if (!pvlPlacementVisibleForCohort(p.cohortId, cohortId)) return false;
        if (!STUDENT_CONTENT_RESOLVER_PLACEMENT_SECTIONS.has(String(p.targetSection || ''))) return false;
        return true;
    });
}

/**
 * Доступ ученицы к материалу по id: опубликованная привязка в content_placements ИЛИ
 * та же логика «карточка в разделе без отдельного placement», что в getPublishedContentBySection
 * (views/PvlPrototypeApp.jsx): `inSection = item.targetSection === sectionKey || hasPlacement`.
 * Иначе новые уроки без строки размещения попадают в трекер/списки, но не открываются по id.
 */
function publishedStudentContentAccessibleByPlacementOrCard(item, cohortId) {
    if (!item?.id) return false;
    if (hasPublishedPlacementForStudentContent(item.id, cohortId)) return true;
    const sec = String(item.targetSection || '');
    return STUDENT_CONTENT_RESOLVER_PLACEMENT_SECTIONS.has(sec);
}

/**
 * Опубликованный материал по id для ученицы: published + visibility + (placement или карточка в уроках/библиотеке/глоссарии).
 * Не заменяет getPublishedLibraryItemById для списка библиотеки.
 */
function getPublishedContentItemForStudent(studentId, contentId) {
    if (!contentId || !studentId) return null;
    const profile = db.studentProfiles.find((p) => p.userId === studentId);
    /**
     * Профиль может отсутствовать если синхронизация с Садом ещё не завершена
     * или пользователь только что сменил роль. Используем потоковый fallback:
     * материалы без cohortId видны всем, а cohort-2026-1 — текущий активный поток.
     */
    const cohortId = profile?.cohortId || 'cohort-2026-1';
    const wantId = normalizePvlEntityId(contentId);
    const item = wantId ? (db.contentItems || []).find((ci) => normalizePvlEntityId(ci.id) === wantId) : null;
    if (!item || item.status !== CONTENT_STATUS.PUBLISHED) return null;
    if (!publishedContentVisibleToRole(item, cohortId, ROLES.STUDENT)) return null;
    if (!publishedStudentContentAccessibleByPlacementOrCard(item, cohortId)) return null;
    const pr = db.studentLibraryProgress.find((x) => x.studentId === studentId && x.libraryItemId === item.id);
    const lp = item.libraryPayload && typeof item.libraryPayload === 'object' ? item.libraryPayload : {};
    const libraryLessonGroupTitle = String(item.libraryLessonGroupTitle || lp.lessonGroupTitle || '').trim();
    return {
        ...item,
        libraryLessonGroupTitle,
        progressPercent: pr?.progressPercent || 0,
        completed: !!pr?.completed,
        completedAt: pr?.completedAt || null,
        lastOpenedAt: pr?.lastOpenedAt || null,
    };
}

function ensureLibrarySeedInDb() {
    if (!LIBRARY_MOCK_ITEMS.length) return;
    const hasPublishedLibraryContent = (db.contentPlacements || []).some((p) => {
        if (p.targetSection !== 'library' || p.isPublished === false) return false;
        const itemId = p.contentItemId || p.contentId;
        const item = (db.contentItems || []).find((x) => x.id === itemId);
        return !!item && item.status === CONTENT_STATUS.PUBLISHED;
    });
    if (hasPublishedLibraryContent) return;
    const existingIds = new Set(db.contentItems.map((x) => x.id));
    LIBRARY_MOCK_ITEMS.forEach((item, index) => {
        if (!existingIds.has(item.id)) db.contentItems.push(item);
        if (!db.contentPlacements.some((p) => p.contentItemId === item.id && p.targetSection === 'library')) {
            db.contentPlacements.push({
                id: newPvlPersistedEntityId(),
                contentItemId: item.id,
                targetSection: 'library',
                targetRole: index % 7 === 0 ? 'both' : 'student',
                cohortId: 'cohort-2026-1',
                weekNumber: 0,
                moduleNumber: 0,
                orderIndex: item.orderIndex || index + 1,
                isPublished: true,
                createdAt: nowIso(),
                updatedAt: nowIso(),
            });
        }
    });
}

function getPublishedLibraryContentForStudent(studentId) {
    if (!studentId) return [];
    ensureLibrarySeedInDb();
    const profile = db.studentProfiles.find((p) => p.userId === studentId);
    /**
     * Без раннего return []: профиль подтягивается async из Сада; пока его нет,
     * используем тот же потоковый fallback, что и в getPublishedContentItemForStudent.
     */
    const cohortId = profile?.cohortId || 'cohort-2026-1';
    const items = getPublishedContentFor(ROLES.STUDENT, 'library', cohortId);
    return items.map((item) => {
        const pr = db.studentLibraryProgress.find((x) => x.studentId === studentId && x.libraryItemId === item.id);
        const lp = item.libraryPayload && typeof item.libraryPayload === 'object' ? item.libraryPayload : {};
        const libraryLessonGroupTitle = String(item.libraryLessonGroupTitle || lp.lessonGroupTitle || '').trim();
        return {
            ...item,
            libraryLessonGroupTitle,
            progressPercent: pr?.progressPercent || 0,
            completed: !!pr?.completed,
            completedAt: pr?.completedAt || null,
            lastOpenedAt: pr?.lastOpenedAt || null,
        };
    });
}

function isTrackerOnlyLibraryItem(item) {
    return PVL_TRACKER_LIBRARY_EXCLUDE_CATEGORY_IDS.includes(String(item?.categoryId || '').trim());
}

/** Материалы библиотеки в UI: без категорий, которые живут только в трекере (модуль 0 и т.п.). */
function getLibraryUiItemsForStudent(studentId) {
    return getPublishedLibraryContentForStudent(studentId).filter((i) => !isTrackerOnlyLibraryItem(i));
}

function getLibraryCategoriesWithCounts(studentId) {
    const items = getLibraryUiItemsForStudent(studentId);
    const baseCategories = [...LIBRARY_CATEGORIES];
    const existingIds = new Set(baseCategories.map((c) => String(c.id || '').toLowerCase()));
    const existingTitles = new Set(baseCategories.map((c) => String(c.title || '').toLowerCase()));
    items.forEach((item) => {
        const title = String(item.categoryTitle || '').trim();
        const id = String(item.categoryId || '').trim();
        const titleKey = title.toLowerCase();
        const idKey = id.toLowerCase();
        if (!title) return;
        if (existingTitles.has(titleKey) || (idKey && existingIds.has(idKey))) return;
        const normalizedId = id || `cat-${titleKey.replace(/\s+/g, '-')}`;
        baseCategories.push({
            id: normalizedId,
            title,
        });
        existingIds.add(String(normalizedId).toLowerCase());
        existingTitles.add(titleKey);
    });
    return baseCategories.map((c) => {
        const categoryItems = items.filter((i) => {
            const itemCategoryId = String(i.categoryId || '').toLowerCase();
            const itemCategoryTitle = String(i.categoryTitle || '').toLowerCase();
            const categoryId = String(c.id || '').toLowerCase();
            const categoryTitle = String(c.title || '').toLowerCase();
            return itemCategoryId === categoryId || itemCategoryTitle === categoryTitle;
        });
        const completed = categoryItems.filter((i) => i.completed).length;
        return {
            ...c,
            count: categoryItems.length,
            completed,
            progressPercent: categoryItems.length ? Math.round((completed / categoryItems.length) * 100) : 0,
        };
    });
}

function getLibraryItemsByCategory(studentId, categoryId) {
    if (PVL_TRACKER_LIBRARY_EXCLUDE_CATEGORY_IDS.includes(String(categoryId || '').trim())) return [];
    const items = getLibraryUiItemsForStudent(studentId);
    return items.filter((i) => i.categoryId === categoryId || (i.categoryTitle || '').toLowerCase() === categoryId);
}

/** Метаданные формата ДЗ из homework_config (урок): standard | checklist | questionnaire. */
function buildHomeworkMetaFromLessonHw(lessonHomework) {
    const hw = lessonHomework && typeof lessonHomework === 'object' ? lessonHomework : {};
    const raw = String(hw.assignmentType || hw.assignment_type || 'standard').toLowerCase();
    let assignmentType = 'standard';
    if (raw === 'checklist') assignmentType = 'checklist';
    else if (raw === 'questionnaire') assignmentType = 'questionnaire';

    let checklistSections = Array.isArray(hw.checklistSections) ? hw.checklistSections : null;
    if (assignmentType === 'checklist' && (!checklistSections || checklistSections.length === 0)) {
        checklistSections = JSON.parse(JSON.stringify(DEFAULT_REFLEX_CHECKLIST_SECTIONS));
    }
    let questionnaireBlocks = normalizeQuestionnaireBlocks(
        Array.isArray(hw.questionnaireBlocks) ? hw.questionnaireBlocks : (Array.isArray(hw.blocks) ? hw.blocks : []),
    );
    if (assignmentType === 'questionnaire' && (!questionnaireBlocks || questionnaireBlocks.length === 0)) {
        questionnaireBlocks = createDefaultQuestionnaireBlocks();
    }
    return {
        assignmentType,
        checklistSections: assignmentType === 'checklist' ? checklistSections : null,
        questionnaireBlocks: assignmentType === 'questionnaire' ? questionnaireBlocks : null,
        questionnaireTitle: assignmentType === 'questionnaire' ? String(hw.questionnaireTitle || hw.title || '').trim() : null,
    };
}

function flattenChecklistItemIds(sections) {
    const ids = [];
    (sections || []).forEach((sec) => {
        (sec?.items || []).forEach((it) => {
            if (it?.id) ids.push(String(it.id));
        });
    });
    return ids;
}

function isChecklistAnswersComplete(sections, answersJson) {
    const ids = flattenChecklistItemIds(sections);
    if (!ids.length) return false;
    const a = answersJson && typeof answersJson === 'object' ? answersJson : {};
    return ids.every((id) => !isHomeworkAnswerEmpty(a[id]));
}

function ensureTaskForContentItem(studentId, contentItem) {
    let task = db.homeworkTasks.find(t => t.linkedContentItemId === contentItem.id);

    if (!task && contentItem.linkedLessonId) {
        task = db.homeworkTasks.find(t =>
            (t.linkedLessonIds || []).includes(contentItem.linkedLessonId)
        );
    }

    if (task && !task.linkedContentItemId) {
        task.linkedContentItemId = contentItem.id;
    }

    if (!task) {
        const weekRow = resolveWeekRowForStudentContentItem(contentItem, studentId);
        const hwCfg = contentItem.lessonHomework && typeof contentItem.lessonHomework === 'object' ? contentItem.lessonHomework : {};
        const scoreFromConfig = Number(hwCfg.maxScore ?? hwCfg.scoreMax);
        task = {
            id: `task-ci-${contentItem.id}`,
            linkedContentItemId: contentItem.id,
            linkedLessonIds: contentItem.linkedLessonId ? [contentItem.linkedLessonId] : [],
            weekId: contentItem.weekId || weekRow?.id || null,
            title: contentItem.title || 'Домашнее задание',
            description: contentItem.lessonHomework?.prompt || contentItem.shortDescription || '',
            artifact: contentItem.lessonHomework?.expectedResult || 'Текст',
            criteria: [],
            uploadTypes: contentItem.lessonHomework?.allowFile ? ['text', 'file'] : ['text'],
            taskType: 'homework',
            isControlPoint: false,
            controlPointId: null,
            deadlineAt: contentItem.deadlineAt || weekRow?.endDate || null,
            scoreMax: Number.isFinite(scoreFromConfig) && scoreFromConfig > 0 ? Math.round(scoreFromConfig) : 0,
            scoreType: 'course_points',
            linkedPracticumIds: [],
            linkedCertificationStage: null,
            createdAt: nowIso(),
            updatedAt: nowIso(),
        };
        db.homeworkTasks.push(task);
    }

    const hwMeta = buildHomeworkMetaFromLessonHw(contentItem.lessonHomework);
    task.homeworkMeta = hwMeta;
    task.title = contentItem.title || task.title || 'Домашнее задание';
    task.updatedAt = nowIso();

    let state = db.studentTaskStates.find(s => s.studentId === studentId && s.taskId === task.id);
    if (!state) {
        state = {
            id: uid('sts'),
            studentId,
            taskId: task.id,
            status: 'not_started',
            totalTaskPoints: 0,
            autoPoints: 0,
            mentorBonusPoints: 0,
            revisionCycles: 0,
            submittedAt: null,
            acceptedAt: null,
            lastStatusChangedAt: null,
            currentVersionId: null,
            createdAt: nowIso(),
            updatedAt: nowIso(),
        };
        db.studentTaskStates.push(state);

        const submission = {
            id: uid('sub'),
            studentId,
            taskId: task.id,
            currentVersionId: null,
            draftVersionId: null,
            createdAt: nowIso(),
            updatedAt: nowIso(),
        };
        db.submissions.push(submission);
    }

    return task;
}

export const studentApi = {
    getTrackerChecklist(studentId) {
        return { ...(db.studentTrackerChecks?.[studentId] || {}) };
    },
    saveTrackerChecklist(studentId, checkedMap = {}) {
        db.studentTrackerChecks[studentId] = { ...(checkedMap || {}) };
        persistTrackerProgressToDb(studentId);
        return db.studentTrackerChecks[studentId];
    },
    getStudentDashboard(studentId) {
        syncPublishedHomeworkTasksForStudent(studentId);
        const pts = calculatePointsSummary(studentId);
        const { user, profile } = getStudentSnapshot(studentId);
        const tasks = db.studentTaskStates.filter((s) => s.studentId === studentId);
        const widgets = computeStudentDashboardWidgets(studentId);
        return {
            studentProfile: {
                id: studentId,
                fullName: user?.fullName,
                cohortId: profile?.cohortId,
                currentWeek: profile?.currentWeek,
                currentModule: profile?.currentModule,
                coursePoints: pts.coursePointsTotal,
                szSelfAssessmentPoints: pts.szSelfAssessmentTotal,
                daysToSzDeadline: widgets.daysToSzSubmission,
            },
            compulsoryWidgets: widgets,
            activityFeed: buildStudentActivityFeed(studentId, 10),
            dashboardStats: {
                homeworkDone: tasks.filter((t) => t.status === TASK_STATUS.ACCEPTED).length,
                homeworkTotal: tasks.length,
                allHomeworkSubmitted: tasks.every((t) => [TASK_STATUS.SUBMITTED, TASK_STATUS.PENDING_REVIEW, TASK_STATUS.ACCEPTED].includes(t.status)),
                overdueCount: tasks.filter((t) => t.isOverdue).length,
                unreadCount: getUnreadThreadCount(db, studentId),
            },
            nextDeadline: getNextDeadline(db, studentId),
            nextControlPoint: getNextControlPoint(db, studentId),
            risks: buildStudentRisks(db, studentId),
            antiDebt: buildAntiDebtProtocol(db, studentId),
            progress: calculateCourseProgress(db, studentId),
            points: pts,
        };
    },
    getStudentMenu() {
        return ['О курсе', 'Глоссарий курса', 'Библиотека курса', 'Уроки', 'Календарь', 'Чек-лист', 'Результаты', 'Сертификация', 'Культурный код Лиги'];
    },
    getStudentResults(studentId, filters = {}) {
        syncPublishedHomeworkTasksForStudent(studentId);
        return db.studentTaskStates
            .filter((s) => s.studentId === studentId)
            .map((s) => {
                let task = db.homeworkTasks.find((t) => t.id === s.taskId);
                if (!task && String(s.taskId || '').startsWith('task-ci-')) {
                    const ciId = s.taskId.slice('task-ci-'.length);
                    const ci = (db.contentItems || []).find((c) => c.id === ciId);
                    if (ci) task = { id: s.taskId, title: ci.title || 'Домашнее задание', linkedContentItemId: ciId, weekId: ci.weekId || null, taskType: 'homework', isControlPoint: false, controlPointId: null, deadlineAt: ci.deadlineAt || null, scoreMax: 0 };
                }
                if (!task) return null;
                const weekRow = db.courseWeeks.find((w) => w.id === task.weekId);
                const typeLabel = task.isControlPoint || task.taskType === 'control_point'
                    ? 'контрольная точка'
                    : task.homeworkMeta?.assignmentType === 'checklist'
                      ? 'чек-лист'
                      : task.homeworkMeta?.assignmentType === 'questionnaire'
                        ? 'анкета'
                        : 'домашнее задание';
                return {
                    id: task.id,
                    title: task.title,
                    week: weekRow?.weekNumber,
                    moduleNumber: weekRow?.moduleNumber ?? 0,
                    type: task.taskType,
                    typeLabel,
                    status: mapTaskStatus(s.status),
                    displayStatus: mapStudentHomeworkDisplayStatus(s),
                    deadlineAt: task.deadlineAt,
                    submittedAt: s.submittedAt,
                    score: s.totalTaskPoints ?? 0,
                    maxScore: task.scoreMax ?? 0,
                    revisionCycles: s.revisionCycles ?? 0,
                    isControlPoint: !!task.isControlPoint,
                    controlPointId: task.controlPointId || null,
                    acceptedAt: s.acceptedAt || null,
                    mentorCommentPreview: db.threadMessages.find((m) => m.studentId === studentId && m.taskId === task.id && m.authorRole === ROLES.MENTOR)?.text || '',
                };
            })
            .filter(Boolean)
            .filter((x) => (filters.status ? x.status === filters.status : true));
    },
    getStudentPracticumEvents(studentId) {
        const profile = db.studentProfiles.find((p) => p.userId === studentId);
        const cohortId = profile?.cohortId || 'cohort-2026-1';
        const meetings = db.mentorMeetings
            .filter((m) => m.studentId === studentId)
            .map((m) => ({
                id: `mm-${m.id}`,
                kind: 'mentor_meeting',
                title: m.title,
                at: m.scheduledAt,
                status: m.status,
                weekNumber: m.weekNumber,
                focus: m.focus || '',
                eventType: 'Встреча с ментором',
            }));
        const weeks = db.courseWeeks.filter((w) => w.cohortId === cohortId);
        const rhythm = weeks.map((w) => ({
            id: `week-${w.id}`,
            kind: 'week_closure',
            title: `${w.title}`,
            at: `${w.endDate}T23:59:00`,
            status: 'deadline',
            weekNumber: w.weekNumber,
            focus: w.mentorMeetingFocus || '',
            eventType: 'Дедлайн модуля',
        }));
        return [...meetings, ...rhythm].sort((a, b) => String(a.at).localeCompare(String(b.at)));
    },
    getStudentTaskDetail(studentId, taskId) {
        // Гарантируем наличие task/state/submission до чтения деталей.
        // Без этого content-item задачи (task-ci-*) не создавались в db,
        // и submitStudentTask возвращал null молча.
        syncPublishedHomeworkTasksForStudent(studentId);
        return getTaskDetail(studentId, taskId);
    },
    ensureTaskForContentItem: (studentId, contentItem) => ensureTaskForContentItem(studentId, contentItem),
    saveStudentDraft(studentId, taskId, payload = {}) {
        const submission = db.submissions.find((s) => s.studentId === studentId && s.taskId === taskId);
        if (!submission) return null;
        const state = db.studentTaskStates.find((s) => s.studentId === studentId && s.taskId === taskId);
        const textContent = payload?.textContent ?? '';
        const answersJson =
            payload?.answersJson !== undefined ? normalizeAnswersJsonForStore(payload.answersJson) : undefined;

        const touchDraftVersion = (ver) => {
            ver.textContent = textContent;
            if (answersJson !== undefined) ver.answersJson = answersJson;
        };

        if (submission.draftVersionId) {
            const d = db.submissionVersions.find((v) => v.id === submission.draftVersionId && v.submissionId === submission.id);
            if (d && d.isDraft) {
                touchDraftVersion(d);
                if (state && (state.status === TASK_STATUS.NOT_STARTED || state.status === TASK_STATUS.IN_PROGRESS)) {
                    state.status = TASK_STATUS.DRAFT;
                    state.updatedAt = nowIso();
                }
                submission.updatedAt = nowIso();
                persistSubmissionToDb(studentId, taskId);
                return d;
            }
        }

        db.submissionVersions
            .filter((v) => v.submissionId === submission.id)
            .forEach((v) => {
                v.isDraft = false;
            });
        const versionNumber = db.submissionVersions.filter((v) => v.submissionId === submission.id).length + 1;
        const version = {
            id: uid('ver'),
            submissionId: submission.id,
            versionNumber,
            authorRole: ROLES.STUDENT,
            textContent,
            answersJson: answersJson !== undefined ? answersJson : null,
            attachments: payload?.attachments || [],
            links: payload?.links || [],
            isDraft: true,
            isCurrent: false,
            createdAt: nowIso(),
        };
        db.submissionVersions.push(version);
        submission.draftVersionId = version.id;
        submission.updatedAt = nowIso();
        if (state) {
            if (state.status === TASK_STATUS.NOT_STARTED || state.status === TASK_STATUS.IN_PROGRESS) {
                state.status = TASK_STATUS.DRAFT;
            }
            state.updatedAt = nowIso();
        }
        persistSubmissionToDb(studentId, taskId);
        return version;
    },
    submitStudentTask(studentId, taskId, payload = {}) {
        // Защитный синк: если открыли задание до того как syncPublishedHomeworkTasksForStudent
        // успел отработать, task/state/submission ещё нет в db — создаём их сейчас.
        syncPublishedHomeworkTasksForStudent(studentId);
        const submission = db.submissions.find((s) => s.studentId === studentId && s.taskId === taskId);
        const state = db.studentTaskStates.find((s) => s.studentId === studentId && s.taskId === taskId);
        const task = db.homeworkTasks.find((t) => t.id === taskId);
        if (!submission || !state) return { error: 'task_not_found', taskId };
        let textContent = payload?.textContent ?? '';
        let answersJson = payload?.answersJson !== undefined ? payload.answersJson : undefined;
        const draftV = submission.draftVersionId ? db.submissionVersions.find((v) => v.id === submission.draftVersionId && v.submissionId === submission.id) : null;
        if (draftV && draftV.isDraft) {
            if (isHomeworkAnswerEmpty(textContent) && draftV.textContent) textContent = draftV.textContent;
            if (answersJson === undefined && draftV.answersJson != null) answersJson = draftV.answersJson;
        }
        if (answersJson !== undefined && answersJson !== null) {
            answersJson = normalizeAnswersJsonForStore(answersJson);
        }
        const meta = task?.homeworkMeta;
        if (meta?.assignmentType === 'questionnaire') {
            const blocks = meta.questionnaireBlocks || [];
            if (!isQuestionnaireAnswersComplete(blocks, answersJson)) {
                return { error: 'incomplete_answers', message: 'Заполни все поля анкеты перед отправкой' };
            }
            textContent = textContent || 'Анкета (ответы по полям)';
        } else if (meta?.assignmentType === 'checklist') {
            if (!isChecklistAnswersComplete(meta.checklistSections, answersJson)) {
                return { error: 'incomplete_answers', message: 'Заполни все пункты чек-листа перед отправкой' };
            }
            textContent = textContent || 'Чек-лист (см. ответы по пунктам)';
        } else if (isHomeworkAnswerEmpty(textContent)) {
            return { error: 'empty_answer', message: 'Напиши ответ перед отправкой' };
        }

        db.submissionVersions
            .filter((v) => v.submissionId === submission.id)
            .forEach((v) => {
                v.isCurrent = false;
                v.isDraft = false;
            });
        const versionNumber = db.submissionVersions.filter((v) => v.submissionId === submission.id).length + 1;
        const version = {
            id: uid('ver'),
            submissionId: submission.id,
            versionNumber,
            authorRole: ROLES.STUDENT,
            textContent,
            answersJson: answersJson !== undefined ? answersJson : null,
            attachments: payload?.attachments || [],
            links: payload?.links || [],
            isDraft: false,
            isCurrent: true,
            createdAt: nowIso(),
        };
        db.submissionVersions.push(version);
        submission.currentVersionId = version.id;
        submission.draftVersionId = null;
        state.currentVersionId = version.id;
        const fromStatus = state.status;
        state.status = TASK_STATUS.SUBMITTED;
        state.submittedAt = nowIso().slice(0, 10);
        state.lastStatusChangedAt = nowIso().slice(0, 10);
        const history = { id: uid('sh'), studentId, taskId, fromStatus, toStatus: TASK_STATUS.SUBMITTED, changedByUserId: studentId, comment: 'Отправлено на проверку', createdAt: nowIso() };
        db.statusHistory.push(history);
        db.threadMessages.push({ id: uid('tm'), studentId, taskId, authorUserId: studentId, authorRole: ROLES.STUDENT, messageType: 'version_submitted', text: 'Отправлена работа', attachments: payload?.attachments || [], linkedVersionId: version.id, linkedStatusHistoryId: history.id, isSystem: false, createdAt: nowIso(), readBy: [studentId] });
        db.threadMessages.push({ id: uid('tm'), studentId, taskId, authorUserId: 'system', authorRole: 'system', messageType: 'status', text: 'Статус: отправлено', attachments: [], linkedVersionId: version.id, linkedStatusHistoryId: history.id, isSystem: true, createdAt: nowIso(), readBy: [] });
        pushEvent('new_submission_version', { studentId, taskId, versionId: version.id });
        pushEvent('task_status_changed', { studentId, taskId, toStatus: TASK_STATUS.SUBMITTED });
        addAuditEvent(studentId, ROLES.STUDENT, 'submit_task', 'task', taskId, 'Student submitted task for review', { versionId: version.id });
        const mentorId = db.studentProfiles.find((p) => p.userId === studentId)?.mentorId;
        if (mentorId) addNotification(mentorId, ROLES.MENTOR, 'new_submission_version', 'Появилась новая работа по заданию', { studentId, taskId });
        persistSubmissionToDb(studentId, taskId);
        return version;
    },
    addStudentThreadReply(studentId, taskId, payload) {
        const isDispute = !!payload?.disputeOnly;
        if (!canPostTaskThread(studentId, taskId, { disputeOnly: isDispute })) return null;
        const msg = {
            id: uid('tm'),
            studentId,
            taskId,
            authorUserId: studentId,
            authorRole: ROLES.STUDENT,
            messageType: isDispute ? 'dispute_comment' : 'comment',
            text: payload?.text || '',
            attachments: payload?.attachments || [],
            linkedVersionId: payload?.linkedVersionId || null,
            linkedStatusHistoryId: null,
            isSystem: false,
            createdAt: nowIso(),
            readBy: [studentId],
        };
        db.threadMessages.push(msg);
        pushEvent('student_replied', { studentId, taskId, messageId: msg.id });
        addAuditEvent(studentId, ROLES.STUDENT, 'student_reply', 'thread_message', msg.id, 'Student replied in thread', { taskId });
        persistSubmissionToDb(studentId, taskId);
        return msg;
    },
    openStudentTaskDispute(studentId, taskId) {
        return openTaskDisputeCore(studentId, studentId, taskId, 'student');
    },
    getStudentCertification(studentId) {
        const pts = calculatePointsSummary(studentId);
        const c = db.certificationProgress.find((x) => x.studentId === studentId);
        const sz = db.szAssessmentState.find((x) => x.studentId === studentId);
        const redFlags = getCertificationRedFlags(db, studentId);
        const criticalFromSelf = Number(sz?.selfAssessmentCriticalCount) || 0;
        return {
            ...c,
            readiness: getCertificationReadiness(db, studentId),
            redFlags,
            timeline: getCertificationTimeline(db, studentId),
            points: pts,
            methodQuestion: SCORING_METHOD_QUESTION,
            szScores: {
                self_score_total: capSzSelf(sz?.selfAssessmentPoints || 0),
                mentor_score_total: capSzMentor(sz?.mentorAssessmentPoints || 0),
                critical_flags_count: criticalFromSelf,
                certification_status: sz?.finalStatus || 'not_started',
                package_red_flags_count: redFlags.length,
            },
        };
    },
    /**
     * Фиксирует заполненный бланк самооценки в слое данных (баллы СЗ, критические отметки, статусы сертификации).
     */
    commitSzSelfAssessment(studentId, payload) {
        const selfTotal = capSzSelf(Number(payload?.selfScoreTotal) || 0);
        const criticalCount = Math.max(0, Math.min(10, Number(payload?.criticalFlagsCount) || 0));
        const mentorScores = Array.isArray(payload?.mentorScores) ? payload.mentorScores : [];
        const mentorFilled = mentorScores.length === 18 && mentorScores.every((v) => v === 1 || v === 2 || v === 3);
        const mentorTotal = mentorFilled
            ? capSzMentor(mentorScores.reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0))
            : null;

        let sz = db.szAssessmentState.find((x) => x.studentId === studentId);
        if (!sz) {
            sz = { id: uid('sz'), studentId, selfAssessmentPoints: 0, mentorAssessmentPoints: 0, selfAssessmentCriticalCount: 0, redFlags: [], comparedAt: null, finalStatus: 'not_started', selfAssessmentSubmittedAt: null };
            db.szAssessmentState.push(sz);
        }
        sz.selfAssessmentPoints = selfTotal;
        sz.selfAssessmentCriticalCount = criticalCount;
        sz.selfAssessmentSubmittedAt = nowIso();
        if (mentorTotal != null) {
            sz.mentorAssessmentPoints = mentorTotal;
            sz.comparedAt = nowIso().slice(0, 10);
        }
        if (criticalCount > 0) {
            sz.finalStatus = 'red_flag';
        } else if (mentorFilled) {
            sz.finalStatus = 'ready_for_review';
        } else {
            sz.finalStatus = 'in_progress';
        }

        const cert = db.certificationProgress.find((x) => x.studentId === studentId);
        if (cert) {
            cert.szSelfAssessmentStatus = 'done';
            cert.updatedAt = nowIso();
            if (criticalCount > 0) {
                cert.admissionStatus = CERTIFICATION_STATUS.RED_FLAG;
            } else if (cert.admissionStatus === CERTIFICATION_STATUS.NOT_STARTED || cert.admissionStatus === CERTIFICATION_STATUS.IN_PROGRESS) {
                cert.admissionStatus = CERTIFICATION_STATUS.READY_FOR_REVIEW;
            }
            if (mentorFilled) {
                cert.szMentorAssessmentStatus = 'done';
            } else if (cert.szMentorAssessmentStatus === 'not_started') {
                cert.szMentorAssessmentStatus = 'pending';
            }
        }

        calculatePointsSummary(studentId);
        addAuditEvent(studentId, ROLES.STUDENT, 'sz_self_assessment_commit', 'certification', studentId, 'Self-assessment committed to data layer', {
            selfTotal,
            criticalCount,
            mentorFilled,
        });
        return this.getStudentCertification(studentId);
    },
    getStudentChecklist(studentId) {
        return db.courseWeeks.map((w) => ({ weekNumber: w.weekNumber, progress: 0, studentId }));
    },
    /** Материал из опубликованной библиотеки потока (список библиотеки / deep link в разделе библиотеки). */
    getPublishedLibraryItemById(studentId, contentId) {
        if (!contentId) return null;
        const want = normalizePvlEntityId(contentId);
        const items = getPublishedLibraryContentForStudent(studentId);
        return items.find((i) => normalizePvlEntityId(i.id) === want) || null;
    },
    /** Опубликованный материал по id: уроки (lessons) и при необходимости library/glossary, без обязательной library-выдачи. */
    getPublishedContentItemForStudent,
    getStudentLibrary(studentId, filters = {}) {
        let items = getLibraryUiItemsForStudent(studentId);
        if (filters.categoryId) items = items.filter((i) => i.categoryId === filters.categoryId || i.categoryTitle === filters.categoryId);
        if (filters.contentType) items = items.filter((i) => i.contentType === filters.contentType);
        if (filters.completed === true) items = items.filter((i) => i.completed);
        if (filters.completed === false) items = items.filter((i) => !i.completed);
        if (filters.isNew) items = items.filter((i) => i.isNew);
        if (filters.isRecommended) items = items.filter((i) => i.isRecommended);
        if (filters.query) {
            const q = String(filters.query).toLowerCase().trim();
            items = items.filter((i) =>
                String(i.title || '').toLowerCase().includes(q)
                || String(i.shortDescription || '').toLowerCase().includes(q)
                || (i.tags || []).some((t) => String(t).toLowerCase().includes(q)));
        }
        return items.sort((a, b) => (a.orderIndex || 999) - (b.orderIndex || 999));
    },
    getStudentLibraryProgress(studentId) {
        const items = getLibraryUiItemsForStudent(studentId);
        const total = items.length;
        const completed = items.filter((i) => i.completed).length;
        const sumProgress = items.reduce((s, i) => {
            const p = Math.min(100, Math.max(0, Number(i.progressPercent) || 0));
            return s + p;
        }, 0);
        /** Общий % по библиотеке: среднее по материалам (открытие и частичное изучение тоже двигают шкалу). */
        const progressPercent = total ? Math.round(sumProgress / total) : 0;
        const recommendedNextMaterial = items.find((i) => !i.completed && i.isRecommended)
            || items.find((i) => !i.completed)
            || null;
        return {
            completed,
            total,
            progressPercent,
            lastOpenedMaterial: [...items].sort((a, b) => String(b.lastOpenedAt || '').localeCompare(String(a.lastOpenedAt || '')))[0] || null,
            recommendedNextMaterial,
            /** Когда опубликованных материалов нет — показываем заглушку «непрочитанный материал». */
            recommendedNextTitle: recommendedNextMaterial?.title
                || (total === 0 ? 'Непрочитанный материал' : null),
        };
    },
    markLibraryItemCompleted(studentId, itemId) {
        let pr = db.studentLibraryProgress.find((x) => x.studentId === studentId && x.libraryItemId === itemId);
        if (!pr) {
            pr = { id: uid('slp'), studentId, libraryItemId: itemId, progressPercent: 100, completed: true, lastOpenedAt: nowIso(), completedAt: nowIso() };
            db.studentLibraryProgress.push(pr);
        } else {
            pr.progressPercent = 100;
            pr.completed = true;
            pr.lastOpenedAt = nowIso();
            pr.completedAt = nowIso();
        }
        addAuditEvent(studentId, ROLES.STUDENT, 'library_complete', 'library_item', itemId, 'Library item marked completed', {});
        persistContentProgressToDb(studentId, itemId);
        return pr;
    },
    updateLibraryProgress(studentId, itemId, progress) {
        let pr = db.studentLibraryProgress.find((x) => x.studentId === studentId && x.libraryItemId === itemId);
        if (!pr) {
            pr = { id: uid('slp'), studentId, libraryItemId: itemId, progressPercent: 0, completed: false, lastOpenedAt: nowIso(), completedAt: null };
            db.studentLibraryProgress.push(pr);
        }
        pr.progressPercent = Math.max(0, Math.min(100, progress));
        pr.completed = pr.progressPercent >= 100;
        pr.lastOpenedAt = nowIso();
        if (pr.completed) pr.completedAt = nowIso();
        persistContentProgressToDb(studentId, itemId);
        return pr;
    },
    acknowledgeStudentTaskReview(studentId, taskId) {
        const state = db.studentTaskStates.find((s) => s.studentId === studentId && s.taskId === taskId);
        if (!state || state.status !== TASK_STATUS.ACCEPTED) return null;
        state.reviewSeenByStudentAt = nowIso();
        state.updatedAt = nowIso();
        return state;
    },
    getStudentControlPointsProgress(studentId) {
        syncDerivedStatesForStudent(studentId);
        const profile = db.studentProfiles.find((p) => p.userId === studentId);
        return db.controlPoints
            .filter((cp) => cp.cohortId === profile?.cohortId)
            .map((cp) => {
                const st = db.controlPointState.find((x) => x.studentId === studentId && x.controlPointId === cp.id);
                return {
                    id: cp.code,
                    title: cp.title,
                    weekNumber: cp.weekNumber,
                    deadlineAt: cp.deadlineAt,
                    statusRaw: st?.status || 'not_started',
                    statusLabel: mapStudentControlPointDisplayStatus(st, cp.deadlineAt),
                    affectsAdmission: !!cp.affectsAdmission,
                };
            })
            .sort((a, b) => (a.weekNumber ?? 0) - (b.weekNumber ?? 0));
    },
    getPublishedLibraryContentForStudent,
    getLibraryCategoriesWithCounts,
    getLibraryItemsByCategory,
};

export const mentorApi = {
    getMentorDashboard(mentorId) {
        syncPublishedHomeworkTasksForMentorMentees(mentorId);
        const menteeIds = getMentorMenteeIds(mentorId);
        return {
            totalMentees: menteeIds.length,
            reviewQueue: getPendingReviewTasks(db, mentorId),
            risks: buildMentorRisks(db, mentorId),
        };
    },
    /** Абитуриенты потока (все участницы курса из профилей Сада с ролью applicant), видимые ментору */
    getMentorCohortApplicants(mentorId) {
        return buildMentorCohortApplicantRows(mentorId);
    },
    getMentorMentees(mentorId) {
        const menteeIds = new Set(getMentorMenteeIds(mentorId));
        let rows = db.studentProfiles.filter((p) => menteeIds.has(p.userId));
        if (db._pvlGardenApplicantsSynced) {
            rows = rows.filter((p) => !isSeedPvlDemoStudentId(p.userId));
        }
        return rows.map((p) => ({ ...p, user: db.users.find((u) => u.id === p.userId) }));
    },
    getMentorMenteeCard(mentorId, studentId) {
        const pts = calculatePointsSummary(studentId);
        return {
            student: getStudentSnapshot(studentId),
            tasks: studentApi.getStudentResults(studentId),
            risks: buildStudentRisks(db, studentId),
            meetings: db.mentorMeetings.filter((m) => m.mentorId === mentorId && m.studentId === studentId),
            points: {
                ...pts,
                controlPointsAccepted: db.controlPointState.filter((c) => c.studentId === studentId && c.status === 'accepted').length,
                mentorBonusRemaining: Math.max(0, SCORING_RULES.MENTOR_BONUS_POOL_MAX - pts.mentorBonusTotal),
            },
        };
    },
    getMentorMenteeThreadPreview(mentorId, studentId, limit = 30) {
        return db.threadMessages
            .filter((m) => m.studentId === studentId)
            .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
            .slice(0, limit)
            .map((m) => {
                const u = db.users.find((x) => x.id === m.authorUserId);
                const authorName = m.authorRole === ROLES.MENTOR ? 'Ментор' : m.isSystem || m.authorRole === 'system' ? 'Система' : (u?.fullName || 'Участница');
                return {
                    id: m.id,
                    relatedTaskId: m.taskId,
                    type: m.isSystem ? 'status' : 'message',
                    authorRole: m.authorRole,
                    authorName,
                    createdAt: m.createdAt,
                    text: m.text,
                    isUnread: !(m.readBy || []).includes(mentorId),
                };
            });
    },
    getMentorMenteeControlPointsForCard(studentId) {
        syncDerivedStatesForStudent(studentId);
        const mapCp = (raw) => {
            if (raw === 'accepted') return 'принято';
            if (!raw || raw === 'not_started') return 'не начато';
            return mapTaskStatus(raw) || String(raw);
        };
        return db.controlPoints.map((cp) => {
            const st = db.controlPointState.find((x) => x.studentId === studentId && x.controlPointId === cp.id);
            return {
                id: cp.code,
                title: cp.title,
                weekNumber: cp.weekNumber,
                deadlineAt: cp.deadlineAt,
                submittedAt: null,
                status: mapCp(st?.status),
                affectsPoints: true,
                affectsAdmission: !!cp.affectsAdmission,
                specialNote: cp.specialNote || '',
            };
        });
    },
    getMentorReviewQueue(mentorId) {
        syncPublishedHomeworkTasksForMentorMentees(mentorId);
        return getPendingReviewTasks(db, mentorId);
    },
    /** Доска проверок: не проверено / на доработке / проверено (все задания менти ментора) */
    getMentorReviewBoard(mentorId) {
        syncPublishedHomeworkTasksForMentorMentees(mentorId);
        const menteeIds = getMentorMenteeIds(mentorId);
        const nowMs = Date.now();
        const DAY_MS = 24 * 60 * 60 * 1000;
        const enrich = (s) => {
            let task = db.homeworkTasks.find((t) => t.id === s.taskId);
            if (!task && String(s.taskId || '').startsWith('task-ci-')) {
                const ciId = s.taskId.slice('task-ci-'.length);
                const ci = (db.contentItems || []).find((c) => c.id === ciId);
                if (ci) task = { id: s.taskId, title: ci.title || 'Домашнее задание', linkedContentItemId: ciId, weekId: ci.weekId || null, scoreMax: 0, deadlineAt: ci.deadlineAt || null };
            }
            const user = db.users.find((u) => u.id === s.studentId);
            const weekRow = task?.weekId ? db.courseWeeks.find((w) => w.id === task.weekId) : null;
            const lessonHint = (task?.linkedLessonIds || []).length
                ? `Урок: ${(task.linkedLessonIds || []).join(', ')}`
                : weekRow
                  ? `Модуль ${weekRow.moduleNumber ?? weekRow.weekNumber}`
                  : '—';
            const maxScore = task?.scoreMax ?? 0;
            const acceptedAt = s.acceptedAt || s.lastStatusChangedAt || null;
            const acceptedAgeMs = acceptedAt ? Math.max(0, nowMs - new Date(`${String(acceptedAt).slice(0, 10)}T00:00:00`).getTime()) : 0;
            const isArchived = s.status === TASK_STATUS.ACCEPTED && acceptedAgeMs >= DAY_MS;
            return {
                studentId: s.studentId,
                taskId: s.taskId,
                status: mapTaskStatus(s.status),
                rawStatus: s.status,
                studentName: user?.fullName || s.studentId,
                taskTitle: task?.title || s.taskId,
                weekNumber: weekRow?.weekNumber,
                moduleNumber: weekRow?.moduleNumber,
                lessonHint,
                submittedAt: s.submittedAt,
                deadlineAt: task?.deadlineAt,
                revisionCycles: s.revisionCycles ?? 0,
                scoreAwarded: s.totalTaskPoints ?? 0,
                maxScore,
                acceptedAt,
                isArchived,
            };
        };
        const all = db.studentTaskStates.filter((st) => menteeIds.includes(st.studentId));
        const unchecked = all.filter((st) => [TASK_STATUS.PENDING_REVIEW, TASK_STATUS.SUBMITTED].includes(st.status)).map(enrich);
        const revision = all.filter((st) => st.status === TASK_STATUS.REVISION_REQUESTED).map(enrich);
        const doneRaw = all.filter((st) => st.status === TASK_STATUS.ACCEPTED).map(enrich);
        const done = doneRaw.filter((x) => !x.isArchived);
        const archive = doneRaw.filter((x) => x.isArchived);
        return { unchecked, revision, done, archive };
    },
    openTaskDispute(actorUserId, studentId, taskId, openedByRole = 'mentor') {
        return openTaskDisputeCore(actorUserId, studentId, taskId, openedByRole);
    },
    canPostTaskThread,
    getMentorTaskDetail(_, studentId, taskId) {
        // Как у ученицы: подтянуть homeworkMeta из CMS (task-ci-*), иначе у ментора «standard» и пустые блоки.
        syncPublishedHomeworkTasksForStudent(studentId);
        return getTaskDetail(studentId, taskId);
    },
    submitMentorReview(mentorId, studentId, taskId, payload) {
        const state = db.studentTaskStates.find((s) => s.studentId === studentId && s.taskId === taskId);
        if (!state) return null;
        const tooMany = detectTooManyRevisions(payload);
        const fromStatus = state.status;
        state.status = mapRuDecisionToTaskStatus(payload?.statusDecision) || TASK_STATUS.REVISION_REQUESTED;
        state.lastStatusChangedAt = nowIso().slice(0, 10);
        if (state.status === TASK_STATUS.ACCEPTED) {
            state.acceptedAt = nowIso().slice(0, 10);
            state.reviewSeenByStudentAt = null;
        }
        state.revisionCycles = (state.revisionCycles || 0) + (state.status === TASK_STATUS.REVISION_REQUESTED ? 1 : 0);
        if (state.status === TASK_STATUS.ACCEPTED) {
            const taskDef = db.homeworkTasks.find((t) => t.id === taskId);
            const maxScore = taskDef?.scoreMax ?? 20;
            const sc = Number(payload?.scoreAwarded);
            if (Number.isFinite(sc)) {
                state.autoPoints = Math.max(0, Math.min(maxScore, Math.round(sc)));
                state.totalTaskPoints = (state.autoPoints || 0) + (state.mentorBonusPoints || 0);
            }
        }
        const history = { id: uid('sh'), studentId, taskId, fromStatus, toStatus: state.status, changedByUserId: mentorId, comment: payload?.generalComment || '', createdAt: nowIso() };
        db.statusHistory.push(history);
        db.threadMessages.push({ id: uid('tm'), studentId, taskId, authorUserId: mentorId, authorRole: ROLES.MENTOR, messageType: 'mentor_review', text: payload?.generalComment || '', attachments: [], linkedVersionId: state.currentVersionId, linkedStatusHistoryId: history.id, isSystem: false, createdAt: nowIso(), readBy: [mentorId] });
        if (state.status !== TASK_STATUS.ACCEPTED) {
            db.threadMessages.push({ id: uid('tm'), studentId, taskId, authorUserId: 'system', authorRole: 'system', messageType: 'status', text: `Статус изменен на ${mapTaskStatus(state.status)}`, attachments: [], linkedVersionId: null, linkedStatusHistoryId: history.id, isSystem: true, createdAt: nowIso(), readBy: [] });
        }
        pushEvent('mentor_commented', { mentorId, studentId, taskId });
        pushEvent('task_status_changed', { studentId, taskId, toStatus: state.status });
        addAuditEvent(mentorId, ROLES.MENTOR, 'mentor_review', 'task', taskId, 'Mentor reviewed task', { status: state.status });
        addNotification(studentId, ROLES.STUDENT, 'mentor_commented', 'Ментор оставил комментарий по заданию', { taskId });
        addNotification(studentId, ROLES.STUDENT, 'task_status_changed', 'Статус задания изменен ментором', { taskId, status: state.status });
        persistSubmissionToDb(studentId, taskId);
        return { history, warningTooManyRevisions: tooMany };
    },
    changeMentorTaskStatus(mentorId, studentId, taskId, status, comment) {
        return this.submitMentorReview(mentorId, studentId, taskId, { statusDecision: status, generalComment: comment, nextActions: [] });
    },
    addMentorThreadReply(mentorId, studentId, taskId, payload) {
        const isDispute = !!payload?.disputeOnly;
        if (!canPostTaskThread(studentId, taskId, { disputeOnly: isDispute })) return null;
        const msg = {
            id: uid('tm'),
            studentId,
            taskId,
            authorUserId: mentorId,
            authorRole: ROLES.MENTOR,
            messageType: isDispute ? 'dispute_comment' : 'comment',
            text: payload?.text || '',
            attachments: payload?.attachments || [],
            linkedVersionId: payload?.linkedVersionId || null,
            linkedStatusHistoryId: null,
            isSystem: false,
            createdAt: nowIso(),
            readBy: [mentorId],
        };
        db.threadMessages.push(msg);
        pushEvent('mentor_commented', { mentorId, studentId, taskId, messageId: msg.id });
        addAuditEvent(mentorId, ROLES.MENTOR, 'mentor_comment', 'thread_message', msg.id, 'Mentor commented in thread', { taskId });
        addNotification(studentId, ROLES.STUDENT, 'mentor_commented', 'Новый комментарий ментора', { taskId });
        persistSubmissionToDb(studentId, taskId);
        return msg;
    },
    assignMentorBonus(mentorId, studentId, taskId, points, reason = '') {
        const state = db.studentTaskStates.find((s) => s.studentId === studentId && s.taskId === taskId);
        if (!state) return null;
        const used = db.mentorBonusEvents.filter((e) => e.studentId === studentId).reduce((acc, e) => acc + (e.points || 0), 0);
        const remaining = Math.max(0, SCORING_RULES.MENTOR_BONUS_POOL_MAX - used);
        const awarded = Math.max(0, Math.min(points, remaining));
        const event = { id: uid('mb'), studentId, relatedTaskId: taskId || null, mentorId, points: awarded, reason, createdAt: nowIso() };
        db.mentorBonusEvents.push(event);
        state.mentorBonusPoints = Math.max(0, (state.mentorBonusPoints || 0) + awarded);
        state.totalTaskPoints = (state.autoPoints || 0) + state.mentorBonusPoints;
        state.updatedAt = nowIso();
        db.threadMessages.push({ id: uid('tm'), studentId, taskId, authorUserId: mentorId, authorRole: 'system', messageType: 'bonus', text: `Назначен бонус +${awarded}`, attachments: [], linkedVersionId: null, linkedStatusHistoryId: null, isSystem: true, createdAt: nowIso(), readBy: [] });
        addAuditEvent(mentorId, ROLES.MENTOR, 'mentor_bonus', 'task', taskId, `Mentor assigned bonus ${awarded}`, { requested: points, awarded, remainingAfter: Math.max(0, remaining - awarded), reason });
        const pts = calculatePointsSummary(studentId);
        persistSubmissionToDb(studentId, taskId);
        return { state, awarded, remaining: Math.max(0, SCORING_RULES.MENTOR_BONUS_POOL_MAX - pts.mentorBonusTotal) };
    },
    getRemainingMentorBonusPool(studentId) {
        const pts = calculatePointsSummary(studentId);
        return Math.max(0, SCORING_RULES.MENTOR_BONUS_POOL_MAX - pts.mentorBonusTotal);
    },
    getMentorBonusHistory(studentId) {
        return db.mentorBonusEvents.filter((e) => e.studentId === studentId).slice().reverse();
    },
};

function calendarVisibleToViewer(event, viewerRole) {
    const v = event.visibilityRole || 'all';
    if (v === 'all') return true;
    if (viewerRole === 'admin') return true;
    return v === viewerRole;
}

function normalizeCalendarTitleForDedupe(title) {
    return String(title || '')
        .toLowerCase()
        .replace(/[«»""„"]/g, '')
        .replace(/[—–-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function calendarEventDayKeyForDedupe(ev) {
    const raw = ev.date != null && ev.date !== '' ? String(ev.date).trim() : '';
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(0, 10);
    const dmY = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (dmY) return `${dmY[3]}-${dmY[2]}-${dmY[1]}`;
    return String(ev.startAt || '').slice(0, 10);
}

/** Один логический слот: legacy_key или день+тип+нормализованный заголовок+время старта. */
function calendarEventDedupeKey(ev) {
    const lk = ev.legacyKey || ev.legacy_key;
    if (lk) return `lk:${String(lk)}`;
    const day = calendarEventDayKeyForDedupe(ev);
    const type = String(ev.eventType || '').toLowerCase();
    const st = String(ev.startAt || '');
    const hm = st.match(/T(\d{2}):(\d{2})/);
    const timeKey = hm ? `${hm[1]}:${hm[2]}` : '';
    const title = normalizeCalendarTitleForDedupe(ev.title);
    return `fp:${day}|${type}|${title}|${timeKey}`;
}

function calendarEventDedupeRank(ev) {
    let r = 0;
    if (ev.legacyKey || ev.legacy_key) r += 32;
    const id = String(ev.id || '');
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) r += 16;
    if (id.startsWith('pvl-cal-flow1-') || id.startsWith('pvl-cal-bf-')) r += 8;
    if (/^pvl-cal-\d{10,}-\d+/i.test(id)) r += 0;
    else if (id.startsWith('pvl-cal-')) r += 2;
    return r;
}

function dedupeCalendarEvents(list) {
    const m = new Map();
    for (const ev of list) {
        const k = calendarEventDedupeKey(ev);
        const prev = m.get(k);
        if (!prev || calendarEventDedupeRank(ev) > calendarEventDedupeRank(prev)) m.set(k, ev);
    }
    return Array.from(m.values());
}

export const calendarApi = {
    listForViewer(viewerRole, cohortId) {
        const raw = (db.calendarEvents || [])
            .filter((e) => !cohortId || pvlPlacementVisibleForCohort(e.cohortId, cohortId))
            .filter((e) => calendarVisibleToViewer(e, viewerRole));
        const deduped = dedupeCalendarEvents(raw);
        return deduped.slice().sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
    },
    getById(id) {
        return (db.calendarEvents || []).find((e) => e.id === id) || null;
    },
};

export const adminApi = {
    getAdminOverview() {
        const allPoints = db.studentProfiles.map((s) => calculatePointsSummary(s.userId));
        return {
            cohorts: db.cohorts.length,
            activeStudents: db.studentProfiles.length,
            activeMentors: db.mentorProfiles.length,
            reviewQueue: db.studentTaskStates.filter((s) => s.status === TASK_STATUS.PENDING_REVIEW).length,
            risks: buildAdminRisks(db).length,
            certificationInProgress: db.certificationProgress.length,
            publishedContent: db.contentItems.filter((c) => c.status === CONTENT_STATUS.PUBLISHED).length,
            avgCoursePoints: allPoints.length ? Math.round(allPoints.reduce((acc, x) => acc + x.coursePointsTotal, 0) / allPoints.length) : 0,
        };
    },
    getAdminContent(filters = {}) {
        return db.contentItems.filter((c) => (filters.status ? c.status === filters.status : true));
    },
    async createContentItem(payload) {
        const item = {
            id: newPvlPersistedEntityId(),
            status: CONTENT_STATUS.DRAFT,
            visibility: 'all',
            attachments: [],
            externalLinks: [],
            coverImage: '',
            estimatedDuration: '',
            createdBy: 'u-adm-1',
            createdAt: nowIso(),
            updatedAt: nowIso(),
            ...payload,
        };
        if (item.libraryLessonGroupTitle !== undefined) {
            item.libraryPayload = buildLibraryPayloadColumn(item);
        }
        if (!pvlPostgrestApi.isEnabled()) {
            db.contentItems.unshift(item);
            addAuditEvent('u-adm-1', ROLES.ADMIN, 'create_content', 'content_item', item.id, 'Created content item', item);
            return item;
        }
        try {
            const row = await pvlPostgrestApi.upsertContentItem({
                id: item.id,
                ...contentItemToDbPayload(item),
                created_by: uuidOrNull(item.createdBy),
                created_at: item.createdAt,
                updated_at: item.updatedAt,
            });
            if (!row) throw new Error('PostgREST: пустой ответ при сохранении материала');
            const merged = mapDbContentItemToRuntime(row);
            db.contentItems.unshift(merged);
            addAuditEvent('u-adm-1', ROLES.ADMIN, 'create_content', 'content_item', merged.id, 'Created content item', merged);
            return merged;
        } catch (error) {
            try {
                // eslint-disable-next-line no-console
                console.warn('[PVL] createContentItem DB:', error?.message || error);
            } catch { /* noop */ }
            logDbFallback({
                endpoint: '/public.pvl_content_items',
                status: 'error',
                table: 'pvl_content_items',
                id: item.id,
                error: String(error?.message || error || 'create failed'),
            });
            throw error;
        }
    },
    getContentItemById(contentId) {
        return db.contentItems.find((x) => x.id === contentId) || null;
    },
    async updateContentItem(contentId, payload) {
        const item = db.contentItems.find((c) => c.id === contentId);
        if (!item) return null;
        const snapshot = { ...item };
        Object.assign(item, payload, { updatedAt: nowIso() });
        if (payload && (payload.libraryLessonGroupTitle !== undefined || payload.libraryPayload !== undefined)) {
            item.libraryPayload = buildLibraryPayloadColumn(item);
        }
        addAuditEvent('u-adm-1', ROLES.ADMIN, 'update_content', 'content_item', contentId, 'Updated content item', payload);
        if (!pvlPostgrestApi.isEnabled()) return item;
        try {
            const row = await pvlPostgrestApi.updateContentItem(contentId, {
                ...contentItemToDbPayload(item),
                updated_by: uuidOrNull(item.updatedBy) || uuidOrNull(item.createdBy),
                updated_at: item.updatedAt,
            });
            if (row) {
                const mapped = mapDbContentItemToRuntime(row);
                Object.assign(item, mapped);
            }
            return item;
        } catch (error) {
            Object.assign(item, snapshot);
            try {
                // eslint-disable-next-line no-console
                console.warn('[PVL] updateContentItem DB:', error?.message || error);
            } catch { /* noop */ }
            logDbFallback({
                endpoint: '/public.pvl_content_items',
                status: 'error',
                table: 'pvl_content_items',
                id: contentId,
                error: String(error?.message || error || 'update failed'),
            });
            throw error;
        }
    },
    async duplicateContentItem(contentId) {
        const src = this.getContentItemById(contentId);
        if (!src) return null;
        const copy = {
            ...src,
            id: newPvlPersistedEntityId(),
            title: `${src.title} (copy)`,
            status: CONTENT_STATUS.DRAFT,
            createdAt: nowIso(),
            updatedAt: nowIso(),
        };
        if (!pvlPostgrestApi.isEnabled()) {
            db.contentItems.unshift(copy);
            addAuditEvent('u-adm-1', ROLES.ADMIN, 'duplicate_content', 'content_item', copy.id, 'Duplicated content item', { sourceId: contentId });
            return copy;
        }
        try {
            const row = await pvlPostgrestApi.upsertContentItem({
                id: copy.id,
                ...contentItemToDbPayload(copy),
                created_by: uuidOrNull(copy.createdBy),
                created_at: copy.createdAt,
                updated_at: copy.updatedAt,
            });
            if (!row) throw new Error('PostgREST: пустой ответ при дублировании материала');
            const merged = mapDbContentItemToRuntime(row);
            db.contentItems.unshift(merged);
            addAuditEvent('u-adm-1', ROLES.ADMIN, 'duplicate_content', 'content_item', merged.id, 'Duplicated content item', { sourceId: contentId });
            return merged;
        } catch (error) {
            try {
                // eslint-disable-next-line no-console
                console.warn('[PVL] duplicateContentItem DB:', error?.message || error);
            } catch { /* noop */ }
            logDbFallback({
                endpoint: '/public.pvl_content_items',
                status: 'error',
                table: 'pvl_content_items',
                id: copy.id,
                error: String(error?.message || error || 'duplicate failed'),
            });
            throw error;
        }
    },
    /** Как в Саду: сначала await сохранения строки в PostgREST, затем размещение — иначе после F5 материала нет. */
    async publishContentItem(contentId) {
        const item = await this.updateContentItem(contentId, { status: CONTENT_STATUS.PUBLISHED });
        if (!item) return null;
        const relatedPlacements = db.contentPlacements.filter((p) => (p.contentItemId || p.contentId) === contentId);
        if (relatedPlacements.length === 0) {
            await this.createPlacement({
                contentItemId: contentId,
                targetSection: item.targetSection || 'library',
                targetRole: item.targetRole || 'both',
                cohortId: item.targetCohort || 'cohort-2026-1',
                targetCohort: item.targetCohort || 'cohort-2026-1',
                weekNumber: Number(item.weekNumber) || 0,
                moduleNumber: Number(item.moduleNumber) || 0,
                orderIndex: Number(item.orderIndex) || 999,
                isPublished: true,
            });
        } else {
            for (const p of relatedPlacements) {
                await this.updatePlacement(p.id, { isPublished: true });
            }
        }
        addAuditEvent('u-adm-1', ROLES.ADMIN, 'publish_content', 'content_item', contentId, 'Published content item', {});
        addNotification('u-adm-1', ROLES.ADMIN, 'content_published', 'Материал опубликован', { contentId });
        return item;
    },
    async archiveContentItem(contentId) {
        const item = await this.updateContentItem(contentId, { status: CONTENT_STATUS.ARCHIVED });
        if (item) addAuditEvent('u-adm-1', ROLES.ADMIN, 'archive_content', 'content_item', contentId, 'Archived content item', {});
        return item;
    },
    async deleteContentItem(contentId) {
        const idx = db.contentItems.findIndex((c) => c.id === contentId);
        if (idx < 0) return false;
        if (pvlPostgrestApi.isEnabled()) {
            try {
                await pvlPostgrestApi.deleteContentItem(contentId);
            } catch (error) {
                try {
                    // eslint-disable-next-line no-console
                    console.warn('[PVL] deleteContentItem DB:', error?.message || error);
                } catch { /* noop */ }
                logDbFallback({
                    endpoint: '/public.pvl_content_items',
                    status: 'error',
                    table: 'pvl_content_items',
                    id: contentId,
                    error: String(error?.message || error || 'delete failed'),
                });
                throw error;
            }
        }
        db.contentItems.splice(idx, 1);
        db.contentPlacements = db.contentPlacements.filter((p) => (p.contentItemId || p.contentId) !== contentId);
        addAuditEvent('u-adm-1', ROLES.ADMIN, 'delete_content', 'content_item', contentId, 'Deleted content item', {});
        return true;
    },
    async unarchiveContentItem(contentId) {
        return this.updateContentItem(contentId, { status: CONTENT_STATUS.DRAFT });
    },
    async createPlacement(payload) {
        const placement = { id: newPvlPersistedEntityId(), isPublished: true, createdAt: nowIso(), updatedAt: nowIso(), ...payload };
        if (!pvlPostgrestApi.isEnabled()) {
            db.contentPlacements.push(placement);
            addAuditEvent('u-adm-1', ROLES.ADMIN, 'assign_placement', 'content_placement', placement.id, 'Assigned content placement', payload);
            return placement;
        }
        try {
            const row = await pvlPostgrestApi.upsertPlacement({
                id: placement.id,
                content_item_id: placement.contentItemId || placement.contentId,
                target_role: placement.targetRole || 'both',
                target_section: placement.targetSection || 'library',
                cohort_id: seedCohortIdToSqlUuid(placement.cohortId || placement.targetCohort),
                module_number: Number(placement.moduleNumber ?? placement.weekNumber ?? 0),
                week_number: Number(placement.weekNumber ?? placement.moduleNumber ?? 0),
                order_index: Number(placement.orderIndex ?? 0),
                is_published: placement.isPublished !== false,
                created_at: placement.createdAt,
                updated_at: placement.updatedAt,
            });
            if (!row) throw new Error('PostgREST: пустой ответ при сохранении размещения');
            const merged = mapDbPlacementToRuntime(row);
            db.contentPlacements.push(merged);
            addAuditEvent('u-adm-1', ROLES.ADMIN, 'assign_placement', 'content_placement', merged.id, 'Assigned content placement', payload);
            return merged;
        } catch (error) {
            try {
                // eslint-disable-next-line no-console
                console.warn('[PVL] createPlacement DB:', error?.message || error);
            } catch { /* noop */ }
            logDbFallback({
                endpoint: '/public.pvl_content_placements',
                status: 'error',
                table: 'pvl_content_placements',
                id: placement.id,
                error: String(error?.message || error || 'placement failed'),
            });
            throw error;
        }
    },
    assignContentPlacement(payload) {
        return this.createPlacement(payload);
    },
    async updatePlacement(placementId, payload) {
        const p = db.contentPlacements.find((x) => x.id === placementId);
        if (!p) return null;
        const snapshot = { ...p };
        Object.assign(p, payload, { updatedAt: nowIso() });
        addAuditEvent('u-adm-1', ROLES.ADMIN, 'update_placement', 'content_placement', placementId, 'Updated content placement', payload);
        if (!pvlPostgrestApi.isEnabled()) return p;
        try {
            const row = await pvlPostgrestApi.updatePlacement(placementId, {
                target_role: p.targetRole || 'both',
                target_section: p.targetSection || 'library',
                cohort_id: seedCohortIdToSqlUuid(p.cohortId || p.targetCohort),
                module_number: Number(p.moduleNumber ?? p.weekNumber ?? 0),
                week_number: Number(p.weekNumber ?? p.moduleNumber ?? 0),
                order_index: Number(p.orderIndex ?? 0),
                is_published: p.isPublished !== false,
                updated_at: p.updatedAt,
            });
            if (row) Object.assign(p, mapDbPlacementToRuntime(row));
            return p;
        } catch (error) {
            Object.assign(p, snapshot);
            try {
                // eslint-disable-next-line no-console
                console.warn('[PVL] updatePlacement DB:', error?.message || error);
            } catch { /* noop */ }
            logDbFallback({
                endpoint: '/public.pvl_content_placements',
                status: 'error',
                table: 'pvl_content_placements',
                id: placementId,
                error: String(error?.message || error || 'update placement failed'),
            });
            throw error;
        }
    },
    async unpublishContentItem(contentId) {
        const item = await this.updateContentItem(contentId, { status: CONTENT_STATUS.UNPUBLISHED });
        if (item) addAuditEvent('u-adm-1', ROLES.ADMIN, 'unpublish_content', 'content_item', contentId, 'Unpublished content item', {});
        return item;
    },
    async deletePlacement(placementId) {
        const idx = db.contentPlacements.findIndex((p) => p.id === placementId);
        if (idx < 0) return false;
        if (pvlPostgrestApi.isEnabled()) {
            try {
                await pvlPostgrestApi.deletePlacement(placementId);
            } catch (error) {
                try {
                    // eslint-disable-next-line no-console
                    console.warn('[PVL] deletePlacement DB:', error?.message || error);
                } catch { /* noop */ }
                logDbFallback({
                    endpoint: '/public.pvl_content_placements',
                    status: 'error',
                    table: 'pvl_content_placements',
                    id: placementId,
                    error: String(error?.message || error || 'delete placement failed'),
                });
                throw error;
            }
        }
        db.contentPlacements.splice(idx, 1);
        addAuditEvent('u-adm-1', ROLES.ADMIN, 'remove_placement', 'content_placement', placementId, 'Removed content placement', {});
        return true;
    },
    removePlacement(placementId) {
        return this.deletePlacement(placementId);
    },
    publishPlacement(placementId) {
        return this.updatePlacement(placementId, { isPublished: true });
    },
    unpublishPlacement(placementId) {
        return this.updatePlacement(placementId, { isPublished: false });
    },
    getAdminStudents(filters = {}) {
        let list = db.studentProfiles.filter((s) => (filters.cohortId ? s.cohortId === filters.cohortId : true));
        if (db._pvlGardenApplicantsSynced) {
            list = list.filter((s) => !isSeedPvlDemoStudentId(s.userId));
        }
        list = list.filter((s) => !isPvlPreviewStudentId(s.userId));
        /** Стажеры (gardenRole='intern') имеют доступ к урокам ПВЛ, но в список
         *  «активных учениц с ментором» не попадают — они уже прошли курс. */
        list = list.filter((s) => s.gardenRole !== 'intern');
        return list;
    },
    getAdminMentors() {
        return db.mentorProfiles;
    },
    async addMenteeToMentor(mentorUserId, studentUserId) {
        const mentor = db.mentorProfiles.find((m) => String(m.userId) === String(mentorUserId) || String(m.id) === String(mentorUserId));
        if (!mentor || !studentUserId) return null;
        const next = new Set(Array.isArray(mentor.menteeIds) ? mentor.menteeIds : []);
        next.add(studentUserId);
        mentor.menteeIds = Array.from(next);
        mentor.updatedAt = nowIso();
        const profile = db.studentProfiles.find((s) => String(s.userId) === String(studentUserId));
        if (profile) {
            profile.mentorId = mentor.userId || mentorUserId;
            profile.updatedAt = nowIso();
        }
        addAuditEvent('u-adm-1', ROLES.ADMIN, 'assign_mentee_to_mentor', 'mentor_profile', mentor.userId || mentor.id, 'Assigned mentee to mentor', { studentUserId });
        await persistGardenMentorLink(studentUserId, mentor.userId || mentorUserId);
        return mentor;
    },
    async removeMenteeFromMentor(mentorUserId, studentUserId) {
        const mentor = db.mentorProfiles.find((m) => String(m.userId) === String(mentorUserId) || String(m.id) === String(mentorUserId));
        if (!mentor || !studentUserId) return null;
        mentor.menteeIds = (mentor.menteeIds || []).filter((id) => String(id) !== String(studentUserId));
        mentor.updatedAt = nowIso();
        const resolvedMentorUserId = mentor.userId || mentorUserId;
        const profile = db.studentProfiles.find((p) => String(p.userId) === String(studentUserId));
        if (profile && String(profile.mentorId) === String(resolvedMentorUserId)) {
            profile.mentorId = null;
            profile.updatedAt = nowIso();
        }
        addAuditEvent('u-adm-1', ROLES.ADMIN, 'remove_mentee_from_mentor', 'mentor_profile', mentor.userId || mentor.id, 'Removed mentee from mentor', { studentUserId });
        const spAfter = db.studentProfiles.find((p) => String(p.userId) === String(studentUserId));
        await persistGardenMentorLink(studentUserId, spAfter?.mentorId || null);
        return mentor;
    },
    /** Одна ученица — один ментор: синхронизирует mentorProfiles.menteeIds и studentProfiles.mentorId */
    async assignStudentMentor(studentUserId, mentorUserId) {
        const profile = db.studentProfiles.find((p) => String(p.userId) === String(studentUserId));
        if (!profile) return null;
        for (const m of db.mentorProfiles || []) {
            if (!Array.isArray(m.menteeIds)) continue;
            if (!m.menteeIds.some((id) => String(id) === String(studentUserId))) continue;
            m.menteeIds = m.menteeIds.filter((id) => String(id) !== String(studentUserId));
            m.updatedAt = nowIso();
        }
        if (!mentorUserId) {
            profile.mentorId = null;
            profile.updatedAt = nowIso();
            addAuditEvent('u-adm-1', ROLES.ADMIN, 'clear_student_mentor', 'student_profile', studentUserId, 'Cleared mentor assignment', {});
            await persistGardenMentorLink(studentUserId, null);
            return profile;
        }
        const mentor = db.mentorProfiles.find((m) => String(m.userId) === String(mentorUserId) || String(m.id) === String(mentorUserId));
        if (!mentor) return null;
        const next = new Set((mentor.menteeIds || []).map((id) => String(id)));
        next.add(String(studentUserId));
        mentor.menteeIds = Array.from(next);
        mentor.updatedAt = nowIso();
        profile.mentorId = mentor.userId || mentorUserId;
        profile.updatedAt = nowIso();
        addAuditEvent('u-adm-1', ROLES.ADMIN, 'assign_student_mentor', 'student_profile', studentUserId, 'Assigned mentor', { mentorUserId: profile.mentorId });
        await persistGardenMentorLink(studentUserId, profile.mentorId);
        return profile;
    },
    getAdminCohorts() {
        return db.cohorts;
    },
    getAdminReviewQueue() {
        return db.studentTaskStates.filter((s) => [TASK_STATUS.PENDING_REVIEW, TASK_STATUS.SUBMITTED, TASK_STATUS.REVISION_REQUESTED].includes(s.status));
    },
    getAdminRisks() {
        return buildAdminRisks(db);
    },
    getAdminCertification() {
        return db.certificationProgress;
    },
    getAdminSettings() {
        return {
            scoreRules: { ...SCORING_RULES },
            methodQuestions: [SCORING_METHOD_QUESTION],
        };
    },
    getAdminFaq() {
        return [...db.faqItems].sort((a, b) => Number(a.orderIndex || 0) - Number(b.orderIndex || 0));
    },
    upsertFaqItem(payload = {}) {
        const id = payload.id || uid('faq');
        const row = {
            id,
            title: payload.title || payload.question || 'Новый вопрос',
            question: payload.question || payload.title || 'Новый вопрос',
            answer: payload.answer || payload.answerHtml || '',
            answerHtml: payload.answerHtml || payload.answer || '',
            targetRole: payload.targetRole || 'all',
            isPublished: payload.isPublished !== false,
            orderIndex: Number(payload.orderIndex ?? 0),
        };
        const idx = db.faqItems.findIndex((x) => x.id === id);
        if (idx >= 0) db.faqItems[idx] = { ...db.faqItems[idx], ...row };
        else db.faqItems.push(row);
        fireAndForget(() => pvlPostgrestApi.upsertFaqItem({
            id: row.id,
            question: row.question,
            answer: row.answerHtml || row.answer || '',
            target_role: row.targetRole || 'all',
            is_published: row.isPublished !== false,
            order_index: Number(row.orderIndex ?? 0),
            created_at: nowIso(),
            updated_at: nowIso(),
        }), { table: 'pvl_faq_items', endpoint: '/public.pvl_faq_items', id: row.id });
        addAuditEvent('u-adm-1', ROLES.ADMIN, 'upsert_faq_item', 'faq_item', row.id, 'Upsert FAQ item', row);
        return row;
    },
    deleteFaqItem(faqId) {
        const idx = db.faqItems.findIndex((x) => x.id === faqId);
        if (idx < 0) return false;
        db.faqItems.splice(idx, 1);
        fireAndForget(() => pvlPostgrestApi.deleteFaqItem(faqId), { table: 'pvl_faq_items', endpoint: '/public.pvl_faq_items', id: faqId });
        addAuditEvent('u-adm-1', ROLES.ADMIN, 'delete_faq_item', 'faq_item', faqId, 'Deleted FAQ item', {});
        return true;
    },
    createCalendarEvent(payload = {}) {
        const et = normalizeCalendarEventTypeForDb(payload.eventType || 'practicum');
        const row = {
            id: uid('pvl-cal'),
            title: 'Новое событие',
            description: '',
            eventType: et,
            startAt: nowIso(),
            endAt: nowIso(),
            date: nowIso().slice(0, 10),
            linkedLessonId: null,
            linkedPracticumId: null,
            recordingUrl: '',
            recapText: '',
            visibilityRole: 'all',
            cohortId: 'cohort-2026-1',
            colorToken: et,
            createdBy: 'u-adm-1',
            createdAt: nowIso(),
            updatedAt: nowIso(),
            ...payload,
        };
        db.calendarEvents.push(row);
        addAuditEvent('u-adm-1', ROLES.ADMIN, 'create_calendar_event', 'calendar_event', row.id, row.title, {});
        fireAndForget(() => pvlPostgrestApi.createCalendarEvent({
            id: row.id,
            title: row.title || 'Новое событие',
            description: row.description || '',
            event_type: normalizeCalendarEventTypeForDb(row.eventType || 'other'),
            visibility_role: row.visibilityRole || 'all',
            cohort_id: row.cohortId || 'cohort-2026-1',
            module_number: Number(row.moduleNumber ?? row.weekNumber ?? 0),
            week_number: Number(row.weekNumber ?? row.moduleNumber ?? 0),
            linked_lesson_id: row.linkedLessonId || null,
            linked_practicum_id: row.linkedPracticumId || null,
            recording_url: row.recordingUrl || null,
            recap_text: row.recapText || null,
            start_at: row.startAt || nowIso(),
            end_at: row.endAt || nowIso(),
            color_token: row.colorToken || row.eventType || 'other',
            is_published: row.isPublished !== false,
            created_at: row.createdAt,
            updated_at: row.updatedAt,
        }), { table: 'pvl_calendar_events', endpoint: '/public.pvl_calendar_events', id: row.id });
        return row;
    },
    updateCalendarEvent(eventId, payload) {
        const e = db.calendarEvents.find((x) => x.id === eventId);
        if (!e) return null;
        const nextPatch = { ...payload };
        if (Object.prototype.hasOwnProperty.call(nextPatch, 'eventType')) {
            nextPatch.eventType = normalizeCalendarEventTypeForDb(nextPatch.eventType);
        }
        Object.assign(e, nextPatch, { updatedAt: nowIso() });
        addAuditEvent('u-adm-1', ROLES.ADMIN, 'update_calendar_event', 'calendar_event', eventId, e.title, payload);
        fireAndForget(() => pvlPostgrestApi.updateCalendarEvent(eventId, {
            title: e.title || 'Событие',
            description: e.description || '',
            event_type: normalizeCalendarEventTypeForDb(e.eventType || 'other'),
            visibility_role: e.visibilityRole || 'all',
            cohort_id: e.cohortId || 'cohort-2026-1',
            module_number: Number(e.moduleNumber ?? e.weekNumber ?? 0),
            week_number: Number(e.weekNumber ?? e.moduleNumber ?? 0),
            linked_lesson_id: e.linkedLessonId || null,
            linked_practicum_id: e.linkedPracticumId || null,
            recording_url: e.recordingUrl || null,
            recap_text: e.recapText || null,
            start_at: e.startAt || nowIso(),
            end_at: e.endAt || nowIso(),
            color_token: e.colorToken || e.eventType || 'other',
            is_published: e.isPublished !== false,
            updated_at: e.updatedAt,
        }), { table: 'pvl_calendar_events', endpoint: '/public.pvl_calendar_events', id: eventId });
        return e;
    },
    deleteCalendarEvent(eventId) {
        const idx = db.calendarEvents.findIndex((x) => x.id === eventId);
        if (idx < 0) return false;
        db.calendarEvents.splice(idx, 1);
        addAuditEvent('u-adm-1', ROLES.ADMIN, 'delete_calendar_event', 'calendar_event', eventId, 'deleted', {});
        fireAndForget(() => pvlPostgrestApi.deleteCalendarEvent(eventId), { table: 'pvl_calendar_events', endpoint: '/public.pvl_calendar_events', id: eventId });
        return true;
    },
};

export const sharedApi = {
    getFaq(role) {
        return db.faqItems
            .filter((f) => f.isPublished !== false)
            .filter((f) => f.targetRole === role || f.targetRole === 'all' || f.targetRole === 'both')
            .sort((a, b) => Number(a.orderIndex || 0) - Number(b.orderIndex || 0));
    },
    getGlossary() {
        return [
            { id: 'g-1', term: 'Артефакт', definition: 'Результат выполнения задания.' },
            { id: 'g-2', term: 'КТ', definition: 'Контрольная точка курса.' },
        ];
    },
    getCourseWeeks(cohortId) {
        return db.courseWeeks.filter((w) => w.cohortId === cohortId);
    },
    getControlPoints(cohortId) {
        return db.controlPoints.filter((c) => c.cohortId === cohortId);
    },
    getNotifications(userId) {
        return getPendingNotifications(db, userId);
    },
    createStudentQuestion(studentId, question) {
        const row = {
            id: uid('qs'),
            student_id: studentId,
            question: String(question || '').trim(),
            answer_html: null,
            is_public: false,
            status: 'new',
            created_at: nowIso(),
            updated_at: nowIso(),
        };
        if (!row.question) return null;
        const sqlStudentId = studentSqlIdByUserId(studentId);
        if (sqlStudentId) {
            fireAndForget(async () => {
                await ensurePvlStudentInDb(studentId);
                return pvlPostgrestApi.createStudentQuestion({
                    ...row,
                    student_id: sqlStudentId,
                });
            }, { table: 'pvl_student_questions', endpoint: '/public.pvl_student_questions', id: row.id });
        }
        addAuditEvent(studentId, ROLES.STUDENT, 'create_student_question', 'student_question', row.id, 'Student created question', {});
        return row;
    },
    getDirectMessages(mentorId, studentId) {
        return (db.directMessages || [])
            .filter((m) => m.mentorId === mentorId && m.studentId === studentId)
            .slice()
            .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    },
    sendDirectMessage({ mentorId, studentId, authorUserId, text }) {
        const body = String(text || '').trim();
        if (!mentorId || !studentId || !authorUserId || !body) return null;
        const id = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
            ? crypto.randomUUID()
            : uid('dm');
        const now = nowIso();
        const row = {
            id,
            mentorId,
            studentId,
            authorUserId,
            text: body,
            createdAt: now,
            updatedAt: now,
        };
        if (!Array.isArray(db.directMessages)) db.directMessages = [];
        db.directMessages.push(row);
        addAuditEvent(authorUserId, 'system', 'direct_message_send', 'direct_message', row.id, 'Direct message sent', { mentorId, studentId });
        if (isUuidString(mentorId) && isUuidString(studentId) && isUuidString(authorUserId)) {
            const dbRow = {
                id: isUuidString(id) ? id : undefined,
                mentor_id: mentorId,
                student_id: studentId,
                author_user_id: authorUserId,
                text: body,
            };
            if (!isUuidString(id)) delete dbRow.id;
            fireAndForget(
                () => pvlPostgrestApi.createDirectMessage(dbRow),
                { table: 'pvl_direct_messages', endpoint: '/pvl_direct_messages', id: row.id },
            );
        }
        return row;
    },
    async loadDirectMessagesFromDb(mentorId, studentId) {
        if (!pvlPostgrestApi.isEnabled()) return;
        if (!isUuidString(mentorId) || !isUuidString(studentId)) return;
        let rows;
        try {
            rows = await pvlPostgrestApi.listDirectMessages(mentorId, studentId);
        } catch {
            return;
        }
        if (!Array.isArray(db.directMessages)) db.directMessages = [];
        const existingIds = new Set(db.directMessages.map((m) => m.id));
        for (const row of rows || []) {
            if (!row?.id || existingIds.has(row.id)) continue;
            db.directMessages.push({
                id: row.id,
                mentorId: row.mentor_id,
                studentId: row.student_id,
                authorUserId: row.author_user_id,
                text: row.text,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            });
        }
    },
    getStudentDirectDialog(studentId) {
        const profile = db.studentProfiles.find((p) => p.userId === studentId);
        const mentorId = profile?.mentorId || null;
        if (!mentorId) return { mentorId: null, mentor: null, messages: [] };
        const mentor = db.users.find((u) => u.id === mentorId) || null;
        const messages = this.getDirectMessages(mentorId, studentId);
        return { mentorId, mentor, messages };
    },
    getMentorDirectDialogs(mentorId) {
        const menteeIds = getMentorMenteeIds(mentorId);
        return menteeIds.map((studentId) => {
            const student = db.users.find((u) => u.id === studentId) || null;
            const messages = this.getDirectMessages(mentorId, studentId);
            const last = messages.length ? messages[messages.length - 1] : null;
            return {
                mentorId,
                studentId,
                student,
                lastMessageText: last?.text || '',
                lastMessageAt: last?.createdAt || null,
                totalMessages: messages.length,
            };
        }).sort((a, b) => String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || '')));
    },
};

function markThreadRead(userId, studentId, taskId) {
    db.threadMessages
        .filter((m) => m.studentId === studentId && m.taskId === taskId)
        .forEach((m) => {
            const set = new Set(m.readBy || []);
            set.add(userId);
            m.readBy = Array.from(set);
        });
    addAuditEvent(userId, 'system', 'mark_thread_read', 'thread', `${studentId}:${taskId}`, 'Marked thread as read', {});
}

function setTaskStatus(studentId, taskId, toStatus, changedByUserId, comment = '') {
    const state = db.studentTaskStates.find((s) => s.studentId === studentId && s.taskId === taskId);
    if (!state) return null;
    const fromStatus = state.status;
    state.status = toStatus;
    state.lastStatusChangedAt = nowIso().slice(0, 10);
    if (toStatus === TASK_STATUS.ACCEPTED) {
        state.acceptedAt = state.acceptedAt || nowIso().slice(0, 10);
        state.reviewSeenByStudentAt = null;
    }
    const history = { id: uid('sh'), studentId, taskId, fromStatus, toStatus, changedByUserId, comment, createdAt: nowIso() };
    db.statusHistory.push(history);
    if (toStatus !== TASK_STATUS.ACCEPTED) {
        db.threadMessages.push({ id: uid('tm'), studentId, taskId, authorUserId: 'system', authorRole: 'system', messageType: 'status', text: `Статус изменен на ${toStatus}`, attachments: [], linkedVersionId: null, linkedStatusHistoryId: history.id, isSystem: true, createdAt: nowIso(), readBy: [] });
    }
    pushEvent('task_status_changed', { studentId, taskId, toStatus });
    addAuditEvent(changedByUserId, 'system', 'set_task_status', 'task', taskId, `Status changed to ${toStatus}`, { studentId, comment });
    return history;
}

export const pvlDomainApi = {
    db,
    ensurePvlPreviewStudentProfile,
    isPvlPreviewStudentId,
    PVL_PREVIEW_STUDENT_ID,
    gardenAdmission: {
        classifyGardenProfileForPvlStudent,
        pvlGardenRoleLabelRu,
    },
    studentApi,
    mentorApi,
    adminApi,
    calendarApi,
    sharedApi,
    helpers: {
        calculateLibraryProgress: () => calculateLibraryProgress(),
        calculateRiskLevel: (studentId) => calculateRiskLevel(db, studentId),
        getUnreadThreadCount: (userId) => getUnreadThreadCount(db, userId),
        getStudentPointsSummary: (studentId) => calculatePointsSummary(studentId),
        canPostTaskThread,
    },
    selectors: {
        getVisibleContentItems,
        getPublishedContentForStudent(studentId, section) {
            return getVisibleContentItems(studentId, ROLES.STUDENT, section);
        },
        getPublishedContentForMentor(mentorId, section) {
            return getVisibleContentItems(mentorId, ROLES.MENTOR, section);
        },
        getContentPlacementsBySection(section) {
            return db.contentPlacements.filter((p) => p.targetSection === section);
        },
    },
    events: {
        list: () => [...eventLog].slice(-200),
    },
    actions: {
        markThreadRead,
        setTaskStatus,
        setTaskOverdue(studentId, taskId, overdueDays = 1) {
            const state = db.studentTaskStates.find((s) => s.studentId === studentId && s.taskId === taskId);
            if (!state) return null;
            state.isOverdue = true;
            state.overdueDays = overdueDays;
            pushEvent('anti_debt_trigger', { studentId, taskId, overdueDays });
            addNotification(studentId, ROLES.STUDENT, 'anti_debt_trigger', 'Сработал антидолг', { taskId, overdueDays });
            addAuditEvent('debug', 'system', 'inject_overdue', 'task', taskId, 'Debug overdue injected', { studentId, overdueDays });
            return state;
        },
        simulateCertificationRedFlag(studentId, flag = 'Отсутствует пакет') {
            const c = db.certificationProgress.find((x) => x.studentId === studentId);
            if (!c) return null;
            c.redFlags = Array.from(new Set([...(c.redFlags || []), flag]));
            pushEvent('certification_deadline_due', { studentId, flag });
            addNotification(studentId, ROLES.STUDENT, 'certification_deadline', 'Обновлен блок сертификации', { flag });
            addAuditEvent('debug', 'system', 'inject_cert_red_flag', 'certification', studentId, 'Debug certification red flag', { flag });
            return c;
        },
    },
    notifications: {
        getNotificationsForUser(userId) {
            return notifications.filter((n) => n.userId === userId || n.userId === 'all').slice(-100).reverse();
        },
        async refreshFromDb(userId) {
            if (!pvlPostgrestApi.isEnabled()) return this.getNotificationsForUser(userId);
            try {
                const rows = await pvlPostgrestApi.listNotifications(userId);
                notifications = rows.map((r) => ({
                    id: r.id,
                    userId: r.user_id || userId,
                    role: r.role || 'all',
                    type: r.kind || 'notification',
                    title: r.title || '',
                    text: r.body || r.title || '',
                    payload: r.payload || {},
                    isRead: !!r.is_read,
                    createdAt: r.created_at || nowIso(),
                }));
            } catch {
                /* fallback to mock notifications */
            }
            return this.getNotificationsForUser(userId);
        },
        markNotificationRead(notificationId) {
            const n = notifications.find((x) => x.id === notificationId);
            if (!n) return null;
            n.isRead = true;
            fireAndForget(() => pvlPostgrestApi.markNotificationRead(notificationId), { table: 'pvl_notifications', endpoint: '/public.pvl_notifications', id: notificationId });
            return n;
        },
        markAllNotificationsRead(userId) {
            notifications.forEach((n) => {
                if (n.userId === userId) n.isRead = true;
            });
        },
    },
    audit: {
        addAuditEvent,
        getAuditLog(filters = {}) {
            return auditLog
                .filter((a) => (filters.actorUserId ? a.actorUserId === filters.actorUserId : true))
                .filter((a) => (filters.actionType ? a.actionType === filters.actionType : true))
                .slice(-500)
                .reverse();
        },
    },
    dbLayer: {
        getState: () => db,
        setState(next) {
            Object.keys(db).forEach((k) => { delete db[k]; });
            Object.assign(db, next);
        },
        patchEntity(entityName, id, patch) {
            const arr = db[entityName];
            if (!Array.isArray(arr)) return null;
            const item = arr.find((x) => x.id === id || x.userId === id);
            if (!item) return null;
            Object.assign(item, patch);
            return item;
        },
        insertEntity(entityName, record) {
            const arr = db[entityName];
            if (!Array.isArray(arr)) return null;
            arr.push(record);
            return record;
        },
        removeEntity(entityName, id) {
            const arr = db[entityName];
            if (!Array.isArray(arr)) return false;
            const idx = arr.findIndex((x) => x.id === id || x.userId === id);
            if (idx < 0) return false;
            arr.splice(idx, 1);
            return true;
        },
        resetDatabase() {
            const fresh = structuredClone(seed);
            Object.keys(db).forEach((k) => { delete db[k]; });
            Object.assign(db, fresh);
            if (import.meta.env.DEV) {
                ensureLocalDemoLessonContent();
            }
            auditLog = [];
            notifications = [];
            addAuditEvent('debug', 'system', 'reset_database', 'database', 'root', 'Database reset to seed', {});
        },
        cloneSeedState: () => structuredClone(seed),
    },
};

/**
 * Патчит имя текущего вошедшего пользователя из профиля Garden в mock-запись db.users.
 * Вызывается сразу после разрешения роли, чтобы sidebar и дашборд показывали реальное ФИО.
 */
export function pvlPatchCurrentUserFromGarden(gardenUser, resolvedPvlRole) {
    try {
        if (!gardenUser) return;
        const realName = gardenUser.name || gardenUser.fullName || gardenUser.email || '';
        if (!realName) return;
        const gid = gardenUser.id != null ? String(gardenUser.id) : '';
        if (gid) {
            let row = (db.users || []).find((u) => String(u.id) === gid);
            if (!row) {
                const role = resolvedPvlRole === 'admin' ? ROLES.ADMIN
                    : resolvedPvlRole === 'mentor' ? ROLES.MENTOR
                    : ROLES.STUDENT;
                row = {
                    id: gid,
                    role,
                    fullName: realName,
                    email: gardenUser.email || '',
                    avatar: gardenUser.avatar || '',
                    isActive: true,
                    createdAt: nowIso(),
                    updatedAt: nowIso(),
                };
                db.users.push(row);
            } else {
                row.fullName = realName;
            }
            row._gardenLinked = true;
            return;
        }
        const mockId = resolvedPvlRole === 'admin' ? 'u-adm-1'
            : resolvedPvlRole === 'mentor' ? 'u-men-1'
            : 'u-st-1';
        const dbEntry = (db.users || []).find((u) => u.id === mockId);
        if (dbEntry) {
            dbEntry.fullName = realName;
            dbEntry._gardenLinked = true;
        }
    } catch {
        /* noop */
    }
}
