# PVL прогресс-бар — Diff #1 (codeexec → стратег), diff-on-review

Дата: 2026-07-08. Статус: **собрано, build EXIT=0, жду 🟢 стратега перед деплоем.**
Полный дифф: [2026-07-08_208_codeexec_pvl_progress_bar.diff](./2026-07-08_208_codeexec_pvl_progress_bar.diff) — 3 файла, +192/−44.
Продолжение отчёта [207](./2026-07-08_207_codeexec_pvl_progress_bar_verify_report.md). Ответы Ольги/стратега (1–4 + 2 уточнения) учтены.

## Что важно узнать перед ревью (2 находки при сборке)

1. **`PvlStudentCabinetView.jsx` — мёртвый код.** Нигде не импортируется и не роутится (проверил grep по всему репо, кроме self). Живой кабинет ученика — `StudentDashboard` внутри `PvlPrototypeApp.jsx`, он УЖЕ читал реальный `tr` (но с багом ДЗ-toggle и без бара модулей). **Я НЕ трогал мок-файл** — строить в него бессмысленно. Предлагаю отдельным микро-диффом удалить `PvlStudentCabinetView.jsx` (и, вероятно, орфан `MentorDashboardView.jsx` — тоже не роутится). Не делаю без твоего 🟢.
2. **«Модуль 1» в карточке/списке ментора** шёл из захардкоженного `profile.currentModule` (в БД такой колонки нет — см. [207]). Заменил на производное значение из реального прогресса.

## Изменения по файлам

### `views/PvlStudentTrackerView.jsx` — единый источник (одна формула)
- `computePvlTrackerDashboardStats(checked, modules, { tasks })` расширена, НЕ продублирована:
  - **Материал «пройден» = чек-лист** (`checked`, т.е. `pvl_checklist_items`).
  - **Задание «пройдено» = accepted_at** (`pvlTaskIsAccepted` → `acceptedAt`/displayStatus==='принято'). **Это и есть фикс ДЗ-toggle-бага** — отметка студента больше НЕ засчитывает ДЗ.
  - **КТ входят** как задания (просто задачи из `getStudentResults`); **сертификация исключена** (`pvlTaskIsCertification`; вдобавок её в `getStudentResults` и так нет).
  - Позиции трекера, которые являются заданием (`task-ci-*`), из «материалов» вычитаются → нет двойного счёта.
  - Возврат дополнен: `modules:[{moduleNumber,label,title,done,total,pct}]`, `coursePct/courseDone/courseTotal`, `currentModuleNumber`, `currentModuleTitle` (производный: первый модуль с pct<100). `lessonsDone/homeworkDone` пересчитаны на новую семантику.
- Новый компонент `PvlCourseProgressBars({stats})` — бар курса + 3 бара модулей (Пиши/Веди/Люби), тёплые токены (`.h-section`, `.text-ink-mute`, `#C8855A`), `role="progressbar"` + aria. Один компонент для ученика и ментора.

### `views/PvlPrototypeApp.jsx`
- `StudentDashboard`: передаёт `{ tasks: apiTasks }` в формулу (бар «Домашки» теперь по accepted_at); добавлен `<PvlCourseProgressBars stats={tr}/>` под hero. Hero «Текущий фокус» — уже `tr.currentModuleTitle` (теперь производный).
- `buildTeacherStudentRows`: формула c `{ tasks }`; `courseLine` = реальный `Модуль N · TITLE` вместо `sp.currentModule`.
- `buildMentorMenteeRows`: считает единый `trackerStats` (из `pvlDomainApi.db.contentItems/contentPlacements` — без проп-протяжки); `moduleWeekLine` производный; в строку добавлены `coursePct/moduleStats/currentModuleNumber`.
- Список менти (`MentorMenteesGardenGrid`): бар = реальный `coursePct` + строка «Пиши X% · Веди Y% · Люби Z%».
- Новый хелпер `computePvlMenteeCourseProgress(userId)` + проп `courseProgress` в `<PvlMenteeCardView>` на обоих живых сайтах (/mentor/mentee/:id и /admin/students/:id).

### `views/PvlMenteeCardView.jsx`
- Проп `courseProgress`; рендер `<PvlCourseProgressBars>` под шапкой; строка «Модуль …» переопределена на реальный `currentModuleNumber · currentModuleTitle`.

## Семантика — что подтвердить на ревью (сверка с твоей разведкой)
- **Материалы** в знаменателе = все позиции трекера (video/pdf/live/text/template/checklist), кроме тех, что являются заданием. Текстовые уроки (52 шт) считаются материалами. ОК?
- **Только модули 1/2/3.** Задания недели 0 (онбординг, module_number=0) в % НЕ входят (правило «по 3 модулям»). ОК?
- `lessonsDone/lessonsTotal` теперь = все материалы (было только video/pdf/live). Влияет на колонку «Уроки» в учительской — стало честнее, но число изменится.

## Не в этом диффе (сознательный сплит)
- **Diff #2 — тумблер «прочитано» В КОНЦЕ материала** (Ольга Q2), пишущий в тот же `checkItem`/`pvl_checklist_items`. Вынес отдельно: % уже работает от отметок в сетке трекера; это добавит точку отметки в самом материале. Соберу следующим, если 🟢.
- Удаление орфан-файлов (`PvlStudentCabinetView`, `MentorDashboardView`) — по твоему решению.

## Проверка
- `npx vite build` — EXIT=0 (только стандартный warning про размер чанков). dist не коммичу (CI собирает сам).
- Ручной e2e в браузере предлагаю после 🟢: ученик (кабинет + бары), ментор (список + карточка менти), учительская (строка модуля).

Жду 🟢 на дифф → деплой. Особое внимание: фикс ДЗ-toggle и семантика знаменателя.
