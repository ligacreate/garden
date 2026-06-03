# Recon (READ-ONLY): статус-рассинхрон Курдюковой + соц-психология не в библиотеке

**Ментор:** Елена Федотова (`profiles.id = 0e779c13-4cf8-48f7-9dd0-caa8da9a0d72`, role `mentor`)
**Дата:** 2026-06-03 · **Тип:** разведка, ничего не менял (ни БД, ни код, ни прод-сервер).
**Источники:** прод-БД `default_db` (psql под `gen_user`, READ-ONLY) + репо `ligacreate/garden` @ `main` (bec77ae).

> Фикс НЕ делал. Ниже — сырые факты + вердикты по бисекту. Жду ревью.

---

## БАГ 1 — статус-рассинхрон: «принято», а в карточке «На проверке»

### TL;DR вердикт
Это **НЕ** баг отображения «карточка читает не то поле» и **НЕ** дрейф двух статус-полей внутри одной строки.
Это **дубль-строка** в `pvl_student_homework_submissions`: на одно задание у Курдюковой **две** записи —
новая `accepted` и старая «осиротевшая» `in_review`, — а слой маппинга (`pvlMockApi`) схлопывает их в один
статус по принципу **last-write-wins** в порядке `updated_at.desc`, из-за чего **старый `in_review` затирает
`accepted`**. Корень — дубль на уровне данных (нет `UNIQUE(student_id, homework_item_id)` + неатомарный
select-then-insert в persist), симптом — недедуплицирующий маппер.

### 1.1 Сырые факты из БД

**Менти:** `Елена Курдюкова` — `profiles.id = pvl_students.id = 5aa62776-6229-4270-9886-33316ff035c6`,
cohort `…101`. Связь с ментором подтверждена через `pvl_garden_mentor_links`:
`student 5aa62776 (Курдюкова) → mentor 0e779c13 (Федотова)`.
(Замечание на полях: `pvl_students.mentor_id` у неё **NULL** — фактическая привязка живёт только в
`pvl_garden_mentor_links`. К данному багу не относится, но это рассинхрон источников привязки.)

**Все сабмишены Курдюковой** (10 шт). Аномалия — задание «Рефлексия модуля 2 (Веди)», у которого **ДВЕ** строки:

| submission_id | homework_item_id | status | submitted_at | accepted_at | created_at | updated_at |
|---|---|---|---|---|---|---|
| `447b16f0…749a` | `de64aa54…74ee` | **in_review** | 2026-05-29 | **NULL** | 2026-05-29 19:30:28.**319** | 2026-05-29 19:30:28.319 |
| `6018e8e6…6a60` | `de64aa54…74ee` | **accepted** | 2026-05-29 | 2026-05-30 | 2026-05-29 19:30:28.**719** | 2026-05-30 20:48:45.212 |

- Оба ряда ссылаются на **один** `homework_item_id = de64aa54-df66-483c-b162-d8eb94e174ee`
  (`pvl_homework_items.title = «Рефлексия модуля 2 (Веди)»`, `module_number=2`, `is_module_feedback=t`,
  `external_key = task-ci-5067b49b-…`).
- `created_at` различаются на **~400 мс** (`.319` vs `.719`) → классический двойной INSERT (race / повторная отправка).
- Старая строка `447b16f0` так и осталась `in_review`, `accepted_at = NULL` — её **никто не принимал**.
- Новую строку `6018e8e6` ментор Федотова приняла (см. историю).

**Это единственный дубль во всей БД** (по `(student_id, homework_item_id)` с count>1 — ровно 1 пара, именно эта).
Распределение статусов в таблице: `accepted=92`, `in_review=5`, `revision=1`.

**История статусов** (`pvl_homework_status_history`) по обоим сабмишенам — раскрывает механику:

| submission_id | from→to | changed_by | changed_at | комментарий |
|---|---|---|---|---|
| `447b16f0` (orphan) | draft→in_review | Курдюкова (студент) | 2026-05-29 19:30:21.245 | «Отправлено на проверку» |
| `6018e8e6` | draft→in_review | Курдюкова (студент) | 2026-05-29 19:30:21.245 | «Отправлено на проверку» |
| `6018e8e6` | draft→in_review | **Федотова (ментор)** | 2026-05-29 19:30:21.245 | «Отправлено на проверку» ← дубль-actor |
| `6018e8e6` | draft→in_review | **Федотова (ментор)** | 2026-05-29 19:30:21.245 | «Отправлено на проверку» ← ещё дубль-actor |
| `6018e8e6` | in_review→accepted | Федотова | 2026-05-29 22:44:45.719 | длинный разбор-отзыв |
| `6018e8e6` | in_review→accepted | Федотова | 2026-05-30 20:48:32.856 | «Принято.» |

