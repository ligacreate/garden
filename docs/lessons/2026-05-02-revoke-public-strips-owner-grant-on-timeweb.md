---
title: REVOKE PUBLIC удалил owner-grant в Timeweb managed Postgres
date: 2026-05-02
version: v3
type: lesson learned
severity: P0 (могло сломать push-server и garden-auth)
related:
  - docs/DB_SECURITY_AUDIT.md
  - plans/BACKLOG.md SEC-001
---

# Урок: REVOKE PUBLIC в Timeweb managed Postgres удаляет owner-grant

## Симптом

После выполнения:
```sql
REVOKE ALL ON public.messages FROM PUBLIC;
REVOKE ALL ON public.push_subscriptions FROM PUBLIC;
```

владелец таблиц `gen_user` потерял доступ к собственным таблицам:
```
ERROR: permission denied for table messages
ERROR: permission denied for table push_subscriptions
```

`pg_class.relacl` стал `{}` — пустым. Не только `PUBLIC` исчез из ACL, но и `gen_user=arwdDxt/gen_user` (explicit owner-grant).

## Корневая причина

**Слой источника:** конфигурация Timeweb managed Postgres (специфика провайдера).

В стандартном PostgreSQL `REVOKE ALL ON tbl FROM PUBLIC` удаляет grants только у указанной роли (`PUBLIC`) и не должен трогать grants других ролей, включая owner. А owner и без явных grants имеет implicit-доступ к собственной таблице (если не включён `FORCE ROW LEVEL SECURITY`).

Однако в Timeweb-managed Postgres поведение нестандартное:
1. Сначала это, видимо, какой-то custom event-trigger / extension стирает ACL целиком при определённых REVOKE-операциях.
2. Возможно — `gen_user` не имеет нормальных owner-implicit privileges (Timeweb ограничивает их).
3. Возможно — RLS включён на каком-то уровне, который не виден через `pg_class.relrowsecurity` (там показало `f`), но фактически блокирует owner.

Точная причина не выяснена, но симптом воспроизводится.

## Что было сделано (recovery)

```sql
BEGIN;
GRANT ALL ON public.messages TO gen_user;
GRANT ALL ON public.push_subscriptions TO gen_user;
COMMIT;
```

После этого `SELECT count(*) FROM messages` работает (4 строки), ACL стал `{gen_user=arwdDxtm/gen_user}`.

## Затронутые слои

- **БД:** ACL таблиц `messages` и `push_subscriptions` (~1 минута пустого ACL)
- **Push-server:** мог получать `permission denied` при операциях на `push_subscriptions` (наблюдалось `auth/health` = `ok`, прямой проверки логов push-server не было — сделать ARCH-009)
- **Garden-auth:** не затронут (не работает с этими таблицами)
- **PostgREST:** не затронут (закрыт через Caddy, owner-bypass всё равно был ресет)

## Как избежать повторения

### Правило для Timeweb-managed Postgres

**После КАЖДОГО `REVOKE ALL ... FROM PUBLIC` (или `FROM <роли>`) на таблице, владельцем которой является `gen_user`, сразу же делать `GRANT ALL ON ... TO gen_user`** в той же транзакции. Это explicit-восстановление ACL.

Шаблон безопасного REVOKE:
```sql
BEGIN;
REVOKE ALL ON public.<table> FROM PUBLIC;
GRANT ALL ON public.<table> TO gen_user;  -- ВАЖНО: восстановить owner-grant
-- verify
SELECT relname, relacl FROM pg_class WHERE relname='<table>';
COMMIT;
```

### Тест после изменения

После каждого изменения ACL — обязательно выполнять реальный `SELECT count(*) FROM <table>` под `gen_user`, а не полагаться на `has_table_privilege` (которое в Timeweb может возвращать неточные результаты).

### Документация

Эта особенность Timeweb должна быть зафиксирована в:
- `docs/DB_SECURITY_AUDIT.md` (раздел про Timeweb-quirks) — TODO
- `CLAUDE.md` (предупреждение в разделе про работу с БД) — TODO

## Дополнение 2026-05-02 (вечер): Timeweb-панель CREATEROLE-grant обнулил ACL у ВСЕХ таблиц

### Что произошло (Симптом 2)

**Где менялись роли:** Timeweb-панель управления привилегиями БД —
<https://timeweb.cloud/my/database/4135389/admins/358847/privileges>

После того как владелец платформы выдала `gen_user` атрибут `CREATEROLE` через эту страницу, и были выполнены последующие SQL-операции (`CREATE ROLE web_anon`, `CREATE ROLE authenticated`, `GRANT ... TO gen_user`) — обнаружилось:

- `pg_class.relacl` стал **пустым `{}`** или `null` у всех 43 таблиц `public.*` (кроме messages и push_subscriptions, для которых был сделан явный recovery `GRANT ALL TO gen_user` в Шаге 2.3 SEC-001).
- `has_table_privilege('gen_user', '<table>', 'SELECT')` возвращает `false` для 43/45 таблиц.
- Реальный `SELECT count(*)` под `gen_user` падает с `ERROR: permission denied for table <name>`.
- **Garden-auth login сломан**: `POST /auth/login` возвращает `HTTP 500 {"error":"permission denied for table users_auth"}` — пользователи не могут войти с момента применения CREATEROLE.

