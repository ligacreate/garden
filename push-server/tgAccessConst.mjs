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
