# DIFF-on-review — Фаза 3: откат Старостиной (не-Лига платёж «12 месяцев») + флаг вебхука

**Дата:** 2026-07-10
**Автор:** codeexec (VS Code)
**Статус:** 🔴 НЕ применён. Жду 🟢.

## Контекст
Дарья Старостина (`147aea39-d127-4e31-a66d-dbd47e1c84be`): единственный платёж — **750 ₽ «12 месяцев» 2026-06-29**
(отдельный продукт, **не Лига** — подтверждено Олей). Но в БД: `role=intern`, `paid_until=2026-07-30`,
`last_prodamus_event=payment_success`, `telegram_user_id=376007549` (self-link 2026-05-27).
→ Prodamus-вебхук выдал ей доступ к Лиге за не-Лиговую покупку. Reconcile доверился `paid_until` → сгенерил инвайты.

## Что откатываем
| Поле | Было | Станет | Почему |
|---|---|---|---|
| `role` | intern | **applicant** | intern-статус держался только на не-Лиговом платеже; своей Лига-оплаты нет |
| `paid_until` | 2026-07-30 | **NULL** | вычислен из «12 месяцев», не считаем |
| `access_status` | active | active (не трогаем) | она легитимный applicant (курс ПВЛ), доступ к курсу не режем |
| `telegram_user_id` | 376007549 | 376007549 (не трогаем) | корректная привязка (self-link), пригодится |

После отката reconcile её не увидит (applicant вне scope) → из ADMIT выпадает; поллер её заявку **не** одобрит
(applicant / нет paid_until). **Инвайты, что я сгенерил ей ранее, НЕ отправляй** (ссылки останутся в логе как void).

## SQL (self-guarded, dry→commit). Не применён.
```sql
\set ON_ERROR_STOP on
\if :{?do_commit}
\else
  \set do_commit false
\endif
BEGIN;
\echo === PRE (ожидание intern, paid_until 2026-07-30) ===
SELECT name, role, access_status, paid_until, telegram_user_id
FROM public.profiles WHERE id='147aea39-d127-4e31-a66d-dbd47e1c84be';

DO $$
BEGIN
  IF (SELECT role FROM public.profiles WHERE id='147aea39-d127-4e31-a66d-dbd47e1c84be') <> 'intern'
    THEN RAISE EXCEPTION 'GUARD: роль уже не intern — состояние изменилось, проверить руками'; END IF;
END $$;

UPDATE public.profiles
   SET role='applicant', paid_until=NULL
 WHERE id='147aea39-d127-4e31-a66d-dbd47e1c84be' AND role='intern';

\echo === POST (ожидание applicant, paid_until пусто; uid сохранён) ===
SELECT name, role, access_status, paid_until, telegram_user_id
FROM public.profiles WHERE id='147aea39-d127-4e31-a66d-dbd47e1c84be';

\if :do_commit
  \echo '>>> COMMIT <<<'
  COMMIT;
\else
  \echo '>>> DRY ROLLBACK <<<'
  ROLLBACK;
\endif
```

## ⚠️ БОЛЬШИЙ ФЛАГ (отдельная рекомендация, не в этот шаг)
`last_prodamus_event=payment_success` у Старостиной = **вебхук выдаёт Лига-`paid_until` за ЛЮБОЙ Prodamus-платёж,
не разбирая товар** («12 месяцев», «Неделя заботы», книги, Орбита и т.д.). Значит **и другие** могли получить
ложный Лига-доступ за не-Лиговые покупки → попадут в ADMIT или ускользнут от KICK.
**Рекомендую отдельный recon:** профили, чей `paid_until` держится только на не-Лиговых товарах (по выгрузке
сверить product’ы vs `paid_until`). Плюс — на будущее — вебхук должен маппить Лига-доступ ТОЛЬКО по Лига-товарам
(`_param_order_id`/plan_code платформо-инициированного checkout это уже делает; проблема в «диком» recurring/TH-потоке).

**Откат Старостиной — жду 🟢. Recon по остальным не-Лига грантам — по твоему решению, отдельно.**
