/**
 * Сообщество Лиги в Telegram — ссылки и правило «кому показывать вход».
 *
 * Единственный источник правды для фронта: и дашборд, и профиль берут
 * ссылки и условие показа отсюда. Раньше ссылки лежали константами внутри
 * ProfileView, вход был виден только там — люди его не находили.
 *
 * Ссылки — standing invite со включённым «Заявка на вступление»: клик
 * создаёт chat_join_request, бот-поллер (push-server/tgAccessJoinPoller.mjs)
 * решает, впускать ли. Правило впуска у бота: профиль найден (по
 * telegram_user_id, иначе по @username из поля telegram) И не
 * paused_manual И (бартерная льгота ИЛИ оплачено до будущей даты).
 * isLigaCommunityMember повторяет это правило один в один — чтобы на
 * платформе не появлялась кнопка, по которой заявка заведомо повиснет.
 */

export const LIGA_TG_CHANNEL_URL = 'https://t.me/+dVRWs_cl2VA3OTVi';
export const LIGA_TG_CHAT_URL = 'https://t.me/+GH0sjSaUzOc2N2Zi';

/** Роли, которые бот держит в канале и чате Лиги (= LIGA_ROLES в push-server/tgAccessConst.mjs). */
export const LIGA_ROLES = ['intern', 'leader', 'mentor'];

/** Привязан ли Telegram — только по числовому id, который проставляет бот. */
export const hasTelegramLinked = (user) => String(user?.telegram_user_id ?? '').trim() !== '';

/**
 * Показывать ли человеку вход в сообщество.
 * Зеркалит shouldAdmit из push-server/tgAccessJoinPoller.mjs.
 */
export const isLigaCommunityMember = (user) => {
    const role = String(user?.role || '').toLowerCase();
    if (!LIGA_ROLES.includes(role)) return false;
    if (String(user?.access_status || '') === 'paused_manual') return false;
    if (user?.auto_pause_exempt === true) return true;
    const paidUntil = user?.paid_until ? new Date(user.paid_until) : null;
    return Boolean(paidUntil && !Number.isNaN(paidUntil.getTime()) && paidUntil.getTime() >= Date.now());
};
