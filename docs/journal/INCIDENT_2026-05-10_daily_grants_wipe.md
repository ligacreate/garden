---
title: P1 ежедневный GRANT wipe в 13:10:01 UTC — root cause неизвестна
date: 2026-05-10
severity: P1
scope: 100% authenticated + web_anon (60 ведущих + анонимные клиенты Meetings)
duration: ~10–20 секунд каждый день (recovery работает)
status: open — нужен Timeweb support
related:
  - docs/journal/INCIDENT_2026-05-04_grant_wipeout.md (первый wipe, исходно P0)
  - docs/journal/INCIDENT_2026-05-10_tg_blackbox.md (почему не видели 5 дней)
  - docs/lessons/2026-05-04-timeweb-role-permissions-ui-revokes-all.md
  - scripts/check_grants.sh + scripts/recover_grants.sh (SEC-014)
audience: Ольга / стратег / тот, кто пишет в Timeweb support
---

# Ежедневный GRANT wipe authenticated/web_anon в 13:10:01 UTC

С 2026-05-06 каждый день **ровно в 13:10:01 UTC** на сервере
`msk-1-vm-423o` (Timeweb Cloud, hosting `5.129.251.56`) полностью
отзываются table-level GRANT'ы для ролей `authenticated` и
`web_anon` на схеме `public`. SEC-014 автоматически восстанавливает
их в течение 10–20 секунд, поэтому пользователи не видят outage.

Но это **регулярная ежедневная P1** (каждый раз — окно 10–20 сек,
когда логин лёг бы у всех; и каждый раз ставка на recovery,
который сам может однажды упасть).

## Timeline (UTC)

| Дата | WIPE detected | Recovery completed | Alert |
|---|---|---|---|
| 2026-05-04 | ~15:00 (manual) | ~16:46 (manual) | (исходный P0, был оповещён руками) |
| 2026-05-06 | 13:10:01 | 13:10:11 (auto) | failed (TG blackbox) |
| 2026-05-07 | 13:10:01 | 13:10:11 (auto) | failed (TG blackbox) |
| 2026-05-08 | 13:10:01 | 13:10:11 (auto) | failed (TG blackbox) |
| 2026-05-09 | 13:10:01 | 13:10:11 (auto) | failed (TG blackbox) |
| 2026-05-10 | 13:10:01 | 13:10:11 (auto) | failed (TG blackbox) |

После починки TG-канала (см. `INCIDENT_2026-05-10_tg_blackbox.md`)
следующий wipe **2026-05-11 в 13:10:01 UTC** (если паттерн
сохранится) даст нам первый честный TG-alert от check_grants.sh.

## Симптом

- `authenticated`: 158 → 0 GRANT-rows.
- `web_anon`: 4 → 0 GRANT-rows.
- На 10–20 секунд: все запросы под этими ролями получают
  `42501 permission denied for table <X>`. Та же картина, что в
  P0 от 2026-05-04, только короче.

## Что **точно** не виновато

- **Никаких автоматических GRANT/REVOKE-операций в нашем коде**:
  ни в `migrations/*.sql`, ни в commit history.
- **Никаких pg_cron заданий** — `\dx` не показывает pg_cron.
- **Никаких наших cron-задач** в `/etc/cron.*` — там только
  `check_grants.sh` (но он только READ + recovery, не REVOKE).
- **PostgREST/Caddy/garden-auth** — не имеют SQL-доступа на REVOKE
  (gen_user не делает REVOKE сам по себе).

## Гипотезы по корневой причине (не подтверждены)

1. **Timeweb Cloud platform task** — какая-то системная задача
   платформы, которая бьёт по «нестандартным» ролям ежедневно
   (например, security-scan, который видит роли без `LOGIN` и
   воспринимает как «фантомные» → зачищает privileges). Самая
   вероятная — паттерн ровно в 13:10 UTC (16:10 МСК, 19:10 SGT)
   намекает на регламентное задание, не пользовательское.
2. **Backup/restore процесс** — некий nightly-restore, который
   восстанавливает БД из снимка, где GRANT'ов уже не было. Тогда
   wipe не случайный, а «откат к состоянию X». Проверить:
   совпадает ли `pg_stat_database.stats_reset` или иной marker с
   13:10:01 UTC.
3. **UI-quirk Timeweb** ([RUNBOOK_garden.md](../RUNBOOK_garden.md)
   раздел 1.2): сохранение чекбоксов «Привилегии роли» в
   Timeweb-панели делает `REVOKE ALL`. Но это **ручное** действие,
   не объяснит ежедневное расписание.
