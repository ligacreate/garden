# BUG-PRODAMUS-SIGNATURE-HEADER — фикс до активации webhook

**От:** стратег (claude.ai)
**Кому:** VS Code Claude Code
**Срочность:** блокер Phase C4 (включения webhook).

---

## Контекст

Ольга через Claude in Chrome настроила webhook в Prodamus
dashboard, прогнала sandbox-тест → push-server ответил 503
(webhook disabled, ожидаемо). Параллельно Claude in Chrome
заметил формат подписи:

> В заголовке запроса приходит `Sign: <hex_hash>`. Судя по тому,
> что это 64-символьный hex, это HMAC-SHA256. Заголовок называется
> `Sign` (не `X-Signature`). Тело запроса — form-encoded (PHP-style
> array, `application/x-www-form-urlencoded`).

## Баг в коде

`push-server/server.mjs:354`:

```javascript
const payload = req.body || {};
const signatureValid = verifyProdamusSignature(payload, PRODAMUS_SECRET_KEY);
```

`push-server/prodamusVerify.mjs:18`:

```javascript
const signature = String(flatBody?.signature || flatBody?.sign || flatBody?.hash || '').trim();
```

Код ищет подпись внутри **тела** payload (`signature/sign/hash`).
Реальный Prodamus присылает её в **HTTP-заголовке `Sign`**, не в
теле. Поэтому `verifyProdamusSignature()` всегда вернёт `false` →
все события будут получать 403 Invalid signature.

## Фикс

В `server.mjs handleProdamusWebhook` извлечь заголовок и
прокинуть в payload перед вызовом verify:

```javascript
const handleProdamusWebhook = async (req, res) => {
  if (!webhookEnabled) return res.status(503).json({ error: 'Webhook disabled' });
  if (!PRODAMUS_SECRET_KEY) return res.status(500).json({ error: 'PRODAMUS_SECRET_KEY is not set' });
  // ... IP guard ...

  const payload = req.body || {};

  // Prodamus присылает подпись в HTTP-заголовке Sign (HMAC-SHA256, 64 hex chars).
  // verifyProdamusSignature ищет signature/sign/hash в теле — для совместимости
  // мерджим заголовок в payload если в теле подписи нет.
  const headerSignature = String(
    req.headers.sign || req.headers.signature || ''
  ).trim();
  const payloadForVerify = (!payload.signature && !payload.sign && !payload.hash && headerSignature)
    ? { ...payload, signature: headerSignature }
    : payload;

  const signatureValid = verifyProdamusSignature(payloadForVerify, PRODAMUS_SECRET_KEY);
  // ... остальное без изменений ...
};
```

Логика: если в теле есть `signature`/`sign`/`hash` — берём оттуда
(обратная совместимость с прошлой формой). Если в теле нет, но
есть в заголовке — подставляем из заголовка. Если и там и там
есть — приоритет у тела (на случай нестандартных провайдеров).

## Тесты

В `billingLogic.test.mjs` или новом `prodamusVerify.test.mjs`
добавить кейс:
- payload без `signature` поля
- header `Sign` с валидным HMAC-SHA256 над `sortedBase` или `rawJson`
- ожидание: verify возвращает `true`

## Что нужно сделать

1. **Diff на ревью** — изменения в `server.mjs` + новый тест.
2. После 🟢 — коммит, push, rsync на push.skrebeyko.ru, restart.
3. **Не включать webhook** (PRODAMUS_WEBHOOK_ENABLED) до фикса.

Дальше: Ольга сохранит secret в файл, я перекину в `/opt/push-server/.env`,
поставим `PRODAMUS_WEBHOOK_ENABLED=true`, restart, Ольга прогонит
sandbox-тест из Prodamus dashboard → ожидаем `200 OK`.

---

## Дополнительные сведения из Prodamus dashboard (от Claude in Chrome)

- **Установленные webhook URL:** Tilda + TargetHunter (старые) +
  наш `push.skrebeyko.ru/api/billing/prodamus/webhook` (третий).
- **Sandbox-тест:** есть кнопка ↺ рядом с каждым URL, открывает
  тестировщик. События в тестировщике:
  - `payment_success` — Успешная оплата
  - `installment_success` / `_approved` / `_canceled` / `_denied`
- **События подписок** (`auto_payment`, `deactivation`, `finish`)
  отправляются на тот же URL **при реальных событиях**,
  отдельных кнопок в тестировщике для них нет. Фильтруются по
  полю `sys` и/или `payment_status` в теле.
- **IP whitelist:** в dashboard нет, можно уточнить у
  support@prodamus.ru если нужно. Пока без whitelist.
- **Тело запроса:** form-encoded (`application/x-www-form-urlencoded`).
- **Парсинг тела в push-server:** `express.urlencoded({ extended: true })`
  уже подключён (server.mjs:44), это OK — PHP-style массивы
  Prodamus в `extended: true` парсятся в nested объекты.

## Phase C6 (Admin UI)

Помни, что параллельно Phase C6 (Admin UI для `auto_pause_exempt`)
независима от Phase C4 webhook activation. Можешь продолжать её
делать пока Ольга сохраняет секрет в файл.
