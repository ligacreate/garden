---
title: P0 GRANT wipeout — outage логина у всех ведущих 2026-05-04
date: 2026-05-04
severity: P0
scope: 100% пользователей (60 ведущих + анонимные клиенты Meetings)
duration: ~2 часа (отчёт от ведущей ~14:44 UTC → recovery ~16:46 UTC)
status: closed (recovery applied), follow-up SEC-014
related:
  - migrations/2026-05-03_phase16_grant_role_switch_bulk.sql
  - migrations/2026-05-03_phase17_grant_execute_rls_helpers.sql
  - migrations/2026-05-04_phase18_meetings_anon_read_revoke_events_writes.sql
  - docs/lessons/2026-05-04-timeweb-role-permissions-ui-revokes-all.md
  - docs/RUNBOOK_garden.md (раздел 1.2)
  - plans/BACKLOG.md — SEC-014
audience: будущий on-call + автор SEC-014
---

# P0 GRANT wipeout — 2026-05-04

Полный outage аутентифицированных и анонимных запросов к PostgREST.
Все ведущие при логине получали `42501 permission denied for table
profiles`. Публичное Meetings-приложение получало то же на
`events/cities/notebooks/questions`. БД, PostgREST, Caddy и
garden-auth были живы и здоровы — отозваны были именно table-level
GRANT'ы для ролей `authenticated` и `web_anon` (фактически — revert
phase 16 + phase 17 + GRANT-частей phase 18).

## Timeline (UTC)

| Время | Событие |
|---|---|
| ~14:44 | Первый report от ведущей Vasilina Luzina (`vasilina_luzina@mail.ru`) — пишет Ольге, что не может войти. |
| ~16:30–16:44 | Параллельная диагностика: стратег (claude.ai) read-only ssh + 8-пунктовый recon-отчёт от исполнителя. |
| ~16:45 | Apply phase 16 + phase 17 + phase 18 PART 1 (4 GRANT) + `NOTIFY pgrst, 'reload schema'`. |
| ~16:46 | Smoke зелёный, Ольга подтвердила логин в браузере. |

Длительность outage от первого report'а до recovery: **~2 часа**.
Реальное начало wipe'а — неизвестно (см. monitoring-gap).

## Симптом

- **Ведущие при логине:** браузерный alert
  ```json
  {"code":"42501","message":"permission denied for table profiles"}
  ```
  (raw PostgREST JSON виден из-за BUG-LOGIN-RAW-ERROR-MSG — отдельный
  таск).
- **Публичное Meetings (`meetings.skrebeyko.ru`):** показывало
  «Не удалось загрузить свежие данные, показаны старые» — кеш в
  Meetings закрывал дыру так же, как было в инциденте 2026-05-03
  post-phase-16 (см. `docs/lessons/2026-05-04-postgrest-role-switch-anon-clients.md`).
- **Личный кабинет Garden:** AuthScreen «крутился» / откидывал на
  логин (BUG-LOGIN-SILENT-PROFILE-FAIL — отдельный таск, тот же
  pattern что был в NEW-BUG-007).

## Diagnostic findings (через `ssh root@5.129.251.56` + psql, read-only)

### `public.profiles` — GRANT'ы

```
 grantee  | privilege_type
----------+----------------
 gen_user | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
```
Только owner. **Ни одной строки** для `authenticated` или `web_anon`.
RLS включена, policies на месте — но table-level GRANT проверяется
**раньше** RLS, поэтому policies даже не доходят до проверки.

### Аудит по всем 45 public-таблицам

```
SELECT grantee, count(*) FROM information_schema.role_table_grants
WHERE table_schema='public' GROUP BY grantee;
```
| grantee | rows |
|---|---|
| `gen_user` | 315 |
| `authenticated` | **0** |
| `web_anon` | **0** |

То есть Wipe — **массовый и точечный по двум ролям**. Ни одной
public-таблицы не доступно ни authenticated, ни web_anon.

### Роли живы

```
    rolname    | rolcanlogin | rolinherit
---------------+-------------+------------
 authenticated | f           | t
 web_anon      | f           | t
```
Существуют, корректно `nologin`. `authenticator` отсутствует (PostgREST
коннектится напрямую под `gen_user`, см. ниже).

### EXECUTE на helper-функциях

- `is_mentor_for(uuid)` — **PRIVILEGES стёрты** (только owner). Phase 17 эту GRANT'у назад вернёт.
- `is_admin()` — выжил (default `EXECUTE TO PUBLIC` в Postgres). Wipe не задел.

