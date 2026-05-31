# ТЗ Этапа 2 — Сертификационный завтрак (двойной assessment menti + ментор)

**От:** стратега (claude.ai) → codeexec через Ольгу
**Дата:** 2026-05-28
**Базовый recon:** [_142_recon_etap2_certification](2026-05-28_142_codeexec_recon_etap2_certification.md) + [_143_live_sql](2026-05-28_143_codeexec_recon_etap2_live_sql.md)
**Базовый ТЗ-предок (структура):** [_134_tz_etap1](2026-05-26_134_strategist_tz_etap1_training_feedback.md)
**Источник продуктовых требований:** существующий компонент `views/PvlSzAssessmentFlow.jsx` (визуальный flow + критерии в `data/pvlReferenceContent.js`) + ТЗ-_134 §1.2 «Сертификационный завтрак — Этап 2».

---

## 1. Контекст

### Что делаем

Подключаем сертификационный завтрак (СЗ) к реальной БД и встраиваем **двойной parallel-blind assessment** в `PvlPeerProfileView`:
- menti оценивает себя по 18 критериям + 6 рефлексий + критические условия
- её ментор оценивает её по тем же 18 критериям + свои 6 рефлексий + критические
- обе стороны заполняют **независимо**, не видят оценок друг друга
- после submit обеих → раскрывается экран сравнения с подсветкой расхождений ≥ 2 баллов

Существующий компонент `PvlSzAssessmentFlow.jsx` (5-шаговый wizard) переиспользуем с новым prop `mode: 'self' | 'mentor' | 'compare'`.

Существующий заглушечный экран `/student/certification` («Анкета временно недоступна») редиректим на `/student/peer/<self-id>` к новому блоку.

### Что НЕ в Этапе 2

- Архив ДЗ участницы (отложено в Этап 2.5 / Этап 3)
- Прогресс по курсу (Этап 3)
- Перевод критериев из JS-констант в БД (отдельная фича, оставляем `data/pvlReferenceContent.js` + поле `certification_version` на таблицах для версионирования)
- Audit-history таблица для revision-цикла (отдельный backlog тикет)
- TG-уведомления «menti submit'нула / ментор submit'нул» (отдельный тикет)
- BroadcastChannel/realtime между устройствами (отложено)
- Доступ для роли `intern` (только `applicant` в текущем потоке)

---

## 2. Продуктовые решения (зафиксированы 2026-05-28)

| # | Решение | Источник |
|---|---|---|
| 1 | **Parallel-blind**: до submit обеих сторон никто не видит чужих оценок | стратегия 2026-05-28 |
| 2 | После двух submit — compare раскрывается обеим (read-only) | стратегия |
| 3 | **Зеркальные 6 рефлексий** для menti и ментора (один концептуальный вопрос — два угла) | стратегия |
| 4 | Mentor-prompts — финальные формулировки от Ольги (в Сессии 3 frontend) | Ольга в работе |
| 5 | Источник истины «кто ментор для этой menti» — `pvl_garden_mentor_links` (не денормализованный `pvl_students.mentor_id`) | live SQL §3 |
| 6 | Доступ к Этапу 2 — через `has_platform_access` + cohort match (не через `profiles.role`) — у феи `role='applicant'`, должна пройти | live SQL §3, §5.3 |
| 7 | **Split на 2 таблицы** `_self` + `_mentor` (старые `pvl_student_certification_*` пусты → DROP бесплатный) | стратегия + live SQL §2 |
| 8 | Reflexion-тексты и critical-комментарии — **JSONB колонки** на обеих таблицах симметрично | стратегия |
| 9 | Status flow: `draft → submitted → revision (admin) → draft → submitted` | стратегия |
| 10 | `certification_version TEXT DEFAULT '2026-spring'` на обеих таблицах — версионирование критериев | стратегия |
| 11 | Mounting: блок `PvlCertificationBlock` в `PvlPeerProfileView` после `PvlTrainingSessionBlock`. Старые роуты `/student\|/mentor\|/admin/certification` — редиректы | стратегия |
| 12 | Validation на submit: все 18 критериев, все 6 рефлексий ≥ 50 символов, `critical_comment` обязателен если есть отмеченный critical | стратегия |
| 13 | Score_total считает frontend, БД проверяет `CHECK (0..54)` | методичка / стратегия |
| 14 | UNIQUE (student_id) на каждой таблице — одна активная assessment-запись на menti | стратегия |
| 15 | Admin (Ольга/Ирина/Настя) может вернуть одну сторону в `'revision'` — соответствующая сторона разлокируется для редактирования | стратегия |
| 16 | Autosave draft в БД при переходе между шагами wizard (5 шагов × 2 стороны = до 10 PATCH max за весь flow) | стратегия |

