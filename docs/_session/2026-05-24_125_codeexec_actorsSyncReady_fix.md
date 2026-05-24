---
title: actorsSyncReady fix forward (Path A) — diff на ревью
date: 2026-05-24
author: codeexec (VS Code)
status: diff-ready, waiting 🟢 before apply
related:
  - _124 (recon — root cause analysis)
  - cb24ad5 (источник bug'a, BUG-PVL-SLOW-MATERIALS-LOAD)
files_touched: 1 (views/PvlPrototypeApp.jsx)
lines_changed: +3
---

# actorsSyncReady fix forward — Path A diff

🟢 от Ольги получен на Path A (3 строки, fix forward, без revert).

## Контекст (из _124)

`AdminPage` (top-level, `views/PvlPrototypeApp.jsx:7528`) использует `actorsSyncReady` (строка 7575), но это useState из соседнего компонента `PvlPrototypeApp` (строка 8087), и в props его не передавали. ReferenceError на любом из 8 admin preview routes.

Fix — прокинуть proп.

---

## Diff

### Изменение 1/3 — сигнатура `AdminPage` (views/PvlPrototypeApp.jsx:7528-7537)

**Было:**
```jsx
function AdminPage({
    route,
    navigate,
    cmsItems,
    setCmsItems,
    cmsPlacements,
    setCmsPlacements,
    refreshKey,
    forceRefresh,
}) {
```

**Станет:**
```jsx
function AdminPage({
    route,
    navigate,
    cmsItems,
    setCmsItems,
    cmsPlacements,
    setCmsPlacements,
    refreshKey,
    forceRefresh,
    actorsSyncReady,
}) {
```

**Что:** +1 строка `actorsSyncReady,` в деструктуризации props.

### Изменение 2/3 — call-site `<AdminPage />` (views/PvlPrototypeApp.jsx:8255-8264)

**Было:**
```jsx
if (route.startsWith('/admin/')) {
    return (
        <AdminPage
            route={route}
            navigate={navigate}
            cmsItems={cmsItems}
            setCmsItems={setCmsItems}
            cmsPlacements={cmsPlacements}
            setCmsPlacements={setCmsPlacements}
            refreshKey={dataTick}
            forceRefresh={forceRefresh}
        />
    );
}
```

**Станет:**
```jsx
if (route.startsWith('/admin/')) {
    return (
        <AdminPage
            route={route}
            navigate={navigate}
            cmsItems={cmsItems}
            setCmsItems={setCmsItems}
            cmsPlacements={cmsPlacements}
            setCmsPlacements={setCmsPlacements}
            refreshKey={dataTick}
            forceRefresh={forceRefresh}
            actorsSyncReady={actorsSyncReady}
        />
    );
}
```

**Что:** +1 строка `actorsSyncReady={actorsSyncReady}` в JSX props.

### Изменение 3/3 — useMemo dep array (views/PvlPrototypeApp.jsx:8285)

**Было:**
```jsx
    }, [role, route, studentId, actingUserId, cmsItems, cmsPlacements, dataTick, navigate, embeddedInGarden, gardenBridgeRef]);
```

**Станет:**
```jsx
    }, [role, route, studentId, actingUserId, cmsItems, cmsPlacements, dataTick, navigate, embeddedInGarden, gardenBridgeRef, actorsSyncReady]);
```

**Что:** +1 элемент `actorsSyncReady` в массиве зависимостей `useMemo` для `content`.

**Зачем нужна п.3:** без неё `useMemo` бы запомнил рендер с `actorsSyncReady === false` и НЕ пере-вычислился при `setActorsSyncReady(true)` после finished sync. UI бы залип на loader навсегда (либо до dataTick++). Это второй (молчаливый) bug в той же зоне cb24ad5 — Path A заодно его чинит.

---

## Итог по diff'у

| Файл | Строк добавлено | Строк удалено |
|------|-----------------|---------------|
| `views/PvlPrototypeApp.jsx` | +3 | 0 |
| **Всего** | **+3** | **0** |

Изменения:
- **3 точки**, все в одном файле, все локально в зоне `actorsSyncReady` connection
- **Backwards-compatible:** `AdminPage` теперь принимает новый optional prop; если кто-то ещё рендерит `AdminPage` без него (грэп показал только один call-site на 8255), `actorsSyncReady` будет `undefined` → `!undefined === true` → loader покажется → 5s watchdog снимет guard → дальше работает как было. Не fail-safe но и не fail-hard.

---

## Smoke план после apply + deploy

1. **Hard reload** `liga.skrebeyko.ru` в incognito, login как admin
2. Открыть `/admin/library` — ожидание: сначала loader «Загружается предпросмотр курса…», потом курс наполнен + amber banner «Вы видите курс как ученица: …»
3. Проверить ещё 1-2 admin preview route: `/admin/tracker`, `/admin/practicums` — должны работать так же
4. Console — НЕТ `ReferenceError: actorsSyncReady is not defined`
5. ErrorBoundary не должен ловить ничего на этих страницах

Если smoke ОК — закрыть инцидент, записать lesson в `docs/lessons/2026-05-24-actorsSyncReady-scope-mismatch.md`.

---

## Risks / edge cases

1. **`actorsSyncReady === undefined` при первом mount до useState инициализации** — невозможно, потому что `useState(false)` вызывается синхронно в начале render'а функции `PvlPrototypeApp`, до того как формируется `content` useMemo. Когда `<AdminPage>` рендерится через `content`, `actorsSyncReady` уже определён как `false` (или `true` после первого sync). 

2. **useMemo с новым dep будет re-вычисляться чаще** — на 1 дополнительное re-вычисление за весь lifecycle страницы (один переход false → true). Производительность не страдает.

3. **Что если AdminPage вызывается ещё где-то** — grep `\bAdminPage\b` показал только две строчки: declaration на 7528 и use на 8255. Других call-site нет.

4. **Loader на не-preview routes** — `if (ADMIN_COURSE_ROUTE_RE.test(route))` гард точечный, на `/admin/students`, `/admin/calendar` и т.д. он не сработает (другие ветки до него). Поведение тех routes не меняется.

---

## Параллельная находка (НЕ в этом fix'е) — login висит у viktorovna7286@gmail.com

Ольга сообщила, что у пользовательницы `viktorovna7286@gmail.com` висит login. Это **отдельная история, не связана с текущим bug'ом**:

- Текущий bug — `actorsSyncReady` в **admin preview routes**, JS ReferenceError при рендере под админом.
- Login flow — это **student/auth route**, до admin кода вообще не доходит. Разные кодпути, разные слои.

**Возможные причины login-вис'а (recon будет отдельным тикетом, если повторится после fix'a):**

