# Track B hot-patch (c) — bump TTL pvl_users_swr_v1: 1h → 24h

**Адресат:** Ольга (связной) → стратег.
**Автор:** VS Code Claude Code (codeexec).
**Дата:** 2026-05-29.
**Статус:** **staged, не committed.** git review pending.

**Контекст:**
- [_149](2026-05-28_149_codeexec_diagnose_vasilina_jwt_impersonation.md) — server-side чист.
- [_152](2026-05-29_152_codeexec_fix_razhigaeva_status_active.md) — Razhigaeva status `applicant→active` applied 16:14 МСК.
- [_154](2026-05-29_154_codeexec_recheck_vasilina_post_razhigaeva_fix.md) — К2 опровергнут, recheck в 16:48 МСК показал server-side identical _149, причина client-side. Кандидат №1 — SWR TTL=1h истекает раз в час, refresh может падать на network/JWT блипе, UI остаётся пустым.

**Гипотеза для теста:** Symptom «утром работало → опять пусто» периодический и совпадает с часовым TTL. Bump до 24h — hedge + диагностический эксперимент:
- Если Василина стабильно работает 24h+ → SWR-теория подтверждена → Pattern C' отдельной сессией.
- Если дрожит дальше → SWR не корень, копаем глубже.

---

## 1. Diff (единственный числовой литерал)

