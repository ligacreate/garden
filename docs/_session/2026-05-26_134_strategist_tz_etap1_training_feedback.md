# ТЗ Этапа 1 — Личная страница участницы курса ПВЛ + отзывы на тренировочные завтраки

**От:** стратега (claude.ai) → codeexec через Ольгу
**Дата:** 2026-05-26
**Базовый recon:** [_129](2026-05-25_129_codeexec_recon_pvl_student_page.md) + [_130_cohort1_audit](2026-05-26_130_codeexec_recon_pvl_students_cohort1_audit.md) + дообогащение про связку Разжигаева-Василина (chat).
**Источник продуктовых требований:** методичка «Тренировочный завтрак — что это и как проходит.md» из Obsidian-библиотеки Урок 8.

---

## 1. Контекст

### Что делаем
Новая страница «Личная страница участницы курса ПВЛ» с блоком «Тренировочные завтраки» и формой отзывов. Отдельная от существующей `LeaderPageView` (та для всех ведущих Garden навсегда, а эта — временная учебная страница на период курса).

### Что НЕ в Этапе 1
- Сертификационный завтрак (Этап 2)
- Архив ДЗ + прогресс по курсу (Этап 3)
- Bulk-выгрузка MD/ZIP админу (Этап 1.5, после имплементации)
- TG-уведомления о новых отзывах (отдельный тикет `TG-NOTIFY-NEW-TRAINING-FEEDBACK`)
- BroadcastChannel/realtime sync (отложено)

---

## 2. Продуктовые решения (зафиксированы Ольгой)

| # | Решение |
|---|---|
| 1 | Менти жмёт «Я провела» **после** факта встречи (just-fact, без расписания) |
| 2 | Удалять тренировочный завтрак — **только админ** |
| 3 | **Жёсткий лимит 2** тренировочных завтрака на менти |
| 4 | Peer (автор отзыва) видит **только свой** отзыв, не чужие |
| 5 | Edit отзыва **без ограничений по времени** (методичный 48ч — только подсказка в UI) |
| 6 | Отзывы автора, ушедшего с курса, **остаются видимы** |
| 7 | **Не объединять** с `LeaderPageView.leader_reviews` — разные контексты |
| 8 | Доступ **только своя когорта** (Поток 1 видит Поток 1) |
| 9 | **Простой текст** отзыва: 4 поля + имя автора + дата. Без цветных карточек, REVIEW_COLORS не использовать |
| 10 | Ментор видит отзывы **только своих** менти. Админы — всех |

---

## 3. Backend

### 3.1 Миграция

Файл: `database/pvl/migrations/2026-05-2X_phase38_pvl_training_breakfasts.sql`

