---
title: Project Passport — Garden
created: 2026-05-02
last_updated: 2026-05-02
status: baseline (до code review)
---

# Паспорт проекта: Garden

## 1. Стек и инфраструктура

### Язык(и) и версии
- **JavaScript/JSX** (ES2020+, ECMAScript modules)
- **Node.js** (`"type": "module"` в package.json)
- Типизация: отсутствует (нет TypeScript, нет JSDoc-аннотаций)

### Фреймворк и версия
- **React 19.2.0**
- **Vite 7.2.4** (bundler + dev server)
- **@vitejs/plugin-react 5.1.1**
- Примечание: `tailwind.config.js` ссылается на `src/`, но реальная структура без `src/` — файлы в корне.

### Рендер-стратегия
- **CSR (Client-Side Rendering)** исключительно
- SPA с роутингом через состояние (`viewMode` в App.jsx)
- No SSR, SSG, ISR, RSC

### Backend
- **Отдельный мини-сервис** в [push-server/](../push-server/) (Express)
- Основной API — **PostgREST поверх Supabase** через [services/dataService.js](../services/dataService.js)
- Endpoints: `VITE_POSTGREST_URL`, `VITE_AUTH_URL`, `VITE_PUSH_URL`

### БД и ORM
- **Supabase (PostgreSQL)** — источник истины
- **PostgREST** как REST поверх схемы `public`
- **Без ORM** — прямой fetch + JSON
- Таблицы: `profiles`, `meetings`, `events`, `knowledge_base`, `practices`, `clients`, `scenarios`, `goals`, `course_progress`, `messages`, `news`, `birthday_templates`, `push_subscriptions`, `subscriptions`, `billing_webhook_logs`

### Аутентификация
- **Custom JWT** в `localStorage` (`garden_auth_token`)
- **Fallback: Supabase Auth** для realtime-канала
- Без NextAuth, Clerk, Auth0
- Роль хранится в `profiles.role`

### State management
- **React Context API** + локальный `useState`
- Корневое состояние в App.jsx: `currentUser`, `users`, `knowledgeBase`, `news`, `librarySettings`, `viewMode`, `notification`, `accessBlock`
- Без Redux/Zustand/Jotai

### Data fetching
- Кастомные обёртки `postgrestFetch`, `authFetch`, `pushFetch`
- **Supabase Realtime** для чата (таблица `messages`)
- Без React Query, SWR, tRPC

### UI библиотека
- **Tailwind CSS 4.1.17** + postcss + autoprefixer
- **lucide-react 0.555.0** (иконки)
- **tailwindcss-animate**
- Кастомные компоненты (Button, Input, Card, Modal, RichEditor)
- Без shadcn/MUI/Chakra

### Формы
- Нативные HTML input/textarea
- Ручной `useState` per-field
- Без react-hook-form / Formik

### Валидация
- Без Zod/Yup/Joi
- Inline regex и length-checks в обработчиках
- Часть валидации — в RLS на стороне БД

### Файловые аплоады
- `browser-image-compression` для сжатия
- **Supabase Storage** через `/storage/sign` (signed URL → PUT)
- Поддержка JPEG/PNG/WebP

### Реалтайм
- Supabase Realtime в [services/realtimeMessages.js](../services/realtimeMessages.js)
- Канал `messages-feed-*`, события postgres_changes (INSERT/UPDATE/DELETE)
- Используется в CommunicationsView.jsx

### Очереди / cron
- Не обнаружено

### Кеш
- `localStorage` (settings, session, chat, users, KB)
- Ключи: `garden_auth_token`, `garden_library_settings`, `garden_chat_messages`, `garden_users`, `garden_knowledgeBase`, `pvl_dev_tools`
- Без Redis/Memcached/HTTP cache headers

### Тестирование
- `npm run build` в CI
- `npm run verify:garden` — статическая проверка изоляции PVL-модуля
- `push-server/billingLogic.test.mjs` — ручные node-тесты биллинга
- Без Jest/Vitest/Playwright/Cypress

