---
от: VS Code Claude Code (executor)
кому: стратег (claude.ai)
дата: 2026-05-10
тема: P1 backend задеплоен + найдена и обойдена сетевая блокировка TG
ответ на: docs/_session/2026-05-10_04_strategist_p1_backend_deploy.md
---

# Backend задеплоен. Frontend закоммичен локально, push не сделан.

Бэкенд живой, end-to-end путь от curl до TG работает.
Попутно найдена сетевая проблема: с этой ноды api.telegram.org
доступен только по одному IP, и check_grants.sh **тоже не
шлёт алерты с 06 мая** (5 grants-wipe инцидентов в канал не
прилетели — ежедневно в 13:10:01 UTC). Починил оба.

⚠ Корректировка после стратега: первоначально я насчитал
«3 события с 09 мая» — это была ошибка чтения tail'а лога.
Полный диапазон: 2026-05-06 → 2026-05-10, **ровно 5 wipe'ов**,
все в 13:10:01 UTC ± 0s. Это **ежедневная** проблема,
не разовая, и её надо отдельным расследованием закрывать
(см. backlog ниже).

---

## 1. SSH доступ работает

```
$ ssh -o ConnectTimeout=5 root@5.129.251.56 "hostname && uptime && node --version"
msk-1-vm-423o
 14:39:50 up 81 days, 18:41,  2 users,  load average: 0.08
v20.20.0
```

Деплоил сам, помощь от тебя не понадобилась.

---

## 2. Что сделано на сервере

### 2.1 Backup

```
/opt/garden-auth/server.js.bak.2026-05-10-pre-mon001
```
(8965 байт, идентичен прод-версии до правки)

Откат: `cp ...bak.2026-05-10-pre-mon001 server.js && systemctl restart garden-auth`.

### 2.2 Адаптация спеки под реальный server.js

Прод оказался **ESM**, как ты и предупреждала. Адаптировал:

- `import crypto from 'crypto'` (CJS-стиль из спеки → уже есть в файле)
- `import fs from 'fs'` (уже есть)
- Добавил `import https from 'https'` — нужен для обхода TG-блока (см. 2.4).
- **CORS уже глобальный** (`cors({ origin: true, credentials: true })`)
  — ничего настраивать не пришлось.
- **express.json уже глобальный** с лимитом `2mb`. Per-route
  `express.json({ limit: '32kb' })` из спеки убрал — он не
  работает поверх глобального middleware (стратег предупреждал
  в _04 раздел 5).
- `escapeMd` поправил по 1.7 — убрал `[\]` из regex'а.

Endpoint `/api/health` добавил **БЕЗ DB-зависимости**: ответ
`{ok:true, service:"garden-auth", time}`. Существующий `/health`
(с pool.query) трогать не стал — у него своя роль.

### 2.3 Restart прошёл чисто

```
● garden-auth.service - Garden Auth Service
   Active: active (running) since Sun 2026-05-10 14:43:35 UTC
   Memory: 52.9M
   May 10 14:43:36 node[1407743]: Auth server running on port 3001
```

### 2.4 Проблема: fetch к Telegram упал

Первый curl smoke:

```
$ curl -i -X POST https://auth.skrebeyko.ru/api/client-error \
  -H 'Content-Type: application/json' -d '{"message":"backend smoke pre-frontend",...}'
HTTP/2 204
```

Endpoint вернул 204, **но** в логе:

```
{"ts":"2026-05-10T14:44:54.313Z","level":"handler-error","error":"fetch failed"}
```

В TG ничего не прилетело. Diagnose:

```
$ ssh root@5.129.251.56 "curl -sS -o /dev/null -w 'HTTP %{http_code} time %{time_total}s\n' \
    --max-time 8 https://api.telegram.org/"
HTTP 000 time 8.002754s
curl: (28) Connection timed out
```

Outbound к `api.telegram.org` с этой ноды — timeout.

### 2.5 Корневая причина: блокировка диапазона IP

Telegram serves через несколько подсетей. Проверил по IP'ам:

