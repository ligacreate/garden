/** Легаси-заглушки для редких импортов. Основной контур ПВЛ — `data/pvl/seed` + `pvlDomainApi.db`. */
export const pvlMockData = {
    users: [
        { id: 'u-st-1', role: 'student', fullName: '' },
        { id: 'u-men-1', role: 'mentor', fullName: '' },
    ],
    studentProfiles: [],
    mentorProfiles: [],
    adminUsers: [],
    cohorts: [],
    cohortSchedules: [],
    courseWeeks: [],
    lessons: [],
    homeworkTasks: [],
    controlPoints: [],
    submissions: [],
    submissionVersions: [],
    statusHistory: [],
    /** @deprecated Лента по заданиям живёт в runtime (`pvlDomainApi.db.threadMessages`), не в PostgREST. */
    threadMessages: [],
    mentorMeetings: [],
    libraryItems: [],
    glossaryItems: [],
    faqItems: [],
    certificationProgress: [],
    deadlineRisks: [],
    dashboardWidgets: [],
    adminContentItems: [],
    contentItems: [],
    contentPlacements: [],
    students: [],
    mentors: [],
    mentorAssignments: [],
    reviewQueue: [],
    reviewRisks: [],
    certificationRegistry: [],
    systemSettings: {
        maxCoursePoints: 400,
        maxSzSelfAssessmentPoints: 54,
        weekRange: '0-12',
        controlPointsTotal: 9,
        week6ControlPoints: 3,
        szRecordingDeadline: '2026-06-30',
        openQuestions: [],
    },
    emailTemplates: [],
    auditLog: [],
};

export const getStudentProfile = (studentId) => pvlMockData.studentProfiles.find((s) => s.id === studentId);
export const getUser = (id) => pvlMockData.users.find((u) => u.id === id);
export const getStudentTasks = (studentId) => pvlMockData.homeworkTasks.filter((t) => t.studentId === studentId);
export const getStudentRisks = (studentId) => pvlMockData.deadlineRisks.filter(
    (r) => r && String(r.studentId) === String(studentId) && r.isResolved !== true,
);
export const getStudentMeetings = (studentId) => pvlMockData.mentorMeetings.filter((m) => m.studentId === studentId);
export const getStudentCertification = (studentId) => pvlMockData.certificationProgress.find((c) => c.studentId === studentId);
export const getTaskById = (taskId) => pvlMockData.homeworkTasks.find((t) => t.id === taskId);
export const getTaskThread = (taskId) => pvlMockData.threadMessages.filter((m) => m.taskId === taskId);
export const getTaskHistory = (taskId) => pvlMockData.statusHistory.filter((s) => s.taskId === taskId);
export const getTaskVersions = (taskId) => pvlMockData.submissionVersions.filter((v) => v.taskId === taskId);
