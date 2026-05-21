---
title: Roles and Access — Garden Platform
type: access control matrix
version: 1.0
created: 2026-05-02
last_updated: 2026-05-02
status: completed
related_docs:
  - CLAUDE.md
  - docs/PROJECT_PASSPORT.md
  - docs/DB_SECURITY_AUDIT.md
  - plans/BACKLOG.md
---

# Roles and Access — Garden Platform

> **Назначение документа.** Единый источник правды по ролям пользователей, иерархии и матрице доступа. Используется как основа для:
> - Финализации `GRANT`'ов в Шаге 2.4 SEC-001
> - Написания RLS-policies в Шагах 2.5-2.7 SEC-001
> - Будущей работы с правами (новые таблицы, новые UI-разделы, новые роли)
>
> **Важно.** В Garden существуют **два независимых слоя контроля доступа**, которые сейчас не синхронизированы — UI-уровень (через ladder `hasAccess`) и БД-уровень (RLS policies). См. секцию «Особые случаи».

---

## 1. Список ролей

Иерархия ладдер-типа: каждая роль выше включает все права нижней. Уровень определяется числовым `level` в `ROLES_CONFIG`.

| Роль (key) | Label (UI) | Level | Цвет в UI | Описание / типичные обязанности |
|---|---|---:|---|---|
| `applicant` | Абитуриент | 0 | slate-500 | Только вход и обучение. Может смотреть базовые курсы, заполнять профиль, ставить цели, писать в чат. **Не может** работать с встречами, CRM, публиковать сценарии. |
| `intern` | Стажёр | 1 | indigo-600 | Стажировка. Полный доступ к встречам/расписанию (внесение свои), просмотр CRM «Люди». |
| `leader` | Ведущая | 2 | blue-600 | Полный пользовательский доступ: магазин, CRM, **публикация** сценариев в общий пул, просмотр менторского курса. |
| `mentor` | Ментор | 3 | purple-600 | Может обучать. В ПВЛ автоматически становится `mentor`-ом и видит свою cohort учениц, проверяет их ДЗ. |
| `curator` | Куратор | 4 | rose-600 | Управляет регионом. **В коде явных ограничений на этот уровень практически нет** — фактически прав-ляет наравне с mentor. См. ARCH-008 в backlog (планируемая дифференциация). |
| `admin` | Главный садовник | 99 | blue-800 | «Бог системы». Доступ к админ-панели Garden, к «Учительской» ПВЛ, ко всем CRUD-операциям на shared-таблицах через `is_admin()` policies. |

**Текущий состав админов** (3 человека, см. также [DB_SECURITY_AUDIT.md](DB_SECURITY_AUDIT.md) → «Список администраторов платформы»):
- `olga@skrebeyko.com` — Ольга Скребейко (владелец)
- `ilchukanastasi@yandex.ru` — Анастасия Зобнина (ассистент)
- `odintsova.irina.ig@gmail.com` — Ирина Одинцова (куратор Лиги)

**Распределение в `profiles`** (на 2026-05-02): leader 18, applicant 18, intern 13, mentor 7, admin 3 — итого 59.

---

## 2. Полная таблица доступа

### 2.1. UI-разделы → минимальная роль

