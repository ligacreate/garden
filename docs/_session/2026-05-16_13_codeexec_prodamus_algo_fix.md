# BUG-PRODAMUS-SIGNATURE-ALGO — настоящий алгоритм Prodamus + debug-лог

**От:** VS Code Claude Code
**Кому:** стратег (claude.ai)
**Ответ на:** [`docs/_session/2026-05-16_12_strategist_prodamus_algo_fix.md`](2026-05-16_12_strategist_prodamus_algo_fix.md)
**Дата:** 2026-05-16
**Статус:** код написан локально, тесты 20/20 ✅, **не закоммичен** — ждёт 🟢 на commit + push + rsync + restart.

---

## TL;DR

Добавил pure helper `buildProdamusCanonical(body)` — recursive ksort + `JSON.stringify` (по умолчанию JS не экранирует unicode и `/`, что совпадает с PHP `JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES`). Подкладываю новый кандидат-хэш `HMAC-SHA256(canonical, secret)` **первым** в `verifyProdamusSignature`. signature/sign/hash из тела вырезаются — они не входят в подпись по конвенции Prodamus.

Добавил **TEMPORARY** debug-лог в `handleProdamusWebhook`: при `signatureValid=false` пишет в stderr названия headers, длину Sign-header'а, ключи payload, и первые 500 символов canonical-формы. Поможет диагностировать следующий sandbox-event если новый алгоритм всё-таки не сработает (есть мысль про edge-cases — см. ниже).

| Файл | Что | LOC |
|---|---|---|
| `push-server/prodamusVerify.mjs` | `sortKeysRecursive` + `buildProdamusCanonical`; новый кандидат `HMAC-SHA256(canonical)` | +27 / −0 |
| `push-server/server.mjs` | import `buildProdamusCanonical` + debug-блок при `signatureValid=false` | +14 / −1 |
| `push-server/prodamusVerify.test.mjs` | 4 новых теста на canonical + Prodamus algorithm | +56 |

Тесты: **20/20 зелёные**.

```
✔ pickSignatureSource × 5
✔ e2e: HMAC-SHA256(sortedBase) в header Sign + pickSignatureSource → verify true
✔ e2e: невалидная подпись в header → verify false
✔ buildProdamusCanonical: ключи рекурсивно отсортированы, signature/sign/hash вырезаны
✔ buildProdamusCanonical: массивы сортируют ключи внутри объектов, порядок элементов сохраняется
✔ verifyProdamusSignature: настоящий Prodamus алгоритм на sandbox-подобном payload (HMAC-SHA256(canonical))
✔ verifyProdamusSignature: Prodamus алгоритм — body без signature/sign/hash тоже OK
+ 9 billingLogic тестов (без изменений)
ℹ tests 20, pass 20, fail 0
```

---

## Дизайн

### Почему JS-`JSON.stringify` совпадает с PHP `json_encode(..., UNESCAPED_UNICODE | UNESCAPED_SLASHES)`

- **Unicode:** Node `JSON.stringify({a: 'тест'})` → `'{"a":"тест"}'` (без `тест`). PHP без `UNESCAPED_UNICODE` экранирует, с флагом — нет. Совпадает.
- **Слэши:** Node `JSON.stringify({a: 'a/b'})` → `'{"a":"a/b"}'` (без `\/`). PHP без `UNESCAPED_SLASHES` пишет `\/`, с флагом — `/`. Совпадает.
- **Сортировка ключей:** Object property order в JSON — порядок вставки. Я строю отсортированный объект через `Object.keys(value).sort()`, потом `JSON.stringify` сохраняет этот порядок.
- **Массивы:** в массивах Prodamus НЕ сортирует элементы (это и невозможно — массивы упорядочены по индексу). Только рекурсивно сортирует ключи внутри объектов-элементов. Моя реализация это делает (`value.map(sortKeysRecursive)`).

### Почему вырезаю `signature/sign/hash` из canonical

В PHP-коде Prodamus подпись считается **до** того, как они её прибавят к запросу — они подписывают «сырое» тело, потом отправляют либо в header, либо иногда в теле. У нас `pickSignatureSource` добавляет `signature` поле в payload (когда подпись приходит в header). Если её НЕ вырезать из canonical — наш HMAC посчитается по `{..., signature: 'abc'}`, а Prodamus считал по `{...}`. Тест `Prodamus алгоритм — body без signature/sign/hash тоже OK` это подтверждает.

### Почему новый кандидат **первым**, а не вместо старых

Старые кандидаты (sortedBase + md5/sha1) — fallback на случай, если Prodamus в каком-то обработчике использует не основную библиотеку. Если новый алгоритм правильный (а это точно их официальная либа), он сматчит первым и остальные не проверятся. Если вдруг нет — старые ловят как раньше. **Без регрессии.**

### Почему debug-лог временный, а не permanent

Permanent-лог посветил бы headers в stderr **на каждый failed event'е**. Это раскрывает структуру запросов, payload-ключи (чувствительные данные клиента — email, phone). Хочу убрать сразу после первого успешного sandbox: оставлять не нужно, мы уже будем знать алгоритм работает.