1. **Orphan applicant state** — пользователь зарегистрирован в `auth_users`, но без соответствующего `pvl_students` row. Trigger phase37 (на проде с 2026-05-23 19:14, упомянут в commit message b3f5236) должен подхватывать UPDATE `access_status` от RPC `admin_approve_registration` и создавать `pvl_students` автоматически — но если пользовательница зарегистрировалась ДО 2026-05-23 19:14, она может оказаться orphan'ом без admin-approval'а. Тогда `getFirstCohortStudentId` для её cohort возвращает что-то странное, и race с `actorsSyncReady` (если она каким-то образом попадает на admin route — но это маловероятно для student'ки)... либо `syncPvlActorsFromGarden` где-то висит на её user'е.

2. **Token гидрация задержалась** — embedded режим (если она через Сад заходит), может не получить токен вовремя, и `syncPvlActorsFromGarden` retry на 600ms (PvlPrototypeApp.jsx ~8156) не успевает.

3. **DNS / network на её устройстве** — отдельная категория, не код.

4. **Связь с phase37 trigger'ом**: возможно, при approval'е ей пытаются создать `pvl_students` row, но что-то падает (FK violation, дубликат cohort_id, etc.) — нужно посмотреть push-server logs / Postgres logs за период её попытки логина.

**План:** после apply + deploy текущего fix'a Ольга повторит login (возможно тоже под viktorovna через подмену почты в auth flow или через эмпатичный fwd). Если **всё ещё висит** — заводим отдельный recon тикет `BUG-LOGIN-VIKTOROVNA-HANG` с проверкой:
- есть ли её user в `auth_users` / `pvl_students` / `profiles`
- что показывает console на её устройстве (если можно скриншот)
- access_status / pvl_role в её profile
- логи push-server'а и Postgres'а за её попытку login'а

Если **проходит после fix'a** — возможно это был побочный эффект ErrorBoundary catch'а (admin preview ошибка где-то ломала session shared state, что и подвисило login). Маловероятно, но возможно.

---

## Готов

Diff минимальный, scope знакомый, тесты smoke очевидны. Жду 🟢 на apply.

Без apply / commit / push / deploy до твоего ревью.
