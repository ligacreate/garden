# Закрытие сессии 2026-05-07 — финальные документы

**Адресат:** VS Code Claude Code (executor).
**Автор:** стратег (claude.ai).
**Создано:** 2026-05-07.

Финальные шаги сессии. Read+Write на artefacts, один commit, push.
**НЕ apply, НЕ DDL** — только документация.

## Что обновить

### 1. `garden/plans/BACKLOG.md`

#### Перевести в 🟢 DONE с датой 2026-05-07:

- **BUG-ADMIN-DELETE-USER** — RPC `admin_delete_user_full` + 204-guard
  в `postgrestFetch` + UI refetch. Commits 9fddae4 + f57d087. Smoke
  на Лене Ф зелёный (профиль удалён, refetch verified-by-logic).
- **CLEAN-013** обновить: Лена Ф удалена 2026-05-07. Остальные 4
  кандидата + Екатерина Салама — отложены до решения Ольги по
  «Настин тест-set».

#### Завести новые карточки:

**`UX-QUICK-FIXES`** (накопительный, новый):
- 🟢 [DONE 2026-05-07] подзаголовок «События календаря с типом…» в
  PVL-календаре удалён (commit 9fddae4)
- 🟢 [DONE 2026-05-07] кнопка «Смотреть запись» в карточках практикумов
  удалена (commit f57d087)
- 🔴 [TODO] layout 3 колонок в «Записи проведённых практикумов» —
  продуктовое решение (full-width + описание под видео?)
- 🔴 [TODO] добавлять при возникновении

**`INFRA-N: cache-headers index.html`** (приоритет **P1**, не P3):
- max-age=86400 на index.html → каждый deploy потенциально ломает
  PVL-учительскую у юзеров с кэшем (Failed to fetch dynamically
  imported module). Реальное проявление 2026-05-07 у Ольги.
- Стандарт: index.html `no-cache`, `assets/*` `immutable
  max-age=31536000`.
- Фикс в nginx-конфиге фронта (на сервере 185.215.4.44).
- Оценка: ~10-15 мин.

**`TECH-DEBT-FK-CONTRACTS`** (P3):
- Объявить недостающие FK на 3 таблицах:
  - `pvl_students.id` → `profiles.id`
  - `users_auth.id` → `profiles.id`
  - `pvl_garden_mentor_links.student_id` → `profiles.id` (+ `mentor_id`?)
- + ON DELETE CASCADE на `meetings.user_id` → сейчас FK без CASCADE,
  потенциальная бомба замедленного действия.
- Связано: BUG-ADMIN-DELETE-USER recon показал orphan-риск.

**`PROD-USER-DELETE-MODEL`** (P2):
- Продуктовое решение: hard-delete vs soft-delete для будущих
  реальных удалений пользователей. Сейчас RPC
  `admin_delete_user_full` делает hard DELETE — корректно для
  тестовых, но реальные требуют soft-delete (`status='archived'/
  'deleted'`) для audit-trail и возможности восстановить.
- Решать когда появится первый кейс реального удаления (уход из
  Лиги, по запросу).

**`BUG-MEETINGS-VK-BUTTON-OVERFLOW`** (передано meetings-команде,
закрыто 2026-05-07):
- На карточке события в meetings ВК-кнопка подрезалась за рамку +
  опечатка «Телеграмма» → «Телеграм». Фикс meetings-стратегом
  через vertical stack (`flex flex-col`, без `sm:flex-row`),
  commit 62cf08d, prod smoke 8/8.

**`CONTRACT-GARDEN-MEETINGS-001`** (новый):
- `events.host_telegram` всегда NOT NULL и непуст. Meetings-фронт
  рендерит TG-кнопку без runtime-if. При изменении
  `sync_meeting_to_event` или схемы `events` — проверять, что
  контракт сохранён. Verify:
  ```sql
  SELECT count(*) FROM events
  WHERE event_starts_at > now()
    AND (host_telegram IS NULL OR trim(host_telegram) = '');
  -- ожидание: 0
  ```
- Источник: meetings-стратег, апдейт 2026-05-07.

**`BUG-PVL-COHORT-NULL-OVERWRITE`** (P2, новый):
- Smoking gun: `services/pvlMockApi.js:622-628` `ensurePvlStudentInDb`
  хардкодит `cohort_id: null`. Все 22 активных студента имели
  cohort_id NULL — 2026-05-07 backfill применил `'11111111-…-101'`
  для активной когорты Поток 1, но регрессирует при следующем
  визите админа в PVL.