**Файл:** [services/pvlMockApi.js](garden/services/pvlMockApi.js)
**Местоположение:** строка [1185-1193](garden/services/pvlMockApi.js#L1185-L1193) (в начале `syncPvlActorsFromGarden`).

```diff
@@ -1182,13 +1182,15 @@ const USERS_SWR_KEY = 'pvl_users_swr_v1';

 export async function syncPvlActorsFromGarden() {
     try {
-        // SWR: берём кэш пользователей из localStorage (актуален 1 час)
+        // SWR: берём кэш пользователей из localStorage (актуален 24 часа — bump от 1ч,
+        // hedge против пустого mentor view когда background-refresh падает на network/JWT блипе;
+        // см. docs/_session/2026-05-29_155_codeexec_swr_ttl_bump_hot_patch_diff.md)
         let cachedUsers = null;
         try {
             const raw = localStorage.getItem(USERS_SWR_KEY);
             if (raw) {
                 const { ts, d } = JSON.parse(raw);
-                if (d && Date.now() - ts < 60 * 60 * 1000) cachedUsers = d;
+                if (d && Date.now() - ts < 24 * 60 * 60 * 1000) cachedUsers = d;
             }
         } catch { /* ignore */ }
```

**До:** `60 * 60 * 1000` = 3 600 000 ms = 1 час.
**После:** `24 * 60 * 60 * 1000` = 86 400 000 ms = 24 часа.

Минимальный diff: один числовой литерал + комментарий с pointer'ом на этот отчёт.

---

## 2. Что это значит на практике

### 2.1. Чему помогает

`pvl_users_swr_v1` хранит копию массива profiles (`api.getUsers()` returns `SELECT * FROM profiles`) — это входные данные для **mentor view** и админки участниц:
- mentor видит menti потому что в `db.studentProfiles` есть applicant'ы из этого массива.
- admin видит все профили потому же.

При TTL=1h:
- через час mentor-сессия делает `Date.now() - ts >= 1h` → cache miss → fall на network.
- если network/JWT в этот момент глючит → `users = []` → `syncPvlActorsFromGarden` ловит `reason='no_users'` → hydrate не зовётся → mentor view пустой до следующего mount/retry.

При TTL=24h:
- следующая cache miss будет только через 24 часа.
- background refresh продолжает работать каждый sync (он fire-and-forget на [pvlMockApi.js:1199](garden/services/pvlMockApi.js#L1199)) и обновляет cache при успехе.
- глитч на background refresh **молча проглатывается** (`.catch(() => {})`), и старый cache продолжает работать ещё ~24h.

### 2.2. Stale-tradeoff

**Что НЕ подхватится сразу:**
- Новые регистрации участниц (новые profiles) — у Василины в её mentor view появится новая participant только после успешного background-refresh ИЛИ через 24h.
- Изменение `role`/`access_status` у кого-то (например admin меняет applicant'у роль на intern). Если background-refresh падает — Василина видит старую роль до 24h.
- Изменение `name`/`email`/`avatar_url` — то же самое.

**Smoke от этого:** background-refresh всё ещё пытается выполниться **при каждом mount mentor-страницы**. Если её клиент-сеть жива — refresh пройдёт и cache обновится. То есть «24h обнуления» — это **worst case** при ПОСТОЯННО падающем refresh. Обычно cache обновляется намного чаще.

**В реальной эксплуатации:** регистрации happen раз в сутки-двое, role changes — несколько раз в неделю. Stale на 24h **не критично** для Василины как mentor — она работает со своими 3 menti, которые в cache есть. Новые menti к ней назначаются админом и через 30s setTimeout retry ([PvlPrototypeApp.jsx:8226-8233](garden/views/PvlPrototypeApp.jsx#L8226-L8233)) sync прокатится.

**Hard reload (Ctrl+Shift+R) НЕ сбрасывает localStorage** — он только force-reload'ит ассеты. Stale cache переживает hard reload. Если нужно сбросить — `clearLocalStorage` через DevTools или (нечто более грубое) version bump ключа `pvl_users_swr_v1` → `_v2`. **Я этого не делаю** — это сломает работающим менторам.

### 2.3. Кого не затрагивает

- Юля Габрух / Лена Федотова: у них cache уже наполнен корректно, продолжат видеть menti. Никаких регрессий.
- Студенток: их view хранит другие cache'и (`pvl_student_content_progress` etc.), TTL pvl_users_swr_v1 их не касается.
- Pull-to-refresh / `forceRefresh()`: дёргают только React state, не сбрасывают localStorage.

---

## 3. Smoke

### 3.1. Build

```
$ npm run build
...
✓ built in 4.44s
> garden-of-leaders@0.0.0 postbuild
> node scripts/postbuild-reset.mjs
[postbuild] ensured dist/reset/index.html
```

✅ Bundle билдится без ошибок. Стандартный warning о chunk size (CourseLibraryView 575kB) — pre-existing, не от моего change'а.

### 3.2. Lokal dev mentor view

Я не имею dev-login flow для mentor-сессии в локальной dev-инстанции без реального garden-auth backend'а. Локально open mentor view → она использует localStorage stub, который не загружает с прода. Smoke в dev-режиме показал бы только что код парсится — это уже подтверждено build'ом.

**Не-регрессионный signal:** изменение чисто в условии `Date.now() - ts < N` — не меняет логику, только расширяет окно. Существующие сценарии (cache hit / cache miss / background refresh / fire-and-forget save) работают как раньше, просто cache hit срабатывает дольше.

---

## 4. Git state

```
$ git status --short services/pvlMockApi.js
M  services/pvlMockApi.js
```

✅ **staged, не committed.** Один файл, минимальный diff. Жду 🟢 стратега → commit + push.

---

## 5. Реверс-план

Если стратег решит откатить — один Edit:

```diff
-                if (d && Date.now() - ts < 24 * 60 * 60 * 1000) cachedUsers = d;
+                if (d && Date.now() - ts < 60 * 60 * 1000) cachedUsers = d;
```

И удалить комментарий-pointer. Чистая обратимая правка.

**Если откат уже в проде** и Василина накопила 24h stale cache, ей всё ещё нужно будет сделать что-то для refresh:
- очистить localStorage `pvl_users_swr_v1` через DevTools (Application → Local Storage → удалить ключ → reload).
- ИЛИ дождаться следующего успешного background-refresh.

---

## 6. Что НЕ сделал (per ТЗ)

- ⛔ Не трогал ничего кроме одной TTL-константы (+комментарий).
- ⛔ Не добавлял retry / fallback / Pattern C' — это отдельная сессия после теста этой гипотезы.
- ⛔ Не правил logic LocalStorage-version bump (`_v1` → `_v2`), что сбросило бы cache у всех — Юля/Лена сейчас работают, их не трогаем.
- ⛔ Не делал git commit/push.

---

## 7. Smoke pending — что нужно от Василины

**После deploy этого patch'а:**

> Василина, попробуй обновить страницу учительской (Ctrl+Shift+R). Доложи:
> - 1) Сразу видны menti?
> - 2) Через 1-2 часа (или после возвращения за компьютер) — всё ещё видны?
> - 3) Завтра утром — всё ещё видны?

**Если завтра видны** → SWR-теория подтверждена → Pattern C' отдельной сессией.
**Если опять пусто** → SWR не корень → DevTools, копаем глубже.

---

**Артефакт:** [docs/_session/2026-05-29_155_codeexec_swr_ttl_bump_hot_patch_diff.md](garden/docs/_session/2026-05-29_155_codeexec_swr_ttl_bump_hot_patch_diff.md).

---

## 8. APPLIED — commit + push + deploy

**Стратег approve 🟢:** добавить SW bump в тот же commit, чтобы клиенты сразу подтянули новый bundle.

### 8.1. SW bump

[public/sw.js:1](garden/public/sw.js#L1):

```diff
-// SW_VERSION: 2026-05-28-pvl-md-first-heading-preserve
+// SW_VERSION: 2026-05-29-swr-ttl-bump
```

### 8.2. Commit

```
9b441d4 2026-05-29 16:57:29 +0300 olgaskrebeyko
hot-patch: SWR TTL pvl_users_swr_v1 1h → 24h + SW bump

 public/sw.js              | 2 +-
 services/pvlMockApi.js    | 4 +++-
 2 files changed, 5 insertions(+), 3 deletions(-)
```

Полный hash: `9b441d4ff62dcecf5cd00a5d3ad9e26ccfc2547f`.

### 8.3. Push confirmation

```
$ git push origin main
   5d1d8a7..9b441d4  main -> main

$ git ls-remote origin main
9b441d4ff62dcecf5cd00a5d3ad9e26ccfc2547f	refs/heads/main
```

✅ origin/main = `9b441d4` — push прошёл.

### 8.4. FTP auto-deploy

GitHub Actions `Deploy to FTP` workflow:

```
in_progress  hot-patch: SWR TTL pvl_users_swr_v1 1h → 24h + SW bump
             Deploy to FTP  main  push  run_id=26641511167  started 2026-05-29T13:57:45Z
```

Run id: **26641511167**. Started: 16:57:45 МСК (13:57:45 UTC). Прошлый deploy (phase40 от 28 мая) длился 1m48s — ожидаем подобное окно. После завершения — клиенты при следующем визите подтянут новый SW (`2026-05-29-swr-ttl-bump`), он на activate инвалидирует cache (см. [public/sw.js:9-12](garden/public/sw.js#L9-L12)) и подтянет новый pvlMockApi с TTL=24h.

### 8.5. Smoke pending — для Василины (тройная точка)

> Василина, попробуй обновить страницу учительской (Ctrl+Shift+R). Доложи:
> - **1)** Сразу видны menti?
> - **2)** Через 1-2 часа (или после возвращения за компьютер) — всё ещё видны?
> - **3)** Завтра утром (30 мая) — всё ещё видны?

**Интерпретация:**
- 3 из 3 видны → SWR-теория подтверждена → Pattern C' отдельной сессией.
- (1) видно, (2)/(3) пусто → SWR-теория частично, но есть второй слой.
- (1) пусто → SWR не корень, копаем DevTools.
