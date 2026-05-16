# BUG-PVL-SYNC-FAILED-TO-FETCH — retry diff (Уровень 2)

**Дата:** 2026-05-16
**Автор:** codeexec
**Тип:** DIFF на ревью (до commit)
**Scope:** ровно как 🟢 от стратега — retry × 1 с backoff 1.5s в
`pvlPostgrestApi.request`, только GET, только на `TypeError`.
**Не делаю:** Уровень 1 (фильтр алертов), Уровень 3 (категоризация
MON-001), параллельный фикс в `dataService.js::postgrestFetch` (см.
§«Открытые вопросы»).

---

## Файл

[services/pvlPostgrestApi.js](services/pvlPostgrestApi.js) — один
файл, без изменений в публичном API модуля и без правок callsite'ов.

---

## Изменение 1 — новая константа + helper (вставляется ПОСЛЕ
`buildHeaders`, ПЕРЕД `request`, между текущими строками 63 и 65)

```js
/** Network-layer retry: одноразовая повторная попытка при TypeError
 * из fetch() (Chrome «Failed to fetch» / Safari «Load failed»).
 * Только для GET и только на TypeError — на HTTP-ошибках (401/PGRST*)
 * retry бессмыслен. Лечит BUG-PVL-SYNC-FAILED-TO-FETCH (короткие
 * сетевые blip'ы у мобильных клиентов забивали MON-001). */
const NETWORK_RETRY_DELAY_MS = 1500;

async function fetchWithNetworkRetry(urlString, fetchInit, { allowRetry }) {
    try {
        return await fetch(urlString, fetchInit);
    } catch (err) {
        if (!allowRetry || !(err instanceof TypeError)) throw err;
        logDb('[PVL DB RETRY]', {
            endpoint: urlString,
            error: String(err?.message || err),
        });
        await new Promise((resolve) => setTimeout(resolve, NETWORK_RETRY_DELAY_MS));
        return fetch(urlString, fetchInit);
    }
}
```

**Почему `err instanceof TypeError`**: fetch() кидает TypeError
эксклюзивно на network-layer ошибках (Failed to fetch / Load failed /
NetworkError when attempting to fetch resource), когда URL и init
валидны. HTTP-ошибки (4xx/5xx/PGRST) приходят как нормальный response
с `!ok`, не как throw — их retry не зацепит. Это именно та граница,
которую попросил стратег.

**Почему вторая попытка без try/catch**: если она тоже бросит
TypeError, это улетит наверх в catch'и `pvlMockApi.js:1342/1372`
ровно как сейчас → уйдёт в MON-001. Это правильно: если повторился
— это уже не blip, это устойчивая проблема, alert уместен.

**Почему фиксированная 1.5s, без экспоненциального backoff**: один
retry — одной задержки достаточно; стратег явно зафиксировал 1.5s.

---

## Изменение 2 — заменить `fetch()` в `request` на helper
(одна строка `await fetch(...)` → `await fetchWithNetworkRetry(...)`)

**Текущая [pvlPostgrestApi.js:82-86](services/pvlPostgrestApi.js#L82-L86):**

```js
const response = await fetch(url.toString(), {
    method,
    headers: buildHeaders(prefer),
    body: body ? JSON.stringify(body) : undefined,
});
```

**Станет:**

```js
const response = await fetchWithNetworkRetry(url.toString(), {
    method,
    headers: buildHeaders(prefer),
    body: body ? JSON.stringify(body) : undefined,
}, { allowRetry: method === 'GET' });
```

Всё остальное в `request` — без изменений (обработка `!response.ok`,
`PGRST300/302` → `POSTGREST_JWT_MISCONFIG`, логирование, JSON
parse).

---

## Что не меняется

- `buildHeaders` / `getAuthToken` / `isPgrstJwtError` — без правок.
- Publicный API модуля (`isEnabled`, экспортируемые методы) — без
  правок.
- `pvlMockApi.js` catch'и (hydrate / syncTracker) — без правок.
  Они продолжат ловить и репортить — но только реально неустранимые
  ошибки, после неуспешного retry.
- `dataService.js::postgrestFetch` — НЕ трогаю (см. §«Открытые
  вопросы»).
- `clientErrorReporter.js` — НЕ трогаю (это был бы Уровень 1).

---

## Сводный размер

- **+15 строк** (константа + helper + комментарий)
- **±1 строка** в `request` (заменён вызов fetch на helper)
- 0 файлов вне `pvlPostgrestApi.js`

---

## Smoke-план (после 🟢 и commit + deploy)

1. DevTools → Network → throttle «Offline» на ~1 сек, потом «Online»
   → запрос должен пройти со второй попытки, в console увидим
   `[PVL DB RETRY]` (только в DEV — см. `logDb` чек `IS_DEV` в
   [pvlPostgrestApi.js:30](services/pvlPostgrestApi.js#L30)).
2. DevTools → Offline на 5 сек (дольше чем 1.5s retry delay) → обе
   попытки упадут, ошибка дойдёт до catch в `pvlMockApi`, уйдёт в
   MON-001 как сейчас.
3. POST-запрос (например, submit homework) в Offline → НЕ должно
   быть retry (т.к. `method !== 'GET'`) — упасть сразу. Защита от
   двойной записи.
4. 24h наблюдение MON-001: baseline 9 алертов `pvlMockApi.*` за 3
   дня → ожидаемо <3 за 3 дня (~70% blip'ов лечатся одним retry).

---

## Открытые вопросы / scope expansion

### Параллельный путь `dataService.js::postgrestFetch` — considered but SKIPPED

В [services/dataService.js:33-81](services/dataService.js#L33-L81)
ровно та же конструкция `fetch → !ok → throw`. Логика идентична. По
правилу из памяти ([feedback_extend_scope_for_parallel_bugs](memory/feedback_extend_scope_for_parallel_bugs.md))
формально надо чинить параллельно.

**Решение 2026-05-16 (стратег):** не расширяем сейчас. Причины:

- 0 алертов из `dataService.*` в `/var/log/garden-client-errors.log`
  за 3 дня — баг там эмпирически не наблюдается.
- `dataService.postgrestFetch` обслуживает foreground UI fetch'и
  (не фон). Retry +1.5s = заметный UX-регресс на первом paint без
  подтверждённой пользы.
- Правило `extend_scope_for_parallel_bugs` применимо когда баг
  наблюдается в обоих местах. Здесь — только в одном.

**Критерий возврата:** если в MON-001 начнут прилетать алерты с
`source: 'dataService.*'` или стеками из бандла `dataService-*.js`
с `TypeError: Failed to fetch | Load failed` — пересматриваем,
распространяем helper.

### Память про silent anon-fallback — SKIPPED

Стратег подтвердил: журналы `docs/REPORT_2026-05-02_*` и
`docs/FRONTEND_PATCH_2026-05-02_*` — исторические артефакты, они
описывают код **до** того патча, который этот silent fallback и
выпилил. Не трогаю. Память стратега обновлена на его стороне.

---

## Готовность

После твоего 🟢 на этот diff:
1. Применяю Edit на [services/pvlPostgrestApi.js](services/pvlPostgrestApi.js).
2. Commit (1 коммит, message с BUG-PVL-SYNC-FAILED-TO-FETCH).
3. Deploy (GitHub Actions → FTP по обычному пути, как меняется
   только клиент-бандл).
4. Smoke по плану выше.
5. Урок в `docs/lessons/2026-05-16-pvl-sync-network-retry.md`
   (после успешного smoke).