- Лечение: заменить хардкод null на `seedCohortIdToSqlUuid(profile.cohortId)`
  ИЛИ INSERT…ON CONFLICT DO NOTHING вместо merge-duplicates (не
  перетирать существующий cohort_id/mentor_id).
- Связано: phase 25 (commits 66c7c0e + 7b832f1).

**`FEAT-019: Сокровищница + маркетплейс`** (большая, P2-P3):
- Полный текст ТЗ в файле
  `docs/_session/2026-05-07_10_idea_treasury_marketplace.md` —
  не дублировать в backlog, только summary + ссылка.
- Краткое summary: новый раздел «Сокровищница» (общая бесплатная
  база практик ведущих) + переименование «Практики» → «Мои
  практики» + механика публикации/модерации/форка с атрибуцией +
  начисление семян за публикацию + расширение модели Practice +
  заложить архитектуру маркетплейса (без UI).
- Бюджет: ~8-11 сессий (1 на план + 7 этапов реализации).
- Зависимости: NB-RESTORE, UX-002, INFRA-N (рекомендуется закрыть
  до релиза).

#### Перевести FEAT-016 + FEAT-017 → 🟡 IN PROGRESS:

- Фундамент готов 2026-05-07: phase 25 миграция (RPC
  `pvl_admin_progress_summary`, поля `module_number`,
  `is_module_feedback`) + backfill cohort_id.
- **Блокер до фикса BUG-PVL-COHORT-NULL-OVERWRITE** —
  иначе backfill регрессирует.
- FEAT-017 frontend (новый таб AdminPanel `pvl-progress`) —
  следующей сессией после BUG-PVL-COHORT-NULL-OVERWRITE.
- FEAT-016 (CSV-выгрузка) — после FEAT-017.

### 2. Создать HANDOVER 2026-05-07

Файл: `garden/docs/journal/HANDOVER_2026-05-07_session_admin_delete_phase25.md`

(Один handover на всю сегодняшнюю сессию — две большие темы:
BUG-ADMIN-DELETE-USER + phase 25.)

Структура — как HANDOVER 2026-05-06 (см. прецедент):
- TL;DR
- Что сделано (хронология): 9fddae4 → f57d087 → phase 25 apply →
  backfill cohort_id (66c7c0e + 7b832f1)
- 4 commit'а сессии с hash'ами и описаниями
- Числа: smoke pass count, удалённых profiles (1), backfill (22)
- Что закрыто
- Что открыто (carry-forward, со ссылками на новые тикеты в BACKLOG)
- Артефакты сессии (миграции, _session/-файлы)
- Если продолжаешь FEAT-017 frontend — что прочитать в первую очередь

### 3. Commit + push

В этом же commit'е:
- `garden/plans/BACKLOG.md` (обновлён)
- `garden/docs/journal/HANDOVER_2026-05-07_session_admin_delete_phase25.md`
  (новый)
- **Вся папка `garden/docs/_session/`** целиком (Ольга утвердила
  «целиком в git»):
  - 13 файлов сегодняшней сессии (`_01` через `_13`)

Commit message:

```
docs: HANDOVER 2026-05-07 + BACKLOG update +
      session/_2026-05-07 переписка стратег↔executor

Сессия закрыла:
- BUG-ADMIN-DELETE-USER (RPC + 204-guard + UI refetch)
- UX-QUICK-FIXES (подзаголовок календаря, кнопка «Смотреть запись»)
- Phase 25: pvl_admin_progress_summary RPC + module_number /
  is_module_feedback в pvl_homework_items + backfill cohort_id
  для активной когорты Поток 1.

Новые тикеты в backlog:
- INFRA-N (cache-headers, P1)
- BUG-PVL-COHORT-NULL-OVERWRITE (P2)
- TECH-DEBT-FK-CONTRACTS (P3)
- PROD-USER-DELETE-MODEL (P2)
- CONTRACT-GARDEN-MEETINGS-001
- FEAT-019: Сокровищница + маркетплейс (большая, P2-P3)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

После commit — `git status`, `git log -3 --oneline`, **🟢 PUSH**
автоматически в этот раз (это финальный документ-commit, не код,
не миграция).

## После push

Сессия закрыта. Стратег обновляет memory `project-garden.md`
(в Obsidian-папке Skrebeyko, не в репо) — это уже параллельно делает
сама.

Следующая сессия (когда Ольга вернётся): открыть
`HANDOVER_2026-05-07_session_admin_delete_phase25.md` + BACKLOG
секции INFRA-N / BUG-PVL-COHORT-NULL-OVERWRITE / FEAT-017+FEAT-016 +
(когда дойдём) FEAT-019.
