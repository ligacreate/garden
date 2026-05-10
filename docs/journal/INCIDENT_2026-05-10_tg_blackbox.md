---
title: P1 TG-blackbox 2026-05-06 → 2026-05-10 — alerts от check_grants.sh не доходили 5 дней
date: 2026-05-10
severity: P1
scope: monitoring blind-spot — все TG-alerts от msk-1-vm-423o
duration: 2026-05-06 13:10 UTC → 2026-05-10 ~14:53 UTC (≈4 дня 1.5 часа)
status: closed (resolved 2026-05-10 в рамках MON-001 backend deploy)
related:
  - docs/_session/2026-05-10_05_codeexec_p1_backend_deployed.md
  - docs/journal/INCIDENT_2026-05-10_daily_grants_wipe.md (что мы пропустили)
  - scripts/check_grants.sh (как было сломано)
  - /etc/hosts на сервере (как починено)
  - /opt/garden-auth/server.js (вторая часть фикса — node fetch)
audience: будущий on-call + автор INFRA-007
---

# TG-blackbox 2026-05-06 → 2026-05-10

С 2026-05-06 13:10 UTC по 2026-05-10 14:53 UTC **все исходящие
HTTPS-запросы к `api.telegram.org` с сервера msk-1-vm-423o
падали по timeout**. Это означает, что:

- 5 ежедневных alerts от `check_grants.sh` (см.
  `INCIDENT_2026-05-10_daily_grants_wipe.md`) **не дошли** до
  `@garden_grants_monitor_bot`.
- Любой будущий потребитель TG-API (наш FEAT-N TG-бот для
  менторов, MON-001 frontend reporter) был бы тоже слепой.

## Симптом

В `/var/log/garden-monitor.log`, тело каждого 13:10 события:

```
[2026-05-06T13:10:11Z] check: WARN: Telegram alert failed (см. /var/log/garden-monitor.log)
curl: (28) Connection timed out after 10002 milliseconds
```

`curl -m 10` (без `--resolve`) вешается на 10 секунд и сдаётся.
Recovery после WIPE отрабатывал, но никто **не видел** — alert
ушёл в /dev/null.

## Корневая причина — два слоя

### Слой 1 — IP-фильтр на стороне платформы

Telegram API serves через несколько подсетей. Из msk-1-vm-423o
проверены 7 IP'ов (включая текущий резолв и IPv6):

```
149.154.167.220: HTTP 302 time 0.146s  ← единственный рабочий
149.154.166.110: timeout                 ← резолвится по DNS
149.154.167.99:  timeout
149.154.165.120: timeout
91.108.56.1:     timeout                 ← Telegram CDN
91.108.4.1:      timeout
2001:67c:4e8:f004::9: ENETUNREACH        ← IPv6 vообще
```

Доступен только **один** IP. Остальные блокированы по сетевому
уровню. DNS возвращает `149.154.166.110` → timeout. Это **не
наша конфигурация** — это политика inbound от ноды на этом
IP-диапазоне.

### Слой 2 — undici happy-eyeballs в node fetch

Когда мы починили DNS через `/etc/hosts` pin (см. ниже), `curl`
заработал. **Но node fetch в garden-auth/server.js всё равно
падал**:

```
$ node -e "fetch('https://api.telegram.org/').then(r=>console.log(r.status)).catch(e=>console.log('ERR',e.cause?.code, e.cause?.errors?.map(x=>x.code)))"
ERR ETIMEDOUT [ 'ETIMEDOUT', 'ENETUNREACH' ]
```

undici (бэкэнд Node.js fetch) делает happy-eyeballs: пробует
IPv4 и IPv6 параллельно, даже когда DNS вернул только IPv4.
IPv6-попытка ловит ENETUNREACH и фейлит весь fetch.

## Recovery (применённые фиксы)

### Шаг 1 — `/etc/hosts` pin (для bash-clients)

```
$ ssh root@5.129.251.56
$ echo '149.154.167.220 api.telegram.org  # INFRA fix 2026-05-10 — single working IP from msk-1-vm-423o' >> /etc/hosts
```

После этого:
```
$ curl -sS -o /dev/null -w 'HTTP %{http_code}\n' https://api.telegram.org/
HTTP 302
```

Это починило `check_grants.sh` сразу (он использует `curl`).

### Шаг 2 — `https.request({ family: 4 })` в server.js

Заменили `fetch(TG_API, ...)` на собственный `httpsPostJson(...)`
поверх `https.request` с явным `family: 4`. Это форсит IPv4-only
коннект и обходит happy-eyeballs.

Код в `/opt/garden-auth/server.js`:

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

## Smoke (post-recovery)

| Проверка | Результат | Ожидание |
|---|---|---|
| **A.** `curl https://api.telegram.org/` с сервера | HTTP 302 ip 149.154.167.220 | НЕ timeout |
| **B.** `node -e "fetch('https://api.telegram.org/')..."` | OK 302 | НЕ ETIMEDOUT |
| **C.** POST `/api/client-error` с тестовой ошибкой | 204, лог OK, нет `tg-failed` | в TG прилетает сообщение |
| **D.** Скриншот от Ольги в TG-канале | ✅ прилетел в 17:52 МСК | визуальное подтверждение |

См. также скриншот сообщения, прислан Ольгой в _session.

## Что НЕ задело

- БД, PostgREST, Caddy, garden-auth — все в порядке.
- Существующие пользовательские routes (`/auth/*`, `/storage/sign`) —
  не трогали логику, только добавили endpoint'ы и helper.
- backup `server.js.bak.2026-05-10-pre-mon001` лежит, откат
  `cp + systemctl restart` сработает за 5 секунд.

## Что **обнаружили** во время blackbox-периода

Поскольку 5 дней мы не получали ни одного TG-alert, мы не видели
**ежедневный grants-wipe в 13:10:01 UTC** — отдельный P1
инцидент. См. `INCIDENT_2026-05-10_daily_grants_wipe.md`.

Это самая важная стоимость blackbox'а: мы 5 дней не знали о
регулярной проблеме, на которую можно было реагировать раньше.

## Lessons-кандидат

Возможный урок: «выделенный IP-резолв для критичного outbound
SaaS — иначе один blackbox по DNS может усыпить мониторинг
надолго». Не пишу прямо сейчас (пользователь просил lessons
после P1 как отдельный заход).

## Связанные backlog-задачи

- **INFRA-007-TG-IP-MONITORING (P3)** — cron, который раз в
  час проверяет `https://api.telegram.org/`, ротирует IP в
  `/etc/hosts` из пула, alert по почте при потере всех IP.
  Защита от того, что `149.154.167.220` сам однажды перестанет
  работать.
- **TECH-DEBT-AUTH-REPO-SYNC (P3)** — синхронизировать локальный
  `/Users/user/vibecoding/garden-auth/` с прод-кодом, чтобы
  правки шли через git, а не через scp.

## Открытые вопросы

- Менять ли `check_grants.sh` на `curl --resolve api.telegram.org:443:149.154.167.220 ...`
  как **дополнительный** belt-and-suspenders на случай, если
  `/etc/hosts` кто-то вычистит при апдейте системы? Не сделал —
  /etc/hosts достаточно.
- Pre-commit / Ansible для `/etc/hosts` — не сделал, sysadmin-уровень.
