# Track C — диагностика mentee-blind отзыва Курдюковой (Этап 1)

**Адресат:** Ольга (связной) → стратег.
**Автор:** VS Code Claude Code (codeexec).
**Дата:** 2026-05-29.
**Жалоба:** 29 мая ~14:10 МСК — Елена Курдюкова (menti) НЕ видит отзыв
на свой тренировочный завтрак. Её ментор Елена Федотова отзыв видит.
**Режим:** read-only. psql под `gen_user`, JWT-impersonation через
`SET LOCAL ROLE authenticated` + `SET LOCAL "request.jwt.claims"`.
Все запросы в `BEGIN; … ROLLBACK;`. Никаких UPDATE / INSERT / DELETE.
**Паттерн:** _149 (Василина JWT-impersonation).

---

## TL;DR — Вердикт (d) «что-то ещё» = **frontend-bug, аналог _149**

**Server-side под её JWT возвращает отзыв.** Все три гипотезы (a/b/c)
из ТЗ отметены:

- ❌ **(a) split-brain** — `profiles.id == users_auth.id == pvl_students.id` совпадают для Курдюковой (`5aa62776-…`).
- ❌ **(b) session.student_id записан на чужой uuid** — записан правильно, на её `5aa62776-…`.
- ❌ **(c) RLS-полиси некорректна для self-case** — под её JWT `SELECT … FROM pvl_training_feedback WHERE session_id = '9e9430e4-…'` возвращает **1 строку** (через клаузу `s.student_id = auth.uid()`).

**Bug — на frontend.** То же место, что у Василины в _149: server-side
RLS пропускает, UI пуст. Серверная инфра — `pvl_training_sessions`,
`pvl_training_feedback`, RLS phase38, helper-функции — целиком работает.

**Дополнительная находка (для стратега, не root cause Track C):**
автор отзыва — НЕ ментор Федотова, а **Дарья Старостина**
(`147aea39-…`), peer Курдюковой по когорте 1. То есть тренировочный
завтрак в Этапе 1 — **peer-feedback**, не mentor-feedback. Федотова
видит этот отзыв из своего mentor-UI через RLS-клаузу
`is_mentor_for(s.student_id) = true`. Это **ожидаемо** при mentor-link
Курдюкова → Федотова, но стоит подтвердить, что текущее UI-ожидание
именно такое (peer пишет, ментор читает свою menti, menti читает свою).

---

## Раздел 1. UUID обеих Лен + split-brain check Курдюковой

### 1.1. `profiles`

```sql
SELECT id, name, email, role, access_status, status
FROM profiles
WHERE name ILIKE 'Елена Курдюкова%' OR name ILIKE 'Елена Федотова%';
```

| id | name | email | role | access_status | status |
|---|---|---|---|---|---|
| `5aa62776-6229-4270-9886-33316ff035c6` | Елена Курдюкова | `курдюкова` | applicant | active | active |
| `0e779c13-4cf8-48f7-9dd0-caa8da9a0d72` | Елена Федотова | `tolstokulakova77@mail.ru` | mentor | active | active |

**Странность (но не root cause Track C):** у Курдюковой `email = "курдюкова"` — кириллица, не валидный email-формат. Это username/placeholder, не email. На JWT-сторону не влияет (JWT.sub = uuid, не email), на RLS — тоже не влияет (RLS читает только id-колонки). На login-flow — может влиять, **если** где-то логин-форма матчит по email-shape. Передаю стратегу как side-finding.

### 1.2. `users_auth` — split-brain check

```sql
SELECT id, email FROM users_auth
WHERE id = '5aa62776-…' OR id = '0e779c13-…'
   OR email ILIKE '%курд%' OR email = 'tolstokulakova77@mail.ru';
```

| id | email |
|---|---|
| `5aa62776-6229-4270-9886-33316ff035c6` | `курдюкова` |
| `0e779c13-4cf8-48f7-9dd0-caa8da9a0d72` | `tolstokulakova77@mail.ru` |

**Split-brain нет** — `users_auth.id` совпадает с `profiles.id` у обеих. Дубликатов по email нет.

### 1.3. `pvl_students`

```sql
SELECT id, full_name, cohort_id, status FROM pvl_students
WHERE id = '5aa62776-…' OR id = '0e779c13-…';
```

| id | full_name | cohort_id | status |
|---|---|---|---|
| `5aa62776-6229-4270-9886-33316ff035c6` | Елена Курдюкова | `…-…-…-111111111101` (когорта 1) | active |

Федотовой в `pvl_students` нет — ожидаемо, она mentor, не menti.

