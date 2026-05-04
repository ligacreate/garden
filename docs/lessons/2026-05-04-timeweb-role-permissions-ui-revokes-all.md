---
title: Timeweb Cloud UI «Привилегии роли» — destructive on save
type: lesson
created: 2026-05-04
related_incident: P0 GRANT WIPEOUT 2026-05-04 (outage логина у всех ведущих ~2 ч)
related_files:
  - docs/INCIDENT_2026-05-04_grant_wipeout.md
  - docs/RUNBOOK_garden.md (раздел 1.2 — тот же quirk для gen_user)
  - migrations/2026-05-03_phase16_grant_role_switch_bulk.sql
  - migrations/2026-05-03_phase17_grant_execute_rls_helpers.sql
  - migrations/2026-05-04_phase18_meetings_anon_read_revoke_events_writes.sql
related_lessons:
  - docs/lessons/2026-05-04-postgrest-role-switch-anon-clients.md (тот же класс симптома: GRANT исчезли → 42501 у всех клиентов)
---

# Timeweb Cloud UI «Привилегии роли» — destructive on save

## Симптом

Все аутентифицированные запросы к PostgREST мгновенно падают с
`42501 permission denied for table <name>`. Анонимные запросы
к public-таблицам (events, cities, notebooks, questions из
Meetings-app) — то же самое. БД, PostgREST, Caddy и auth-сервис
живы, JWT-секреты совпадают, RLS-policies на месте, миграции в
`migrations/` не менялись.

## Корневой механизм

В Timeweb Cloud (и аналогичных managed-PostgreSQL панелях) есть
раздел «Привилегии роли» — таблица с чек-боксами по каждому
объекту схемы. Открытие этого раздела для любой роли (`gen_user`,
`authenticated`, `web_anon`) показывает чек-боксы в дефолтном
состоянии — те, которые UI считает «нормальными по умолчанию».
Реальные GRANT'ы, выданные миграциями, в эту дефолтную картину
не попадают.

При нажатии «Сохранить» UI:

1. Выполняет `REVOKE ALL ON <objects> FROM <role>` (полный сброс).
2. Затем выдаёт только те привилегии, которые отмечены чек-боксами
   в дефолтной картине UI.

Результат: **все табличные GRANT'ы из `migrations/` для этой роли
стираются**. Если в дефолте UI чек-боксов на public-таблицы нет
(а их нет для `authenticated`/`web_anon`, потому что это не
встроенные роли Postgres) — роль остаётся **с нулём GRANT'ов**.

Этот же quirk уже задокументирован в `docs/RUNBOOK_garden.md`
раздел 1.2 для роли `gen_user`. Там симптом был «прод не работает,
gen_user потерял права». Здесь тот же механизм сработал на
`authenticated`/`web_anon`.

## Как обнаружить

Один SQL-запрос даёт мгновенный сигнал:

```sql
SELECT grantee, count(*) AS rows
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('authenticated', 'web_anon')
GROUP BY grantee;
```

**Здоровое состояние** (post-phase-16+18):
| grantee | rows |
|---|---|
| authenticated | ≥ 158 |
| web_anon | ≥ 4 |

**Wipe**: 0 строк (или роль вообще отсутствует в результате).

Также сразу видно через `\dp public.profiles` — в столбце
`Access privileges` остаётся только `gen_user=arwdDxt/gen_user`,
без строк `authenticated=...` и `web_anon=r/...`.

## Recovery playbook (1 команда)

Re-apply трёх миграций под `gen_user` через scp + psql -f, в этом
порядке (между шагами апрувы не нужны — БД уже сломана, восстановление
идемпотентно):

```bash
# scp файлов на сервер
scp migrations/2026-05-03_phase16_grant_role_switch_bulk.sql \
    migrations/2026-05-03_phase17_grant_execute_rls_helpers.sql \
    root@5.129.251.56:/tmp/

# apply
ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 \
  -f /tmp/2026-05-03_phase16_grant_role_switch_bulk.sql \
  -f /tmp/2026-05-03_phase17_grant_execute_rls_helpers.sql'

# phase 18 PART 1+3 (НЕ применять PART 2 — она откатана phase 19)
ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 -c "
    BEGIN;
      GRANT SELECT ON public.events    TO web_anon;
      GRANT SELECT ON public.cities    TO web_anon;
      GRANT SELECT ON public.notebooks TO web_anon;
      GRANT SELECT ON public.questions TO web_anon;
      NOTIFY pgrst, '\''reload schema'\'';
    COMMIT;"'
```

После recovery — `SELECT count(*)` под `SET ROLE authenticated`
и `SET ROLE web_anon` для проверки, что 42501 больше не возникает.

⚠ **НЕ применять phase 18 целиком**: PART 2 (REVOKE writes на events
от authenticated) откатана phase 19 — её повтор снова сломает
ведущим возможность сохранять события.

SEC-014 предусматривает оформление этого в `scripts/recover_grants.sh`
как одной команды.

## Профилактика

1. **НЕ открывать раздел «Привилегии роли» в Timeweb UI** — ни для
   просмотра, ни для редактирования. Сама загрузка раздела ничего
   не ломает, но любое нажатие «Сохранить» (даже без видимых
   изменений) триггерит REVOKE ALL.
2. **Для инспекции прав — только psql**: `\dp public.<table>`,
   `SELECT … FROM information_schema.role_table_grants WHERE …`.
   Это и быстрее, и безопасно.
3. **Для редактирования прав — только миграции в `migrations/`**.
   UI не использовать никогда.
4. **Защитный мониторинг** (SEC-014): cron-job, который раз в N
   минут считает count GRANT-rows для `authenticated` и `web_anon`,
   alert при падении ниже threshold.
5. Распространить ту же дисциплину на других admin'ов аккаунта
   Timeweb — в момент инцидента 2026-05-04 непонятно, какой именно
   аккаунт открыл UI.

## Связанные документы

- [docs/INCIDENT_2026-05-04_grant_wipeout.md](../INCIDENT_2026-05-04_grant_wipeout.md)
  — полный отчёт инцидента с timeline и smoke.
- [docs/RUNBOOK_garden.md](../RUNBOOK_garden.md) раздел 1.2 — тот же
  quirk для `gen_user`, описанный после первой реализации.
- [docs/lessons/2026-05-04-postgrest-role-switch-anon-clients.md](2026-05-04-postgrest-role-switch-anon-clients.md)
  — близкий класс симптома (PostgREST role-switch без GRANT для anon
  → 42501), там был не wipe, а изначально невыданные GRANT.
