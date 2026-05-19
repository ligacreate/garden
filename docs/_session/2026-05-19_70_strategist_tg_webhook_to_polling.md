# TG-WEBHOOK-INBOUND-BLOCKED — переключение с webhook на long-polling

**От:** стратег (claude.ai)
**Кому:** VS Code Claude Code
**Дата:** 2026-05-19
**Тип:** P2 → P1 (бизнес-блокер для новых TG-привязок)
**Аффект:** все новые попытки привязать TG не работают. Вероника пожаловалась вчера. Любой новый юзер курса не сможет привязаться → не получит push о ДЗ.

---

## Root cause (recon стратега)

TG `getWebhookInfo` показал:
```
url: https://auth.skrebeyko.ru/api/tg-bot/webhook/<secret>
last_error_message: "Connection timed out"
last_error_date: 2026-05-18 16:55:25 UTC
ip_address: 5.129.251.56
```

TG не может достучаться до нашего сервера на :443. DNS резолвит правильно (5.129.251.56), Caddy слушает :443 ✓, ufw inactive, iptables empty. Тестовый curl на endpoint извне (с MacBook стратега) проходит → endpoint доступен с обычного интернета.

**Гипотеза:** Timeweb провайдерская network блокирует inbound traffic от Telegram IP-ranges (выполнение требований РКН). Это **не настраивается** на нашей стороне.

