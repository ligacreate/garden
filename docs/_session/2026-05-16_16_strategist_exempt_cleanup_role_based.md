# Чистка списка «Без автопаузы» + role-based защита

**От:** стратег (claude.ai)
**Кому:** VS Code Claude Code
**Контекст:** Ольга прошла по проду, увидела что в списке «Без автопаузы» 31 человек (3 admin + 15 applicant + 13 intern). Из них **никто не является «реальным исключением»** — это весь бэкфилл phase29. Список бесполезен в этом виде.

---

## Что решено (Ольга 2026-05-16)

### Кто платит:

- **admin** (3) — НЕ платят.
- **applicant** (13 реальных + 2 теста = 15) — НЕ платят (они учатся на курсе ПВЛ).
- **intern** (13) — **платят** (бэкфилл ошибочный).
- **leader** (18) — платят.
- **mentor** (7) — платят.

### Принцип защиты от автопаузы — **два разных механизма:**

1. **По роли (автоматически в коде):** webhook не паузит роли `admin` и `applicant` независимо от флага. Это структурное решение, не исключение.
2. **По флагу `auto_pause_exempt` (вручную, точечно):** для бартеров и постоянных льгот среди платящих ролей. Список «Без автопаузы» показывает только эту категорию.

### Триггер на смену роли:

При переходе `role` из (admin, applicant) в платящую (intern, leader, mentor) — автоматически сбросить `auto_pause_exempt=false`. Это для случая «абитуриентка прошла курс → стажёр → должна начать платить».

---

## Что делать (по шагам)

### Шаг 1: миграция phase30 — чистка exempt + триггер на смену роли

Файл `migrations/2026-05-16_phase30_exempt_role_cleanup.sql`:

```sql
BEGIN;

-- 1. Снять exempt с тех, у кого он был от бэкфилла phase29 (admin/applicant/intern).
-- Это явное действие; реальные исключения (если бы были) — None.
UPDATE public.profiles
   SET auto_pause_exempt = false,
       auto_pause_exempt_until = null,
       auto_pause_exempt_note = null
 WHERE role IN ('admin', 'applicant', 'intern')
   AND auto_pause_exempt = true;

-- 2. Триггер на смену role: при переходе от non-paying к paying — сбросить exempt.
CREATE OR REPLACE FUNCTION public.reset_exempt_on_role_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.role IN ('admin', 'applicant')
       AND NEW.role IN ('intern', 'leader', 'mentor')
       AND NEW.auto_pause_exempt = true THEN
        NEW.auto_pause_exempt := false;
        NEW.auto_pause_exempt_until := NULL;
        NEW.auto_pause_exempt_note := COALESCE(NEW.auto_pause_exempt_note, '')
            || ' [auto-reset on role change to ' || NEW.role || ' at ' || now()::text || ']';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_exempt_on_role_change ON public.profiles;
CREATE TRIGGER trg_reset_exempt_on_role_change
  BEFORE UPDATE OF role
  ON public.profiles
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION public.reset_exempt_on_role_change();

SELECT public.ensure_garden_grants();

COMMIT;

-- VERIFY:
SELECT role, count(*) FILTER (WHERE auto_pause_exempt) as exempt
FROM public.profiles GROUP BY role ORDER BY role;
-- Ожидание: 0 exempt по всем ролям (никаких manual override'ов пока нет).
```

### Шаг 2: код push-server — защита по роли

В `push-server/server.mjs handleProdamusWebhook` (и в `runNightlyExpiryReconcile`):

**Logic:** до вызова `deriveAccessMutation` проверить роль профиля. Если `role IN ('admin', 'applicant')` — обрабатывать как если бы `auto_pause_exempt=true` (т.е. не паузить, но логировать).

Простейший вариант: расширить `autoPauseExempt` в `applyAccessState`:

```javascript
const autoPauseExempt = Boolean(profile?.auto_pause_exempt)
  || ['admin', 'applicant'].includes(String(profile?.role || '').toLowerCase());
```

И аналогично в `runNightlyExpiryReconcile`:

```sql
WHERE role NOT IN ('admin', 'applicant')          -- расширили условие
  AND COALESCE(auto_pause_exempt, false) = false
  AND COALESCE(access_status, 'active') = 'active'
  AND paid_until IS NOT NULL
  AND paid_until < now()
```

Сейчас там было `WHERE role <> 'admin'`. Расширить до `role NOT IN ('admin', 'applicant')`.

В логе `billing_webhook_logs.error_text` помечать `SKIPPED_BY_ROLE` для случая защиты по роли (отличить от `SKIPPED_BY_AUTO_PAUSE_EXEMPT`). Опционально, но полезно для аудита.

### Шаг 3: UI «Без автопаузы»

После миграции список будет пустым — это правильное поведение.

В `views/AdminPanel.jsx` (tab `'access'`) можно добавить мини-объяснение под заголовком:

> Здесь только индивидуальные исключения (бартеры, постоянные льготы для конкретных людей). Админы и абитуриенты защищены автоматически по своей роли — их в этом списке быть не должно.

### Шаг 4: UI карточка профиля

В модалке «Не паузить автоматически» — если у юзера `role IN ('admin', 'applicant')`, показать вместо чекбокса информационный блок:

> Защищён автоматически по роли (admin/applicant). Флаг `auto_pause_exempt` для этого юзера не имеет эффекта.

Чекбокс/радио/дата-пикер скрыть. Это убережёт Ольгу от случайных «зачем-то ставлю галочку, ничего не происходит».

### Шаг 5: тесты

В `billingLogic.test.mjs` или `server.test.mjs` (если есть) — добавить кейсы:

- role=admin + deactivation event → access_status остаётся 'active' (защита по роли)
- role=applicant + finish event → access_status остаётся 'active'
- role=intern + deactivation → access_status='paused_expired' (платит, не защищён)

---

## Apply-порядок

1. Diff миграции phase30 + миграцию на ревью.
2. После 🟢 — apply на прод (как обычно через SSH).
3. Diff frontend/code changes на ревью.
4. После 🟢 — commit + push + rsync + restart push-server.
5. Smoke: VERIFY список «Без автопаузы» пустой; sandbox-тест на абитуриенте (если есть симулятор) — не паузится.

---

## Что в `_session` ответ положи

`docs/_session/2026-05-16_17_codeexec_exempt_cleanup_diff.md`.
