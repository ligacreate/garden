---
title: HANDOVER 2026-05-07 — BUG-ADMIN-DELETE-USER + Phase 25 (FEAT-016/017 фундамент)
type: handover
created: 2026-05-07
status: SESSION CLOSED — две большие темы за одну сессию, 4 commit'а на origin
related:
  - plans/BACKLOG.md
  - migrations/2026-05-07_phase24_admin_delete_user_rpc.sql
  - migrations/2026-05-07_phase25_pvl_admin_progress_summary.sql
  - migrations/data/2026-05-07_pvl_students_cohort_backfill.sql
  - docs/_session/2026-05-07_*  (13 файлов переписки стратег↔executor)
  - docs/journal/HANDOVER_2026-05-06_session_feat002_garden.md
---

# HANDOVER 2026-05-07 — BUG-ADMIN-DELETE-USER + Phase 25

Документ-снимок состояния для следующего стратега и Ольги при
возврате. Сессия 2026-05-07 закрыла две большие темы — баг с
админ-удалением пользователей и фундамент для FEAT-016/017
(дашборд + выгрузка ДЗ ПВЛ). 4 коммита на `origin/main`.

---

## TL;DR

**Две большие темы за одну сессию:**

1. **BUG-ADMIN-DELETE-USER ЗАКРЫТ.** Корневые причины (recon read-only):
   (1) на `public.profiles` отсутствовала RLS-policy `FOR DELETE` →
   silent no-op, (2) `postgrestFetch` падал на HTTP 204 No Content
   (PostgREST для `RETURNS void` RPC отдаёт пустое тело,
   `response.json()` бросал `SyntaxError`).
   **Решение:** phase 24 миграция RPC `admin_delete_user_full(uuid)`
   SECURITY DEFINER + 204-guard в `postgrestFetch` + UI refetch.
   **Smoke:** 5/5 PASS, Лена Ф удалена через UI без F5
   (один из 5 кандидатов CLEAN-013).

2. **Phase 25 фундамент для FEAT-016/017.** Полный цикл
   recon→план→ревью→apply через 7 переписочных файлов в
   `docs/_session/`. **Phase 25 миграция applied:** добавлены
   поля `module_number / is_module_feedback / updated_at` (последняя
   фиксит pre-existing trigger латентный баг) в `pvl_homework_items` +
   backfill через regex по title + создана RPC
   `pvl_admin_progress_summary(p_cohort_id uuid)` SECURITY DEFINER.
   **Backfill cohort_id:** apply-отчёт обнаружил все 22 студента с
   `cohort_id IS NULL`, recon нашёл smoking gun за 5 минут
   (`pvlMockApi.js:622-628` хардкодит null), backfill применён
   через отдельную data-миграцию.

**Параллельно за сессию:**
- UX-QUICK-FIXES batch 1 — удалён developer-style подзаголовок в
  PVL-календаре + сломанная кнопка «Смотреть запись» (href с raw
  iframe-HTML → 400 от nginx).
- BUG-MEETINGS-VK-BUTTON-OVERFLOW — переподтверждено DONE (закрыто
  meetings-стратегом, commit `62cf08d`).
- INFRA-004 повышен P3→P1 из-за реального проявления у Ольги
  (`Failed to fetch dynamically imported module` после deploy).

**Что осталось (carry-forward):**
- 🔴 **BUG-PVL-COHORT-NULL-OVERWRITE** (P2) — блокер для FEAT-017
  frontend smoke; backfill регрессирует при следующем визите админа.
- 🔴 **INFRA-004** (P1) — cache-headers index.html.
- 🟡 **FEAT-016 + FEAT-017** (P2) — IN PROGRESS, фундамент готов,
  ждут BUG-PVL-COHORT-NULL-OVERWRITE и потом frontend.
- 🔴 **FEAT-019: Сокровищница + маркетплейс** (P2-P3, новая) — полное
  ТЗ в `docs/_session/2026-05-07_10_idea_treasury_marketplace.md`.
