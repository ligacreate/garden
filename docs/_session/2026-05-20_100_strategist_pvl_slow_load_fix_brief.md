# BUG-PVL-SLOW-MATERIALS-LOAD — fix бриф для codeexec

**От:** стратега (claude.ai)
**Кому:** codeexec (VS Code)
**Дата:** 2026-05-20 ночь
**Зелёный:** Ольга 🟢
**Связано:** `_97` recon бриф, `_98` recon отчёт, `_99` decisions от Ольги
**Двухшаговый apply:** diff `_101` → 🟢 от стратега → applied `_102`

---

## Контекст

По recon `_98`: «много раз обновлять» — это **race condition** в admin
preview-as-first-student flow. На admin routes `/admin/library`,
`/admin/tracker`, `/admin/lessons`, `/admin/about`, `/admin/glossary`,
`/admin/practicums`, `/admin/results`, `/admin/certification`,
`/admin/self-assessment` рендерится `StudentPage` через
`getFirstCohortStudentId()` ([PvlPrototypeApp.jsx:7572](../views/PvlPrototypeApp.jsx#L7572)).

Если `syncPvlActorsFromGarden` ещё не finished → `studentProfiles`
пуст → fallback на `ensurePvlPreviewStudentProfile()` (in-memory stub
с `cohortId: 'cohort-2026-1'`, `currentWeek: 0`, нулевой прогресс) →
курс выглядит **пустым**. Refresh → данные подтянулись → реальная
ученица → курс наполнен. Это и есть «много раз обновлять».

**Decisions Ольги (`_99`):**
- Q1: оставляем preview-as-first-student как default, но **никогда не
  показываем stub-fallback** пользователю — loader пока sync не finish
- Q1 продолжение: добавить header «Вы видите курс как ученица: ИМЯ» в
  admin preview routes
- Q3: SWR для AdminPvlProgress dashboard + убрать дубликат `getUsers`
  (3-5 сек TTL)
- Q2: PERF-CHECK RPC — отдельный P3 recon тикет, **не в этом батче**
- Q4: Caddy access log — отдельный OBS-001 P3, **не в этом батче**

---

## Что делать — 3 sub-tasks

### Sub-task 1: Loader пока `syncPvlActorsFromGarden` не finished

**Файл:** `views/PvlPrototypeApp.jsx`

**Локация:** функция `getFirstCohortStudentId()`
([line 152-160](../views/PvlPrototypeApp.jsx#L152)) + точка вызова
для admin preview routes ([line 7571-7613](../views/PvlPrototypeApp.jsx#L7571))

**Поведение сейчас:** если `pvlDomainApi.adminApi.getAdminStudents({})`
вернул пустой массив → fallback на `pvlDomainApi.ensurePvlPreviewStudentProfile()`
(stub) → дальше рендерится `StudentPage` от лица stub-id → курс пустой.

**Поведение целевое:**
- Если `studentProfiles` ещё не загружены (т.е. `getAdminStudents`
  пуст **и** `syncPvlActorsFromGarden` ещё не отработал) →
  **отрендерить Loader-компонент**, не StudentPage
- Когда sync finished и `studentProfiles` заполнились — re-render с
  реальной ученицей
- Stub-fallback **никогда не показывается пользователю** —
  используется только как абсолютный last-resort если что-то пошло
  совсем не так (например, в когорте 0 студенток после полного sync)

**Конкретика реализации (на твоё усмотрение, два пути):**

**Path A (предпочтительно — простой):** ввести state-flag
`actorsSyncReady` (или использовать существующий signal если есть в
коде — поищи через grep `syncPvlActorsFromGarden`). Если admin preview
route + sync not ready → render `<Loader />` или inline
`<div>Загрузка предпросмотра курса…</div>`.

**Path B (если state-flag сложно ввести):** в самом
`getFirstCohortStudentId` различать «cohort пуст» (legitimate edge
case, показываем stub) vs «sync не закончил» (показываем null). Через
проверку `pvlDomainApi.db.studentProfiles.length` (если есть rows но
не из active cohort — это уже другая story) или через timestamp
последнего sync.

**Выбор пути — на твоё усмотрение**, обоснуй в diff.

### Sub-task 2: Header «Вы видите курс как ученица: ИМЯ»

**Файл:** `views/PvlPrototypeApp.jsx`

**Локация:** где рендерится `StudentPage` для admin preview routes
([line 7571-7613](../views/PvlPrototypeApp.jsx#L7571))

**Что:** обернуть `StudentPage` в banner-header сверху:

```
┌─────────────────────────────────────────────────────────┐
│ 👁 Вы видите курс как ученица: Анна Петрова             │
│    (предпросмотр админа)                                │
└─────────────────────────────────────────────────────────┘
[StudentPage content]
```

**Конкретика:**
- Имя ученицы взять из `profiles` по `studentId` (resolved через
  `getFirstCohortStudentId` или existing user lookup)
- Если имя не найдено (rare edge case) — fallback на email или
  «неизвестная ученица»
- Banner — отдельный inline компонент, не отдельный файл (избежать
  prop-drilling); стили inline или через existing className utilities
- Без кнопки «View as» / выбора другой ученицы — это P2
  (`UX-PVL-ADMIN-PREVIEW-VIEW-AS-DROPDOWN`), не в этом батче

**Стили — в духе существующих badge'ей**:
- bg-amber-50 / border-amber-200 / text-amber-900 — мягкий warning
  цвет (предпросмотр, не критический alert)
- ИЛИ если existing pattern есть для info-banner'ов — использовать
  его (grep `bg-amber\|bg-blue-50.*border\|InfoBanner`)

### Sub-task 3: SWR для AdminPvlProgress + убрать дубликат getUsers

**Файл:** `views/AdminPvlProgress.jsx`

**Локация:** mount-flow [line 421-518](../views/AdminPvlProgress.jsx#L421)

**Что кэшировать (TTL 5 секунд):**
- `listCohorts()` (line 421)
- `getAdminProgressSummary(cohortId)` RPC (line 443)
- `Promise.all([listHomeworkItems, listContentItems, listCourseWeeks,
  listCourseLessons])` (line 456)

**Дубликат `getUsers`:**
- Line 511 — `api.getUsers()` уже выполняется в `App.jsx:108` (init).
- Убрать **локальный** fetch и принимать `users` из props/context из
  App-level.
- Если context не настроен — добавить через простой `useContext` или
  через prop drill from `<AdminPanel>` parent.
- ⚠ Если у тебя `users` не доступен в этом scope без значительного
  refactor'a — **оставь как было**, но добавь TODO коммент с
  reference на этот тикет.

**Конкретика SWR:**
- Использовать **тот же** SWR pattern что в `pvlMockApi.js:1024`
  (`RUNTIME_SWR_KEY`) — localStorage key + TTL check + stale-while-
  revalidate
- TTL 5 секунд короткий — балансирует свежесть данных и UX
- Ключи: `ADMIN_PVL_COHORTS_SWR_KEY`, `ADMIN_PVL_SUMMARY_SWR_KEY_{cohortId}`,
  `ADMIN_PVL_DASHBOARD_SWR_KEY_{cohortId}`
- На mount: сначала отдать cached если есть и fresh → потом fetch
  fresh → update state

---

## Что НЕ делать в этом батче

- ❌ **«View as» dropdown** — это P2 (`UX-PVL-ADMIN-PREVIEW-VIEW-AS-DROPDOWN`),
  отдельный тикет
- ❌ **Менять `getFirstCohortStudentId` логику выбора** — first-student
  остаётся по решению Q1
- ❌ **Не fix'ить `getAdminProgressSummary` RPC** — это отдельный P3
  тикет `PERF-CHECK-ADMIN-PROGRESS-SUMMARY-RPC` (recon с EXPLAIN
  ANALYZE)
- ❌ **Не включать Caddy access log** — это отдельный P3 `OBS-001`
- ❌ **Не трогать `CI-PATHSIGNORE-CLAUDE`** — это отдельный housekeeping
- ❌ **Не править admin-side формы или другие unrelated места**

---

## Risks

1. **Loader timing.** Если `actorsSyncReady` сигнал реализован неверно
   — может бесконечный loader (если sync никогда не finish'ает) или
   мгновенный stub (если sync уже отработал но мы не знаем). Защита:
   timeout 5 секунд на loader → fallback на текущий behavior (stub)
   с warning в console.
2. **Header без имени.** Если `getFirstCohortStudentId` возвращает
   real student ID но profile не resolve'ится через `profiles` lookup
   (race condition #2) — header может показать «неизвестная ученица»
   или сломать render. Защита: optional chaining + fallback string.
3. **SWR cache stale.** Если cache 5 сек, а админ только что что-то
   изменила (например, отметила ученицу как принятую) и хочет это
   увидеть — будет видеть старое до TTL expiry. Защита: invalidate
   cache key при known mutations (PATCH/POST на related endpoints).
4. **AdminPvlProgress refactor через props** — если scope изменений
   на App-level / Context-level выходит за рамки 1 файла — STOP, не
   делать refactor в этом батче, оставить TODO comment.

---

## Smoke план

После apply + push + deploy:

1. **Открой `liga.skrebeyko.ru` в incognito**, залогинься как admin
2. **Hard reload** (Cmd+Shift+R) чтобы получить новый bundle
3. **Test 1 (Sub-task 1 + 2):** Перейди в `/admin/library`
   - Ожидание: **сначала loader** (не пустой курс), потом курс
     наполнен
   - Ожидание: **сверху header** «Вы видите курс как ученица: <имя>»
   - НЕ должно быть пустого курса (stub-fallback не показывается)
4. **Test 2 (Sub-task 3):** Перейди в `/admin/pvl` (дашборд) →
   подожди load → перейди в другой tab (например `/admin/students`)
   → вернись в `/admin/pvl`
   - Ожидание: возврат должен быть **instant** (cache hit в TTL window
     5 сек), не свежий fetch
5. **Regression check на студентский путь:**
   - Залогинься как студентка (можно через Maria Romanova или test
     account)
   - Открой `/library` (без `/admin/` префикса)
   - Должно работать как раньше — никаких header'ов, никаких loader'ов

Если все 5 пунктов зелёные — fix DONE.

Если Test 1 показывает stub-fallback (пустой курс) — Sub-task 1
сломан, дебажить.

Если Test 2 показывает свежий fetch при возврате — SWR не работает,
дебажить.

---

## Двухшаговый apply

1. **Шаг 1 (сейчас):** Diff (без apply, без commit). Файл `_101_codeexec_pvl_slow_load_fix_diff.md`.
   - Точные diff по 3 sub-tasks
   - Обоснование выбора path (Sub-task 1 Path A или B)
   - Обоснование выбора компонента для banner (Sub-task 2)
   - Описание SWR keys и invalidation strategy (Sub-task 3)
   - Risks обнаруженные при импл
   - STOP-условия если что-то непонятно — задать вопрос в `_101`
2. **Шаг 2 (после 🟢 от стратега):** Apply + commit + push + smoke
   + backlog update + отчёт `_102_codeexec_pvl_slow_load_fix_applied.md`

---

## Backlog update (в Шаге 2)

В `plans/BACKLOG.md` в раздел истории за 2026-05-20:

```markdown
### 2026-05-20 ночь +4 (стратег + codeexec session `_100..102`)

- ✅ **BUG-PVL-SLOW-MATERIALS-LOAD** (renamed → ...PVL-ADMIN-PREVIEW-RACE-EMPTY-STUB?) —
  P1 fix applied: loader пока sync не finished + header «Вы видите как
  ученица: <имя>» + SWR (5 сек TTL) для AdminPvlProgress + убран
  дубликат getUsers. Sub-tasks 1+2+3 из _99 decisions. Verified
  Ольгой через incognito smoke (admin preview). Bundle: <hash>.
  Сессии _100, _101, _102.
```

---

## Что НЕ делать (повтор)

- ❌ `git push --force` / `git commit --amend` без явного 🟢
- ❌ Не запускать parallel другие фичи
- ❌ Не делать smoke под учёткой реальной ученицы — только под admin
- ❌ Не trigger'ить deploy дважды (один commit → один push → один
  deploy)

---

## Timeline

- Шаг 1 (diff `_101`): ~30-45 мин
- Шаг 2 (apply + push + smoke + report `_102`): ~30-45 мин
- Итого: ~1-1.5 часа

---

## После batch'a

Side-тикеты `OBS-001-CADDY-ACCESS-LOG`, `PERF-CHECK-ADMIN-PROGRESS-SUMMARY-RPC`,
`CI-PATHSIGNORE-CLAUDE` — когда удобно, отдельно, не сейчас.
