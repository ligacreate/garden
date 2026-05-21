---
title: SEC-001 Этап 5 — Caddy open (execution log)
type: execution-log
phase: "etap-5"
created: 2026-05-03
status: ✅ COMPLETED
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
prev_phase: docs/EXEC_2026-05-02_etap3_postgrest_jwt.md
next_phase: live smoke 15.7 в браузере под Ольгой
---

# Этап 5 — Caddy open

**Время:** 2026-05-02 23:36:50 UTC (≈02:36 MSK 2026-05-03).
**Подключение:** `ssh root@5.129.251.56`.
**Цель:** убрать 503-заглушку для `api.skrebeyko.ru`, вернуть `reverse_proxy 127.0.0.1:3000` (PostgREST). Auth-пути остаются на `127.0.0.1:3001` (garden-auth).
**Простой Caddy reload:** ~47ms (T0 23:36:50.101 → T1 23:36:50.148).

---

## Шаг 5.1 — Read-only разведка

### `/etc/caddy/Caddyfile` ДО изменения

```caddyfile
api.skrebeyko.ru {
  @auth_paths path /auth/* /storage/*
  handle @auth_paths {
    reverse_proxy 127.0.0.1:3001
  }
  handle {
    respond "API temporarily closed for maintenance" 503
  }
}

auth.skrebeyko.ru {
  reverse_proxy 127.0.0.1:3001
}
```

12 строк, 245 байт. Caddy version 2.6.2, service uptime 2 месяца 12 дней.

### Файлы в `/etc/caddy/` (до этапа 5)

```
-rw-r--r-- 1 root root 245 May  2 13:32 Caddyfile
-rw-r--r-- 1 root root 221 May  2 12:44 Caddyfile.backup    ← старый, до 503-заглушки
```

## Шаг 5.2 — Backup

```bash
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.2026-05-02-pre-sec001-open
```

```
-rw-r--r-- 1 root root 245 May  2 13:32 Caddyfile
-rw-r--r-- 1 root root 221 May  2 12:44 Caddyfile.backup
-rw-r--r-- 1 root root 245 May  2 23:35 Caddyfile.bak.2026-05-02-pre-sec001-open  ← новый
```

## Шаг 5.3 — Подготовка `Caddyfile.proposed` + валидация (без применения)

```bash
sed -E 's|respond "API temporarily closed for maintenance" 503|reverse_proxy 127.0.0.1:3000|' \
  /etc/caddy/Caddyfile > /etc/caddy/Caddyfile.proposed
```

### Diff

```diff
7c7
<     respond "API temporarily closed for maintenance" 503
---
>     reverse_proxy 127.0.0.1:3000
```

### `caddy validate` на proposed

```
{"level":"info","msg":"using provided configuration","config_file":"/etc/caddy/Caddyfile.proposed"}
{"level":"warn","msg":"Caddyfile input is not formatted; run the 'caddy fmt'..."}  ← информационный, не блокер
{"level":"info","msg":"server is listening only on the HTTPS port..."}
{"level":"info","msg":"enabling automatic HTTP->HTTPS redirects"}
Valid configuration
```

✅ Конфиг валиден. `caddy validate` на текущем выдаёт ту же warning — она не из-за нашего изменения, существовала и до.

## Шаг 5.4 — Apply + reload + verify

### 5.4.1 — Apply + reload

```bash
cp /etc/caddy/Caddyfile.proposed /etc/caddy/Caddyfile
systemctl reload caddy
```

| Метка | Время (UTC) |
|---|---|
| T0 (pre-reload)  | 2026-05-02T23:36:50.101Z |
| T1 (post-reload) | 2026-05-02T23:36:50.148Z |

**Простой ~47 мс.**

### Логи Caddy при reload

```
May 02 23:36:50  systemd: Reloading caddy.service - Caddy...
May 02 23:36:50  caddy:  using provided configuration  /etc/caddy/Caddyfile
May 02 23:36:50  caddy:  load complete
May 02 23:36:50  caddy:  enabling HTTP/3 listener  :443
May 02 23:36:50  caddy:  server running  protocols=[h1,h2,h3]
May 02 23:36:50  caddy:  enabling automatic TLS certificate management  domains=[auth.skrebeyko.ru, api.skrebeyko.ru]
May 02 23:36:50  systemd: Reloaded caddy.service - Caddy.
```

