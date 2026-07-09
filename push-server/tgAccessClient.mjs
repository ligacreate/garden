// Фаза 3 — TG Bot API клиент для управления доступом в канал/чат Лиги.
//
// ВАЖНО (shadow): здесь ТОЛЬКО read-методы (getChat, getChatMember).
// Мутирующие методы (banChatMember/unbanChatMember/approveChatJoinRequest)
// СОЗНАТЕЛЬНО не реализованы — добавим отдельным диффом на этапе live,
// вместе с таблицей идемпотентности действий. Пока их нет физически, поэтому
// shadow-прогон не может ничего изменить в Telegram даже по ошибке.
//
// Токен: TG_ACCESS_BOT_TOKEN (@ligagardenbot). В push-server сейчас исходящего
// TG нет — это первый TG-клиент. Не путать с TG_NOTIFICATIONS_BOT_TOKEN
// (garden-auth, уведомления о ДЗ) — другой бот, другая задача.

const api = (token, method) => `https://api.telegram.org/bot${token}/${method}`;

async function tgGet(token, method, params) {
  const res = await fetch(api(token, method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  // Telegram всегда отдаёт JSON: { ok:true, result } | { ok:false, error_code, description }
  return res.json();
}

/**
 * Клиент доступа. Только чтение. Мутирующих методов нет by design.
 */
export function makeTgAccessClient(token) {
  if (!token) throw new Error('TG_ACCESS_BOT_TOKEN не задан');
  return {
    getMe: () => tgGet(token, 'getMe', {}),
    getChat: (chatId) => tgGet(token, 'getChat', { chat_id: chatId }),
    getChatMember: (chatId, userId) =>
      tgGet(token, 'getChatMember', { chat_id: chatId, user_id: userId }),
  };
}

// Статусы участника, означающие «реально в чате/канале».
const PRESENT = new Set(['creator', 'administrator', 'member']);

/**
 * По результату getChatMember определяет, находится ли юзер в ресурсе.
 * left/kicked → нет. restricted → только если is_member=true (ещё в чате, но ограничен).
 */
export function isInChat(memberResult) {
  const st = memberResult?.status;
  if (!st) return false;
  if (st === 'restricted') return memberResult.is_member === true;
  return PRESENT.has(st);
}
