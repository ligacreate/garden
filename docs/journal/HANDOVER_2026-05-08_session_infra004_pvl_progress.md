---
title: HANDOVER 2026-05-08 — INFRA-004 + BUG-PVL-COHORT + FEAT-017 V1 + CLEAN-013 partial
type: handover
created: 2026-05-08
status: SESSION CLOSED — четыре темы за одну сессию, 6 commit'ов на origin (+ handover commit)
related:
  - plans/BACKLOG.md
  - migrations/data/2026-05-08_cleanup_non_student_pvl_records.sql
  - migrations/data/2026-05-08_cleanup_clean013_partial.sql
  - services/pvlMockApi.js (fix `ensurePvlStudentInDb`)
  - services/pvlPostgrestApi.js (`+listCohorts`, `+getAdminProgressSummary`)
  - views/AdminPvlProgress.jsx (новый)
  - views/AdminPanel.jsx (`pvl-progress` таб)
  - index.html (meta-tags Cache-Control)
  - public/.htaccess (Path B residual)
  - docs/lessons/2026-05-08-pvl-cohort-null-overwrite.md
  - docs/_session/2026-05-08_*  (19 файлов переписки стратег↔executor)
  - docs/journal/HANDOVER_2026-05-07_session_admin_delete_phase25.md
---

# HANDOVER 2026-05-08 — INFRA-004 + BUG-PVL-COHORT + FEAT-017 V1 + CLEAN-013 partial

Документ-снимок состояния для следующего стратега и Ольги при возврате.
Сессия 2026-05-08 закрыла четыре темы — кеш-заголовки прода, корень
бага cohort_id wipeout, V1 дашборда «Прогресс ПВЛ» и частичный data
cleanup. 6 продакшн-коммитов на `origin/main` + этот handover.

---

## TL;DR

**Четыре темы за одну сессию:**

1. **INFRA-004 ЗАКРЫТ через тикет hightek.ru support.** Реальный фикс
   корневой причины «Failed to fetch dynamically imported module»
   (инцидент 2026-05-07). Recon показал, что хостинг — чистый nginx без
   Apache (`.htaccess` Path B не сработал, ISPmanager-панель Path C
   тоже — нет полей для custom-директив). Path D (тикет в саппорт)
   сработал: hightek.ru применили nginx-fix `Cache-Control: no-cache`
   на `index.html` + `public, immutable, max-age=31536000` на
   `/assets/*`. Plus временный workaround commit `2228f70` —
   `<meta http-equiv="Cache-Control">` в `index.html` как
   defense-in-depth.

2. **BUG-PVL-COHORT-NULL-OVERWRITE ЗАКРЫТ** (commit `7c28ed3`). Гибрид
   A+B по плану `_08`: `ensurePvlStudentInDb` резолвит `cohort_id`
   через `seedCohortIdToSqlUuid` + `mentor_id` через `uuidOrNull`;
   передаёт в payload только если значение валидно. PostgREST с
   merge-duplicates на не-переданные поля сохраняет существующее в БД
   нетронутым. Backfill 2026-05-07 больше не регрессирует. Урок:
   [`docs/lessons/2026-05-08-pvl-cohort-null-overwrite.md`](../lessons/2026-05-08-pvl-cohort-null-overwrite.md).

3. **FEAT-017 V1 ЗАКРЫТ.** Admin таб «Прогресс ПВЛ» в Garden AdminPanel
   через RPC `pvl_admin_progress_summary`. Sortable таблица из 10 колонок,
   фильтр по `state_line`, persist выбранной когорты в sessionStorage,
   `GroupProgressBar` (4-цветная stacked-полоска), hidden-filter через
   `hiddenGardenUserIds`. Verified Ольгой 2026-05-08 → 13 строк после
   скрытия Настина фея.

