# Закрытие сессии 2026-05-08 — финальные документы

**Адресат:** VS Code Claude Code (executor).
**Автор:** стратег (claude.ai).
**Создано:** 2026-05-08.

Финальные шаги. Один commit с тремя изменениями (BACKLOG + HANDOVER +
вся `_session/` целиком), push сразу.

## 1. Обновить `garden/plans/BACKLOG.md`

### Перевести в 🟢 DONE с датой 2026-05-08:

- **INFRA-004** — cache-headers через тикет hightek.ru support
  (`Cache-Control: no-cache` для index.html, `immutable, max-age=31536000`
  для /assets/*). Plus meta-tags workaround commit `2228f70`.
  Verified curl: index.html → `no-cache`, /assets/*.js → immutable.
- **BUG-PVL-COHORT-NULL-OVERWRITE** — fix `ensurePvlStudentInDb`,
  гибрид `seedCohortIdToSqlUuid` + опускание полей если значение не
  валидно. Commit `7c28ed3`. Backfill cohort_id больше не
  регрессирует. Lesson: `docs/lessons/2026-05-08-pvl-cohort-null-overwrite.md`.
- **FEAT-017 V1** — admin таб «Прогресс ПВЛ» в Garden AdminPanel.
  Commits: `0867aa6` (базовый), `377a148` (GroupProgressBar),
  `296cfb3` (hidden-filter + cleanup CLEAN-013 partial). RPC
  `pvl_admin_progress_summary` через PostgREST, sortable table,
  фильтр по state_line, GroupProgressBar (4-цветная полоска),
  hidden-filter через localStorage `hiddenGardenUserIds`. Verified
  визуально Ольгой → 13 строк после скрытия Настина фея.

### Перевести в 🟡 IN PROGRESS / частично DONE:

- **CLEAN-013** — частично DONE 2026-05-08:
  - 🟢 [2026-05-07, commit `9fddae4`] Лена Ф удалена через RPC
    `admin_delete_user_full`.
  - 🟢 [2026-05-08, commit `296cfb3`] LIlia MALONG (дубль), Рита,
    Екатерина Салама удалены через data-миграцию
    `cleanup_clean013_partial`.
  - 🟡 Настина фея, Настин фиксик — **оставлены как тест-окружение
    Насти** (продуктовое решение Ольги 2026-05-08). Скрыты через
    «глазик» (`hiddenGardenUserIds`). НЕ удаляем.

### Обновить накопительную `UX-QUICK-FIXES`:

Добавить пункт TODO:
- 🔴 [2026-05-08] **Колотилова Светлана Николаевна** (`df6d3afc-1c5b-4d68-af6f-4eb646c1f5f9`,
  role=mentor, status=suspended) — убрать отчество из `profile.name`.
  Должно быть `«Колотилова Светлана»`. Один UPDATE в profiles.
  Заодно сверить связанные таблицы (`events.host_*` через
  sync_meeting_to_event — имя ведущей дублируется?), fix везде если
  нужно. Накопительный batch — ждём ещё пунктов.

### Завести новые тикеты:

**`BUG-PVL-ENSURE-RESPECTS-ROLE`** (P2, новый):
- `ensurePvlStudentInDb` (`services/pvlMockApi.js:603-650`) не
  проверяет роль пользователя перед upsert. Любой админ / mentor /
  intern, открывший PVL-учительскую с write-операцией, попадает в
  pvl_students. 2026-05-08 cleanup убрал 5 не-студенческих записей
  (commit `e3a992f`), но **корневая причина не устранена** — лишние
  снова появятся при заходах admin/mentor/intern.
- Лечение: добавить проверку `role IN ('applicant', 'student')` или
  whitelisting перед upsert. Альтернатива — DB-trigger, проверяющий
  role в profiles перед INSERT в pvl_students (security-defender).

**`FEAT-017-V2-VISUALIZATIONS`** (P3, накопительный):
- Heat-map (студенты × недели), per-module прогресс-полоски,
  sparklines в строках. Не делать как одну большую фичу — добавлять
  по элементу когда возникнет нужда. Уровень 1 (GroupProgressBar)
  уже сделан (commit `377a148`).

**`PROD-DB-MIGRATE-ISPMANAGER`** (P3 — стратегическая идея, не
TODO):
- Идея от Ольги 2026-05-08: рассмотреть миграцию БД с Timeweb Cloud
  managed Postgres на ISPmanager-shared (где живёт frontend
  liga.skrebeyko.ru). Цель — единая точка управления, возможно
  экономия.
- **Барьеры:**
  - ISPmanager обычно даёт MySQL/MariaDB, не Postgres → переписать
    схему, RLS-policies, ~10+ RPC-функций (`ensure_garden_grants`,
    `is_admin`, `is_mentor_for`, `pvl_admin_progress_summary`,
    `admin_delete_user_full`, etc.)
  - PostgREST не работает с MySQL → переписывать backend на другом
    стеке.
  - Потеря managed-бенефитов (бэкапы, мониторинг, SLA Timeweb).
  - Производительность shared-хостинга под нагрузкой обычно слабее.
- **Бюджет:** 3-5 сессий recon + продуктовое решение, потом месяцы
  реализации. Не на ближайший спринт. Заводится для запоминания, не
  для делания.

**`TEST-INFRA-SETUP`** (P3, новый):
- В кодовой базе нет тестов (vitest / jest / тесты-каталоги). Заводим
  как future-задачу — настроить тест-инфру. Нужна для
  `BUG-PVL-ENSURE-RESPECTS-ROLE` smoke-теста, для
  pvlPostgrestApi-юнитов и т.д.

### Обновить статусы существующих тикетов:

- **FEAT-016** (CSV-выгрузка ДЗ) — теперь без блокеров. Можно
  начинать следующей сессией. RPC `pvl_admin_progress_summary`
  готов, SQL-логика для CSV — расширение того же.

## 2. Создать HANDOVER 2026-05-08

Файл: `garden/docs/journal/HANDOVER_2026-05-08_session_infra004_pvl_progress.md`

Структура — как HANDOVER 2026-05-07 (предыдущий handover в той же
папке).

Ключевое для секций:

- **TL;DR:** Сессия закрыла INFRA-004 (cache-headers через hightek.ru
  support, реальный фикс корневой причины «Failed to fetch dynamically
  imported module»), BUG-PVL-COHORT-NULL-OVERWRITE
  (ensurePvlStudentInDb fix), FEAT-017 V1 (admin таб «Прогресс ПВЛ»
  с RPC, sortable table, GroupProgressBar, hidden-filter), CLEAN-013
  partial (минус 3 user, оставлены 2 как тест-окружение).
- **Хронология:** 5 коммитов сессии — `2228f70` (meta-tags
  workaround), `7c28ed3` (BUG-PVL-COHORT fix), `0867aa6` (FEAT-017
  базовый), `e3a992f` (cleanup non-student records), `377a148`
  (GroupProgressBar), `296cfb3` (hidden-filter + CLEAN-013 partial).
  Plus тикет в hightek.ru support → они применили nginx-fix.
- **Workflow win:** новый «бесплатный» режим стратег↔executor через
  `docs/_session/` (стратег пишет файлы напрямую, executor читает с
  диска) — реально снизил трафик копий между чатами в 2 раза. Это
  второй день в новом формате, держится.
- **Что закрыто полностью** + **что осталось** (с link'ами на новые
  тикеты в backlog).
- **Если продолжаешь следующей сессией** — открыть BACKLOG секцию
  P1+P2 (NB-RESTORE, FEAT-018, FEAT-015, FEAT-016, FEAT-019
  Сокровищница).

## 3. Commit + push

В commit'е — три blob'а:
- `garden/plans/BACKLOG.md` (обновлён)
- `garden/docs/journal/HANDOVER_2026-05-08_session_infra004_pvl_progress.md` (новый)
- `garden/docs/_session/_01...19` (вся папка целиком, как договорились
  2026-05-07)

Сообщение коммита:

```
docs: HANDOVER 2026-05-08 + BACKLOG update + session/_2026-05-08

Сессия закрыла:
- INFRA-004 (cache-headers через hightek.ru support, real nginx
  fix)
- BUG-PVL-COHORT-NULL-OVERWRITE (ensurePvlStudentInDb fix)
- FEAT-017 V1 (admin таб «Прогресс ПВЛ»: RPC + sortable table +
  GroupProgressBar + hidden-filter через hiddenGardenUserIds)
- CLEAN-013 partial (LIlia dup + Рита + Екатерина Салама удалены;
  Настина фея + Настин фиксик оставлены как тест-окружение Насти)

Новые тикеты в backlog:
- BUG-PVL-ENSURE-RESPECTS-ROLE (P2) — корневая причина
  попадания admin/mentor/intern в pvl_students
- FEAT-017-V2-VISUALIZATIONS (P3) — будущие визуализации
  накопительно
- PROD-DB-MIGRATE-ISPMANAGER (P3 idea) — миграция БД на
  shared-хостинг, future strategic
- TEST-INFRA-SETUP (P3) — настройка тестовой инфры
- UX-QUICK-FIXES добавлен пункт «Колотилова Светлана —
  убрать отчество»

Workflow второй день в _session/-режиме — снизил трафик копий
между чатами в ~2 раза.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

После commit — push сразу. Это финальный документ-commit, не код, не
миграция.

## После push

Стратег обновит memory `project-garden.md` параллельно — это уже её
зона.

Сессия закрыта. Следующая сессия (когда Ольга вернётся): открыть
HANDOVER_2026-05-08 + BACKLOG секции P1+P2.