### Мониторинг
- Не обнаружено (нет Sentry/LogRocket/DataDog)
- 186 вхождений `console.*` в коде

---

## 2. Архитектура кода

### Структура верхнего уровня
```
/garden
├── assets/              # изображения, SVG
├── components/          # переиспользуемые UI (Button, Card, Modal, ...)
├── data/                # mock-данные и константы
│   ├── data.js          # INITIAL_USERS, INITIAL_KNOWLEDGE
│   └── pvl/             # данные для PVL-модуля
├── database/            # SQL seed/migration отдельного PVL-модуля
├── docs/                # документация (RLS audit, billing, lessons)
├── goroscop/            # 22 .webp дерево-гороскопа
├── leader-page-mvp/     # MVP leader page (legacy)
├── migrations/          # 21+ SQL миграций Supabase
├── push-server/         # Express для web push + billing webhooks
├── public/              # static (manifest, sw.js)
├── scripts/             # build/verify
├── selectors/           # pvlCalculators.js
├── services/            # API clients (dataService, realtimeMessages, pvlMockApi)
├── trees/               # 7 PNG деревьев
├── utils/               # roles, timezone, skills, cost...
├── views/               # экраны (~26 jsx)
├── App.jsx
├── main.jsx
├── index.html
├── vite.config.js
├── package.json
└── tailwind.config.js
```

### Паттерн организации
- **Гибрид feature-based + layer-based**
  - `views/` — экраны по фиче (MeetingsView, ProfileView, AdminPanel)
  - `components/` — переиспользуемый UI
  - `services/` — API-клиенты, бизнес-логика
  - `utils/` — хелперы (roles, timezone, cost)
  - `data/` — mock + константы

### Где API-роуты
- **Backend:** [push-server/server.mjs](../push-server/server.mjs)
  - `/health`, `/push/public-key`, `/push/subscribe`, `/push/unsubscribe`, `/push/news`
  - `/api/billing/prodamus/webhook`, `/webhooks/prodamus`
- **Frontend → PostgREST:** таблицы используются как роуты (`/profiles`, `/meetings`, `/knowledge_base`, ...) через `postgrestFetch`

### Где бизнес-логика
- **App.jsx** — оркестрация состояния
- [services/dataService.js](../services/dataService.js) (~2461 строк) — все запросы, upload, push-подписка
- [services/pvlMockApi.js](../services/pvlMockApi.js) (~1477 строк) — mock-API для PVL
- `pvlAppKernel.js` — навигация и валидация роутов PVL
- [push-server/server.mjs](../push-server/server.mjs) — push send, Prodamus webhook
- [push-server/billingLogic.mjs](../push-server/billingLogic.mjs) — управление доступом по подписке

### Где типы и схемы
- TypeScript нет, Zod нет
- Константы: `ROLES` в [utils/roles.js](../utils/roles.js), `ACCESS_STATUS`, `SUBSCRIPTION_STATUS` в dataService.js
- Источник истины для контроля — RLS-политики в БД (миграция 21)

### Разделение backend/frontend/shared
- **Backend:** `push-server/` (отдельный npm-пакет)
- **Frontend:** всё остальное в корне
- **Shared:** отсутствует — каждый слой дублирует своё

---

## 3. Модель данных

### Сущности

1. **profiles**
   - id (uuid, PK), email, name, password
   - role (`applicant|intern|leader|mentor|curator|admin`)
   - status, city, avatar_url, dob, join_date
   - skills (text[]), offer, unique_abilities
   - tree, tree_desc, seeds (int), x, y (numeric)
   - access_status (`active|paused_expired|paused_manual`)
   - subscription_status (`active|overdue|deactivated|finished`)
   - paid_until, prodamus_subscription_id, prodamus_customer_id, last_payment_at, bot_renew_url, session_version
   - telegram_link

