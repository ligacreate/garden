# Recon FEAT-016 + FEAT-017 — code surface (executor отчёт)

**Адресат:** стратег (claude.ai).
**Автор:** VS Code Claude Code (executor).
**Создано:** 2026-05-07.
**Источник запроса:** [`docs/_session/2026-05-07_01_recon_feat016_017_prompt.md`](2026-05-07_01_recon_feat016_017_prompt.md).
**Режим:** read-only. Ничего не применено, не закоммичено.

> Путь файла из промпта `garden/docs/_session/...` интерпретирован как
> `docs/_session/...` (CWD = репо `garden`). Файлы лежат рядом с
> промптом.

---

## TL;DR (executor-side)

1. **Учительская PVL — один монолитный файл** [`views/PvlPrototypeApp.jsx`](../../views/PvlPrototypeApp.jsx),
   **8382 строки**. Mentor/Student/Admin-cabinets, navigation, kanban,
   tracker, library, glossary, certification — всё внутри одного файла.
   Внешний роутинг — кастомный (`gardenPvlBridgeRef.current.navigate(route)`),
   не React Router.
2. **Двойной data layer:** [`services/pvlMockApi.js`](../../services/pvlMockApi.js) (4245 строк, in-memory mock + seed) и
   [`services/pvlPostgrestApi.js`](../../services/pvlPostgrestApi.js) (647 строк, обёртка над PostgREST).
   UI-слой PvlPrototypeApp **читает в основном из mock** через
   `pvlDomainApi.studentApi/mentorApi/helpers`, в БД пишет через
   `fireAndForget` обёртки внутри mock-а. Это центральная архитектурная
   проблема для FEAT-016/017 (см. ARCH-012 в backlog).
3. **Reusable-инфраструктура для дашборда/выгрузки — почти отсутствует:**
   нет общей CSV-утилиты, нет sortable-table компонента, нет export-modal,
   нет filter-bar. Есть один прецедент CSV-download (для шаблона в
   `PracticesView.jsx`) — собирается inline из 9 строк.
4. **Sanitizer для homework rich-text — корректный** (учитывает
   DOMPurify KEEP_CONTENT-gotcha lesson 2026-05-04). Pre-filter
   `stripMsOfficeHtmlNoise` режет `<style>`/`<script>`/комментарии/
   xml-namespaced теги до DOMPurify, плюс `homeworkAnswerPlainText`
   делает второй DOMPurify-проход с пустым whitelist для plain-text.
5. **AdminPanel.jsx (1606 строк) — табы статичны:**
   `[stats, users, content, news, events, shop]`. Нет таба
   аналитики по студентам PVL — это новый раздел.

---

## 1. PVL-логика в коде Garden

### 1.1. [`views/PvlPrototypeApp.jsx`](../../views/PvlPrototypeApp.jsx) — структура

**8382 строки в одном файле.** Внутри — ~200+ функций/компонентов
без явной модульной границы. Основные группы (по grep
`^function`):

