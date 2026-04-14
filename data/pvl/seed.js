import {
    CERTIFICATION_STATUS,
    CONTENT_STATUS,
    CONTENT_TYPE,
    COURSE_STATUS,
    MEETING_STATUS,
    REFLECTION_STATUS,
    RISK_LEVEL,
    ROLES,
    TASK_STATUS,
} from './enums';
import { CANONICAL_SCHEDULE_2026, DEFAULT_WIDGETS, SCORE_RULES } from './constants';

const now = '2026-03-31T12:00:00.000Z';

const byWeek = new Map(CANONICAL_SCHEDULE_2026.weeks.map((w) => [w.weekNumber, w]));

const mkWeekId = (cohortId, weekNumber) => `${cohortId}-w${weekNumber}`;

/** Закрытие этапа (модуль 0 и 1–12) для бальной логики. */
function mkWeekCompletion(studentId, weekNumber, closed) {
    return {
        id: `wcs-${studentId}-w${weekNumber}`,
        studentId,
        weekNumber,
        studiedCompleted: closed,
        taskCompleted: closed,
        submittedCompleted: closed,
        weekClosed: closed,
        autoPointsAwarded: closed ? 20 : 0,
        awardedAt: closed ? now : null,
    };
}

function rangeClosedWeeks(studentId, from, to) {
    return Array.from({ length: to - from + 1 }, (_, i) => mkWeekCompletion(studentId, from + i, true));
}

function mkCpState(id, studentId, controlPointId) {
    return {
        id,
        studentId,
        controlPointId,
        status: 'accepted',
        pointsAwarded: SCORE_RULES.CONTROL_POINT_POINTS,
        awardedAt: now,
        acceptedByUserId: 'u-men-1',
    };
}

