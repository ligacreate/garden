---
от: стратег (claude.ai)
кому: VS Code Claude Code (executor)
дата: 2026-05-11
тема: Deploy push-server на 5.129.251.56 + Caddy push.skrebeyko.ru
ответ на: пока ничего (новая задача, делаешь после _04 race-fix)
---

# Deploy push-server — endpoint `/api/v1/upcoming.json`

Код готов в репо (`push-server/`), тесты проходили, план в
`plans/2026-05-04-public-upcoming-api.md`. На проде ничего нет.
Ольга подтвердила: **вариант A — `push.skrebeyko.ru`** через DNS.

**Когда:** после того как ты закроешь race-fix `_04` (push того
коммита от меня уже будет получен), и Ольгин smoke Phase 2A на
проде через Claude in Chrome пройдёт. Тогда — этот заход.

**Контекст безопасности:** Push-server поддерживает 3 фичи:
1. web-push notifications (требует `WEB_PUSH_PUBLIC_KEY/PRIVATE_KEY`),
2. Prodamus webhook (требует `PRODAMUS_SECRET_KEY`, флаг
   `PRODAMUS_WEBHOOK_ENABLED`),
3. **upcoming.json (нам нужна только эта).**

Все три при пустых env-переменных **опционально выключаются**
(см. `server.mjs:31-35`). Деплоим **только третью** — остальные
env-переменные **НЕ задаём**. Минимум attack surface. Prodamus
включим в FEAT-015 отдельно.

---

## 1. Шаги на сервере

### 1.1 Развернуть код

```bash
# с локальной машины (executor)
rsync -avz --exclude='node_modules' --exclude='*.test.mjs' \
  /Users/user/vibecoding/garden_claude/garden/push-server/ \
  root@5.129.251.56:/opt/push-server/

# на сервере
ssh root@5.129.251.56 "cd /opt/push-server && npm install --omit=dev"
```

Тесты (`*.test.mjs`) на проде не нужны — `--exclude` исключает.
`--omit=dev` пропускает devDependencies (у нас их и нет, но
страховка).

### 1.2 Собрать `.env`

`/opt/garden-auth/.env` содержит отдельные `DB_HOST`, `DB_USER`,
`DB_PASS`, `DB_NAME`. Push-server хочет `DATABASE_URL` (connection
string). Собираем:

```bash
ssh root@5.129.251.56 "
  set -a && . /opt/garden-auth/.env && set +a
  ENCODED_PASS=\$(python3 -c \"import urllib.parse; print(urllib.parse.quote('\$DB_PASS', safe=''))\")
  cat > /opt/push-server/.env <<EOF
DATABASE_URL=postgresql://\$DB_USER:\$ENCODED_PASS@\$DB_HOST:5432/\$DB_NAME
PORT=8787
CORS_ORIGIN=*
EOF
  chmod 600 /opt/push-server/.env
  chown root:root /opt/push-server/.env
"
```

**Важно про password encoding:** если `DB_PASS` содержит спецсимволы
(`@`, `:`, `/`, `?`, `#`, `%`, `&`), они должны быть URL-encoded в
connection string. Python один лайнером выше делает urlencode.

После создания **проверь руками** что connection string правильный:
```bash
ssh root@5.129.251.56 "cat /opt/push-server/.env"
```

Не залить в логи случайно при дебаге (содержит пароль).

⚠ **Что НЕ задаём** (оставляем пустыми/неустановленными):
- `WEB_PUSH_PUBLIC_KEY` / `WEB_PUSH_PRIVATE_KEY` / `WEB_PUSH_SUBJECT`
  → push-notifications выключены.
- `ADMIN_PUSH_TOKEN` → admin endpoints выключены (см. server.mjs:50
  — без токена `requireAdminToken` пропустит, но связанные роуты
  завязаны на push, который выключен).
