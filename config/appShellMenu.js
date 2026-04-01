import {
    LayoutGrid,
    CalendarRange,
    Map as MapIcon,
    BookOpen,
    Sparkles,
    GraduationCap,
    MessagesSquare,
    Users
} from 'lucide-react';
import { ROLES, hasAccess } from '../utils/roles';

export const APP_SHELL = {
    GARDEN: 'garden',
    STUDENT: 'studentCabinet',
    MENTOR: 'mentorCabinet',
    TEACHERS: 'teachersRoom'
};

export const resolveShellByView = (view) => {
    if (view === 'pvl-student') return APP_SHELL.STUDENT;
    if (view === 'mentor-dashboard') return APP_SHELL.MENTOR;
    if (view === 'communications') return APP_SHELL.TEACHERS;
    return APP_SHELL.GARDEN;
};

export const buildShellMenu = (role, isAdmin) => {
    const items = {
        [APP_SHELL.GARDEN]: [
            { key: 'dashboard', label: 'Дашборд', icon: LayoutGrid },
            { key: 'meetings', label: 'Встречи', icon: CalendarRange },
            { key: 'map', label: 'Сад ведущих', icon: MapIcon },
            { key: 'practices', label: 'Практики', icon: BookOpen },
            { key: 'builder', label: 'Сценарии', icon: Sparkles },
            { key: 'library', label: 'Библиотека', icon: GraduationCap },
            ...(isAdmin ? [{ key: 'communications', label: 'Учительская', icon: MessagesSquare }] : []),
            ...(hasAccess(role, ROLES.INTERN) ? [{ key: 'crm', label: 'Люди CRM', icon: Users }] : [])
        ],
        [APP_SHELL.STUDENT]: [
            { key: 'pvl-student', label: 'Личный кабинет', icon: GraduationCap }
        ],
        [APP_SHELL.MENTOR]: [
            { key: 'mentor-dashboard', label: 'Кабинет ментора', icon: Users },
            { key: 'meetings', label: 'Встречи', icon: CalendarRange },
            { key: 'library', label: 'Библиотека', icon: GraduationCap }
        ],
        [APP_SHELL.TEACHERS]: [
            { key: 'communications', label: 'Учительская', icon: MessagesSquare }
        ]
    };
    return items;
};
