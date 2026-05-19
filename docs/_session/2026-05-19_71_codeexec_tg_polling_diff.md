# TG-WEBHOOK-INBOUND-BLOCKED — diff на ревью

**От:** codeexec (VS Code)
**Кому:** Ольга → стратегу
**Дата:** 2026-05-19
**В ответ на:** [_70](2026-05-19_70_strategist_tg_webhook_to_polling.md)
**Статус:** ⏳ жду 🟢. **Важно: на проде uncommitted diff 633 строки — нужно решение по двум репо (см. ⚠️ ниже).**

---

## Recon

`/opt/garden-auth/server.js` на проде — 840 строк. Точки интереса:

| что | строки | действие |
|---|---|---|
| `httpsPostJson` (IPv4-only POST) | 138–167 | оставляем, переиспользуем |
| `httpsGetJson` | — отсутствует | **добавляем** после 167 |
| `app.post('/api/tg-bot/webhook/:secret', ...)` | 359–474 (116 строк) | **удаляем**, логику выносим |
| `processTgQueueBatch` worker | 741–832 | не трогаем |
| `setInterval(processTgQueueBatch, TG_QUEUE_INTERVAL_MS).unref()` | 834–836 | оставляем; **сразу после** вставляем polling-loop |
| `app.listen(PORT || 3001, ...)` | 838– | не трогаем |
| env-vars `TG_NOTIF_WEBHOOK_PATH/SECRET` | line 110/111 | становятся dangling refs (env-set не сломает, в коде не используются после удаления handler'а). Оставляю — env-clean это housekeeping для отдельной сессии. |

Webhook-handler уже устроен правильно: ACK 200 идёт первым, дальше async-обработка `update.message` с парсингом `/start [LINK-XXXXXX]`, БД-проверками `tg_link_codes`, транзакционной привязкой в `profiles`, confirm-message через `sendTgNotification`. Логику переиспользуем 1:1, меняем источник update'а с `req.body` на параметр функции.

---

## ⚠️ Концерн: uncommitted prod state

```
$ ssh ... cd /opt/garden-auth && git status -sb && git diff --stat server.js
## main...origin/main
 M package-lock.json
 M package.json
 M server.js
?? .env.bak.20260516_175817

 server.js | 640 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 1 file changed, 633 insertions(+), 7 deletions(-)
```

На проде уже **633 строки изменений** в server.js (+ package.json + package-lock.json) против `origin/main`. Содержание diff'а (по beginning): S3 client, MON-001 `/api/health` + client-error reporter, FEAT-024 (notif-bot, queue worker, webhook handler — всё то, что мы как раз чиним), `signToken` с дефолтным `role: 'authenticated'`. Всё это **уже работает на проде**, просто не закоммичено в `olgaskrebeyko/garden-auth`.

Если я сделаю `git add server.js && git commit && git push`, мой polling-fix вкатится в одном коммите с этими 633 строками **накопленного prod state**. Это:
- Замусорит git history (один коммит «switch to polling» содержит S3-инфру и MON-001).
- Усложнит rollback моего polling-fix'а (придётся либо откатывать всё, либо cherry-pick'ать вручную).
- Авторство S3/MON-001/FEAT-024 потеряется — припишется этому коммиту, хотя я их не писал.

**Предлагаю на твоё решение, до apply:**

**(a) — Recommended:** ты или прошлый стратег сначала делаешь housekeeping-commit в `olgaskrebeyko/garden-auth` («infra: commit accumulated prod state — S3 + MON-001 + FEAT-024 baseline»), приводящий origin/main к снапшоту прода _до_ моих правок. После этого мой polling-fix идёт отдельным чистым коммитом. Чище history, легче rollback.

**(b) — Один большой коммит:** «feat(tg): switch from webhook to long-polling + commit accumulated prod state». Я в commit-message явно перечислю всё, что попало (S3/MON-001/FEAT-024/polling). Авторство всё равно потеряется, но видно из сообщения. Быстрее, грязнее.

**(c) — Только прод, без git-push в garden-auth:** я меняю файл на проде (через scp), restart, smoke. В `olgaskrebeyko/garden-auth` ничего не пушу — origin/main остаётся в текущем drift'е. Решит проблему «накопленного state» отдельным заходом потом. Худший вариант для дисциплины, но изолирует мою сессию.

В `garden`-репо коммит всё равно делаю — `_session/_70` + `_71` (+ `_72_applied` после).

---

## Diff в `/opt/garden-auth/server.js`

### Hunk 1 — добавить `httpsGetJson` после строки 167 (после `httpsPostJson`)

