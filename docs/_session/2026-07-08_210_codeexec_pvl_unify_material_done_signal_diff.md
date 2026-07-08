# PVL Diff #3 — унификация «изучено»+«прочитано» → один сигнал (codeexec → стратег)

Дата: 2026-07-08. Статус: **собрано, build EXIT=0, жду 🟢 стратега (diff-on-review).**
Патч: [2026-07-08_210_codeexec_pvl_unify_material_done_signal.diff](./2026-07-08_210_codeexec_pvl_unify_material_done_signal.diff) — 3 файла, +45/−33.
Реализует запрос Ольги: «один сигнал, две точки входа; никакой отметки, что выглядит как done, но не считается». Следует сразу за [209](./2026-07-08_209_codeexec_pvl_material_read_toggle_diff.md) (Diff #2).

## ⭐ Robustness (ответ на твой момент): `completed` ВЫВОДИТСЯ, не хранится-и-синкается
Сделал по твоему **идеалу — derive on read**, а не «хранить и синхронно писать»:
- `getPublishedLibraryContentForStudent` (pvlMockApi.js): `completed = !!checks['sid:'+item.id] || !!pr.completed` — библиотечный бейдж/фильтр/счётчики теперь **читаются из чек-листа** (legacy `pr.completed` только как fallback для старых данных).
- Убрал ВСЕ mirror-writes, которые могли рассинхронить: `markLibraryItemCompleted` из сетки трекера ([PvlStudentTrackerView] step-nav и `syncLibraryAndStepComplete`) и из моего LibraryPage-хендлера. Теперь completion пишется в ОДИН путь — `checkItem/uncheckItem` (pvl_checklist_items). `pr.completed` из чек-лист-действий больше не пишется вообще → устаревшего «done, а % не двигается» быть не может.
- Итог: единственный источник истины completion = `pvl_checklist_items`. Бейдж библиотеки, тумблеры материала и % курса читают ОДНО и то же. Рассинхрон структурно невозможен (нет второго хранимого значения).

Это чинит и найденный баг: раньше сетка трекера ставила `markLibraryItemCompleted` на check, но не снимала на uncheck, а простой чекбокс сетки не ставил вовсе → бейдж и % расходились. Теперь — нет.

## Механика (выбор, который просила уточнить)
Единый источник = **`pvl_checklist_items`** (checkItem/uncheckItem, ключ `sid:contentItemId`). В `LibraryPage` заведены `selectedMaterialRead` (чтение) + `setSelectedMaterialRead(read)` (запись). ВСЕ три точки входа теперь пишут/читают ЭТОТ сигнал и все считаются в %:
1. **Верхняя кнопка** — была «Отметить как изученное» → `markLibraryItemCompleted` (в % НЕ входило). Стала единым тумблером «Отметить пройденным / ✓ Пройдено» → `setSelectedMaterialRead`.
2. **Нижний тумблер** (`PvlMaterialReadToggle`) — сделан **controlled** (`isRead`/`onToggle` от родителя), чтобы верх и низ всегда синхронны (без рассинхрона локальных стейтов). Uncontrolled-режим оставлен как fallback.
3. **Прохождение квиза** (`onQuizPassed`) — было `markLibraryItemCompleted`, стало `setSelectedMaterialRead(true)` → квиз тоже кормит %.

**Библиотечный `completed` — не второй сигнал, а производная от чек-листа** (см. блок ⭐ ниже). Пишем только `checkItem/uncheckItem`; бейдж/фильтр библиотеки выводятся из наличия чек-лист-строки.

Итог: нет отметки, которая выглядит как done, но не двигает %. Верх/низ/квиз — один ключ, консистентно.

## На сверку с разведкой
- Ключ везде = `selectedItem.contentItemId || selectedItem.id` (id контент-айтема = ключ баров). Синтетические `les-*` уроки — тот же краевой случай, что в [209].
- Метка изменилась: «Изучено» → «Пройдено» (единый термин для материала). Ок?

## Проверка
- `npx vite build` — EXIT=0.
- e2e после 🟢: открыть материал → нажать верхнюю «Отметить пройденным» → нижний тумблер и статус тоже становятся ✓, дашборд-бар растёт; снять — всё откатывается синхронно.

## Очередь
1. Diff #2 (галочка в конце) — задеплоен, жду зелёный CI.
2. **Diff #3 (этот)** — жду 🟢 → деплой.
3. Орфаны (`PvlStudentCabinetView` + `MentorDashboardView`) — гигиена, последним.