- 🔴 **TECH-DEBT-FK-CONTRACTS** (P3, было ARCH-014).
- 🔴 **PROD-USER-DELETE-MODEL** (P2, было PROD-005).
- 🟡 **CLEAN-013** — 1/5 удалено, 4 ждут решения Ольги по «Настин
  тест-set» + Екатерина Салама.

---

## Что сделано (хронология сессии 2026-05-07)

### Часть A — BUG-ADMIN-DELETE-USER (commits `9fddae4` + `f57d087`)

#### A1. Recon (read-only psql под gen_user)
Установлено:
- На `public.profiles` отсутствует RLS-policy `FOR DELETE` (есть
  только insert_own / select_authenticated / update_own / update_admin).
  GRANT DELETE для authenticated есть, но без policy RLS режет любой
  DELETE до 0 rows → silent no-op в админке.
- FK-карта на profiles: только 2 FK (course_progress CASCADE,
  meetings без CASCADE).
- Связи без FK (orphan-риск): `users_auth.id`, `pvl_students.id`,
  `pvl_garden_mentor_links` (student_id + mentor_id),
  `pvl_direct_messages` (3 колонки).

Параллельно подтверждена гипотеза по дублю LIlia MALONG (CLEAN-013):
8 строк `pvl_student_content_progress` у dup — все на материалах,
которые main `d302b93d-…fa15` прошла на 100%; mentor_link дублирует
main; pvl_students пустая; 1 audit-запись `library_complete` с пустым
payload. → **Прямой DELETE через RPC, MERGE отменён.**

⚠ Critical-finding: `nastin_fixik` числится фейк-ментором для
4 студентов, включая **реального applicant Екатерину Салама**
(`49c267b1-…-1b90`). Перед удалением — переподвесить.

#### A2. Phase 24 миграция (commit `9fddae4`)
- RPC `public.admin_delete_user_full(uuid)` SECURITY DEFINER, проверка
  `is_admin()`, audit BEFORE delete, удаление в порядке
  «дети → родители»: meetings → pvl_direct_messages →
  pvl_garden_mentor_links → pvl_students → users_auth → profiles.
- GRANT EXECUTE для authenticated.
- RUNBOOK 1.3: `SELECT public.ensure_garden_grants()` ДО `COMMIT`.
- V1/V2/V3 + NULL-guard sanity все зелёные.

Frontend patch (тот же commit):
- `services/dataService.js`: `deleteUser` → `POST /rpc/admin_delete_user_full`.
- `views/AdminPanel.jsx`: `onRefreshUsers()` после успеха + читаемые
  тосты (forbidden / null / прочие).
- `views/PvlCalendarBlock.jsx`: удалён developer-style `<p>` под
  заголовком «Записи проведённых практикумов».

