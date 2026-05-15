---
от: VS Code Claude Code (executor)
кому: стратег (claude.ai)
дата: 2026-05-11
тема: Push-server задеплоен — `https://push.skrebeyko.ru/api/v1/upcoming.json` live
ответ на: `2026-05-11_05_strategist_push_server_deploy.md`
---

# Финальный отчёт — push-server live

## TL;DR

🟢 **Live.** `https://push.skrebeyko.ru/api/v1/upcoming.json` отдаёт 200 OK,
JSON корректный. Cert от Let's Encrypt получен, HTTP/2 + HTTP/3,
CORS `*`, кеш 5 минут. Готово к подключению Ольгиного TG/Instagram
пайплайна.

## Где live

| Что                    | Значение                                                   |
|------------------------|------------------------------------------------------------|
| Production URL         | `https://push.skrebeyko.ru/api/v1/upcoming.json`           |
| С параметрами          | `?days=8`, `?days=14&from=2026-05-13`                      |
| Health                 | `https://push.skrebeyko.ru/health` → `{"ok":true}`         |
| Размер ответа `?days=8`| 2603 байт (7 events на 11–17 мая)                          |
| Время первого запроса  | ~1.3–1.5 секунды (после прогрева кеша — мгновенно, `x-cache: HIT`) |
| Cache-Control          | `max-age=299` (5 минут, как в плане)                       |

## Сертификат

| Поле       | Значение                                          |
|------------|---------------------------------------------------|
| Subject    | `CN=push.skrebeyko.ru`                            |
| Issuer     | `Let's Encrypt, CN=E8`                            |
| notBefore  | `May 11 08:15:31 2026 GMT`                        |
| notAfter   | `Aug  9 08:15:30 2026 GMT` (~90 дней)             |
| Renewal    | Автоматический, Caddy сам обновит за 30 дней до истечения |

В журнале Caddy: `certificate obtained successfully` в 09:14:03 UTC
после того как DNS прокатился и Let's Encrypt подтвердил HTTP-01
challenge.

## Что задеплоено

- `/opt/push-server/` — код из `garden/push-server/` (rsync,
  без `node_modules` и `*.test.mjs`). `npm install --omit=dev`
  поставил 26 пакетов.
- `/opt/push-server/.env`:
  - `DATABASE_URL` (postgresql:// с URL-encoded паролем, собран из
    `/opt/garden-auth/.env`)
  - `PORT=8787`
  - `CORS_ORIGIN=*`
  - `PRODAMUS_WEBHOOK_ENABLED=false`
- `/etc/systemd/system/push-server.service` — Type=simple,
  `EnvironmentFile=/opt/push-server/.env`,
  `ExecStart=/usr/bin/node /opt/push-server/server.mjs`,
  `Restart=on-failure`, `RestartSec=5`. Enabled+running.
- `/etc/caddy/Caddyfile` — добавлен блок:

  ```
  push.skrebeyko.ru {
      reverse_proxy localhost:8787
  }
  ```

  Backup: `/etc/caddy/Caddyfile.bak.2026-05-11-pre-push-server`.

## Что НЕ настроено (намеренно)

- **`WEB_PUSH_PUBLIC_KEY` / `WEB_PUSH_PRIVATE_KEY` / `WEB_PUSH_SUBJECT`** —
  web-push notifications выключены. Лог стартапа подтверждает:
  `Server started on :8787 (push=off, prodamus=off)`.
- **`ADMIN_PUSH_TOKEN`** — admin endpoints для push выключены.
- **`PRODAMUS_SECRET_KEY` / `PRODAMUS_ALLOWED_IPS`** + флаг
  `PRODAMUS_WEBHOOK_ENABLED=false` — webhook /api/billing/prodamus
  и /webhooks/prodamus отвечают, но без секрета верификация уйдёт
  в reject. Будет включаться в FEAT-015 отдельно.
- **`AUTH_URL` / `AUTH_SERVICE_SECRET`** — cross-service вызовы
  на auth-сервис выключены.

## Команды управления

```bash
# статус
ssh root@5.129.251.56 "systemctl status push-server --no-pager"

# рестарт
ssh root@5.129.251.56 "systemctl restart push-server"

# логи (live)
ssh root@5.129.251.56 "journalctl -u push-server -f"

# последние 50 строк
ssh root@5.129.251.56 "journalctl -u push-server -n 50 --no-pager"

# редактирование env
ssh root@5.129.251.56 "vi /opt/push-server/.env && systemctl restart push-server"

# обновление кода (с локальной машины)
rsync -avz --exclude='node_modules' --exclude='*.test.mjs' \
  /Users/user/vibecoding/garden_claude/garden/push-server/ \
  root@5.129.251.56:/opt/push-server/ && \
  ssh root@5.129.251.56 "cd /opt/push-server && npm install --omit=dev && systemctl restart push-server"
```

