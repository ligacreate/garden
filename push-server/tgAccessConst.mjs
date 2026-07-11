// Фаза 3 — общие константы TG-доступа (вынесены отдельно, чтобы разорвать
// циклический импорт reconcile ↔ actions).

export const TG_CHANNEL_ID = -1002377682177;
export const TG_CHAT_ID = -1002432957741;
export const LIGA_ROLES = ['intern', 'leader', 'mentor'];
export const RESOURCES = [
  { key: 'channel', id: TG_CHANNEL_ID },
  { key: 'chat', id: TG_CHAT_ID },
];
export const RESOURCE_ID = { channel: TG_CHANNEL_ID, chat: TG_CHAT_ID };

// Grace-период: сколько дней ПОСЛЕ истечения paid_until ещё НЕ кикаем.
// Единый для всех ролей. 1f успевает предупредить → человек продлевает → иначе кик после grace.
// Env-override для тюнинга без передеплоя.
export const GRACE_DAYS = Number(process.env.TG_ACCESS_GRACE_DAYS || 3);
export const graceCutoff = (now) => new Date(now.getTime() - GRACE_DAYS * 24 * 60 * 60 * 1000);