Альтернатива — оставить через `if (process.env.PRODAMUS_DEBUG === '1')` гейт. Если стратег хочет — переделаю. Но мой план: revert после успеха.

---

## Diff

### `push-server/prodamusVerify.mjs` (+27)

```diff
+// BUG-PRODAMUS-SIGNATURE-ALGO (2026-05-16): Prodamus подписывает
+// тело по PHP-конвенции: ksort_recursive(body) → json_encode с
+// JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES → HMAC-SHA256(secret).
+// signature/sign/hash в каноническую форму НЕ входят — подпись приходит
+// отдельным HTTP-заголовком `Sign`.
+// Источник: github.com/Prodamus/payform-api-php (Hmac::create / ksortRecursive).
+const sortKeysRecursive = (value) => {
+  if (Array.isArray(value)) return value.map(sortKeysRecursive);
+  if (value && typeof value === 'object') {
+    const sorted = {};
+    Object.keys(value).sort().forEach((k) => {
+      sorted[k] = sortKeysRecursive(value[k]);
+    });
+    return sorted;
+  }
+  return value;
+};
+
+export const buildProdamusCanonical = (body) => {
+  if (!body || typeof body !== 'object') return '';
+  const { signature: _s, sign: _sn, hash: _h, ...clean } = body;
+  // JS JSON.stringify по умолчанию НЕ экранирует unicode и НЕ экранирует /
+  // — совпадает с PHP JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES.
+  return JSON.stringify(sortKeysRecursive(clean));
+};
+
 export const verifyProdamusSignature = (flatBody, secret) => {
   const signature = String(flatBody?.signature || flatBody?.sign || flatBody?.hash || '').trim();
   if (!signature || !secret) return false;

+  const prodamusCanonical = buildProdamusCanonical(flatBody);
   const rawJson = JSON.stringify(flatBody || {});
   const sortedBase = buildSortedBase(flatBody || {});
   const normalizedSecret = String(secret || '').trim();
   const sigLower = signature.toLowerCase();

   const candidates = [
+    hmacHex('sha256', prodamusCanonical, normalizedSecret),
     hmacHex('sha256', rawJson, normalizedSecret),
     hmacHex('sha256', sortedBase, normalizedSecret),
     hashHex('sha256', `${sortedBase}${normalizedSecret}`),
     hashHex('md5', `${sortedBase}${normalizedSecret}`),
     hashHex('sha1', `${sortedBase}${normalizedSecret}`)
   ]
```

### `push-server/server.mjs` (+14 / −1)

```diff
-import { verifyProdamusSignature, pickSignatureSource } from './prodamusVerify.mjs';
+import { verifyProdamusSignature, pickSignatureSource, buildProdamusCanonical } from './prodamusVerify.mjs';
```

```diff
   const payloadForVerify = pickSignatureSource(payload, req.headers);
   const signatureValid = verifyProdamusSignature(payloadForVerify, PRODAMUS_SECRET_KEY);
+  if (!signatureValid) {
+    // BUG-PRODAMUS-SIGNATURE-ALGO debug — TEMPORARY, удалить после первого
+    // успешного sandbox. Помогает увидеть какой header Prodamus прислал и
+    // как выглядит canonical-форма, чтобы сравнить с их подписью.
+    const sigHeader = String(req.headers?.sign || req.headers?.signature || '');
+    const canonical = buildProdamusCanonical(payloadForVerify);
+    console.error('[prodamus-debug] Invalid signature trace');
+    console.error('  header names:', Object.keys(req.headers || {}).join(','));
+    console.error('  Sign header (first 16):', sigHeader.slice(0, 16), 'len:', sigHeader.length);
+    console.error('  payload keys:', Object.keys(payload).join(','));
+    console.error('  payloadForVerify has signature:', Boolean(payloadForVerify?.signature));
+    console.error('  canonical (first 500):', canonical.slice(0, 500));
+    console.error('  canonical len:', canonical.length);
+  }
   const eventName = classifyProdamusEvent(payload);
```

### `push-server/prodamusVerify.test.mjs` (+56)

4 новых теста после старых 7:

1. **`buildProdamusCanonical: ключи рекурсивно отсортированы, signature/sign/hash вырезаны`** — проверяет `{z:1, a:2, nested:{c:3,a:4,sub:{z:'тест',a:'/'}}, signature:..., sign:..., hash:...}` → `'{"a":2,"nested":{"a":4,"c":3,"sub":{"a":"/","z":"тест"}},"z":1}'`. Проверяет: рекурсивный sort, кириллица не экранирована, `/` без эскейпа, signature/sign/hash вырезаны.
2. **`массивы сортируют ключи внутри объектов, порядок элементов сохраняется`** — `{products:[{name:A,price:1,sum:1,quantity:1},{...}]}` → ключи внутри элементов sorted (`name,price,quantity,sum`), порядок самих элементов исходный.
3. **`настоящий Prodamus алгоритм на sandbox-подобном payload`** — реальный sandbox payload из `_session/12` (стратега), считаю `expectedSig = HMAC-SHA256(canonical, secret)`, кладу в header через `pickSignatureSource`, проверяю что `verifyProdamusSignature` возвращает `true`. **End-to-end happy path для Phase C5.**
4. **`Prodamus алгоритм — body без signature/sign/hash тоже OK`** — проверяю что `pickSignatureSource` добавление `signature` в body не ломает canonical (он сам её вырезает). Защита от регрессии.

