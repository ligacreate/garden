---
title: «Всего материалов: 0» в admin preview — recon отчёт
date: 2026-05-24
author: codeexec (VS Code)
status: read-only recon done, waiting Ольга SQL + Network tab
related:
  - cb24ad5 (BUG-PVL-SLOW-MATERIALS-LOAD, 2026-05-21) — НЕ источник
  - phase37 (2026-05-23) — НЕ источник
  - ba057b6 (наш сегодняшний actorsSyncReady fix) — НЕ источник
  - _124, _125, _126 — actorsSyncReady incident
---

# «Всего материалов: 0» в admin preview под Еленой Курдюковой — recon

## TL;DR

**Скорее всего — пустая выдача из БД (cms_content_items / cms_placements) или RLS блокирует под admin JWT.** Менее вероятно — sync failure (syncPvlRuntimeFromDb упал, db.contentItems = []). cb24ad5 и phase37 — **скорее всего не источники**, я не нашёл связи кода материалов с ними.

`/reset/` на скриншоте — **отдельная история**, не баг материалов: это валидный entry для password reset flow, копия dist/index.html в dist/reset/.

---

## ⚡ UPDATE 2026-05-24 23:xx — после SQL+curl recon

**H1 (БД пуста) — ОПРОВЕРГНУТ.** БД полна:
- `pvl_content_items` = **59 строк, все published, все target_cohort_id = Поток 1**
- `pvl_content_placements` = 41 строка, из них **20 lessons для student/both** (для tracker)
- Реальные имена таблиц — `pvl_*`, а не `cms_*` (в коде frontend они называются `cmsItems`/`cmsPlacements`, но через PostgREST идут на правильные `pvl_*` endpoints — см. `services/pvlPostgrestApi.js:702`).

**H3 (cohort Елены) — ОПРОВЕРГНУТ.** Елена Курдюкова:
- role=applicant, access_status=active, cohort_id=`11111111-...-101` = Поток 1
- Подхвачена phase37 trigger'ом (applicant→active path, не section 7 backfill для interns)
- Cohort правильный, материалы Поток 1 должны быть видны

**H4 (cb24ad5/phase37) — ОПРОВЕРГНУТ.** Не нашёл связи кода материалов с этими коммитами.

**RLS НЕ режет.** Функция `has_platform_access(uuid)`:
```sql
RETURNS true IF (p.role = 'admin' OR access_status = 'active')
```
Под Ольгой (admin/active), Еленой (applicant/active), Викторией (applicant/active) — все возвращают `true`.

**H2 (sync failure) — PRIMARY HYPOTHESIS, подтверждается косвенно:**

`curl https://api.skrebeyko.ru/pvl_content_items?select=id&limit=5` (без JWT) →
```
HTTP 401
{"code":"42501","details":null,"hint":null,"message":"permission denied for table pvl_content_items"}
```

Grants: только `authenticated` имеют SELECT на `pvl_content_items`. **Без валидного JWT — 401**.

Код `loadRuntimeSnapshot` (pvlPostgrestApi.js:697-725):
- Promise.allSettled на 4 endpoint'а
- Если упал → пишет в console.error и в snapshot._partial.failed
- Caller (syncPvlRuntimeFromDb pvlMockApi.js:1074) отправляет alert в MON-001 через reportClientError

**Ольга сказала «TG-бот молчит»** — значит snapshot._partial не triggered. Тогда возможны два варианта:

### Вариант 2a: snapshot пришёл из cache localStorage (наиболее вероятно)

`syncPvlRuntimeFromCache` (pvlMockApi.js:1061) — **синхронно применяет кэш ДО любых сетевых запросов** (PvlPrototypeApp.jsx:8126):
```js
if (syncPvlRuntimeFromCache()) {
    const cached = buildMergedCmsState();
    setCmsItems(cached.items);     // ← применяется ПЕРВЫМ
    ...
}
```

Если в localStorage Ольгиного браузера есть **устаревший пустой snapshot** (записан раньше, когда был sync failure / 401), и ему ≤24 часов — применится пустой snapshot. Дальше `syncPvlRuntimeFromDb` может тихо не догнать (например, под текущий JWT тоже 401), и пустой cache остаётся.

### Вариант 2b: 4 endpoint'а вернули []

Если PostgREST вернул HTTP 200 с пустым массивом — это не fail, не попадает в _partial. На клиенте `db.contentItems = []` → 0 материалов, без alerts.

