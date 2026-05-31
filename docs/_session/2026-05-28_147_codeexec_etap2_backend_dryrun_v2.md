# Сессия 1 Этапа 2 — backend dryrun v2 (Вариант А)

**От:** codeexec → стратегу через Ольгу
**Дата:** 2026-05-28
**Тип:** повторный dryrun на проде под `gen_user` (BEGIN ... ROLLBACK)
**Базируется на:** [_145](2026-05-28_145_codeexec_etap2_backend_dryrun.md) (первый dryrun + диагностика recursion) + 🟢 стратега по §9 _145
**ТЗ:** [_144](2026-05-28_144_strategist_tz_etap2_certification.md) (обновлён 2026-05-28: §3.1 SELECT-policies упрощены, §3.2 переписан про bash-wrapper)

---

## 0. TL;DR

✅ **Все 8 RLS-сценариев §3.3 PASS.** Миграция готова к apply.

Изменения относительно версии из _145:
- Section 5 (`_self.select_blind`): cross-EXISTS дроп, остался простой `is_mentor_for(student_id) AND status = 'submitted'`
- Section 6 (`_mentor.select_blind`): cross-EXISTS дроп, остался простой `student_id = auth.uid() AND status = 'submitted'`
- Header миграции: обновлён про §3.2 (не правим recover_grants.sh, только verify руками)
- Остальные секции (DDL, INSERT/UPDATE/DELETE-policies, trigger pvl_set_certification_mentor_id, ensure_garden_grants swap) — без изменений, уже были корректны в _145.

Прод не задет: dryrun завершился `ROLLBACK`, post-rollback-проверка показала старые таблицы на месте, новые отсутствуют.

Файл миграции `git add`-нут (staged), **не committed** — commit будет после apply на прод, отдельным 🟢.

---

## 1. Sanity check — что изменилось vs _145

```
$ grep -cE 'EXISTS \(SELECT 1 FROM pvl_student_certification_' /tmp/phase40_body.sql
0
```

Cross-EXISTS клауз в теле миграции **нет**. Все упоминания EXISTS-токена в файле — либо в `DROP CONSTRAINT IF EXISTS` / `DROP TABLE IF EXISTS`, либо в LESSON-комментариях («НЕ возвращать»).

Visual diff sections 5/6 — две блок-секции:

```sql
-- BEFORE (_145, рекурсировало):
USING (
  ...
  OR (
    is_mentor_for(student_id)
    AND (
      status = 'submitted'
      OR EXISTS (SELECT 1 FROM pvl_student_certification_mentor m
                 WHERE m.student_id = pvl_student_certification_self.student_id
                   AND m.status = 'submitted')
    )
  )
);

-- AFTER (_147, Вариант А):
USING (
  ...
  OR (
    is_mentor_for(student_id)
    AND status = 'submitted'
  )
);
```

Симметрично для `_mentor`.

---

## 2. Dryrun v2 — результаты

Pre-flight (A.1-A.5) и Verify (B.1-B.5) — без отличий от _145 §2/§3. Те же значения:
- Старые scores/criteria_scores пусты, disputes без cert-ref'ов.
- Helper-функции на месте (`is_admin`, `is_mentor_for`, `has_platform_access`, `is_pvl_cohort_peer`) — все SECURITY DEFINER.
- Тест-пара жива, mentor-link fixik→fea присутствует с 2026-04-18.
- DDL отрабатывает чисто (DROP×2 + CREATE TABLE×2 + 5 индексов + 3 триггера + 14 policies + ensure_garden_grants swap + NOTIFY pgrst).
- V2: 7 policies на каждой таблице, RLS enabled.
- V4 authenticated grants count = 166 (net unchanged).
- V5: proc body упоминает `_self` + `_mentor`, не упоминает старые `_scores`/`_criteria_scores`.

### Compact таблица 8 RLS-тестов §3.3

