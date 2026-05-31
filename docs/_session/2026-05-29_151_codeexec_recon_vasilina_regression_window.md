# Track B2 — Recon регрессии Василины: окно 2026-05-27 12:00 → 2026-05-28 13:00

**Адресат:** Ольга (связной) → стратег.
**Автор:** VS Code Claude Code (codeexec).
**Дата:** 2026-05-29.
**Режим:** read-only. SSH + psql под gen_user, git log + git show. Никаких UPDATE/INSERT/DELETE. Никакого фикса.

**Контекст:** [_140](2026-05-28_140_codeexec_recon_mentor_view_empty_and_lib_marks_lost.md), [_149](2026-05-28_149_codeexec_diagnose_vasilina_jwt_impersonation.md), [_150](2026-05-28_150_codeexec_fix_mentor_view_race_diff.md). Окно: первая жалоба 28 мая 12:26.

---

## TL;DR — Вердикт

**В коде mentor view в окне регрессии НЕТ изменений.** `services/pvlMockApi.js` (где `hydrateGardenMentorAssignmentsFromDb` + `getMentorMentees`) и `services/dataService.js` (где `getUsers`) в окне **не трогались**. PostgREST endpoints для mentor view (`listGardenMentorLinksByStudentIds`, `listStudentContentProgress`) тоже **не трогались**.

**Уникальная аномалия данных Василины — `Ольга Разжигаева.pvl_students.status='applicant'`** — единственный такой случай в БД среди menti всех ментoров (у Юли Габрух и Лены Федотовой все 8 menti имеют `pvl_students.status='active'`). Но мы подтвердили в [_149](2026-05-28_149_codeexec_diagnose_vasilina_jwt_impersonation.md), что под её JWT RLS на pvl_students отдаёт все 3 строки, включая Ольгу Р. — server-side это не блокирует.

**Регрессия не git-привязана.** Кандидаты на trigger:
- `5e36843 chore(pvl): bump sw.js version` — cache-bust обнулил все кэши, мог инициировать **первый холодный запуск** у Василины конкретно 28 мая.
- `27c1388 fix(pvl): eager import PvlPrototypeApp` — изменил chunking, init order.
- `46cc058 Revert auto-refresh` — убрал spasательную retry-сеть; если первичный sync падает у Василины — некому повторить.

**Версия «не регрессия, а скрытый ранее баг»** правдоподобна: Василина могла впервые открыть mentor view именно 28 мая. Без скрина с датой ранее 27 мая утверждать «раньше работало» нельзя.

Подробности — ниже. Решение «какой фикс» — задача стратега, я не действую.

---

## 1. Deploy/commit log в окне

### 1.1. Полный git log 2026-05-25 → 2026-05-29

```
5d1d8a7 2026-05-28 21:30:09  phase40: split pvl_student_certification_scores
d415311 2026-05-28 15:45:08  fix(pvl): markdown-import — не съедает первый ##
─── Жалоба Василины 28 мая 12:26 ───
d39db29 2026-05-27 12:53:11  fix(pvl): кнопка «Я провела» peer-page (mobile)
97f486b 2026-05-27 12:14:14  fix(pvl): «Моя страница» в Garden mobile sidebar
27c1388 2026-05-27 11:55:48  fix(pvl): eager import PvlPrototypeApp
46cc058 2026-05-27 11:30:06  Revert "fix(pvl): add auto-refresh"
5e36843 2026-05-27 11:10:54  chore(pvl): bump sw.js version
12d3c46 2026-05-27 09:37:57  feat(pvl): «Моя страница» в student sidebar
e227c3e 2026-05-27 09:25:10  feat(pvl): этап 1 Сессия 3 — training feedback frontend
786add4 2026-05-27 08:40:16  feat(pvl): этап 1 Сессия 2 — peer-страница frontend
8d39853 2026-05-27 08:35:01  feat(pvl): phase39 — peer-видимость pvl_students (SQL)
5fde932 2026-05-27 08:21:13  fix(profile): TG-LINK ANGLE BRACKETS
d65969e 2026-05-26 19:59:12  feat(pvl): phase38 — pvl_training_sessions
9a6192f 2026-05-26 15:07:10  fix(pvl): add auto-refresh (reverted by 46cc058)
```