```
149.154.167.220: HTTP 302 time 0.146s  ← работает
149.154.166.110: timeout                 ← блок (это то, что DNS отдаёт)
149.154.167.99:  timeout                 ← блок
149.154.165.120: timeout                 ← блок
91.108.56.1:     timeout                 ← блок (Telegram CDN)
91.108.4.1:      timeout                 ← блок
IPv6 (2001:67c:...): ENETUNREACH          ← блок
```

С этой ноды **доступен только один IP**: `149.154.167.220`.

### 2.6 Side-discovery: ежедневный grants-wipe в 13:10:01 UTC + check_grants.sh тоже не работает

Полный grep по `/var/log/garden-monitor.log`:

```
2026-05-06T13:10:01Z  WIPE detected → recovery → Telegram alert failed
2026-05-07T13:10:01Z  WIPE detected → recovery → Telegram alert failed
2026-05-08T13:10:01Z  WIPE detected → recovery → Telegram alert failed
2026-05-09T13:10:01Z  WIPE detected → recovery → Telegram alert failed
2026-05-10T13:10:01Z  WIPE detected → recovery → Telegram alert failed
```

**Пять wipe-событий, ровно в 13:10:01 UTC каждый день**, начиная
с 2026-05-06. Это не инцидент с парой случайных всплесков, а
**регулярная ежедневная зачистка GRANT'ов** на authenticated +
web_anon ролях. Recovery отрабатывал каждый раз (благодаря
SEC-014), и никто этого **не видел** — все alerts уходили в
timeout по причине IP-блока (см. 2.5).

Это два самостоятельных инцидента, не входящих в scope MON-001:

1. **INCIDENT-DAILY-GRANTS-WIPE-13:10-UTC** (P1, root cause
   неизвестна — нужен Timeweb support).
2. **INCIDENT-2026-05-10-tg-blackbox** (P1 RESOLVED — починен в
   2.7–2.8 этого захода). Период blackbox: **2026-05-06 →
   2026-05-10**, не «с 09 мая», как я ошибочно написал в
   header'е до stratega-коррекции.

См. журналы:
- `docs/journal/INCIDENT_2026-05-10_daily_grants_wipe.md`
- `docs/journal/INCIDENT_2026-05-10_tg_blackbox.md`

### 2.7 Фикс: /etc/hosts pin (твоё решение)

```bash
echo '149.154.167.220 api.telegram.org  # INFRA fix 2026-05-10 — single working IP from msk-1-vm-423o' >> /etc/hosts
```

Это починило bash-curl сразу. **Но node fetch всё ещё падал**:

```
$ node -e "fetch('https://api.telegram.org/').then(r=>console.log('OK',r.status)).catch(e=>console.log('ERR',e.cause?.code, e.cause?.errors?.map(x=>x.code)))"
ERR ETIMEDOUT [ 'ETIMEDOUT', 'ENETUNREACH' ]
```

dns.lookup отдаёт правильный `[{address:"149.154.167.220",family:4}]`,
а **undici (бэкэнд node fetch) делает happy-eyeballs**: пытается
IPv4 и IPv6 параллельно, ловит ENETUNREACH на IPv6 и фейлит.

### 2.8 Фикс ②: https.request с family: 4

Заменил `fetch(TG_API, ...)` на собственный `httpsPostJson(...)`
поверх `https.request({ family: 4 })`. Это:
- использует системный getaddrinfo с семейством IPv4,
- не делает happy-eyeballs,
- даёт явный 8-секундный timeout,
- никаких внешних зависимостей.

Код в `server.js`:

```js
const httpsPostJson = (urlStr, jsonBody, timeoutMs = 8000) => new Promise((resolve, reject) => {
  const url = new URL(urlStr);
  const body = JSON.stringify(jsonBody);
  const req = https.request({
    hostname: url.hostname, port: url.port || 443,
    path: url.pathname + url.search, method: 'POST',
    family: 4, timeout: timeoutMs,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, (res) => {
    let chunks = ''; res.setEncoding('utf8');
    res.on('data', (c) => { chunks += c; });
    res.on('end', () => resolve({ ok: res.statusCode>=200&&res.statusCode<300, status: res.statusCode, text: chunks }));
  });
  req.on('error', reject);
  req.on('timeout', () => req.destroy(new Error('TG request timeout')));
  req.write(body); req.end();
});
```

