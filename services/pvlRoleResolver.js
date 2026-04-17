import { ROLES } from '../utils/roles';

const IS_DEV = import.meta.env.DEV;

function normalizeGardenRoleValue(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === ROLES.ADMIN || raw === 'admin' || raw === 'админ' || raw === 'администратор') return ROLES.ADMIN;
    if (raw === ROLES.MENTOR || raw === 'mentor' || raw === 'ментор') return ROLES.MENTOR;
    if (raw === ROLES.APPLICANT || raw === 'applicant' || raw === 'абитуриент' || raw === 'заявитель') return ROLES.APPLICANT;
    if (raw === ROLES.INTERN || raw === 'intern' || raw === 'стажер' || raw === 'стажёр') return ROLES.INTERN;
    return raw;
}

export function resolvePvlRoleFromGardenProfile(user) {
    const role = normalizeGardenRoleValue(user?.role);
    const status = normalizeGardenRoleValue(user?.status);
    const source = role || status;
    if (source === ROLES.ADMIN) return 'admin';
    if (source === ROLES.MENTOR) return 'mentor';
    if (source === ROLES.APPLICANT) return 'student';
    /** Стажер — следующая ступень участника (Абитуриент → Стажер → Ведущая), курс ПВЛ доступен */
    if (source === ROLES.INTERN) return 'student';
    return 'no_access';
}

export function canSeePvlInGarden(user) {
    return resolvePvlRoleFromGardenProfile(user) !== 'no_access';
}

export function readGardenCurrentUserFromStorage() {
    try {
        const raw = localStorage.getItem('garden_currentUser');
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function logPvlRoleResolution(user, resolvedRole) {
    if (!IS_DEV) return;
    try {
        // eslint-disable-next-line no-console
        console.info('[PVL ROLE RESOLVE]', {
            gardenRole: user?.role || null,
            gardenStatus: user?.status || null,
            resolvedPvlRole: resolvedRole,
        });
    } catch {
        /* noop */
    }
}