| # | Сценарий | Ожидание | Факт | Статус |
|---|---|---|---|---|
| **1a** | fea `INSERT _self draft` | `INSERT 0 1` | `INSERT 0 1` | ✅ PASS |
| **1b** | fea `UPDATE _self draft→submitted` | `UPDATE 1` | `UPDATE 1` | ✅ PASS |
| **1c** | fea `UPDATE _self submitted→draft` (USING блочит) | `UPDATE 0` | `UPDATE 0` | ✅ PASS |
| **2a** | fea `INSERT _mentor` для себя | ERROR 42501 | `ERROR: new row violates row-level security policy` | ✅ PASS |
| **2b** | fixik precreate _mentor, fea `UPDATE` | `UPDATE 0` (RLS hide) | `UPDATE 0` | ✅ PASS |
| **3a** | fixik `INSERT _mentor` для fea | `INSERT 0 1`, mentor_id=fixik | `INSERT 0 1`, mentor_id=`1b10d2ef-…-751` (fixik) ✅ trigger fired | ✅ PASS |
| **3b** | fixik `UPDATE _mentor draft→submitted` | `UPDATE 1` | `UPDATE 1` | ✅ PASS |
| **3c** | fixik `UPDATE _mentor submitted→draft` | `UPDATE 0` | `UPDATE 0` | ✅ PASS |
| **4a** | fixik `INSERT _self` для fea | ERROR 42501 | `ERROR: new row violates row-level security policy` | ✅ PASS |
| **4b** | fea precreate _self, fixik `UPDATE` | `UPDATE 0` (RLS hide) | `UPDATE 0` | ✅ PASS |
| **5.1** | fixik `SELECT _self` fea (both draft) | 0 rows | `0` | ✅ PASS |
| **5.2** | fea `SELECT _mentor` (both draft) | 0 rows | `0` | ✅ PASS |
| **5.3** | fea submit self | UPDATE 1 | `UPDATE 1` | ✅ PASS |
| **5.4** | fixik `SELECT _self` (self submitted, mentor draft) | 1 row | `1` | ✅ PASS |
| **5.5** | fea `SELECT _mentor` (self submitted, mentor draft) | 0 rows (§3.3 канон) | `0` | ✅ PASS — **parallel-blind держится** |
| **5.6** | fixik submit mentor | UPDATE 1 | `UPDATE 1` | ✅ PASS |
| **5.7a** | fixik `SELECT _self` (both submitted) | 1 row | `1` | ✅ PASS |
| **5.7b** | fixik `SELECT _mentor` (both submitted) | 1 row | `1` | ✅ PASS |
| **5.7c** | fea `SELECT _self` (both submitted) | 1 row | `1` | ✅ PASS |
| **5.7d** | fea `SELECT _mentor` (both submitted) | 1 row | `1` | ✅ PASS — compare откроется обеим |
| **6.1** | olga `SELECT _self` (all draft) | ≥ 1 | `1` | ✅ PASS |
| **6.2** | olga `SELECT _mentor` (all draft) | ≥ 1 | `1` | ✅ PASS |
| **7.1** | fea `UPDATE _self submitted` (попытка) | `UPDATE 0` | `UPDATE 0` | ✅ PASS |
| **7.2** | olga `UPDATE _self submitted→revision` | `UPDATE 1` | `UPDATE 1` | ✅ PASS |
| **7.3** | fea `UPDATE _self revision→submitted, score=10` | `UPDATE 1` | `UPDATE 1` | ✅ PASS |
| **7.4** | финальное состояние | status=submitted, score=10 | `submitted` / `10` | ✅ PASS |
| **8.1** | web_anon `SELECT _self` | permission denied | `ERROR: permission denied for table pvl_student_certification_self` | ✅ PASS |
| **8.2** | web_anon `SELECT _mentor` | permission denied | `ERROR: permission denied for table pvl_student_certification_mentor` | ✅ PASS |

**Сводно:** 28/28 ассертов прошло. Никакого `infinite recursion`. Post-rollback: старые таблицы `pvl_student_certification_{criteria_scores,scores}` живут, новые `_self`/`_mentor` отсутствуют — прод чист.

### Ключевой блок parallel-blind (Test 5) — вырезка из лога

```
==================== TEST 5: parallel-blind (HEADLINE) ====================
-- 5.setup: fea→self draft, fixik→mentor draft
INSERT 0 1
INSERT 0 1
-- 5.1: mentor SELECT fea self (both draft) -- TZ expects 0
 mentor_sees_self_BOTH_DRAFT |    0
-- 5.2: menti SELECT _mentor row (both draft) — TZ ожидает 0
 menti_sees_mentor_BOTH_DRAFT |    0
-- 5.3: menti submits self
UPDATE 1
-- 5.4: mentor SELECT _self (self submitted, mentor draft) -- TZ expects 1
 mentor_sees_self_AFTER_SELF_SUBMIT |    1
-- 5.5: menti SELECT _mentor (self submitted, mentor draft) -- TZ expects 0
 menti_sees_mentor_AFTER_ONLY_SELF_SUBMIT |    0
-- 5.6: mentor submits
UPDATE 1
-- 5.7: обе стороны видят обе
 mentor_sees_self_AFTER_BOTH |    1
 mentor_sees_mentor_AFTER_BOTH |    1
 menti_sees_self_AFTER_BOTH |    1
 menti_sees_mentor_AFTER_BOTH |    1
ROLLBACK
```

---

## 3. Финальный текст миграции (для последнего review)

Файл: [database/pvl/migrations/2026-05-28_phase40_pvl_certification_split.sql](../../database/pvl/migrations/2026-05-28_phase40_pvl_certification_split.sql) (416 строк).