### Корневая причина 2

Точно неизвестно — гипотезы:
1. **Timeweb-панель при сохранении CREATEROLE** запустила event-trigger, который пересобрал привилегии `gen_user` и стёр имплицитные owner-grants.
2. Возможно, Timeweb пересоздаёт role с новыми атрибутами через `DROP ROLE / CREATE ROLE` (а не `ALTER ROLE`), что в некоторых конфигурациях отрывает имплицитные owner-привилегии.
3. Или — SQL-операция `GRANT web_anon TO gen_user` каким-то образом каскадно сбросила privileges.

Точный момент потери ACL не установлен (нет аудит-лога Timeweb-панели). Известно только:
- ДО Шага 2.2: `SELECT count(*) FROM messages` под `gen_user` работал.
- ПОСЛЕ Шага 2.3 (recovery messages/push_subscriptions): остальные 43 таблицы оказались с пустым ACL.

### Recovery 2

```sql
BEGIN;
GRANT ALL ON ALL TABLES IN SCHEMA public TO gen_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO gen_user;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO gen_user;
COMMIT;
```

После этого 45/45 таблиц снова `has_table_privilege = true`, login работает (возвращает 401 для нонексистент-юзеров вместо 500).

### Затронутые слои 2

- **БД:** ACL всех 43 таблиц `public.*` был пустым неизвестное время (минимум несколько часов между выдачей CREATEROLE и обнаружением)
- **Garden-auth:** все попытки login и register отбивались с HTTP 500 в это время. Влияние на пользователей зависит от того, сколько раз они пытались войти.
- **Push-server:** работает на отдельных таблицах (push_subscriptions, messages, profiles, billing_webhook_logs). После Шага 2.3 две из этих таблиц были recovery'нуты, но profile-чтение и billing — могло отказывать.
- **PostgREST:** закрыт через Caddy, но даже если бы был открыт — owner-bypass не работал бы, и ВСЁ было бы недоступно даже для admin.

### Правила для будущего (расширенные)

**После КАЖДОГО действия в Timeweb-панели с пользовательскими атрибутами** (ALTER ROLE через UI: CREATEROLE, BYPASSRLS, REPLICATION, TEMPORARY) — обязательно сразу проверять ACL и при необходимости восстанавливать:

```sql
-- Проверка после Timeweb-панель действий:
SELECT count(*) FILTER (WHERE has_table_privilege('gen_user', n.nspname || '.' || c.relname, 'SELECT')) AS readable,
       count(*) AS total
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r';
-- Если readable < total: запустить recovery
```

```sql
-- Recovery template (запустить если что-то стёрлось):
BEGIN;
GRANT ALL ON ALL TABLES IN SCHEMA public TO gen_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO gen_user;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO gen_user;
COMMIT;
```

И самое главное:

**Любое изменение в Timeweb-панели для пользователя БД должно сопровождаться:**
1. Проверкой `/auth/login` (POST с заведомо несуществующим email — должен вернуть 401, а не 500)
2. Проверкой ACL через SQL выше
3. Если что-то сломано — немедленно recovery

### Связанные задачи в BACKLOG

- **SEC-001 / Этап 2:** добавить шаг «health-check после каждого Timeweb-панель действия» в чек-лист
- **ARCH-009:** проверить логи push-server и garden-auth за период 2026-05-02 на permission denied
- **MON-002 (новая):** организовать health-check, который зовёт `/auth/login` каждые N минут — поймает такие deadlocks автоматически

## Правильные альтернативы

Изменения через страницу <https://timeweb.cloud/my/database/4135389/admins/358847/privileges>:

- **При выдаче атрибутов ролей** (CREATEROLE, SUPERUSER, BYPASSRLS, REPLICATION и т.п.) **побочно обнуляют ACL на всех таблицах, которыми владеет эта роль**.
- **НЕ показывают предупреждения** об этом эффекте — UI выглядит так, будто меняется только атрибут роли.
- **Recovery:**
  ```sql
  GRANT ALL ON ALL TABLES IN SCHEMA public TO gen_user;
  ```
  (плюс `ALL SEQUENCES` и `ALL FUNCTIONS` — см. шаблон выше).

Поэтому: **не менять атрибуты роли через Timeweb-панель, если есть риск, что эта роль владеет таблицами в работающем приложении** — лучше делать через `ALTER ROLE` напрямую SQL и держать под рукой recovery-команду.

## Связанные задачи в BACKLOG

- **SEC-001 / Этап 2:** должен использовать паттерн REVOKE+GRANT во всех Шагах 2.3, 2.6, 2.7
- **ARCH-009 (новая):** Проверить логи push-server за период 2026-05-02 — был ли `permission denied` на `push_subscriptions`

## История изменений

- **v1 (2026-05-02, утро):** первичная фиксация инцидента — `REVOKE ALL ON tbl FROM PUBLIC` стёр owner-grant у `gen_user` на двух таблицах.
- **v2 (2026-05-02, вечер):** добавлено «Дополнение» — после выдачи `CREATEROLE` через Timeweb-панель ACL обнулился у всех 43 таблиц `public.*`, login падал HTTP 500.
- **v3 (2026-05-02):** добавлена точная ссылка на Timeweb-панель и уточнение про побочные эффекты изменения атрибутов ролей.
