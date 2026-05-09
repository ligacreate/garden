# 🟢 — два независимых шага: shop push + FEAT-016 apply

**Адресат:** VS Code Claude Code (executor).
**Автор:** стратег (claude.ai).
**Создано:** 2026-05-08.

## Шаг 1 — push commit упрощения формы магазина

Commit (упрощение ShopAdmin: убраны promo_code/link_url/whatsapp)
готов локально, ждёт push'а.

**🟢 push сразу.** Ольга визуально подтвердила preview, форма
выглядит сбалансированно. Дополнительной отмашки не нужно.

После push — отчёт коротко в:
`docs/_session/2026-05-08_30b_codeexec_shop_form_push.md` (или
просто строкой в текущем `_30`).

## Шаг 2 — apply FEAT-016 по плану `_29`

**🟢 на apply** по плану в
[`docs/_session/2026-05-08_29_codeexec_feat016_plan.md`](2026-05-08_29_codeexec_feat016_plan.md).

### Решения по 4 open questions

| # | Вопрос | Решение |
|---|---|---|
| 5.1 | mentor_name в комментариях | **B** — fetch map id→name через `api.getUsers()` (точнее чем `student.mentor_name` из RPC; `api.getUsers()` уже есть в Garden) |
| 5.7 | control_points / certification_tasks | **Исключаем** (`item_type='homework' AND NOT is_control_point`), консистентно с FEAT-017 RPC |
| 5.3 | cancel button для bulk | **Не делаем** — для 13 студенток секунды, сложность не оправдана |
| 6 | bulk ZIP в этот же заход | **Да, включаем** — секция 6 + 4.4 + 4.5 (jszip dep) |

### Workflow — через локальное preview

Это UI-изменение в рабочей админке. Как и с магазином —
preview перед commit/push:

1. Apply изменений локально (`utils/pvlHomeworkReport.js`,
   `views/AdminPvlProgress.jsx`, `services/pvlPostgrestApi.js`),
   `npm install jszip`.
2. `npm run dev` → сообщить Ольге порт.
3. Ольга смокает 4 сценария:
   - **per-student** на одной из 13 настоящих студенток
     (например, Александра Титова, у неё есть accepted/in_review
     submission'ы) → выбрать «Модуль 1» → скачать .md → открыть
     в Obsidian → проверить структуру.
   - **per-student «Все модули»** → один большой .md с разделами.
   - **bulk ZIP за модуль** → файл `Поток_1_Модуль_1_<date>.zip`
     с 13 .md файлами внутри.
   - **edge-case** «Не сдано» — например, Анастасия Зобнина
     (если ещё в списке) или любая студентка с пустым модулем →
     пометка «❌ Не сдано» вместо блока «Ответ».
4. Замечания → правки → повторить preview.
5. **После 🟢 Ольги** — commit + push.
6. Apply-отчёт в `docs/_session/2026-05-08_31_codeexec_feat016_apply.md`.

### Commit message (после ОК Ольги)

```
feat: FEAT-016 — per-student MD-отчёт + bulk ZIP за модуль

Дашборд «Прогресс ПВЛ»:
- кнопка «📄 Отчёт» в строке студентки → dropdown по модулям
  + «Все модули» → скачивание .md файла.
- кнопка «Скачать архив за модуль…» в Header → dropdown →
  ZIP с N .md файлами по visibleRows (учитывает hidden + state
  фильтры).

Markdown:
- структура по homework_items в порядке module_number, sort_order
- ответы студентки (answersJson или textContent) → plainText
- комментарии менторов из payload.thread (mentor_review)
- статусы с иконками, периоды модулей из pvl_course_weeks
- mentor_name резолвится через api.getUsers() для точности
- control_points / certification_tasks исключены
  (консистентно с phase 25 RPC pvl_admin_progress_summary)

Технически:
- новый utils/pvlHomeworkReport.js (~350 строк)
- batch-метод listHomeworkStatusHistoryBulk в pvlPostgrestApi
- jszip dep, lazy-import (не раздувает initial bundle)

Ольга: «один раз сделали — на всех модулях курса автоматически».
Dropdown подтягивает доступные модули из homework_items.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Порядок шагов

Можно одновременно — `_30b` (push магазина) короткий, `_31`
(FEAT-016 apply через preview) длиннее. Если предпочитаешь
последовательно — push магазина первым (5 минут), потом FEAT-016.