---

## 3. Backend

### 3.1 Миграция

Файл: `database/pvl/migrations/2026-05-2X_phase40_pvl_certification_split.sql`

```sql
-- ============================================================================
-- phase40: pvl_student_certification_self + pvl_student_certification_mentor
-- Двойной parallel-blind assessment СЗ: split старых таблиц на self + mentor
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- ПРЕДУСЛОВИЯ: проверить пустоту старых таблиц + обработать FK от disputes
-- ---------------------------------------------------------------------------

-- ASSERT: scores и criteria_scores пустые (recon §2 подтвердил)
DO $$
DECLARE n_scores int; n_criteria int; n_disputes int;
BEGIN
  SELECT count(*) INTO n_scores FROM pvl_student_certification_scores;
  SELECT count(*) INTO n_criteria FROM pvl_student_certification_criteria_scores;
  SELECT count(*) INTO n_disputes
    FROM pvl_student_disputes WHERE certification_score_id IS NOT NULL;
  IF n_scores > 0 OR n_criteria > 0 THEN
    RAISE EXCEPTION 'phase40 ABORT: certification tables not empty (scores=%, criteria=%). Manual data migration needed.',
      n_scores, n_criteria;
  END IF;
  IF n_disputes > 0 THEN
    RAISE EXCEPTION 'phase40 ABORT: pvl_student_disputes has % rows with certification_score_id. Resolve disputes data first.',
      n_disputes;
  END IF;
END $$;

-- Disputes FK на старую _scores — DROP CONSTRAINT и потом ALTER колонку
-- (в Этапе 2 disputes не используем; колонку оставляем, FK пересоздаём после)
ALTER TABLE pvl_student_disputes
  DROP CONSTRAINT IF EXISTS pvl_student_disputes_certification_score_id_fkey;

-- Старые таблицы DROP (cascade — на случай других зависимостей)
DROP TABLE IF EXISTS pvl_student_certification_criteria_scores CASCADE;
DROP TABLE IF EXISTS pvl_student_certification_scores CASCADE;

-- ---------------------------------------------------------------------------
-- Таблица pvl_student_certification_self
-- ---------------------------------------------------------------------------
CREATE TABLE pvl_student_certification_self (
  student_id uuid PRIMARY KEY REFERENCES pvl_students(id) ON DELETE CASCADE,
  cohort_id uuid REFERENCES pvl_cohorts(id),
  certification_version text NOT NULL DEFAULT '2026-spring',

  -- 18 критериев: { "A1": 2, "A2": 3, ..., "F3": 1 }
  -- Ключи — letter+index из SZ_ASSESSMENT_SECTIONS, значения 0..3
  criteria_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  score_total int NOT NULL DEFAULT 0
    CHECK (score_total >= 0 AND score_total <= 54),

  -- 6 рефлексий: { "prompt_1": "...", "prompt_2": "...", ..., "prompt_6": "..." }
  reflections jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Критические условия: ["critical_1", "critical_5", ...] — id из SZ_ASSESSMENT_CRITICAL
  critical_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  critical_comment text,

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'revision')),
  submitted_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pvl_student_certification_self_cohort
  ON pvl_student_certification_self(cohort_id);
CREATE INDEX idx_pvl_student_certification_self_status
  ON pvl_student_certification_self(status);

CREATE TRIGGER trg_pvl_student_certification_self_updated_at
  BEFORE UPDATE ON pvl_student_certification_self
  FOR EACH ROW EXECUTE FUNCTION pvl_set_updated_at();

-- ---------------------------------------------------------------------------
-- Таблица pvl_student_certification_mentor
-- ---------------------------------------------------------------------------
CREATE TABLE pvl_student_certification_mentor (
  student_id uuid PRIMARY KEY REFERENCES pvl_students(id) ON DELETE CASCADE,
  mentor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  cohort_id uuid REFERENCES pvl_cohorts(id),
  certification_version text NOT NULL DEFAULT '2026-spring',

  -- Симметрично self
  criteria_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  score_total int NOT NULL DEFAULT 0
    CHECK (score_total >= 0 AND score_total <= 54),
  reflections jsonb NOT NULL DEFAULT '{}'::jsonb,
  critical_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  critical_comment text,

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'revision')),
  submitted_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pvl_student_certification_mentor_mentor
  ON pvl_student_certification_mentor(mentor_id);
CREATE INDEX idx_pvl_student_certification_mentor_cohort
  ON pvl_student_certification_mentor(cohort_id);
CREATE INDEX idx_pvl_student_certification_mentor_status
  ON pvl_student_certification_mentor(status);

CREATE TRIGGER trg_pvl_student_certification_mentor_updated_at
  BEFORE UPDATE ON pvl_student_certification_mentor
  FOR EACH ROW EXECUTE FUNCTION pvl_set_updated_at();

-- Auto-fill mentor_id из auth.uid() (так клиент его не передаёт и не может подменить)
CREATE OR REPLACE FUNCTION pvl_set_certification_mentor_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  -- На INSERT всегда auth.uid(); на UPDATE — не даём переопределять
  IF TG_OP = 'INSERT' THEN
    NEW.mentor_id := auth.uid();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.mentor_id := OLD.mentor_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pvl_student_certification_mentor_set_mentor_id
  BEFORE INSERT OR UPDATE ON pvl_student_certification_mentor
  FOR EACH ROW EXECUTE FUNCTION pvl_set_certification_mentor_id();

-- ---------------------------------------------------------------------------
-- RLS: pvl_student_certification_self
-- ---------------------------------------------------------------------------
ALTER TABLE pvl_student_certification_self ENABLE ROW LEVEL SECURITY;

-- RESTRICTIVE access guards (шаблон C)
CREATE POLICY pvl_student_certification_self_active_access_guard_select
  ON pvl_student_certification_self AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (has_platform_access(auth.uid()));

CREATE POLICY pvl_student_certification_self_active_access_guard_write
  ON pvl_student_certification_self AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (has_platform_access(auth.uid()))
  WITH CHECK (has_platform_access(auth.uid()));

-- PERMISSIVE SELECT: parallel-blind
--   menti видит свою self всегда
--   ментор видит self своей menti — ТОЛЬКО если она submitted
--   admin видит всё
-- ⚠️ ВАЖНО (lesson из Сессии 1 dryrun): НЕ добавлять cross-EXISTS
-- на pvl_student_certification_mentor — это создаёт цикл RLS-policies
-- между _self и _mentor (Postgres detects "infinite recursion in policy").
-- Простой status='submitted' чек уже даёт корректный parallel-blind:
-- compare раскрывается автоматически когда обе стороны submitted.
CREATE POLICY pvl_student_certification_self_select_blind
  ON pvl_student_certification_self FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR is_admin()
    OR (is_mentor_for(student_id) AND status = 'submitted')
  );

-- PERMISSIVE INSERT: только сама menti, status='draft'
CREATE POLICY pvl_student_certification_self_insert_own
  ON pvl_student_certification_self FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND status = 'draft'
  );

-- PERMISSIVE UPDATE для menti: только если status != 'submitted'
CREATE POLICY pvl_student_certification_self_update_own
  ON pvl_student_certification_self FOR UPDATE TO authenticated
  USING (
    student_id = auth.uid()
    AND status IN ('draft', 'revision')
  )
  WITH CHECK (
    student_id = auth.uid()
    AND status IN ('draft', 'submitted')
  );

-- PERMISSIVE UPDATE для admin (revision-разлок и любые правки)
CREATE POLICY pvl_student_certification_self_update_admin
  ON pvl_student_certification_self FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- PERMISSIVE DELETE: только admin
CREATE POLICY pvl_student_certification_self_delete_admin
  ON pvl_student_certification_self FOR DELETE TO authenticated
  USING (is_admin());

-- ---------------------------------------------------------------------------
-- RLS: pvl_student_certification_mentor — симметрично self
-- ---------------------------------------------------------------------------
ALTER TABLE pvl_student_certification_mentor ENABLE ROW LEVEL SECURITY;

CREATE POLICY pvl_student_certification_mentor_active_access_guard_select
  ON pvl_student_certification_mentor AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (has_platform_access(auth.uid()));

CREATE POLICY pvl_student_certification_mentor_active_access_guard_write
  ON pvl_student_certification_mentor AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (has_platform_access(auth.uid()))
  WITH CHECK (has_platform_access(auth.uid()));

-- PERMISSIVE SELECT: parallel-blind симметрично
--   ментор видит свою mentor-запись всегда
--   menti видит mentor-запись о себе — ТОЛЬКО если она submitted
--   admin видит всё
-- ⚠️ См. lesson в _self policy выше — cross-EXISTS на _self запрещён.
CREATE POLICY pvl_student_certification_mentor_select_blind
  ON pvl_student_certification_mentor FOR SELECT TO authenticated
  USING (
    mentor_id = auth.uid()
    OR is_admin()
    OR (student_id = auth.uid() AND status = 'submitted')
  );

-- PERMISSIVE INSERT: только активный ментор этой menti, status='draft'
-- mentor_id автоматически = auth.uid() через trigger pvl_set_certification_mentor_id
CREATE POLICY pvl_student_certification_mentor_insert_mentor
  ON pvl_student_certification_mentor FOR INSERT TO authenticated
  WITH CHECK (
    is_mentor_for(student_id)
    AND status = 'draft'
  );

-- PERMISSIVE UPDATE для ментора: только если status != 'submitted'
CREATE POLICY pvl_student_certification_mentor_update_mentor
  ON pvl_student_certification_mentor FOR UPDATE TO authenticated
  USING (
    mentor_id = auth.uid()
    AND is_mentor_for(student_id)
    AND status IN ('draft', 'revision')
  )
  WITH CHECK (
    mentor_id = auth.uid()
    AND status IN ('draft', 'submitted')
  );

CREATE POLICY pvl_student_certification_mentor_update_admin
  ON pvl_student_certification_mentor FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY pvl_student_certification_mentor_delete_admin
  ON pvl_student_certification_mentor FOR DELETE TO authenticated
  USING (is_admin());

-- ---------------------------------------------------------------------------
-- GRANTs (защита от Timeweb daily wipe — см. project-garden-daily-wipe memory)
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON pvl_student_certification_self TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pvl_student_certification_mentor TO authenticated;

SELECT public.ensure_garden_grants();

COMMIT;
```

