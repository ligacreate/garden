---
title: Timeweb managed-Postgres revoke'ает кастомные grants после DDL
date: 2026-05-05
type: lesson
related:
  - docs/INCIDENT_2026-05-04_grant_wipeout.md
  - docs/lessons/2026-05-04-timeweb-role-permissions-ui-revokes-all.md
  - migrations/2026-05-05_phase23_grants_safety_net.sql
  - SEC-014 (plans/BACKLOG.md)
---

# Timeweb managed-Postgres revoke'ает кастомные grants после DDL

## Симптом

Два P0 GRANT WIPEOUT за 2 дня:

- **2026-05-04, ~14:44 UTC** — после phase 21 (pause-hides-events).
  Все table-level GRANT'ы для `authenticated` и `web_anon` на 45
  public-таблицах исчезли + EXECUTE на `is_mentor_for(uuid)` стёрт.
  Фронт ловит `42501 permission denied for table profiles` при
  каждом login. Outage ~2 ч до recovery.
- **2026-05-05, ~30 минут после phase 22 apply** (FEAT-002 этап 2,
  ALTER TABLE profiles + events). Те же симптомы, тот же выход.

Каждый раз recovery — `re-apply phase 16 + 17 + 18 PART 1` (PART 2
phase 18 откатан в phase 19, не повторяем).

## Корневая причина

Гипотеза: managed-Postgres Timeweb запускает **ACL-resync с
baseline после schema-changing операций** (ALTER TABLE, CREATE
FUNCTION, etc.). После DDL у роли возвращается дефолтный набор
привилегий — кастомные `GRANT TO authenticated/web_anon`,
наложенные нами после SEC-001, перетираются.

Аргументы за:

- Корреляция оба раза: wipe в течение 30 минут после DDL.
- На прод-сервере **никто из людей в Timeweb UI не заходил**
  (Ольга подтвердила).
- Event-triggers в Postgres пустые (стратег прогнала
  `SELECT * FROM pg_event_trigger`).
- Конкретный механизм недоступен — это managed-сервис, доступа
  к background-tasks/cron на уровне Postgres у нас нет.

Альтернативные гипотезы (не подтверждены):

- Replication slot / failover. Не подтверждено: WAL-уровень
  применения не должен dropить ACL.
- Какая-то DBA-автоматизация Timeweb (ожидаемое поведение
  managed-сервиса). Подтверждение требует обращения в support.

## Почему так получилось

Слепое пятно архитектуры: **managed-Postgres имеет свои
скрытые автоматизации**, которые не описаны в Timeweb-доке и
не наблюдаемы на уровне SQL без специального аудита. SEC-001
закладывала фундамент GRANT'ов так, как делается в self-hosted
Postgres — с предположением, что SQL-команды вечны до явного
REVOKE. На managed-платформе это предположение ложно.

Аналог mistake'а уже был зафиксирован 2026-05-04 в lesson
`timeweb-role-permissions-ui-revokes-all.md` (UI-форма
«Привилегии роли» делает REVOKE ALL on save). DDL-revoke —
второй, более скрытый, экземпляр того же класса.

## Как починили

Трёхслойная защита (phase 23 + recovery + cron-monitor):

1. **stored procedure `public.ensure_garden_grants()`** — создана
   в `migrations/2026-05-05_phase23_grants_safety_net.sql`.
   SECURITY DEFINER, точно повторяет phase 16/17/18 PART 1 (39
   таблиц SELECT/INSERT/UPDATE/DELETE для authenticated +
   `pvl_audit_log` SELECT/INSERT + GRANT USAGE on all sequences +
   EXECUTE на `is_admin`/`is_mentor_for` + 4 таблицы SELECT для
   web_anon + NOTIFY pgrst). Идемпотентна.
2. **Inline-call в каждой будущей DDL-миграции** — добавлено
   правило в `docs/RUNBOOK_garden.md` раздел 1.3. Контракт:
   `SELECT public.ensure_garden_grants()` ставится в конец
   транзакции, ДО `COMMIT`, на случай если revoke происходит
   синхронно с коммитом.
3. **cron-monitor** — `/opt/garden-monitor/check_grants.sh`
   каждые 5 минут проверяет counts (`authenticated < 100` ИЛИ
   `web_anon < 4` → wipe). При wipe — Telegram-алерт + авто-вызов
   `/opt/garden-monitor/recover_grants.sh` (idempotent
   `SELECT ensure_garden_grants()`). Худший случай — outage
   ≤ 5 мин до автоматического recovery.

**Apply phase 23 (2026-05-05):** counts остались 158/4 ровно
после COMMIT. Гипотеза о синхронном с COMMIT revoke не
подтверждена. Это значит wipe asynchronous (если он
действительно происходит) — cron-monitor его подберёт.

## Что проверить в будущем

- **Любая DDL-миграция должна заканчиваться `SELECT
  public.ensure_garden_grants()`** перед COMMIT. Code review
  миграций — проверять это правило.
- При wipe-инциденте **первое действие** —
  `/opt/garden-monitor/recover_grants.sh`. Авто-recovery должен
  отрабатывать в течение 5 минут от появления симптома; если
  не сработал — проверить cron (`systemctl status cron`,
  `tail /var/log/garden-monitor.log`).
- Если cron-monitor сработал, но wipe повторился через 5 мин —
  это указывает на active revoke source (не one-shot после
  DDL). Тогда нужен RCA на уровне Postgres logs / Timeweb
  support ticket.
- **Открытый вопрос:** ticket в Timeweb support — описать паттерн,
  попросить explain. Нужен для понимания root cause; не блокер,
  потому что трёхслойная защита держит.

## Связанные паттерны

- 2026-05-04: `timeweb-role-permissions-ui-revokes-all.md` —
  UI-форма Timeweb делает ACL-snapshot replacement при save.
  То же семейство ошибки (managed-сервис незаметно меняет ACL).
- 2026-05-03: SEC-001 phase 16 — bulk GRANT для authenticated.
  Исходные кастомные grants, которые revoke стирает.
- 2026-05-04: phase 21 / 2026-05-05: phase 22 — DDL-миграции, на
  которые wipe реагирует.