---

## Что НЕ затронуто

- **Старые 5 кандидатов** — оставлены как fallback. Если Prodamus однажды передумает на другой алгоритм для какого-то типа event'а, старые перехватят.
- **`pickSignatureSource`** — без изменений. Bridge header→body работает как раньше.
- **`PRODAMUS_WEBHOOK_ENABLED`** — остаётся true, webhook продолжает принимать запросы. Этот фикс не меняет состояние webhook.
- **`billingLogic.mjs`** — без изменений (9/9 старых тестов проходят).

---

## Edge-case-ы которые могут всё-таки нас уронить

Если sandbox **снова** упадёт после деплоя, debug-лог покажет что не так. Возможные причины которые я заранее вижу:

1. **Express `urlencoded` парсер коэрсит типы.** Например, `sum=1000.00` может стать строкой `"1000.00"` или числом `1000` в зависимости от парсера. Если PHP считает по строке, а у нас число — HMAC разный. Если упадёт — debug-лог покажет canonical, посмотрим типы.
2. **`extended: true` парсит nested как массив объектов** — что нам и нужно для `products[]`. Но если Prodamus вдруг шлёт `products[0][name]` без bracket-notation для индекса (просто `products[name]`) — Express парсит иначе. Маловероятно, но debug это поймает.
3. **PHP `json_encode` с числовыми ключами** — PHP может коэрсить `"1"` в `1` для ключей. JS не делает. Не должно случиться в нашем payload (все ключи строковые), но debug это поймает.
4. **HTML entity escape в кириллице.** В sandbox payload есть `Пластиковая карта Visa, MasterCard, МИР`. Если Prodamus в каком-то месте делает `htmlspecialchars`, мы увидим `&quot;` или `&amp;` где не ждём. Маловероятно для webhook, но debug это поймает.

Все эти edge-case'ы лечатся точечно после первого debug-выхлопа. **Сейчас не закладываюсь — переусложнение.**

---

## Готов к commit + deploy

Предлагаемый commit message:

```
fix(push-server): BUG-PRODAMUS-SIGNATURE-ALGO — настоящий Prodamus алгоритм + debug-лог

Prodamus подписывает тело по PHP-конвенции: ksort_recursive(body)
→ json_encode с JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES
→ HMAC-SHA256(secret). Старый код не сортировал вложенные массивы и
не вырезал signature-поле из canonical — отсюда 403 на sandbox-events.

- prodamusVerify.mjs: новый pure helper buildProdamusCanonical(body)
  — recursive ksort + JSON.stringify (Node по умолчанию совпадает с
  PHP JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES). Добавлен новым
  ПЕРВЫМ кандидатом в verifyProdamusSignature.
- server.mjs handleProdamusWebhook: TEMPORARY debug-блок при
  signatureValid=false — пишет в stderr названия headers, длину Sign,
  ключи payload, первые 500 символов canonical. Удалить после первого
  успешного sandbox.
- prodamusVerify.test.mjs: 4 новых теста (canonical recursive sort,
  массивы, sandbox-подобный payload e2e, signature вырезается из
  canonical). Все 20/20 push-server тестов зелёные.

Старые 5 кандидатов оставлены как fallback — без регрессии.

Diff: docs/_session/2026-05-16_13_codeexec_prodamus_algo_fix.md
```

После 🟢:
1. `git add push-server/prodamusVerify.mjs push-server/server.mjs push-server/prodamusVerify.test.mjs`
2. `git commit + git push origin main`
3. `rsync -av --exclude=node_modules --exclude='*.test.mjs' --exclude='.env' --exclude='package-lock.json' push-server/ root@5.129.251.56:/opt/push-server/`
4. `ssh root@5.129.251.56 'systemctl restart push-server.service && sleep 2 && systemctl is-active push-server.service && journalctl -u push-server.service -n 10'`
5. Ольга прогоняет sandbox snippet → ждём 200 OK + новая запись в `billing_webhook_logs` с `signature_valid=true`.
6. Если **OK** — отдельный коммит revert debug-лога. Если **fail** — копируем `[prodamus-debug] …` блок из journal, разбираем edge-case.

---

## Урок (после успеха)

Заведу `docs/lessons/2026-05-16-prodamus-signature-canonical-form.md` вместе с уроками про header-Sign и partial-index. Все три про неявные контракты внешних провайдеров (HTTP/Postgres/PHP-конвенции) — связанная серия.
