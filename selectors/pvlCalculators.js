import { METHOD_QUESTIONS, SCORE_RULES } from '../data/pvl/constants';
import { RISK_LEVEL, TASK_STATUS } from '../data/pvl/enums';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const toDate = (x) => new Date(`${x}T00:00:00.000Z`);
const diffDays = (a, b) => Math.floor((toDate(a) - toDate(b)) / MS_PER_DAY);

export function calculateStudentWeekProgress(db, studentId, weekId) {
    const tasks = db.homeworkTasks.filter((t) => t.weekId === weekId);
    if (!tasks.length) return 0;
    const done = db.studentTaskStates.filter((s) => s.studentId === studentId && tasks.some((t) => t.id === s.taskId) && s.status === TASK_STATUS.ACCEPTED).length;
    return Math.round((done / tasks.length) * 100);
}

export function calculateHomeworkProgress(db, studentId) {
    const states = db.studentTaskStates.filter((s) => s.studentId === studentId);
    const done = states.filter((s) => s.status === TASK_STATUS.ACCEPTED).length;
    return { done, total: states.length || 1, percent: Math.round((done / (states.length || 1)) * 100) };
}

export function calculateLibraryProgress() {
    // method_question: начислять ли баллы за библиотеку (пока не влияет на очки)
    return { done: 0, total: 0, percent: 0, methodQuestion: METHOD_QUESTIONS.LIBRARY_POINTS };
}

export function calculateCourseProgress(db, studentId) {
    return calculateHomeworkProgress(db, studentId);
}

export function calculateAutoPoints(db, studentId) {
    return db.studentTaskStates.filter((s) => s.studentId === studentId).reduce((acc, s) => acc + (s.autoPoints || 0), 0);
}

export function calculateMentorBonusPoints(db, studentId) {
    return db.studentTaskStates.filter((s) => s.studentId === studentId).reduce((acc, s) => acc + (s.mentorBonusPoints || 0), 0);
}

export function calculateControlPointPoints(db, studentId) {
    const cpTaskIds = new Set(db.homeworkTasks.filter((t) => t.isControlPoint).map((t) => t.id));
    return db.studentTaskStates
        .filter((s) => s.studentId === studentId && cpTaskIds.has(s.taskId) && s.status === TASK_STATUS.ACCEPTED)
        .reduce((acc, s) => acc + (s.totalTaskPoints || 0), 0);
}

export function calculateCoursePoints(db, studentId) {
    const auto = calculateAutoPoints(db, studentId);
    const bonus = Math.min(calculateMentorBonusPoints(db, studentId), SCORE_RULES.BONUS_POOL_MAX);
    return Math.min(auto + bonus, SCORE_RULES.MAX_COURSE_POINTS);
}

export function calculateSzSelfAssessment(db, studentId) {
    const profile = db.studentProfiles.find((p) => p.userId === studentId);
    return Math.min(profile?.szSelfAssessmentPoints || 0, SCORE_RULES.MAX_SZ_SELF_ASSESSMENT_POINTS);
}

export function calculateSzMentorAssessment(db, studentId) {
    const profile = db.studentProfiles.find((p) => p.userId === studentId);
    return profile?.szMentorAssessmentPoints || 0;
}

export function isTaskOverdue(db, taskId, studentId, today = '2026-06-03') {
    const task = db.homeworkTasks.find((t) => t.id === taskId);
    const state = db.studentTaskStates.find((s) => s.taskId === taskId && s.studentId === studentId);
    if (!task || !state) return false;
    if (state.status === TASK_STATUS.ACCEPTED) return false;
    return diffDays(today, task.deadlineAt) > 0;
}

export function getOverdueDays(db, taskId, studentId, today = '2026-06-03') {
    const task = db.homeworkTasks.find((t) => t.id === taskId);
    if (!task) return 0;
    return Math.max(0, diffDays(today, task.deadlineAt));
}

export function getNextDeadline(db, studentId, today = '2026-06-03') {
    const states = db.studentTaskStates.filter((s) => s.studentId === studentId);
    const tasks = db.homeworkTasks
        .filter((t) => states.some((s) => s.taskId === t.id))
        .filter((t) => diffDays(t.deadlineAt, today) >= 0)
        .sort((a, b) => String(a.deadlineAt).localeCompare(String(b.deadlineAt)));
    return tasks[0] || null;
}

