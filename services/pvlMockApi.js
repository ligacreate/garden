import { seed } from '../data/pvl/seed';
import { CONTENT_STATUS, ROLES, TASK_STATUS } from '../data/pvl/enums';
import { SCORING_METHOD_QUESTION, SCORING_RULES } from '../data/pvl/scoringRules';
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
    getNextControlPoint,
    getNextDeadline,
    getPendingNotifications,
    getPendingReviewTasks,
    getUnreadThreadCount,
} from '../selectors/pvlCalculators';

const db = structuredClone(seed);
const eventLog = [];
let auditLog = [];
let notifications = [];
if (!Array.isArray(db.studentLibraryProgress)) db.studentLibraryProgress = [];

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

const LIBRARY_MOCK_ITEMS = Array.from({ length: 15 }, (_, idx) => {
    const c = LIBRARY_CATEGORIES[idx % LIBRARY_CATEGORIES.length];
    const types = ['video', 'text', 'pdf', 'checklist', 'template', 'link', 'audio', 'fileBundle'];
    return {
        id: `lib-cnt-${idx + 1}`,
        title: `${c.title}: материал ${idx + 1}`,
        shortDescription: `Короткое описание материала ${idx + 1}`,
        fullDescription: `Подробное описание материала ${idx + 1} для категории "${c.title}".`,
        contentType: types[idx % types.length],
        status: 'published',
        visibility: 'all',
        attachments: [],
        externalLinks: [],
        coverImage: '',
        estimatedDuration: `${10 + idx} мин`,
        createdBy: 'u-adm-1',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        categoryId: c.id,
        categoryTitle: c.title,
        tags: [c.title.toLowerCase(), 'библиотека'],
        isRequired: idx % 3 === 0,
        isRecommended: idx % 2 === 0,
        isNew: idx % 4 === 0,
        orderIndex: idx + 1,
    };
});

const uid = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const nowIso = () => new Date().toISOString();
const pushEvent = (type, payload = {}) => {
    eventLog.push({ id: uid('evt'), type, payload, createdAt: nowIso() });
};

const addAuditEvent = (actorUserId, actorRole, actionType, entityType, entityId, summary, payload = {}) => {
    auditLog.push({
        id: uid('aud'),
        actorUserId,
        actorRole,
        actionType,
        entityType,
        entityId,
        summary,
        payload,
        createdAt: nowIso(),
    });
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
            upsertControlPointState(studentId, task.controlPointId, {
                status: accepted ? 'accepted' : (st?.status || 'not_started'),
                pointsAwarded: accepted ? SCORING_RULES.CONTROL_POINT_POINTS : 0,
                awardedAt: accepted ? nowIso() : null,
                acceptedByUserId: accepted ? 'system' : null,
            });
        }
    });

    Object.keys(byWeek).forEach((wk) => {
        const weekNumber = Number(wk);
        const items = byWeek[wk];
        const studiedCompleted = items.every((x) => x.st && x.st.status !== TASK_STATUS.NOT_STARTED);
        const taskCompleted = items.every((x) => x.st && [TASK_STATUS.SUBMITTED, TASK_STATUS.PENDING_REVIEW, TASK_STATUS.ACCEPTED, TASK_STATUS.REVISION_REQUESTED].includes(x.st.status));
        const submittedCompleted = items.every((x) => x.st && [TASK_STATUS.PENDING_REVIEW, TASK_STATUS.ACCEPTED, TASK_STATUS.REVISION_REQUESTED].includes(x.st.status));
        const weekClosed = items.every((x) => x.st && x.st.status === TASK_STATUS.ACCEPTED);
        upsertWeekCompletion(studentId, weekNumber, { studiedCompleted, taskCompleted, submittedCompleted, weekClosed, autoPointsAwarded: weekClosed ? SCORING_RULES.WEEK_CLOSURE_POINTS : 0, awardedAt: weekClosed ? nowIso() : null });
    });

    // Week 0 auto logic: onboarding/profile done
    const profile = db.studentProfiles.find((p) => p.userId === studentId);
    upsertWeekCompletion(studentId, 0, {
        studiedCompleted: true,
        taskCompleted: true,
        submittedCompleted: true,
        weekClosed: (profile?.currentWeek || 0) > 0,
        autoPointsAwarded: (profile?.currentWeek || 0) > 0 ? SCORING_RULES.WEEK0_POINTS : 0,
        awardedAt: (profile?.currentWeek || 0) > 0 ? nowIso() : null,
    });
}