### 3.2 recover_grants.sh — НЕ требует правки (обновлено после Сессии 1 dryrun)

На VPS Bittern `/opt/garden-monitor/recover_grants.sh` — это **bash-wrapper над DB-proc'ом `ensure_garden_grants()`**, raw GRANT-statements в нём нет. Все GRANT'ы живут внутри proc'а, который мы обновляем в самой миграции phase40 (Section 7 — `CREATE OR REPLACE ensure_garden_grants()` со swap старых 2 таблиц на новые 2).

**После apply миграции** — выполнить руками для verification:

```sh
ssh root@5.129.251.56 /opt/garden-monitor/recover_grants.sh
```

Ожидаемый результат: `AUTH_CNT=166 AND ANON_CNT=4` (net таблиц = 41, dropped 2 + created 2 = swap, count неизменен).

**Расширение §3.1 (тоже из Сессии 1 dryrun):** миграция phase40 включает `CREATE OR REPLACE ensure_garden_grants()` в Section 7 (паттерн phase38). Без этого финальный `SELECT public.ensure_garden_grants();` упал бы на GRANT'е дропнутой таблицы. Single-apply atomic — миграцию применяем одной транзакцией.

### 3.3 Тесты RLS (psql)

Под `gen_user`, имитация ролей через `SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claims" = '{"sub":"<uuid>"}'`:

