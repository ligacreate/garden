/**
 * Пункты левого меню сада в режиме ПВЛ (визуально как SidebarItem сада).
 * type: 'item' | 'divider'
 * action: undefined | 'settings' | 'exit_pvl'
 */

export const GARDEN_PVL_ICON = {
    dashboard: 'dashboard',
    book: 'graduation',
    users: 'users',
    calendar: 'calendar',
    tracker: 'tracker',
    mentor: 'mentor',
    bell: 'notifications',
    messages: 'messages',
};

export function buildGardenPvlStudentNav() {
    return [
        { type: 'item', key: 'pvl-st-about', label: 'О курсе', iconKey: 'book', route: '/student/about' },
        { type: 'item', key: 'pvl-st-trk', label: 'Трекер', iconKey: 'tracker', route: '/student/tracker' },
        { type: 'item', key: 'pvl-st-prac', label: 'Практикумы', iconKey: 'calendar', route: '/student/practicums' },
        { type: 'item', key: 'pvl-st-lib', label: 'Библиотека', iconKey: 'graduation', route: '/student/library' },
        { type: 'item', key: 'pvl-st-gloss', label: 'Глоссарий', iconKey: 'book', route: '/student/glossary' },
        { type: 'item', key: 'pvl-st-msg', label: 'Чат с ментором', iconKey: 'messages', route: '/student/messages' },
        { type: 'item', key: 'pvl-st-res', label: 'Результаты', iconKey: 'book', route: '/student/results' },
        { type: 'item', key: 'pvl-st-cert', label: 'Сертификация', iconKey: 'book', route: '/student/certification' },
        { type: 'divider', key: 'pvl-st-d2' },
        { type: 'item', key: 'pvl-st-settings', label: 'Настройки', iconKey: 'dashboard', action: 'settings' },
        { type: 'item', key: 'pvl-st-exit', label: 'Вернуться в сад', iconKey: 'dashboard', action: 'exit_pvl' },
    ];
}

export function buildGardenPvlMentorNav() {
    return [
        { type: 'item', key: 'pvl-men-dash', label: 'Дашборд', iconKey: 'dashboard', route: '/mentor/dashboard' },
        { type: 'item', key: 'pvl-men-mentees', label: 'Мои менти', iconKey: 'users', route: '/mentor/mentees' },
        { type: 'item', key: 'pvl-men-queue', label: 'Очередь проверок', iconKey: 'mentor', route: '/mentor/review-queue' },
        { type: 'divider', key: 'pvl-men-d1' },
        { type: 'item', key: 'pvl-men-about', label: 'О курсе', iconKey: 'book', route: '/mentor/about' },
        { type: 'item', key: 'pvl-men-trk', label: 'Трекер', iconKey: 'tracker', route: '/mentor/tracker' },
        { type: 'item', key: 'pvl-men-prac', label: 'Практикумы', iconKey: 'calendar', route: '/mentor/practicums' },
        { type: 'item', key: 'pvl-men-lib', label: 'Библиотека', iconKey: 'graduation', route: '/mentor/library' },
        { type: 'item', key: 'pvl-men-gloss', label: 'Глоссарий', iconKey: 'book', route: '/mentor/glossary' },
        { type: 'item', key: 'pvl-men-msg', label: 'Чат с менти', iconKey: 'messages', route: '/mentor/messages' },
        { type: 'item', key: 'pvl-men-res', label: 'Результаты', iconKey: 'book', route: '/mentor/results' },
        { type: 'item', key: 'pvl-men-cert', label: 'Сертификация', iconKey: 'book', route: '/mentor/certification' },
        { type: 'divider', key: 'pvl-men-d2' },
        { type: 'item', key: 'pvl-men-settings', label: 'Настройки', iconKey: 'dashboard', action: 'settings' },
        { type: 'item', key: 'pvl-men-exit', label: 'Вернуться в сад', iconKey: 'dashboard', action: 'exit_pvl' },
    ];
}

export function buildGardenPvlAdminNav() {
    return [
        { type: 'item', key: 'pvl-adm-dash', label: 'Дашборд', iconKey: 'dashboard', route: '/admin/pvl' },
        { type: 'divider', key: 'pvl-adm-d0' },
        { type: 'item', key: 'pvl-adm-st', label: 'Ученицы', iconKey: 'users', route: '/admin/students' },
        { type: 'item', key: 'pvl-adm-men', label: 'Менторы', iconKey: 'users', route: '/admin/mentors' },
        { type: 'item', key: 'pvl-adm-content', label: 'Материалы курса', iconKey: 'graduation', route: '/admin/content' },
        { type: 'item', key: 'pvl-adm-cal', label: 'Календарь', iconKey: 'calendar', route: '/admin/calendar' },
        { type: 'divider', key: 'pvl-adm-d1' },
        { type: 'item', key: 'pvl-adm-about', label: 'О курсе', iconKey: 'book', route: '/admin/about' },
        { type: 'item', key: 'pvl-adm-trk', label: 'Трекер', iconKey: 'tracker', route: '/admin/tracker' },
        { type: 'item', key: 'pvl-adm-prac', label: 'Практикумы', iconKey: 'calendar', route: '/admin/practicums' },
        { type: 'item', key: 'pvl-adm-lib', label: 'Библиотека', iconKey: 'graduation', route: '/admin/library' },
        { type: 'item', key: 'pvl-adm-gloss', label: 'Глоссарий', iconKey: 'book', route: '/admin/glossary' },
        { type: 'item', key: 'pvl-adm-res', label: 'Результаты', iconKey: 'book', route: '/admin/results' },
        { type: 'item', key: 'pvl-adm-cert', label: 'Сертификация', iconKey: 'book', route: '/admin/certification' },
        { type: 'divider', key: 'pvl-adm-d2' },
        { type: 'item', key: 'pvl-adm-set', label: 'Настройки', iconKey: 'dashboard', route: '/admin/settings' },
        { type: 'item', key: 'pvl-adm-exit', label: 'Вернуться в сад', iconKey: 'dashboard', action: 'exit_pvl' },
    ];
}

/** Совпадение пункта меню с текущим маршрутом ПВЛ */
export function gardenPvlItemActive(route, item) {
    if (!item?.route || item.type !== 'item') return false;
    if (route === item.route) return true;
    const base = item.route;
    if (base === '/admin/questions' && (route === '/admin/questions' || route === '/admin/qa')) return true;
    if (base === '/admin/students' && /^\/admin\/students(\/|$)/.test(route || '')) return true;
    if (base === '/admin/mentors' && /^\/admin\/mentors(\/|$)/.test(route || '')) return true;
    if (base === '/admin/content') {
        const p = (route || '').split('?')[0];
        return p === '/admin/content' || /^\/admin\/content\/.+/.test(p);
    }
    if (base.endsWith('/library') && route.startsWith(`${base}/`)) return true;
    if (base.endsWith('/results') && route.startsWith(`${base}/`)) return true;
    if (base === '/mentor/mentees' && route.startsWith('/mentor/mentee/')) return true;
    if (base === '/student/about' && route === '/student/onboarding') return true;
    if (base === '/mentor/about' && route === '/mentor/onboarding') return true;
    return false;
}