2. **meetings** — id, user_id (FK profiles), date, time, title, speaker, city, address, description, cost, payment_link, cover_image, is_public, timezone, duration, created_at, updated_at. RLS: владельцы + публичные.

3. **events** — id, garden_id (FK meetings), date, time, title, speaker, category, city, location, description, price, registration_link, image_url, image_gradient. Синхронизируется триггером из `meetings`.

4. **knowledge_base** — id, title, section, content (HTML), timestamps. RLS: read for authenticated, write for owners.

5. **practices** — id, title, description, content, status (`draft|published`), icon, is_beginner_friendly, difficulty_level, estimated_duration, tags, author_id?, timestamps.

6. **scenarios** — id, title, author_name, timeline (jsonb), created_at.

7. **goals** — id, user_id (FK profiles), title, description, status, progress_percent, timestamps. RLS: владельцы + supervisors.

8. **course_progress** — id, user_id, course_id, module_id, lesson_id, completed_at. RLS: владельцы + instructors.

9. **messages** — id, author_id (FK profiles), author_name, text, created_at, edited_at, deleted_at. Realtime, индексы по created_at/author_id.

10. **clients** — упоминается в RLS-аудите, структура не видна в migrations.

11. **news** — упоминается, структура не видна.

12. **birthday_templates** — упоминается в RLS-аудите.

13. **push_subscriptions** — id, user_id, endpoint (PK, unique), keys (jsonb), user_agent, is_active, timestamps.

14. **subscriptions** — id, user_id, provider (`prodamus`), provider_subscription_id, status, paid_until, last_payment_at, ended_at, timestamps.

15. **billing_webhook_logs** — id, provider, event_name, external_id, payload_json, signature_valid, is_processed, error_text, created_at.

### Связи
- profiles 1:N → meetings, goals, course_progress, messages, push_subscriptions, subscriptions
- meetings 1:1 → events (через триггер)
- M:N таблиц нет (skills/tags хранятся как массивы внутри `profiles`/`practices`)

### Домены
- **Основной «Сад»:** profiles, meetings, events, knowledge_base, practices, scenarios, goals, messages, news, push_subscriptions, subscriptions
- **PVL-модуль (отдельно):** `database/pvl/migrations/001_pvl_scoring_system.sql` — собственная схема (students, tasks, submissions)

### Enum ролей
```
applicant (0) → intern (1) → leader (2) → mentor (3) → curator (4) → admin (99)
```

### Soft delete / timestamps / статусы
- Soft delete: `deleted_at` в `messages`
- Timestamps: `created_at`, `updated_at` (timestamptz) — везде
- Статусы: `profiles.status`, `practices.status`, `goals.status`, `subscriptions.status`, `access_status`

---

## 4. Роли и права доступа

### Иерархия
```
applicant (0) → intern (1) → leader (2) → mentor (3) → curator (4) → admin (99)
```
`hasAccess(userRole, requiredRole)` проверяет `userLevel >= requiredLevel`.

### Где логика прав
1. **Frontend** [utils/roles.js](../utils/roles.js): ROLES_CONFIG (label/color), `hasAccess()`
2. **Frontend** [App.jsx](../App.jsx): условный рендер AdminPanel vs UserApp, fallback на SubscriptionExpiredScreen
3. **Backend (RLS):** миграция 21 добавляет restrictive policies на 13 таблиц через функцию `has_platform_access(target_user uuid)`:
   ```sql
   p.role = 'admin' OR p.access_status = 'active'
   ```
4. **Push-server** [billingLogic.mjs](../push-server/billingLogic.mjs): `deriveAccessMutation()` обновляет `access_status` по событиям Prodamus.

### Определение роли
- На сервере — `profiles.role` (источник истины)
- На клиенте — загружается в `currentUser` при init (App.jsx useEffect)
- При login dataService устанавливает роль (default `applicant`)