4. **Role audit cron на стороне платформы** — Timeweb может иметь
   свой watchdog, который раз в сутки приводит роли к «образцу».

Гипотеза 1 или 4 — **наиболее вероятна**. Нужно подтверждение от
поддержки.

## Что нужно сделать

### 5.4.A — Открыть тикет в Timeweb support

**Тема:** «На VM msk-1-vm-423o (5.129.251.56) ежедневно в
13:10:01 UTC отзываются GRANT'ы PostgreSQL для пользовательских
ролей»

**Тело:**
- Сервер: msk-1-vm-423o (5.129.251.56), PostgreSQL service.
- Время: каждый день, ровно 13:10:01 UTC, начиная с 2026-05-06.
- Что происходит: на схеме public для ролей `authenticated`
  (158 GRANT-rows) и `web_anon` (4 GRANT-rows) выполняется
  REVOKE ALL.
- Owner-роль `gen_user` не задета (315 GRANT-rows сохраняются).
- Это не наш cron, не pg_cron, не наша миграция. Логи привожу
  ниже (`/var/log/garden-monitor.log`).
- Вопрос: что у вас на стороне платформы запускается в 13:10:00
  UTC и трогает роли в кастомных БД? Можем ли мы это отключить
  или исключить наши кастомные роли?

Приложить:
- Полный grep `WIPE detected` из `/var/log/garden-monitor.log`
  (5 строк).
- Output `psql -c "SELECT * FROM pg_stat_activity WHERE
  query LIKE '%REVOKE%' OR query LIKE '%GRANT%' AND backend_start
  > now() - interval '24h'"` за следующее окно 13:09–13:11 UTC.

### 5.4.B — Дождаться первого TG-alert на 2026-05-11

После починки blackbox следующий ежедневный wipe пришлёт alert
в `@garden_grants_monitor_bot`. Ожидаемый текст (формат
check_grants.sh):

```
🚨 GRANT WIPE detected on garden DB
authenticated=0 web_anon=0
Recovery starting...
```

Если на 2026-05-11 13:10 UTC alert **не пришёл** — что-то
сломалось дополнительно (либо паттерн прекратился, либо
recovery теперь падает). Проверить вручную.

### 5.4.C — Если Timeweb не помогает: pg_audit на роль

В крайнем случае — поднять `pg_audit` extension с фильтром на
`role` operations и записывать всё, что трогает GRANT/REVOKE.
Это даст PID процесса и user, который делает REVOKE. Но это
дополнительный CPU и log-объём, делаем только если support
не даст ответа за неделю.

### 5.4.D — Защита прямо сейчас (workaround, не fix)

Cron на 13:09:50 UTC, который делает `\i phase16 && phase17 &&
phase18 PART 1+3` за 10 секунд **до** wipe'а. Это не лечит, но
сокращает окно outage с 10–20 сек до 0 сек (при условии, что
wipe идёт после нашего pre-emptive grant, что не гарантировано
без знания root cause).

Не делаем без обсуждения — может конфликтовать с тем, что
делает Timeweb.

## Связанные документы

- [INCIDENT_2026-05-04_grant_wipeout.md](INCIDENT_2026-05-04_grant_wipeout.md)
  — первоисточник, P0 при ручном wipe.
- [INCIDENT_2026-05-10_tg_blackbox.md](INCIDENT_2026-05-10_tg_blackbox.md)
  — почему 5 дней не было видно.
- [docs/lessons/2026-05-04-timeweb-role-permissions-ui-revokes-all.md](../lessons/2026-05-04-timeweb-role-permissions-ui-revokes-all.md)
  — паттерн «исчезли GRANT'ы → 42501» и его профилактика.
- `scripts/check_grants.sh` — мониторинг.
- `scripts/recover_grants.sh` — auto-recovery (работает).

## Открытые вопросы

- Точное содержимое Timeweb-тикета — пишет Ольга или стратег?
- Есть ли смысл писать тикет до того, как мы соберём pg_audit?
  Отвечу: да, тикет первым шагом — Timeweb может ответить за
  час, и pg_audit не понадобится.
- Можем ли мы заранее заложить в backup-стратегию: «если на
  следующее утро не было recovery-alert'а — что-то сломалось
  тише, проверить вручную»? Это уже отдельная фича для SEC-014.
