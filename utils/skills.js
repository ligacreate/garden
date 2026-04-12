export const normalizeSkills = (...values) => {
  const raw = values.flatMap((val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') return val.split(',');
    return [];
  });

  const flat = raw
    .flatMap((tag) => String(tag).split(','))
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  return [...new Set(flat)];
};
