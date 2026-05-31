# Recon перед ТЗ Этапа 2 — сертификационный завтрак (двойной assessment)

**Дата:** 2026-05-28
**Тип:** read-only recon, без правок
**Источники:** SQL миграции + код (нет локального psql-доступа — credentials живут на сервере `/opt/garden-auth/.env`, см. ниже)
**Дисциплина:** ничего не выполнено, никаких write-операций; SQL для live-проверок выписан в §5

---

## 0. Дисклеймер про метод

Я **не выполняла** SQL под `gen_user`: credentials live только на проде (Bittern, `/opt/garden-auth/.env`), локально psql/SSH-конфига нет. Весь DDL извлечён из migration-файлов в репо. Где нужны live-данные (фактические row counts, RLS-state, конкретные значения у Феи/Фиксика) — выписан запрос в §5, и помечено «требует live-проверки».

Где SQL-миграция в коде, там DDL — источник правды (мы прода-аппроксимация по migration history).

---

## 1. БД — что уже есть для сертификации

### 1.1. DDL `pvl_student_certification_scores` (агрегат по студенту)

Создана в [database/pvl/migrations/001_pvl_scoring_system.sql:155-173](database/pvl/migrations/001_pvl_scoring_system.sql#L155-L173):

```sql
CREATE TABLE pvl_student_certification_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES pvl_students(id) ON DELETE CASCADE,
  self_score_total INT NOT NULL DEFAULT 0,     -- 0..54
  mentor_score_total INT NOT NULL DEFAULT 0,   -- 0..54
  critical_flags_count INT NOT NULL DEFAULT 0,
  certification_status TEXT NOT NULL DEFAULT 'not_started',
  scored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (certification_status IN
    ('not_started','in_progress','submitted','accepted','revision','failed')),
  CHECK (self_score_total >= 0 AND self_score_total <= 54),
  CHECK (mentor_score_total >= 0 AND mentor_score_total <= 54)
);

CREATE INDEX idx_pvl_student_certification_scores_student_id
  ON pvl_student_certification_scores(student_id);
```

**Триггер:** `trg_pvl_student_certification_scores_updated_at` BEFORE UPDATE → `pvl_set_updated_at()`.

**Заметка:** уникальности по `student_id` нет (теоретически можно создать несколько rows на одного student'а). Скорее всего, продуктовый инвариант «1 row на студента» держится только в коде. Стратегу стоит решить — добавлять `UNIQUE (student_id)` в Сессии 1 или нет.

### 1.2. DDL `pvl_student_certification_criteria_scores` (по критериям)

Создана в [database/pvl/migrations/001_pvl_scoring_system.sql:175-191](database/pvl/migrations/001_pvl_scoring_system.sql#L175-L191):

```sql
CREATE TABLE pvl_student_certification_criteria_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_score_id UUID NOT NULL
    REFERENCES pvl_student_certification_scores(id) ON DELETE CASCADE,
  criterion_code TEXT NOT NULL,
  self_score INT NOT NULL DEFAULT 0,    -- 0..3
  mentor_score INT NOT NULL DEFAULT 0,  -- 0..3
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (self_score >= 0 AND self_score <= 3),
  CHECK (mentor_score >= 0 AND mentor_score <= 3),
  UNIQUE (certification_score_id, criterion_code)
);

CREATE INDEX idx_pvl_student_certification_criteria_scores_certification_score_id
  ON pvl_student_certification_criteria_scores(certification_score_id);
```

**Триггер:** `trg_pvl_student_certification_criteria_scores_updated_at` BEFORE UPDATE.

### 1.3. ⭐ ГЛАВНЫЙ ОТВЕТ: модель данных уже разделяет self vs mentor

**Разделение есть.** Это **одна строка на (student, criterion)** с парой колонок:
- `self_score INT (0..3)` — оценка menti про себя
- `mentor_score INT (0..3)` — оценка ментора про неё

И на агрегатном уровне (`pvl_student_certification_scores`):
- `self_score_total` (0..54)
- `mentor_score_total` (0..54)

**То есть в Сессии 1 backend НЕ нужно добавлять разделение — оно уже зашито в схему 001.** Что **может понадобиться добавить**:
- `assessor_role`-аналога нет (он и не нужен — self/mentor различаются по колонке)
- `submitted_at_self` / `submitted_at_mentor` — сейчас только общий `scored_at` и `updated_at` (нельзя различить «menti уже сдала, ментор ещё нет»). Скорее всего, надо добавить.
- `critical_flags_count` сейчас один — без разделения чья отметка (своя или ментора). Если ментор тоже отмечает критические — надо `self_critical_flags_count` + `mentor_critical_flags_count` или JSONB.
- **Reflexion-текст / комментарии** — в схеме нет вообще. PvlSzAssessmentFlow собирает `reflections[6]` (свободные ответы) + `criticalComment` (текст), но **некуда положить в реальную БД**. Это новая колонка/таблица в Сессии 1.

### 1.4. Отдельной таблицы вопросов/критериев — нет

В DDL не нашла. `criterion_code` — TEXT, FK нет.

Критерии хранятся **на frontend, hardcoded** в [data/pvlReferenceContent.js:159-203](data/pvlReferenceContent.js#L159-L203):
- `SZ_ASSESSMENT_SECTIONS` — 6 секций (A-F) × 3 пункта = **18 критериев** (совпадает с верхней границей 54 = 18 × 3).
- `SZ_ASSESSMENT_CRITICAL` — 10 критических условий.
- `SZ_REFLECTION_PROMPTS` — 6 рефлексивных вопросов с подсказками.

**Open question стратегу:** перевозить ли критерии в БД (как минимум — для версионирования между потоками 2026-1 / 2026-2), или пока оставить в JS-константах.

### 1.5. Других `pvl_*certification*` / `pvl_*sz*` таблиц/views/RPC в migrations — нет

grep по всем `.sql` файлам:
- Только два certification-объекта: `pvl_student_certification_scores`, `pvl_student_certification_criteria_scores`.
- В `pvl_homework_items.item_type CHECK` есть значение `'certification_task'` — это тип ДЗ, не отдельная сущность.
- В `pvl_content_items.target_section CHECK` есть значение `'certification'` — секция CMS для материалов.
- В `pvl_student_disputes.certification_score_id` — FK на certification_scores (для жалоб на оценку), DDL [001:194-204](database/pvl/migrations/001_pvl_scoring_system.sql#L194-L204).

Никаких views, RPC, materialized views с `*certification*` / `*sz*` именами в репо нет.

### 1.6. RLS — не найдено в migrations ⚠️

Grep по всем миграциям: **ни одного `CREATE POLICY` на `pvl_student_certification_*`**. Есть только GRANT'ы для `authenticated`:
- [migrations/2026-05-03_phase16_grant_role_switch_bulk.sql:80-81](migrations/2026-05-03_phase16_grant_role_switch_bulk.sql#L80-L81)
- [migrations/2026-05-05_phase23_grants_safety_net.sql:96-97](migrations/2026-05-05_phase23_grants_safety_net.sql#L96-L97)
- [database/pvl/migrations/2026-05-26_phase38_pvl_training_breakfasts.sql:276-277](database/pvl/migrations/2026-05-26_phase38_pvl_training_breakfasts.sql#L276-L277) (ensure_garden_grants)

Что это значит:
- **Либо** RLS на этих таблицах **выключен** → под `authenticated` любой может SELECT/UPDATE/INSERT всё.
- **Либо** RLS включён, но **без политик** → SELECT под `authenticated` вернёт 0 строк (RLS-fail-closed).

В обоих сценариях это нужно проверить и достроить в Сессии 1 backend (как сделано в phase38 для training tables).

**Требует live-проверки** (см. §5 SQL #1).

### 1.7. Live state таблиц — неизвестно

Без psql не могу выписать row counts, активных student_id и пр. Запрос — в §5 SQL #2.

---

## 2. Код — PvlSzAssessmentFlow и связанные

### 2.1. [views/PvlSzAssessmentFlow.jsx](views/PvlSzAssessmentFlow.jsx) — что делает

**Props:** `studentId, navigate, certPoints, onCommitted`.

5-шаговый wizard самооценки СЗ:
- **step 0** «Как это работает» — intro + правила шкалы 1-3.
- **step 1** «Рефлексия» — 6 textarea-вопросов (`SZ_REFLECTION_PROMPTS`), все обязательны.
- **step 2** «18 критериев» — 6 секций A-F × 3 пункта, кнопки 1/2/3 на каждый (`SZ_ASSESSMENT_SECTIONS`).
- **step 3** «Критические условия» — 10 чекбоксов (`SZ_ASSESSMENT_CRITICAL`) + textarea-комментарий (обязателен если есть отметки).
- **step 4** «Итог» — total / 54 + уровень («базовый/рабочий/сильный») + critical-flags + опциональный блок «Сравнить с оценкой ментора (ввод вручную)».

**Persistence:** **только localStorage** под ключом `pvl_sz_flow_v1_<studentId>` ([PvlSzAssessmentFlow.jsx:9](views/PvlSzAssessmentFlow.jsx#L9)). Никакого POST в backend на промежуточных шагах.

**Финальный commit (step 3 → step 4):** [PvlSzAssessmentFlow.jsx:298-302](views/PvlSzAssessmentFlow.jsx#L298-L302) вызывает `pvlDomainApi.studentApi.commitSzSelfAssessment(studentId, { selfScoreTotal, criticalFlagsCount, mentorScores })` — это **mock API**, в нём НЕТ записи в реальную БД, всё пишется в in-memory `db.szAssessmentState` ([services/pvlMockApi.js:3029-3081](services/pvlMockApi.js#L3029-L3081)).

**Self+mentor compare:** уже зашит в этом же компоненте ([PvlSzAssessmentFlow.jsx:107-127](views/PvlSzAssessmentFlow.jsx#L107-L127) + UI на шаге 4 lines 369-412): menti может «ввести вручную» оценки ментора и увидеть строки с разницей ≥3 баллов. Это **черновая UX-логика**, ментор как actor не присутствует — это menti воспринимает оценку ментора со своей стороны.

### 2.2. Где компонент сейчас монтируется — **нигде**

Grep `<PvlSzAssessmentFlow` по всему репо → 0 совпадений (jsx-mount).

Импорт есть в одном файле: [views/PvlPrototypeApp.jsx:38](views/PvlPrototypeApp.jsx#L38), но JSX-использования **нет**. Импорт «висит» dead.

### 2.3. Что вместо него стоит на `/student/certification`

[views/PvlPrototypeApp.jsx:3453-3472](views/PvlPrototypeApp.jsx#L3453-L3472):

```jsx
if (route === '/student/certification' || route === '/student/self-assessment') {
    return (
        <div className="space-y-6">
            <div className="rounded-3xl bg-white shadow-... p-5">
                <h2>Сертификация и самооценка</h2>
            </div>
            <StudentCertificationReference navigate={navigate} />
            <div id="pvl-sz-flow" className="...">
                <h3>Бланк самооценки</h3>
                <div className="...">
                    <p>Анкета временно недоступна</p>
                    <p>Бланк самооценки сертификационного завтрака будет открыт позже...</p>
                </div>
            </div>
        </div>
    );
}
```

То есть **на проде раздел существует, но показывает заглушку «Анкета временно недоступна»**. Это идеальный заход для Этапа 2 — мы убираем заглушку и подключаем реальный flow.

### 2.4. Какой роутинг ведёт к сертификации сейчас

- Левое меню (sidebar) у трёх ролей — пункт «Сертификация»:
  - student: [services/pvlGardenNav.js:27](services/pvlGardenNav.js#L27) → `/student/certification`
  - mentor: [services/pvlGardenNav.js:50](services/pvlGardenNav.js#L50) → `/mentor/certification`
  - admin:  [services/pvlGardenNav.js:73](services/pvlGardenNav.js#L73) → `/admin/certification`
- Алиас: `/student/self-assessment` → тот же экран ([PvlPrototypeApp.jsx:3453](views/PvlPrototypeApp.jsx#L3453)).
- Из других мест в SzAssessmentFlow нет внешних навигаций «на бланк» (поскольку он не смонтирован).

### 2.5. Куда сейчас сохраняются ответы — никуда (в реальную БД)

`commitSzSelfAssessment` пишет только в **mock in-memory store** (`db.szAssessmentState`, не PostgreSQL). На liga-проде это означает, что любые «сохранения» исчезают при перезагрузке страницы / на другом устройстве. Поэтому форма и закрыта баннером.

То, что **есть в реальной БД** (схема 001) — таблицы `pvl_student_certification_scores` + `_criteria_scores` — пока подключено только к mock-чтению в `getStudentCertification` (через mock-объект, не PostgREST), а реального CRUD на эти таблицы в `services/pvlPostgrestApi.js` **нет** (grep подтверждает).

### 2.6. Где в коде вообще упоминается `certification` (case-insensitive)

Сжато: упоминаний >50, релевантные:

| Файл | Зачем |
|---|---|
| [views/PvlSzAssessmentFlow.jsx](views/PvlSzAssessmentFlow.jsx) | Бланк (см. §2.1). Не смонтирован. |
| [views/PvlPrototypeApp.jsx:3453](views/PvlPrototypeApp.jsx#L3453) | Заглушка `/student/certification` (см. §2.3). |
| [views/PvlPrototypeApp.jsx:3486](views/PvlPrototypeApp.jsx#L3486) | Получение mentor-материалов секции `'certification'` из CMS. |
| [views/PvlStudentCabinetView.jsx:360-687](views/PvlStudentCabinetView.jsx#L360-L687) | `renderCertificationPage()` — старый прототип (не используется в актуальной liga-навигации). |
| [views/PvlMenteeCardView.jsx:541-563](views/PvlMenteeCardView.jsx#L541-L563) | `renderCertificationProgress` / `CertificationProgressPanel` — рендер прогресса в карточке менти у ментора. Тянет mock-данные. |
| [services/pvlGardenNav.js:27,50,73](services/pvlGardenNav.js#L27) | Пункты меню у трёх ролей. |
| [services/pvlMockApi.js:3012-3081](services/pvlMockApi.js#L3012-L3081) | `getStudentCertification` + `commitSzSelfAssessment` (mock). |
| [data/pvlReferenceContent.js:122-203](data/pvlReferenceContent.js#L122-L203) | Reference content (red flags, critical, sections, criteria). |
| [data/pvl/enums.js → CERTIFICATION_STATUS](data/pvl/enums.js) | Перечисление статусов сертификации (mock-side). |

### 2.7. Дополнительный mock-API про сертификацию

В [services/pvlMockApi.js:3000-3081](services/pvlMockApi.js#L3000-L3081):
- `getStudentCertification(studentId)` — отдаёт mock object с полями `readiness`, `redFlags`, `timeline`, `szs`, и пр. Используется в [views/PvlMenteeCardView.jsx:703](views/PvlMenteeCardView.jsx#L703).
- `commitSzSelfAssessment` — см. §2.5.
- `getCertificationReadiness`, `getCertificationRedFlags`, `getCertificationTimeline` — селекторы из `selectors/`.

**Что важно стратегу:** Этап 2 может либо
(а) подключить существующий `PvlSzAssessmentFlow` к реальному PostgREST API (новые методы в `pvlPostgrestApi.js` + RLS + миграция новых полей: reflexion-текст, mentor/self submitted_at);
(б) написать новый компонент специально под двойной assessment (menti + ментор как два отдельных actor'а).

Сейчас текущий компонент рассчитан на сценарий «menti заполняет за себя, и опционально вводит цифры от ментора». В вашем сценарии «menti про себя + её ментор отдельно про неё» — это **скорее два разных wizard-инстанса** на одной странице (или два отдельных монтажа в разных пунктах меню).

---

## 3. Где должен быть Этап 2 в UI

### 3.1. [views/PvlPeerProfileView.jsx](views/PvlPeerProfileView.jsx) — структура

**Файл маленький (64 строки)**. Структура:

```jsx
export default function PvlPeerProfileView({
    peerId, navigate, viewerRole = 'student', viewerId = null, isMentorOfPeer = false,
}) {
    const peerName = resolvePeerDisplayName(peerId);
    const effectiveViewerId = resolveSelfId(viewerId);  // из localStorage

    return (
        <div className="space-y-4">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
                {/* «← К списку участниц» (только для student) */}
                <h2>{peerName}</h2>
                <div>Поток 1</div>
            </div>

            <PvlTrainingSessionBlock     {/* ← Этап 1 здесь */}
                studentId={peerId}
                viewerId={effectiveViewerId}
                viewerRole={viewerRole}
                isMentorOfStudent={isMentorOfPeer}
            />
        </div>
    );
}
```

Иными словами: верхний «header»-блок c именем и шильдиком потока, дальше **один секционный блок PvlTrainingSessionBlock** (Этап 1). **Здесь же должен встать секционный блок Этапа 2.**

Никаких desktop sticky / mobile drawer тут НЕТ. Это **единый responsive flex-column-layout** (`space-y-4`), который одинаково рендерится на всех viewport'ах. Внутренние блоки сами знают свою адаптивность (см. [components/PvlTrainingSessionBlock.jsx](components/PvlTrainingSessionBlock.jsx) — `rounded-2xl` карточки + flex-col).

### 3.2. Куда смонтирован PvlPeerProfileView — 3 роута

[views/PvlPrototypeApp.jsx](views/PvlPrototypeApp.jsx):
- L3437-3440 — `/student/peer/:peerId` → `viewerRole="student"`, `viewerId={studentId}`.
- L4148-4152 — `/mentor/peer/:peerId` → `viewerRole="mentor"`, `viewerId={mentorId}`, `isMentorOfPeer` вычислен через `studentProfiles.mentorId === mentorId`.
- L7739-7741 — `/admin/peer/:peerId` → `viewerRole="admin"`, `viewerId={null}`.

Это **одна и та же view** с разными props — `viewerRole` управляет видимостью (например, кнопка «Я провела тренировочный завтрак» в Этапе 1 показывается только когда `viewerId === peerId`). Для Этапа 2 та же логика будет работать: «оценивает» себя только если `peerId === viewerId`, ментор — если `viewerRole === 'mentor' && isMentorOfPeer`, admin видит обе но не редактирует.

### 3.3. Viewport-стратегия

Сейчас **единый responsive layout** — один и тот же JSX рендерится во всех viewport'ах. `PvlTrainingSessionBlock` использует tailwind responsive utilities внутри (модал — `ModalShell` с `size="md"`, кнопки — `flex flex-wrap gap-2`). Никаких desktop/mobile branch'ей в `PvlPeerProfileView` или `PvlTrainingSessionBlock` нет.

**Что это означает для ТЗ Этапа 2:** не нужно делать sticky sidebar / drawer — текущий паттерн «карточка-секция» отлично переносится. Двойной assessment, скорее всего, будет одна большая карточка с двумя tabs / двумя collapsible-блоками внутри, или две отдельные карточки.

### 3.4. Какие роли видят PvlPeerProfileView сейчас

| Роль | Роут | Видит ли по умолчанию |
|---|---|---|
| student (applicant/intern) | `/student/peer/:peerId` | Да, но только peers своей когорты (через `pvl_students_select_cohort_peer` RLS — phase39, role='applicant' фильтр) + свою страницу. |
| mentor | `/mentor/peer/:peerId` | Да, своих menti (через `is_mentor_for` RLS) + admin. |
| admin | `/admin/peer/:peerId` | Все. |

Проверка ролей на frontend происходит ВНЕ `PvlPeerProfileView`: роут резолвится по префиксу `/student|/mentor|/admin`, который выбирается в `App.jsx` по `currentUser.role`. Сама `PvlPeerProfileView` ролевой проверки не делает — только использует prop `viewerRole` для условного рендера UI.

Real role-gating — на уровне БД (RLS) и на уровне роутера (App.jsx выбирает префикс).

---

## 4. Тестовая пара menti+mentor

### 4.1. ID и базовый профиль

Из [docs/journal/RECON_2026-05-04_feat002_telegram_match.md:126-127](docs/journal/RECON_2026-05-04_feat002_telegram_match.md#L126-L127) + [plans/BACKLOG.md:1195-1199](plans/BACKLOG.md#L1195-L1199):

| Что | Настина фея | Настин фиксик |
|---|---|---|
| `profiles.id` (= `users_auth.id`) | `1085e06d-34ad-4e7e-b337-56a0c19cc43f` | `1b10d2ef-8504-4778-9b7b-5b04b24f8751` |
| email | `viktorovna7286@gmail.com` | `zobyshka@gmail.com` |
| `profiles.role` (на 2026-05-04) | `applicant` | `mentor` |
| Статус по CLEAN-013 | оставлена как тест-окружение | оставлен как тест-окружение |
| Скрыта через «глазик» (localStorage) | да | да |

Convention `pvl_students.id = profiles.id` зафиксирована FK в [phase37](migrations/2026-05-23_phase37_pvl_onboarding_atomic.sql#L216-L220) — значит **если** у феи есть row в `pvl_students`, то её id там тот же.

### 4.2. Что неизвестно без live-проверки

- ⚠️ Есть ли у феи row в **`pvl_students`**?
  Phase37 trigger срабатывает на `AFTER UPDATE OF role, access_status ON profiles WHEN (NEW.role IN ('applicant','intern') AND (access transition OR role change))`. Фея была applicant **до** phase37 (2026-05-23) — если её access_status уже был active, **trigger её не подхватит**. Backfill phase37 шёл только для interns (13 rows), applicant'ов он **не вставлял** (см. строки 60-67 миграции).
  Поэтому **скорее всего у феи НЕТ pvl_students row** — это блокер и для Этапа 1 (training_sessions FK на pvl_students), и для Этапа 2.
- Её `pvl_students.cohort_id` (если row есть).
- Связь в `pvl_garden_mentor_links` (фея как `student_id`, фиксик как `mentor_id`).
- Видны ли они на проде (вне localStorage hidden список) — фиксика и фею могли скрыть на одном устройстве, на других они видны.

**hiddenGardenUserIds — это localStorage** ([App.jsx:14,28-47](App.jsx#L14-L47)), ключ `garden_hidden_user_ids`. Это **per-device, per-browser**, не серверный. То есть «скрыты у Ольги, но видны у Насти». Для дев-сценария это нормально.

### 4.3. SQL для live-проверки (НЕ выполнять)

См. §5 SQL #3.

### 4.4. Если связи нет — какой SQL нужен

**Не выполнять сейчас.** Команда стратегу подготовлена:

```sql
-- Создать pvl_students row для феи (если её нет) — cohort_id Поток 1 = ...101
INSERT INTO pvl_students (id, full_name, status, cohort_id)
VALUES (
    '1085e06d-34ad-4e7e-b337-56a0c19cc43f',
    'Настина фея',
    'active',
    '11111111-1111-1111-1111-111111111101'
)
ON CONFLICT (id) DO NOTHING;

-- Связать фею и фиксика
INSERT INTO pvl_garden_mentor_links (student_id, mentor_id)
VALUES (
    '1085e06d-34ad-4e7e-b337-56a0c19cc43f',
    '1b10d2ef-8504-4778-9b7b-5b04b24f8751'
)
ON CONFLICT (student_id) DO UPDATE SET
    mentor_id = EXCLUDED.mentor_id,
    updated_at = NOW();
```

⚠️ Внимание: `pvl_students` row с FK `pvl_students.id → profiles(id) ON DELETE CASCADE` ([phase37](migrations/2026-05-23_phase37_pvl_onboarding_atomic.sql#L218-L220)) — id должен совпадать с `profiles.id` феи. Если row уже есть — `ON CONFLICT DO NOTHING` спасёт.

И `pvl_garden_mentor_links.student_id` это **`profiles.id` феи** (не `users_auth.id`, не `pvl_students.id` — хотя они все равны по convention). Из комментария к таблице [007:12](database/pvl/migrations/007_pvl_garden_mentor_links.sql#L12): «student_id и mentor_id — id из profiles (Сад)».

---

## 5. Открытые вопросы / находки

### 5.1. ⚠️ RLS на certification-таблицах не найдено в migrations

См. §1.6. **Требует live-проверки.** Если RLS просто отсутствует — менти может видеть оценки чужих менти, ментор может править self-баллы любой ученицы. Это безопасностно.

SQL для проверки (не выполнять):
```sql
-- 5.1. SQL #1 — RLS state на certification-таблицах
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies_count
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN ('pvl_student_certification_scores',
                    'pvl_student_certification_criteria_scores')
ORDER BY c.relname;

SELECT polname, polcmd, polroles::regrole[], polqual::text, polwithcheck::text
FROM pg_policy
WHERE polrelid IN (
    'public.pvl_student_certification_scores'::regclass,
    'public.pvl_student_certification_criteria_scores'::regclass
);
```

Скорее всего, надо в Сессии 1 добавить RLS по тому же шаблону, что в phase38 для training-таблиц:
- RESTRICTIVE guards (has_platform_access)
- PERMISSIVE SELECT: own / mentor_for / admin
- PERMISSIVE INSERT/UPDATE для **self_score** — только сама menti
- PERMISSIVE INSERT/UPDATE для **mentor_score** — только её ментор
- **⚠️ Это новая RLS-механика:** разделение «кто пишет какую колонку». PostgreSQL row-level security не делает column-level. Варианты:
  - (a) Две отдельные таблицы (`_self_scores` + `_mentor_scores`) — каждая со своей RLS. Симметрично training_feedback.
  - (b) Триггер BEFORE UPDATE, который проверяет: если NEW.self_score ≠ OLD.self_score → требует `student_id = auth.uid()`. Если NEW.mentor_score ≠ OLD.mentor_score → требует `is_mentor_for(student_id)`. Можно через trigger.
  - (c) Колонную защиту через GRANT SELECT (col1,col2)/UPDATE (col1)/UPDATE (col2) — но GRANT не учитывает row context.
  
  **Требуется решение стратега: (a) vs (b)** (сейчас схема под (b), но (a) согласованнее с phase38-паттерном).

### 5.2. ⚠️ PvlSzAssessmentFlow существует, но изолирован от реального backend

См. §2. Существующий компонент уже умеет UI-логику (5 шагов, валидации, draft в localStorage, итог, сравнение с ментором), но:
- сохраняет в mock in-memory;
- расчёт «уровня» (базовый/рабочий/сильный) — на frontend, не отражён в схеме (там есть только `certification_status: not_started|in_progress|submitted|accepted|revision|failed`);
- mentor-score логика в UI — это сейчас «menti вводит цифры ментора со своей стороны» (не настоящий двойной assessment).

Стратегу нужно решить: **переиспользуем компонент или пишем новый.**
**Требуется решение стратега: переиспользование vs новый компонент.** Если переиспользуем — потребуются изменения в самом `PvlSzAssessmentFlow`: уметь работать в двух режимах («self» / «mentor») в зависимости от prop, и POSTить в реальный API.

### 5.3. Reflexion-текст / комментарии — некуда сохранять

Существующая схема `pvl_student_certification_*` хранит только баллы. **6 текстовых рефлексий + комментарий по критическим условиям** — нужны новые колонки/таблица. Варианты:
- (a) Колонки `self_reflections JSONB`, `self_critical_comment TEXT`, аналогичные `mentor_*` на `pvl_student_certification_scores`.
- (b) Отдельная таблица `pvl_student_certification_reflections (cert_score_id, role 'self'|'mentor', prompt_code TEXT, answer TEXT)`.

**Требуется решение стратега.**

### 5.4. Уникальность `student_id` в `pvl_student_certification_scores` — не enforced

См. §1.1. Сейчас можно создать 2+ row для одного студента. Если в Сессии 1 пишем backend — стоит добавить `UNIQUE (student_id)` (или `UNIQUE (student_id, cohort_id)` если поддерживаем повторные сертификации). Сейчас `cohort_id` в таблице нет — может быть полезен.

### 5.5. Тестовая пара — у феи может не быть pvl_students row

См. §4.2 — phase37 trigger не подхватил её, потому что она была applicant **до** миграции и её access_status не менялся. **Это блокер и для Этапа 1, и для Этапа 2** — нужно вручную проинсертить, см. §4.4.

Стратегу: убедиться, что Ольга сначала прогонит SQL из §4.4 на проде, потом тестит UI.

### 5.6. Текущий `/student/certification` показывает заглушку — это удобный заход

См. §2.3. Подключение Этапа 2 к этому роуту (или к `PvlPeerProfileView`) — низкий риск регрессий: сейчас экран показывает только баннер «Анкета временно недоступна», ломать там нечего.

### 5.7. Этап 2 — на странице peer или в разделе «Сертификация»?

**Это продуктовый вопрос, не technical.** Из ТЗ читается: «в UI» — но не уточняется где конкретно.

- На странице `/student/peer/:peerId` (внутри `PvlPeerProfileView`) — Этап 1 живёт там. Удобно для ментора («открыл страницу menti — увидел все её SZ-данные в одном месте»). Менти на своей странице (`/student/peer/<self-id>`) видит свой self-assessment.
- В разделе `/student/certification` — там сейчас заглушка. Удобно для menti (один пункт меню «Сертификация» — заполняешь оттуда). Ментор для menti открывает её карточку.

**Требуется решение стратега: A (peer page) vs B (certification section) vs A+B.**

Я бы рекомендовала **A+B** (доступно из обоих мест, один и тот же компонент) — повторяет паттерн «один блок, несколько mount points», как с PvlPeerProfileView.

### 5.8. Открытые SQL для live-проверки (сводно)

Стратегу нужно прогнать под `gen_user` (можно через RUNBOOK §1.2 паттерн) и приклеить ответы к ТЗ Сессии 1:

```sql
-- SQL #1: RLS state на сертификационных таблицах (см. §5.1)

-- SQL #2: live state таблиц scores
SELECT
    (SELECT count(*) FROM pvl_student_certification_scores) AS scores_rows,
    (SELECT count(*) FROM pvl_student_certification_criteria_scores) AS criteria_rows;

SELECT student_id, self_score_total, mentor_score_total,
       critical_flags_count, certification_status, scored_at, updated_at
FROM pvl_student_certification_scores
WHERE student_id IN (
    SELECT id FROM pvl_students WHERE cohort_id = '11111111-1111-1111-1111-111111111101'
);

-- SQL #3: фея + фиксик в БД
SELECT 'profiles'        AS source, id, name, email, role, access_status, status
FROM profiles
WHERE id IN ('1085e06d-34ad-4e7e-b337-56a0c19cc43f',
             '1b10d2ef-8504-4778-9b7b-5b04b24f8751')
UNION ALL
SELECT 'users_auth'      AS source, id::text, NULL, email, NULL, NULL, NULL
FROM users_auth
WHERE id IN ('1085e06d-34ad-4e7e-b337-56a0c19cc43f',
             '1b10d2ef-8504-4778-9b7b-5b04b24f8751');

SELECT 'pvl_students' AS source, id, full_name, cohort_id, mentor_id, status
FROM pvl_students
WHERE id IN ('1085e06d-34ad-4e7e-b337-56a0c19cc43f',
             '1b10d2ef-8504-4778-9b7b-5b04b24f8751');

SELECT * FROM pvl_garden_mentor_links
WHERE student_id IN ('1085e06d-34ad-4e7e-b337-56a0c19cc43f',
                     '1b10d2ef-8504-4778-9b7b-5b04b24f8751')
   OR mentor_id  IN ('1085e06d-34ad-4e7e-b337-56a0c19cc43f',
                     '1b10d2ef-8504-4778-9b7b-5b04b24f8751');

-- SQL #4: helper-функции, на которые опирается RLS
SELECT proname,
       prosecdef AS is_definer,
       pg_get_function_arguments(oid) AS args,
       pg_get_function_result(oid) AS returns
FROM pg_proc
WHERE pronamespace='public'::regnamespace
  AND proname IN ('is_admin', 'is_mentor_for', 'is_pvl_cohort_peer',
                  'has_platform_access');
```

---

## Сводка для ТЗ

1. **Модель данных «self vs mentor» уже есть в схеме** — таблицы созданы 001, разделение по колонкам `self_score`/`mentor_score`. ⇒ Сессия 1 backend в основном про:
   - RLS (которой пока нет в migrations)
   - column-level разделение «кто что пишет» (триггер vs split на две таблицы)
   - новые поля под reflexion-текст / submit-timestamps / unique constraint
   - PostgREST endpoints в `services/pvlPostgrestApi.js`
2. **`PvlSzAssessmentFlow` существует, но висит без mount** — можно переиспользовать, изменив persistence слой и добавив роль actor'а.
3. **Этап 2 в UI** — мест два (peer profile / certification section). Стратегу решать. Layout — единый responsive, как в Этапе 1.
4. **Тестовая пара**: id известны, **но у феи скорее всего нет pvl_students row** (phase37 trigger её не подхватил) — нужен manual INSERT перед тестом UI. SQL в §4.4.
5. **Открытые вопросы для стратега:**
   - RLS-механика column-level (триггер vs split-таблицы) — §5.1
   - Переиспользовать `PvlSzAssessmentFlow` или писать новый — §5.2
   - Где хранить reflexion-текст — §5.3
   - Где монтировать UI (peer page / certification section / оба) — §5.7
   - Перенос критериев в БД (для версионирования между потоками) — §1.4
   - UNIQUE constraint на certification_scores.student_id — §5.4

---

**Файл:** `garden/docs/_session/2026-05-28_142_codeexec_recon_etap2_certification.md`