**В окне 12:00 27 мая → 13:00 28 мая** реально доехало на прод (если deploy = sw.js bump): только `97f486b` и `d39db29` — оба про peer-page button mobile, **не трогают mentor view**.

### 1.2. Изменения в файлах, критичных для mentor view (окно 25-28 мая)

```
services/pvlMockApi.js   — НЕ менялся (а это hydrate + getMentorMentees)
services/dataService.js  — НЕ менялся (а это getUsers — SELECT * FROM profiles)
services/pvlPostgrestApi.js:
  786add4 — добавлено listMyCohortPeers + training session APIs (Сессия 2)
  e227c3e — добавлено listTrainingFeedback (Сессия 3)
  → mentor-view endpoints (listGardenMentorLinksByStudentIds,
    listStudentContentProgress) НЕ трогались, только append новых функций.
views/PvlPrototypeApp.jsx:
  786add4 — peer-страница UI (Сессия 2, НЕ mentor view)
  e227c3e — training UI (Сессия 3, НЕ mentor view)
  12d3c46 — «Моя страница» в student sidebar (НЕ mentor view)
  46cc058 — Revert auto-refresh: убрал setInterval+focus+visibility,
            оставил setTimeout(30s) для второго sync.
  97f486b — Garden mobile sidebar (peer-page)
  d39db29 — peer-page button mobile
```

**Вывод по §1:** Не нашёл коммита, который бы напрямую трогал `hydrateGardenMentorAssignmentsFromDb`, `getMentorMentees`, `listGardenMentorLinksByStudentIds`, `MentorDashboard`, `MentorMenteesPanel`, `buildMentorMenteeRows`. **Регрессия в окне НЕ в коде mentor view.**

### 1.3. SQL миграция в окне — `8d39853 phase39`

Файл: [database/pvl/migrations/2026-05-27_phase39_pvl_students_cohort_peer.sql](garden/database/pvl/migrations/2026-05-27_phase39_pvl_students_cohort_peer.sql).

```sql
CREATE POLICY pvl_students_select_cohort_peer
  ON pvl_students FOR SELECT TO authenticated
  USING (is_pvl_cohort_peer(id));
```

Это **PERMISSIVE** policy — расширяет видимость pvl_students для peer-applicant'ов. **Не отрезает** что-либо у mentor. Под Василининым JWT мы подтвердили в [_149 §4.1](2026-05-28_149_codeexec_diagnose_vasilina_jwt_impersonation.md): pvl_students отдаёт все 3 menti через основную клаузу `pvl_students_select_own_or_mentor_or_admin` (`is_mentor_for(id)`). Phase39 даже не дёргается в её случае.

---

## 2. Audit её 3 menti в БД

### 2.1. profiles — updated_at, role, access_status

```
id                                     name              role       access_status  updated_at
d128a7a3-2c1d-4ba9-92fa-cd72d69f9837   Марина Шульга      applicant  active         NULL
90c9b7c7-db13-41bd-b393-49d79fc571b1   Ольга Разжигаева   applicant  active         NULL
d302b93d-5d29-4787-82d3-526dfe8c4a15   Лилия Мaлонг       applicant  active         NULL
```

**`profiles.updated_at` = NULL** для всех трёх. У Василины тоже NULL. Это означает что **либо trigger не пишет updated_at, либо строки не редактировались с момента создания/импорта**. Триггеры на profiles есть (`trg_sync_status_from_access_status`, `on_profile_contacts_change_resync_events` и др.), но они не трогают `updated_at` явно. Никаких изменений в profiles этих 4 строк за окно — нет следов.

### 2.2. pvl_students — статусы и даты

