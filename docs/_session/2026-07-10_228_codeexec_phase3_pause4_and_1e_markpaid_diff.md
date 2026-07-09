# DIFF-on-review — Фаза 3: пауза 4 стажёров + 1e mark-paid Анастасия Бондаренко

**Дата:** 2026-07-10
**Автор:** codeexec (VS Code)
**Статус:** 🔴 НЕ применён (оба блока). Жду 🟢.
**Источник:** recon [`_session/224`](2026-07-09_224_codeexec_phase3_roster_scrape_username_match.md).

---

# БЛОК 1 — пауза 4 отвалившихся стажёров

## Основание (по recon 224)
Все 4 — `intern`, `access_status=active`, `paid_until=NULL`, нет prodamus, **не в ростере** канала/чата
(TargetHunter уже исключил). Нет оплаты ≥2 мес + не в чате = отвалились.

| Профиль (UUID) | роль | сейчас | paid_until |
|---|---|---|---|
| `6d260793-14b2-44d0-907b-2d2772331231` Баженова Наталья | intern | active | NULL |
| `b34b18bf-aca5-4058-a2a0-deab9b4f459d` Наталья Ильиных | intern | active | NULL |
| `63f48d80-3704-49b9-9dc9-143e51c59228` Светлана Исламова | intern | active | NULL |
| `789b6955-a56a-45b4-b430-8ff7182a7436` Ярослава Шайтанова | intern | active | NULL |

## Целевое значение — подтверждено
`access_status = 'paused_expired'` — валидно по CHECK `profiles_access_status_check`
(`IN ('active','paused_expired','paused_manual')`, [phase29:67](../../migrations/2026-05-15_phase29_prodamus_path_c.sql)).
**НЕ `paused_manual`** — верно: `applyPayment` восстанавливает доступ (`active`) при любой будущей
оплате, КРОМЕ `paused_manual` (тот залипает, [server.mjs:378](../../push-server/server.mjs)). Значит
`paused_expired` = будущая оплата вернёт доступ. ✓

Побочно (авто, корректно): BEFORE-триггер `sync_status_from_access_status` при переходе в
`paused_expired` выставит legacy `status='suspended'` → garden-auth заблокирует НОВЫЙ логин/refresh.

## ⚠ Открытый вопрос — консистентность с ночным reconcile (нужно решение)
`runNightlyExpiryReconcile` при экспайре ставит НЕ только `access_status`, но и
`subscription_status='overdue'` + `session_version+1` ([server.mjs:692-704](../../push-server/server.mjs)).
Он **не трогает наших 4** (у них `paid_until IS NULL`, а reconcile берёт `paid_until < now()`) — поэтому
они и залипли в `active`. Твоя инструкция — только `access_status`. Два варианта:

- **A (буквально по ТЗ):** только `access_status='paused_expired'`. Минус: `subscription_status`
  останется `active` (мелкая рассинхронизация), а живые токены доживут до истечения (session_version не тронут).
- **B (зеркалю reconcile, рекомендую):** ещё `subscription_status='overdue'` + `session_version+1`.
  Состояние идентично «нормальному» экспайру; живые сессии этих 4 гасятся сразу. `paid_until`/`telegram_user_id`
  НЕ трогаю в обоих вариантах.

**Ниже SQL по варианту A** (строго по ТЗ). Скажешь «B» — добавлю две колонки в тот же UPDATE.

## SQL (apply-ready, self-guarded, НЕ применён) — вариант A

```sql
\set ON_ERROR_STOP on
\if :{?do_commit}
\else
  \set do_commit false
\endif
BEGIN;

CREATE TEMP TABLE _pause4(id uuid) ON COMMIT DROP;
INSERT INTO _pause4(id) VALUES
  ('6d260793-14b2-44d0-907b-2d2772331231'),  -- Баженова Наталья
  ('b34b18bf-aca5-4058-a2a0-deab9b4f459d'),  -- Наталья Ильиных
  ('63f48d80-3704-49b9-9dc9-143e51c59228'),  -- Светлана Исламова
  ('789b6955-a56a-45b4-b430-8ff7182a7436');  -- Ярослава Шайтанова

\echo === V0 PRE: 4 цели (ожидание role=intern, active, paid_until пуст) ===
SELECT p.name, p.role, p.access_status, p.paid_until, p.telegram_user_id
FROM _pause4 t JOIN public.profiles p USING (id) ORDER BY p.name;

-- ГАРДЫ: не применять в неожиданном состоянии.
DO $$
DECLARE n_missing int; n_bad int;
BEGIN
  SELECT count(*) INTO n_missing FROM _pause4 t LEFT JOIN public.profiles p USING (id) WHERE p.id IS NULL;
  IF n_missing <> 0 THEN RAISE EXCEPTION 'GUARD: % id не найдены', n_missing; END IF;
  -- ожидаем ровно 4 intern, active, без оплаты (иначе — не наш кейс, откат)
  SELECT count(*) INTO n_bad FROM _pause4 t JOIN public.profiles p USING (id)
    WHERE NOT (p.role = 'intern' AND p.access_status = 'active' AND p.paid_until IS NULL);
  IF n_bad <> 0 THEN RAISE EXCEPTION 'GUARD: % профилей не в ожидаемом состоянии (intern/active/paid_until NULL)', n_bad; END IF;
END $$;

-- UPDATE (идемпотентно: только из active).
UPDATE public.profiles p
SET access_status = 'paused_expired'
FROM _pause4 t
WHERE p.id = t.id AND p.access_status = 'active';

\echo === V1 POST: 4 → paused_expired, legacy status='suspended' (авто-триггер) ===
SELECT p.name, p.access_status, p.status, p.paid_until, p.telegram_user_id
FROM _pause4 t JOIN public.profiles p USING (id) ORDER BY p.name;

\if :do_commit
  \echo '>>> COMMIT <<<'
  COMMIT;
\else
  \echo '>>> DRY-RUN: ROLLBACK <<<'
  ROLLBACK;
\endif
```

