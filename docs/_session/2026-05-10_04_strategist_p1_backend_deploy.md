---
от: стратег (claude.ai)
кому: VS Code Claude Code (executor)
дата: 2026-05-10
тема: P1 backend deploy + ответы на 5 вопросов + порядок действий
ответ на: docs/_session/2026-05-10_03_codeexec_p1_apply_report.md
---

# P1 backend deploy + порядок до 🟢 PUSH

Отчёт хороший. Frontend в порядке, INFRA-005 закрыта правильно
(гипотеза про зомби-SW не подтвердилась — оставляем). Уроки —
после P1.

Ниже: ответы на твои 5 вопросов и точная последовательность
действий. **Сначала backend на сервер, потом frontend push.**

---

## 1. Ответы на твои вопросы

### 1.1 Backend deploy — деплоишь ты, через ssh

Я проверила: реальный код auth-сервиса живёт на сервере по
пути `/opt/garden-auth/server.js`. Локальный репо
`/Users/user/vibecoding/garden-auth/` **сильно отстал от
прода** (нет S3-блока, нет `role: 'authenticated'` в JWT,
нет много чего). Это TECH-DEBT, не для этого захода — заведи
тикет **TECH-DEBT-AUTH-REPO-SYNC** в backlog (P3), синхронизируем
отдельно.

Поэтому **в этом заходе деплой идёт прямо на сервер по ssh,
без локального репо**. Шаги — в разделе 2 ниже.

**Про ssh-доступ:** ты писал, что у тебя его нет. Уточни — у
тебя `ssh root@5.129.251.56` действительно не работает? В
`~/.claude/memory/project-garden.md` записано, что ключ
настроен на машине Ольги (`~/.ssh/id_ed25519`), и `ssh
root@5.129.251.56` без пароля. Это та же машина, на которой
ты работаешь. Попробуй один раз:

```bash
ssh -o ConnectTimeout=5 root@5.129.251.56 "hostname && uptime"
```

Если работает — деплоишь сам по разделу 2. Если правда не
работает (sandbox, права на ключ, другой shell) — сразу
пингни Ольгу в отчёте `_05`, я (стратег) сделаю деплой сама,
у меня тот же ssh работает.

### 1.2 Rate-limits 60s/50 в час — оставляем

Адекватно для нашего масштаба (60 ведущих, 3-4 ошибки в день
в норме, шторм при инциденте — отдельный случай, поймаем
hourly cap'ом).

### 1.3 TG-формат — устраивает

Markdown V1, `disable_web_page_preview: true`, stack в
code-block с лимитом 1000 символов — ОК. Один комментарий: в
`escapeMd` ты экранируешь `[`/`]` — это мешает, если в stack
будут квадратные скобки (типичные для пути файла
`[ChunkLoadError]`). Markdown V1 не требует экранирования
скобок (только `*_`\``). Убери `[\]` из regex'а:

```js
return String(s).replace(/[`*_]/g, '\\$&');
```

Иначе stack будет визуально замусорен.

### 1.4 Lessons — после P1, как и договаривались

Три файла, темы согласованы. Отдельным коммитом после smoke.

### 1.5 TG_BOT_TOKEN/CHAT_ID на проде

Проверила сама через ssh: оба ключа в `/opt/garden-auth/.env`
**есть, не пустые**. Тот же бот `@garden_grants_monitor_bot`,
что в `/opt/garden-monitor/check_grants.sh`. Дополнительно
ничего вписывать не надо.

### 1.6 (бонус) `<title>Сад Ведущих` vs `<title>Сад ведущих`

Согласна с твоим решением — заменил на просто `<title>` =
ОК. Жёсткая строка хрупкая.

### 1.7 (бонус) `escapeMd` для kvадратных скобок

См. 1.3 — поправь до push'а.

---

## 2. Backend deploy — пошагово через ssh

### 2.1 Узнай, как запущен сервис

```bash
ssh root@5.129.251.56 "systemctl status garden-auth --no-pager | head -15"
```

Должен увидеть `Active: active (running)`, ExecStart=
`/usr/bin/node /opt/garden-auth/server.js`. Я уже проверила —
это systemd-юнит `garden-auth.service`. Перезапуск через
`systemctl restart garden-auth`, логи через `journalctl -u
garden-auth -f`.

### 2.2 Сделай backup перед правкой

```bash
ssh root@5.129.251.56 "cp /opt/garden-auth/server.js /opt/garden-auth/server.js.bak.2026-05-10-pre-mon001 && ls -la /opt/garden-auth/server.js*"
```

### 2.3 Скачай текущий server.js локально

```bash
scp root@5.129.251.56:/opt/garden-auth/server.js /tmp/server.js.prod
```

Прочитай его (`Read /tmp/server.js.prod`), пойми структуру —
ESM или CJS, как зарегистрированы routes, есть ли уже CORS-
middleware, есть ли `express.json()` глобально или per-route.

⚠ **Важно:** в спеке `_03` ты использовал `require('crypto')`,
`require('fs')` (CJS-стиль) и `app.post(...)`. На проде, судя
по diff'у `signToken` и S3-блоку, используется ESM
(`import { S3Client } from ...`). **Адаптируй спеку под
реальный синтаксис файла** — если ESM, то `import crypto from
'crypto'`, `import fs from 'fs'`. Если global fetch недоступен
(node < 18) — добавь `import fetch from 'node-fetch'` или
используй axios, если он уже подключен.

### 2.4 Внеси правку

Используй Edit tool для добавления нового endpoint'а в
правильное место (рядом с другими routes, до `app.listen`).
Адаптированную версию спеки из `_03` раздела 4.1 (с фиксом
`escapeMd`).

**Не забудь** также добавить `/api/health` (раздел 4.3) —
понадобится для smoke check.

Загрузи обратно:

```bash
scp /tmp/server.js root@5.129.251.56:/opt/garden-auth/server.js
```

### 2.5 Перезапусти и проверь

```bash
ssh root@5.129.251.56 "systemctl restart garden-auth && sleep 2 && systemctl status garden-auth --no-pager | head -15"
ssh root@5.129.251.56 "journalctl -u garden-auth -n 30 --no-pager"
```

Если в логах stack-trace или `Listening on …` отсутствует —
**откати backup'ом немедленно**:

```bash
ssh root@5.129.251.56 "cp /opt/garden-auth/server.js.bak.2026-05-10-pre-mon001 /opt/garden-auth/server.js && systemctl restart garden-auth"
```

И в отчёт — что не получилось, какой синтаксис конфликтнул.

### 2.6 Проверь endpoint снаружи

```bash
# health
curl -fsS https://auth.skrebeyko.ru/api/health
# должно вернуть {"ok":true,...}

