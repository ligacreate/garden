# BUG-PVL-SLOW-MATERIALS-LOAD — recon отчёт

**От:** codeexec (VS Code)
**Кому:** Ольга → стратегу
**Дата:** 2026-05-20 ночь
**В ответ на:** [_97](2026-05-20_97_strategist_pvl_slow_load_recon.md)
**Статус:** Read-only recon, БЕЗ apply/commit/push, никаких API-вызовов
от своего имени (telemetry не засорял).

---

## TL;DR

Главная причина не perf, а **race condition на первом mount без SWR
кэша** + **UX confusion с preview-as-first-student**. Сетевые запросы
параллельны и не медленные (4 endpoints, 53+38+57+6 rows). У админа
есть зеркальный sidebar (`/admin/library`, `/admin/tracker` и т.п.),
но он рендерит StudentPage от имени **первой абитуриентки**, не
саму админ. Если на момент клика `studentProfiles` ещё не
загрузились — рендерится preview-stub с пустым прогрессом → выглядит
как «материалов нет, надо обновить».

---

## 1. Какой view админ открывает

Админ в курс попадает **двумя путями**:

| Маршрут | Компонент | Что показывает |
|---|---|---|
| `/admin/pvl` | `AdminPvlProgress` в `AdminPanel` ([AdminPanel.jsx:779](../views/AdminPanel.jsx#L779)) | Сводка прогресса всех ученищ потока |
| `/admin/content`, `/admin/content/:id` | CMS-editor в `PvlPrototypeApp` | Редактирование материалов/уроков |
| **`/admin/library`, `/admin/tracker`, `/admin/lessons`, `/admin/about`, `/admin/glossary`, `/admin/practicums`, `/admin/results`, `/admin/certification`, `/admin/self-assessment`** | **`StudentPage` через preview** ([PvlPrototypeApp.jsx:7571-7613](../views/PvlPrototypeApp.jsx#L7571)) | **Студенческий вид от имени first cohort student** |

Это **то место**, куда «нужно много раз обновлять чтобы появились
материалы». Админ нажимает «Библиотека» в admin sidebar, маршрут
`/admin/library` → проходит через `ADMIN_COURSE_ROUTE_RE`
([PvlPrototypeApp.jsx:311](../views/PvlPrototypeApp.jsx#L311)) →
рендерится `StudentPage` с `studentId = getFirstCohortStudentId()`
([PvlPrototypeApp.jsx:7572](../views/PvlPrototypeApp.jsx#L7572)).

## 2. Batch-fetch flow при init/open

### 2.1. App.jsx init (для всех роли) — **уже параллельно**

[App.jsx:106-142](../App.jsx#L106) `loadAndApplyInitialData`:

```
Promise.allSettled([
  api.getUsers(),
  api.getKnowledgeBase(),
  api.getLibrarySettings(),
  api.getNews(),
])
```

4 parallel, `allSettled` (один битый не валит остальные). OK.

### 2.2. PvlPrototypeApp mount (SWR-pattern) — **хорошо**

[PvlPrototypeApp.jsx:8087-8127](../views/PvlPrototypeApp.jsx#L8087):

1. **Instant**: `syncPvlRuntimeFromCache()` из localStorage
   ([pvlMockApi.js:1024](../services/pvlMockApi.js#L1024) — `RUNTIME_SWR_KEY`).
2. **Async**: `syncPvlRuntimeFromDb()` →
   `loadRuntimeSnapshot()` ([pvlPostgrestApi.js:697-725](../services/pvlPostgrestApi.js#L697)) —
   `Promise.allSettled` на 4 endpoint:
   - `pvl_content_items` (53 rows)
   - `pvl_content_placements` (38 rows)
   - `pvl_calendar_events` (57 rows)
   - `pvl_faq_items` (6 rows)
3. **Async**: `syncPvlActorsFromGarden()` ([pvlMockApi.js:1183-1422](../services/pvlMockApi.js#L1183)) —
   SWR кэш users из localStorage, либо retry [0, 100, 200] ms для
   `api.getUsers`. Заполняет `db.studentProfiles` / `db.mentorProfiles`.
4. **+600ms timeout**: повторный `syncPvlActorsFromGarden()` —
   compensate hardcoded задержку гидрации Garden token.
5. **+30s timeout**: ещё один `syncPvlActorsFromGarden()` —
   подхватывает изменения с других устройств.

Это **хороший** SWR pattern с трёх-уровневой защитой. **Если кэш в
localStorage есть** — UI появляется мгновенно, async fetches
обновляют в фоне.

### 2.3. AdminPvlProgress mount (НЕТ SWR) — **возможный источник
лагов**

[AdminPvlProgress.jsx:421-518](../views/AdminPvlProgress.jsx#L421):

1. `listCohorts()` — fetch на mount.
2. После cohort resolved → `getAdminProgressSummary(cohortId)` (RPC).
3. **Параллельный** `Promise.all` 4 fetch'а для отчёта:
   - `listHomeworkItems`
   - `listContentItems` ← **дубликат** того, что уже в `cmsItems` через PvlPrototypeApp/SWR
   - `listCourseWeeks`
   - `listCourseLessons`
4. **Дубликат** `api.getUsers()` ([AdminPvlProgress.jsx:511](../views/AdminPvlProgress.jsx#L511)) —
   уже был вызван в App init (line 108) и в `syncPvlActorsFromGarden`.

**Каждый mount AdminPvlProgress делает свежий fetch**, без кэша.
При навигации в/из tab `pvl-progress` это видно как новые requests.
Не критично (rows небольшие), но **не использует** существующий SWR.

## 3. Live telemetry (доступные каналы — пустые)

Пройдено по списку из брифа:

- ❌ **`garden-auth journalctl --since "10 min ago"`** — `-- No entries --`
  (админ либо имеет действующий JWT и его не перевыпускает; либо не
  на garden-auth flow прямо сейчас).
- ❌ **`/var/log/caddy/access.log`** — файла **нет** (Caddy unit active,
  но в Caddyfile нет `log {output file ...}` директивы → логирование
  ушло в journalctl, который тоже пустой за 10m).
- ❌ **`journalctl -u caddy --since "10 min ago"`** — `-- No entries --`.
- ❌ **`pg_stat_activity` snapshot** — 0 rows (никакие запросы
  не активны прямо сейчас; в managed Postgres у нас доступа к
  history/slow logs нет — PostgreSQL живёт на Timeweb отдельно
  от Bittern).

**Channel observability — большой gap.** Для дебага «у конкретной
админ-сессии медленно» нужны:
- access log на Caddy (легко включить — пара строк в Caddyfile)
- frontend perf API (Web Vitals → MON-001 или поле в clientErrorReporter)

Заведу follow-up `OBS-001-CADDY-ACCESS-LOG` P3.

**Реальные rows в БД** (точечный read-only check без mutation):

| Таблица | rows |
|---|---|
| `pvl_content_items` | 53 |
| `pvl_content_placements` | 38 |
| `pvl_calendar_events` | 57 |
| `pvl_faq_items` | 6 |
| `pvl_cohorts` | 1 |
| `pvl_students` | 15 |
| `profiles` | 58 |

Объёмы небольшие — **DB perf не причина**. Каждый из 4 parallel
fetch'ей `loadRuntimeSnapshot` должен возвращаться <200ms на типовой
Postgres + PostgREST.

## 4. БД findings

`pg_stat_activity` пуст. Без log access не вижу slow queries.

Не имея prepared statement timing — оцениваю по структуре:
- `listContentItems` → `select=*` без фильтров (нет index hint
  необходим)
- `listGardenMentorLinksByStudentIds` → `in.(<list of UUIDs>)`,
  лимит 15 ids
- `getAdminProgressSummary` — RPC, точно не вижу что внутри без
  доступа к Postgres function source. Это **подозрительное** место,
  потому что RPC обычно тяжелее SELECT.

Если есть подозрение на slow `getAdminProgressSummary`, можно
добавить `EXPLAIN ANALYZE` в read-only режиме (отдельно от админ
сессии). В этом recon — не делал, чтоб не задеть live telemetry
параллельной админ-работы.

## 5. Cache state

| Канал | Cache | Где |
|---|---|---|
| App init (users/kb/settings/news) | ❌ Нет cache, каждый F5 → 4 fetch'а | [App.jsx:106](../App.jsx#L106) |
| PvlPrototypeApp content snapshot | ✅ SWR в localStorage (`RUNTIME_SWR_KEY`) | [pvlMockApi.js:1078](../services/pvlMockApi.js#L1078) |
| Garden users (для studentProfiles) | ✅ SWR в localStorage (`USERS_SWR_KEY`), 1h TTL | [pvlMockApi.js:1185-1192](../services/pvlMockApi.js#L1185) |
| `AdminPvlProgress` (homeworkItems/contentItems/weeks/lessons/users) | ❌ Нет cache | [AdminPvlProgress.jsx:456](../views/AdminPvlProgress.jsx#L456) |
| `AdminPvlProgress.listCohorts` | ❌ Нет cache | [AdminPvlProgress.jsx:421](../views/AdminPvlProgress.jsx#L421) |
| `getAdminProgressSummary` RPC | ❌ Нет cache | [AdminPvlProgress.jsx:443](../views/AdminPvlProgress.jsx#L443) |

**SWR работает только для PvlPrototypeApp** (студенческий путь).
Админ-route `/admin/library` идёт через `StudentPage` → тоже видит
SWR-кэш `cmsItems`/`cmsPlacements` (хорошо). Но `AdminPvlProgress`
(tab «Дашборд» в админ-секции) — каждый раз свежий fetch.

## 6. Product gap — preview-as-student

✅ **Есть в коде** — admin sidebar содержит зеркальные маршруты
([PvlPrototypeApp.jsx:295-308](../views/PvlPrototypeApp.jsx#L295)):

```
ADMIN_SIDEBAR_CONFIG = [
  { label: 'Дашборд', path: '/admin/pvl' },
  { label: 'Ученицы', path: '/admin/students' },
  { label: 'Менторы', path: '/admin/mentors' },
  { label: 'Материалы курса', path: '/admin/content' },   // CMS
  { label: 'События', path: '/admin/calendar' },
  // divider
  ...COURSE_MENU_LABELS  // 'О курсе', 'Трекер', 'Календарь',
                         // 'Библиотека', 'Глоссарий', 'Результаты',
                         // 'Сертификация' → '/admin/<route>'
  // divider
  { label: 'Настройки', path: '/admin/settings' },
];
```

**НО** — preview работает через `getFirstCohortStudentId()`
([PvlPrototypeApp.jsx:152-160](../views/PvlPrototypeApp.jsx#L152)):

```js
function getFirstCohortStudentId() {
    try {
        const rows = pvlDomainApi.adminApi.getAdminStudents({});
        if (rows.length > 0) return rows[0].userId;
        return pvlDomainApi.ensurePvlPreviewStudentProfile();
    } catch {
        return pvlDomainApi.ensurePvlPreviewStudentProfile();
    }
}
```

UX-проблема:
1. Админ кликает «Библиотека» — рендер от лица **первой** ученицы из
   когорты (детерминированной от их `userId` order). Не «как админ»,
   не «как новенькая», не «как finished student». Произвольный
   снимок прогресса конкретного человека.
2. Если `getAdminStudents` пуст (студенты ещё не загружены через
   `syncPvlActorsFromGarden`) → fallback на `ensurePvlPreviewStudentProfile`
   — создаёт **техническую заглушку** с `cohortId: 'cohort-2026-1'`,
   `currentWeek: 0`, никаким прогрессом. Курс **выглядит пустым**
   потому что нет привязанных к этому stub-id записей.
3. Если сразу после этого `studentProfiles` подгружается из API →
   `getFirstCohortStudentId` следующий раз отдаст реальную
   ученицу. **Refresh → данные появились.**

**Это и есть «много раз обновлять».** Не perf, не retry loop, не
slow query — **race condition** + **fragile fallback**.

## 7. Гипотезы (ранжированные)

| # | Гипотеза | Вероятность | Объяснение |
|---|---|---|---|
| **A** | Race condition: `studentProfiles` ещё не подтянулись на момент рендера `/admin/<course-route>`, fallback на preview-stub → пустой курс | **Высокая** | Подтверждается кодом ([PvlPrototypeApp.jsx:7571-7613](../views/PvlPrototypeApp.jsx#L7571), [pvlMockApi.js:1437-1471](../services/pvlMockApi.js#L1437)). Соответствует «много раз обновлять, чтобы появились материалы». |
| **B** | Cache miss на первом заходе (нет SWR ключей `RUNTIME_SWR_KEY` / `USERS_SWR_KEY` в localStorage — incognito / cleared / новое устройство) | **Средняя** | После первой загрузки cache есть → следующие mount'ы мгновенные. Но первая загрузка всё равно блокирует UI на 4 параллельных fetch'а. |
| **C** | UX confusion: preview-as-first-student не очевиден ("вижу прогресс ученицы Веры, думаю что у меня сломано") | **Средняя** | Сам preview есть, но: (1) не помечен в UI как «вы видите как X», (2) первая ученица — random. Это **product gap UX**, не отсутствие feature. |
| **D** | Sequential / no-parallelisation | **Низкая** | Не подтверждается. App init, PvlPrototypeApp, AdminPvlProgress — все используют `Promise.all` / `Promise.allSettled`. |
| **E** | Retry loop на 4xx для admin endpoint | **Низкая** | Только `syncPvlActorsFromGarden` имеет 3-step retry [0, 100, 200ms] и только если SWR cache пуст. Не loop. |
| **F** | Slow DB / RPC (`getAdminProgressSummary`) | **Низкая** | Не верифицировано, но 53/38/57 rows объём не оправдывает «много раз обновлять». RPC возможно тяжелее — оставлю под подозрением, для отдельного check'а с EXPLAIN. |
| **G** | Дубль `getUsers` (App init + AdminPvlProgress + `syncPvlActorsFromGarden`) | **Низкая** | Каждый вызов ~50-100ms. Не **bloker**, но cleanable (см. п. 8). |

## 8. Effort estimate для возможных fix'ов

### P0 (~30 мин, чисто frontend)

- Добавить header в admin preview: **«Вы видите курс как ученица: ИМЯ»**
  + кнопку «Выбрать другую ученицу». Поверх existing `StudentPage` —
  без новых endpoint'ов.
- Резолюция race: если `getFirstCohortStudentId` вернул preview-stub
  на первом mount, **отложить рендер** до `syncPvlActorsFromGarden`
  finish'а (показать «Загрузка предпросмотра…» вместо пустого
  курса).

### P1 (~1 час)

- Кэширование `AdminPvlProgress` через SWR ключ (`adminProgressSummary
  + cohortId`). Не нужно при каждой навигации между табами заново
  fetch'ить.
- Убрать дубликат `getUsers` в `AdminPvlProgress` — использовать
  существующий `users` из App init (передать через context/prop).

### P2 (~2-3 часа, продуктовый)

- «View as» dropdown в admin sidebar: выбрать конкретную ученицу
  для preview (вместо first-from-list). Save selection в session.
- Добавить «View as preview student» (technical stub) и «View as
  new applicant» (пустой прогресс) explicit'но.

### Out-of-scope (но связано)

- **`OBS-001-CADDY-ACCESS-LOG`** (P3) — включить access log на Caddy
  для будущей diagnostics. ~10 минут (3 строки в Caddyfile).
- **`ARCH-003` (Graceful degradation в App.jsx init)** — этот recon
  его уточняет: текущий код уже использует `Promise.allSettled` +
  `maintenanceBanner` для partial degradation, но **AdminPvlProgress
  fetch failures** не имеют такой graceful обработки.

## 9. Open questions для стратега

1. **Принять preview-from-first-student как feature, или сделать
   "preview as new applicant" (пустая прогресс) по умолчанию?**
   Первое — fast (есть), но fragile/confusing. Второе — более
   честный preview, всегда одинаковый.
2. **`getAdminProgressSummary` RPC** — что внутри? Если медленный,
   стоит ли инвертировать в SQL view + RLS вместо RPC?
3. **Admin tab «Дашборд» (AdminPvlProgress) кэшировать или нет?**
   Свежесть данных важна, но 3-5 секунд cache TTL сильно бы ускорили
   ситуации «закрыл tab, открыл снова через 30 сек».
4. **Включить Caddy access log? (5-минутный fix)** — отдельно от
   этого тикета.

## 10. Что НЕ сделано (по правилу брифа)

- ❌ Не дёргал API endpoint'ы от своего имени (telemetry не засорял).
- ❌ Не правил DB, не делал UPDATE / DELETE.
- ❌ Не публиковал полные логи (логи всё равно были пустые).
- ❌ Не trace'ил конкретную **админ-сессию** прямо сейчас (Caddy
  access log off — нет возможности). Гипотезы построены на static.
- ❌ Не apply'ил никаких правок — read-only recon.
