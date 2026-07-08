# PVL прогресс-бар — verify + предложение дизайна (codeexec → стратег)

Дата: 2026-07-08. Статус: **ждём 🟢 стратега на дизайн, НЕ строю.**
Задача: реальный % модуля + % курса для ученика И ментора (сейчас висит «Модуль 1»).

## VERIFY 1–4 (prod DB, gen_user, один коннект)

**1. `pvl_student_course_progress` заполняется?** — Частично и НЕнадёжно.
`10 строк / 10 студентов` (при 30 студентах), `lessons_completed>0` у всех 10, но `homework_completed = 0` ВЕЗДЕ. Это разреженный агрегат по неделям, не источник правды.
→ Реальный источник прогресса = **`pvl_checklist_items`**: `417 строк / 15 студентов / 39 items`; 9 студенток отметили ~35–39/39. Плотно используется.

**2. Вид ментора читает реальный прогресс или мок?** — Смешанно, и «Модуль 1» — статичный мок:
- `buildMentorMenteeRows` (карточка менти + список MentorDashboard) — трекер **НЕ читает**. Модуль = `profile.currentModule` (мок), % = `closedPct` только по заданиям.
- `buildTeacherStudentRows` (учительская) — **уже** считает `computePvlTrackerDashboardStats` (реальные lessonsDone/Total), НО метка модуля в `courseLine` = `sp.currentModule` (статичная).
- Источник «Модуль 1»: захардкоженная константа `currentModule: 1` в [pvlMockApi.js:1305](services/pvlMockApi.js#L1305) при синтезе профиля. В `pvl_students` **колонки current_module/current_week НЕТ** (0 строк) — из БД это значение не берётся вообще.

**3. Есть ли явный per-student сигнал «материал прочитан»?** — **ДА, уже есть, новый флаг НЕ нужен.**
`pvl_checklist_items (student_id, content_item_id)` — одна строка на (студент × материал). Пишется через `studentApi.checkItem → insertChecklistItem`, снимается `uncheckItem → deleteChecklistItem`. DB-backed (не localStorage). Заполнен реально (см. п.1).
Нюанс UX: тумблер сейчас живёт **только в сетке трекера**, не «в конце материала». В самом материале ([pvlLibraryMaterialShared.jsx](views/pvlLibraryMaterialShared.jsx)) кнопки «прочитано» нет.

**4. Миграция нужна?** — **НЕТ. Фронта достаточно** (подтверждаю склонность стратега). Всё уже в БД:
- сигнал прочтения → `pvl_checklist_items` ✓
- группировка 3 модулей → `pvl_content_placements.module_number` заполнен: **модуль 1=14, 2=9, 3=8** уроков ✓
- задание принято → `pvl_student_homework_submissions.accepted_at`: **152 из 154 приняты** ✓

## ПРЕДЛОЖЕНИЕ (на 🟢)

**A. Один источник вычисления — расширить, не плодить.**
`computePvlTrackerDashboardStats` уже даёт course-агрегат + `currentModuleTitle`. Добавить в его возврат массив per-module `{ moduleNumber, lessonsDone/Total, hwDone/Total, pct }` + `coursePct`. Никакой второй формулы.
- Семантика по правилам Ольги: урок «пройден» = есть строка в `pvl_checklist_items`; задание «пройдено» = `accepted_at` (НЕ toggle). Сейчас функция для homework-тегов считает `checked[key]` — **поправить**, чтобы задания брали accepted-статус. `% модуля = (lessonsDone + hwAccepted) / (lessonsTotal + hwTotal)`.
- «Текущий модуль» = первый модуль с незакрытым элементом (логика уже есть) → заменит хардкод «Модуль 1».

**B. Где рендерим бары (переиспользуем компонент бара):**
- Ученик: `PvlStudentCabinetView` (снять моки `studentProfile.currentModule`/`dashboardStats`, подключить `buildTrackerModulesFromCms` + checklist) и шапка трекера. Бар модуля + бар курса.
- Ментор: `buildMentorMenteeRows` — добавить `trackerStats` (как уже сделано в `buildTeacherStudentRows`); `PvlMenteeCardView` — показать % модуля + % курса.

**C. Кабинет сейчас на моках** (`currentModule` хардкод, `lib-1..7`, «API fallback to mock») — снимаем в рамках фичи: реальные модули + checklist. Семена платформы не трогаем (правило).

## Нужны решения стратега ДО сборки
1. **Homework «пройдено» = только `accepted_at`?** (влияет на формулу % — да/нет).
2. **«Галочка в конце материала»**: добавить кнопку прямо в материале (тот же `checkItem`, тот же DB-путь), ИЛИ оставить чекбокс в сетке трекера? Правило Ольги намекает на в-конце-материала.
3. **Контрольные точки (КТ)** входят в «% курса» как задания, или считаем только обычные ДЗ + уроки? (правило «все материалы + задания» → скорее входят).
4. **Бар курса** = сумма по всем 3 модулям (Пиши/Веди/Люби). Подтвердить.

Миграции нет. После 🟢 — соберу и пришлю diff-on-review перед деплоем.
