# BUG-PRODAMUS-SIGNATURE-ALGO — deploy + готовы ко второму sandbox-прогону

**От:** VS Code Claude Code
**Кому:** стратег (claude.ai)
**Ответ на:** 🟢 в [`docs/_session/2026-05-16_13_codeexec_prodamus_algo_fix.md`](2026-05-16_13_codeexec_prodamus_algo_fix.md)
**Дата:** 2026-05-16
**Статус:** 🟢 **Deploy прошёл, новый Prodamus algorithm + debug-лог на проде. Можно прогонять sandbox.**

---

## TL;DR

Commit `eb2d67a` запушен. Rsync → restart → smoke OK. Debug-лог тоже работает (мой пустой POST `{}` его триггернул, увидел `header names: host,user-agent,...` без `sign` — корректно).

В `billing_webhook_logs` обнаружил **новый sandbox-event id=8** (Ольга) в 21:56 MSK — это был **между** моим partial-index deploy (12:17 MSK) и моим algo deploy (19:28 MSK). Тоже `Invalid signature`, потому что фикс ещё не был на проде. **С нынешнего момента следующий sandbox-event должен пройти.**

## Поэтапно

### 1. Commit + push

```
[main eb2d67a] fix(push-server): BUG-PRODAMUS-SIGNATURE-ALGO — настоящий Prodamus алгоритм + debug-лог
 3 files changed, 115 insertions(+), 2 deletions(-)
e0d60cf..eb2d67a  main -> main
```

### 2. Rsync (только нужные файлы)

```
$ rsync -av --exclude=node_modules --exclude='*.test.mjs' --exclude='.env' --exclude='package-lock.json' \
    push-server/ root@5.129.251.56:/opt/push-server/
prodamusVerify.mjs
server.mjs
sent 5576 bytes  received 274 bytes
```

`.env` исключён, тесты исключены (16/16 → 20/20 локально, на проде не нужны).

### 3. Restart + verify

```
$ systemctl restart push-server.service && systemctl is-active
active

$ journalctl -u push-server.service -n 4
May 15 19:28:13 systemd: Stopped push-server.service
May 15 19:28:13 systemd: Started push-server.service
May 15 19:28:14 push-server: Server started on :8787 (push=off, prodamus=on)

$ curl https://push.skrebeyko.ru/health
HTTP 200

$ curl -X POST https://push.skrebeyko.ru/api/billing/prodamus/webhook -d '{}'
HTTP 403 — {"error":"Invalid signature"}
```

### 4. Debug-лог проверен (мой пустой POST его сработал)

```
May 15 19:28:29 push-server: [prodamus-debug] Invalid signature trace
May 15 19:28:29 push-server:   header names: host,user-agent,content-length,accept,content-type,
                              x-forwarded-for,x-forwarded-host,x-forwarded-proto,accept-encoding
```

В моём `{}`-запросе нет `sign`/`signature` header'а — корректно отображается. Когда придёт sandbox от Ольги, будет видно который header Prodamus реально шлёт + canonical.

## Открытие: ещё один sandbox-event пока я деплоил

```sql
SELECT id, event_name, signature_valid, error_text, created_at
FROM billing_webhook_logs ORDER BY id DESC LIMIT 10;

 id |   event_name    | sig_valid |    error_text     |         created
----+-----------------+-----------+-------------------+-------------------------
 10 | unknown         | f         | Invalid signature | 2026-05-15 22:28:29 MSK  ← мой пустой smoke
  8 | payment_success | f         | Invalid signature | 2026-05-15 21:56:30 MSK  ← НОВЫЙ от Ольги
  4 | payment_success | f         | Invalid signature | 2026-05-15 16:07:09 MSK  ← старый
  3 | unknown         | f         | Invalid signature | 2026-05-15 15:17:29 MSK  ← старый
```

**id=8 — Ольга прогнала sandbox между моим partial-index deploy и algo deploy.** Этот event попал ещё на СТАРЫЙ алгоритм (без `buildProdamusCanonical`), поэтому упал. Debug-лога для него нет (фикс не был на проде).

**id=10 — мой собственный smoke** через Caddy. Тоже 403, что и ожидалось.

**Хорошая новость: НЕТ 42P10.** Partial-index фикс работает (id 8, 10 — новые external_id, INSERT прошёл без conflict).

## Что ждём

Ольга прогоняет sandbox snippet ещё раз через Prodamus dashboard. Ожидание:

**Если всё ОК:**
- HTTP **200 OK** на webhook.
- Запись в `billing_webhook_logs` с `signature_valid=true, is_processed=true, error_text=null`.
- (Если профиль с email из payload найдётся в `profiles`) → `access_status` обновится.

**Если упадёт:**
- HTTP 403 + новая запись с `signature_valid=false`.
- В journal — `[prodamus-debug] Invalid signature trace` с **полным** диагностическим выхлопом:
  - `header names: ...` (увидим как реально называется header — Sign, X-Sign, Hash, etc.)
  - `Sign header (first 16): ... len: NN` (длина — 64 для SHA256, 32 для MD5)
  - `payload keys: ...` (что Express парсер выдал)
  - `canonical (first 500): ...` (что мы хешировали)
  - `canonical len: NNN` (полная длина для сверки)
- По этому выхлопу разберём ровно один edge-case (см. раздел «Edge-case-ы» в `_session/13`).

## Команда для забора debug-выхлопа после следующего event'а

```bash
ssh root@5.129.251.56 'journalctl -u push-server.service --since "5 minutes ago" --no-pager | grep -A6 prodamus-debug'
```

или для последнего sandbox-event'а:

```bash
ssh root@5.129.251.56 'journalctl -u push-server.service --since "30 minutes ago" --no-pager | grep -B0 -A6 "prodamus-debug" | tail -20'
```

## Состояние FEAT-015

- [x] Phase C0–C4 в проде (все коммиты, миграция, .env, webhook ON)
- [x] BUG-PRODAMUS-SIGNATURE-HEADER fix (7dcab90)
- [x] BUG-WEBHOOK-LOG-PARTIAL-INDEX fix (e0d60cf)
- [x] BUG-PRODAMUS-SIGNATURE-ALGO fix + debug (eb2d67a, этот deploy)
- [ ] Phase C5. E2E smoke — **Ольга, прогоняй ещё раз** sandbox из Prodamus dashboard. Если 200 → готово. Если 403 → копируй [prodamus-debug] из journal, разберу.
- [ ] Phase C6 (Admin UI). Frontend в main (85a93f2), GH Actions ⇒ FTP — обычно 1-2 минуты.
- [ ] Phase C7. После зелёного sandbox: revert debug-лог отдельным коммитом + 3 урока (header-Sign, partial-index, signature-canonical-form) + закрыть FEAT-015 в BACKLOG.

## Что ждёт следующий шаг

**Ольга:** прогнать sandbox-test ещё раз. Жду либо «200 OK», либо «403 + journal-выхлоп».
