# DIFF-ON-REVIEW (Шаг 2) — развязка слоёв В1 (Лига-доступ = subActive, без флипа access_status)

**Дата:** 2026-07-10 · **Автор:** codeexec · **Статус:** 🟢 ЗАДЕПЛОЕНО + ДАННЫЕ ПРИМЕНЕНЫ (2026-07-10, apply-запись [`_session/257`](2026-07-10_257_codeexec_phase3_v1_decouple_applied.md)). Изначально был diff-on-review.
**Модель:** В1 (курс=роль, Лига=оплата). Дизайн [`_session/254`](2026-07-10_254_codeexec_phase3_cabinet_first_design.md) §5-6, числа [`_session/255`](2026-07-10_255_codeexec_phase3_cabinet_first_step1_recon.md).
**§F (гейт курса) — по решению стратега НЕ трогаем** (intern сохраняет курс, pvlRoleResolver/COURSES как есть).

---

## Инвариант после развязки
`access_status` (RLS `has_platform_access`) **перестаёт зависеть от Лига-оплаты**. Лига-доступ = `subActive = paid_until >= now`. `subscription_status` (active/overdue/deactivated/finished) остаётся как **репортинг-флаг** (для напоминаний 1f), кабинет им не режется. `paused_manual` — не трогаем (платформенная ручная пауза).

## ⚠️ Scope-расширение (флаг стратегу — того же типа баг)
Ты назвал «runNightlyExpiryReconcile/автопауза». Но `paused_expired` по Лига-неоплате ставит **ещё и вебхук** (`deriveAccessMutation` finish/deactivation → Prodamus-деактивация **и** BotHunter `expired`→`finish`). Это тот же паттерн. **Чиню на источнике (обе точки)**, иначе BotHunter/Prodamus продолжат запирать кабинет. Если хочешь оставить вебхучную паузу — скажи, откачу эту часть.

---

## Изменение 1 — `push-server/billingLogic.mjs` :: `deriveAccessMutation` (finish/deactivation)
Больше НЕ ставим `access_status='paused_expired'` и НЕ бампаем session_version. `access_status: null` = «не менять» (см. изм. 2 — SQL `coalesce`).

```diff
   if (eventName === 'deactivation') {
     return {
       subscription_status: 'deactivated',
-      access_status: autoPauseExempt
-        ? 'active'
-        : (isManualPaused ? 'paused_manual' : 'paused_expired'),
-      bumpSessionVersion: !autoPauseExempt && !isManualPaused
+      access_status: null,          // В1: платформенный доступ не зависит от Лига-неоплаты
+      bumpSessionVersion: false     // без принудительного logout — кабинет остаётся
     };
   }
   if (eventName === 'finish') {
     return {
       subscription_status: 'finished',
-      access_status: autoPauseExempt
-        ? 'active'
-        : (isManualPaused ? 'paused_manual' : 'paused_expired'),
-      bumpSessionVersion: !autoPauseExempt && !isManualPaused
+      access_status: null,          // В1
+      bumpSessionVersion: false
     };
   }
```
*(payment_success/auto_payment ветка — без изменений: оплата открывает как раньше.)*

## Изменение 2 — `push-server/server.mjs` :: `applyAccessState` (finish/deactivation UPDATE, ~332-367)
`access_status` через `coalesce` (null → не трогаем текущее, сохраняя active/paused_manual). Убираем `logout-all` (доступ больше не отзывается).

```diff
       `update public.profiles
          set subscription_status = $2,
-             access_status = $3,
+             access_status = coalesce($3, access_status),   -- В1: null = оставить как есть
              paid_until = coalesce($4::timestamptz, paid_until),
              ...
              session_version = case when $10::boolean then session_version + 1 else session_version end
        where id = $1`,
```
```diff
-    if (!isManualPaused) {
-      // Best effort logout in auth-service.
-      await fetch(`${AUTH_URL}/auth/logout-all`, { ... reason: 'subscription_blocked' }).catch(()=>{});
-    }
+    // В1: finish/deactivation больше НЕ отзывает платформенный доступ → logout не нужен.
+    //     Лига-замок реализуется через subActive на Лига-поверхностях, не через сессию.
```

## Изменение 3 — `push-server/server.mjs` :: `runNightlyExpiryReconcile` (UPDATE 722-733)
Оставляем только пометку `subscription_status='overdue'` (репортинг для 1f). Убираем флип `access_status` и бамп `session_version`.

