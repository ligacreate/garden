/**
 * Единый источник правды: какие поля профиля обязательны и чего не хватает
 * конкретному человеку. Используется напоминалкой о незаполненном профиле.
 *
 * ВНИМАНИЕ про рассинхрон: в ProfileView есть свой calculateProgress() с ДРУГИМ
 * набором полей (там ещё unique_abilities и join_date, но нет telegram_user_id).
 * Наборы разные намеренно — прогресс-бар в этой задаче не трогали. Если решим
 * свести к одному источнику, прогресс-бар должен переиспользовать
 * getRequiredFields() отсюда, а не считать свой список.
 */
import { ROLES } from './roles';

// Обязательные поля по ролям (согласовано 2026-07-23).
// Абитуриент ещё не ведущая: страницы ведущей у него нет, поэтому с него не
// спрашиваем компетенции и «что могу предложить».
const REQUIRED_FULL = ['name', 'city', 'avatar_url', 'skills', 'offer', 'telegram_user_id'];
const REQUIRED_APPLICANT = ['name', 'city', 'avatar_url', 'telegram_user_id'];

/**
 * ЧЕРНОВИК формулировок — финальный текст даёт Оля.
 * Весь пользовательский текст напоминалки собран здесь, чтобы правка была в
 * одном месте и не размазывалась по разметке.
 */
export const PROFILE_REMINDER_COPY = {
    title: 'Заполните профиль',
    intro: 'Профиль виден другим ведущим в Саду — по нему вас находят и зовут в пары и на встречи. Город важен, чтобы понимали, где вы проводите встречи.',
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