После рестарта:

```
$ curl -i -X POST https://auth.skrebeyko.ru/api/client-error -H "Content-Type: application/json" \
    -d '{"message":"backend smoke v2 — https.request fix",...}'
HTTP/2 204

$ tail -1 /var/log/garden-client-errors.log
{"ts":"2026-05-10T14:52:56.889Z","ip":"38.175.98.11","msgHash":"56ff88a6ae11",...}
```

**Никакого `tg-failed`/`handler-error` — fetch ушёл успешно.**
В TG-канал `@garden_grants_monitor_bot` должно было прилететь
сообщение «🚨 Garden client error / backend smoke v2 — https.request fix
/ source: curl / user: executor (manual) / bundle: manual / url: ...».

⚠ **Подтверди визуально**, что прилетело — у меня доступа к TG
канала нет.

### 2.9 Дедуп проверен

Повтор той же ошибки в окне 60s:

```
$ curl -i -X POST .../api/client-error -d '{"message":"backend smoke v2 — https.request fix",...}'
HTTP/2 204
$ tail -1 ...client-errors.log  # та же запись 14:52:56, новой нет
```

Endpoint вернул 204, в лог не записалось, в TG не пошло — дедуп
работает.

### 2.10 Logrotate настроен

```
/etc/logrotate.d/garden-client-errors:
/var/log/garden-client-errors.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
    create 0644 root root
}
```

Node работает под `root`, поэтому `create 0644 root root`.
`logrotate -d` — синтаксис ОК, готов к недельному rotate.

---

## 3. Что сделано на frontend (локально, push pending)

Два коммита, **не запушены**:

```
5ef8488 chore(ci): post-deploy smoke check
eb8dd70 feat(monitoring): client-side error reporter (MON-001)
```

Проверка:
```
$ git status -sb | head -1
## main...origin/main [ahead 2]
```

Файлы в коммитах:
- `feat(monitoring)`: utils/clientErrorReporter.js (new),
  main.jsx, components/ErrorBoundary.jsx, vite.config.js.
- `chore(ci)`: .github/workflows/deploy.yml.

Жду 🟢 PUSH.

---

## 4. Что НЕ сделано (как и договаривались)

- ✗ Не правил локальный `/Users/user/vibecoding/garden-auth/`
  репо (TECH-DEBT-AUTH-REPO-SYNC).
- ✗ Не пушил frontend.
- ✗ INFRA-005 hardening — не делаю (закрыт в _03).
- ✗ Lessons — после P1.

---

## 5. Что появилось в backlog (просьба зафиксировать)

### 5.1 INCIDENT-2026-05-10-tg-blackbox (P1, RESOLVED самим заходом)

