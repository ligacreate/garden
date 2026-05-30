# Recon: текущее состояние сертификационного теста ПВЛ (двойной assessment menti + ментор)

**Дата:** 2026-05-30
**Кто:** codeexec
**Режим:** READ-ONLY. Ничего не менялось, не коммитилось. SQL — только SELECT/`\d` под `gen_user`.
**Подключение к БД:** `ssh root@5.129.251.56` → `psql` под `gen_user` (паттерн из `_143`/`_148`).
**Контекст из прошлых сессий:** `_142` (recon DDL/код), `_143` (live SQL до split), `_144` (ТЗ Этапа 2 + разбивка на 5 сессий codeexec), `_145`/`_147` (backend dryrun), `_148` (apply phase40 на прод).

---

## 0. TL;DR

**Backend готов на 100%, frontend для сравнения — не начат. Подготовка оборвана сразу после Сессии 1 (backend).**

- **БД (Сессия 1, phase40):** ✅ применена на проде 2026-05-28 (commit `5d1d8a7`, в `main`). Две таблицы `pvl_student_certification_self` + `pvl_student_certification_mentor` с **раздельным хранением баллов (`criteria_scores` jsonb + `score_total`) и открытых ответов (`reflections` jsonb)**, привязкой к `student_id`/`mentor_id`, статусами `draft→submitted→revision` и **RLS parallel-blind** (каждая сторона видит чужую запись только после её `submitted`). Обе таблицы **пустые (0/0)** — никто ещё ничего не заполнял.
- **Frontend:** ❌ Сессии 2–5 из ТЗ `_144` **не сделаны**. С 28.05 по 30.05 — только SWR-хотфикс (`9b441d4`), к сертификации не относится.
- **Форма менти (самооценка):** компонент `views/PvlSzAssessmentFlow.jsx` существует (это **до-Этап-2 прототип**), но (а) **не смонтирован нигде** — маршрут `/student/certification` показывает заглушку «Анкета временно недоступна»; (б) сохраняет в **localStorage + mock-API**, не в реальную таблицу `_self`.
- **Форма ментора (оценка менти):** **не существует** — ни компонента, ни маршрута, ни записи в `_mentor`. Маршрут `/mentor/certification` отдаёт ту же студенческую заглушку (зеркало).
- **Сравнение:** есть **только внутри прототипа** как ручной ввод баллов ментора самой менти (client-only, подсветка diff ≥ 3, рефлексии не сравниваются). Запланированный `PvlCertificationCompareView` (две колонки из БД, diff ≥ 2, рефлексии бок-о-бок) **не создан**.

**Где конкретно обрыв:** ТЗ `_144 §5` — закончена Сессия 1 (backend). Сессия 2 (8 API-методов + редиректы + `SZ_REFLECTION_PROMPTS_MENTOR` + `id` в critical), Сессия 3 (Block + wizard `mode='self'/'mentor'` в `PvlPeerProfileView`), Сессия 4 (compare-view + admin), Сессия 5 (e2e) — **не начаты**. Между БД и UI нет ни одного связующего слоя.

---

## 1. БД-схема (live, gen_user, read-only)

### 1.1 Discovery (запрос из задачи, выполнен дословно)

Под широкий ILIKE-фильтр (`cert/assessment/test/eval/self/checklist/reflect/quiz/survey/score`) попали **3 таблицы**:

| table_name | отношение к cert-тесту |
|---|---|
| `pvl_student_certification_self` | ✅ самооценка менти (Этап 2) |
| `pvl_student_certification_mentor` | ✅ оценка ментора (Этап 2) |
| `pvl_checklist_items` | ❌ **ложное срабатывание** — это чек-лист трекера курса (отметки `content_item_id`), к cert-тесту не относится (263 строки) |

Дополнительно проверена связанная `pvl_student_disputes` (не матчит фильтр, но в phase40 с неё снят FK на старую cert-таблицу): **0 строк**, столбец `certification_score_id` остался без FK, в Этапе 2 не используется.

### 1.2 `pvl_student_certification_self` (0 строк)

