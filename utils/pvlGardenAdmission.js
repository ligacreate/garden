/**
 * Единая нормализация: кого из профилей Сада (PostgREST profiles) считать участником ПВЛ
 * и какую метку gardenRole хранить в mock-db (db.users / studentProfiles).
 *
 * Источник истины в Саду: колонка profiles.role (см. migrations/07_profiles_unify.sql, 22_profiles_default_applicant_role.sql).
 * Поле profiles.status — обычно жизненный цикл аккаунта (active/…), не путать с «абитуриент».
 */

import { ROLES as GARDEN_ROLES } from './roles';

const norm = (v) => String(v ?? '').trim().toLowerCase();

/**
 * Роли назначаемого персонала платформы — в список учениц ПВЛ не попадают.
 * Стажер/intern — НЕ персонал: это следующая ступень участника (Абитуриент → Стажер → Ведущая),
 * поэтому они могут проходить курс ПВЛ и должны синхронизироваться как studentProfiles.
 */
const GARDEN_STAFF_ROLES = new Set([
    GARDEN_ROLES.MENTOR,
    GARDEN_ROLES.LEADER,
    GARDEN_ROLES.ADMIN,
    GARDEN_ROLES.CURATOR,
    'mentor',
    'leader',
    'admin',
    'curator',
    'ментор',
    'ведущая',
    'администратор',
    'куратор',
]);

/**
 * @param {object} profile — нормализованный профиль (как после RemoteApiService._normalizeProfile)
 * @returns {boolean}
 */
export function isGardenStaffProfile(profile) {
    const r = norm(profile?.role);
    if (!r) return false;
    return GARDEN_STAFF_ROLES.has(r);
}

/**
 * Участник трека ПВЛ (ученица/абитуриент в смысле курса), не персонал.
 * @param {object} profile
 * @returns {{ gardenRole: 'applicant'|'student', sourceRole: string, ambiguous?: boolean } | null} null = не синхронизировать как ученицу
 */
export function classifyGardenProfileForPvlStudent(profile) {
    if (!profile?.id || isGardenStaffProfile(profile)) return null;

    const r = norm(profile.role);
    const roleLabel = String(profile.roleLabel || profile.role_title || '').trim().toLowerCase();

    if (!r || r === GARDEN_ROLES.APPLICANT || r === 'абитуриент' || r === 'абитуриентка') {
        return { gardenRole: 'applicant', sourceRole: String(profile.role ?? '') };
    }
    if (roleLabel.includes('битуриент')) {
        return { gardenRole: 'applicant', sourceRole: String(profile.role ?? '') };
    }
    if (r === GARDEN_ROLES.INTERN || r === 'intern' || r === 'стажер' || r === 'стажёр') {
        /** Стажер синхронизируется как отдельный gardenRole='intern', а не 'student':
         *  — в studentProfiles попадает (→ доступ к урокам ПВЛ сохраняется),
         *  — но в списке «активных учениц» не отображается (getAdminStudents его фильтрует). */
        return { gardenRole: 'intern', sourceRole: String(profile.role ?? '') };
    }
    if (r === 'student' || r === 'ученица' || r === 'participant' || r === 'trainee') {
        return { gardenRole: 'student', sourceRole: String(profile.role ?? '') };
    }

    /** Неизвестная не-staff роль — не теряем пользователя (раньше попадал в «ложный» false и отбрасывался) */
    return { gardenRole: 'applicant', sourceRole: String(profile.role ?? ''), ambiguous: true };
}

/**
 * Подпись в UI (один маппинг на всё приложение ПВЛ).
 * @param {string|null|undefined} gardenRole — из db.users.gardenRole или studentProfiles.gardenRole
 * @returns {string}
 */
export function pvlGardenRoleLabelRu(gardenRole) {
    const g = String(gardenRole || '').trim();
    if (g === 'student') return 'Ученица';
    if (g === 'applicant') return 'Абитуриент';
    if (g === 'intern') return 'Стажер';
    if (g === 'preview') return 'Предпросмотр';
    if (!g) return '—';
    return g;
}