- `PRODAMUS_*` → webhook выключен (`PRODAMUS_WEBHOOK_ENABLED`
  default `'true'`, но без secret верификация уйдёт в reject).
  Чтобы наверняка — добавь явно `PRODAMUS_WEBHOOK_ENABLED=false`
  в `.env`.
- `AUTH_URL` / `AUTH_SERVICE_SECRET` → cross-service вызовы
  выключены.

Финальный `.env`:

```
DATABASE_URL=postgresql://<user>:<encoded_pass>@<host>:5432/<dbname>
PORT=8787
CORS_ORIGIN=*
PRODAMUS_WEBHOOK_ENABLED=false
```

### 1.3 systemd unit

Создай `/etc/systemd/system/push-server.service`:

```ini
[Unit]
Description=Garden Push Server (upcoming.json + future push/billing)
After=network.target
Wants=network.target

[Service]
Type=simple
WorkingDirectory=/opt/push-server
EnvironmentFile=/opt/push-server/.env
ExecStart=/usr/bin/node /opt/push-server/server.mjs
Restart=on-failure
RestartSec=5
User=root
StandardOutput=journal
StandardError=journal
SyslogIdentifier=push-server

[Install]
WantedBy=multi-user.target
```

Запуск:

```bash
ssh root@5.129.251.56 "
  systemctl daemon-reload
  systemctl enable push-server
  systemctl start push-server
  sleep 2
  systemctl status push-server --no-pager | head -15
  journalctl -u push-server -n 20 --no-pager
"
```

В логах должно быть `Server started on :8787 (push=off, prodamus=off)`.
Если в логах stack-trace или connection error к БД — **stop** и
дебажь до Caddy reload.

### 1.4 Local smoke

```bash
ssh root@5.129.251.56 "
  curl -sS -w '\nHTTP %{http_code} size %{size_download}b\n' \
    'http://localhost:8787/api/v1/upcoming.json?days=8' | head -50
"
```

