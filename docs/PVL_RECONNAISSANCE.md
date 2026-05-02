---
title: PVL Course — Углублённая переразведка
type: technical reconnaissance (deep dive)
version: 1.1
created: 2026-05-02
last_updated: 2026-05-02
status: completed
priority: critical (зона известных багов)
context: переразведка после уточнения, что ПВЛ — основной платный курс платформы, а не прототип
related_docs:
  - CLAUDE.md
  - docs/PROJECT_PASSPORT.md
  - docs/PRD.md
  - docs/FEATURES.md
  - docs/SUPABASE_LEGACY_AUDIT.md
---

# PVL Course — Углублённая переразведка

> **⚠️ Контекст:** Этот отчёт создан после критического уточнения архитектурного понимания проекта. Первичная разведка ошибочно классифицировала PVL как «полу-изолированный прототип». На самом деле PVL («Пиши, Веди, Люби») — это **основной платный обучающий курс** платформы Garden, и именно в нём живут все известные баги (создание/сохранение ДЗ, видимость для менторов, подвисания при загрузке).

## Содержание

1. [Краткое резюме](#краткое-резюме)
2. [Архитектура курса как продукта](#1-архитектура-курса-как-продукта)
3. [Связка ученик-ментор и ДЗ](#2-связка-ученик-ментор-и-дз)
4. [Безопасность доступа к контенту](#3-безопасность-доступа-к-контенту)
5. [Source of truth для данных курса](#4-source-of-truth-для-данных-курса)
6. [Рекомендации для следующих шагов code review](#5-рекомендации-для-следующих-шагов-code-review)
7. [🎯 Ключевые находки (TL;DR)](#-ключевые-находки-tldr)
8. [🔴 Критичные риски](#-критичные-риски)
9. [📋 Карта зон для будущего code review](#-карта-зон-для-будущего-code-review)
10. [🤔 Открытые вопросы и допущения](#-открытые-вопросы-и-допущения)
11. [История изменений](#история-изменений)

---

## Краткое резюме

Раньше ПВЛ описывался как «полу-изолированный модуль на mock». На самом деле это **основной платный продукт платформы**, а mock — это производственное состояние. Это меняет приоритет проблем: то, что считалось технологическим долгом прототипа, на деле — **продакшн-баги, бьющие по платным пользователям**.

Главные находки:

1. Все сабмишены, оценки и связки ментор-ученик живут только в памяти браузера — теряются при reload.
2. Флаг `PVL_REVIEW_NAV_UNLOCK = true` отключает ролевую модель — любой залогиненный пользователь ходит по любым роутам ПВЛ.
3. Нет RLS на таблицах `pvl_*` — миграция [database/pvl/migrations/001_pvl_scoring_system.sql](../database/pvl/migrations/001_pvl_scoring_system.sql) создаёт таблицы без `enable row level security`.
4. Нет проверки оплаты конкретного курса — `has_platform_access()` пускает в ПВЛ-контент любого подписчика платформы.
5. Контент курса захардкожен в JS-бандле ([data/pvl/seed.js](../data/pvl/seed.js), [data/pvlMockData.js](../data/pvlMockData.js)) — любой залогиненный может извлечь его через DevTools.

---

## 1. Архитектура курса как продукта

### 1.1 Структура курса

Иерархия сущностей (mock в [data/pvl/seed.js](../data/pvl/seed.js)):

| Уровень | Сущность | Источник |
|---|---|---|
| Поток | `cohorts` | seed.js:62-63 («ПВЛ 2026 · Поток 1») |
| Модуль (неделя) | `courseWeeks` (13 недель: неделя 0 онбординг + 12 основных) | seed.js:78-91 |
| Урок | `lessons` (один на неделю) | seed.js:92-103 |
| Задание | `homeworkTasks` (с `scoreMax`, `deadlineAt`, `isControlPoint`) | seed.js:104-114 |
| Контрольная точка | `controlPoints` (9 КТ, КТ8/КТ9 с `affectsAdmission`) | seed.js:115-127 |
| Прогресс ДЗ | `studentTaskStates` | seed.js:128-138 |
| Сабмишены | `submissions` + `submissionVersions` (с версионированием) | seed.js:139-157 |
| Закрытие недели | `weekCompletionState` (+20 баллов автоматом) | seed.js:266-271 |
| Сертификация | `certificationProgress`, `szAssessmentState` | seed.js:241-246, 287-292 |

Контент уроков живёт в `seed.js` + `pvlMockData.js` (`contentItems`, `placements`). БД-схема для контента не создавалась.

Прогресс обновляется через функции в [services/pvlMockApi.js](../services/pvlMockApi.js): `submitStudentTaskForReview` (строки 694-726), `gradeSubmission`, `setTaskStatus` (1343-1359). Все пишут в локальный объект `db` — **не в Supabase**.

### 1.2 Навигация

- Роутер — самописный, в [services/pvlAppKernel.js](../services/pvlAppKernel.js) (строки 128-191) и в [PvlPrototypeApp.jsx](../PvlPrototypeApp.jsx) (строки 4047-4072).
- Меню `COURSE_MENU_LABELS` ([PvlPrototypeApp.jsx:123-132](../PvlPrototypeApp.jsx#L123-L132)) — единое для студента/ментора/админа: «О курсе», «Глоссарий», «Библиотека», «Трекер», «Практикумы», «Результаты», «Сертификация», «Вопросы».
- Префиксы роутов: `/student/*`, `/mentor/*`, `/admin/*`.

### 1.3 Карта PvlPrototypeApp.jsx (4164 строки)

| Строки | Раздел |
|---|---|
| 1-95 | Импорты, dev-tools, CMS-state |
| 97-504 | Роуты, меню, SidebarMenu |
| 506-882 | Админская навигация, UI-примитивы |
| 884-1860 | Экраны студента (Dashboard, Lessons, Tracker, Practicums, Certification, Results) |
| 1912-2330 | Экраны ментора (Mentees, Kanban, Review queue) |
| 2390-3750 | Экраны админа (контент-центр, студенты, менторы, календарь, QA) |
| 3950-4172 | Корневой компонент: state, роутер, рендер |

### 1.4 Реюзабельность для будущих курсов

**Hardcoded под ПВЛ:**

| Что | Где | Статус |
|---|---|---|
| Название курса | [data/pvl/courseDisplay.js:2](../data/pvl/courseDisplay.js#L2) — `PVL_COURSE_DISPLAY_NAME` | константа |
| Расписание | [data/pvl/constants.js:23-51](../data/pvl/constants.js#L23-L51) — `CANONICAL_SCHEDULE_2026` (даты, дедлайн СЗ 2026-06-30) | жёстко в коде |
| Баллы | [data/pvl/scoringRules.js:1-8](../data/pvl/scoringRules.js#L1-L8) — `SCORE_RULES` (400 макс, 54 за СЗ, 20 за неделю) | константа |
| Критерии СЗ | `data/pvl/pvlReferenceContent.js` — `PVL_CERT_CRITERIA_GROUPS` | константа |
| Меню разделов | [PvlPrototypeApp.jsx:123-132](../PvlPrototypeApp.jsx#L123-L132) — `COURSE_MENU_LABELS` | константа |
| Содержимое уроков | seed.js:230-240 (`contentItems`) | mock |
| Префиксы таблиц | `pvl_students`, `pvl_homework_items`, `pvl_course_weeks` | имена БД |

**Переносимое ядро:**

- Роутер ([services/pvlAppKernel.js](../services/pvlAppKernel.js)) — 100%
- Калькуляторы ([selectors/pvlCalculators.js](../selectors/pvlCalculators.js)) — 100%
- Mock-API ([services/pvlMockApi.js](../services/pvlMockApi.js)) — ~80% (20% специфики в названиях полей)
- UI-компоненты статусов, kanban, дашбордов — 70% переносимы

**Размер техдолга для абстракции «Курс»:** ~1500–2000 строк правок (переименование таблиц, параметризация расписания, factory `generateCourseSeed(courseId)` вместо константы, выделение `CourseEngine` с интерфейсом).

---

## 2. Связка ученик-ментор и ДЗ

### 2.1 Где живёт связка ментор-ученик

| Источник | Поле | Файл |
|---|---|---|
| **Mock (фактический)** | `studentProfiles[i].mentorId` | [data/pvl/seed.js:66-69](../data/pvl/seed.js#L66-L69) |
| **Mock (зеркало)** | `mentorProfiles[i].menteeIds` | [data/pvlMockData.js:13-14](../data/pvlMockData.js#L13-L14) |
| **БД (декларирована, не используется)** | `pvl_students.mentor_id UUID REFERENCES pvl_mentors(id) ON DELETE SET NULL` | [database/pvl/migrations/001_pvl_scoring_system.sql:24](../database/pvl/migrations/001_pvl_scoring_system.sql#L24) |
| **Profiles (Supabase)** | `mentor_id` — **не нашли**. Связки на уровне платформы нет. | — |

**Тип связи:** 1:N (один ментор → несколько учеников). M:N junction-таблицы нет.

**Когда создаётся связка:** только в seed-данных. **Функции типа `assignMentor()` или `linkStudentToMentor()` в коде нет** — ни в pvlMockApi, ни в dataService. То есть в продакшене связку никто не создаёт автоматически — она существует только в захардкоженном seed.

### 2.2 Полный flow ДЗ

**Сущности:**

- `homeworkTasks` — само задание (создаётся админом в админке курса).
- `studentTaskStates` — состояние ДЗ конкретного ученика (статус, дата сабмита).
- `submissions` + `submissionVersions` — сами ответы с версионированием.
- Статусы ([data/pvl/enums.js](../data/pvl/enums.js)): `NOT_STARTED | IN_PROGRESS | DRAFT | SUBMITTED | PENDING_REVIEW | ACCEPTED | REVISION_REQUESTED | REJECTED | OVERDUE`.

**Где хранится:** [services/pvlMockApi.js:46](../services/pvlMockApi.js#L46) — `const db = cloneSeedData(seed)`. Это **JavaScript-объект в памяти браузера**. Не в Supabase, не в localStorage.

**UI создания сабмишена:** [views/PvlTaskDetailView.jsx](../views/PvlTaskDetailView.jsx) (945 строк). Обработчик submit вызывает `submitStudentTaskForReview`.

**Сохранение** ([services/pvlMockApi.js:694-726](../services/pvlMockApi.js#L694-L726)):

```
submitStudentTaskForReview(studentId, taskId, payload):
  → создаёт версию в db.submissionVersions
  → меняет статус на PENDING_REVIEW
  → пушит в db.statusHistory
  → добавляет уведомление в db.notifications (тоже в памяти)
```

**Реальной записи в БД нет.** В коде нет ни одного `postgrestFetch` / `supabase.from('pvl_*')` для ПВЛ.

**Запрос ДЗ ментором** ([services/pvlMockApi.js:920-990](../services/pvlMockApi.js#L920-L990)): `getMentorReviewQueue(mentorId)` — фильтрует in-memory массив `db.studentProfiles` по `mentorId`, потом собирает их сабмишены.

**Проверка ментором:** через `gradeSubmission` — обновляет статус и `score` в памяти.

**Уведомления:** только in-memory массив `notifications`. Push/email/SSE не отправляется.

### 2.3 Три точки отказа цепочки ДЗ

#### a) Запись ДЗ — критический отказ

| Что не так | Где | Уровень |
|---|---|---|
| Запись только в JS-объект | [pvlMockApi.js:46](../services/pvlMockApi.js#L46) | КРИТИЧЕСКИЙ |
| Нет fetch/supabase в коде | поиск по `postgrestFetch.*pvl` — пусто | КРИТИЧЕСКИЙ |
| Reload страницы → всё теряется | localStorage не сохраняет ДЗ | КРИТИЧЕСКИЙ |
| Нет try/catch на уровне API | [pvlMockApi.js:694-726](../services/pvlMockApi.js#L694-L726) | СРЕДНИЙ |
| Минимальная валидация payload | проверка `payload?.textContent` | НИЗКИЙ |

→ Это объясняет жалобу «ученик отправил, не сохранилось»: **сохраняется в одной вкладке/сессии, не в БД**.

#### b) Связка ученик ↔ ментор — теряется при reload

| Проверка | Результат |
|---|---|
| Сабмишен пишется с `studentId` | ✅ Да ([pvlMockApi.js:707](../services/pvlMockApi.js#L707)) |
| Студент имеет `mentorId` в seed | ✅ Да |
| `mentorId` сохраняется при действиях | ❌ Только в памяти, при reload откатывается к seed |
| Функция `assignMentor` для новых студентов | ❌ Нет |

→ Любая правка ментора через UI откатится после reload. Если студента «нет» в seed — у него вообще нет ментора.

#### c) Чтение ментором — фильтр работает, но обходим

| Проверка | Результат |
|---|---|
| Фильтр по `mentorId` в getMentorReviewQueue | ✅ Корректный (фильтрует studentProfiles) |
| RLS на pvl_* | ❌ Не нашли в [001_pvl_scoring_system.sql](../database/pvl/migrations/001_pvl_scoring_system.sql) ни одного `enable row level security` или `create policy` |
| Проверка mentorId на бэкенде | ❌ Бэкенда нет — всё во фронте |
| React-кеш инвалидируется после grade | ⚠️ зависит от useState, проверка нужна по компонентам |
| `PVL_REVIEW_NAV_UNLOCK = true` | ❌ Любой пользователь ходит по mentor-роутам ([pvlAppKernel.js:8, 27-32](../services/pvlAppKernel.js#L8)) |

→ Это объясняет жалобу «ментор не видит ДЗ»: либо ученик новый и не в seed, либо данные потерялись при reload, либо у ментора нет привязанного `mentorId` в `studentProfiles`.

### 2.4 Как фактически назначается ментор (подтверждено)

Владелец продукта подтверждает, что **вручную назначает менторов** новым платным ученикам. Целевая разведка показала: программного механизма нет ни на одном уровне.

#### Что проверено и отвергнуто

| Кандидат | Результат | Доказательство |
|---|---|---|
| Admin-эндпоинт в push-server | ❌ нет | в [push-server/server.mjs](../push-server/server.mjs) ни одного роута со словами `pvl` / `mentor` / `student` |
| Admin-UI на платформе | ❌ нет | в [views/AdminPanel.jsx](../views/AdminPanel.jsx) нет упоминаний PVL / mentor_id / mentee |
| Прямые SQL к БД (вне приложения) | ⚠️ маловероятно | таблица `pvl_students` с колонкой `mentor_id` декларирована в [миграции 001](../database/pvl/migrations/001_pvl_scoring_system.sql#L24), но приложение её не читает и не пишет; `UPDATE pvl_students` в коде нет; скриптов/runbook'ов в репо не нашли |
| RPC / hidden function | ❌ нет | grep по `assignMentor`, `setMentor`, `linkMentor`, `attachMentor`, `bindMentor`, `updateStudentMentor` — пусто во всём репо |
| Правка `seed.js` + редеплой | ✅ **подтверждено** | см. ниже |

#### Подтверждённая цепочка

1. Владелец узнаёт о новой оплате (вручную, не через систему).
2. Открывает [data/pvl/seed.js:66-69](../data/pvl/seed.js#L66-L69), находит нужного студента в массиве `studentProfiles`.
3. Меняет `mentorId: 'u-men-1'` → нужный mentor id.
4. Коммит и деплой бандла.
5. У клиентов после reload подгружается новый бандл с обновлённым seed.

#### Косвенные подтверждения

- Внутри ПВЛ-админки ([PvlPrototypeApp.jsx:3224-3288](../PvlPrototypeApp.jsx#L3224-L3288), функция `AdminStudents`) — только таблица для чтения. Ни `<select>`, ни кнопки «назначить ментора».
- В карточке менти ([views/PvlMenteeCardView.jsx:641](../views/PvlMenteeCardView.jsx#L641)) — `const mentorId = profileRow?.mentorId || 'u-men-1'` — fallback на жёстко зашитый id первого ментора. Признак того, что данные могут отсутствовать у нового студента.
- В [services/pvlMockApi.js](../services/pvlMockApi.js) функции `changeMentorTaskStatus`, `assignMentorBonus` существуют — но это про статусы ДЗ и бонусные баллы, не про привязку ментора к студенту.
- `git log data/pvl/seed.js` показывает регулярные коммиты с правками seed («Правка 0304/N», «Большой пакет правок») — что совпадает с описанным процессом.

#### Что это значит для продукта

| Последствие | Описание |
|---|---|
| Каждый новый платный ученик требует деплоя | Задержка между оплатой и доступом к курсу = время до следующего деплоя |
| Данные ученика теряются при следующем деплое seed | Любые правки в памяти браузера откатятся к версии в файле |
| Нет аудита назначений | Только `git blame` на seed.js, и только для текущей версии |
| Нет защиты от опечаток | Опечатка в `mentorId` → студент попадёт на несуществующего ментора (или fallback `'u-men-1'`), и реальный ментор не увидит его в очереди |
| Не масштабируется | При 10–20+ учеников процесс становится узким горлышком и источником багов |

---

## 3. Безопасность доступа к контенту

### 3.1 Аудит роутов

| Роут | Защита | Как обходится |
|---|---|---|
| `/auth` | публичный | — |
| `/student/*`, `/mentor/*`, `/admin/*` (ПВЛ) | проверка только `canAccessRoute(role, route)` ([pvlAppKernel.js:27-32](../services/pvlAppKernel.js#L27-L32)), но первый же `if` — `if (PVL_REVIEW_NAV_UNLOCK && isPvlCabinetRoute(route)) return true` | флаг `PVL_REVIEW_NAV_UNLOCK = true` ([pvlAppKernel.js:8](../services/pvlAppKernel.js#L8)) пускает любого |
| Платформенные view (Meetings, Library) | гасятся `SubscriptionExpiredScreen` через `e.code === 'SUBSCRIPTION_EXPIRED'` ([App.jsx:101-107](../App.jsx#L101-L107)) | работает только для платформенных вызовов dataService |
| Контент уроков ПВЛ | **не защищён** — подгружается из JS-бандла | DevTools → бандл → весь курс читается |

### 3.2 has_platform_access — что проверяет, что нет

[migrations/21_billing_subscription_access.sql:83-99](../migrations/21_billing_subscription_access.sql#L83-L99):

```sql
select exists (
    select 1 from public.profiles p
    where p.id = target_user
      and (p.role = 'admin' or coalesce(p.access_status, 'active') = 'active')
);
```

**Проверяет:** только подписку на платформу.
**Не проверяет:** оплачен ли конкретный курс. **Нет таблицы `course_enrollments` или `paid_courses`** — это означает, что понятия «купил ПВЛ» в БД не существует. Доступ к ПВЛ-контенту = подписка на платформу.

### 3.3 RLS на таблицах pvl_*

[database/pvl/migrations/001_pvl_scoring_system.sql](../database/pvl/migrations/001_pvl_scoring_system.sql) создаёт 12 таблиц `pvl_*` — **ни одного `alter table ... enable row level security`** и ни одного `create policy`.

→ Если таблицы развернуты в проде, они **полностью открыты** на чтение/запись через PostgREST для любого аутентифицированного пользователя.

### 3.4 Прямой URL — обход проверок

| Сценарий | Что произойдёт |
|---|---|
| Любой залогиненный пользователь → `/admin/pvl` | Видит админку курса (PVL_REVIEW_NAV_UNLOCK) |
| Подписчик без покупки ПВЛ → `/student/lessons` | Видит уроки (нет проверки оплаты курса) |
| Студент → `/mentor/mentee/{другой_studentId}` | Видит карточку чужого ученика |
| Любой → DevTools → бандл | Получает весь контент seed.js + pvlMockData.js |

### 3.5 Уровни риска

| Риск | Уровень | Обоснование |
|---|---|---|
| Бесплатный доступ к платному контенту | **КРИТИЧЕСКИЙ** | подписчик платформы получает ПВЛ без отдельной оплаты; контент в бандле читается через DevTools |
| Потеря ДЗ ученика | **КРИТИЧЕСКИЙ** | сабмишены в памяти, reload = потеря |
| Видимость чужих ДЗ | **ВЫСОКИЙ** | PVL_REVIEW_NAV_UNLOCK + нет RLS |
| Утечка ПДн (имена, email учеников) | **ВЫСОКИЙ** | seed.js в бандле; если pvl_* развёрнуты без RLS — раскрыты через PostgREST |
| Подмена чужих оценок | **СРЕДНИЙ** | через UI и mock — да, через прод-БД — пока неясно (зависит от того, развёрнуты ли pvl_*) |
| Доступ к админке курса | **ВЫСОКИЙ** | PVL_REVIEW_NAV_UNLOCK = true |

---

## 4. Source of truth для данных курса

| Категория | Где живёт | Кто пишет | Кто читает | Проблема |
|---|---|---|---|---|
| Статичный контент курса | [data/pvl/seed.js](../data/pvl/seed.js), [data/pvlMockData.js](../data/pvlMockData.js) | программист (commit) | весь PvlPrototypeApp | в бандле, доступен всем; редактирование = деплой |
| Студенты, менторы, когорты | seed.js:52-70 | программист | pvlMockApi | нельзя добавить студента в проде |
| Сабмишены и оценки | `db` в памяти ([pvlMockApi.js:46](../services/pvlMockApi.js#L46)) | UI ученика/ментора | ментор/админ | теряется при reload |
| UI-сессия (роль, route, studentId) | localStorage `pvl_app_session_v1` | useEffect ([PvlPrototypeApp.jsx:4027-4029](../PvlPrototypeApp.jsx#L4027-L4029)) | при mount | дублирует React state, рассинхрон возможен |
| Предпочтения вида | localStorage `pvl_view_prefs_v1` | UI-фильтры | UI-фильтры | ок |
| БД (декларация) | `database/pvl/migrations/001_*.sql` | — | — | развёрнуто? неясно. Используется кодом? Нет. |
| Платформенные данные (profiles, meetings) | Supabase/Timeweb | dataService.js | dataService.js | работает |

### Точки рассинхронизации

1. **studentProfiles ↔ users** ([seed.js:52-70](../data/pvl/seed.js#L52-L70)): два массива с пересекающимися полями (`fullName` в обоих). Обновление одного не обновляет другой.
2. **studentPoints ↔ weekCompletionState ↔ certificationProgress** (seed.js:241-292): три разных места хранят итоговые баллы и статусы. Нет единой функции «пересчитать всё»; согласованность на честности конкретных мутаторов.
3. **db (память) ↔ seed (модуль)**: `cloneSeedData(seed)` копирует. Если код что-то правит в `seed` напрямую (модуль), кеш-копия `db` уже не та.
4. **CMS state**: [PvlPrototypeApp.jsx](../PvlPrototypeApp.jsx) делает `buildMergedCmsState()` из mock + seed → cmsItems в React state. Если меняется на бэкенде, React-копия устаревает.
5. **Платформенные profiles vs PVL studentProfiles**: на платформе пользователь — `profiles.role = 'mentor'`, в ПВЛ он же — `pvl_mentors.id`. Связки между этими ID нет в коде.

---

## 5. Рекомендации для следующих шагов code review

### А. Зоны для детального code review (4 агента)

**Агент 1 — Создание ДЗ (UI-слой)**

- Что смотреть: [views/PvlTaskDetailView.jsx](../views/PvlTaskDetailView.jsx) (945 строк) — форма сабмишена, валидация, обработчики draft/submit, обработка ошибок, UX при сетевой недоступности.
- Что искать: silent failures, отсутствие индикаторов сохранения, потеря введённого текста.

**Агент 2 — Сохранение ДЗ (data-слой)**

- Что смотреть: [services/pvlMockApi.js:694-990](../services/pvlMockApi.js#L694-L990) (`submitStudentTaskForReview`, `gradeSubmission`, `setTaskStatus`), [services/pvlAppKernel.js](../services/pvlAppKernel.js).
- Что искать: можно ли подменить ID, поведение при отсутствии mentor_id у студента, что происходит с уведомлениями, отсутствие персистентности.
- Главный вопрос: **что нужно, чтобы переключить запись с памяти на БД?** Какие функции pvlMockApi имеют контракт под реальный API.

**Агент 3 — Видимость ДЗ ментором + права**

- Что смотреть: [views/PvlMenteeCardView.jsx](../views/PvlMenteeCardView.jsx) (755), [views/MentorDashboardView.jsx](../views/MentorDashboardView.jsx) (306), [services/pvlAppKernel.js:8, 27-32](../services/pvlAppKernel.js#L8) (PVL_REVIEW_NAV_UNLOCK), [selectors/pvlCalculators.js](../selectors/pvlCalculators.js).
- Что искать: фильтрация по mentorId, инвалидация React state после grade, реакция UI на пустой массив, возможность увидеть чужого студента через URL.

**Агент 4 — Безопасность доступа и RLS / Производительность**

- Что смотреть: [database/pvl/migrations/001_pvl_scoring_system.sql](../database/pvl/migrations/001_pvl_scoring_system.sql), [migrations/21_billing_subscription_access.sql](../migrations/21_billing_subscription_access.sql), [App.jsx](../App.jsx) (роутинг гард), [services/pvlAppKernel.js](../services/pvlAppKernel.js) (canAccessRoute), `data/pvl/seed.js` и `data/pvlMockData.js` в бандле.
- Что искать: список таблиц без RLS, какие роуты защищены, утечка ПДн через бандл, отсутствие проверки оплаты курса.
- Производительность: размер монолита [PvlPrototypeApp.jsx](../PvlPrototypeApp.jsx) (4164 строки) и [pvlMockApi.js](../services/pvlMockApi.js) (1477 строк), отсутствие code-splitting, перерасчёты `buildMergedCmsState` без мемоизации, влияние на time-to-interactive.
- Доп: проверить, развёрнуты ли pvl_* таблицы в Timeweb, запросив схему БД (если есть доступ).

### Б. Срочные продуктовые/архитектурные решения

| Решение | Срочность | Почему |
|---|---|---|
| 1. Переключить хранение ДЗ с памяти на БД | **немедленно** | Платные ученики теряют работу при reload |
| 2. Отключить `PVL_REVIEW_NAV_UNLOCK` или сделать env-флагом только для dev | **немедленно** | Сейчас ролевая модель не работает |
| 3. Включить RLS на всех таблицах pvl_* | **немедленно (если развёрнуты)** | Открытый доступ к данным курса |
| 4. Ввести понятие `course_enrollments` | **высокий** | Без этого нельзя продавать курсы отдельно от подписки |
| 5. Назначение ментора при покупке курса (функция `assignMentor`) | **высокий** | Сейчас связки нет в проде, только в seed |
| 6. Решить, где хранить контент курса | **средний** | Сейчас в JS-бандле — нет приватности и без редеплоя контент не правится |
| 7. Уведомления ментору о новом сабмишене (push/email) | **средний** | Сейчас только in-memory |
| 8. Абстракция «Курс» в БД и коде | **средний-низкий** | Если планируются другие курсы — иначе каждый будет копи-пастом |

---

## 🎯 Ключевые находки (TL;DR)

1. **ПВЛ — продакшн на mock.** Сабмишены, оценки, связки ментор-ученик хранятся только в памяти браузера ([pvlMockApi.js:46](../services/pvlMockApi.js#L46)). Reload страницы у живого ученика = потеря работы. Это первопричина жалобы «отправил → не сохранилось».
2. **Ролевая модель отключена флагом.** `PVL_REVIEW_NAV_UNLOCK = true` в [pvlAppKernel.js:8](../services/pvlAppKernel.js#L8) пускает любого пользователя на любой роут ПВЛ — включая `/admin/*` и чужие `/mentor/mentee/{id}`.
3. **Нет RLS на pvl_*.** Миграция [001_pvl_scoring_system.sql](../database/pvl/migrations/001_pvl_scoring_system.sql) создаёт 12 таблиц без `enable row level security` и без policies. Если таблицы развёрнуты в Timeweb — данные открыты любому залогиненному.
4. **Нет понятия «оплачен курс».** `has_platform_access()` проверяет только подписку на платформу. Таблицы `course_enrollments` нет; функции `assignMentor` нет; связка ментор-ученик существует только в захардкоженном seed.
5. **Контент курса в JS-бандле.** `data/pvl/seed.js` и `data/pvlMockData.js` содержат полный контент курса, имена и email учеников — извлекается через DevTools.

---

## 🔴 Критичные риски

| Риск | Уровень | Почему срочно |
|---|---|---|
| Потеря ДЗ ученика при reload | КРИТИЧЕСКИЙ | Платные ученики теряют работу прямо сейчас |
| Бесплатный доступ к платному контенту | КРИТИЧЕСКИЙ | Подписчик платформы → ПВЛ без оплаты курса; контент извлекается из бандла |
| Любой пользователь → админка ПВЛ | ВЫСОКИЙ | Флаг `PVL_REVIEW_NAV_UNLOCK = true` |
| Видимость чужих ДЗ и студентов | ВЫСОКИЙ | Нет RLS + нет фронт-гарда |
| Утечка ПДн через бандл / открытый PostgREST | ВЫСОКИЙ | seed.js в бандле; pvl_* без RLS |
| Подмена оценок и статусов через DevTools | СРЕДНИЙ | Бэкенд-валидации нет — всё в памяти, любой может вызвать функцию |
| Назначение ментора требует деплоя | ВЫСОКИЙ | Программного механизма нет; единственный путь — правка [data/pvl/seed.js](../data/pvl/seed.js) + коммит + редеплой. Каждый новый платный ученик блокируется до следующего деплоя; нет аудита; опечатка в `mentorId` отправляет студента на fallback `'u-men-1'`. Подробности — раздел 2.4. |

---

## 📋 Карта зон для будущего code review

Конкретные адреса для каждого из 4 будущих агентов — чтобы агенты не искали вслепую.

### Агент 1 — Создание ДЗ

| Адрес | На что смотреть |
|---|---|
| [views/PvlTaskDetailView.jsx](../views/PvlTaskDetailView.jsx) (945 строк) | форма сабмишена, draft/submit обработчики |
| [views/PvlTaskDetailView.jsx](../views/PvlTaskDetailView.jsx) — обработчик submit | вызывает `submitStudentTaskForReview` |
| [data/pvl/enums.js](../data/pvl/enums.js) — `TASK_STATUS` | разрешённые переходы статусов |
| Поиск: `<textarea>`, `onChange`, `onSubmit` в PvlTaskDetailView | потеря введённого текста, autosave |

Что искать: silent failures, отсутствие индикатора сохранения, валидация обязательных полей, потеря введённого текста при ошибке.

### Агент 2 — Сохранение ДЗ

| Адрес | На что смотреть |
|---|---|
| [services/pvlMockApi.js:46](../services/pvlMockApi.js#L46) | `cloneSeedData(seed)` — корень всей памяти |
| [services/pvlMockApi.js:694-726](../services/pvlMockApi.js#L694-L726) | `submitStudentTaskForReview` |
| [services/pvlMockApi.js:920-990](../services/pvlMockApi.js#L920-L990) | `getMentorReviewQueue`, `gradeSubmission` |
| [services/pvlMockApi.js:1343-1359](../services/pvlMockApi.js#L1343-L1359) | `setTaskStatus` + `statusHistory` |
| [services/pvlAppKernel.js](../services/pvlAppKernel.js) | сессия + persistence в localStorage |
| [database/pvl/migrations/001_pvl_scoring_system.sql](../database/pvl/migrations/001_pvl_scoring_system.sql) | целевая схема для миграции с памяти на БД |

Главный вопрос: какие функции имеют контракт, совместимый с реальным API; что нужно сделать для переключения с `db` на `postgrestFetch`/Supabase.

### Агент 3 — Видимость ДЗ ментором

| Адрес | На что смотреть |
|---|---|
| [views/PvlMenteeCardView.jsx](../views/PvlMenteeCardView.jsx) (755 строк) | карточка ученика, сабмишены |
| [views/MentorDashboardView.jsx](../views/MentorDashboardView.jsx) (306 строк) | список менти |
| [PvlPrototypeApp.jsx:1912-2330](../PvlPrototypeApp.jsx#L1912-L2330) | MentorMenteesGardenGrid, MentorKanbanBoard |
| [services/pvlAppKernel.js:8](../services/pvlAppKernel.js#L8) | `PVL_REVIEW_NAV_UNLOCK = true` |
| [services/pvlAppKernel.js:27-32](../services/pvlAppKernel.js#L27-L32) | `canAccessRoute` |
| [selectors/pvlCalculators.js](../selectors/pvlCalculators.js) | агрегации по студенту |
| [data/pvl/seed.js:66-69](../data/pvl/seed.js#L66-L69) | `studentProfiles[i].mentorId` |

Что искать: фильтрация по `mentorId`, инвалидация React state после действий, реакция UI на пустой массив, обходные пути через прямой URL.

### Агент 4 — Производительность и безопасность

**Производительность:**

| Адрес | На что смотреть |
|---|---|
| [PvlPrototypeApp.jsx](../PvlPrototypeApp.jsx) (4164 строки) | один компонент, нет code-splitting |
| [services/pvlMockApi.js](../services/pvlMockApi.js) (1477 строк) | весь mock грузится сразу |
| [PvlPrototypeApp.jsx:52-95](../PvlPrototypeApp.jsx#L52-L95) | `buildMergedCmsState` — мемоизирован? |
| [PvlPrototypeApp.jsx:3964-3989](../PvlPrototypeApp.jsx#L3964-L3989) | useState на корне — лишние ре-рендеры |
| `data/pvl/seed.js`, `data/pvlMockData.js` | размер бандла |

**Безопасность:**

| Адрес | На что смотреть |
|---|---|
| [database/pvl/migrations/001_pvl_scoring_system.sql](../database/pvl/migrations/001_pvl_scoring_system.sql) | RLS = отсутствует на всех 12 таблицах |
| [migrations/21_billing_subscription_access.sql:83-99](../migrations/21_billing_subscription_access.sql#L83-L99) | `has_platform_access` — не проверяет курс |
| [App.jsx:101-107](../App.jsx#L101-L107) | гард `SubscriptionExpiredScreen` |
| [services/pvlAppKernel.js:8](../services/pvlAppKernel.js#L8) | `PVL_REVIEW_NAV_UNLOCK` |
| `data/pvl/seed.js`, `data/pvlMockData.js` | ПДн в бандле |

Доп: проверить через подключение к Timeweb, какие из `pvl_*` таблиц реально развёрнуты в проде.

---

## 🤔 Открытые вопросы и допущения

- ❓ **Развёрнуты ли таблицы `pvl_*` в Timeweb?** → к команде backend → если да — без RLS они открыты; если нет — миграция мёртвая, надо принимать решение (раскатывать или удалять).
- ❓ **Где сейчас хранятся реальные ученики и их сабмишены в проде?** → к продакту/команде → если только в памяти у каждого ученика — это означает, что данные ДЗ нигде не сохраняются централизованно. Был ли инцидент с потерей?
- ❓ **Какой план продажи следующих курсов?** → к продакту → определит, нужна ли абстракция «Курс» сейчас или можно копи-пастом ПВЛ → новый курс.
- ❓ **Что такое «купить курс» в текущей модели?** → к продакту → сейчас оплата вручную, в планах Prodamus. Что меняет покупка: роль на платформе? Запись в `course_enrollments` (которой нет)? Назначение ментора?
- ❓ **Кто и как назначает ментора студенту?** → к продакту → функции `assignMentor` нет; связка только в seed.js. Это значит, что в проде новый студент → нет ментора. Как сейчас обходится?
- ❓ **Зачем `PVL_REVIEW_NAV_UNLOCK = true` в проде?** → к команде → подозрение, что флаг оставлен от QA-режима. Снять или сделать env-зависимым.
- ❓ **Нужны ли версии сабмишенов на проде?** → к продакту → `submissionVersions` есть в схеме, но если перейти на БД — потенциально много write-нагрузки. Хранить только текущую или историю?
- ❓ **Нужно ли разделение «mentor — пользователь платформы» и «mentor — сущность курса»?** → к продакту → сейчас в seed.js менторы это отдельная сущность, не привязанная к profiles. Должна ли совпадать с `profiles.role = 'mentor'`?

---

## История изменений

- 2026-05-02 (v1.0): Первая углублённая разведка PVL после продуктового уточнения.
- 2026-05-02 (v1.1): Подтверждена цепочка назначения ментора через правку seed.js + редеплой. Добавлен раздел 2.4.
