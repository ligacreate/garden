export const classifyProdamusEvent = (flat = {}) => {
  const blob = `${flat.event || ''} ${flat.type || ''} ${flat.status || ''} ${flat.payment_status || ''} ${flat.notification_type || ''}`.toLowerCase();
  if (blob.includes('deactivation') || blob.includes('deactivate')) return 'deactivation';
  if (blob.includes('finish') || blob.includes('finished') || blob.includes('ended') || blob.includes('stop')) return 'finish';
  if (blob.includes('auto_payment') || blob.includes('autopayment') || blob.includes('recurrent')) return 'auto_payment';
  if (blob.includes('success') || blob.includes('paid') || blob.includes('payment_success') || blob.includes('completed')) return 'payment_success';
  return 'unknown';
};

export const deriveAccessMutation = ({ eventName, currentAccessStatus }) => {
  const isManualPaused = String(currentAccessStatus || '').toLowerCase() === 'paused_manual';
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
      access_status: isManualPaused ? 'paused_manual' : 'paused_expired',
      bumpSessionVersion: !isManualPaused
    };
  }
  if (eventName === 'finish') {
    return {
      subscription_status: 'finished',
      access_status: isManualPaused ? 'paused_manual' : 'paused_expired',
      bumpSessionVersion: !isManualPaused
    };
  }
  return null;
};
