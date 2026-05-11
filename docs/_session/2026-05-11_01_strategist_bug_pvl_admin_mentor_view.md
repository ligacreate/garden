---
от: стратег (claude.ai)
кому: VS Code Claude Code (executor)
дата: 2026-05-11
тема: BUG-PVL-ADMIN-AS-MENTOR-EMPTY — учительская показывает «Список менти пуст» у admin'а
приоритет: P1 (живая жалоба от куратора курса)
---

# Hot recon — admin Ирина не видит своих менти в учительской ПВЛ

Ирина Одинцова (куратор Лиги, ментор курса) пишет утром 11 мая:
> «Оленька, привет! У меня не отображаются мои менты в списке проверок,
> написано список менти пуст. Обычно показан список и "нужа проверка"
> / "нет новых дз".»

---

## 1. Что стратег уже выяснила (read-only ssh + grep)

### 1.1 В БД всё на месте

Profile Ирины:
- `id = ebd79a0f-1bac-49f9-a3f2-aeeb165a10d7`
- `email = odintsova.irina.ig@gmail.com`
- `role = admin`
- `status = active`

В `pvl_garden_mentor_links` у Ирины **4 связки** (mentor_id = её ID),
last updated: 2026-04-16, 2026-04-17, 2026-05-06.

В `pvl_students` существуют **3 из 4** этих студенток:
- Дарья Зотова `8ed14494-...`
- Ольга Коняхина `629ffb8c-...`
- Наталья Махнёва `2f7abb9c-...`
- ❌ Четвёртая (`579a3392-4a73-4b21-ac5c-7a7f64f91147`) — **отсутствует
  в `pvl_students`** (отдельная подзадача, ниже).

Legacy `pvl_students.mentor_id` у всех трёх — **NULL** (это поле
не используется, мы перешли на `pvl_garden_mentor_links`).

### 1.2 Bundle Phase 2A работает, MON-001 не алертил

Текущий prod-bundle: `assets/index-Bt2WBfGK.js` (после Phase 2A
push 10 мая 22:40 МСК). Last TG-alert от MON-001 — вчерашний
smoke-test в 18:34 МСК (bundle 4OpZcjJF — то есть до Phase 2A).
За ~11 часов production **никаких JS-error** в TG. Это значит:
- bug **не JS exception**, не uncaught error;
- `getMentorMentees(mentorId)` возвращает `[]` **без throw** —
  frontend gracefully показывает «Список менти пуст» (текст в
  `views/PvlPrototypeApp.jsx:3619`).

### 1.3 Call site найден

```js
// views/PvlPrototypeApp.jsx:3540
const menteesFromApi = pvlDomainApi.mentorApi.getMentorMentees(mentorId);
```

Имплементация в `services/pvlMockApi.js:3056` —
`getMentorMentees(mentorId) { ... }`. **НЕ читал её полностью** —
ваша зона, проверь.

### 1.4 Recent commits

`pvlMockApi.js` — последний commit `7c28ed3` (8 мая,
BUG-PVL-COHORT-NULL-OVERWRITE). С тех пор файл не менялся.
**Регрессия от Phase 2A исключена** — мы PvlPrototypeApp не
трогали, pvlMockApi не трогали.

`PvlPrototypeApp.jsx` — тоже последний commit ранее 9 мая.

---

## 2. Гипотезы (от вероятной к менее)

### H1 — гард по role в `getMentorMentees` или upstream

В `pvlMockApi.js` где-то проверка типа:

```js
if (mentor.role !== 'mentor' && mentor.gardenRole !== 'mentor') return [];
```

Ирина = `role: 'admin'`, проваливается. Раньше **могло работать**
если в её profile когда-то стояло `mentor` или был fallback. После
ARCH-012/role-cleanup гард стал жёстче.

**Как проверить:**
- Найди в `pvlMockApi.js` все места где читается `role` /
  `gardenRole` относительно ментора.
- Особенно `syncPvlActorsFromGarden` и
  `mentorApi.getMentorMentees`/`getMentorMenteeCard`.
- Если гард есть → ответ ясен.

### H2 — `mentorId` не разрешается на её UUID

Возможно `mentorId` берётся не из `currentUser.id`, а из
другой переменной (например, `selectedMentor` из dropdown'а
или `mentorProfileId` из pvlMockApi state). Если sync для
Ирины не прошёл — её ID не в studentProfiles → результат
пустой.

**Как проверить:**
- Найти `MentorMenteesGardenGrid` использующий site
  (вероятно `MentorView` или `MentorHomeBlock` в
  `PvlPrototypeApp.jsx`).
- Понять, какой `mentorId` передаётся.
- Если это `currentUser.id` — H1 более вероятна. Если другой
  источник — копаем sync.

