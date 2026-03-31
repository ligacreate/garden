export const ROLES = Object.freeze({
    STUDENT: 'student',
    MENTOR: 'mentor',
    ADMIN: 'admin',
});

export const COURSE_STATUS = Object.freeze({
    ACTIVE: 'active',
    AT_RISK: 'at_risk',
    PAUSED: 'paused',
    FINISHED: 'finished',
    CERTIFIED: 'certified',
});

export const TASK_STATUS = Object.freeze({
    NOT_STARTED: 'not_started',
    IN_PROGRESS: 'in_progress',
    DRAFT: 'draft',
    SUBMITTED: 'submitted',
    PENDING_REVIEW: 'pending_review',
    ACCEPTED: 'accepted',
    REVISION_REQUESTED: 'revision_requested',
    REJECTED: 'rejected',
    OVERDUE: 'overdue',
});

export const MEETING_STATUS = Object.freeze({
    SCHEDULED: 'scheduled',
    HAPPENED: 'happened',
    MISSED: 'missed',
    CANCELLED: 'cancelled',
});

export const REFLECTION_STATUS = Object.freeze({
    NOT_STARTED: 'not_started',
    PENDING: 'pending',
    DONE: 'done',
});

export const CERTIFICATION_STATUS = Object.freeze({
    NOT_STARTED: 'not_started',
    IN_PROGRESS: 'in_progress',
    READY_FOR_REVIEW: 'ready_for_review',
    RED_FLAG: 'red_flag',
    ADMITTED: 'admitted',
    NOT_ADMITTED: 'not_admitted',
    CERTIFIED: 'certified',
});

export const RISK_LEVEL = Object.freeze({
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
});

export const CONTENT_STATUS = Object.freeze({
    DRAFT: 'draft',
    PUBLISHED: 'published',
    ARCHIVED: 'archived',
});

export const CONTENT_TYPE = Object.freeze({
    VIDEO: 'video',
    TEXT: 'text',
    PDF: 'pdf',
    CHECKLIST: 'checklist',
    TEMPLATE: 'template',
    LINK: 'link',
    AUDIO: 'audio',
    FILE_BUNDLE: 'fileBundle',
});
