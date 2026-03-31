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

export const seed = {
    users: [
        { id: 'u-st-1', role: ROLES.STUDENT, fullName: 'Анна Лаврова', email: 'anna@example.com', avatar: '', isActive: true, createdAt: now, updatedAt: now },
        { id: 'u-st-2', role: ROLES.STUDENT, fullName: 'Мария Иванова', email: 'maria@example.com', avatar: '', isActive: true, createdAt: now, updatedAt: now },
        { id: 'u-st-3', role: ROLES.STUDENT, fullName: 'Екатерина Смирнова', email: 'katya@example.com', avatar: '', isActive: true, createdAt: now, updatedAt: now },
        { id: 'u-men-1', role: ROLES.MENTOR, fullName: 'Елена Ментор', email: 'mentor1@example.com', avatar: '', isActive: true, createdAt: now, updatedAt: now },
        { id: 'u-men-2', role: ROLES.MENTOR, fullName: 'Ольга Куратор', email: 'mentor2@example.com', avatar: '', isActive: true, createdAt: now, updatedAt: now },
        { id: 'u-adm-1', role: ROLES.ADMIN, fullName: 'Админ Платформы', email: 'admin@example.com', avatar: '', isActive: true, createdAt: now, updatedAt: now },
    ],
    cohorts: [
        { id: 'cohort-2026-1', title: 'ПВЛ 2026 · Поток 1', startDate: '2026-04-15', endDate: '2026-07-14', week0Start: '2026-04-15', week1Start: '2026-04-22', status: 'active', createdAt: now, updatedAt: now },
        { id: 'cohort-2026-2', title: 'ПВЛ 2026 · Поток 2', startDate: '2026-08-01', endDate: '2026-11-01', week0Start: '2026-08-01', week1Start: '2026-08-08', status: 'planned', createdAt: now, updatedAt: now },
    ],
    studentProfiles: [
        { id: 'sp-1', userId: 'u-st-1', cohortId: 'cohort-2026-1', mentorId: 'u-men-1', currentWeek: 6, currentModule: 2, courseStatus: COURSE_STATUS.ACTIVE, coursePoints: 248, szSelfAssessmentPoints: 0, szMentorAssessmentPoints: 0, szAdmissionStatus: CERTIFICATION_STATUS.IN_PROGRESS, lastActivityAt: '2026-06-02', unreadCount: 2, createdAt: now, updatedAt: now },
        { id: 'sp-2', userId: 'u-st-2', cohortId: 'cohort-2026-1', mentorId: 'u-men-1', currentWeek: 8, currentModule: 3, courseStatus: COURSE_STATUS.AT_RISK, coursePoints: 196, szSelfAssessmentPoints: 12, szMentorAssessmentPoints: 0, szAdmissionStatus: CERTIFICATION_STATUS.READY_FOR_REVIEW, lastActivityAt: '2026-06-14', unreadCount: 0, createdAt: now, updatedAt: now },
        { id: 'sp-3', userId: 'u-st-3', cohortId: 'cohort-2026-1', mentorId: 'u-men-2', currentWeek: 10, currentModule: 4, courseStatus: COURSE_STATUS.ACTIVE, coursePoints: 332, szSelfAssessmentPoints: 41, szMentorAssessmentPoints: 28, szAdmissionStatus: CERTIFICATION_STATUS.RED_FLAG, lastActivityAt: '2026-06-28', unreadCount: 1, createdAt: now, updatedAt: now },
    ],
    mentorProfiles: [
        { id: 'mp-1', userId: 'u-men-1', cohortIds: ['cohort-2026-1'], menteeIds: ['u-st-1', 'u-st-2'], activeReviewCount: 5, activeRiskCount: 2, createdAt: now, updatedAt: now },
        { id: 'mp-2', userId: 'u-men-2', cohortIds: ['cohort-2026-1'], menteeIds: ['u-st-3'], activeReviewCount: 1, activeRiskCount: 1, createdAt: now, updatedAt: now },
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
        title: `Неделя ${w.weekNumber}`,
        artifactTitle: w.weekNumber === 0 ? 'Стартовый маршрут' : `Артефакт недели ${w.weekNumber}`,
        mentorMeetingFocus: `Фокус недели ${w.weekNumber}`,
        isPrelearning: w.weekNumber === 0,
        createdAt: now,
        updatedAt: now,
    })),
    lessons: CANONICAL_SCHEDULE_2026.weeks.map((w, idx) => ({
        id: `les-${idx + 1}`,
        weekId: mkWeekId('cohort-2026-1', w.weekNumber),
        title: `Урок недели ${w.weekNumber}`,
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
        { id: 'task-2', weekId: mkWeekId('cohort-2026-1', 6), title: 'Пилот 2 завтрака Лиги', description: 'Провести практикумы', artifact: 'Отчет', criteria: ['Подтверждение', 'Рефлексия'], uploadTypes: ['text', 'link'], taskType: 'control_point', isControlPoint: true, controlPointId: 'cp-6', deadlineAt: byWeek.get(6).endDate, scoreMax: 10, scoreType: 'course_points', linkedLessonIds: ['les-7'], linkedPracticumIds: [], linkedCertificationStage: null, createdAt: now, updatedAt: now },
        { id: 'task-3', weekId: mkWeekId('cohort-2026-1', 10), title: 'Запись СЗ', description: 'Сдать запись СЗ', artifact: 'Видео', criteria: ['Качество', 'Структура'], uploadTypes: ['video', 'link'], taskType: 'control_point', isControlPoint: true, controlPointId: 'cp-8', deadlineAt: SCORE_RULES.SZ_RECORDING_DEADLINE, scoreMax: 10, scoreType: 'course_points', linkedLessonIds: ['les-11'], linkedPracticumIds: [], linkedCertificationStage: 'sz_recording', createdAt: now, updatedAt: now },
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
        { id: 'sts-1', studentId: 'u-st-1', taskId: 'task-1', status: TASK_STATUS.REVISION_REQUESTED, submittedAt: '2026-06-02', acceptedAt: null, lastStatusChangedAt: '2026-06-03', currentVersionId: 'ver-2', revisionCycles: 2, mentorBonusPoints: 0, autoPoints: 12, totalTaskPoints: 12, isOverdue: true, overdueDays: 1, createdAt: now, updatedAt: now },
        { id: 'sts-2', studentId: 'u-st-2', taskId: 'task-2', status: TASK_STATUS.PENDING_REVIEW, submittedAt: '2026-06-02', acceptedAt: null, lastStatusChangedAt: '2026-06-02', currentVersionId: 'ver-3', revisionCycles: 0, mentorBonusPoints: 2, autoPoints: 8, totalTaskPoints: 10, isOverdue: false, overdueDays: 0, createdAt: now, updatedAt: now },
        { id: 'sts-3', studentId: 'u-st-3', taskId: 'task-3', status: TASK_STATUS.SUBMITTED, submittedAt: '2026-06-28', acceptedAt: null, lastStatusChangedAt: '2026-06-28', currentVersionId: 'ver-4', revisionCycles: 0, mentorBonusPoints: 0, autoPoints: 7, totalTaskPoints: 7, isOverdue: false, overdueDays: 0, createdAt: now, updatedAt: now },
    ],
    submissions: [
        { id: 'sub-1', studentId: 'u-st-1', taskId: 'task-1', currentVersionId: 'ver-2', draftVersionId: null, createdAt: now, updatedAt: now },
        { id: 'sub-2', studentId: 'u-st-2', taskId: 'task-2', currentVersionId: 'ver-3', draftVersionId: null, createdAt: now, updatedAt: now },
        { id: 'sub-3', studentId: 'u-st-3', taskId: 'task-3', currentVersionId: 'ver-4', draftVersionId: null, createdAt: now, updatedAt: now },
    ],
    submissionVersions: [
        { id: 'ver-1', submissionId: 'sub-1', versionNumber: 1, authorRole: ROLES.STUDENT, textContent: 'Черновик v1', attachments: [], links: [], isDraft: false, isCurrent: false, createdAt: '2026-06-01' },
        { id: 'ver-2', submissionId: 'sub-1', versionNumber: 2, authorRole: ROLES.STUDENT, textContent: 'Обновление v2', attachments: ['scenario.docx'], links: [], isDraft: false, isCurrent: true, createdAt: '2026-06-02' },
        { id: 'ver-3', submissionId: 'sub-2', versionNumber: 1, authorRole: ROLES.STUDENT, textContent: 'Отчет по завтракам', attachments: [], links: ['https://example.com/report'], isDraft: false, isCurrent: true, createdAt: '2026-06-02' },
        { id: 'ver-4', submissionId: 'sub-3', versionNumber: 1, authorRole: ROLES.STUDENT, textContent: 'Ссылка на запись СЗ', attachments: [], links: ['https://example.com/video'], isDraft: false, isCurrent: true, createdAt: '2026-06-28' },
    ],
    statusHistory: [
        { id: 'sh-1', studentId: 'u-st-1', taskId: 'task-1', fromStatus: TASK_STATUS.SUBMITTED, toStatus: TASK_STATUS.PENDING_REVIEW, changedByUserId: 'u-st-1', comment: 'Отправлено', createdAt: '2026-06-02' },
        { id: 'sh-2', studentId: 'u-st-1', taskId: 'task-1', fromStatus: TASK_STATUS.PENDING_REVIEW, toStatus: TASK_STATUS.REVISION_REQUESTED, changedByUserId: 'u-men-1', comment: 'Нужна доработка', createdAt: '2026-06-03' },
    ],
    threadMessages: [
        { id: 'tm-1', studentId: 'u-st-1', taskId: 'task-1', authorUserId: 'u-men-1', authorRole: ROLES.MENTOR, messageType: 'comment', text: 'Сильное начало, поправьте структуру.', attachments: [], linkedVersionId: 'ver-2', linkedStatusHistoryId: 'sh-2', isSystem: false, createdAt: '2026-06-03', readBy: ['u-men-1'] },
        { id: 'tm-2', studentId: 'u-st-1', taskId: 'task-1', authorUserId: 'system', authorRole: 'system', messageType: 'status', text: 'Статус изменен: pending_review -> revision_requested', attachments: [], linkedVersionId: null, linkedStatusHistoryId: 'sh-2', isSystem: true, createdAt: '2026-06-03', readBy: [] },
    ],
    mentorMeetings: [
        { id: 'mm-1', cohortId: 'cohort-2026-1', studentId: 'u-st-1', mentorId: 'u-men-1', weekNumber: 6, title: 'Практикум недели 6', focus: 'Фокус на КТ4-6', scheduledAt: '2026-06-01T18:00:00.000Z', happenedAt: null, status: MEETING_STATUS.SCHEDULED, reflectionStatus: REFLECTION_STATUS.PENDING, linkedTaskId: 'task-1', note: '', createdAt: now, updatedAt: now },
    ],
    libraryItems: [
        { id: 'lib-1', title: 'Доказательная база', description: 'Научные источники', category: 'доказательная база', contentType: 'pdf', duration: '15 мин', progressEnabled: true, createdAt: now, updatedAt: now },
    ],
    contentItems: [
        { id: 'cnt-1', title: 'Стартовый онбординг', shortDescription: 'Материал старта', fullDescription: 'Размещается в разделе О курсе', contentType: CONTENT_TYPE.VIDEO, status: CONTENT_STATUS.PUBLISHED, visibility: 'by_cohort', attachments: [], externalLinks: [], coverImage: '', estimatedDuration: '18 мин', createdBy: 'u-adm-1', createdAt: now, updatedAt: now },
        { id: 'cnt-2', title: 'Сценарий для ментора', shortDescription: 'Шаблон практикума', fullDescription: 'Для раздела Практикумы', contentType: CONTENT_TYPE.TEMPLATE, status: CONTENT_STATUS.DRAFT, visibility: 'by_role', attachments: [], externalLinks: [], coverImage: '', estimatedDuration: '20 мин', createdBy: 'u-adm-1', createdAt: now, updatedAt: now },
    ],
    contentPlacements: [
        { id: 'pl-1', contentItemId: 'cnt-1', targetSection: 'about', targetRole: ROLES.STUDENT, cohortId: 'cohort-2026-1', weekNumber: 0, moduleNumber: 0, orderIndex: 1, isPublished: true, createdAt: now, updatedAt: now },
        { id: 'pl-2', contentItemId: 'cnt-1', targetSection: 'library', targetRole: ROLES.STUDENT, cohortId: 'cohort-2026-1', weekNumber: 1, moduleNumber: 1, orderIndex: 2, isPublished: true, createdAt: now, updatedAt: now },
        { id: 'pl-3', contentItemId: 'cnt-2', targetSection: 'practicums', targetRole: ROLES.MENTOR, cohortId: 'cohort-2026-1', weekNumber: 6, moduleNumber: 2, orderIndex: 1, isPublished: false, createdAt: now, updatedAt: now },
        { id: 'pl-4', contentItemId: 'cnt-1', targetSection: 'certification', targetRole: ROLES.STUDENT, cohortId: 'cohort-2026-1', weekNumber: 10, moduleNumber: 4, orderIndex: 1, isPublished: true, createdAt: now, updatedAt: now },
        { id: 'pl-5', contentItemId: 'cnt-1', targetSection: 'cultural_code', targetRole: ROLES.STUDENT, cohortId: 'cohort-2026-1', weekNumber: 0, moduleNumber: 0, orderIndex: 1, isPublished: true, createdAt: now, updatedAt: now },
    ],
    certificationProgress: [
        { id: 'cert-1', studentId: 'u-st-1', guestPlanStatus: 'in_progress', trialBreakfastStatus: 'pending', szRecordingStatus: 'not_started', szSelfAssessmentStatus: 'not_started', szMentorAssessmentStatus: 'not_started', certificationPackageStatus: 'not_started', admissionStatus: CERTIFICATION_STATUS.IN_PROGRESS, redFlags: [], deadlineAt: SCORE_RULES.SZ_RECORDING_DEADLINE, createdAt: now, updatedAt: now },
        { id: 'cert-2', studentId: 'u-st-3', guestPlanStatus: 'done', trialBreakfastStatus: 'done', szRecordingStatus: 'done', szSelfAssessmentStatus: 'in_progress', szMentorAssessmentStatus: 'pending', certificationPackageStatus: 'in_progress', admissionStatus: CERTIFICATION_STATUS.RED_FLAG, redFlags: ['Нет сертификационного пакета'], deadlineAt: SCORE_RULES.SZ_RECORDING_DEADLINE, createdAt: now, updatedAt: now },
    ],
    deadlineRisks: [
        { id: 'risk-1', studentId: 'u-st-1', relatedTaskId: 'task-1', relatedControlPointId: 'cp-4', relatedMeetingId: 'mm-1', riskType: 'deadline_overdue', riskLevel: RISK_LEVEL.HIGH, title: 'Просрочка КТ4', description: 'Просрочено на 1 день', daysOverdue: 1, recommendedAction: 'Связаться сегодня', isResolved: false, createdAt: now, updatedAt: now },
        { id: 'risk-2', studentId: 'u-st-2', relatedTaskId: 'task-2', relatedControlPointId: 'cp-6', relatedMeetingId: null, riskType: 'anti_debt_d3', riskLevel: RISK_LEVEL.MEDIUM, title: 'Антидолг D+3', description: 'Требуется проверка реакции', daysOverdue: 3, recommendedAction: 'Уточнить план досдачи', isResolved: false, createdAt: now, updatedAt: now },
    ],
    dashboardWidgets: DEFAULT_WIDGETS,
    faqItems: [
        { id: 'faq-1', title: 'Как получить баллы?', answer: 'Закрывать недели, КТ и сдавать в срок.', targetRole: ROLES.STUDENT, orderIndex: 1 },
        { id: 'faq-2', title: 'Где комментарии ментора?', answer: 'В разделе Результаты и карточке задания.', targetRole: ROLES.STUDENT, orderIndex: 2 },
    ],
    emailTemplates: [
        { id: 'et-1', code: 'mentor_comment', subject: 'Новый комментарий ментора', body: 'Проверьте карточку задания.', targetRole: ROLES.STUDENT, isEnabled: true },
    ],
    studentPoints: [
        { id: 'pts-1', studentId: 'u-st-1', coursePointsTotal: 0, week0Points: 0, weeksPoints: 0, controlPointsTotal: 0, mentorBonusTotal: 0, szSelfAssessmentTotal: 0, szMentorAssessmentTotal: 0, updatedAt: now },
        { id: 'pts-2', studentId: 'u-st-2', coursePointsTotal: 0, week0Points: 0, weeksPoints: 0, controlPointsTotal: 0, mentorBonusTotal: 0, szSelfAssessmentTotal: 0, szMentorAssessmentTotal: 0, updatedAt: now },
        { id: 'pts-3', studentId: 'u-st-3', coursePointsTotal: 0, week0Points: 0, weeksPoints: 0, controlPointsTotal: 0, mentorBonusTotal: 0, szSelfAssessmentTotal: 0, szMentorAssessmentTotal: 0, updatedAt: now },
    ],
    weekCompletionState: [],
    controlPointState: [],
    mentorBonusEvents: [],
    szAssessmentState: [
        { id: 'sz-1', studentId: 'u-st-1', selfAssessmentPoints: 0, mentorAssessmentPoints: 0, redFlags: [], comparedAt: null, finalStatus: 'not_started' },
        { id: 'sz-2', studentId: 'u-st-2', selfAssessmentPoints: 12, mentorAssessmentPoints: 0, redFlags: [], comparedAt: null, finalStatus: 'in_progress' },
        { id: 'sz-3', studentId: 'u-st-3', selfAssessmentPoints: 41, mentorAssessmentPoints: 28, redFlags: ['Нет сертификационного пакета'], comparedAt: '2026-06-28', finalStatus: 'red_flag' },
    ],
    pointsHistory: [],
};