```
id            full_name         status     cohort_id     created_at         updated_at
90c9b7c7-…   Ольга Разжигаева   applicant  cohort-…-101  2026-05-19 10:41   2026-05-19 10:41  ← УНИКАЛЬНО
d128a7a3-…   Марина Шульга      active     cohort-…-101  2026-04-17 16:20   2026-05-07 17:46
d302b93d-…   Лилия Мaлонг       active     cohort-…-101  2026-04-17 16:20   2026-05-07 17:46
```

**Ольга Разжигаева создана в `pvl_students` 2026-05-19 10:41** (ENSURE через `ensurePvlStudentInDb` после mentor_link от 18 мая 14:33). С тех пор не обновлялась.

`status='applicant'` сохраняется до сих пор. Это нормально, потому что она не сдала ничего, что её перевело бы в `status='active'`. Phase37 trigger `trg_profiles_pvl_student_on_approval` переводит status только при approval (через `profiles.role` admin'ом). Для Ольги Р. approval не было.

### 2.3. pvl_garden_mentor_links Василины

```
student_id                              mentor_id   updated_at
90c9b7c7-… (Ольга Р.)                  Vasilina    2026-05-18 14:33  ← последний линк до жалобы
d128a7a3-… (Марина)                    Vasilina    2026-04-17 16:19
d302b93d-… (Лилия)                     Vasilina    2026-04-16 09:33
```

Все 3 линка стабильны. **Никаких изменений в окне 27-28 мая.** Самый свежий — Ольга Р. от 18 мая (за 10 дней до жалобы).

Таблица `pvl_garden_mentor_links` имеет только колонки `student_id, mentor_id, updated_at` — нет `created_at`, нет soft-delete, нет audit-history.

### 2.4. pvl_audit_log за окно для menti

Таблица `pvl_audit_log` (schema: `id, actor_user_id, action, entity_type, entity_id, payload, created_at`) — содержит in-app события (`mentor_review`, `mark_thread_read`). Это не data-mutation audit. Просмотр последних 3-х записей: события 29 мая от случайного ментора, **не Василины**. Не информативно для regression-tracking.

**Прицельно по UUID Василины/menti за 27-28 мая** — корректный запрос не дал значимых result'ов из-за слабой schema. Если стратегу нужно — могу повторить с правильными WHERE-фильтрами.

---

## 3. Audit профиля самой Василины

```
id                              6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7
name                            Василина Лузина
role                            mentor
access_status                   active
status                          active
subscription_status             active
paid_until                      2026-06-16 03:42:03  (валидно)
last_payment_at                 2026-05-16 03:42:03  (за 12 дней до жалобы)
last_prodamus_event             payment_success
session_version                 1
auto_pause_exempt               false
telegram_linked_at              2026-05-16 22:34:51
profiles.updated_at             NULL
```

**Никаких подозрительных изменений** в её профиле в окне регрессии. Платёж прошёл 16 мая (за 12 дней до жалобы), `access_status='active'`, subscription валидна до 16 июня. `has_platform_access(Василина) = true` подтверждено в [_149](2026-05-28_149_codeexec_diagnose_vasilina_jwt_impersonation.md).

`session_version = 1` — низкое, но это не флаг проблемы (это используется для invalidate JWT при принудительном logout, и значение 1 — норма для тех, кому пока не принудительно сбрасывали).

---

## 4. Сравнение Василина vs работающие mentor'ы

### 4.1. Юля Габрух (4 menti) — все видны в её UI

```
mentor: 492e5d3d-81c7-41d8-8cef-5a603e1389e6  Юлия Габрух   role=mentor active

menti                                          profile.role  ps.status   cohort_id
0e978b3b-… Диана Зернова                       applicant     active      ...101
147aea39-… Дарья Старостина                    applicant     active      ...101
35019374-… Ирина Петруня                       applicant     active      ...101
9fb65c2a-… Анжелика Тарасова                   applicant     active      ...101
```

**Все 4 — `pvl_students.status = 'active'`.**

### 4.2. Лена Федотова (4 menti) — все видны

```
mentor: 0e779c13-4cf8-48f7-9dd0-caa8da9a0d72  Елена Федотова  role=mentor active

menti                                          profile.role  ps.status   cohort_id
5aa62776-… Елена Курдюкова                     applicant     active      ...101
a2356b84-… Александра Титова                   applicant     active      ...101
b90d5f86-… Вероника Лютова                     applicant     active      ...101
746c80bc-… Ольга Садовникова                   applicant     active      ...101
```

**Все 4 — `pvl_students.status = 'active'`.**

### 4.3. Василина (3 menti) — НЕ видны

```
mentor: 6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7  Василина Лузина  role=mentor active

menti                                          profile.role  ps.status              cohort_id
d128a7a3-… Марина Шульга                       applicant     active                 ...101
d302b93d-… Лилия Мaлонг                        applicant     active                 ...101
90c9b7c7-… Ольга Разжигаева                    applicant     applicant  ← УНИКАЛЬНО ...101
```

### 4.4. Все mentors в БД (общая выборка)

```
Анна Минаева         mentor  active  status=suspended  ← suspended
Василина Лузина      mentor  active  status=active
Елена Федотова       mentor  active  status=active
Колотилова Светлана  mentor  active  status=suspended  ← suspended
Настин фиксик        mentor  active  status=active    ← test account
Наталья Гулякова     mentor  active  status=active
Юлия Габрух          mentor  active  status=active
```

Все активные mentors структурно одинаковые. Василина не отличается от других.

### 4.5. КЛЮЧЕВАЯ УНИКАЛЬНОСТЬ

**Ольга Разжигаева — ЕДИНСТВЕННЫЙ menti в БД (среди menti всех ментоторов), у которого `pvl_students.status = 'applicant'`.** Все 11 других menti у всех 7 ментоторов имеют `pvl_students.status = 'active'`.

Это происходит потому что:
- Ольга добавлена в pvl_students позже (2026-05-19) через `ensurePvlStudentInDb`, который ставит `status='applicant'` по умолчанию.
- Перевод в `status='active'` происходит через `trg_profiles_pvl_student_on_approval` (phase37) — она это срабатывает когда admin меняет profile.role на 'intern'/'student' и т.п. Для Ольги Р. — `profile.role` всё ещё 'applicant', approval'a не было.
- Лилия и Марина были созданы 17 апреля и за это время прошли через какой-то approval flow, поэтому их `pvl_students.status` — 'active'.

---

## 5. Анализ почему «уникальность Ольги Р.» теоретически могла бы блокировать

Поиск по коду **`grep -rn "status.*applicant\|status\s*===\s*'active'"`** в mentor-view цепочке (pvlMockApi.js + pvlPostgrestApi.js + PvlPrototypeApp.jsx) — **не нашёл фильтрации по `pvl_students.status='applicant'`** в getMentorMentees / buildMentorMenteeRows / hydrate. Все совпадения — про taskStatus / contentStatus / paymentStatus.

То есть **по коду** аномалия Ольги Р. не должна блокировать видимость трёх menti. Под её JWT в [_149](2026-05-28_149_codeexec_diagnose_vasilina_jwt_impersonation.md) RLS pvl_students отдал все три строки. PostgREST'у её status='applicant' безразличен.

**Возможные направления почему это всё же может быть значимым:**
1. Где-то в сторонней цепочке (например `processStudentTrackerAndHomework` для Ольги Р.) на `status='applicant'` срабатывает edge case с exception, который top-level catch проглатывает, и хотя hydrate отработал — UI получает ошибку рендера.
2. Где-то в backfill seed-data (раннее устаревшие данные с этой ключевой комбинацией) не было — никто из живых ментoров не сталкивался.
3. Это **отвлекающая координата**: статус Ольги Р. ни при чём, а реальная причина другая.

Без живых сигналов от Василины (DevTools — см. [_149 §6](2026-05-28_149_codeexec_diagnose_vasilina_jwt_impersonation.md)) точно сказать нельзя.

---

## 6. ВЕРДИКТ

### 6.1. Что НЕ нашёл

- ⛔ **Никакой commit в окне 27-28 мая не трогает mentor view code-path.** Регрессия Vasilina-специфична → но не git-привязана.
- ⛔ **Никаких UPDATE'ов в profiles/pvl_students/pvl_garden_mentor_links для неё или её menti в окне.** Данные стабильны.
- ⛔ **Phase39 — PERMISSIVE policy на pvl_students.** Расширяет, не сужает. Под её JWT pvl_students возвращает 3 строки — это подтверждено в _149.

### 6.2. Что нашёл

- ✅ **Уникальная аномалия данных Василины**: `Ольга Разжигаева.pvl_students.status='applicant'` — единственный случай в БД.
- ✅ **Три коммита, которые могли сменить client init order у Василины ИМЕННО 28 мая:**
  - `5e36843` bump sw.js → `clients.claim` + `caches.delete` на activate
  - `27c1388` eager import → изменился chunking, время до hydrate
  - `46cc058` Revert auto-refresh → теперь spasательная retry-сеть слабее (только setTimeout 30s вместо setInterval+focus+visibility)
- ✅ **`profiles.updated_at` NULL** для всех 4 строк (Василина + 3 menti). Профили не редактировались давно.

### 6.3. Кандидаты на root cause

**К1 (наиболее вероятно):** SW bump + eager import + revert auto-refresh **в комбинации** создали для Василины (в её сетевых/cookie/storage условиях) первый холодный запуск, при котором `syncPvlActorsFromGarden` дал partial result (например `api.getUsers()` вернул не все profiles из-за timing/JWT-bootstrap), и **retry-сеть теперь слабее** — некому повторить. Юля/Лена попадали на более удачные timing'и.

**К2 (возможно):** Аномалия Ольги Р. где-то в init-цепочке роняет per-student processing для неё (например в `processStudentTrackerAndHomework`), и хотя `allSettled` обёртки защищают от полного фейла, что-то всё же ломает UI. Но в коде явной такой ветки я не нашёл.

**К3 (маловероятно но возможно):** Это **не регрессия**. Василина могла впервые открыть mentor view именно 28 мая. Если у неё всегда было сломано (например с момента добавления Ольги Р. 18 мая), но она не пользовалась — жалоба сейчас «впервые», а не «снова». Это решается простым вопросом ей: «вы видели menti раньше в этой неделе или раньше?»

### 6.4. Что нужно от стратега

Решить, какую дорогу выбрать:

- **(a) Запросить у Василины** скрин даты, когда она в последний раз видела menti. Если до 27 мая — К1/К2. Если она впервые открыла 28 мая — К3, и фикс должен покрывать «раннее не работало».
- **(b) Применить точечный fix Pattern C'** из [_150](2026-05-28_150_codeexec_fix_mentor_view_race_diff.md) (если я ментор и menteeIds пуст — спросить БД напрямую `?mentor_id=eq.me` и дозагрузить недостающих студентов). Это покрывает К1, К2, К3 одним движением.
- **(c) DevTools** у Василины — см. [_149 §6](2026-05-28_149_codeexec_diagnose_vasilina_jwt_impersonation.md). Окончательно подтвердит/опровергнет К1 vs К2.
- **(d) Тестовый scenario:** временно перевести Ольгу Р. в `pvl_students.status='active'` (вручную в БД) — если у Василины появятся все 3 menti в UI, К2 подтверждена. Но это нарушает read-only, и без отмашки я этого не делаю.

⛔ **Никакого фикса не применил.** Никаких UPDATE/INSERT/DELETE. git status чистый по коду. Жду решения.

---

**Артефакт:** этот файл, [docs/_session/2026-05-29_151_codeexec_recon_vasilina_regression_window.md](garden/docs/_session/2026-05-29_151_codeexec_recon_vasilina_regression_window.md).