```sql
-- ============================================================================
-- phase38: pvl_training_sessions + pvl_training_feedback
-- Личная страница участницы курса: тренировочные завтраки + отзывы peer-менти
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Таблица pvl_training_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE pvl_training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES pvl_students(id) ON DELETE CASCADE,
  conducted_at timestamptz NOT NULL,
  scenario_topic text NOT NULL CHECK (length(scenario_topic) >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pvl_training_sessions_student_id
  ON pvl_training_sessions(student_id);
CREATE INDEX idx_pvl_training_sessions_conducted_at
  ON pvl_training_sessions(conducted_at);

-- Triggered constraint: лимит 2 сессий на менти (жёсткий)
CREATE OR REPLACE FUNCTION enforce_pvl_training_sessions_limit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM pvl_training_sessions
      WHERE student_id = NEW.student_id) >= 2 THEN
    RAISE EXCEPTION
      'Лимит тренировочных завтраков превышен (максимум 2 на менти)'
      USING HINT = 'Удалите старый завтрак через админа перед добавлением нового';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pvl_training_sessions_limit
  BEFORE INSERT ON pvl_training_sessions
  FOR EACH ROW EXECUTE FUNCTION enforce_pvl_training_sessions_limit();

CREATE TRIGGER trg_pvl_training_sessions_updated_at
  BEFORE UPDATE ON pvl_training_sessions
  FOR EACH ROW EXECUTE FUNCTION pvl_set_updated_at();

-- ---------------------------------------------------------------------------
-- Таблица pvl_training_feedback
-- ---------------------------------------------------------------------------
CREATE TABLE pvl_training_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES pvl_training_sessions(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  text_what_worked text NOT NULL DEFAULT '',
  text_what_to_strengthen text NOT NULL DEFAULT '',
  text_one_technique text NOT NULL DEFAULT '',
  text_open_question text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, author_id)
);

CREATE INDEX idx_pvl_training_feedback_session_id
  ON pvl_training_feedback(session_id);
CREATE INDEX idx_pvl_training_feedback_author_id
  ON pvl_training_feedback(author_id);

CREATE TRIGGER trg_pvl_training_feedback_updated_at
  BEFORE UPDATE ON pvl_training_feedback
  FOR EACH ROW EXECUTE FUNCTION pvl_set_updated_at();

-- ---------------------------------------------------------------------------
-- Хелпер is_pvl_cohort_peer с фильтром role='applicant'
-- (фильтр критичен — отсекает 13 Garden-интернов от phase37 backfill,
-- см. _130 cohort audit)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_pvl_cohort_peer(target_student uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pvl_students me
    JOIN pvl_students them ON me.cohort_id = them.cohort_id
    JOIN profiles them_p ON them_p.id = them.id
    WHERE me.id = auth.uid()
      AND them.id = target_student
      AND me.cohort_id IS NOT NULL
      AND them_p.role = 'applicant'
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS: pvl_training_sessions
-- ---------------------------------------------------------------------------
ALTER TABLE pvl_training_sessions ENABLE ROW LEVEL SECURITY;

-- RESTRICTIVE guard (как все pvl_* таблицы)
CREATE POLICY pvl_training_sessions_active_access_guard_select
  ON pvl_training_sessions AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (has_platform_access(auth.uid()));

CREATE POLICY pvl_training_sessions_active_access_guard_write
  ON pvl_training_sessions AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (has_platform_access(auth.uid()))
  WITH CHECK (has_platform_access(auth.uid()));

-- PERMISSIVE SELECT
CREATE POLICY pvl_training_sessions_select
  ON pvl_training_sessions FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR is_mentor_for(student_id)
    OR is_pvl_cohort_peer(student_id)
    OR is_admin()
  );

-- PERMISSIVE INSERT: только сама менти
CREATE POLICY pvl_training_sessions_insert_own
  ON pvl_training_sessions FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

-- PERMISSIVE UPDATE: сама менти (поправить тему) + admin
CREATE POLICY pvl_training_sessions_update_own_or_admin
  ON pvl_training_sessions FOR UPDATE TO authenticated
  USING (student_id = auth.uid() OR is_admin())
  WITH CHECK (student_id = auth.uid() OR is_admin());

-- PERMISSIVE DELETE: только admin
CREATE POLICY pvl_training_sessions_delete_admin
  ON pvl_training_sessions FOR DELETE TO authenticated
  USING (is_admin());

-- ---------------------------------------------------------------------------
-- RLS: pvl_training_feedback
-- ---------------------------------------------------------------------------
ALTER TABLE pvl_training_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY pvl_training_feedback_active_access_guard_select
  ON pvl_training_feedback AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (has_platform_access(auth.uid()));

CREATE POLICY pvl_training_feedback_active_access_guard_write
  ON pvl_training_feedback AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (has_platform_access(auth.uid()))
  WITH CHECK (has_platform_access(auth.uid()));

-- PERMISSIVE SELECT:
--   автор видит свой отзыв (любой)
--   владелец сессии (menti) видит все отзывы на её сессии
--   ментор владельца видит отзывы на его menti
--   admin видит всё
CREATE POLICY pvl_training_feedback_select
  ON pvl_training_feedback FOR SELECT TO authenticated
  USING (
    author_id = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM pvl_training_sessions s
      WHERE s.id = pvl_training_feedback.session_id
        AND (s.student_id = auth.uid() OR is_mentor_for(s.student_id))
    )
  );

-- PERMISSIVE INSERT: peer из своей когорты, автор=я
CREATE POLICY pvl_training_feedback_insert_peer
  ON pvl_training_feedback FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM pvl_training_sessions s
      WHERE s.id = pvl_training_feedback.session_id
        AND is_pvl_cohort_peer(s.student_id)
    )
  );

-- PERMISSIVE UPDATE: автор редактирует свой + admin
CREATE POLICY pvl_training_feedback_update_own_or_admin
  ON pvl_training_feedback FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR is_admin())
  WITH CHECK (author_id = auth.uid() OR is_admin());

-- PERMISSIVE DELETE: только admin
CREATE POLICY pvl_training_feedback_delete_admin
  ON pvl_training_feedback FOR DELETE TO authenticated
  USING (is_admin());

-- ---------------------------------------------------------------------------
-- GRANTs (важно: добавить в /opt/garden-monitor/recover_grants.sh
-- для защиты от daily Timeweb wipe, см. project-garden-daily-wipe memory)
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON pvl_training_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pvl_training_feedback TO authenticated;

-- ensure_garden_grants() обновить тоже (это часть SEC-014 phase 23)
SELECT public.ensure_garden_grants();

COMMIT;
```