1. **Менти (фея, uuid=1085e06d…) пишет self**: INSERT в `_self` с status='draft' — OK. UPDATE с status='draft'→'submitted' — OK. Повторный UPDATE — fail (status != submitted).
2. **Менти пытается писать в `_mentor`**: INSERT — fail (не is_mentor_for self). UPDATE чужой row — fail.
3. **Ментор (фиксик, uuid=1b10d2ef…) пишет mentor**: INSERT в `_mentor` для феи — OK, mentor_id = auth.uid() автоматически. UPDATE — OK пока status='draft'.
4. **Ментор пытается писать в `_self` феи**: INSERT — fail (student_id != auth.uid()). UPDATE — fail.
5. **Parallel-blind SELECT** (главный тест):
   - До submit обеих: ментор SELECT self феи → 0 rows. Менти SELECT mentor — 0 rows.
   - После submit одной (например self): ментор SELECT self → 1 row (status='submitted'). Менти SELECT mentor — 0 rows (mentor ещё draft).
   - После submit обеих: обе видят обе записи.
6. **Admin (Ольга) видит всё** — обе таблицы, любой student_id, в любом статусе.
7. **Admin переводит self в revision**: UPDATE status='submitted'→'revision' под admin — OK. После этого менти UPDATE снова разрешён.
8. **`web_anon` пытается SELECT** обе таблицы → 401/403 (default deny через RESTRICTIVE guard).

