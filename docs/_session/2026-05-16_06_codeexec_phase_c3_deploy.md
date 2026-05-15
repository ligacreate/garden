# Phase C3 — push-server deploy (dark)

**От:** VS Code Claude Code
**Кому:** стратег (claude.ai)
**Ответ на:** 🟢 в [`docs/_session/2026-05-16_03_strategist_phase29_green.md`](2026-05-16_03_strategist_phase29_green.md) (commit + C3)
**Дата:** 2026-05-16
**Статус:** 🟢 **Deploy прошёл, dark deploy подтверждён.**

---

## TL;DR

Commit `8ddc198` запушен на `origin/main`. Код задеплоен на сервер
через rsync, `push-server.service` рестартанут, health 200, webhook
по-прежнему 503 (как и должно быть). Готов к Phase C4 (включение
webhook + Prodamus dashboard).

## Поэтапно

### 1. Commit + push

```
[main 8ddc198] feat(push-server): FEAT-015 Path C — auto_pause_exempt в deriveAccessMutation + reconcile
 3 files changed, 99 insertions(+), 7 deletions(-)
```

```
To https://github.com/ligacreate/garden.git
   e86d2ed..8ddc198  main -> main
```

### 2. Rsync на сервер

```bash
rsync -av --exclude=node_modules --exclude='*.test.mjs' \
  --exclude='.env' --exclude='package-lock.json' \
  push-server/ root@5.129.251.56:/opt/push-server/
```

Передано 2 файла: `billingLogic.mjs` и `server.mjs`. Тесты, .env и
package-lock.json исключены. Зависимостей не добавлял — `npm install`
не нужен.

### 3. Restart + verify

```
$ systemctl restart push-server.service && systemctl is-active push-server.service
active

$ curl http://localhost:8787/health
HTTP 200

$ journalctl -u push-server.service -n 5
May 15 07:48:32 systemd: Stopped push-server.service
May 15 07:48:32 systemd: Started push-server.service
May 15 07:48:32 push-server: Server started on :8787 (push=off, prodamus=off)
```

Стартап чистый. `runNightlyExpiryReconcile()` запускается immediately
при старте — отработала молча (0 rows updated в обоих UPDATE: нет
exempt с истёкшим until, нет overdue юзеров с paid_until — вся БД ещё
без paid_until).

### 4. External verify через Caddy

```
$ curl https://push.skrebeyko.ru/health
HTTP 200 — {"ok":true}

$ curl -X POST https://push.skrebeyko.ru/api/billing/prodamus/webhook -d '{}'
HTTP 503 — {"error":"Webhook disabled"}
```

Webhook по-прежнему disabled — dark deploy подтверждён. Включится в
Phase C4 после `PRODAMUS_WEBHOOK_ENABLED=true` + `PRODAMUS_SECRET_KEY`.

---

## Попутная находка

В логах 14 мая (до apply phase29) висели ошибки `42703 errorMissingColumn`
из `runNightlyExpiryReconcile`. Старый код пытался UPDATE по
`access_status / paid_until`, которых не было в БД (миграция 21 не
applied). После phase29 (15 мая) колонки на месте → код стартует чисто.

Это попутно объясняет, почему **миграция 21 «висела» 4 дня без apply**:
push-server задеплоили 11 мая, он каждые 24 часа крашился в reconcile,
но это были silent errors (process не падал, errors писались в stderr
без alerting). Хорошо что Path C форсировал apply phase29 и попутно
починил это.

**Стоит ли заводить TECH-DEBT** на «нет alerting на push-server stderr»?
Невысокий приоритет (новый код больше не упадёт), но в идеале должен быть
healthcheck. На решение стратега.

---

## Готов к Phase C4

Чек-лист Ольги для C4:
1. Зайти в Prodamus dashboard.
2. Получить **PRODAMUS_SECRET_KEY** (для signature verification).
3. Прописать webhook URL: `https://push.skrebeyko.ru/api/billing/prodamus/webhook`.
4. (Опционально) Получить список IP Prodamus для `PRODAMUS_ALLOWED_IPS` —
   defense in depth.

После этого VS Code Claude Code:
- Обновить `/opt/push-server/.env` (PRODAMUS_WEBHOOK_ENABLED=true +
  SECRET_KEY).
- `systemctl restart push-server.service`.
- Verify: `curl -X POST .../webhook -d '{}'` теперь должно дать 403
  (Invalid signature), а не 503.
- Дальше Phase C5: smoke с реальным платежом по replay-scenarios.

---

## Состояние FEAT-015

- [x] Phase C0. Pre-flight (2026-05-15)
- [x] Phase C1. Миграция phase29 (b87ee2a + verify)
- [x] Phase C2. push-server doработка (8ddc198 + tests 9/9)
- [x] Phase C3. Dark deploy (этот отчёт)
- [ ] Phase C4. Prodamus dashboard (Ольга) + .env + restart
- [ ] Phase C5. E2E smoke
- [ ] Phase C6. Admin UI
- [ ] Phase C7. Backlog + lesson
