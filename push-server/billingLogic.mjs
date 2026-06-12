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
// 'expired' → 'finish' (paused_expired, если нет paused_manual/exempt).
// 'active'  → 'payment_success' (открывает доступ, paid_until +31д).
export const mapBotHunterEvent = (event) => {
  const e = String(event ?? '').trim().toLowerCase();
  if (e === 'expired') return 'finish';
  if (e === 'active') return 'payment_success';
  return null;
};

export const deriveAccessMutation = ({ eventName, currentAccessStatus, autoPauseExempt = false }) => {
  const isManualPaused = String(currentAccessStatus || '').toLowerCase() === 'paused_manual';

  // FEAT-015 Path C: auto_pause_exempt — иммунитет к webhook-автопаузе.
  // Платёж (success/auto_payment) проходит как обычно, exempt не мешает.
  // Деактивация (deactivation/finish) логируется в subscription_status,
  // но access_status остаётся 'active'. Стандартный приоритет:
  // exempt > paused_manual > paused_expired.

  if (eventName === 'payment_success' || eventName === 'auto_payment') {
    return {
      subscription_status: 'active',
      access_status: isManualPaused ? 'paused_manual' : 'active',
      bumpSessionVersion: false
    };
  }
  if (eventName === 'deactivation') {
    return {
      subscription_status: 'deactivated',
      access_status: autoPauseExempt
        ? 'active'
        : (isManualPaused ? 'paused_manual' : 'paused_expired'),
      bumpSessionVersion: !autoPauseExempt && !isManualPaused
    };
  }
  if (eventName === 'finish') {
    return {
      subscription_status: 'finished',
      access_status: autoPauseExempt
        ? 'active'
        : (isManualPaused ? 'paused_manual' : 'paused_expired'),
      bumpSessionVersion: !autoPauseExempt && !isManualPaused
    };
  }
  return null;
};
