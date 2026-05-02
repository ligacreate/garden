---
title: Product Requirements Document — Garden
type: PRD (reverse-engineered)
version: 1.0
created: 2026-05-02
last_updated: 2026-05-02
status: draft (требует валидации с продактом/командой)
source: автоматическая разведка кода + ручной ввод
related_docs:
  - CLAUDE.md
  - docs/PROJECT_PASSPORT.md
  - docs/FEATURES.md
  - docs/SUPABASE_LEGACY_AUDIT.md
---

# Product Requirements Document — Garden

> **⚠️ Важно:** этот PRD создан методом обратного инжиниринга (reverse engineering) на основе анализа существующего кода, а не классическим способом «от продакта к разработке». Он отражает, что **фактически реализовано**, и может расходиться с изначальной продуктовой задумкой. Все спорные моменты помечены как «требует подтверждения».

## Содержание

1. [Vision / Видение продукта](#1-vision--видение-продукта)
2. [Целевая аудитория (по ролям)](#2-целевая-аудитория-по-ролям)
3. [Основные фичи (сгруппированные)](#3-основные-фичи-сгруппированные)
4. [User Stories по ролям](#4-user-stories-по-ролям)
5. [Бизнес-правила (обнаруженные в коде)](#5-бизнес-правила-обнаруженные-в-коде)
6. [Точки расширения (заложено, но не доделано)](#6-точки-расширения-заложено-но-не-доделано)
7. [Технические ограничения (влияют на продукт)](#7-технические-ограничения-влияют-на-продукт)
8. [Открытые вопросы (требуют валидации)](#8-открытые-вопросы-требуют-валидации)
9. [Расхождения с реализацией](#-расхождения-с-реализацией)
10. [Кандидаты на продуктовое решение](#-кандидаты-на-продуктовое-решение)
11. [История изменений](#история-изменений)
12. [Как использовать этот документ](#как-использовать-этот-документ)

---

## 1. Vision / Видение продукта

Закрытая образовательно-менторская платформа для сообщества ведущих групповых встреч: участники проходят курс, ведут собственные встречи, обмениваются знаниями и проходят сертификацию по программе ПВЛ — всё под подпиской через Prodamus.

---

## 2. Целевая аудитория (по ролям)

Иерархия ролей определена в [utils/roles.js:2-19](../utils/roles.js#L2-L19).

| Роль | Уровень | Что делает |
|---|---|---|
| **applicant** | 0 | Кандидат. Только просмотр своего профиля и базовых материалов. Не может создавать встречи. |
| **intern** | 1 | Стажёр. Создаёт и публикует свои встречи, заполняет профиль, читает базу знаний, участвует в чате. |
| **leader** | 2 | Полноценный ведущий. Всё, что intern + CRM (управление своими подопечными), карта ведущих, builder сценариев, leader_signature и leader_reviews в профиле. |
| **mentor** | 3 | Ментор курса ПВЛ. Видит подопечных студентов, проверяет ДЗ, ставит баллы и бонусы, открывает разборы (disputes), ведёт review-queue. |
| **curator** | 4 | Куратор региона. Видит всех ведущих и встречи, может управлять региональным составом. *(Точные права требуют подтверждения от продакта — в коде уровень есть, но отдельных view-веток мало.)* |
| **admin** | 99 | Полный доступ: CRUD пользователей, статистика встреч, импорт базы знаний и практик, управление контентом ПВЛ, обход RLS через `is_admin()` и `has_platform_access()`. |

---

## 3. Основные фичи (сгруппированные)

### A. Идентификация и профиль

- Регистрация/вход по email + password ([services/dataService.js:390-411](../services/dataService.js#L390-L411)).
- Профиль: name, city, dob, skills (массив), offer, unique_abilities, join_date, telegram, avatar.
- Авторская подпись и отзывы (`leader_signature`, `leader_reviews`) — для ведущих.
- Друидский гороскоп по дате рождения ([utils/druidHoroscope.js](../utils/druidHoroscope.js)) — назначает «дерево», влияет на оформление дашборда.

### B. Встречи и публичное расписание

- CRUD встреч в [views/MeetingsView.jsx](../views/MeetingsView.jsx) (1748 строк): дата, время, таймзона, город, адрес, формат (offline/online/hybrid), стоимость, гости, доход, описание, обложка с фокусом X/Y.
- Статусы встречи: `pending | planned | completed | cancelled`.
- Чек-бокс `is_public` → триггер `sync_meeting_to_event()` ([migrations/03_enable_public_schedule.sql:74-144](../migrations/03_enable_public_schedule.sql#L74-L144)) синхронизирует встречу в публичную таблицу `events`.
- Публичный календарь городов: `city_key`, `online_visibility = online_only | all_cities` ([migrations/14_schedule_city_contract.sql](../migrations/14_schedule_city_contract.sql)).
- Аналитика встреч: суммы дохода/гостей по периодам, городам, ведущим (в AdminPanel).

### C. База знаний и курсовая библиотека

- Админская библиотека материалов с категориями (доказательная база, карта практик, безопасность, мифы, mentor materials, MAK, телесные практики и др.) — [views/CourseLibraryView.jsx](../views/CourseLibraryView.jsx).
- Прогресс прохождения: уникальный индекс `(user_id, material_id, course_title)` в [migrations/16_course_progress_rls.sql:4-9](../migrations/16_course_progress_rls.sql#L4-L9).
- Импорт через CSV-paste в админке.
- Rich-content санитизация: DOMPurify + `normalizeLegacyRichContent()`.
- Скрытие целых курсов в сайдбаре пользователя.

### D. Практики

- Отдельный раздел [views/PracticesView.jsx](../views/PracticesView.jsx).
- Импорт из Notion CSV (есть файл-образец в репо).
- Поля: title, content, category, tags[].

### E. Builder сценариев

- [views/BuilderView.jsx](../views/BuilderView.jsx) (1184 строки): timeline-конструктор `{title, description, type, time, icon}`.
- Drag-reorder, экспорт в PDF, public/private флаг.

### F. Чат / сообщения

- Realtime через Supabase channel ([views/CommunicationsView.jsx](../views/CommunicationsView.jsx)).
- Текст + изображение, edit, soft-delete (`deleted_at`).
- Лимит сообщения: **2000 символов** ([services/dataService.js:240](../services/dataService.js#L240)).

### G. Карта и страница ведущего

- [views/MapView.jsx](../views/MapView.jsx) — географический срез ведущих по городам.
- [views/LeaderPageView.jsx](../views/LeaderPageView.jsx) — публичная карточка ведущего: подпись, отзывы, его встречи.

### H. Push-уведомления

- Отдельный Express-сервис `push-server/`, VAPID, таблица `push_subscriptions` ([migrations/20_push_subscriptions.sql](../migrations/20_push_subscriptions.sql)).
- Поддержка десктопных браузеров и iOS PWA.

### I. Биллинг (Prodamus)

- Webhook → [push-server/billingLogic.mjs](../push-server/billingLogic.mjs) → запись в `subscriptions`, `billing_webhook_logs`, обновление `profiles.access_status` / `subscription_status` / `paid_until` / `session_version`.
- Глобальный RLS-гейт через `has_platform_access(uuid)` ([migrations/21_billing_subscription_access.sql:83-99](../migrations/21_billing_subscription_access.sql#L83-L99)).
- На фронте только [views/SubscriptionExpiredScreen.jsx](../views/SubscriptionExpiredScreen.jsx) с ссылкой на продление через бота (`bot_renew_url`).

### J. Курс ПВЛ (полу-изолированный модуль)

- 20 недель × уроки × домашки × контрольные точки × сертификация. Полностью в одном файле [PvlPrototypeApp.jsx](../PvlPrototypeApp.jsx) (4164 строки) + 6 sub-view.
- Роли внутри ПВЛ: студент / ментор / админ.
- Студент: личный кабинет, трекер недель, страница задачи + сабмишены, СЗ-самооценка, очки.
- Ментор: review-queue, карточка подопечного, бонусные баллы, открытие disputes.
- Админ ПВЛ: студенты, менторы, контент, календарь когорты.
- Бэкенд: **mock в памяти** ([services/pvlMockApi.js](../services/pvlMockApi.js), 1477 строк). SQL-схема существует ([database/pvl/migrations/001_pvl_scoring_system.sql](../database/pvl/migrations/001_pvl_scoring_system.sql)), но не подключена.

### K. Админ-панель

- [views/AdminPanel.jsx](../views/AdminPanel.jsx) (1333 строки): пользователи (CRUD, смена роли), статистика встреч (по периодам/городам/ведущим), импорт знаний и практик.

### L. Новости

- [views/NewsView.jsx](../views/NewsView.jsx) — лента анонсов от админа (rich HTML).

### M. Цели

- Таблица `goals` есть, dataService-обёртки есть, **выделенного UI не обнаружено** *(требует подтверждения от продакта — это backlog или legacy?)*.

---

## 4. User Stories по ролям

### Applicant

- Как кандидат, я хочу создать профиль и заполнить базовые поля, чтобы попасть в систему.
- Как кандидат, я хочу видеть свой друидский тип, чтобы получить персонализированный onboarding.

### Intern (стажёр)

- Как стажёр, я хочу создать встречу с обложкой, ценой и форматом (offline/online/hybrid), чтобы вести группу.
- Как стажёр, я хочу пометить встречу как публичную, чтобы она появилась в общем расписании городов.
- Как стажёр, я хочу читать материалы курсовой библиотеки и видеть свой прогресс.
- Как стажёр, я хочу писать в общий чат с возможностью редактировать и удалять свои сообщения.

### Leader

Всё, что у Intern, плюс:

- Как ведущий, я хочу собрать сценарий встречи в Builder и экспортировать его в PDF.
- Как ведущий, я хочу видеть свою публичную страницу с подписью и отзывами, чтобы делиться ей.
- Как ведущий, я хочу видеть карту других ведущих и фильтровать их по городу.
- Как ведущий, я хочу аналитику своих встреч (доход, число гостей за период).

### Mentor (ПВЛ)

- Как ментор, я хочу видеть всех своих подопечных студентов с их статусом и риск-уровнем.
- Как ментор, я хочу заходить в сабмишен ДЗ, ставить баллы (с учётом `mentor_bonus_score`) и менять статус (`accepted | revision | rejected`).
- Как ментор, я хочу проводить менторскую часть СЗ-оценки (9 критериев × 0–3).
- Как ментор, я хочу открывать разборы (`pvl_student_disputes`) по сабмишенам.

### Curator

- Как куратор, я хочу видеть встречи и активность ведущих в моём регионе. *(Точные пермишны требуют подтверждения от продакта — отдельных view не нашли, уровень доступа выше leader.)*

### Admin

- Как админ, я хочу создавать/редактировать пользователей и менять их роли.
- Как админ, я хочу импортировать материалы базы знаний и практик массово.
- Как админ, я хочу видеть статистику по встречам за произвольный период с разбивкой по городам и ведущим.
- Как админ, я хочу управлять курсом ПВЛ (студенты, менторы, контент, календарь).

### Подписчик (любой роли)

- Как подписчик, я хочу видеть, что моя оплата прошла (Prodamus → webhook → `paid_until` обновлён).
- Как пользователь с истекшей подпиской, я хочу видеть экран продления вместо платформы.

---

## 5. Бизнес-правила (обнаруженные в коде)

### Лимиты

- Сообщение в чате не может быть длиннее 2000 символов ([services/dataService.js:240](../services/dataService.js#L240)).
- Изображение обложки встречи ресайзится до ширины 1200 px и сохраняется в JPEG q=0.82 ([services/dataService.js:1154](../services/dataService.js#L1154)).
- Auth-действия ограничены частотой: не чаще 1 раза в 60 секунд, до 5 в минуту; запись в БД троттлится с задержкой 2000 мс ([services/dataService.js:667](../services/dataService.js#L667)).
- Координаты фокуса изображения (`image_focus_x`, `image_focus_y`) находятся в диапазоне 0–100, по умолчанию 50 ([migrations/11_events_image_focus.sql:4-5](../migrations/11_events_image_focus.sql#L4-L5)).

### Статусы

- **Встреча:** `pending | planned | completed | cancelled` (UI-цвета: amber / blue / green / gray).
- **profiles.access_status:** `active | paused_expired | paused_manual` ([migrations/21_billing_subscription_access.sql:30](../migrations/21_billing_subscription_access.sql#L30)).
- **profiles.subscription_status:** `active | overdue | deactivated | finished` ([migrations/21:39](../migrations/21_billing_subscription_access.sql#L39)).
- **PVL submission:** `draft | submitted | in_review | revision | accepted | rejected | overdue` ([001_pvl:88](../database/pvl/migrations/001_pvl_scoring_system.sql#L88)).
- **PVL student:** `active | paused | finished | certified` ([001_pvl:28](../database/pvl/migrations/001_pvl_scoring_system.sql#L28)).
- **PVL certification:** `not_started | in_progress | submitted | accepted | revision | failed`.
- **Meeting format:** `offline | online | hybrid`.
- **Online visibility:** `online_only | all_cities`.

### Биллинг и доступ

- Глобальный RLS-гейт `has_platform_access()` навешен на 13 таблиц как restrictive policy ([migrations/21:120-169](../migrations/21_billing_subscription_access.sql#L120-L169)). Если `access_status ∉ {active, NULL}` и роль ≠ admin — read/write заблокированы.
- `session_version` инкрементируется при пересмотре доступа; клиент обязан инвалидировать сессию.
- Webhook от Prodamus идёт в push-server, не в Supabase Edge Function.

### Сертификация ПВЛ

- Самооценка СЗ: 9 критериев × 0–3 балла = max 27 self + 27 mentor = **54 суммарно** ([001_pvl:168-186](../database/pvl/migrations/001_pvl_scoring_system.sql#L168-L186)).
- Домашка: `max_score` по умолчанию 20, `revision_cycles` считается, `mentor_bonus_score ≥ 0`.
- `critical_flags_count` — подсчёт «красных флагов» при допуске к сертификации.
- Курс целиком: упоминается порог **400 баллов** в TODO внутри [PvlStudentCabinetView.jsx](../views/PvlStudentCabinetView.jsx) *(точное значение требует уточнения — итог считается правилами в `data/pvl/scoringRules.js`)*.

### Soft-delete

- Сообщения: фильтр `deleted_at IS NULL` на чтении, удаление помечает запись ([migrations/17:11](../migrations/17_create_messages_chat.sql#L11)).

### Sync встреч → events

- Синхронизация выполняется только при `is_public = true`.
- City fallback: `meeting.city → profile.city → 'Online' / 'Онлайн'` (по формату).
- Если в названии города есть «online/онлайн» — `meeting_format` автоматически становится `online`.
- `city_key` — нормализованный slug (lowercase, кириллица → латиница, дефисы).

---

## 6. Точки расширения (заложено, но не доделано)

| # | Что | Статус | Источник |
|---|---|---|---|
| 1 | **MarketView.jsx** «Магазин» | заглушка `<p>Магазин</p>` | [views/MarketView.jsx](../views/MarketView.jsx) |
| 2 | **UI управления подпиской** (пауза, отмена, смена тарифа) | отсутствует | в коде только экран продления |
| 3 | **Goals** (цели пользователя) | таблица + API есть, UI не найден | [services/dataService.js](../services/dataService.js) |
| 4 | **PVL — реальная БД** | SQL-схема есть, приложение работает на mock в памяти | [services/pvlMockApi.js](../services/pvlMockApi.js) |
| 5 | **Legacy-поля профиля** `x`, `y`, `tree_desc`, `telegram_link` | объявлены, но не используются | CLAUDE.md:83 |
| 6 | **Таблица clients** | в RLS-списке ([migrations/21:130](../migrations/21_billing_subscription_access.sql#L130)), миграции создания и UI не найдены | требует уточнения |
| 7 | **birthday_templates** | в RLS-списке, миграции не нашли | требует уточнения |
| 8 | **`/sw.js` service worker** | регистрируется в main.jsx, в исходниках нет — генерится на build | CLAUDE.md:88 |
| 9 | **Тесты** | только `push-server/billingLogic.test.mjs`, фронт-тестов нет | package.json |
| 10 | **`.env.example`** | отсутствует, fallback-домены захардкожены | services/dataService.js:7-9 |
| 11 | **PRD/документация** | `docs/PRD.md` отмечен как TODO в CLAUDE.md | CLAUDE.md:104 |
| 12 | **Куратор (curator)** — отдельные экраны/инструменты регионального управления | роль есть, выделенного UI не обнаружено | требует уточнения |

---

## 7. Технические ограничения (влияют на продукт)

1. **Монолитные компоненты** ограничивают скорость изменений:
   - [PvlPrototypeApp.jsx](../PvlPrototypeApp.jsx) — 4164 строки.
   - [services/dataService.js](../services/dataService.js) — 2461 строка (auth + API + upload + image processing вместе).
   - [views/MeetingsView.jsx](../views/MeetingsView.jsx) — 1748 строк.
   - Любой рефакторинг — высокорисковый, тестов нет.

2. **Нет TypeScript / Zod** — контракты неявные, валидация ручная (regex, length-checks). Несостыковки БД ↔ UI ловятся только на проде.

3. **PVL — на mock-данных** ([services/pvlMockApi.js](../services/pvlMockApi.js), 1477 строк). Все действия студентов и менторов теряются при перезагрузке. Это **прототип**, не продакшн-курс.

4. **localStorage ↔ Supabase легко расходятся** — переключатель `useLocalDb`, ключи `garden_*` дублируют состояние из БД (auth, профиль, сообщения, шаблоны). Bug-prone при правках кеширования.

5. **Транзакций нет**: create-встречи и upload-обложки — два разных вызова. Возможны half-states (запись без картинки или картинка без записи).

6. **Три разных fetch-обёртки** (`postgrestFetch`, `authFetch`, `pushFetch`) — добавление общего поведения (ретраи, версионирование, observability) требует тройной правки.

7. **Глобальный RLS-гейт** `has_platform_access()` навешен restrictive-политикой на 13 таблиц. Если логика биллинга сломается — платформа недоступна целиком; диагностика по таблицам затруднена.

8. **Realtime-канал переименовывается через `Date.now()`** на каждое сообщение — потенциальная проблема масштабирования при росте параллельных пользователей.

9. **Нет ErrorBoundary, нет retry** — 186 `console.*`, ошибки часто показываются через `alert()` или молча проглатываются (CLAUDE.md:44).

10. **Биллинг-вебхук в push-server, а не в Supabase Edge Function** — это отдельный сервис, отдельный деплой, отдельная точка отказа.

11. **Source-of-truth размыт**: profiles в Supabase, App.jsx state, localStorage и `data/INITIAL_USERS` (CLAUDE.md:44). Любые правки модели данных требуют согласования всех четырёх слоёв.

12. **Хардкод prod-доменов** (`https://api.skrebeyko.ru`, `https://auth.skrebeyko.ru`) в fallback ([services/dataService.js:7-9](../services/dataService.js#L7-L9)) — препятствие для staging-окружения.

---

## 8. Открытые вопросы (требуют валидации)

## 📝 Открытые вопросы и допущения

- ❓ **Права куратора (curator, level 4)** → к продакту → выделенных view-веток для роли в коде не нашли. Нужно понять, чем куратор отличается от leader на практике.
- ❓ **Точный порог в 400 баллов для курса ПВЛ** → к ПВЛ-команде → значение упомянуто в TODO внутри `PvlStudentCabinetView.jsx`, реальные числа лежат в `data/pvl/scoringRules.js`. Нужно подтвердить, является ли 400 целью продукта или плейсхолдером.
- ❓ **Назначение таблиц `clients` и `birthday_templates`** → к команде backend / продакту → упомянуты в RLS-списке миграции 21, но миграций создания и UI не нашли. Что это: остатки прошлой версии или backlog?
- ❓ **Статус Goals** → к продакту → таблица и API есть, UI отсутствует. Нужно решить: достроить, удалить или это backlog.
- ❓ **MarketView («Магазин»)** → к продакту → заглушка. Фича в работе, замороженный концепт или удалить?
- ❓ **Является ли PVL отдельным продуктом** → к продакту/команде → сейчас он полу-изолирован, на mock. Нужен план: переезд на реальную БД, выделение в отдельный модуль/SPA или объединение с основным UserApp.
- ❓ **План работы с legacy-полями профиля** (`x`, `y`, `tree_desc`, `telegram_link`) → к продакту → удалить из БД и UI или оставить?
- ❓ **Уровень курсов и материалов библиотеки** → к продакту → формализованной модели «курс → модуль → материал» в БД нет, всё через `course_title` строкой. Нужна ли нормализованная иерархия?

---

## 🔍 Расхождения с реализацией

- **Биллинг без UI управления.** Prodamus webhook принимает оплату и обновляет `profiles.access_status` / `subscription_status`, но в UI пользователь не может посмотреть детали подписки, отменить её или сменить тариф самостоятельно. Единственный экран — `SubscriptionExpiredScreen` со ссылкой на бот.
- **PVL декларирует БД, использует mock.** Миграция [database/pvl/migrations/001_pvl_scoring_system.sql](../database/pvl/migrations/001_pvl_scoring_system.sql) описывает полноценную схему с RLS и триггерами, но приложение читает/пишет в память через [services/pvlMockApi.js](../services/pvlMockApi.js). Любое продуктовое решение по ПВЛ висит в воздухе до решения этого расхождения.
- **Goals в БД, без UI.** Таблица `goals` существует, методы dataService есть — пользователь не может их использовать.
- **Curator как роль в коде, без отдельного опыта.** Уровень доступа выше leader зашит в [utils/roles.js](../utils/roles.js), но просмотровых/управленческих веток UI почти нет.
- **Legacy-поля профиля.** В БД `x`, `y`, `tree_desc`, `telegram_link` живут, но UI их не использует. Любая новая фича может ошибочно опереться на них.
- **Глобальный RLS-гейт vs. ожидания пользователя.** `has_platform_access()` блокирует чтение даже своего профиля при просрочке оплаты. UX продление подписки исходит из того, что пользователь видит только экран продления — это согласовано, но любой fallback (например, Settings) сломается без отдельной политики.
- **Push-server как точка для биллинга.** Webhook Prodamus в Express-сервисе, а не в Supabase Edge Function — обработка платежа зависит от отдельного процесса. Это противоречит идее «всё на Supabase».

---

## 📌 Кандидаты на продуктовое решение

- **PVL: достроить или вырезать в отдельный продукт.**
  - Оставить как есть → mock и десинк продолжат расти.
  - Подключить реальную БД → проектирование, миграции, RLS, переход с mock.
  - Вынести в отдельный SPA → освободит основной UserApp.
- **MarketView («Магазин»):** оставить заглушку, доработать или удалить из навигации.
- **Goals:** достроить минимальный UI, скрыть в админке или удалить таблицу.
- **Управление подпиской в UI:** добавить экран статуса/паузы/отмены подписки или явно делегировать боту/Prodamus.
- **Legacy-поля профиля (`x`, `y`, `tree_desc`, `telegram_link`):** удалить из миграцией с зачисткой данных или формализовать назначение.
- **Curator:** определить отдельный набор инструментов (региональная аналитика, модерация, разборы) или свернуть роль в leader/admin.
- **Decomposition монолитов** ([PvlPrototypeApp.jsx](../PvlPrototypeApp.jsx), [services/dataService.js](../services/dataService.js), [views/MeetingsView.jsx](../views/MeetingsView.jsx)): признать как технический долг и поставить в роадмап (или явно отложить).
- **Биллинг-вебхук:** оставить в push-server или мигрировать в Supabase Edge Function (повлияет на инфраструктуру).
- **Курсы и материалы:** оставить плоскую модель через `course_title` или ввести нормализованные `courses` / `modules`.

---

## История изменений

- 2026-05-02 (v1.0): Первичная версия, reverse-engineered из кода на baseline до code review.

---

## Как использовать этот документ

- **Для разработчиков:** понимание продуктового намерения за фичами.
- **Для AI-ассистента:** контекст при работе над фичами и багфиксами.
- **Для новых членов команды:** введение в продукт.
- **Для продакта:** основа для валидации и обновления.

При обновлении документа:

1. Меняй `last_updated` в frontmatter.
2. Поднимай `version` (1.0 → 1.1 для правок, → 2.0 для крупных изменений).
3. Добавляй запись в «Историю изменений».
4. Если меняется статус (`draft → validated → outdated`) — обнови поле `status`.