```diff
   req.write(body);
   req.end();
 });

+// IPv4-only GET (тот же обход happy-eyeballs, что и httpsPostJson).
+// Используется в pollTgUpdates ниже для getUpdates с long-polling timeout.
+const httpsGetJson = (urlStr, timeoutMs = 30000) => new Promise((resolve) => {
+  let url;
+  try { url = new URL(urlStr); } catch (e) { return resolve({ ok: false, status: 0, text: String(e?.message || e) }); }
+  const req = https.request({
+    hostname: url.hostname,
+    port: url.port || 443,
+    path: url.pathname + url.search,
+    method: 'GET',
+    family: 4,
+    timeout: timeoutMs,
+  }, (res) => {
+    let chunks = '';
+    res.setEncoding('utf8');
+    res.on('data', (c) => { chunks += c; });
+    res.on('end', () => {
+      try {
+        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: JSON.parse(chunks), text: chunks });
+      } catch (e) {
+        resolve({ ok: false, status: res.statusCode, text: chunks });
+      }
+    });
+  });
+  req.on('error', (e) => resolve({ ok: false, status: 0, text: String(e?.message || e) }));
+  req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, text: 'timeout' }); });
+  req.end();
+});
+
 setInterval(() => {
```

Отличия от шаблона стратега в _70:
- `timeoutMs = 30000` (long-polling до 25с + запас) вместо дефолта.
- Все ошибки → `resolve({ok:false, ...})`, ни одного `reject` (poll-loop не должен ломаться на одной сбойной итерации).

### Hunk 2 — заменить webhook-handler на pure-функцию `processTgUpdate`

Строки **359–474** (`app.post('/api/tg-bot/webhook/:secret', ...) { ... });`) полностью удаляются и заменяются на pure-функцию `processTgUpdate(update)` без HTTP-обёртки:

```diff
-app.post('/api/tg-bot/webhook/:secret', async (req, res) => {
-  // 1. Проверка секретного path в URL (если бот не настроен — 404 без шума).
-  if (!TG_NOTIF_WEBHOOK_PATH || req.params.secret !== TG_NOTIF_WEBHOOK_PATH) {
-    return res.status(404).end();
-  }
-  // 2. Опциональная проверка X-Telegram-Bot-Api-Secret-Token (если включали при setWebhook).
-  if (TG_NOTIF_WEBHOOK_SECRET) {
-    const got = req.headers['x-telegram-bot-api-secret-token'];
-    if (got !== TG_NOTIF_WEBHOOK_SECRET) return res.status(403).end();
-  }
-
-  // ACK сразу — TG retry'ит при non-200 в течение 60с, нам это не нужно.
-  res.status(200).end();
-
-  // Дальше — асинхронная обработка update'а. Если упадёт — лог, не retry.
-  try {
-    const update = req.body || {};
-    const msg = update.message;
-    if (!msg || !msg.from || typeof msg.text !== 'string') return;
-    // ... [весь существующий парсинг /start + tg_link_codes привязка + sendTgNotification] ...
-  } catch (e) {
-    logClientError({
-      ts: new Date().toISOString(),
-      level: 'tg-webhook-handler-error',
-      error: String(e?.message || e),
-    });
-  }
-});
+// FEAT-024 / TG-WEBHOOK-INBOUND-BLOCKED (2026-05-19) — переключение на
+// long-polling. Webhook handler заменён на pure-функцию, которая зовётся из
+// pollTgUpdates ниже. Логика парсинга /start + LINK-кода + привязки в
+// profiles + confirm-message сохранена 1:1 из старого handler'а.
+// См. docs/_session/2026-05-19_70_strategist_tg_webhook_to_polling.md
+const processTgUpdate = async (update) => {
+  try {
+    const msg = update?.message;
+    if (!msg || !msg.from || typeof msg.text !== 'string') return;
+
+    const tgUserId = msg.from.id;
+    const text = msg.text.trim();
+
+    // [тело существующего handler'а строки 382-465 без изменений — парсинг /start,
+    //  поиск кода в tg_link_codes, проверки consumed/expires, Q7 dup-check,
+    //  транзакционная привязка profiles + tg_link_codes, confirm-message]
+  } catch (e) {
+    logClientError({
+      ts: new Date().toISOString(),
+      level: 'tg-update-handler-error',
+      error: String(e?.message || e),
+    });
+  }
+};
```

Тело внутри (после `const text = msg.text.trim();` до confirm-message) — **1:1 копия из старого webhook handler** строк 382–465. Только удаляются: первые два `if` про secret-path/header (для polling не нужно — TG аутентифицирует через bot-token в URL `getUpdates`) + `res.status(200).end()` (нет HTTP-response). `level` для logClientError переименован `tg-webhook-handler-error` → `tg-update-handler-error` (точнее отражает источник).

### Hunk 3 — добавить polling-loop после строки 836