4. **CLEAN-013 PARTIAL DONE.** В дополнение к Лене Ф (2026-05-07)
   удалены LIlia MALONG (дубль), Рита, Екатерина Салама через миграцию
   `cleanup_clean013_partial` (commit `296cfb3`). **Настина фея + Настин
   фиксик оставлены как тест-окружение Насти** (продуктовое решение
   Ольги), скрыты через «глазик» в users-табе AdminPanel
   (`hiddenGardenUserIds` в localStorage). Также параллельно удалены
   5 не-студенческих записей из `pvl_students` через миграцию
   `cleanup_non_student_pvl_records` (commit `e3a992f`):
   `pvl_students` 22 → 17 → 14.

**Что осталось (carry-forward):**

- 🔴 **BUG-PVL-ENSURE-RESPECTS-ROLE** (P2, новый) — корневая причина
  попадания admin/mentor/intern в `pvl_students`. Cleanup-миграция
  устранила симптом, но не архитектуру.
- 🔴 **FEAT-016** (P2) — CSV-выгрузка ДЗ. **Без блокеров** (BUG-PVL-COHORT
  закрыт). Можно начинать следующей сессией.
- 🟡 **FEAT-017-V2-VISUALIZATIONS** (P3, накопительный) — будущие
  визуализации (heat-map, per-module bars, sparklines). Уровень 1
  (GroupProgressBar) уже сделан.
- 🔴 **TEST-INFRA-SETUP** (P3, новый) — настроить vitest, иначе любые
  unit-тесты невозможны.
- 💡 **PROD-DB-MIGRATE-ISPMANAGER** (P3 idea) — для запоминания, не
  делания.
- 🔴 **NB-RESTORE** (P1) — переезд админки notebooks/questions/cities
  из meetings в Garden (carry-forward с предыдущих сессий).
- 🔴 **FEAT-018** (P1) — часовые пояса встреч (carry-forward).
- 🔴 **FEAT-015** (P1) — авто-пауза ведущей при неоплате.
- 🔴 **FEAT-019** (P2-P3) — Сокровищница + маркетплейс. Большая фича,
  ~8-11 сессий.
- 🟡 **CLEAN-013** — 4/5 + Настины тест-фикстуры решены, 0 осталось
  на удаление.

---

## Что сделано (хронология сессии 2026-05-08)

### Часть A — INFRA-004 cache-headers (commit `2228f70` + тикет hightek.ru)

#### A1. Recon (`_01..._04`)

- **DNS-проверка показала, что фронт-хост = `185.162.93.61`** (стратег
  изначально указал `185.215.4.44` — посторонний адрес). SSH-ключ
  executor'а отклоняется на этот хост — деплой идёт по FTP, это
  shared-хостинг.
- **Recon через curl** зафиксировал baseline:
  - `index.html` → нет `Cache-Control` вообще (heuristic caching →
    корень бага 2026-05-07).
  - `/assets/*.js` → `max-age=86400` вместо `immutable` для hashed
    assets.
- **Side-findings:** SPA-fallback не настроен (404 на deep-link'ах
  вместо `index.html`), `/sw.js` кэшируется на сутки, `manifest.webmanifest`
  с MIME `application/octet-stream`. Зафиксировано как side-тикеты, в
  scope INFRA-004 не входит.

#### A2. Path B — `.htaccess` через FTP-deploy (`_03..._04`)

- Создан `public/.htaccess` с sentinel-header `X-Htaccess-Active: yes`
  + правилами на `index.html` и hashed assets.
- Commit `aa6770c` (один файл). FTP-deploy уложился в ~1м 38с
  (`Last-Modified` на bundle обновился).
- **Sentinel за 5 минут polling'а не появился** — хостинг чистый
  nginx без Apache, `.htaccess` не парсится. Path B мёртв,
  `public/.htaccess` оставлен как future-proof (безвреден).

#### A3. Path C → Path D — Timeweb-панель → саппорт (`_05..._06`)

- Стратег recon'ил ISPmanager-панель через Claude in Chrome — нет полей
  для custom nginx-директив. Path C тоже не сработал.