Видны **дубль-строки истории** (один и тот же переход `draft→in_review` с одинаковым `changed_at`, но разными
actor'ами — студент + ментор дважды) и **двойной accept** — это отдельный известный паттерн
`STATUS-HISTORY-DUP-REGRESSION` (см. §1.4). Сам по себе для карточки он вторичен; первичен — **дубль строки сабмишена**.

**Констрейнты `pvl_student_homework_submissions`:** PK по `id`, FK на students/items, CHECK по статусу/баллам.
**`UNIQUE(student_id, homework_item_id)` ОТСУТСТВУЕТ.** Индексы — только не-уникальные (`student_id`,
`homework_item_id`, `status`). → БД не мешает положить две строки на одно задание. Это корневой enabler.

### 1.2 Где карточка ментора БЕРЁТ статус (read-путь)

Карточка менти (`views/PvlMenteeCardView.jsx`) рисует статус из `pvlDomainApi` → `db.studentTaskStates[].status`.
Эта `db` наполняется **реальными** данными из прод-БД через гибридный слой `pvlMockApi` (не чистый mock):
`services/pvlMockApi.js:842-845` тянет `pvlPostgrestApi.listStudentHomeworkSubmissions(...)`.

API-выборка отдаёт **все** строки без дедупа, отсортированные `updated_at.desc`:
- `services/pvlPostgrestApi.js:432-436` — `listStudentHomeworkSubmissions`, `order: updated_at.desc`,
  статус нормализуется `in_review → pending_review`, `accepted → accepted`.

Схлопывание строк в один per-item статус — `services/pvlMockApi.js:891-925`
(`processStudentTrackerAndHomework`):
```
await Promise.allSettled((subs || []).map(async (row) => {
  const taskId = mockTaskIdBySqlHomeworkId.get(String(row.homework_item_id)); // оба дубля → ОДИН taskId
  const mapped = homeworkDbStatusToTaskStatus(row.status);
  let state = db.studentTaskStates.find(s => s.studentId===userId && s.taskId===taskId);
  if (!state) { …создать со status: mapped… }
  else { state.status = mapped; … }   // ← LAST-WRITE-WINS, без сравнения «свежести»
```
Синхронная часть (find/создать/`state.status = mapped`) каждого колбэка выполняется **до** первого `await`
(первый `await` — `listHomeworkStatusHistory` на строке 944), т.е. все мутации статуса проходят в **порядке массива**.
Порядок массива = `updated_at.desc` → для нашего `taskId`:
1. сначала `6018e8e6` (accepted, updated 05-30) — создаёт state со статусом `accepted`;
2. затем `447b16f0` (in_review, updated 05-29) — находит существующий state и **перезаписывает** `state.status` на
   `pending_review` (= «На проверке»).

`homeworkDbStatusToTaskStatus` (`services/pvlMockApi.js:563`) на `pending_review` → `TASK_STATUS.PENDING_REVIEW`;
лейбл «На проверке» (`utils/pvlHomeworkReport.js:20-21` `pending_review: 'На проверке'`).
Доп.штрих рассинхрона: на строке 921 `state.acceptedAt` от orphan'а **не** обнуляется (у него `accepted_at=NULL`,
ветка `? : state.acceptedAt` сохраняет дату принятия 05-30) — т.е. карточка может одновременно нести «принято 30.05»
и статус «На проверке».

**Контраст:** другой потребитель тех же строк — генератор MD-отчёта `utils/pvlHomeworkReport.js:370-380` —
**дедуплицирует** по `homework_item_id`, оставляя строку с **максимальным** `updated_at`. Поэтому в выгрузке-отчёте
задание показывается корректно `accepted`. То есть баг локализован именно в недедуплицирующем маппере `pvlMockApi`,
а не в самих данных «нечитаемых».

### 1.3 Где пишется «принято» при accept ментора (write-путь) + откуда дубль

`services/pvlMockApi.js:2168-2189` (`doPersistSubmissionToDb`) — **select-then-insert без атомарности**:
```
const existing = await listStudentHomeworkSubmissions(sqlStudentId);
let row = existing.find(x => x.homework_item_id === sqlHomeworkId);
…
if (!row) row = await createHomeworkSubmission(patch);   // INSERT
else      await updateHomeworkSubmission(row.id, patch); // PATCH
```
`createHomeworkSubmission` (`services/pvlPostgrestApi.js:464-473`) — обычный `POST` **без** `on_conflict`/upsert.
Обёртка `persistSubmissionToDb` (`services/pvlMockApi.js:2210-2226`) — `fireAndForget` + retry `[0, 2000, 5000]ms`.

