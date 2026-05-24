---
title: 🚨 PROD: actorsSyncReady is not defined — recon отчёт
date: 2026-05-24
author: codeexec (VS Code)
status: recon-done, waiting 🟢 before apply
related:
  - b3f5236 (наш вчерашний push — UI-PENDING-APPROVAL-LIST + ISNEW-BADGE)
  - cb24ad5 (BUG-PVL-SLOW-MATERIALS-LOAD, 2026-05-21) ← **истинный источник**
  - _100/_101/_102 (fix brief / diff / applied для cb24ad5)
---

# 🚨 actorsSyncReady is not defined — recon отчёт

## TL;DR

- **Это НЕ регрессия от нашего b3f5236.** Bug-бомба замедленного действия из **cb24ad5 (2026-05-21)** — фикс BUG-PVL-SLOW-MATERIALS-LOAD. Просто пролежала 3 дня и только сейчас сработала, потому что админ только сегодня зашла на `/admin/library`.
- **Scope шире чем library:** все 8 admin preview routes падают одинаково (`/admin/about`, `/admin/glossary`, `/admin/library`, `/admin/tracker`, `/admin/practicums`, `/admin/results`, `/admin/certification`, `/admin/self-assessment`).
- **Student/intern/leader НЕ затронуты** — у них другой кодпуть.
- **Fix forward тривиальный и безопасный** (3 строки). Revert b3f5236 НЕ поможет, потому что bug не в нём.

---

## 1. Где определена actorsSyncReady?

```
views/PvlPrototypeApp.jsx:7575:        if (!actorsSyncReady) {     ← использование
views/PvlPrototypeApp.jsx:8087:    const [actorsSyncReady, setActorsSyncReady] = useState(false);  ← declaration
```

**Только эти два места во всём source** (dist/ — минифицированный bundle, не считается).

## 2. Root cause: scope mismatch

Структура файла:

```jsx
// 7528: top-level функция (НЕ вложенная в PvlPrototypeApp)
function AdminPage({
    route, navigate,
    cmsItems, setCmsItems,
    cmsPlacements, setCmsPlacements,
    refreshKey, forceRefresh,
    // ← actorsSyncReady НЕ В PROPS
}) {
    ...
    if (ADMIN_COURSE_ROUTE_RE.test(route)) {  // 7571
        if (!actorsSyncReady) {                // 7575 — ReferenceError!
            return <Loader />;
        }
    }
}

// 8050: отдельный компонент
export default function PvlPrototypeApp({...}) {
    ...
    // 8087:
    const [actorsSyncReady, setActorsSyncReady] = useState(false);
    ...
    // 8255: вызов AdminPage — БЕЗ actorsSyncReady prop
    <AdminPage
        route={route} navigate={navigate}
        cmsItems={cmsItems} setCmsItems={setCmsItems}
        cmsPlacements={cmsPlacements} setCmsPlacements={setCmsPlacements}
        refreshKey={dataTick} forceRefresh={forceRefresh}
    />
}
```

`AdminPage` — top-level функция (отступ 0, не closure внутри `PvlPrototypeApp`). `actorsSyncReady` живёт в scope `PvlPrototypeApp` и **не передаётся пропом**. При любом рендере `AdminPage` с `route` matching `ADMIN_COURSE_ROUTE_RE` JS не находит переменную → `ReferenceError: actorsSyncReady is not defined`.

