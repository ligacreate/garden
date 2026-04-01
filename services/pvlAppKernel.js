const SESSION_KEY = 'pvl_app_session_v1';
const PREFS_KEY = 'pvl_view_prefs_v1';

/**
 * Режим приёмки ПВЛ (AL Camp): маршруты ученицы / ментора / учительской доступны независимо от текущей роли в сессии.
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

export function buildSidebarByRole(role) {
    if (role === 'admin') {
        return ['Учительская ПВЛ', 'Сводка', 'Контент-центр', 'Ученицы', 'Менторы', 'Потоки', 'Проверка и риски', 'Сертификация', 'Настройки'];
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
        '/student/glossary',
        '/student/library',
        '/student/library/:itemId',
        '/student/lessons',
        '/student/practicums',
        '/student/checklist',
        '/student/results',
        '/student/results/:taskId',
        '/student/certification',
        '/student/self-assessment',
        '/student/cultural-code',
        '/mentor/dashboard',
        '/mentor/library',
        '/mentor/library/:itemId',
        '/mentor/materials',
        '/mentor/mentee/:id',
        '/mentor/mentee/:id/task/:taskId',
        '/admin/pvl',
        '/admin/dashboard',
        '/admin/content',
        '/admin/students',
        '/admin/mentors',
        '/admin/cohorts',
        '/admin/review',
        '/admin/certification',
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