Ожидание: HTTP 200, JSON-массив events. Каждый объект имеет поля
`id`, `starts_at`, `title`, `format`, `city`, `price_rub`,
`is_recurring`, `host.{name,role,photo_url}` (см. контракт в
plan'е).

Если 500 или пусто — копай в `journalctl -u push-server -f`.

---

## 2. Шаги для Caddy

### 2.1 Backup

```bash
ssh root@5.129.251.56 "cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.2026-05-11-pre-push-server"
```

### 2.2 Добавить блок

В `/etc/caddy/Caddyfile` добавь **после** существующих блоков
`api.skrebeyko.ru` / `auth.skrebeyko.ru`:

```
push.skrebeyko.ru {
    reverse_proxy localhost:8787
}
```

Так как в push-server CORS уже сделан в Express (через `cors`
middleware), **дополнительные CORS-хедеры в Caddy не нужны** —
не дублируй, иначе будут два `Access-Control-Allow-Origin` хедера
и браузеры заорут.

### 2.3 Validate + reload

```bash
ssh root@5.129.251.56 "
  caddy validate --config /etc/caddy/Caddyfile
  systemctl reload caddy
  sleep 2
  systemctl status caddy --no-pager | head -10
  journalctl -u caddy -n 30 --no-pager | tail -20
"
```

В `caddy validate` должно быть `Valid configuration`. После reload
— никаких stack-trace в журнале.

Сертификат **пока не получен** (DNS ещё не указывает на сервер).
Caddy при `reload` просто запишет новый vhost, certificate-issuance
произойдёт **при первом запросе** на `push.skrebeyko.ru`.

### 2.4 Сигнал стратегу

После того как:
- ✅ push-server слушает на :8787
- ✅ local curl работает
- ✅ Caddy validate ОК, reload без ошибок

— **отчитайся коротко в чате** (без отдельного `_06`), что-то
вроде:

```
Push-server задеплоен на /opt/push-server/, systemd enabled, 
порт 8787 живой (local curl зелёный, отдаёт N events). 
Caddyfile добавлен блок push.skrebeyko.ru, reload OK. 
Ждём DNS от Ольги.
```

Стратег увидит → попросит Ольгу завести DNS.

---

## 3. Что после DNS

Когда Ольга заведёт `push.skrebeyko.ru → 5.129.251.56` и
propagation пройдёт (5-30 минут):

### 3.1 Проверь propagation

```bash
dig +short push.skrebeyko.ru
# должно вернуть 5.129.251.56
```

### 3.2 Первый запрос (triggers Let's Encrypt)

```bash
curl -sS -w '\nHTTP %{http_code} time %{time_total}s\n' \
  'https://push.skrebeyko.ru/api/v1/upcoming.json?days=8' | head -50
```

**Первый запрос может быть медленным** (~5-15 сек) — Caddy
выдаёт ACME challenge, получает cert. Последующие — быстрые.

Если первый запрос даёт `SSL_ERROR` или `Unable to verify` —
проверь:
- `journalctl -u caddy -f` в момент запроса — видны ли ACME-логи.
- DNS-propagation полная: `dig +short @8.8.8.8 push.skrebeyko.ru`,
  `dig +short @1.1.1.1 push.skrebeyko.ru` — оба должны вернуть
  IP. Если только один — propagation не докатилось, подожди.

### 3.3 Полный smoke

После того как HTTPS поднялся:

```bash
# default days=8
curl -sS 'https://push.skrebeyko.ru/api/v1/upcoming.json' | python3 -m json.tool | head -40

# explicit from
curl -sS 'https://push.skrebeyko.ru/api/v1/upcoming.json?days=14&from=2026-05-13' | python3 -m json.tool | head -40

# CORS preflight check
curl -i -X OPTIONS 'https://push.skrebeyko.ru/api/v1/upcoming.json' \
  -H 'Origin: https://example.com' \
  -H 'Access-Control-Request-Method: GET' 2>&1 | head -20
```

Ожидание:
- 200 + JSON массив с events.
- Корректный `Access-Control-Allow-Origin: *` на OPTIONS.
- Сертификат от Let's Encrypt (Subject: push.skrebeyko.ru).

### 3.4 Финальный отчёт `_06_codeexec_push_server_deployed.md`

В отчёте:
- Где live (URL).
- Размер ответа на `?days=8`.
- Cert details (issuer + expiry).
- Что НЕ настроено (push notifications, Prodamus — для будущего FEAT-015).
- Команды для управления:
  - `systemctl restart push-server`
  - `journalctl -u push-server -f`
  - `/opt/push-server/.env` — DB connection.

---

## 4. Что **не** делаешь

- НЕ настраиваешь `WEB_PUSH_*` ключи (отдельная задача).
- НЕ настраиваешь `PRODAMUS_*` (отдельная задача FEAT-015).
- НЕ настраиваешь admin token (нет endpoints на которые он
  нужен сейчас).
- НЕ синкаешь локальный `/Users/user/vibecoding/garden_claude/garden/push-server/`
  с прод-файлами в обратную сторону (репо = source of truth, на
  прод деплоим rsync'ом из репо).

## 5. Что в backlog заводишь

- **TECH-DEBT-PUSH-SERVER-REPO-SYNC** (P3) — аналогично
  TECH-DEBT-AUTH-REPO-SYNC, отметить что push-server'а под git
  на проде нет, изменения деплоим rsync'ом. В перспективе —
  поднять git-hooks или CI deploy.

---

## 6. Workflow

1. **После _04 race-fix push'а Ольгой** — стартуй.
2. Apply разделы 1.1-1.4 (push-server systemd + local smoke).
3. Apply раздел 2.1-2.3 (Caddyfile).
4. Сигнал в чате (раздел 2.4).
5. **Ольга заводит DNS.**
6. Через 5-30 минут — раздел 3 (HTTPS smoke).
7. Отчёт `_06`.

В этом заходе **никаких git-коммитов** (мы трогаем `/opt/`
и `/etc/`, не репо). Только на проде. На локали ничего не
менялось.

Жду от тебя короткий чат-сигнал после раздела 2.4.