### Sequence usage

`USAGE` на public sequences для authenticated — отозвана. Phase 16 содержит блок их повторной выдачи, что и подтверждается на recovery (re-grant прошёл без ошибок).

### PostgREST/Caddy/auth

- **PostgREST** (docker `postgrest`, Up 42h): жив, schema cache
  загружен (`Schema cache loaded 45 Relations`), коннект под
  `gen_user` через `PGRST_DB_URI`, `PGRST_DB_ANON_ROLE=web_anon`.
  Никаких 42501 в логах PostgREST не видно — он трансформирует их
  в HTTP-ответ и не пишет access-log в default-конфигурации.
- **Caddy** (systemd `caddy.service`): жив, `api.skrebeyko.ru`
  корректно роутит `/auth/*` → :3001, всё остальное → :3000.
  **Access-log не настроен** — `journalctl -u caddy --since "30 min ago"`
  возвращает `-- No entries --`.
- **garden-auth** (systemd `garden-auth.service`, port 3001): жив с
  2026-05-02 22:41:59 UTC, последний лог-message — startup. Логи
  операций не пишет.
- **JWT secrets:** `auth.JWT_SECRET` и `postgrest.PGRST_JWT_SECRET`
  **совпадают** (sha256 `af6abafc2d7c07b876b3035c58906884c80ef8307596532f851144b1fe65e486`).

### Vasilina в БД

- `profiles`: `6cf385c3-…-bac7 | vasilina_luzina@mail.ru | mentor | active | 2021-01-18`.
- `users_auth`: тот же UUID.
- Связь корректная, статус `active`. Учётка не виновата —
  падают **все** аутентифицированные запросы.

## Корневая причина

**Полный revert table-level GRANT'ов для `authenticated` и `web_anon`
на схеме `public`** — точечно по двум ролям, без затрагивания owner
(`gen_user`), ролей-определений, RLS-policies, функций и триггеров.

Самая вероятная причина — **Timeweb Cloud UI quirk**: сохранение
чек-боксов в разделе «Привилегии роли» делает `REVOKE ALL FROM <role>`
с последующим выдачей только дефолтных галочек. Этот же quirk уже
зафиксирован в `docs/RUNBOOK_garden.md` раздел 1.2 для роли
`gen_user` — здесь он сработал на authenticated/web_anon.

Альтернативные гипотезы исключены:
- Никаких ручных `REVOKE` через psql/миграции — нет в `migrations/`,
  нет в commit history.
- Никаких автоматических операций (cron, pg_cron, audit triggers).
- Wipe **точечно по двум ролям** — это исключает «откат бэкапа»
  или «другая БД».

Подробный паттерн и профилактика — в
[docs/lessons/2026-05-04-timeweb-role-permissions-ui-revokes-all.md](lessons/2026-05-04-timeweb-role-permissions-ui-revokes-all.md).

## Recovery (применённые команды)

Все три шага под `gen_user` через scp + psql -f, в том порядке, как
ниже. Между шагами апрувы не запрашивались (был один общий 🟢 от
стратега заранее).

### Шаг 1 — phase 16
```
\i migrations/2026-05-03_phase16_grant_role_switch_bulk.sql
```
Применила: bulk GRANT authenticated на 40 таблиц (39 full CRUD +
pvl_audit_log как Tier-2 SELECT+INSERT) + GRANT USAGE на sequences +
NOTIFY pgrst.

Verify внутри миграции (V1, V2): 40 таблиц у authenticated, 5 контрольных без SELECT (`events_archive`, `messages`, `push_subscriptions`, `to_archive`, `users_auth` — by design).

### Шаг 2 — phase 17
```
\i migrations/2026-05-03_phase17_grant_execute_rls_helpers.sql
```
Применила: `GRANT EXECUTE` на `is_admin()` и `is_mentor_for(uuid)` для
authenticated.

Verify: оба `auth_has_exec=t`, deferred-функции (`get_events_public`,
`handle_new_user`, `increment_user_seeds`) — не задеты.

### Шаг 3 — phase 18 PART 1+3 (без PART 2)

```sql
BEGIN;
GRANT SELECT ON public.events    TO web_anon;
GRANT SELECT ON public.cities    TO web_anon;
GRANT SELECT ON public.notebooks TO web_anon;
GRANT SELECT ON public.questions TO web_anon;
NOTIFY pgrst, 'reload schema';
COMMIT;
```

