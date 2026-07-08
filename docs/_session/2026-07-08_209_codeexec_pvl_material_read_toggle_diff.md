# PVL Diff #2 — тумблер «прочитано» в конце материала (codeexec → стратег)

Дата: 2026-07-08. Статус: **собрано, build EXIT=0, жду 🟢 стратега перед деплоем (diff-on-review).**
Патч: [2026-07-08_209_codeexec_pvl_material_read_toggle.diff](./2026-07-08_209_codeexec_pvl_material_read_toggle.diff) — 1 файл, +42.
Продолжение [208](./2026-07-08_208_codeexec_pvl_progress_bar_diff.md). Реализует ответ Ольги Q2.

## Что делает
Новый компонент `PvlMaterialReadToggle` — тумблер в КОНЦЕ материала (под телом `PvlLibraryMaterialBody` в `LibraryPage`). Пишет **в тот же путь, что сетка трекера**:
`checkItem/uncheckItem → pvl_checklist_items (sid:contentItemId)` — то есть кормит тот же % курса (Diff #1). Один DB-сигнал, два места отметки (сетка трекера + конец материала).

- Ключ = `selectedItem.contentItemId || selectedItem.id` (id контент-айтема = тот же, что в `buildTrackerModulesFromCms` → `sid:contentItemId`), поэтому отметка сразу отражается в барах модуля/курса.
- Состояние читается из `getTrackerChecklist(studentId)`; оптимистичный тумблер + `onToggled` дёргает `setLibraryTick`/`refresh`.
- a11y: `aria-pressed`, min-h 44px (touch target по DESIGN-001).

## На сверку с разведкой (2 момента)
1. **Две отметки на экране материала:** сверху осталась библиотечная «Отметить как изученное» (`markLibraryItemCompleted → studentLibraryProgress`, в % НЕ входит), снизу — новая курсовая «прочитано» (`checkItem → pvl_checklist_items`, кормит %). Я **намеренно НЕ трогал верхнюю**, чтобы не сломать библиотечный прогресс. Предлагаю след. микро-итерацией объединить/убрать верхнюю — но это твоё решение, не в этот дифф.
2. **Синтетические уроки трекера `les-*`** (из `pvl_course_lessons`, не контент-айтемы): у них `id='les-…'`, отметка запишет `sid:les-…`, что не совпадёт с ключами `sid:contentItemId` в барах. На практике материалы для чтения — контент-айтемы (id совпадает), так что кейс краевой. Если критично — обсудим маппинг отдельно.

## Проверка
- `npx vite build` — EXIT=0.
- e2e после 🟢: открыть материал → внизу «Отметить: прочитано» → перейти на дашборд → бар модуля/курса вырос.

Жду 🟢 → деплой (dist не коммичу).