```sql
-- database/pvl/migrations/2026-05-28_phase40_pvl_certification_split.sql
--
-- phase40 — split старой pvl_student_certification_scores/_criteria_scores
-- на две таблицы pvl_student_certification_self + pvl_student_certification_mentor
-- для двойного parallel-blind assessment Сертификационного завтрака (Этап 2).
--
-- Базируется на ТЗ _144 §3.1 (обновлён 2026-05-28: SELECT-политики
-- упрощены до Варианта А — без cross-EXISTS, см. _145 §5 и _147),
-- recon _142 (DDL/код), _143 (live SQL).
--
-- Apply:
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
--     -v ON_ERROR_STOP=1 -f /tmp/2026-05-28_phase40_pvl_certification_split.sql'
--
-- recover_grants.sh — НЕ ПРАВИТСЯ (см. _145 §8): на VPS это bash-wrapper
-- над public.ensure_garden_grants(), все GRANT'ы живут в DB-proc'е. После
-- apply вручную: `/opt/garden-monitor/recover_grants.sh` → должен дать
-- AUTH_CNT=166 / ANON_CNT=4 без exit 1.
--
-- ensure_garden_grants() — ОБНОВЛЯЕТСЯ внутри этой миграции:
-- в Part 1 swap старых 2 таблиц на новые 2 (net 41 → 41 таблица).
-- Без swap'а финальный `SELECT public.ensure_garden_grants();` упал бы
-- на GRANT'е дропнутой таблицы. Прецедент — phase38.

\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------------------
-- Section 1: ПРЕДУСЛОВИЯ — проверить пустоту старых таблиц + обработать
--                          FK от disputes
-- ---------------------------------------------------------------------------

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

ALTER TABLE pvl_student_disputes
  DROP CONSTRAINT IF EXISTS pvl_student_disputes_certification_score_id_fkey;

-- ---------------------------------------------------------------------------
-- Section 2: DROP старых таблиц (CASCADE — на случай других зависимостей)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS pvl_student_certification_criteria_scores CASCADE;
DROP TABLE IF EXISTS pvl_student_certification_scores CASCADE;

-- ---------------------------------------------------------------------------
-- Section 3: pvl_student_certification_self
-- ---------------------------------------------------------------------------
CREATE TABLE pvl_student_certification_self (
  student_id uuid PRIMARY KEY REFERENCES pvl_students(id) ON DELETE CASCADE,
  cohort_id uuid REFERENCES pvl_cohorts(id),
  certification_version text NOT NULL DEFAULT '2026-spring',
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

CREATE INDEX idx_pvl_student_certification_self_cohort
  ON pvl_student_certification_self(cohort_id);
CREATE INDEX idx_pvl_student_certification_self_status
  ON pvl_student_certification_self(status);

CREATE TRIGGER trg_pvl_student_certification_self_updated_at
  BEFORE UPDATE ON pvl_student_certification_self
  FOR EACH ROW EXECUTE FUNCTION pvl_set_updated_at();

-- ---------------------------------------------------------------------------
-- Section 4: pvl_student_certification_mentor
-- ---------------------------------------------------------------------------
CREATE TABLE pvl_student_certification_mentor (
  student_id uuid PRIMARY KEY REFERENCES pvl_students(id) ON DELETE CASCADE,
  mentor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  cohort_id uuid REFERENCES pvl_cohorts(id),
  certification_version text NOT NULL DEFAULT '2026-spring',
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
-- Section 5: RLS — pvl_student_certification_self
-- ---------------------------------------------------------------------------
ALTER TABLE pvl_student_certification_self ENABLE ROW LEVEL SECURITY;

CREATE POLICY pvl_student_certification_self_active_access_guard_select
  ON pvl_student_certification_self AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (has_platform_access(auth.uid()));

CREATE POLICY pvl_student_certification_self_active_access_guard_write
  ON pvl_student_certification_self AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (has_platform_access(auth.uid()))
  WITH CHECK (has_platform_access(auth.uid()));

-- PERMISSIVE SELECT: parallel-blind (Вариант А, см. _145 §5 + _147)
--   menti видит свою self всегда
--   ментор видит self своей menti — ТОЛЬКО когда self.status='submitted'
--   admin видит всё
--
-- LESSON: cross-EXISTS clauses между _self ↔ _mentor вызывают
-- "infinite recursion detected in policy" (см. _145 §5). НЕ возвращать.
CREATE POLICY pvl_student_certification_self_select_blind
  ON pvl_student_certification_self FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR is_admin()
    OR (
      is_mentor_for(student_id)
      AND status = 'submitted'
    )
  );

CREATE POLICY pvl_student_certification_self_insert_own
  ON pvl_student_certification_self FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND status = 'draft'
  );

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

CREATE POLICY pvl_student_certification_self_update_admin
  ON pvl_student_certification_self FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY pvl_student_certification_self_delete_admin
  ON pvl_student_certification_self FOR DELETE TO authenticated
  USING (is_admin());

-- ---------------------------------------------------------------------------
-- Section 6: RLS — pvl_student_certification_mentor — симметрично self
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

-- PERMISSIVE SELECT: parallel-blind симметрично (Вариант А)
--   ментор видит свою mentor-запись всегда
--   menti видит mentor-запись о себе — ТОЛЬКО когда mentor.status='submitted'
--   admin видит всё
--
-- LESSON: cross-EXISTS clauses между _mentor ↔ _self вызывают
-- "infinite recursion detected in policy" (см. _145 §5). НЕ возвращать.
CREATE POLICY pvl_student_certification_mentor_select_blind
  ON pvl_student_certification_mentor FOR SELECT TO authenticated
  USING (
    mentor_id = auth.uid()
    OR is_admin()
    OR (
      student_id = auth.uid()
      AND status = 'submitted'
    )
  );

CREATE POLICY pvl_student_certification_mentor_insert_mentor
  ON pvl_student_certification_mentor FOR INSERT TO authenticated
  WITH CHECK (
    is_mentor_for(student_id)
    AND status = 'draft'
  );

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
-- Section 7: GRANTs (защита от Timeweb daily wipe — phase23 SEC-014)
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON pvl_student_certification_self TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pvl_student_certification_mentor TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_garden_grants()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- ── PART 1: Tier-1 — full CRUD для authenticated (41 таблица) ──
    -- Источник: phase 16 PART 1 + phase 38 + phase 40 (swap certification tables).
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
    -- … (39 строк опущено для краткости — без изменений) …
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_student_certification_mentor TO authenticated;  -- phase 40 (swap)
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvl_student_certification_self TO authenticated;    -- phase 40 (swap)
    -- … (no longer mentions pvl_student_certification_{scores,criteria_scores}) …
    GRANT SELECT, INSERT ON public.pvl_audit_log TO authenticated;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
    GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.is_mentor_for(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.is_pvl_cohort_peer(uuid) TO authenticated;
    GRANT SELECT ON public.events    TO web_anon;
    GRANT SELECT ON public.cities    TO web_anon;
    GRANT SELECT ON public.notebooks TO web_anon;
    GRANT SELECT ON public.questions TO web_anon;
    NOTIFY pgrst, 'reload schema';
END;
$$;

SELECT public.ensure_garden_grants();

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции, V1-V5) — см. сам файл для полного блока
-- ─────────────────────────────────────────────────────────────────────
```

