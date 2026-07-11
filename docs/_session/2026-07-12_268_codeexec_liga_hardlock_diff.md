# DIFF-ON-REVIEW — Жёсткий замок Лиги (неоплата → закрыть платформу)

**Дата:** 2026-07-12
**Автор:** codeexec (VS Code)
**Статус:** DIFF-ON-REVIEW — **НЕ применено.** Ждём 🟢.
**Решение Оли:** платформа = привилегия Лиги; неоплата должна закрывать доступ (разворот дизайна В1 «кабинет-первый»).
**Скоуп (утв.):** роли leader/mentor/intern; grace **3 дня** (единый с TG-киком); **без** session-bump (не нужен — см. ниже).

---

## Кого закроет при включении (превью, read-only, на 2026-07-12)
Ровно **6 истёкших стажёров** (5–40 дней без оплаты): Исламова (06-02), Баженова (06-13), Шайтанова (06-20), Громова (06-24), Ильиных (07-02), Ивашова (07-07). Бартер/годовики (Кокорина, Дегожская) — `exempt`, защищены. Оплаченные 33 — не тронуты. **Переблокировки нет.**

## Почему session-bump НЕ нужен
`session_version` в garden-auth `authMiddleware` **не проверяется** (dormant-поле) → bump = no-op. При этом «разлогин» уже обеспечен иначе: RLS режет данные мгновенно + App.jsx 60-сек поллинг `getCurrentUser()` ([App.jsx:214-232](../../App.jsx#L214)) на `SUBSCRIPTION_EXPIRED` делает `logout()` + экран продления. Итог — заблокированного выкидывает на «продлите» в течение ~минуты, без session_version.

---

## Часть 1 — BACKEND (enforcement). `push-server/server.mjs`, ночной reconcile

После блока «overdue» ([server.mjs:733](../../push-server/server.mjs#L733)) добавить флип `access_status`:
```js
// Жёсткий замок Лиги: истёк > grace → закрыть платформенный доступ.
// access_status='paused_expired' → bridge-триггер ставит status='suspended',
// RLS has_platform_access перестаёт отдавать данные. Реактивация: webhook оплаты
// вернёт access_status='active' (billingLogic handle_payment). Grace единый с
// TG-киком (GRACE_DAYS) — платформа и чат закрываются синхронно.
const ligaLocked = await pool.query(
  `update public.profiles
      set access_status = 'paused_expired'
    where role in ('leader','mentor','intern')
      and access_status = 'active'
      and coalesce(auto_pause_exempt, false) = false
      and paid_until is not null
      and paid_until < now() - ($1 || ' days')::interval
   returning id, name`,
  [String(GRACE_DAYS)]
);
for (const row of ligaLocked.rows || []) {
  await pool.query(
    `insert into public.billing_webhook_logs
       (provider, event_name, external_id, payload_json, signature_valid, is_processed)
     values ($1, 'liga_access_expired', $2, $3::jsonb, true, true)
     on conflict (provider, external_id) where external_id is not null do nothing`,
    [PRODAMUS_PROVIDER_NAME,
     `liga_expired:${row.id}:${new Date().toISOString().slice(0,10)}`,
     JSON.stringify({ profile_id: row.id, name: row.name, source: 'nightly_reconcile_hardlock' })]
  );
}
if ((ligaLocked.rows || []).length > 0) {
  console.info(`[billing-reconcile ${BILLING_TIMEZONE}] LIGA HARD-LOCK paused_expired: ${ligaLocked.rows.length}`);
}
```
+ импорт: `import { GRACE_DAYS } from './tgAccessConst.mjs';` (единый источник grace). Идемпотентно (`access_status='active'` guard — повтор не перезапишет уже закрытых).

## Часть 2 — FRONTEND (замок UX). `services/dataService.js` → `_assertActive`

Заменить no-op на реальную проверку (всё остальное — accessBlock, экран `SUBSCRIPTION_EXPIRED`, 60-сек логаут — уже есть):
```js
_assertActive(profile) {
    // Жёсткий замок Лиги: paused_expired (неоплата) / paused_manual (админ) → блок
    // платформы. Downstream (App.jsx accessBlock/SUBSCRIPTION_EXPIRED + 60с логаут)
    // уже проведён. Админов не трогаем.
    if (!profile || profile.role === 'admin') return profile;
    if (profile.access_status === ACCESS_STATUS.PAUSED_EXPIRED) {
        const err = new Error('Доступ к Лиге приостановлен — продлите подписку, чтобы вернуться.');
        err.code = 'SUBSCRIPTION_EXPIRED';
        err.botRenewUrl = profile.bot_renew_url || null;
        throw err;
    }
    if (profile.access_status === ACCESS_STATUS.PAUSED_MANUAL) {
        const err = new Error('Доступ приостановлен администратором.');
        err.code = 'ACCESS_PAUSED_MANUAL';
        throw err;
    }
    return profile;
}
```
**Проверить при сборке:** ветку `handleLogin` в App.jsx (явный вход) — ловит ли она `SUBSCRIPTION_EXPIRED` в setAccessBlock, как это делает `init` ([App.jsx:191](../../App.jsx#L191)). Если нет — добавить тот же роутинг, чтобы свежий вход истёкшего вёл на экран продления, а не на голую ошибку.

---

## Деплой (после 🟢)
- **Часть 1** (push-server): rsync `server.mjs` (+ проверить импорт GRACE_DAYS) → restart. Замок сработает на ближайшем ночном reconcile (или дёрнуть вручную). Можно включить **сразу**, независимо от фронта.
- **Часть 2** (фронт): сборка + FTP-выкат → ⚠️ **clean-slate = окно 403/даунтайм** ([reference_deploy_clean_slate_downtime]). Планировать в тихое время.
- **Порядок:** сначала фронт (экран готов принять блок), потом backend-флип — чтобы 6 человек сразу попали на чистый «продлите», а не на пустые экраны. ЛИБО backend + сразу фронт в одно окно.

## Откат
- Backend: убрать блок + restart (уже закрытые вернутся в active только при оплате; для ручного возврата — точечный UPDATE access_status='active').
- Frontend: вернуть `_assertActive` в no-op + выкат.

## Проверка результата
- После включения: те 6 → `access_status='paused_expired'`, при входе видят экран продления, данные RLS-закрыты.
- Оплаченные 33 + exempt(2) + админы — доступ не изменился.
- Тест: зайти под истёкшим тест-аккаунтом → экран «продлите»; оплатить → `active` → доступ вернулся.

---

## ✅ ПРИМЕНЕНО 2026-07-12 (по 🟢 «делаем»)
- **Фронт:** `_assertActive` включён, коммит `22603c6`, push → CI `29169299399` **success**, live bundle `index-DMs-2x9j.js` содержит правку (проверено grep'ом «Доступ к Лиге приостановлен»).
- **Backend:** `server.mjs` rsync → `/opt/push-server` (grep hard-lock=1, import GRACE_DAYS=1) → restart. Стартовый reconcile: `[billing-reconcile] LIGA HARD-LOCK paused_expired: 6`.
- **Верификация БД:** 6 закрытых = `paused_expired`+`suspended` (Исламова/Баженова/Шайтанова/Громова/Ильиных/Ивашова); 6 audit-строк `liga_access_expired`; оплаченные 33 + exempt 2 — `active` (не тронуты). Переблокировки нет.
- Порядок соблюдён: фронт live → потом backend-флип, поэтому 6 попадают на чистый экран продления, не на пустые.

**Задеплоено и верифицировано. Откат: убрать блок из server.mjs + restart (+ точечный UPDATE active при нужде); фронт — вернуть _assertActive в no-op + выкат.**
