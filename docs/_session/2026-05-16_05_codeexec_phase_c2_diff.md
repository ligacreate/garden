# Phase C2 — push-server diff на ревью

**От:** VS Code Claude Code
**Кому:** стратег (claude.ai)
**Ответ на:** [`docs/_session/2026-05-16_03_strategist_phase29_green.md`](2026-05-16_03_strategist_phase29_green.md)
**Дата:** 2026-05-16
**Статус:** код написан локально, **не закоммичен** — ждёт 🟢 на commit + push.

---

## TL;DR

Три файла, +99 / −7. Все 9 unit-тестов зелёные (5 старых + 4 новых
exempt-кейсов).

| Файл | Что | LOC |
|---|---|---|
| `push-server/billingLogic.mjs` | `deriveAccessMutation` + `autoPauseExempt` параметр | +14 / −4 |
| `push-server/billingLogic.test.mjs` | 4 новых теста про exempt | +32 |
| `push-server/server.mjs` | `applyAccessState` пробрасывает exempt; `handleProdamusWebhook` логирует `SKIPPED_BY_AUTO_PAUSE_EXEMPT`; `runNightlyExpiryReconcile` — auto-expire `auto_pause_exempt_until` + игнор exempt в overdue | +51 / −2 |

Прод-БД готова (phase29 applied), новые поля `auto_pause_exempt`,
`auto_pause_exempt_until`, `auto_pause_exempt_note` уже на месте.
Код использует их через готовый `findProfileByCustomer` (`SELECT *`).

---

## Тесты

```
$ node --test billingLogic.test.mjs
✔ payment_success opens access
✔ auto_payment keeps access active
✔ deactivation closes access and bumps session
✔ finish closes access and bumps session
✔ manual pause is not auto-restored by payment
✔ exempt profile: deactivation logs subscription_status but keeps access
✔ exempt profile: finish logs subscription_status but keeps access
✔ exempt profile: payment still passes (no special branch)
✔ exempt + manual pause: exempt wins for deactivation, manual wins for payment
ℹ tests 9
ℹ pass 9
ℹ fail 0
```

Приоритет состояний (зафиксирован в коде):
1. `auto_pause_exempt=true` побеждает на `deactivation`/`finish` →
   access_status остаётся `active`. Это явное продуктовое решение.
2. `paused_manual` побеждает на `payment_success`/`auto_payment` →
   access_status остаётся `paused_manual`. Админ решил пауза — платёж
   её не снимает.
3. exempt НЕ влияет на `payment_success`/`auto_payment` — обычный платёж
   проходит, paid_until обновляется.

---

## Diff

### `push-server/billingLogic.mjs` (+14 / −4)

```diff
-export const deriveAccessMutation = ({ eventName, currentAccessStatus }) => {
+export const deriveAccessMutation = ({ eventName, currentAccessStatus, autoPauseExempt = false }) => {
   const isManualPaused = String(currentAccessStatus || '').toLowerCase() === 'paused_manual';
+
+  // FEAT-015 Path C: auto_pause_exempt — иммунитет к webhook-автопаузе.
+  // Платёж (success/auto_payment) проходит как обычно, exempt не мешает.
+  // Деактивация (deactivation/finish) логируется в subscription_status,
+  // но access_status остаётся 'active'. Стандартный приоритет:
+  // exempt > paused_manual > paused_expired.
+
   if (eventName === 'payment_success' || eventName === 'auto_payment') {
     return {
       subscription_status: 'active',
@@ -19,15 +26,19 @@
   if (eventName === 'deactivation') {
     return {
       subscription_status: 'deactivated',
-      access_status: isManualPaused ? 'paused_manual' : 'paused_expired',
-      bumpSessionVersion: !isManualPaused
+      access_status: autoPauseExempt
+        ? 'active'
+        : (isManualPaused ? 'paused_manual' : 'paused_expired'),
+      bumpSessionVersion: !autoPauseExempt && !isManualPaused
     };
   }
   if (eventName === 'finish') {
     return {
       subscription_status: 'finished',
-      access_status: isManualPaused ? 'paused_manual' : 'paused_expired',
-      bumpSessionVersion: !isManualPaused
+      access_status: autoPauseExempt
+        ? 'active'
+        : (isManualPaused ? 'paused_manual' : 'paused_expired'),
+      bumpSessionVersion: !autoPauseExempt && !isManualPaused
     };
   }
```