### 3.2 Обновить recover_grants.sh

Добавить в `/opt/garden-monitor/recover_grants.sh` (на VPS Bittern) — две дополнительные GRANT-строки для новых таблиц, чтобы daily Timeweb grants wipe в 13:08 UTC их восстанавливал.

### 3.3 Тесты RLS (SQL)

В отчёте сессии backend — отдельный блок с psql-проверками под разными ролями:
- Под `authenticated` от лица menti: видит свои сессии, видит peer-сессии своей когорты (с фильтром applicant), НЕ видит сессии других когорт
- Под `authenticated` от лица ментора: видит сессии своих menti через `is_mentor_for()`
- Под `authenticated` от лица admin: видит всё
- Под `web_anon`: получает 401/403 на все pvl_training_* (default deny)

---

## 4. Frontend

### 4.1 Новые файлы

| Файл | Что | LOC (~) |
|------|-----|---------|
| `views/PvlPeerProfileView.jsx` | Личная страница участницы курса (универсальная для student/mentor/admin views) | 200 |
| `views/PvlMyCohortView.jsx` | Список менти своей когорты (точка входа) | 120 |
| `components/PvlTrainingSessionBlock.jsx` | Блок «Тренировочные завтраки» — список сессий + кнопка «Я провела» | 150 |
| `components/PvlTrainingFeedbackList.jsx` | Список отзывов под сессией + кнопка «Оставить отзыв» | 100 |
| `components/PvlTrainingFeedbackForm.jsx` | Модалка с 4 textarea + подсказка про правила | 80 |

### 4.2 Правки существующих файлов

| Файл | Что |
|------|-----|
| `services/pvlPostgrestApi.js` | +5 методов (~120 LOC) |
| `views/PvlPrototypeApp.jsx` | Mount маршрутов + sidebar item «Моя когорта» (~60 LOC) |

### 4.3 Маршруты

| Route | Компонент | Кто видит |
|-------|-----------|-----------|
| `/student/cohort` | `PvlMyCohortView` | Менти своей когорты |
| `/student/peer/:id` | `PvlPeerProfileView` | Peer-менти (своя или чужая своей когорты) |
| `/mentor/mentee/:id` (расширение) | `PvlMenteeCardView` + блок тренировочных | Ментор для своих менти |
| `/admin/students/:id` (расширение) | `AdminStudent…` + блок тренировочных | Admin для всех |

### 4.4 API методы (services/pvlPostgrestApi.js)

```js
// Список peer-менти моей когорты (фильтр role='applicant' через RLS+VIEW)
listMyCohortPeers()
  → GET /pvl_students?select=id,full_name,cohort_id&...
  → RLS вернёт автоматически только своих peer'ов (через is_pvl_cohort_peer)

// Тренировочные завтраки
listTrainingSessions(studentId)
  → GET /pvl_training_sessions?student_id=eq.{id}&order=conducted_at.desc

createTrainingSession({ student_id, conducted_at, scenario_topic })
  → POST /pvl_training_sessions
  → может вернуть 400 если лимит 2 превышен (от триггера)

deleteTrainingSession(sessionId)
  → DELETE /pvl_training_sessions?id=eq.{id}
  → admin-only по RLS

// Отзывы
listTrainingFeedback(sessionId)
  → GET /pvl_training_feedback?session_id=eq.{id}&order=created_at.desc

upsertTrainingFeedback({ session_id, author_id, text_what_worked, ... })
  → POST /pvl_training_feedback с Prefer: resolution=merge-duplicates
  → UNIQUE (session_id, author_id) → ON CONFLICT update
```

### 4.5 UI поведение

#### PvlMyCohortView (`/student/cohort`)
- Заголовок: «Менти моей когорты»
- Подзаголовок: «Поток 1» (имя из `pvl_cohorts.title`)
- Сетка карточек: имя + аватар (из `profiles`) + бейдж «ментор: \<имя ментора\>» или «без ментора»
- Клик по карточке → `/student/peer/{id}`
- Если у самой текущей menti `cohort_id IS NULL` (например, тестовый аккаунт) — пустая страница с подсказкой «Когорта не назначена, обратитесь к админу»

#### PvlPeerProfileView (`/student/peer/:id`, `/mentor/peer/:id`, `/admin/peer/:id`)
- Шапка: имя + аватар + бейдж «Поток 1» + (если есть ментор) «ментор: \<имя\>»
- Кнопка «← К списку когорты» (для student)
- **Блок «Тренировочные завтраки»** (PvlTrainingSessionBlock)

