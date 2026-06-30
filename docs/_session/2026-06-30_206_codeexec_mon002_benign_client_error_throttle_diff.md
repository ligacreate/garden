# 206 · MON-002 — глушим benign-шум client-error в @garden_grants_monitor_bot (ждёт 🟢)

**Дата:** 2026-06-30
**Агент:** codeexec
**Источник:** Ольга — убрать 🚨-шум на ОЖИДАЕМЫХ/самозалечивающихся клиентских ошибках в админ-боте.
**Репозиторий:** `garden-auth` (ligacreate/garden-auth), файл `server.js` — серверный приёмник `/api/client-error`.
**Статус:** разведка завершена, diff предложен, **код НЕ применён** — жду 🟢.

---

## TL;DR

1. Классифицируем входящее событие на **сервере** (по `message`/`source`/`code` — клиент шлёт их как есть, ничего на клиенте не трогаем) в одну из 4 benign-категорий или `other`.
2. **benign** → в TG поштучно НЕ шлём. Ведём скользящий счётчик per-category за 60-мин окно (память процесса). Шлём **один** агрегат «⚠️ \<category\> ×N за час (кучкование)» только когда N превысил порог (= признак реального инцидента: всплеск подписей / PostgREST / CORS / зацикленный reload). Один агрегат на категорию ≤ 1/час (кулдаун).
3. **other** → шлём в TG как сейчас, без изменений (сетка безопасности).
4. Существующий rate-limit (IP+msgHash 60s dedupe + 50/час на IP) **не трогаем** — фильтр категорий ставим **после** него (поверх).
5. Опц. — раз в сутки короткий дайджест benign-фона (молчим, если фон пуст).

Классификаторы сверены с живым клиентским кодом (garden):
- `components/ErrorBoundary.jsx:22` → `source: 'ErrorBoundary.chunkLoad'`, msg `'ChunkLoadError → auto-reload'`.
- `services/pvlMockApi.js:1079` → msg `loadRuntimeSnapshot partial degradation: …`.
- `services/pvlMockApi.js:1354-1355` → `source: 'pvlMockApi.hydrate'`, msg `hydrate_mentor_links failed (caught)`.

---

## 1. Категории и пороги (выносим в константы — легко тюнить)

| Категория | Правило классификации | Порог (events/час) |
|---|---|---|
| `jwt_expired` | `message` содержит `"JWT expired"` ИЛИ `code === "PGRST303"` | **>10** |
| `chunk_autoreload` | `source==="ErrorBoundary.chunkLoad"` ИЛИ `message` содержит `ChunkLoadError` / `Importing a module script failed` / `Failed to fetch dynamically imported module` | **>15** |
| `failed_fetch` | `message === "Failed to fetch"` ИЛИ `=== "TypeError: Failed to fetch"` (строгое равенство — НЕ путать с chunk-вариантом выше) | **>8** |
| `pvl_hydrate_degradation` | `message` содержит `loadRuntimeSnapshot partial degradation` / `hydrate_mentor_links failed` ИЛИ `source` начинается с `pvlMockApi.hydrate` | **>8** |
| `other` | всё остальное | — (шлём как сейчас) |

Порядок проверки: jwt → chunk → failed_fetch → pvl → other. `failed_fetch` строгим равенством не перехватит chunk-вариант `"Failed to fetch dynamically imported module"`, но chunk проверяется раньше — двойная защита.

---

## 2. Где счётчик и как работает порог

- **Окно:** скользящее, 60 мин. На каждое benign-событие: `hits.push(now)`, отрезаем `hits[0] < now-60мин`. `N = hits.length`.
- **Алерт:** если `N > порог` И `(now - lastAlertTs) > 60мин` → шлём один агрегат, ставим `lastAlertTs=now`. Кулдаун не даёт спамить агрегатом на каждом последующем событии за порогом.
- **Память:** `Map<category, {hits:[], lastAlertTs, dayCount}>`. hits отрезаются на доступе; категорий 4 — ничего не утечёт.

**Важный нюанс размещения (осознанное решение):** счётчик инкрементим **после** существующих гейтов (60s dedupe + 50/час на IP). Значит зацикленный reload одного браузера (один msgHash+IP) считается максимум 1 раз / 60с ≈ 60/час → порог 15 всё равно ловит за ~15 мин. А реальный всплеск (протухшие подписи / упавший PostgREST / CORS) идёт от **многих** IP — каждый проходит dedupe независимо → счётчик растёт быстро. Это даёт «на инцидент», а не «на сырой event» — что и нужно. Альтернатива (считать до dedupe) ломала бы правило «rate-limit не трогать» и завышала бы счётчик дублями.