- **Промежуточный workaround commit `2228f70`** — meta-tags
  `<meta http-equiv="Cache-Control">` + `<meta http-equiv="Pragma">` в
  `index.html`. Снижает heuristic caching у Firefox/Safari (Chrome
  для main resource часто игнорирует meta-Cache-Control, но workaround
  безвреден).
- Verify: meta-tags на проде через 1м 38с после push'а. Sanity OK.
- **Path D (тикет в hightek.ru):** Ольга открыла тикет, support
  применил nginx-fix. Verified curl: `index.html` → `no-cache`,
  `/assets/*.js` → `immutable, max-age=31536000`. INFRA-004 → DONE.

### Часть B — BUG-PVL-COHORT-NULL-OVERWRITE (commit `7c28ed3`)

#### B1. Recon (`_07..._08`)

- Корень бага подтверждён: [`services/pvlMockApi.js:622-628`](../../services/pvlMockApi.js#L622-L628)
  хардкодит `cohort_id: null, mentor_id: null` в payload upsert'а.
  PostgREST с `Prefer: resolution=merge-duplicates` транслирует это в
  `ON CONFLICT (id) DO UPDATE SET cohort_id=NULL` → backfill затирается.
- **Все хелперы уже есть:**
  [`seedCohortIdToSqlUuid`](../../services/pvlMockApi.js#L187) для
  `'cohort-2026-1'` → UUID, [`uuidOrNull`](../../services/pvlMockApi.js#L177)
  для фильтрации мок-mentor'ов (`u-men-1`).
- **Callsites — 8** (стратег говорил 9, видимо посчитал warn-line).
  Все передают только `userId/studentId`, **fix полностью локализован
  внутри функции**.

#### B2. Apply (commit `7c28ed3`)

- Гибрид (вариант A+B): `ensurePvlStudentInDb` резолвит cohort_id и
  mentor_id из `db.studentProfiles`, передаёт в payload только если
  результат не-null.
- Edge-кейсы (таблица в плане `_08` секция 5.2): тестовые фикстуры без
  профиля → ключ опускается → backfill сохраняется. Новые абитуриенты
  с дефолтным `cohort-2026-1` → cohort_id записан правильно при
  INSERT. Mok-mentor `u-men-1` → mentor_id опускается, в БД сохраняется
  существующее.
- **Smoke** (на стороне Ольги): admin заходит в PVL-учительскую →
  `pvl_students.cohort_id` count of NULL остаётся 0.

### Часть C — FEAT-017 V1 frontend (3 commit'а: `0867aa6`, `377a148`, `296cfb3`)

#### C1. Recon + план (`_10..._11`)

- AdminStatsDashboard inline в AdminPanel.jsx (не отдельный файл —
  стратег ошибочно ссылался на несуществующий `AdminStatsDashboard.jsx`).
  Решено: новый `views/AdminPvlProgress.jsx` отдельным файлом
  (AdminPanel и так монолит 1606 строк).
- RPC `pvl_admin_progress_summary` `RETURNS jsonb` (не `SETOF jsonb`)
  — PostgREST для scalar-jsonb отдаёт значение прямо в body.
  Внутри `jsonb_agg(...)` + `COALESCE(..., '[]'::jsonb)` гарантирует
  массив.
- Когорты — вариант B (fetch через новый `pvlPostgrestApi.listCohorts()`).
- Sortable / filter — inline в MVP. Reusable-инфры в кодовой базе нет.

#### C2. Apply V1 (commit `0867aa6`)

- **3 файла, +290/-2:**
  - `services/pvlPostgrestApi.js` — `+listCohorts`, `+getAdminProgressSummary`.
  - `views/AdminPvlProgress.jsx` — новый файл, 271 строка. Inline
    подкомпоненты, `useState` × 7, два `useEffect` (когорты + прогресс),
    `useMemo` для visibleRows + totals.
  - `views/AdminPanel.jsx` — import + tab `pvl-progress` + label
    «Прогресс ПВЛ» + conditional render.
- **Solved open questions:**
  - 6.1 Тест-инфры нет → отдельный тикет `TEST-INFRA-SETUP`.
  - 6.2 RLS на `pvl_cohorts` → `pvl_cohorts_select_all USING (true)`
    для authenticated, проверять не нужно.
  - 6.3 Mentor-фильтр → не сейчас.
  - 6.4 Persist cohortId → `sessionStorage['adminPvlCohortId']`.
  - 6.5 Refresh → counter-state.
  - 6.6 Auto-polling → нет.

#### C3. GroupProgressBar (commit `377a148`)

- Stacked horizontal bar над badge-счётчиками. 4 цвета по `state_line`
  (emerald/blue/rose/slate), label «Поток 1 · N студенток» сверху,
  dot-легенда с числами под полоской. +58 строк, один компонент.

#### C4. Hidden-filter + CLEAN-013 partial (commit `296cfb3`)

- `AdminPvlProgress` принимает `hiddenIds` prop из `hiddenGardenUserIds`
  (localStorage). Скрытые «глазиком» в users-табе исчезают из дашборда +
  пересчитывают `totals` / `GroupProgressBar` (зависимость в `useMemo`).
- В тот же commit — миграция `cleanup_clean013_partial.sql`
  (DELETE'ы на 3 user'ов: LIlia, Рита, Екатерина).

### Часть D — Cleanup non-student `pvl_students` (commit `e3a992f`)

#### D1. Контекст

- Стратег обнаружил, что в `pvl_students` 22 записи, но 5 — не настоящие
  студенты (попали через `ensurePvlStudentInDb` без проверки роли).
  Это **ровно тот же системный баг**, что описан выше через
  `cohort_id` — `ensurePvlStudentInDb` upsert'ит при любой write-операции.
  Текущий fix `7c28ed3` чинит cohort/mentor wipeout, но не саму
  «попадаемость» admin/mentor/intern в `pvl_students`.

#### D2. Apply (commit `e3a992f`)

- Миграция `cleanup_non_student_pvl_records.sql` удалила 5 записей:
  Зобнина (admin), Ван (intern), Лузина (mentor), Гулякова (mentor),
  «Участница» (тест-фикстура).
- CASCADE снёс `pvl_student_*` (homework_submissions, content_progress,
  course_progress, checklist_items). `pvl_garden_mentor_links` по
  `student_id` пуст — `DELETE 0` (safety-DELETE по плану).
- **Side-effect для memory:** удалил устаревший memo
  `project_pvl_test_uchastnitsa.md` про «фикстуру не удалять» — теперь
  она удалена самим cleanup'ом, memo стал false.
- **Открытие:** заведён тикет **`BUG-PVL-ENSURE-RESPECTS-ROLE`** (P2)
  — корневая причина не устранена, лишние записи будут появляться
  снова при заходах admin/mentor/intern в PVL-учительскую.

---

## Все коммиты сессии (6 шт., все push'нуты)

| commit | тема | файлы |
|--------|------|-------|
| `2228f70` | infra: meta-tags Cache-Control в index.html (INFRA-004 workaround) | `index.html` |
| `7c28ed3` | fix: BUG-PVL-COHORT-NULL-OVERWRITE — не затирать cohort_id/mentor_id | `services/pvlMockApi.js` |
| `0867aa6` | feat: FEAT-017 — admin таб «Прогресс ПВЛ» с RPC pvl_admin_progress_summary | `services/pvlPostgrestApi.js`, `views/AdminPanel.jsx`, `views/AdminPvlProgress.jsx` (new) |
| `e3a992f` | data: cleanup pvl_students от 5 не-студенческих записей | `migrations/data/2026-05-08_cleanup_non_student_pvl_records.sql` (new) |
| `377a148` | ux: FEAT-017 — общий stacked progress bar группы | `views/AdminPvlProgress.jsx` |
| `296cfb3` | feat: hidden-filter в FEAT-017 + cleanup CLEAN-013 partial (3 user) | `services/pvlMockApi.js`-эквивалент через `hiddenIds` prop в `AdminPanel.jsx` + `AdminPvlProgress.jsx` + `migrations/data/2026-05-08_cleanup_clean013_partial.sql` (new) |

Plus тикет в hightek.ru support → они применили nginx-fix вне репо.
Plus финальный handover-commit (этот файл + BACKLOG + `_session/`
целиком).

---

## Артефакты сессии (полный список)

**Миграции:**
- `migrations/data/2026-05-08_cleanup_non_student_pvl_records.sql`
- `migrations/data/2026-05-08_cleanup_clean013_partial.sql`

**Код:**
- `services/pvlMockApi.js` — fix `ensurePvlStudentInDb`
- `services/pvlPostgrestApi.js` — `+listCohorts`, `+getAdminProgressSummary`
- `views/AdminPvlProgress.jsx` — новый файл, ~330 строк (271 базовых
  + 58 для GroupProgressBar + ~14 для hidden-filter)
- `views/AdminPanel.jsx` — таб + label + conditional render + hiddenIds prop
- `index.html` — meta-tags Cache-Control workaround
- `public/.htaccess` — Path B residual (безвреден)

**Документация:**
- [`plans/BACKLOG.md`](../../plans/BACKLOG.md) — обновлены статусы
  (INFRA-004, BUG-PVL-COHORT, FEAT-017 V1 → DONE; CLEAN-013 →
  PARTIALLY DONE; FEAT-016 → без блокеров) + новые тикеты
  (`BUG-PVL-ENSURE-RESPECTS-ROLE`, `FEAT-017-V2-VISUALIZATIONS`,
  `PROD-DB-MIGRATE-ISPMANAGER`, `TEST-INFRA-SETUP`) + `UX-QUICK-FIXES`
  (Колотилова отчество).
- `docs/lessons/2026-05-08-pvl-cohort-null-overwrite.md` — урок про
  `null` в payload merge-duplicates upsert'а.
- `docs/journal/HANDOVER_2026-05-08_session_infra004_pvl_progress.md`
  (этот файл).

**Переписка стратег↔executor (19 файлов в `docs/_session/`):**
- `_01..._06` — INFRA-004 (recon + Path B + Path C ISPmanager + meta-tags
  workaround + apply reports).
- `_07..._09` — BUG-PVL-COHORT (recon prompt + план + close).
- `_10..._12` — FEAT-017 frontend recon + план + apply 🟢.
- `_13..._14` — cleanup non-student `pvl_students` (prompt + apply report).
- `_15..._16` — GroupProgressBar (prompt + apply report).
- `_17..._18` — hidden-filter + CLEAN-013 partial (prompt + apply report).
- `_19` — session-close prompt (этот промпт).

---

## Workflow win — второй день в `_session/`-режиме

Стратег пишет промпты в `docs/_session/<seq>_strategist_*.md` напрямую
в репо (через ChatGPT-/Claude-привязку к рабочему дереву или ручную
запись Ольгой). Executor (Claude Code) читает с диска через
`Read tool`, не копирует в чат. Отчёты пишет туда же:
`<seq+1>_codeexec_*_report.md`.

Это снизило трафик копий между чатами в ~2 раза (особенно для длинных
recon-отчётов и больших diff'ов). Держится второй день. Подтверждено
эффективным.

---

## Если продолжаешь следующей сессией

### Приоритеты (по убыванию)

**P1 — на эту неделю:**
- **NB-RESTORE** (P1) — переезд админки notebooks/questions/cities из
  meetings в Garden. Полный recon в backlog.
- **FEAT-018** (P1) — часовые пояса встреч.
- **FEAT-015** (P1) — авто-пауза ведущей при неоплате Prodamus.

**P2 — на этот месяц:**
- **FEAT-016** (P2) — **без блокеров теперь.** CSV-выгрузка ДЗ ПВЛ.
  RPC `pvl_admin_progress_summary` готов, можно расширить SQL-логику
  для feedback-фильтра.
- **BUG-PVL-ENSURE-RESPECTS-ROLE** (P2, новый) — fix корневой причины
  попадания admin/mentor/intern в `pvl_students`.
- **CONTRACT-GARDEN-MEETINGS-001** (P2 docs) — живая документация
  инварианта `events.host_telegram NOT NULL`.

**P3 — низкий приоритет:**
- **FEAT-017-V2-VISUALIZATIONS** (накопительный) — heat-map,
  per-module bars, sparklines. Когда возникнет конкретный кейс.
- **TEST-INFRA-SETUP** — vitest setup. Блокирует unit-тесты на
  `BUG-PVL-ENSURE-RESPECTS-ROLE`.
- **PROD-DB-MIGRATE-ISPMANAGER** — для запоминания, не делания.

### Если открываешь новый чат стратега (claude.ai)

Скажи: «Открываю продолжение после сессии 2026-05-08. Прочитай
`docs/journal/HANDOVER_2026-05-08_session_infra004_pvl_progress.md`,
потом карточки `BUG-PVL-ENSURE-RESPECTS-ROLE` / `FEAT-016` / `FEAT-018`
/ `NB-RESTORE` в `plans/BACKLOG.md`, и секцию История 2026-05-08.
Если нужны детали FEAT-017 V1 — `docs/_session/2026-05-08_*` (19
файлов переписки за сессию).»

Стратег прочтёт и восстановит контекст.

---

## Контакты в коде/инфре (актуальный снимок 2026-05-08)

- Сервер: `ssh root@5.129.251.56` (Mysterious Bittern, Timeweb Cloud)
- БД: managed Postgres 18.1, роль `gen_user` (owner)
- PostgREST: Docker-контейнер на 127.0.0.1:3000, JWT-валидация active
- garden-auth: systemd, `/opt/garden-auth/server.js` на 127.0.0.1:3001
- Caddy: `/etc/caddy/Caddyfile`, проксирует `api.skrebeyko.ru` и
  `auth.skrebeyko.ru`
- **Фронт Garden:** nginx на shared-хостинге `185.162.93.61` (hightek.ru),
  деплой через GitHub Actions FTP. **NEW 2026-05-08:** cache-headers
  правильные (no-cache на index.html, immutable на /assets/*) после
  hightek.ru support fix.
- Cron-monitor: `/etc/cron.d/garden-monitor`, лог в
  `/var/log/garden-monitor.log`
- Stored procedures (актуальный список):
  `public.is_admin()`, `public.is_mentor_for(uuid)`,
  `public.ensure_garden_grants()`,
  `public.sync_meeting_to_event()`,
  `public.resync_events_for_user(uuid)`,
  `public.admin_delete_user_full(uuid)` — phase 24,
  `public.pvl_admin_progress_summary(uuid)` — phase 25,
  использует FEAT-017 V1.
- Репо: `ligacreate/garden` (фронт), `ligacreate/garden-auth`,
  `garden-db`, `ligacreate/meetings`.

---

## История изменений документа

- **2026-05-08 (v1.0):** Создан в финале сессии 2026-05-08. 6
  продакшн-коммитов на origin/main + handover commit. INFRA-004,
  BUG-PVL-COHORT-NULL-OVERWRITE, FEAT-017 V1 закрыты. CLEAN-013
  PARTIALLY DONE. Новые тикеты: BUG-PVL-ENSURE-RESPECTS-ROLE,
  FEAT-017-V2-VISUALIZATIONS, PROD-DB-MIGRATE-ISPMANAGER,
  TEST-INFRA-SETUP. UX-QUICK-FIXES добавлен пункт «Колотилова Светлана».