→ При двух почти одновременных persist'ах (повторный submit / retry / параллельный триггер) оба `existing.find`
не видят чужую ещё-не-видимую строку → **оба делают INSERT** → две строки. Ровно картина `.319`/`.719`.
Accept ментора затем PATCH'ит **ту строку, которую нашёл** (`6018e8e6`), а вторая (`447b16f0`) остаётся `in_review` навсегда.

### 1.4 Связь со STATUS-HISTORY-DUP-REGRESSION (P1)

**Та же семья причин — неидемпотентный persist**, но **другая таблица/симптом**:
- `STATUS-HISTORY-DUP-REGRESSION` (описан в `docs/_session/2026-05-26_131_…petrunya…md:398`): строки 2195-2207
  на каждый persist дослыают `historyRows.slice(-3)` с `changed_by = текущий auth user` → дубли строк в
  `pvl_homework_status_history` с разными actor'ами/тем же `changed_at`. Это видно и здесь (таблица в §1.1:
  `draft→in_review` от студента + дважды от ментора).
- **Данный баг карточки** — дубль строки в `pvl_student_homework_submissions` (двойной INSERT), это **не** про
  history-таблицу.

Важно для ревью: предложенный в _131 фикс (не слать прошлую history / dedup через ON CONFLICT по history) уберёт
дубль-history, **но не добавит** уникальности сабмишенам → **карточку Курдюковой он НЕ починит**. Нужны оба слоя.

### 1.5 Вердикт по БАГу 1 (бисект)
- **Где правда расходится:** на уровне **строк** (дубль), не полей и не отображения. В БД реально есть `in_review`-строка.
- **Корень:** отсутствие `UNIQUE(student_id, homework_item_id)` + неатомарный select-then-insert в persist (двойной INSERT).
- **Усилитель/симптом:** недедуплицирующий last-write-wins маппер в `pvlMockApi` с порядком `updated_at.desc`
  (старый `in_review` затирает `accepted`).
- **Точечная починка данных** (если решим): осиротевшая строка `447b16f0-946f-4381-88b8-63b6588a749a` —
  кандидат на удаление/слияние (но это уже фикс — **не делал**, жду ревью).

---

## БАГ 2 — у ментора в библиотеке нет соц-психологии, «перебрасывает» в «библиотеку курса»

### TL;DR вердикт
**Пустой модуль, а не неверный редирект.** Уроки соц-психологии физически **не залиты в PVL-слой**
(`pvl_content_items` — 0 записей про соц-психологию). Они живут **только** в старом Garden-слое:
таблица `knowledge_base` (7 статей) + статическая карточка курса в `CourseLibraryView` + трекинг в `course_progress`.
Менторская «Библиотека» в PVL по дизайну ведёт на `/mentor/library` = PVL «Библиотека курса» (доп. материалы
«Пиши»/«Веди»). Никакого редиректа «с существующего контента» нет — в PVL такого контента и ссылки на Garden-курс просто нет.

### 2.1 Где живут уроки соц-психологии (сырые факты)

**В PVL-слое (`pvl_content_items`) — НЕТ.** Поиск по `title/category ILIKE '%психолог%'/'%соц%'` → **0 строк**.
Раздел библиотеки PVL (`target_section='library'`, 30 опубликованных items) состоит **только** из двух категорий:
`«Дополнительные материалы к модулю «Пиши»»` (16) и `«…«Веди»»` (14). Это и есть «доп материалы»,
куда «перебрасывает». Категории соц-психологии в PVL нет ни в одной секции
(`category_title` по всем items: только «Пиши»/«Веди»/NULL).

**В старом Garden-слое — ДА:**
- `knowledge_base`: **7 статей**, `category = «Социальная психология»`, `role = 'all'`, `type = Статья`:
  id `44` «Что такое социальная психология?», `45` «Психология доверия и открытости», `48` «Социальное влияние
  ведущего», `49` «Активное слушание и рефлексия», `50` «Конфликты и сложные ситуации на встрече», `51` «Мотивация
  и вовлеченность участников встреч», `53` «Особенности работы с разными группами участников».
- `course_progress`: `course_title = «Социальная психология»` — **35 завершений** (material_id 44-53). Контент реально используется.
- `views/CourseLibraryView.jsx:79-87` — статическая карточка курса `id: 7, title: «Социальная психология»,
  minRole: APPLICANT, hideWhenEmpty: true` (без inline-materials — материалы подтягиваются из `knowledgeBase` по
  `category === title`).

