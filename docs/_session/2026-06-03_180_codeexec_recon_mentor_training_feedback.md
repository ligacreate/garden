# Recon: менторский отзыв на ТРЕНИРОВОЧНОМ завтраке (READ-ONLY)

**От:** codeexec (VS Code) → стратегу через Ольгу
**Дата:** 2026-06-03
**Повод:** жалоба ментора Юли Габрух (`492e5d3d-81c7-41d8-8cef-5a603e1389e6`) — не находит, где
оставить СВОЙ отзыв по тренировочному завтраку менти Даши Старостиной. Чужие отзывы видит,
входа «оставить отзыв самой» как ментор — нет.
**ТЗ Этапа 1:** [2026-05-26_134_strategist_tz_etap1_training_feedback.md](2026-05-26_134_strategist_tz_etap1_training_feedback.md)

---

## Вердикт: (a) менторского отзыва НЕТ ни в модели, ни в UI — это gap, надо строить.

Это **не** баг discoverability/role-гарда (как навигационный БАГ2 со stale `libraryOpenRequest`,
где фича была, но скрыта). Здесь фичу просто не построили — ни RLS-пути на запись для ментора,
ни формы-входа в UI. Отсутствие **совпадает с намеренным scope-решением ТЗ** → вводить менторский
отзыв на тренировочном это продуктовое решение, а не пропущенная при реализации деталь.

## 1. ТЗ — менторского отзыва в дизайне не было

ТЗ _134 проектирует тренировочный отзыв как **peer↔peer**, методичка-driven. Ментор — только читатель:
- §2 #10: «Ментор видит отзывы только своих менти» (про SELECT, не про авторство).
- §4.5 (PvlTrainingFeedbackList): «Оставить отзыв» — только в ветке «Я peer»; ментор — «то же что владелец» = читает все.
- §4.5 (Sidebar): «Менторский sidebar не добавляем».

## 2. Модель (БД/RLS) — кто может писать

`pvl_training_feedback`: `author_id → profiles(id)`, `UNIQUE(session_id, author_id)`. Понятия
«менторский отзыв» нет. Единственная INSERT-политика `pvl_training_feedback_insert_peer` требует
`is_pvl_cohort_peer(s.student_id)` → автор обязан быть строкой `pvl_students` своей когорты
(`role='applicant'`). Ментора в `pvl_students` нет → RLS отклоняет его INSERT.

Проверено в БД (gen_user, read-only):
- `is_mentor_for(student)` = EXISTS в `pvl_garden_mentor_links WHERE student_id=… AND mentor_id=auth.uid()`
  → ментору даёт ТОЛЬКО SELECT (`pvl_training_feedback_select`, phase38).
- Юля не в `pvl_students` (`yulia_is_pvl_student = f`) → `is_pvl_cohort_peer` для неё = false.
- Отзывов, написанных Юлей где-либо: 0.

Контраст: **сертификационный** завтрак (Этап 2 / phase40) имеет таблицу `pvl_student_certification_mentor`
+ `PvlCertificationBlock` с веткой `isMentor → PvlSzAssessmentFlow mode="mentor"`. Там ментор
оценивает официально. На тренировочном — нет.

## 3. UI — точки входа «оставить отзыв» для ментора нет

`components/PvlTrainingFeedbackList.jsx`: кнопка рендерится только при
`isPeerOnly = viewerRole === 'student' && sessionStudentId !== viewerId`. У ментора
`viewerRole === 'mentor'` (проставляется в `views/PvlMenteeCardView.jsx`:
`linkMode === 'admin' ? 'admin' : 'mentor'`) → `isPeerOnly = false` → кнопки нет, только
read-only список (`canSeeAll`). Ветки на запись для ментора нет нигде, `PvlTrainingFeedbackForm`
для ментора не вызывается, API-метода «менторский отзыв» нет.

## 4. Конкретно Даша Старостина

| | |
|---|---|
| Дарья Старостина | `147aea39-d127-4e31-a66d-dbd47e1c84be`, role=applicant, когорта **ПВЛ 2026 Поток 1** (`…101`) |
| Ментор | Юля Габрух — да, через `pvl_garden_mentor_links` (+ Диана Зернова, Анжелика Тарасова, Ирина Петруня) |
| Тренировочный завтрак | 1 шт: «Карта моего отдыха», `f1237526-0d53-4b9a-8286-fb87b032cfee`, проведён 2026-06-03 09:00 |
| Отзывы (2) | Александра Титова (applicant/peer) + Ольга Садовникова (applicant/peer) |
| Слот под отзыв Юли | **отсутствует** — нет ни строки, ни UI-входа, ни RLS-разрешения на её INSERT |

Юля видит оба peer-отзыва (через `is_mentor_for`), но оставить свой не может ни в UI, ни в БД —
ровно как в жалобе.

## Фундамент для постройки (что уже есть)

- `UNIQUE(session_id, author_id)` — менторская строка сосуществует с peer-строками.
- `PvlTrainingFeedbackForm` — role-agnostic (берёт `authorId` пропом).
- `is_mentor_for` уже даёт ментору SELECT; владелец-менти увидит менторский отзыв (owner-sees-all).
- UPDATE-политика `pvl_training_feedback_update_own_or_admin` уже author-generic — ментор сможет
  править свой отзыв без отдельной политики.

**Продуктовое решение Ольги (2026-06-03):** вводим менторский отзыв на тренировочных завтраках.
Реализация — phase44, см. [2026-06-03_181_codeexec_phase44_backend_mentor_feedback_dryrun.md](2026-06-03_181_codeexec_phase44_backend_mentor_feedback_dryrun.md).
