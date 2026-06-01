/**
 * Чистые transform/normalize-функции, общие для pvlMockApi и pvlPostgrestApi.
 * Без побочных эффектов и без зависимостей от среды — единый источник правды,
 * чтобы копии не расходились между mock- и PostgREST-реализациями.
 */

/** RFC-подобный UUID (в т.ч. v6/v7/v8 из auth/БД); строгая проверка версии ломала сохранение профилей. */
export function isUuidString(v) {
    if (v == null || v === '') return false;
    const s = String(v).trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