### Защита API
- Frontend передаёт `Authorization: Bearer ${token}`
- PostgREST проверяет токен и применяет RLS
- Push-server валидирует `ADMIN_PUSH_TOKEN` для `/push/news` и подпись Prodamus для webhook

---

## 5. Ключевые пользовательские потоки

### 5.1. Авторизация
```
AuthScreen → api.login(email, password)
  → authFetch POST /auth/login → { token, user }
  → setAuthToken(token) [localStorage]
  → setCurrentUser(user)
  → role === 'admin' ? AdminPanel : UserApp
  → access_status !== 'active' ? SubscriptionExpiredScreen
```

### 5.2. Создание встречи
```
UserApp → MeetingsView (role >= intern)
  ↓ form (title, date, time, city, address, description, image)
  → api.uploadMeetingImage(file)
    → browser-image-compression
    → requestSignedUrl('meetings', fileName) [POST /storage/sign]
    → fetch PUT uploadUrl
  → api.createMeeting({...cover_image: publicUrl})
    → postgrestFetch('meetings', {}, POST)
    → trigger on_meeting_change_sync_event → INSERT/UPDATE events
```

### 5.3. Публичные события
```
MarketView → postgrestFetch('events', { order: 'date.desc' })
  → RLS: SELECT public
  → cards с фильтром по городу, поиском
```

### 5.4. Курирование встреч ментором
```
MeetingsView (role >= leader)
  → list meetings (own + is_public)
  → api.updateMeeting(id, { is_public, ... })
    → postgrestFetch('meetings', { id: 'eq.'+id }, PATCH)
    → триггер обновляет/удаляет events
```

### 5.5. Knowledge Base
```
CourseLibraryView
  → api.getKnowledgeBase()
    → postgrestFetch('knowledge_base', { select: '*', order: 'created_at.desc' })
  → admin: create/update/delete
  → content: HTML из RichEditor → DOMPurify.sanitize() → normalizeLegacyRichContent()
```

### 5.6. Чат (Realtime)
```
CommunicationsView
  → subscribeToMessages({ onInsert, onUpdate, onDelete })
    → supabase.channel('messages-feed-'+Date.now())
      .on('postgres_changes', { event: 'INSERT', table: 'messages' }, ...)
  → api.createMessage(text) → postgrestFetch('messages', {}, POST)
  → localStorage cache: load/saveLocalMessages()
```

### 5.7. Web Push
```
App.jsx init
  → isPushSupported() + localStorage check
  → showPushPrompt() → Notification.requestPermission()
  → navigator.serviceWorker.ready → reg.pushManager.subscribe()
  → api.subscribeToPush({ subscription, user_id })
    → POST /push/subscribe → INSERT push_subscriptions
  → admin: api.sendPushNews(title, body)
    → POST /push/news (ADMIN_PUSH_TOKEN)
    → backend: webpush.sendNotification() для каждой подписки
```

### 5.8. Профиль
```
ProfileView
  → currentUser из state
  ↓ form (name, email, city, avatar, dob, tree, abilities, skills, offer)
  → avatar upload (compress → sign → PUT)
  → api.updateUser(userId, {...})
    → postgrestFetch('profiles', { id: 'eq.'+userId }, PATCH)
  → tree из getDruidTree(dob) [utils/druidHoroscope.js]
```

> Ноут: явных «студент сдаёт ДЗ → ментор проверяет» потоков в основной схеме не обнаружено — соответствующая логика частично инкапсулирована внутри PVL-модуля (отдельная схема в `database/pvl/`), которая работает на mock-API.

---

## 6. Известные проблемные зоны

### TODO/FIXME/HACK
- [views/PvlStudentCabinetView.jsx](../views/PvlStudentCabinetView.jsx): `TODO(methodology): порог допуска к СЗ 500, потолок курсовых 400`

### console.log/error (186 вхождений)
- App.jsx — `console.error()` в catch
- dataService.js — `console.info()` для debug курса-прогресса
- main.jsx — `console.warn()` при ошибке SW
- AuthScreen.jsx — `console.error()` при регистрации
- PVL views — отладочные логи