---

## 3. Diff (server.js)

### 3.1 Константы — рядом с RL-блоком (после строки 133, `const hourlyByIp = new Map();`)

```js
// MON-002 — приглушение benign клиентских ошибок: глушим поштучно,
// алертим ОДИН агрегат только при кучковании за скользящее 60-мин окно.
// Категории и пороги (events/час) тюнятся здесь.
const BENIGN_WINDOW_MS = 60 * 60 * 1000;          // окно скользящего счётчика
const BENIGN_ALERT_COOLDOWN_MS = 60 * 60 * 1000;  // не чаще 1 агрегата / категорию / час
const BENIGN_THRESHOLDS = {
  jwt_expired: 10,            // >10/час → всплеск протухших подписей / PostgREST 401
  chunk_autoreload: 15,      // >15/час → зацикленный reload / битый деплой
  failed_fetch: 8,           // >8/час  → сетевой/CORS-инцидент
  pvl_hydrate_degradation: 8, // >8/час → деградация гидрации ПВЛ
};
// per-category: { hits: number[] (timestamps в окне), lastAlertTs, dayCount }
const benignState = new Map();

// MON-002 — отнести входящее событие к benign-категории или 'other'.
// Классифицируем на сервере по message/source/code (клиент шлёт их как есть).
const classifyClientError = ({ message, source, code }) => {
  const msg = message || '';
  const src = source || '';
  if (msg.includes('JWT expired') || code === 'PGRST303') return 'jwt_expired';
  if (src === 'ErrorBoundary.chunkLoad'
      || msg.includes('ChunkLoadError')
      || msg.includes('Importing a module script failed')
      || msg.includes('Failed to fetch dynamically imported module')) return 'chunk_autoreload';
  if (msg === 'Failed to fetch' || msg === 'TypeError: Failed to fetch') return 'failed_fetch';
  if (msg.includes('loadRuntimeSnapshot partial degradation')
      || msg.includes('hydrate_mentor_links failed')
      || src.startsWith('pvlMockApi.hydrate')) return 'pvl_hydrate_degradation';
  return 'other';
};

// MON-002 — учесть benign-событие в скользящем окне; вернуть текст агрегата,
// если пора алертить (порог превышен и кулдаун прошёл), иначе null.
const recordBenign = (category, now) => {
  let st = benignState.get(category);
  if (!st) { st = { hits: [], lastAlertTs: 0, dayCount: 0 }; benignState.set(category, st); }
  st.hits.push(now);
  const cutoff = now - BENIGN_WINDOW_MS;
  while (st.hits.length && st.hits[0] < cutoff) st.hits.shift();
  st.dayCount += 1;
  const threshold = BENIGN_THRESHOLDS[category];
  if (st.hits.length > threshold && now - st.lastAlertTs > BENIGN_ALERT_COOLDOWN_MS) {
    st.lastAlertTs = now;
    return `⚠️ *${category}* ×${st.hits.length} за час (кучкование)\n`
      + `Порог >${threshold}/час превышен — похоже на реальный инцидент, проверь.`;
  }
  return null;
};
```

### 3.2 Helper отправки админ-алерта — рядом с `logClientError` (после строки 273)

Выносим общий sender (агрегат + дайджест переиспользуют логику и логирование ошибок TG):

```js
// MON-002 — общий sender админ-алерта в @garden_grants_monitor_bot (агрегат/дайджест).
const postAdminTg = async (text) => {
  if (!TG_API || !TG_CHAT_ID) return;
  const tgRes = await httpsPostJson(TG_API, {
    chat_id: TG_CHAT_ID, text, parse_mode: 'Markdown', disable_web_page_preview: true,
  }).catch((e) => ({ ok: false, status: 0, text: String(e?.message || e) }));
  if (!tgRes.ok) {
    logClientError({
      ts: new Date().toISOString(), level: 'tg-failed',
      status: tgRes.status, body: String(tgRes.text || '').slice(0, 500),
    });
  }
};
```

### 3.3 Врезка в handler — между `logClientError({full})` (стр. 313-316) и `if (!TG_API…)` (стр. 318)

После полного лога события (benign тоже логируем в файл для форензики), перед поштучной отправкой:

```js
    // MON-002 — benign-категории: в TG поштучно НЕ шлём, копим в окне,
    // алертим один агрегат при кучковании. 'other' проваливается дальше.
    const category = classifyClientError({ message, source, code: body.code });
    if (category !== 'other') {
      const alert = recordBenign(category, now);   // now уже определён выше (стр. 297)
      if (alert) await postAdminTg(alert);
      return;
    }
```