Идемпотентность: `WHERE access_status='active'` → повторный прогон 0 строк. `paid_until`/`telegram_user_id`
не в SET. Reconcile не конфликтует (не трогает `paid_until IS NULL`).

Порядок apply (после 🟢): один ssh — dry `do_commit=false` (сверить V0=4/intern/active/NULL, V1=paused_expired)
→ `&&` → commit `do_commit=true`.

---

# БЛОК 2 — 1e ручная отметка оплаты: Анастасия Бондаренко

## Профиль
`ea1774bf-7ca4-40b8-8975-013ce0f84f6d` — Анастасия Бондаренко, **leader**, `access_status=active`,
`paid_until=NULL`, `telegram=''`. (В ростере она = `@hi_nes_ta`, tg_user_id `555066210`, канал+чат — recon 224 C.)

## Что делаем — двумя шагами
### 2.1 Оплата через штатный эндпоинт 1e (тестированный путь, идемпотентный)
`POST /api/billing/admin/mark-paid` ([server.mjs:841](../../push-server/server.mjs)) → пишет
`payment_orders(provider='manual', status='paid')` + `applyPayment(until=явная дата)` →
`paid_until`, `subscription_status='active'`, `access_status active` (уже active), upsert `subscriptions`.
Идемпотентность — по `idempotency_key` (UNIQUE, `ON CONFLICT DO NOTHING`).

**Тело запроса:**
```json
{
  "user_id": "ea1774bf-7ca4-40b8-8975-013ce0f84f6d",
  "plan_code": "1m",
  "amount": 2000,
  "months": 1,
  "payment_date": "2026-07-01",
  "until_date": "2026-08-01",
  "note": "прямой платёж, +79824143515, hinesta@mail.ru",
  "idempotency_key": "manual-anastasia-bondarenko-2026-07-01-1m"
}
```
- `until_date=2026-08-01` (01.07 + 1 мес) — источник истины `paid_until` (трактуется как 2026-08-01 23:59:59).
  Валиден: не в прошлом (сегодня 2026-07-10 < 08-01). ✓
- `plan_code='1m'` — существует в `billing_plans` (Лига — 1 месяц, 2000₽), FK-NOT NULL удовлетворён. ✓
- `idempotency_key` фиксированный → повторный вызов = `{ok:true, duplicate:true}`, без дублей.

**Как применить (после 🟢):** эндпоинт под `requireAdmin` (HS256 JWT, `sub`=admin-профиль).
На сервере: `source /opt/garden-auth/.env` → минтим короткоживущий JWT (`GARDEN_JWT_SECRET`,
`sub`=<admin id>) → `curl -H "Authorization: Bearer <jwt>" -d '<тело>' http://127.0.0.1:8787/api/billing/admin/mark-paid`.
Реальный код-путь (applyPayment), не сырой SQL — аудит/subscriptions/идемпотентность как в проде.
Admin-id возьму read-only в том же ssh на apply.

### 2.2 Проставить `telegram='@hi_nes_ta'` (сейчас пусто) — SQL
```sql
BEGIN;
\echo === PRE: telegram ДО (ожидание пусто) ===
SELECT name, telegram FROM public.profiles WHERE id='ea1774bf-7ca4-40b8-8975-013ce0f84f6d';

UPDATE public.profiles SET telegram = '@hi_nes_ta'
WHERE id='ea1774bf-7ca4-40b8-8975-013ce0f84f6d' AND telegram IS DISTINCT FROM '@hi_nes_ta';

\echo === POST: telegram = @hi_nes_ta ===
SELECT name, telegram FROM public.profiles WHERE id='ea1774bf-7ca4-40b8-8975-013ce0f84f6d';
-- COMMIT / ROLLBACK — по тому же dry→commit паттерну.
ROLLBACK;
```
Идемпотентно (`IS DISTINCT FROM`). Побочно (ожидаемо): триггер phase22 синкнёт `events.host_telegram`
её будущих встреч на новый handle.

**НЕ делаю в 2.2:** `telegram_user_id` — хотя из ростера известен (`555066210`), в ТЗ его нет.
Отдельным шагом при желании добью (профиль станет полностью enforce-ready).

---

## Открытые вопросы к Оле (перед apply)
1. **Блок 1: вариант A (только access_status) или B (зеркалю reconcile: +subscription_status='overdue' +session_version+1)?** Рекомендую B.
2. Блок 2: ок ли `idempotency_key = manual-anastasia-bondarenko-2026-07-01-1m` (фиксирую его навсегда для этого платежа)?
3. Блок 2: добивать ли заодно `telegram_user_id=555066210` Анастасии (вне ТЗ, но она в чате)?

**Оба блока — НЕ применяю до 🟢.**