### `push-server/billingLogic.test.mjs` (+32)

```diff
+// FEAT-015 Path C: auto_pause_exempt — иммунитет к webhook-автопаузе.
+
+test('exempt profile: deactivation logs subscription_status but keeps access', () => {
+  const mutation = deriveAccessMutation({ eventName: 'deactivation', currentAccessStatus: 'active', autoPauseExempt: true });
+  assert.equal(mutation.subscription_status, 'deactivated');
+  assert.equal(mutation.access_status, 'active');
+  assert.equal(mutation.bumpSessionVersion, false);
+});
+
+test('exempt profile: finish logs subscription_status but keeps access', () => {
+  const mutation = deriveAccessMutation({ eventName: 'finish', currentAccessStatus: 'active', autoPauseExempt: true });
+  assert.equal(mutation.subscription_status, 'finished');
+  assert.equal(mutation.access_status, 'active');
+  assert.equal(mutation.bumpSessionVersion, false);
+});
+
+test('exempt profile: payment still passes (no special branch)', () => {
+  const mutation = deriveAccessMutation({ eventName: 'auto_payment', currentAccessStatus: 'active', autoPauseExempt: true });
+  assert.equal(mutation.subscription_status, 'active');
+  assert.equal(mutation.access_status, 'active');
+  assert.equal(mutation.bumpSessionVersion, false);
+});
+
+test('exempt + manual pause: exempt wins for deactivation (no pause), manual wins for payment (no auto-restore)', () => {
+  const dx = deriveAccessMutation({ eventName: 'deactivation', currentAccessStatus: 'paused_manual', autoPauseExempt: true });
+  assert.equal(dx.access_status, 'active', 'exempt overrides paused_manual on deactivation');
+  assert.equal(dx.bumpSessionVersion, false);
+
+  const px = deriveAccessMutation({ eventName: 'payment_success', currentAccessStatus: 'paused_manual', autoPauseExempt: true });
+  assert.equal(px.access_status, 'paused_manual', 'paused_manual wins for payment (admin decision honored)');
+});
```

### `push-server/server.mjs` (+51 / −2)

**Часть 1: `applyAccessState` пробрасывает exempt (строки 262-267).**

```diff
 const applyAccessState = async (db, profile, { eventName, paidUntil, payload, customerIds }) => {
   const isManualPaused = String(profile?.access_status || '').toLowerCase() === 'paused_manual';
-  const mutation = deriveAccessMutation({ eventName, currentAccessStatus: profile?.access_status || null });
+  const autoPauseExempt = Boolean(profile?.auto_pause_exempt);
+  const mutation = deriveAccessMutation({
+    eventName,
+    currentAccessStatus: profile?.access_status || null,
+    autoPauseExempt
+  });
```

**Часть 2: `handleProdamusWebhook` помечает лог `SKIPPED_BY_AUTO_PAUSE_EXEMPT` (строки ~395-405).**

```diff
-    await markWebhookLogState(client, log.id, { processed: true, errorText: null });
+    // FEAT-015 Path C: пометить лог если профиль освобождён от автопаузы.
+    // is_processed=true (событие учтено в подписке), error_text — для аудита.
+    const skippedByExempt = Boolean(profile.auto_pause_exempt)
+      && (eventName === 'deactivation' || eventName === 'finish');
+    await markWebhookLogState(client, log.id, {
+      processed: true,
+      errorText: skippedByExempt ? 'SKIPPED_BY_AUTO_PAUSE_EXEMPT' : null
+    });
```

**Часть 3: `runNightlyExpiryReconcile` — два новых блока (строки ~418-465).**