function calculatePointsSummary(studentId) {
    syncDerivedStatesForStudent(studentId);
    const week0 = db.weekCompletionState.find((w) => w.studentId === studentId && w.weekNumber === 0);
    const week0Points = week0?.weekClosed ? SCORING_RULES.WEEK0_POINTS : 0;
    const closedWeeks = db.weekCompletionState.filter((w) => w.studentId === studentId && w.weekNumber >= 1 && w.weekNumber <= 12 && w.weekClosed).length;
    const weeksPoints = Math.min(closedWeeks * SCORING_RULES.WEEK_CLOSURE_POINTS, 240);
    const acceptedCp = db.controlPointState.filter((c) => c.studentId === studentId && c.status === 'accepted').length;
    const controlPointsTotal = Math.min(acceptedCp * SCORING_RULES.CONTROL_POINT_POINTS, 90);
    const mentorBonusTotal = Math.min(db.mentorBonusEvents.filter((e) => e.studentId === studentId).reduce((acc, e) => acc + (e.points || 0), 0), SCORING_RULES.MENTOR_BONUS_POOL_MAX);
    const sz = db.szAssessmentState.find((x) => x.studentId === studentId);
    const szSelfAssessmentTotal = Math.min(sz?.selfAssessmentPoints || 0, SCORING_RULES.SZ_POINTS_MAX);
    const szMentorAssessmentTotal = Math.min(sz?.mentorAssessmentPoints || 0, SCORING_RULES.SZ_POINTS_MAX);
    const coursePointsTotal = Math.min(week0Points + weeksPoints + controlPointsTotal + mentorBonusTotal, SCORING_RULES.COURSE_POINTS_MAX);

    // history append-once events
    if (week0Points > 0) addPointsHistory(studentId, 'week0', 'week0', SCORING_RULES.WEEK0_POINTS, 'Завершена неделя 0', '');
    db.weekCompletionState.filter((w) => w.studentId === studentId && w.weekNumber >= 1 && w.weekNumber <= 12 && w.weekClosed).forEach((w) => {
        addPointsHistory(studentId, 'weekCompletion', String(w.weekNumber), SCORING_RULES.WEEK_CLOSURE_POINTS, `Закрыта неделя ${w.weekNumber}`, '');
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

function mapTaskStatus(status) {
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

function getStudentSnapshot(studentId) {
    const profile = db.studentProfiles.find((p) => p.userId === studentId);
    const user = db.users.find((u) => u.id === studentId);
    return { user, profile };
}

function getTaskDetail(studentId, taskId) {
    const task = db.homeworkTasks.find((t) => t.id === taskId);
    const state = db.studentTaskStates.find((s) => s.studentId === studentId && s.taskId === taskId);
    const submission = db.submissions.find((s) => s.studentId === studentId && s.taskId === taskId);
    const versions = db.submissionVersions.filter((v) => v.submissionId === submission?.id).sort((a, b) => a.versionNumber - b.versionNumber);
    const history = db.statusHistory.filter((h) => h.studentId === studentId && h.taskId === taskId);
    const thread = db.threadMessages.filter((m) => m.studentId === studentId && m.taskId === taskId);
    return { task, state, submission, versions, history, thread };
}

function getPublishedContentFor(role, section, cohortId) {
    return db.contentPlacements
        .filter((p) => p.targetSection === section && p.isPublished)
        .filter((p) => !p.cohortId || p.cohortId === cohortId)
        .filter((p) => p.targetRole === role || p.targetRole === 'both')
        .map((p) => ({ placement: p, item: db.contentItems.find((ci) => ci.id === p.contentItemId) }))
        .filter((x) => x.item && x.item.status === CONTENT_STATUS.PUBLISHED)
        .sort((a, b) => a.placement.orderIndex - b.placement.orderIndex)
        .map((x) => x.item);
}

function getVisibleContentItems(userId, role, section) {
    const profile = db.studentProfiles.find((p) => p.userId === userId);
    const cohortId = profile?.cohortId;
    return getPublishedContentFor(role, section, cohortId);
}

function ensureLibrarySeedInDb() {
    const existingIds = new Set(db.contentItems.map((x) => x.id));
    LIBRARY_MOCK_ITEMS.forEach((item, index) => {
        if (!existingIds.has(item.id)) db.contentItems.push(item);
        if (!db.contentPlacements.some((p) => p.contentItemId === item.id && p.targetSection === 'library')) {
            db.contentPlacements.push({
                id: uid('pl'),
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
    ensureLibrarySeedInDb();
    const profile = db.studentProfiles.find((p) => p.userId === studentId);
    const cohortId = profile?.cohortId;
    const items = getPublishedContentFor(ROLES.STUDENT, 'library', cohortId);
    return items.map((item) => {
        const pr = db.studentLibraryProgress.find((x) => x.studentId === studentId && x.libraryItemId === item.id);
        return {
            ...item,
            progressPercent: pr?.progressPercent || 0,
            completed: !!pr?.completed,
            completedAt: pr?.completedAt || null,
            lastOpenedAt: pr?.lastOpenedAt || null,
        };
    });
}

function getLibraryCategoriesWithCounts(studentId) {
    const items = getPublishedLibraryContentForStudent(studentId);
    return LIBRARY_CATEGORIES.map((c) => {
        const categoryItems = items.filter((i) => (i.categoryId || i.categoryTitle || '').toString().includes(c.id) || i.categoryTitle === c.title);
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
    const items = getPublishedLibraryContentForStudent(studentId);
    return items.filter((i) => i.categoryId === categoryId || (i.categoryTitle || '').toLowerCase() === categoryId);
}

export const studentApi = {
    getStudentDashboard(studentId) {
        const pts = calculatePointsSummary(studentId);
        const { user, profile } = getStudentSnapshot(studentId);
        const tasks = db.studentTaskStates.filter((s) => s.studentId === studentId);
        return {
            studentProfile: {
                id: studentId,
                fullName: user?.fullName,
                cohortId: profile?.cohortId,
                currentWeek: profile?.currentWeek,
                currentModule: profile?.currentModule,
                coursePoints: pts.coursePointsTotal,
                szSelfAssessmentPoints: pts.szSelfAssessmentTotal,
                daysToSzDeadline: 27,
            },
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
        return ['О курсе', 'Глоссарий курса', 'Библиотека курса', 'Уроки', 'Практикумы с менторами', 'Чек-лист', 'Результаты', 'Сертификация', 'Культурный код Лиги'];
    },
    getStudentResults(studentId, filters = {}) {
        return db.studentTaskStates
            .filter((s) => s.studentId === studentId)
            .map((s) => {
                const task = db.homeworkTasks.find((t) => t.id === s.taskId);
                return {
                    id: task.id,
                    title: task.title,
                    week: db.courseWeeks.find((w) => w.id === task.weekId)?.weekNumber,
                    type: task.taskType,
                    status: mapTaskStatus(s.status),
                    deadlineAt: task.deadlineAt,
                    submittedAt: s.submittedAt,
                    mentorCommentPreview: db.threadMessages.find((m) => m.studentId === studentId && m.taskId === task.id && m.authorRole === ROLES.MENTOR)?.text || '',
                };
            })
            .filter((x) => (filters.status ? x.status === filters.status : true));
    },
    getStudentTaskDetail(studentId, taskId) {
        return getTaskDetail(studentId, taskId);
    },
    saveStudentDraft(studentId, taskId, payload) {
        const submission = db.submissions.find((s) => s.studentId === studentId && s.taskId === taskId);
        if (!submission) return null;
        const versionNumber = db.submissionVersions.filter((v) => v.submissionId === submission.id).length + 1;
        const version = {
            id: uid('ver'),
            submissionId: submission.id,
            versionNumber,
            authorRole: ROLES.STUDENT,
            textContent: payload?.textContent || '',
            attachments: payload?.attachments || [],
            links: payload?.links || [],
            isDraft: true,
            isCurrent: false,
            createdAt: nowIso(),
        };
        db.submissionVersions.push(version);
        submission.draftVersionId = version.id;
        submission.updatedAt = nowIso();
        return version;
    },
    submitStudentTask(studentId, taskId, payload) {
        const submission = db.submissions.find((s) => s.studentId === studentId && s.taskId === taskId);
        const state = db.studentTaskStates.find((s) => s.studentId === studentId && s.taskId === taskId);
        if (!submission || !state) return null;
        db.submissionVersions
            .filter((v) => v.submissionId === submission.id)
            .forEach((v) => {
                v.isCurrent = false;
                v.isDraft = false;
            });
        const versionNumber = db.submissionVersions.filter((v) => v.submissionId === submission.id).length + 1;
        const version = { id: uid('ver'), submissionId: submission.id, versionNumber, authorRole: ROLES.STUDENT, textContent: payload?.textContent || '', attachments: payload?.attachments || [], links: payload?.links || [], isDraft: false, isCurrent: true, createdAt: nowIso() };
        db.submissionVersions.push(version);
        submission.currentVersionId = version.id;
        submission.draftVersionId = null;
        state.currentVersionId = version.id;
        const fromStatus = state.status;
        state.status = TASK_STATUS.PENDING_REVIEW;
        state.submittedAt = nowIso().slice(0, 10);
        state.lastStatusChangedAt = nowIso().slice(0, 10);
        const history = { id: uid('sh'), studentId, taskId, fromStatus, toStatus: TASK_STATUS.PENDING_REVIEW, changedByUserId: studentId, comment: 'Отправлено на проверку', createdAt: nowIso() };
        db.statusHistory.push(history);
        db.threadMessages.push({ id: uid('tm'), studentId, taskId, authorUserId: studentId, authorRole: ROLES.STUDENT, messageType: 'version_submitted', text: 'Отправлена новая версия', attachments: payload?.attachments || [], linkedVersionId: version.id, linkedStatusHistoryId: history.id, isSystem: false, createdAt: nowIso(), readBy: [studentId] });
        db.threadMessages.push({ id: uid('tm'), studentId, taskId, authorUserId: 'system', authorRole: 'system', messageType: 'status', text: 'Статус изменен на к проверке', attachments: [], linkedVersionId: version.id, linkedStatusHistoryId: history.id, isSystem: true, createdAt: nowIso(), readBy: [] });
        pushEvent('new_submission_version', { studentId, taskId, versionId: version.id });
        pushEvent('task_status_changed', { studentId, taskId, toStatus: TASK_STATUS.PENDING_REVIEW });
        addAuditEvent(studentId, ROLES.STUDENT, 'submit_task', 'task', taskId, 'Student submitted task for review', { versionId: version.id });
        const mentorId = db.studentProfiles.find((p) => p.userId === studentId)?.mentorId;
        if (mentorId) addNotification(mentorId, ROLES.MENTOR, 'new_submission_version', 'Появилась новая версия задания', { studentId, taskId });
        return version;
    },
    addStudentThreadReply(studentId, taskId, payload) {
        const msg = { id: uid('tm'), studentId, taskId, authorUserId: studentId, authorRole: ROLES.STUDENT, messageType: 'comment', text: payload?.text || '', attachments: payload?.attachments || [], linkedVersionId: payload?.linkedVersionId || null, linkedStatusHistoryId: null, isSystem: false, createdAt: nowIso(), readBy: [studentId] };
        db.threadMessages.push(msg);
        pushEvent('student_replied', { studentId, taskId, messageId: msg.id });
        addAuditEvent(studentId, ROLES.STUDENT, 'student_reply', 'thread_message', msg.id, 'Student replied in thread', { taskId });
        return msg;
    },
    getStudentCertification(studentId) {
        const pts = calculatePointsSummary(studentId);
        const c = db.certificationProgress.find((x) => x.studentId === studentId);
        return { ...c, readiness: getCertificationReadiness(db, studentId), redFlags: getCertificationRedFlags(db, studentId), timeline: getCertificationTimeline(db, studentId), points: pts, methodQuestion: SCORING_METHOD_QUESTION };
    },
    getStudentChecklist(studentId) {
        return db.courseWeeks.map((w) => ({ weekNumber: w.weekNumber, progress: 0, studentId }));
    },
    getStudentLibrary(studentId, filters = {}) {
        let items = getPublishedLibraryContentForStudent(studentId);
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
        const items = getPublishedLibraryContentForStudent(studentId);
        const completed = items.filter((i) => i.completed).length;
        const total = items.length;
        return {
            completed,
            total,
            progressPercent: total ? Math.round((completed / total) * 100) : 0,
            lastOpenedMaterial: [...items].sort((a, b) => String(b.lastOpenedAt || '').localeCompare(String(a.lastOpenedAt || '')))[0] || null,
            recommendedNextMaterial: items.find((i) => !i.completed && i.isRecommended) || items.find((i) => !i.completed) || null,
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
        return pr;
    },
    getPublishedLibraryContentForStudent,
    getLibraryCategoriesWithCounts,
    getLibraryItemsByCategory,
};

export const mentorApi = {
    getMentorDashboard(mentorId) {
        const mentees = db.studentProfiles.filter((p) => p.mentorId === mentorId);
        return {
            totalMentees: mentees.length,
            reviewQueue: getPendingReviewTasks(db, mentorId),
            risks: buildMentorRisks(db, mentorId),
        };
    },
    getMentorMentees(mentorId) {
        return db.studentProfiles.filter((p) => p.mentorId === mentorId).map((p) => ({ ...p, user: db.users.find((u) => u.id === p.userId) }));
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
    getMentorReviewQueue(mentorId) {
        return getPendingReviewTasks(db, mentorId);
    },
    getMentorTaskDetail(_, studentId, taskId) {
        return getTaskDetail(studentId, taskId);
    },
    submitMentorReview(mentorId, studentId, taskId, payload) {
        const state = db.studentTaskStates.find((s) => s.studentId === studentId && s.taskId === taskId);
        if (!state) return null;
        const tooMany = detectTooManyRevisions(payload);
        const fromStatus = state.status;
        state.status = payload?.statusDecision || TASK_STATUS.REVISION_REQUESTED;
        state.lastStatusChangedAt = nowIso().slice(0, 10);
        state.revisionCycles = (state.revisionCycles || 0) + (state.status === TASK_STATUS.REVISION_REQUESTED ? 1 : 0);
        const history = { id: uid('sh'), studentId, taskId, fromStatus, toStatus: state.status, changedByUserId: mentorId, comment: payload?.generalComment || '', createdAt: nowIso() };
        db.statusHistory.push(history);
        db.threadMessages.push({ id: uid('tm'), studentId, taskId, authorUserId: mentorId, authorRole: ROLES.MENTOR, messageType: 'mentor_review', text: payload?.generalComment || '', attachments: [], linkedVersionId: state.currentVersionId, linkedStatusHistoryId: history.id, isSystem: false, createdAt: nowIso(), readBy: [mentorId] });
        db.threadMessages.push({ id: uid('tm'), studentId, taskId, authorUserId: 'system', authorRole: 'system', messageType: 'status', text: `Статус изменен на ${state.status}`, attachments: [], linkedVersionId: null, linkedStatusHistoryId: history.id, isSystem: true, createdAt: nowIso(), readBy: [] });
        pushEvent('mentor_commented', { mentorId, studentId, taskId });
        pushEvent('task_status_changed', { studentId, taskId, toStatus: state.status });
        addAuditEvent(mentorId, ROLES.MENTOR, 'mentor_review', 'task', taskId, 'Mentor reviewed task', { status: state.status });
        addNotification(studentId, ROLES.STUDENT, 'mentor_commented', 'Ментор оставил комментарий по заданию', { taskId });
        addNotification(studentId, ROLES.STUDENT, 'task_status_changed', 'Статус задания изменен ментором', { taskId, status: state.status });
        return { history, warningTooManyRevisions: tooMany };
    },
    changeMentorTaskStatus(mentorId, studentId, taskId, status, comment) {
        return this.submitMentorReview(mentorId, studentId, taskId, { statusDecision: status, generalComment: comment, nextActions: [] });
    },
    addMentorThreadReply(mentorId, studentId, taskId, payload) {
        const msg = { id: uid('tm'), studentId, taskId, authorUserId: mentorId, authorRole: ROLES.MENTOR, messageType: 'comment', text: payload?.text || '', attachments: payload?.attachments || [], linkedVersionId: payload?.linkedVersionId || null, linkedStatusHistoryId: null, isSystem: false, createdAt: nowIso(), readBy: [mentorId] };
        db.threadMessages.push(msg);
        pushEvent('mentor_commented', { mentorId, studentId, taskId, messageId: msg.id });
        addAuditEvent(mentorId, ROLES.MENTOR, 'mentor_comment', 'thread_message', msg.id, 'Mentor commented in thread', { taskId });
        addNotification(studentId, ROLES.STUDENT, 'mentor_commented', 'Новый комментарий ментора', { taskId });
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
    createContentItem(payload) {
        const item = { id: uid('cnt'), status: CONTENT_STATUS.DRAFT, visibility: 'all', attachments: [], externalLinks: [], coverImage: '', estimatedDuration: '', createdBy: 'u-adm-1', createdAt: nowIso(), updatedAt: nowIso(), ...payload };
        db.contentItems.unshift(item);
        addAuditEvent('u-adm-1', ROLES.ADMIN, 'create_content', 'content_item', item.id, 'Created content item', item);
        return item;
    },
    getContentItemById(contentId) {
        return db.contentItems.find((x) => x.id === contentId) || null;
    },
    updateContentItem(contentId, payload) {
        const item = db.contentItems.find((c) => c.id === contentId);
        if (!item) return null;
        Object.assign(item, payload, { updatedAt: nowIso() });
        addAuditEvent('u-adm-1', ROLES.ADMIN, 'update_content', 'content_item', contentId, 'Updated content item', payload);
        return item;
    },
    duplicateContentItem(contentId) {
        const src = this.getContentItemById(contentId);
        if (!src) return null;
        const copy = {
            ...src,
            id: uid('cnt'),
            title: `${src.title} (copy)`,
            status: CONTENT_STATUS.DRAFT,
            createdAt: nowIso(),
            updatedAt: nowIso(),
        };
        db.contentItems.unshift(copy);
        addAuditEvent('u-adm-1', ROLES.ADMIN, 'duplicate_content', 'content_item', copy.id, 'Duplicated content item', { sourceId: contentId });
        return copy;
    },
    publishContentItem(contentId) {
        const item = this.updateContentItem(contentId, { status: CONTENT_STATUS.PUBLISHED });
        if (item) {
            addAuditEvent('u-adm-1', ROLES.ADMIN, 'publish_content', 'content_item', contentId, 'Published content item', {});
            addNotification('u-adm-1', ROLES.ADMIN, 'content_published', 'Материал опубликован', { contentId });
        }
        return item;
    },
    archiveContentItem(contentId) {
        const item = this.updateContentItem(contentId, { status: CONTENT_STATUS.ARCHIVED });
        if (item) addAuditEvent('u-adm-1', ROLES.ADMIN, 'archive_content', 'content_item', contentId, 'Archived content item', {});
        return item;
    },
    unarchiveContentItem(contentId) {
        return this.updateContentItem(contentId, { status: CONTENT_STATUS.DRAFT });
    },
    createPlacement(payload) {
        const placement = { id: uid('pl'), isPublished: true, createdAt: nowIso(), updatedAt: nowIso(), ...payload };
        db.contentPlacements.push(placement);
        addAuditEvent('u-adm-1', ROLES.ADMIN, 'assign_placement', 'content_placement', placement.id, 'Assigned content placement', payload);
        return placement;
    },
    assignContentPlacement(payload) {
        return this.createPlacement(payload);
    },
    updatePlacement(placementId, payload) {
        const p = db.contentPlacements.find((x) => x.id === placementId);
        if (!p) return null;
        Object.assign(p, payload, { updatedAt: nowIso() });
        addAuditEvent('u-adm-1', ROLES.ADMIN, 'update_placement', 'content_placement', placementId, 'Updated content placement', payload);
        return p;
    },
    unpublishContentItem(contentId) {
        return this.archiveContentItem(contentId);
    },
    deletePlacement(placementId) {
        const idx = db.contentPlacements.findIndex((p) => p.id === placementId);
        if (idx < 0) return false;
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
        return db.studentProfiles.filter((s) => (filters.cohortId ? s.cohortId === filters.cohortId : true));
    },
    getAdminMentors() {
        return db.mentorProfiles;
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
};

export const sharedApi = {
    getFaq(role) {
        return db.faqItems.filter((f) => f.targetRole === role || f.targetRole === 'all');
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
    const history = { id: uid('sh'), studentId, taskId, fromStatus, toStatus, changedByUserId, comment, createdAt: nowIso() };
    db.statusHistory.push(history);
    db.threadMessages.push({ id: uid('tm'), studentId, taskId, authorUserId: 'system', authorRole: 'system', messageType: 'status', text: `Статус изменен на ${toStatus}`, attachments: [], linkedVersionId: null, linkedStatusHistoryId: history.id, isSystem: true, createdAt: nowIso(), readBy: [] });
    pushEvent('task_status_changed', { studentId, taskId, toStatus });
    addAuditEvent(changedByUserId, 'system', 'set_task_status', 'task', taskId, `Status changed to ${toStatus}`, { studentId, comment });
    return history;
}

export const pvlDomainApi = {
    db,
    studentApi,
    mentorApi,
    adminApi,
    sharedApi,
    helpers: {
        calculateLibraryProgress: () => calculateLibraryProgress(),
        calculateRiskLevel: (studentId) => calculateRiskLevel(db, studentId),
        getUnreadThreadCount: (userId) => getUnreadThreadCount(db, userId),
        getStudentPointsSummary: (studentId) => calculatePointsSummary(studentId),
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
        markNotificationRead(notificationId) {
            const n = notifications.find((x) => x.id === notificationId);
            if (!n) return null;
            n.isRead = true;
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
            auditLog = [];
            notifications = [];
            addAuditEvent('debug', 'system', 'reset_database', 'database', 'root', 'Database reset to seed', {});
        },
        cloneSeedState: () => structuredClone(seed),
    },
};
