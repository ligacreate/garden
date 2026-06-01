# Title живёт в двух слоях: pvl_content_items + pvl_homework_items

**Дата инцидента:** 2026-05-29.
**Связанные сессии:** [_156 recon Track E Курдюковой](../_session/2026-05-29_156_codeexec_recon_kurdyukova_reflexia_status.md), [_158 preview pvl_homework_items](../_session/2026-05-29_158_codeexec_reflexia_modules_rename_preview.md), [_159 apply pvl_homework_items](../_session/2026-05-29_159_codeexec_reflexia_modules_rename_applied.md), [_160 preview pvl_content_items](../_session/2026-05-29_160_codeexec_reflexia_content_items_rename_preview.md), [_161 apply pvl_content_items](../_session/2026-05-29_161_codeexec_reflexia_content_items_rename_applied.md).

## Симптом

После apply `_159` (rename title в `pvl_homework_items` для двух «Рефлексия по модулю»: `2138eb7f-…` → «Рефлексия модуля 1 (Пиши)», `de64aa54-…` → «Рефлексия модуля 2 (Веди)») Курдюкова после reload страницы продолжала видеть **старый title** «Рефлексия по модулю». БД post-COMMIT verify показал новый title корректно. Refresh не помог, hard-refresh не помог. Создавалось впечатление что либо SW кеширует, либо UI не подтягивается из API.

## Корневая причина

В проекте title для одного и того же логического сущности хранится **в двух таблицах**:

1. **`pvl_content_items.title`** — источник правды для **UI**.
2. **`pvl_homework_items.title`** — используется для admin-reports, аналитики, status_history, submissions FK, но **UI не отображает**.

Frontend читает title через цепочку:
- `pvlPostgrestApi.loadRuntimeSnapshot()` → `pvl_content_items` rows
- `applyRuntimeSnapshot()` → `db.contentItems` (in-memory mock-db)
- `ensureTaskForContentItem(student, contentItem)` ([services/pvlMockApi.js:2643](../services/pvlMockApi.js#L2643)):
  ```js
  task.title = contentItem.title || task.title || 'Домашнее задание';
  ```
- UI рендерит `task.title` в карточках уроков.

То есть `task.title` **всегда перетирается** из `contentItem.title` при каждом sync. Title из `pvl_homework_items` **никогда не достигает UI**.

Apply `_159` переименовал только `pvl_homework_items.title` — корректно для admin-reports, но **не для UI**. Symptom = старый title в UI Курдюковой даже после reload и hard refresh.

## Почему так получилось

1. **Дублирование title в двух таблицах** — наследие миграции curriculum (Этап 2, `task-ci-*`). `pvl_homework_items` rows создаются автоматически через `upsertHomeworkItem({ title: ci.title, external_key: 'task-ci-${ci.id}' })` в `ensureDbTrackerHomeworkStructure` ([services/pvlMockApi.js:756-774](../services/pvlMockApi.js#L756-L774)) — то есть homework-rows **зависят** от content-rows, но не остаются связанными после INSERT.
2. **Нет UNIQUE/FK/CHECK** на cross-table title consistency — БД не enforces что `pvl_homework_items.title == pvl_content_items.title` для item'ов с матчингом по `external_key`. Раздельные UPDATE возможны → рассинхрон легко.
3. **Стратег при frontend-grep `_158` не нашёл проблему** — `"Рефлексия по модулю"` literal только в seed.js, что technically верно. Но grep по title-literal не показывает что title **тянется из таблицы**. Чтобы поймать этот класс багов, нужен grep по `pvl_homework_items` use-sites + `pvl_content_items` use-sites + понимание чьё title рендерится в UI.
4. **Я в `_158` сделал chain-audit только в `pvl_homework_items`** — пропустил `pvl_content_items.title`, хотя обе таблицы видны в схеме и обе содержат title. Виновата привычка фиксить «где симптом» (homework_items — потому что туда привязаны submissions), а не «где источник» (content_items — публикация контента).

## Как починили

1. **Apply `_159`** — оставлен (полезен для admin-reports, не вреден).
2. **Apply `_161`** — переименовал `pvl_content_items.title` для двух uuid → UI стало показывать новый title после reload.
3. **Cross-table sanity** в обоих preview (`_160` step 6) — проверка `c.title = h.title` через JOIN по `external_key='task-ci-' || c.id`. Это защита от будущих рассинхронов.
4. **SWR auto-invalidation** работает корректно: `syncPvlRuntimeFromDb()` на mount `PvlPrototypeApp` перезаписывает localStorage `pvl_swr_v1` → `forceRefresh()` → React re-render. Ручная очистка не нужна.

## Что проверить в будущем

**При любой задаче «переименовать UI-видимый title homework/контент-items»:**

1. **Chain-audit обеих таблиц** перед preview:
   ```sql
   -- Все колонки title в pvl_*
   SELECT table_name, column_name FROM information_schema.columns
   WHERE table_schema='public' AND column_name='title' AND table_name LIKE 'pvl_%';

   -- Для каждой — probe на target literal
   SELECT '<table>' AS src, count(*) FROM <table> WHERE title ILIKE '%<literal>%';
   ```
2. **Chain-audit JSONB-колонок** — title может быть в `metadata`, `payload`, `homework_config` и т.п.
3. **Cross-table sanity** после UPDATE — обязательный шаг в preview, со step:
   ```sql
   SELECT c.id, c.title, h.title, (c.title = h.title) AS titles_match
   FROM pvl_content_items c
   JOIN pvl_homework_items h ON h.external_key = 'task-ci-' || c.id
   WHERE c.id IN (...);
   ```
4. **Правило:** «UI rename — это всегда `pvl_content_items` first, `pvl_homework_items` second (для аналитики). Никогда не наоборот, никогда без обеих.»
5. **Sanity для frontend смок:** после apply попросить пользователя сделать обычный reload (F5/Ctrl+R, не hard) — SWR auto-invalidation должна сработать через `syncPvlRuntimeFromDb` за 1-3 сек. Если не сработала — DevTools → Application → Local Storage → remove `pvl_swr_v1` → reload. Если и это не помогло — баг в SWR-цепочке, отдельный recon.

## Сигналы похожих багов

- Title в БД новый, в UI старый, refresh не помогает → **искать второй слой**, не SW cache.
- Stratег делает frontend-grep по title-literal — это **не** заменяет chain-audit БД. Literal в коде — про hardcoded; chain-audit — про data-driven.
- `task.title = contentItem.title` или похожее присваивание в `ensureTaskForContentItem`-подобных функциях — flag «UI читает title из X, не Y».

## Связано

- Backlog `CONTENT-PLACEMENT-MISSING-REFLEXIA-VEDI` (зафиксирован в `_161`) — для `5067b49b-…` нет placement, но UI fallback работает. Отдельная задача.
- Возможный future-тикет `DB-CONSISTENCY-CHECK-TITLE-SYNC`: idempotent скрипт, который раз в N часов проверяет `c.title = h.title` для всех task-ci-* пар и алертит в MON-001 при рассинхроне. P3.