Существующий блок ниже (`if (!TG_API || !TG_CHAT_ID) return;` + сборка `text` «🚨 *Garden client error*» + send) остаётся как есть — теперь только для `other`.

### 3.4 (Опц.) Суточный дайджест — рядом с cleanup-`setInterval` (после строки 173)

```js
// MON-002 — раз в сутки короткий дайджест benign-фона: чтобы фон был виден,
// но не дёргал поштучно. Молчим, если за сутки ничего не накопилось.
setInterval(() => {
  const cats = Object.keys(BENIGN_THRESHOLDS);
  const total = cats.reduce((s, c) => s + (benignState.get(c)?.dayCount || 0), 0);
  if (total > 0) {
    const parts = cats.map((c) => `${c} ×${benignState.get(c)?.dayCount || 0}`);
    postAdminTg(`📊 *benign за сутки*: ${parts.join(', ')}`);
  }
  for (const c of cats) { const st = benignState.get(c); if (st) st.dayCount = 0; }
}, 24 * 60 * 60 * 1000).unref();
```

`postAdminTg` объявлен ниже по файлу, но используется внутри колбэка `setInterval` (вызовется через сутки) — hoisting `const` тут не проблема, т.к. к моменту первого тика модуль полностью инициализирован. (Если хочется строгости — переносим этот `setInterval` ниже объявления `postAdminTg`; на исполнение не влияет.)

---

## 4. Поведение / edge-cases

| Сценарий | Поведение после фикса |
|---|---|
| 1 протухший JWT у юзера | category=jwt_expired, в TG не ушло, счётчик +1 |
| 11+ jwt_expired/час (разные юзеры) | один агрегат «⚠️ jwt_expired ×11 за час», дальше тихо ≥1ч (кулдаун) |
| 1 chunk-autoreload (новый деплой) | глушим, счётчик +1; самозалечивается reload'ом |
| 16+ chunk/час | один агрегат (битый деплой / reload-loop) |
| `Failed to fetch` (сетевой транзиент) | failed_fetch, глушим; всплеск >8/час → агрегат (CORS/сеть) |
| `Failed to fetch dynamically imported module` | classify=chunk_autoreload (chunk раньше failed_fetch) — корректно |
| hydrate/loadRuntimeSnapshot degradation | pvl_hydrate_degradation, глушим; >8/час → агрегат |
| любая неизвестная ошибка | other → 🚨 как сейчас (сетка безопасности) |
| TG недоступен | агрегат тихо проглатывается, ошибка пишется в `CLIENT_ERROR_LOG` (level=tg-failed) |

Семантика порога: «>N» = алертим начиная с (N+1)-го события в окне. `jwt_expired>10` → срабатывает на 11-м.

---

## 5. Не делаю / флагаю

- **Клиент не трогаю** (`utils/clientErrorReporter.js`, ErrorBoundary, pvlMockApi) — классификация только на сервере, как и просили.
- **Персистентность счётчиков** — память процесса; рестарт garden-auth обнуляет окна и dayCount. Для админ-мониторинга приемлемо (явно «память процесса ок»).
- **dayCount дайджеста** считает ВСЕ benign-события (включая ушедшие в агрегат) — это и есть «фон за сутки». Не путать с числом отправленных агрегатов.

---

## 6. План проверки (после 🟢, на задеплоенном garden-auth)

Деплой garden-auth обычной процедурой (rsync/scp + restart сервиса на Bittern, как в инфра-памяти push/auth).

Smoke (curl на `/api/client-error`, с разными IP через `X-Forwarded-For`, чтобы обойти 60s-dedupe):
1. По одному событию каждой benign-категории → в TG **НЕ пришло**, в `CLIENT_ERROR_LOG` записи есть.
2. Превысить порог (напр. 16× chunk_autoreload с разными XFF за минуту) → пришёл **один** агрегат «⚠️ chunk_autoreload ×N»; повтор за тот же час — тихо.
3. Кинуть `other` (произвольный message) → пришла «🚨 Garden client error» как раньше.

