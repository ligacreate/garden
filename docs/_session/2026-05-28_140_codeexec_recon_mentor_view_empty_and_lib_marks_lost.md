# Recon 2026-05-28 — Mentor view пуст у Василины + метки «Изучено» слетели у Ирины

**Адресат:** Ольга (связной) → стратег.
**Автор:** VS Code Claude Code (codeexec).
**Дата:** 2026-05-28.
**Режим:** read-only. psql под `gen_user` + чтение исходников. Изменений в код **не вносил** — остановился по правилу пункта 5 ТЗ Ольги.

---

## TL;DR

- **Данные в БД ЕСТЬ для обеих.** Daily Timeweb wipe / writes не подкошены.
- **Явной регрессии в коде от сегодняшних deploys не нашёл.** Все 5 последних
  commits (`5e36843`, `46cc058`, `27c1388`, `97f486b`, `12d3c46`, `d39db29`)
  трогают: SW version, embedded sidebar nav, eager import, peer-page button.
  Ни один не правит `getMentorMentees` / `listGardenMentorLinksByStudentIds` /
  `processStudentTrackerAndHomework` / `persistContentProgressToDb`.
- **Stопаюсь и отчитываюсь по правилу пункта 5 ТЗ** — root cause не определён,
  fix вслепую делать рискованно (могу сломать сегодняшние работающие фиксы).
- **Гипотезы и проверочные шаги** — ниже.

---

## 1. Recon БД (read-only)

### 1.1. Василина (mentor) — `pvl_garden_mentor_links`

`mentor_id = 6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7`:

```
 student_id                            | updated_at
 d302b93d-…-526dfe8c4a15 (Лилия Мaлонг)      | 2026-04-16 09:33
 d128a7a3-…-cd72d69f9837 (Марина Шульга)     | 2026-04-17 16:19
 90c9b7c7-…-49d79fc571b1 (Ольга Разжигаева)  | 2026-05-18 14:33
```

3 связки → в БД всё есть, recon _129 §7.2 подтверждается.

`has_platform_access(Василина) = true`, RLS `mentor_id = auth.uid()` пускает SELECT.

### 1.2. Ирина (student) — `pvl_student_content_progress`

`student_id = 35019374-d7de-4900-aa9d-1797bcca9769`:

- **37 строк всего, 26 completed=true.**
- Последняя запись completed=true: 2026-05-28 13:30 (СЕГОДНЯ) →
  значит запись `markLibraryItemCompleted` → `persistContentProgressToDb`
  на её клиенте сегодня сработал хотя бы раз.
- `has_platform_access(Ирина) = true`.

### 1.3. `course_progress` (обычная Garden-библиотека, НЕ ПВЛ)

Если жалоба Ирины касается не ПВЛ-библиотеки, а `views/CourseLibraryView.jsx`
старой (без префикса `pvl_`): таблица `course_progress` содержит **91 строку
всего**, по курсам `course_title`:

```
 Социальная психология | 32
 Сценарии лиги         | 22
 Начало пути           | 21
 Инструкции            | 15
 Debug Course          |  1
```

**По «Ритм» / «Драматургия» — НИ ОДНОЙ строки ни у кого.** У Ирины в
`course_progress` всего 1 запись («Инструкции/29»).

⚠ Это либо значит, что курсов «Ритм» / «Драматургия» вообще нет в old
Garden-библиотеке, либо там никто никогда не сохранял прогресс под этими
заголовками. То есть жалоба Ирины с большой вероятностью про **ПВЛ-библиотеку**
(см. §1.2 — там 37 строк, и «Ритм» и «Драматургия» — это, скорее всего,
названия категорий/модулей PVL).

---

## 2. Что менялось за 24 часа (5 коммитов)

```
d39db29  fix(pvl): кнопка «Я провела» на своей peer-странице (mobile)
           — public/sw.js + views/PvlPeerProfileView.jsx
27c1388  fix(pvl): eager import PvlPrototypeApp
           — public/sw.js + views/CourseLibraryView.jsx (убрал Suspense)
97f486b  fix(pvl): mobile sidebar items
           — public/sw.js + services/pvlGardenNav.js + CourseLibraryView.jsx (пробросил studentId)
46cc058  Revert auto-refresh hotfix
           — views/PvlPrototypeApp.jsx (вернулось setTimeout(30s), убраны setInterval+focus+visibility)
5e36843  chore: bump sw.js version
           — public/sw.js
```

**Ничего из перечисленного не трогает:**
- `services/pvlMockApi.js` (там `hydrateGardenMentorAssignmentsFromDb`,
  `processStudentTrackerAndHomework`, `getMentorMentees`,
  `markLibraryItemCompleted`, `persistContentProgressToDb`)
- `services/pvlPostgrestApi.js#listGardenMentorLinksByStudentIds` /
  `listStudentContentProgress` (там добавили только training_sessions/feedback)
- `services/dataService.js#getCourseProgress` /
  `markCourseLessonCompleted` / `getUsers`

То есть **код, читающий menti и метки «Изучено», за последние 3+ суток
не менялся**.

---

## 3. Гипотезы (не подтверждены)