**Вывод по разделу 1:** для Курдюковой `profiles.id == users_auth.id == pvl_students.id == 5aa62776-…`. Гипотеза (a) split-brain **отклонена.**

---

## Раздел 2. Session + отзыв (полные данные)

### 2.1. Тренировочная сессия

```sql
SELECT s.id, s.student_id, s.conducted_at, s.scenario_topic,
       (SELECT count(*) FROM pvl_training_feedback f WHERE f.session_id = s.id) AS fb_count
FROM pvl_training_sessions s
WHERE s.student_id = '5aa62776-6229-4270-9886-33316ff035c6';
```

| session_id | student_id | conducted_at | scenario_topic | fb_count |
|---|---|---|---|---|
| `9e9430e4-022a-4219-afe5-15955cdb7338` | `5aa62776-…` | 2026-05-27 20:37:00+03 | «Прокрастинация. Миссия:Поддержать себя» | **1** |

`session.student_id` буквально равен её `profiles.id`. Гипотеза (b) **отклонена.**

### 2.2. Отзыв

```sql
SELECT id, session_id, author_id, created_at, updated_at,
       length(text_what_worked) AS w_len,
       length(text_what_to_strengthen) AS s_len
FROM pvl_training_feedback
WHERE session_id = '9e9430e4-022a-4219-afe5-15955cdb7338';
```

| id | session_id | author_id | created_at | w_len | s_len |
|---|---|---|---|---|---|
| `9adffd05-8fbe-4b18-8c82-642b878ae3aa` | `9e9430e4-…` | **`147aea39-d127-4e31-a66d-dbd47e1c84be`** | 2026-05-29 10:29:25+03 | 227 | 99 |

`author_id` ≠ Федотова! Кто это:

| profile.id | name | email | role |
|---|---|---|---|
| `147aea39-d127-4e31-a66d-dbd47e1c84be` | **Дарья Старостина** | `darystarosta@gmail.com` | applicant |

И в `pvl_students`:

| id | full_name | cohort_id | status |
|---|---|---|---|
| `147aea39-…` | Дарья Старостина | `…-…-…-111111111101` (когорта 1, **та же что у Курдюковой**) | active |

**Интерпретация:** отзыв peer-feedback (Дарья — соученица Курдюковой по 1-й когорте). Федотова видит его из mentor-UI через RLS `is_mentor_for(student_id)`. Это согласуется с ТЗ Этапа 1, где тренировочные завтраки — peer-обмен.

---

## Раздел 3. SELECT под Курдюковой — что видит/не видит

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO
  '{"sub":"5aa62776-6229-4270-9886-33316ff035c6","role":"authenticated"}';

-- 3.1
SELECT id, student_id, conducted_at, scenario_topic
FROM pvl_training_sessions
WHERE id = '9e9430e4-022a-4219-afe5-15955cdb7338';

-- 3.2
SELECT id, session_id, author_id, length(text_what_worked) AS w_len,
       length(text_what_to_strengthen) AS s_len
FROM pvl_training_feedback
WHERE session_id = '9e9430e4-022a-4219-afe5-15955cdb7338';

-- 3.3 (sanity)
SELECT public.is_mentor_for('5aa62776-…'::uuid);

ROLLBACK;
```

### 3.1. Сессию видит — **1 строка**

| id | student_id | conducted_at | scenario_topic |
|---|---|---|---|
| `9e9430e4-…` | `5aa62776-…` | 2026-05-27 20:37+03 | Прокрастинация. Миссия:Поддержать себя |

RLS пропускает через `s.student_id = auth.uid()`.

### 3.2. Отзыв видит — **1 строка** ⚡

| id | session_id | author_id | w_len | s_len |
|---|---|---|---|---|
| `9adffd05-…` | `9e9430e4-…` | `147aea39-…` (Дарья) | 227 | 99 |

**Это ключ.** Под её JWT RLS пропускает: клауза `EXISTS (SELECT 1 FROM pvl_training_sessions s WHERE s.id = session_id AND s.student_id = auth.uid())` срабатывает. Отзыв доступен через REST.

### 3.3. `is_mentor_for(self) = false`

Как и ожидалось — она не ментор сама себе. Это значит RLS пропустил отзыв **именно** через ветку `s.student_id = auth.uid()`, не через mentor-ветку. Гипотеза (c) — RLS-полиси для self-case **некорректна** — **отклонена**.

---

## Раздел 4. SELECT под Федотовой — sanity-подтверждение

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO
  '{"sub":"0e779c13-4cf8-48f7-9dd0-caa8da9a0d72","role":"authenticated"}';

SELECT id, session_id, author_id
FROM pvl_training_feedback
WHERE session_id = '9e9430e4-022a-4219-afe5-15955cdb7338';

SELECT public.is_mentor_for('5aa62776-…'::uuid);

ROLLBACK;
```

