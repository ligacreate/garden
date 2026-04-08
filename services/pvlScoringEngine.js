/**
 * Бальная система ПВЛ 2026 (бриф): курсовые баллы и СЗ раздельно.
 * Используется pvlMockApi / calculatePointsSummary и документирует правила для SQL-слоя.
 */
import { SCORING_RULES } from '../data/pvl/scoringRules';

export const COURSE_POINT_SOURCES = Object.freeze({
    ONBOARDING: 'onboarding',
    WEEK_COMPLETION: 'week_completion',
    CONTROL_POINT: 'control_point',
    MENTOR_BONUS: 'mentor_bonus',
    MANUAL_BONUS: 'manual_bonus',
    LIBRARY_MATERIAL: 'library_material',
    OTHER: 'other',
});

/**
 * Модуль 0: +20 при закрытии (онбординг).
 * Модули 1–4 (этапы 1–12): +20 за полностью закрытый этап, суммарно не более 240.
 */
export function pointsForWeek0Closed(isClosed) {
    return isClosed ? SCORING_RULES.WEEK0_POINTS : 0;
}

export function pointsForClosedWeeks1to12(closedCount) {
    const capped = Math.min(Math.max(0, closedCount), 12);
    return Math.min(capped * SCORING_RULES.WEEK_CLOSURE_POINTS, 240);
}

/** 9 КТ × 10, потолок 90 */
export function pointsForAcceptedControlPoints(acceptedCount) {
    const capped = Math.min(Math.max(0, acceptedCount), 9);
    return Math.min(capped * SCORING_RULES.CONTROL_POINT_POINTS, 90);
}

/** Ручной бонус ментора входит в пул 50 */
export function capMentorBonusPool(rawBonusSum) {
    return Math.min(Math.max(0, rawBonusSum), SCORING_RULES.MENTOR_BONUS_POOL_MAX);
}

export function capCourseTotal(rawSum) {
    return Math.min(rawSum, SCORING_RULES.COURSE_POINTS_MAX);
}

export function capSzSelf(points) {
    return Math.min(Math.max(0, points), SCORING_RULES.SZ_POINTS_MAX);
}

export function capSzMentor(points) {
    return Math.min(Math.max(0, points), SCORING_RULES.SZ_POINTS_MAX);
}

/**
 * Итог курсовых баллов (без СЗ).
 * @param {{ week0Closed: boolean, closedWeeks1to12: number, acceptedControlPoints: number, mentorBonusSum: number }} input
 */
export function computeCoursePointsTotal(input) {
    const w0 = pointsForWeek0Closed(!!input.week0Closed);
    const w112 = pointsForClosedWeeks1to12(input.closedWeeks1to12 || 0);
    const cp = pointsForAcceptedControlPoints(input.acceptedControlPoints || 0);
    const bonus = capMentorBonusPool(input.mentorBonusSum || 0);
    return capCourseTotal(w0 + w112 + cp + bonus);
}

export function computeCourseBreakdown(input) {
    const week0Points = pointsForWeek0Closed(!!input.week0Closed);
    const weeksPoints = pointsForClosedWeeks1to12(input.closedWeeks1to12 || 0);
    const controlPointsTotal = pointsForAcceptedControlPoints(input.acceptedControlPoints || 0);
    const mentorBonusTotal = capMentorBonusPool(input.mentorBonusSum || 0);
    const coursePointsTotal = capCourseTotal(week0Points + weeksPoints + controlPointsTotal + mentorBonusTotal);
    return {
        week0Points,
        weeksPoints,
        controlPointsTotal,
        mentorBonusTotal,
        coursePointsTotal,
        rawSumBeforeCap: week0Points + weeksPoints + controlPointsTotal + mentorBonusTotal,
    };
}