✅ Без ошибок. PID не сменился (16847 — тот же процесс с 18 февраля).

```bash
$ diff /etc/caddy/Caddyfile /etc/caddy/Caddyfile.proposed
(пусто)
```

✅ Активный конфиг = proposed.

### 5.4.2 — ANON request (ожидаем 401, не 503)

```bash
$ curl -sI https://api.skrebeyko.ru/profiles
HTTP/2 401
alt-svc: h3=":443"; ma=2592000
content-type: application/json; charset=utf-8
proxy-status: PostgREST; error=42501
server: Caddy
server: postgrest/14.5
www-authenticate: Bearer

$ curl -s https://api.skrebeyko.ru/profiles
{"code":"42501","details":null,"hint":null,"message":"permission denied for table profiles"}
```

✅ **HTTP 401** (не 503). `proxy-status: PostgREST; error=42501` — Caddy успешно проксирует на PostgREST, который под `web_anon` отдаёт `permission denied`. `www-authenticate: Bearer` — стандартный hint от PostgREST.

### 5.4.3 — Login через `auth.skrebeyko.ru` (Caddy → garden-auth)

```bash
$ TOKEN=$(curl -s -X POST https://auth.skrebeyko.ru/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"olga@skrebeyko.com","password":"<тестовый пароль Ольги — не в git>"}' \
  | jq -r '.token')
$ echo "len=${#TOKEN}"
len=257
```

### Декодированный payload

```json
{
  "role": "authenticated",
  "sub": "85dbefda-ba8f-4c60-9f22-b3a7acd45b21",
  "email": "olga@skrebeyko.com",
  "ttl_days": 30
}
```

✅ Garden-auth через Caddy → выдаёт правильный JWT с role-claim.

### 5.4.4 — Authenticated row counts

```bash
$ curl -s -H "Authorization: Bearer $TOKEN" https://api.skrebeyko.ru/profiles | jq 'length'
59

$ curl -s -H "Authorization: Bearer $TOKEN" https://api.skrebeyko.ru/pvl_students | jq 'length'
23

$ curl -s -H "Authorization: Bearer $TOKEN" https://api.skrebeyko.ru/pvl_audit_log | jq 'length'
2204

$ curl -s -H "Authorization: Bearer $TOKEN" https://api.skrebeyko.ru/knowledge_base | jq 'length'
18

$ curl -s -H "Authorization: Bearer $TOKEN" https://api.skrebeyko.ru/pvl_garden_mentor_links | jq 'length'
19
```

✅ **Все 5 endpoint'ов отдают полный набор строк** — Ольга-админ через `is_admin()` видит всё.

### 5.4.5 — Lockdown checks

```bash
$ curl -i -H "Authorization: Bearer $TOKEN" https://api.skrebeyko.ru/users_auth
HTTP 403
{"code":"42501","message":"permission denied for table users_auth"}

$ curl -i -H "Authorization: Bearer $TOKEN" https://api.skrebeyko.ru/messages
HTTP 403
{"code":"42501","message":"permission denied for table messages"}
```

✅ Lockdown-таблицы (REVOKE для authenticated) корректно блокируются даже под admin.

---

## Сводка этапа 5

| # | Test | HTTP | Result | ✅ |
|---|---|---|---|---|
| 5.4.1 | `systemctl reload caddy` | — | exit 0, no errors in journal | ✅ |
| 5.4.2 | `/profiles` anon | 401 | `permission denied for table profiles` (НЕ 503) | ✅ |
| 5.4.3 | `auth.skrebeyko.ru/auth/login` | 200 | token len=257, role=authenticated, sub=Olga UUID, TTL=30d | ✅ |
| 5.4.4a | `/profiles` + token | 200 | 59 rows | ✅ |
| 5.4.4b | `/pvl_students` + token | 200 | 23 rows | ✅ |
| 5.4.4c | `/pvl_audit_log` + token | 200 | 2204 rows | ✅ |
| 5.4.4d | `/knowledge_base` + token | 200 | 18 rows | ✅ |
| 5.4.4e | `/pvl_garden_mentor_links` + token | 200 | 19 rows | ✅ |
| 5.4.5a | `/users_auth` + token | 403 | `permission denied` (lockdown) | ✅ |
| 5.4.5b | `/messages` + token | 403 | `permission denied` (lockdown) | ✅ |

