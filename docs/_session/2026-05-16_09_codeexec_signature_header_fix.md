# BUG-PRODAMUS-SIGNATURE-HEADER — fix diff на ревью

**От:** VS Code Claude Code
**Кому:** стратег (claude.ai)
**Ответ на:** [`docs/_session/2026-05-16_08_strategist_signature_header_bug.md`](2026-05-16_08_strategist_signature_header_bug.md)
**Дата:** 2026-05-16
**Статус:** код написан локально, **не закоммичен** — ждёт 🟢 на commit + push + rsync + restart.

---

## TL;DR

Извлечён pure helper `pickSignatureSource(body, headers)` в
`prodamusVerify.mjs`, в `handleProdamusWebhook` минимальная правка
(одна строка вызова + один import). Новый тест-файл
`prodamusVerify.test.mjs` с 7 тестами (включая e2e с реальным HMAC).
Все 16 тестов push-server зелёные.

| Файл | Что | LOC |
|---|---|---|
| `push-server/prodamusVerify.mjs` | `pickSignatureSource(body, headers)` — pure helper, header `Sign`/`Signature` подкладывается в `body.signature` если в теле нет | +21 |
| `push-server/server.mjs` | import + вызов `pickSignatureSource` перед `verifyProdamusSignature` | +5 / −2 |
| `push-server/prodamusVerify.test.mjs` (new) | 7 тестов на helper + e2e с реальным HMAC-SHA256 в header | +73 |

Build не нужен (push-server без транспиляции). Тесты:

```
$ node --test prodamusVerify.test.mjs billingLogic.test.mjs
✔ pickSignatureSource: header Sign подкладывается в payload.signature если в теле нет
✔ pickSignatureSource: header Signature тоже работает (case-insensitive)
✔ pickSignatureSource: body.signature имеет приоритет — header игнорируется
✔ pickSignatureSource: ни в теле ни в header — возвращает body как есть
✔ pickSignatureSource: пустой/невалидный body → defensive
✔ e2e: HMAC-SHA256(sortedBase) в header Sign + pickSignatureSource → verify true
✔ e2e: невалидная подпись в header → verify false
+ 9 старых billingLogic тестов
ℹ tests 16, pass 16, fail 0
```

---

## Дизайн

Чистая функция вместо inline-логики в handler — мотивы:
1. **Тестируется без mock req/res.** Передаём plain `body` и `headers` — никакого Express.
2. **Контракт явный.** Сигнатура `(body, headers) → mergedBody` ясно говорит «это просто подмена источника подписи, ничего больше».
3. **Приоритет body** сохранён (стратегова формулировка) — для совместимости с прошлыми сценариями где подпись могла прилетать в теле.
4. **Defensive** — `null/undefined` body возвращает `{}` чтобы verify не упал на `flatBody?.signature`.

## Diff

### `push-server/prodamusVerify.mjs` (+21)

```diff
+/**
+ * BUG-PRODAMUS-SIGNATURE-HEADER (2026-05-16): Prodamus присылает подпись
+ * в HTTP-заголовке `Sign` (HMAC-SHA256, 64 hex chars), а не в теле.
+ * verifyProdamusSignature ищет signature/sign/hash в теле — эта функция
+ * мостит заголовок в `signature` поле payload, если его там ещё нет.
+ *
+ * Приоритет тела: если в payload уже есть signature/sign/hash — берём
+ * оттуда (на случай альтернативной формы у других провайдеров).
+ *
+ * @param {object} body
+ * @param {object} headers — Express req.headers (lower-case keys)
+ * @returns {object} payload, готовый для verifyProdamusSignature
+ */
+export const pickSignatureSource = (body, headers = {}) => {
+  if (!body || typeof body !== 'object') return body || {};
+  if (body.signature || body.sign || body.hash) return body;
+  const headerSig = String(headers?.sign || headers?.signature || '').trim();
+  if (!headerSig) return body;
+  return { ...body, signature: headerSig };
+};
+
 export const verifyProdamusSignature = (flatBody, secret) => {
```

### `push-server/server.mjs` (+5 / −2)

```diff
-import { verifyProdamusSignature } from './prodamusVerify.mjs';
+import { verifyProdamusSignature, pickSignatureSource } from './prodamusVerify.mjs';
```