#### PvlTrainingSessionBlock
- Заголовок «Тренировочные завтраки»
- Если страница моя (id == auth.uid()):
  - Если в БД < 2 сессий → кнопка «**Я провела тренировочный завтрак**»
  - Если >= 2 → кнопка скрыта, под ней подсказка: «Лимит 2 достигнут. Чтобы добавить ещё — обратитесь к админу.»
- Список карточек сессий (от свежей к старой):
  - Дата (формат «25 мая, 19:30») + тема сценария
  - Под каждой — встроенный `PvlTrainingFeedbackList`

#### Модалка «Я провела тренировочный завтрак» (компонент в `PvlTrainingSessionBlock`)
- Поле «Дата и время» (default: now, можно скорректировать)
- Поле «Тема сценария встречи» (свободный текст, required, min length 1)
- Кнопка «Сохранить»
- На submit: `createTrainingSession`
- Обработка ошибки 400 (лимит): показать toast «Лимит 2 достигнут, обратитесь к админу»

#### PvlTrainingFeedbackList (внутри карточки сессии)
- Заголовок «Отзывы (N)» — N = всего отзывов на сессию
- Логика по ролям:
  - **Я peer (не автор сессии, не ментор её, не admin)**: вижу только свой отзыв.
    - Если уже оставлял: блок «Мой отзыв» (collapsible) с моим текстом, кнопкой «Редактировать»
    - Если не оставлял: кнопка «**Оставить отзыв**»
  - **Я владелец сессии (menti)**: вижу ВСЕ отзывы развёрнуто, каждый с подписью «Имя Фамилия автора · дата»
  - **Я ментор владельца**: то же что владелец
  - **Я admin**: то же что владелец
- Подсказка над списком (collapsible, default свёрнуто): «**Правила обратной связи**» — 4 пункта из методички (безоценочно, конкретно, с опорой на сработавшее, без советов)
- Если автор отзыва — это сама владелица (`author_id == student_id`) — это invariant нарушен, фильтрануть в UI как edge case

#### PvlTrainingFeedbackForm (модалка)
4 поля по методичке:

1. **«Что в этой встрече сработало»**
   - Placeholder: «Два-три конкретных момента. Минимум 2 предложения»
   - Required, validation: length >= 50 символов
   - Textarea, min-height 100px
2. **«Что можно усилить»**
   - Placeholder: «Безоценочно и конкретно. Если ничего — можно оставить пустым»
   - Optional
3. **«Один приём ведущей, который вы заметили и запомнили»**
   - Placeholder: «Короткое — одно предложение или название приёма»
   - Optional
4. **«Вопрос, который у вас остался после встречи»**
   - Placeholder: «Опционально»
   - Optional

Под формой — подсказка о дедлайне: «*Методичный дедлайн — 48 часов после встречи. Платформа форму не закрывает, но лучше успеть пока в памяти.*» (мягкий nudge, не блокер)

Кнопки: «Отправить отзыв» (или «Сохранить изменения» при edit) / «Отмена»

На submit: `upsertTrainingFeedback`

#### Sidebar items в PVL

- **Студенческий sidebar** (StudentPage в PvlPrototypeApp): добавить пункт «Моя когорта» → `/student/cohort`
- **Менторский sidebar**: не добавляем (ментор заходит через карточку менти, у которой добавится блок тренировочных)
- **Админский sidebar**: не добавляем (admin заходит через `/admin/students/:id`)

### 4.6 Стиль

- **Без цветных карточек** — только typography + spacing
- Имя автора отзыва: bold + цвет акцента
- Дата: secondary text
- 4 поля отзыва: каждое с подзаголовком из методички (например, «Что сработало:») bold + сам текст обычный
- Использовать существующие токены design-system Garden (`#4A3728` accent, `#7A6758` secondary text, `#E8D5C4` border, `#FAF6F2` background — те же что в `MentorTaskHeaderCompact`)

---

## 5. Разбивка на сессии codeexec

### Сессия 1: Backend
- Скоп: миграция + recover_grants.sh + RLS-проверки
- Артефакт: `docs/_session/2026-05-2X_NN_codeexec_etap1_backend_training.md`
- Smoke: psql под gen_user + authenticated, проверка всех 4 ролей (peer/owner/mentor/admin)

### Сессия 2: Frontend backbone
- Скоп: 5 API-методов + маршруты + sidebar item + скелеты PvlMyCohortView + PvlPeerProfileView (без наполнения блоков)
- Артефакт: `docs/_session/2026-05-2X_NN_codeexec_etap1_frontend_backbone.md`
- Smoke: маршруты работают, API возвращает ожидаемое