---

## 4. Frontend

### 4.1 Новые файлы

| Файл | Что | LOC (~) |
|------|-----|---------|
| `components/PvlCertificationBlock.jsx` | Блок-обёртка над `PvlSzAssessmentFlow`. Switch по (viewerRole, viewerId, peerId, self.status, mentor.status). Decides: `mode=self\|mentor\|compare\|waiting` | 180 |
| `components/PvlCertificationCompareView.jsx` | Read-only сравнение: две колонки (self / mentor), подсветка расхождений ≥ 2 баллов, рефлексии бок-о-бок | 200 |
| `components/PvlCertificationAdminPanel.jsx` | Маленькая admin-only панель в compare-режиме: «Вернуть self на пересдачу» / «Вернуть mentor на пересдачу» (revision) | 80 |

### 4.2 Правки существующих файлов

| Файл | Что |
|------|-----|
| `views/PvlSzAssessmentFlow.jsx` | + prop `mode: 'self'\|'mentor'`, + prop `peerId` (для mentor mode), + autosave PATCH между шагами, persistence слой переключить с mock на real API, заголовки/копирайтинг зависят от mode. Compare режим вынесен в `PvlCertificationCompareView` |
| `views/PvlPeerProfileView.jsx` | Добавить `<PvlCertificationBlock />` после `<PvlTrainingSessionBlock />` |
| `data/pvlReferenceContent.js` | + `SZ_REFLECTION_PROMPTS_MENTOR` (6 шт, формулировки от Ольги, ставим plaintext-заглушки до получения), + добавить `id` поле в каждый объект `SZ_ASSESSMENT_CRITICAL` (для критических флагов в JSONB) |
| `services/pvlPostgrestApi.js` | + 8 методов (см. §4.4) ~150 LOC |
| `views/PvlPrototypeApp.jsx` | Заглушку `/student/certification` → редирект на `/student/peer/<self-id>#pvl-certification`. Аналогично `/mentor/certification` → `/mentor`, `/admin/certification` → `/admin` |
| `services/pvlGardenNav.js` | Сертификацию из sidebar НЕ убираем (как удобный shortcut). Пункт остаётся, ссылается на тот же роут (редиректится) |
| `services/pvlMockApi.js` | Mock методы `getStudentCertification` / `commitSzSelfAssessment` оставить для local-dev (флаг `USE_MOCK_API`), но на проде использовать real API |

### 4.3 Маршруты

| Route | Компонент | Поведение |
|-------|-----------|-----------|
| `/student/peer/:id` (расширение) | `PvlPeerProfileView` + `PvlCertificationBlock` | Этап 2 встаёт следующим блоком |
| `/mentor/peer/:id` (расширение) | `PvlPeerProfileView` + `PvlCertificationBlock` | То же, viewerRole=mentor |
| `/admin/peer/:id` (расширение) | `PvlPeerProfileView` + `PvlCertificationBlock` | То же, viewerRole=admin |
| `/student/certification` | Redirect → `/student/peer/<self-id>#pvl-certification` | Сохраняем sidebar shortcut |
| `/student/self-assessment` (алиас) | Аналогично | |
| `/mentor/certification` | Redirect → `/mentor` (главная mentor view) | |
| `/admin/certification` | Redirect → `/admin` | |

### 4.4 API методы (services/pvlPostgrestApi.js)

```js
// SELF
getCertificationSelf(studentId)
  → GET /pvl_student_certification_self?student_id=eq.{id}&select=*
  → returns single row or null (RLS вернёт 0 если parallel-blind закрыл)

upsertCertificationSelfDraft({ student_id, criteria_scores, score_total,
                                reflections, critical_flags, critical_comment })
  → POST /pvl_student_certification_self с Prefer: resolution=merge-duplicates
  → on conflict (student_id) update; status остаётся 'draft' если уже draft

submitCertificationSelf(studentId)
  → PATCH /pvl_student_certification_self?student_id=eq.{id}
  → body: { status: 'submitted', submitted_at: now() }

// MENTOR
getCertificationMentor(studentId)
  → GET /pvl_student_certification_mentor?student_id=eq.{id}&select=*
  → returns single row or null

upsertCertificationMentorDraft({ student_id, criteria_scores, score_total,
                                  reflections, critical_flags, critical_comment })
  → POST /pvl_student_certification_mentor с Prefer: resolution=merge-duplicates
  → mentor_id заполняется trigger'ом, не передаём с клиента

submitCertificationMentor(studentId)
  → PATCH /pvl_student_certification_mentor?student_id=eq.{id}
  → body: { status: 'submitted', submitted_at: now() }

// ADMIN
adminRequestRevision(studentId, side /* 'self' | 'mentor' */)
  → PATCH /pvl_student_certification_{side}?student_id=eq.{id}
  → body: { status: 'revision' }

// COMPARE (комбинированный)
getCertificationCompare(studentId)
  → Promise.all([getCertificationSelf(studentId), getCertificationMentor(studentId)])
  → returns { self, mentor }
```