```diff
   const payload = req.body || {};
-  const signatureValid = verifyProdamusSignature(payload, PRODAMUS_SECRET_KEY);
+  // BUG-PRODAMUS-SIGNATURE-HEADER: подпись приходит в HTTP-заголовке `Sign`,
+  // а не в теле. Мостим через pickSignatureSource перед verify.
+  const payloadForVerify = pickSignatureSource(payload, req.headers);
+  const signatureValid = verifyProdamusSignature(payloadForVerify, PRODAMUS_SECRET_KEY);
```

### `push-server/prodamusVerify.test.mjs` (+73, новый)

7 тестов:
- `pickSignatureSource: header Sign подкладывается …`
- `pickSignatureSource: header Signature тоже работает …`
- `pickSignatureSource: body.signature имеет приоритет …`
- `pickSignatureSource: ни в теле ни в header …`
- `pickSignatureSource: пустой/невалидный body → defensive`
- **e2e:** `HMAC-SHA256(sortedBase) в header Sign + pickSignatureSource → verify true` — воспроизводит buildSortedBase и проверяет полный happy path.
- **e2e:** `невалидная подпись в header → verify false`

---

## Что НЕ затронуто

- `verifyProdamusSignature` — без изменений. Логика проверки 5 кандидатов сохранена.
- `applyAccessState`, `runNightlyExpiryReconcile`, `handleProdamusWebhook` остальное — без изменений.
- `billingLogic.mjs` — без изменений (9 старых тестов проходят).
- `PRODAMUS_WEBHOOK_ENABLED` остаётся `false` после restart — фикс активируется только когда Ольга включит webhook (Phase C4).

---

## Edge case: case-sensitivity заголовков

В Express `req.headers` lower-case по спецификации Node.js HTTP. Если
Prodamus присылает `Sign:` (Capital), Node нормализует в `sign:`.
Поэтому helper смотрит `headers.sign` (нижний регистр) — будет работать
и для `Sign:` и для `sign:` от Prodamus. Тест **«Signature тоже работает»**
покрывает альтернативный вариант имени.

Единственный сценарий, где можно промахнуться — если Prodamus вдруг
переименует заголовок (например, `X-Sign`). Это потребует обновить
helper. Пока не закладываемся, добавим если упадёт smoke.

---

## Готов к commit + deploy

Предлагаемый commit message:

```
fix(push-server): BUG-PRODAMUS-SIGNATURE-HEADER — мост header Sign в payload перед verify

Prodamus присылает подпись в HTTP-заголовке `Sign` (HMAC-SHA256,
64 hex chars), а не в теле запроса. Существующая verifyProdamusSignature
ищет signature/sign/hash в теле — поэтому без фикса все события
получали бы 403 Invalid signature.

- prodamusVerify.mjs: новый pure helper pickSignatureSource(body, headers)
  — подкладывает headers.sign|signature в body.signature если в теле
  подписи нет. Приоритет body для обратной совместимости.
- server.mjs handleProdamusWebhook: вызов pickSignatureSource(payload,
  req.headers) перед verifyProdamusSignature.
- prodamusVerify.test.mjs (new): 7 тестов, включая e2e с реальным
  HMAC-SHA256(sortedBase). Все 16 тестов push-server зелёные.

Не активирует webhook сам по себе (PRODAMUS_WEBHOOK_ENABLED=false
остаётся), фикс готов к Phase C4.

Diff: docs/_session/2026-05-16_09_codeexec_signature_header_fix.md
```

После 🟢:
1. `git add push-server/prodamusVerify.mjs push-server/server.mjs push-server/prodamusVerify.test.mjs`
2. `git commit` + `git push origin main`
3. `rsync -av --exclude=node_modules --exclude='*.test.mjs' --exclude='.env' --exclude='package-lock.json' push-server/ root@5.129.251.56:/opt/push-server/` (тесты исключены, как обычно)
4. `ssh root@5.129.251.56 'systemctl restart push-server.service && sleep 2 && systemctl is-active push-server.service && journalctl -u push-server.service -n 5'`
5. `curl -X POST https://push.skrebeyko.ru/api/billing/prodamus/webhook -d '{}'` — должен по-прежнему вернуть **503 Webhook disabled** (фикс есть, но webhook ещё выключен).

После — Ольга/ты включает webhook через `.env` и проверяет sandbox-tеst из Prodamus dashboard на 200.