### Сессия 3: Frontend блоки
- Скоп: 3 компонента (PvlTrainingSessionBlock + FeedbackList + FeedbackForm), интеграция в PvlMenteeCardView для ментора
- Артефакт: `docs/_session/2026-05-2X_NN_codeexec_etap1_frontend_blocks.md`
- Smoke: реальный flow «provela → peer оставил отзыв → ментор увидел»

### Сессия 4 (опционально): Smoke + правки
- Полный e2e smoke через Claude in Chrome или ручной
- Багфиксы по результатам

---

## 6. Smoke-сценарии (для финальной проверки)

Используя реальную когорту Поток 1 (по `_130_cohort1_audit` — 15 real менти, role='applicant'):

### Тестовые акторы
- **Menti A (владелец сессии)**: например, Светлана Колотилова (4 menti у Юли Габрух)
- **Ментор A**: Юлия Габрух (`lyulya777@inbox.ru`)
- **Menti B (peer-автор отзыва)**: другая menti Поток 1, например Ольга Разжигаева
- **Admin**: Ольга Скребейко (`olga@skrebeyko.com`)

### Сценарии

1. **Создание сессии menti**:
   - Menti A → /student/peer/me → «Я провела тренировочный завтрак» → дата+тема → сохранить
   - Проверить: сессия в БД, видна на странице

2. **Лимит 2**:
   - Создать вторую сессию → OK
   - Третью → должна выпасть ошибка (400 от триггера) → toast «Лимит достигнут»

3. **Peer оставляет отзыв**:
   - Menti B → /student/cohort → найти Menti A → клик → /student/peer/{A-id}
   - На сессии → «Оставить отзыв» → 4 поля → отправить
   - Проверить у Menti A: отзыв виден с именем Menti B

4. **Ментор видит отзывы**:
   - Mentor A → /mentor/mentee/{A-id} → блок «Тренировочные завтраки» → видит все отзывы

5. **Peer редактирует свой отзыв**:
   - Menti B → /student/peer/{A-id} → «Мой отзыв» → «Редактировать» → изменить → сохранить
   - Проверить: запись одна (UPSERT через UNIQUE), updated_at обновился

6. **Peer не видит чужие отзывы**:
   - Menti B → /student/peer/{A-id} → видит ТОЛЬКО свой отзыв, не других peer'ов
   - Через DevTools Network проверить: PostgREST возвращает только `author_id=auth.uid()` строки

7. **Admin видит всё**:
   - Admin (Ольга) → /admin/students/{A-id} → блок тренировочных → все отзывы видны

8. **Cross-cohort изоляция (когда Поток 2 запустится)**:
   - Menti из другой когорты не видит menti Поток 1 (через `is_pvl_cohort_peer`)
   - Пока Поток 2 не активен, smoke не делаем

---

## 7. Зависимости и ограничения

### Что нужно перед стартом
- ✅ Hotfix A+B (auto-refresh) задеплоен и протестирован — иначе новая страница может проявить тот же бах застывшего state
- ✅ Recon _129 + _130_cohort_audit — есть
- ✅ Продуктовые вопросы закрыты — 10/10

### Что не блокирует (но в backlog)
- `BUG-PVL-CACHE-PERSISTS-EMPTY-SNAPSHOT` (P2): новые таблицы используют свежий fetch, не cache — не блокирует
- `STATUS-HISTORY-DUP-REGRESSION`: новые таблицы независимы от status_history — не блокирует
- `TG-HTML-PARSE-STRIP`: для отзывов TG-нотификаций пока нет (отдельный тикет) — не блокирует
- `PVL-COHORT-ORPHAN-CLEANUP`: фильтр `role='applicant'` в хелпере уже решает проблему — не блокирует

### Тех. долг, который Этап 1 НЕ создаёт
- Никаких новых hardcoded'ов, всё через RLS/RPC
- Никаких изменений в существующих таблицах (только новые добавляются)
- `LeaderPageView` не трогаем

---

## 8. Готовность к запуску

**Готово**: ✅ всё. Можно стартовать Сессию 1 (Backend) после smoke hotfix A+B.

**Артефакты в garden/docs/_session/ для codeexec**:
- Это ТЗ: `2026-05-26_134_strategist_tz_etap1_training_feedback.md`
- Recon: `2026-05-25_129_codeexec_recon_pvl_student_page.md`
- Cohort audit: `2026-05-26_130_codeexec_recon_pvl_students_cohort1_audit.md`

При каждой сессии codeexec — ссылка на это ТЗ + scope сессии.