Но если БД полна и RLS не режет — единственный способ получить [] под валидным admin JWT — это **другая authentication ошибка** (например, JWT scope не authenticated, а anon-like). В PostgREST анонимка под web_anon без grants → 401, не 200+[]. Так что 2b маловероятен.

## Что нужно от Ольги — конкретно

### Шаг 1 (30 секунд): Очисти localStorage

1. DevTools → Application → Storage → Local Storage → `https://liga.skrebeyko.ru`
2. Найди ключ `pvl_runtime_swr_v1` (или похожий с `swr`)
3. Удали его
4. Также: Application → Storage → "Clear site data" (full reset)
5. Hard reload Cmd+Shift+R
6. Открой /admin/library

Если **материалы появились** → корень был cache 2a, локально fix'или. Дальше нужно понять, как туда попал пустой snapshot (race? предыдущий 401?). Глобальный fix — invalidate cache при auth-change.

### Шаг 2 (если не помогло): Network tab

1. DevTools → Network → XHR
2. Hard reload, открой /admin/library
3. Найди `api.skrebeyko.ru/pvl_content_items?...`
4. Скажи мне:
   - Status code (200 / 401 / 500?)
   - Response Headers — есть ли `Authorization` в request headers?
   - Response body длина (если 200 — пусто `[]` или большой массив?)

### Шаг 3 (параллельно): Console errors

DevTools → Console — есть ли:
- `[PVL loadRuntimeSnapshot] pvl_content_items failed: ...`
- Errors с `401` / `permission denied`
- Errors про syncPvlRuntimeFromDb / syncPvlActorsFromGarden

## Связка с виктория7286 login-hang

**УТОЧНЕНИЕ из SQL:** viktorovna7286 имеет `pvl_students` row (`has_pvl_row=t`), cohort_id=Поток 1, role=applicant, access_status=active. **Не orphan.** Подхвачена phase37 trigger'ом.

**Login-hang гипотеза обновлена:** возможно, у неё **тот же sync issue** что и у Ольги — JWT/cache проблема:
- Login flow подождёт sync материалов (если такой waitpoint есть на frontend)
- Sync падает (401) или возвращает пусто из cache → loader навсегда

Если Ольга после очистки localStorage увидит материалы — попроси Виктория тоже сделать "Clear site data" в браузере и попробовать заново. Это **дешёвый workaround** на проверку гипотезы.

## Что НЕ может быть из-за нашего ba057b6 fix

Наш fix `actorsSyncReady` не трогает sync / cache / endpoints. Если материалы не появились — это **не от него** и **не от phase37** (БД полна, cohort правильный, RLS не режет). Корень — на уровне auth/JWT/cache flow.

---

## Открытый вопрос (не для текущего инцидента)

Если cache 24ч + пустой snapshot реально воспроизводится — это **architecture bug** (cache should not persist empty snapshots, or should auto-invalidate on auth state change). Это P2/P3 тикет на будущее: `BUG-PVL-CACHE-PERSISTS-EMPTY-SNAPSHOT`.

## 1. Поток загрузки материалов (что я подтвердил кодом)

### Admin preview /admin/library

```
AdminPage (route='/admin/library', admin)
  → wrapNav: '/admin/library' → '/student/library' (превращает в student route внутренне)
  → <StudentPage studentId={getFirstCohortStudentId()}, routePrefix='/admin'>
     studentId = первая ученица из getAdminStudents({})  (PvlPrototypeApp.jsx:152-160)
  → StudentPage(/student/library)
  → pvlDomainApi.studentApi.getStudentLibrary(studentId, {})  (pvlMockApi.js:3094)
  → getLibraryUiItemsForStudent(studentId)  (pvlMockApi.js:2503)
  → getPublishedLibraryContentForStudent(studentId)  (pvlMockApi.js:2473)
     cohortId = profile?.cohortId || 'cohort-2026-1'  (line 2481)
  → getPublishedContentFor(STUDENT, 'library', cohortId)
     фильтрует db.contentItems + db.contentPlacements
```

### Admin preview /admin/tracker