export function getNextControlPoint(db, studentId, today = '2026-06-03') {
    const student = db.studentProfiles.find((s) => s.userId === studentId);
    const points = db.controlPoints
        .filter((cp) => cp.cohortId === student?.cohortId)
        .filter((cp) => diffDays(cp.deadlineAt, today) >= 0)
        .sort((a, b) => String(a.deadlineAt).localeCompare(String(b.deadlineAt)));
    return points[0] || null;
}

export function getDaysToSzDeadline(today = '2026-06-03') {
    return diffDays(SCORE_RULES.SZ_RECORDING_DEADLINE, today);
}

export function buildAntiDebtProtocol(db, studentId, today = '2026-06-03') {
    const overdue = db.studentTaskStates.filter((s) => s.studentId === studentId && isTaskOverdue(db, s.taskId, studentId, today));
    return overdue.map((s) => {
        const days = getOverdueDays(db, s.taskId, studentId, today);
        if (days >= 10) return { taskId: s.taskId, type: 'D+10', days };
        if (days >= 7) return { taskId: s.taskId, type: 'D+7', days };
        if (days >= 3) return { taskId: s.taskId, type: 'D+3', days };
        return { taskId: s.taskId, type: 'D+1', days };
    });
}

export function buildStudentRisks(db, studentId) {
    return db.deadlineRisks.filter((r) => r.studentId === studentId && !r.isResolved);
}

export function calculateRiskLevel(db, studentId) {
    const risks = buildStudentRisks(db, studentId);
    if (risks.some((r) => r.riskLevel === RISK_LEVEL.HIGH)) return RISK_LEVEL.HIGH;
    if (risks.some((r) => r.riskLevel === RISK_LEVEL.MEDIUM)) return RISK_LEVEL.MEDIUM;
    return RISK_LEVEL.LOW;
}

function resolveMentorMenteeIds(db, mentorId) {
    const profile = (db.mentorProfiles || []).find((m) => m.userId === mentorId);
    if (profile && Array.isArray(profile.menteeIds) && profile.menteeIds.length > 0) {
        return profile.menteeIds;
    }
    return db.studentProfiles.filter((p) => p.mentorId === mentorId).map((p) => p.userId);
}

export function buildMentorRisks(db, mentorId) {
    const menteeIds = resolveMentorMenteeIds(db, mentorId);
    return db.deadlineRisks.filter((r) => menteeIds.includes(r.studentId) && !r.isResolved);
}

export function buildAdminRisks(db) {
    return db.deadlineRisks.filter((r) => !r.isResolved);
}

export function getPendingReviewTasks(db, mentorId) {
    const menteeIds = resolveMentorMenteeIds(db, mentorId);
    return db.studentTaskStates
        .filter((s) => menteeIds.includes(s.studentId) && (s.status === TASK_STATUS.PENDING_REVIEW || s.status === TASK_STATUS.SUBMITTED))
        .map((s) => ({ ...s, task: db.homeworkTasks.find((t) => t.id === s.taskId) }));
}

export function getUnreadThreadCount(db, userId) {
    return db.threadMessages.filter((m) => !m.readBy?.includes(userId)).length;
}

export function getRevisionCycles(db, studentId, taskId) {
    return db.studentTaskStates.find((s) => s.studentId === studentId && s.taskId === taskId)?.revisionCycles || 0;
}

export function detectTooManyRevisions(reviewPayload) {
    return (reviewPayload?.nextActions || []).length > 3;
}

export function getCertificationReadiness(db, studentId) {
    const cert = db.certificationProgress.find((c) => c.studentId === studentId);
    return cert?.admissionStatus || 'not_started';
}

export function getCertificationRedFlags(db, studentId) {
    return db.certificationProgress.find((c) => c.studentId === studentId)?.redFlags || [];
}

export function getCertificationTimeline(db, studentId) {
    const cert = db.certificationProgress.find((c) => c.studentId === studentId);
    if (!cert) return [];
    return [
        { code: 'guest_plan', status: cert.guestPlanStatus },
        { code: 'trial_breakfast', status: cert.trialBreakfastStatus },
        { code: 'sz_recording', status: cert.szRecordingStatus },
        { code: 'sz_self', status: cert.szSelfAssessmentStatus },
        { code: 'sz_mentor', status: cert.szMentorAssessmentStatus },
        { code: 'package', status: cert.certificationPackageStatus },
    ];
}

export function buildEmailEvents() {
    return [];
}

export function getPendingNotifications(db, userId) {
    return db.threadMessages.filter((m) => !m.readBy?.includes(userId)).slice(0, 20);
}