| Колонка | Тип | Null | Default |
|---|---|---|---|
| `student_id` | uuid | not null | — (**PK**, FK→`pvl_students` ON DELETE CASCADE) |
| `cohort_id` | uuid | | FK→`pvl_cohorts` |
| `certification_version` | text | not null | `'2026-spring'` |
| **`criteria_scores`** | **jsonb** | not null | `'{}'` — баллы 18 критериев `{ "A1":2, … "F3":1 }`, значения 0..3 |
| **`score_total`** | **integer** | not null | `0`, CHECK `0..54` |
| **`reflections`** | **jsonb** | not null | `'{}'` — 6 открытых ответов `{ "prompt_1":"…" … }` |
| `critical_flags` | jsonb | not null | `'[]'` — массив id отмеченных критических условий |
| `critical_comment` | text | | — |
| `status` | text | not null | `'draft'`, CHECK `draft\|submitted\|revision` |
| `submitted_at` | timestamptz | | — |
| `created_at`/`updated_at` | timestamptz | not null | `now()` (+ trigger `updated_at`) |

### 1.3 `pvl_student_certification_mentor` (0 строк) — симметрична self, плюс mentor_id

Отличия от `_self`:
- `mentor_id uuid **NOT NULL**`, FK→`profiles(id)` ON DELETE **RESTRICT**;
- `mentor_id` **проставляется автоматически** триггером `pvl_set_certification_mentor_id` (SECURITY DEFINER): `NEW.mentor_id := auth.uid()` на INSERT, фиксируется на UPDATE — клиент его не передаёт и не может подменить;
- остальные колонки (`criteria_scores`, `score_total` 0..54, `reflections`, `critical_flags`, `critical_comment`, `status`, `submitted_at`) — идентичны self.

### 1.4 Как именно решены вопросы из задачи

- **Баллы vs открытые ответы** — разделены внутри одной строки: баллы → `criteria_scores` (jsonb по 18 ключам) + денормализованный `score_total`; открытые ответы → `reflections` (jsonb по 6 ключам). Критические условия отдельно: `critical_flags` (jsonb-массив) + `critical_comment`.
- **«Кто заполнил» (менти / ментор)** — разнесено по **двум физическим таблицам** (`_self` и `_mentor`), а не флагом в одной. Это и есть механизм parallel-blind.
- **Привязка к student_id + mentor_id** — `_self` ключуется только по `student_id`; `_mentor` ключуется по `student_id` (PK) и дополнительно несёт `mentor_id` (NOT NULL). Источник правды для связи menti↔ментор — `is_mentor_for(student_id)` в RLS (см. `_143 §3`: денормализованный `pvl_students.mentor_id` у тестовой феи = NULL, связь живёт в `pvl_garden_mentor_links`).

### 1.5 RLS — parallel-blind (по 7 политик на таблицу, RLS=on)

Ключевые PERMISSIVE SELECT (подтверждено live через `\d`):

- `_self_select_blind`: `student_id = auth.uid() OR is_admin() OR (is_mentor_for(student_id) AND status='submitted')`
  → менти видит свою self всегда; ментор — только когда менти **отправила**.
- `_mentor_select_blind`: `mentor_id = auth.uid() OR is_admin() OR (student_id = auth.uid() AND status='submitted')`
  → ментор видит свою запись всегда; менти — только когда ментор **отправил**.

INSERT/UPDATE: self пишет только сама менти (status `draft`/`revision`); mentor пишет только активный ментор этой менти; admin может всё + revision-разлок. DELETE — только admin. Cross-EXISTS между таблицами умышленно не делали (вызывал «infinite recursion in policy», см. `_145 §5`).

### 1.6 Row counts (live)

```
self                  | 0     ← никто не заполнял
mentor                | 0     ← никто не заполнял
checklist_items       | 263   ← трекер курса, не cert
disputes_total        | 0
disputes_with_cert_id | 0
```

**Вывод по БД:** слой хранения для механики «менти и ментор заполняют отдельно → сравнение» полностью спроектирован и развёрнут, схему можно менять без миграции данных (пусто). Чего в БД нет (и по ТЗ не должно быть): **готового view/функции сравнения** — сравнение задумано на frontend после того, как RLS раскроет обе записи (обе `submitted`).

---

## 2. Код (grep по views/ services/ data/)