```diff
     const { rows } = await pool.query(
       `update public.profiles
           set subscription_status = case when subscription_status = 'active' then 'overdue' else subscription_status end,
-              access_status = case when access_status = 'active' then 'paused_expired' else access_status end,
-              last_prodamus_event = coalesce(last_prodamus_event, 'nightly_reconcile_overdue'),
-              session_version = case when access_status = 'active' then session_version + 1 else session_version end
+              last_prodamus_event = coalesce(last_prodamus_event, 'nightly_reconcile_overdue')
         where role not in ('admin', 'applicant')
           and coalesce(auto_pause_exempt, false) = false
-          and coalesce(access_status, 'active') = 'active'
           and paid_until is not null
           and paid_until < now()
+          and coalesce(subscription_status, '') <> 'overdue'   -- идемпотентно: не переписываем повторно
        returning id`
     );
```
*(Эффект: истёкшие Лига-подписки помечаются `overdue` для напоминаний, но кабинет/курс не режется. Лига-замок — по `paid_until` на Лига-поверхностях.)*

## Изменение 4 — `push-server/billingLogic.test.mjs` (обновить ожидания)
Тесты сейчас ждут `paused_expired` на finish/deactivation — под В1 меняем:
- `deriveAccessMutation({eventName:'finish'|'deactivation', ...})` → `access_status === null`, `bumpSessionVersion === false`, `subscription_status === 'finished'|'deactivated'`.
- BotHunter `expired`→`finish`: `access_status === null` (было `paused_expired`).
- Ветка payment_success/auto_payment — без изменений (остаётся `active`/`paused_manual`).
- Добавить кейс: finish при `currentAccessStatus='paused_manual'` → `access_status===null` (coalesce сохранит paused_manual в SQL).

Прогон: `node --test billingLogic.test.mjs` — ожидаю зелёные после правок.

---

## Изменение 5 — ДАННЫЕ (прод): вернуть 8 `paused_expired` → `active`
Отдельный data-diff, **dry → commit, self-guard**. Порядок: **сначала деплой изм.1-4** (иначе ночной reconcile под старым кодом вернёт их в paused_expired), **потом** этот UPDATE.

```sql
-- DRY (превью, ожидаю 8: 7 intern + 1 leader, paid_until IS NULL):
SELECT id, role, access_status, subscription_status, paid_until
FROM profiles WHERE access_status='paused_expired' ORDER BY role;

-- COMMIT (в транзакции, с self-guard на rowcount):
BEGIN;
UPDATE profiles SET access_status='active'
 WHERE access_status='paused_expired';           -- paused_manual (12) не тронут (другое значение)
-- ожидаемо UPDATE 8; если не 8 — ROLLBACK и разбор.
COMMIT;
```
- **НЕ трогаю:** `paid_until` (остаётся NULL → `subActive=false` → Лига заперта, корректно), `subscription_status` (репортинг), `session_version` (возврат в active не требует logout), `paused_manual`.
- Итог: 8 человек снова видят кабинет + курс (по роли), Лига остаётся под замком до оплаты.

---

## Порядок раскатки (окна 403 нет — всё бэкенд)
1. 🟢 ревью этого diff.
2. Деплой изм.1-4: rsync `billingLogic.mjs`+`server.mjs` + restart, тесты локально зелёные, smoke `/health`.
3. Data-diff изм.5: dry (8) → commit (8) → верификация распределения `access_status`.
4. Отдельно позже (окно 403): фронт Лига-поверхности + кнопки «Вступить» гейт `subActive` — НЕ в этом шаге.

## Верификация после
- Не-оплаченный intern: `access_status='active'` (кабинет+курс есть), `subActive=false` (Лига заперта, TG-поллер не пускает). 
- BotHunter `expired` на платящей роли: `subscription_status='finished'`, `access_status` НЕ меняется, logout не шлётся.
- Ночной reconcile: помечает `overdue`, кабинет не режет.

## Что НЕ трогаю
- Гейт курса (pvlRoleResolver, COURSES) — по решению стратега.
- `paused_manual`, `payment_success`/`auto_payment` грант, товаро-гейт (253), идемпотентность/подпись, поллер/reconcile hard-rules, миграцию легаси (2+1 — отдельный шаг позже).
- Ничего не применял/не деплоил.

**Diff на ревью. Жду 🟢 (и подтверждение по scope-расширению — вебхучная пауза).**