`ADMIN_COURSE_ROUTE_RE` = `/^\/admin\/(about|glossary|library|tracker|practicums|results|certification|self-assessment)(\/|$)/` ([views/PvlPrototypeApp.jsx:311](../../views/PvlPrototypeApp.jsx#L311)).

## 3. Когда добавлен / кем

`git log -p -S "actorsSyncReady"` — единственный коммит:

```
cb24ad5 fix(pvl): admin preview race + dashboard SWR + remove dup getUsers   (Thu May 21 18:22)
```

Это закрытие BUG-PVL-SLOW-MATERIALS-LOAD по бриф'у `_100`, applied в `_102`. Sub-task 1 — Path A из брифа: «ввести state-flag `actorsSyncReady`».

Diff cb24ad5 чётко показывает: добавили `if (!actorsSyncReady) {...}` внутрь `AdminPage`, но **prop в сигнатуру и call-site не прокинули**. Просто забыли. Code review это пропустил.

## 4. Связь с b3f5236 (наш push)

`git show b3f5236 --stat`:
```
services/dataService.js                            |  18 +
views/AdminPanel.jsx                               | 110 ++++-
+ 2 docs files
```

**PvlPrototypeApp.jsx НЕ затронут** в b3f5236. Регрессия **не от нашего push'а**.

Хронология `git log --oneline` показывает, что между cb24ad5 и сегодня PvlPrototypeApp.jsx **никем не правился** — последний коммит на нём именно `cb24ad5`. То есть bug сидел в проде ровно 3 дня.

## 5. Почему bug не проявился раньше (3 дня тишины)

Гипотеза: с 2026-05-21 по 2026-05-24 никто из админов не открывал ни один из 8 admin preview routes. Когда я последний раз был на `/admin/library` — это вообще делалось? Возможно нет, потому что:
- BUG-PVL-SLOW-MATERIALS-LOAD изначально жаловался про admin preview (Ольга), но после applied fix'а её жалоба исчезла, и она не вернулась туда специально.
- Smoke план из `_100` (раздел «Test 1 (Sub-task 1 + 2): Перейди в /admin/library») возможно не был выполнен в полной форме после deploy, либо был выполнен на dev'е, а не на prod'е.
- Если smoke на dev делали — там был тот же ReferenceError, но мог быть незамечен, либо был свежий dev bundle с другой нумерацией строк.

Косвенное подтверждение, что smoke прошёл **не полностью**: в commit message cb24ad5 нет упоминания «smoke OK на проде».

## 6. Scope ошибки

| Кто | Что | Падает? |
|-----|-----|---------|
| **Admin** | `/admin/library`, `/admin/tracker`, `/admin/lessons*`, `/admin/about`, `/admin/glossary`, `/admin/practicums`, `/admin/results`, `/admin/certification`, `/admin/self-assessment` | **Да, все 8** |
| Admin | `/admin/students`, `/admin/mentors`, `/admin/settings`, `/admin/calendar`, `/admin/content`, `/admin/pvl`, `/admin/users` | Нет (другие if-ветки в AdminPage до `ADMIN_COURSE_ROUTE_RE`) |
| Student/Intern | `/student/*` (включая `/student/library`) | Нет — рендерится через `<StudentPage>` напрямую (строка 8270-8282), `AdminPage` не вызывается |
| Mentor/Leader | `/mentor/*` | Нет — `<MentorPage>` напрямую (строка 8267-8268) |

`/admin/lessons` упомянуто в commit message cb24ad5, но в `ADMIN_COURSE_ROUTE_RE` его НЕТ — возможно отдельный if (надо проверить, но это не критично для текущей регрессии).

ErrorBoundary, как ты и сказала, корректно ловит ошибку — поэтому остальные разделы Сада работают (страница не белит целиком).

## 7. Анализ путей fix

### Path A — Fix forward (рекомендую)

Точечный, безопасный, 3 строки:

**1) Сигнатура `AdminPage` (7528-7537) — добавить `actorsSyncReady` в props:**
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
    actorsSyncReady,        // ← добавить
}) {
```

**2) Call-site (8255-8264) — прокинуть prop:**
```jsx
<AdminPage
    route={route}
    navigate={navigate}
    cmsItems={cmsItems}
    setCmsItems={setCmsItems}
    cmsPlacements={cmsPlacements}
    setCmsPlacements={setCmsPlacements}
    refreshKey={dataTick}
    forceRefresh={forceRefresh}
    actorsSyncReady={actorsSyncReady}   // ← добавить
/>
```

**3) `useMemo` dep array (8285) — добавить `actorsSyncReady`:**
```jsx
}, [role, route, studentId, actingUserId, cmsItems, cmsPlacements, dataTick, navigate, embeddedInGarden, gardenBridgeRef, actorsSyncReady]);
```

Без п.3 — `useMemo` бы не пере-вычислялся при снятии guard, и loader висел бы навсегда вместо превращения в реальный курс. Это второй (тихий) bug в той же зоне, который Path A заодно чинит.

**Цена:** 0 (восстанавливаем заявленное в cb24ad5 поведение).
**Риск:** минимальный. Изменения в одном файле, в одной фиче, локально.
**Smoke (после deploy):** открыть `/admin/library` как admin → должен показаться сначала loader, потом курс с amber banner «Вы видите курс как ученица: …».

### Path B — Revert b3f5236

**НЕ ПОМОЖЕТ.** Bug не в b3f5236 (PvlPrototypeApp.jsx не затронут этим коммитом). Чтобы откатить bug, нужен `git revert cb24ad5` — но это:
- Откатывает весь BUG-PVL-SLOW-MATERIALS-LOAD fix (loader, banner, SWR в AdminPvlProgress, dedup `getUsers`).
- Возвращает исходную жалобу «много раз обновлять чтобы появились материалы».
- 134 insertions, 17 deletions в 3 файлах — большой revert, рискованнее самого fix forward'а.

Если делать revert — то правильнее всё-таки `cb24ad5`, не `b3f5236`. Но Path A в десять раз безопаснее.

### Path C (НЕ рекомендую) — переключиться на pure check без state

В `getFirstCohortStudentId` различать «cohort пуст» vs «sync не закончил» через `pvlDomainApi.db.studentProfiles.length` или timestamp. Это Path B из брифа `_100` — сразу был отклонён в `_99` как сложнее. Лезть туда сейчас, под пожар на проде, точно не стоит.

## 8. Рекомендация

**Path A**, как hot-fix. Один файл, три строки, понятный механизм, восстанавливаем заявленное в cb24ad5 поведение.

Готов писать diff в `_125_codeexec_actorsSyncReady_fix_diff.md` по твоему 🟢. До этого ничего не apply / commit / push.

## 9. Параллельный урок (для lessons после fix)

Pattern: **«state в parent → guard в child top-level функции без prop drilling»** — JS не падает на парсинге (это live closure lookup), но падает в runtime при первом достижении кода. Code review это пропустил, потому что diff в cb24ad5 показывал только +строки внутри `AdminPage` и +useState в `PvlPrototypeApp`, без явного «а где connection?».

Что проверять в будущем подобных diff'ах: новый `useState` в одном компоненте + использование того же имени в другом компоненте без prop — это **обязательно** требует grep'a на «передаётся ли как prop».