### H1. SW cache-bust поломал клиентский side state
- Сегодня SW version бампался 4 раза. На активации новый SW убивает все
  caches и делает `clients.claim()`.
- Не должен трогать localStorage / IndexedDB.
- Hard reload у Василины не помогает → если бы это был просто stale chunk,
  hard reload бы вылечил. **Гипотеза слабая.**

### H2. Revert auto-refresh (`46cc058`) убрал спасательную retry-сеть
- Вернули `setTimeout(30s)` вместо `setInterval(30s) + visibilitychange + focus`.
- Это значит: если первый `syncPvlActorsFromGarden` упал (network/timing) —
  retry-точек нет до hard reload.
- **Но Василина пишет, что hard reload не помогает** → значит первичный sync
  у неё тоже не отрабатывает, не только повторный.
- Гипотеза не объясняет устойчивое воспроизведение, но объясняет, почему
  раньше «иногда отпускало».

### H3. `hydrateGardenMentorAssignmentsFromDb` зависит от `db.studentProfiles`
- Функция читает links ТОЛЬКО по `student_id IN (db.studentProfiles[].userId)`.
  Если в `db.studentProfiles` нет учениц Василины — её связки не подтянутся.
- `db.studentProfiles` наполняется из `api.getUsers()` (SWR cache 1 час).
- Если SWR cache `pvl_users_swr_v1` содержит stale выборку без её учениц —
  ментор-вид пуст. Но cache работал всегда так же, регрессии не вижу.

### H4. У Ирины — partial hydrate
- 37 строк в БД содержат UUID-ы content_item_id. Если bundle обновился и в
  `db.contentItems` теперь другой набор id (на самом деле админ контент
  не менял — но мог измениться mapping), то pr.libraryItemId не совпадёт
  с item.id → `completed=false` в UI.
- Гипотеза слабая, без changes в админке id не должны двигаться.

### H5. Браузер Василины удерживает stale bundle
- В тексте commit `5e36843` сама Ольга писала: «у браузера менти удерживается
  stale CourseLibraryView/main entry». Но это про мобильный sidebar.
  После eager import (`27c1388`) этот класс багов должен был уйти.

---

## 4. Что нужно от Ольги, чтобы двигаться дальше

Я не могу однозначно идентифицировать root cause из кода и БД. Нужны живые сигналы:

1. **DevTools console у Василины** при заходе в /mentor/dashboard:
   - Есть ли `[PVL] hydrate_mentor_links failed` / 401 / 403 / network errors?
   - Есть ли `MON-001` алерты?
   - Network tab: ходит ли вообще GET `/pvl_garden_mentor_links?student_id=in.(…)`
     и какой ответ?
   - В Application → Local Storage: что в `pvl_users_swr_v1`? Сколько профилей?
     Содержит ли её 3 менти (`d302…`, `d128…`, `90c9…`)?

2. **DevTools console у Ирины** на /student/library:
   - В Application → Local Storage какой URL у `pvl_users_swr_v1` (если он есть)?
   - Network: ходит ли GET `/pvl_student_content_progress?student_id=eq.…` и
     какой ответ?
   - Видны ли вообще конкретные уроки «Ритм» / «Драматургия» (если ID
     совпадают со старыми) или они вообще пропали?
   - Уточнить у Ирины: точно ли «Ритм/Драматургия» — это **ПВЛ-курс** или
     **обычная Garden-библиотека**? От этого зависит — копать в
     `pvl_student_content_progress` или в `course_progress`.

3. **Версия SW на их клиентах** (DevTools → Application → Service Workers):
   совпадает ли `SW_VERSION` со свежим `2026-05-27-pvl-etap1-own-page-button-fix`?
   Если у них до сих пор активен старый — значит активация не сработала и
   они на stale bundle.

---

## 5. Что я НЕ буду делать без отмашки

- ⛔ Не бампать sw.js ещё раз (это уже 4 раза за день, накапливаются
  chunk-hash flapping артефакты в `dist/`).
- ⛔ Не возвращать auto-refresh из `9a6192f` — он ломает RichEditor у
  менторов (Юля и сама Василина жаловались 2026-05-27 11:24).
- ⛔ Не трогать `hydrateGardenMentorAssignmentsFromDb` без подтверждения,
  что именно она пустая.
- ⛔ Не лезть в RLS / GRANTs — `has_platform_access` для обеих = true,
  policy `mentor_id=auth.uid()` корректная.

---

## 6. Если выбрать ОДНУ ставку (мой прогноз)

Я бы сначала проверил **гипотезу H3 (hydrate timing)** через DevTools у Василины:
если в `pvl_users_swr_v1` localStorage нет её менти, то корень в
`syncPvlActorsFromGarden` (api.getUsers вернул урезанный список).

Если её менти ТАМ есть, но `db.studentProfiles` после mount всё равно пустой —
значит, бага в самом `pvlMockApi` после revert (`46cc058`) или в init-order
после eager import (`27c1388`).

Без живых данных не угадать.

---

**Жду решения Ольги:**
A) дать DevTools-сигналы от Василины/Ирины (предпочтительно),
B) разрешить катить «ставку» на одну из гипотез,
C) подождать до конца тренировочного и копать спокойно.
