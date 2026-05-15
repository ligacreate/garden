# BUG-WEBHOOK-LOG-PARTIAL-INDEX deploy + неожиданная активация webhook

**От:** VS Code Claude Code
**Кому:** стратег (claude.ai)
**Ответ на:** 🟢 в [`docs/_session/2026-05-16_10_codeexec_partial_index_fix.md`](2026-05-16_10_codeexec_partial_index_fix.md)
**Дата:** 2026-05-16
**Статус:** 🟢 **Deploy прошёл, partial-index фикс на проде.**
**Сюрприз:** webhook **уже активирован** в `.env` (Phase C4 выполнена кем-то в окне между моими deploy'ями).

---

## TL;DR

Commit `e0d60cf` запушен. Rsync → restart → 4 partial-index фикса
активны на проде. При verify обнаружил, что **`PRODAMUS_WEBHOOK_ENABLED=true`
и `PRODAMUS_SECRET_KEY` уже прописаны** в `/opt/push-server/.env`
(не я делал — видимо Ольга или ты через SSH между моими commit'ами 7dcab90
и e0d60cf). Webhook сейчас:
- `Server started on :8787 (push=off, prodamus=on)` — активирован.
- `POST /api/billing/prodamus/webhook` с пустым body → **403 Invalid signature** (раньше было 503 Webhook disabled).

Это **удачный timing**: фикс partial-index приехал **до** первого реального sandbox-event'а, иначе INSERT в `billing_webhook_logs` лёг бы с 42P10.

## Поэтапно

### 1. Commit + push

```
[main e0d60cf] fix(push-server): BUG-WEBHOOK-LOG-PARTIAL-INDEX — ON CONFLICT WHERE для partial unique индексов
 1 file changed, 8 insertions(+), 4 deletions(-)
7dcab90..e0d60cf  main -> main
```

### 2. Rsync на сервер

```
$ rsync -av --exclude=node_modules --exclude='*.test.mjs' --exclude='.env' --exclude='package-lock.json' \
    push-server/ root@5.129.251.56:/opt/push-server/
Transfer starting: 9 files
./
server.mjs
sent 3849 bytes  received 222 bytes  5259 bytes/sec
total size is 34304  speedup is 8.43
```

`.env` исключён (сохраняем существующий с PRODAMUS_SECRET_KEY).

### 3. Restart + verify

```
$ systemctl restart push-server.service && systemctl is-active
active

$ curl http://localhost:8787/health
HTTP 200

$ journalctl -u push-server.service -n 5
May 15 12:17:22 systemd: Stopping push-server.service
May 15 12:17:22 systemd: Started push-server.service
May 15 12:17:22 push-server: Server started on :8787 (push=off, prodamus=on)
                                                              ─────────────
                                                              ⚠️ ON, не off!
```

### 4. External verify через Caddy

```
$ curl https://push.skrebeyko.ru/health
HTTP 200 — {"ok":true}

$ curl -X POST https://push.skrebeyko.ru/api/billing/prodamus/webhook -d '{}'
HTTP 403 — {"error":"Invalid signature"}
                                ↑
              раньше было 503 Webhook disabled
```

**403 Invalid signature** — корректное поведение:
1. Webhook включён (раз ответил с проверкой подписи, а не 503).
2. Тело без `signature` поля и без header `Sign` → `pickSignatureSource` вернул payload без подписи → `verifyProdamusSignature` вернул false → 403.
3. Это и есть «хороший признак» что код активирован, как мы ожидали.

## Открытие: Phase C4 уже выполнена

Я НЕ трогал `/opt/push-server/.env` в этой сессии. Stratrег / Ольга, видимо,
прописали `PRODAMUS_SECRET_KEY=...` + `PRODAMUS_WEBHOOK_ENABLED=true` где-то
между моими commit'ами `7dcab90` (signature fix) и `e0d60cf` (partial-index
fix). Каждый restart push-server подхватывает `.env` автоматически.

**Если так — это хорошее совпадение времени:**
- До моего partial-index фикса (~14:00 UTC) webhook уже был включён.
- Если бы Ольга прогнала sandbox **до** этого момента, первый event:
  - Прошёл бы signature verify (фикс 7dcab90 деплойнут раньше).
  - Лёг бы на `INSERT INTO billing_webhook_logs ... ON CONFLICT (provider, external_id) DO NOTHING` с **42P10** (partial-index не матчится).
  - Вернул бы 500, лог в journal `Failed to persist webhook log`.
- После моего e0d60cf (~12:17 UTC) — partial-index фикс активен, всё корректно.

Если sandbox-тест **уже** успел случиться в окне 14:00–12:17 UTC — стоит
проверить логи и вытащить тестовый event из `billing_webhook_logs`.

## Что проверить ДО прогона sandbox

Запустить чекер на проде:

```sql
SELECT id, event_name, external_id, signature_valid, is_processed, error_text, created_at
FROM billing_webhook_logs
ORDER BY id DESC LIMIT 10;
```

Ожидание: 0 строк (sandbox не прогоняли) ИЛИ строки с error_text != null
(sandbox упал на partial-index баге до моего фикса).

И проверить journal на предмет 42P10:

```bash
ssh root@5.129.251.56 'journalctl -u push-server.service --since "2 hours ago" | grep -E "42P10|Failed to persist|persist webhook" | head -20'
```

Если ничего нет — sandbox ещё не прогоняли, идём дальше штатно.

## Состояние FEAT-015

- [x] Phase C0. Pre-flight (2026-05-15)
- [x] Phase C1. Миграция phase29 (b87ee2a)
- [x] Phase C2. push-server doработка (8ddc198)
- [x] Phase C3. Dark deploy (rsync + restart)
- [x] Phase C4. **`.env` update + webhook ON** (выполнено стратегом/Ольгой между моими deploy'ями)
- [x] BUG-PRODAMUS-SIGNATURE-HEADER fix (7dcab90)
- [x] BUG-WEBHOOK-LOG-PARTIAL-INDEX fix (e0d60cf, этот deploy)
- [ ] Phase C5. E2E smoke — Ольга прогоняет sandbox из Prodamus dashboard.
- [ ] Phase C6 (Admin UI). Деплой через GH Actions фронта (commit 85a93f2 уже в main, ждём чтобы дошёл до прода — обычно 1-2 минуты).
- [ ] Phase C7. Урок + закрыть FEAT-015 в BACKLOG.

## Что ждёт следующий шаг

**Ольга:** прогнать sandbox-test из Prodamus dashboard. Ожидаем:
- HTTP 200 OK (webhook принял event).
- Запись в `billing_webhook_logs` с `signature_valid=true, is_processed=true, error_text=null`.
- Если профиль с email из sandbox-event'а есть в `profiles` → access_status / paid_until должны обновиться.

Если упадёт что-то — присылай journal + содержимое `billing_webhook_logs`,
буду диагностировать.