```
AdminPage (route='/admin/tracker', admin)
  → <StudentPage studentId={Елена.userId}, route='/student/tracker'>
  → StudentCourseTracker(
      modules={buildTrackerModulesFromCms(
        cmsItems,
        cmsPlacements,
        resolveStudentCohortIdForPvl(studentId)
      )}
    )                                          (PvlPrototypeApp.jsx:3381, 3409)
  
  resolveStudentCohortIdForPvl(studentId):     (PvlPrototypeApp.jsx:224)
    p = db.studentProfiles.find(userId===studentId)
    return p?.cohortId || 'cohort-2026-1'
```

### Источник `cmsItems` / `cmsPlacements`

```
PvlPrototypeApp:8083
  const [cmsItems, setCmsItems] = useState(() => buildMergedCmsState().items);

buildMergedCmsState():                          (PvlPrototypeApp.jsx:180)
  if (pvlPostgrestApi.isEnabled())  → useDbOnly = true
                                    → берёт ТОЛЬКО db.contentItems (mock items пропускаются)
  else                              → объединяет db + mock

db.contentItems / db.contentPlacements заполняются в:
  applyRuntimeSnapshot(snapshot)               (pvlMockApi.js:1041)
    ← syncPvlRuntimeFromDb()                   (pvlMockApi.js:1074)
    ← await pvlPostgrestApi.loadRuntimeSnapshot()  → API call в БД

  ⚠ В applyRuntimeSnapshot:
  if (import.meta.env.DEV && mappedItems.length === 0 && ...) {
      ensureLocalDemoLessonContent();
  }
  ↑ На ПРОДЕ (NODE_ENV=production) этот fallback НЕ работает.
  ↑ Если БД пуста / RLS режет — db.contentItems останется [] → 0 материалов.
```

## 2. Что нужно от Ольги (read-only, до диагноза)

### A. SQL counts в проде (твой prompt — выполни)

```sql
SELECT 'pvl_course_lessons' as t, count(*) FROM pvl_course_lessons
UNION ALL SELECT 'pvl_homework_items',         count(*) FROM pvl_homework_items
UNION ALL SELECT 'pvl_homework_items_modules', count(DISTINCT module_number) FROM pvl_homework_items
UNION ALL SELECT 'cms_content_items',          count(*) FROM cms_content_items
UNION ALL SELECT 'cms_placements',             count(*) FROM cms_placements
UNION ALL SELECT 'cms_content_items_published',
       count(*) FILTER (WHERE status = 'published') FROM cms_content_items
UNION ALL SELECT 'cms_placements_published_student_lessons',
       count(*) FILTER (
         WHERE target_section = 'lessons'
           AND target_role IN ('student','both')
           AND COALESCE(is_published, true) = true
       ) FROM cms_placements;
```

**Что покажет:**
- Если `cms_content_items = 0` или `cms_placements = 0` → **корень**: БД действительно пуста (TRUNCATE / DELETE случайно? выкатили миграцию, которая дропнула?). Bug **не в коде**, а в данных.
- Если `cms_content_items > 0` но `cms_content_items_published = 0` → все материалы в draft, frontend всё корректно их не показывает.
- Если `cms_placements_published_student_lessons = 0` → tracker точно покажет 0 (он гейтит по placements).
- Если **всё > 0** → корень не в БД, идём в Network tab.

### B. SQL — что изменилось за 48 часов

```sql
SELECT 'cms_content_items'  as t, max(updated_at) FROM cms_content_items
UNION ALL SELECT 'cms_placements',     max(updated_at) FROM cms_placements
UNION ALL SELECT 'pvl_course_lessons', max(updated_at) FROM pvl_course_lessons  -- колонка добавлена phase37 v2 (2026-05-23) DEFAULT now()
UNION ALL SELECT 'pvl_homework_items', max(updated_at) FROM pvl_homework_items
UNION ALL SELECT 'pvl_students',       max(updated_at) FROM pvl_students;
```

**Важный nuance:** `pvl_course_lessons.updated_at` колонка **только что добавлена в phase37 v2** с `DEFAULT now()` — ВСЕ existing rows получили `updated_at = время apply phase37`. То есть max() покажет момент apply phase37, не реальную последнюю правку. Это не баг, просто артефакт миграции.

### C. SQL — поток / cohort у Елены Курдюковой

```sql
SELECT p.id, p.email, p.name, p.role, p.access_status,
       ps.cohort_id, c.title AS cohort_title, c.start_date, c.end_date
  FROM public.profiles p
  LEFT JOIN public.pvl_students ps ON ps.id = p.id
  LEFT JOIN public.pvl_cohorts  c  ON c.id  = ps.cohort_id
 WHERE p.name ILIKE '%Курдюков%' OR p.email ILIKE '%kurdyukov%';
```

