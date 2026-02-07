const pluralizeYears = (n) => {
  const lastDigit = n % 10;
  const lastTwoDigits = n % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return 'лет';
  if (lastDigit === 1) return 'год';
  if (lastDigit >= 2 && lastDigit <= 4) return 'года';
  return 'лет';
};

export const getTenureText = (joinDate) => {
  if (!joinDate) return null;
  const start = new Date(joinDate);
  if (Number.isNaN(start.getTime())) return null;
  const now = new Date();
  const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));

  if (diffDays < 30) return 'Новичок';
  const totalMonths = Math.floor(diffDays / 30.44);
  if (totalMonths < 12) return `${totalMonths} мес. в Лиге`;

  const years = Math.floor(totalMonths / 12);
  const remMonths = totalMonths % 12;
  const yearWord = pluralizeYears(years);
  if (remMonths === 0) return `${years} ${yearWord} в Лиге`;
  return `${years} ${yearWord} ${remMonths} мес. в Лиге`;
};

export const getTenureParts = (joinDate) => {
  if (!joinDate) return { value: 1, label: 'дн.' };
  const start = new Date(joinDate);
  if (Number.isNaN(start.getTime())) return { value: 1, label: 'дн.' };
  const now = new Date();
  const diffTime = now - start;
  const diffDays = Math.max(1, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

  if (diffDays < 30) return { value: diffDays, label: 'дн.' };
  const months = Math.floor(diffDays / 30.44);
  if (months < 12) return { value: months, label: 'мес.' };

  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (remMonths === 0) return { value: years, label: 'лет' };
  return { value: `${years}.${remMonths}`, label: 'лет' };
};
