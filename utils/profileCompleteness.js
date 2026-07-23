/**
 * Единый источник правды: какие поля профиля обязательны, чего не хватает
 * конкретному человеку и насколько профиль заполнен.
 *
 * Отсюда питаются ОБА места, где это видно пользователю:
 *   • напоминалка о незаполненном профиле (UserApp) — getMissingProfileLabels
 *   • процент заполненности в профиле (ProfileView) — getProfileCompletionPercent
 * Раньше ProfileView считал свой набор из 7 полей (с unique_abilities и
 * join_date, но без telegram_user_id) и мог показать «заполнен на 100%» рядом с
 * «не хватает привязки Telegram». Новые поля добавлять только здесь, иначе
 * рассинхрон вернётся.
 */
import { ROLES } from './roles';

// Обязательные поля по ролям (согласовано 2026-07-23).
// Абитуриент ещё не ведущая: страницы ведущей у него нет, поэтому с него не
// спрашиваем компетенции и «что могу предложить».
const REQUIRED_FULL = ['name', 'city', 'avatar_url', 'skills', 'offer', 'telegram_user_id'];
const REQUIRED_APPLICANT = ['name', 'city', 'avatar_url', 'telegram_user_id'];

/**
 * Формулировки Оли (утверждено 2026-07-23). Весь пользовательский текст
 * напоминалки собран здесь, чтобы правка была в одном месте и не размазывалась
 * по разметке.
 */
export const PROFILE_REMINDER_COPY = {
    title: 'Расскажите о себе',
    intro: 'В Саду ведущие находят друг друга по профилю — зовут в пары, приглашают на встречи. Город нужен, чтобы вас нашли те, кто рядом.',
    missingIntro: 'Пока не хватает:',
    primaryAction: 'Заполнить профиль',
    dismissAction: 'Больше не показывать',
};

/** Подписи полей — как они называются в форме профиля. */
export const FIELD_LABELS = {
    name: 'Имя и фамилия',
    city: 'Город',
    avatar_url: 'Фото профиля',
    skills: 'Мои компетенции',
    offer: 'Что могу предложить',
    telegram_user_id: 'Привязка Telegram',
};

export const getRequiredFields = (role) =>
    String(role || '').toLowerCase() === ROLES.APPLICANT ? REQUIRED_APPLICANT : REQUIRED_FULL;

const isFilled = (user, field) => {
    if (field === 'skills') return Array.isArray(user?.skills) && user.skills.length > 0;
    // _normalizeProfile отдаёт и avatar_url, и производный avatar — проверяем оба.
    if (field === 'avatar_url') return String(user?.avatar_url || user?.avatar || '').trim() !== '';
    // telegram_user_id — bigint, приходит числом или строкой; 0 не бывает.
    if (field === 'telegram_user_id') return String(user?.telegram_user_id ?? '').trim() !== '';
    return String(user?.[field] ?? '').trim() !== '';
};

/** Ключи незаполненных обязательных полей. */
export const getMissingProfileFields = (user) =>
    user ? getRequiredFields(user.role).filter((field) => !isFilled(user, field)) : [];

/** Подписи незаполненных полей — чтобы перечислить их поимённо в уведомлении. */
export const getMissingProfileLabels = (user) =>
    getMissingProfileFields(user).map((field) => FIELD_LABELS[field] || field);

/** Показывать ли напоминалку: чего-то не хватает и человек её ещё не закрывал. */
export const shouldShowProfileReminder = (user) =>
    Boolean(user) && !user.profile_reminder_dismissed_at && getMissingProfileFields(user).length > 0;

/**
 * Процент заполненности профиля — считается по ТЕМ ЖЕ обязательным полям, что и
 * напоминалка. Раньше ProfileView считал свой набор (с unique_abilities и
 * join_date, без telegram_user_id), из-за чего можно было увидеть «заполнен на
 * 100%» рядом с «не хватает привязки Telegram». Два числа, противоречащих друг
 * другу, обесценивают оба — поэтому источник один.
 */
export const getProfileCompletionPercent = (user) => {
    const required = getRequiredFields(user?.role);
    if (!user || required.length === 0) return 0;
    const filled = required.filter((field) => isFilled(user, field)).length;
    return Math.round((filled / required.length) * 100);
};
