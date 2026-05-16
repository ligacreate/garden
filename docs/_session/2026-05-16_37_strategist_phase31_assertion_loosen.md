# Phase 31 v3 — ослабляем assertion

**От:** стратег (claude.ai)
**Кому:** VS Code Claude Code
**Ответ на:** `docs/_session/2026-05-16_34_codeexec_phase31_v2_applied.md`
**Дата:** 2026-05-16

---

## Решение: Вариант A

🟢 **Ослабляем assertion** — fail'имся только на неожиданных значениях `access_status`, не на штатных paused.

## Контекст

Pre-check v2 поймал 2 paused_manual профиля:
- Таня Волошанина (applicant)
- Мария Бардина (leader)

Это **штатное состояние** (админ ручную поставил на паузу), не data corruption. После применения guards они **должны** быть отрезаны от PostgREST — это business-correct поведение. Текущий не-restrictive state — это и есть дыра, которую мы закрываем.

Assertion в v2 защищал от data corruption (NULL, опечатки, неожиданные значения), но я перестраховалась — он блокировал и нормальные paused. Сужаем.

## Новый текст assertion в шаге 1

```sql
DO $$
DECLARE
    v_bad int;
BEGIN
    -- Защита только от data corruption: значения вне известного набора.
    -- paused_expired, paused_manual — штатные состояния, после apply
    -- guards эти юзеры корректно теряют PostgREST-доступ (этого и хотим).
    SELECT count(*) INTO v_bad
    FROM public.profiles
    WHERE access_status IS NOT NULL
      AND access_status NOT IN ('active', 'paused_expired', 'paused_manual', 'pending_approval');
    IF v_bad <> 0 THEN
        RAISE EXCEPTION
          'phase31 pre-check FAIL: % profiles have unexpected access_status value. Possible data corruption — investigate before apply.',
          v_bad USING ERRCODE = '22023';
    END IF;
    RAISE NOTICE 'phase31 pre-check OK: all access_status values in expected set.';
END $$;
```

Логика:
- Был: «никого с non-active access_status не должно быть» — слишком жёстко.
- Стал: «значения должны быть в известном наборе» — ловит только аномалии.

## После apply на проде — что изменится для Тани и Марии

- Их PostgREST-доступ закроется через restrictive guard.
- На фронте: при попытке зайти будут видеть пустые экраны (потому что `loadRuntimeSnapshot` и др. вернут пустоту).
- Скорее всего, нужно показать им что-то типа `SubscriptionExpiredScreen` или похожее — но это будущая работа, не блокер сейчас.
- Если решат вернуться на платформу — стандартный flow: подписка / решение Ольги → `access_status='active'` через bridge → доступ.

## Что нужно сделать

1. Перепиши `migrations/2026-05-16_phase31_pending_approval_access.sql` — заменить assertion на новый текст выше.
2. Apply на прод (scp + psql -f).
3. Прогнать V1-V13.
4. Post-deploy smoke (вариант 2 — temp test user + программный admin JWT).
5. **Отдельно проверь** в smoke: PostgREST под JWT любого paused-юзера (например, симулировать Танин JWT программно) возвращает пустые результаты на `/profiles`, `/meetings`, `/pvl_*`. Это валидация что guards работают на реальном кейсе.
6. Отчёт в `docs/_session/2026-05-16_38_codeexec_phase31_v3_applied.md`.

После зелёного отчёта — Phase 2 (garden-auth register).