**Все 10 проверок прошли.** `api.skrebeyko.ru` живой, PostgREST доступен через Caddy с JWT-валидацией.

---

## Заключительный архитектурный итог SEC-001

| Слой | До SEC-001 | После SEC-001 |
|---|---|---|
| **БД RLS** | RLS=off на 28 таблицах, 50 hardcoded-Olga политик | RLS=on на 28, +90 политик, helper `is_mentor_for(uuid)` |
| **Lockdown** | `users_auth/to_archive/events_archive/messages/push_subscriptions` доступны | REVOKE для `web_anon`/`authenticated` |
| **Grants** | (через `gen_user` owner) | matrix `web_anon`(нет SELECT)/`authenticated`(SELECT по политикам), I/U/D точечно |
| **PostgREST anon role** | `gen_user` (owner-bypass — видел всё) | `web_anon` (закрыто на уровне GRANT) |
| **JWT validation** | Не работала: garden-auth не клал `role` в payload | `role: 'authenticated'` явно в payload, PostgREST переключает SET ROLE |
| **Frontend** | latch postgrestJwtDisabledAfterPgrst300 → silent fallback в анонимку | hard-error `POSTGREST_JWT_MISCONFIG`, 401-handler с logout, maintenance-banner |
| **Caddy** | 503 на api.skrebeyko.ru | reverse_proxy на 127.0.0.1:3000 |

---

## Что осталось

- [ ] **Live smoke 15.7** в браузере под Ольгой (admin):
  - [ ] открыть liga.skrebeyko.ru → должен задеплоиться новый bundle (`index-DXUDWmBe.js`)
  - [ ] логин → `Authorization: Bearer …` в DevTools Network на запросах к api.skrebeyko.ru
  - [ ] карта ведущих (профайлы) — список не пуст (≥59)
  - [ ] учительская — назначения видны
  - [ ] PVL: открыть курс, открыть урок, отметить чек-лист
  - [ ] PVL: проверить ДЗ как ментор, изменить статус
- [ ] **REVOKE CREATE ON SCHEMA public FROM gen_user** через Timeweb-консоль под `postgres` (шаг владельца — не агент).
- [ ] **SEC-002** — Ольга меняет пароль (использовали `<test-pwd>` в этапах 2A, 2C, 5.4 в curl-командах).
- [ ] **SEC-005-extension (опционально):** ротация JWT_SECRET в `/opt/garden-auth/.env` + контейнере PostgREST + повторный rolling restart обоих.
- [ ] **PERF-001 (опционально):** ANALYZE из Timeweb-консоли под `postgres`.
- [ ] **CLEAN-009/010/011, ARCH-010/011, REFACTOR-001** — из backlog.
- [ ] **24-48ч стабильной работы** → удалить `/tmp/pgrst_env.txt` на сервере.

---

## Backout (если что-то всплывёт после live smoke)

```bash
# 1 шаг, ~2 секунды:
cp /etc/caddy/Caddyfile.bak.2026-05-02-pre-sec001-open /etc/caddy/Caddyfile
systemctl reload caddy
# api.skrebeyko.ru снова отдаст 503
```

Это закрывает только Caddy-слой; PostgREST/garden-auth/БД остаются в новом состоянии. Если нужно полностью откатывать — см. backout-план в `docs/MIGRATION_2026-05-02_security_restoration.md`.

---

## Статус

✅ **ЭТАП 5 SEC-001 ЗАКРЫТ.**

Все 5 этапов SEC-001 выполнены:
1. ✅ SQL-миграция (фазы 1-14.5, 28 таблиц RLS, 90 политик, lockdown)
2. ✅ Smoke-тесты read-only
3. ✅ PostgREST на JWT validation + garden-auth выдаёт role-claim
4. ✅ Frontend-патч задеплоен (commits 75ffb10..034008f, CI run 25264412642)
5. ✅ Caddy открыт, api.skrebeyko.ru живой, end-to-end через HTTPS работает

Следующий шаг — live smoke 15.7 в браузере под Ольгой.