| Файл | Что это | Состояние |
|---|---|---|
| `views/PvlSzAssessmentFlow.jsx` (428 LOC) | Wizard самооценки менти: 5 шагов (интро → 6 рефлексий → 18 критериев 1–3 → 10 критических → итог). | **Прототип до Этапа 2.** Источник: `pvlMockApi`, draft в localStorage. **Импортирован в `PvlPrototypeApp.jsx:38`, но НИГДЕ не смонтирован (`<PvlSzAssessmentFlow` не встречается)** — сирота. |
| `data/pvlReferenceContent.js` | Константы анкеты: `SZ_ASSESSMENT_SECTIONS` (6 секций A–F × 3 = **18 критериев**), `SZ_ASSESSMENT_CRITICAL` (**10 строк, без поля `id`**), `SZ_REFLECTION_PROMPTS` (**6 промптов** менти). | Базовые константы есть. **Нет `SZ_REFLECTION_PROMPTS_MENTOR`**; у `SZ_ASSESSMENT_CRITICAL` **нет `id`** (оба — план Сессии 2, `_144 §4.2`). |
| `services/pvlMockApi.js` | `studentApi.commitSzSelfAssessment(studentId, payload)` (стр. 3031) — пишет в in-memory `db.szAssessmentState` / `db.certificationProgress`, считает `finalStatus`, audit-event. | **Только mock.** Реального persist нет. |
| `services/pvlPostgrestApi.js` (822 LOC) | Реальный PostgREST-клиент. | **Ни одного cert-метода.** Единственное cert-смежное — CRUD по `pvl_garden_mentor_links` (стр. 622–664). 8 методов из `_144 §4.4` не написаны. |
| `views/PvlMenteeCardView.jsx` | `renderCertificationProgress()` / `CertificationProgressPanel()` — показывают статусы (`szSelfAssessmentStatus`, `szMentorAssessmentStatus`, `certificationPackageStatus`) и `szSelfAssessmentPoints/54`. | **Display-only из mock-данных.** Не форма, не связано с `_self`/`_mentor`. |
| `views/PvlPrototypeApp.jsx` | Роутер ПВЛ. `/student/certification` (стр. 3453) → `StudentCertificationReference` + блок **«Анкета временно недоступна»**. `/mentor/certification` — отдельного обработчика нет → fall-through в `StudentPage`-зеркало (та же заглушка). | Анкета **отключена заглушкой**. |
| `views/PvlPeerProfileView.jsx` | Целевое место Этапа 2 по ТЗ (`PvlCertificationBlock` должен встать сюда). | **Нет ничего про cert** (grep пуст). |
| `components/PvlCertification*.jsx` | Запланированы `PvlCertificationBlock`, `PvlCertificationCompareView` (`_144 §4.1`). | **Файлов не существует.** |

---

## 3. Состояние двух форм + сравнение

### 3.1 Форма МЕНТИ (самооценка)
- **Компонент есть** — `PvlSzAssessmentFlow.jsx`: рефлексии (6 textarea, обязательны), 18 критериев (кнопки 1–3), 10 критических чекбоксов + комментарий, экран итога (сумма /54, уровень, суммы по блокам).
- **Не сохраняет в БД.** При «Завершить» (шаг 3→4) вызывает `pvlDomainApi.studentApi.commitSzSelfAssessment(...)` — это **mock** (in-memory). Черновик — в `localStorage['pvl_sz_flow_v1_<studentId>']`.
- **Не доступна пользователю** — маршрут показывает заглушку, компонент не смонтирован.

### 3.2 Форма МЕНТОРА (оценка менти)
- **Отдельной формы нет.** Нет компонента/маршрута/wizard `mode='mentor'`, нет записи в `pvl_student_certification_mentor`.
- Единственный «ввод оценки ментора» — внутри **итогового экрана прототипа менти**: блок «Сравнить с оценкой ментора (ввод вручную)» (стр. 357–413), где **сама менти руками вбивает баллы ментора**. Это не менторская форма и не parallel-blind.

### 3.3 Логика СРАВНЕНИЯ / diff
- **Есть только в прототипе, client-side:** `comparisonRows` (стр. 107–127) считает `|self − mentorScores|` и подсвечивает строки с **diff ≥ 3**; список расхождений — внизу итога.
- **Сравнивает только баллы** (self vs руками-введённые баллы ментора). **Открытые ответы (рефлексии) не сравниваются вообще.**
- Порог `≥ 3` — старый; ТЗ Этапа 2 требует **`≥ 2`** (`_144 §2 п. перечень, §4.5`).
- Из реальных таблиц `_self`/`_mentor` ничего не читается; запланированный `PvlCertificationCompareView` (две колонки из БД + рефлексии бок-о-бок) не создан.

---

## 4. Главное: ГОТОВО / НЕ ХВАТАЕТ

Для механики «менти и ментор заполняют отдельно → сравнение баллов + открытых ответов»:

