# Drafted Timeweb support ticket — daily ACL/GRANTS wipe на managed Postgres

**От:** стратег (claude.ai)
**Для:** Ольга → Timeweb support panel
**Дата:** 2026-05-17
**Тикет:** INCIDENT-DAILY-GRANTS-WIPE-13:10-UTC (открыт 2026-05-10, root cause не закрыт)

---

## Что делать с этим документом

1. Открой support-панель Timeweb Cloud
2. Скопируй блок «Текст тикета» ниже целиком
3. **Подставь идентификатор кластера** в первое предложение (имя/ID в панели Timeweb Cloud → Базы данных → выбери managed Postgres → название кластера сверху или поле «Идентификатор»)
4. Хост `337a9e20fbb7b82646fd9413.twc1.net` уже подставлен — менять не надо
5. Отправь
6. Когда придёт ответ — пришли мне, разберём вместе

---

## Текст тикета (для копирования)

> **Тема:** Ежедневный сброс GRANT'ов на ролях `authenticated` и `web_anon` в 13:10 UTC — managed PostgreSQL
>
> Здравствуйте.
>
> На нашем managed PostgreSQL кластере (хост `337a9e20fbb7b82646fd9413.twc1.net`, идентификатор `<впиши_имя_кластера_из_панели>`) с **2026-05-06** наблюдается ежедневный сброс кастомных GRANT'ов на ролях `authenticated` и `web_anon`.
>
> ### Что происходит
>
> - **Точное время:** ежедневно в `13:10:01–13:10:02 UTC` (16:10 МСК) с точностью до 1–2 секунд.
> - **Эффект:** GRANT'ы на обеих ролях полностью обнуляются (`authenticated`: было 158 grant-строк в `information_schema.role_table_grants` → стало 0; `web_anon`: было 4 → стало 0).
> - **Восстановление:** мы держим side-car cron каждые 5 минут (`check_grants.sh`), который детектит wipe и вызывает stored procedure `public.ensure_garden_grants()` для отката GRANT'ов к baseline. Восстановление занимает ~10 секунд.
> - **User impact:** в окне `13:10:01–13:10:11 UTC` API возвращает 401/403 пользователям через PostgREST. Recovery автоматический, но JWT/PostgREST у клиентов в этот момент могут отвалиться и потребовать reload страницы.
>
> ### Паттерн в логах monitoring'а
>
> 11 дней подряд (2026-05-06 → 2026-05-16), без пропусков. Sample:
>
> ```
> [2026-05-13T13:10:02Z] check: WIPE detected: authenticated=0 web_anon=0 — starting recovery
> [2026-05-13T13:10:02Z] recover: calling ensure_garden_grants()
> [2026-05-13T13:10:02Z] recover: after recovery: authenticated=158 web_anon=4 (expected 158/4)
> [2026-05-13T13:10:02Z] recover: OK: grants restored to baseline (158/4)
> [2026-05-13T13:10:02Z] check: recovery OK
> [2026-05-14T13:10:01Z] check: WIPE detected: authenticated=0 web_anon=0 — starting recovery
> ...
> [2026-05-16T13:10:01Z] check: WIPE detected: authenticated=0 web_anon=0 — starting recovery
> [2026-05-16T13:10:02Z] recover: OK: grants restored to baseline (158/4)
> ```
>
> ### Что мы проверили на нашей стороне
>
> 1. **DDL-attribution исключён.** GRANT'ы у нас снимались ранее при DDL-операциях (известный паттерн на managed Postgres). Текущий случай — другой: события строго scheduled в одну и ту же секунду каждый день, без привязки к нашим миграциям/DDL. Мы не выполняем DDL в 13:10 UTC.
> 2. **На стороне приложения никаких scheduled job в это время нет.** Наши cron-задачи (`check_grants.sh`, `recover_grants.sh`) — только read + recovery, GRANT'ы не снимают.
> 3. **Application auth-сервис (`garden-auth`) не делает `REVOKE` / `ALTER ROLE`.**
>
> Это указывает на **scheduled-задачу на стороне managed-инфраструктуры Timeweb** (ACL resync, snapshot/restore процедура, security baseline reset или подобное), которая ежедневно сбрасывает кастомные привилегии на пользовательские роли.
>
> ### Что просим
>
> 1. **Найти источник сброса GRANT'ов на стороне Timeweb** — какой scheduled-процесс или политика этого кластера делает обнуление кастомных привилегий?
> 2. **Подтвердить документально**, что это штатное поведение (если да — где это описано в документации managed PostgreSQL?), либо что это баг.
> 3. **Если штатное** — можно ли отключить / зафиксировать ACL для кастомных ролей `authenticated` и `web_anon` на уровне политики кластера?
> 4. **Если отключить нельзя** — есть ли recommended workaround на стороне Timeweb (например, ALTER DEFAULT PRIVILEGES, который выживает resync; или event trigger, который вы поддерживаете)?
>
> Готовы прислать полный лог `/var/log/garden-monitor.log` (121 строка, 11 дней) и SQL stored procedure `public.ensure_garden_grants()`, которой мы делаем recovery, если для расследования это нужно. Также можем дать доступ для inspection в удобное вам окно.
>
> Спасибо.

---

## Что я делаю параллельно (без support'а)

Мониторинг и mitigation уже работают. Если Timeweb support не отвечает быстро или ответ требует action на нашей стороне — есть два short-term улучшения:

### Mitigation A: уменьшить cron-frequency до 1 минуты

Поменять cron c `*/5 * * * *` на `* * * * *`. Эффект — окно недоступности сокращается с ~10 сек до ~1-2 сек (в худшем случае). Стоимость — минимальная, ресурсы кластера не нагружаются (один SELECT count).

### Mitigation B: retry на стороне фронта на 401 в hot window

В `services/pvlPostgrestApi.js` уже есть retry уровня 2 для GET-запросов на network blip (BUG-PVL-SYNC). Можно расширить retry на 401 specifically в окне 13:09:55–13:10:30 UTC — пользователь даже не заметит wipe.

Обе fix'а — separate тикеты, не нужны если Timeweb даст root fix. Жду их ответ перед движением.

---

## Связанные документы

- `docs/journal/INCIDENT_2026-05-10_daily_grants_wipe.md` — журнал инцидента (если есть)
- `docs/lessons/2026-05-05-timeweb-revokes-grants-after-ddl.md` — отдельный (DDL-related) урок, **не** этот случай
- `docs/RUNBOOK_garden.md` §1.3 — DDL safety-net (`SELECT public.ensure_garden_grants()` перед COMMIT)
- `scripts/check_grants.sh`, `scripts/recover_grants.sh` (или `/opt/garden-monitor/` на проде) — текущая mitigation