### 2.2 Почему «перебрасывает в библиотеку курса» (логика маршрута)

- Меню ментора в PVL: `services/pvlGardenNav.js:46` — пункт «Библиотека» → `route: '/mentor/library'`.
- `/mentor/library` рендерит **PVL-библиотеку**, озаглавленную «Библиотека курса»
  (`views/PvlPrototypeApp.jsx:1679`; маппинг секции `Библиотека`/`Библиотека курса` → `library`
  на `views/PvlPrototypeApp.jsx:259-260`). Контент — `pvl_content_items` (доп материалы «Пиши»/«Веди»).
- **Отдельной ссылки на Garden-курс «Социальная психология» из PVL-оболочки ментора НЕТ.** Соц-психология доступна
  только в главной Garden-библиотеке (`CourseLibraryView`), т.е. после выхода из PVL («Вернуться в сад»).
- Доступность для роли: соц-псих карточка гейтится `availableCourses` (`views/CourseLibraryView.jsx:383-400`):
  показывается при `materialsCount > 0`. Материалы `role='all'`, а `MENTOR` (level 3, `utils/roles.js:16,27-29`)
  проходит `hasAccess(mentor, APPLICANT=0)` → **в Garden-библиотеке ментор соц-психологию увидел бы**. Проблема не в
  правах, а в том, что это **другая** библиотека, чем PVL-«Библиотека курса».

То, что ментор воспринимает как «перебрасывает в доп материалы», — это и есть единственная библиотека, доступная
внутри PVL-оболочки: «Библиотека курса» (`pvl_content_items`), где соц-психологии нет.

### 2.3 Вердикт по БАГу 2
- **Где живут уроки:** старый Garden-слой — `knowledge_base` (7 статей, role=all) + `CourseLibraryView` курс id 7 +
  `course_progress` (35 завершений). **Не в `pvl_content_items`.**
- **Есть ли соц-психология в PVL-слое:** **нет, 0 content items.**
- **Природа бага:** **ПУСТОЙ МОДУЛЬ / контент не залит в PVL**, а не неверный редирект при существующем контенте.
  PVL-«Библиотека» по дизайну = «Библиотека курса» (доп материалы); ни соц-псих контента в PVL, ни моста на Garden-курс нет.
- **Развилка продукта (на ревью, не чинил):** либо (а) перенести/опубликовать соц-психологию как `pvl_content_items`
  (категория библиотеки), либо (б) добавить в PVL-оболочку ссылку/мост на Garden-курс «Социальная психология».
  Это продуктовое решение — за Ольгой/стратегом.

---

## Что НЕ делал
- Не менял БД (ни строк, ни схемы), не удалял дубль-сабмишен, не добавлял констрейнт.
- Не менял код и не трогал прод-сервер `5.129.251.56` (только READ-ONLY psql).
- Фикс по обоим багам не делал — жду 🟢 на ревью, отдельным diff'ом.

## Ключевые ссылки на код
- read-путь статуса: `services/pvlMockApi.js:891-925` (last-write-wins), `services/pvlPostgrestApi.js:432-436` (order desc)
- write-путь/дубль: `services/pvlMockApi.js:2168-2189` (select-then-insert), `2210-2226` (retry), `services/pvlPostgrestApi.js:464-473` (POST без on_conflict)
- корректный контр-пример дедупа: `utils/pvlHomeworkReport.js:370-380`
- history-дубль: `services/pvlMockApi.js:2195-2207` (slice(-3))
- библиотека: `services/pvlGardenNav.js:46`, `views/PvlPrototypeApp.jsx:259-260,1679`, `views/CourseLibraryView.jsx:79-87,383-400`

---

## FIX APPLIED — БАГ 1, прод-данные (2026-06-01, по 🟢 Ольги)

**Операция:** удаление осиротевшей дубль-строки `447b16f0` в одной транзакции с условным COMMIT/ROLLBACK.
Выполнено через psql под `gen_user` (одна сессия). Только данные — **код не менялся**.

**Preflight:** дубль-скан по всей БД → ровно 1 пара (`5aa62776` / `de64aa54`). Больше ничего не трогал.

**BEFORE → AFTER (по заданию `de64aa54` «Рефлексия модуля 2 (Веди)» у Курдюковой):**