| Слой / звено | Состояние | Где |
|---|---|---|
| Раздельное хранение self/mentor | ✅ **ГОТОВО** — 2 таблицы | `_self`, `_mentor` (live) |
| Баллы (18 критериев + total) | ✅ ГОТОВО | `criteria_scores` jsonb + `score_total` CHECK 0..54 |
| Открытые ответы (6 рефлексий) | ✅ ГОТОВО (хранилище) | `reflections` jsonb |
| Критические условия | ✅ ГОТОВО (хранилище) | `critical_flags` jsonb + `critical_comment` |
| Привязка student_id / mentor_id | ✅ ГОТОВО | PK `student_id`; `mentor_id` auto-fill через trigger |
| Parallel-blind (видно только после submit обеих) | ✅ ГОТОВО | RLS `*_select_blind`, 7 политик/таблицу |
| Статусная машина draft→submitted→revision | ✅ ГОТОВО | CHECK + UPDATE-политики |
| Grants/защита от Timeweb-wipe | ✅ ГОТОВО | `ensure_garden_grants()` swap (phase40) |
| Константы анкеты менти (18 крит. + 6 рефлексий + 10 крит.) | ✅ ГОТОВО (контент) | `data/pvlReferenceContent.js` |
| Wizard-UI менти (визуально) | 🟡 **ЧАСТИЧНО** — прототип есть, но на mock+localStorage, не смонтирован, порог diff и persist не по ТЗ | `PvlSzAssessmentFlow.jsx` |
| Зеркальные константы ментора (`SZ_REFLECTION_PROMPTS_MENTOR`, `id` в critical) | ❌ **НЕТ** | план Сессии 2 |
| API-слой к БД (8 методов get/upsert/submit self+mentor) | ❌ **НЕТ** | `pvlPostgrestApi.js` пуст по cert |
| Форма/режим ментора (`mode='mentor'`) | ❌ **НЕТ** | — |
| Точка входа в Этапе 2 (`PvlCertificationBlock` в `PvlPeerProfileView`, маршруты `/{student,mentor}/peer/:id`) | ❌ **НЕТ** | — |
| Реальное сохранение формы менти в `_self` | ❌ **НЕТ** | сейчас mock |
| Compare-view из БД (2 колонки, diff ≥ 2, рефлексии бок-о-бок) | ❌ **НЕТ** | `PvlCertificationCompareView` не создан |
| Сравнение открытых ответов | ❌ **НЕТ** (даже в прототипе) | — |
| Снятие заглушки «Анкета временно недоступна» / редиректы старых роутов | ❌ **НЕТ** | `PvlPrototypeApp.jsx:3460` |
| Admin-панель сводки сертификации | ❌ **НЕТ** | план Сессии 4 |

### Где конкретно оборвана подготовка
По разбивке ТЗ `_144 §5` (5 сессий codeexec):
- **Сессия 1 — Backend (phase40):** ✅ завершена и применена на прод 2026-05-28 (`_148`, commit `5d1d8a7`).
- **Сессия 2 — Frontend API + редиректы + mentor-константы:** ❌ не начата.
- **Сессия 3 — Frontend компоненты (Block + wizard self/mentor в PvlPeerProfileView):** ❌ не начата.
- **Сессия 4 — Compare-view + admin:** ❌ не начата.
- **Сессия 5 — e2e:** ❌ не начата.

**Итог:** «структура есть» = полностью готовый backend-слой хранения и безопасности (parallel-blind). «Подготовительная работа проведена» = ТЗ зафиксировано, продуктовые решения приняты, тестовая пара (фея/фиксик) в БД готова, визуальный прототип анкеты менти существует. **Gap до сравнения — это весь frontend: от первого API-метода до compare-view. Между развёрнутой БД и интерфейсом сейчас нет ни одного связующего звена; существующий прототип менти работает на mock-данных и в продукте отключён.**

---

## 5. Сырые артефакты этой сессии
- Live SQL гонялся через `ssh root@5.129.251.56` → `psql` под `gen_user`, только `SELECT`/`\d` (см. вывод в логе сессии). На прод ничего не писалось.
- Прошлые доки-источники: `_142`, `_143`, `_144`, `_145`, `_147`, `_148`; миграция `database/pvl/migrations/2026-05-28_phase40_pvl_certification_split.sql`.

**Файл:** `garden/docs/_session/2026-05-30_165_codeexec_recon_cert_test_state.md`
