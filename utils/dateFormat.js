const MONTHS_RU = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря'
];

const parseDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const normalized = String(value).replace(' ', 'T');
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
};

export const formatDateRu = (value) => {
    const d = parseDate(value);
    if (!d) return '—';
    const day = String(d.getDate()).padStart(2, '0');
    return `${day} ${MONTHS_RU[d.getMonth()]}`;
};

export const formatDateTimeRu = (value) => {
    const d = parseDate(value);
    if (!d) return '—';
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${formatDateRu(d)}, ${hours}:${minutes}`;
};
