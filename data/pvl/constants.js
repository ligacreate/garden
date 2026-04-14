import { CONTENT_STATUS, CONTENT_TYPE, ROLES } from './enums';

export const METHOD_QUESTIONS = Object.freeze({
    SZ_ADMISSION_THRESHOLD: 'Допуск к СЗ: 400 или 500',
    LIBRARY_POINTS: 'Начислять ли баллы за библиотеку',
    EDIT_SUBMITTED_VERSION: 'Можно ли редактировать отправленную версию до открытия проверки ментором',
    BONUS_STORAGE_LEVEL: 'Где хранить ручной бонус ментора: task level или student flow level',
    GLOBAL_MENTEE_COMMENT_ENTITY: 'Нужна ли отдельная сущность общего комментария по менти',
});

export const SCORE_RULES = Object.freeze({
    MAX_COURSE_POINTS: 400,
    MAX_SZ_SELF_ASSESSMENT_POINTS: 54,
    WEEK_0_POINTS: 20,
    WEEK_POINTS: 20,
    CONTROL_POINT_POINTS: 10,
    BONUS_POOL_MAX: 50,
    CONTROL_POINTS_TOTAL: 9,
    WEEK_6_CONTROL_POINTS: 3,
    SZ_RECORDING_DEADLINE: '2026-06-30',
});

export const CANONICAL_SCHEDULE_2026 = Object.freeze({
    prelearningUntil: '2026-04-21',
    weeks: [
        { weekNumber: 0, startDate: '2026-04-15', endDate: '2026-04-21', moduleNumber: 0, title: 'Week 0' },
        { weekNumber: 1, startDate: '2026-04-22', endDate: '2026-04-28', moduleNumber: 1, title: 'Week 1' },
        { weekNumber: 2, startDate: '2026-04-29', endDate: '2026-05-05', moduleNumber: 1, title: 'Week 2' },
        { weekNumber: 3, startDate: '2026-05-06', endDate: '2026-05-12', moduleNumber: 1, title: 'Week 3' },
        { weekNumber: 4, startDate: '2026-05-13', endDate: '2026-05-19', moduleNumber: 2, title: 'Week 4' },
        { weekNumber: 5, startDate: '2026-05-20', endDate: '2026-05-26', moduleNumber: 2, title: 'Week 5' },
        { weekNumber: 6, startDate: '2026-05-27', endDate: '2026-06-02', moduleNumber: 2, title: 'Week 6' },
        { weekNumber: 7, startDate: '2026-06-03', endDate: '2026-06-09', moduleNumber: 3, title: 'Week 7' },
        { weekNumber: 8, startDate: '2026-06-10', endDate: '2026-06-16', moduleNumber: 3, title: 'Week 8' },
        { weekNumber: 9, startDate: '2026-06-17', endDate: '2026-06-23', moduleNumber: 3, title: 'Week 9' },
        { weekNumber: 10, startDate: '2026-06-24', endDate: '2026-06-30', moduleNumber: 3, title: 'Week 10' },
        { weekNumber: 11, startDate: '2026-07-01', endDate: '2026-07-07', moduleNumber: 3, title: 'Week 11' },
        { weekNumber: 12, startDate: '2026-07-08', endDate: '2026-07-14', moduleNumber: 3, title: 'Week 12' },
    ],
    controlPoints: [
        { code: 'KT1', weekNumber: 0, deadlineAt: '2026-04-21' },
        { code: 'KT2', weekNumber: 3, deadlineAt: '2026-05-12' },
        { code: 'KT3', weekNumber: 4, deadlineAt: '2026-05-19' },
        { code: 'KT4', weekNumber: 6, deadlineAt: '2026-06-02' },
        { code: 'KT5', weekNumber: 6, deadlineAt: '2026-06-02' },
        { code: 'KT6', weekNumber: 6, deadlineAt: '2026-06-02' },
        { code: 'KT7', weekNumber: 8, deadlineAt: '2026-06-16' },
        { code: 'KT8', weekNumber: 10, deadlineAt: '2026-06-30' },
        { code: 'KT9', weekNumber: 12, deadlineAt: '2026-07-14' },
    ],
});

export const CONTENT_SECTIONS = Object.freeze([
    'about',
    'glossary',
    'library',
    'lessons',
    'practicums',
    'checklist',
    'results',
    'certification',
    'cultural_code',
]);

export const DEFAULT_WIDGETS = Object.freeze([
    { id: 'w-st-1', role: ROLES.STUDENT, widgetCode: 'current_module', sortOrder: 1, isEnabled: true, config: {} },
    { id: 'w-st-2', role: ROLES.STUDENT, widgetCode: 'homework_progress', sortOrder: 2, isEnabled: true, config: {} },
    { id: 'w-men-1', role: ROLES.MENTOR, widgetCode: 'review_queue', sortOrder: 1, isEnabled: true, config: {} },
    { id: 'w-adm-1', role: ROLES.ADMIN, widgetCode: 'platform_overview', sortOrder: 1, isEnabled: true, config: {} },
]);

export const DEFAULT_CONTENT_TEMPLATE = Object.freeze({
    contentType: CONTENT_TYPE.TEXT,
    status: CONTENT_STATUS.DRAFT,
    visibility: 'all',
    attachments: [],
    externalLinks: [],
});
