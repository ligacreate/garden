---
title: Backlog — Garden Project
type: task tracker
version: 1.0
created: 2026-05-02
last_updated: 2026-05-02
status: active
purpose: единый источник правды для задач на починку, чистку
  кода, развитие. Обновляется по мере работы.
related_docs:
  - CLAUDE.md
  - docs/PROJECT_PASSPORT.md
  - docs/PVL_RECONNAISSANCE.md
  - docs/SUPABASE_LEGACY_AUDIT.md
  - docs/API_OUTAGE_IMPACT_ANALYSIS.md
  - docs/HANDOVER_2026-05-02_session1.md
---

# Backlog — Garden Project

# Дорожная карта (Roadmap)

Эта секция показывает РЕКОМЕНДУЕМЫЙ ПОРЯДОК выполнения работ.
Это НЕ то же самое, что приоритет (P0/P1/P2). Приоритет — это
важность задачи. Дорожная карта — это последовательность.

Например, REFACTOR-001 имеет приоритет P1 (важно), но его НЕЛЬЗЯ
делать до TEST-001 (тесты), потому что без тестов рефакторинг
сломает продакшн.

## Текущий период: Этап 1 — Закрытие безопасности (2026-05-02)

🔥 **СЕЙЧАС (сегодня-завтра):**
- SEC-001 (восстановление защиты PostgREST) — Этапы 2-5

## Ближайший период: Этап 2 — Стабилизация (1-2 недели)

После открытия платформы, в порядке:
1. Найти "учительскую" в коде (ARCH-009)
2. Связка ментор-ученик: задокументировать или починить (ARCH-001)
3. Сменить пароль olga@skrebeyko.com на платформе (SEC-002)
4. Зомби-аккаунты разобрать (CLEAN-005)

## Средний период: Этап 3 — Готовность к развитию (2-4 недели)

В порядке:
1. TEST-001: базовые тесты на критичные потоки (login,
   регистрация, открытие курса) — БЛОКЕР ДЛЯ РЕФАКТОРИНГА
2. MON-001: Sentry или аналог — видимость на прод-ошибки
3. CLEAN-001 до CLEAN-006: чистка legacy и mock-данных
4. INFRA-002: создать docs/INFRASTRUCTURE.md
5. DOC-001 до DOC-002: обновить документацию проекта

## Долгий период: Этап 4 — Архитектурные улучшения (1-2 месяца)

После наличия тестов:
1. REFACTOR-001: постепенное разбиение монолитных файлов
   (начать с PvlPrototypeApp.jsx или dataService.js)
2. ARCH-003: graceful degradation в App.jsx init()
3. ARCH-004: транзакционность регистрации
4. ARCH-002: реальное сохранение ДЗ ПВЛ в БД
5. PROD-004: SPA-роутинг с отдельными URL

## Будущее: Этап 5 — Продуктовое развитие (2-3 месяца+)

После стабилизации:
1. PROD-001: разделение ролей и прав (продуктовое решение)
2. PROD-002: разобраться с функцией чата (нужен или нет)
3. PROD-003: две системы ролей (платформа + курс ПВЛ)
4. ARCH-007: обобщённая модель курсов (для масштабирования)
5. ARCH-006: возможно сделать репо приватными
6. ARCH-005: monorepo vs multi-repo
7. ARCH-008: иерархия ролей администраторов
8. INFRA-001: разобраться с Inventive Cetus

## Принципы дорожной карты

- Дорожная карта пересматривается каждые 2-3 недели
- Не все задачи из backlog здесь — только те, что в
  активной зоне планирования
- Долгосрочные задачи могут перемещаться по приоритету
  на основе новых обстоятельств
- При завершении этапа — добавляй запись в "История
  изменений" документа

## Как пользоваться этим файлом

- Все задачи группируются по приоритетам: P0 (критично),
  P1 (важно), P2 (нужно), P3 (хотелось бы)
- Каждая задача имеет статус: 🔴 TODO / 🟡 IN PROGRESS / 🟢 DONE / ⚪ POSTPONED
- При выполнении задачи — меняй статус на 🟢 и добавляй дату завершения
- Новые задачи добавляются с датой обнаружения
- В конце месяца архивируй DONE задачи в раздел "История"

## 🔴 P0 — Критично (делать в первую очередь)

### SEC-001: Восстановить защиту PostgREST
- **Статус:** 🟢 DONE (2026-05-03)
- **Контекст:** Дыра была закрыта временно через Caddy (503),
  затем заменена полноценной JWT-валидацией + RLS + GRANT'ами.
- **Шаги:**
  - [x] Этап 0: Закрыть API через Caddy (DONE 2026-05-02)
  - [x] Этап 1-2: SQL-аудит + защита БД (28 таблиц под RLS, +90 политик,
    helper is_mentor_for SECURITY DEFINER)
  - [x] Этап 3: PostgREST на JWT-валидацию (web_anon для анона,
    authenticated для логина); garden-auth выдаёт JWT с role+sub
  - [x] Этап 4: Frontend patch (jwt_fallback latch'и удалены,
    Promise.allSettled в App.jsx init, maintenance banner)
  - [x] Этап 5: Caddy открыт, платформа live (2026-05-03 ~03:00 МСК)
  - [x] Post-smoke batch frontend fix (5 коммитов: BUG-004, ARCH-012,
    BUG-005, BUG-006, BUG-003)
  - [x] Phase 16: bulk GRANT на 40 таблиц (NEW-BUG-007 закрыт)
  - [x] Phase 17: GRANT EXECUTE на is_admin/is_mentor_for (WARN-008 закрыт)
  - [x] BUG-003 retry: getAuthUserId через JWT sub claim
  - [x] Repeat smoke v3 → READY_FOR_ANNOUNCE (2026-05-03 ~19:30 МСК)
- **Связано:**
  - docs/HANDOVER_2026-05-02_session1.md, session2.md, session3.md
  - docs/MIGRATION_2026-05-02_security_restoration.md
  - docs/EXEC_2026-05-03_post_smoke_repeat_v3.md (финальный smoke)
  - migrations/2026-05-03_phase16_grant_role_switch_bulk.sql
  - migrations/2026-05-03_phase17_grant_execute_rls_helpers.sql
- **Дальнейшее усиление:** см. SEC-007 (messages RLS), SEC-008 (push_sub
  RLS), SEC-009 (increment_user_seeds privilege escalation),
  SEC-010 (GRANT-level minimum-privilege hardening) в P2/P3.

### SEC-002: Сменить пароль пользователя olga@skrebeyko.com
- **Статус:** 🔴 TODO
- **Приоритет:** P0 (после открытия платформы — первое действие)
- **Контекст (две причины):**
  1. В data/data.js закоммичен mock-пароль для реального email.
     Пароль больше нигде не используется, но сменить на платформе
     после её открытия.
  2. **2026-05-02 в этапе 3 SEC-001 (patch garden-auth + smoke
     PostgREST) реальный пароль Ольги использовался в curl-командах
     на проде** для логина и получения JWT. Пароль:
     - попал в bash_history Claude Code (зачистили)
     - мог попасть в логи garden-auth (тело POST обычно не логируется,
       но без 100% гарантии)
     - использовался в нескольких терминальных сессиях
  Считается «полу-скомпрометированным», требует ротации.
- **Шаги:**
  - [ ] После открытия платформы — войти под Ольгой, в профиле
    нажать «сменить пароль».
  - [ ] Альтернатива — через `/auth/request-reset` flow
    (новый opaque reset-token по email → reset).
  - [ ] Убедиться, что новый пароль удовлетворяет любым требованиям
    к сложности.
- **Когда:** сразу после открытия Caddy (этап 5 SEC-001) и
  деплоя фронт-патча (этап 4) — ещё до полного смок-тестирования.

### SEC-003: Заменить hardcoded olga@skrebeyko.com в RLS политиках
- **Статус:** 🟡 IN PROGRESS (будет частью Этапа 2 восстановления защиты)
- **Приоритет:** P0 (входит в SEC-001)
- **Контекст:** В 6 RLS-политиках жёстко прописана проверка
  "email = 'olga@skrebeyko.com'" как admin-bypass. Это утечка
  личной информации и хрупкая архитектура. Заменить на проверку
  по role = 'admin'.
- **Шаги:**
  - [ ] Перед изменением убедиться, что в profiles у olga@skrebeyko.com
    стоит role = 'admin' (иначе теряем админ-доступ)
  - [ ] Переписать 6 политик через role-based проверку
- **Связано:** docs/DB_SECURITY_AUDIT.md, раздел "Hardcoded email"

## 🟡 P1 — Важно (на этой неделе)

### ARCH-001: Связка ментор-ученик в курсе ПВЛ
- **Статус:** 🔴 TODO
- **Контекст:** Из PVL_RECONNAISSANCE.md: связка существует
  только в захардкоженном seed.js. Назначение требует
  деплоя. Нужен админ-UI и API endpoint.
- **Влияние:** объясняет жалобы "ментор не видит ДЗ"
- **Связано:** docs/PVL_RECONNAISSANCE.md, раздел 2.4

- **Уточнение от 2026-05-02 (из новой разведки):**
  - Связка ментор-ученик существует в таблице
    `pvl_garden_mentor_links` (НЕ в `pvl_students.mentor_id`)
  - 19 активных связок
  - 27 событий `assign_student_mentor` в audit-log
  - UI "учительской" существует и используется (27 раз
    назначения)
  - `pvl_students.mentor_id` — legacy-поле, не используется
- **Реальная задача ARCH-001:**
  - Найти и зафиксировать UI "учительской" в документации
  - Если он работает корректно — добавить в RUNBOOK
  - Если есть баги — отдельной задачей чинить
  - Также проверить: почему жалоба "ментор не видит ДЗ"
    возникает, если связки в `pvl_garden_mentor_links` есть

### ARCH-002: Реальное сохранение ДЗ ПВЛ в БД
- **Статус:** 🔴 TODO
- **Контекст:** Из API_OUTAGE_IMPACT_ANALYSIS.md: ДЗ хранятся
  в memory state, теряются при закрытии вкладки.
- **Влияние:** жалобы "плохо сохраняются ДЗ"
- **Связано:** docs/API_OUTAGE_IMPACT_ANALYSIS.md

### ARCH-003: Graceful degradation в App.jsx init()
- **Статус:** 🔴 TODO
- **Контекст:** Сейчас любой сбой PostgREST = сломан вход
  в платформу. Нужен fallback на cached profile + retry.
- **Связано:** docs/API_OUTAGE_IMPACT_ANALYSIS.md, Проблема 1

### ARCH-004: Транзакционность регистрации
- **Статус:** 🔴 TODO
- **Контекст:** При сбое создаётся "зомби-аккаунт" в auth
  без профиля в БД.
- **Связано:** docs/API_OUTAGE_IMPACT_ANALYSIS.md, Проблема 3

### ARCH-009: Найти "учительскую" — где админ назначает учеников менторам
- **Статус:** 🟡 IN PROGRESS (повторная разведка запущена 2026-05-02)
- **Приоритет:** P1 (важно для понимания архитектуры PVL до
  Шага 2.4)