### Catch-блоки
- dataService.js — много `catch (e) { console.error(e); }` без re-throw
- AuthScreen.jsx — `catch (e) { alert(...) }` (плохой UX)
- realtimeMessages.js — `onError?.()` может быть undefined

### @ts-ignore / any
- Не применимо (нет TypeScript)

### Файлы > 500 строк
```
4164  PvlPrototypeApp.jsx
2461  services/dataService.js
1748  views/MeetingsView.jsx
1477  services/pvlMockApi.js
1333  views/AdminPanel.jsx
1184  views/BuilderView.jsx
 999  views/CourseLibraryView.jsx
 945  views/PvlTaskDetailView.jsx
 927  UserApp.jsx
 776  views/PracticesView.jsx
 755  views/PvlMenteeCardView.jsx
 629  views/CommunicationsView.jsx
 617  views/LeaderPageView.jsx
 605  views/PvlStudentCabinetView.jsx
 572  views/ProfileView.jsx
 558  views/PvlCalendarBlock.jsx
```

### Очевидное дублирование
- localStorage-ключи дублируются между App.jsx, dataService.js, CourseLibraryView.jsx
- Три варианта fetch (`postgrestFetch`/`authFetch`/`pushFetch`) с пересекающейся логикой
- Image compression + upload — повторяется в MeetingsView и ProfileView
- Error handling per-component, нет глобального ErrorBoundary
- Миграция 21 шаблонно создаёт одинаковые RLS-policies для 13 таблиц

### Архитектурные риски
1. dataService.js делает fetch + auth + push + upload + image processing (2461 строка)
2. Нет дифференциации ошибок (network vs validation vs auth vs business)
3. Хардкод prod-домена в env-fallback (`https://api.skrebeyko.ru`)
4. localStorage конкурирует с БД как источник истины (librarySettings, chat, push state)
5. create + upload не транзакционны — возможны half-states
6. Нет retry-логики на уровне сетевых вызовов

---

## 7. Конфигурация и окружение

### .env.example
- Не найден в репозитории. Используемые переменные (выведены из кода):

