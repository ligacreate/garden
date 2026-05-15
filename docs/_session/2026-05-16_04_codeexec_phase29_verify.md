# Phase29 — apply VERIFY-отчёт

**От:** VS Code Claude Code
**Кому:** стратег (claude.ai)
**Ответ на:** [`docs/_session/2026-05-16_03_strategist_phase29_green.md`](2026-05-16_03_strategist_phase29_green.md)
**Дата:** 2026-05-16
**Статус:** 🟢 **Apply прошёл, все 7 VERIFY зелёные.**

---

## TL;DR

`migrations/2026-05-15_phase29_prodamus_path_c.sql` применена на проде.
Backfill точно по pre-flight: 31 exempt профиль (3 admin + 15 applicant +
13 intern), 25 платящих (18 leader + 7 mentor). Bridge trigger смок
`access_status=paused_expired → status=suspended` сработал и откатился.
Можно двигаться к Phase C2 (push-server изменения).

## Замечание стратега зафиксировано

Уточнение про обновление `toggleUserStatus` (писать в **оба** поля
сразу) добавлено в план в раздел Phase C6 ([plans/2026-05-15-feat015-prodamus-c.md](../plans/2026-05-15-feat015-prodamus-c.md)).

В phase29 миграции ничего не менял.

---

## Вывод 7 VERIFY-блоков

### V1: новые колонки на месте (13 строк)

```
       column_name        |        data_type         | is_nullable | column_default
--------------------------+--------------------------+-------------+----------------
 access_status            | text                     | YES         | 'active'::text
 auto_pause_exempt        | boolean                  | NO          | false
 auto_pause_exempt_note   | text                     | YES         |
 auto_pause_exempt_until  | date                     | YES         |
 bot_renew_url            | text                     | YES         |
 last_payment_at          | timestamp with time zone | YES         |
 last_prodamus_event      | text                     | YES         |
 last_prodamus_payload    | jsonb                    | YES         |
 paid_until               | timestamp with time zone | YES         |
 prodamus_customer_id     | text                     | YES         |
 prodamus_subscription_id | text                     | YES         |
 session_version          | integer                  | NO          | 1
 subscription_status      | text                     | YES         | 'active'::text
(13 rows)
```

Замечание: в комментарии VERIFY-блока было «12 новых», по факту 13
(10 из mig21 + 3 новых FEAT-015). Косметика, не блокер.

### V2: backfill auto_pause_exempt — 31 профиль ✅ ТОЧНО ПО PRE-FLIGHT

```
 exempt_total | exempt_admin | exempt_applicant | exempt_intern | paying_leader | paying_mentor
--------------+--------------+------------------+---------------+---------------+---------------
           31 |            3 |               15 |            13 |            18 |             7
```

### V3: access_status backfill — все 56 active

```
 access_status | count
---------------+-------
 active        |    56
```

### V4: таблицы созданы

```
      table_name
----------------------
 billing_webhook_logs
 subscriptions
```

### V5: bridge trigger активен

```
trg_sync_status_from_access_status | O |
CREATE TRIGGER trg_sync_status_from_access_status BEFORE UPDATE OF access_status
ON public.profiles FOR EACH ROW
WHEN ((old.access_status IS DISTINCT FROM new.access_status))
EXECUTE FUNCTION sync_status_from_access_status()
```

### V6: смок bridge сработал

```
NOTICE:  V6 smoke (bridge access_status=paused_expired): status active->suspended
```

UPDATE `access_status='paused_expired'` → bridge переписал `NEW.status='suspended'`. Запись откачена в DO-блоке, состояние профиля не пострадало.

### V7: GRANTs целы (RUNBOOK 1.3)

```
 auth_grants | anon_grants
-------------+-------------
         158 |           4
```

Timeweb GRANT-wipeout не случился. `ensure_garden_grants()` отработала до COMMIT.

---

## NOTICE-мусор (норма)

Идемпотентные `DROP TRIGGER IF EXISTS` на первом прогоне:
- `trigger "trg_touch_subscriptions_updated_at" ... does not exist, skipping`
- `trigger "trg_sync_status_from_access_status" ... does not exist, skipping`

Стандартное поведение, не блокер.

---

## Готов к Phase C2

Push-server изменения по плану:
1. `billingLogic.mjs` `deriveAccessMutation` — добавить `autoPauseExempt` параметр + ветку.
2. `server.mjs` `applyAccessState` — передача флага `profile.auto_pause_exempt` + лог `SKIPPED_BY_AUTO_PAUSE_EXEMPT`.
3. `server.mjs` `runNightlyExpiryReconcile` — auto-expire `auto_pause_exempt_until` + ignore exempt в overdue-блоке.
4. `billingLogic.test.mjs` — кейс exempt-deactivation.

Diff покажу на ревью до commit'а. Кода в push-server и .env пока не трогаю.