### 4.5 UI поведение

#### `PvlCertificationBlock` — главный switcher

```
props: { studentId, viewerRole, viewerId, isMentorOfStudent }
state: { self, mentor, loading }

useEffect: при mount/studentId-change → getCertificationCompare(studentId)

render switch:
  isSelf = viewerId === studentId
  isMentor = viewerRole === 'mentor' && isMentorOfStudent
  isAdmin = viewerRole === 'admin'

  if (loading) → <Skeleton />

  // SELF VIEW
  if (isSelf) {
    if (self.status !== 'submitted') →
      <PvlSzAssessmentFlow mode="self" studentId={studentId} ... />
    else if (mentor.status === 'submitted') →
      <PvlCertificationCompareView self={self} mentor={mentor} />
    else →
      <Card>Самооценка отправлена. Ждём оценку ментора — после её submit
             откроется сравнение.</Card>
  }

  // MENTOR VIEW
  if (isMentor) {
    if (mentor === null || mentor.status !== 'submitted') →
      <PvlSzAssessmentFlow mode="mentor" studentId={studentId}
                            peerId={studentId} ... />
    else if (self.status === 'submitted') →
      <PvlCertificationCompareView self={self} mentor={mentor} />
    else →
      <Card>Ваша оценка отправлена. Ждём самооценку менти — после её submit
             откроется сравнение.</Card>
  }

  // ADMIN VIEW
  if (isAdmin) →
    <PvlCertificationCompareView self={self} mentor={mentor}
                                  showAdminPanel={true}
                                  showDraftsExplicitly={true} />
}
```

#### `PvlSzAssessmentFlow` в режиме `mode='self'`

