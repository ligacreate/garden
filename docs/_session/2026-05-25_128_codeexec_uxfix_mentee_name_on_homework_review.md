---
title: UX-фикс — имя+фамилия менти на странице проверки ДЗ ментором
date: 2026-05-25
author: codeexec (VS Code)
status: recon + diff готовы, waiting 🟢 от Ольги
source: жалоба Юли Габрух (ментор) — «проверяешь несколько ДЗ подряд и забываешь, чьё»
related_files: views/PvlTaskDetailView.jsx
---

# UX-фикс: имя менти в шапке страницы проверки ДЗ

## 1. Recon: где компонент

### Цепочка рендера

```
Route /mentor/mentee/{menteeId}/task/{taskId}
  ↓
PvlPrototypeApp.jsx:4069-4108 — matches → рендерит:
  <PvlTaskDetailView
      role="mentor"
      taskStudentId={resolvedMentee}    ← UUID менти есть здесь
      taskId={taskId}
      mentorActorId={...}
      onBack={() => navigate('/mentor/mentee/{menteeId}')}
      ... />
  ↓
views/PvlTaskDetailView.jsx:1132 (default export PvlTaskDetailView)
  ↓ (role === 'mentor' branch, line 1263-1278)
<MentorTaskSlim state={state} onBack onBack backLabel ... />
  ↓
views/PvlTaskDetailView.jsx:945 (function MentorTaskSlim)
  первой строкой рендерит:
<MentorTaskHeaderCompact data={td} onBack={onBack} backLabel={backLabel} showBackButton={showHeaderBack} />
  ↓
views/PvlTaskDetailView.jsx:413 (function MentorTaskHeaderCompact)  ← ЭТО ТА САМАЯ ШАПКА СО СКРИНА
```

### Текущая шапка (точная цитата, views/PvlTaskDetailView.jsx:413-434)

```jsx
export function MentorTaskHeaderCompact({ data, onBack, backLabel, showBackButton = true }) {
    return (
        <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
            {showBackButton ? (
                <button type="button" onClick={onBack} className="text-xs text-[#9B8B80] hover:text-[#4A3728] mb-2">{backLabel}</button>
            ) : null}
            <h2 className="font-display text-2xl md:text-3xl text-[#4A3728]">{data.title}</h2>
            <div className="mt-3 rounded-xl border border-[#F0E6DC] bg-[#FAF6F2]/70 px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#7A6758]">
                    <span>Дедлайн: <span className="font-medium text-[#4A3728]">{data.deadlineAt || '—'}</span></span>
                    <span className="inline-flex items-center gap-2">
                        <span>Статус</span>
                        <Pill tone={statusTone(data.status)}>{data.status}</Pill>
                    </span>
                    <div className="min-w-[150px]">
                        <RevisionCyclesMeter revisionCycles={data.revisionCycles} maxCycles={3} />
                    </div>
                </div>
            </div>
        </div>
    );
}
```

Это **точно** то, что Юля видит на скрине: крошка «← К карточке менти», заголовок «Задание к уроку...», нижний row «Дедлайн / Статус / Правки 0/3».

### Какие данные о менти доступны сейчас

В `MentorTaskHeaderCompact` — **только** `data` (= `state.taskDetail`), которое содержит `title`, `deadlineAt`, `status`, `revisionCycles`. **Имени менти в нём НЕТ.**

В `MentorTaskSlim` (parent) — тоже нет, только `state` целиком + back-callback'и.

В `PvlTaskDetailView` (grand-parent) — есть **`taskStudentId`** как prop (line 1141). Это UUID менти. Через него легко резолвить имя:

```js
const menteeUser = (pvlDomainApi.db.users || []).find((u) => String(u.id) === String(taskStudentId));
const menteeName = menteeUser?.fullName || menteeUser?.email || '';
```

`pvlDomainApi` уже импортирован в PvlTaskDetailView.jsx (line 2). Никаких новых импортов / запросов / fetch'ев не нужно — runtime memory уже содержит users (заполняется `syncPvlActorsFromGarden`, тем же что и preview banner для админа).

