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
};

export function buildGardenPvlStudentNav() {
    return [
        { type: 'item', key: 'pvl-st-dash', label: 'Дашборд', iconKey: 'dashboard', route: '/student/dashboard' },
        { type: 'divider', key: 'pvl-st-d1' },
        { type: 'item', key: 'pvl-st-about', label: 'О курсе', iconKey: 'book', route: '/student/about' },
        { type: 'item', key: 'pvl-st-onb', label: 'Онбординг', iconKey: 'book', route: '/student/onboarding' },
        { type: 'item', key: 'pvl-st-gloss', label: 'Глоссарий курса', iconKey: 'book', route: '/student/glossary' },
        { type: 'item', key: 'pvl-st-lib', label: 'Библиотека курса', iconKey: 'graduation', route: '/student/library' },
        { type: 'item', key: 'pvl-st-trk', label: 'Трекер курса', iconKey: 'tracker', route: '/student/tracker' },
        { type: 'item', key: 'pvl-st-prac', label: 'Практикумы с менторами', iconKey: 'calendar', route: '/student/practicums' },
        { type: 'item', key: 'pvl-st-res', label: 'Результаты', iconKey: 'book', route: '/student/results' },
        { type: 'item', key: 'pvl-st-cert', label: 'Сертификация и самооценка', iconKey: 'book', route: '/student/certification' },
        { type: 'item', key: 'pvl-st-qa', label: 'Вопросы и ответы', iconKey: 'bell', route: '/student/qa' },
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
        { type: 'item', key: 'pvl-men-onb', label: 'Онбординг', iconKey: 'book', route: '/mentor/onboarding' },
        { type: 'item', key: 'pvl-men-gloss', label: 'Глоссарий курса', iconKey: 'book', route: '/mentor/glossary' },
        { type: 'item', key: 'pvl-men-lib', label: 'Библиотека курса', iconKey: 'graduation', route: '/mentor/library' },
        { type: 'item', key: 'pvl-men-trk', label: 'Трекер курса', iconKey: 'tracker', route: '/mentor/tracker' },
        { type: 'item', key: 'pvl-men-prac', label: 'Практикумы с менторами', iconKey: 'calendar', route: '/mentor/practicums' },
        { type: 'item', key: 'pvl-men-res', label: 'Результаты', iconKey: 'book', route: '/mentor/results' },
        { type: 'item', key: 'pvl-men-cert', label: 'Сертификация и самооценка', iconKey: 'book', route: '/mentor/certification' },
        { type: 'item', key: 'pvl-men-qa', label: 'Вопросы и ответы', iconKey: 'bell', route: '/mentor/qa' },
        { type: 'divider', key: 'pvl-men-d2' },
        { type: 'item', key: 'pvl-men-settings', label: 'Настройки', iconKey: 'dashboard', action: 'settings' },
        { type: 'item', key: 'pvl-men-exit', label: 'Вернуться в сад', iconKey: 'dashboard', action: 'exit_pvl' },
    ];
}

export function buildGardenPvlAdminNav() {
    return [
        { type: 'item', key: 'pvl-adm-home', label: 'Учительская ПВЛ', iconKey: 'dashboard', route: '/admin/pvl' },
        { type: 'item', key: 'pvl-adm-dash', label: 'Сводка', iconKey: 'dashboard', route: '/admin/dashboard' },
        { type: 'item', key: 'pvl-adm-st', label: 'Ученицы', iconKey: 'users', route: '/admin/students' },
        { type: 'item', key: 'pvl-adm-rev', label: 'Проверки и риски', iconKey: 'mentor', route: '/admin/review' },
        { type: 'item', key: 'pvl-adm-men', label: 'Менторы', iconKey: 'users', route: '/admin/mentors' },
        { type: 'item', key: 'pvl-adm-coh', label: 'Потоки', iconKey: 'calendar', route: '/admin/cohorts' },
        { type: 'item', key: 'pvl-adm-cert', label: 'Сертификация', iconKey: 'book', route: '/admin/certification' },
        { type: 'item', key: 'pvl-adm-qa', label: 'Вопросы учениц', iconKey: 'bell', route: '/admin/qa-moderation' },
        { type: 'item', key: 'pvl-adm-content', label: 'Материалы курса', iconKey: 'graduation', route: '/admin/content' },
        { type: 'item', key: 'pvl-adm-set', label: 'Настройки', iconKey: 'dashboard', route: '/admin/settings' },
        { type: 'divider', key: 'pvl-adm-d1' },
        { type: 'item', key: 'pvl-adm-settings', label: 'Настройки сада', iconKey: 'dashboard', action: 'settings' },
        { type: 'item', key: 'pvl-adm-exit', label: 'Вернуться в сад', iconKey: 'dashboard', action: 'exit_pvl' },
    ];
}

/** Совпадение пункта меню с текущим маршрутом ПВЛ */
export function gardenPvlItemActive(route, item) {
    if (!item?.route || item.type !== 'item') return false;
    if (route === item.route) return true;
    const base = item.route;
    if (base.endsWith('/library') && route.startsWith(`${base}/`)) return true;
    if (base.endsWith('/results') && route.startsWith(`${base}/`)) return true;
    if (base === '/mentor/mentees' && route.startsWith('/mentor/mentee/')) return true;
    return false;
}
