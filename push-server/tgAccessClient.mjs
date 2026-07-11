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

import https from 'node:https';

const TG_HOST = 'api.telegram.org';

// IPv4-only (family:4): IPv6 к api.telegram.org с этого сервера = ENETUNREACH.
// Голый fetch через happy-eyeballs Node 20 иногда шёл по IPv6 → 'fetch failed'
// (флак long-poll getUpdates). Тот же обход, что garden-auth httpsPostJson.
// Контракт прежний: резолвит распарсенный JSON { ok:true, result } |
// { ok:false, error_code, description }; на сети/таймауте — reject (как fetch).
function tgGet(token, method, params) {
  const body = JSON.stringify(params);
  // getUpdates — long-poll: держим сокет чуть дольше его timeout; прочие — быстрые.
  const timeoutMs = method === 'getUpdates'
    ? (Number(params?.timeout) || 30) * 1000 + 5000
    : 15000;
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: TG_HOST,
      path: `/bot${token}/${method}`,
      method: 'POST',
      family: 4,
      timeout: timeoutMs,
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`TG ${method} bad JSON: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`TG ${method} timeout`)));
    req.write(body);
    req.end();
  });
}

/**
 * Клиент доступа.
 *   - READ (всегда): getMe, getChat, getChatMember, getUpdates.
 *   - MUTATING (вызываются ТОЛЬКО из executor'а при mode∈{admit,live}, см. tgAccessReconcile):
 *     banChatMember, unbanChatMember, kickChatMember(=ban+unban), approveChatJoinRequest,
 *     declineChatJoinRequest, createChatInviteLink.
 * Мутирующие методы физически недоступны, пока mode=off/shadow (executor их не зовёт).
 */
export function makeTgAccessClient(token) {
  if (!token) throw new Error('TG_ACCESS_BOT_TOKEN не задан');
  const client = {
    // ── READ ──
    getMe: () => tgGet(token, 'getMe', {}),
    getChat: (chatId) => tgGet(token, 'getChat', { chat_id: chatId }),
    getChatMember: (chatId, userId) =>
      tgGet(token, 'getChatMember', { chat_id: chatId, user_id: userId }),
    getUpdates: (params = {}) => tgGet(token, 'getUpdates', params), // для poller'а заявок

    // ── MUTATING ──
    banChatMember: (chatId, userId) =>
      tgGet(token, 'banChatMember', { chat_id: chatId, user_id: userId }),
    unbanChatMember: (chatId, userId) =>
      tgGet(token, 'unbanChatMember', { chat_id: chatId, user_id: userId, only_if_banned: true }),
    approveChatJoinRequest: (chatId, userId) =>
      tgGet(token, 'approveChatJoinRequest', { chat_id: chatId, user_id: userId }),
    declineChatJoinRequest: (chatId, userId) =>
      tgGet(token, 'declineChatJoinRequest', { chat_id: chatId, user_id: userId }),
    createChatInviteLink: (chatId, opts = {}) =>
      tgGet(token, 'createChatInviteLink', { chat_id: chatId, ...opts }),

    // KICK = ban + unban: удалить, но НЕ в чёрный список (по оплате сможет вернуться).
    async kickChatMember(chatId, userId) {
      const ban = await this.banChatMember(chatId, userId);
      if (!ban.ok) return { ok: false, step: 'ban', ban };
      const unban = await this.unbanChatMember(chatId, userId);
      return { ok: unban.ok, step: unban.ok ? 'done' : 'unban', ban, unban };
    },
  };
  return client;
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