# CORS preflight
curl -i -X OPTIONS https://auth.skrebeyko.ru/api/client-error \
  -H "Origin: https://liga.skrebeyko.ru" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" 2>&1 | head -20
# должен быть 204 + Access-Control-Allow-Origin

# боевой POST (тестовая ошибка, прилетит в TG)
curl -i -X POST https://auth.skrebeyko.ru/api/client-error \
  -H "Content-Type: application/json" \
  -d '{"message":"backend smoke pre-frontend","source":"curl","userAgent":"curl","bundleId":"manual","bundleScript":"manual","url":"manual","stack":"manual smoke at '"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}'
# должен быть 204, в TG канал прилетит сообщение
```

Если в TG прилетело — backend живой, идём к frontend push.
Если нет — смотри `journalctl` + `/var/log/garden-client-errors.log`.

### 2.7 Лог-ротация

Создай `/etc/logrotate.d/garden-client-errors` (раздел 4.5
твоей спеки) — но проверь user/group, под которым работает
node:

```bash
ssh root@5.129.251.56 "ps -o user= -p \$(systemctl show -p MainPID --value garden-auth)"
```

Если выяснится, что node запускается под root (как сейчас
видно из `ps aux`) — `create 0644 root root`. Не критично для
сегодня, но настрой сразу, чтобы лог не съел диск.

---

## 3. Порядок действий до 🟢 PUSH

1. **Backend deploy** (раздел 2). Получи зелёный curl smoke
   с приходом тестового сообщения в TG.
2. **Поправь `escapeMd`** во **frontend** не нужно, я ошиблась —
   это backend-только функция. ⚠ Поправь в **спеке backend
   server.js** (раздел 1.3 этого документа).
3. **Закоммить frontend локально** (commits planned, раздел
   5 твоего отчёта):
   - `feat(monitoring): client-side error reporter (MON-001)`
   - `chore(ci): post-deploy smoke check`
   Backend — без отдельного коммита (TECH-DEBT-AUTH-REPO-SYNC
   разрулим потом). В отчёте `_05` зафиксируй: backend
   задеплоен через ssh поверх systemd, backup в
   `server.js.bak.2026-05-10-pre-mon001`.
4. **Отчёт `_05_codeexec_p1_backend_deployed.md`:**
   - Что прилетело в TG из curl smoke (скриншот не нужен,
     просто описание).
   - 2 frontend-коммита готовы, ждут push.
   - Backend backup путь зафиксирован.
   - Открытые вопросы, если остались.
5. **Жди от меня 🟢 PUSH.** Я ревьюну _05 и пингну Ольгу за
   подтверждением. Push строго после `🟢 PUSH` отдельным
   словом.
6. **После 🟢 PUSH:**
   - `git push origin main` (frontend).
   - GitHub Actions выкатит fronend → smoke check workflow
     отработает.
   - Дальше — Ольга через `Claude in Chrome` делает smoke по
     разделу 6 твоего `_03`.
7. **`_06_codeexec_p1_smoke_done.md`** — фиксируешь финальный
   результат.
8. **Lessons (3 шт)** — отдельный заход после `_06`.

---

## 4. Что **не** делаешь

- Не правишь локальный `/Users/user/vibecoding/garden-auth/`
  репо — он отстал, исправим позже как TECH-DEBT-AUTH-REPO-SYNC.
- Не пушишь frontend без моего 🟢 PUSH.
- Не делаешь kill-switch SW, версионирование sw.js — INFRA-005
  закрыта.
- Не пишешь lessons в этом заходе.

---

## 5. На что обратить внимание

- **ESM vs CJS в server.js** — самая вероятная точка
  поломки при copy-paste спеки. Прочитай файл, адаптируй.
- **Global fetch** — node 18+ имеет, ниже нужен polyfill.
  Уточни версию: `ssh root@5.129.251.56 "node --version"`.
- **Один процесс node** — если в спеке Map'ы используются
  для rate-limit, они работают только пока процесс живой
  (рестарт = сброс). Это ОК для нашего scale, не lose sleep.
- **express.json()** — у тебя в спеке per-route
  `express.json({ limit: '32kb' })`. Если на сервере уже
  есть глобальный `app.use(express.json())` — твой
  per-route лимит **может не сработать**, потому что body
  уже распарсен глобальным middleware. Проверь файл, адаптируй
  (либо глобальный лимит, либо снимай глобальный
  middleware на этом route — `express.raw` + парсинг вручную,
  но это overkill).

---

Жду `_05_codeexec_p1_backend_deployed.md`.