Текущий 5-шаговый wizard как есть (intro / reflections / 18 criteria / critical / итог), но:
- Заголовок «**Моя самооценка сертификационного завтрака**»
- Step transition (любой next): autosave → `upsertCertificationSelfDraft`
- Финальный «Отправить» (step 4): `submitCertificationSelf` + onCommitted callback (родительский блок refetch'ает)
- localStorage draft остаётся как защита от network fail
- После submit: компонент unmount, родитель показывает либо compare либо waiting

#### `PvlSzAssessmentFlow` в режиме `mode='mentor'`

Тот же wizard, но:
- Заголовок «**Моя оценка ведущей: {peerName}**»
- Step «Рефлексия» использует `SZ_REFLECTION_PROMPTS_MENTOR` (6 зеркальных вопросов от Ольги)
- Step «18 критериев» — те же критерии, но формулировки переведены в 3-е лицо («Участницы получили понятную информацию» → читается как «Получила ли её аудитория...») — на frontend это просто другой заголовок «Оцените её работу по критерию», сам текст критерия не меняется
- Autosave → `upsertCertificationMentorDraft`
- Submit → `submitCertificationMentor`

#### `PvlCertificationCompareView`

Layout: две колонки (mobile — табы или аккордеоны).

Шапка:
- Имя menti + статус «Сертификация открыта для разговора»
- Итоги: «Я: X / 54» / «Ментор: Y / 54» (или «Менти / Ментор» для ментора и admin)
- Уровень (базовый/рабочий/сильный) — рассчитывается по `score_total`

Тело: для каждой из 6 секций A-F — раскрывающийся блок:
- 3 строки критериев секции
- Каждая строка: критерий-текст + балл self + балл mentor + |diff| подсветка если ≥ 2
- Под секцией: рефлексии (если 6 prompts) — пара текстов рядом (мой / ментора)

Критические условия:
- Если хоть с одной стороны отмечены — отдельный блок «Критические замечания»
- Список флагов с обеих сторон + комментарии

Admin-panel (если `showAdminPanel`):
- 2 кнопки: «Вернуть самооценку на пересдачу» / «Вернуть оценку ментора на пересдачу»
- При клике — confirm + `adminRequestRevision(studentId, side)`

#### Validations на frontend (перед submit)

| Поле | Правило |
|---|---|
| criteria_scores | Все 18 ключей присутствуют, значения 1..3 (не 0) |
| reflections | Все 6 ключей присутствуют, каждый текст ≥ 50 символов |
| critical_comment | Обязателен если `critical_flags.length > 0`, ≥ 30 символов |
| score_total | Сумма criteria_scores values, 0..54 |

При невалидности — кнопка «Отправить» неактивна + toast «Заполните все поля перед отправкой».

### 4.6 Стиль

- Использовать существующие токены design-system Garden (те же что в `PvlTrainingSessionBlock`)
- Compare-вью: разница ≥ 2 — мягкая подсветка `#F7E3C9` фоном строки (предупреждающий тёплый, не красный)
- Шкала 1-2-3 — те же кнопки что в текущем `PvlSzAssessmentFlow`
- Wizard-шаги — те же индикаторы прогресса
- Critical-блок — `#E8D5C4` бордер, шрифт `MentorTaskHeaderCompact`-стиль

---

## 5. Разбивка на сессии codeexec

### Сессия 1: Backend (миграция phase40 + RLS + grants)

- Скоп:
  - DRYRUN миграции phase40 на проде под gen_user (BEGIN / ROLLBACK)
  - Полный RLS-тест-план (§3.3) под имитацией ролей
  - Подтверждение что disputes-таблица не имеет certification_score_id rows
  - Запись `recover_grants.sh` updates на VPS
- Apply на прод только после 🟢 от стратега по dryrun-отчёту
- Артефакт: `docs/_session/2026-05-2X_NN_codeexec_etap2_backend_dryrun.md` + `_applied.md`
- Smoke: psql тест-план §3.3 целиком

### Сессия 2: Frontend API + редиректы

- Скоп:
  - +8 методов в `services/pvlPostgrestApi.js`
  - Редиректы `/student\|/mentor\|/admin/certification` → новые места
  - Правки `SZ_ASSESSMENT_CRITICAL` (добавить `id` поле в каждый объект)
  - `SZ_REFLECTION_PROMPTS_MENTOR` placeholder-массив (6 plain-text заглушек)
- Артефакт: `docs/_session/2026-05-2X_NN_codeexec_etap2_frontend_api.md`
- Smoke: curl/DevTools — все 8 методов отвечают ожидаемо под тестовой парой

### Сессия 3: Frontend компоненты (Block + Wizard mode)

- Скоп:
  - `PvlCertificationBlock` (главный switcher)
  - Правка `PvlSzAssessmentFlow` — prop `mode`, autosave, real API
  - Mount в `PvlPeerProfileView`
  - Финальные `SZ_REFLECTION_PROMPTS_MENTOR` от Ольги (к этому моменту получены)
- Артефакт: `docs/_session/2026-05-2X_NN_codeexec_etap2_frontend_block_wizard.md`
- Smoke: реальный flow от логина феи — self draft → submit → waiting; логин фиксика — mentor draft → submit → compare

### Сессия 4: Compare-view + admin-панель

- Скоп:
  - `PvlCertificationCompareView` (двухколоночное сравнение + критические)
  - `PvlCertificationAdminPanel` (revision-кнопки)
  - Интеграция в `PvlCertificationBlock`
- Артефакт: `docs/_session/2026-05-2X_NN_codeexec_etap2_compare.md`
- Smoke: после submit обеих — compare виден обеим, admin (Ольга) — видит admin-panel; revision-кнопка работает (разлок одной стороны)

### Сессия 5 (опционально): Полный e2e + правки

- Полный smoke через Claude in Chrome (логин фея → submit self → логин фиксик → submit mentor → compare обеим + admin revision)
- Багфиксы и UX-полировка

---

## 6. Smoke-сценарии (для финальной проверки)

Используя готовую тестовую пару:
- **Menti**: Настина фея (`viktorovna7286@gmail.com`, id=`1085e06d-34ad-4e7e-b337-56a0c19cc43f`)
- **Mentor**: Настин фиксик (`zobyshka@gmail.com`, id=`1b10d2ef-8504-4778-9b7b-5b04b24f8751`)
- **Admin**: Ольга Скребейко (`olga@skrebeyko.com`)
- **Cohort**: Поток 1 ПВЛ 2026 весна (`11111111-1111-1111-1111-111111111101`)
- **Связь**: уже зафиксирована в `pvl_garden_mentor_links` от 2026-04-18

### Сценарии

1. **Менти видит self wizard**:
   - Логин фея → `/student/peer/1085e06d…` → блок «Сертификация» → видит intro step 0
2. **Menti заполняет и autosave**:
   - Прогресс по шагам → между шагами в DevTools Network видны PATCH на `_self`
   - На странице refresh → состояние draft сохранилось (из БД, не только localStorage)
3. **Menti submit'нула, ждёт ментора**:
   - На step 4 «Отправить» → PATCH status='submitted'
   - Re-render блока → видит «Самооценка отправлена, ждём ментора»
   - Логин фиксиком → переход `/mentor/peer/1085e06d…` → видит mentor wizard (НЕ видит self menti — parallel-blind работает)
4. **Mentor заполняет blind**:
   - Фиксик проходит wizard от своего лица → autosave работает
   - Через DevTools проверить: GET self → 0 rows под фиксиком (пока сам mentor не submitted) ✅ blind
5. **Mentor submit → compare раскрывается обеим**:
   - Фиксик submit → re-render: видит compare-view
   - Логин фея → re-render: видит compare-view
6. **Admin видит всё в любой момент**:
   - Логин Ольга → `/admin/peer/1085e06d…` → видит compare даже когда обе стороны draft (`showDraftsExplicitly`)
7. **Admin revision-разлок**:
   - Ольга → admin-panel → «Вернуть самооценку на пересдачу»
   - Confirm → PATCH status='revision'
   - Логин фея → видит wizard снова разлоченным (status='revision' допускает UPDATE менти)
   - Заполнила → submit → compare обновлён
8. **Negative: cross-violation**:
   - Под феей через DevTools попробовать `POST /pvl_student_certification_mentor` для себя — должно 403
   - Под фиксиком попробовать `PATCH /pvl_student_certification_self` феи — должно 403
   - Под другим mentor'ом (например Юля Габрух) попробовать SELECT mentor феи (она не её menti) — должно 0 rows

---

## 7. Зависимости и ограничения

### Что нужно перед стартом

- ✅ Live SQL (recon _143) подтвердил: helper-функции на месте, RLS-pattern из phase38 работает, тестовая пара готова
- ✅ Продуктовые решения 1-16 закрыты
- ⚠️ `BUG-PVL-AUTOREFRESH-BREAKS-MENTOR-INPUT` (P1, hotfix откачен 27-05) — может проявиться в wizard'е ментора. **До Сессии 3 (frontend wizard)** нужно либо починить bug, либо убедиться что autorefresh не трогает focus в textarea (отдельный pre-flight check)
- ⚠️ Формулировки `SZ_REFLECTION_PROMPTS_MENTOR` от Ольги — нужны к началу Сессии 3 (Ольга в работе)

### Что не блокирует (но в backlog)

- `BUG-PVL-CACHE-PERSISTS-EMPTY-SNAPSHOT` (P1): для новых таблиц fresh fetch, не cache — не блокирует
- `UX-PVL-SIDEBAR-DESKTOP-CONSISTENCY` (P2): редиректы маршрутов не зависят от sidebar items
- `TG-HTML-PARSE-STRIP` (P1): TG-нотификации сертификации не в скоупе Этапа 2
- `STATUS-HISTORY-DUP-REGRESSION` (P1): новые таблицы независимы

### Тех. долг

- ⚠️ Schema `pvl_student_disputes.certification_score_id` остаётся колонкой без FK (после миграции). Если в будущем disputes будут переподключены — нужна отдельная фича «Disputes v2» с FK на новую таблицу (split self/mentor — какую из двух).
- ⚠️ `pvl_students.mentor_id` денормализованная колонка остаётся NULL у феи и расходится с `pvl_garden_mentor_links`. Этап 2 опирается на links — но cleanup денорм. колонки или её backfill — отдельный тикет (`TECH-DEBT-PVL-MENTOR-ID-DENORM`).
- Критерии в JS-константах остаются. При запуске Потока 2 — отдельная фича «Critеria CMS».

---

## 8. Готовность к запуску

**Готово**: ✅ всё для Сессии 1. После 🟢 от Ольги — старт DRYRUN миграции phase40.

**Артефакты в garden/docs/_session/ для codeexec**:
- Это ТЗ: `2026-05-28_144_strategist_tz_etap2_certification.md`
- Recon DDL/код: `2026-05-28_142_codeexec_recon_etap2_certification.md`
- Live SQL: `2026-05-28_143_codeexec_recon_etap2_live_sql.md`

При каждой сессии codeexec — ссылка на это ТЗ + scope сессии.
