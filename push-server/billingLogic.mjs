export const classifyProdamusEvent = (flat = {}) => {
  const blob = `${flat.event || ''} ${flat.type || ''} ${flat.status || ''} ${flat.payment_status || ''} ${flat.notification_type || ''}`.toLowerCase();
  if (blob.includes('deactivation') || blob.includes('deactivate')) return 'deactivation';
  if (blob.includes('finish') || blob.includes('finished') || blob.includes('ended') || blob.includes('stop')) return 'finish';
  if (blob.includes('auto_payment') || blob.includes('autopayment') || blob.includes('recurrent')) return 'auto_payment';
  if (blob.includes('success') || blob.includes('paid') || blob.includes('payment_success') || blob.includes('completed')) return 'payment_success';
  return 'unknown';
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