**PART 2 (REVOKE writes на events) НЕ применяли** — она уже откатана
phase 19 ([migrations/2026-05-04_phase19_revert_events_revoke_plus_trigger_definer.sql](../migrations/2026-05-04_phase19_revert_events_revoke_plus_trigger_definer.sql)).
Повторный REVOKE снова уронил бы фронт PATCH /events.

## Smoke (post-recovery, отдельная сессия)

| Проверка | Результат | Ожидание |
|---|---|---|
| **A.** GRANT-rows для `authenticated` | **158** | > 0 |
| **A.** GRANT-rows для `web_anon` | **4** | > 0 |
| **B.** `SET ROLE authenticated; SELECT count(*) FROM profiles;` | **0 строк** | НЕ 42501 (RLS отрабатывает: без JWT `auth.uid()` IS NULL → policy фильтрует — 0 это OK) |
| **C.** `SET ROLE web_anon; SELECT count(*) FROM events;` | **155** | НЕ 42501 |
| **D.** `is_admin()` под authenticated | `f` | без `permission denied for function` |
| **D.** `is_mentor_for(zero-uuid)` под authenticated | `f` | без `permission denied for function` |

**Браузерная репродукция:** Ольга подтвердила, что логин ведущей
работает.

## Что НЕ задело

- **Структура схемы.** Колонки/типы/PK/FK/индексы — без изменений.
- **RLS-policies.** `\dp public.profiles` показал все 4 policy на
  месте (`profiles_select_authenticated`, `profiles_insert_own`,
  `profiles_update_own`, `profiles_update_admin`). По всем 45
  таблицам policy-уровень не затронут.
- **Определения функций.** `is_admin()`, `is_mentor_for(uuid)`,
  `sync_meeting_to_event()` (включая phase 19 `SECURITY DEFINER`
  + `SET search_path = public`), phase 21 `resync_events_for_user(uuid)`
  и `trg_profiles_status_resync_events()` — все на месте,
  тела не изменены.
- **Триггеры.** `sync_meeting_to_event` на `meetings`,
  `on_profile_status_change_resync_events` на `profiles` — оба
  активны.
- **Owner privileges.** `gen_user` сохранил все 315 GRANT-rows,
  PostgREST коннектится без проблем, schema cache загружается.
- **JWT secrets.** Не разъехались, sha256 совпадают.
- **Данные.** Никакие записи не пострадали — это GRANT-инцидент,
  не data-инцидент.

## Monitoring-gap (попало в lessons)

Невозможно увидеть **сам запрос Vasilina с 42501** в логах:

- **Caddy** — нет директивы `log` в Caddyfile, `journalctl -u caddy`
  пуст за последние 30 минут.
- **PostgREST** — default-конфигурация не пишет request-log на STDOUT;
  ошибки 42501 не логгируются (трансформируются в HTTP-ответ).
- **garden-auth** — логгирует только startup-сообщение, операций не
  пишет.

Без active reproduction (повторить логин под Vasilina с открытым
DevTools или sniffer'ом на сервере) — конкретный запрос не достать
из истории. Это покрывает SEC-014 (см. ниже): нужен мониторинг хотя
бы метрики «count GRANT-rows», чтобы детектить wipe **до** report'а
от пользователя.

## Открытое

**SEC-014** ([plans/BACKLOG.md](../plans/BACKLOG.md)) — расследование
причины + защитный мониторинг + idempotent recovery-скрипт +
обновление RUNBOOK 1.2.

## Ссылки

- Recovery-миграции:
  - [migrations/2026-05-03_phase16_grant_role_switch_bulk.sql](../migrations/2026-05-03_phase16_grant_role_switch_bulk.sql)
  - [migrations/2026-05-03_phase17_grant_execute_rls_helpers.sql](../migrations/2026-05-03_phase17_grant_execute_rls_helpers.sql)
  - [migrations/2026-05-04_phase18_meetings_anon_read_revoke_events_writes.sql](../migrations/2026-05-04_phase18_meetings_anon_read_revoke_events_writes.sql) (PART 1+3 only)
- Урок:
  [docs/lessons/2026-05-04-timeweb-role-permissions-ui-revokes-all.md](lessons/2026-05-04-timeweb-role-permissions-ui-revokes-all.md)
- RUNBOOK quirk: [docs/RUNBOOK_garden.md](RUNBOOK_garden.md) раздел 1.2
- Связанные lessons:
  [docs/lessons/2026-05-04-postgrest-role-switch-anon-clients.md](lessons/2026-05-04-postgrest-role-switch-anon-clients.md)
  (тот же класс «GRANT-исчезли → PostgREST 42501»).
