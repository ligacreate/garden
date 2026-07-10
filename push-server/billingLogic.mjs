// FEAT-015 Path C step 2 (phase30): admin и applicant защищены от автопаузы
// СТРУКТУРНО — они не платят (admin = служебные, applicant = студенты ПВЛ).
// Эта защита работает независимо от флага auto_pause_exempt: даже если флаг
// false, webhook не должен паузить access_status для этих ролей.
// Платящие роли: intern, leader, mentor.
export const isExemptRole = (role) =>
  ['admin', 'applicant'].includes(String(role || '').toLowerCase());

export const classifyProdamusEvent = (flat = {}) => {
  const blob = `${flat.event || ''} ${flat.type || ''} ${flat.status || ''} ${flat.payment_status || ''} ${flat.notification_type || ''}`.toLowerCase();
  if (blob.includes('deactivation') || blob.includes('deactivate')) return 'deactivation';
  if (blob.includes('finish') || blob.includes('finished') || blob.includes('ended') || blob.includes('stop')) return 'finish';
  if (blob.includes('auto_payment') || blob.includes('autopayment') || blob.includes('recurrent')) return 'auto_payment';
  if (blob.includes('success') || blob.includes('paid') || blob.includes('payment_success') || blob.includes('completed')) return 'payment_success';
  return 'unknown';
};

// FEAT-015 BotHunter path: матч по Telegram-username, а не email.
// BotHunter присылает username как «@name», «name» или ссылку
// «https://t.me/name» / «t.me/name». Нормализуем к голому lowercase-логину.
// Инвайт-ссылки (t.me/+XXXXX, t.me/joinchat/XXXXX) — это НЕ username,
// возвращаем null → приёмник отвечает 422. Та же функция применяется к
// profiles.telegram (в проде = «https://t.me/<username>», плюс одна запись
// «t.me/+...», которая нормализуется в null и никогда не матчится).
export const normalizeTelegramUsername = (input) => {
  let s = String(input ?? '').trim();
  if (!s) return null;
  s = s.replace(/^https?:\/\//i, '');           // схема
  s = s.replace(/^(www\.)?(t\.me|telegram\.me|telegram\.dog)\//i, ''); // домен-префикс
  s = s.replace(/^@+/, '');                       // ведущий @
  s = s.split(/[/?#]/)[0].trim();                 // обрезаем path/query/hash и пробелы
  if (!s) return null;
  if (s.startsWith('+')) return null;             // инвайт-ссылка t.me/+XXXX
  const lower = s.toLowerCase();
  if (lower === 'joinchat') return null;          // старый формат инвайта
  if (!/^[a-z0-9_]+$/.test(lower)) return null;   // валидный TG-логин: [a-z0-9_]
  return lower;
};

// BotHunter событие → внутреннее eventName биллинг-логики.
// 'expired' → 'finish' (В1: помечает subscription_status='finished', access_status НЕ трогает).
// 'active'  → 'payment_success' (открывает доступ, paid_until +31д).
export const mapBotHunterEvent = (event) => {
  const e = String(event ?? '').trim().toLowerCase();
  if (e === 'expired') return 'finish';
  if (e === 'active') return 'payment_success';
  return null;
};

export const deriveAccessMutation = ({ eventName, currentAccessStatus }) => {
  const isManualPaused = String(currentAccessStatus || '').toLowerCase() === 'paused_manual';

  // В1 (кабинет-первый): Лига-неоплата больше НЕ трогает access_status, поэтому
  // auto_pause_exempt здесь неактуален (нечего «исключать» — паузы по подписке нет).
  // Платёж (success/auto_payment) открывает доступ и уважает paused_manual.

  if (eventName === 'payment_success' || eventName === 'auto_payment') {
    return {
      subscription_status: 'active',
      access_status: isManualPaused ? 'paused_manual' : 'active',
      bumpSessionVersion: false
    };
  }
  // В1 (кабинет-первый): платформенный доступ (access_status) НЕ зависит от
  // Лига-неоплаты. Лига-доступ = subActive (paid_until). deactivation/finish
  // обновляют только subscription_status (репортинг для напоминаний 1f);
  // access_status: null = «не менять» (SQL применяет coalesce), logout не шлём.
  if (eventName === 'deactivation') {
    return {
      subscription_status: 'deactivated',
      access_status: null,
      bumpSessionVersion: false
    };
  }
  if (eventName === 'finish') {
    return {
      subscription_status: 'finished',
      access_status: null,
      bumpSessionVersion: false
    };
  }
  return null;
};

// ── Товаро-дискриминация Лиги в payload Prodamus (Фаза 3, корневой фикс) ──
// Лига-доступ выдаём ТОЛЬКО за Лига-товар. Все варианты названия содержат
// подстроку «Лига развивающих практиков» (базовый / 30 дней / пропущенные 30 дней).
// Не-Лига («12 месяцев», «Неделя заботы», ПВЛ, книги, Орбита…) её не содержат.
const LIGA_NAME_RE = /лига развивающих практиков/i;

export const isLigaProduct = (payload = {}) =>
  Array.isArray(payload.products) &&
  payload.products.some((p) => LIGA_NAME_RE.test(String(p?.name || '')));

// Похоже ли на Лига-СУММУ (цены планов 1m/3m/6m) — для заметного сигнала, если
// пропускаем платёж с Лига-суммой без совпадения по имени → возможно переименование товара.
const LIGA_PRICES = new Set([2000, 5500, 10000]);
export const looksLikeLigaSum = (payload = {}) => {
  const s = Number(String(payload.sum ?? '').replace(',', '.'));
  return Number.isFinite(s) && LIGA_PRICES.has(Math.round(s));
};