| Категория | Примеры функций (с номерами строк) |
|---|---|
| **Навигация / роутинг** | `toRoute` ([250](../../views/PvlPrototypeApp.jsx#L250)), `sidebarRoutePath` ([313](../../views/PvlPrototypeApp.jsx#L313)), `mentorSectionForRoute` ([325](../../views/PvlPrototypeApp.jsx#L325)), `adminRoutePath` ([780](../../views/PvlPrototypeApp.jsx#L780)), `resolveAdminDrilldownNav` ([793](../../views/PvlPrototypeApp.jsx#L793)) |
| **Resolvers** | `resolveActorUser` ([118](../../views/PvlPrototypeApp.jsx#L118)), `resolveStudentDashboardHeroName` ([134](../../views/PvlPrototypeApp.jsx#L134)), `resolveStudentCohortIdForPvl` ([224](../../views/PvlPrototypeApp.jsx#L224)), `resolvePvlMentorActorId` ([235](../../views/PvlPrototypeApp.jsx#L235)) |
| **Status / formatting** | `STATUS_TONE` ([361](../../views/PvlPrototypeApp.jsx#L361)), `StatusBadge` ([374](../../views/PvlPrototypeApp.jsx#L374)), `shortTaskStatusLabel` ([382](../../views/PvlPrototypeApp.jsx#L382)), `sortHomeworkByRecency` ([395](../../views/PvlPrototypeApp.jsx#L395)), `deadlineUrgencyTone` ([407](../../views/PvlPrototypeApp.jsx#L407)) |
| **CMS / контент** | `createContentItem` ([968](../../views/PvlPrototypeApp.jsx#L968)), `assignContentToSection` ([997](../../views/PvlPrototypeApp.jsx#L997)), `filterContentItems` ([1001](../../views/PvlPrototypeApp.jsx#L1001)), `getPublishedContentBySection` ([1120](../../views/PvlPrototypeApp.jsx#L1120)), `buildTrackerModulesFromCms` ([1189](../../views/PvlPrototypeApp.jsx#L1189)) |
| **Дашборды (топ-уровень)** | `StudentDashboard` ([2070](../../views/PvlPrototypeApp.jsx#L2070)), `MentorDashboard` ([3953](../../views/PvlPrototypeApp.jsx#L3953)), `MentorPage` ([3981](../../views/PvlPrototypeApp.jsx#L3981)) |
| **Mentor-side** | `buildMentorMenteeRows` ([3539](../../views/PvlPrototypeApp.jsx#L3539)), `MentorMenteesGardenGrid` ([3612](../../views/PvlPrototypeApp.jsx#L3612)), `MentorKanbanBoard` ([3712](../../views/PvlPrototypeApp.jsx#L3712)), `MentorMenteesPanel` ([3934](../../views/PvlPrototypeApp.jsx#L3934)), `MentorReviewQueuePanel` ([3944](../../views/PvlPrototypeApp.jsx#L3944)), `MentorPage` (router-shell, [3981](../../views/PvlPrototypeApp.jsx#L3981)) |
| **Calendar / practicums** | `PvlPastArchiveListItem` ([453](../../views/PvlCalendarBlock.jsx#L453)) — отдельный файл, `practicumEventTypeRu` ([1065](../../views/PvlPrototypeApp.jsx#L1065)), `groupPracticumEventsByCalendarDay` ([2316](../../views/PvlPrototypeApp.jsx#L2316)) |
| **Tracker / lessons** | `StudentLessonsLive` ([2296](../../views/PvlPrototypeApp.jsx#L2296)), `StudentCourseTracker` (referenced from MentorPage [4010](../../views/PvlPrototypeApp.jsx#L4010)) |
| **Library / glossary** | `LibraryPage` ([1477](../../views/PvlPrototypeApp.jsx#L1477)), `StudentGlossarySearch` ([2581](../../views/PvlPrototypeApp.jsx#L2581)) |
| **Certification** | `StudentCertificationReference` ([2834](../../views/PvlPrototypeApp.jsx#L2834)) — длинный компонент, но это reference materials, не аналитика |

### 1.2. View-секции учительской — какой компонент за что отвечает

Учительская навигируется через `MentorPage` ([3981](../../views/PvlPrototypeApp.jsx#L3981))
по `route` строкам. Маршрутный switch ниже:

```
/mentor/dashboard      → MentorDashboard (3953)
/mentor/applicants     → MentorApplicantsPanel
/mentor/mentees        → MentorMenteesPanel (3934)
/mentor/review-queue   → MentorReviewQueuePanel (3944)
/mentor/messages       → MentorDirectMessages
/mentor/tracker        → StudentCourseTracker (mirror студента)
/mentor/materials      → MentorMaterialsPage
/mentor/library[/id]   → LibraryPage (1477) с routePrefix='/mentor'
/mentor/mentee/<id>/task/<id> → PvlTaskDetailView
/mentor/mentee/<id>    → mentee detail view
/mentor/onboarding     → редирект на /mentor/about
/mentor/settings       → PvlCabinetSettingsStub
```

Конкретно по пунктам из промпта:

| Раздел | Компонент | Источник данных |
|---|---|---|
| **Дашборд** | [`MentorDashboard`](../../views/PvlPrototypeApp.jsx#L3953) | `buildMentorMenteeRows(mentorId)` ([3539](../../views/PvlPrototypeApp.jsx#L3539)) — агрегирует через `pvlDomainApi.mentorApi.getMentorMentees` (mock) + `pvlDomainApi.studentApi.getStudentResults` (mock) + `pvlDomainApi.helpers.getStudentPointsSummary` |
| **Мои менти** | `MentorMenteesPanel` ([3934](../../views/PvlPrototypeApp.jsx#L3934)) | то же `buildMentorMenteeRows` |
| **Очередь проверок** | `MentorReviewQueuePanel` ([3944](../../views/PvlPrototypeApp.jsx#L3944)) → `MentorKanbanBoard` ([3712](../../views/PvlPrototypeApp.jsx#L3712)) | `pvlDomainApi.mentorApi.getMentorReviewBoard(mentorId)` ([pvlMockApi.js:3110](../../services/pvlMockApi.js#L3110)) |
| **Трекер** | `StudentCourseTracker` (зеркало студента; [4010](../../views/PvlPrototypeApp.jsx#L4010)) | tracker checks через mock + `pvlPostgrestApi.listStudentChecklistItems` |
| **Календарь** | `PvlDashboardCalendarBlock` (используется в `MentorDashboard` [3965](../../views/PvlPrototypeApp.jsx#L3965)) — компонент в [`views/PvlCalendarBlock.jsx`](../../views/PvlCalendarBlock.jsx) | `pvlPostgrestApi.listCalendarEvents` |
| **Библиотека / Глоссарий** | `LibraryPage` ([1477](../../views/PvlPrototypeApp.jsx#L1477)) с `routePrefix='/mentor'`, `StudentGlossarySearch` ([2581](../../views/PvlPrototypeApp.jsx#L2581)) | CMS-снимок (`cmsItems` + `cmsPlacements`) |
| **Чат с менти (Direct messages)** | `MentorDirectMessages` (referenced [4006](../../views/PvlPrototypeApp.jsx#L4006)) | `pvlPostgrestApi.listDirectMessages` |
| **Результаты (студент)** | анонимная функция компонент в [2990](../../views/PvlPrototypeApp.jsx#L2990) (по grep `<h2>Результаты</h2>`) | `pvlDomainApi.studentApi.getStudentResults` (mock) — фильтры по статусам ДЗ |
| **Сертификация** | `StudentCertificationReference` ([2834](../../views/PvlPrototypeApp.jsx#L2834)) + раздел в [3421](../../views/PvlPrototypeApp.jsx#L3421) | mock-данные критериев |
| **Настройки** | `PvlCabinetSettingsStub` ([4001](../../views/PvlPrototypeApp.jsx#L4001)) | заглушка |

### 1.3. [`services/pvlPostgrestApi.js`](../../services/pvlPostgrestApi.js) — методы по homework / progress / cohorts / mentors

Все 647 строк — обёртка над PostgREST (через локальный `request()`
helper и shared `getAuthToken()`). Полный список методов
(name + endpoint + краткое назначение):

#### Контент / placements / FAQ / календарь
| Метод | Endpoint | Назначение |
|---|---|---|
| `listContentItems` | `GET /pvl_content_items` | весь контент, sorted updated_at |
| `getContentItem(id)` | `GET /pvl_content_items?id=eq.…` | один айтем |
| `createContentItem` / `updateContentItem` / `publish/unpublish/archive/deleteContentItem` | соответствующие POST/PATCH/DELETE | CRUD для контента |
| `listPlacementsByContentItem(contentItemId)` | `GET /pvl_content_placements?content_item_id=eq.…` | placements конкретного айтема |
| `createPlacement / updatePlacement / deletePlacement` | POST/PATCH/DELETE | CRUD placements |
| `listCalendarEvents(filters)` | `GET /pvl_calendar_events?cohort_id=…&visibility_role=…&module_number=…` | события календаря с фильтрами |
| `getCalendarEvent(id) / create / update / deleteCalendarEvent` | соответствующие | CRUD календаря (с нормализацией `event_type`) |
| `listFaqItems(targetRole)` / `create / update / deleteFaqItem` | `pvl_faq_items` | FAQ |

#### Студент / прогресс / homework
| Метод | Endpoint | Назначение |
|---|---|---|
| `listStudents()` | `GET /pvl_students` | все студенты |
| `upsertPvlStudent(payload)` | POST с `on_conflict=id`, `merge-duplicates` | создать/обновить студента |
| `listStudentQuestions(studentId)` / `createStudentQuestion` | `pvl_student_questions` | вопросы студента |
| `listStudentChecklistItems(studentId)` | `GET /pvl_checklist_items?student_id=eq.…` | tracker-чеки студента |
| `insertChecklistItem / deleteChecklistItem` | `pvl_checklist_items` | toggle чека |
| `getStudentCourseProgress(studentId)` | `GET /pvl_student_course_progress?student_id=eq.…` | прогресс по неделям |
| `upsertStudentCourseProgress(studentId, payload)` | POST `on_conflict=student_id,week_id`, `merge-duplicates` | upsert прогресса по неделе |
| `listStudentContentProgress(studentId)` / `upsertStudentContentProgress` | `pvl_student_content_progress` | library-progress (per content item) |
| `listStudentHomeworkSubmissions(studentId)` ([416](../../services/pvlPostgrestApi.js#L416)) | `GET /pvl_student_homework_submissions?student_id=eq.…` | **все submissions конкретного студента** |
| `getHomeworkSubmission(id)` | `GET /pvl_student_homework_submissions?id=eq.…` | одна submission |
| `createHomeworkSubmission / updateHomeworkSubmission` | POST / PATCH | CRUD submissions |
| `appendHomeworkStatusHistory(payload)` | `POST /pvl_homework_status_history` | запись статусной истории submission |
| `listHomeworkStatusHistory(submissionId)` | `GET /pvl_homework_status_history?submission_id=eq.…&order=changed_at.asc` | хронология статусов |

#### Курс
| Метод | Endpoint | Назначение |
|---|---|---|
| `listCourseWeeks` | `GET /pvl_course_weeks?order=week_number.asc` | недели курса |
| `listCourseLessons` | `GET /pvl_course_lessons?order=sort_order.asc` | уроки |
| `listHomeworkItems` | `GET /pvl_homework_items?order=sort_order.asc` | пункты ДЗ |
| `listPublishedHomeworkContentItems` | `pvl_content_items?status=eq.published&content_type=in.(homework,template,checklist,questionnaire)` | published-варианты для синхронизации |
| `upsertCourseWeek / upsertCourseLesson / upsertHomeworkItem` | POST с merge | upsert |

#### Mentor / Direct messages
| Метод | Endpoint | Назначение |
|---|---|---|
| `listGardenMentorLinksByStudentIds(uuids)` ([538](../../services/pvlPostgrestApi.js#L538)) | `GET /pvl_garden_mentor_links?student_id=in.(…)` (chunked по 45) | назначения менторов |
| `upsertGardenMentorLink(payload)` ([560](../../services/pvlPostgrestApi.js#L560)) | POST с merge → fallback PATCH → fallback INSERT | назначить ментора (с тройным fallback) |
| `listDirectMessages(mentorId, studentId)` | `GET /pvl_direct_messages?mentor_id=…&student_id=…&order=created_at.asc` | диалог ментор-ученица |
| `createDirectMessage(payload)` | POST | новое сообщение |

#### Прочее
| Метод | Endpoint | Назначение |
|---|---|---|
| `createAuditLog(payload)` | `POST /pvl_audit_log` (return=minimal) | audit |
| `listNotifications(userId)` / `markNotificationRead(id)` | `pvl_notifications` | уведомления |
| `loadRuntimeSnapshot()` | parallel `[items, placements, events, faq]` | холодный старт компонентов |

### 1.4. [`services/dataService.js`](../../services/dataService.js) (Garden-side, 2676 строк)

**Гранится только для Garden-объектов** (profiles / meetings /
events / news / scenarios / messages / shop / knowledge_base /
push / billing). **Нет ни одного метода с `homework`, `submission`,
`cohort`, `mentor`** (`grep -nc 'homework\|submission' = 0`).

PVL-домен в этот файл не лезет вообще. Полный список (~60 async-методов):
[см. grep ниже]

```text
login/register/logout/updatePassword/getCurrentUser/getUsers/
updateUser/incrementUserSeeds/getKnowledgeBase/addKnowledge/
updateKnowledge/bulkUpdateKnowledge/get|saveLibrarySettings/
getMeetings/addMeeting/updateMeeting/deleteMeeting/getAllEvents/
updateEvent/deleteEvent/getPractices/addPractice/updatePractice/
getNews/addNews/deleteNews/getBirthdayTemplates/addBirthdayTemplate/
get|addScenario/saveScenario/importLeagueScenarios/deleteScenario/
updateScenario/getMessages/addMessage/updateMessage/deleteMessage/
uploadChatImage/getPushStatus/enablePush/sendNewsPush/
uploadAvatar/compressMeetingImage + ShopItems CRUD ([1318-1349]) +
deleteUser ([1579]) + toggleUserStatus ([1591])
```

(Полный список — `grep '    async [a-zA-Z]' services/dataService.js`.)

### 1.5. [`utils/pvlHomeworkAnswerRichText.js`](../../utils/pvlHomeworkAnswerRichText.js) — извлечение plain text

**85 строк, реализация корректна** (учитывает DOMPurify
KEEP_CONTENT-gotcha из урока 2026-05-04).

#### Цепочка очистки
1. **`stripMsOfficeHtmlNoise(dirty)`** ([8-14](../../utils/pvlHomeworkAnswerRichText.js#L8-L14)) — regex-pre-filter ДО DOMPurify:
   ```js
   .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
   .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
   .replace(/<!--[\s\S]*?-->/g, '')
   .replace(/<\/?[a-z]+:[a-z][^>]*>/gi, '');  // xml-namespaced (<o:p>, <w:WordDocument> и т.п.)
   ```
2. **`sanitizeHomeworkAnswerHtml`** ([31-34](../../utils/pvlHomeworkAnswerRichText.js#L31-L34)) — DOMPurify с whitelist (p/h1-h6/ul/ol/li/strong/em/u/s/a/img/blockquote/pre/code/table/.../div/span). `data:` images разрешены через ALLOW_DATA_ATTR=false (data: в src идёт через ALLOWED_ATTR `src`).
3. **`homeworkAnswerPlainText`** ([37-41](../../utils/pvlHomeworkAnswerRichText.js#L37-L41)) — **второй DOMPurify-проход с пустым whitelist** для plain-text (`ALLOWED_TAGS: [], ALLOWED_ATTR: []`), затем `replace(/ /g, ' ').trim()`. Это и нужно для CSV-экспорта.

#### Учитывает ли KEEP_CONTENT-gotcha?
**Да, явно.** Комментарий на строках [3-7](../../utils/pvlHomeworkAnswerRichText.js#L3-L7):

> «DOMPurify в whitelist-режиме при KEEP_CONTENT:true по умолчанию
> режет тег, но оставляет текст внутри — поэтому CSS из `<style>`
> и т.п. иначе вылезают как plain text.»

Pre-filter `stripMsOfficeHtmlNoise` режет проблемные теги
**вместе с содержимым** до того, как DOMPurify их увидит. Lesson
2026-05-04 (`docs/lessons/2026-05-04-dompurify-keep-content-leaks-style-text.md`)
прямо отражён в коде.

#### Прочие функции
- `coerceAnswersJsonObject(raw)` ([48-62](../../utils/pvlHomeworkAnswerRichText.js#L48-L62)) — нормализация JSON-объект-или-строка-или-null (PostgREST/legacy данные);
- `normalizeAnswersJsonForStore(answersJson)` ([65-75](../../utils/pvlHomeworkAnswerRichText.js#L65-L75)) — pre-save sanitize всех string-полей через `sanitizeHomeworkAnswerHtml`;
- `pvlReadImageFileAsDataUrl(file)` ([78-85](../../utils/pvlHomeworkAnswerRichText.js#L78-L85)) — File → data: URL для img-вставки.

**Альтернатива plain-text-извлечения** есть в [`utils/pvlPlainText.js`](../../utils/pvlPlainText.js)
(существует отдельно — функция `pvlHtmlToPlainText` упомянута в
`PvlPrototypeApp.jsx:3054` для preview ментор-комментария).
**Это разные функции** — рекомендую для FEAT-016 использовать именно
`homeworkAnswerPlainText` (двухпроходная очистка).

### 1.6. Domain-слой — критическое наблюдение

Большинство UI-кода учительской читает не из PostgREST напрямую, а
через **mock domain API** из [`services/pvlMockApi.js`](../../services/pvlMockApi.js)
(4245 строк):

```js
import { studentApi, mentorApi, helpers, db } from './services/pvlMockApi';
const pvlDomainApi = { studentApi, mentorApi, helpers, db, /* … */ };
```

Ключевые методы (для FEAT-016/017):
- **`studentApi.getStudentDashboard(studentId)`** ([2560](../../services/pvlMockApi.js#L2560)) — снимок дашборда студента (compulsoryWidgets, activityFeed, dashboardStats, nextDeadline, risks, antiDebt, progress, points). **Читает из in-memory `db` + `syncPublishedHomeworkTasksForStudent`.**
- **`studentApi.getStudentResults(studentId, filters)`** ([2597](../../services/pvlMockApi.js#L2597)) — массив задач с displayStatus/submittedAt/typeLabel/deadlineAt/etc. Тоже из mock-`db.studentTaskStates`.
- **`mentorApi.getMentorMentees(mentorId)`** ([3041](../../services/pvlMockApi.js#L3041)) — список менти + их tasks; вытягивает каждого через `studentApi.getStudentResults`.
- **`mentorApi.getMentorReviewBoard(mentorId)`** ([3110](../../services/pvlMockApi.js#L3110)) — kanban-доска (unchecked/revision/done columns).
- **`helpers.getStudentPointsSummary(studentId)`** — суммирует баллы (mock).

#### Как mock синхронизируется с БД
- На старте: `syncPvlRuntimeFromDb()` ([960](../../services/pvlMockApi.js#L960)) и
  `syncPvlActorsFromGarden()` ([1057](../../services/pvlMockApi.js#L1057)) подгружают живые
  данные через `pvlPostgrestApi`.
- При изменениях: `fireAndForget` обёртки внутри mock'а (`checkItem`/
  `uncheckItem` на [2516-2541](../../services/pvlMockApi.js#L2516-L2541)) дублируют операцию в БД
  через `pvlPostgrestApi`.
- **Это и есть ARCH-012** — «Убрать клиентский `ensurePvlStudentInDb`
  self-heal в пользу серверного flow». Связка mock↔БД — точка
  потенциальных bugs (`u-st-1`-style stub-id, см. CLEAN-012,
  BUG-003 в backlog).

**Импликация для FEAT-016/017:** если делать выгрузку «реальных»
ДЗ — нужно пройти **через `pvlPostgrestApi.listStudentHomeworkSubmissions`
по списку студентов когорты**, а не через mock-domain. Дашборд
прогресса — то же самое: либо через сырые таблицы PostgREST, либо
через новый RPC-агрегатор на стороне БД (для перфоманса).

---

## 2. AdminPanel.jsx — структура, есть ли таб аналитики

[`views/AdminPanel.jsx`](../../views/AdminPanel.jsx), **1606 строк.**

### Табы (строки [727-737](../../views/AdminPanel.jsx#L727-L737))
```jsx
['stats', 'users', 'content', 'news', 'events', 'shop'].map(t => (
    <button onClick={() => { setTab(t); sessionStorage.setItem('adminTab', t); }} … >
        {t === 'stats' ? 'Статистика' : t === 'users' ? 'Пользователи' …}
    </button>
))
```

| Таб | Компонент | Что показывает |
|---|---|---|
| `stats` | `AdminStatsDashboard` ([22](../../views/AdminPanel.jsx#L22)) | meetings stats: totalMeetings, totalGuests, totalIncome, period (month/year/all/custom) |
| `users` | inline таблица ([1133](../../views/AdminPanel.jsx#L1133)) | список профилей, кнопки роли/статуса/удаления |
| `content` | inline ([1275](../../views/AdminPanel.jsx#L1275)) | knowledge_base CRUD |
| `news` | inline ([746](../../views/AdminPanel.jsx#L746)) | новости CRUD |
| `events` | inline ([840](../../views/AdminPanel.jsx#L840)) | админский список events |
| `shop` | `ShopAdmin` ([1591](../../views/AdminPanel.jsx#L1591)) | shop_items CRUD |

### Есть ли таб с аналитикой по студентам?

**Нет.** Ни в Garden AdminPanel, ни в PvlPrototypeApp нет
агрегатной аналитики по PVL-студентам (cross-cohort progress
table / debt-list / submission-rate). Ближайшая аналитика —
`AdminStatsDashboard` (только meetings) и mentor-side
`MentorDashboard` (только свои менти, не cohort-wide).

**FEAT-017 — это новый таб (или новая страница)** — не
расширение существующего. Логичные места:
1. Новый таб `pvl-progress` в `AdminPanel.jsx` (рядом с `stats`).
2. Или отдельный admin-роут в учительской `/admin/pvl-progress`
   (PvlPrototypeApp уже умеет admin-маршруты — см.
   `adminRoutePath` [780](../../views/PvlPrototypeApp.jsx#L780),
   `resolveAdminDrilldownNav` [793](../../views/PvlPrototypeApp.jsx#L793)).
3. Или новая страница в Mentor-cabinet'е (но это менторская
   ответственность, не админская — скорее (1) или (2)).

---

## 3. Существующие PVL-screens учительской (детальный взгляд)

### 3.1. Дашборд ментора ([`MentorDashboard`](../../views/PvlPrototypeApp.jsx#L3953))

```jsx
function MentorDashboard({ navigate, mentorId, refresh, refreshKey = 0 }) {
    const menteeRows = useMemo(() => buildMentorMenteeRows(mentorId), [mentorId, refreshKey]);
    // …
    return (
        <div className="space-y-5">
            <header><h2>Дашборд ментора</h2><p>{mentorUser?.fullName}</p></header>
            <MentorMenteesGardenGrid navigate={navigate} menteeRows={menteeRows} heading="Мои менти" />
            <PvlDashboardCalendarBlock title="Календарь курса" viewerRole="mentor" cohortId={mentorCohortId} … />
            <h3>Канбан проверок</h3>
            <MentorKanbanBoard mentorId={mentorId} navigate={navigate} refreshKey={refreshKey} … />
        </div>
    );
}
```

Сейчас показывает: **список менти карточками** (`MentorMenteesGardenGrid`),
**календарь курса**, **канбан проверок**. Никакой агрегатной
аналитики «кто запаздывает в когорте» — только свои менти.

### 3.2. Карточка менти ([`buildMentorMenteeRows`](../../views/PvlPrototypeApp.jsx#L3539))

Уже агрегирует **все ключевые метрики для FEAT-017**:

```js
{
    user, userId, cohortLine, moduleWeekLine, city,
    closedPct, closedCount, totalTasks,
    pendingReview, inRevision,
    lastDone,
    stateLine, // 'в ритме' | 'есть долги' | 'нужна проверка' | 'ДЗ не начаты'
    overdueN,
    revisionCyclesTotal, notStartedHw,
    coursePoints, coursePointsMax,
    riskCount,
}
```

**Это готовый row-shape для дашборда прогресса.** Только сейчас
строится из mock-domain (не из БД) и только для одного ментора.
Для FEAT-017 нужно: либо обобщить функцию до cohort-wide,
либо переписать на PostgREST.

### 3.3. Результаты студента — компонент в [2990](../../views/PvlPrototypeApp.jsx#L2990)

Студентский экран `Результаты` (не админский!). Source: `pvlDomainApi.studentApi.getStudentResults(studentId, {})`.
Показывает summary cards (Принято / На проверке / На доработке),
filter dropdown по статусу, список заданий с `StatusBadge` и
кнопкой «Открыть задание». Для FEAT-016/017 — это шаблон UI
для одной строки, можно переиспользовать stylings (badges,
filter dropdown).

### 3.4. Очередь проверок ([`MentorReviewQueuePanel`](../../views/PvlPrototypeApp.jsx#L3944) → [`MentorKanbanBoard`](../../views/PvlPrototypeApp.jsx#L3712))

Логика выборки:
```js
// MentorKanbanBoard
const board = useMemo(() => {
    return pvlDomainApi.mentorApi.getMentorReviewBoard(mentorId);
}, [mentorId, refreshKey]);
```

`getMentorReviewBoard` ([pvlMockApi.js:3110](../../services/pvlMockApi.js#L3110)) возвращает 3
колонки: `unchecked` / `revision` / `done`. Каждая карточка —
ДЗ конкретного студента, drag-and-drop переносит между статусами
(на десктопе) или select-dropdown (на мобиле, [3791-3801](../../views/PvlPrototypeApp.jsx#L3791-L3801)).

Не нужно для FEAT-016/017 напрямую, но даёт паттерн **3-column
board** на случай, если дашборд прогресса станет 3-зонным
(в ритме / на проверке / долги).

---

## 4. Reusable-компоненты в Garden — что есть, чего нет

### 4.1. `components/` (14 файлов)

```
Button.jsx, CalendarWidget.jsx, Card.jsx, ConfirmationModal.jsx,
ErrorBoundary.jsx, Input.jsx, LivingTree.jsx, MeetingCard.jsx,
ModalShell.jsx, PvlErrorBoundary.jsx, RichEditor.jsx, Toast.jsx,
TreeIcon.jsx, UserAvatar.jsx
```

**Нет** sortable-table, filter-bar/search-bar, ProgressBar
(прогресс-индикатор внутри `StudentDashboard` рисуется inline,
строки [2126-2128](../../views/PvlPrototypeApp.jsx#L2126-L2128) — просто `<div>`-bar).
Есть `ModalShell.jsx` — переиспользовать для export-modal можно.

### 4.2. `utils/`

| Утилита | Что делает |
|---|---|
| `pvlDateFormat.js` | `formatPvlDateTime`, `formatPvlDateOnly` и др. — форматирование дат для PVL |
| `pvlHomeworkAnswerRichText.js` | См. секцию 1.5 — sanitize/plain-text/data-URL для homework |
| `pvlPlainText.js` | альтернативный plain-text (используется в `t.mentorCommentPreview`-preview) |
| `pvlMarkdownImport.js` | `markdownToPvlHtml`, `parsePvlImportedMarkdownDoc` |
| `pvlQuestionnaireBlocks.js` | блоки опросника + проверка completeness |
| `pvlGardenAdmission.js` | `isGardenStaffProfile`, `classifyGardenProfileForPvlStudent` |
| `meetingTime.js`, `timezone.js` | TZ-математика |
| `roles.js` | константы ролей + helpers |

**Нет общей CSV-утилиты.** Единственный прецедент download'а CSV —
[`views/PracticesView.jsx:286-296`](../../views/PracticesView.jsx#L286-L296):

```js
const handleDownloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'practices-template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};
```

9 строк, inline. Для FEAT-016 имеет смысл вынести в общую утилиту
`utils/csvDownload.js` (`downloadCsv(filename, rows, columns)` +
`escapeCsvCell` для экранирования кавычек/запятых/переносов).

### 4.3. Sortable-table

**Нет компонента.** Есть только `sortLibraryItems(items, sortBy)` ([1422-1427](../../views/PvlPrototypeApp.jsx#L1422-L1427))
для сортировки массива — не для рендеринга таблицы.

В `AdminPanel.jsx` таблицы пользователей/контента/событий
рендерятся inline без sortable-headers. UX-002 в backlog уже
запланирована («sortable таблицы, sticky header, фильтры») —
будущая база для FEAT-017.

### 4.4. Filter-bar / search-bar

**Нет переиспользуемого компонента.** Filter-dropdowns — inline
`<select>` в каждом месте (например, в Студентских Результатах
[2994-3004](../../views/PvlPrototypeApp.jsx#L2994-L3004) и в `AdminStatsDashboard`).

### 4.5. Modal / progress-indicator

- **Modal:** `ModalShell.jsx` + `ConfirmationModal.jsx` — оба
  переиспользуемы для export-confirm / progress-during-export.
- **Progress-indicator:** нет компонента. Прогрессbar'ы рисуются
  inline (например, [2126-2128](../../views/PvlPrototypeApp.jsx#L2126-L2128)). Для FEAT-016 если экспорт
  длительный (>1 сек) — нужен новый компонент или inline-loader.

---

## 5. Routing в Garden

### 5.1. App.jsx — entry-level routing

Garden **не использует React Router.** Маршрутизация — state-based
через `viewMode` ([App.jsx:18](../../App.jsx#L18)):

```jsx
const [viewMode, setViewMode] = useState('default');
// …
return (
  loading ? <Loading /> :
  !currentUser ? <AuthScreen /> :
  (currentUser.role === 'admin' && viewMode !== 'app') ? <AdminPanel /> :
  <UserApp />
);
```

Между AdminPanel и UserApp переключаемся через `setViewMode('app')` /
`setViewMode('default')` (App.jsx [497](../../App.jsx#L497) и
[563](../../App.jsx#L563)).

URL **не меняется.** Это PROD-004 в backlog («реализовать
SPA-роутинг с отдельными URL»).

### 5.2. UserApp — внутренний tab-state

[`views/UserApp.jsx:221-235`](../../views/UserApp.jsx#L221-L235):

```jsx
const [initialTab, setInitialTab] = useState('meetings');
// …
const [view, setView] = useState(...); // 'meetings' / 'profile' / 'garden' / etc.
```

Переключение через `handleViewChange('meetings'|'profile'|…)`
тоже без URL. Sidebar-кнопки рендерят активность через
`active={view === 'meetings'}`.

### 5.3. PvlPrototypeApp — кастомный route-state

Это **самый сложный** маршрутный кусок. Internal `route` strings
(`/mentor/dashboard`, `/student/about`, `/admin/pvl`, etc.)
парсятся **внутри** `PvlPrototypeApp` через regex'ы и string
prefix'ы (см. `MentorPage` switch [3998-4055](../../views/PvlPrototypeApp.jsx#L3998-L4055)).

Прокидывание навигации в Garden — через ref-bridge:

```jsx
// UserApp.jsx ~683
gardenPvlBridgeRef.current?.navigate?.(item.route);
```

То есть **единого роутера в проекте нет**. PVL-секция сама
управляет своими route-prefixes.

#### Импликация для FEAT-016/017

Если новый дашборд встраивается в:
- **AdminPanel** → state-tab внутри `AdminPanel.jsx` (как
  существующие `stats`/`users`/…).
- **Учительская PVL admin-cabinet** → новый case в
  `PvlPrototypeApp.jsx` switch'е, route типа `/admin/pvl-progress`.

В обоих случаях **URL в браузере не изменится** до выкатывания
PROD-004. Это **не блокер** для FEAT-016/017, но имеет смысл
учесть, что прямую ссылку «открой страницу прогресса» дать
нельзя без отдельного roll-out PROD-004.

---

## 6. Open questions от executor стороны

### Бизнес-логика

1. **FEAT-016 — что именно выгружать?** В backlog описание короткое:
   «Выгрузка результатов домашек ПВЛ — особенно feedback по
   модулю». Конкретика, которую нужно решить **до** написания
   кода:
   - Все ДЗ всех студентов когорты, или фильтр по неделе/модулю/
     ментору?
   - Что в каждой строке: `student / cohort / week / homework_id /
     status / submitted_at / mentor_comment_plain / score`?
     Какой набор столбцов считается полным «feedback»?
   - **Mentor feedback** хранится в `pvl_student_homework_submissions`
     (поле `mentor_comment` или подобное?) или в
     `pvl_homework_status_history.payload`? Это DB-side recon
     стратега.
   - Формат: CSV (UTF-8 с BOM для Excel?) или XLSX (потребует
     библиотеку — sheetjs/exceljs +50 KB)?
   - Доступ: только админ, или ментор тоже может выгружать своих
     менти?

2. **FEAT-017 — какие метрики в дашборде?** `buildMentorMenteeRows`
   уже даёт хороший row-shape. Нужно подтвердить:
   - Какие из этих метрик нужны Ольге **в первую очередь**?
   - Нужен ли drill-down (клик по студенту → его карточка)?
   - Нужны ли группировки по когорте / ментору?
   - Cohort-wide (все когорты сразу) или одна выбранная?
   - Risk-классификация: использовать `stateLine` ('в ритме' /
     'есть долги' / 'нужна проверка' / 'ДЗ не начаты') или
     числовой score?

### Техническая

3. **Mock-vs-real data layer.** Сейчас mentor-cabinet рисуется в
   основном из `pvlMockApi`. Для FEAT-017 принципиальный вопрос:
   - Делать новую страницу через **direct PostgREST queries**
     (минуя mock) — независимая от ARCH-012 ветка, потенциально
     дублирует логику aggregation.
   - Через **новый RPC-агрегатор на стороне БД** — `pvl_admin_progress_summary()`
     с joins по студентам/cohorts/submissions; чище для BIG-N,
     но тянет миграцию.
   - Через **mock-domain** (как сейчас mentor-cabinet) — нечестно,
     данные могут не совпадать с реальными для admin-аудита.
   
   Стратег решает; executor готов реализовать любой из трёх.

4. **Производительность.** `buildMentorMenteeRows` для 1 ментора
   уже довольно тяжёлая (`getStudentResults` для каждого менти,
   `getStudentPointsSummary` тоже). Если делать cohort-wide
   (60+ студентов сразу) — это **3-5 секунд** для одного клика
   при текущей реализации. RPC-агрегатор спасёт.

5. **CSV vs XLSX.** Если CSV — нужна общая утилита `utils/csvDownload.js`
   (~30 строк, идемпотентно от `PracticesView.jsx`). Если XLSX —
   нужна dependency (`xlsx` ~600 KB или `exceljs` ~1 MB), что
   заметно увеличит bundle. Стандартный выбор для подобных тулз —
   CSV с UTF-8 BOM (для Excel), это и легче, и достаточно для
   feedback-выгрузки.

6. **PvlPrototypeApp.jsx и так огромен (8382 строки).** FEAT-017
   как ещё одна функция-компонент в этом файле — приемлемо,
   но новая аналитическая страница вполне может жить в
   отдельном файле `views/AdminPvlProgress.jsx`. Это REFACTOR-001
   territory, не блокер.

---

## 7. Что вернуть стратегу

Этот файл (`docs/_session/2026-05-07_02_codeexec_recon_feat016_017_report.md`).
Стратег объединит с DB-side recon (своим), сформирует общий
отчёт и план FEAT-016/017.

Не закоммичено, не запушено. Read-only.