### H3 — `syncPvlActorsFromGarden` не отрабатывает для admin'а

Sync функция может пропускать тех, у кого role=admin (потому что
кодом раньше было «синкаем только тех кого user видит как
ментор», и для admin отдельно ничего не настроено).

**Как проверить:**
- `services/pvlMockApi.js:1072` — `syncPvlActorsFromGarden`.
- Посмотреть условия отбора, особенно фильтры по role.

### H4 — JWT/session race + state не инициализирован

Менее вероятна, но возможна: при первой загрузке pvlMockApi не
успевает синкнуться с Garden до того, как UI рендерит. Hard
reload должен лечить — Ирину уже попросили.

---

## 3. Что делать

### 3.1 Recon (read-only, 20-30 минут)

1. Прочитай `services/pvlMockApi.js`:
   - `getMentorMentees` (line ~3056).
   - `syncPvlActorsFromGarden` (line 1072).
   - Любые гарды по `role`/`gardenRole` в этих функциях и в
     `mentorApi`.

2. Прочитай call site в `views/PvlPrototypeApp.jsx`:
   - что подаётся как `mentorId` (вокруг line 3540).
   - какие условия рендера `MentorMenteesGardenGrid` —
     возможно сам компонент не открывается для
     admin'а на каком-то верхнем уровне.

3. Определи, какая гипотеза (H1-H4) подтверждается.

4. Если можно — воспроизведи локально: открой `npm run preview`,
   подмени `currentUser.role = 'admin'` через DevTools/sessionStorage,
   зайди в учительскую → увидь «Список пуст».

### 3.2 Fix (если recon показал ясный root cause)

После того как ясна гипотеза — **не аплаишь без согласования
со стратегом**. Пиши отчёт `_02_codeexec_bug_admin_mentor_recon.md`
с:
- какая гипотеза подтвердилась;
- где конкретно гард (file:line);
- предлагаемый fix (минимальный, тип «добавить admin в
  allowed roles»);
- что сломается если admin начнёт видеть всех менти (вероятно
  ничего — он и так через AdminPvlProgress видит).

Стратег ревьюит, даёт 🟢 на apply, дальше — preview → 🟢 PUSH.

### 3.3 Параллельная подзадача — отсутствующая студентка

`579a3392-4a73-4b21-ac5c-7a7f64f91147` есть в
`pvl_garden_mentor_links`, но **отсутствует** в `pvl_students`.
Проверь:
- Кто это (profile в `profiles` таблице).
- Почему не синхронизировалась в `pvl_students` (`ensurePvlStudentInDb`
  не отработал? Role не подходящий? Cohort не назначен?).

Если это **отдельный системный sync issue** — заводи
**BUG-PVL-STUDENT-MISSING-FROM-REGISTRY** (P2). Если разовая
аномалия конкретной записи — можно докинуть руками через psql
после 🟢 от стратега.

### 3.4 Дополнительный тикет в backlog

Заведи **BUG-PDF-EXPORT-OKLAB-FAIL** (P2):

> Tailwind v4 использует CSS `color()` function с `oklab()` в
> стилях. `html2canvas` (текущая версия) не поддерживает —
> бросает `Attempting to parse an unsupported color function
> "oklab"`. Caught в `handleExportPdf` → пользователь видит
> alert «Ошибка при создании PDF». MON-001 не ловит (caught
> error, не uncaught). Зафиксировано на скриншоте Ольги 10
> мая.
>
> Решения (выбрать в отдельном recon):
> - **A.** Обновить html2canvas до версии, поддерживающей
>   oklab().
> - **B.** Перед экспортом конвертировать `oklab(...)` в RGB
>   через DOM manipulation на cloned node (CSS feature
>   detection через `CSS.supports`).
> - **C.** «Print-friendly» CSS-режим, который html2canvas
>   видит вместо обычного.
>
> Делается отдельным заходом, не в Phase 2B.

### 3.5 Что **не** делаешь

- Не пушишь fix без 🟢 PUSH от стратега.
- Не трогаешь Phase 2B (lazy остальные view) — это
  следующий заход после стабилизации.
- Не лезешь в html2canvas/oklab — это отдельный тикет.

---

## 4. Workflow

1. Recon → `_02_codeexec_bug_admin_mentor_recon.md`.
2. Параллельно: проверка отсутствующей студентки → решение
   (отдельный тикет или 1 psql команда).
3. Параллельно: backlog тикет BUG-PDF-EXPORT-OKLAB-FAIL.
4. Стратег ревьюит → 🟢 на apply fix → код → preview → 🟢 PUSH.
5. Smoke на проде: Ирина проверяет учительскую через 5 минут
   после deploy.

Жду `_02`.