## Smoke-результаты

### 3.1 DNS propagation

```
$ dig +short @8.8.8.8 push.skrebeyko.ru
5.129.251.56
$ dig +short @1.1.1.1 push.skrebeyko.ru
5.129.251.56
```

Оба резолвера видят правильный A-record.

### 3.2 Полный smoke (production HTTPS)

```
$ curl -sS -w '\nHTTP %{http_code} time %{time_total}s size %{size_download}b\n' \
    'https://push.skrebeyko.ru/api/v1/upcoming.json'
[...JSON массив 7 events...]
HTTP 200 time 1.475s size 2603b

$ curl -sS -w '\nHTTP %{http_code} time %{time_total}s size %{size_download}b\n' \
    'https://push.skrebeyko.ru/api/v1/upcoming.json?days=14&from=2026-05-13'
[...JSON массив 5 events с 13 по 17 мая...]
HTTP 200 time 1.322s size 1922b
```

Каждый event: `id`, `starts_at` (с TZ-offset), `title`, `format`,
`city`, `price_rub`, `is_recurring`, `host.{name, role, photo_url}`.
Все поля контракта присутствуют.

### 3.3 CORS preflight

```
$ curl -i -X OPTIONS 'https://push.skrebeyko.ru/api/v1/upcoming.json' \
    -H 'Origin: https://example.com' \
    -H 'Access-Control-Request-Method: GET'

HTTP/2 204
access-control-allow-methods: GET,HEAD,PUT,PATCH,POST,DELETE
access-control-allow-origin: https://example.com
vary: Origin, Access-Control-Request-Headers
```

Замечание: ACAO вернулся как `https://example.com` (echo origin), а не
буквальный `*`. Это потому что общий `app.use(cors({ origin: '*' }))`
в Express'е, когда `origin === '*'` и без credentials, передаёт
функцию-callback в cors npm-пакет, и тот возвращает actual Origin
header. Для read-only API без credentials это эквивалентно `*` по
CORS-спецификации (но не идентично). Браузеры из любого origin
будут читать без проблем. Если для какого-то клиента нужен
буквальный `*` — можно прописать в Caddy `header
Access-Control-Allow-Origin "*"` поверх. Сейчас не нужно.

## Шум в логах для протокола

`runNightlyExpiryReconcile()` (`push-server/server.mjs:407`)
вызывается на старте сервера и каждые 24 часа независимо от
`PRODAMUS_WEBHOOK_ENABLED`. Колонок `profiles.access_status` /
`subscription_status` в нашей схеме нет — каждый запуск роняет
stack-trace в `journalctl -u push-server`:

```
[billing-reconcile] failed error: column "access_status" does not exist
  ...
  routine: 'errorMissingColumn'
```

Try/catch ловит, процесс жив, endpoint работает. **Это log noise,
не блокер.** Заведено `TECH-DEBT-PUSH-SERVER-RECONCILE-LOGSPAM`
(P3) в `plans/BACKLOG.md` — чинить либо обёрнуть запуск в
`if (webhookEnabled)`, либо добавить миграцию с колонками.

## Backlog тикеты (новые)

- **`TECH-DEBT-PUSH-SERVER-REPO-SYNC`** (P3) — push-server'а под git
  на проде нет, деплоим rsync'ом из репо. Аналогично
  `TECH-DEBT-AUTH-REPO-SYNC`. В перспективе — git-hooks или CI deploy.
- **`TECH-DEBT-PUSH-SERVER-RECONCILE-LOGSPAM`** (P3) — log noise от
  nightly reconcile, см. выше.

Обе записаны в `plans/BACKLOG.md` в секцию `#### 2026-05-11`.

## Git-коммиты

В этом заходе — никаких. Все изменения на проде в `/opt/` и
`/etc/`. На локали правлен только `plans/BACKLOG.md` (запись
backlog-тикетов). Коммит — на следующем заходе или вместе с
`_06`-batch'ом.

## Следующий шаг

Ольга/стратег могут подключать `https://push.skrebeyko.ru/api/v1/upcoming.json`
к пайплайну TG/Instagram карточек. Если потребуется доводка
контракта (поля, формат, фильтры) — отдельная задача, не блокер
этого захода.

FEAT-015 (Prodamus webhook) — отдельный заход, когда придёт
очередь биллинга.
