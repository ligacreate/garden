---
title: Backlog — Garden Project
type: task tracker
version: 1.0
created: 2026-05-02
last_updated: 2026-05-06
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
2. ~~MON-001: Sentry или аналог~~ → 🟢 DONE 2026-05-10 (свой reporter в TG @garden_grants_monitor_bot)
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

### SEC-014: расследование причины GRANT wipeout 2026-05-04 + защита
- **Статус:** 🟡 IN PROGRESS (большая часть scope закрыта 2026-05-05 phase 23 hot-fix; остаётся: тикет в Timeweb support для root cause)
- **Приоритет:** P1 (повтор инцидента = повтор 2-часового outage у всех пользователей, пока кто-то не заметит)
- **Создано:** 2026-05-04 (после P0 GRANT WIPEOUT)
- **Обновлено 2026-05-05:** второй P0 GRANT WIPEOUT (через ~30 минут после phase 22 apply) подтвердил гипотезу «не Timeweb UI quirk, а post-DDL ACL-resync managed-Postgres». Защита перестроена в трёхслойную (см. ниже), open остался **только тикет в Timeweb support** для понимания root cause (не блокер прода).
- **Контекст:** Phase 16/17/18 GRANT'ы для `authenticated` и `web_anon`
  на 45 public-таблицах были стёрты целиком (см.
  [docs/INCIDENT_2026-05-04_grant_wipeout.md](../docs/INCIDENT_2026-05-04_grant_wipeout.md)).
  Самая вероятная причина — Timeweb UI quirk «Привилегии роли»
  делает REVOKE ALL on save (тот же механизм, что в RUNBOOK 1.2 для
  `gen_user`, см.
  [docs/lessons/2026-05-04-timeweb-role-permissions-ui-revokes-all.md](../docs/lessons/2026-05-04-timeweb-role-permissions-ui-revokes-all.md)).
  Recovery занял минуты, но детект инцидента — 2 часа (через жалобу
  ведущей). Нужны и расследование, и защитный мониторинг, и
  one-click playbook.
- **Scope:**
  1. **Расследование.** Проверить Timeweb activity log за 2026-05-04
     (если он доступен), идентифицировать конкретное действие в UI
     и аккаунт, который его выполнил.
  2. **RUNBOOK update.** В `docs/RUNBOOK_garden.md` раздел 1.2
     добавить явное предупреждение: «НЕ открывать раздел "Привилегии
     роли" в Timeweb UI ни для просмотра, ни для редактирования —
     любое сохранение делает REVOKE ALL FROM <role>». Для инспекции
     прав — только psql (`\dp`, `information_schema.role_table_grants`).
  3. **Защитный мониторинг.** Cron-job (или системный таймер),
     который раз в N минут проверяет:
     ```sql
     SELECT grantee, count(*)
     FROM information_schema.role_table_grants
     WHERE table_schema='public'
       AND grantee IN ('authenticated','web_anon')
     GROUP BY grantee;
     ```
     и шлёт alert (Telegram-бот / email), если `authenticated < 100`
     или `web_anon < 4`. Threshold подобрать после инвентаризации;
     стартовый baseline — `authenticated=158`, `web_anon=4` (post-recovery).
  4. **Idempotent recovery-скрипт** `scripts/recover_grants.sh` —
     одной командой re-apply phase 16 + 17 + phase 18 PART 1+3 с
     verify-блоком. **Без PART 2** (REVOKE writes на events) —
     откатано phase 19. Скрипт должен брать creds из
     `/opt/garden-auth/.env`, избегать heredoc через ssh
     (экранирование ломается), использовать scp + psql -f (как в
     успешном recovery 2026-05-04). После apply — печатать
     GRANT-rows count для контроля.
- **Why:** wipeout 2026-05-04 длился ~2 часа от первой жалобы до
  recovery. Без мониторинга следующий wipe будет обнаружен по той
  же траектории (через жалобы пользователей), и каждый раз кто-то
  должен помнить точный recovery-плейбук. Метрика + скрипт сводят
  оба риска к минутам.
- **Acceptance:**
  - ✅ RUNBOOK 1.2 содержит предупреждение про «Привилегии роли» UI.
  - ✅ RUNBOOK 1.3 (новый, 2026-05-05) — обязательное правило `SELECT public.ensure_garden_grants()` в конце каждой DDL-миграции.
  - ✅ stored procedure `public.ensure_garden_grants()` создана в phase 23 (см. `migrations/2026-05-05_phase23_grants_safety_net.sql`). Идемпотентная, повторяет phase 16/17/18 PART 1.
  - ✅ `scripts/recover_grants.sh` отработал на проде 2026-05-05, counts 158/4 (см. `/var/log/garden-monitor.log`).
  - ✅ `scripts/check_grants.sh` — cron-monitor каждые 5 минут (`/etc/cron.d/garden-monitor`), при wipe (authenticated < 100 ИЛИ web_anon < 4) шлёт Telegram-alert (no-op если бот не настроен) и авто-вызывает `recover_grants.sh`.
  - ⏸ **Открыто:** тикет в Timeweb support — описать паттерн (DDL → wipe), попросить explain root cause. Не блокер.
  - ⏸ **Открыто:** Telegram-бот для алертов (env-vars `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` в `/opt/garden-auth/.env` пока пусты — см. отчёт session 2026-05-05). Без бота cron-monitor работает в logging-only режиме.
- **Связано:** [docs/INCIDENT_2026-05-04_grant_wipeout.md](../docs/INCIDENT_2026-05-04_grant_wipeout.md),
  [docs/lessons/2026-05-04-timeweb-role-permissions-ui-revokes-all.md](../docs/lessons/2026-05-04-timeweb-role-permissions-ui-revokes-all.md),
  [docs/lessons/2026-05-05-timeweb-revokes-grants-after-ddl.md](../docs/lessons/2026-05-05-timeweb-revokes-grants-after-ddl.md),
  RUNBOOK 1.2 + 1.3, phase 16/17/18/23 миграции.

### NB-RESTORE: переезд админки notebooks/questions/cities из meetings в Garden
- **Статус:** 🔴 TODO
- **Приоритет:** P1
- **Создано:** 2026-05-06 (в финале сессии FEAT-002 этап 3)
- **Контекст:** После SEC_PINS Variant A в meetings админки нет — Ольга временно теряет UI для управления `notebooks`/`questions`/`cities`. Архитектурно правильно собрать единый источник правды в Garden, а meetings оставить чисто read-only публичной читалкой (CLEAN-011: эти таблицы — данные приложения meetings, лежат в общей Garden-БД).
- **Решение:** meetings-стратег рекомендует Variant 3 — переезд CRUD в Garden. Оценка ~3-5 дней Garden-команды.
- **Скоп:**
  - UX-recon формы Garden — где разместить админ-секцию (вероятно, расширение AdminPanel под отдельный таб «Контент meetings» или подменю).
  - Реализация форм для `notebooks`, `questions`, `cities` в Garden, role-based access (admin only).
  - PostgREST writes под JWT `role='admin'` — RLS-policies на write для этих таблиц должны быть admin-only (проверить текущее состояние, дозаписать если нет).
  - Удалить дубликаты в meetings (после переезда) — UI-формы и POST/PATCH/DELETE-флоу.
- **Acceptance:**
  - Ольга через Garden управляет `notebooks`, `questions`, `cities` (CRUD).
  - Meetings-фронт остаётся read-only публичной читалкой, не имеет UI для записи.
  - В CLEAN-011 контекст обновляется: «таблицы Meetings, админка в Garden».
- **Связано:**
  - `docs/SEC_PINS_2026-05-05.md` (meetings, Variant A)
  - `docs/NB_RESTORE_PLAN.md` (meetings, план переезда)
  - CLEAN-011 (notebooks/questions — таблицы Meetings)
  - ANOM-004 (verified anon write → 42501; админка в Garden подразумевает admin JWT, дополнительной защиты на write пока хватает текущей)

### FEAT-015: Авто-пауза ведущей при неоплате подписки на Prodamus
- **Статус:** 🔴 TODO
- **Приоритет:** P1 (защита от неоплаченного использования платформы; снимает с Ольги ручной труд)
- **Создано:** 2026-05-06
- **Контекст:** Сейчас постановка ведущей на паузу — ручная (Ольга
  через админку → `profiles.status = 'suspended'`). Когда ведущая
  перестаёт платить ежемесячный взнос на Prodamus — её аккаунт
  остаётся `active`, она продолжает использовать платформу
  бесплатно. Нужна автоматическая интеграция: webhook от Prodamus
  → suspend status профиля → phase 21 trigger
  (`on_profile_status_change_resync_events`) автоматически скроет
  её события из публичного Meetings.
- **Скоп:**
  1. **Recon Prodamus webhook API:** формат событий, signature
     verification, какие события (`payment.success`,
     `payment.failed`, `subscription.expired`, etc.).
  2. **Webhook endpoint в `garden-auth`** (Express): приём +
     проверка подписи + UPDATE `profiles.status='suspended'` или
     обратно `active` по email/идентификатору ведущей.
  3. **Setup webhook URL в Prodamus dashboard.**
  4. **End-to-end smoke:** тестовый платёж в Prodamus → webhook
     → пауза; тестовое восстановление → webhook → активация.
  5. **Логирование webhook'ов** для аудита (отдельная таблица
     `billing_webhook_logs` — может потребовать применения
     отложенной миграции 21 биллинга, см. архитектурный вопрос).
- **Архитектурный вопрос (на recon):** в проекте есть
  спроектированная, но НЕ применённая миграция 21 (биллинг +
  `profiles.access_status` + таблицы `subscriptions` /
  `billing_webhook_logs` + RESTRICTIVE-гарды). Решить на
  старте recon — apply'ить ли её сразу (полный путь, ~4-6
  сессий, полная биллинг-модель с историей подписок) или начать
  с упрощённой версии на текущем `profiles.status` (минимальный
  путь, ~2-3 сессии, без истории платежей).
- **Why:** защита бизнеса от неоплаченного использования +
  устранение ручного труда Ольги по сверке Prodamus с админкой.
- **Acceptance:**
  - В Prodamus настроен webhook на endpoint в `garden-auth`.
  - При неоплате (`payment.failed` / `subscription.expired`):
    `profiles.status='suspended'`, события исчезают из
    публичного Meetings (через phase 21 trigger).
  - При возобновлении оплаты: `status='active'`, события
    восстанавливаются.
  - Webhook signature verifies корректно (защита от подделки).
  - Все webhook'и логируются для аудита.
- **Связано:**
  - `garden-auth` (Express, добавление endpoint)
  - FEAT-013 (phase 21 trigger — переиспользуем для авто-suspend)
  - Отложенная миграция 21 (биллинг)
  - ARCH-011 (подписочная модель Garden — пересекается)

### FEAT-018: Часовые пояса встреч — корректный TZ для офлайн + фильтр городов + локальное время для пользователя
- **Статус:** 🔴 TODO (recon → продуктовое решение → план)
- **Приоритет:** P1 (блокер географической функции; ведущие в других часовых поясах не могут адекватно объявить местную встречу, читатели рискуют пропустить из-за неверного local-time)
- **Создано:** 2026-05-06
- **Контекст:** Сейчас часть инфраструктуры есть (в `meetings` поле
  `timezone`, в `events` — `starts_at` TZ-aware и `source_timezone`,
  trigger `sync_meeting_to_event()` интерпретирует date+time через
  `AT TIME ZONE COALESCE(NULLIF(NEW.timezone, ''), 'Europe/Moscow')`),
  но flow неполный:
  - неясно, заполняется ли `meetings.timezone` из UI Garden при
    создании встречи;
  - в `cities` возможно нет колонки `timezone` (на recon выяснить);
  - meetings-фронт неясно, как рендерит время — в TZ организатора,
    в TZ читателя, или просто строку из `events.time`;
  - фильтр по городу в meetings — есть, но непонятно, корректно ли
    включает все города с офлайн-встречами.
- **Чего хочет Ольга:**
  - Онлайн-встречи — всегда в МСК (по дизайну, без выбора UI).
  - Офлайн-встречи — в часовом поясе города (auto-attach из `cities`),
    отображаются у читателя адекватно (либо локальное время с меткой
    типа «МСК» / «UTC+5», либо конвертированно в TZ читателя — это
    продуктовое решение на recon).
  - Город из любой активной встречи появляется в фильтре meetings.
- **Скоп (на recon):**
  1. Проверить схему: есть ли `cities.timezone`? Если нет —
     нужна миграция + map городов на IANA TZ-имена
     (`Europe/Moscow`, `Asia/Novosibirsk`, etc.).
  2. Прочитать flow создания встречи в `views/MeetingsView.jsx` —
     как пишется `meetings.timezone` (или не пишется).
  3. Прочитать `sync_meeting_to_event()` — точная логика
     `event_starts_at` и `source_timezone`.
  4. Прочитать meetings-фронт: как сейчас отображается время на
     карточке + в фильтре, какие поля используются.
  5. **Новый город — flow добавления.** Когда ведущая создаёт
     встречу в городе, которого ещё нет в `cities`:
     - что происходит сейчас (auto-INSERT, error, тихий пропуск)?
     - появляется ли город в фильтре meetings (фильтр читает
       из `cities` или distinct из `events.city`)?
     - где сейчас был UI добавления города (cities Admin в
       meetings — выпилен в SEC_PINS Variant A) → переедет
       в Garden через NB-RESTORE;
     - какое UX лучше: ведущая вписывает свободный текст +
       город авто-добавляется в `cities` + admin потом
       проставляет TZ; или ведущая выбирает из готового
       списка, новый город заводит только admin?
  6. Продуктовое решение (с Ольгой):
     - показывать «как у организатора» (с TZ-меткой) или «как у
       читателя» (auto-detect TZ браузера)?
     - формат метки TZ («МСК» vs «UTC+3» vs «Москва»);
     - flow нового города (см. пункт 5).
  7. Implement в Garden (миграция `cities.timezone` + UI
     создания встречи + cities Admin через NB-RESTORE) +
     meetings-фронт (рендер времени + фильтр).
- **Why:** Без корректного TZ-flow география Лиги ломается:
  ведущие в Новосибирске/Владивостоке не могут адекватно объявить
  местную встречу, читатели в МСК неправильно понимают время.
- **Acceptance:**
  - Офлайн-встреча с городом X отображается с корректным временем
    (в TZ города или TZ читателя — по продуктовому решению).
  - Онлайн всегда в МСК с явной меткой.
  - Фильтр по городу в meetings включает все города с активными
    встречами.
  - Smoke на проде: тестовая встреча в другом часовом поясе
    (Новосибирск или Калининград) отображается правильно.
- **Связано:** `views/MeetingsView.jsx`, `meetings.timezone`,
  `cities` (потенциально новая колонка `timezone`),
  `sync_meeting_to_event()` функция (`events.starts_at`,
  `source_timezone`), meetings-фронт (рендер карточки + фильтр).
- **Оценка:** ~2-3 сессии (recon + продуктовое решение + миграция
  + Garden фронт + meetings фронт + smoke). Может быть больше,
  если решим конвертировать в TZ читателя — добавляется
  client-side TZ-detection и edge-cases.

### FEAT-019: Сокровищница + маркетплейс практик
- **Статус:** 🔴 TODO (ждёт планирования + brief'а от Ольги)
- **Приоритет:** P2-P3 (большая фича, ~8-11 сессий, после INFRA-N + UX-002 + NB-RESTORE)
- **Создано:** 2026-05-07
- **Полное ТЗ:** [`docs/_session/2026-05-07_10_idea_treasury_marketplace.md`](../docs/_session/2026-05-07_10_idea_treasury_marketplace.md)
  (не дублируется здесь — единственный источник правды).
- **Краткое summary:**
  - Новый раздел **«Сокровищница»** — общая бесплатная база практик
    ведущих (общинно-курируемая библиотека).
  - Переименование текущего «Практики» → **«Мои практики»** (личная
    коллекция).
  - Механика **публикации** (приватная → в Сокровищницу),
    **модерации** (админский ревью), **форка** (взять чужую практику в
    свою коллекцию **с атрибуцией автору**).
  - **Семена за публикацию** — gamification, расширение
    `incrementUserSeeds` flow.
  - Расширение модели `practices`: visibility, source/forked-from,
    moderation_status, etc.
  - **Заложить архитектуру маркетплейса** (платных премиум-практик
    в будущем) без UI на этой итерации.
- **Бюджет:** ~8-11 сессий (1 на план + 7 этапов реализации).
- **Зависимости (рекомендуется закрыть до релиза):**
  - **NB-RESTORE** (P1) — без переезда админки notebooks/cities
    в Garden модерация форкнутых практик неудобна.
  - **UX-002** (P3) — full-width админка с sortable + filter для
    очереди модерации.
  - **INFRA-N / INFRA-004** (P1) — cache-headers, иначе deploy фичи
    бьёт по PVL-учительской.
- **Why:** Сильный community-механизм. Ведущие учатся друг у друга
  через готовые практики, общинная база растёт сама собой,
  атрибуция формирует репутацию.
- **Acceptance** (high-level, детали — в `_10`):
  - Раздел Сокровищница доступен всем авторизованным.
  - Ведущая может опубликовать свою практику — заявка идёт в
    модерацию.
  - Модератор (admin) одобряет → практика появляется в Сокровищнице.
  - Любой ведущий может «forkнуть» — практика копируется в его
    «Мои практики» с пометкой источника.
  - Семена начисляются автору при first-fork и при публикации
    (механика — на план).
  - Заложена схема для премиум-маркетплейса (платежи отложены).
- **Связано:** NB-RESTORE, UX-002, INFRA-004, `services/dataService.js`
  методы по practices, ARCH-011 (подписочная модель — пересекается
  с маркетплейсом).
- **Оценка:** 8-11 сессий по этапам.

### ARCH-001: Связка ментор-ученик в курсе ПВЛ
- **Статус:** 🟢 DONE (2026-05-04 — учительская и API-flow задокументированы в PVL_RECONNAISSANCE.md разделе 2.4)
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
- **Статус:** 🟢 DONE (2026-05-04, верификация на production data)
- **Контекст (исходный):** Из API_OUTAGE_IMPACT_ANALYSIS.md: ДЗ хранятся
  в memory state, теряются при закрытии вкладки.
- **Что выяснилось:** структурно ДЗ сохраняются корректно. Полная
  цепочка работает: HomeworkInlineForm → saveStudentDraft /
  submitStudentTask → buildSubmissionPayload → createHomeworkSubmission /
  updateHomeworkSubmission → `pvl_student_homework_submissions.payload`
  (jsonb). Текст хранится в `payload.versions[].textContent` (rich-text
  HTML), с поддержкой версионирования (versionNumber растёт при доработках).
- **Верификация на проде (2026-05-04):**
  - Всего submissions в БД: 48. С непустым `payload.versions`: **48/48** ✅
  - Свежих за 7 дней: 28. Все 28 содержат rich-text contentт: **28/28** ✅
  - Sample показал versionNumber до 3 (итерации с доработками работают).
  - Ни одной потерянной submission на production data за месяцы
    использования.
- **Влияние:** Исходные жалобы "плохо сохраняются ДЗ" объясняются
  не структурной потерей, а edge-case race condition'ами (см.
  ARCH-013 ниже): `persistSubmissionToDb` — fireAndForget с retry-loop,
  UX показывает "Сохранено" до подтверждения от БД, закрытие вкладки
  в первые ~7 секунд может реально терять данные.
- **Известные ограничения (отдельные таски):**
  - ARCH-013 — blocking flow для critical save (заменить fireAndForget)
  - REFACTOR-002 — разделить version content и thread в схеме (сейчас
    весь thread пишется в payload каждой submission, race-prone)
- **Связано:** docs/API_OUTAGE_IMPACT_ANALYSIS.md, ARCH-013, REFACTOR-002

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
- **Статус:** 🟢 DONE (2026-05-04 — UI и flow найдены, документированы в PVL_RECONNAISSANCE.md раздел 2.4; banner про устаревшие блоки добавлен в DB_SECURITY_AUDIT.md)
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

### ARCH-011: Подписочная модель Garden — спроектировать и реализовать
- **Статус:** 🔴 TODO (переформулировано 2026-05-04 — раньше формулировалось
  как «включить _assertActive обратно», но Ольга уточнила: самой подписочной
  системы как фичи в продукте сейчас нет, обратно «включать» нечего)
- **Приоритет:** P3 (продуктовая фича, не баг безопасности — на calm-time)
- **Контекст:**
  - В services/dataService.js строки 1190-1193 функция `_assertActive`
    сейчас no-op (комментарий "Temporary open access mode"). Заглушка
    проверяет `SUBSCRIPTION_EXPIRED` / `ACCESS_PAUSED_MANUAL` коды.
  - В App.jsx init() catch-блок (строки 121-127) умеет обрабатывать
    эти коды и показывать блокирующий экран.
  - **Но самой подписочной системы как фичи нет:** нет UI оплаты, нет
    бэкенда для статуса подписки, нет интеграции с платёжным провайдером,
    нет cron'а на проверку expiry. Был только заглушечный код, готовый
    к подключению.