**Что покажет:**
- Если `ps.cohort_id IS NULL` или `ps.id IS NULL` → Елена не была backfilled phase37 → tracker и library пользуются fallback `'cohort-2026-1'`. Это **не должно** ломать tracker (он сам fallback'ает к Потоку 1), но **может** ломать library (где cohortId резолвится через profile).
- Если `cohort_id = 11111111-1111-1111-1111-111111111101` (UUID Потока 1) → cohort правильный, проблема не в нём.
- Если другой UUID (новый Поток 2 = `gen_random_uuid()` из phase37 section 2) → она в Потоке 2, где материалов пока нет.

### D. API endpoint test под admin JWT

```bash
# JWT можно взять из локального localStorage (DevTools → Application → Local Storage → liga.skrebeyko.ru → ищи sb-access-token или auth.token)
JWT="<paste>"

curl -s -H "Authorization: Bearer $JWT" \
  "https://api.skrebeyko.ru/cms_content_items?select=id,status,target_cohort_id&limit=5" | head -50

curl -s -H "Authorization: Bearer $JWT" \
  "https://api.skrebeyko.ru/cms_placements?select=id,target_section,target_role,is_published,cohort_id&target_section=eq.lessons&limit=5" | head -50

curl -s -H "Authorization: Bearer $JWT" \
  "https://api.skrebeyko.ru/pvl_homework_items?select=id,title,module_number,item_type&limit=5" | head -50
```

**Если 401/403** → JWT просрочен или RLS режет (нужен анализ policies). Если возвращает `[]` под admin'ом — RLS даже админу не отдаёт (новая policy?). Если возвращает данные — bug на фронте.

### E. Network tab в браузере (быстрее SQL)

1. Открой `/admin/library` в DevTools → Network → XHR
2. Найди запросы на `api.skrebeyko.ru/cms_content_items?...` и `api.skrebeyko.ru/cms_placements?...`
3. **Status code, response size, response body length:**
   - 200 + body длиной 2-3 байта `[]` → БД пуста или RLS режет
   - 200 + большой массив → bug на фронте (фильтрация по cohort/status)
   - 401/403 → JWT не валидный или RLS Policy сменилась
   - 500 → backend упал
4. Console — есть ли `[pvlMockApi.syncPvlRuntimeFromDb]` errors? `loadRuntimeSnapshot partial degradation`?

## 3. Гипотезы (ранжированные)

### H1 (most likely): cms_content_items / cms_placements реально пусты или почти пусты

**Сигнал:** `cms_content_items = 0` или `cms_placements_published_student_lessons = 0` в SQL.

**Откуда взяться:** случайный TRUNCATE / DELETE через админ-UI (CMS-центр), или миграция в субботу? `git log` per BACKLOG / лоn admin-actions / audit-log таблица.

**Recovery:** восстановление из бэкапа БД (если Timeweb даёт). Бэкап вчерашний может быть до проблемы.

### H2: syncPvlRuntimeFromDb упал, db.contentItems = []

**Сигнал:** в Console errors про `loadRuntimeSnapshot` или `partial degradation`. Network tab показывает 401/403/500 на cms_* endpoints. localStorage `pvl_runtime_swr_v1` устаревший (≥24ч) или пустой.

**Откуда взяться:** PostgREST упал, JWT expired, RLS policy сменилась под admin role. На проде нет DEV fallback `ensureLocalDemoLessonContent`.

**Recovery:** перезапустить PostgREST / обновить JWT / Ольга re-login. Проверить RLS policies на cms_*.

### H3: Елена Курдюкова — в Потоке 2 (или cohort=NULL), материалов для её потока ещё нет

**Сигнал:** в SQL `ps.cohort_id` ≠ Поток 1 UUID. Например, `gen_random_uuid()` от Потока 2 из phase37 section 2.

**Откуда:** если phase37 trigger сработал для Елены **после** старта Потока 2 (15.09 — не, ещё не наступило), значит маловероятно. Скорее, она ВСЕГДА была в каком-то старом cohort, и phase37 backfill её НЕ затронул (она не intern, или у неё уже был pvl_students row до phase37). Тогда её cohort_id не менялся.

**Эффект:** 
- В **library** — `cohortId = profile.cohortId || 'cohort-2026-1'` → если Поток 2 UUID не маппится в seed (mapping таблица в pvlMockApi.js:158 знает только Поток 1 UUID), `sqlCohortUuidToSeedId` вернёт null → `cohortSeed = null` → `profile.cohortId = null` → fallback `'cohort-2026-1'` → ОК.
- В **tracker** — `resolveStudentCohortIdForPvl(studentId).cohortId || 'cohort-2026-1'` → то же самое, fallback ОК.

Так что эта гипотеза скорее **не корень**, разве что есть какая-то логика, которую я не разобрал.

### H4: cb24ad5 / phase37 как корень

**Скорее всего НЕТ:**
- cb24ad5 не убирал источник материалов. Он добавил guard `actorsSyncReady` (теперь починен в ba057b6) и amber banner. `ensurePvlPreviewStudentProfile()` всё ещё существует как fallback.
- phase37 затронул только `pvl_*` таблицы. `cms_content_items` / `cms_placements` не трогал.
- Косвенно: phase37 v2 добавил `updated_at` в `pvl_course_lessons`. Если какой-то BEFORE INSERT trigger на `cms_content_items` ссылается на `pvl_course_lessons.updated_at` — раньше валился, теперь нет. Но я не нашёл такого trigger'а в migrations.

### H5: actorsSyncReady guard не снят (наш ba057b6 fix не работает)

**Сигнал:** на /admin/library постоянно loader, не доходит до StudentPage. Но Ольга описывает «Всего материалов: 0» — это уже отрисованная страница, значит guard снят, StudentPage отрендерился, просто пустой. **Не корень.**

## 4. /reset/ — отдельная история, не корень

Файл `scripts/postbuild-reset.mjs` копирует `dist/index.html` → `dist/reset/index.html`. Это **идентичная копия** SPA bundle'а — нужна, чтобы при заходе на `/reset/?token=...` (password reset link) браузер не получил 404 от nginx, а получил тот же React app, который дальше разрулит роут внутренне (показать форму смены пароля по token из query string).

`grep "/reset"` в коде:
- `services/dataService.js:1346` — `authFetch('/auth/reset', {...})` — это API call на auth.skrebeyko.ru/auth/reset, не клиентский route
- `scripts/postbuild-reset.mjs` — build helper
- В Router'е React (App.jsx или PvlPrototypeApp.jsx) нет route `/reset`, значит SPA при заходе на `/reset/` бросит на default route.

**Что могло произойти на скриншоте Ольги:**
- Ольга ранее открывала password reset link (тестировала или случайно) → URL стал `/reset/`
- SPA загрузился, нет route '/reset/' → React показывает default (например, /admin/dashboard или login)
- Ольга кликнула на «Трекер» в меню → SPA внутренне сменил content, но **URL в адресной строке** мог не обновиться (если используется hash routing или баг в navigate)
- Скриншот заснял момент после клика на «Трекер» — URL `/reset/`, контент трекерный

**Это side finding, не bug материалов.** Если Ольгу беспокоит — отдельный recon `BUG-ROUTER-URL-NOT-SYNCING`. Сейчас проверь — на «нормальной» сессии (login через `/`, не через reset link) — материалы тоже пусты?

## 5. Связь с виктория7286 login-hang

Из _125 я уже предполагал orphan applicant без `pvl_students` row. Если у виктория7286 та же история, что и у Елены (cohort_id NULL, или syncActorsFromGarden упал на её user'е) — это **косвенно** одна категория проблем.

**Гипотеза-связка:** если syncPvlActorsFromGarden зависает на одном user'е → `db.studentProfiles` неполный → у Елены `profile.cohortId = null` → fallback на 'cohort-2026-1' → но и `pvlDomainApi.adminApi.getAdminStudents` тоже может быть неполный → admin UI / preview не работает.

Это всё гипотезы, проверить SQL'ом + Network tab.

## 6. Read-only — ничего не делаю

До твоего диагноза (SQL counts + Network tab) — никакого apply / commit / push / data write. Жду какая из гипотез H1-H4 подтвердится → планируем fix.

Если H1 (БД пуста) — fix на уровне данных (restore from backup), не код.
Если H2 (sync failure) — fix на инфре (PostgREST/JWT/RLS).
Если H3 (cohort_id Елены) — fix на уровне SQL backfill для Елены конкретно.
Если H4 (миграция) — recon миграции и rollback.