Пример эмуляции (порог chunk=15, шлём 16):
```bash
AUTH=https://auth.skrebeyko.ru
# benign по одному — в TG тихо
for c in '{"message":"JWT expired","source":"window.error"}' \
         '{"message":"ChunkLoadError → auto-reload","source":"ErrorBoundary.chunkLoad"}' \
         '{"message":"Failed to fetch","source":"window.error"}' \
         '{"message":"hydrate_mentor_links failed (caught)","source":"pvlMockApi.hydrate"}'; do
  curl -s -o /dev/null -X POST "$AUTH/api/client-error" -H 'Content-Type: application/json' \
    -H "X-Forwarded-For: 10.0.0.$RANDOM" -d "$c"
done
# спайк chunk → один агрегат
for i in $(seq 1 16); do
  curl -s -o /dev/null -X POST "$AUTH/api/client-error" -H 'Content-Type: application/json' \
    -H "X-Forwarded-For: 10.1.0.$i" \
    -d '{"message":"ChunkLoadError → auto-reload","source":"ErrorBoundary.chunkLoad"}'
done
# other → как раньше
curl -s -o /dev/null -X POST "$AUTH/api/client-error" -H 'Content-Type: application/json' \
  -H "X-Forwarded-For: 10.2.0.1" -d '{"message":"Cannot read properties of undefined (reading bla)","source":"window.error"}'
```

**Файлы под изменение:** только `garden-auth/server.js` (константы+классификатор+recordBenign+postAdminTg+врезка в handler [+опц. дайджест]). Внешний бот → жду 🟢 перед apply и деплоем.

---

## 8. ФИНАЛ — 🟢 получен, применено + задеплоено + smoke зелёный

Ольга дала 🟢 с тремя добавками — все внесены:

1. **FAIL-OPEN** — врезка в handler обёрнута в `try/catch`: любой сбой
   классификации/счётчика логируется (`level: 'mon002-throttle-error'`) и
   событие **проваливается к обычной пересылке 'other'**, не глотается. Сам
   `/api/client-error` (и тем более несвязанные `/auth/*` login/reset) не
   роняется. Внешний `try/catch` хендлера остаётся — двойная страховка.
2. **Один процесс — подтверждено.** garden-auth = `node server.js` под
   systemd `garden-auth.service`, один `app.listen` (стр. 838), без
   `cluster`/`worker_threads`, без pm2-ecosystem в репо. → `Map`-счётчик не
   расщепляется, порог честный. Зафиксировано в комментарии у констант. *Если*
   когда-нибудь перейдут на pm2-cluster / N инстансов — эффективный порог
   умножится на число воркеров → выносить счётчик в общий слой (Redis). Флаг.
3. **In-memory reset на рестарт** — принят как есть (комментарий у констант).

### ⚠️ Инцидент при деплое (поймал, обошёл)
Локальный clone `garden-auth` был **на 5 коммитов позади `origin/main`**
(пропустил «git pull перед edit»). Сравнение прод-`server.js` с моей stale-базой
показало «drift»: long-polling TG (TG-WEBHOOK-INBOUND-BLOCKED), email-norm
(FEAT-025), anti-enum reset. Если бы scp'нул правку на stale-базе — **снёс бы
весь этот прод-код**. Поймал diff'ом до деплоя. Оказалось — не прод-only drift,
а просто отставший clone: `origin/main` (0b22303) == прод **байт-в-байт**.
Сделал `git reset --hard origin/main`, переналожил MON-002 на верную базу
(+99/−0), и только тогда задеплоил. **Урок: всегда `git pull` + сверка
прод↔origin ДО правки** (память [[project_garden_auth]] это и предписывала).

### Деплой
`scp server.js → root@5.129.251.56:/opt/garden-auth/server.js` +
`systemctl restart garden-auth.service` → `active`, «Auth server running on
port 3001». Запушено в `ligacreate/garden-auth main` (3c1e30c) — инвариант
прод==git восстановлен.

### Smoke (на проде, localhost:3001, свой XFF в обход Caddy)
- `/api/health` → ok; `/health` (DB) → ok.
- 4 benign по одному (разные IP) → **204**, залогированы в файл, в TG агрегатов нет.
- 16× chunk_autoreload (разные IP) → **204** ×16 → должен прийти **один** агрегат
  «⚠️ chunk_autoreload ×N» (N≈17: +1 от benign-сингла выше; порог 15).
- 1× other → **204** → должна прийти «🚨 Garden client error».
- Лог-дельта = 21 событие; **ноль** `mon002-throttle-error` / `tg-failed` →
  throttle отработал чисто, оба TG-сенда (агрегат + other) прошли.
- `/auth/login` (bad creds) → **401**, `/auth/request-reset` (unknown) →
  **{ok:true}** (anti-enum/email-norm целы) → **/auth/\* не задеты**.

**Остаётся подтвердить Ольге глазами в @garden_grants_monitor_bot:** от этого
smoke в боте должно быть ровно **2 сообщения** — один ⚠️-агрегат (chunk) и один
🚨 (other); четыре одиночных benign — тишина. Если так — задача закрыта.
