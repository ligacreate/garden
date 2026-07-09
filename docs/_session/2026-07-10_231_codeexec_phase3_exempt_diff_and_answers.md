# Фаза 3 — exempt-метки (diff-on-review) + ответы (Тютюнник / абитуриенты / принцип бота)

**Дата:** 2026-07-10
**Автор:** codeexec (VS Code)
**Основание:** recon [`_session/230`](2026-07-10_230_codeexec_phase3_paylist_paid_until_reconcile.md).

---

## 1. Тютюнник — перепроверка платежа: **ЧИСТО** ✅

Прогнал `paylist (1).csv` по `tg_user_id=1064072804` **и** по вариантам имени/логина
(`тютюн|tyutyun|tutunnik|businka`) — **платежа за Лигу (и вообще любого) НЕТ**. Ольга Тютюнник
(@businka_777, только канал, без профиля) — реального Лига-платежа в выгрузке нет. Остаётся в
разряде «в канале без платежа» (бартер/годовик/гость — на твою разметку).

## 2. Черновик 4 профилей — ОТМЕНЁН ✅

Не создаю профили Антипиной, Белоус, Павлиш, Сулименко (сами регистрируются — чтобы не задвоить).
Это была рекомендация, ничего не создавалось.

## 3. Абитуриенты с Лига-платежами (4) — поимённо (тебе решать: повысить в стажёры / закрыть доступ)

Все четверо оплатили **2000 ₽ 2026-07-08** (тариф 1 мес, «Лига развивающих практиков»):

| Профиль (applicant) | Дата | Сумма | tg_user_id | email |
|---|---|---|---|---|
| Александра Титова | 2026-07-08 | 2000 ₽ | 1323439093 | Sasha-adv@yandex.ru |
| Ирина Петруня | 2026-07-08 | 2000 ₽ | 1886607302 | panda399@rambler.ru |
| Лилия Малонг | 2026-07-08 | 2000 ₽ | 5700227381 | malaglilia@gmail.com |
| Ольга Разжигаева | 2026-07-08 | 2000 ₽ | 1391856263 | Razzhigvzhik@mail.ru |

Все `paid_until` в БД у них уже стоят (≈2026-08-08), в чате есть. Гардрейл: как `applicant` Лигой не
паузятся. Реши по каждому: повысить роль в `intern` или закрыть.

## 4. Exempt-метки (бартер) — DIFF-ON-REVIEW 🔴 (не применён)

**Механика:** `auto_pause_exempt=true`, `auto_pause_exempt_until=NULL` (**бессрочно** — ночной reconcile
снимает флаг только если `until IS NOT NULL AND < today`, [server.mjs:660-668](../../push-server/server.mjs)),
`auto_pause_exempt_note` = провенанс. Идемпотентно (`WHERE auto_pause_exempt = false`).

### ⚠️ Власова — пометить НЕЛЬЗЯ (нет профиля)
`auto_pause_exempt` — флаг на `profiles`. У Власовой (ни Юля @iuliiavlasova, ни Елена tg 508487098)
**профиля в БД нет** → exempt поставить не на что. Варианты: (а) завести ей профиль → потом exempt,
либо (б) **ничего не делать** — по новому принципу бота (п.5) «без профиля не кикаем», она и так защищена.
Рекомендую (б), если не нужен учёт. **Скажи, что делаем.** Ниже diff — только Кокорина + Дегожская.

### SQL (Кокорина + Дегожская), self-guarded, НЕ применён

```sql
\set ON_ERROR_STOP on
\if :{?do_commit}
\else
  \set do_commit false
\endif
BEGIN;
CREATE TEMP TABLE _exempt(id uuid, note text) ON COMMIT DROP;
INSERT INTO _exempt(id, note) VALUES
  ('1924217f-f24d-450b-947f-e0339ef82fc8', 'бартер (в чате Лиги, без Prodamus-платежа) — Фаза 3 2026-07-10'),  -- Елена Кокорина (leader)
  ('d27cd649-8320-41d9-b6aa-abc65646c492', 'бартер (в чате Лиги, без Prodamus-платежа) — Фаза 3 2026-07-10');  -- Мария Дегожская (leader)

\echo === V0 PRE (ожидание: leader, exempt=false) ===
SELECT p.name, p.role, p.access_status, p.auto_pause_exempt, p.auto_pause_exempt_until
FROM _exempt e JOIN public.profiles p USING (id) ORDER BY p.name;

DO $$
DECLARE n_missing int; n_bad int;
BEGIN
  SELECT count(*) INTO n_missing FROM _exempt e LEFT JOIN public.profiles p USING (id) WHERE p.id IS NULL;
  IF n_missing <> 0 THEN RAISE EXCEPTION 'GUARD: % id не найдены', n_missing; END IF;
  SELECT count(*) INTO n_bad FROM _exempt e JOIN public.profiles p USING (id) WHERE p.role <> 'leader';
  IF n_bad <> 0 THEN RAISE EXCEPTION 'GUARD: % профилей не leader', n_bad; END IF;
END $$;

UPDATE public.profiles p
SET auto_pause_exempt = true,
    auto_pause_exempt_until = NULL,
    auto_pause_exempt_note = e.note
FROM _exempt e
WHERE p.id = e.id AND p.auto_pause_exempt = false;

\echo === V1 POST (ожидание: exempt=true, until=NULL, note проставлен) ===
SELECT p.name, p.auto_pause_exempt, p.auto_pause_exempt_until, p.auto_pause_exempt_note
FROM _exempt e JOIN public.profiles p USING (id) ORDER BY p.name;

\echo === V2 (ожидание: exempt-профилей в БД = 2) ===
SELECT count(*) AS exempt_total FROM public.profiles WHERE auto_pause_exempt = true;

\if :do_commit
  \echo '>>> COMMIT <<<'
  COMMIT;
\else
  \echo '>>> DRY-RUN: ROLLBACK <<<'
  ROLLBACK;
\endif
```

Применение (после 🟢): один ssh — dry `do_commit=false` → сверка → `&&` → commit `do_commit=true`.

## 5. Принцип бота — ЗАЛОЖЕНО в дизайн (обязательное правило)

> **Кик — ТОЛЬКО для ИЗВЕСТНЫХ истёкших профилей.** Бот кикает участника, лишь если:
> (1) его `telegram_user_id` сматчен с профилем платящей роли (`intern/leader/mentor`), И
> (2) профиль `paused_expired`/истёк (`paid_until < now`), И (3) НЕ `auto_pause_exempt`, НЕ `paused_manual`.
>
> **«Незнакомцев в чате без профиля» НЕ кикать никогда.** Нет матча `telegram_user_id → profile` →
> бот не трогает (в отчёт «неизвестный в чате», разбор человеком). Это защищает: платящих-без-профиля
> (Антипина/Белоус/Павлиш/Сулименко до саморегистрации), гостей, команду, ботов, Власову-без-профиля.

Это войдёт в дизайн-документ лесенки как hard-rule «default-safe: незнание = не трогать».

---

**Exempt — diff-on-review, жду 🟢 (и решение по Власовой/абитуриентам). Остальное — ответы/принцип.**