| UI-раздел | applicant | intern | leader | mentor | curator | admin |
|---|---|---|---|---|---|---|
| Вход / профиль / своя страница / Карта Сада | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Главный дашборд (UserApp) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Встречи / расписание (MeetingsView) | ❌ заглушка | ✅ | ✅ | ✅ | ✅ | ✅ |
| CRM / «Люди» tab | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Сценарии — приватные | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Сценарии — **публикация** (`is_public=true`) | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Цели / практики / тетради | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| База знаний — просмотр (фильтр по `material.role`) | ≤applicant | ≤intern | ≤leader | ≤mentor | ≤curator | всё |
| База знаний — редактирование | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Курс «Инструкции», «Пиши, веди, люби» | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Курс «Начало пути», «Расти», «Промты, ассистенты» | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Курс «Менторский» | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Курс ПВЛ (AL Camp)** — вход (роль маппится — см. 2.3) | ✅→student | ✅→student | ✅→student | ✅→mentor | ✅→mentor | ✅→admin |
| Магазин (`shop_items`) | 👁️ просмотр | 👁️ | ✅ покупка | ✅ | ✅ | ✅ + write |
| Опросник (`questions`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Чат / messages для пользователей | ❓ см. «Особые случаи» | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tab «Коммуникации» (модерация чата + публикация новостей) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Новости — просмотр | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Новости — публикация | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| События (`events`) — просмотр | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| События — создание/редактирование | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Уведомления (свои) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Сертификация / оценки в ПВЛ — свои | ✅ | ✅ | ✅ | — | — | — |
| Биллинг / подписка | UI отсутствует, проверка `paid_until` сервером |  |  |  |  |  |
| **Админ-панель Garden** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### 2.2. Таблицы БД → CRUD по ролям

Условные обозначения:
- `R` = SELECT, `W` = INSERT/UPDATE, `D` = DELETE
- `(own)` = ограничено своими строками через RLS (`auth.uid() = user_id` или `id`)
- `(admin)` = через `is_admin()` policy
- `(public)` = читают все залогиненные
- `(cohort)` = ограничено своей когортой через `pvl_garden_mentor_links`
- `—` = нет доступа

| Таблица БД | applicant | intern | leader | mentor | curator | admin | UI-источник |
|---|---|---|---|---|---|---|---|
| **Платформенные — пользовательские** | | | | | | | |
| `profiles` | R(public) W(own) | R(public) W(own) | R(public) W(own) | R(public) W(own) | R(public) W(own) | R W D (admin: всё) | Карта, своя страница, AdminPanel |
| `meetings` | — _(UI-блок)_ | R W D (own) | R W D (own) | R W D (own) | R W D (own) | R W D (admin: всё) | MeetingsView |
| `goals` | R W D (own) | R W D (own) | R W D (own) | R W D (own) | R W D (own) | R W D (own) | Goals |
| `practices` | R W D (own) | R W D (own) | R W D (own) | R W D (own) | R W D (own) | R W D (own) + admin-tools | Practices |
| `scenarios` | R W D (own + public) | R W D (own + public) | R W D (own+public) **+ INSERT public** | то же | то же | то же | BuilderView |
| `course_progress` | R W (own) | R W (own) | R W (own) | R W (own) | R W (own) | R W (own) | Course library |
| `notifications` | R W (own) | R W (own) | R W (own) | R W (own) | R W (own) | R W (own) | Notifications |
| `messages` | ❓ | R W (own conv) | R W (own conv) | R W (own conv) | R W (own conv) | R W D (admin: всё) | Чат |
| `push_subscriptions` | R W (own) | R W (own) | R W (own) | R W (own) | R W (own) | R W (own) | (внутреннее) |
| **Платформенные — public read / admin write** | | | | | | | |
| `events` | R | R | R | R | R | R W D (admin) | Календарь |
| `news` | R | R | R | R | R | R W (admin) | News |
| `knowledge_base` | R (filter) | R (≤intern) | R (≤leader) | R (≤mentor) | R (≤curator) | R W D (admin) | KB views |
| `cities` | R | R | R | R | R | R W (admin) | Reg form |
| `shop_items` | R | R | R | R | R | R W (admin) | ShopView |
| `app_settings` | R | R | R | R | R | R W (admin) | (внутреннее) |
| `questions` | R | R | R | R | R | R | Опросник |
| `notebooks` | R | R | R | R | R | R W (admin?) | Тетради |
| **Платформенные — admin / backend only** | | | | | | | |
| `birthday_templates` | — | — | — | — | — | R W (admin) | push-server рассылки ДР |
| `to_archive` | — | — | — | — | — | R W (admin) | AdminPanel |
| `events_archive` | — | — | — | — | — | R W (admin) | AdminPanel |
| `users_auth` | **— никому, только gen_user (auth-server)** | | | | | | password hashes — sensitive! |
| **PVL — student-доступ (ученицы)** | | | | | | | |
| `pvl_students` | R (own) | R (own) | R (own) | R (own cohort) | R (own cohort) | R W D всё | PVL student/mentor/admin |
| `pvl_student_homework_submissions` | R W (own) | R W (own) | R W (own) | R W (own cohort) | R W (own cohort) | R W D всё | PVL submissions |
| `pvl_student_content_progress` | R W (own) | R W (own) | R W (own) | R (own cohort) | R (own cohort) | R W D всё | прогресс уроков |
| `pvl_student_questions` | R W (own) | R W (own) | R W (own) | R W (own cohort) | R W (own cohort) | R W D всё | вопросы ментору |
| `pvl_student_disputes`, `pvl_student_certification_*`, `pvl_student_course_*` | R W (own) | R W (own) | R W (own) | R W (own cohort) | R W (own cohort) | R W D всё | сертификация |
| `pvl_homework_status_history` | R (own) | R (own) | R (own) | R W (own cohort) | R W (own cohort) | R W D всё | модерация ДЗ |
| **PVL — mentor-доступ** | | | | | | | |
| `pvl_mentors`, `pvl_garden_mentor_links` | — | — | — | R (own) | R (own) | R W D всё | mentor dashboard |
| `pvl_direct_messages` | R W (свои) | R W (свои) | R W (свои) | R W (свои + менти) | R W | R W D всё | чат с ментором |
| **PVL — admin-only (контент курса)** | | | | | | | |
| `pvl_cohorts`, `pvl_course_lessons`, `pvl_course_weeks`, `pvl_content_items`, `pvl_content_placements`, `pvl_homework_items`, `pvl_checklist_items`, `pvl_calendar_events`, `pvl_faq_items`, `pvl_notifications` | R | R | R | R | R | R W D | content management |
| `pvl_audit_log` | — | — | — | — | — | R | audit trail |

### 2.3. ПВЛ — mapping garden-роли → PVL-роли

ПВЛ имеет собственную ролевую модель (`student`, `mentor`, `admin`), которая выводится из garden-роли в [services/pvlAppKernel.js](../services/pvlAppKernel.js) функцией `mapGardenRoleToAlCampPvlRole()`.

| Garden-роль | PVL-роль | Видимый интерфейс ПВЛ |
|---|---|---|
| `applicant`, `intern`, `leader` | `student` | Дашборд ученицы, трекер уроков, свои сабмишены, своя сертификация |
| `mentor`, `curator` | `mentor` | Дашборд ментора, очередь проверки, свои менти, материалы курса, сертификация |
| `admin` | `admin` | «Учительская» — полный CRUD: ученицы, менторы, контент, потоки, QA |

---

## 3. Особые случаи и исключения

### 3.1. Двухслойный контроль доступа (UI vs БД) — НЕ синхронизированы

Главное архитектурное наблюдение, влияющее на безопасность.

- **Layer 1 (UI):** через ladder `hasAccess(userRole, requiredRole)`. Реализован как видимость/скрытие табов, кнопок, целых view'ов. Обходится любым, кто умеет ходить через DevTools или прямой PostgREST.
- **Layer 2 (БД, RLS):** различает только два уровня — `auth.uid() = X` (свои строки) и `is_admin()` (админ). **БД не знает, что есть applicant, intern, leader, mentor, curator** как отдельные уровни.

**Следствие:** залогиненный `applicant` через прямой PostgREST API сможет:
- INSERT в `meetings` (UI говорит «доступно с intern», БД пропустит)
- INSERT в `scenarios` с `is_public = true` (UI говорит «только leader+», БД пропустит)
- Любые операции, которые UI ему запрещает, но БД-policy не явно различает по role

**Для починки нужна** функция `current_user_role()` (lookup в `profiles` по `auth.uid()`, SECURITY DEFINER) и переписывание ~10-15 policies на role-aware (с проверкой типа `current_user_role() != 'applicant'`). Это расширяет scope SEC-001/Этапа 2 — открытое решение перед Шагом 2.4 (см. варианты A/B/C ниже в «5. Что не покрыто»).

### 3.2. Curator ≡ mentor по правам (фактически)

В коде явных ограничений на уровень `curator` (level 4) практически нет — все проверки идут через `intern`/`leader`/`admin`. По ladder-логике curator наследует всё, что есть у mentor, плюс ничего нового. Это намеренное состояние (см. ARCH-008 в [plans/BACKLOG.md](../plans/BACKLOG.md)) — дифференциация пока не нужна.

### 3.3. Hardcoded admin-bypass через email

4 RLS-политики используют `(auth.jwt() ->> 'email') = 'olga@skrebeyko.com'` вместо `is_admin()`:
- `profiles."Olga Power"` (ALL)
- `profiles."Olga_Power_Profiles"` (ALL)
- `knowledge_base.KB_Update_Admin` (UPDATE)
- `knowledge_base.KB_Delete_Admin` (DELETE)

Они **рабочие**, но дают права только Ольге. Анастасия и Ирина (тоже `role=admin`) этими 4 политиками **не покрыты**. Шаг 2.5 SEC-001 переписывает их на `is_admin()`-pattern → расширит до всех 3 админов.

### 3.4. ПВЛ: `PVL_REVIEW_NAV_UNLOCK = true` отключает все роли в ПВЛ

Флаг в [services/pvlAppKernel.js:8](../services/pvlAppKernel.js#L8). Пока установлен — любой залогиненный пользователь может ходить по любым роутам ПВЛ, включая `/admin/*` и чужие `/mentor/mentee/{id}`. Это известная проблема приёмочного режима, см. [docs/PVL_RECONNAISSANCE.md](PVL_RECONNAISSANCE.md). **Перед открытием Caddy нужно либо отключить флаг, либо вынести его в env-переменную и установить в `false` для prod.**

### 3.5. ПВЛ data в БД vs frontend на mock

Frontend ПВЛ работает на `cloneSeedData(seed)` ([services/pvlMockApi.js](../services/pvlMockApi.js)) — никаких реальных вызовов к PostgREST. Но в БД `pvl_*` таблицах **есть реальные данные**: 23 активных студента, 45 сабмишенов, 2204 audit-лога, 323 записи прогресса. Кто пишет в эти таблицы — **неизвестно**. Возможные источники: легаси-фронтенд (старая версия), backend-скрипт, ручные операции через psql, отдельный admin-tool. **До разведки этого вопроса** RLS-policies для PVL должны быть консервативные (запретить всё, что не подтверждено как нужное). См. CRITICAL FINDING #4 в [DB_SECURITY_AUDIT.md](DB_SECURITY_AUDIT.md).

### 3.6. Чат / messages для обычных пользователей — путь не подтверждён

`CommunicationsView` для модерации — admin only. Для обычных пользователей чата отдельный view в Explore-обзоре чётко не зацепился. Возможно: используется `messages`-таблица напрямую через realtime + postgrest из какого-то компонента. **Перед финализацией policies на `messages` нужно отдельно подтвердить путь** (grep по `messages` в views/, ChatView/MessagesView).

### 3.7. Биллинговый гейт `paid_until` отсутствует в БД

Колонок `access_status`, `subscription_status`, `paid_until`, `prodamus_subscription_id`, `session_version` в `profiles` **нет**. Миграция 21 не применена в этой части (хотя `is_admin()` и `auth.uid()` из той же миграции есть). Функция `has_platform_access()` тоже отсутствует. Если биллинговое разделение нужно в RLS — миграция должна быть переразлита.

---

## 4. Источник правды

### Код (текущее состояние)

| Артефакт | Файл | Что определяет |
|---|---|---|
| Ladder ролей | [utils/roles.js](../utils/roles.js) | Уровни `ROLES_CONFIG`, функция `hasAccess()`, лейблы для UI |
| Условный рендер табов и view'ов | [App.jsx](../App.jsx) (особенно строка 374), [UserApp.jsx](../UserApp.jsx) (694, 704), [views/](../views/) | UI-уровень контроля |
| Курсы и материалы (filter by role) | [views/CourseLibraryView.jsx](../views/CourseLibraryView.jsx) (строки 27-82, 384, 417) | Фильтр доступа по `minRole` курса и `role` материала |
| Mapping в PVL-роль | [services/pvlAppKernel.js:143](../services/pvlAppKernel.js#L143) | garden role → pvl role |
| PVL-навигация | [services/pvlAppKernel.js](../services/pvlAppKernel.js) (строки 11-13, 58-79) | Какие sidebar-пункты для какой PVL-роли |
| RLS policies | БД, схемы `public` и `storage` | БД-уровень контроля; `auth.uid()`, `is_admin()`, hardcoded email |
| `is_admin()` SECURITY DEFINER | БД, функция `public.is_admin()` | Lookup `profiles.role = 'admin'` по `auth.uid()` |

### Документация

- [DB_SECURITY_AUDIT.md](DB_SECURITY_AUDIT.md) — текущее состояние RLS-policies, ролей в БД, grants
- [PVL_RECONNAISSANCE.md](PVL_RECONNAISSANCE.md) — разведка по PVL-домену
- [PROJECT_PASSPORT.md](PROJECT_PASSPORT.md) — общий паспорт
- [CLAUDE.md](../CLAUDE.md) — описание ролей в кратком виде

### Почему этот документ — авторитетный для будущих изменений

В `utils/roles.js` есть только ladder и labels. Реальное распределение прав по разделам и таблицам **не задокументировано в коде** — оно размазано по 40+ views, AdminPanel, PvlPrototypeApp, RLS-policies. Этот документ собирает реальную картину в одном месте.

При добавлении новой роли / нового раздела / новой таблицы — обновляйте этот файл **до** изменений в коде, а не после. При расхождении между кодом и этим документом — победитель определяется отдельно (либо документ лжёт, либо код имеет баг).

---

## 5. Что НЕ покрыто этим документом (для backlog)

Вынесено как отдельные задачи или открытые вопросы:

### Архитектурные

1. **Layer-1 vs Layer-2 синхронизация (UI ↔ RLS).** UI-ladder и БД-RLS не дифференцируют роли одинаково. Три варианта починки на обсуждение перед Шагом 2.4 SEC-001:
   - **Вариант A** — оставить как есть (UI-only enforcement, БД flat для всех authenticated)
   - **Вариант B** — добавить `current_user_role()` функцию и переписать ~10-15 policies на role-aware
   - **Вариант C** — компромисс: role-check только на критичных таблицах (meetings INSERT, scenarios INSERT public, shop)
   - Решение по A/B/C блокирует финализацию Шага 2.4
2. **PVL cohort-based access** для менторов — нужна функция `current_user_pvl_cohort()`, проектирование 24 RLS-policies с учётом `pvl_garden_mentor_links`. Объём работы — отдельный sub-этап «Этап 2.5: PVL RLS», скорее всего после открытия Caddy.
3. **Дифференциация curator от mentor** — ARCH-008 (P3, отложено до роста команды).
4. **Биллинг-гейт `has_platform_access()`** — миграция 21 в части `profiles ALTER` не применена; решить, нужна ли вообще или удалить из CLAUDE.md.

### Разведка

5. **Кто пишет в `pvl_*` таблицы**, если frontend на mock? Разведка отдельной задачей перед написанием PVL-policies.
6. **Путь чата для обычных пользователей** — какой view, какие endpoints, как авторизуется. Перед финализацией policies на `messages`.

### Эксплуатация

7. **`PVL_REVIEW_NAV_UNLOCK = true`** — отключить или вывести в env перед открытием Caddy.
8. **Перевод 4 hardcoded-email policies на `is_admin()`** — Шаг 2.5 SEC-001.
9. **Документирование curator-обязанностей в коде** — сейчас уровень есть, обязанности нет (ARCH-008).

---

## История изменений

- 2026-05-02 (v1.0): Создан в рамках SEC-001/Этап 2 как preflight для Шага 2.4 (grants) и Шагов 2.5-2.7 (RLS-policies). Источники: [utils/roles.js](../utils/roles.js), Explore-обход кодовой базы (40+ views, AdminPanel, PvlPrototypeApp), RLS-аудит из [DB_SECURITY_AUDIT.md](DB_SECURITY_AUDIT.md).