Outbound к api.telegram.org работает (мы шлём push'и через worker, новые регистрации alerts через monitor-bot) — это разные direction.

---

## Fix — переключаемся на long-polling

`getUpdates` (polling) с offset вместо webhook (push). TG inbound нам не нужен, мы сами идём за updates каждые ~2-3 секунды.

Trade-offs:
- ✅ Закрывает корень (TG inbound не нужен)
- ✅ Не требует TLS / open inbound port
- ✅ Стандартный pattern для Telegram bots
- ⚠️ Worker должен poll непрерывно, добавляет ~30 outbound HTTPS req/min — копейки
- ⚠️ Latency ~2-3 сек на response (юзер набрал команду → ответ) — приемлемо для LINK-привязки

---

## План apply

### Step 1 — deleteWebhook (одна curl команда)

```bash
ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a &&
  curl -fsS "https://api.telegram.org/bot$TG_NOTIFICATIONS_BOT_TOKEN/deleteWebhook?drop_pending_updates=true"'
```

Ожидаемый ответ: `{"ok":true,"result":true,"description":"Webhook was deleted"}`.

После этого `getUpdates` начнёт работать. Webhook больше не зарегистрирован.

### Step 2 — refactor `server.js`

В `/opt/garden-auth/server.js` (~32KB):

**Удалить:**
- `app.post('/api/tg-bot/webhook/:secret', ...)` handler — ~70 строк начиная с line 358

**Добавить** (после `processTgQueueBatch` setInterval ~line 834):

```javascript
// FEAT-024 / TG-WEBHOOK-INBOUND-BLOCKED — long-polling вместо webhook.
// TG-провайдерская блокировка inbound на нашу IP, переключились 2026-05-19.
// Документация: docs/_session/_70_strategist_tg_webhook_to_polling.md

let tgPollOffset = 0;
const TG_POLL_INTERVAL_MS = 2000;
const TG_POLL_TIMEOUT_S = 25; // long-polling — TG держит запрос до 25с пока есть updates

const pollTgUpdates = async () => {
  if (!TG_NOTIF_API_BASE) return; // бот не настроен — silent skip
  try {
    const url = `${TG_NOTIF_API_BASE}/getUpdates?offset=${tgPollOffset}&limit=100&timeout=${TG_POLL_TIMEOUT_S}&allowed_updates=["message"]`;
    const res = await httpsGetJson(url).catch((e) => ({ ok: false, status: 0, text: String(e?.message || e) }));
    if (!res.ok || !res.data || !res.data.result) {
      console.error('[tg-poll] unexpected response', res.status, res.text?.slice(0, 200));
      return;
    }
    const updates = res.data.result;
    if (updates.length === 0) return;

    // Обработать каждый update тем же handler-кодом, что был в webhook-route.
    for (const update of updates) {
      try {
        await processTgUpdate(update); // см. ниже — выносим из webhook handler'а в отдельную функцию
      } catch (e) {
        console.error('[tg-poll] handler error for update_id=' + update.update_id, e);
      }
      // Обновляем offset до next-after этого update'а
      tgPollOffset = update.update_id + 1;
    }
  } catch (e) {
    console.error('[tg-poll] unhandled', e);
  }
};

// Запускаем сразу, потом по интервалу
setTimeout(pollTgUpdates, 1000);
setInterval(pollTgUpdates, TG_POLL_INTERVAL_MS);
```

**Выделить** message-processing logic из webhook handler в отдельную функцию `processTgUpdate(update)`:
- Логика была в webhook-route ~lines 358-430: парсинг `/start`, парсинг `LINK-XXXXXX`, привязка через `tg_link_codes`, ответ боту через `sendTgNotification`. Переиспользуем эту функцию из polling-loop.

**Если `httpsGetJson` отсутствует** в server.js — добавить рядом с `httpsPostJson`. Стандартный wrapper:

```javascript
const httpsGetJson = (url) => new Promise((resolve) => {
  const req = https.request(url, { method: 'GET', family: 4, timeout: 30000 }, (res) => {
    let chunks = '';
    res.on('data', (c) => chunks += c);
    res.on('end', () => {
      try {
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: JSON.parse(chunks), text: chunks });
      } catch (e) {
        resolve({ ok: false, status: res.statusCode, text: chunks });
      }
    });
  });
  req.on('error', (e) => resolve({ ok: false, status: 0, text: String(e?.message || e) }));
  req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, text: 'timeout' }); });
  req.end();
});
```

`family: 4` — IPv4 only, как было в lesson `2026-05-10` про /etc/hosts pin для outbound к Telegram API.

### Step 3 — restart garden-auth

```bash
ssh root@5.129.251.56 'systemctl restart garden-auth && journalctl -u garden-auth -n 5 --no-pager'
```

Ожидаемый log: `Auth server running on port 3001` + первый poll attempt logs.

### Step 4 — smoke

- **Ольга или ты сама с тестового TG-аккаунта** напишите `@garden_pvl_bot` (или используя deep-link с любого нового LINK-кода через профиль Garden):
  - `/start` → бот должен ответить «Здравствуйте! Чтобы подписаться...»
  - Можно сразу `/start LINK-XXXXXX` (с фиктивным кодом) → бот должен ответить «Код не найден или истёк» (или текущая копия в server.js)
- Логи `journalctl -u garden-auth --since "5 minutes ago"` должны показать `[tg-poll]` записи при каждом polling-цикле (или при обработке updates).

### Step 5 — verify

```bash
ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a &&
  curl -fsS "https://api.telegram.org/bot$TG_NOTIFICATIONS_BOT_TOKEN/getWebhookInfo"'
```

Ожидаемое: `"url":""` (webhook не зарегистрирован). Подтверждает polling-mode.

---

## Apply checklist

- [ ] Diff в `_session/_71_codeexec_tg_polling_diff.md` на ревью стратегу.
- [ ] После 🟢 — apply: deleteWebhook → edit server.js → restart garden-auth.
- [ ] Single commit `feat(tg): switch from webhook to long-polling (TG-WEBHOOK-INBOUND-BLOCKED)` + server.js + _session/.
- [ ] Push (concurrency block страхует).
- [ ] Smoke под тестовым аккаунтом.
- [ ] Закрыть тикет в backlog, lesson опционально.

## Открытые вопросы

1. **Если getUpdates тоже timeout'ает** (Telegram outbound тоже блокирован) — мы знаем по lesson `2026-05-10` что **outbound уже работает** (с family:4 + /etc/hosts pin). Так что polling должен работать out-of-the-box.
2. **Multiple instances**: если garden-auth когда-нибудь будет запускаться в multiple instances (load balancer / failover) — polling даст 409 Conflict (как мы видели на live test'е). На текущем setup single-instance — не проблема.
3. **Latency**: 2-3 сек до ответа бота. Допустимо. Если будут жалобы — увеличим polling-частоту до 1 сек.
