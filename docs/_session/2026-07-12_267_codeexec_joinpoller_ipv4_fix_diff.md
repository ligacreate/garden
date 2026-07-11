# DIFF-ON-REVIEW — Фикс флака join-poller (`fetch failed`) → IPv4-only tgGet

**Дата:** 2026-07-12
**Автор:** codeexec (VS Code)
**Статус:** DIFF-ON-REVIEW — **не применено, не задеплоено.** Ждём 🟢.
**Зачем сейчас:** до 20.07 TargetHunter умирает → наш poller станет единственным впуском. Сейчас он ФЛАКОВЫЙ (одобрил Рухшану, но каждые ~10 мин `loop error fetch failed`).

---

## Корневая причина
`push-server/tgAccessClient.mjs` → `tgGet` использует голый `fetch()` **без форса IPv4 и без таймаута**. К `api.telegram.org` с этого сервера **IPv6 даёт ENETUNREACH** (задокументировано; garden-auth это лечил IPv4-only `httpsPostJson`, стр. 189/224 с `family:4`). Node v20 happy-eyeballs (`autoSelectFamily=on`) иногда выбирает IPv6 → `fetch failed`. `getUpdates({timeout:30})` — long-poll (сокет висит до 30с) — особенно уязвим. Отсюда флак: иногда v4 (работает), иногда v6 (падает).

**Owner-слой:** все TG-вызовы (getUpdates, getChatMember, approveChatJoinRequest, ban…) идут через `tgGet` → фикс одного места чинит всё.

## Изменение — `push-server/tgAccessClient.mjs`

**Было:**
```js
const api = (token, method) => `https://api.telegram.org/bot${token}/${method}`;

async function tgGet(token, method, params) {
  const res = await fetch(api(token, method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}
```

**Станет** (зеркалю проверенный паттерн garden-auth — `https.request` + `family:4` + timeout):
```js
import https from 'node:https';

const TG_HOST = 'api.telegram.org';

// IPv4-only (family:4): IPv6 к api.telegram.org с этого сервера = ENETUNREACH.
// Голый fetch через happy-eyeballs иногда шёл по IPv6 → 'fetch failed' (флак
// long-poll getUpdates). Тот же обход, что garden-auth httpsPostJson.
function tgGet(token, method, params) {
  const body = JSON.stringify(params);
  // getUpdates — long-poll: держим сокет чуть дольше его timeout; прочие — быстрые.
  const timeoutMs = method === 'getUpdates'
    ? (Number(params?.timeout) || 30) * 1000 + 5000
    : 15000;
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: TG_HOST,
      path: `/bot${token}/${method}`,
      method: 'POST',
      family: 4,
      timeout: timeoutMs,
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`TG ${method} bad JSON: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`TG ${method} timeout`)));
    req.write(body);
    req.end();
  });
}
```

**Контракт не меняется:** возвращает распарсенный JSON (`{ok,result}` / `{ok:false,error_code,description}`), как и раньше. На сетевой ошибке/таймауте — reject (как `fetch` кидал), существующие try/catch в poller (loop error→sleep5s) и в reconcile (memErr) отрабатывают идентично. Мутирующие методы (`import https` один раз наверху) не трогаем.

## Деплой (после 🟢) — см. [[project_push_server]]
1. Правка `tgAccessClient.mjs` локально.
2. rsync одного файла на `/opt/push-server/tgAccessClient.mjs` (с обычными exclude'ами).
3. `systemctl restart push-server`.
4. **Smoke (2-3 мин наблюдения лога):**
   - `journalctl -u push-server -f | grep join-poller` → **исчезают `loop error fetch failed`**; при заявке — `[join-poller] approve …`.
   - Санити: `getChatMember` (shadow-прогон / node -e) по-прежнему отвечает.
5. Если хуже — откат: вернуть прежний `tgAccessClient.mjs` + restart.

## Проверка результата
- 10-15 мин без `fetch failed` в логе (раньше — каждые ~10 мин).
- Тест впуска: попросить тест-аккаунт (или Рухшану повторно на 2й ресурс, если где-то не в нём) подать заявку → в логе `approve` в течение секунд.

---

## ✅ ЗАДЕПЛОЕНО 2026-07-12 (по 🟢)
- Правка `tgGet` → IPv4 (`family:4`) применена; локальный `node --check` OK.
- rsync на прод: **осторожно — macOS rsync не понимает `--info=NAME`** (первый прогон упал, файл не уехал, restart поднял старый код). Рабочий флаг: `--itemize-changes`. Уроки: [[project_push_server]].
- Проверка на проде: `grep family: 4` = 1, `grep res.json()` = 0 → новый код на месте.
- restart push-server → active. Стартовый reconcile прогнал `getChatMember` через новый tgGet (known:35 обработан).
- Smoke: 12-мин наблюдение `fetch failed` (см. отчёт в чате).

**Задеплоено. Контракт tgGet не изменился, откат = вернуть fetch-версию + restart.**
