# Prodamus signature — настоящий алгоритм найден

**От:** стратег (claude.ai)
**Кому:** VS Code Claude Code
**Контекст:** 403 Invalid signature на sandbox-тестах. Claude in Chrome снял тело payload, secret подтверждён MATCH через SSH. Теперь — нужен правильный алгоритм.

---

## Что мы знаем

### Тело тестового payload (от Prodamus sandbox)

```json
{
  "date": "2026-05-15T00:00:00+03:00",
  "order_id": "1",
  "order_num": "test",
  "domain": "skrebeyko.payform.ru",
  "sum": "1000.00",
  "customer_phone": "+79999999999",
  "customer_email": "email@domain.com",
  "customer_extra": "тест",
  "payment_type": "Пластиковая карта Visa, MasterCard, МИР",
  "commission": "3.5",
  "commission_sum": "35.00",
  "attempt": "1",
  "sys": "test",
  "products": [
    {
      "name": "Доступ к обучающим материалам",
      "price": "1000.00",
      "quantity": "1",
      "sum": "1000.00"
    }
  ],
  "payment_status": "success",
  "payment_status_description": "Успешная оплата"
}
```

### Заголовок

```
Sign: c229f7f7efcca99f4ceb9c51c9f0f26e6ac287cef9c730e3a1c95fb957153886
```

64 hex chars = SHA256.

### Body format на проводе

`application/x-www-form-urlencoded` (PHP nested arrays через bracket-notation: `products[0][name]=...`). После Express's `express.urlencoded({ extended: true })` парсится в nested-объект — это то что мы получаем как `req.body`.

---

## Алгоритм Prodamus (из их официальной PHP-библиотеки)

