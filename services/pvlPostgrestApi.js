const POSTGREST_URL = import.meta.env.VITE_POSTGREST_URL || '';
const USE_LOCAL_ONLY = import.meta.env.VITE_USE_LOCAL_DB === 'true';
const IS_DEV = import.meta.env.DEV;
let didWarnMockMode = false;

/**
 * После PGRST300/PGRST302 («Server lacks JWT secret») больше не шлём JWT на этой вкладке,
 * чтобы не ломать каждый запрос повторными ошибками — аналогично dataService.js.
 */
let pvlJwtDisabledAfterError = false;

function getAuthToken() {
    try {
        return localStorage.getItem('garden_auth_token') || '';
    } catch {
        return '';
    }
}

function isEnabled() {
    return !USE_LOCAL_ONLY && !!POSTGREST_URL;
}

function isPgrstJwtError(bodyText) {
    const t = String(bodyText || '');
    if (t.includes('PGRST300') || t.includes('PGRST302') || t.includes('JWT secret')) return true;
    try {
        const code = JSON.parse(t)?.code || '';
        return code === 'PGRST300' || code === 'PGRST302';
    } catch {
        return false;
    }
}

function logDb(tag, payload = {}) {
    if (!IS_DEV) return;
    try {
        // eslint-disable-next-line no-console
        console.info(tag, payload);
    } catch {
        /* noop */
    }
}

function warnMockMode(reason = '') {
    if (!IS_DEV || didWarnMockMode) return;
    didWarnMockMode = true;
    try {
        // eslint-disable-next-line no-console
        console.warn(
            '[PVL DB MOCK MODE] PostgREST unavailable; admin materials/calendar/FAQ and student questions are using mock fallback.',
            reason || ''
        );
    } catch {
        /* noop */
    }
}

function buildHeaders(prefer, withToken) {
    const headers = {
        'Content-Type': 'application/json',
        'Accept-Profile': 'public',
        'Content-Profile': 'public',
    };
    if (withToken) {
        const token = getAuthToken();
        if (token) headers.Authorization = `Bearer ${token}`;
    }
    if (prefer) headers.Prefer = prefer;
    return headers;
}

async function request(table, { method = 'GET', params = {}, body, prefer } = {}) {
    if (!isEnabled()) {
        warnMockMode(!POSTGREST_URL ? 'VITE_POSTGREST_URL is not set.' : 'VITE_USE_LOCAL_DB=true.');
        logDb('[PVL DB FALLBACK]', {
            endpoint: '/' + table,
            status: 'disabled',
            table,
            id: body?.id || null,
            error: 'PVL DB disabled',
        });
        throw new Error('PVL DB disabled');
    }
    const url = new URL(`/${table}`, POSTGREST_URL);
    Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });

    const tryWithToken = !pvlJwtDisabledAfterError && Boolean(getAuthToken());
    let response = await fetch(url.toString(), {
        method,
        headers: buildHeaders(prefer, tryWithToken),
        body: body ? JSON.stringify(body) : undefined,
    });

    /* Если PostgREST не имеет jwt-secret — повторяем запрос без токена */
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        if (tryWithToken && isPgrstJwtError(text)) {
            pvlJwtDisabledAfterError = true;
            response = await fetch(url.toString(), {
                method,
                headers: buildHeaders(prefer, false),
                body: body ? JSON.stringify(body) : undefined,
            });
            if (!response.ok) {
                const text2 = await response.text().catch(() => '');
                logDb('[PVL DB FALLBACK]', { endpoint: url.toString(), status: response.status, table, id: body?.id || null, error: text2 });
                throw new Error(text2 || `PostgREST error (${response.status})`);
            }
        } else {
            logDb('[PVL DB FALLBACK]', { endpoint: url.toString(), status: response.status, table, id: body?.id || null, error: text });
            throw new Error(text || `PostgREST error (${response.status})`);
        }
    }

    const logTag = method === 'GET' ? '[PVL DB READ]' : '[PVL DB WRITE]';
    logDb(logTag, { endpoint: url.toString(), status: response.status, table, id: body?.id || null, error: null });

    if (response.status === 204) return [];
    return response.json().catch(() => []);
}

function asArray(data) {
    return Array.isArray(data) ? data : [];
}