export const seed = {
    users: [
        { id: 'u-st-1', role: ROLES.STUDENT, fullName: 'Анна Лаврова', email: 'anna@example.com', avatar: '', isActive: true, createdAt: now, updatedAt: now },
        { id: 'u-st-2', role: ROLES.STUDENT, fullName: 'Мария Иванова', email: 'maria@example.com', avatar: '', isActive: true, createdAt: now, updatedAt: now },
        { id: 'u-st-3', role: ROLES.STUDENT, fullName: 'Екатерина Смирнова', email: 'katya@example.com', avatar: '', isActive: true, createdAt: now, updatedAt: now },
        { id: 'u-st-4', role: ROLES.STUDENT, fullName: 'Ольга Петрова', email: 'olga@example.com', avatar: '', isActive: true, createdAt: now, updatedAt: now },
        { id: 'u-men-1', role: ROLES.MENTOR, fullName: 'Елена Ментор', email: 'mentor1@example.com', avatar: '', isActive: true, createdAt: now, updatedAt: now },
        { id: 'u-men-2', role: ROLES.MENTOR, fullName: 'Ольга Куратор', email: 'mentor2@example.com', avatar: '', isActive: true, createdAt: now, updatedAt: now },
        { id: 'u-adm-1', role: ROLES.ADMIN, fullName: 'Админ Платформы', email: 'admin@example.com', avatar: '', isActive: true, createdAt: now, updatedAt: now },
    ],
    cohorts: [
        { id: 'cohort-2026-1', title: 'ПВЛ 2026 · Поток 1', startDate: '2026-04-15', endDate: '2026-07-14', week0Start: '2026-04-15', week1Start: '2026-04-22', status: 'active', createdAt: now, updatedAt: now },
        { id: 'cohort-2026-2', title: 'ПВЛ 2026 · Поток 2', startDate: '2026-08-01', endDate: '2026-11-01', week0Start: '2026-08-01', week1Start: '2026-08-08', status: 'planned', createdAt: now, updatedAt: now },
    ],
    studentProfiles: [
        { id: 'sp-1', userId: 'u-st-1', cohortId: 'cohort-2026-1', mentorId: 'u-men-1', currentWeek: 6, currentModule: 2, courseStatus: COURSE_STATUS.ACTIVE, coursePoints: 170, szSelfAssessmentPoints: 0, szMentorAssessmentPoints: 0, szAdmissionStatus: CERTIFICATION_STATUS.IN_PROGRESS, lastActivityAt: '2026-06-02', unreadCount: 2, createdAt: now, updatedAt: now },
        { id: 'sp-2', userId: 'u-st-2', cohortId: 'cohort-2026-1', mentorId: 'u-men-1', currentWeek: 8, currentModule: 3, courseStatus: COURSE_STATUS.AT_RISK, coursePoints: 115, szSelfAssessmentPoints: 12, szMentorAssessmentPoints: 0, szAdmissionStatus: CERTIFICATION_STATUS.READY_FOR_REVIEW, lastActivityAt: '2026-06-14', unreadCount: 0, createdAt: now, updatedAt: now },
        { id: 'sp-3', userId: 'u-st-3', cohortId: 'cohort-2026-1', mentorId: 'u-men-2', currentWeek: 10, currentModule: 3, courseStatus: COURSE_STATUS.ACTIVE, coursePoints: 345, szSelfAssessmentPoints: 41, szMentorAssessmentPoints: 28, szAdmissionStatus: CERTIFICATION_STATUS.RED_FLAG, lastActivityAt: '2026-06-28', unreadCount: 1, createdAt: now, updatedAt: now },
        { id: 'sp-4', userId: 'u-st-4', cohortId: 'cohort-2026-1', mentorId: 'u-men-1', currentWeek: 2, currentModule: 1, courseStatus: COURSE_STATUS.AT_RISK, coursePoints: 20, szSelfAssessmentPoints: 0, szMentorAssessmentPoints: 0, szAdmissionStatus: CERTIFICATION_STATUS.NOT_STARTED, lastActivityAt: '2026-05-01', unreadCount: 0, createdAt: now, updatedAt: now },
    ],
    mentorProfiles: [
        { id: 'mp-1', userId: 'u-men-1', cohortIds: ['cohort-2026-1'], menteeIds: ['u-st-1', 'u-st-2', 'u-st-4'], activeReviewCount: 6, activeRiskCount: 3, createdAt: now, updatedAt: now },
        { id: 'mp-2', userId: 'u-men-2', cohortIds: ['cohort-2026-1'], menteeIds: ['u-st-3'], activeReviewCount: 6, activeRiskCount: 3, createdAt: now, updatedAt: now },
    ],
    adminProfiles: [
        { id: 'ap-1', userId: 'u-adm-1', permissions: ['content:write', 'cohorts:write', 'certification:write'], createdAt: now, updatedAt: now },
    ],
    courseWeeks: CANONICAL_SCHEDULE_2026.weeks.map((w) => ({
        id: mkWeekId('cohort-2026-1', w.weekNumber),
        cohortId: 'cohort-2026-1',
        weekNumber: w.weekNumber,
        startDate: w.startDate,
        endDate: w.endDate,
        moduleNumber: w.moduleNumber,
        title: `Модуль ${w.moduleNumber}`,
        artifactTitle: w.weekNumber === 0 ? 'Стартовый маршрут' : `Артефакт модуля ${w.moduleNumber}`,
        mentorMeetingFocus: `Фокус модуля ${w.moduleNumber}`,
        isPrelearning: w.weekNumber === 0,
        createdAt: now,
        updatedAt: now,
    })),
    lessons: CANONICAL_SCHEDULE_2026.weeks.map((w, idx) => ({
        id: `les-${idx + 1}`,
        weekId: mkWeekId('cohort-2026-1', w.weekNumber),
        title: `Урок модуля ${w.moduleNumber}`,
        stepType: 'изучить',
        artifactType: 'text',
        deadlineAt: w.endDate,
        orderIndex: 1,
        contentItemIds: [],
        createdAt: now,
        updatedAt: now,
    })),
    homeworkTasks: [
        { id: 'task-1', weekId: mkWeekId('cohort-2026-1', 6), title: 'Сценарий встречи v0.8', description: 'Собрать сценарий', artifact: 'Документ', criteria: ['Логика', 'Структура'], uploadTypes: ['text', 'file'], taskType: 'homework', isControlPoint: true, controlPointId: 'cp-4', deadlineAt: byWeek.get(6).endDate, scoreMax: 20, scoreType: 'course_points', linkedLessonIds: ['les-7'], linkedPracticumIds: [], linkedCertificationStage: null, createdAt: now, updatedAt: now },
        { id: 'task-1b', weekId: mkWeekId('cohort-2026-1', 6), title: 'Чек-лист практикума (модуль 2)', description: 'Внутренняя практика', artifact: 'Чек-лист', criteria: ['Полнота'], uploadTypes: ['text'], taskType: 'homework', isControlPoint: false, controlPointId: null, deadlineAt: byWeek.get(6).endDate, scoreMax: 10, scoreType: 'course_points', linkedLessonIds: ['les-7'], linkedPracticumIds: [], linkedCertificationStage: null, createdAt: now, updatedAt: now },
        { id: 'task-2', weekId: mkWeekId('cohort-2026-1', 6), title: 'Пилот 2 завтрака Лиги', description: 'Провести практикумы', artifact: 'Отчет', criteria: ['Подтверждение', 'Рефлексия'], uploadTypes: ['text', 'link'], taskType: 'control_point', isControlPoint: true, controlPointId: 'cp-6', deadlineAt: byWeek.get(6).endDate, scoreMax: 10, scoreType: 'course_points', linkedLessonIds: ['les-7'], linkedPracticumIds: [], linkedCertificationStage: null, createdAt: now, updatedAt: now },
        { id: 'task-2b', weekId: mkWeekId('cohort-2026-1', 7), title: 'Анкета обратной связи (модуль 3)', description: 'Собрать ОС', artifact: 'Таблица', criteria: ['Структура'], uploadTypes: ['file'], taskType: 'homework', isControlPoint: false, controlPointId: null, deadlineAt: byWeek.get(7).endDate, scoreMax: 15, scoreType: 'course_points', linkedLessonIds: [], linkedPracticumIds: [], linkedCertificationStage: null, createdAt: now, updatedAt: now },
        { id: 'task-2c', weekId: mkWeekId('cohort-2026-1', 5), title: 'Мини-проект модуля 2', description: 'Короткий кейс', artifact: 'Текст', criteria: ['Ясность'], uploadTypes: ['text'], taskType: 'homework', isControlPoint: false, controlPointId: null, deadlineAt: byWeek.get(5).endDate, scoreMax: 12, scoreType: 'course_points', linkedLessonIds: [], linkedPracticumIds: [], linkedCertificationStage: null, createdAt: now, updatedAt: now },
        { id: 'task-3', weekId: mkWeekId('cohort-2026-1', 10), title: 'Запись СЗ', description: 'Сдать запись СЗ', artifact: 'Видео', criteria: ['Качество', 'Структура'], uploadTypes: ['video', 'link'], taskType: 'control_point', isControlPoint: true, controlPointId: 'cp-8', deadlineAt: SCORE_RULES.SZ_RECORDING_DEADLINE, scoreMax: 10, scoreType: 'course_points', linkedLessonIds: ['les-11'], linkedPracticumIds: [], linkedCertificationStage: 'sz_recording', createdAt: now, updatedAt: now },
        { id: 'task-4', weekId: mkWeekId('cohort-2026-1', 5), title: 'Рефлексия по модулю 1', description: 'Короткая рефлексия', artifact: 'Текст', criteria: ['Честность'], uploadTypes: ['text'], taskType: 'homework', isControlPoint: false, controlPointId: null, deadlineAt: byWeek.get(5).endDate, scoreMax: 10, scoreType: 'course_points', linkedLessonIds: [], linkedPracticumIds: [], linkedCertificationStage: null, createdAt: now, updatedAt: now },
        { id: 'task-5', weekId: mkWeekId('cohort-2026-1', 3), title: 'Домашка модуля 1 (слабый прогресс)', description: 'Базовое задание', artifact: 'Текст', criteria: ['Срок'], uploadTypes: ['text'], taskType: 'homework', isControlPoint: false, controlPointId: null, deadlineAt: byWeek.get(3).endDate, scoreMax: 10, scoreType: 'course_points', linkedLessonIds: [], linkedPracticumIds: [], linkedCertificationStage: null, createdAt: now, updatedAt: now },
        { id: 'task-6', weekId: mkWeekId('cohort-2026-1', 2), title: 'Упражнение модуля 1', description: 'Повторение', artifact: 'Текст', criteria: ['Точность'], uploadTypes: ['text'], taskType: 'homework', isControlPoint: false, controlPointId: null, deadlineAt: byWeek.get(2).endDate, scoreMax: 10, scoreType: 'course_points', linkedLessonIds: [], linkedPracticumIds: [], linkedCertificationStage: null, createdAt: now, updatedAt: now },
    ],
    controlPoints: CANONICAL_SCHEDULE_2026.controlPoints.map((cp, idx) => ({
        id: `cp-${idx + 1}`,
        cohortId: 'cohort-2026-1',
        code: cp.code,
        title: `Контрольная точка ${cp.code}`,
        weekNumber: cp.weekNumber,
        deadlineAt: cp.deadlineAt,
        points: SCORE_RULES.CONTROL_POINT_POINTS,
        affectsAdmission: cp.code === 'KT8' || cp.code === 'KT9',
        specialNote: cp.code === 'KT8' ? 'Дедлайн записи СЗ до 30.06.2026' : '',
        createdAt: now,
        updatedAt: now,
    })),
    studentTaskStates: [
        { id: 'sts-1', studentId: 'u-st-1', taskId: 'task-1', status: TASK_STATUS.ACCEPTED, submittedAt: '2026-06-02', acceptedAt: '2026-06-05', reviewSeenByStudentAt: null, lastStatusChangedAt: '2026-06-05', currentVersionId: 'ver-2', revisionCycles: 2, mentorBonusPoints: 0, autoPoints: 18, totalTaskPoints: 18, isOverdue: false, overdueDays: 0, createdAt: now, updatedAt: now },
        { id: 'sts-1b', studentId: 'u-st-1', taskId: 'task-1b', status: TASK_STATUS.PENDING_REVIEW, submittedAt: '2026-06-10', acceptedAt: null, lastStatusChangedAt: '2026-06-10', currentVersionId: 'ver-1b1', revisionCycles: 0, mentorBonusPoints: 0, autoPoints: 0, totalTaskPoints: 0, isOverdue: false, overdueDays: 0, createdAt: now, updatedAt: now },
        { id: 'sts-2', studentId: 'u-st-2', taskId: 'task-2', status: TASK_STATUS.PENDING_REVIEW, submittedAt: '2026-06-02', acceptedAt: null, lastStatusChangedAt: '2026-06-02', currentVersionId: 'ver-3', revisionCycles: 0, mentorBonusPoints: 2, autoPoints: 8, totalTaskPoints: 10, isOverdue: false, overdueDays: 0, createdAt: now, updatedAt: now },
        { id: 'sts-2b', studentId: 'u-st-2', taskId: 'task-2b', status: TASK_STATUS.REVISION_REQUESTED, submittedAt: '2026-06-05', acceptedAt: null, lastStatusChangedAt: '2026-06-08', currentVersionId: 'ver-2b1', revisionCycles: 1, mentorBonusPoints: 0, autoPoints: 5, totalTaskPoints: 5, isOverdue: true, overdueDays: 4, createdAt: now, updatedAt: now },
        { id: 'sts-2c', studentId: 'u-st-2', taskId: 'task-2c', status: TASK_STATUS.NOT_STARTED, submittedAt: null, acceptedAt: null, lastStatusChangedAt: now, currentVersionId: null, revisionCycles: 0, mentorBonusPoints: 0, autoPoints: 0, totalTaskPoints: 0, isOverdue: true, overdueDays: 12, createdAt: now, updatedAt: now },
        { id: 'sts-3', studentId: 'u-st-3', taskId: 'task-3', status: TASK_STATUS.SUBMITTED, submittedAt: '2026-06-28', acceptedAt: null, lastStatusChangedAt: '2026-06-28', currentVersionId: 'ver-4', revisionCycles: 0, mentorBonusPoints: 0, autoPoints: 7, totalTaskPoints: 7, isOverdue: false, overdueDays: 0, createdAt: now, updatedAt: now },
        { id: 'sts-4', studentId: 'u-st-1', taskId: 'task-4', status: TASK_STATUS.ACCEPTED, submittedAt: '2026-05-25', acceptedAt: '2026-05-28', reviewSeenByStudentAt: null, lastStatusChangedAt: '2026-05-28', currentVersionId: 'ver-5', revisionCycles: 0, mentorBonusPoints: 0, autoPoints: 10, totalTaskPoints: 10, isOverdue: false, overdueDays: 0, createdAt: now, updatedAt: now },
        { id: 'sts-5', studentId: 'u-st-4', taskId: 'task-5', status: TASK_STATUS.NOT_STARTED, submittedAt: null, acceptedAt: null, lastStatusChangedAt: now, currentVersionId: null, revisionCycles: 0, mentorBonusPoints: 0, autoPoints: 0, totalTaskPoints: 0, isOverdue: true, overdueDays: 18, createdAt: now, updatedAt: now },
        { id: 'sts-6', studentId: 'u-st-4', taskId: 'task-6', status: TASK_STATUS.REVISION_REQUESTED, submittedAt: '2026-05-01', acceptedAt: null, lastStatusChangedAt: '2026-05-03', currentVersionId: 'ver-6a', revisionCycles: 2, mentorBonusPoints: 0, autoPoints: 3, totalTaskPoints: 3, isOverdue: true, overdueDays: 28, createdAt: now, updatedAt: now },
        // Доп. демо-задачи для канбана ментора: чтобы можно было тестово "подвигать" статусы.
        { id: 'sts-7', studentId: 'u-st-3', taskId: 'task-2b', status: TASK_STATUS.REVISION_REQUESTED, submittedAt: '2026-06-11', acceptedAt: null, lastStatusChangedAt: '2026-06-12', currentVersionId: 'ver-7a', revisionCycles: 1, mentorBonusPoints: 0, autoPoints: 4, totalTaskPoints: 4, isOverdue: false, overdueDays: 0, createdAt: now, updatedAt: now },
        { id: 'sts-8', studentId: 'u-st-4', taskId: 'task-1b', status: TASK_STATUS.PENDING_REVIEW, submittedAt: '2026-06-12', acceptedAt: null, lastStatusChangedAt: '2026-06-12', currentVersionId: 'ver-8a', revisionCycles: 0, mentorBonusPoints: 0, autoPoints: 0, totalTaskPoints: 0, isOverdue: false, overdueDays: 0, createdAt: now, updatedAt: now },
    ],
    submissions: [
        { id: 'sub-1', studentId: 'u-st-1', taskId: 'task-1', currentVersionId: 'ver-2', draftVersionId: null, createdAt: now, updatedAt: now },
        { id: 'sub-1b', studentId: 'u-st-1', taskId: 'task-1b', currentVersionId: 'ver-1b1', draftVersionId: null, createdAt: now, updatedAt: now },
        { id: 'sub-2', studentId: 'u-st-2', taskId: 'task-2', currentVersionId: 'ver-3', draftVersionId: null, createdAt: now, updatedAt: now },
        { id: 'sub-3', studentId: 'u-st-3', taskId: 'task-3', currentVersionId: 'ver-4', draftVersionId: null, createdAt: now, updatedAt: now },
        { id: 'sub-4', studentId: 'u-st-1', taskId: 'task-4', currentVersionId: 'ver-5', draftVersionId: null, createdAt: now, updatedAt: now },
        { id: 'sub-2b', studentId: 'u-st-2', taskId: 'task-2b', currentVersionId: 'ver-2b1', draftVersionId: null, createdAt: now, updatedAt: now },
        { id: 'sub-6', studentId: 'u-st-4', taskId: 'task-6', currentVersionId: 'ver-6a', draftVersionId: null, createdAt: now, updatedAt: now },
        { id: 'sub-7', studentId: 'u-st-3', taskId: 'task-2b', currentVersionId: 'ver-7a', draftVersionId: null, createdAt: now, updatedAt: now },
        { id: 'sub-8', studentId: 'u-st-4', taskId: 'task-1b', currentVersionId: 'ver-8a', draftVersionId: null, createdAt: now, updatedAt: now },
    ],
    submissionVersions: [
        { id: 'ver-1', submissionId: 'sub-1', versionNumber: 1, authorRole: ROLES.STUDENT, textContent: 'Черновик v1', attachments: [], links: [], isDraft: false, isCurrent: false, createdAt: '2026-06-01' },
        { id: 'ver-2', submissionId: 'sub-1', versionNumber: 2, authorRole: ROLES.STUDENT, textContent: 'Обновление v2', attachments: ['scenario.docx'], links: [], isDraft: false, isCurrent: true, createdAt: '2026-06-02' },
        { id: 'ver-1b1', submissionId: 'sub-1b', versionNumber: 1, authorRole: ROLES.STUDENT, textContent: 'Заполнила чек-лист практикума модуля 2, жду проверки.', attachments: [], links: [], isDraft: false, isCurrent: true, createdAt: '2026-06-10' },
        { id: 'ver-3', submissionId: 'sub-2', versionNumber: 1, authorRole: ROLES.STUDENT, textContent: 'Отчет по завтракам', attachments: [], links: ['https://example.com/report'], isDraft: false, isCurrent: true, createdAt: '2026-06-02' },
        { id: 'ver-4', submissionId: 'sub-3', versionNumber: 1, authorRole: ROLES.STUDENT, textContent: 'Ссылка на запись СЗ', attachments: [], links: ['https://example.com/video'], isDraft: false, isCurrent: true, createdAt: '2026-06-28' },
        { id: 'ver-5', submissionId: 'sub-4', versionNumber: 1, authorRole: ROLES.STUDENT, textContent: 'Рефлексия готова', attachments: [], links: [], isDraft: false, isCurrent: true, createdAt: '2026-05-25' },
        { id: 'ver-2b1', submissionId: 'sub-2b', versionNumber: 1, authorRole: ROLES.STUDENT, textContent: 'Черновик анкеты', attachments: [], links: [], isDraft: false, isCurrent: true, createdAt: '2026-06-05' },
        { id: 'ver-6a', submissionId: 'sub-6', versionNumber: 1, authorRole: ROLES.STUDENT, textContent: 'Попытка 1', attachments: [], links: [], isDraft: false, isCurrent: true, createdAt: '2026-05-01' },
        { id: 'ver-7a', submissionId: 'sub-7', versionNumber: 1, authorRole: ROLES.STUDENT, textContent: 'Версия после правок', attachments: [], links: [], isDraft: false, isCurrent: true, createdAt: '2026-06-11' },
        { id: 'ver-8a', submissionId: 'sub-8', versionNumber: 1, authorRole: ROLES.STUDENT, textContent: 'Заполнила чек-лист, жду ревью', attachments: [], links: [], isDraft: false, isCurrent: true, createdAt: '2026-06-12' },
    ],
    statusHistory: [
        { id: 'sh-1', studentId: 'u-st-1', taskId: 'task-1', fromStatus: TASK_STATUS.SUBMITTED, toStatus: TASK_STATUS.PENDING_REVIEW, changedByUserId: 'u-st-1', comment: 'Отправлено', createdAt: '2026-06-02' },
        { id: 'sh-2', studentId: 'u-st-1', taskId: 'task-1', fromStatus: TASK_STATUS.PENDING_REVIEW, toStatus: TASK_STATUS.REVISION_REQUESTED, changedByUserId: 'u-men-1', comment: 'Нужна доработка', createdAt: '2026-06-03' },
        { id: 'sh-3', studentId: 'u-st-1', taskId: 'task-1', fromStatus: TASK_STATUS.REVISION_REQUESTED, toStatus: TASK_STATUS.ACCEPTED, changedByUserId: 'u-men-1', comment: 'Принято после доработок', createdAt: '2026-06-05' },
    ],
    threadMessages: [
        { id: 'tm-1', studentId: 'u-st-1', taskId: 'task-1', authorUserId: 'u-men-1', authorRole: ROLES.MENTOR, messageType: 'comment', text: 'Сильное начало, поправьте структуру.', attachments: [], linkedVersionId: 'ver-2', linkedStatusHistoryId: 'sh-2', isSystem: false, createdAt: '2026-06-03', readBy: ['u-men-1'] },
        { id: 'tm-2', studentId: 'u-st-1', taskId: 'task-1', authorUserId: 'system', authorRole: 'system', messageType: 'status', text: 'Статус изменен: pending_review -> revision_requested', attachments: [], linkedVersionId: null, linkedStatusHistoryId: 'sh-2', isSystem: true, createdAt: '2026-06-03', readBy: [] },
        { id: 'tm-1a', studentId: 'u-st-1', taskId: 'task-1', authorUserId: 'system', authorRole: 'system', messageType: 'status', text: 'Статус изменен: принято', attachments: [], linkedVersionId: null, linkedStatusHistoryId: 'sh-3', isSystem: true, createdAt: '2026-06-05', readBy: [] },
        { id: 'tm-3', studentId: 'u-st-1', taskId: 'task-4', authorUserId: 'u-men-1', authorRole: ROLES.MENTOR, messageType: 'mentor_review', text: 'Принято, сильная рефлексия.', attachments: [], linkedVersionId: 'ver-5', linkedStatusHistoryId: null, isSystem: false, createdAt: '2026-05-28', readBy: ['u-men-1'] },
        { id: 'tm-4', studentId: 'u-st-1', taskId: 'task-4', authorUserId: 'system', authorRole: 'system', messageType: 'status', text: 'Статус изменен на принято', attachments: [], linkedVersionId: null, linkedStatusHistoryId: null, isSystem: true, createdAt: '2026-05-28', readBy: [] },
    ],
    mentorMeetings: [
        { id: 'mm-1', cohortId: 'cohort-2026-1', studentId: 'u-st-1', mentorId: 'u-men-1', weekNumber: 6, title: 'Практикум модуля 2', focus: 'Фокус на КТ4-6', scheduledAt: '2026-06-01T18:00:00.000Z', happenedAt: null, status: MEETING_STATUS.SCHEDULED, reflectionStatus: REFLECTION_STATUS.PENDING, linkedTaskId: 'task-1', note: '', createdAt: now, updatedAt: now },
    ],
    /** Единый календарь курса ПВЛ: управление только из учительской. */
    calendarEvents: [
        {
            id: 'pvl-cal-1',
            title: 'Практикум с менторами (модуль 2)',
            description: 'Разбор кейсов и вопросы по КТ.',
            eventType: 'mentor_meeting',
            startAt: '2026-06-05T15:00:00.000Z',
            endAt: '2026-06-05T16:30:00.000Z',
            date: '2026-06-05',
            linkedLessonId: null,
            linkedPracticumId: 'mm-1',
            visibilityRole: 'all',
            cohortId: 'cohort-2026-1',
            colorToken: 'mentor_meeting',
            createdBy: 'u-adm-1',
            createdAt: now,
            updatedAt: now,
        },
        {
            id: 'pvl-cal-2',
            title: 'Прямой эфир методиста',
            description: 'Ответы на вопросы потока.',
            eventType: 'live_stream',
            startAt: '2026-06-08T17:00:00.000Z',
            endAt: '2026-06-08T18:00:00.000Z',
            date: '2026-06-08',
            linkedLessonId: null,
            linkedPracticumId: null,
            visibilityRole: 'all',
            cohortId: 'cohort-2026-1',
            colorToken: 'live_stream',
            createdBy: 'u-adm-1',
            createdAt: now,
            updatedAt: now,
        },
        {
            id: 'pvl-cal-3',
            title: 'Выход материалов: урок модуля 2',
            description: 'Обновление урока и связанных шагов в трекере.',
            eventType: 'lesson_release',
            startAt: '2026-06-04T09:00:00.000Z',
            endAt: '2026-06-04T10:00:00.000Z',
            date: '2026-06-04',
            linkedLessonId: 'les-7',
            linkedPracticumId: null,
            visibilityRole: 'student',
            cohortId: 'cohort-2026-1',
            colorToken: 'lesson_release',
            createdBy: 'u-adm-1',
            createdAt: now,
            updatedAt: now,
        },
    ],
    libraryItems: [
        { id: 'lib-1', title: 'Доказательная база', description: 'Научные источники', category: 'доказательная база', contentType: 'pdf', duration: '15 мин', progressEnabled: true, createdAt: now, updatedAt: now },
    ],
    contentItems: [
        { id: 'cnt-1', title: 'Стартовый онбординг', shortDescription: 'Материал старта', fullDescription: 'Размещается в разделе О курсе', contentType: CONTENT_TYPE.VIDEO, status: CONTENT_STATUS.PUBLISHED, visibility: 'by_cohort', attachments: [], externalLinks: [], coverImage: '', estimatedDuration: '18 мин', createdBy: 'u-adm-1', createdAt: now, updatedAt: now },
        { id: 'cnt-2', title: 'Сценарий для ментора', shortDescription: 'Шаблон практикума', fullDescription: 'Для раздела Практикумы', contentType: CONTENT_TYPE.TEMPLATE, status: CONTENT_STATUS.DRAFT, visibility: 'by_role', attachments: [], externalLinks: [], coverImage: '', estimatedDuration: '20 мин', createdBy: 'u-adm-1', createdAt: now, updatedAt: now },
        { id: 'cnt-lib-01', title: 'Письмо и эмоции: механизмы и нюансы', shortDescription: 'Механизмы влияния письма на эмоциональную регуляцию.', fullDescription: `<pre style="white-space:pre-wrap">Письменные практики, в частности экспрессивное письмо, помогают в работе с эмоциями через ключевые психологические и физиологические механизмы.

1) Когнитивная обработка и структура
- перевод хаотичного опыта в связный нарратив;
- осмысление через причинно-следственные связи;
- завершение переработки за счёт компактной истории.

2) Эмоциональная регуляция
- снижение руминации;
- эффект экспозиции (привыкание);
- уменьшение напряжения от подавления эмоций.

3) Освобождение когнитивных ресурсов
Навязчивые мысли занимают рабочую память; письмо помогает освободить внимание.

4) Улучшения при регулярной практике
- снижение тревоги и депрессивных симптомов;
- улучшение самочувствия и устойчивости;
- позитивные поведенческие эффекты.

Нюанс: краткосрочный дискомфорт после письма возможен и считается нормальным.</pre>`, contentType: CONTENT_TYPE.TEXT, status: CONTENT_STATUS.PUBLISHED, visibility: 'by_cohort', attachments: [], externalLinks: [], coverImage: '', estimatedDuration: '12 мин', categoryId: 'writing_research', categoryTitle: 'Исследования о письменных практиках', createdBy: 'u-adm-1', createdAt: now, updatedAt: now },
        { id: 'cnt-lib-02', title: 'Встречи с письменными практиками: групповой эффект', shortDescription: 'Как группа усиливает эффект индивидуального письма.', fullDescription: `<pre style="white-space:pre-wrap">Групповой формат усиливает эффект письменных практик за счёт реляционного компонента.

Ключевые эффекты:
- самоисследование через обратную связь;
- видение инаковости и развитие эмпатии;
- формирование общности и снижения изоляции.

Диалог в группе:
- внешний диалог влияет на внутренний;
- смыслы формируются в совместном обсуждении.

Практический результат:
- нормализация чувств;
- безопасная среда для уязвимости;
- поддержание дисциплины за счёт ритуала встреч.</pre>`, contentType: CONTENT_TYPE.TEXT, status: CONTENT_STATUS.PUBLISHED, visibility: 'by_cohort', attachments: [], externalLinks: [], coverImage: '', estimatedDuration: '10 мин', categoryId: 'writing_research', categoryTitle: 'Исследования о письменных практиках', createdBy: 'u-adm-1', createdAt: now, updatedAt: now },
        { id: 'cnt-lib-03', title: 'Терапевтический дневник: форматы и приватность', shortDescription: 'Форматы дневника и почему конфиденциальность критична.', fullDescription: `<pre style="white-space:pre-wrap">Терапевтический эффект возникает не от количества текста, а от качества переработки опыта.

Рабочие форматы:
- экспрессивное письмо (для стрессовых и трудных переживаний);
- позитивное письмо (для ресурса и устойчивости);
- best possible self (образ желаемого будущего).

Что важно:
- приватность повышает эффективность;
- простое перечисление фактов без рефлексии даёт слабый эффект;
- допустимы аудио/видеодневники при сохранении искренности.

Практика: 15–20 минут, в безопасном месте, без цензуры и ожидания чужой оценки.</pre>`, contentType: CONTENT_TYPE.TEXT, status: CONTENT_STATUS.PUBLISHED, visibility: 'by_cohort', attachments: [], externalLinks: [], coverImage: '', estimatedDuration: '11 мин', categoryId: 'writing_research', categoryTitle: 'Исследования о письменных практиках', createdBy: 'u-adm-1', createdAt: now, updatedAt: now },
        { id: 'cnt-lib-04', title: 'Пять практик для новичка', shortDescription: 'Базовые форматы письменных практик с быстрым стартом.', fullDescription: `<pre style="white-space:pre-wrap">5 форматов для старта:
1. Экспрессивное письмо (15–20 минут, 3–4 дня).
2. Позитивное письмо (в том числе ультракороткие сессии).
3. Лучшая возможная версия себя.
4. Письма другим (без обязательной отправки).
5. Анализ личного успеха.

Общий принцип: глубина и регулярность важнее объёма. Приватность — обязательное условие.</pre>`, contentType: CONTENT_TYPE.TEXT, status: CONTENT_STATUS.PUBLISHED, visibility: 'by_cohort', attachments: [], externalLinks: [], coverImage: '', estimatedDuration: '8 мин', categoryId: 'writing_research', categoryTitle: 'Исследования о письменных практиках', createdBy: 'u-adm-1', createdAt: now, updatedAt: now },
        { id: 'cnt-lib-05', title: 'Доказательная база: уровни надёжности', shortDescription: 'Что подтверждено сильно, средне и где зона риска.', fullDescription: `<pre style="white-space:pre-wrap">Высокая надёжность:
- улучшения для здоровых людей и при умеренном стрессе;
- важны связная история и приватность.

Средняя надёжность:
- эффекты зависят от особенностей участника;
- позитивное письмо может быть равноэффективной альтернативой.

Низкая надёжность/риски:
- тяжёлые клинические состояния без сопровождения;
- свежее горе;
- катарсис без осмысления.</pre>`, contentType: CONTENT_TYPE.TEXT, status: CONTENT_STATUS.PUBLISHED, visibility: 'by_cohort', attachments: [], externalLinks: [], coverImage: '', estimatedDuration: '9 мин', categoryId: 'writing_research', categoryTitle: 'Исследования о письменных практиках', createdBy: 'u-adm-1', createdAt: now, updatedAt: now },
        { id: 'cnt-lib-06', title: 'Механизмы действия и таблица «задача — формат»', shortDescription: 'Когнитивные механизмы и подбор практики под задачу.', fullDescription: `<pre style="white-space:pre-wrap">Ключевые механизмы:
- когнитивная переработка;
- эмоциональная регуляция;
- психологическое дистанцирование;
- смыслообразование;
- освобождение рабочей памяти.

Таблица «задача → формат»:
- стресс: EW / positive writing / планирование;
- разгрузка: письмо перед событием / транзакционное;
- решения: структурированная рефлексия (DIEP), CEW;
- фокус: письмо об успехе, mindful writing;
- восстановление: связный нарратив + дистанцирование.</pre>`, contentType: CONTENT_TYPE.TEXT, status: CONTENT_STATUS.PUBLISHED, visibility: 'by_cohort', attachments: [], externalLinks: [], coverImage: '', estimatedDuration: '10 мин', categoryId: 'writing_research', categoryTitle: 'Исследования о письменных практиках', createdBy: 'u-adm-1', createdAt: now, updatedAt: now },
        { id: 'cnt-lib-07', title: 'Техника безопасности и красные флаги', shortDescription: 'Когда снижать интенсивность и когда направлять к специалисту.', fullDescription: `<pre style="white-space:pre-wrap">Критические противопоказания:
- свежая травма (&lt; 4 недель),
- тяжёлая депрессия,
- тяжёлый ПТСР без сопровождения.

Красные флаги:
- эмоциональное затопление;
- застревание в руминации;
- сильное сопротивление;
- ухудшение состояния на дни.

Рекомендации ведущей:
- право «стоп»;
- структурированные форматы (CEW) вместо свободного погружения;
- микродозирование и позитивные варианты;
- направление к специалисту при стойком ухудшении.</pre>`, contentType: CONTENT_TYPE.TEXT, status: CONTENT_STATUS.PUBLISHED, visibility: 'by_cohort', attachments: [], externalLinks: [], coverImage: '', estimatedDuration: '9 мин', categoryId: 'writing_research', categoryTitle: 'Исследования о письменных практиках', createdBy: 'u-adm-1', createdAt: now, updatedAt: now },
        { id: 'cnt-lib-08', title: 'Мифы о письменных практиках', shortDescription: 'Частые заблуждения и как объяснять участницам.', fullDescription: `<pre style="white-space:pre-wrap">Разобраны мифы:
1) «Достаточно выплеснуть эмоции» — нет, нужна когнитивная переработка.
2) «Работает только через травму» — нет, позитивное письмо тоже эффективно.
3) «Нужно писать часами» — нет, возможны короткие протоколы.
4) «Текст обязательно должен кто-то читать» — нет, приватность повышает эффект.
5) «Сразу станет легче» — возможен кратковременный дискомфорт.
6) «Польза только через смену привычек» — есть прямой психофизиологический эффект.</pre>`, contentType: CONTENT_TYPE.TEXT, status: CONTENT_STATUS.PUBLISHED, visibility: 'by_cohort', attachments: [], externalLinks: [], coverImage: '', estimatedDuration: '8 мин', categoryId: 'writing_research', categoryTitle: 'Исследования о письменных практиках', createdBy: 'u-adm-1', createdAt: now, updatedAt: now },
        { id: 'cnt-lib-09', title: 'Протокол для специалистов: смысл и типология EW/CEW', shortDescription: 'Методологический протокол для ведущих и специалистов.', fullDescription: `<pre style="white-space:pre-wrap">Протокол для специалистов:
- опора на эвдемоническое благополучие и поиск смысла;
- различение EW (выражение) и CEW (осмысление + дистанцирование);
- модель A-to-D: перевод хаоса опыта в структурированный текст;
- обязательные правила безопасности и скрининга;
- алгоритм сессии: настройка → инструкция → письмо → метарефлексия.

Практический вывод:
письмо — не «исповедь», а технология сборки личного нарратива и устойчивой рефлексии.</pre>`, contentType: CONTENT_TYPE.TEXT, status: CONTENT_STATUS.PUBLISHED, visibility: 'by_cohort', attachments: [], externalLinks: [], coverImage: '', estimatedDuration: '12 мин', categoryId: 'writing_research', categoryTitle: 'Исследования о письменных практиках', createdBy: 'u-adm-1', createdAt: now, updatedAt: now },
        { id: 'cnt-lib-10', title: 'Техника безопасности при работе с письменными практиками', shortDescription: 'Расширенные рекомендации по безопасности для ведущих.', fullDescription: `<pre style="white-space:pre-wrap">Дополнительные рекомендации к технике безопасности:
- главный ориентир: практика должна «собирать», а не «расшатывать»;
- противопоказания для самостоятельной глубокой практики;
- подготовка пространства, времени и поддержки;
- жёсткое правило приватности текста;
- шкала дистресса 0–10 и выбор интенсивности формата;
- ресурсные упражнения до и после сложных тем;
- принцип «НЕ НАСИЛУЙТЕ СЕБЯ».

Это расширение к уроку по безопасности, с акцентом на действия ведущей.</pre>`, contentType: CONTENT_TYPE.TEXT, status: CONTENT_STATUS.PUBLISHED, visibility: 'by_cohort', attachments: [], externalLinks: [], coverImage: '', estimatedDuration: '11 мин', categoryId: 'safety', categoryTitle: 'Техника безопасности', createdBy: 'u-adm-1', createdAt: now, updatedAt: now },
        { id: 'cnt-lib-11', title: 'Семь мифов о письменных практиках: полный разбор для ведущей', shortDescription: 'Полная версия разбора мифов с готовыми формулировками для гостий.', fullDescription: `<pre style="white-space:pre-wrap">Полный разбор 7 мифов:
1) «Не умею красиво писать»;
2) «Главное — выплеснуть»;
3) «Работает только через негатив»;
4) «Нужно писать часами»;
5) «Текст должен кто-то прочитать»;
6) «После практики сразу станет легко»;
7) «Письмо помогает только через смену привычек».

Материал содержит готовые объяснения для ведущей в разговоре с участницами.</pre>`, contentType: CONTENT_TYPE.TEXT, status: CONTENT_STATUS.PUBLISHED, visibility: 'by_cohort', attachments: [], externalLinks: [], coverImage: '', estimatedDuration: '10 мин', categoryId: 'myths', categoryTitle: 'Мифы и объяснения', createdBy: 'u-adm-1', createdAt: now, updatedAt: now },
        { id: 'cnt-glo-01', title: 'Глоссарий курса', shortDescription: 'Базовые термины курса ПВЛ.', fullDescription: `<h3>Термины курса</h3>
<table>
  <thead>
    <tr><th>Термин</th><th>Расшифровка</th></tr>
  </thead>
  <tbody>
    <tr><td>Артефакт встречи</td><td>То, что остается у участницы после встречи (и то, что можно потрогать/пощупать) - списки, планы, шаги.</td></tr>
    <tr><td>Встреча с письменными практиками</td><td>Групповой формат с доминированием письма и тишины (соотношение письма и разговоров - 70/30), не лекция и не терапия. Встреча - это совокупность письменных практик, выстроенных в определенной структуре. Письменная практика - это одна часть встречи. Мы - ведущие встреч с письменными практиками. Неверно: ведущие письменных практик, приглашаю вас на письменную практику.</td></tr>
    <tr><td>Жизненный цикл встречи</td><td>От идеи и анонса до пост-промо и следующего шага.</td></tr>
    <tr><td>Завтрак</td><td>Устоявшееся название формата встречи в сообществе.</td></tr>
    <tr><td>Инструкция к практике</td><td>Объяснение того, как будет выполняться практика: короткая, &lt;=30 слов, ясные шаги и пример того, как будет выглядеть результат.</td></tr>
    <tr><td>Кейс</td><td>Ситуация из практики ведущих Лиги, обычно поделена на две части: что происходило и как поступила ведущая.</td></tr>
    <tr><td>Намерения</td><td>2-3 конкретных шага после встречи у каждой участницы.</td></tr>
    <tr><td>Настройка</td><td>Вход в тему: заземление, дыхание, короткая медитация и т.п.</td></tr>
    <tr><td>Писательские практики</td><td>Практики, которые подходят начинающим писателям. Важно не путать письменные и писательские практики.</td></tr>
    <tr><td>Правило «стоп»</td><td>Право не продолжать тему / не делиться текстом.</td></tr>
    <tr><td>Результат встречи</td><td>Замысел: что участницы уносят (инсайт, ясность, шаги, состояние) - не дублируем отдельными терминами «смысловой/физический».</td></tr>
    <tr><td>Рефлексивный отклик</td><td>Осмысление после практики (письменно / в паре / в кругу).</td></tr>
    <tr><td>Руминация</td><td>Повторяющееся, навязчивое прокручивание в голове тревожных или неприятных мыслей, воспоминаний и переживаний «по кругу», без движения к решению или ясности.</td></tr>
    <tr><td>Сборный завтрак</td><td>Практикум: части встречи ведут ученицы по очереди, остальные - гости.</td></tr>
    <tr><td>Сертификационный завтрак (СЗ)</td><td>Финальная встреча для проверки соответствия стандарту; запись, самооценка, оценка ментора.</td></tr>
    <tr><td>Сценарий встречи</td><td>Пошаговый план встречи: вход -&gt; настройка -&gt; цепочка практик -&gt; рефлексивный отклик -&gt; шеринг -&gt; завершение.</td></tr>
    <tr><td>Техника безопасности</td><td>Правила для ведущей и группы: на что необходимо обращать внимание, границы роли ведущей.</td></tr>
    <tr><td>Тренировочный завтрак</td><td>Полная встреча по критериям сертификационного завтрака с разбором ментора.</td></tr>
    <tr><td>Шеринг</td><td>Этап, на котором участницы по очереди делятся устно тем, что написали, или своим откликом на практику - по желанию и в рамках правил безопасности. Выполняется по желанию, в кругу или в малых группах, с уважением к таймингу. Шеринг - не лекция и не групповая терапия: ведущая не комментирует личное содержание как эксперт, а держит формат, время и безопасное пространство.</td></tr>
  </tbody>
</table>`, contentType: CONTENT_TYPE.TEXT, status: CONTENT_STATUS.PUBLISHED, visibility: 'by_cohort', attachments: [], externalLinks: [], coverImage: '', estimatedDuration: '9 мин', createdBy: 'u-adm-1', createdAt: now, updatedAt: now },
    ],
    contentPlacements: [
        { id: 'pl-1', contentItemId: 'cnt-1', targetSection: 'about', targetRole: ROLES.STUDENT, cohortId: 'cohort-2026-1', weekNumber: 0, moduleNumber: 0, orderIndex: 1, isPublished: true, createdAt: now, updatedAt: now },
        { id: 'pl-2', contentItemId: 'cnt-1', targetSection: 'library', targetRole: ROLES.STUDENT, cohortId: 'cohort-2026-1', weekNumber: 1, moduleNumber: 1, orderIndex: 2, isPublished: true, createdAt: now, updatedAt: now },
        { id: 'pl-3', contentItemId: 'cnt-2', targetSection: 'practicums', targetRole: ROLES.MENTOR, cohortId: 'cohort-2026-1', weekNumber: 6, moduleNumber: 2, orderIndex: 1, isPublished: false, createdAt: now, updatedAt: now },
        { id: 'pl-4', contentItemId: 'cnt-1', targetSection: 'certification', targetRole: ROLES.STUDENT, cohortId: 'cohort-2026-1', weekNumber: 10, moduleNumber: 3, orderIndex: 1, isPublished: true, createdAt: now, updatedAt: now },
        { id: 'pl-5', contentItemId: 'cnt-1', targetSection: 'cultural_code', targetRole: ROLES.STUDENT, cohortId: 'cohort-2026-1', weekNumber: 0, moduleNumber: 0, orderIndex: 1, isPublished: true, createdAt: now, updatedAt: now },
        { id: 'pl-lib-01', contentItemId: 'cnt-lib-01', targetSection: 'library', targetRole: 'both', cohortId: 'cohort-2026-1', weekNumber: 0, moduleNumber: 0, orderIndex: 101, isPublished: true, createdAt: now, updatedAt: now },
        { id: 'pl-lib-02', contentItemId: 'cnt-lib-02', targetSection: 'library', targetRole: 'both', cohortId: 'cohort-2026-1', weekNumber: 0, moduleNumber: 0, orderIndex: 102, isPublished: true, createdAt: now, updatedAt: now },
        { id: 'pl-lib-03', contentItemId: 'cnt-lib-03', targetSection: 'library', targetRole: 'both', cohortId: 'cohort-2026-1', weekNumber: 0, moduleNumber: 0, orderIndex: 103, isPublished: true, createdAt: now, updatedAt: now },
        { id: 'pl-lib-04', contentItemId: 'cnt-lib-04', targetSection: 'library', targetRole: 'both', cohortId: 'cohort-2026-1', weekNumber: 0, moduleNumber: 0, orderIndex: 104, isPublished: true, createdAt: now, updatedAt: now },
        { id: 'pl-lib-05', contentItemId: 'cnt-lib-05', targetSection: 'library', targetRole: 'both', cohortId: 'cohort-2026-1', weekNumber: 0, moduleNumber: 0, orderIndex: 105, isPublished: true, createdAt: now, updatedAt: now },
        { id: 'pl-lib-06', contentItemId: 'cnt-lib-06', targetSection: 'library', targetRole: 'both', cohortId: 'cohort-2026-1', weekNumber: 0, moduleNumber: 0, orderIndex: 106, isPublished: true, createdAt: now, updatedAt: now },
        { id: 'pl-lib-07', contentItemId: 'cnt-lib-07', targetSection: 'library', targetRole: 'both', cohortId: 'cohort-2026-1', weekNumber: 0, moduleNumber: 0, orderIndex: 107, isPublished: true, createdAt: now, updatedAt: now },
        { id: 'pl-lib-08', contentItemId: 'cnt-lib-08', targetSection: 'library', targetRole: 'both', cohortId: 'cohort-2026-1', weekNumber: 0, moduleNumber: 0, orderIndex: 108, isPublished: true, createdAt: now, updatedAt: now },
        { id: 'pl-lib-09', contentItemId: 'cnt-lib-09', targetSection: 'library', targetRole: 'both', cohortId: 'cohort-2026-1', weekNumber: 0, moduleNumber: 0, orderIndex: 109, isPublished: true, createdAt: now, updatedAt: now },
        { id: 'pl-lib-10', contentItemId: 'cnt-lib-10', targetSection: 'library', targetRole: 'both', cohortId: 'cohort-2026-1', weekNumber: 0, moduleNumber: 0, orderIndex: 110, isPublished: true, createdAt: now, updatedAt: now },
        { id: 'pl-lib-11', contentItemId: 'cnt-lib-11', targetSection: 'library', targetRole: 'both', cohortId: 'cohort-2026-1', weekNumber: 0, moduleNumber: 0, orderIndex: 111, isPublished: true, createdAt: now, updatedAt: now },
        { id: 'pl-glo-01', contentItemId: 'cnt-glo-01', targetSection: 'glossary', targetRole: 'both', cohortId: 'cohort-2026-1', weekNumber: 0, moduleNumber: 0, orderIndex: 1, isPublished: true, createdAt: now, updatedAt: now },
    ],
    certificationProgress: [
        { id: 'cert-1', studentId: 'u-st-1', guestPlanStatus: 'in_progress', trialBreakfastStatus: 'pending', szRecordingStatus: 'not_started', szSelfAssessmentStatus: 'not_started', szMentorAssessmentStatus: 'not_started', certificationPackageStatus: 'not_started', admissionStatus: CERTIFICATION_STATUS.IN_PROGRESS, redFlags: [], deadlineAt: SCORE_RULES.SZ_RECORDING_DEADLINE, createdAt: now, updatedAt: now },
        { id: 'cert-2', studentId: 'u-st-2', guestPlanStatus: 'pending', trialBreakfastStatus: 'pending', szRecordingStatus: 'not_started', szSelfAssessmentStatus: 'in_progress', szMentorAssessmentStatus: 'not_started', certificationPackageStatus: 'not_started', admissionStatus: CERTIFICATION_STATUS.READY_FOR_REVIEW, redFlags: [], deadlineAt: SCORE_RULES.SZ_RECORDING_DEADLINE, createdAt: now, updatedAt: now },
        { id: 'cert-3', studentId: 'u-st-3', guestPlanStatus: 'done', trialBreakfastStatus: 'done', szRecordingStatus: 'done', szSelfAssessmentStatus: 'in_progress', szMentorAssessmentStatus: 'pending', certificationPackageStatus: 'in_progress', admissionStatus: CERTIFICATION_STATUS.RED_FLAG, redFlags: ['Нет сертификационного пакета'], deadlineAt: SCORE_RULES.SZ_RECORDING_DEADLINE, createdAt: now, updatedAt: now },
        { id: 'cert-4', studentId: 'u-st-4', guestPlanStatus: 'not_started', trialBreakfastStatus: 'not_started', szRecordingStatus: 'not_started', szSelfAssessmentStatus: 'not_started', szMentorAssessmentStatus: 'not_started', certificationPackageStatus: 'not_started', admissionStatus: CERTIFICATION_STATUS.NOT_STARTED, redFlags: [], deadlineAt: SCORE_RULES.SZ_RECORDING_DEADLINE, createdAt: now, updatedAt: now },
    ],
    deadlineRisks: [
        { id: 'risk-2', studentId: 'u-st-2', relatedTaskId: 'task-2', relatedControlPointId: 'cp-6', relatedMeetingId: null, riskType: 'anti_debt_d3', riskLevel: RISK_LEVEL.MEDIUM, title: 'Антидолг D+3', description: 'Требуется проверка реакции', daysOverdue: 3, recommendedAction: 'Уточнить план досдачи', isResolved: false, createdAt: now, updatedAt: now },
        { id: 'risk-4a', studentId: 'u-st-4', relatedTaskId: 'task-5', relatedControlPointId: null, relatedMeetingId: null, riskType: 'deadline_overdue', riskLevel: RISK_LEVEL.HIGH, title: 'Просрочка домашки модуля 1', description: 'Нет сдачи', daysOverdue: 18, recommendedAction: 'Связаться с менти', isResolved: false, createdAt: now, updatedAt: now },
        { id: 'risk-4b', studentId: 'u-st-4', relatedTaskId: 'task-6', relatedControlPointId: null, relatedMeetingId: null, riskType: 'deadline_overdue', riskLevel: RISK_LEVEL.MEDIUM, title: 'Доработка просрочена', description: 'Долго на доработке', daysOverdue: 28, recommendedAction: 'Проверить план', isResolved: false, createdAt: now, updatedAt: now },
    ],
    dashboardWidgets: DEFAULT_WIDGETS,
    directMessages: [
        {
            id: 'dm-1',
            mentorId: 'u-men-1',
            studentId: 'u-st-1',
            authorUserId: 'u-men-1',
            text: 'Привет! Если нужно, разберем черновик до отправки.',
            createdAt: '2026-06-01T10:15:00.000Z',
            updatedAt: '2026-06-01T10:15:00.000Z',
        },
        {
            id: 'dm-2',
            mentorId: 'u-men-1',
            studentId: 'u-st-1',
            authorUserId: 'u-st-1',
            text: 'Да, спасибо! Отправлю новую версию вечером.',
            createdAt: '2026-06-01T10:27:00.000Z',
            updatedAt: '2026-06-01T10:27:00.000Z',
        },
        {
            id: 'dm-3',
            mentorId: 'u-men-1',
            studentId: 'u-st-2',
            authorUserId: 'u-st-2',
            text: 'Подскажите, пожалуйста, что поправить в структуре сценария.',
            createdAt: '2026-06-02T08:40:00.000Z',
            updatedAt: '2026-06-02T08:40:00.000Z',
        },
    ],
    faqItems: [
        { id: 'faq-1', title: 'Как получить баллы?', answer: 'Закрывать модули, КТ и сдавать в срок.', targetRole: ROLES.STUDENT, orderIndex: 1 },
        { id: 'faq-2', title: 'Где комментарии ментора?', answer: 'В разделе Результаты и карточке задания.', targetRole: ROLES.STUDENT, orderIndex: 2 },
    ],
    emailTemplates: [
        { id: 'et-1', code: 'mentor_comment', subject: 'Новый комментарий ментора', body: 'Проверьте карточку задания.', targetRole: ROLES.STUDENT, isEnabled: true },
    ],
    studentPoints: [
        { id: 'pts-1', studentId: 'u-st-1', coursePointsTotal: 0, week0Points: 0, weeksPoints: 0, controlPointsTotal: 0, mentorBonusTotal: 0, szSelfAssessmentTotal: 0, szMentorAssessmentTotal: 0, updatedAt: now },
        { id: 'pts-2', studentId: 'u-st-2', coursePointsTotal: 0, week0Points: 0, weeksPoints: 0, controlPointsTotal: 0, mentorBonusTotal: 0, szSelfAssessmentTotal: 0, szMentorAssessmentTotal: 0, updatedAt: now },
        { id: 'pts-3', studentId: 'u-st-3', coursePointsTotal: 0, week0Points: 0, weeksPoints: 0, controlPointsTotal: 0, mentorBonusTotal: 0, szSelfAssessmentTotal: 0, szMentorAssessmentTotal: 0, updatedAt: now },
        { id: 'pts-4', studentId: 'u-st-4', coursePointsTotal: 0, week0Points: 0, weeksPoints: 0, controlPointsTotal: 0, mentorBonusTotal: 0, szSelfAssessmentTotal: 0, szMentorAssessmentTotal: 0, updatedAt: now },
    ],
    weekCompletionState: [
        ...rangeClosedWeeks('u-st-1', 0, 5),
        ...rangeClosedWeeks('u-st-2', 0, 3),
        ...rangeClosedWeeks('u-st-3', 0, 10),
        mkWeekCompletion('u-st-4', 0, true),
    ],
    controlPointState: [
        mkCpState('cps-1-1', 'u-st-1', 'cp-1'),
        mkCpState('cps-1-2', 'u-st-1', 'cp-2'),
        mkCpState('cps-1-3', 'u-st-1', 'cp-3'),
        mkCpState('cps-2-1', 'u-st-2', 'cp-1'),
        mkCpState('cps-2-2', 'u-st-2', 'cp-2'),
        ...['cp-1', 'cp-2', 'cp-3', 'cp-4', 'cp-5', 'cp-6', 'cp-7', 'cp-8'].map((cpid, i) => mkCpState(`cps-3-${i}`, 'u-st-3', cpid)),
    ],
    mentorBonusEvents: [
        { id: 'mbe-1a', studentId: 'u-st-1', mentorId: 'u-men-1', relatedTaskId: 'task-4', points: 10, reason: 'Сильная рефлексия', createdAt: now },
        { id: 'mbe-2a', studentId: 'u-st-2', mentorId: 'u-men-1', relatedTaskId: 'task-2', points: 8, reason: 'За активность', createdAt: now },
        { id: 'mbe-2b', studentId: 'u-st-2', mentorId: 'u-men-1', relatedTaskId: 'task-2b', points: 7, reason: 'Частичный бонус', createdAt: now },
        { id: 'mbe-3a', studentId: 'u-st-3', mentorId: 'u-men-2', relatedTaskId: 'task-3', points: 20, reason: 'Пакет КТ', createdAt: now },
        { id: 'mbe-3b', studentId: 'u-st-3', mentorId: 'u-men-2', relatedTaskId: 'task-3', points: 25, reason: 'Доп. бонус', createdAt: now },
    ],
    szAssessmentState: [
        { id: 'sz-1', studentId: 'u-st-1', selfAssessmentPoints: 0, mentorAssessmentPoints: 0, selfAssessmentCriticalCount: 0, redFlags: [], comparedAt: null, finalStatus: 'not_started', selfAssessmentSubmittedAt: null },
        { id: 'sz-2', studentId: 'u-st-2', selfAssessmentPoints: 12, mentorAssessmentPoints: 0, selfAssessmentCriticalCount: 0, redFlags: [], comparedAt: null, finalStatus: 'in_progress', selfAssessmentSubmittedAt: null },
        { id: 'sz-3', studentId: 'u-st-3', selfAssessmentPoints: 41, mentorAssessmentPoints: 28, selfAssessmentCriticalCount: 1, redFlags: ['Нет сертификационного пакета'], comparedAt: '2026-06-28', finalStatus: 'red_flag', selfAssessmentSubmittedAt: '2026-06-27' },
        { id: 'sz-4', studentId: 'u-st-4', selfAssessmentPoints: 0, mentorAssessmentPoints: 0, selfAssessmentCriticalCount: 0, redFlags: [], comparedAt: null, finalStatus: 'not_started', selfAssessmentSubmittedAt: null },
    ],
    pointsHistory: [],
};