- **Что нужно решить (продуктово):**
  - Какая модель подписки? Месяц / год / lifetime / freemium?
  - Какие тарифы? Совпадают ли с курсом ПВЛ или отдельно?
  - Какой платёжный провайдер (ЮKassa / Stripe / Robokassa / другой)?
  - Что происходит при просрочке: hard-block? grace period? read-only mode?
  - Где интеграция с зачислением на курс ПВЛ (paid → enrolled)?
- **Что нужно сделать (технически, после продуктового решения):**
  - DB: поля `subscription_status`, `subscription_expires_at`,
    `subscription_tier` на `profiles` (или отдельная таблица
    `subscriptions`).
  - Backend: webhook от платёжного провайдера, обновление статуса.
  - Backend: cron-функция «истёк ли срок» для перехода в expired.
  - Frontend: восстановить `_assertActive` (есть в git history до
    отметки "Temporary open access mode") + UI оплаты + страница
    просроченной подписки.
  - Smoke: пользователь с истёкшей подпиской видит блокирующий экран.
- **Связано:** services/dataService.js:1190-1193 (заглушка), App.jsx:121-127
  (catch-блок), потенциальная интеграция с курсом ПВЛ (когорты,
  enrollment).

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

### ARCH-013: Critical save через blocking flow вместо fireAndForget
- **Статус:** 🔴 TODO
- **Приоритет:** P2 (риск тихой потери пользовательской работы)
- **Создано:** 2026-05-04 (ARCH-002 диагностика)
- **Контекст:** `persistSubmissionToDb` (вызывается при сохранении
  ДЗ студентом) — fireAndForget с retry-loop `[0, 2000, 5000] ms`.
  Из-за этого:
  - UI показывает "Сохранено" через `setSaved(true)` ДО того, как
    DB подтвердит запись.
  - При закрытии вкладки в течение ~7 сек после save — данные могут
    не дойти до DB. Студент видел подтверждение, в реальности — потеря.
  - При 3-кратном fail (JWT expired, network down) — UI ничего не
    показывает, тихая потеря.
- **Решение:** для critical-save flow (отправка ДЗ, статус смены)
  заменить fireAndForget на blocking flow:
  - "Сохранено" показывать только после реального 201/200 от
    PostgREST.
  - На fail — toast "Не удалось сохранить, попробуйте ещё раз" + не
    закрывать draft из state.
  - Опционально — beforeunload warning, если есть unsaved draft.
- **Связано:** ARCH-002 (родитель), services/pvlMockApi.js
  (persistSubmissionToDb / doPersistSubmissionToDb).

### REFACTOR-002: Разделить version content и thread в pvl_student_homework_submissions
- **Статус:** 🔴 TODO
- **Приоритет:** P3 (perf + race-prone, но не блокер)
- **Создано:** 2026-05-04 (ARCH-002 диагностика)
- **Контекст:** Текущий `buildSubmissionPayload` кладёт ВЕСЬ
  `db.threadMessages` (включая ментор-комменты) в `payload jsonb`
  каждой submission при каждом update. Это значит:
  - Inefficient: thread переписывается целиком при сохранении новой
    версии ответа студента.
  - Race-prone: если ментор пишет коммент одновременно со студентом-
    save'ом, последний writer wins — потеря коммента или ответа.
  - Несимметрично с `pvl_homework_status_history`, который вынесен
    в отдельную таблицу.
- **Решение:** вынести thread в отдельную таблицу
  `pvl_homework_thread_messages` (или подобную) с FK на submission_id
  + RLS-policies (видит студент-владелец + ментор-связанный + админ).
  Submissions.payload оставить только для версий ответа студента.
- **Связано:** REFACTOR-001 (общая нормализация PVL-схемы),
  ARCH-002.

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

### CLEAN-013: Data hygiene profiles — тестовые аккаунты + дубль
- **Статус:** 🟡 PARTIALLY DONE (4/5 закрыты 2026-05-08; Настина фея +
  Настин фиксик оставлены как тест-окружение Насти, скрыты «глазиком»)
- **Приоритет:** P2
- **Контекст:** Побочный поток FEAT-002 этап 1
  (`docs/RECON_2026-05-04_feat002_telegram_match.md`). После apply
  гигиены `profiles.telegram` остались 5 строк, требующих отдельного
  решения: 4 тестовых аккаунта (засоряют публичные списки ведущих и
  орграсчёты) + 1 дубль профиля по email-корню `malaglilia@gmail.com`.
- **Скоп — 5 кандидатов и финальное состояние:**
  - 🟢 **Лена Ф** (`037603f7-f215-4a49-8d5c-e5e1c93632fa`) —
    удалена 2026-05-07 через RPC `admin_delete_user_full`
    (commit `9fddae4`).
  - 🟢 **LIlia MALONG dup** (`1431f70e-63bd-4709-803a-5643540fc759`) —
    удалена 2026-05-08 через data-миграцию
    `cleanup_clean013_partial` (commit `296cfb3`).
  - 🟢 **Рита** (`3746da91-5c66-4e91-9966-15643136dae6`) — удалена
    2026-05-08 через ту же миграцию.
  - 🟢 **Екатерина Салама** (`49c267b1-7ef6-48f6-bb2f-0e6741491b90`) —
    удалена 2026-05-08 через ту же миграцию (продуктовое решение
    Ольги — не applicant, не оставляем).
  - 🟡 **Настина фея** (`1085e06d-34ad-4e7e-b337-56a0c19cc43f`) и
    🟡 **Настин фиксик** (`1b10d2ef-8504-4778-9b7b-5b04b24f8751`) —
    **оставлены как тест-окружение Насти** (продуктовое решение Ольги
    2026-05-08). Скрыты через «глазик» в users-табе AdminPanel
    (`hiddenGardenUserIds` в localStorage). НЕ удаляем.
- **Артефакт миграции:** `migrations/data/2026-05-08_cleanup_clean013_partial.sql`
  (audit-record в `pvl_audit_log` + DELETE из `pvl_garden_mentor_links`
  + `pvl_students` (CASCADE → pvl_student_*) + `users_auth` + `profiles`).
- **Сопутствующее изменение FEAT-017:** AdminPvlProgress (commit `296cfb3`)
  принимает `hiddenIds` prop из `hiddenGardenUserIds` — скрытые
  пользователи исчезают из дашборда + пересчитывают totals/GroupProgressBar.
- **Acceptance:**
  - 4 тестовых profile не показываются в публичных списках ведущих
    и в админских интерфейсах.
  - LIlia MALONG dup удалён через прямой DELETE (MERGE отменён —
    активность дубля не значима).
  - В `users_auth` остался только один email-вариант
    `malaglilia@gmail.com` (без запятой).
  - Екатерина Салама не остаётся «висящей» без ментора (если её
    нужно сохранить — переподвешена на реального).
- **Связано:**
  - BUG-ADMIN-DELETE-USER (closed 2026-05-07 — RPC, через который
    идут удаления)
  - `docs/journal/HANDOVER_2026-05-07_session_admin_delete.md`
  - `migrations/2026-05-07_phase24_admin_delete_user_rpc.sql`
  - `docs/RECON_2026-05-04_feat002_data_hygiene.md`
  - `docs/RECON_2026-05-04_feat002_telegram_match.md`
  - `migrations/data/2026-05-05_feat002_hygiene.sql`

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

### TEST-INFRA-SETUP: настроить тестовую инфраструктуру
- **Статус:** 🔴 TODO
- **Приоритет:** P3
- **Создано:** 2026-05-08
- **Контекст:** В кодовой базе **нет тестов** — нет `vitest` / `jest`
  конфигов, нет `tests/` или `__tests__/` каталогов, в `package.json`
  отсутствует `test` скрипт. Любой smoke-тест на `ensurePvlStudentInDb`,
  `pvlPostgrestApi.getAdminProgressSummary` и т.д. — невозможен.
- **Скоп:**
  1. Выбрать runner: vitest (наследует vite-конфиг — естественный выбор)
     или jest. Vitest рекомендуется, у нас уже Vite 7.
  2. Добавить `vitest`, `@testing-library/react` в devDependencies.
  3. Конфиг `vitest.config.js` (или расширить `vite.config.js`).
  4. Скрипт `npm test` в `package.json`.
  5. Один пробный тест-файл (например, на `services/pvlMockApi.js`
     unit-функцию вроде `seedCohortIdToSqlUuid`) — чтобы проверить, что
     инфра работает.
- **Why:** без тестов любые регрессии ловятся только через продакшен
  smoke. Это технический долг с нулевыми платежами в моменте, но он
  блокирует адекватные fix'ы регрессий (например, `BUG-PVL-ENSURE-RESPECTS-ROLE`
  идеально подошёл бы под unit-тест).
- **Acceptance:**
  - `npm test` прогоняет хотя бы один тест и зелёный.
  - В CI (GitHub Actions deploy.yml) добавлен step `npm test` перед
    build'ом. Падение тестов блокирует deploy.
- **Связано:** `BUG-PVL-ENSURE-RESPECTS-ROLE` (smoke-тест требует
  инфры), все будущие unit-тесты на `services/*`.

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

### PROD-USER-DELETE-MODEL: Soft-delete vs hard-delete — стратегия для реальных пользователей
- **Статус:** 🔴 TODO (продуктовое решение)
- **Приоритет:** P2
- **Создано:** 2026-05-07 (открыто после BUG-ADMIN-DELETE-USER closure)
- **Контекст:** RPC `public.admin_delete_user_full(uuid)` (phase 24,
  2026-05-07) делает **hard DELETE** профиля + связанных записей.
  Это корректно для тестовых аккаунтов (CLEAN-013), но для **реальных
  пользователей** (когда ведущая просит «удалите меня», или нужно
  убрать аккаунт по compliance) hard-delete не всегда правильный
  ответ:
  - Hard-delete теряет audit-trail активности (хотя
    `pvl_audit_log.actor_user_id` сохраняется как orphan).
  - Восстановление невозможно (если человек передумал — заново
    регистрировать).
  - Связанные history-таблицы (`pvl_homework_status_history.changed_by`)
    становятся orphan.
- **Варианты:**
  1. **Soft-delete** — `profiles.status = 'deleted'` + frontend
    скрывает такие профили из всех публичных и админских списков.
    Плюсы: восстановимо, audit-trail цел. Минусы: «зомби-аккаунты»
    в БД, нужна логика «период удержания → hard-purge через N дней».
  2. **Hard-delete + audit-trail** — текущий RPC. Плюсы: чисто.
    Минусы: невосстановимо.
  3. **Гибрид:** soft-delete для реальных + hard для тестовых,
    через два разных RPC.
- **Скоп решения:**
  - Какой вариант (1/2/3) принять как стандарт для Garden.
  - Если soft-delete — какое значение в `profiles.status`
    (`deleted` / `archived` / др.) и как фильтровать в `getUsers`,
    public leaders, mentor_links и т.п.
  - Какой период удержания до hard-purge (если гибрид).
  - GDPR-аспект (право на забвение требует hard-purge в N дней
    после запроса).
- **Why:** Сейчас единственный механизм — hard-delete через
  `admin_delete_user_full`. Это нормально для тестовых, но
  опасно как универсальный flow для реальных людей.
- **Acceptance:**
  - Принято продуктовое решение, задокументировано в
    `plans/` или `docs/`.
  - Если выбран soft-delete или гибрид — спроектирован дополнительный
    RPC `admin_archive_user(uuid)` или модификация существующего;
    обновлены frontend-фильтры.
- **Связано:** BUG-ADMIN-DELETE-USER (closed), CLEAN-013
  (использует hard-delete для тестовых — это уместно), ARCH-014
  (контрактные FK на 3 таблицах — если перейдём на soft, FK
  не критичны).

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
- **Статус:** 🔴 REOPENED (2026-05-04 — phase 19 откатил REVOKE из-за регрессии. Окончательное закрытие — phase 20 через узкие RLS-policies, см. SEC-013)
- **Приоритет:** P2 (security, но closed community → не P0/P1)
- **Создано:** 2026-05-04 (post-phase-16 архитектурная ревизия)
- **История:**
  - 2026-05-04 — phase 18 закрыла через REVOKE INSERT/UPDATE/DELETE ON events FROM authenticated.
  - 2026-05-04 — phase 18 регрессия: ведущие не могли сохранить событие. Phase 19 откатил REVOKE (revert GRANT) + дополнительно ALTER trigger sync_meeting_to_event() SECURITY DEFINER. Authenticated снова имеет full CRUD на events, ANOM-002/SEC-011 временно открыта.
  - **План закрытия (phase 20):** заменить RLS-policies USING(true) на узкие policies через JOIN на meetings.user_id (ведущая может писать только свои события). См. SEC-013.
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
- **Статус:** 🟢 DONE (2026-05-05)
- **Приоритет:** P3 (теоретическая дыра по аналогии, не подтверждена)
- **Создано:** 2026-05-04 (после phase 18, по аналогии с ANOM-002/SEC-011)
- **Закрыто:** 2026-05-05 — verified by anon write attempt → 42501. Ольга через Claude in Chrome выполнила POST `/notebooks` без JWT — получила `permission denied` (42501). Дыры нет: web_anon не имеет GRANT INSERT/UPDATE/DELETE на эти таблицы (phase 18 открывала только SELECT), а authenticated-роль для попытки write падает на RLS / ACL. См. Историю 2026-05-05.
- **Контекст:** ANOM-002/SEC-011 показал паттерн: на `events` была
  RLS-policy `USING(true)` для INSERT/UPDATE/DELETE + phase 16 GRANT —
  любой залогиненный мог переписать. На `cities`, `notebooks`,
  `questions` (которые phase 18 открыл для web_anon SELECT) RLS-policies
  на запись мы не смотрели. Если там USING(true) — тот же класс дыры.
- **Что нужно (закрыто):** проверить policies на INSERT/UPDATE/DELETE
  для cities, notebooks, questions — закрыто фактом anon-write attempt.
- **Связано:** ANOM-002/SEC-011, phase 18, AUDIT-001 (code review meetings).

### ANOM-005: knowledge_base — KB_Edit_Auth permissive ALL перекрывает admin policies
- **Статус:** 🔴 TODO
- **Приоритет:** P2 (security misconfiguration, closed community = умеренный риск)
- **Создано:** 2026-05-04 (зафиксировано Ольгой во время SEC-001 миграции, не успели завести таск)
- **Контекст:** На таблице `public.knowledge_base` есть policy
  `KB_Edit_Auth` с `cmd = ALL` для роли `authenticated`. Postgres
  PERMISSIVE policies складываются по **OR** — это значит: даже если
  параллельно есть admin-only policies, широкая `ALL для authenticated`
  их перекрывает. Любой залогиненный может читать / писать / удалять
  любую запись в knowledge_base.
  - Hardcoded email Ольги в admin-policies был убран в SEC-001 phase 3
    (миграция на role='admin'), но эта легаси-policy осталась.
  - Phase 16 GRANT'ы дали authenticated full CRUD на таблицу,
    усилив проблему: GRANT-слой не отбивает.
  - Та же логика, что в ANOM-002/SEC-011 (events writes), но через
    другой механизм (PERMISSIVE-OR вместо USING(true)).
- **Что нужно проверить (DB-side, read-only):**
  - Подтвердить, что KB_Edit_Auth существует и PERMISSIVE:
    `SELECT polname, polcmd, polpermissive,
            pg_get_expr(polqual, polrelid) AS using_expr,
            pg_get_expr(polwithcheck, polrelid) AS with_check_expr
     FROM pg_policy WHERE polrelid = 'public.knowledge_base'::regclass;`
- **Решение (после подтверждения):**
  - Drop `KB_Edit_Auth` ИЛИ заменить её на RESTRICTIVE (тогда она
    режет, а не расширяет).
  - Альтернатива: перевести admin-only policies в RESTRICTIVE — RESTRICTIVE
    политики всегда применяются (combine по AND с PERMISSIVE).
  - Smoke: ментор/студент пытается PATCH /knowledge_base?id=eq.X →
    должно быть 403/42501 после фикса.
- **Связано:** ANOM-002/SEC-011 (тот же класс проблемы), SEC-001 phase 3
  (где hardcoded email убрали, но legacy KB_Edit_Auth не тронули),
  phase 16 (table GRANT, обнажил проблему).

### ANOM-006: events.time NOT NULL — trigger падает, если в meetings.time NULL
- **Статус:** 🔴 TODO
- **Приоритет:** P3 (минорный, проявляется только если фронт допускает пустой time в meeting)
- **Создано:** 2026-05-04 (обнаружено при verify phase 19)
- **Контекст:** В таблице `public.events` колонка `time` имеет NOT NULL
  constraint. В `public.meetings` колонка `time` (вероятно) NULL-able.
  Trigger `sync_meeting_to_event()` копирует `NEW.time → events.time`
  без COALESCE. Если фронт создаст meeting с пустым time, trigger
  упадёт с NOT NULL violation, и весь UPDATE/INSERT meeting откатится.
- **Воспроизведено:** при попытке создать тестовую meeting с пустым
  time во время verify phase 19 — INSERT упал на events.time NOT NULL.
  Добавление `time: '12:00'` устранило проблему.
- **Возможные решения (в порядке предпочтения):**
  1. `COALESCE(NEW.time, '00:00')` в trigger'е — graceful default,
     не теряем функционал.
  2. Добавить NOT NULL constraint на `meetings.time` + frontend
     валидация — синхронизировать модели.
  3. Сделать `events.time` NULL-able — потеряет смысл колонки.
- **Связано:** trigger sync_meeting_to_event(), schema events / meetings.

