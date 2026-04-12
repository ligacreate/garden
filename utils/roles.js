// Определение ролей и их иерархии
export const ROLES = {
    APPLICANT: 'applicant', // Уровень 0: Только вход и обучение
    INTERN: 'intern',       // Уровень 1: Внесение встреч (стажировка)
    LEADER: 'leader',       // Уровень 2: Полный доступ (Магазин, CRM)
    MENTOR: 'mentor',       // Уровень 3: Может обучать
    CURATOR: 'curator',     // Уровень 4: Управляет регионом
    ADMIN: 'admin',         // Уровень 99: Бог системы
};

// Конфигурация для UI и логики
export const ROLES_CONFIG = {
    [ROLES.APPLICANT]: { label: 'Абитуриент', level: 0, color: 'text-slate-500', bg: 'bg-slate-50' },
    [ROLES.INTERN]: { label: 'Стажер', level: 1, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    [ROLES.LEADER]: { label: 'Ведущая', level: 2, color: 'text-blue-600', bg: 'bg-blue-50' },
    [ROLES.MENTOR]: { label: 'Ментор', level: 3, color: 'text-purple-600', bg: 'bg-purple-50' },
    [ROLES.CURATOR]: { label: 'Куратор', level: 4, color: 'text-rose-600', bg: 'bg-rose-50' },
    [ROLES.ADMIN]: { label: 'Главный садовник', level: 99, color: 'text-blue-800', bg: 'bg-blue-100' },
};

/**
 * Проверяет, достаточно ли у пользователя прав
 * @param {string} userRole - текущая роль пользователя (напр. 'intern')
 * @param {string} requiredRole - минимально необходимая роль (напр. 'leader')
 * @returns {boolean}
 */
export const hasAccess = (userRole, requiredRole) => {
    const userLevel = ROLES_CONFIG[userRole]?.level || 0;
    const requiredLevel = ROLES_CONFIG[requiredRole]?.level || 0;

    return userLevel >= requiredLevel;
};

export const getRoleLabel = (role) => ROLES_CONFIG[role]?.label || role;
export const getRoleColor = (role) => ROLES_CONFIG[role]?.color || 'text-slate-500';
export const getRoleBg = (role) => ROLES_CONFIG[role]?.bg || 'bg-slate-50';
