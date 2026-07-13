# DIFF-ON-REVIEW (ФИНАЛ) — payform-путь: перезапись `now()+31` → СТОПКА + тесты

**Дата:** 2026-07-13 · **Автор:** codeexec · **Статус:** ✅ ПРИМЕНЕНО (rsync+restart 2026-07-13 07:59, health 200, тесты 18/18). Урок: `docs/lessons/2026-07-13-payform-overwrite-shortens-early-payer.md`
**Файлы:** `push-server/server.mjs` (`applyAccessState`), `push-server/billingCheckout.mjs` (+хелпер), `push-server/billingCheckout.test.mjs` (+тесты)
**Связано:** Мария применена → `2026-07-13_271_*`; аудит остальных жертв → `2026-07-13_272_*`

---

## Корень

`applyAccessState` (грант-ветка) **перезаписывает** `paid_until = now()+31д`, когда пейлоад без даты.
Payform-товар (Лига, 1 мес, `sys:TargetHunter`) даты не шлёт → досрочному плательщику обнуляется остаток.
Кабинет (`applyPayment`) уже делает СТОПКОЙ — зеркалим её на payform.

## Решение (соразмерно, owner-слой)

- Fallback (payform без даты) → стопка `greatest(now(), coalesce(paid_until, now())) + make_interval(months => 1)`.
- Явный `paidUntil` (подписка Prodamus = авторитетная дата) → перезапись как есть (нулевой риск).
- Логика выбора выражения вынесена в чистый хелпер `grantPaidUntilExpr()` в `billingCheckout.mjs` (тестируемо, как остальные billing-функции).
- `returning paid_until` → тем же значением пишем в `subscriptions` (чинит рассинхрон profiles/subscriptions).

**Гарантия «только добавляет»** доказана на Postgres (см. Тесты §Т4): истёкший→now+1мес, досрочный→стопка, никогда не короче.

## Diff

### 1. `billingCheckout.mjs` — новый чистый хелпер
```diff
+// Грант-начисление доступа (payform/подписка). Явная дата из пейлоада → ставим ($4).
+// Иначе СТОПКА: greatest(now, paid_until) + 1 мес (payform-товар = 1 мес), как в applyPayment.
+// Неквалифицированный paid_until в правой части SET = старое (до-апдейтное) значение строки.
+// Свойство: результат всегда >= текущего paid_until → доступ только ДОБАВЛЯЕТСЯ, не отнимается.
+export const grantPaidUntilExpr = (hasExplicitPaidUntil) =>
+  hasExplicitPaidUntil
+    ? `$4::timestamptz`
+    : `greatest(now(), coalesce(paid_until, now())) + make_interval(months => 1)`;
```

### 2. `server.mjs` — импорт + применение в `applyAccessState`
```diff
-import { isSandbox, verifyJwtHS256, bearerToken, resolveYooKassaCreds, yooKassaLiveEnabled, buildYooKassaPayload, buildProdamusUrl } from './billingCheckout.mjs';
+import { isSandbox, verifyJwtHS256, bearerToken, resolveYooKassaCreds, yooKassaLiveEnabled, buildYooKassaPayload, buildProdamusUrl, grantPaidUntilExpr } from './billingCheckout.mjs';
```
```diff
   if (mutation && (eventName === 'payment_success' || eventName === 'auto_payment')) {
-    const effectivePaidUntil = paidUntil || new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
-    await db.query(
+    // Payform-товар (Лига, 1 мес) не шлёт paid_until → раньше падали в перезапись now()+31д,
+    // что ОБНУЛЯЛО остаток досрочному плательщику. Теперь СТОПКА (зеркало applyPayment).
+    const paidUntilExpr = grantPaidUntilExpr(Boolean(paidUntil));
+    const paidUntilParam = paidUntil ? paidUntil.toISOString() : null;
+    const upd = await db.query(
       `update public.profiles
          set subscription_status = $2,
              access_status = $3,
-             paid_until = $4,
+             paid_until = ${paidUntilExpr},
              last_payment_at = now(),
              last_prodamus_event = $5,
              last_prodamus_payload = $6::jsonb,
              prodamus_subscription_id = coalesce($7, prodamus_subscription_id),
              prodamus_customer_id = coalesce($8, prodamus_customer_id),
              bot_renew_url = coalesce(bot_renew_url, $9)