**Симптом:** TG алерты от check_grants.sh не доходят с
**2026-05-06** (откорректировано после grep'а полного лога,
изначально я писал «с 09 мая» по tail'у). **5** grants-wipe
событий без уведомления.

**Корневая причина:** доступен только 1 IP диапазона
api.telegram.org с msk-1-vm-423o; DNS возвращает другой IP →
timeout. Часть IP блокированы по сетевому уровню (видимо
региональный фильтр).

**Фикс:** /etc/hosts pin (для bash-clients) + https.request
с family:4 (для node fetch — обходит happy-eyeballs).

**Что мониторить:** если 149.154.167.220 перестанет работать —
все три потребителя (check_grants, MON-001, будущий FEAT-N
TG-бот для менторов) одновременно ослепнут. См. INFRA-007.

**Журнал:** `docs/journal/INCIDENT_2026-05-10_tg_blackbox.md`.

### 5.2 INFRA-007-TG-IP-MONITORING (P3, как и попросила)

Cron задача: раз в час пробует POST на `api.telegram.org`. Если
fail → пытается несколько fallback IP, обновляет /etc/hosts на
рабочий, шлёт alert (по почте, раз TG мёртв).

Можно оформить как пул IP в скрипте + автоматическая ротация.
Не делаю сейчас — сначала закроем P1 + Prodamus + хидден.

### 5.3 TECH-DEBT-AUTH-REPO-SYNC (P3)

Локальный `/Users/user/vibecoding/garden-auth/` отстал от прода
(нет S3-блока, нет `role:'authenticated'`, нет MON-001 теперь).
Синхронизировать одним заходом, чтобы можно было править в репо
+ деплоить, а не править на сервере.

### 5.4 INCIDENT-DAILY-GRANTS-WIPE-13:10-UTC (P1, OPEN — нужен Timeweb support)

Каждый день в 13:10:01 UTC GRANT'ы на authenticated и web_anon
зачищаются полностью. SEC-014 (`check_grants.sh` + `recover_grants.sh`)
автоматически восстанавливает к 13:10:11–13:10:22 UTC. Прошло
**5 раз** с 2026-05-06 по 2026-05-10, ровно в 13:10:01 UTC ± 0s.

Без TG-blackbox мы бы знали об этом с 06-го числа. Из-за blackbox
— узнали только сегодня, попутно с MON-001.

**Что нужно:**
- Тикет в Timeweb support: «У нас на msk-1-vm-423o ежедневно в
  13:10:01 UTC по cron'у (на стороне платформы) кто-то делает
  REVOKE ALL на двух ролях. Это не наш cron, не pg_cron. Что
  это и можно ли отключить?»
- До этого — мониторинг работает (P0 wipe → recovery → alert
  через починенный TG-канал).

**Журнал:** `docs/journal/INCIDENT_2026-05-10_daily_grants_wipe.md`.

### 5.5 TECH-DEBT-AUTH-BACKUPS-CLEAN (P3)

В `/opt/garden-auth/` накопились backup'ы:
```
server.js.bak                                  Feb 23 18:03  6996b
server.js.bak.2026-05-02-pre-role-claim        Feb 24 03:51  8935b
server.js.bak.2026-05-10-pre-mon001            May 10 14:40  8965b  ← сегодняшний
```

Февральские backup'ы — за 3 месяца некому пригодиться.
Нужна стратегия: либо **rotate keep-last-N** (3-5 штук), либо
**ручной cleanup при каждом deploy**, либо **переход на git-based
deploy** (TECH-DEBT-AUTH-REPO-SYNC), где backup не нужен.

**Журнал:** `docs/journal/TECH_DEBT_2026-05-10_auth_backups_clean.md`.

---

## 6. Открытые вопросы

1. **Подтверди приход в TG**: было ли в `@garden_grants_monitor_bot`
   сообщение `🚨 Garden client error / backend smoke v2 — https.request fix`
   около 14:52 UTC (17:52 МСК)?
2. **/etc/hosts pin** — оставляем как есть, или хочешь
   pre-commit / Ansible-mаnagement позже?
3. **Backend backup-стратегия** — этот backup
   `server.js.bak.2026-05-10-pre-mon001` оставляем «навсегда»
   или ротируем (старая `server.js.bak` и `server.js.bak.2026-05-02-pre-role-claim`
   валяются — но это не моя забота)?

---

## 7. План на следующее: жду 🟢 PUSH

После твоего 🟢 PUSH:

1. `git push origin main` (frontend, 2 коммита).
2. GitHub Actions deploy → smoke check workflow проверит, что
   index.html + bundle живые.
3. Ольга через `Claude in Chrome` сделает финальный smoke по
   разделу 6 моего `_03`:
   - открыть liga.skrebeyko.ru,
   - `throw new Error('MON-001 smoke ' + Date.now())`,
   - подтвердить приход в TG.
4. `_06_codeexec_p1_smoke_done.md` с финальным результатом.

После `_06` — отдельный заход для 3 lessons.

---

Жду 🟢 PUSH.
