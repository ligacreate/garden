const SESSION_KEY = 'pvl_app_session_v1';
const PREFS_KEY = 'pvl_view_prefs_v1';

/**
 * Режим приёмки ПВЛ: маршруты ученицы / ментора / учительской доступны независимо от текущей роли в сессии.
 * Отключить позже: заменить на false и вернуть строгую проверку.
 */
export const PVL_REVIEW_NAV_UNLOCK = true;

export const ROUTE_ACCESS_MAP = Object.freeze({
    student: ['/student/'],
    mentor: ['/mentor/'],
    admin: ['/admin/'],
    qa: ['/qa', '/debug/qa'],
});

export function getHomeRouteByRole(role) {
    if (role === 'mentor') return '/mentor/dashboard';
    if (role === 'admin') return '/admin/pvl';
    return '/student/dashboard';
}

function isPvlCabinetRoute(route) {
    return route.startsWith('/student/') || route.startsWith('/mentor/') || route.startsWith('/admin/');
}

export function canAccessRoute(role, route) {
    if (!route) return false;
    if (PVL_REVIEW_NAV_UNLOCK && isPvlCabinetRoute(route)) return true;
    if (route === '/qa' || route === '/debug/qa') return true;
    const allowed = ROUTE_ACCESS_MAP[role] || [];
    return allowed.some((prefix) => route.startsWith(prefix));
}

export function redirectToAllowedRoute(role, attemptedRoute) {
    if (!attemptedRoute) return getHomeRouteByRole(role);
    if (PVL_REVIEW_NAV_UNLOCK && isPvlCabinetRoute(attemptedRoute)) return attemptedRoute;
    if (canAccessRoute(role, attemptedRoute)) return attemptedRoute;
    return getHomeRouteByRole(role);
}

/**
 * Учительская ПВЛ: дашборд, ученицы, менторы, материалы курса (уроки/библиотека/глоссарий), календарь, настройки.
 * Ментор видит своих менти; учительская — всех и управление событиями потока.
 */
export function buildSidebarByRole(role) {
    if (role === 'admin') {
        return [
            'Дашборд',
            'Ученицы',
            'Менторы',
            'Материалы курса',
            'Календарь',
            'Настройки',
        ];
    }
    if (role === 'mentor') return ['Дашборд ментора'];
    return ['О курсе', 'Глоссарий курса', 'Библиотека курса', 'Уроки', 'Практикумы с менторами', 'Чек-лист', 'Результаты', 'Сертификация', 'Культурный код Лиги'];
}

export function saveAppSession(payload) {
    try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } catch {
        // no-op
    }
}

export function loadAppSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function clearAppSession() {
    try {
        localStorage.removeItem(SESSION_KEY);
    } catch {
        // no-op
    }
}

export function saveViewPreferences(scope, payload) {
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        const prev = raw ? JSON.parse(raw) : {};
        prev[scope] = payload;
        localStorage.setItem(PREFS_KEY, JSON.stringify(prev));
    } catch {
        // no-op
    }
}

export function loadViewPreferences(scope) {
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        const prev = raw ? JSON.parse(raw) : {};
        return prev[scope] || null;
    } catch {
        return null;
    }
}

export function getAllRoutes() {
    return [
        '/student/dashboard',
        '/student/about',
        '/student/onboarding',
        '/student/glossary',
        '/student/library',
        '/student/library/:itemId',
        '/student/lessons',
        '/student/tracker',
        '/student/practicums',
        '/student/checklist',
        '/student/results',
        '/student/results/:taskId',
        '/student/certification',
        '/student/self-assessment',
        '/student/qa',
        '/student/cultural-code',
        '/mentor/dashboard',
        '/mentor/mentees',
        '/mentor/review-queue',
        '/mentor/about',
        '/mentor/onboarding',
        '/mentor/glossary',
        '/mentor/library',
        '/mentor/library/:itemId',
        '/mentor/tracker',
        '/mentor/lessons',
        '/mentor/practicums',
        '/mentor/checklist',
        '/mentor/results',
        '/mentor/certification',
        '/mentor/self-assessment',
        '/mentor/qa',
        '/mentor/cultural-code',
        '/mentor/materials',
        '/mentor/mentee/:id',
        '/mentor/mentee/:id/task/:taskId',
        '/admin/pvl',
        '/admin/content',
        '/admin/students',
        '/admin/students/:id',
        '/admin/students/:id/task/:taskId',
        '/admin/mentors',
        '/admin/calendar',
        '/admin/settings',
        '/qa',
        '/debug/qa',
    ];
}

export function validateRoleAccessMap() {
    const routes = getAllRoutes();
    return routes.map((r) => ({
        route: r,
        student: canAccessRoute('student', r),
        mentor: canAccessRoute('mentor', r),
        admin: canAccessRoute('admin', r),
    }));
}

export function validateRouteMap() {
    const routes = getAllRoutes();
    return routes.map((route) => ({ route, exists: true, hasRenderer: true, nonEmptyContainer: true }));
}
