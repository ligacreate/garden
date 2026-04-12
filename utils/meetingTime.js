import { DEFAULT_TIMEZONE, resolveCityTimezone } from './timezone';

const getTimeZoneOffsetMinutes = (date, timeZone) => {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    const parts = dtf.formatToParts(date);
    const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
    const asUtc = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
    return (asUtc - date.getTime()) / 60000;
};

const getZonedDate = (dateStr, timeStr, timeZone) => {
    if (!dateStr || !timeStr || !timeZone) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hh, mm] = timeStr.split(':').map(Number);
    const utcGuess = new Date(Date.UTC(y, m - 1, d, hh, mm));
    const offset = getTimeZoneOffsetMinutes(utcGuess, timeZone);
    return new Date(utcGuess.getTime() - offset * 60000);
};

export const getMeetingTimezone = (meeting, fallbackTz) => {
    const viewerTz = fallbackTz || DEFAULT_TIMEZONE;
    const cityTz = resolveCityTimezone(meeting?.city, null);
    return cityTz || meeting?.timezone || viewerTz;
};

export const getMeetingInstant = (meeting, fallbackTz) => {
    if (!meeting?.date || !meeting?.time) return null;
    const meetingTimezone = getMeetingTimezone(meeting, fallbackTz);
    return getZonedDate(meeting.date, meeting.time, meetingTimezone);
};

export const isMeetingPast = (meeting, now = new Date()) => {
    if (!meeting?.date) return false;
    if (meeting?.time) {
        const meetingInstant = getMeetingInstant(meeting);
        if (meetingInstant) return meetingInstant.getTime() < now.getTime();
    }
    const meetingDay = new Date(`${meeting.date}T00:00:00`);
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    return meetingDay < startOfToday;
};