```diff
 setInterval(() => {
   processTgQueueBatch().catch((e) => console.error('[tg-queue] unhandled', e));
 }, TG_QUEUE_INTERVAL_MS).unref();

+// FEAT-024 / TG-WEBHOOK-INBOUND-BLOCKED (2026-05-19) — long-polling вместо
+// webhook. TG-провайдерская блокировка inbound на 5.129.251.56:443 (Timeweb,
+// требования РКН по IP-ranges Telegram). Outbound к api.telegram.org работает
+// через IPv4-only (см. 2026-05-10 lesson).
+let tgPollOffset = 0;
+const TG_POLL_INTERVAL_MS = 2000;
+const TG_POLL_TIMEOUT_S = 25; // long-poll: TG держит запрос до 25с, экономит трафик
+
+const pollTgUpdates = async () => {
+  if (!TG_NOTIF_API_BASE) return; // бот не настроен — silent skip
+  try {
+    const url = `${TG_NOTIF_API_BASE}/getUpdates?offset=${tgPollOffset}&limit=100&timeout=${TG_POLL_TIMEOUT_S}&allowed_updates=${encodeURIComponent('["message"]')}`;
+    const res = await httpsGetJson(url, (TG_POLL_TIMEOUT_S + 5) * 1000);
+    if (!res.ok || !res.data || !Array.isArray(res.data.result)) {
+      // 409 Conflict значит включён webhook (или другой instance polling'ит) —
+      // громкий лог, пусть оператор заметит.
+      if (res.status === 409) {
+        console.error('[tg-poll] 409 Conflict — webhook still active OR multiple pollers', res.text?.slice(0, 200));
+      } else {
+        console.error('[tg-poll] unexpected response', res.status, res.text?.slice(0, 200));
+      }
+      return;
+    }
+    const updates = res.data.result;
+    if (updates.length === 0) return;
+
+    for (const update of updates) {
+      try {
+        await processTgUpdate(update);
+      } catch (e) {
+        console.error('[tg-poll] handler error for update_id=' + update.update_id, e);
+      }
+      tgPollOffset = update.update_id + 1;
+    }
+  } catch (e) {
+    console.error('[tg-poll] unhandled', e);
+  }
+};
+
+if (TG_NOTIF_API_BASE) {
+  setTimeout(pollTgUpdates, 1000);
+  setInterval(pollTgUpdates, TG_POLL_INTERVAL_MS).unref();
+}
+
 app.listen(PORT || 3001, () => {
```

Отличия от шаблона стратега в _70:
- `if (!TG_NOTIF_API_BASE)` guard вокруг setTimeout/setInterval — не запускаем polling если бот не настроен (dev-instance без token'а).
- `.unref()` на setInterval — как у `processTgQueueBatch`, не блокирует graceful shutdown.
- `encodeURIComponent('["message"]')` — без него `[` и `]` в URL могут дать 400.
- Явная ветка для **409 Conflict** в логе — если стратег забыл deleteWebhook ИЛИ запущено два instance, мы это сразу увидим, не молча.
- `timeoutMs` httpsGetJson = `(TG_POLL_TIMEOUT_S + 5) * 1000 = 30s` — клиентский timeout с запасом над TG long-poll.

---

## Apply plan (после 🟢)

1. **`deleteWebhook`** через curl (Step 1 _70). Ожидаемое `{"ok":true,"result":true}`.
2. **Edit `/tmp/garden-auth-server.js`** локально (3 hunks выше) → `scp` на прод в `/opt/garden-auth/server.js`. До restart файл лежит и не активен.
3. **`systemctl restart garden-auth`** + `journalctl -u garden-auth -n 20 --no-pager` — ожидаем log без error'ов, опционально первый `[tg-poll]` если ничего нового.
4. **Smoke** — Ольга или я (тестовый акк) пишем боту `@garden_pvl_bot` (или фактический username `TG_NOTIFICATIONS_BOT_USERNAME`):
   - `/start` → ответ «Здравствуйте! Чтобы подписаться...».
   - `/start LINK-INVALID` → «Код не найден. Сгенерируйте новый...».
5. **Verify** через `getWebhookInfo` → `"url":""` подтверждает polling-mode.
6. **Коммиты:**
   - В `garden` репо (этот): `_session/_70` + `_71` + `_72_applied` — стандартное.
   - В `olgaskrebeyko/garden-auth` репо — **в зависимости от твоего ответа на ⚠️ выше**.

---

## Открытые вопросы

1. **Как коммитим в garden-auth (a/b/c)?** См. ⚠️ Концерн.
2. **deleteWebhook drop_pending_updates=true** — теряет накопленные updates с момента последнего успешного webhook'а (2026-05-18 16:55 UTC по getWebhookInfo). Никто их не видел (TG inbound блокирован) → терять нечего. Принимаю `true`.
3. **dangling env-vars `TG_NOTIF_WEBHOOK_PATH/SECRET`** — оставляю как mёртвый код (env-set не сломает). Если хочешь сразу почистить — скажи, поправлю.
4. **Latency 2s polling-интервала** — приемлемо для LINK-привязки. Если жалобы — снизим до 1s или 0.5s.
5. **Single-instance assumption** — пока garden-auth запускается один раз через systemd, безопасно. Если когда-нибудь scale-up — polling даст 409, и мой явный лог это покажет.

Жду 🟢 + ответ на (1).