function isUuidString(v) {
    if (v == null || v === '') return false;
    const s = String(v).trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function normalizeCalendarEventTypeForDb(value) {
    const raw = String(value || '').toLowerCase().trim();
    const map = {
        lesson: 'lesson',
        practicum: 'practicum',
        practicum_done: 'practicum_done',
        breakfast: 'breakfast',
        mentor_meeting: 'mentor_meeting',
        lesson_release: 'lesson_release',
        deadline: 'deadline',
        other: 'other',
        live_stream: 'live_stream',
        session: 'mentor_meeting',
        week_closure: 'deadline',
    };
    return map[raw] || 'other';
}

function normalizeHomeworkStatusToDb(value) {
    const raw = String(value || '').toLowerCase().trim();
    const map = {
        draft: 'draft',
        submitted: 'in_review',
        pending_review: 'in_review',
        in_review: 'in_review',
        revision_requested: 'revision',
        revision: 'revision',
        accepted: 'accepted',
        rejected: 'rejected',
    };
    return map[raw] || 'draft';
}

function normalizeHomeworkStatusFromDb(value) {
    const raw = String(value || '').toLowerCase().trim();
    const map = {
        draft: 'draft',
        in_review: 'pending_review',
        revision: 'revision_requested',
        accepted: 'accepted',
        rejected: 'rejected',
    };
    return map[raw] || 'draft';
}

export const pvlPostgrestApi = {
    isEnabled,

    // Content
    async listContentItems() {
        return request('pvl_content_items', { params: { select: '*', order: 'updated_at.desc' } });
    },
    async getContentItem(id) {
        const rows = await request('pvl_content_items', { params: { select: '*', id: `eq.${id}`, limit: 1 } });
        return asArray(rows)[0] || null;
    },
    async createContentItem(payload) {
        const rows = await request('pvl_content_items', {
            method: 'POST',
            body: [payload],
            prefer: 'resolution=merge-duplicates,return=representation',
        });
        return asArray(rows)[0] || null;
    },
    async updateContentItem(id, payload) {
        const rows = await request('pvl_content_items', {
            method: 'PATCH',
            params: { id: `eq.${id}` },
            body: payload,
            prefer: 'return=representation',
        });
        return asArray(rows)[0] || null;
    },
    async publishContentItem(id) {
        return this.updateContentItem(id, { status: 'published' });
    },
    async unpublishContentItem(id) {
        return this.updateContentItem(id, { status: 'draft' });
    },
    async archiveContentItem(id) {
        return this.updateContentItem(id, { status: 'archived' });
    },
    async deleteContentItem(id) {
        await request('pvl_content_items', { method: 'DELETE', params: { id: `eq.${id}` } });
        return true;
    },

    // Placements
    async listPlacementsByContentItem(contentItemId) {
        return request('pvl_content_placements', {
            params: { select: '*', content_item_id: `eq.${contentItemId}`, order: 'order_index.asc' },
        });
    },
    async createPlacement(payload) {
        const rows = await request('pvl_content_placements', {
            method: 'POST',
            body: [payload],
            prefer: 'resolution=merge-duplicates,return=representation',
        });
        return asArray(rows)[0] || null;
    },
    async updatePlacement(id, payload) {
        const rows = await request('pvl_content_placements', {
            method: 'PATCH',
            params: { id: `eq.${id}` },
            body: payload,
            prefer: 'return=representation',
        });
        return asArray(rows)[0] || null;
    },
    async deletePlacement(id) {
        await request('pvl_content_placements', { method: 'DELETE', params: { id: `eq.${id}` } });
        return true;
    },

    // Calendar
    async listCalendarEvents(filters = {}) {
        const params = { select: '*', order: 'start_at.asc' };
        if (filters.cohortId) params.cohort_id = `eq.${filters.cohortId}`;
        if (filters.visibilityRole) params.visibility_role = `eq.${filters.visibilityRole}`;
        if (filters.moduleNumber !== undefined && filters.moduleNumber !== null) params.module_number = `eq.${filters.moduleNumber}`;
        return request('pvl_calendar_events', { params });
    },
    async getCalendarEvent(id) {
        const rows = await request('pvl_calendar_events', { params: { select: '*', id: `eq.${id}`, limit: 1 } });
        return asArray(rows)[0] || null;
    },
    async createCalendarEvent(payload) {
        const row = {
            ...payload,
            event_type: normalizeCalendarEventTypeForDb(payload?.event_type),
        };
        const rows = await request('pvl_calendar_events', {
            method: 'POST',
            body: [row],
            prefer: 'return=representation',
        });
        return asArray(rows)[0] || null;
    },
    async updateCalendarEvent(id, payload) {
        const row = {
            ...payload,
            event_type: normalizeCalendarEventTypeForDb(payload?.event_type),
        };
        const rows = await request('pvl_calendar_events', {
            method: 'PATCH',
            params: { id: `eq.${id}` },
            body: row,
            prefer: 'return=representation',
        });
        return asArray(rows)[0] || null;
    },
    async deleteCalendarEvent(id) {
        await request('pvl_calendar_events', { method: 'DELETE', params: { id: `eq.${id}` } });
        return true;
    },

    // FAQ
    async listFaqItems(targetRole) {
        const params = { select: '*', order: 'order_index.asc' };
        if (targetRole) params.or = `(target_role.eq.${targetRole},target_role.eq.all,target_role.eq.both)`;
        return request('pvl_faq_items', { params });
    },
    async createFaqItem(payload) {
        const rows = await request('pvl_faq_items', {
            method: 'POST',
            body: [payload],
            prefer: 'return=representation',
        });
        return asArray(rows)[0] || null;
    },
    async updateFaqItem(id, payload) {
        const rows = await request('pvl_faq_items', {
            method: 'PATCH',
            params: { id: `eq.${id}` },
            body: payload,
            prefer: 'return=representation',
        });
        return asArray(rows)[0] || null;
    },
    async deleteFaqItem(id) {
        await request('pvl_faq_items', { method: 'DELETE', params: { id: `eq.${id}` } });
        return true;
    },

    // Student questions
    async listStudentQuestions(studentId) {
        return request('pvl_student_questions', { params: { select: '*', student_id: `eq.${studentId}`, order: 'created_at.desc' } });
    },
    async createStudentQuestion(payload) {
        const row = { status: 'new', ...payload };
        const rows = await request('pvl_student_questions', {
            method: 'POST',
            body: [row],
            prefer: 'return=representation',
        });
        return asArray(rows)[0] || null;
    },

    // Notifications
    async listNotifications(userId) {
        return request('pvl_notifications', {
            params: {
                select: '*',
                or: `(user_id.eq.${userId},role.eq.all,role.eq.both)`,
                order: 'created_at.desc',
            },
        });
    },
    async markNotificationRead(id) {
        const rows = await request('pvl_notifications', {
            method: 'PATCH',
            params: { id: `eq.${id}` },
            body: { is_read: true },
            prefer: 'return=representation',
        });
        return asArray(rows)[0] || null;
    },

    // Audit
    async createAuditLog(payload) {
        const row = {
            ...payload,
            action: payload?.action || payload?.action_type || 'unknown',
        };
        if ('action_type' in row) delete row.action_type;
        const rows = await request('pvl_audit_log', {
            method: 'POST',
            body: [row],
            prefer: 'return=representation',
        });
        return asArray(rows)[0] || null;
    },

    // Tracker / lessons / homework runtime
    async listCourseWeeks() {
        return request('pvl_course_weeks', { params: { select: '*', order: 'week_number.asc' } });
    },
    async listCourseLessons() {
        return request('pvl_course_lessons', { params: { select: '*', order: 'sort_order.asc' } });
    },
    async listHomeworkItems() {
        return request('pvl_homework_items', { params: { select: '*', order: 'sort_order.asc' } });
    },
    async listPublishedHomeworkContentItems() {
        return request('pvl_content_items', {
            params: { select: 'id,title,content_type', status: 'eq.published', content_type: 'in.(homework,template,checklist,questionnaire)' },
        });
    },
    // pvl_checklist_items — одна строка на (студент × контент-айтем), конфликт невозможен
    async listStudentChecklistItems(studentId) {
        return request('pvl_checklist_items', {
            params: { select: 'content_item_id', student_id: `eq.${studentId}` },
        });
    },
    async insertChecklistItem(studentId, contentItemId) {
        return request('pvl_checklist_items', {
            method: 'POST',
            params: { on_conflict: 'student_id,content_item_id' },
            body: [{ student_id: studentId, content_item_id: contentItemId }],
            prefer: 'resolution=ignore-duplicates',
        });
    },
    async deleteChecklistItem(studentId, contentItemId) {
        return request('pvl_checklist_items', {
            method: 'DELETE',
            params: { student_id: `eq.${studentId}`, content_item_id: `eq.${contentItemId}` },
        });
    },

    async getStudentCourseProgress(studentId) {
        return request('pvl_student_course_progress', {
            params: { select: '*', student_id: `eq.${studentId}` },
        });
    },
    async upsertStudentCourseProgress(studentId, payload) {
        const row = { student_id: studentId, ...payload };
        const rows = await request('pvl_student_course_progress', {
            method: 'POST',
            params: { on_conflict: 'student_id,week_id' },
            body: [row],
            prefer: 'resolution=merge-duplicates,return=representation',
        });
        return asArray(rows)[0] || null;
    },
    async listStudentHomeworkSubmissions(studentId) {
        const rows = await request('pvl_student_homework_submissions', {
            params: { select: '*', student_id: `eq.${studentId}`, order: 'updated_at.desc' },
        });
        return asArray(rows).map((row) => ({ ...row, status: normalizeHomeworkStatusFromDb(row.status) }));
    },
    async getHomeworkSubmission(submissionId) {
        const rows = await request('pvl_student_homework_submissions', {
            params: { select: '*', id: `eq.${submissionId}`, limit: 1 },
        });
        const row = asArray(rows)[0] || null;
        return row ? { ...row, status: normalizeHomeworkStatusFromDb(row.status) } : null;
    },
    async createHomeworkSubmission(payload) {
        const row = { ...payload, status: normalizeHomeworkStatusToDb(payload?.status) };
        const rows = await request('pvl_student_homework_submissions', {
            method: 'POST',
            body: [row],
            prefer: 'return=representation',
        });
        const created = asArray(rows)[0] || null;
        return created ? { ...created, status: normalizeHomeworkStatusFromDb(created.status) } : null;
    },
    async updateHomeworkSubmission(id, payload) {
        const row = {
            ...payload,
            ...(Object.prototype.hasOwnProperty.call(payload || {}, 'status')
                ? { status: normalizeHomeworkStatusToDb(payload?.status) }
                : {}),
        };
        const rows = await request('pvl_student_homework_submissions', {
            method: 'PATCH',
            params: { id: `eq.${id}` },
            body: row,
            prefer: 'return=representation',
        });
        const updated = asArray(rows)[0] || null;
        return updated ? { ...updated, status: normalizeHomeworkStatusFromDb(updated.status) } : null;
    },
    async appendHomeworkStatusHistory(payload) {
        const row = {
            ...payload,
            from_status: normalizeHomeworkStatusToDb(payload?.from_status),
            to_status: normalizeHomeworkStatusToDb(payload?.to_status),
        };
        const rows = await request('pvl_homework_status_history', {
            method: 'POST',
            body: [row],
            prefer: 'return=representation',
        });
        return asArray(rows)[0] || null;
    },
    async listHomeworkStatusHistory(submissionId) {
        const rows = await request('pvl_homework_status_history', {
            params: {
                select: '*',
                submission_id: `eq.${submissionId}`,
                order: 'changed_at.asc',
            },
        });
        return asArray(rows).map((row) => ({
            ...row,
            from_status: normalizeHomeworkStatusFromDb(row.from_status),
            to_status: normalizeHomeworkStatusFromDb(row.to_status),
        }));
    },
    async upsertCourseWeek(payload) {
        const rows = await request('pvl_course_weeks', {
            method: 'POST',
            params: { on_conflict: 'week_number' },
            body: [payload],
            prefer: 'resolution=merge-duplicates,return=representation',
        });
        return asArray(rows)[0] || null;
    },
    async upsertCourseLesson(payload) {
        const rows = await request('pvl_course_lessons', {
            method: 'POST',
            body: [payload],
            prefer: 'resolution=merge-duplicates,return=representation',
        });
        return asArray(rows)[0] || null;
    },
    async upsertHomeworkItem(payload) {
        const rows = await request('pvl_homework_items', {
            method: 'POST',
            body: [payload],
            prefer: 'resolution=merge-duplicates,return=representation',
        });
        return asArray(rows)[0] || null;
    },
    async listStudents() {
        return request('pvl_students', { params: { select: '*' } });
    },
    async upsertPvlStudent(payload) {
        const rows = await request('pvl_students', {
            method: 'POST',
            params: { on_conflict: 'id' },
            body: [payload],
            prefer: 'resolution=merge-duplicates,return=representation',
        });
        return asArray(rows)[0] || null;
    },

    // Student content/library progress
    async listStudentContentProgress(studentId) {
        return request('pvl_student_content_progress', {
            params: { select: '*', student_id: `eq.${studentId}` },
        });
    },
    async upsertStudentContentProgress(studentId, payload) {
        const row = { student_id: studentId, ...payload };
        const rows = await request('pvl_student_content_progress', {
            method: 'POST',
            params: { on_conflict: 'student_id,content_item_id' },
            body: [row],
            prefer: 'resolution=merge-duplicates,return=representation',
        });
        return asArray(rows)[0] || null;
    },

    /** Чтение назначений менторов по списку id учениц (profiles.id). */
    async listGardenMentorLinksByStudentIds(studentIds) {
        const uuids = asArray(studentIds)
            .map((id) => String(id || '').trim())
            .filter((id) => isUuidString(id));
        if (uuids.length === 0) return [];
        const chunkSize = 45;
        const merged = [];
        for (let i = 0; i < uuids.length; i += chunkSize) {
            const chunk = uuids.slice(i, i + chunkSize);
            // eslint-disable-next-line no-await-in-loop
            const rows = await request('pvl_garden_mentor_links', {
                params: {
                    select: '*',
                    student_id: `in.(${chunk.join(',')})`,
                },
            });
            merged.push(...asArray(rows));
        }
        return merged;
    },

    /** UPSERT одной строки: student_id — PK; при сбое merge — PATCH по student_id, затем обычный INSERT. */
    async upsertGardenMentorLink(payload) {
        let mergeErr = null;
        try {
            const rows = await request('pvl_garden_mentor_links', {
                method: 'POST',
                body: [payload],
                prefer: 'resolution=merge-duplicates,return=representation',
            });
            const row = asArray(rows)[0];
            if (row) return row;
        } catch (e) {
            mergeErr = e;
        }
        try {
            const patched = await request('pvl_garden_mentor_links', {
                method: 'PATCH',
                params: { student_id: `eq.${payload.student_id}` },
                body: {
                    mentor_id: payload.mentor_id,
                    updated_at: payload.updated_at,
                },
                prefer: 'return=representation',
            });
            const row = asArray(patched)[0];
            if (row) return row;
        } catch (e2) {
            if (mergeErr) throw mergeErr;
            throw e2;
        }
        try {
            const inserted = await request('pvl_garden_mentor_links', {
                method: 'POST',
                body: [payload],
                prefer: 'return=representation',
            });
            return asArray(inserted)[0] || null;
        } catch (e3) {
            if (mergeErr) throw mergeErr;
            throw e3;
        }
    },

    // Direct messages (ментор ↔ ученица)
    async listDirectMessages(mentorId, studentId) {
        return request('pvl_direct_messages', {
            params: {
                select: '*',
                mentor_id: `eq.${mentorId}`,
                student_id: `eq.${studentId}`,
                order: 'created_at.asc',
            },
        });
    },
    async createDirectMessage(payload) {
        const rows = await request('pvl_direct_messages', {
            method: 'POST',
            body: [payload],
            prefer: 'return=representation',
        });
        return asArray(rows)[0] || null;
    },

    // Backward compatibility with current integration points
    async loadRuntimeSnapshot() {
        const [items, placements, events, faq] = await Promise.all([
            this.listContentItems(),
            request('pvl_content_placements', { params: { select: '*' } }),
            this.listCalendarEvents({}),
            request('pvl_faq_items', { params: { select: '*' } }),
        ]);
        return { items: asArray(items), placements: asArray(placements), events: asArray(events), faq: asArray(faq) };
    },
    async upsertContentItem(row) {
        return this.createContentItem(row);
    },
    async upsertPlacement(row) {
        return this.createPlacement(row);
    },
    async upsertFaqItem(row) {
        const rows = await request('pvl_faq_items', {
            method: 'POST',
            body: [row],
            prefer: 'resolution=merge-duplicates,return=representation',
        });
        return asArray(rows)[0] || null;
    },
};