-       where id = $1`,
-      [profile.id, mutation.subscription_status, mutation.access_status, effectivePaidUntil.toISOString(), eventName, payloadJson, subscriptionId, customerId, DEFAULT_BOT_RENEW_URL || null]
+       where id = $1
+       returning paid_until`,
+      [profile.id, mutation.subscription_status, mutation.access_status, paidUntilParam, eventName, payloadJson, subscriptionId, customerId, DEFAULT_BOT_RENEW_URL || null]
     );
+    const effectivePaidUntil = upd.rows[0]?.paid_until || null;

     await db.query(
       `insert into public.subscriptions(user_id, provider, provider_subscription_id, status, paid_until, last_payment_at, ended_at, updated_at)
        values ($1, $2, $3, $4, $5, now(), null, now())
        on conflict (provider, provider_subscription_id) where provider_subscription_id is not null do update
          set status = excluded.status,
              paid_until = excluded.paid_until,
              last_payment_at = now(),
              ended_at = null,
              updated_at = now()`,
-      [profile.id, provider, subscriptionId || `${profile.id}`, mutation.subscription_status, effectivePaidUntil.toISOString()]
+      [profile.id, provider, subscriptionId || `${profile.id}`, mutation.subscription_status, effectivePaidUntil]
     );
     return;
   }
```

## Тесты (4 сценария, как просил стратег)

### 3. `billingCheckout.test.mjs` — юнит (выбор выражения + параметр)
```diff
+test('grantPaidUntilExpr: payload с датой → перезапись $4::timestamptz (кейс C)', () => {
+  assert.equal(grantPaidUntilExpr(true), '$4::timestamptz');
+});
+test('grantPaidUntilExpr: без даты → СТОПКА greatest+make_interval 1 мес (кейсы A/B/D)', () => {
+  assert.match(
+    grantPaidUntilExpr(false),
+    /greatest\(now\(\), coalesce\(paid_until, now\(\)\)\) \+ make_interval\(months => 1\)/
+  );
+});
```
> Импорт в шапке теста дополнить: `grantPaidUntilExpr`.

### Т4. Рантайм-семантика стопки — доказано на Postgres (prod, read-only, только литералы)

Запрос (вычисляет ровно fallback-выражение при `now()=2026-07-13 10:46 MSK`):
```sql
with s(label,cur) as (values
  ('expired_past',  timestamptz '2026-06-01 12:00+03'),
  ('active_future', timestamptz '2026-09-01 12:00+03'),
  ('null_new',      null::timestamptz))
select label, cur,
  greatest(now(), coalesce(cur, now())) + make_interval(months => 1) as new_paid_until,
  (greatest(now(), coalesce(cur, now())) + make_interval(months => 1)) >= coalesce(cur, now()) as never_shortens
from s;
```
Результат:
| label | cur (paid_until) | new_paid_until | never_shortens |
|---|---|---|---|
| expired_past | 2026-06-01 12:00 | **2026-08-13 10:46** (now+1мес) | t |
| active_future (досрочный) | 2026-09-01 12:00 | **2026-10-01 12:00** (стопка +1мес) | t |
| null_new | — | **2026-08-13 10:46** (now+1мес) | t |

- **A** разовый без даты при активном → стопка ✅ (`active_future` → 10-01, не 08-13)
- **B** истёкший → now+1мес ✅ (`expired_past` → 08-13)
- **C** payload с датой → дата ✅ (юнит: `grantPaidUntilExpr(true) = $4::timestamptz`, param = ISO)
- **D** платёж не укорачивает ✅ (`never_shortens = t` во всех строках)

## Раскатка после 🟢

1. `npm test` в push-server (юниты §3 зелёные).
2. rsync push-server (exclude по паттерну) + restart сервиса.
3. Smoke: `/health` ok; тест-payform-грант досрочнику в demo → проверить стопку в логах.
4. Урок в `docs/lessons/2026-07-13-payform-overwrite-shortens-early-payer.md`.

**Готов применить по твоему слову.**