**Frontend:**
```
VITE_POSTGREST_URL        (default: https://api.skrebeyko.ru)
VITE_AUTH_URL             (default: https://auth.skrebeyko.ru)
VITE_PUSH_URL             (default: VITE_AUTH_URL)
VITE_WEB_PUSH_PUBLIC_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

**push-server:**
```
PORT=8787
DATABASE_URL
WEB_PUSH_PUBLIC_KEY / WEB_PUSH_PRIVATE_KEY
WEB_PUSH_SUBJECT=mailto:admin@example.com
CORS_ORIGIN='*'
ADMIN_PUSH_TOKEN
PRODAMUS_WEBHOOK_ENABLED=true
PRODAMUS_PROVIDER_NAME=prodamus
PRODAMUS_SECRET_KEY
PRODAMUS_ALLOWED_IPS  (optional)
DEFAULT_BOT_RENEW_URL
BILLING_TIMEZONE=Europe/Warsaw
AUTH_URL / AUTH_SERVICE_SECRET  (optional)
```

### vite.config.js
```js
defineConfig({
  plugins: [react()],
  base: '/',
})
```
Без alias, без оптимизаций.

### Middleware
- Frontend — нет middleware
- Backend ([push-server/server.mjs](../push-server/server.mjs)) — `cors()`, `express.json({ limit: '1mb' })`, кастомный `requireAdminToken` для `/push/news`

### Скрипты package.json
```json
"dev":           "vite",
"build":         "vite build",
"postbuild":     "node scripts/postbuild-reset.mjs",
"lint":          "eslint .",
"verify:garden": "node scripts/verify-garden.mjs",
"preview":       "vite preview"
```
push-server:
```json
"start": "node server.mjs",
"dev":   "node server.mjs",
"test":  "node --test billingLogic.test.mjs"
```

### CI/CD
- Папка `.github/workflows/` упомянута, содержимое не подтверждено
- По коммит-истории — преимущественно ручной деплой

---

## 8. Размер проекта

### Количество файлов
- JS/JSX: ~75 (без `dist/`, `node_modules/`)
- SQL: ~28 (21 migration + 3 docs + 2 seed + PVL)
- Config: 5 (vite, tailwind, postcss, package.json, package-lock.json)
- Assets: 50+ бинарных
- **Итого:** ~104 tracked файла

### Топ-10 по строкам
```
1.  4164  PvlPrototypeApp.jsx
2.  2461  services/dataService.js
3.  1748  views/MeetingsView.jsx
4.  1477  services/pvlMockApi.js
5.  1333  views/AdminPanel.jsx
6.  1184  views/BuilderView.jsx
7.   999  views/CourseLibraryView.jsx
8.   945  views/PvlTaskDetailView.jsx
9.   927  UserApp.jsx
10.  776  views/PracticesView.jsx
```
~15 000 строк в top-10 ≈ 55% от ~27 000 общих.

### Самые нагруженные папки
```
views/         24 файла, ~9 000 строк
services/       6 файлов, ~3 500 строк
data/           4 файла, ~1 500 строк
components/    14 файлов, ~400 строк
migrations/    21 файл, ~800 строк
docs/           6 файлов, ~600 строк
push-server/    6 файлов, ~500 строк
utils/          8 файлов, ~150 строк
```

---

## 9. Странности

1. **Три-четыре источника истины** для данных: App.jsx state, Supabase, localStorage, INITIAL_USERS/INITIAL_KNOWLEDGE. При offline→online возможны рассинхроны.
2. **PVL живёт отдельной полу-жизнью**: своя схема `database/pvl/`, свой mock API, отдельный 4164-строчный компонент, и `verify:garden` следит, чтобы PVL не импортировался в основной UserApp.
3. **Хардкод prod-домена в fallback** — без env переменных приложение бьётся в реальный prod (`https://api.skrebeyko.ru`).
4. **Service worker регистрируется**, но `/sw.js` в репо не видно — возможно, генерится на build.
5. **localStorage как синхронный кеш для async-данных** (librarySettings/chat) → потенциальные race conditions.
6. **Нет TypeScript, но много стрингологии**: `String(role).toLowerCase()`, ручные null-checks, ROLES как набор строк.
7. **Два пути создания пользователя**: `LocalStorageService.login()` (mock из INITIAL_USERS) и `api.register()` (БД) — могут расходиться.
8. **Legacy/неиспользуемые поля** в profiles: `x`, `y`, `tree_desc`, `telegram_link` присутствуют в миграциях, но в UI почти не задействованы.
9. **Prodamus billing**: webhook принимается, события обрабатываются, но UI для самостоятельного управления подпиской отсутствует — только экран блокировки.
10. **Миграция 21** дублирует одну и ту же RLS-policy для 13 таблиц через `if not exists` — большая SQL-простыня вместо процедуры/цикла.
11. **Нет API-версионирования** — единственный механизм инвалидации сессий это `session_version` в profiles.
12. **dev-poll функции** (`courseProgressDebug`) могут оставаться активными в production-бандле.

---

## Итоговая оценка (baseline)

- **Тип:** образовательная/менторская платформа («Сад ведущих»). Иерархия applicant → intern → leader → mentor → curator → admin.
- **Стек:** Vite + React 19 + Supabase + Express + PostgREST. Без TS, без ORM, без Zod, без тест-фреймворка, без Sentry.
- **Зрелость:** MVP/early-stage. Гигантские компоненты, смешанные источники истины, отсутствие централизованного error/log слоя.
- **Зоны внимания:** разделение PVL и основного приложения; декомпозиция dataService и крупных view; конфигурация окружения; единая стратегия sync/cache.

---

## История изменений
- 2026-05-02: Первичная разведка, baseline для code review