### Authoritative источник имени

**`profiles.name`** в Postgres — каноничный источник. На runtime client'a мапится в `db.users[].fullName` через `syncPvlActorsFromGarden` (pvlMockApi.js:1243: `const realName = u.name || u.fullName || u.email || userId;`).

`pvl_students.full_name` — **кэш-копия** `profiles.name`, заполняется phase37 trigger'ом при approval'е (см. `2026-05-23_phase37_pvl_onboarding_atomic.sql` section 5: `COALESCE(NULLIF(trim(NEW.name), ''), NEW.email, 'Участница')`). Не источник, не использовать.

Тот же паттерн уже работает в [views/PvlPrototypeApp.jsx:7616-7619](../../views/PvlPrototypeApp.jsx#L7616-L7619) — резолв `previewName` для admin-preview banner'a. Берём паттерн один-в-один.

## 2. Предложение diff (НЕ apply)

Цель — показать имя менти **строкой выше h2** мелким серым с префиксом «Менти:». Иерархия: сначала контекст (кто), потом title задания (что). Не дублируется в нижней мета-панели (дедлайн/статус/правки — это про задание, не про менти).

**Стиль использует уже существующие токены файла**: `text-xs` + `text-[#7A6758]` (secondary text — тот же что в нижней панели «Дедлайн») + `font-medium text-[#4A3728]` (dark accent для имени — тот же что для значения дедлайна). Никаких новых цветов / размеров.

**3 точечные правки в одном файле** `views/PvlTaskDetailView.jsx`. Никакого fetch'a, никакого расширения select / API.

### Правка 1/3 — `MentorTaskHeaderCompact` (line 413)

Добавить prop `menteeName` + рендер строки между back-button и `<h2>`:

**Было:**
```jsx
export function MentorTaskHeaderCompact({ data, onBack, backLabel, showBackButton = true }) {
    return (
        <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
            {showBackButton ? (
                <button type="button" onClick={onBack} className="text-xs text-[#9B8B80] hover:text-[#4A3728] mb-2">{backLabel}</button>
            ) : null}
            <h2 className="font-display text-2xl md:text-3xl text-[#4A3728]">{data.title}</h2>
```

**Станет:**
```jsx
export function MentorTaskHeaderCompact({ data, onBack, backLabel, showBackButton = true, menteeName }) {
    return (
        <div className="rounded-2xl border border-[#E8D5C4] bg-white p-4">
            {showBackButton ? (
                <button type="button" onClick={onBack} className="text-xs text-[#9B8B80] hover:text-[#4A3728] mb-2">{backLabel}</button>
            ) : null}
            {menteeName ? (
                <p className="text-xs text-[#7A6758] mb-1">Менти: <span className="font-medium text-[#4A3728]">{menteeName}</span></p>
            ) : null}
            <h2 className="font-display text-2xl md:text-3xl text-[#4A3728]">{data.title}</h2>
```

(+ 1 параметр, + 3 строки JSX с conditional render — без `menteeName` блок просто не рисуется, fail-safe для случая когда `db.users` ещё не подгружен.)

### Правка 2/3 — `MentorTaskSlim` (line 945-1000)

Принять `menteeName` пропом + прокинуть в `MentorTaskHeaderCompact`:

**Было (сигнатура, line 945-954):**
```jsx
function MentorTaskSlim({
    state,
    onBack,
    backLabel,
    navigate,
    onMentorReview,
    onRefresh,
    mentorRoutePrefix = '/mentor',
    showHeaderBack = true,
}) {
```

**Станет:**
```jsx
function MentorTaskSlim({
    state,
    onBack,
    backLabel,
    navigate,
    onMentorReview,
    onRefresh,
    mentorRoutePrefix = '/mentor',
    showHeaderBack = true,
    menteeName,
}) {
```

**Было (передача, line 1000):**
```jsx
<MentorTaskHeaderCompact data={td} onBack={onBack} backLabel={backLabel} showBackButton={showHeaderBack} />
```

**Станет:**
```jsx
<MentorTaskHeaderCompact data={td} onBack={onBack} backLabel={backLabel} showBackButton={showHeaderBack} menteeName={menteeName} />
```

### Правка 3/3 — `PvlTaskDetailView` mentor branch (line 1263-1278)

Резолвить `menteeName` через `taskStudentId` + передать в `MentorTaskSlim`:

**Было:**
```jsx
    if (role === 'mentor') {
        return (
            <div className="space-y-3">
                <MentorTaskSlim
                    state={state}
                    onBack={onBack}
                    backLabel={backLabel}
                    navigate={navigate}
                    onMentorReview={onMentorReview}
                    onRefresh={onRefresh}
                    mentorRoutePrefix={mentorRoutePrefix}
                    showHeaderBack={showHeaderBack}
                />
            </div>
        );
    }
```

**Станет:**
```jsx
    if (role === 'mentor') {
        /** Резолюция имени менти для шапки страницы проверки ДЗ — паттерн
         *  тот же, что и для admin-preview banner'a (PvlPrototypeApp.jsx:7616). */
        const menteeUser = (pvlDomainApi.db.users || []).find(
            (u) => String(u.id) === String(taskStudentId),
        );
        const menteeName = menteeUser?.fullName || menteeUser?.email || '';
        return (
            <div className="space-y-3">
                <MentorTaskSlim
                    state={state}
                    onBack={onBack}
                    backLabel={backLabel}
                    navigate={navigate}
                    onMentorReview={onMentorReview}
                    onRefresh={onRefresh}
                    mentorRoutePrefix={mentorRoutePrefix}
                    showHeaderBack={showHeaderBack}
                    menteeName={menteeName}
                />
            </div>
        );
    }
```

(+ 5 строк: comment + резолв + проп. `pvlDomainApi` уже импортирован line 2.)

## 3. Итого по diff'у

| Файл | Строк +/− | Что |
|------|----------|-----|
| `views/PvlTaskDetailView.jsx` | +10 / 0 | 3 правки в одном файле |

- **Никаких новых импортов** — `pvlDomainApi` уже в файле.
- **Никаких новых fetch'ев / endpoint'ов / select'ов** — данные уже в `db.users` на runtime (заполняется `syncPvlActorsFromGarden` при загрузке приложения).
- **Никаких новых дизайн-токенов** — цвета и размеры из существующей палитры файла.
- **Conditional render** — если `menteeName === ''` (например, `db.users` ещё не успел подгрузиться, либо `taskStudentId` legacy-stub), блок не рисуется. Старое поведение сохраняется как fallback.
- **Group/cohort НЕ добавляю** — нигде на этой странице рядом такие данные не отображаются, и по твоему prompt'у не выдумываем новые поля. Если позже захочется — отдельный тикет.
- **Не трогаю student/admin branch'ы** — фикс точечный, для mentor view.

## 4. Smoke план после apply + deploy

1. Зайти как ментор Юля Габрух на `/mentor/dashboard` → выбрать любого менти с pending ДЗ → открыть карточку → нажать на «К заданию»
2. Ожидание: в шапке выше «Задание к уроку «...»» появилась строка «Менти: Имя Фамилия»
3. Имя должно резолвиться правильно (тот же `fullName` что показывается на карточке менти)
4. Edge cases:
   - Если у менти не заполнено `name` в profiles → показать email (fallback в коде)
   - Если совсем нет user (`db.users` пуст из-за late hydration) → блок просто скрыт, h2 сразу после кнопки back
5. Проверить, что student-view (тот же компонент с `role='student'`) **не затронут** — там идёт другая ветка через `renderTaskDetail`, наш фикс её не трогает

## 5. Wait 🟢

До твоего одобрения diff'а — никаких apply / commit / push. Изменения только в одном файле, scope понятен.

Если хочешь — могу заодно добавить такой же резолв для admin preview варианта на `/admin/students/.../task/...` (там тот же `PvlTaskDetailView` с `role='mentor'`, см. PvlPrototypeApp.jsx:7653). Но это **скоп больше первоначальной задачи** — Юля жаловалась на mentor view, не admin. Лучше отдельным тикетом, если возникнет похожая жалоба от админа.