Полное тело `ensure_garden_grants()` (все 41 строки PART 1) — в самом файле, опущено в этом отчёте только для читаемости. Body идентично phase38 за исключением swap'нутых двух строк (certification_scores/criteria_scores → certification_mentor/self).

---

## 4. git status (staged, не committed)

```
$ git status --short database/
A  database/pvl/migrations/2026-05-28_phase40_pvl_certification_split.sql
```

416 строк, staged для будущего commit. Никаких других путей в этой сессии не трогал. Прочие `M`/`D`/`??` в `dist/`, `plans/BACKLOG.md` — не от меня, не staged.

---

## 5. Что не сделано (по дисциплине)

- ✅ Никаких COMMIT'ов в БД. Прод не задет — ROLLBACK, post-rollback показал старые таблицы на месте.
- ✅ Никаких `git commit` / `git push`. Только `git add` (staged).
- ✅ Apply на прод — отдельным 🟢, не сейчас.
- ✅ `recover_grants.sh` не правил (по решению стратега п.4).

---

## 6. Артефакты

| Файл | Где | Назначение |
|---|---|---|
| `database/pvl/migrations/2026-05-28_phase40_pvl_certification_split.sql` | **локально, staged** | финальная миграция, Вариант А |
| `/tmp/phase40_full.sql` | на VPS | копия файла выше |
| `/tmp/phase40_body.sql` | на VPS | sed-стрипнут от BEGIN/COMMIT |
| `/tmp/phase40_dryrun.sql` | локально + VPS | wrapper для v2 dryrun |
| `/tmp/phase40_dryrun_v2.log` | локально | **полный лог v2 (342 строки, 0 ERROR'ов в RLS-тестах)** |
| `/tmp/phase40_dryrun_official.log`, `/tmp/phase40_whatif.log` | локально | старые логи из _145 (recursion FAIL + первый what-if PASS) |

---

**Следующий шаг:** жду 🟢 от стратега → `git commit` + apply на прод одной командой по header'у миграции → ручной `/opt/garden-monitor/recover_grants.sh` → smoke-проверка counts 166/4 → Сессия 2 (frontend API).

**Файл:** `garden/docs/_session/2026-05-28_147_codeexec_etap2_backend_dryrun_v2.md`
