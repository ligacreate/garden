# DIFF-on-review — Фаза 3: пауза 3 должников (вариант B, зеркало reconcile)

**Дата:** 2026-07-10
**Автор:** codeexec (VS Code)
**Статус:** 🔴 НЕ применён. Жду 🟢.
**Основание:** recon [`_session/230`](2026-07-10_230_codeexec_phase3_paylist_paid_until_reconcile.md) / [`232`](2026-07-10_232_codeexec_phase3_applicants_and_mass_paid_until_diff.md) (Шилова/Габрух были вынесены как ⚠).
**Из чата НИКОГО не убираю — cutover сделает бот. Только БД.**

---

## Тютюнник — профиля НЕТ → паузить нечего (подтверждено)

Проверил `profiles` по имени и по `tg_user_id=1064072804` — **профиля нет**. Ольга Тютюнник
(@businka_777, только канал) — **roster-only**, приостанавливать не на чем.
→ Просто отмечаю: Оля вышлет ссылку; бот по принципу «незнакомец без профиля — не трогать» её не кикнет.
**Никаких записей по Тютюнник не делаю.**

## Шилова + Габрух → paused_expired (вариант B)

Оба `active`, `paid_until=NULL`, в чате, но реально истекли (последний Лига-платёж из CSV + 1 мес — в прошлом).
Вариант B зеркалит `runNightlyExpiryReconcile`: `access_status=paused_expired` + `subscription_status=overdue`
+ `session_version+1` (гасим живые сессии) + проставляем **реальный истёкший** `paid_until`.

| Профиль | id | роль | paid_until (посл. платёж +1 мес) |
|---|---|---|---|
| Шилова Мария | `4a661537-b425-41b8-b69c-19abcef2c9d2` | leader | **2026-05-05** (посл. 2026-04-05) |
| Юлия Габрух (курс завершён, не менторит) | `492e5d3d-81c7-41d8-8cef-5a603e1389e6` | mentor | **2026-06-10** (посл. 2026-05-10) |

Побочно (авто): BEFORE-триггер `sync_status_from_access_status` выставит legacy `status='suspended'`.
Будущая оплата вернёт доступ (`paused_expired`, не `paused_manual`).

### SQL (self-guarded, dry→commit). Не применён.
```sql
\set ON_ERROR_STOP on
\if :{?do_commit}
\else
  \set do_commit false
\endif
BEGIN;
CREATE TEMP TABLE _debt(id uuid, role text, pu date) ON COMMIT DROP;
INSERT INTO _debt(id, role, pu) VALUES
  ('4a661537-b425-41b8-b69c-19abcef2c9d2', 'leader', DATE '2026-05-05'),  -- Шилова Мария
  ('492e5d3d-81c7-41d8-8cef-5a603e1389e6', 'mentor', DATE '2026-06-10');  -- Юлия Габрух

\echo === V0 PRE (ожидание: active, paid_until пусто, роль совпадает) ===
SELECT p.name, p.role, p.access_status, p.subscription_status, p.session_version, p.paid_until
FROM _debt d JOIN public.profiles p USING (id) ORDER BY p.name;

DO $$
DECLARE n_bad int;
BEGIN
  SELECT count(*) INTO n_bad FROM _debt d JOIN public.profiles p USING (id)
   WHERE p.role <> d.role OR p.access_status <> 'active';
  IF n_bad <> 0 THEN RAISE EXCEPTION 'GUARD: % профилей не (ожид.роль/active)', n_bad; END IF;
  IF (SELECT count(*) FROM _debt d LEFT JOIN public.profiles p USING (id) WHERE p.id IS NULL) <> 0
    THEN RAISE EXCEPTION 'GUARD: id не найдены'; END IF;
END $$;

UPDATE public.profiles p
SET access_status      = 'paused_expired',
    subscription_status = 'overdue',
    session_version    = p.session_version + 1,
    paid_until         = (d.pu + interval '1 day' - interval '1 second')
FROM _debt d
WHERE p.id = d.id AND p.access_status = 'active';

\echo === V1 POST (ожидание: paused_expired/overdue/session_version+1, status=suspended, paid_until в прошлом) ===
SELECT p.name, p.access_status, p.subscription_status, p.session_version, p.status, p.paid_until
FROM _debt d JOIN public.profiles p USING (id) ORDER BY p.name;

\if :do_commit
  \echo '>>> COMMIT <<<'
  COMMIT;
\else
  \echo '>>> DRY-RUN: ROLLBACK <<<'
  ROLLBACK;
\endif
```

Идемпотентно (`WHERE access_status='active'` → повторный прогон 0 строк, session_version не двоится).
Порядок apply (после 🟢): один ssh — dry `do_commit=false` → сверка → `&&` → commit `do_commit=true`.

---

## Итог
- **2 записи** (Шилова, Габрух) — пауза + реальный истёкший paid_until.
- **Тютюнник** — без записи (нет профиля; roster-only, бот не тронет).
- **Из чата никого не трогаю.**

**Не применяю до 🟢.**