### SEC-013: Phase 20 — узкие RLS-policies на events writes (закрытие ANOM-002/SEC-011 без блокировки фронта)
- **Статус:** 🔴 TODO
- **Приоритет:** P2 (security, временно открыто после phase 19 revert'а)
- **Создано:** 2026-05-04 (после phase 19 hot-fix)
- **Контекст:** Phase 18 закрыла ANOM-002/SEC-011 через REVOKE
  INSERT/UPDATE/DELETE на events от authenticated, но это вызвало
  регрессию у ведущих (фронт делает PATCH /events напрямую, не через
  trigger). Phase 19 откатил REVOKE — ANOM-002/SEC-011 снова открыта.
- **Решение (phase 20):** заменить RLS-policies на events для
  INSERT/UPDATE/DELETE с `USING (true)` / `WITH CHECK (true)` на
  узкие через JOIN к meetings.user_id. Пример:
  ```sql
  DROP POLICY "Allow update events" ON public.events;
  CREATE POLICY events_update_owner ON public.events
    FOR UPDATE TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = events.garden_id AND m.user_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = events.garden_id AND m.user_id = auth.uid()
    ));
  -- аналогично для INSERT, DELETE
  ```
- **После phase 20:**
  - Ведущие могут редактировать ТОЛЬКО свои события через PATCH /events.
  - Никто другой не может переписать чужие события.
  - GRANT на authenticated остаётся (нужен для UPDATE через RLS).
  - ANOM-002/SEC-011 закрыта окончательно, не требует phase 21.
- **Verify-план:**
  - PATCH /events?id=eq.<свой> под mentor JWT → 204
  - PATCH /events?id=eq.<чужой> под mentor JWT → 0 строк затронуто
    (RLS отбивает молча, не 403; PostgREST показывает 0 rows)
  - DELETE /events?id=eq.<чужой> под mentor JWT → 0 строк затронуто
- **Альтернативный путь (архитектурный, отдельный таск):** переделать
  фронт, чтобы UPDATE'ы шли в meetings (а не в events), и trigger
  sync_meeting_to_event делал работу под gen_user. Тогда GRANT/RLS
  на events можно вообще закрыть. Это больше работы (frontend), но
  чище.
- **Связано:** ANOM-002/SEC-011 (parent), phase 18, phase 19.

### BUG-MEETINGS-COVER-UPLOAD: race между async upload и Save в редакторе события
- **Статус:** 🔴 TODO
- **Приоритет:** P2 (реальный пользовательский блокер — ведущие не могут сохранить событие, если торопятся)
- **Создано:** 2026-05-04 (зафиксировано на ведущей в проде)
- **Контекст (views/MeetingsView.jsx:799-840):**
  - Когда юзер выбирает файл обложки, фронт делает два действия
    параллельно:
    1. Сразу: `setFormData(prev => ({..., cover_image: e.target.result }))` —
       это base64 data URL, мгновенный preview.
    2. Async: upload файла в storage (через `/storage/sign` presigned
       URL endpoint, см. STORAGE_SIGN_PATHS в dataService.js:162) →
       по завершении `setFormData(prev => ({..., cover_image: url }))` с
       финальной HTTPS-ссылкой.
  - При нажатии «Сохранить» валидация (line 801) проверяет: если
    `cover_image` начинается с `data:` — значит upload не завершился,
    показывает alert «Обложка (загрузка не завершена — нажмите
    Загрузить фото снова)».
- **Симптом:** валидация сработает в двух случаях:
  1. **Race:** юзер быстро нажимает Save, не дождавшись завершения
     upload'а. Лечится ожиданием 10-15 сек перед Save.
  2. **Реальный fail upload'а:** /storage/sign endpoint возвращает
     ошибку, или сетевой сбой — data URL остаётся навсегда, при
     любом Save та же ошибка.
- **Что нужно сделать:**
  - **UI-фикс:** блокировать кнопку «Сохранить» во время активного
    upload'а (показывать loader / progress bar), не давать юзеру
    нажимать Save до получения финальной ссылки.
  - **UX:** если upload падает — показать ошибку прямо в форме
    (а не оставлять data URL в state без видимого сигнала).
  - **Не использовать native alert()** — то же замечание как в
    BUG-LOGIN-RAW-ERROR-MSG, заменить на inline-сообщение.
- **Связано:** BUG-LOGIN-RAW-ERROR-MSG (общий паттерн «убрать
  native alert»), services/dataService.js:162 (STORAGE_SIGN_PATHS).
- **NB:** Phase 18 проверена — она не виновата. Edit события идёт
  через таблицу `meetings` (full CRUD у authenticated сохранён),
  events пишется trigger'ом sync_meeting_to_event под owner-ролью.

### BUG-LOGIN-RAW-ERROR-MSG: alert(JSON.stringify) показывает PostgREST raw JSON юзеру
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

### BUG-HOMEWORK-PASTE-MSO: при копировании ДЗ из Word в форму вставляется HTML-мусор Office
- **Статус:** 🔴 TODO
- **Приоритет:** P2 (реальная проблема ученика — текст ДЗ перемешивается с MSO-стилями)
- **Создано:** 2026-05-04 (зафиксировано Еленой Курдюковой через Telegram)
- **Контекст:** Когда студент копирует ответ ДЗ из Word/Office-документа
  в HomeworkInlineForm, в payload попадает не только текст, но и весь
  Office HTML-мусор: `<!-- /* Font Definitions */ @font-face`, MSO-стили
  (`mso-font-family`, `mso-style-parent`, `mso-pagination` и т.п.),
  `<style>` блоки, классы `MsoNormal`. Студент видит этот мусор в
  превью/после reload.
- **Текущее состояние:** в `utils/pvlHomeworkAnswerRichText.js`
  существует `sanitizeHomeworkAnswerHtml` (известна по разведке
  ARCH-002), но она MSO-паттерны не вычищает.
- **Где вмешиваемся:**
  - Расширить `sanitizeHomeworkAnswerHtml` — стрипать `<!--...-->` 
    HTML-комментарии, `<style>...</style>` блоки, любые CSS-свойства
    `mso-*`, классы `Mso*`, conditional comments `<!--[if mso]>...`.
  - Вариант лучше — обработка на paste-event'е в форме (DOM event handler):
    инстант-очистка перед попаданием в state. UX выигрывает: студент
    сразу видит чистый текст.
  - Минимум: cleanup на submit (через extended sanitizer). UX чуть
    хуже (грязно в превью до save), но безопасно для данных.
- **Acceptance:** студент копирует абзац из Word → в форме чистый
  текст без `<!-- @font-face`, без `mso-*`, без классов `MsoNormal`.
  После save → reload → текст на месте.
- **Связано:** ARCH-002 (родитель — реализация ДЗ persist), 
  utils/pvlHomeworkAnswerRichText.js, views/pvlLibraryMaterialShared.jsx
  (HomeworkInlineForm).

### BUG-TOGGLE-USER-STATUS-GHOST-COLUMN: фронт PATCH'ит несуществующее поле profiles.access_status
- **Статус:** 🟢 DONE (2026-05-06, fixed in commit aead805 — `access_status` убран из тела PATCH в `services/dataService.js` в рамках FEAT-002 этап 3; PGRST204 больше не возникает)
- **Приоритет:** P3 (косметический — поле игнорируется PostgREST'ом, но захламляет код)
- **Создано:** 2026-05-04 (обнаружено при FEAT-013 разведке)
- **Контекст:** В `services/dataService.js:1571-1579` функция
  `toggleUserStatus` отправляет PATCH с двумя полями:
  ```
  body: { status: newStatus, access_status: accessStatus }
  ```
  Колонки `profiles.access_status` в БД сейчас НЕТ (она появится только
  после миграции 21, которая не применена). PostgREST либо тихо
  игнорирует unknown column, либо отдаёт ошибку, которую фронт глушит.
- **Симптом:** не виден пользователю, но:
  - Каждый PATCH в `toggleUserStatus` шлёт лишний payload, который
    игнорируется.
  - При логировании / debug ошибок может вылезать non-blocking warning.
  - Когда миграция 21 будет применена, поведение станет полу-определённым
    (фронт начнёт писать `access_status`, который ожидает определённые
    enum-значения — нужна синхронизация с миграцией 21).
- **Решение в Пути A FEAT-013:** убрать `access_status` из тела PATCH,
  пока миграции 21 нет. Когда миграция 21 применится — отдельным
  таском вернуть поле + согласовать enum-значения.
- **Связано:** FEAT-013, services/dataService.js:1571-1579, миграция 21.

### BUG-ADMIN-DELETE-USER: невозможно удалить пользователя из админки Garden
- **Статус:** 🟢 DONE (2026-05-07)
- **Приоритет:** P2 (был; теперь закрыт)
- **Создано:** 2026-05-06
- **Закрыто:** 2026-05-07
- **Корневая причина (verified read-only под gen_user):**
  - На `public.profiles` отсутствовала RLS-policy `FOR DELETE`
    (есть только insert_own, select_authenticated, update_own,
    update_admin). GRANT DELETE для authenticated был, но без
    policy RLS режет любой DELETE до 0 rows → silent no-op.
  - Дополнительно: `postgrestFetch` в `services/dataService.js`
    падал на HTTP 204 No Content (попытка `response.json()`
    на пустом теле бросала `SyntaxError`). Этот баг был
    латентным для `deleteShopItem` и других DELETE без
    `returnRepresentation`.
- **Решение:**
  1. **Phase 24 миграция** —
     `migrations/2026-05-07_phase24_admin_delete_user_rpc.sql`.
     RPC `public.admin_delete_user_full(uuid)` SECURITY DEFINER:
     проверка `is_admin()`, audit-запись BEFORE delete, удаление
     в порядке «дети → родители» (meetings → pvl_direct_messages →
     pvl_garden_mentor_links → pvl_students → users_auth →
     profiles). Учитывает FK-карту: `meetings.user_id` без
     CASCADE удаляется первым; pvl_audit_log/homework_status_history
     остаются как audit-trail (orphan-actor by design).
  2. **204-guard в `postgrestFetch`** — добавлено
     `if (response.status === 204) return { data: null }`
     перед `response.json()`. Generic-фикс, лечит и наш RPC,
     и латентные DELETE-flows.
  3. **UI refetch** — `views/AdminPanel.jsx` после успешного
     RPC дёргает `onRefreshUsers()` (вместо тоста «обновите
     страницу»). Тосты для forbidden / null / прочих ошибок.
- **Smoke (Claude in Chrome, Ольга, 2026-05-07):**
  - Smoke 1 (после commit `9fddae4`) — backend OK (POST RPC
    → 204, профиль удалён в БД), но refetch не срабатывал —
    ловили `SyntaxError: Unexpected end of JSON input` в Console
    (тот самый 204-bug в `postgrestFetch`).
  - Smoke 2 (после commit `f57d087`, 204-guard) — успех 5/5,
    Лена Ф удалена через UI, список обновился без F5.
- **Коммиты:** `9fddae4` (RPC + AdminPanel + UI refetch + миграция
  phase 24) + `f57d087` (204-guard в postgrestFetch + удаление
  кнопки «Смотреть запись» в PvlCalendarBlock).
- **Артефакты:** `migrations/2026-05-07_phase24_admin_delete_user_rpc.sql`,
  `services/dataService.js` (deleteUser → POST RPC + 204-guard),
  `views/AdminPanel.jsx` (refetch + читаемые тосты).
- **Связано:** CLEAN-013 (Лена Ф удалена через этот RPC),
  ARCH-014 (контрактные FK на 3 таблицах — orphan-риск
  отдельной задачей), PROD-005 (soft-delete vs hard-delete
  для будущих реальных пользователей).

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

### BUG-PVL-COHORT-NULL-OVERWRITE: ensurePvlStudentInDb перетирает cohort_id/mentor_id в null
- **Статус:** 🟢 DONE (2026-05-08, commit `7c28ed3`)
- **Приоритет:** P2
- **Создано:** 2026-05-07
- **Закрыто:** 2026-05-08
- **Решение:** гибрид (вариант A+B плана `_08`). `ensurePvlStudentInDb`
  резолвит `cohort_id` через `seedCohortIdToSqlUuid(profile.cohortId)` и
  `mentor_id` через `uuidOrNull(profile.mentorId)`; передаёт в payload
  **только если резолвинг даёт валидное значение**. PostgREST с
  merge-duplicates на не-переданные поля сохраняет существующее
  значение в БД нетронутым. Backfill не регрессирует.
- **Lesson:** [`docs/lessons/2026-05-08-pvl-cohort-null-overwrite.md`](../docs/lessons/2026-05-08-pvl-cohort-null-overwrite.md).
- **Артефакты сессии:** `docs/_session/2026-05-08_07_..._08` (recon → план).
- **Связано:** ARCH-012 (общая ARCH-задача убрать клиентский self-heal),
  `BUG-PVL-ENSURE-RESPECTS-ROLE` (новый тикет — fix не покрывает попадание
  admin/mentor/intern в pvl_students).

### BUG-PDF-EXPORT-OKLAB-FAIL: экспорт PDF в Builder падает «unsupported color function oklab»
- **Статус:** 🔴 TODO
- **Приоритет:** P2
- **Создано:** 2026-05-11 (фиксация по скриншоту Ольги 10 мая;
  bug проявляется в BuilderView → «Экспортировать PDF»)
- **Симптом:** при клике «Экспортировать PDF» в Конструкторе
  пользователь видит alert «Ошибка при создании PDF».
  В DevTools console — `Attempting to parse an unsupported color
  function "oklab"`. PDF не скачивается.
- **Корневая причина:** Tailwind v4 в production использует CSS
  `color()` function с `oklab(...)` для расчёта цветов
  (`text-slate-800`, `bg-emerald-50` и пр.). Текущая версия
  `html2canvas` (см. `package.json`) не поддерживает `oklab()` в
  CSS values — бросает при попытке парсинга.
- **Почему MON-001 не ловит:** ошибка caught внутри
  `handleExportPdf` в [`views/BuilderView.jsx`](../views/BuilderView.jsx)
  (try/catch вокруг `await html2canvas(...)`), пользователь
  видит alert, но это **не uncaught exception** → reporter молчит.
- **Решения (выбрать в recon-сессии):**
  - **A. Обновить html2canvas.** Проверить, есть ли версия с
    поддержкой `oklab()` (или patch'и в issue tracker'е). Может
    оказаться v2.x в beta.
  - **B. Конвертация цветов перед export.** Перед `html2canvas`
    клонировать DOM-узел, рекурсивно пройти computed styles, для
    каждой `oklab(...)`-цены — пересчитать в RGB через
    `getComputedStyle(...).color` уже отрендеренного браузером
    (браузер сам обрабатывает oklab). Подменить inline style на
    rgb-результат. Сложнее, но без зависимостей.
  - **C. Print-friendly CSS.** Завести параллельную стилизацию
    `print:bg-*` и т.п. для export-блока, использующую только
    RGB-цвета. Дешевле, но требует поддержки в каждом UI-блоке,
    который попадает в PDF.
- **Влияние:** функция «Экспорт PDF» в Builder неработоспособна
  для всех ведущих, которые её пробовали (ноль PDF за весь май).
  Не блокирует основной flow — пользователи могут делать скриншот
  или копировать текст.
- **Связано:**
  - `views/BuilderView.jsx` `handleExportPdf` (line ~247).
  - `package.json` html2canvas ^1.4.1 (старая, oklab не поддерживает).
  - `tailwind.config` / Tailwind v4 (генерирует oklab при build).
  - MON-001 (object lesson: caught error не алертит, нужен явный
    `reportClientError` в catch'е, если хочется наблюдать через
    мониторинг).
- **Делается отдельным заходом**, не в Phase 2B.

### BUG-PVL-ADMIN-AS-MENTOR-EMPTY: учительская показывает «Список менти пуст» у admin'а
- **Статус:** 🟢 DONE (2026-05-11, Variant C + B applied)
- **Приоритет:** P2
- **Создано:** 2026-05-11 утром (жалоба Ирины Одинцовой, куратор Лиги).
- **Симптом:** Admin Ирина и потенциально другие admin/mentor
  при первом заходе в учительскую ПВЛ видели «Список менти пуст»
  вместо своих 3-4 студенток. У Ирины через ~2 часа без её
  действий список появился сам.
- **Root cause:** Race condition между **async**
  `syncPvlActorsFromGarden` и **синхронным** первым render'ом
  `MentorMenteesPanel` / `MentorDashboard`. useMemo для
  `menteeRows` зависел только от `[mentorId, refreshKey]` —
  когда sync завершался и `db.mentorProfiles[*].menteeIds`
  заполнялся, deps не менялись → пересчёта не происходило.
  Background re-render от Supabase Realtime websocket в Сообщениях
  случайно триггерил пересчёт через 1-2 часа.
- **Fix:**
  - **Variant C** — добавить deps на флаги завершения sync:
    `db._pvlGardenApplicantsSynced`, `db.mentorProfiles.length`,
    `db.studentProfiles.length` в useMemo обоих компонентов.
  - **Variant B (бонус)** — `reportClientError` (MON-001) в три
    критичных catch'а в `services/pvlMockApi.js`:
    `hydrateGardenMentorAssignmentsFromDb` catch,
    `syncTrackerAndHomeworkFromDb` catch, top-level
    `syncPvlActorsFromGarden` catch. Caught errors теперь
    видны в TG как `🚨 Garden client error / hydrate_mentor_links
    failed (caught)` и т.п. — больше silent fails.
- **Параллельный cleanup:** orphan запись в `pvl_garden_mentor_links`
  (`student_id=579a3392-...`) удалена (ничего не существует в
  `profiles` / `users_auth` / `pvl_students`) — связано с
  TECH-DEBT-FK-CONTRACTS (нет FK на student_id → orphan возможен).
- **Lesson:** [`docs/lessons/2026-05-11-pvl-admin-mentor-race-condition.md`](../docs/lessons/2026-05-11-pvl-admin-mentor-race-condition.md).
- **Артефакты сессии:** `docs/_session/2026-05-11_01..._04`.
- **Связано:**
  - `CLEAN-015-SUPABASE-REMOVAL` — был блокер на CLEAN-015
    (Supabase Realtime случайно прятал race). Теперь снят.
  - `TECH-DEBT-PVLMOCK-MIGRATE` — долгосрочно перевести
    `pvlDomainApi.db` на observable pattern (zustand /
    useSyncExternalStore) и убрать race структурно.
  - `MON-002-CROSSORIGIN-VISIBILITY` — попутно завели после
    наблюдения «Script error.» без stack в TG.
  - `PERF-002-LAZY-JSPDF` — попутно завели (jspdf 385 KB
    можно lazy-import в `handleExportPdf`).

### BUG-PVL-MENTOR-DASHBOARD-WIDGET-VS-SIDEBAR-MISMATCH

- **Статус:** 🔴 TODO
- **Приоритет:** P3
- **Симптом:** Виджет «Мои менти» на дашборде ментора показывает
  «Список пуст» у того же ментора, у которого в sidebar-разделе
  «Мои менти» данные есть. Зафиксировано в smoke 2026-05-11 на
  тестовом аккаунте zobyshka@gmail.com (МЕНТОР): дашборд = пусто,
  sidebar = Настина фея.
- **Гипотеза:** виджет дашборда читает только из
  `mentorProfile.menteeIds`, sidebar-раздел — через
  `studentProfiles[].mentorId === resolved`. Источники должны
  быть согласованы в `applyGardenMentorLinkRow` (pvlMockApi.js:984),
  но один из них не наполняется в каких-то edge cases.
- **Не блокер** — это neuance в дашборде, основной flow ментора
  (sidebar → менти) работает после race-fix.
- **Когда:** при следующей session по pvl-учительской или вместе
  с TECH-DEBT-PVLMOCK-MIGRATE.
- **Связано:** BUG-PVL-ADMIN-AS-MENTOR-EMPTY (DONE),
  TECH-DEBT-PVLMOCK-MIGRATE.

Заведено: 2026-05-11.

### MON-002-CROSSORIGIN-VISIBILITY: «Script error.» без stack в TG
- **Статус:** 🔴 TODO
- **Приоритет:** P2
- **Создано:** 2026-05-11 (после жалобы Ирины — попутное наблюдение
  в TG-канале `@garden_grants_monitor_bot`)
- **Симптом:** В TG приходят алерты `🚨 Garden client error /
  Script error.` без stack/source/url-деталей. Несколько таких
  за утро 11.05 от анонимных пользователей.
- **Root cause:** Браузер скрывает детали JS-ошибок от cross-origin
  скриптов (без `crossorigin="anonymous"` атрибута + CORS
  заголовка `Access-Control-Allow-Origin` на стороне сервера).
  Наш bundle живёт на `liga.skrebeyko.ru/assets/*`, но `<script>`
  тэг в `index.html` не имеет `crossorigin` → `window.onerror`
  получает обобщённое «Script error.» без полезной информации.
- **Fix:**
  1. В `vite.config.js` (или `index.html` шаблоне) добавить
     `crossorigin="anonymous"` для `<script type="module">`.
     В Vite это включается через `build.rollupOptions.output.crossOrigin: 'anonymous'`
     либо через post-processing `index.html`.
  2. На статике hightek.ru (nginx) — добавить header
     `Access-Control-Allow-Origin: *` для `/assets/`. Возможно
     через тикет, как INFRA-004.
  3. Verify: после деплоя реальная ошибка от bundle должна
     приходить в TG с **полным stack'ом** и читаемым source.
- **Влияние:** без этого fix'а MON-001 видит ~30% детально и ~70%
  как «Script error.» — мониторинг частично слепой.
- **Когда:** после Phase 2B, не блокер.
- **Связано:** MON-001 (DONE), INFRA-004 (CORS-настройка hightek.ru).

### PERF-002-LAZY-JSPDF: jspdf грузить только при клике «Экспорт PDF»
- **Статус:** 🔴 TODO
- **Приоритет:** P3
- **Создано:** 2026-05-11 (после Phase 2A baseline-аудита — `_08`).
- **Что:** В Phase 2A html2canvas (201 KB) вынесли из main через
  `await import('html2canvas')` в `handleExportPdf`. Но **jspdf
  (385 KB raw)** всё ещё статически импортируется в начале
  `views/BuilderView.jsx` (`import { jsPDF } from 'jspdf'`) →
  попадает в BuilderView lazy-chunk целиком.
- **Fix:** заменить статический `import { jsPDF } from 'jspdf'`
  на `const { jsPDF } = await import('jspdf')` внутри
  `handleExportPdf` (или общую `loadPdfDeps()` helper, которая
  параллельно тянет html2canvas + jspdf через `Promise.all`).
- **Эффект:** BuilderView-chunk уменьшится на ~385 KB raw / ~126
  KB gzip → быстрое первое открытие Конструктора (без PDF-flow).
  PDF-flow прибавит ~600мс на первой загрузке html2canvas + jspdf,
  потом — мгновенно (кэш).
- **Связано:** Phase 2A (html2canvas сделан аналогично), Phase 2B
  (можно сделать заодно в одном PR).

### BUG-ROLLUP-DCE-SYNC-TRACKER

- **Статус:** 🔴 TODO (recon)
- **Приоритет:** P2
- **Симптом:** `syncTrackerAndHomeworkFromDb` (services/pvlMockApi.js:1261)
  удалена rollup'ом из prod-bundle. Reporter в её catch'е не доходит до dist.
- **Что проверить:**
  - Запустить `vite build --mode development` (unminified) — есть ли там вызов.
  - Если есть в dev → minify/DCE-bug.
  - Если нет даже в dev → проверить статическое условие
    (`pvlPostgrestApi.isEnabled() && pvlTrackMembers.length > 0`?).
- **Влияние:** студенты могут не получать актуальный tracker/submissions
  при первой загрузке. Работает ли через `syncPvlRuntimeFromDb` (line 8046)
  как fallback — не выяснено.
- **Не блокер сегодня** — race fix Ирины применён независимо. Recon
  отдельным заходом, ~30 мин.
- **Открыто:** 2026-05-11 при apply Variant B для race-fix.

### BUG-PVL-ENSURE-RESPECTS-ROLE: ensurePvlStudentInDb не проверяет роль
- **Статус:** 🔴 TODO
- **Приоритет:** P2
- **Создано:** 2026-05-08 (после cleanup'а 5 не-студенческих записей —
  commit `e3a992f`)
- **Контекст:** [`services/pvlMockApi.js:603-650`](../services/pvlMockApi.js#L603-L650) `ensurePvlStudentInDb`
  при любом write-callsite (`persistContentProgressToDb`,
  `markChecklistItem`, `persistTrackerProgressToDb`, `persistSubmissionToDb`,
  и др. — 8 callsite'ов) делает upsert в `pvl_students` без проверки
  роли пользователя. Гейт `pvlRole !== 'admin'` (ARCH-012 hotfix)
  спасает от menter/student, но **сам admin** триггерит upsert при
  каждом своём заходе в PVL-учительскую с любой write-операцией.
  В результате admin/intern/mentor (если он admin совмещает) попадают
  в `pvl_students` как фейк-студенты.
- **Реальное проявление 2026-05-08:** в `pvl_students` обнаружено 5
  не-студенческих записей: 1 admin (Зобнина), 1 intern (Ван), 2 mentor
  (Лузина, Гулякова), 1 тест-фикстура (Участница). Cleanup-миграция
  `cleanup_non_student_pvl_records` (commit `e3a992f`) почистила, но
  **корневая причина не устранена** — лишние снова появятся при
  заходах admin/mentor/intern.
- **Лечение (рекомендуемо):**
  - Добавить проверку `profile.role IN ('applicant', 'student', 'intern_with_pvl_track')`
    или whitelisting перед upsert. Список «допустимых» ролей — продуктовое
    решение.
  - Альтернатива (server-side defender): DB-trigger BEFORE INSERT на
    `pvl_students`, проверяющий `(SELECT role FROM profiles WHERE id =
    NEW.id)` и блокирующий не-студентов. Дороже по реализации, но
    защищает от любого клиента.
- **Why:** без фикса cleanup-миграции придётся повторять. Это
  системная проблема, не разовая.
- **Acceptance:**
  - admin/mentor (без `applicant`-роли) в PVL-учительской → upsert
    в `pvl_students` НЕ происходит.
  - applicant/student → запись создаётся с правильным `cohort_id`
    и `mentor_id` (см. `BUG-PVL-COHORT-NULL-OVERWRITE` — уже закрыт).
  - Smoke: Ольга / Настя / Ирина заходят в PVL → `pvl_students` count
    стабильный, не растёт.
- **Связано:** `BUG-PVL-COHORT-NULL-OVERWRITE` (closed 2026-05-08,
  родственный fix), ARCH-012 (общая задача убрать ensure-loop с клиента).
- **Smoking gun:** [`services/pvlMockApi.js:622-628`](../services/pvlMockApi.js#L622-L628) —
  `ensurePvlStudentInDb` self-heal upsert хардкодит `cohort_id: null`
  и `mentor_id: null` в payload `pvlPostgrestApi.upsertPvlStudent`.
  Через `Prefer: resolution=merge-duplicates` это перезаписывает
  существующие значения в `pvl_students` каждый раз когда админ
  заходит в учительскую и любой из 9 callsite'ов триггерит
  `ensurePvlStudentInDb`.
- **Реальный эффект 2026-05-07:** Все 22 активных студента имели
  `cohort_id IS NULL` к моменту recon'а phase 25. Backfill
  `migrations/data/2026-05-07_pvl_students_cohort_backfill.sql` (commit
  `7b832f1`) проставил `'11111111-…-101'` для всех 22, **но при
  следующем визите Ольги/Насти/Ирины в PVL backfill регрессирует**
  до фикса этого хардкода.
- **Лечение** — два варианта (выбрать на recon):
  1. **Убрать `cohort_id` и `mentor_id` из payload** упсёрта когда
     строка уже существует. Текущий `merge-duplicates` всегда
     перезаписывает поля payload'а; альтернатива — INSERT…ON
     CONFLICT DO NOTHING (не апдейтит вообще), либо отдельный
     SELECT перед upsert'ом для проверки существования.
  2. **Заменить null на корректную резолюцию:** `cohort_id =
     seedCohortIdToSqlUuid(profile.cohortId || 'cohort-2026-1')`,
     `mentor_id` — резолюция через `pvl_garden_mentor_links` или
     mock-domain mentor profile. Mapping `seedCohortIdToSqlUuid`
     уже есть в [`pvlMockApi.js:158-160, 187`](../services/pvlMockApi.js#L158-L160).
- **Why:** Без фикса любой ручной backfill cohort_id (или будущая
  ручная установка через psql) теряется при первом же визите
  админа. Это делает `pvl_students.cohort_id` непригодным как
  основа для FEAT-017 RPC.
- **Acceptance:**
  - После фикса: повторный backfill через psql даёт 22 строк с
    cohort_id, и через сутки активных визитов админа в PVL
    cohort_id остаётся.
  - Smoke: open admin AdminPanel → выйти → SELECT cohort_id из
    pvl_students → все 22 не NULL.
  - Связано с ARCH-012 (общая ARCH-задача убрать клиентский
    self-heal в пользу серверного flow).
- **Связано:**
  - phase 25 миграция (commit `66c7c0e`).
  - backfill (commit `7b832f1`).
  - cohort_id recon: [`docs/_session/2026-05-07_09_codeexec_cohort_id_recon.md`](../docs/_session/2026-05-07_09_codeexec_cohort_id_recon.md).
  - ARCH-012 (родительская архитектурная задача).
- **Оценка:** 1 короткая сессия. Recon уже сделан (Section 2 в `_09`),
  фикс — точечный edit в одном файле + smoke.

### FEAT-013: Пауза ведущей скрывает её встречи в публичном Meetings
- **Статус:** 🟢 DONE (2026-05-04, phase 21 migration applied + double smoke verified)
- **Приоритет:** P2
- **Создано:** 2026-05-04
- **Связан с:** [docs/REPORT_2026-05-04_pause_hides_meetings_recon.md](../docs/REPORT_2026-05-04_pause_hides_meetings_recon.md), [docs/DECISION_2026-05-04_pause_hides_meetings.md](../docs/DECISION_2026-05-04_pause_hides_meetings.md)
- **Суть:** Когда ведущая на паузе (`access_status='paused_manual'` или `'paused_expired'`),
  её встречи не должны появляться в публичном Meetings (meetings.skrebeyko.ru).
  При возврате на `active` — все встречи автоматически снова публикуются.
  Сами `meetings` не удаляются и не модифицируются.
- **Точки изменений (по разведке):**
  - **Триггер `sync_meeting_to_event`** ([migrations/14_schedule_city_contract.sql:42-162](../migrations/14_schedule_city_contract.sql#L42-L162))
    — добавить чтение `profiles.access_status` и условие: писать в `events` только
    если `access_status='active'`.
  - **Хук в `services/dataService.js:toggleUserStatus`** ([services/dataService.js:1571-1579](../services/dataService.js#L1571-L1579))
    или новый триггер на `profiles` (AFTER UPDATE OF access_status) — массово
    удалять/переинсертить зеркала в `events` для всех `meetings.user_id = <ведущая>`.
    Условие защиты: `WHEN NEW.access_status IS DISTINCT FROM OLD.access_status`.
- **НЕ трогаем:**
  - `meetings` (данные ведущей сохраняются как есть)
  - RESTRICTIVE-гарды на 13 таблиц (миграция 21) — смысл паузы не меняется
  - AdminPanel UI — кнопка ⏸ остаётся как есть
- **Acceptance:**
  - Ведущая на паузе → её встречи мгновенно (в течение 1–2 секунд) исчезают
    из `events` и из публичного Meetings.
  - Возврат с паузы → встречи появляются обратно.
  - Админы продолжают видеть все встречи в админских view (читают `meetings`,
    не `events`).
  - Внешние ссылки регистрации (Продамус) продолжают работать — это вне нашей
    зоны.
- **Риски / проверки перед мержем:**
  - Идемпотентность массового переинсерта при возврате (если миграция 14 будет
    менять формат `events` — учесть).
  - Если в момент паузы триггер на `profiles` пройдёт по 50+ встречам —
    проверить производительность.
  - Не должно сломаться при `paused_expired` (автопауза по подписке) —
    поведение симметрично `paused_manual`.

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

### FEAT-002: ВК-контакт ведущего в профиле Garden + кнопка «Связаться в ВК» в Meetings
- **Статус:** 🟢 DONE (2026-05-06 — все 4 этапа закрыты; meetings deploy 13:26 МСК, prod smoke 9/9 PASS)
- **Приоритет:** P3
- **Создано:** 2026-05-04
- **Прогресс:**
  - [x] Этап 1 — гигиена `profiles.telegram` + `meetings.payment_link` (2026-05-05)
  - [x] Этап 2 — phase 22: `profiles.vk` + `events.host_telegram/vk` + sync trigger (2026-05-05)
  - [x] Этап 3 — Garden фронт: VK-поле в форме профиля + required TG + автонормализация контактов + кнопка «ВКонтакте» на LeaderPageView + выпил auto-fill `payment_link` в MeetingsView (deploy 2026-05-06 18:36 UTC, commit aead805, smoke V1-V5 5/5 PASS)
  - [x] Этап 4 — meetings-сторона: на карточке события две кнопки контакта (TG + VK) в slate-pill стиле, старая «Записаться» удалена. Defence-in-depth XSS protection через `safeHref` helper с whitelist на `https://t.me/` и `https://vk.me/`. PR ligacreate/meetings#2, deploy 2026-05-06 13:26 МСК, prod smoke 9/9 PASS (Claude in Chrome + curl/PIN-grep/bundle-hash). Bundle delta +1.4 KB raw vs SEC_PINS base. Закрытые AUDIT findings этапа 4: P1-2 (XSS на href).
- **Метрики (за два цикла SEC_PINS + FEAT-002 этап 4):**
  - Bundle meetings: 2.4 MB → 664 KB → 515 KB на проде (gzip ≈166 KB).
  - 7 AUDIT findings закрыто (P0-1, P1-1, P1-2, P1-4, P1-5, P2-2, P2-8) + npm vuln `protocol-buffers-schema`.
- **Контекст:** Сейчас в профиле ведущего в Саду нет ссылки на ВК-профиль.
  В приложении Meetings на странице события есть кнопка
  «Зарегистрироваться» — её формулировка не отражает реальное действие
  (скорее всего ведёт в Телеграм для связи с ведущим). Ольга хочет
  явно разделить два канала контакта.
- **Подзадачи:**
  - **Garden — profiles:** добавить в схему профиля поле под VK-ссылку
    (если ещё нет колонки в `public.profiles` для социальных сетей —
    проверить; если есть `social_links` или подобное — переиспользовать,
    иначе DB-миграция + UI поля редактирования).
  - **Garden — UI:** показывать VK-ссылку в карточке/странице ведущего
    наряду с текущими каналами (телеграм, email).
  - **Meetings — UI:** на странице события добавить кнопку «Связаться
    в ВК» (использует ВК-ссылку ведущего из общей БД). Существующую
    кнопку «Зарегистрироваться» переименовать на формулировку,
    отражающую реальное действие («Связаться в ТГ» или подобное —
    зависит от того, что она реально делает; уточнить при работе).
- **Связано:** AUDIT-001 (code review meetings — заодно понять,
  где сейчас формируется кнопка «Зарегистрироваться» и как она
  устроена). При изменении схемы profiles — учесть RLS-policies
  (там USING auth.uid() IS NOT NULL для SELECT, добавление новой
  колонки policy не задевает).

### FEAT-014: Магазин в админке Сада — CRUD для shop_items
- **Статус:** 🔴 TODO
- **Приоритет:** P3 (QoL; не блокер прода, но снимает зависимость от разработческого цикла)
- **Создано:** 2026-05-06
- **Контекст:** Содержание магазина (`public.shop_items`) сейчас
  меняется только через прямой UPDATE/INSERT в БД (миграция или
  ручной psql). Ольга не может управлять ассортиментом
  самостоятельно. Нужен раздел в `views/AdminPanel.jsx` для
  CRUD на shop_items, по шаблону существующих admin-секций
  (knowledge_base / practices Admin — они уже работают).
- **Скоп:**
  1. Recon `shop_items` схемы + текущего рендера (где магазин
     показывается ведущим — `views/ShopView.jsx` или подобное).
  2. UI-секция в админке: список товаров + создание + редактирование
     + удаление + image upload + категории (если есть).
  3. Role-based access — только admin (использовать `is_admin()`
     helper из phase 17).
  4. Smoke в браузере: создать товар → отображается у ведущих →
     отредактировать → отображается обновление → удалить → пропадает.
- **Why:** Ольга оперативно меняет ассортимент без участия
  разработчика. Снижает зависимость от разработческого цикла.
- **Acceptance:**
  - В AdminPanel.jsx есть раздел «Магазин» с CRUD на shop_items.
  - Только admin могут открывать/изменять.
  - Image upload работает (через тот же flow, что avatar/cover
    в meetings).
  - Smoke проходит на проде.
- **Связано:** `views/AdminPanel.jsx`, миграции с `shop_items`,
  паттерн существующих admin-форм (knowledge_base / practices).
- **Оценка:** 1-2 сессии (recon + implement + smoke).

### FEAT-016: Выгрузка результатов домашек ПВЛ — особенно feedback по модулю
- **Статус:** 🟡 IN PROGRESS (фундамент готов 2026-05-07: phase 25 миграция)
- **Приоритет:** P2 (нужно регулярно после каждого модуля; сейчас выгрузка через psql вручную не масштабируется)
- **Создано:** 2026-05-06
- **Прогресс 2026-05-07:**
  - Code-recon executor'а: [`docs/_session/2026-05-07_02_codeexec_recon_feat016_017_report.md`](../docs/_session/2026-05-07_02_codeexec_recon_feat016_017_report.md)
  - DB-recon стратега: [`docs/_session/2026-05-07_03_strategist_db_recon.md`](../docs/_session/2026-05-07_03_strategist_db_recon.md)
  - Phase 25 миграция applied (commit `66c7c0e`) — добавлены поля `module_number` / `is_module_feedback` для структурного фильтра + `updated_at` для совместимости с триггером.
  - Backfill cohort_id (commit `7b832f1`) — 22 студента привязаны к когорте Поток 1.
- **Блокеры:** ⛔ нет. `BUG-PVL-COHORT-NULL-OVERWRITE` закрыт 2026-05-08
  (commit `7c28ed3`). Можно начинать следующей сессией. RPC
  `pvl_admin_progress_summary` готов, SQL-логика для CSV — расширение
  того же.
- **Контекст:** Каждый модуль курса ПВЛ заканчивается домашкой
  «обратная связь по модулю / по работе менторов / по материалам».
  Этот feedback — ключевой сигнал для развития курса. Сейчас данные
  лежат в `public.pvl_student_homework_submissions` (и связанных
  таблицах), но Ольга не может удобно их выгрузить — нужен либо
  CSV-экспорт через UI, либо отдельный endpoint/инструмент. Также
  полезна выгрузка ВСЕХ ДЗ для аналитики (не только feedback).
- **Скоп:**
  1. Recon схемы: `pvl_student_homework_submissions`,
     `pvl_homework_items`, `pvl_course_lessons`, связи студент ↔
     ментор ↔ когорта ↔ модуль. Понять, как идентифицировать
     «последнее ДЗ модуля» (метаданные на homework_item?).
  2. Продуктовое решение:
     - формат выгрузки (CSV, Excel, JSON?);
     - где запускать (кнопка в админке Garden? отдельная
       command-line утилита? нечто третье?);
     - какие фильтры (по когорте, по модулю, по студенту, по
       типу ДЗ?).
  3. Implement: либо UI-кнопка с CSV-download в `AdminPanel.jsx`
     (для всех ДЗ + опция «только feedback»), либо отдельный
     scripts/export_homework.sh, либо комбинация.
  4. Структура колонок CSV: студент, ментор, когорта, модуль,
     ДЗ, дата сдачи, статус, текст ответа, оценка/комментарии.
- **Why:** Ольга сможет аналитически смотреть feedback и
  динамику ДЗ без каждого раза просьбы разработчика. Сильно
  ускоряет цикл улучшения курса.
- **Acceptance:**
  - Из админки (или CLI) запускается выгрузка → файл со всеми
    ДЗ выбранной когорты в человеко-читаемом формате.
  - Опционально фильтр «только feedback по модулю».
  - Текст ответов сохраняется без потерь форматирования
    (особенно если хранятся как rich-HTML — `pvl_homework_answer_richtext`).
  - Smoke на проде с реальными данными текущего потока.
- **Связано:** `pvl_student_homework_submissions`, ARCH-002 (DB
  сохранение ДЗ — verified), `utils/pvlHomeworkAnswerRichText.js`
  (для unrich-извлечения текста). Возможно понадобится lesson о
  паттерне «sanitize HTML обратно в plain text для CSV».
- **Оценка:** 1-2 сессии после продуктового решения формата.

### FEAT-017: Дашборд прогресса студентов ПВЛ — кто где запаздывает по ДЗ
- **Статус:** 🟢 V1 DONE (2026-05-08). Дальнейшие визуализации — через `FEAT-017-V2-VISUALIZATIONS` (P3, накопительный).
- **Приоритет:** P2
- **Создано:** 2026-05-06
- **Закрыто V1:** 2026-05-08
- **Что сделано в V1:**
  - Новый таб `pvl-progress` в Garden AdminPanel (commit `0867aa6`).
    Sortable таблица студентов: ФИО / Ментор / hw_total / hw_accepted /
    hw_in_review / hw_revision / hw_not_started / hw_overdue /
    last_activity / state_line. Bage'ы по `state_line` (4 цвета),
    cohort-select из `pvl_cohorts`, фильтр по `state_line`,
    persisted cohortId в `sessionStorage`.
  - `GroupProgressBar` — горизонтальная stacked-полоска по группе
    (commit `377a148`).
  - Hidden-filter через `hiddenGardenUserIds` (commit `296cfb3`):
    скрытые «глазиком» в users-табе исчезают из дашборда +
    пересчитывают `totals` / `GroupProgressBar`.
  - Backend (закрыто 2026-05-07): RPC `pvl_admin_progress_summary`
    (`66c7c0e`) + backfill `cohort_id` (`7b832f1`).
- **Verified Ольгой 2026-05-08:** 13 строк после скрытия Настина фея.
- **Артефакты сессии:** `docs/_session/2026-05-08_10_..._12_..._15_..._17_...` (recon → план → apply).
- **Связано:** `BUG-PVL-COHORT-NULL-OVERWRITE` (закрыт 2026-05-08, был
  блокером), `CLEAN-013` (cleanup non-student'ов и partial 2026-05-08),
  `FEAT-017-V2-VISUALIZATIONS` (P3, будущие визуализации).

### FEAT-017-V2-VISUALIZATIONS: Дальнейшие визуализации Прогресса ПВЛ
- **Статус:** 🟡 IN PROGRESS (накопительный — Уровень 1 готов 2026-05-08)
- **Приоритет:** P3
- **Создано:** 2026-05-08
- **Контекст:** Накопительный тикет для добавления визуализаций к таблице
  «Прогресс ПВЛ» по мере того, как они становятся нужны. Не делать как
  одну большую V2-фичу, а добавлять элементами.
- **Готово:**
  - 🟢 [2026-05-08, commit `377a148`] **Уровень 1: GroupProgressBar** —
    горизонтальная stacked-полоска по группе (4 цвета: emerald/blue/
    rose/slate, согласовано с STATE_LINE_TONE).
- **Кандидаты на следующие уровни (когда возникнет нужда):**
  - **Heat-map студенты × недели** — глобальный обзор «кто отстал по
    каким неделям». Полезно перед демо-днями / контрольными точками.
  - **Per-module прогресс-полоски в строках** — мини-полоска в каждой
    строке таблицы вместо/в дополнение к числам. Использовать
    `module_progress` jsonb из RPC (там уже {done, total} по модулям).
  - **Sparklines** — 7-дневный/30-дневный график активности по студенту.
    Нужен `pvl_audit_log` агрегат — RPC расширение.
  - **Filter chips для drill-down** на ментора (когда менторов >= 2
    активных на одной когорте — см. `FEAT-017` open-questions).
- **Why:** Один взгляд → больше информации. Но риск визуального шума —
  добавлять только когда конкретный кейс назрел.
- **Acceptance (для каждого уровня):**
  - Один commit на уровень.
  - Визуализация не ломает sortable / hidden-filter / state-фильтр.
  - Smoke на проде с реальными данными.
- **Связано:** `FEAT-017` V1 (база), `pvl_admin_progress_summary` RPC.
- **Прогресс 2026-05-07:**
  - Code-recon: [`docs/_session/2026-05-07_02_codeexec_recon_feat016_017_report.md`](../docs/_session/2026-05-07_02_codeexec_recon_feat016_017_report.md)
  - DB-recon: [`docs/_session/2026-05-07_03_strategist_db_recon.md`](../docs/_session/2026-05-07_03_strategist_db_recon.md)
  - Phase 25 план: [`docs/_session/2026-05-07_05_codeexec_phase25_plan.md`](../docs/_session/2026-05-07_05_codeexec_phase25_plan.md)
  - **RPC `public.pvl_admin_progress_summary(p_cohort_id uuid)`** SECURITY DEFINER — applied (commit `66c7c0e`). Возвращает jsonb-массив объектов по студентам когорты: student_id / full_name / status / cohort_id / mentor_id / mentor_name / hw_total / hw_accepted / hw_in_review / hw_revision / hw_not_started / hw_overdue / last_activity / module_progress / state_line.
  - Backfill `pvl_students.cohort_id = '11111111-…-101'` для 22 студентов (commit `7b832f1`).
  - Apply-отчёты: [`_07_codeexec_phase25_apply_report.md`](../docs/_session/2026-05-07_07_codeexec_phase25_apply_report.md), [`_12_codeexec_backfill_apply_report.md`](../docs/_session/2026-05-07_12_codeexec_backfill_apply_report.md).
- **Блокер до frontend:** `BUG-PVL-COHORT-NULL-OVERWRITE` (P2) — без фикса хардкода в `pvlMockApi.js:622-628` backfill регрессирует.
- **Следующий шаг:** новый таб `pvl-progress` в `AdminPanel.jsx` (или новая admin-страница в учительской) с таблицей через `pvlPostgrestApi.callRpc('pvl_admin_progress_summary', { p_cohort_id })`.
- **Контекст:** Сейчас прогресс по ДЗ виден только точечно — ментор
  видит свою группу, Ольга вынуждена опрашивать. Нужен общий
  дашборд: по каждой студентке — кол-во сданных ДЗ / последняя
  активность / когорта / ментор / задержка по deadline. Для Ольги
  это инструмент управления, для менторов — быстрый обзор группы.
- **Скоп:**
  1. Recon схемы: `pvl_student_course_progress`,
     `pvl_student_homework_submissions`, `pvl_homework_items`
     (с deadline'ами?), `pvl_garden_mentor_links`,
     `pvl_cohorts`. Понять, есть ли deadline'ы в БД или их
     надо вычислять.
  2. Продуктовое решение:
     - где живёт дашборд (новая страница `views/PvlDashboardView.jsx`?
       или раздел в `AdminPanel.jsx` / в учительской?);
     - кому видно (Ольге = всё; ментору = только своя группа;
       студентке = только себе?);
     - какие срезы (таблица студент × ДЗ; график
       «студентки с просрочкой»; sortable по «последняя активность»).
  3. Implement: SQL view или агрегатные запросы через PostgREST
     RPC функции; UI-таблица с фильтрами.
  4. Подсветка проблемных кейсов (просрочка > 7 дней, неактивен
     > 14 дней, и т.п.).
- **Why:** Ольга и менторы видят картину группы за один взгляд;
  раньше реагируют на проблемы.
- **Acceptance:**
  - Страница (или раздел) с таблицей: студент, когорта, ментор,
    сдано-ДЗ / всего, последняя активность, статус-индикатор.
  - Фильтр по когорте, по ментору.
  - Sortable по любой колонке.
  - Доступ — admin видит всех, mentor видит свою группу.
  - Smoke на проде с реальными данными.
- **Связано:** PVL_RECONNAISSANCE.md раздел 2.4 (текущая
  архитектура учительской), ARCH-001 (связка ментор-ученик —
  закрыта), `pvl_student_course_progress`.
- **Оценка:** 2-3 сессии (recon + продуктовое решение + implement
  + smoke). Может быть больше, если потребуется новый SQL view
  или RPC функции.

### CONTRACT-GARDEN-MEETINGS-001: events.host_telegram NOT NULL и непуст
- **Статус:** 🔵 ACTIVE CONTRACT (документация, не TODO)
- **Приоритет:** P2 (видимость важна — нарушение ломает meetings-фронт)
- **Создано:** 2026-05-07 (источник: meetings-стратег, апдейт)
- **Контракт:** В таблице `public.events` поле `host_telegram`
  должно быть **непустое** для всех будущих событий
  (`event_starts_at > now()`). Meetings-фронт полагается на
  это инвариант: рендерит TG-кнопку без runtime-`if`-проверки.
- **Чем поддерживается:**
  1. **Phase 22 trigger** `sync_meeting_to_event` — при каждом
     INSERT/UPDATE meetings читает `profiles.telegram` и пишет
     в `events.host_telegram`. См.
     `migrations/2026-05-05_phase22_vk_field_and_event_contacts.sql`.
  2. **Phase 22 trigger** `on_profile_contacts_change_resync_events`
     — при UPDATE OF telegram, vk на profiles ресинкает все
     события этого пользователя.
  3. **Required-TG валидация** в Garden-форме профиля —
     `services/dataService.js` (FEAT-002 этап 3, commit `aead805`):
     пустой `profiles.telegram` блокирует save.
- **Импликации (для будущего стратега):**
  - При **изменении `sync_meeting_to_event`** (например, в рамках
    отложенной миграции 21 биллинга) — проверить, что
    `host_telegram` всё ещё пишется при каждом INSERT/UPDATE
    events. Иначе meetings-фронт сломается на новых событиях.
  - **При изменении схемы `events`** — поле `host_telegram` НЕ
    переименовывать и НЕ удалять без согласования с meetings-
    командой и одновременного фронт-релиза с обеих сторон.
  - **При снятии required-TG валидации** в Garden-форме —
    появятся профили без TG → их события сломают meetings-фронт.
    Нельзя без обсуждения.
- **Verify (на проде, под gen_user, read-only):**
  ```sql
  SELECT count(*) FROM public.events
  WHERE event_starts_at > now()
    AND (host_telegram IS NULL OR trim(host_telegram) = '');
  -- Ожидание: 0
  ```
  Регулярно — например, в составе weekly health-check, или
  как часть smoke после schema-changing миграций.
- **Acceptance:**
  - Verify-запрос всегда возвращает `0` для будущих событий.
  - Любое отклонение (>0) — сигнал к диагностике (профиль без
    TG / trigger не сработал / явный delete).
- **Связано:** FEAT-002 этап 4 (закрыт; meetings-фронт полагается
  на этот контракт), phase 22 миграция, BUG-MEETINGS-VK-BUTTON-OVERFLOW
  (связано с теми же двумя кнопками).

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

### CLEAN-014: удалить колонки meetings.payment_link + events.registration_link (legacy после FEAT-002)
- **Статус:** 🟢 READY TO START (FEAT-002 закрыт 2026-05-06, зелёный свет дан meetings-стратегом)
- **Приоритет:** P2 (повышен с P3 — фича закрыта, можно убирать legacy чисто)
- **Создано:** 2026-05-06 (после deploy FEAT-002 этап 3 в Garden)
- **Обновлено 2026-05-06:** FEAT-002 этап 4 закрыт (meetings deploy 13:26 МСК), `host_telegram`/`host_vk` стали основными каналами контакта на проде. Зелёный свет на cleanup. Meetings-стратег предлагает делать в одном PR с удалением `registration_link` из типа Event, **после 1-2 спринтов наблюдения** (когда CACHE_VERSION v4 у всех клиентов отстоится — иначе старые клиенты, не получившие новый бандл, могут остаться без CTA).
- **Скоп:**
  - grep по обоим репо (`garden`, `meetings`) на использование `payment_link` и `registration_link` — выписать все места.
  - В meetings: убрать поле `registration_link` из типа `Event` (TS), убрать из `?select=` запроса (`src/pages/Index.tsx`), убрать из рендеринга (если осталось).
  - `ALTER TABLE meetings DROP COLUMN payment_link` под `gen_user`.
  - `ALTER TABLE events DROP COLUMN registration_link` (после grep подтверждения, что нигде не читается).
  - Обновить `sync_meeting_to_event()` — убрать строку `registration_link = NEW.payment_link` из тела функции.
  - Обязательно `SELECT public.ensure_garden_grants();` в конце DDL-транзакции (RUNBOOK 1.3).
- **Условия запуска:** 1-2 спринта наблюдения после FEAT-002 этап 4 deploy (CACHE_VERSION v4 проотстаивается); затем grep чистый по обоим репо.
- **Связано:**
  - `docs/RECON_2026-05-04_feat002_data_hygiene.md` (зоопарк значений `payment_link`)
  - commit aead805 (FEAT-002 этап 3 — выпил auto-fill)
  - PR ligacreate/meetings#2 (FEAT-002 этап 4)
  - migration phase 22 (sync_meeting_to_event с расширенным телом)

### CLEAN-015-SUPABASE-REMOVAL

- **Статус:** 🔴 TODO
- **Приоритет:** P2
- **Контекст:** `@supabase/supabase-js` остался в `package.json`
  после миграции с Supabase на голый PostgREST. Стратег recon'нула
  2026-05-10 — пакет **живой**, импортируется в
  `services/realtimeMessages.js` (websocket subscription), который
  используется в `views/CommunicationsView.jsx` для real-time
  чата между ведущими.
- **Решение Ольги (2026-05-10):** real-time в Сообщениях не нужен.
  Заменяем websocket subscription на polling.
- **Шаги:**
  - [ ] Recon: посмотреть текущий flow `subscribeToMessages` в
    `realtimeMessages.js` + использование в `CommunicationsView.jsx`.
    Понять, какой PostgREST endpoint нужен (есть ли уже
    `GET /messages?after=<last_seen>` или нужен новый view).
  - [ ] Спроектировать polling: interval 5-10 сек (TBD по продуктовому
    ощущению), pause при `document.hidden` (tab неактивен), exponential
    backoff при ошибках, mark-as-read механизм сохранить.
  - [ ] Заменить `subscribeToMessages` на polling в
    `views/CommunicationsView.jsx`.
  - [ ] Удалить `services/realtimeMessages.js`.
  - [ ] Удалить `scripts/legacy/*.js` (4 файла:
    `dedupe_schedule_events.js`, `migrate_meetings.js`,
    `migrate_questions_notebooks.js`, `update_event_images.js`) —
    после удаления `@supabase` становятся 100% dead.
  - [ ] `npm uninstall @supabase/supabase-js` →
    обновить `package.json` + `package-lock.json`.
  - [ ] Build: проверить что Supabase chunks вылетели полностью
    (grep по `dist/assets/*.js` строк типа `@supabase/auth-js` —
    должно быть ноль).
  - [ ] Smoke: реальный продуктовый тест на двух устройствах (один
    пишет в Сообщения, второй видит через polling-окно). Регрессия
    Notification → проверить (если есть), regressions в Communications
    UI → проверить.
- **Влияние:**
  - −5.9 MB `node_modules/@supabase` (чище npm install в CI).
  - main bundle: всё что от Supabase осталось после Phase 2A
    tree-shake — уйдёт окончательно.
  - Bundle для Сообщений уменьшится ещё (websocket-libs выпадут).
  - UX-downgrade: моментальная доставка → задержка polling-interval.
    Решение Ольги — приемлемо.
- **НЕ удалять:** `browser-image-compression` — **живой**, в
  `services/dataService.js:6` для сжатия фото при upload. Не
  трогаем в этой задаче.
- **Когда делаем:** ПОСЛЕ Phase 2B (lazy MeetingsView /
  CommunicationsView / MarketView / LeaderPageView). Логика:
  если `CommunicationsView` станет lazy в Phase 2B, основная
  bundle-проблема Supabase на main изначально не существует, и
  CLEAN-015 ускоряется (нужно только заменить Realtime на polling
  внутри CommunicationsView, без ребалансировки main).
- **Бывший блокер (СНЯТ 2026-05-11):** `BUG-PVL-ADMIN-AS-MENTOR-EMPTY`
  (DONE) — Supabase Realtime в `realtimeMessages.js` случайно
  триггерил re-render и тем самым скрывал race condition в
  учительской ПВЛ (`MentorMenteesPanel` useMemo без deps на
  state-флаги sync). После CLEAN-015 (выпиливания Realtime → polling)
  race стал бы стабильным → admin'ы постоянно видели бы «Список
  пуст». Race-fix применён до CLEAN-015 — теперь блокер снят, можно
  безопасно выпиливать Supabase.
- **Связано:** `INFRA-005-SW-CACHE` (RESOLVED), `Phase 2A` (DONE,
  bundle baseline снят), `Phase 2B` (TODO).
- **Дата завода:** 2026-05-10.

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

### MON-001: Client-side error reporter → @garden_grants_monitor_bot
- **Статус:** 🟢 DONE (2026-05-10)
- **Приоритет:** P1
- **Решение:** свой reporter вместо Sentry — `window.error` /
  `unhandledrejection` / `ErrorBoundary.componentDidCatch` шлют
  payload на `auth.skrebeyko.ru/api/client-error` → Telegram-канал
  `@garden_grants_monitor_bot` (тот же бот, что у SEC-014
  `check_grants.sh`). Без внешних SaaS, креды и инфра
  переиспользуются.
- **Frontend:**
  - `utils/clientErrorReporter.js` — POST с keepalive, локальный
    rate-limit 60s/ключ через `sessionStorage` (макс 50 уник.
    ключей в сессии), антирекурсия через `inFlight`-flag.
  - `main.jsx` — `installGlobalErrorHandlers()` ДО
    `createRoot.render` (ловит ошибки React init).
  - `components/ErrorBoundary.jsx` — `reportClientError` в
    `componentDidCatch`.
  - `vite.config.js` — `define.__BUILD_ID__` =
    `process.env.GITHUB_SHA || BUILD_ID || YYYYMMDDHHMMSS`. На
    GitHub Actions подставляется full SHA коммита (подтверждено
    smoke: payload.bundleId = `4ae645bda5dbd2a026871dbe9afb7f9538802a4d`).
- **Backend (`/opt/garden-auth/server.js`):**
  - `POST /api/client-error` — валидация + per-IP rate-limit
    (60s окно дедупа + 50/час потолок) + лог-line в
    `/var/log/garden-client-errors.log` (audit-trail) + отправка
    в TG.
  - `GET /api/health` — простой ok-response без DB-зависимости
    (для post-deploy smoke).
  - **Сетевая особенность:** TG-fetch через
    `https.request({ family: 4 })` (см. INCIDENT-2026-05-10-tg-blackbox).
  - logrotate weekly × 8.
- **CI (`.github/workflows/deploy.yml`):**
  - Post-FTP smoke: `<title>` + bundle URL доступны →
    отлавливает FTP-truncate.
- **Smoke (Ольга через Claude in Chrome, 2026-05-10):**
  - 3 throw'a → 3 TG-сообщения с разными timestamp в message;
  - frontend dedup проверен на одинаковом message;
  - bundle на проде `index-4OpZcjJF.js` ≠ старый T_WhJoLY
    (BUILD_ID = full SHA подтверждён).
- **Backend deploy:** через ssh root@5.129.251.56 (без локального
  репо `garden-auth` — он отстал от прода). Backup
  `/opt/garden-auth/server.js.bak.2026-05-10-pre-mon001`.
- **Артефакты сессии:** `docs/_session/2026-05-10_02..._06`
  (стратег↔executor переписка по P1-связке).
- **Коммиты:**
  - `eb8dd70` — frontend reporter (MON-001).
  - `5ef8488` — post-deploy smoke check.
  - `aba8384` — _session переписка P1 backend deploy.
  - `4ae645b` — backlog (daily wipe + TG blackbox + auth backups).
- **Связано:** SEC-014 (тот же TG-канал и `check_grants.sh`-style
  alerts); INFRA-005 (закрыт без hardening, ждём первого
  MON-001-инцидента).

### TEST-001: Базовое тестирование
- **Статус:** 🔴 TODO
- **Контекст:** В проекте нет тестов вообще. Хотя бы smoke
  tests на критичные потоки (login, регистрация, открытие
  курса).

### INFRA-002: Удалить мёртвый public/.htaccess в meetings (nginx, не Apache)
- **Статус:** 🔴 TODO
- **Приоритет:** P3 (не критично, но стоит убрать)
- **Создано:** 2026-05-06 (по итогу SEC_PINS Variant A apply meetings)
- **Контекст:** В репо meetings лежит `public/.htaccess` (для
  Apache), но прод-сервер использует nginx → файл игнорируется.
  Мёртвый конфиг. Сейчас не критично (HashRouter не использует
  deep-paths), но потенциально:
  - любой `/<deep-path>` URL возвращает 404 от nginx без
    fallback'а на index.html;
  - если когда-то перейдём на BrowserRouter (для SEO / sharing
    deep links) — блокер;
  - пересекает NB-RESTORE Вариант 2 (планировался Caddy/Apache
    Basic Auth) — переформулировать под nginx, если этот
    вариант когда-нибудь будет рассматриваться.
- **Скоп:**
  1. Удалить `public/.htaccess` из meetings репо.
  2. Если нужна fallback-логика SPA (catchall на index.html)
     → добавить в nginx server-config:
     `try_files $uri $uri/ /index.html;`
- **Why:** уборка мёртвого конфига; защита от внезапного
  выбора BrowserRouter в будущем без обновления nginx.
- **Acceptance:**
  - `public/.htaccess` удалён из meetings.
  - Если решено настраивать SPA fallback → nginx-config
    обновлён + smoke на любом deep-path URL → отдаёт index.html.
- **Связано:** AUDIT meetings 2026-05-06 (отчёт meetings-стратега),
  NB-RESTORE Вариант 2 (если когда-то рассмотрим — переформулировать
  под nginx).
- **Оценка:** 30 мин (если просто удалить); 1-2 часа если
  нужна nginx-конфигурация для SPA fallback.

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

### INFRA-004: cache-headers index.html — слишком агрессивный max-age
- **Статус:** 🟢 DONE (2026-05-08)
- **Приоритет:** P1 (был, повышен 2026-05-07 после реального проявления)
- **Создано:** 2026-05-07
- **Закрыто:** 2026-05-08
- **Решение:** через тикет в hightek.ru support (хостинг — чистый
  nginx без Apache, `.htaccess` не парсится, Path B в Path C через
  ISPmanager-панель тоже не сработал — нет полей для custom-директив).
  Hightek.ru применили nginx-fix: `Cache-Control: no-cache` для
  `index.html`, `Cache-Control: public, immutable, max-age=31536000`
  для `/assets/*`. Verified curl: index.html → no-cache, /assets/*.js →
  immutable.
- **Plus** временный workaround commit `2228f70` —
  `<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">`
  + `<meta http-equiv="Pragma" content="no-cache">` в `index.html` как
  defense-in-depth. Можно оставить.
- **Артефакты сессии:** `docs/_session/2026-05-08_01..._06` (recon →
  Path B `.htaccess` → Path C ISPmanager → meta-tags workaround → тикет).

### INFRA-005-SW-CACHE: SW agressive caching как причина ChunkLoadError у Марины
- **Статус:** 🟢 RESOLVED-as-no-action (2026-05-10)
- **Приоритет:** P2 (был, при заведении выглядел реальной угрозой)
- **Создано:** 2026-05-09 (после жалобы Марины на ChunkLoadError
  без возможности достать stack-trace)
- **Закрыто:** 2026-05-10 (recon показал — текущий sw.js не
  кэширует bundles; гипотеза «зомби-SW» не подтвердилась)
- **Recon (2026-05-10):**
  - `git log -- public/sw.js` — две версии в истории, обе **без**
    перехвата bundle-запросов:
    - `8bb03bf` (2026-05-03): только install/activate/push/notificationclick.
    - `bf57606` (2026-05-03): + `caches.delete` всех ключей на
      activate + network-first для navigate.
  - `fetch` listener никогда не делал `caches.put` для
    `assets/index-*.js` → агрессивного кэша bundle'ов **не было**.
- **Решение:** не делаем hardening (kill-switch / версионирование
  sw.js) без живой жертвы. Реальную причину ChunkLoadError у
  Марины достанем через MON-001, когда первый stack прилетит в
  TG-канал. Тогда станет ясно — SW, FTP-truncate, hash-collision
  или что-то третье.
- **Why no-action:** «один раз сделать правильно, не три раза
  переписывать SW по гипотезам». Текущий `sw.js` корректен.
- **Связано:** MON-001 (даст stack для первого реального
  ChunkLoadError); BUG-004 (тот же класс симптомов, закрыт в
  2026-05-03 commit `bf57606`).
- **Артефакты:** `docs/_session/2026-05-10_03_codeexec_p1_apply_report.md`
  (раздел «Recon INFRA-005»).

### PROD-DB-MIGRATE-ISPMANAGER: миграция БД с Timeweb Cloud на ISPmanager-shared
- **Статус:** 💡 IDEA (не TODO — для запоминания)
- **Приоритет:** P3 (стратегическая идея)
- **Создано:** 2026-05-08
- **Идея от Ольги:** рассмотреть миграцию БД с Timeweb Cloud managed
  Postgres на ISPmanager-shared (где живёт frontend `liga.skrebeyko.ru`).
  Цель — единая точка управления, возможно экономия на managed-БД.
- **Барьеры:**
  - ISPmanager обычно даёт MySQL/MariaDB, не Postgres → переписать
    схему, RLS-policies, ~10+ RPC-функций (`ensure_garden_grants`,
    `is_admin`, `is_mentor_for`, `pvl_admin_progress_summary`,
    `admin_delete_user_full`, etc.). Огромный объём.
  - PostgREST не работает с MySQL → переписывать backend на другом
    стеке (Hasura для MySQL? самодельный API?).
  - Потеря managed-бенефитов: бэкапы, мониторинг, SLA Timeweb.
  - Производительность shared-хостинга под нагрузкой обычно слабее
    managed cloud-DB.
- **Бюджет:** 3-5 сессий recon + продуктовое решение, потом месяцы
  реализации. Не на ближайший спринт.
- **Альтернативы:** оставить как есть (Timeweb Cloud managed Postgres),
  принять разделение «фронт shared, БД managed» — это нормальный pattern.
  Любая экономия на managed-БД сожрётся стоимостью переписывания и
  риском регрессий.
- **Why в backlog:** заводится для запоминания, не для делания. Если
  Ольга снова поднимет тему — есть точка отсчёта с барьерами и
  бюджетом, а не «давайте подумаем заново».
- **Контекст:** Nginx-конфиг фронта `liga.skrebeyko.ru` отдаёт
  `index.html` с `Cache-Control: max-age=86400` (сутки). После
  каждого FTP-deploy юзеры до 24 часов видят старый bundle, пока
  не сделают hard reload (Cmd+Shift+R). Особенно болезненно при
  smoke-тестировании сразу после deploy.
- **Реальный инцидент 2026-05-07:** Ольга в PVL-учительской ловила
  `TypeError: Failed to fetch dynamically imported module` после
  одного из deploy сегодня — старый `index.html` ссылался на
  `assets/[hash].js`, удалённые при clean-slate FTP-upload новой
  версии. Раньше это списывалось на «случайный browser cache»,
  теперь зафиксировано как воспроизводимая регрессия каждого
  deploy → P1.
- **Стандарт:** хешированные ассеты (`/assets/*-[hash].js|css`)
  — `Cache-Control: public, immutable, max-age=31536000`;
  `index.html` — `Cache-Control: no-cache, must-revalidate`
  (или `max-age=0`).
- **Где:** nginx-конфиг сайта `liga.skrebeyko.ru` на сервере
  `185.215.4.44`. Нужны два разных `location`-блока:
  ```nginx
  location = /index.html {
      add_header Cache-Control "no-cache, must-revalidate" always;
  }
  location ~* \.(?:js|css|woff2?|svg|png|jpg|webp)$ {
      add_header Cache-Control "public, immutable, max-age=31536000" always;
  }
  ```
- **Why:** Стратег не должен говорить «сделай Cmd+Shift+R»
  на каждом smoke. Это вечный source ошибок «у меня старая
  версия, а у тебя новая». Деплой должен быть «прокатилось →
  сразу актуально для всех».
- **Acceptance:**
  - После deploy: открытие `liga.skrebeyko.ru` в новом
    инкогнито показывает свежую версию **без** hard reload.
  - У авторизованного юзера в активной сессии: следующая
    навигация подтягивает новый `index.html`, который ссылается
    на новые `[hash].js` ассеты.
  - DevTools Network на повторном GET / показывает
    `Cache-Control: no-cache, must-revalidate`.
- **Связано:** BUG-004 (white screen — частично из-за cache),
  CACHE_VERSION в frontend (если ещё актуально).
- **Оценка:** 10-15 минут (отредактировать nginx-conf через
  ssh, `nginx -t`, `systemctl reload nginx`, smoke).

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

### TECH-DEBT-PVLMOCK-MIGRATE: миграция 7 PVL-views с pvlMockApi на pvlPostgrestApi
- **Статус:** 🔴 TODO
- **Приоритет:** P3
- **Создано:** 2026-05-10 (после CLEAN-014-PVLMOCKAPI-AUDIT в `_08`)
- **Контекст:** `services/pvlMockApi.js` — **4260 строк** in-memory
  shim-фасада + mock-данные. Импортируется статически из 7
  PVL-views:
  - `views/PvlPrototypeApp.jsx` — массовый именованный импорт (~10 функций)
  - `views/PvlStudentTrackerView.jsx` — `pvlDomainApi`, `syncPvlActorsFromGarden`
  - `views/PvlCalendarBlock.jsx` — `pvlCohortIdsEquivalent`, `pvlDomainApi`
  - `views/PvlMenteeCardView.jsx` — `pvlDomainApi`
  - `views/PvlSzAssessmentFlow.jsx` — `pvlDomainApi`
  - `views/PvlTaskDetailView.jsx` — `pvlDomainApi`
  - `views/pvlLibraryMaterialShared.jsx` — `pvlDomainApi`

  Параллельно в проде уже есть **реальный** `services/pvlPostgrestApi.js`
  с RPC-методами (`getAdminProgressSummary`, `listCohorts` и т.п.).
  AdminPvlProgress (FEAT-017) уже на нём; остальные Pvl-views — нет.
  Source of truth размывается — данные одновременно живут в БД и в
  in-memory `pvlMockApi.db`.
- **Что сделать:**
  1. Один view = одна сессия миграции. Выбрать наименее зависимый
     (вероятно `PvlMenteeCardView` или `PvlTaskDetailView`) — мигрировать
     callsites `pvlDomainApi.*` на эквиваленты `pvlPostgrestApi.*`.
  2. Smoke-тест на проде после каждой миграции (Claude in Chrome).
  3. После всех 7 — удалить `services/pvlMockApi.js` +
     `data/pvlMockData.js` + `data/pvl/seed.js` + `data/pvl/localDemoLessons.js`.
- **Why:** single source of truth (БД); меньше mock-кода в lazy-chunk
  PvlPrototypeApp; снимает риск повторения BUG-PVL-COHORT-NULL-OVERWRITE
  и подобных «mock vs БД» багов.
- **Влияние на bundle:** `pvlMockApi` сейчас НЕ в main bundle (см. `_08`
  раздел 2.2 — попадает в lazy `PvlPrototypeApp`-chunk через
  CourseLibraryView). Поэтому миграция **не помогает** main, но
  частично уменьшит PvlPrototypeApp chunk (518 KB raw / 130 KB gzip).
- **Связано:**
  - `BUG-PVL-COHORT-NULL-OVERWRITE` (closed) — там был фрагмент
    миграции `ensurePvlStudentInDb`.
  - FEAT-016 / FEAT-017 — открыли путь через
    `pvlPostgrestApi.getAdminProgressSummary` и phase 25 RPC.
  - `docs/_session/2026-05-10_08_codeexec_bundle_baseline_audit.md`
    раздел 2.3.
- **Оценка:** 7 сессий (по одному view), без блокеров.

### TECH-DEBT-FK-CONTRACTS: Контрактные FK на 3 таблицах + ON DELETE CASCADE на meetings.user_id
- **Статус:** 🔴 TODO
- **Приоритет:** P3
- **Создано:** 2026-05-07 (открыто после BUG-ADMIN-DELETE-USER recon)
- **Контекст:** При recon BUG-ADMIN-DELETE-USER 2026-05-07
  обнаружено, что **3 таблицы логически ссылаются на
  `profiles.id`, но FK не объявлены** → orphan-возможность:
  - `users_auth.id` (PK совпадает с profiles.id, но FK не
    объявлен)
  - `pvl_students.id` (PK совпадает с profiles.id, FK не
    объявлен)
  - `pvl_garden_mentor_links.student_id` (FK не объявлен;
    `mentor_id` тоже без FK)
  - `pvl_direct_messages.author_user_id|mentor_id|student_id`
    (нет FK ни на одной из трёх колонок)
  
  Также **`meetings.user_id` имеет FK без `ON DELETE CASCADE`**
  (NOT NULL, References `profiles(id)`). Любой DELETE профиля
  у которого есть встречи — упрётся в FK violation. Сейчас
  это обходится явным `DELETE FROM meetings WHERE user_id=...`
  внутри `admin_delete_user_full`, но контракт хрупкий.
- **Что починить:**
  1. Добавить FK `users_auth.id → profiles(id) ON DELETE CASCADE`.
  2. Добавить FK `pvl_students.id → profiles(id) ON DELETE CASCADE`
     (или **NOT** добавлять, если решено держать pvl_students
     независимым агрегатом — задокументировать).
  3. Добавить FK на колонки `pvl_garden_mentor_links` (student_id,
     mentor_id) и `pvl_direct_messages` (author_user_id, mentor_id,
     student_id) на `profiles(id) ON DELETE CASCADE`.
  4. Изменить `meetings.user_id` FK на `ON DELETE CASCADE`
     (или явно решить — NO ACTION; зависит от того, должен ли
     hard-delete пользователя сносить его историю встреч —
     связано с PROD-005).
- **Why:** Сейчас контракт «pvl_students.id = profiles.id»
  существует только в коде. Если кто-то сделает DELETE мимо
  RPC, останутся orphan-ряды. FK — единственная гарантия
  консистентности БД.
- **Acceptance:**
  - 5+ FK добавлено (или явно отвергнуто с обоснованием
    в комментарии миграции).
  - `admin_delete_user_full` упрощён: лишние явные DELETE
    (meetings, pvl_direct_messages, pvl_garden_mentor_links)
    можно убрать, если CASCADE покроет.
  - Verify: тест-DELETE случайного профиля под gen_user в
    транзакции с ROLLBACK подтверждает, что все связанные
    ряды действительно cascade'нулись.
- **Связано:** BUG-ADMIN-DELETE-USER (closed; recon выявил
  проблему), PROD-005 (если перейдём на soft-delete — FK
  становятся менее критичны), CLEAN-013 (текущее удаление
  через RPC обходит проблему).

### UX-QUICK-FIXES: Накопительная карточка мелких UX-правок
- **Статус:** 🟡 IN PROGRESS (накопительная)
- **Приоритет:** P3
- **Создано:** 2026-05-07
- **Контекст:** Накопительная карточка для мелких UX-фиксов —
  опечатки, лишние подзаголовки, сломанные кнопки, мелкие
  visual-glitch'и. Каждый отдельный пункт слишком мал для своего
  тикета, но в куче они влияют на восприятие платформы. По мере
  закрытия пунктов отмечать в этом списке.
- **Готово (по сессиям):**
  - 🟢 [2026-05-07, commit `9fddae4`] Удалён developer-style
    подзаголовок «События календаря с типом …» под заголовком
    «Записи проведённых практикумов» в PVL-учительской календаре
    (`views/PvlCalendarBlock.jsx`). Заголовок остался, лишь
    описательный `<p>` убран.
  - 🟢 [2026-05-07, commit `f57d087`] Удалена кнопка «Смотреть
    запись» в карточках практикумов (`views/PvlCalendarBlock.jsx`).
    Кнопка ссылала на `ev.recordingUrl`, но это поле админ
    заполняет сырым `<iframe>`-embed для плеера, а не URL —
    `<a href={raw_html}>` отправлял запрос вида
    `https://liga.skrebeyko.ru/<iframe...` → 400 от nginx.
    Embed-плеер в карточке остаётся, кнопка избыточна.
- **Открыто:**
  - 🔴 Layout 3 колонок в «Записи проведённых практикумов» —
    продуктовое решение Ольги по сетке (текущий — 1/2/4 колонки
    через `sm:grid-cols-2 xl:grid-cols-4`). Возможно нужен
    промежуточный 3-колоночный breakpoint или другой ratio.
  - 🔴 [2026-05-08] **Колотилова Светлана Николаевна**
    (`df6d3afc-1c5b-4d68-af6f-4eb646c1f5f9`, role=mentor,
    status=suspended) — убрать отчество из `profile.name`. Должно
    быть «Колотилова Светлана». Один UPDATE в `profiles`. Заодно
    сверить связанные таблицы (`events.host_*` через
    `sync_meeting_to_event` — имя ведущей дублируется?), fix везде
    если нужно. Накопительный batch — ждём ещё пунктов.
- **Acceptance (для каждого пункта):**
  - Описана локация и diff
  - Commit-hash зафиксирован в этой карточке после merge
- **Связано:** UX-001 (общий UX-проход через скиллы), UX-002
  (админка на всю ширину), `views/PvlCalendarBlock.jsx`.

### BUG-MEETINGS-VK-BUTTON-OVERFLOW: подрезается кнопка ВКонтакте + опечатка «Телеграмма»
- **Статус:** 🟢 DONE (2026-05-07, meetings-стратегом)
- **Приоритет:** P3 (UX в meetings-репо)
- **Создано:** 2026-05-07
- **Закрыто:** 2026-05-07
- **Контекст:** На карточке события в публичном Meetings
  (`meetings.skrebeyko.ru`) две кнопки контакта (TG + ВК),
  добавленные в FEAT-002 этап 4, не помещаются в одну строку
  на узких экранах — кнопка «ВКонтакте» подрезается. Также
  опечатка: текст «Телеграмма» вместо «Телеграм».
- **Решение:** vertical stack (`flex flex-col` без `sm:flex-row`)
  + текст «Телеграм». Commit `62cf08d` в репо `ligacreate/meetings`,
  prod smoke 8/8 PASS.
- **Где:** репо `ligacreate/meetings`, страница события.
- **Why:** Видимый UX-косяк сразу после релиза двух кнопок;
  Ольга заметила и передала.
- **Связано:** FEAT-002 этап 4 (cycle закрыт meetings-стратегом),
  CONTRACT-GARDEN-MEETINGS-001.

### UX-003: Redesign страницы 404 в meetings
- **Статус:** 🔴 TODO (ждёт brief'а от Ольги)
- **Приоритет:** P3
- **Создано:** 2026-05-06 (после FEAT-002 этап 4 closure отчёта meetings-стратега)
- **Контекст:** В рамках PR ligacreate/meetings#2 (commit 562f0b8)
  meetings-сторона удалила DEBUG INFO leak со страницы 404
  (служебная информация утекала в публичный бандл). Полный
  redesign самой страницы — отдельный мини-цикл, ждёт
  продуктовый brief от Ольги.
- **Скоп (когда дойдёт):**
  - Какой текст показывать на 404 (тон в духе Лиги, не
    SaaS-generic).
  - Иллюстрация / эмодзи / минимальный визуал.
  - Кнопка возврата на главную / в расписание встреч.
  - Возможно: ссылки на популярные разделы (FAQ, контакт).
- **Why:** Сейчас 404 — голая страница без UX. Маленькая,
  но видимая часть платформы.
- **Acceptance:**
  - Текст и визуал согласованы с Ольгой.
  - Reachable из любой ошибки роутера (HashRouter в meetings).
  - Smoke на проде: переход на `/несуществующий-путь` →
    показывает дружелюбную страницу.
- **Связано:** commit ligacreate/meetings@562f0b8 (DEBUG INFO
  leak removed), UX-001 (общий UX-проход).
- **Оценка:** 1 короткая сессия после brief'а Ольги.

### UX-002: Админка Garden — на всю ширину экрана + улучшение UX
- **Статус:** 🔴 TODO
- **Приоритет:** P3 (QoL для админов — Ольги, Насти, Ирины)
- **Создано:** 2026-05-06
- **Контекст:** Текущая админ-панель `views/AdminPanel.jsx`
  ограничена по ширине (видимо, наследует общий контейнер
  Garden с max-width). Для админов это неудобно: длинные
  списки пользователей / встреч / контента переносятся на
  несколько колонок, фильтры тесные, операции с большим
  числом строк требуют скролла.
- **Скоп (когда дойдёт ход):**
  1. Layout: убрать max-width контейнер для админ-маршрутов,
     раздвинуть на 100% viewport.
  2. UX-полировка: улучшить таблицы пользователей/встреч —
     sortable колонки, sticky header, поиск/фильтры, badge'ы
     для статусов.
  3. Возможно: вынести админку на отдельный layout (без общей
     навигации Garden), как «admin app inside app».
  4. Согласовать с FEAT-014 (магазин в админке) и
     NB-RESTORE (notebooks/questions/cities админка) —
     все три фичи добавляют разделы в админ-панель, удобнее
     спроектировать layout единым подходом.
- **Why:** Снижает усталость Ольги при работе со списками;
  особенно важно с ростом числа ведущих и студентов.
- **Acceptance:**
  - Админ-маршруты используют 100% ширины экрана.
  - Основные таблицы имеют sortable + filter.
  - Smoke: на проде Ольга подтверждает, что работа со списком
    из 60+ профилей стала удобнее.
- **Связано:** `views/AdminPanel.jsx`, FEAT-014 (магазин админка),
  NB-RESTORE (notebooks/questions/cities админка), UX-001
  (общая UX-полировка).
- **Оценка:** 1-2 сессии. Лучше совместить с FEAT-014 / NB-RESTORE
  (чтобы layout раз пересмотреть и больше не возвращаться).

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

- **Cover-upload incident у ведущей.** Несколько часов после phase 18 ведущая не могла сохранить событие — alert «Обложка (загрузка не завершена)», затем «Ошибка обновления встречи». Двойной симптом:
  1. Cover upload race: фронт показывает превью data-URL, async upload в твоё S3 (twcstorage.ru) иногда возвращает 503 (intermittent). Валидация ловит data-URL и не даёт сохранить. Это давний UI-баг — не наша регрессия. Зафиксировано как BUG-MEETINGS-COVER-UPLOAD.
  2. Phase 18 регрессия: фронт делает PATCH /events напрямую (не через meetings + trigger), а phase 18 REVOKE'нула writes на events от authenticated → 403. Дополнительно trigger sync_meeting_to_event имеет SECURITY INVOKER → тоже падает 42501. Подтверждено через Claude in Chrome diagnostic.
- **Phase 19 миграция:** revert REVOKE INSERT/UPDATE/DELETE на events для authenticated + ALTER FUNCTION sync_meeting_to_event() SECURITY DEFINER + SET search_path = public. Регрессия закрыта, ведущие снова могут сохранять события. ⚠️ ANOM-002/SEC-011 временно открыта — окончательное закрытие через phase 20 (узкие RLS-policies, см. SEC-013).
- **Открытия (для backlog):**
  - ANOM-005: `KB_Edit_Auth` permissive ALL policy перекрывает admin-only policies на knowledge_base.
  - ANOM-006: `events.time NOT NULL` — trigger падает, если в meetings.time NULL.
  - SEC-013: phase 20 task (узкие RLS на events writes).
  - FEAT-002: VK-контакт ведущего в профиле + кнопка «Связаться в ВК» в Meetings.
- **Закрыто:** ARCH-009 (учительская найдена и задокументирована), ARCH-001 (та же тема), ARCH-002 (DB сохранение ДЗ верифицировано на production data — 48/48 submissions с непустым payload).
- **Документация:**
  - docs/PVL_RECONNAISSANCE.md раздел 2.4 — обновлён с актуальной архитектурой ментор-ученик flow (3 admin-API функции, реальные production data, известные ограничения).
  - docs/DB_SECURITY_AUDIT.md — добавлен banner «снимок до SEC-001», документ остаётся как исторический artifact.
  - docs/lessons/2026-05-04-postgrest-role-switch-anon-clients.md — урок про anon-клиентов.

- **FEAT-013 — пауза ведущей скрывает её встречи в публичном Meetings.** Продуктовое решение Ольги (DECISION_2026-05-04_pause_hides_meetings.md): когда ведущая на паузе, её события исчезают из публичного Meetings; данные `meetings` сохраняются; при возврате на active — события автоматически восстанавливаются. Recon обнажил, что миграция 21 (биллинг + access_status) НЕ применена; реально работает старое поле `profiles.status` со значениями `active`/`suspended`. Выбрали Путь A — строимся на текущем поле, миграция 21 откладывается. Phase 21 миграция: модификация `sync_meeting_to_event` (добавлено чтение `profiles.status`, зеркалит только если active), новая функция `resync_events_for_user(uuid)`, trigger `on_profile_status_change_resync_events` на profiles AFTER UPDATE OF status, одноразовый cleanup 12 зомби-зеркал у Елены Мельниковой. Double smoke (0→12→0) подтвердил полный cycle suspended↔active.
- **BUG-HOMEWORK-PASTE-MSO — Word HTML-мусор в payload ДЗ.** Зафиксировано Еленой Курдюковой через Telegram. Корень: DOMPurify в whitelist-режиме режет ТЕГИ, но KEEP_CONTENT:true сохраняет их текстовое содержимое — CSS из `<style>` вылезал как plain text. Решение: расширил `stripMsOfficeHtmlNoise` в `utils/pvlHomeworkAnswerRichText.js` (regex-препроцессинг до DOMPurify) — стрипает `<style>`, `<script>`, HTML-комментарии (включая conditional `<!--[if mso]>`), XML-namespaced теги (`<o:p>`, `<w:WordDocument>`, `<v:*>`). Покрывает render+save в 19 точках, не требует миграции данных — старые записи будут чисто рендериться при следующем открытии. Commit 90e0987. Урок: `docs/lessons/2026-05-04-dompurify-keep-content-leaks-style-text.md` — общий паттерн «whitelist-санитайзеры с default KEEP_CONTENT пропускают текст из тегов с не-HTML контентом».
- **Открытия (для backlog):**
  - BUG-TOGGLE-USER-STATUS-GHOST-COLUMN: фронт PATCH'ит `profiles.access_status`, которой нет в схеме. Игнорируется PostgREST'ом, но захламляет код. Чинить когда будет миграция 21 (синхронизация enum-значений).
- **Закрыто:** FEAT-013, BUG-HOMEWORK-PASTE-MSO. ARCH-002/009/001 закрыты ранее в этот день.
- **Документация:**
  - docs/DECISION_2026-05-04_pause_hides_meetings.md — добавлено уточнение про реальное состояние схемы (Путь A на `status`, не `access_status`).
  - migrations/2026-05-04_phase21_pause_hides_events.sql — phase 21 миграция, applied.

- **P0 GRANT WIPEOUT — outage логина у всех ведущих ~2 ч.** Vasilina Luzina (~14:44 UTC) и остальные ведущие получали `42501 permission denied for table profiles` при логине; публичное Meetings — то же на `events/cities/notebooks/questions`. Diagnostic (read-only ssh + psql): table-level GRANT'ы для `authenticated` и `web_anon` отозваны полностью на всех 45 public-таблицах + EXECUTE на `is_mentor_for(uuid)` стёрт; БД/PostgREST/Caddy/garden-auth живы, JWT-секреты совпадают, RLS/функции/триггеры (включая phase 19 SECURITY DEFINER и phase 21 trigger) не затронуты. Самая вероятная причина — Timeweb UI quirk «Привилегии роли» делает REVOKE ALL on save (тот же механизм, что в RUNBOOK 1.2 для `gen_user`). Recovery: re-apply phase 16 + phase 17 + phase 18 PART 1+3 (PART 2 НЕ повторяли — откатана phase 19). Smoke: 158 grant-rows для authenticated, 4 для web_anon, profiles/events читаются без 42501, helper-функции исполняются. Outage от первого report'а до recovery ~2 часа. Конкретный запрос Vasilina с 42501 в логах увидеть нельзя (Caddy access-log не настроен, PostgREST request-log выключен в default, garden-auth не логгирует операций).
- **Открытия (для backlog):** SEC-014 — расследование причины wipe + защитный мониторинг + idempotent recovery-скрипт + обновление RUNBOOK 1.2.
- **Закрыто:** инцидент. **Открыто:** SEC-014.
- **Артефакты:** docs/INCIDENT_2026-05-04_grant_wipeout.md, docs/lessons/2026-05-04-timeweb-role-permissions-ui-revokes-all.md.

#### 2026-05-05
- **FEAT-002 этап 1 — гигиена `profiles.telegram` + `meetings.payment_link`.** Через 2-чатовый Telethon-match (приватные чаты Лиги «Лига 💬» и «Чат Пиши, веди, люби 2026» под админ-аккаунтом Ольги, 56 уникальных участников) вытянули `@username` для 14 ведущих: 10 high (точное совпадение токенов, иногда через ru→latin транслит) + 4 medium с подтверждением Ольги глазами. Дополнительно: 4 manual (Ольга нашла руками — Колотилова, Бородина, Колкова + Романова, у которой TG поднят из её собственного `meetings.payment_link` встречи 204), 7 нормализация B-секции (`@username`/bare → `https://t.me/...`, в т.ч. **расщепление composite-поля Инны Кулиш** на TG-handle и VK-ссылку — VK уйдёт в `profiles.vk` через UI после phase 22), 3 локальные правки A-секции (тримм ведущего пробела у Кокориной, добавление протокола `https://` Шульге, **очистка VK-значения** Светланы Исламовой — тоже backfill через UI после phase 22). Очищено 17 `meetings.payment_link` (4 VK для будущего backfill, 10 прошлых `@AneleRay` Мельниковой как suspended-ведущей, 3 прочих включая лендинг издательства Ольги). **45 UPDATE одной транзакцией под `gen_user` через psql -f, V1–V4 зелёные.**
- **Refs-check дубля LIlia MALONG (для CLEAN-013):** дубль **активный** — 3 живые ссылки в `pvl_audit_log.actor_user_id`, `pvl_students.id`, `users_auth.id`. Поэтому CLEAN-013 решает дубль через **MERGE** (перенос ссылок на основной профиль `d302b93d…fa15`, затем DELETE дубля), не прямой DELETE. Refs-check скрипт упал на 3 несуществующих колонках (`pvl_audit_log.target_user_id`, `notifications.recipient_id`, `messages.sender_id/recipient_id`) — generic-паттерн не подошёл; CLEAN-013 при работе перепроверит все user-id-колонки динамически через `information_schema`.
- **Открытия (для backlog):**
  - **CLEAN-013** — data hygiene profiles: 4 тестовых аккаунта (Лена Ф, Настин фиксик, Настина фея, Рита) + дубль LIlia MALONG (MERGE по 3 ссылкам). Заведён в P2.
  - **VK-backfill через UI после phase 22** — для 4 ведущих (Инна Кулиш, Юлия Громова, Светлана Исламова, Колотилова Светлана). Не отдельный таск пока, фиксируется как часть FEAT-002 этап 2 (новое поле `profiles.vk` + UI-форма).
- **Закрыто:** FEAT-002 этап 1 (гигиена). **Открыто:** CLEAN-013, FEAT-002 этап 2 (VK-поле).
- **Артефакты:** `migrations/data/2026-05-05_feat002_hygiene.sql`, `docs/RECON_2026-05-04_feat002_data_hygiene.md` (зоопарк), `docs/RECON_2026-05-04_feat002_telegram_match.md` (Telethon-match отчёт + apply-результат). Telethon-скрипты `scripts/feat002-tg-recon/*` НЕ в git (private: `.env`, `*.session`, `members.json`, `match_result.json`).
- **Followup:** `migrations/data/2026-05-05_feat002_hygiene_followup_islamova_tg.sql` — backfill TG для Светланы Исламовой (`https://t.me/SwetlanaIslamova`, прислан Ольгой после основной гигиены; в основной миграции её `telegram` был очищен в `''`, так как там лежал VK). Эффект: `active+empty_telegram` 4 → 3 (остаются 3 кандидата CLEAN-013). VK по-прежнему сохраняем для UI-backfill после phase 22.

- **FEAT-002 этап 2 — phase 22 миграция: денормализация контактов в events.** Добавлены поля `profiles.vk` + `events.host_telegram` + `events.host_vk`. Расширена функция `sync_meeting_to_event` (читает `profiles.telegram`/`vk` → пишет в `events.host_*`). Добавлен новый trigger `on_profile_contacts_change_resync_events` на `profiles` AFTER UPDATE OF `telegram`, `vk`. Backfill: **149 events** получили `host_telegram`, **0** — `host_vk` (vk пока пустое у всех; UI-backfill 4 ведущим после этапа 3). Verify V1–V6 зелёные.
- **Открыто:** Garden этап 3 FEAT-002 (форма с полем VK + required на TG + автонормализация + кнопка ВК на LeaderPageView + выпил auto-fill `payment_link` в MeetingsView).
- **Артефакт:** `migrations/2026-05-05_phase22_vk_field_and_event_contacts.sql`.

- **ANOM-004 закрыт фактом.** Анонимные writes на `cities` / `notebooks` / `questions` — verified by anon write attempt → 42501. Ольга через Claude in Chrome выполнила `POST /notebooks` без JWT — получила `permission denied` (42501). Дыры нет: phase 18 открывала web_anon только на SELECT, INSERT/UPDATE/DELETE-grant'ов нет; authenticated-write для непривилегированных тоже падает. Статус задачи в P3-секции переведён в 🟢 DONE.

- **Второй P0 GRANT WIPEOUT — 2026-05-05.** Через ~30 минут после phase 22 apply снова все кастомные `GRANT TO authenticated/web_anon` на public-таблицах исчезли (counts 158/4 → 0/0), фронт ловит `42501`. Recovery (re-apply phase 16/17/18 PART 1) сделан стратегом за минуту по готовому playbook. **Корреляция с phase 22 apply** опровергает гипотезу про Timeweb UI quirk (никто в UI не заходил, event-triggers пустые) — новая гипотеза: managed-Postgres делает ACL-resync с baseline после schema-changing операций (DDL-revoke). Подробности — в `docs/lessons/2026-05-05-timeweb-revokes-grants-after-ddl.md`.
- **SEC-014 phase 23 hot-fix — трёхслойная защита.**
  1. `migrations/2026-05-05_phase23_grants_safety_net.sql` — stored procedure `public.ensure_garden_grants()`, идемпотентно повторяет phase 16 + 17 + 18 PART 1. SECURITY DEFINER. Apply прошёл, V1–V4 зелёные (V1: 158 authenticated grants, V2: 4 web_anon, V3: функция создана, V4: EXECUTE на helper'ах). Wipe сразу после COMMIT **не наблюдался** — counts остались 158/4 (либо revoke асинхронный, либо в этот раз не сработал).
  2. `scripts/recover_grants.sh` — idempotent CLI-обёртка над `ensure_garden_grants()`. Положена в `/opt/garden-monitor/recover_grants.sh`, тестовый прогон OK (counts 158/4, лог в `/var/log/garden-monitor.log`).
  3. `scripts/check_grants.sh` — cron-monitor каждые 5 минут (`/etc/cron.d/garden-monitor`). При wipe (authenticated < 100 ИЛИ web_anon < 4) шлёт Telegram-alert и авто-вызывает `recover_grants.sh`. Тестовый health-check на проде: silent OK. Telegram-alert — no-op (бот пока не настроен, env-vars пусты), работает в logging-only режиме.
  4. RUNBOOK раздел 1.3 (новый, существующие 1.3-1.5 сдвинуты в 1.4-1.6) — обязательное правило: после любой DDL-миграции в конце транзакции, ДО `COMMIT`, ставить `SELECT public.ensure_garden_grants()`.
- **Открыто:** тикет в Timeweb support про DDL-wipeout (для понимания root cause, не блокер). Telegram-бот для алертов (создание через @BotFather, ~5 минут — попросить Ольгу через стратега).
- **Артефакты:** `migrations/2026-05-05_phase23_grants_safety_net.sql`, `scripts/recover_grants.sh`, `scripts/check_grants.sh`, `docs/lessons/2026-05-05-timeweb-revokes-grants-after-ddl.md`, RUNBOOK 1.3 + cron entry на проде (`/etc/cron.d/garden-monitor` — не в git).

#### 2026-05-06
- **FEAT-002 этап 3 — Garden фронт deployed.** Commit aead805, deploy через GitHub Actions FTP на 185.215.4.44 в 18:36 UTC. Smoke V1-V5 5/5 PASS через Claude in Chrome (Ольга): нормализация VK / required TG / две кнопки контакта (TG + ВК) на LeaderPageView / `toggleUserStatus` без PGRST204 / без auto-fill `payment_link` в MeetingsView. Артефакты: `lib/contactNormalize.js` + `services/dataService.js` + 3 view-файла (см. aead805).
- **UI-backfill VK для 4 ведущих** через psql (стратегом, под `gen_user`): Инна Кулиш, Юлия Громова, Светлана Исламова, Колотилова Светлана. Trigger phase 22 `on_profile_contacts_change_resync_events` автоматически синкнул в events (11 events `host_vk` заполнен).
- **Закрыто:** FEAT-002 этапы 1, 2, 3 (Garden-сторона); ANOM-004 (verified anon write → 42501); BUG-TOGGLE-USER-STATUS-GHOST-COLUMN (фикс в этапе 3 — `access_status` убран из тела PATCH); SEC-014 основной скоуп (трёхслойная защита active).
- **Открыто:** FEAT-002 этап 4 (meetings-сторона — показ `host_vk`/`host_telegram` + разделение кнопок контакта); CLEAN-013 (тестовые профили + дубль LIlia MALONG MERGE); NB-RESTORE (переезд админки notebooks/questions/cities в Garden, P1); CLEAN-014 (удаление `meetings.payment_link` после этапа 4); SEC-014 остатки — тикет в Timeweb support + опциональный smoke + Telegram-бот для алертов.
- **Артефакты:** `lib/contactNormalize.js`, `services/dataService.js` + 3 view файла (см. aead805); `docs/HANDOVER_2026-05-06_session_feat002_garden.md`.
- **Заведены 4 новые продуктовые фичи** (по запросу Ольги в финале сессии):
  - **FEAT-014** (P3) — Магазин в админке Сада (CRUD для `shop_items`).
  - **FEAT-015** (P1) — Авто-пауза ведущей при неоплате Prodamus (webhook → `profiles.status`).
  - **FEAT-016** (P2) — Выгрузка результатов ДЗ ПВЛ (особенно feedback по модулю).
  - **FEAT-017** (P2) — Дашборд прогресса студентов ПВЛ (кто запаздывает по ДЗ).
- **Meetings SEC_PINS Variant A apply ЗАКРЫТ** (отчёт meetings-стратега): PR в `ligacreate/meetings` merged → FTP-deploy → prod smoke 6/6 (curl/bundle/PIN-grep/hash-match) + 7/7 (Claude in Chrome UI). **Bundle 2.4M → 664K (−73%)**, npm audit 17 → 16. Закрыто AUDIT findings: P0-1 (hardcoded PINs 0000/1111 в публичном бандле), P1-1 (`setShowAllCities` ReferenceError), P1-4 (postgrest client duplication), P1-5 (Mapbox token UI prompt), P2-2 (dead MapView), P2-8 (dead admin-write code) + npm vuln `protocol-buffers-schema` (через mapbox-gl). После apply: meetings-фронт = чисто read-only публичная читалка. Артефакты: `meetings/docs/SEC_PINS_2026-05-05.md`, `meetings/docs/AUDIT_meetings_2026-05-05.md`, `meetings/docs/NB_RESTORE_PLAN.md`.
- **Открыто** (после Meetings SEC_PINS apply):
  - **NB-RESTORE стало горящим** — Ольга временно теряет UI для управления `notebooks`/`questions`/`cities` до переезда админки в Garden. Manual ad-hoc через Garden-стратега / psql.
  - **INFRA-002** (P3) заведён — мёртвый `public/.htaccess` в meetings (nginx ignores).
- **Meetings приступает к FEAT-002 этап 4 apply** (две кнопки контакта в meetings-фронте). Сигнал «этап 4 apply закончен» придёт от meetings-стратега после prod smoke на новой ветке.
- **Followup: http:// → https:// в profiles.telegram** (перед релизом этапа 4). Meetings-стратег через curl по api.skrebeyko.ru/events нашёл расхождение с canonical-контрактом: 2 profiles (Мария Бардина, Рухшана) с `http://t.me/...`, 31 events через них. Источник — дыра в этапе 1 гигиены: RECON засчитывал `http://` как «full_url валиден» (regex `^https?://`). Применён UPDATE через psql, trigger phase 22 автоматически пересинкнул 31 events. Финал: 149 canonical / 9 empty / 0 http. Артефакт: `migrations/data/2026-05-06_feat002_http_to_https_telegram.sql`.
- **Заведены 2 новых таска по запросу Ольги** (на финале сессии):
  - **BUG-ADMIN-DELETE-USER** (P2) — нельзя удалить тестового пользователя через админ-панель Garden (точный симптом — на recon). Возможно FK constraint от `pvl_audit_log`/`pvl_students`/`users_auth` или missing RLS-policy `profiles_delete_admin`. Связан с CLEAN-013.
  - **UX-002** (P3) — админка Garden на всю ширину экрана + улучшение UX (sortable таблицы, sticky header, фильтры). Лучше совместить с FEAT-014 (магазин админка) + NB-RESTORE (notebooks админка) — единым подходом к layout.
- **Manual escape hatch — DELETE notebook «Созвездие историй»** (через psql под `gen_user`, NB-RESTORE ещё не сделан, UI meetings выпилен SEC_PINS-ом, anon DELETE через PostgREST не пройдёт). 1 row affected, 0 FK references, total notebooks: 4 → 3. До NB-RESTORE такие операции делаются ad-hoc через стратега.
- **Заведена FEAT-018** (P1) — Часовые пояса встреч: офлайн в TZ города + фильтр городов + корректное локальное время + flow добавления нового города (как город попадает в `cities` и фильтр meetings, когда ведущая создаёт встречу в новом городе). Recon перед планом. Без этой фичи география Лиги ломается. Пересекается с NB-RESTORE (cities Admin переедет в Garden).
- **Hotfix: статистика ведущих в админке Garden пропала с 2026-05-03 (SEC-001).** Корень: на `meetings` RLS-policies были только owner-only (`auth.uid() = user_id`), без admin-bypass. До SEC-001 PostgREST коннектился под gen_user (owner) и игнорировал RLS — админская статистика видела ВСЕ meetings. После включения JWT-role-switch запросы Ольги пошли под `authenticated`, RLS заработал → admin видит только свои 2 meetings. Не регрессия FEAT-002, давно скрытый баг. **Фикс:** добавлена policy `meetings_select_admin USING (public.is_admin())` (через phase 17 helper). SELECT-only, writes остаются owner-only. Артефакт: `migrations/data/2026-05-06_meetings_admin_select_policy.sql`. Возможно требуется аналогичный admin-bypass на других read-only-для-админа таблицах (например, `pvl_homework_submissions` для FEAT-016 выгрузки) — отдельный recon при работе над теми фичами.
- 🎉 **FEAT-002 ЗАКРЫТА ЦЕЛИКОМ — 4/4 этапа.** Meetings-сторона: PR ligacreate/meetings#2 (commits e3c0bf2 + 562f0b8), FTP-deploy 2026-05-06 13:26 МСК, prod smoke 9/9 PASS (Claude in Chrome + auto curl/PIN-grep/bundle-hash). На карточке встречи теперь две кнопки контакта (TG + VK) в slate-pill стиле. Закрыта AUDIT P1-2 (XSS на href, defence-in-depth через `safeHref` helper с whitelist `https://t.me/` и `https://vk.me/`). Bundle delta meetings: +1.4 KB raw vs SEC_PINS base. Подтверждён hotfix http→https Рухшаны (id 339, 347 на проде). Бандл-хеш `index-Zk3XqCO9.js`, FTP clean-slate сработал. **Сводные метрики FEAT-002 + SEC_PINS (за два цикла):** Bundle meetings 2.4 MB → 515 KB (gzip ≈166 KB); 7 closed AUDIT findings (P0-1 PINs, P1-1 setShowAllCities, P1-2 XSS href, P1-4 postgrest dup, P1-5 Mapbox token, P2-2 dead MapView, P2-8 dead admin-write) + npm vuln `protocol-buffers-schema`.
- **Зелёный свет на CLEAN-014** — приоритет повышен P3 → P2; теперь покрывает удаление обеих legacy-колонок (`meetings.payment_link` + `events.registration_link`) + cleanup `Event` типа в meetings. Делать в одном PR через 1-2 спринта наблюдения (CACHE_VERSION v4 у всех клиентов отстоится).
- **Заведена UX-003** (P3) — Redesign страницы 404 в meetings. В PR meetings#2 удалили только DEBUG INFO leak; полный redesign — отдельным мини-циклом после brief'а от Ольги.
- **Зелёный свет на NB-RESTORE planning** (P1, переезд админки notebooks/questions/cities в Garden, Variant 3).

#### 2026-05-07
- **BUG-ADMIN-DELETE-USER ЗАКРЫТ.** Recon read-only под gen_user
  выявил две корневые причины: (1) на `public.profiles` отсутствовала
  RLS-policy `FOR DELETE` (silent no-op даже под admin'ом, GRANT
  есть, policy нет), (2) `postgrestFetch` падал на HTTP 204 No
  Content (попытка `response.json()` на пустом теле бросала
  `SyntaxError`). **Phase 24 миграция:** RPC
  `public.admin_delete_user_full(uuid)` SECURITY DEFINER, проверка
  `is_admin()`, audit BEFORE delete, удаление в порядке «дети →
  родители» с учётом FK-карты (meetings без CASCADE → DELETE first;
  pvl_students каскадирует на 7 PVL-таблиц; pvl_audit_log/
  homework_status_history остаются orphan-actor by design).
  **204-guard в `postgrestFetch`** — generic-фикс, лечит и наш RPC,
  и латентные DELETE без `returnRepresentation`. **UI refetch** —
  AdminPanel.jsx после успеха дёргает `onRefreshUsers()`, тосты
  для forbidden / null / прочих ошибок. **Smoke 1** (commit `9fddae4`)
  — backend OK, refetch не сработал из-за 204-bug. **Smoke 2** (commit
  `f57d087`, 204-guard) — 5/5 PASS, Лена Ф удалена через UI без F5.
- **CLEAN-013 прогресс 1/5.** Лена Ф удалена через RPC. Verified
  гипотеза «дубль LIlia MALONG = случайная регистрация без значимой
  активности»: 8 строк `pvl_student_content_progress` уже покрыты
  main; mentor_link дублирует main; pvl_students пустая; 1 audit с
  пустым payload. Решение по дублю: прямой DELETE через RPC, MERGE
  отменён. ⏸ Отложены: Настина фея + Настин фиксик (требуется
  решение Ольги по тест-set), Рита (готова к удалению). ⚠ Перед
  удалением Настин фиксик — переподвесить Екатерину Салама на
  реального ментора (фейк-ментор сейчас).
- **UX-QUICK-FIXES batch 1.** Удалён developer-style подзаголовок
  «События календаря с типом …» в PVL-календаре (commit `9fddae4`).
  Удалена сломанная кнопка «Смотреть запись» из карточек практикумов
  (commit `f57d087`) — `ev.recordingUrl` содержал embed-iframe HTML,
  href с raw HTML давал 400 от nginx, embed-плеер уже рендерит
  видео в карточке.
- **Открытия (для backlog):**
  - **PROD-005** (P2) — soft-delete vs hard-delete для реальных
    пользователей (RPC сейчас делает hard, для тестовых — ОК, для
    реальных нужно продуктовое решение).
  - **ARCH-014** (P3) — контрактные FK на 3 таблицах
    (`users_auth.id`, `pvl_students.id`,
    `pvl_garden_mentor_links.student_id`,
    `pvl_direct_messages.*`) + ON DELETE CASCADE на
    `meetings.user_id`. Сейчас контракт нарушен — orphans возможны.
  - **INFRA-004** (P3) — cache-headers index.html (`max-age=86400`
    слишком агрессивен; стандарт: hashed assets immutable, html
    no-cache).
  - **UX-QUICK-FIXES** (P3) — накопительная карточка для мелких
    UX-правок (накопила batch 1 этой сессии).
  - **BUG-MEETINGS-VK-BUTTON-OVERFLOW** (передан meetings-стратегу) —
    кнопка «ВКонтакте» подрезается на узких экранах + опечатка
    «Телеграмма» вместо «Телеграм».
  - **CONTRACT-GARDEN-MEETINGS-001** (P2 documentation) —
    `events.host_telegram NOT NULL и непуст`. Meetings-фронт
    полагается на этот инвариант (рендерит TG-кнопку без
    runtime-`if`). Поддерживается phase 22 trigger + required-TG
    в Garden-форме.
- **Закрыто:** BUG-ADMIN-DELETE-USER. **Прогрессирует:** CLEAN-013
  (1/5 удалено). **Открыто:** PROD-USER-DELETE-MODEL (был PROD-005),
  TECH-DEBT-FK-CONTRACTS (был ARCH-014), INFRA-004,
  UX-QUICK-FIXES, CONTRACT-GARDEN-MEETINGS-001 (как живая
  документация).
- **Коммиты (фронт-часть):** `9fddae4` (RPC + AdminPanel + UI refetch + миграция
  phase 24 + удалён подзаголовок календаря), `f57d087` (204-guard
  в postgrestFetch + удалена кнопка «Смотреть запись»).

- **Phase 25 — pvl_admin_progress_summary RPC + структурные поля.**
  После закрытия BUG-ADMIN-DELETE-USER в этой же сессии прошёл цикл
  recon → план → ревью → apply для FEAT-016/FEAT-017 фундамента.
  Code-recon executor'а (`docs/_session/_02`), DB-recon стратега
  (`_03`), план миграции (`_05`), ревью стратега с поправкой 3.4
  (`_06`), apply-отчёт (`_07`). **Phase 25 миграция applied 2026-05-07
  под gen_user:** `ALTER TABLE pvl_homework_items` добавил
  `module_number int / is_module_feedback bool / updated_at timestamptz`
  (последняя — попутный фикс латентного бага: pre-existing trigger
  `trg_pvl_homework_items_updated_at BEFORE UPDATE` обращался к
  `NEW.updated_at`, но колонки не было — backfill UPDATE падал на
  первом UPDATE). Backfill через regex по `title` для module_number
  (паттерн `'модул[ьюяе]\\s*(\\d+)'`) и ILIKE для is_module_feedback
  («Рефлексия по модулю%», «Анкета обратной связи%») — 6 строк
  module_number / 4 строки is_module_feedback. **Создана RPC**
  `public.pvl_admin_progress_summary(p_cohort_id uuid)` SECURITY
  DEFINER — возвращает jsonb-массив объектов по студентам когорты
  (student_id / full_name / status / cohort_id / mentor_id /
  mentor_name / hw_total / hw_accepted / hw_in_review / hw_revision /
  hw_not_started / hw_overdue / last_activity / module_progress /
  state_line). V1-V6 verify зелёные. Коммит `66c7c0e`.
- **cohort_id recon + backfill.** Apply-отчёт phase 25 выявил
  `pvl_students.cohort_id IS NULL` для всех 22 студентов → RPC
  возвращает [] для любого UUID когорты. Recon executor'а
  (`docs/_session/_09`) нашёл **smoking gun за 5 минут:**
  [`services/pvlMockApi.js:622-628`](../services/pvlMockApi.js#L622-L628)
  хардкодит `cohort_id: null` в self-heal upsert
  `ensurePvlStudentInDb`. UI для назначения когорты в AdminPanel
  отсутствует, frontend cohort-логика крутится через mock seed-id
  `'cohort-2026-1'` с hardcode'ами в 23+ местах. **Backfill applied
  2026-05-07** через `migrations/data/2026-05-07_pvl_students_cohort_backfill.sql`
  (commit `7b832f1`) — 22 строк получили `cohort_id =
  '11111111-1111-1111-1111-111111111101'`. ⚠ Backfill **регрессирует**
  при следующем визите админа в PVL до фикса хардкода —
  заведена `BUG-PVL-COHORT-NULL-OVERWRITE` (P2).
- **Открытия (новые тикеты):**
  - **BUG-PVL-COHORT-NULL-OVERWRITE** (P2) — `ensurePvlStudentInDb`
    хардкодит null. Лечение точечное.
  - **FEAT-019: Сокровищница + маркетплейс практик** (P2-P3) —
    большая фича, ~8-11 сессий. Полное ТЗ в `_10_idea_treasury_marketplace.md`.
  - **INFRA-004 повышен P3 → P1** — реальное проявление
    `Failed to fetch dynamically imported module` у Ольги в
    PVL-учительской после deploy. Фикс в nginx-конфиге фронта.
  - Переименованы: `ARCH-014` → `TECH-DEBT-FK-CONTRACTS`,
    `PROD-005` → `PROD-USER-DELETE-MODEL` (по запросу стратега).
- **Закрытия дополнительные:**
  - **BUG-MEETINGS-VK-BUTTON-OVERFLOW** → DONE (meetings-стратегом,
    commit `62cf08d`, prod smoke 8/8).
- **Прогрессируют:** **FEAT-016 + FEAT-017** → 🟡 IN PROGRESS
  (фундамент готов: phase 25 + backfill); блокер до фикса
  BUG-PVL-COHORT-NULL-OVERWRITE.
- **Все коммиты сессии 2026-05-07** (4 шт., все push'нуты):
  - `9fddae4` — fix: BUG-ADMIN-DELETE-USER + UX подзаголовок календаря.
  - `f57d087` — fix: 204-guard в postgrestFetch + UX кнопка «Смотреть запись».
  - `66c7c0e` — feat: phase 25 — pvl_admin_progress_summary RPC + структурные поля.
  - `7b832f1` — data: backfill pvl_students.cohort_id для активной когорты Поток 1.
- **Артефакты сессии:**
  - `migrations/2026-05-07_phase24_admin_delete_user_rpc.sql`
  - `migrations/2026-05-07_phase25_pvl_admin_progress_summary.sql`
  - `migrations/data/2026-05-07_pvl_students_cohort_backfill.sql`
  - `services/dataService.js` (`deleteUser` → POST RPC + 204-guard)
  - `views/AdminPanel.jsx` (refetch + читаемые тосты)
  - `views/PvlCalendarBlock.jsx` (удалён `<p>` и `<a>` с импортом
    `ExternalLink`)
  - 13 файлов переписки стратег↔executor в `docs/_session/`
    (`_01` через `_13`)
  - `docs/journal/HANDOVER_2026-05-07_session_admin_delete_phase25.md`

#### 2026-05-08
- **INFRA-004 закрыт через тикет в hightek.ru support.** Recon выявил,
  что хостинг — чистый nginx без Apache (`.htaccess` Path B не сработал,
  ISPmanager-панель Path C тоже — нет полей для custom-директив). Path D
  (тикет) сработал: hightek.ru применили nginx-fix
  `Cache-Control: no-cache` на `index.html` + `immutable, max-age=31536000`
  на `/assets/*`. Plus временный workaround commit `2228f70` —
  `<meta http-equiv="Cache-Control" no-cache>` в `index.html` как
  defense-in-depth. Закрыта корневая причина «Failed to fetch dynamically
  imported module» (инцидент 2026-05-07).
- **BUG-PVL-COHORT-NULL-OVERWRITE закрыт** (commit `7c28ed3`). Гибрид
  A+B по плану `_08`: `ensurePvlStudentInDb` резолвит cohort_id через
  `seedCohortIdToSqlUuid` + mentor_id через `uuidOrNull`; передаёт в
  payload только если результат валиден (иначе опускает ключ). PostgREST
  с merge-duplicates на не-переданные поля сохраняет существующее в БД.
  Backfill 2026-05-07 не регрессирует. Lesson:
  `docs/lessons/2026-05-08-pvl-cohort-null-overwrite.md`.
- **FEAT-017 V1 закрыт.** Admin таб «Прогресс ПВЛ» в Garden AdminPanel
  с RPC `pvl_admin_progress_summary`, sortable таблица (10 колонок),
  state-фильтр, GroupProgressBar (4-цветная stacked-полоска) и
  hidden-filter через `hiddenGardenUserIds`. Verified Ольгой —
  13 строк после скрытия Настина фея. Артефакты: `docs/_session/_10..._12_..._15..._17`.
- **CLEAN-013 partial DONE 2026-05-08.** В дополнение к Лене Ф
  (2026-05-07) — удалены LIlia MALONG (дубль), Рита, Екатерина Салама
  через data-миграцию `cleanup_clean013_partial` (commit `296cfb3`).
  Настина фея + Настин фиксик **оставлены как тест-окружение Насти**
  (продуктовое решение Ольги), скрыты через «глазик» в users-табе.
  Также параллельно удалены 5 не-студенческих записей из `pvl_students`
  через миграцию `cleanup_non_student_pvl_records` (commit `e3a992f`):
  1 admin (Зобнина), 1 intern (Ван), 2 mentor (Лузина, Гулякова),
  1 тест-фикстура (Участница). `pvl_students` 22 → 17 → 14.
- **Открытия (новые тикеты):**
  - **BUG-PVL-ENSURE-RESPECTS-ROLE** (P2) — корневая причина попадания
    admin/mentor/intern в `pvl_students`. Cleanup-миграция
    `cleanup_non_student_pvl_records` устраняет симптом, но не
    архитектуру.
  - **FEAT-017-V2-VISUALIZATIONS** (P3, накопительный) — будущие
    визуализации к таблице (heat-map, per-module bars, sparklines).
    Уровень 1 (GroupProgressBar) уже сделан.
  - **PROD-DB-MIGRATE-ISPMANAGER** (P3 idea) — стратегическая идея
    миграции БД с Timeweb Cloud на ISPmanager-shared. Не TODO,
    заводится для запоминания + барьеры.
  - **TEST-INFRA-SETUP** (P3) — настроить vitest, без него любые smoke
    регрессии ловятся только в продакшене.
  - **UX-QUICK-FIXES** добавлен пункт «Колотилова Светлана — убрать
    отчество из profile.name».
- **Закрытия дополнительные:** —
- **Прогрессирует:** **CLEAN-013** → 🟡 PARTIALLY DONE (4/5 user'ов
  закрыты, Настина фея + Настин фиксик оставлены как тест-окружение).
- **Все коммиты сессии 2026-05-08** (7 шт., все push'нуты):
  - `2228f70` — infra: meta-tags Cache-Control в index.html (INFRA-004 workaround).
  - `7c28ed3` — fix: BUG-PVL-COHORT-NULL-OVERWRITE — не затирать cohort_id/mentor_id.
  - `0867aa6` — feat: FEAT-017 — admin таб «Прогресс ПВЛ» с RPC pvl_admin_progress_summary.
  - `e3a992f` — data: cleanup pvl_students от 5 не-студенческих записей.
  - `377a148` — ux: FEAT-017 — общий stacked progress bar группы.
  - `296cfb3` — feat: hidden-filter в FEAT-017 + cleanup CLEAN-013 partial (3 user).
  - (handover commit будет следующим — этот файл).
- **Артефакты сессии:**
  - `migrations/data/2026-05-08_cleanup_non_student_pvl_records.sql`
  - `migrations/data/2026-05-08_cleanup_clean013_partial.sql`
  - `services/pvlMockApi.js` (fix `ensurePvlStudentInDb`)
  - `services/pvlPostgrestApi.js` (`+listCohorts`, `+getAdminProgressSummary`)
  - `views/AdminPvlProgress.jsx` (новый файл, 250+ строк)
  - `views/AdminPanel.jsx` (новый таб + hiddenIds prop)
  - `index.html` (meta-tags Cache-Control)
  - `public/.htaccess` (residual из Path B, безвреден)
  - `docs/lessons/2026-05-08-pvl-cohort-null-overwrite.md`
  - 19 файлов переписки стратег↔executor в `docs/_session/`
    (`_01` через `_19`)
  - `docs/journal/HANDOVER_2026-05-08_session_infra004_pvl_progress.md`
- **Workflow:** второй день в формате `docs/_session/`-переписки между
  стратегом (claude.ai) и executor'ом (Claude Code). Стратег пишет
  файлы напрямую, executor читает с диска. Реально снизил трафик
  копий между чатами в ~2 раза. Держится.

#### 2026-05-10
- **P1-связка MON-001 + INFRA-005 закрыта.** End-to-end путь от
  `window.error` в браузере до сообщения в `@garden_grants_monitor_bot`
  работает. Smoke (Ольга через Claude in Chrome): 3 throw'a → 3 TG
  сообщения, frontend dedup на одинаковом message OK,
  `bundleId = 4ae645bda5dbd2a026871dbe9afb7f9538802a4d` (full SHA из
  GITHUB_SHA через vite define).
- **MON-001:** свой reporter без Sentry — frontend
  (`utils/clientErrorReporter.js`, rate-limit 60s через sessionStorage,
  keepalive fetch, антирекурсия), backend
  (`POST /api/client-error` на `auth.skrebeyko.ru` с per-IP rate-limit,
  лог в `/var/log/garden-client-errors.log`, отправка в TG через
  `https.request({ family: 4 })`), CI (post-deploy smoke check).
  Backend задеплоен через ssh без локального репо
  (`/Users/user/vibecoding/garden-auth/` отстал — TECH-DEBT-AUTH-REPO-SYNC).
- **INFRA-005-SW-CACHE:** закрыт без hardening. Recon показал, что
  текущий `public/sw.js` никогда не кэшировал bundle-запросы — гипотеза
  «зомби-SW у Марины» не подтвердилась. Реальную причину
  ChunkLoadError достанем через MON-001 при первом инциденте.
- **Side-discovery (важное):** в процессе deploy backend нашли
  серверную блокировку `api.telegram.org` — с msk-1-vm-423o доступен
  только один IP (`149.154.167.220`), DNS отдаёт другие → timeout.
  **TG-blackbox 2026-05-06 → 2026-05-10:** `check_grants.sh` 5 раз
  не смог отправить grants-wipe alert. Починено
  `/etc/hosts pin` + `https.request(family:4)` (обходит undici
  happy-eyeballs, который ловит ENETUNREACH на IPv6).
- **Side-discovery (критическое):** видимый из лога monitor'а
  паттерн — **GRANT-wipe authenticated/web_anon ровно в 13:10:01
  UTC каждый день** с 06.05 по 10.05 (5 событий). Recovery
  отрабатывает за 10–20 секунд (SEC-014), но окно outage
  ежедневное. Root cause неизвестна — нужен Timeweb support.
  Заведено INCIDENT-DAILY-GRANTS-WIPE-13:10-UTC (P1).
- **Открытия (новые тикеты):**
  - **INCIDENT-DAILY-GRANTS-WIPE-13:10-UTC** (P1, OPEN) — нужен
    тикет в Timeweb support. Журнал:
    `docs/journal/INCIDENT_2026-05-10_daily_grants_wipe.md`.
  - **INCIDENT-2026-05-10-tg-blackbox** (P1, RESOLVED самим
    заходом) — журнал
    `docs/journal/INCIDENT_2026-05-10_tg_blackbox.md`.
  - **INFRA-007-TG-IP-MONITORING** (P3) — fallback-пул IP для
    TG-API + ротация в /etc/hosts при потере основного.
  - **TECH-DEBT-AUTH-REPO-SYNC** (P3) — синхронизировать
    `/Users/user/vibecoding/garden-auth/` с прод-кодом, чтобы
    править через git, а не scp.
  - **TECH-DEBT-AUTH-BACKUPS-CLEAN** (P3) — журнал
    `docs/journal/TECH_DEBT_2026-05-10_auth_backups_clean.md`.
- **Закрытия:**
  - **MON-001** → 🟢 DONE.
  - **INFRA-005-SW-CACHE** → 🟢 RESOLVED-as-no-action.
- **Все коммиты сессии 2026-05-10** (4 шт., все push'нуты):
  - `eb8dd70` — feat(monitoring): client-side error reporter (MON-001).
  - `5ef8488` — chore(ci): post-deploy smoke check.
  - `aba8384` — chore(docs): _session переписка P1 backend deploy.
  - `4ae645b` — docs(journal): backlog по P1 backend deploy
    (daily wipe + TG blackbox + auth backups).
- **Артефакты сессии:**
  - `utils/clientErrorReporter.js` (новый)
  - `main.jsx`, `components/ErrorBoundary.jsx`, `vite.config.js`
    (изменены)
  - `.github/workflows/deploy.yml` (smoke check)
  - `/opt/garden-auth/server.js` (на сервере, backup
    `.bak.2026-05-10-pre-mon001`)
  - `/etc/hosts` на 5.129.251.56 (pin
    `149.154.167.220 api.telegram.org`)
  - `/etc/logrotate.d/garden-client-errors` (weekly × 8)
  - 5 файлов `docs/_session/2026-05-10_02..._06`
  - 3 журнала в `docs/journal/INCIDENT_2026-05-10_*` +
    `TECH_DEBT_2026-05-10_*`

#### 2026-05-11
- **BUG-PVL-ADMIN-AS-MENTOR-EMPTY (P2) → 🟢 DONE.** Куратор Лиги
  Ирина Одинцова (admin) утром не видела свой список менти в
  учительской ПВЛ. Recon (`_02`) показал: H1-H4 из брифа стратега
  из чтения кода не подтверждались. Сама Ирина в 11:20 написала,
  что список появился через ~2 часа без её действий — это
  подтвердило 1.7a (race condition useMemo + async sync, скрытый
  случайным re-render от Supabase Realtime). Fix:
  **Variant C** (deps на флаги завершения sync:
  `db._pvlGardenApplicantsSynced` + `mentorProfiles.length` +
  `studentProfiles.length` в useMemo
  `MentorMenteesPanel`/`MentorDashboard`) + **Variant B бонус**
  (reportClientError в трёх критичных catch'ах
  `pvlMockApi.js`: hydrate, syncTracker, top-level sync).
- **Orphan DELETE в `pvl_garden_mentor_links`** —
  `student_id=579a3392-...` удалена (UUID не существует в profiles /
  users_auth / pvl_students). 1 DELETE через ssh+psql. Связано с
  TECH-DEBT-FK-CONTRACTS (на student_id нет FK к profiles).
- 📋 **BUG-PDF-EXPORT-OKLAB-FAIL** (P2) — заведено: Tailwind v4
  `oklab()` не парсится html2canvas 1.4.1 → alert в Builder
  PDF-export. MON-001 не ловит (caught).
- 📋 **MON-002-CROSSORIGIN-VISIBILITY** (P2) — заведено:
  «Script error.» без stack в TG. Нужен `crossorigin="anonymous"`
  + CORS-header на /assets/.
- 📋 **PERF-002-LAZY-JSPDF** (P3) — заведено: jspdf (385 KB)
  можно вынести через `await import` в `handleExportPdf`
  (аналогично html2canvas в Phase 2A).
- **CLEAN-015-SUPABASE-REMOVAL — блокер от BUG-PVL-ADMIN-AS-MENTOR-EMPTY
  СНЯТ.** После race-fix Supabase Realtime больше не нужен как
  «случайный спасатель» — можно безопасно мигрировать на polling.
- **Lesson:** `docs/lessons/2026-05-11-pvl-admin-mentor-race-condition.md`.
- **Артефакты сессии:**
  - `views/PvlPrototypeApp.jsx` (Variant C в 2 useMemo)
  - `services/pvlMockApi.js` (Variant B в 3 catch'ах)
  - `docs/lessons/2026-05-11-pvl-admin-mentor-race-condition.md` (new)
  - 4 файла `docs/_session/2026-05-11_01..._04`
- **DEPLOY push-server (заход `_05` strategist):** код задеплоен на
  `5.129.251.56:/opt/push-server/`, systemd unit `push-server.service`
  enabled, порт 8787 живой. Local curl `/api/v1/upcoming.json?days=8`
  → HTTP 200, 7 events. Caddy блок `push.skrebeyko.ru →
  localhost:8787` добавлен, validate OK, reload OK.
  Cert ещё не выпущен — ждём DNS от Ольги (NXDOMAIN ожидаемо).
  Push notifications и Prodamus webhook **выключены** (env-ключи не
  заданы, `PRODAMUS_WEBHOOK_ENABLED=false`). Backup Caddyfile:
  `/etc/caddy/Caddyfile.bak.2026-05-11-pre-push-server`.
- **Открытия (новые тикеты):**
  - **TECH-DEBT-PUSH-SERVER-REPO-SYNC** (P3) — push-server'а под
    git на проде нет, изменения деплоим rsync'ом из репо.
    Аналогично TECH-DEBT-AUTH-REPO-SYNC. В перспективе —
    git-hooks или CI deploy.
  - **TECH-DEBT-PUSH-SERVER-RECONCILE-LOGSPAM** (P3) —
    `runNightlyExpiryReconcile()` в `push-server/server.mjs:407`
    запускается на старте и каждые 24ч независимо от
    `PRODAMUS_WEBHOOK_ENABLED`. Бьёт по `profiles.access_status`
    которой в нашей схеме нет — каждый запуск роняет stack-trace
    в journal. Try/catch ловит, процесс жив, endpoint работает.
    Чинить либо обернуть запуск в `if (webhookEnabled)`, либо
    добавить миграцию с колонкой. Сейчас — log noise.