Репо: [Prodamus/payform-api-php](https://github.com/Prodamus/payform-api-php) (или похожее).

```php
public static function create(array $data, string $secretKey, string $algo = 'sha256'): string
{
    self::ksortRecursive($data);
    return hash_hmac(
        $algo,
        json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        $secretKey
    );
}

public static function ksortRecursive(array &$array): bool
{
    if (!is_array($array)) return false;
    ksort($array);
    foreach ($array as &$value) {
        if (is_array($value)) self::ksortRecursive($value);
    }
    return true;
}
```

**По-человечески:**

1. **Recursive ksort** — отсортировать ключи на ВСЕХ уровнях вложенности (включая вложенные массивы `products[0]`).
2. **`json_encode(..., JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)`** — кириллицу НЕ экранировать как `\u0...`, слэши `/` тоже не экранировать.
3. **`hash_hmac('sha256', $json, $secretKey)`** — HMAC-SHA256 по результирующей JSON-строке с секретом.

Подпись присылается **в заголовке `Sign`**, не в теле. То есть тело подписывается **как есть, без `signature` поля**.

---

## Почему наш текущий код не работает

`push-server/prodamusVerify.mjs verifyProdamusSignature`:

```javascript
const rawJson = JSON.stringify(flatBody || {});
const sortedBase = buildSortedBase(flatBody || {});
// ...
const candidates = [
    hmacHex('sha256', rawJson, normalizedSecret),
    hmacHex('sha256', sortedBase, normalizedSecret),
    // ...
];
```

Два провала:

1. **`JSON.stringify(flatBody)`** — НЕ сортирует ключи. Plus теперь мы добавили `signature` в flatBody через `pickSignatureSource` — этот лишний ключ попадает в JSON и ломает сверку.
2. **`buildSortedBase`** — формирует строку `"k:v;k:v;..."`, не JSON. Сортирует только верхний уровень. Внутрь массивов не лезет. Это не совпадает с алгоритмом Prodamus.

---

## Что нужно сделать

### 1. Добавить новый кандидат-хэш — настоящий Prodamus алгоритм

В `prodamusVerify.mjs`:

```javascript
// Recursive sort keys at all levels (matches PHP ksort_recursive).
const sortKeysRecursive = (value) => {
  if (Array.isArray(value)) {
    return value.map(sortKeysRecursive);
  }
  if (value && typeof value === 'object') {
    const sorted = {};
    Object.keys(value).sort().forEach((k) => {
      sorted[k] = sortKeysRecursive(value[k]);
    });
    return sorted;
  }
  return value;
};

// Prodamus canonical form: ksort recursive + json_encode with no escape.
// JS JSON.stringify по умолчанию НЕ экранирует unicode и НЕ экранирует /,
// что совпадает с PHP JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES.
const buildProdamusCanonical = (body) => {
  // Critical: убираем signature поле, если оно было добавлено через pickSignatureSource.
  // Prodamus signs body WITHOUT signature (она в header).
  const { signature: _s, sign: _sn, hash: _h, ...clean } = body || {};
  return JSON.stringify(sortKeysRecursive(clean));
};

// Добавить в candidates:
const prodamusCanonical = buildProdamusCanonical(flatBody || {});
const candidates = [
  hmacHex('sha256', prodamusCanonical, normalizedSecret),  // ← НОВЫЙ, главный
  hmacHex('sha256', rawJson, normalizedSecret),             // старый, оставляем
  hmacHex('sha256', sortedBase, normalizedSecret),
  hashHex('sha256', `${sortedBase}${normalizedSecret}`),
  hashHex('md5',    `${sortedBase}${normalizedSecret}`),
  hashHex('sha1',   `${sortedBase}${normalizedSecret}`)
];
```

Новый кандидат идёт первым — это правильный алгоритм, остальные — fallback на случай если Prodamus передумает.

### 2. Debug-лог (как ты предлагал) для следующего sandbox-теста

В `handleProdamusWebhook` при `signatureValid=false`:

```javascript
if (!signatureValid) {
  console.error('[prodamus-debug] Invalid signature trace:');
  console.error('  headers:', JSON.stringify(req.headers, null, 2));
  console.error('  raw body type:', typeof req.body, 'keys:', Object.keys(req.body || {}));
  console.error('  pickSignatureSource result keys:', Object.keys(payloadForVerify || {}));
  console.error('  computed prodamusCanonical:', JSON.stringify(payloadForVerify).slice(0, 500));
  // candidates список — добавь возврат из verifyProdamusSignature для отладки,
  // либо повтори вычисление inline для лога
}
```

После одного sandbox-event разберёмся точно. Удалим debug после.

### 3. Тесты

В `prodamusVerify.test.mjs` добавь happy-path с реальным payload:

```javascript
test('Prodamus official algorithm — payment_success sample', () => {
  const body = {
    date: '2026-05-15T00:00:00+03:00',
    order_id: '1',
    order_num: 'test',
    domain: 'skrebeyko.payform.ru',
    sum: '1000.00',
    customer_phone: '+79999999999',
    customer_email: 'email@domain.com',
    customer_extra: 'тест',
    payment_type: 'Пластиковая карта Visa, MasterCard, МИР',
    commission: '3.5',
    commission_sum: '35.00',
    attempt: '1',
    sys: 'test',
    products: [
      { name: 'Доступ к обучающим материалам', price: '1000.00', quantity: '1', sum: '1000.00' }
    ],
    payment_status: 'success',
    payment_status_description: 'Успешная оплата'
  };
  const secret = '<тестовый секрет>'; // подставь любой, главное проверить алгоритм
  const expectedSig = crypto.createHmac('sha256', secret).update(buildProdamusCanonical(body)).digest('hex');
  // payloadWithSig имитирует то, что приходит в handler:
  const payloadWithSig = { ...body, signature: expectedSig };
  assert.strictEqual(verifyProdamusSignature(payloadWithSig, secret), true);
});
```

И второй тест — с реальной подписью от Prodamus:

```javascript
test('Prodamus sandbox payment_success — реальный пример', () => {
  const body = {/* тот же payload */};
  const secret = '<актуальный secret из .env>';
  const realProdamusSig = 'c229f7f7efcca99f4ceb9c51c9f0f26e6ac287cef9c730e3a1c95fb957153886';
  const payloadWithSig = { ...body, signature: realProdamusSig };
  assert.strictEqual(verifyProdamusSignature(payloadWithSig, secret), true);
});
```

Второй тест требует реальный секрет — его НЕ коммитим. Можно отметить `test.skip` или вынести в `.test.local.mjs` который в `.gitignore`. На твоё усмотрение.

---

## После 🟢

1. Коммит + push.
2. Rsync + restart.
3. Ольга прогоняет sandbox snippet снова → ожидаем 200 OK.
4. После успеха — отдельный коммит revert debug-лога.