| | строки | collapse-эмуляция → карточка |
|---|---|---|
| BEFORE | `447b16f0` in_review (accepted_at NULL) + `6018e8e6` accepted | **На проверке** (брался MIN(updated_at) = orphan) |
| DELETE | `DELETE 1` (строгий предикат `id + status='in_review' + accepted_at IS NULL`) | — |
| AFTER | только `6018e8e6` accepted | **Принято** ✅ |

`ok_to_commit = true` (осталась ровно 1 строка, статус accepted) → **COMMITTED**.
POST-TXN: одна строка `6018e8e6` accepted; дубль-скан по всей БД → **0 строк**.

**Верификация collapse-логики:** эмулирована в SQL точной формулой бага — статус строки с `MIN(updated_at)`
(последняя итерация цикла `updated_at.desc` в `pvlMockApi.js:891-925`). BEFORE давал `in_review`→«На проверке»
(воспроизводит симптом), AFTER даёт `accepted`→«Принято». С одной строкой last-write-wins больше неоднозначен.

**Контент не потерян:** payload orphan'а `447b16f0` содержал ту же версию-черновик `ver-1780072220151-1681`,
что и выживший `6018e8e6`; уникального ответа ученицы в нём не было (ментор-тред и accept жили в `6018e8e6`).

### Артефакт отката (если понадобится воссоздать orphan)
```sql
-- полный снимок удалённой строки 447b16f0 (to_jsonb на момент удаления):
INSERT INTO pvl_student_homework_submissions
SELECT * FROM jsonb_populate_record(
  NULL::pvl_student_homework_submissions,
  $ROLLBACK${"id": "447b16f0-946f-4381-88b8-63b6588a749a", "score": 0, "status": "in_review", "payload": {"thread": [], "versions": [{"id": "ver-1780072220151-1681", "links": [], "isDraft": false, "createdAt": "2026-05-29T16:30:20.151Z", "isCurrent": false, "authorRole": "student", "answersJson": {"qb-qa-1": "Больше всего запомнились практические встречи, когда просто с открытым ртом сидишь и слушаешь других участниц.&nbsp;<p>Про состояния: у меня были качели от: Боже, сколько нужно сделать, до: я сделала!&nbsp;</p><p>Было много вдохновения, творчества, структуры.</p>", "qb-5e6251a3": "Возможно, добавила бы пример сценария с его разбором по косточкам от а до я - это вот это, теперь вот это. Практики были разобраны ранее, их можно было бы уже не рассматривать в нем.", "qb-8a5fb489": "1. Я забираю с собой сильные вопросы, потихоньку разобрала с вопросами к вопросам несколько ситуаций.<p>2. Вопросы для шеринга: насколько они могут быть разными и близко лежащими к практике.</p><p>3. Взяла фразы в копилку, которые можно использовать при разных непонятных ситуациях.</p><p>4. И внутри нужно место для всего что происходит.</p>", "qb-bb8903fa": "Мой ментор - Елена. Коммуникация складывается на мой взгляд хорошо, мне достаточно поддержки и обратной связи. Обратная связь -качественная, Лена предлагает свои варианты, что-то подсвечивает, что можно доработать и как - это продвигает. Очень много благодарности за поддержку на тренировочном завтраке и его подготовке."}, "attachments": [], "textContent": "", "submissionId": "sub-1780063729352-8420", "versionNumber": 1}], "draftVersionId": "ver-1780072220151-1681", "currentVersionId": null}, "checked_at": "2026-05-29T03:00:00+03:00", "created_at": "2026-05-29T19:30:28.319862+03:00", "student_id": "5aa62776-6229-4270-9886-33316ff035c6", "updated_at": "2026-05-29T19:30:28.319862+03:00", "accepted_at": null, "submitted_at": "2026-05-29T03:00:00+03:00", "revision_cycles": 0, "homework_item_id": "de64aa54-df66-483c-b162-d8eb94e174ee", "mentor_bonus_score": 0}$ROLLBACK$::jsonb
);
```

### Остаётся открытым (НЕ чинил — за ревью)
Это была разовая правка **данных**. Код-первопричина жива и может породить новый дубль:
1. нет `UNIQUE(student_id, homework_item_id)` на `pvl_student_homework_submissions`;
2. неатомарный select-then-insert + retry в `doPersistSubmissionToDb` / POST без `on_conflict`;
3. недедуплицирующий last-write-wins в `pvlMockApi.js:891-925` (стоило бы брать MAX(updated_at), как в `pvlHomeworkReport.js:370-380`).
Урок в `docs/lessons/` напишу после код-фикса (сейчас был бы неполным). БАГ 2 — без изменений, ждёт продуктового решения.