- **Контекст:** Владелец платформы подтвердил, что есть рабочая
  админ-функция "учительская", через которую назначаются ученики
  курса ПВЛ менторам. Однако первичная разведка PVL_RECONNAISSANCE
  её не нашла — заключила, что "функции assignMentor нет,
  назначение через правку seed.js + деплой". Противоречие.
- **Что нужно найти:**
  - В каком файле/компоненте живёт UI "учительской"
  - Какой API эндпоинт она дёргает при назначении ментора
  - В какую таблицу/поле пишет данные (pvl_students.mentor_id?)
  - Как это связано с глобальной админ-панелью платформы
- **Что обновить после нахождения:**
  - PVL_RECONNAISSANCE.md — исправить раздел 2.4 про связку
    ментор-ученик
  - DB_SECURITY_AUDIT.md — учесть в плане grants для pvl_students
  - Закрыть либо переоткрыть ARCH-001 (зависит от находок)
- **Связано:** ARCH-001 (связка ментор-ученик), PVL_RECONNAISSANCE

### ARCH-011: Включить _assertActive обратно после открытия платформы
- **Статус:** 🔴 TODO
- **Приоритет:** P1
- **Контекст:**
  - В services/dataService.js строки 1190-1193 функция
    _assertActive сейчас no-op (комментарий
    "Temporary open access mode"). Это значит, что фронт
    не блокирует доступ пользователям с
    SUBSCRIPTION_EXPIRED или ACCESS_PAUSED_MANUAL.
  - В App.jsx init() catch-блок обрабатывает именно эти
    два кода (строки 121-127), но их некому генерировать,
    пока _assertActive выключена.
  - На время восстановления безопасности это терпимо —
    у нас другие приоритеты. После открытия платформы
    (SEC-001 закрыт) включить обратно.
- **Шаги:**
  - [ ] После закрытия SEC-001 — восстановить логику
    _assertActive (восстановить из git history до отметки
    "Temporary open access mode").
  - [ ] Smoke-тест: пользователь с истёкшей подпиской видит
    блокирующий экран.
- **Связано:** SEC-001, services/dataService.js:1190-1193