```diff
 const runNightlyExpiryReconcile = async () => {
   try {
+    // FEAT-015 Path C step 1: auto-expire auto_pause_exempt_until.
+    // Перевод истёкших exempt-флагов в false. Кейс: Ольга поставила
+    // ведущей бартер до 2026-12-31, дата прошла → флаг снят, обычная
+    // подписочная логика возвращается.
+    const expired = await pool.query(
+      `update public.profiles
+          set auto_pause_exempt = false,
+              auto_pause_exempt_until = null,
+              auto_pause_exempt_note = coalesce(auto_pause_exempt_note, '')
+                || ' [expired ' || current_date::text || ']'
+        where auto_pause_exempt = true
+          and auto_pause_exempt_until is not null
+          and auto_pause_exempt_until < current_date
+       returning id`
+    );
+    for (const row of expired.rows || []) {
+      // Аудит-запись в billing_webhook_logs.
+      await pool.query(
+        `insert into public.billing_webhook_logs(
+           provider, event_name, external_id, payload_json, signature_valid, is_processed
+         )
+         values ($1, 'auto_pause_exempt_expired', $2, $3::jsonb, true, true)
+         on conflict (provider, external_id) do nothing`,
+        [
+          PRODAMUS_PROVIDER_NAME,
+          `exempt_expired:${row.id}:${new Date().toISOString().slice(0, 10)}`,
+          JSON.stringify({ profile_id: row.id, source: 'nightly_reconcile' })
+        ]
+      );
+    }
+    if ((expired.rows || []).length > 0) {
+      console.info(`[reconcile ${BILLING_TIMEZONE}] auto_pause_exempt expired: ${expired.rows.length} profiles`);
+    }
+
+    // FEAT-015 Path C step 2: existing overdue → paused_expired,
+    // НО игнорировать exempt-профили (они защищены от автопаузы по дизайну).
     const { rows } = await pool.query(
       `update public.profiles
           set subscription_status = case when subscription_status = 'active' then 'overdue' else subscription_status end,
@@ -413,6 +461,7 @@
               last_prodamus_event = coalesce(last_prodamus_event, 'nightly_reconcile_overdue'),
               session_version = case when access_status = 'active' then session_version + 1 else session_version end
         where role <> 'admin'
+          and coalesce(auto_pause_exempt, false) = false
           and coalesce(access_status, 'active') = 'active'
           and paid_until is not null
           and paid_until < now()
```

---

## Что НЕ затронуто

- `findProfileByCustomer` — НЕ меняется, `select *` уже подтягивает новые
  колонки автоматом.
- `markWebhookLogState`, `persistWebhookLog`, `verifyProdamusSignature`,
  `classifyProdamusEvent` — без изменений.
- Web-push endpoints, upcoming API — не затронуты.
- Миграция БД (phase29) — НЕ менялась после apply.

---

## Готов к commit

Предлагаемое сообщение коммита:

```
feat(push-server): FEAT-015 Path C — auto_pause_exempt in deriveAccessMutation + reconcile

- billingLogic.mjs: deriveAccessMutation принимает autoPauseExempt;
  для deactivation/finish exempt оставляет access_status='active'
  (subscription_status логируется как deactivated/finished для аудита).
- billingLogic.test.mjs: 4 новых теста на exempt-кейсы.
- server.mjs:
  - applyAccessState читает profile.auto_pause_exempt и пробрасывает
    в deriveAccessMutation.
  - handleProdamusWebhook помечает лог error_text='SKIPPED_BY_AUTO_PAUSE_EXEMPT'
    если webhook прилетел на exempt-профиль и был "пропущен".
  - runNightlyExpiryReconcile:
    - step 1: auto-expire auto_pause_exempt_until < current_date,
      аудит-запись в billing_webhook_logs (event_name='auto_pause_exempt_expired').
    - step 2: existing overdue→paused_expired игнорирует exempt-профили.

Зависит от: phase29 (новые колонки auto_pause_exempt*).

План: plans/2026-05-15-feat015-prodamus-c.md
Apply phase29: docs/_session/2026-05-16_04_codeexec_phase29_verify.md
Diff: docs/_session/2026-05-16_05_codeexec_phase_c2_diff.md
```

После 🟢 на commit — закоммичу один коммит для push-server (3 файла) +
push на origin/main. Деплой push-server на прод требует **отдельного**
шага (rsync на push.skrebeyko.ru + restart `push-server.service`) —
это Phase C3 в плане. Делать в одном round'е или ждать отдельного 🟢?