| id | session_id | author_id |
|---|---|---|
| `9adffd05-…` | `9e9430e4-…` | `147aea39-…` |

**1 строка**, как и ожидала Ольга. `is_mentor_for(Курдюкова) = true`.

**Cross-check совпал:** обе видят один и тот же отзыв через RLS. Курдюкова — через self-клаузу, Федотова — через mentor-клаузу.

---

## Раздел 5. Mentor_link sanity

```sql
SELECT student_id, mentor_id, updated_at
FROM pvl_garden_mentor_links
WHERE student_id = '5aa62776-…';
```

| student_id | mentor_id | updated_at |
|---|---|---|
| `5aa62776-…` (Курдюкова) | `0e779c13-…` (Федотова) | 2026-05-16 14:48:08+03 |

**Линк корректный.** Это объясняет почему `is_mentor_for(Курдюкова)` под JWT Федотовой = true.

---

## ВЕРДИКТ (d) — frontend-bug, server-side чист

| Гипотеза | Status |
|---|---|
| (a) split-brain `profiles.id != users_auth.id` | ❌ Отклонена — все три id совпадают |
| (b) session.student_id записан на чужой uuid | ❌ Отклонена — записан на её `5aa62776-…` |
| (c) RLS-полиси некорректна для self-case | ❌ Отклонена — под её JWT отзыв виден (1 строка) |
| **(d) что-то ещё → frontend** | ✅ Это |

**Server отдаёт отзыв.** Симптом «menti не видит» — на frontend.
Аналог Track _149 (Василина): RLS работает, UI пуст. Не путать только: у Василины симптом был на `pvl_garden_mentor_links` (mentor view), у Курдюковой — на `pvl_training_feedback` (menti view тренировочных завтраков). Слой багов разный, корневой принцип — **тот же**: server-OK / UI-empty.

### Куда смотреть стратегу (рекомендация для следующей сессии)

1. **Component / hook**, рендерящий menti-view тренировочного завтрака. Скорее всего что-то в `views/PvlPrototype*` или `components/*Training*`, вызывает `pvlPostgrestApi.list…TrainingFeedback…`/похожее.
2. **Параметры REST-запроса** под её логином (DevTools → Network):
   - GET `…/pvl_training_feedback?session_id=eq.9e9430e4-…` — status code, response payload (должна быть 1 строка с w_len=227, s_len=99).
   - Если запроса нет — fetch не дёргается (orchestration-bug, аналог `ids.length === 0` молчаливого выхода из _149).
   - Если запрос есть и payload пуст — JWT в Authorization header может быть не её или невалидный.
   - Если запрос есть и payload содержит 1 объект — bug в hydrate/state/render (отзыв пришёл, не отобразился).
3. **localStorage SWR-ключи** для тренировочных завтраков (если есть) — могут содержать stale-snapshot до того как отзыв был оставлен (отзыв created 2026-05-29 10:29).
4. **Service Worker** — если кеширует `/pvl_training_feedback` GET'ы, есть риск что фронт читает протухший пустой ответ.

### Side-finding: email Курдюковой = `курдюкова` (не email)

В `profiles.email` и `users_auth.email` у неё лежит строка `"курдюкова"` (кириллица, без `@`). Это **не** root cause Track C (RLS / JWT не используют email), но если где-то login или recovery-flow матчит по email-shape — могут быть отдельные баги. Стратег решает, отдельная сессия по этому или нет.

---

## Что я НЕ делал

- ⛔ Не модифицировал данные (всё в `BEGIN; … ROLLBACK;`).
- ⛔ Не трогал RLS / GRANTы / миграции.
- ⛔ Не делал deploy.
- ⛔ Не пытался «починить» frontend — это отдельная сессия по решению стратега.
- ⛔ Не открывал DevTools у Курдюковой — нужна Ольга-связной + сама Курдюкова.

---

## Артефакты — uuid для стратега (чтоб не передавать через `…`)

| Имя | id |
|---|---|
| Елена Курдюкова (menti) | `5aa62776-6229-4270-9886-33316ff035c6` |
| Елена Федотова (mentor) | `0e779c13-4cf8-48f7-9dd0-caa8da9a0d72` |
| Дарья Старостина (author отзыва, peer) | `147aea39-d127-4e31-a66d-dbd47e1c84be` |
| training_session | `9e9430e4-022a-4219-afe5-15955cdb7338` |
| training_feedback | `9adffd05-8fbe-4b18-8c82-642b878ae3aa` |
| Когорта 1 | `11111111-1111-1111-1111-111111111101` |