### BUG-006: Frontend пишет `changed_by: null` в pvl_homework_status_history — нарушение audit-trail
- **Статус:** 🟢 DONE (2026-05-03, batch fix f46049d + retry на JWT sub в этом же batch'е)
- **Приоритет:** P1 (audit trail для смены статусов ДЗ не пишется,
  PATCH submissions проходит — но история теряется)
- **Контекст:**
  - При smoke-тесте 2026-05-03 под mentor (zobyshka@gmail.com)
    при «принять ДЗ» обнаружено:
    - `PATCH /pvl_student_homework_submissions` → 200 ✅
      (статус ДЗ обновился)
    - `POST /pvl_homework_status_history` → 403 ❌
      (история **не создалась**)
  - Request body показал `"changed_by": null`. RLS-политика
    `WITH CHECK (changed_by = auth.uid() AND EXISTS(...))`
    видит `null = <uuid>` → null → не пропускает.
  - Проблема **не в RLS** — политика правильная. Проблема в
    том, что фронт не передаёт `currentUser.id` в `changed_by`.
- **Симптом для пользователя:**
  - В `pvl_homework_status_history` отсутствуют записи о
    смене статусов от не-админов. История неполная,
    нельзя восстановить «кто когда что менял».
  - Параллельный PATCH submissions проходит — основной статус
    обновляется. Только журнал страдает.
- **Как починить (frontend):**
  - Найти место создания записи истории:
    ```bash
    grep -rn "pvl_homework_status_history\|changed_by" services/ views/
    ```
    Скорее всего в `services/pvlMockApi.js` или `pvlPostgrestApi.js`
    в методе типа `transitionSubmissionStatus` / `acceptHomework`.
  - Добавить `changed_by: currentUser.id` (или `auth.uid()` на
    клиенте — из decoded JWT) в payload INSERT'а.
  - Smoke под mentor: смена статуса → должна появиться запись в
    history с `changed_by = <mentor uid>`.
- **Дополнительно:** убедиться, что `payload.studentId` в request
  body соответствует именно ученику submission'а — на текущей
  записи заметили `payload.studentId = "49c267b1..."` (это студент,
  а не ментор) — для контекста ОК.
- **Связано:**
  - docs/EXEC_2026-05-03_post_smoke_browser_full.md (BUG-HOMEWORK-HISTORY-INSERT-403)
  - BUG-003 (аналогичная проблема — фронт пишет stub-id вместо
    auth.uid() в audit-log)

### BUG-005: pvl_audit_log INSERT 403 — RETURNING неявно проверяет SELECT-policy
- **Статус:** 🟢 DONE (2026-05-03, commit cd72e44 — Prefer: return=minimal в createAuditLog)
- **Приоритет:** P1 (audit-trail записи теряются — все INSERT в
  pvl_audit_log от не-админов падают)
- **Контекст:**
  - При smoke-тесте 2026-05-03 под mentor-логином: `POST /pvl_audit_log`
    → 403 `new row violates row-level security policy`.
  - Диагностика показала: **INSERT WITH CHECK проходит** (auth.uid()
    IS NOT NULL для mentor истинно). Падает **RETURNING-фаза** —
    SELECT-policy `is_admin()` не пускает не-админа читать
    свежевставленную строку.
  - PostgREST по умолчанию шлёт `Prefer: return=representation` →
    каждый INSERT неявно требует SELECT-permission.
  - См. урок 2026-05-03-rls-returning-implies-select-policy.md.
- **Решение (Вариант A — frontend hotfix):**
  - В `services/pvlPostgrestApi.js` или в месте где формируется
    INSERT в `pvl_audit_log` — добавить header
    `Prefer: return=minimal` для этого endpoint'а.
  - INSERT выполнится без RETURNING, SELECT-policy не задействуется,
    audit-trail compliance сохраняется (только admin читает).
- **Шаги:**
  - [ ] Найти точку записи audit-log:
    ```bash
    grep -rn "pvl_audit_log\|createAuditLog" services/ views/
    ```
  - [ ] Добавить `'Prefer': 'return=minimal'` в headers для этого
    POST'а.
  - [ ] Smoke под mentor: создать audit-event → 201 Created без тела.
- **Связано:** docs/lessons/2026-05-03-rls-returning-implies-select-policy.md,
  docs/EXEC_2026-05-03_post_smoke_diag_403_inserts.md, BUG-003
  (отдельная проблема — фронт пишет stub-id).

### BUG-004: Hard reload (Cmd+Shift+R) → белый экран — Service Worker кеширует старый bundle
- **Статус:** 🟢 DONE (2026-05-03, commit bf57606 — SW navigate=network-first + purge legacy caches)
- **Приоритет:** P0 (первое впечатление пользователя при проблеме)
- **Контекст:**
  - При smoke-тесте 2026-05-03 через Claude in Chrome: hard reload
    (Cmd+Shift+R) на liga.skrebeyko.ru → белый экран, JS-бандл
    `index-DXUDWmBe.js` зависает в `pending` > 10 сек.
  - Soft reload (F5) и navigate() работают нормально.
  - Воспроизводится стабильно.
- **Корневая причина (диагностика):** Service Worker (`/sw.js`)
  перехватывает запрос на bundle и пытается отдать из кэша.
  При hard reload браузер шлёт `Cache-Control: no-cache`, SW
  обходит cache, но цепочка обработки ломается → запрос висит.
- **Решение (frontend):**
  - В `sw.js` (или в его генераторе через Vite-PWA / workbox)
    изменить стратегию для `index.html`: **network-first**
    (не cache-first). Bundle-ассеты с хешами могут оставаться
    cache-first, они никогда не меняют URL для одного содержимого.
- **Альтернативное решение:** добавить bypass для Cmd+Shift+R
  через проверку `Cache-Control: no-cache` в SW handler'е.
- **Шаги:**
  - [ ] Найти конфигурацию SW: либо `public/sw.js`, либо в
    Vite config (workbox-plugin).
  - [ ] Изменить strategy для `/index.html` и `/` на network-first
    (с fallback на cache при offline).
  - [ ] Test: Cmd+Shift+R должен загружать страницу как обычный
    запрос, не зависать.
- **Связано:** docs/EXEC_2026-05-03_post_smoke_browser_full.md
  (BUG-WHITE-SCREEN), CLAUDE.md (упоминание /sw.js auto-generated
  on build).

### BUG-003: Frontend пишет stub-id (`u-adm-1`, `u-st-1`) в pvl_audit_log.actor_user_id вместо auth.uid()
- **Статус:** 🟢 DONE (2026-05-03, e3bd767 + retry 7585407 — getAuthUserId через JWT sub claim)
- **Приоритет:** P2 (compliance/forensics, не функциональный блокер)
- **Контекст:**
  - Из text-id sweep 2026-05-03: 1621/2205 строк в
    `pvl_audit_log.actor_user_id` имеют не-UUID значения
    типа `u-adm-1`, `u-st-1` (legacy stub-id из старых
    seed/test данных).
  - **Не security-блокер:** RLS-политики на `pvl_audit_log`
    не делают `::uuid` cast (`is_admin()` для SELECT,
    `auth.uid() IS NOT NULL` для INSERT — без cast'а
    `actor_user_id`).
  - **Но**: фронт **продолжает писать** stub-id даже сейчас
    (свежие записи от 2026-05-01 имеют `u-adm-1`/`u-st-1`).
    Это значит: audit-trail некорректен — нельзя точно
    сказать «кто сделал действие». Compliance issue.
- **Что сделать:**
  - [ ] Найти точки записи через grep:
    ```bash
    grep -rn "u-adm-1\|u-st-1\|actor_user_id" services/ views/
    ```
    Скорее всего это в `services/pvlMockApi.js` (логика
    `createAuditLog` или подобная).
  - [ ] Заменить hardcoded stub-id на актуальный
    `currentUser.id` (из state) или decoded JWT `sub`.
  - [ ] Smoke: новая запись в `pvl_audit_log` должна
    иметь UUID-shape `actor_user_id`, совпадающий с
    `auth.uid()` пользователя, который инициировал
    действие.
- **Связано:** CLEAN-012 (зачистить накопленные stub-id
  после фикса), CLEAN-007 (общая миграция TEXT → UUID
  для PVL-таблиц), docs/EXEC_2026-05-03_post_smoke_text_id_sweep.md.

### BUG-002: Левое меню «Трекер» не открывает Трекер у студента, а breadcrumb работает
- **Статус:** 🔴 TODO
- **Приоритет:** P2 (не блокер, обходной путь существует — клик
  по breadcrumb «Трекер»)
- **Контекст:**
  - При входе под студентом (Настина фея) клик по пункту
    «Трекер» в **левом боковом меню** не переключает контент
    — UI остаётся на текущей странице.
  - Кликаем по «Трекер» в **breadcrumb-навигации** (зелёная
    плашка над списком уроков) — Трекер открывается нормально.
  - Это значит: handler привязан только к одному из двух путей
    навигации, либо два разных handler'а имеют разный эффект.
- **Не связано с SEC-001:** проявилось при smoke-тестировании
  после открытия Caddy, но скорее всего существовало и раньше
  — никто просто не использовал именно левое меню для перехода
  в Трекер. Не регрессия от наших RLS-изменений.
- **Что сделать:**
  - [ ] Найти в `views/PvlPrototypeApp.jsx` (или в общем
    sidebar-компоненте) handler для пункта «Трекер» в левом
    меню.
  - [ ] Сравнить с handler'ом breadcrumb-«Трекер».
  - [ ] Унифицировать — оба должны переключать на одно состояние.
  - [ ] Smoke под студентом: открыть курс → клик по «Трекер»
    в **левом меню** → должно работать.
- **Связано:** REFACTOR-001 (PvlPrototypeApp монолит на 8000+
  строк, навигация запутана).

### BUG-001: PvlPrototypeApp фрагильный batch-init — один 500-endpoint валит весь компонент
- **Статус:** 🔴 TODO
- **Приоритет:** P1 (всплыло в проде после открытия Caddy 2026-05-03;
  блокирует mentor-UI при любой PVL-таблице, возвращающей 500)
- **Контекст:**
  - При логине ментора `PvlPrototypeApp.jsx` делает batch-fetch
    нескольких PVL-таблиц для инициализации `pvlMockApi`-кэша.
  - Если хоть один endpoint возвращает 500/400 (например,
    `pvl_student_questions` падает с RLS-cast-error на битых
    legacy TEXT-id) — `Promise.all` reject'ится, цепочка
    sync обрывается, локальный кэш остаётся пустым, mentor
    видит пустой UI.
  - В `App.jsx` мы уже применили паттерн `Promise.allSettled`
    в фазе 4 SEC-001 (через helper `loadAndApplyInitialData`) —
    это ровно то, что нужно повторить в PVL.
- **Что сделать:**
  - [ ] Найти в `views/PvlPrototypeApp.jsx` (или, скорее,
    в `services/pvlMockApi.js` — `syncPvlRuntimeFromDb`,
    `syncPvlActorsFromGarden`) места с `Promise.all`-инициализацией
    нескольких PVL-таблиц.
  - [ ] Заменить на `Promise.allSettled` + per-result-handling:
    - При `fulfilled` — записать в кэш
    - При `rejected` — `console.error`, не валить остальное
  - [ ] (Опционально) показать toast/баннер пользователю
    «Часть данных PVL временно недоступна» при partial degradation.
  - [ ] Smoke: симулировать 500 на одной из PVL-таблиц (например,
    отозвать grant временно) — убедиться, что остальные
    компоненты PVL продолжают работать.
- **Связано:**
  - REFACTOR-001 (большая декомпозиция PvlPrototypeApp/pvlMockApi)
  - CLEAN-007 (миграция TEXT → UUID для pvl_student_questions —
    устраняет одну из причин 500)
  - docs/EXEC_2026-05-02_etap5_post_smoke_fix1_pvl_student_questions.md
    (где этот баг впервые проявился)

### REFACTOR-001: Разбиение монолитных файлов на модули
- **Статус:** 🔴 TODO
- **Приоритет:** P1 (важно, но не блокирует security-починку)
- **Контекст:** В кодовой базе 10 файлов превышают 500 строк,
  что критически усложняет работу:

  Топ-5 проблемных файлов:
  - PvlPrototypeApp.jsx (4164 строки) — монолит курса ПВЛ
  - dataService.js (2461 строка) — все API-вызовы в одном файле
  - MeetingsView.jsx (1748 строк) — UI встреч
  - AdminPanel.jsx (1333 строки) — админ-функции
  - UserApp.jsx (927 строк) — главный wrapper приложения

- **Влияние на работу:**
  - AI не может эффективно работать с такими файлами
    (превышают эффективное контекстное окно)
  - Поиск конкретных функций занимает 10+ минут
  - Невозможно делегировать part of work без полного
    погружения в монолит
  - Баги прячутся в массе кода
  - Текущий пример: "учительская" предположительно где-то
    внутри PvlPrototypeApp.jsx, но найти её сложно из-за
    объёма

- **План разбиения (стратегический, не сегодня):**
  - PvlPrototypeApp.jsx → разбить на:
    * PvlStudentApp.jsx (студент)
    * PvlMentorApp.jsx (ментор)
    * PvlAdminApp.jsx (админ-учительская)
    * PvlSharedComponents.jsx (общие)
    * pvlContext.jsx (state)
  - services/pvlMockApi.js → переименовать в
    services/pvlDomainStore.js. Файл — production domain-layer
    на 4221 строку (гибрид seed + реальный PostgREST через
    pvlPostgrestApi), используется в 7 production-views.
    Имя "Mock" вводит в заблуждение и опасно при чистке
    legacy. Параллельно — разделить seed-only и real-DB пути
    (`if (!pvlPostgrestApi.isEnabled()) return seed;` сейчас
    раскидан по всему файлу, надо сгруппировать).
  - dataService.js → разбить по доменам:
    * services/auth.js
    * services/profiles.js
    * services/meetings.js
    * services/messages.js
    * services/pvl.js
    * services/admin.js
  - MeetingsView.jsx → разбить на меньшие компоненты по
    подразделам функционала
  - AdminPanel.jsx → разделить по разделам админки
  - UserApp.jsx → выделить роутинг, состояние, контексты
    в отдельные модули

- **Подход к реализации:**
  - Делать постепенно, файл за файлом, не "большим взрывом"
  - Один файл — один pull request, чтобы можно было откатить
    при проблеме
  - Не делать рефакторинг параллельно с new features — это
    отдельный спринт
  - Перед каждым разбиением — тесты на критичный поток
    (хотя бы ручные)

- **Когда:** после стабилизации security и базовой функциональности
- **Связано:** TEST-001 (нужны тесты ДО рефакторинга)

## 🟢 P2 — Нужно (в этом месяце)

### SEC-004: Future hardening — FORCE ROW LEVEL SECURITY на чувствительных таблицах
- **Статус:** 🔴 TODO (отложено осознанно 2026-05-02)
- **Приоритет:** P2 (не блокирует открытие платформы, но нужно
  после стабилизации)
- **Контекст:**
  - В сессии 2026-05-02 решено НЕ включать FORCE RLS в этом раунде
    восстановления безопасности.
  - Причина: garden-auth-сервис ходит в БД как `gen_user`, который
    является OWNER таблиц `public.*` и обходит RLS без FORCE.
    Включение FORCE требует архитектурной работы: либо отдельная
    DB-роль для garden-auth (например, `service_auth` с
    rolbypassrls=t), либо политики, явно пропускающие gen_user.
  - Текущая защита (RLS-on без FORCE + REVOKE на чувствительных
    таблицах + переключение PostgREST на web_anon/authenticated)
    закрывает основную модель угрозы — публичную утечку через
    PostgREST. FORCE нужен против другой модели — SQL-инъекция
    через garden-auth.
- **Шаги:**
  - [ ] Создать отдельную DB-роль для garden-auth (например,
    `auth_service` LOGIN, без bypassrls) с минимально необходимыми
    GRANT'ами на users_auth и связанные таблицы
  - [ ] Перевести garden-auth на эту роль (изменить
    /opt/garden-auth/.env и перезапустить сервис)
  - [ ] Включить ALTER TABLE ... FORCE ROW LEVEL SECURITY на:
    - users_auth (приоритет 1)
    - profiles, messages (приоритет 2)
    - PVL-таблицы со студенческими данными (приоритет 3)
  - [ ] Прогнать smoke-тесты: логин, регистрация, восстановление
    пароля, чтение собственного профиля
- **Зависимости:**
  - Все этапы текущего восстановления безопасности (1-5 из плана
    2026-05-02) должны быть закрыты
  - Платформа должна быть открыта и стабильна минимум неделю —
    чтобы откат был дешёвым, если что-то всплывёт
- **Риски:**
  - Без отдельной роли FORCE сломает garden-auth (он не сможет
    читать users_auth для логина)
  - Если политики написаны неточно — пользователи не смогут
    логиниться
  - Восстановление через ROLLBACK FORCE: ALTER TABLE ... NO FORCE
    ROW LEVEL SECURITY (быстро)
- **Связано:** SEC-001 (это его прямое продолжение),
  docs/DB_SECURITY_AUDIT.md, docs/HANDOVER_2026-05-02_session1.md

### ARCH-010: Формализовать связь pvl_students ↔ profiles
- **Статус:** 🔴 TODO (зависит от подтверждения через Chat A v4)
- **Приоритет:** P2
- **Контекст:**
  - В pvl_students нет FK на profiles, нет user_id, нет
    profile_id, нет email. Связка держится на конвенции
    "pvl_students.id = profiles.id" — это договорённость
    ETL, не контракт БД.
  - Ольга подтвердила бизнес-логику: запись в pvl_students
    создаётся при получении пользователем role='applicant'
    в profiles.
  - Все RLS-политики шаблона B построены на этой конвенции
    (auth.uid() = student_id). Если хоть один pvl_students.id
    разойдётся с profiles.id — соответствующий студент потеряет
    доступ к своим данным.
- **Варианты решения:**
  - (a) Добавить FK pvl_students.id → profiles(id) ON DELETE
    CASCADE — самое строгое, но ломает существующие записи,
    если есть несовпадения.
  - (b) Добавить колонку pvl_students.profile_id uuid REFERENCES
    profiles(id), денормализовать связку.
  - (c) Не трогать БД, задокументировать конвенцию в
    CLAUDE.md и в коде ETL.
- **Шаги:**
  - [ ] Получить из Chat A v4 точный список студентов с
    несовпадениями (если есть).
  - [ ] Если все 23 совпадают — выбрать вариант a/b/c с
    владельцем.
  - [ ] Реализовать выбранный вариант миграцией.
- **Связано:** SEC-001 этап 2 (RLS-политики PVL зависят от
  этой связки), docs/REPORT_2026-05-02_db_audit_v3.md

### ARCH-012: Убрать клиентский `ensurePvlStudentInDb` self-heal в пользу серверного flow
- **Статус:** 🟡 PARTIALLY DONE (2026-05-03, hotfix 45f1402 — early-exit для не-admin закрыл retry-loop). Архитектурный фикс (убрать ensure-loop с клиента полностью) остаётся как P2.
- **Приоритет:** P2 (всплыло в проде после открытия Caddy
  2026-05-03; временно смягчено через RLS-расширение, но
  архитектурно остаётся неправильным паттерном)
- **Контекст:**
  - `services/pvlMockApi.js` содержит функцию
    `ensurePvlStudentInDb(id)`, которую вызывает
    `syncPvlActorsFromGarden()` для каждого видимого
    applicant-профиля при инициализации PVL.
  - Под mentor-логином в проде это даёт **17 ошибок
    `403 - new row violates row-level security policy
    for table pvl_students`** в браузерной консоли — RLS
    правильно блокирует не-админа от INSERT/UPDATE на
    `pvl_students`.
  - Архитектурный антипаттерн: client-side «self-heal»
    данных, который не должен быть на клиенте вообще.
    Создание записей в `pvl_students` — это **админ-flow**
    (учительская / регистрация в курсе), не клиент-побочка.
- **Текущее состояние (2026-05-03):**
  - **RLS-fix #2 НЕ применён** — после DELETE'а seed-строк
    в `pvl_student_questions` (post-smoke fix #1) UI заработал
    штатно. 17 cosmetic-ошибок 403 в браузерной консоли
    остались, но не блокируют рендеринг компонентов.
    Сознательное решение: не ослаблять RLS ради косметики;
    ждём правильное архитектурное решение (см. «Что сделать»).
  - **Альтернативный fix #2 (не применённый, оставлен на
    случай если потребуется):** расширить INSERT/UPDATE-
    политики на `pvl_students` через
    `id = auth.uid() OR is_admin() OR is_mentor_for(id)`.
    Минус: позволит залогиненным менять `full_name`/`status`
    в строках, что может затирать админские действия
    (например, `status='paused'` ← `active`).
- **Что сделать (правильное решение):**
  - [ ] Удалить вызов `ensurePvlStudentInDb` из
    `syncPvlActorsFromGarden` и подобных мест в `pvlMockApi.js`.
  - [ ] Создание `pvl_students`-строки переводим на серверный
    flow:
    - либо триггер на `profiles` — при `role='applicant'`
      автоматически создавать строку в `pvl_students` с
      `id = NEW.id`;
    - либо явный API-endpoint `POST /pvl/enroll` в
      `garden-auth` или отдельном сервисе, который ходит
      под service-role и делает INSERT.
  - [ ] После убирания ensure-loop с клиента — откатить
    DB-fix #2: вернуть строгие политики
    `pvl_students_insert_admin` и
    `pvl_students_update_admin` (только админ).
- **Связано:** docs/EXEC_2026-05-02_etap5_post_smoke_fix2_pvl_students_ensure_policy.md
  (если будет создан после применения fix #2),
  REFACTOR-001 (упрощение pvlMockApi),
  ARCH-002 (реальное сохранение ДЗ ПВЛ — связанный архитектурный
  переход PVL с mock на сервер).

### CLEAN-001: Удалить legacy скрипты Supabase
- **Статус:** 🔴 TODO
- **Файлы:**
  - scripts/legacy/migrate_meetings.js
  - scripts/legacy/migrate_questions_notebooks.js
  - scripts/legacy/update_event_images.js
- **Контекст:** Старые миграционные скрипты с anon-ключами
  неактуального Supabase-проекта. Не нужны больше.

### CLEAN-002: Убрать assets/ из git
- **Статус:** 🔴 TODO
- **Шаги:**
  - [ ] Добавить assets/ в .gitignore
  - [ ] git rm -r --cached assets/
  - [ ] Закоммитить
- **Контекст:** Собранные бандлы Vite не должны быть в гите.
  В .gitignore есть dist/, но забыли assets/.

### CLEAN-003: Обезличить mock-данные в data/data.js
- **Статус:** 🔴 TODO
- **Шаги:**
  - [ ] Заменить olga@skrebeyko.com на admin@example.com
  - [ ] Заменить пароль на placeholder типа "<set_in_local>"
- **Связано:** SEC-002

### CLEAN-005: Зомби-аккаунты (2 шт)
- **Статус:** 🔴 TODO
- **Приоритет:** P2
- **Контекст:** 2 пользователя имеют запись в users_auth
  (auth-аккаунт), но не имеют записи в profiles. Они не могут
  пользоваться платформой, потому что фронт требует профиль
  при логине.
- **Шаги:**
  - [ ] Найти этих 2 пользователей:
    SELECT email FROM users_auth WHERE email NOT IN (SELECT email FROM profiles);
  - [ ] Решить: создать им профили вручную или удалить
    auth-записи
  - [ ] Записать процедуру для будущих случаев
- **Связано:** ARCH-004 (транзакционность регистрации)

### CLEAN-010: Удалить 4 тестовых сообщения из public.messages
- **Статус:** 🔴 TODO
- **Приоритет:** P3
- **Контекст:** В таблице `public.messages` лежат 4 тестовых строки от
  2026-03-17 (id 1–4): «Тестовое сообщение из БД», «Тестовое сообщение
  от меня», «И от меня», «Привет-привет». Авторы — два админа
  (Анастасия, Ольга), один студент (Настина фея), одно системное.
  Бизнес-смысла не несут.
- **Почему отложено:** Изначально DELETE планировался в фазе 6 SEC-001,
  но smoke-блок там был сломан (`GET DIAGNOSTICS ROW_COUNT` внутри
  DO-блока не видит внешний DELETE — возвращает 0 вместо 4). Чтобы
  не блокировать миграцию, фаза 6 упрощена до RLS-on + REVOKE.
  Защита данных одинакова с строками или без них (RLS-on без политик
  блокирует под web_anon/authenticated независимо от содержимого).
- **Как сделать:**
  ```sql
  -- Под gen_user через psql (или Timeweb SQL-консоль):
  BEGIN;
  DELETE FROM public.messages WHERE created_at::date = '2026-03-17';
  -- проверь что DELETE 4
  COMMIT;
  ```
- **Связано:** docs/EXEC_2026-05-02_phase6_messages_lockdown.md,
  docs/MIGRATION_2026-05-02_security_restoration.md фаза 6.

### CLEAN-009: Аудит и восстановление migrations/*.sql
- **Статус:** 🔴 TODO
- **Приоритет:** P2
- **Контекст:** 2026-05-02 при подготовке security-миграций
  обнаружено повреждение файла migrations/05_profiles_rls.sql
  (содержит мусор `{97AE7713-21F0-4F0C-B575-A281FE6084F0}.png`
  вместо SQL). Возможны другие расхождения между миграциями
  в репо и реальным состоянием БД. Уже зафиксированы:
  - 05_profiles_rls.sql — повреждён
  - 17_create_messages_chat.sql — описывает RLS+2 политики, в live RLS=off, 0 политик
  - 19_messages_update_delete_permissions.sql — содержит
    `GRANT update, delete ON messages TO public`, в live REVOKE
    выполнен вручную. Опасно для повторного прогона миграций.
  - 20_push_subscriptions.sql — содержит
    `GRANT select, insert, update ON push_subscriptions TO public`,
    в live REVOKE выполнен вручную.
  - 16_course_progress_rls.sql — статус совпадения не верифицирован.
- **Шаги:**
  - [ ] Прогнать diff: для каждого migrations/*.sql сверить
    объявленные политики/таблицы/grants с pg_policies / pg_tables /
    pg_class.
  - [ ] Восстановить migrations/05_profiles_rls.sql из live-БД
    (использовать pg_dump --schema-only или ручную выгрузку
    политик через `\d+ public.profiles` и `pg_policies`).
  - [ ] Зафиксировать решение: миграции = source of truth,
    или live-БД = source of truth, или принимаем drift и
    обновляем оба только вручную.
  - [ ] Если выбран вариант «миграции = source of truth» —
    исправить опасные `GRANT TO public` в 19/20 на `TO authenticated`
    или удалить (RLS всё равно фильтрует).
- **Связано:** docs/MIGRATION_2026-05-02_security_restoration.md
  раздел "Расхождения репо ↔ прод"

### INFRA-001: Разобраться с сервером Inventive Cetus
- **Статус:** 🔴 TODO
- **Контекст:** Из INFRASTRUCTURE.md: непонятно, что на сервере
  92.63.176.211 и нужен ли он.
- **Шаги:**
  - [ ] Зайти на сервер, посмотреть что запущено
  - [ ] Решить: использовать или удалить (экономия)

### DOC-001: Обновить CLAUDE.md под мульти-репо архитектуру
- **Статус:** 🔴 TODO
- **Контекст:** Сейчас CLAUDE.md описывает только основной
  репо garden. Нужно добавить упоминания: garden-auth,
  garden-db, meetings.

### DOC-002: Создать SECURITY.md
- **Статус:** 🔴 TODO
- **Контекст:** GitHub предлагает создать SECURITY.md в каждом
  репо. Описать: как сообщать об уязвимостях, политику ответа.

### REVIEW-001: Запуск 4-агентного code review
- **Статус:** ⚪ POSTPONED (не сейчас)
- **Приоритет:** P2
- **Контекст:** Изначально планировался запуск 4 параллельных
  агентов Claude Code для поиска причин 4 проблем пользователей:
  создание ДЗ, сохранение ДЗ, видимость для менторов,
  производительность.
- **Почему отложено:** 3 из 4 проблем имеют корни в
  фундаментальных архитектурных вещах, которые мы сейчас
  чиним напрямую (безопасность БД, связка ментор-ученик,
  PostgREST). Запускать code review до их починки = искать
  симптомы вместо причин.
- **Когда запускать:** через 2-3 недели после восстановления
  безопасности и базовых архитектурных фиксов
- **Связано:** SEC-001, ARCH-001, ARCH-002

### PROD-003: Разобраться с двумя системами ролей (платформа vs курс ПВЛ)
- **Статус:** 🔴 TODO
- **Приоритет:** P2
- **Контекст:** На платформе фактически работают ДВЕ независимые
  системы ролей:
  1. Глобальная роль на платформе (applicant → intern → leader →
     mentor → curator → admin)
  2. Внутренняя роль в курсе ПВЛ (ученик курса, ментор курса,
     админ курса с "учительской")
  Это создаёт путаницу: один и тот же человек может быть admin
  на платформе и при этом mentor курса. Интерфейсы переключаются
  в зависимости от контекста, и пользователю не всегда понятно,
  какие у него права в каком разделе.
- **Что обсудить:**
  - Объединить системы или явно разделить
  - Унифицировать терминологию и UI
  - Показывать пользователю, в какой "шапке" он находится
- **Когда:** в продуктовой сессии после security-починки

### PROD-004: Реализовать SPA-роутинг с отдельными URL для страниц
- **Статус:** 🔴 TODO
- **Приоритет:** P2
- **Контекст:** Сейчас вся платформа работает по одному URL.
  Последствия:
  - Кнопка "назад" в браузере вылетает с платформы
  - Невозможно дать прямую ссылку на конкретную страницу
    (например, "вот ссылка на твою домашку")
  - Невозможно открыть две страницы в разных вкладках
  - Сложно делать аналитику посещений по разделам
  - Поисковые системы не индексируют страницы (если станут
    публичными)
- **Что нужно:**
  - Внедрить React Router (или аналог)
  - Покрыть все ключевые страницы маршрутами
  - Настроить корректное поведение кнопок назад/вперёд
  - History API для смены URL без перезагрузки
- **Когда:** после стабилизации безопасности и базовых фич

### SEC-009: increment_user_seeds — privilege escalation в SECURITY DEFINER функции
- **Статус:** 🔴 TODO
- **Приоритет:** P2
- **Создано:** 2026-05-03 (Q12 SEC-001)
- **Контекст:** Функция `public.increment_user_seeds(uuid[], integer)` —
  SECURITY DEFINER, мутирует `profiles.seeds` для произвольных
  user_ids БЕЗ проверки is_admin() или другой авторизации внутри.
  Если когда-нибудь дать `GRANT EXECUTE ... TO authenticated` — любой
  залогиненный сможет начислить любые seeds любому юзеру через
  POST /rpc/increment_user_seeds. Сейчас EXECUTE не дан (phase 17
  явно отказался), поэтому meeting-flow на фронте отвалится с 42501
  (UserApp.jsx:335,376) — это лучше дыры.
- **Варианты фикса:**
  1. Добавить `if not is_admin() then raise exception` внутрь функции,
     потом дать EXECUTE для authenticated.
  2. Заменить RPC на server-side meeting-completion через push-server
     или отдельный auth endpoint.
  3. SECURITY DEFINER → SECURITY INVOKER + узкая RLS-policy на
     UPDATE profiles.seeds (через mentor_links или admin).
- **Связано:** migrations/2026-05-03_phase17_grant_execute_rls_helpers.sql
  (deferred-список); UserApp.jsx:335,376 (callsites).

### ANOM-001: Учительская грузит 130+ профилей вместо менти ментора
- **Статус:** 🔴 TODO
- **Приоритет:** P2 (избыточная нагрузка на DB, не корректность)
- **Создано:** 2026-05-03 (smoke v3)
- **Контекст:** При открытии Учительской ментором фронт делает
  130+ GET /profiles запросов ко всем профилям системы, не только к
  менти этого ментора. После phase 16 bulk GRANT все 200 (раньше тихо
  валилось в 403 — silent fail flow, который обнаружился на smoke
  v3 как ANOM-001). RLS-policy `profiles_select_authenticated` сейчас
  пускает любого authenticated на любой профиль — это намеренно по
  «trusted community» модели Ольги, но фронту это даёт право грести
  без фильтров.
- **Варианты фикса:**
  - Узкая SELECT-policy на profiles для роли mentor через
    `is_mentor_for(profiles.id)` или подобный селект — DB-уровень,
    меньше клиентского кода.
  - Client-side фильтр в pvlMockApi.js — менее надёжно, но проще.
  - Кэш на стороне фронта — снимет нагрузку, но не решит проблему
    избыточности.
- **Связано:** docs/EXEC_2026-05-03_post_smoke_repeat_v3.md (раздел
  Anomalies); RLS profiles_select_authenticated.

### ANOM-002 / SEC-011: events writes wide-open — RLS пропускает любой INSERT/UPDATE/DELETE
- **Статус:** 🟢 DONE (2026-05-04, phase 18 — REVOKE INSERT/UPDATE/DELETE ON events FROM authenticated)
- **Приоритет:** P2 (security, но closed community → не P0/P1)
- **Создано:** 2026-05-04 (post-phase-16 архитектурная ревизия)
- **Контекст:**
  - RLS-policies на `public.events`:
    - `Allow insert events`: WITH CHECK = `true`
    - `Allow update events`: USING = `true`
    - `Allow delete events`: USING = `true`
    - `Allow public read access to events` + `Public read events check`
      (дубль): USING = `true`
  - Phase 16 bulk GRANT дала `authenticated` full CRUD на events.
    До phase 16 защита держалась на отсутствии table-GRANT'а; теперь
    GRANT есть, RLS как barrier ничего не отбивает.
  - Любой залогиненный JWT может через `POST /events`,
    `PATCH /events?id=eq.X`, `DELETE /events?id=eq.X` создать /
    переписать / удалить произвольное событие.
- **Архитектурно:** events пишутся ТОЛЬКО триггером
  `sync_meeting_to_event()` (под owner-ролью при изменении meetings).
  Прямой записи authenticated в events не нужен.
- **Решение:** phase 18 мини-миграция —
  `REVOKE INSERT, UPDATE, DELETE ON public.events FROM authenticated;`
  SELECT оставить (events public read через trigger-синхронизацию).
- **Связано:** migrations/2026-05-03_phase16_grant_role_switch_bulk.sql,
  trigger sync_meeting_to_event(), RLS policies на events.

### ANOM-003: co_hosts не sync'ится из meetings в events
- **Статус:** 🔴 TODO
- **Приоритет:** P3 (продуктовая фича, не блокер security)
- **Создано:** 2026-05-04 (post-phase-16 архитектурная ревизия)
- **Контекст:**
  - `meetings.co_hosts` — `uuid[]` (массив UUID со-ведущих).
  - `events.co_hosts` — `text` (колонка существует).
  - Trigger `sync_meeting_to_event()` НЕ переносит `co_hosts` ни при
    INSERT, ни при UPDATE — поле в events остаётся NULL/пустым.
- **Симптом:** если в UI на странице события ожидается отображение
  со-ведущих — фича сломана. Пользователь видит только основного
  ведущего (поле `speaker`), но не co-hosts.
- **Решение:** дополнить trigger sync_meeting_to_event() — добавить
  conversion `meetings.co_hosts (uuid[])` → `events.co_hosts (text)`
  через JOIN на profiles + array_to_string или JSON-aggregation
  имён со-ведущих.
- **Связано:** trigger sync_meeting_to_event(), schema events.

### ANOM-004: writes на cities / notebooks / questions — audit паттерна events
- **Статус:** 🔴 TODO
- **Приоритет:** P3 (теоретическая дыра по аналогии, не подтверждена)
- **Создано:** 2026-05-04 (после phase 18, по аналогии с ANOM-002/SEC-011)
- **Контекст:** ANOM-002/SEC-011 показал паттерн: на `events` была
  RLS-policy `USING(true)` для INSERT/UPDATE/DELETE + phase 16 GRANT —
  любой залогиненный мог переписать. На `cities`, `notebooks`,
  `questions` (которые phase 18 открыл для web_anon SELECT) RLS-policies
  на запись мы не смотрели. Если там USING(true) — тот же класс дыры.
- **Что нужно:**
  - Проверить policies на INSERT/UPDATE/DELETE для cities, notebooks,
    questions (analog Q3 запрос pg_policy).
  - Если USING(true) — REVOKE writes от authenticated (фаза 19 mini),
    как в phase 18 для events. Архитектурно эти таблицы — справочник
    (cities) и контент Meetings (notebooks/questions), записывает их
    либо админ через owner-роль, либо trigger/RPC.
  - Если policies узкие (например, только admin) — оставить как есть.
- **Связано:** ANOM-002/SEC-011, phase 18, AUDIT-001 (code review meetings).
- **Статус:** 🔴 TODO
- **Приоритет:** P2 (UX, видимо обычным пользователям при любой DB-ошибке)
- **Создано:** 2026-05-03 (NEW-BUG-007 incident)
- **Контекст:** В App.jsx:271 в catch handleLogin вызывается
  `alert(e.message)`, а e.message — текст ошибки из dataService.js:63
  (`new Error(text || ...)`), куда попадает raw response body от
  PostgREST. На NEW-BUG-007 юзерам всплывал `{"code":"42501",...,
  "message":"permission denied for table profiles"}` как браузерная
  alert-модалка, блокирующая UI.
- **Фикс:**
  - Нормализовать error.message в dataService.js перед throw
    (выделять `message` из JSON, если parseable).
  - Заменить alert на UI-banner с человеческим сообщением.
  - Сохранить raw в console.error для debug.

### BUG-LOGIN-SILENT-PROFILE-FAIL: при 403 на _fetchProfile фронт тихо возвращает на AuthScreen
- **Статус:** 🔴 TODO
- **Приоритет:** P2 (UX, юзеры думают, что login сломан, без понятной
  причины)
- **Создано:** 2026-05-03 (smoke v3 detail)
- **Контекст:** В smoke v3 студент успешно прошёл аутентификацию
  (JWT выдан, /auth/login → 200), но при последующем GET /profiles → 403
  фронт ловил ошибку в `_fetchProfile`, считал логин провалившимся и
  возвращал на AuthScreen без какого-либо сообщения юзеру. Тихий
  провал. Юзер видит «ничего не произошло».
- **Фикс:**
  - В catch _fetchProfile не маркировать login как failure при 403.
  - Показать UI-banner «Не удалось загрузить профиль, попробуйте
    позже» — даёт пользователю понять, что что-то пошло не так.
  - Логировать детали в console для диагностики.

### FEAT-001: Балловая система для следующего потока ПВЛ + UI cleanup в текущем
- **Статус:** 🔴 TODO
- **Приоритет:** P3 (на следующий поток)
- **Создано:** 2026-05-03
- **Контекст:** Балловая система задумывалась с предварительным
  расчётом «400 баллов максимум». Сейчас уроки и материалы
  переписываются — старые цифры неактуальны. В текущем потоке
  фичу не внедряем; в следующем — да, с обновлёнными правилами.
- **Подзадачи:**
  - **UI cleanup в текущем потоке:** убрать чип «Баллы 0/400» из
    карточек студентов в менторской view. Скорее всего в
    `views/PvlPrototypeApp.jsx` или подкомпоненте. Не показывать
    стейл-цифры пользователям до реального внедрения.
  - **Внедрение в следующем потоке:** проектирование правил
    начисления (за чекпоинты, за ДЗ accepted, за активность в чате?),
    UI отображения, lifecycle сброса при смене когорты.

## ⚪ P3 — Хотелось бы (потом)

### ARCH-005: Решить про monorepo vs multi-repo
- **Статус:** 🔴 TODO (обсуждение)
- **Контекст:** 4 репозитория (garden, garden-auth, garden-db,
  meetings). Возможно, упростит работу один monorepo.
- **Решение:** обсудить, когда будет время

### ARCH-006: Сделать репо приватными
- **Статус:** ⚪ POSTPONED (есть причины)
- **Контекст:** Сейчас все 4 репо публичные. Решить, когда
  условия позволят.

### ARCH-007: Обобщённая модель курсов
- **Статус:** 🔴 TODO
- **Контекст:** Из PVL_RECONNAISSANCE: ПВЛ — первый из
  планируемых курсов. Нужна обобщённая абстракция "Курс"
  для масштабирования на новые.

### ARCH-008: Возможная иерархия ролей в будущем
- **Статус:** ⚪ POSTPONED (для обсуждения, не срочно)
- **Приоритет:** P3
- **Контекст:** Сейчас три админа (владелец + ассистент +
  куратор) имеют равные полные права. Это работает для
  текущего размера команды и осознанное решение владельца.
  Когда команда вырастет — возможно, понадобится разделение
  прав (например, ограничить кураторов только своими группами).
- **Когда обсуждать:** при росте команды до 5+ админов или
  при возникновении конкретного конфликта прав
- **Связано:** docs/DB_SECURITY_AUDIT.md (раздел "Список
  администраторов платформы")

### CLEAN-004: Удалить секреты из истории git
- **Статус:** ⚪ POSTPONED (низкий риск)
- **Контекст:** Старые Supabase anon-ключи в истории коммитов.
  Чистка через git filter-repo. Только если репо станут
  приватными.

### CLEAN-006: Удалить legacy-таблицу auth.users (Supabase)
- **Статус:** 🔴 TODO
- **Приоритет:** P3
- **Контекст:** auth.users — снапшот старой Supabase-схемы
  на 32 записи, последняя запись 2026-02-16 (дата миграции
  на garden-auth). Не используется, но занимает место и путает
  AI/новых разработчиков.
- **Шаги:**
  - [ ] Убедиться, что нигде в коде нет ссылок на auth.users
  - [ ] DROP SCHEMA auth CASCADE (или DROP TABLE auth.users)
- **⚠️ ВАЖНО:** НЕ дропать схему `auth` целиком — в ней живут
  функции `auth.uid()`, `auth.jwt()`, `auth.role()`, `auth.email()`,
  на которых построены 50+ RLS-политик (см. docs/DB_SECURITY_AUDIT.md).
  Безопасно только `DROP TABLE auth.users` (и при необходимости
  связанных `auth.identities`, `auth.sessions`, `auth.refresh_tokens`,
  `auth.mfa_*`, `auth.sso_*`, `auth.oauth_*`, `auth.flow_state`,
  `auth.one_time_tokens`, `auth.audit_log_entries`, `auth.instances`,
  `auth.saml_*`, `auth.schema_migrations`). Функции в схеме `auth`
  обязаны остаться нетронутыми.
- **Связано:** docs/SUPABASE_LEGACY_AUDIT.md, docs/DB_SECURITY_AUDIT.md

### CLEAN-007: PVL — schema cleanup и data integrity
- **Статус:** 🟡 IN PROGRESS (2026-05-03 P3 → P2 после live-smoke)
- **Приоритет:** **P2** (повышено с P3 — пункт про legacy-id в
  pvl_student_questions реально сломал mentor-UI после открытия
  Caddy; быстрый фикс DELETE 5 seed-строк применён в проде, но
  основная миграция TEXT → UUID остаётся открытой)
- **Контекст:** В сессии 2026-05-02 при инвентаризации схем
  24 PVL-таблиц всплыло несколько незаконченных миграций и
  отсутствующих constraints. Само по себе RLS не блокирует,
  но усложняет читаемость и оставляет dangling-данные.
  **Update 2026-05-03**: пункт про TEXT-id в pvl_student_questions
  стал реальной production-проблемой — битые seed-значения
  `'u-st-1'` валили cast в RLS-политике, что обвалило весь
  PVL-UI на mentor-логине. Hotfix DELETE применён, но
  фундаментально проблема (TEXT-id с потенциальными legacy-
  значениями) сохраняется до миграции колонки на UUID.
- **Найденное:**
  - **Мёртвые колонки в pvl_students:** mentor_id и
    cohort_id заполнены NULL у всех 23 строк. Реальная
    связка ментор↔студент — только в pvl_garden_mentor_links.
    Колонки и FK на pvl_mentors/pvl_cohorts остались —
    вводят в заблуждение читающего схему.
    → Решить: DROP COLUMN либо обновить ETL, чтобы писало
    туда же.
  - **Дублирующие колонки в pvl_calendar_events:**
    starts_at + start_at, ends_at + end_at. CHECK-constraints
    используют starts_at/ends_at, индексы — start_at.
    Похоже на незаконченную миграцию.
    → Решить: оставить только один набор, перенести данные.
  - **Параллельные колонки адресата в pvl_notifications:**
    user_id, recipient_student_id, recipient_mentor_id, role,
    recipient_role + триггер pvl_sync_notification_compat,
    синкающий legacy/new. Также: kind/type, body/text,
    is_read/read_at — пары legacy/new.
    → Решить: завершить миграцию, удалить legacy-колонки и
    триггер.
    → **При миграции:** после схлопывания 3 колонок адресата
    в одну — упростить RLS-политики
    `pvl_notifications_select_own_or_admin` и
    `pvl_notifications_update_own_or_admin` (фаза 12.2 миграции
    SEC-001): убрать OR по `recipient_student_id` и
    `recipient_mentor_id`, оставить только сравнение с
    единственной колонкой адресата + `is_admin()`. См. урок 14
    в EXEC_2026-05-02_phase12_2_pvl_notifications.md.
  - **Сломанные триггеры на pvl_cohorts и pvl_mentors:**
    trg_pvl_cohorts_updated_at и trg_pvl_mentors_updated_at
    объявлены, но колонки updated_at в схеме нет — триггеры
    при срабатывании упадут.
    → Решить: либо добавить колонки, либо удалить триггеры.
  - **Отсутствие FK:**
    - pvl_garden_mentor_links.mentor_id — без FK на pvl_mentors
    - pvl_direct_messages: mentor_id, student_id, author_user_id —
      без FK
    - pvl_student_questions.student_id — TEXT, без FK
    - pvl_notifications.user_id — TEXT, без FK
    Целостность держится только на коде.
    → Решить: добавить FK миграциями там, где не сломает
    существующие данные.
- **Шаги (отдельной мини-эпопеей, после открытия платформы):**
  - [ ] Аудит каждого пункта: сколько строк затрагивает,
    есть ли несогласованные данные.
  - [ ] План миграций (DROP/ADD COLUMN, добавление FK).
  - [ ] Применить в порядке от самых дешёвых к самым
    рискованным.
- **Связано:** docs/REPORT_2026-05-02_db_audit_v3.md
  (раздел "Что неожиданно")

### DEV-001: Убрать `dangerous-clean-slate` из deploy.yml для near-zero downtime
- **Статус:** 🔴 TODO
- **Приоритет:** P2 (улучшение UX, не блокер)
- **Контекст:** В `.github/workflows/deploy.yml` шаг
  `Deploy via FTP` использует `SamKirkland/FTP-Deploy-Action`
  с флагом `dangerous-clean-slate: true`. Это значит, что
  перед заливкой новых файлов FTP-папка прода
  `/www/liga.skrebeyko.ru/` **полностью стирается**, и пока
  идёт upload (~30-60 сек) — для пользователей, которые
  делают navigation или hard-refresh, сайт сломан (404 на
  все ассеты).
- **Что НЕ ломается даже сейчас:** in-flight API-вызовы
  (например, «сохранить ДЗ») — они идут через Caddy/PostgREST,
  а не через FTP. DB-запись проходит нормально.
- **Что улучшится:**
  - Vite собирает ассеты с content-hashed именами
    (`index-CTuO4hEU.js`). Каждая версия — свой набор файлов.
  - Без clean-slate: старые ассеты остаются на FTP, новые
    заливаются поверх (имена разные → не конфликтуют),
    `index.html` атомарно перезаписывается.
  - Окно даунтайма ~0 сек: пользователь либо получает старый
    `index.html` (со старыми ассетами, всё работает), либо
    новый (с новыми, тоже всё работает). Между ними нет
    «пустого» состояния.
- **Минус:** старые ассеты накапливаются на FTP (мусор).
  Решается периодической ручной чисткой раз в полгода
  (можно потом сделать чистку файлов > N дней через
  отдельный workflow-step).
- **Шаги:**
  - [ ] В `.github/workflows/deploy.yml` найти строку
    `dangerous-clean-slate: true` → заменить на `false` или
    удалить (default = false).
  - [ ] Push в feature-branch, триггернуть workflow, проверить
    что деплой прошёл и старые/новые ассеты сосуществуют на FTP.
  - [ ] Merge в `main`.
  - [ ] Прогнать тестовый деплой и убедиться через DevTools
    Network, что нет окна 404 на ассетах.
  - [ ] (Опционально) Завести отдельный workflow для очистки
    орфанных ассетов (старше 90 дней) раз в квартал.
- **Связано:** docs/EXEC_2026-05-02_etap4_frontend_patch.md
  (где впервые зафиксирован этот вопрос с пользовательским
  волнением про «сохранение ДЗ во время деплоя»).

### CLEAN-008: Удалить legacy VITE_SUPABASE_* из deploy.yml
- **Статус:** 🔴 TODO
- **Приоритет:** P3
- **Контекст:** В .github/workflows/deploy.yml шаг "Create
  env file" пишет VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY
  в .env прода. Платформа давно мигрировала с Supabase на
  свой PostgREST + garden-auth. Эти переменные либо вообще
  не читаются кодом, либо читаются как fallback-страховка.
- **Шаги:**
  - [ ] grep по репо: где читаются VITE_SUPABASE_URL и
    VITE_SUPABASE_ANON_KEY. Если нигде — удалить из workflow.
    Если читаются — заменить на пустую строку или удалить
    использования.
  - [ ] Удалить соответствующие GitHub Actions secrets
    через UI (опционально, если уверены что не нужны).
- **Связано:** docs/SUPABASE_LEGACY_AUDIT.md

### PERF-001: ANALYZE всех PVL-таблиц + основных таблиц Garden
- **Статус:** 🔴 TODO
- **Приоритет:** P3 (performance hygiene, не блокер)
- **Контекст:** В smoke 15.6 EXPLAIN на `pvl_garden_mentor_links`
  показал `rows=1200` (оптимизатор не знает реальный размер,
  фактически 19 строк). На `pvl_student_homework_submissions`
  Seq Scan там, где можно было Index Scan по `student_id`.
  Причина — ANALYZE не запускался после миграции SEC-001.
  `gen_user` не может выполнить ANALYZE (не owner таблиц на
  уровне Postgres-привилегий). autovacuum со временем сделает,
  но явный ANALYZE дешевле и предсказуемее.
- **Шаги:**
  - [ ] Через Timeweb SQL-консоль под postgres в default_db:
    ```sql
    ANALYZE public.profiles;
    ANALYZE public.pvl_students;
    ANALYZE public.pvl_garden_mentor_links;
    ANALYZE public.pvl_student_homework_submissions;
    ANALYZE public.pvl_student_course_progress;
    ANALYZE public.pvl_student_content_progress;
    ANALYZE public.pvl_homework_status_history;
    ANALYZE public.pvl_audit_log;
    ANALYZE public.knowledge_base;
    ANALYZE public.birthday_templates;
    -- + остальные PVL-таблицы при желании
    ```
  - [ ] После — повторить EXPLAIN из smoke 15.6 и убедиться,
    что план изменился (Index Scan где есть индексы, корректные
    оценки rows).
- **Связано:** docs/EXEC_2026-05-02_phase15_smoke_tests.md
  раздел 15.6.

### SEC-006: Ротация JWT_SECRET (post-SEC-001)
- **Статус:** 🔴 TODO
- **Приоритет:** P1 (не блокер открытия, но в течение 1-2 недель
  после стабилизации)
- **Контекст:** В этапе 3 SEC-001 (2026-05-02) JWT_SECRET
  фигурировал в:
  - tool-output'ах Claude Code (через `docker inspect postgrest`
    и `grep JWT /opt/garden-auth/.env`) — то есть лежал в
    рабочей памяти агента
  - команде `--env-file` при пересоздании Docker-контейнера
    PostgREST
  Плюс на проде секрет хранится в:
  - `/opt/garden-auth/.env`
  - env Docker-контейнера `postgrest`
  - `/tmp/pgrst_env.txt` (root:600, временный rollback-снапшот,
    стереть после полного завершения SEC-001)
  Это не утечка через git (благодаря security-sweep и redact),
  но «защита глубиной» предполагает ротацию. С новым секретом
  старые токены становятся невалидными — все пользователи
  разлогинятся, фронт-патч обработает корректно через
  401 → api.logout().
- **Шаги (выполнять синхронно, иначе сломает прод):**
  - [ ] Сгенерировать новый секрет: `openssl rand -hex 32`
  - [ ] Обновить `/opt/garden-auth/.env` (JWT_SECRET=...)
  - [ ] Перезапустить garden-auth: `systemctl restart garden-auth.service`
  - [ ] Обновить env Docker-контейнера `postgrest` через
    `docker rm + docker run` с новым `PGRST_JWT_SECRET`
    (паттерн как в этапе 3 шаг 2B, но с новым секретом)
  - [ ] Проверить, что новый токен от garden-auth принимается
    PostgREST — curl-проверка как в 2C
  - [ ] Стереть `/tmp/pgrst_env.txt` (содержит старый секрет)
- **Риски:**
  - Если перезапустишь garden-auth с новым секретом, но забудешь
    PostgREST — все live-токены провалят валидацию в PostgREST
    → 401 → пользователи разлогинятся (восстановимо логином).
  - Если перезапустишь PostgREST первым — то же самое.
  - Главное: оба компонента должны иметь один секрет в момент
    проверки. Допустима пара секунд рассинхронизации, но не
    минуты.
- **Связано:** docs/EXEC_2026-05-02_etap3_postgrest_jwt.md
  (process note), docs/RUNBOOK_garden.md.

### SEC-005: Отозвать CREATE на схеме public у gen_user
- **Статус:** 🔴 TODO
- **Приоритет:** P3 (архитектурная чистка, не дыра)
- **Контекст:** В фазе 3 SEC-001 (создание `is_mentor_for(uuid)`)
  пришлось дать `gen_user` право `CREATE ON SCHEMA public`
  через Timeweb web-форму «Привилегии gen_user»
  (см. lesson 5.1 в RUNBOOK). После завершения SEC-001
  попытка отозвать через SQL-консоль (`REVOKE CREATE ON SCHEMA
  public FROM gen_user`) не сработала — у роли в консоли нет
  достаточных прав для этой операции.
- **Почему это не дыра:** `gen_user` — owner всех таблиц
  `public.*`. Дополнительное право CREATE даёт возможность
  создавать новые объекты (функции, таблицы, sequences),
  но gen_user и без того имеет полный контроль над существующими.
  Это архитектурная аккуратность, не безопасность.
- **Когда чинить:** при следующей superuser-работе с БД
  (например, SEC-004 — FORCE RLS, или другая операция, требующая
  postgres-роли). Сразу заодно отозвать CREATE.
- **Возможные пути:**
  - Через Timeweb support — открыть тикет с просьбой выполнить
    `REVOKE CREATE ON SCHEMA public FROM gen_user` под их
    админ-учёткой.
  - Через web-форму «Привилегии gen_user» — рискованно
    (snapshot-replacement ACL), требует точного знания всех
    текущих галочек.
  - При выдаче более широкого админ-доступа Ольге к Postgres
    напрямую через psql — выполнить разово.
- **Связано:** docs/EXEC_2026-05-02_phase3_is_mentor_for.md
  (выдача), docs/RUNBOOK_garden.md (5.1, 5.4).

### CLEAN-012: Зачистить 1621 stub-id в pvl_audit_log.actor_user_id
- **Статус:** 🔴 TODO
- **Приоритет:** P3 (выполнять ПОСЛЕ BUG-003 — иначе фронт
  допишет новых стабов поверх зачистки)
- **Контекст:** В `pvl_audit_log.actor_user_id` лежит 1621
  значение типа `u-adm-1`, `u-st-1` — legacy stub-id из
  старых seed/test данных и текущей фронт-логики (см. BUG-003).
  Из 2205 строк только 584 имеют валидный UUID-shape
  `actor_user_id`. Не блокер (RLS не cast'ит эту колонку),
  но audit-trail несостоятелен.
- **Зависимости:**
  - **BUG-003 должен быть закрыт первым.** Иначе фронт после
    cleanup'а сразу вернёт стабы обратно.
- **Шаги (после BUG-003):**
  - [ ] Решить: удалять stub-rows или маппить их к UUID
    по контексту (event_type / created_at — может, можно
    угадать актора по совокупности признаков).
  - [ ] Если удалить — `DELETE FROM pvl_audit_log
    WHERE actor_user_id IS NOT NULL AND NOT actor_user_id
    ~* '<uuid-regex>'`.
  - [ ] Если миграция — отдельный план UPDATE'ов с маппингом.
  - [ ] (Опционально, после) ALTER COLUMN actor_user_id TYPE uuid
    USING actor_user_id::uuid + FK на profiles(id).
- **Связано:** BUG-003 (источник stub'ов), CLEAN-007 (общая
  миграция TEXT → UUID для PVL-таблиц), docs/EXEC_2026-05-03_post_smoke_text_id_sweep.md.

### CLEAN-011: notebooks и questions — таблицы Meetings, не «чужие»
- **Статус:** 🟡 PARTIALLY DONE (2026-05-04 — выяснено происхождение, переоформление контекста; полное решение архитектуры — отдельной задачей)
- **Приоритет:** P3
- **Контекст (обновлён 2026-05-04):** Эти две таблицы в `public` схеме
  Garden-БД (`default_db`) изначально казались «чужими». При диагностике
  Meetings-блокера 2026-05-04 (DevTools Console + Claude in Chrome
  smoke) выяснилось: `public.notebooks` и `public.questions` — это
  **таблицы приложения Meetings** (отдельный сервис расписания
  meetings.skrebeyko.ru). Meetings ходит к ним анонимно (без JWT)
  через api.skrebeyko.ru:
  - `GET /notebooks?select=id,title,description,image_url,pdf_url,created_at`
  - `GET /questions?select=question,order_index`
- **После phase 18:** обе получили `GRANT SELECT TO web_anon`, читаются
  Meetings приложением корректно. RLS-policies остались (RLS=on, без
  policies) — read pass через GRANT, write блокируется RLS deny-by-default.
- **Что осталось решить (для следующих заходов, не сейчас):**
  - Архитектурно правильнее ли держать таблицы Meetings в общей
    Garden-БД, или вынести в отдельную DB (но тогда теряется единый
    PostgREST-фасад)?
  - Чьи ещё репо (Sad, Meetings) ходят в эти таблицы — для записи?
    Если есть write-сценарии без policies → нужны policies, иначе
    блокировано deny-by-default.
- **Связано:** docs/EXEC_2026-05-02_phase14_part1_grants.md;
  migrations/2026-05-04_phase18_meetings_anon_read_revoke_events_writes.sql;
  AUDIT-001 (code review meetings).
  (pre-flight 14.0)

### MON-001: Поставить Sentry
- **Статус:** 🔴 TODO
- **Контекст:** Сейчас нет видимости на прод-ошибки. 186
  console.log в коде вместо нормального мониторинга.
- **Связано:** PROJECT_PASSPORT.md, проблемная зона

### TEST-001: Базовое тестирование
- **Статус:** 🔴 TODO
- **Контекст:** В проекте нет тестов вообще. Хотя бы smoke
  tests на критичные потоки (login, регистрация, открытие
  курса).

### INFRA-003: Обновления Ubuntu и перезагрузка сервера Mysterious Bittern
- **Статус:** 🔴 TODO
- **Приоритет:** P3
- **Контекст:** При SSH-входе на 5.129.251.56 показывает
  "49 updates can be applied immediately" и "System restart
  required". Делать в спокойное время после security-починки,
  не во время критичных работ.
- **Шаги:**
  - [ ] sudo apt update && sudo apt upgrade
  - [ ] sudo reboot
  - [ ] Проверить, что Caddy, PostgREST, auth поднялись после
    перезагрузки

### ARCH-008: Иерархия ролей администраторов
- **Статус:** 🔴 TODO
- **Приоритет:** P3
- **Контекст:** Сейчас все админы имеют единую роль 'admin' с
  одинаковыми правами. Со временем нужна иерархия:
  - owner — владелец, неограниченные права
  - admin — администратор-ассистент, всё кроме критичных вещей
    (биллинг, удаление пользователей)
  - curator — куратор групп, права в своей зоне
- **Когда:** когда количество админов вырастет до 5+ или
  возникнет конкретная проблема с разграничением

### PROD-001: Подумать про разделение ролей и прав
- **Статус:** ⚪ POSTPONED
- **Приоритет:** P3
- **Контекст:** Сейчас три админа имеют равные права. Возможно,
  стоит подумать, кто что должен мочь делать. Это продуктовое
  упражнение, не техническое — связано с ARCH-008.
- **Когда:** в спокойное время после security-починки

### UX-001: Прогнать платформу через design-/UX-скиллы (Emil Kowalski / impeccable / taste)
- **Статус:** 🔴 TODO
- **Приоритет:** P3
- **Создано:** 2026-05-03
- **Контекст:** Уже использовался frontend-скилл. Следующий слой —
  визуальная и UX-полировка. На рынке 3 заметных скилла, каждый со
  своим профилем и риском для авторской платформы вроде Garden.

  **Emil Kowalski (animations).** Эмиль — известный референс по
  interaction-дизайну, скилл скорее всего качественный. Риск для
  Garden: ты строишь авторскую платформу с интимной атмосферой,
  не SaaS-продукт. Слишком много анимаций может убить ощущение
  рукодельности. Брать выборочно — микро-интеракции на
  кнопках/тостах/переходах между состояниями, не повсеместно.

  **impeccable (20 команд + polish).** Pre-baked design system
  enforcement, команда `polish` перед релизом мощная. Главный риск
  opinionated-скиллов: гомогенизация. То, что для одного проекта
  «отполировано», другому добавляет generic-SaaS-флёра. У Garden
  есть характер (мягкие зелёные, спокойное, скруглённое), и его
  нельзя терять. Прогнать `polish` сначала на ОДНОМ компоненте,
  оценить, не размыло ли идентичность, и только потом расширять.

  **taste skill.** Концептуально самый интересный из трёх: учит
  Claude *судить*, а не применять правила. Для авторских проектов
  теоретически работает лучше остальных — меньше шансов
  гомогенизации. Но эффективность зависит от того, *чьему* вкусу
  скилл обучен, это лотерея. Попробовать первым на low-stakes
  экране (404, welcome-email, что-то периферийное).

- **Рекомендуемый порядок для Garden:**
  1. taste skill на одном экране → если результат нравится, расширяем
  2. impeccable.polish точечно (формы — там сетка реально нужна)
  3. animations самым последним, и только микро-уровень

- **Главный риск:** не запускать все три сразу. Велик шанс потерять
  авторский тон, потом долго возвращать.

- **Когда:** после стабилизации платформы (закрытие SEC-001,
  затем ARCH/BUG из P0/P1), в спокойное окно.

- **Связано:** косвенно с MON-001 (observability — параллельный
  трек продуктового качества, не визуального).

### AUDIT-001: Code review отдельного репозитория meetings
- **Статус:** 🔴 TODO
- **Приоритет:** P3
- **Создано:** 2026-05-04
- **Контекст:** Сервис встреч живёт в отдельном репо `ligacreate/meetings`.
  В Garden он связан через trigger `sync_meeting_to_event` (meetings →
  events). При диагностике 2026-05-04 (девушки жаловались, что встреча
  не видна гостям) обнаружили побочно:
  - `events.RLS = USING (true)` на INSERT/UPDATE/DELETE — после phase 16
    GRANT'ов любой залогиненный может создать/переписать/удалить любое
    событие. Зафиксировано отдельно как ANOM-002/SEC-011.
  - `co_hosts` не синхронизируется в events — возможно bug, возможно
    intentional. Зафиксировано как ANOM-003.
  - Аналогичные структурные паттерны могут быть и в самом коде сервиса
    meetings (auth-модель, RLS-предположения, обработка ошибок).
- **Что включить в audit:**
  - Структура auth — под какой ролью сервис ходит в БД, есть ли свой
    JWT, как читает meetings/events.
  - Обработка ошибок — silent fails / loud fails, нормализация
    сообщений для пользователя.
  - Точки записи в БД — все ли проходят через trigger или есть прямые
    INSERT'ы из сервиса в events (если есть — значит trigger не
    единственный источник истины, и надо понимать архитектуру).
  - Интеграция с Garden — webhook'и, polling, общие таблицы — где
    реально формируется список встреч для пользователя.
  - Зеркальные SEC-001 моменты — есть ли свои hardcoded id, забытые
    GRANT'ы, отсутствующие тесты.
- **Когда:** в спокойное окно после стабилизации Garden (закрытие
  P2-багов из этой сессии: SEC-009, ANOM-001, ANOM-002/SEC-011,
  BUG-LOGIN-*).
- **Способ:** новая сессия VS Code Claude Code с открытым репо meetings,
  либо через агентов в Claude Code из Garden-сессии.

### SEC-007: Восстановить RLS-policies для public.messages (legacy чат)
- **Статус:** 🔴 TODO (deferred)
- **Приоритет:** P3
- **Создано:** 2026-05-03 (Q7 SEC-001 phase 16)
- **Контекст:** Таблица `public.messages` имеет RLS=on, но 0 policies →
  все операции тихо блокируются deny-by-default. На фронте 5 callsites
  (dataService.js:2273,2294,2307,2326,2335 — SELECT/INSERT/UPDATE/DELETE).
  Ольга подтвердила (2026-05-03): legacy фича из старого чата, активный
  пользовательский чат идёт через `pvl_direct_messages`, который работает
  и имеет policies. Поэтому отложено как P3 — фича вернётся, когда
  понадобится.
- **Шаги при возврате:**
  - Спроектировать модель доступа: участники переписки
    (sender_id/recipient_id или групповая модель).
  - Написать SELECT/INSERT/UPDATE/DELETE policies через `auth.uid()`.
  - GRANT SELECT, INSERT, UPDATE, DELETE на public.messages для
    authenticated.
  - Smoke на legacy-чат, если он восстанавливается.
- **Связано:** migrations/2026-05-03_phase16_grant_role_switch_bulk.sql
  (deferred-список).

### SEC-008: Восстановить RLS-policies для public.push_subscriptions
- **Статус:** 🔴 TODO (deferred)
- **Приоритет:** P3
- **Создано:** 2026-05-03 (Q7 SEC-001 phase 16)
- **Контекст:** Таблица `push_subscriptions` имеет RLS=on, без policies.
  На фронте используется как fallback INSERT (dataService.js:2400) —
  основной путь идёт через push-server `/push/subscribe`. Не блокер
  пользовательского flow, но fallback не работает.
- **Шаги при возврате:**
  - SELECT-policy: только владелец подписки (user_id = auth.uid()).
  - INSERT-policy: WITH CHECK user_id = auth.uid().
  - DELETE-policy: только владелец (для unsubscribe).
  - GRANT SELECT, INSERT, DELETE для authenticated.
- **Связано:** migrations/2026-05-03_phase16_grant_role_switch_bulk.sql
  (deferred-список); push-server (отдельный сервис).

### SEC-010: GRANT-level minimum-privilege hardening для append-only/read-only таблиц
- **Статус:** 🔴 TODO
- **Приоритет:** P3
- **Создано:** 2026-05-03 (post-SEC-001 polish)
- **Контекст:** Phase 16 выдала blanket SELECT/INSERT/UPDATE/DELETE
  на 39 Tier-1 таблиц для authenticated, доверяя RLS-политикам как
  единственному реальному барьеру. Defense-in-depth: для таблиц,
  чьи policies явно append-only или read-only, GRANT-уровень тоже
  должен это отражать. Если когда-нибудь по ошибке добавят
  permissive UPDATE/DELETE policy, GRANT-слой страхует.
- **Кандидаты на даунгрейд:**
  - `pvl_homework_status_history` (a, r — append-only) → SELECT, INSERT
  - `news` (a, r — append+read) → SELECT, INSERT
  - `course_progress` (a, r) → SELECT, INSERT (если по семантике
    подтвердится append-only — структура колонок проверяется отдельно)
  - `notebooks` (r) → SELECT only
  - `questions` (r) → SELECT only
  - `notifications` (r, w) → SELECT, UPDATE (без INSERT/DELETE)
  - `profiles` (a, r, w — без DELETE policy) → SELECT, INSERT, UPDATE
- **Сейчас:** RLS закрывает несоответствующие операции, GRANT-слой
  избыточен, но безвреден. Это «улучшение состояния», не блокер.
- **Шаги:**
  - Миграция REVOKE для лишних privilege на каждой таблице из списка.
  - Сверка с фронт-callsites — убедиться, что никакой код не делает
    операций, которые мы хотим закрыть (если делает — это уже
    архитектурный мисматч с RLS).
  - Smoke на затронутых flow'ах.

## 🤔 К обсуждению / решению

### DEC-001: Закрыть продукт на 1-2 недели для большой починки
- vs делать постепенно, выпуская частичные фиксы
- Зависит от количества активных пользователей

### DEC-002: Нанять второго разработчика?
- Нагрузка вырастет после security-починки
- Бюджет vs скорость развития

## Завершённые задачи

При завершении задачи:
1. НЕ удалять из backlog
2. Перенести в раздел "История" внизу файла
3. Добавить дату завершения и краткий комментарий
4. Если задача породила новые — указать связи

### История

#### 2026-05-02
- SEC-001 этап 0: Caddy 503 закрыл дыру (15 минут работы) ✅

#### 2026-05-03
- **SEC-001 закрыт целиком** — RLS на 28 таблицах + JWT в PostgREST + frontend patch (jwt-fallback removal, Promise.allSettled, maintenance banner) + Caddy открыт (~03:00 МСК)
- **Live smoke 1** выявил 4 P0/P1 бага: BUG-004 white screen, BUG-PVL-STUDENTS-RETRY (ARCH-012), BUG-005 audit_log RETURNING, BUG-006 changed_by null
- **Batch frontend fix** (5 коммитов в одном деплое): bf57606 BUG-004, 45f1402 ARCH-012 hotfix, cd72e44 BUG-005, f46049d BUG-006, e3bd767 BUG-003
- **Repeat smoke v2** показал NEW-BUG-007 (profiles 42501) и WARN-008 (is_mentor_for EXECUTE missing) — обнажены SW caches purge'ем
- **Phase 16 миграция**: bulk GRANT для authenticated на 40 таблиц (Tier-1 full CRUD: 39, Tier-2 SELECT+INSERT: pvl_audit_log) + GRANT USAGE на sequences + NOTIFY pgrst
- **Phase 17 миграция**: GRANT EXECUTE на is_admin() и is_mentor_for(uuid) для authenticated
- **BUG-003 retry** (commit 7585407): новый helper getAuthUserId через JWT sub claim (jwtUtils.js), исправил ложно-блокирующий skip и закрыл BUG-006 уточнением (changed_by теперь real UUID)
- **Repeat smoke v3** READY_FOR_ANNOUNCE — все 8 регрессий закрыты, реальные доказательства (UUID actor_user_id, 201 на audit_log + status_history, Канбан загружен, прогресс студента 9/13)
- Закрытые: SEC-001, BUG-003, BUG-004, BUG-005, BUG-006. Частично: ARCH-012 (hotfix done, архитектурный фикс остался P2).
- Новые таски от инцидента: SEC-007 (messages), SEC-008 (push_sub), SEC-009 (increment_user_seeds privilege escalation), SEC-010 (GRANT-level hardening), ANOM-001 (mentor 130+ profile requests), BUG-LOGIN-RAW-ERROR-MSG, BUG-LOGIN-SILENT-PROFILE-FAIL, FEAT-001 (балловая система след потока + UI cleanup чипа)
- **Артефакты:** docs/HANDOVER_2026-05-03_session3.md, docs/EXEC_2026-05-03_post_smoke_browser_full.md, docs/EXEC_2026-05-03_post_smoke_diag_403_inserts.md, docs/EXEC_2026-05-03_post_smoke_repeat.md, docs/EXEC_2026-05-03_post_smoke_repeat_v3.md
- **Уроки** (docs/lessons/2026-05-03-*.md): RLS RETURNING implies SELECT-policy; RLS INSERT ON CONFLICT checks INSERT WITH CHECK; PVL student_questions cast errors propagation

#### 2026-05-04
- **Meetings-блокер обнаружен и закрыт.** Девушки сообщили, что встречи, созданные в Саду, не показываются гостям. Diagnostic: trigger sync_meeting_to_event() работает корректно (6/6 встреч за сутки синхронизировались), но Meetings приложение читает api.skrebeyko.ru анонимно (без JWT), а у роли web_anon после phase 16 — 0 GRANT'ов. Каждый запрос → 42501.
- **Phase 18 миграция:** GRANT SELECT ON {events, cities, notebooks, questions} TO web_anon + REVOKE INSERT/UPDATE/DELETE ON events FROM authenticated. Закрыла Meetings-блокер + параллельно ANOM-002/SEC-011 (events writes wide-open).
- **Открытия:**
  - `notebooks` и `questions` — это таблицы Meetings, не «чужие» (CLEAN-011 переоформлен).
  - RLS-policy `meetings` = `auth.uid() = user_id` для всех операций — owner-only by design; гости видят встречу через `events` (sync trigger).
  - `events` RLS = `USING (true)` для всех CRUD → защищались только GRANT-слоем; phase 18 закрыла дыру.
- **Закрыто:** ANOM-002/SEC-011 (phase 18). **Открыто:** ANOM-003 (co_hosts не sync'ится), ANOM-004 (writes на cities/notebooks/questions — audit паттерна), AUDIT-001 (code review репо meetings).
- **Урок** (docs/lessons/2026-05-04-postgrest-role-switch-anon-clients.md): при включении role-switch в API-gateway (PostgREST) GRANT-слой должен покрывать ВСЕХ клиентов API, включая отдельные сервисы и анонимных читателей, а не только основной фронт.
