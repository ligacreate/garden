export const getCostAmount = (cost) => {
  const match = String(cost || '').match(/\d+/);
  return match ? match[0] : '';
};

export const getCostCurrency = (cost, fallback = 'рублей') => {
  const parts = String(cost || '').split(' ');
  return parts[1] || fallback;
};
