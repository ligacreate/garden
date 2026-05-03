// Декодер JWT-payload для извлечения auth UUID (sub claim).
//
// Зачем: actor_user_id и changed_by на стороне фронта должны
// совпадать с auth.uid() в RLS-политиках. JWT sub — единственный
// канонический источник, не зависящий от состояния localStorage
// (garden_currentUser может ещё не быть записан после login).
//
// Используется в pvlMockApi.js: addAuditEvent, doPersistSubmissionToDb.

export function getAuthUserId() {
    const token = localStorage.getItem('garden_auth_token');
    if (!token) return null;
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(b64));
        return payload.sub || null;
    } catch {
        return null;
    }
}
