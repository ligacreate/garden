# Урок: подпись Prodamus webhook'ов — header `Sign` + recursive ksort + JSON HMAC-SHA256

**Дата:** 2026-05-16
**Контекст:** FEAT-015 Phase C5. Sandbox-event'ы из Prodamus dashboard падали с 403 Invalid signature.

## Симптом

После активации webhook (Phase C4) три попытки прогнать sandbox из Prodamus dashboard вернули 403:

```sql
SELECT id, event_name, signature_valid, error_text FROM billing_webhook_logs;
 id | event_name      | sig_valid | error_text
----+-----------------+-----------+-------------------
  3 | unknown         | f         | Invalid signature
  4 | payment_success | f         | Invalid signature
  8 | payment_success | f         | Invalid signature
```

`payload_json` сохранялся (JSON-форма sandbox-payload'а — корректная), но HMAC-сверка не проходила. В `verifyProdamusSignature` уже было 5 кандидат-хэшей (HMAC-SHA256 по rawJson, по `k:v;k:v;` sortedBase, +sha256/md5/sha1 по конкатенации с secret). Ни один не совпадал с тем что присылал Prodamus.

## Корневая причина

**Два независимых дефекта в нашем коде:**

1. **Подпись приходит в HTTP-заголовке `Sign`, не в теле.** Наш `verifyProdamusSignature(flatBody, secret)` искал `signature/sign/hash` исключительно в `flatBody`. Sandbox-event приходил с пустым `signature` в теле и заполненным заголовком `Sign: <64 hex>`. Без подписи в теле — `verify` сразу возвращал `false`. Закрыто `BUG-PRODAMUS-SIGNATURE-HEADER` (commit 7dcab90, helper `pickSignatureSource(body, headers)` мостит header→body).

2. **Алгоритм Prodamus — recursive ksort + json_encode + HMAC-SHA256, не `k:v;k:v;`.** Из официальной [PHP-библиотеки Prodamus](https://github.com/Prodamus/payform-api-php):
   ```php
   public static function create(array $data, string $secretKey, string $algo = 'sha256'): string {
       self::ksortRecursive($data);
       return hash_hmac($algo, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $secretKey);
   }
   ```
   То есть: рекурсивно отсортировать ключи на ВСЕХ уровнях вложенности (включая внутри `products[0]`) → `json_encode` без эскейпа unicode и `/` → HMAC-SHA256 по результату. Наш `buildSortedBase` плоско сортировал верхний уровень и склеивал в строку `"k:v;k:v;"` — другая строка, другой хэш. Закрыто `BUG-PRODAMUS-SIGNATURE-ALGO` (commit eb2d67a + revert debug 464779d, helper `buildProdamusCanonical(body)`).

## Почему так получилось

- **Документация Prodamus оперирует терминами и примерами на PHP без явного спека HTTP-API.** Мы скопировали 5 кандидатов-хэшей из примеров других вебхук-провайдеров (где встречается `md5(sortedBase + secret)` и т.п.), не сверяя с реальной PHP-функцией Prodamus.
- **Тестовый payload содержит вложенный массив `products[]`.** Если бы payload был плоским, наш `JSON.stringify(flatBody)` (один из старых кандидатов) случайно сошёлся бы с canonical-формой Prodamus — Postgres-стиль ключей в порядке вставки совпал бы с алфавитом, и баг бы не вылез. Вложенность вскрыла дефект.
- **Header `Sign` для подписи** — конвенция Prodamus, в общих гайдах по webhook'ам обычно `X-Signature` или `X-Hub-Signature`. Наш чек-лист «получи payload + посмотри headers Express» был на этапе recon, но recon делался по коду существующего push-server, а не по реальному выхлопу Prodamus.
- **Sandbox-event Prodamus НЕ приходил в recon-фазе** (Phase C0/C1/C2), потому что мы боялись активировать webhook ДО проверки кода. Получился классический catch-22: код не проверяется на реальном payload'е, потому что мы не знаем что код корректный.

## Как починили

| Слой | Изменение |
|---|---|
| `push-server/prodamusVerify.mjs` | `pickSignatureSource(body, headers)` — bridge header→body для signature; `buildProdamusCanonical(body)` — recursive ksort + `JSON.stringify` (JS-дефолт = PHP `JSON_UNESCAPED_UNICODE \| JSON_UNESCAPED_SLASHES`). Новый кандидат `HMAC-SHA256(canonical, secret)` идёт **первым**. |
| `push-server/server.mjs` | `handleProdamusWebhook` использует `pickSignatureSource(payload, req.headers)` перед `verifyProdamusSignature`. Старые 5 кандидатов оставлены как fallback. |
| Тесты `prodamusVerify.test.mjs` | 11 тестов: pickSignatureSource × 5, e2e header→verify × 2, canonical × 2, sandbox-payload e2e × 2. |

**Ключевая совместимость JS↔PHP:** `JSON.stringify({a:'тест', b:'a/b'})` в Node по умолчанию даёт `'{"a":"тест","b":"a/b"}'` — без `\u0...` для кириллицы и без `\/` для слэшей. Это совпадает с PHP `json_encode(..., JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)`. **Ничего не нужно делать руками** — Node уже делает «правильно по умолчанию», PHP делает «правильно по флагу».

**Сортировка ключей:** в JS-объектах порядок property — порядок вставки (для строковых ключей). Я строю отсортированный объект через `Object.keys(value).sort().forEach(...)`, потом `JSON.stringify` сохраняет вставочный порядок. Для массивов рекурсивно мап'аю — массивы НЕ сортируются по индексу (Prodamus тоже их не трогает — они уже упорядочены).

## Что проверить в будущем

- **Когда подключаешь нового webhook-провайдера** — найди их официальную клиентскую либу (PHP/Python/Node) и **скопируй алгоритм подписи 1:1**, не пытайся реверсить из примеров payload'а. Если либы нет — попроси их service desk прислать алгоритм или sample-код подписи.
- **Если подпись приходит в HTTP-header** — все известные мне провайдеры используют один из: `Sign`, `Signature`, `X-Signature`, `X-Hub-Signature`, `X-Signature-256`. Express нормализует в lower-case, проверяй по lower-case.
- **При recon webhook-фичи** — в первой же фазе попроси sandbox-event с **реальным телом и реальным заголовком**. Если провайдер требует активировать webhook в dashboard — активируй на dummy-endpoint (например, requestbin) **до** того как писать verify-логику.
- **Расширяй существующий список кандидатов, а не заменяй.** Новый кандидат `HMAC-SHA256(canonical)` идёт первым, старые 5 остались как fallback. Если Prodamus однажды переключится на другой алгоритм — старые перехватят.
- **JSON canonical ↔ PHP json_encode** — флаги `JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES` критичны для совпадения с JS-дефолтом. Если PHP-сторона использует **другие** флаги (например, `JSON_PRETTY_PRINT` или escape unicode), JS-сторона должна явно к ним привести строку. У Prodamus — без `JSON_PRETTY_PRINT`, без escape — совпадает с JS-дефолтом.

## Связанные уроки

- [`2026-05-16-partial-unique-index-on-conflict.md`](2026-05-16-partial-unique-index-on-conflict.md) — параллельный баг в той же сессии, обнаружили на повторе sandbox-приёма.
- [`2026-05-16-push-server-silent-crash-observability.md`](2026-05-16-push-server-silent-crash-observability.md) — почему 5 дней крашей в reconcile никто не заметил.

## Источник

- [github.com/Prodamus/payform-api-php](https://github.com/Prodamus/payform-api-php) — официальная либа, `Hmac::create()` + `Hmac::ksortRecursive()`.
- Стратегова диагностика в [docs/_session/2026-05-16_12_strategist_prodamus_algo_fix.md](../_session/2026-05-16_12_strategist_prodamus_algo_fix.md).