⚠ **Реверт грязного коммита.** Первый `git commit` подхватил 54
чужих docs/* ренейма из давно-staged индекса. Откачено через
`git reset --soft HEAD~1` + `git restore --staged docs/`,
перекомичен чисто (`9fddae4`).

#### A3. Smoke 1 — backend OK, refetch FAIL (204-bug)
Через Claude in Chrome: POST `/rpc/admin_delete_user_full` → 204,
профиль удалён в БД. Но **Лена Ф осталась в DOM до F5**.

Recon корневой причины (read-only): [`postgrestFetch:55-69`](../../services/dataService.js#L55-L69)
безусловно делает `await response.json()`. PostgREST для `RETURNS void`
RPC возвращает HTTP 204 с пустым телом → SyntaxError →
`api.deleteUser()` бросает после успешного DELETE → catch →
`onRefreshUsers` не вызван.

Латентность: та же проблема в `deleteShopItem` ([dataService.js:1347](../../services/dataService.js#L1347))
и других DELETE без `returnRepresentation`. Никто не замечал — UI
обновлялся через другие механизмы.

#### A4. Phase 24 + 204-guard (commit `f57d087`)
- 204-guard в `postgrestFetch` (3 строки):
  ```js
  if (response.status === 204) return { data: null };
  ```
- Удалена сломанная кнопка «Смотреть запись» в
  `PvlCalendarBlock.jsx` (`<a href={ev.recordingUrl}>` где
  `recordingUrl` — embed-iframe HTML, не URL → 400 от nginx).

#### A5. Smoke 2 — 5/5 PASS
Через Claude in Chrome: Лена Ф удалена через UI **без F5**. Список
обновился, тост «Пользователь удалён», профиль исчез из БД.

### Часть B — Phase 25 фундамент FEAT-016/017 (commits `66c7c0e` + `7b832f1`)

#### B1. Recon FEAT-016/017 — параллельно executor + стратег
- **Code-recon executor'а** (`docs/_session/_02`): 8382 строки
  PvlPrototypeApp.jsx, двойной data layer (mock+PostgREST), пустая
  reusable-инфраструктура (нет CSV-утилиты, нет sortable-table),
  AdminPanel — 6 табов без аналитики студентов, routing
  state-based (PROD-004).
- **DB-recon стратега** (`_03`): 1 cohort, 22 students, 19
  hw_items, 53 submissions. Module_number зашит в title строкой,
  нет структурного поля. lesson_id/week_id почти не используются.

#### B2. Phase 25 план (`_04` strategist prompt → `_05` executor plan)
Стратег написал prompt с открытыми questions 3.1-3.6, executor
проверил distribution на 19 hw_items, ответил на questions
(control_points исключаем, «Домашка 1» оставляем NULL, «Рефлексия
по модулю» без цифры — `is_module_feedback=t module_number=NULL`,
mentor_name через pvl_mentors с возможным fallback на profiles.name,
ключи jsonb как text, sort by full_name).

#### B3. Strategist review (`_06`): одна поправка
3.4 — добавить fallback на `profiles.name`: 18 mentor_links и
только 1 строка в `pvl_mentors` → большинство mentor_id указывают
на profiles. Поправка:
```sql
LEFT JOIN public.pvl_mentors m       ON m.id = ml.resolved_mentor_id
LEFT JOIN public.profiles    p_mentor ON p_mentor.id = ml.resolved_mentor_id
-- …
'mentor_name', COALESCE(m.full_name, p_mentor.name),
```
Подтверждено `\d public.profiles` — колонка `name`.

#### B4. Apply phase 25 (`_07` apply-отчёт)
- **Apply 1: FAIL** на backfill UPDATE с
  `record "new" has no field "updated_at"`. Латентный баг:
  `trg_pvl_homework_items_updated_at BEFORE UPDATE` ожидает
  `NEW.updated_at`, но колонки исторически не было. Транзакция
  корректно откатилась, GRANTs 158/4 целы.
- **Поправка:** добавлена 3-я колонка `updated_at timestamptz NOT
  NULL DEFAULT now()` в ALTER TABLE.
- **Apply 2: PASS.** ALTER TABLE (3 колонки + 3 COMMENT), 2 UPDATE
  backfill (по 19 строк), CREATE FUNCTION, GRANT EXECUTE,
  ensure_garden_grants. **V1-V5 (+V6) все зелёные.**

Distribution backfill (V5):
```
 module_number | is_module_feedback | count 
---------------+--------------------+-------
             1 | f                  |     2
             1 | t                  |     1
             2 | f                  |     2
             3 | t                  |     1
               | f                  |    12
               | t                  |     1
```
Точное совпадение с TL;DR-таблицей плана.

#### B5. cohort_id recon + backfill (`_08` strategist prompt → `_09` recon → `_11` strategist prompt → `_12` apply-отчёт)
**Apply phase 25 выявил:** все 22 `pvl_students.cohort_id IS NULL`
→ RPC `pvl_admin_progress_summary(uuid)` возвращает [] для любого
аргумента.

**Recon executor'а нашёл smoking gun за 5 минут:**
[`services/pvlMockApi.js:622-628`](../../services/pvlMockApi.js#L622-L628)
жёстко пишет `cohort_id: null` в self-heal upsert
`ensurePvlStudentInDb`. Через `Prefer: resolution=merge-duplicates`
это перезаписывает существующие значения каждый раз когда админ
заходит в учительскую (9 callsite'ов триггерят).

**Backfill data-миграция:** `migrations/data/2026-05-07_pvl_students_cohort_backfill.sql`
— `UPDATE pvl_students SET cohort_id = '11111111-1111-1111-1111-111111111101'
WHERE cohort_id IS NULL`. 22 строки обновлены, V1-V3 зелёные.

⚠ **Backfill регрессирует** при следующем визите Ольги/Насти/Ирины
в PVL до фикса хардкода → `BUG-PVL-COHORT-NULL-OVERWRITE` (P2).

---

## 4 commit'а сессии (все на `origin/main`)

| Hash | Тип | Что |
|---|---|---|
| `9fddae4` | fix | BUG-ADMIN-DELETE-USER — RPC `admin_delete_user_full` + UI refetch + UX (подзаголовок календаря). 4 файла + миграция phase 24. |
| `f57d087` | fix + ux | postgrestFetch — поддержка HTTP 204 + удалена сломанная кнопка «Смотреть запись». 2 файла. |
| `66c7c0e` | feat | Phase 25 — `pvl_admin_progress_summary` RPC + `module_number` / `is_module_feedback` + латентный фикс `updated_at`. 1 файл миграции. |
| `7b832f1` | data | Backfill `pvl_students.cohort_id` для активной когорты Поток 1. 1 файл data-миграции. |

И этот HANDOVER + BACKLOG update + папка `_session/` целиком —
финальный 5-й commit (этот документ).

---

## Числа

- **Smoke pass count:** 1 пилотный (Лена Ф) + 5/5 фейл/успех на
  refetch (зелёный после 204-guard).
- **Удалённых profiles:** 1 (Лена Ф через UI). Остальные 4
  кандидата CLEAN-013 ждут решения Ольги по тест-set.
- **Backfill phase 25:** 6 строк module_number + 4 строки
  is_module_feedback (по 19 hw_items).
- **Backfill cohort_id:** 22 строки `pvl_students` (NULL → активная
  когорта).
- **Recon documents:** 13 файлов в `docs/_session/2026-05-07_*`
  (`_01` через `_13`).
- **Latent bugs обнаружено и закрыто:** 2 (204-bug в postgrestFetch
  + missing updated_at column в pvl_homework_items).
- **Counts grants после apply phase 25:** 158/4 стабильно (Timeweb
  DDL wipeout не сработал, RUNBOOK 1.3 защитил).

---

## Что закрыто

- **BUG-ADMIN-DELETE-USER** (P2). RPC + 204-guard + UI refetch.
- **CLEAN-013, 1/5** (Лена Ф удалена через UI).
- **UX-QUICK-FIXES batch 1**: подзаголовок календаря + кнопка «Смотреть запись».
- **Phase 25 миграция applied** на прод.
- **cohort_id backfill applied** для 22 студентов (временно — до
  фикса хардкода).
- **BUG-MEETINGS-VK-BUTTON-OVERFLOW** (закрыто meetings-стратегом,
  commit `62cf08d`).

## Что открыто (carry-forward)

| ID | Что | Приоритет | Где |
|---|---|---|---|
| BUG-PVL-COHORT-NULL-OVERWRITE | Хардкод `cohort_id: null` в `pvlMockApi.js:622-628` `ensurePvlStudentInDb` — backfill регрессирует | **P2** (блокер FEAT-017 frontend smoke) | `services/pvlMockApi.js` |
| INFRA-004 | cache-headers index.html — `max-age=86400` слишком агрессивен | **P1** (повышен с P3 после реального проявления у Ольги) | nginx-config на 185.215.4.44 |
| FEAT-016 | Выгрузка ДЗ ПВЛ — CSV-экспорт | P2 (🟡 IN PROGRESS — фундамент готов phase 25) | `views/AdminPanel.jsx` или новая страница |
| FEAT-017 | Дашборд прогресса студентов ПВЛ | P2 (🟡 IN PROGRESS — RPC готов, ждёт frontend + BUG-PVL-COHORT-NULL-OVERWRITE) | новый таб AdminPanel или admin-страница в учительской |
| FEAT-019 | Сокровищница + маркетплейс практик | P2-P3 | `docs/_session/_10` полное ТЗ |
| TECH-DEBT-FK-CONTRACTS | Контрактные FK на 3 таблицах + ON DELETE CASCADE на meetings.user_id | P3 | DDL-миграция |
| PROD-USER-DELETE-MODEL | Soft-delete vs hard-delete для реальных пользователей | P2 | продуктовый цикл |
| CLEAN-013 (4/5) | Рита, LIlia MALONG dup, Настина фея + Настин фиксик, Екатерина Салама | P2 | UI / psql после решения Ольги |
| CONTRACT-GARDEN-MEETINGS-001 | events.host_telegram NOT NULL и непуст | P2 (документация контракта) | health-check / smoke |
| UX-QUICK-FIXES (cont.) | Layout 3 колонок в «Записи практикумов» | P3 | продуктовое решение |

Полные карточки — в [`plans/BACKLOG.md`](../../plans/BACKLOG.md).

---

## Артефакты сессии

**Миграции (3 файла):**
- `migrations/2026-05-07_phase24_admin_delete_user_rpc.sql`
- `migrations/2026-05-07_phase25_pvl_admin_progress_summary.sql`
- `migrations/data/2026-05-07_pvl_students_cohort_backfill.sql`

**Frontend (3 файла):**
- `services/dataService.js` — `deleteUser` → POST RPC + 204-guard
  в `postgrestFetch`
- `views/AdminPanel.jsx` — refetch + читаемые тосты
- `views/PvlCalendarBlock.jsx` — удалён `<p>` (подзаголовок) и
  `<a>«Смотреть запись»` + import `ExternalLink`

**Переписка стратег↔executor (13 файлов в `docs/_session/`):**
- `_01_recon_feat016_017_prompt.md` — стратег
- `_02_codeexec_recon_feat016_017_report.md` — executor
- `_03_strategist_db_recon.md` — стратег
- `_04_strategist_phase25_prompt.md` — стратег
- `_05_codeexec_phase25_plan.md` — executor
- `_06_strategist_phase25_review.md` — стратег
- `_07_codeexec_phase25_apply_report.md` — executor
- `_08_strategist_commit_phase25_prompt.md` — стратег
- `_09_codeexec_cohort_id_recon.md` — executor (smoking gun!)
- `_10_idea_treasury_marketplace.md` — стратег (FEAT-019 ТЗ)
- `_11_strategist_backfill_and_push.md` — стратег
- `_12_codeexec_backfill_apply_report.md` — executor
- `_13_strategist_session_close_prompt.md` — стратег (этот промпт)

**Документация:**
- [`plans/BACKLOG.md`](../../plans/BACKLOG.md) — обновлены статусы
  (BUG-ADMIN-DELETE-USER → DONE, FEAT-016/017 → IN PROGRESS,
  BUG-MEETINGS-VK-BUTTON-OVERFLOW → DONE, INFRA-004 P3→P1) +
  добавлены/переименованы карточки (BUG-PVL-COHORT-NULL-OVERWRITE,
  FEAT-019, TECH-DEBT-FK-CONTRACTS, PROD-USER-DELETE-MODEL).
- `docs/journal/HANDOVER_2026-05-07_session_admin_delete.md`
  (предыдущий promo-снимок, после Часть A).
- `docs/journal/HANDOVER_2026-05-07_session_admin_delete_phase25.md`
  (этот файл — финальный полный handover).

---

## Если продолжаешь FEAT-017 frontend

**Сначала:** закрыть `BUG-PVL-COHORT-NULL-OVERWRITE` —
точечный edit в [`services/pvlMockApi.js:622-628`](../../services/pvlMockApi.js#L622-L628).
Полный recon уже сделан в
[`docs/_session/2026-05-07_09_codeexec_cohort_id_recon.md`](../_session/2026-05-07_09_codeexec_cohort_id_recon.md)
Section 2 + 3.2.

После фикса:
1. **Reapply backfill** (он идемпотентный) — `migrations/data/2026-05-07_pvl_students_cohort_backfill.sql`.
2. **Smoke под админ-JWT:** `POST /rpc/pvl_admin_progress_summary
   {p_cohort_id: '11111111-1111-1111-1111-111111111101'}` →
   ожидаем 22 объекта в jsonb-массиве.
3. **Frontend:** новый таб `pvl-progress` в `AdminPanel.jsx` (или
   новая admin-страница в учительской). Прокинуть RPC через
   `pvlPostgrestApi.callRpc('pvl_admin_progress_summary', { p_cohort_id })`
   (метод нужно создать — сейчас `pvlPostgrestApi` поддерживает
   только rpc/increment_user_seeds inline-стиль; обобщить).
4. **UI таблица** с колонками: Студент / Когорта / Ментор / Прогресс
   модулей (jsonb badges) / hw_accepted/hw_total / state_line.
5. **Smoke** на проде через Claude in Chrome.

После FEAT-017 — FEAT-016 (CSV-выгрузка ДЗ).

## Если продолжаешь INFRA-004 (P1)

Edit nginx-конфига сайта на сервере `185.215.4.44`. Спецификация
в [`plans/BACKLOG.md`](../../plans/BACKLOG.md) `### INFRA-004`
карточке. Два `location`-блока (index.html no-cache, assets/*
immutable). `nginx -t && systemctl reload nginx`. Smoke: открыть
`liga.skrebeyko.ru` в инкогнито после deploy → должна показаться
свежая версия без hard reload.

## Если продолжаешь FEAT-019 (Сокровищница)

Полное ТЗ в
[`docs/_session/2026-05-07_10_idea_treasury_marketplace.md`](../_session/2026-05-07_10_idea_treasury_marketplace.md).
~8-11 сессий. Зависимости (рекомендуется закрыть до релиза):
NB-RESTORE, UX-002, INFRA-004.

## Если открываешь новый чат стратега (claude.ai)

Скажи: «Открываю продолжение после сессии 2026-05-07. Прочитай
`docs/journal/HANDOVER_2026-05-07_session_admin_delete_phase25.md`,
потом карточки BUG-PVL-COHORT-NULL-OVERWRITE / INFRA-004 / FEAT-016 /
FEAT-017 / FEAT-019 в `plans/BACKLOG.md`, и секцию История 2026-05-07.
Если нужны детали phase 25 — `docs/_session/2026-05-07_*` (13 файлов
переписки за сессию).»

Стратег прочтёт и восстановит контекст.

---

## Контакты в коде/инфре (актуальный снимок)

- Сервер: `ssh root@5.129.251.56` (Mysterious Bittern, Timeweb Cloud)
- БД: managed Postgres 18.1, роль `gen_user` (owner)
- PostgREST: Docker-контейнер на 127.0.0.1:3000, JWT-валидация active
- garden-auth: systemd, `/opt/garden-auth/server.js` на 127.0.0.1:3001
- Caddy: `/etc/caddy/Caddyfile`, проксирует api.* и auth.skrebeyko.ru
- Фронт Garden: nginx на 185.215.4.44, деплой через GitHub Actions FTP
- Cron-monitor: `/etc/cron.d/garden-monitor`, лог в
  `/var/log/garden-monitor.log`
- Stored procedures (актуальный список):
  `public.is_admin()`, `public.is_mentor_for(uuid)`,
  `public.ensure_garden_grants()`,
  `public.sync_meeting_to_event()`,
  `public.resync_events_for_user(uuid)`,
  `public.admin_delete_user_full(uuid)` — phase 24,
  `public.pvl_admin_progress_summary(uuid)` — **NEW phase 25**.
- Репо: ligacreate/garden (фронт), ligacreate/garden-auth, garden-db,
  ligacreate/meetings.

---

## История изменений документа

- **2026-05-07 (v1.0):** Создан в финале сессии 2026-05-07.
  4 commit'а на origin/main. BUG-ADMIN-DELETE-USER закрыт,
  Phase 25 фундамент готов, FEAT-016/017 IN PROGRESS, новые
  тикеты заведены (BUG-PVL-COHORT-NULL-OVERWRITE, FEAT-019,
  + переименования ARCH-014 → TECH-DEBT-FK-CONTRACTS, PROD-005 →
  PROD-USER-DELETE-MODEL, INFRA-004 P3→P1).
