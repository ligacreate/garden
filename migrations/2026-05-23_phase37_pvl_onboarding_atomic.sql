-- migrations/2026-05-23_phase37_pvl_onboarding_atomic.sql
--
-- BUG-PVL-ONBOARDING-MISSING-STUDENT-RECORD (P1) — architectural fix.
--
-- Корень бага: создание `pvl_students` row не атомарно с регистрацией.
-- На `profiles` нет ни одного AFTER INSERT trigger'а; `/auth/register`
-- создаёт `users_auth` + `profiles`, но НЕ `pvl_students`. Клиентский
-- `ensurePvlStudentInDb` (services/pvlMockApi.js:603) гейтит upsert на
-- `pvlRole === 'admin'` (ARCH-012 hotfix) → applicant не может создать
-- row для себя. RLS `pvl_students_insert_admin WITH CHECK (is_admin())`
-- блокирует это и на уровне БД. Результат: новые applicant'ы тонут
-- в FK violation при сохранении ДЗ. См. recon `_108`.
--
-- Закрывает 4 backlog тикета одной миграцией:
--   - BUG-PVL-ONBOARDING-MISSING-STUDENT-RECORD (P1) — trigger создаёт row атомарно
--   - ARCH-010 (P2) — FK pvl_students.id → profiles(id) формализует convention
--   - BUG-PVL-ENSURE-RESPECTS-ROLE (P2) — whitelist в WHEN не пускает admin/mentor/leader
--   - ARCH-012 (P2, partial) — серверный flow готов; cleanup client-side ensure
--     отдельным PR через 2-3 дня после verify trigger'а в проде.
--
-- v2 (2026-05-23) — параллельный латентный bug (см. _111):
--   Первый apply phase37 v1 упал в Section 2 на UPDATE pvl_cohorts —
--   trigger trg_pvl_cohorts_updated_at BEFORE UPDATE пытается писать
--   NEW.updated_at, но колонки updated_at в pvl_cohorts нет. Тот же
--   паттерн, что phase25 чинила для pvl_homework_items.
--   Audit показал: помимо pvl_cohorts ещё 2 таблицы в той же ситуации —
--   pvl_course_lessons и pvl_mentors. Никто их сейчас не UPDATE'ит,
--   поэтому не выстрелили. Закрываем класс bug'ов одной миграцией
--   (feedback "extend scope for parallel bugs"):
--     ALTER TABLE pvl_cohorts        ADD COLUMN updated_at ...
--     ALTER TABLE pvl_course_lessons ADD COLUMN updated_at ...
--     ALTER TABLE pvl_mentors        ADD COLUMN updated_at ...
--   IF NOT EXISTS — повторный apply безопасен. DEFAULT now() заполняет
--   existing rows. NOT NULL — consistent с прочими 10 pvl_* таблицами.
--
-- v3 (2026-05-23) — tatrusi exclusion + assertion поправка (см. _113, _114):
--   Apply v2 упал в Section 7 на backfill assertion: ожидалось 14
--   intern-orphans, найдено 13. Расследование (_113) показало — это
--   была моя ошибка в _108 recon (написала «1 applicant + 14 intern
--   + 18 leader = 33», на самом деле было «2 applicant + 13 intern +
--   18 leader = 33»; sum сошёлся, разбивка нет). Реально интернов
--   всегда было 13.
--   Параллельно Ольга решила удалить второго applicant'а tatrusi@mail.ru
--   (Таня Волошанина, applicant/paused_manual — случайный залёт, не
--   из ПВЛ потока). Удалена через UI → RPC admin_delete_user_full
--   до этого apply (verified _115: profiles/users_auth = 0,
--   audit-log entry создан). Tatrusi не входила в backfill scope
--   (role='applicant', не intern), на цифру 13 не влияет.
--   v3 правка: ровно одна цифра в Section 7 assertion: <> 14 → <> 13
--   + RAISE NOTICE message актуален.
--   V3 после COMMIT ожидает 1 orphan (только Суроватская — applicant
--   pending_approval, ждёт явного одобрения; backfill её не цепляет).
--
-- Продуктовые решения (Ольга 🟢, см. бриф `_109`):
--   1. Trigger фиксирует МОМЕНТ ОДОБРЕНИЯ админом, не регистрацию.
--      Регистрация ничего не предполагает (юзер ещё непонятный) —
--      strict pending_approval. Trigger fires когда админ выбирает
--      роль и/или разблокирует доступ.
--   2. Whitelist: только role IN ('applicant','intern'). Leader НЕ
--      получает row (выпускницы, не активные ученицы).
--   3. Cohort выбирается ПО КАЛЕНДАРЮ через pvl_cohorts.start_date /
--      end_date. Если активного потока нет (edge case летом / после
--      декабря) — cohort_id = NULL, админ проставит вручную.
--   4. Два потока в БД с датами: Поток 1 (15.04–01.07.2026) +
--      Поток 2 (15.09–20.12.2026).
--   5. Backfill: ровно 14 уже одобренных interns. Applicant Суроватская
--      (1, pending_approval) — НЕ backfill'им, ждёт явного одобрения от
--      Ольги → trigger её подхватит. 18 leaders НЕ трогаем.
--
-- Mini-recon (Задача A из `_109`):
--   - Approve flow в админ-UI: views/AdminPanel.jsx:1226 (dropdown role,
--     onUpdateUserRole → App.jsx:307 → api.updateUser → PATCH /profiles {role})
--     + views/AdminPanel.jsx:1254 (suspend/resume → api.toggleUserStatus →
--     PATCH /profiles {status, access_status}). Это ДВА независимых
--     admin-action: возможны любые порядки (роль-first / unblock-first).
--   - RPC `admin_approve_registration(uuid, text)` (phase31) делает ОБА
--     UPDATE в одной транзакции, но UI её НЕ вызывает (проверено grep'ом
--     по services/, views/, App.jsx, components/).
--   - Trigger ДОЛЖЕН покрыть оба сценария: legacy split-PATCH И будущий
--     RPC-вызов. Также — будущие role-changes (leader → applicant).
--
-- Выбран механизм триггера (c) Комбинированный
--   AFTER UPDATE OF role, access_status ON profiles
--   FOR EACH ROW
--   WHEN (
--       NEW.role IN ('applicant','intern')
--       AND (
--           (OLD.access_status = 'pending_approval' AND NEW.access_status = 'active')
--           OR
--           (OLD.role IS DISTINCT FROM NEW.role)
--       )
--   )
--   Почему (c), а не (a) или (b):
--     - (a) только access_status — пропускает role-change-only сценарии
--       (admin делает leader → applicant без касания access_status).
--     - (b) только role — главный bug (applicant + unblock без role-change)
--       просто не покрывается. Это самый частый кейс.
--     - (c) одна OR-ветка добавлена к (a) — закрывает все варианты.
--       Идемпотентность через ON CONFLICT (id) DO NOTHING.
--       PostgreSQL fires AFTER UPDATE trigger ровно один раз на UPDATE
--       statement (даже если match'ат обе ветки WHEN).
--
-- Что в trigger function:
--   - SECURITY DEFINER + SET search_path (паттерн admin_approve_registration
--     из phase31).
--   - Резолвит активный cohort по CURRENT_DATE BETWEEN start_date AND end_date.
--   - INSERT с ON CONFLICT (id) DO NOTHING — повторное одобрение не создаёт
--     дубликат и не перетирает существующую row (важно для idempotency).
--
-- Что НЕ в этом PR (явно):
--   - НЕ удаляем `ensurePvlStudentInDb` + 8 callsite'ов в pvlMockApi.js.
--     Старый код остаётся как fallback на 2-3 дня. Cleanup — отдельный PR.
--   - НЕ оборачиваем /auth/register в BEGIN/COMMIT (другой half-state risk,
--     отдельная задача P2).
--   - НЕ меняем RLS на pvl_students (trigger SECURITY DEFINER обходит).
--
-- RUNBOOK 1.3:
--   SELECT public.ensure_garden_grants() ДО COMMIT — защита от Timeweb
--   DDL GRANT-wipeout (phase 23 stored procedure).
--
-- Pre-apply assertions (миграция FAIL'ится, если):
--   - В pvl_students есть row без соответствующей profiles.id (orphan
--     reverse > 0). FK не добавится; гасим ранним assertion с понятным
--     сообщением.
--   - Backfill 14 interns не дал ровно 14 rows (cardinality mismatch с
--     `_108` audit). Защита от рассинхрона между recon и apply.
--
-- Apply:
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
--     -v ON_ERROR_STOP=1 -f /tmp/2026-05-23_phase37_pvl_onboarding_atomic.sql'

\set ON_ERROR_STOP on

BEGIN;

-- ── 1a. SCHEMA-fix: латентный bug pvl_set_updated_at без колонки ──────
-- 3 таблицы имеют trigger trg_<table>_updated_at BEFORE UPDATE → функция
-- pvl_set_updated_at() делает NEW.updated_at = NOW(), но колонки нет.
-- Любой UPDATE на эти таблицы валится с «record "new" has no field
-- "updated_at"». См. шапку v2 + _111.
-- Прецедент fix'а: phase25 для pvl_homework_items (этой колонки тоже
-- исторически не было, добавили consistent с прочими pvl_*).
ALTER TABLE public.pvl_cohorts
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.pvl_course_lessons
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.pvl_mentors
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.pvl_cohorts.updated_at IS
    'Совместимость с trg_pvl_cohorts_updated_at (BEFORE UPDATE → pvl_set_updated_at). Добавлено phase37 v2 — fix латентного bug''а 2026-05-23.';
COMMENT ON COLUMN public.pvl_course_lessons.updated_at IS
    'Совместимость с trg_pvl_course_lessons_updated_at (BEFORE UPDATE → pvl_set_updated_at). Добавлено phase37 v2 — fix латентного bug''а 2026-05-23.';
COMMENT ON COLUMN public.pvl_mentors.updated_at IS
    'Совместимость с trg_pvl_mentors_updated_at (BEFORE UPDATE → pvl_set_updated_at). Добавлено phase37 v2 — fix латентного bug''а 2026-05-23.';

-- ── 1b. SCHEMA: pvl_cohorts.start_date / end_date ─────────────────────
ALTER TABLE public.pvl_cohorts
    ADD COLUMN IF NOT EXISTS start_date date,
    ADD COLUMN IF NOT EXISTS end_date   date;

-- CHECK: end_date >= start_date (когда обе заданы).
-- Используем NOT VALID + VALIDATE двуступенчато — но т.к. таблица сейчас
-- пустая по этим колонкам (только 1 row, которой ниже backfill'им даты),
-- сразу validating CHECK безопасен.
ALTER TABLE public.pvl_cohorts
    DROP CONSTRAINT IF EXISTS pvl_cohorts_dates_check;
ALTER TABLE public.pvl_cohorts
    ADD CONSTRAINT pvl_cohorts_dates_check
        CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);

COMMENT ON COLUMN public.pvl_cohorts.start_date IS
    'Дата начала потока. Используется trg_create_pvl_student_on_approval для авто-резолюции активного cohort_id на момент одобрения applicant''а.';
COMMENT ON COLUMN public.pvl_cohorts.end_date IS
    'Дата окончания потока. CURRENT_DATE BETWEEN start_date AND end_date = «активный сейчас».';

-- ── 2. DATA: backfill дат Потока 1 + добавление Потока 2 ──────────────
UPDATE public.pvl_cohorts
   SET start_date = DATE '2026-04-15',
       end_date   = DATE '2026-07-01'
 WHERE id = '11111111-1111-1111-1111-111111111101'
   AND (start_date IS NULL OR end_date IS NULL);

-- Поток 2 — осень. ON CONFLICT по уникальному ключу нет (id default
-- gen_random_uuid()), поэтому защищаемся по title — guard через
-- NOT EXISTS чтобы повторный apply не плодил дубликаты.
INSERT INTO public.pvl_cohorts (id, title, year, start_date, end_date)
SELECT gen_random_uuid(), 'ПВЛ 2026 Поток 2', 2026, DATE '2026-09-15', DATE '2026-12-20'
 WHERE NOT EXISTS (
     SELECT 1 FROM public.pvl_cohorts WHERE title = 'ПВЛ 2026 Поток 2'
 );

-- ── 3. PRE-CHECK: orphan reverse = 0 (защита перед FK) ────────────────
DO $$
DECLARE
    v_orphan_reverse int;
BEGIN
    SELECT COUNT(*) INTO v_orphan_reverse
      FROM public.pvl_students ps
      LEFT JOIN public.profiles p ON p.id = ps.id
     WHERE p.id IS NULL;

    IF v_orphan_reverse <> 0 THEN
        RAISE EXCEPTION
            'phase37 abort: % pvl_students rows have no matching profiles.id — FK добавится с ошибкой. Сначала очистить orphan reverse.',
            v_orphan_reverse
            USING ERRCODE = 'P0001';
    END IF;
END $$;

-- ── 4. FK pvl_students.id → profiles(id) ON DELETE CASCADE (ARCH-010) ─
-- Закрывает ARCH-010: convention «pvl_students.id = profiles.id»
-- становится контрактом БД. CASCADE на DELETE согласован с CASCADE
-- уже существующих FK от pvl_student_* к pvl_students (см. _108 §3.4).
ALTER TABLE public.pvl_students
    DROP CONSTRAINT IF EXISTS pvl_students_id_fk_profiles;
ALTER TABLE public.pvl_students
    ADD CONSTRAINT pvl_students_id_fk_profiles
        FOREIGN KEY (id) REFERENCES public.profiles(id) ON DELETE CASCADE;

COMMENT ON CONSTRAINT pvl_students_id_fk_profiles ON public.pvl_students IS
    'ARCH-010: pvl_students.id всегда = profiles.id (convention зафиксирована FK). CASCADE на DELETE — при удалении profile дропаются все student-данные.';

-- ── 5. TRIGGER FUNCTION ──────────────────────────────────────────────
-- SECURITY DEFINER — обходит RLS pvl_students_insert_admin. Выполняется
-- от имени owner'а (gen_user). Паттерн same as admin_approve_registration
-- (phase31).
CREATE OR REPLACE FUNCTION public.trg_create_pvl_student_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cohort_id uuid;
BEGIN
    -- Активный поток на сегодня. Если ничего не попало в диапазон —
    -- NULL (edge case: между потоками, летом / после декабря). Админ
    -- проставит cohort_id вручную, когда поток откроется.
    SELECT id INTO v_cohort_id
      FROM public.pvl_cohorts
     WHERE start_date IS NOT NULL
       AND end_date   IS NOT NULL
       AND CURRENT_DATE BETWEEN start_date AND end_date
     ORDER BY start_date DESC
     LIMIT 1;

    INSERT INTO public.pvl_students (id, full_name, status, cohort_id)
    VALUES (
        NEW.id,
        COALESCE(NULLIF(trim(NEW.name), ''), NEW.email, 'Участница'),
        'active',
        v_cohort_id
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_create_pvl_student_on_approval() IS
    'BUG-PVL-ONBOARDING-MISSING-STUDENT-RECORD: создаёт pvl_students row в момент одобрения applicant/intern админом. Резолвит cohort_id по CURRENT_DATE через pvl_cohorts.start_date/end_date. Idempotent (ON CONFLICT DO NOTHING).';

-- ── 6. CREATE TRIGGER (механизм c, см. шапку) ─────────────────────────
DROP TRIGGER IF EXISTS trg_profiles_pvl_student_on_approval ON public.profiles;
CREATE TRIGGER trg_profiles_pvl_student_on_approval
    AFTER UPDATE OF role, access_status
    ON public.profiles
    FOR EACH ROW
    WHEN (
        NEW.role IN ('applicant', 'intern')
        AND (
            -- Branch 1: одобрение (pending_approval → active). Главный
            -- кейс из бага. Покрывает: applicant зарегистрировался →
            -- админ нажал «разблокировать», role не менял.
            (OLD.access_status = 'pending_approval' AND NEW.access_status = 'active')
            OR
            -- Branch 2: смена роли В whitelist (leader → applicant и т.п.).
            -- Покрывает: admin меняет role у уже-одобренного юзера. Если
            -- pvl_students row уже есть — ON CONFLICT DO NOTHING.
            (OLD.role IS DISTINCT FROM NEW.role)
        )
    )
    EXECUTE FUNCTION public.trg_create_pvl_student_on_approval();

-- ── 7. BACKFILL: 14 уже одобренных interns ────────────────────────────
-- _108 audit показал ровно 14 interns с access_status='active' БЕЗ
-- pvl_students row. Trigger ловит только будущие одобрения; legacy
-- interns подчищаем один раз в этой же транзакции.
DO $$
DECLARE
    v_inserted int;
BEGIN
    INSERT INTO public.pvl_students (id, full_name, status, cohort_id)
    SELECT p.id,
           COALESCE(NULLIF(trim(p.name), ''), p.email, 'Участница'),
           'active',
           (
               SELECT id FROM public.pvl_cohorts
                WHERE start_date IS NOT NULL
                  AND end_date IS NOT NULL
                  AND CURRENT_DATE BETWEEN start_date AND end_date
                ORDER BY start_date DESC
                LIMIT 1
           )
      FROM public.profiles p
      LEFT JOIN public.pvl_students ps ON ps.id = p.id
     WHERE p.role = 'intern'
       AND ps.id IS NULL;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted <> 13 THEN
        RAISE EXCEPTION
            'phase37 backfill abort: ожидалось 13 intern-orphan строк, найдено %. Состояние проднутой БД рассинхронизировалось с _113/_115 verify — пере-проверить руками перед apply.',
            v_inserted
            USING ERRCODE = 'P0001';
    END IF;

    RAISE NOTICE 'phase37 backfill: вставлено % rows для interns (ожидалось 13)', v_inserted;
END $$;

-- ── 8. RUNBOOK 1.3 — safety-net ДО COMMIT ────────────────────────────
SELECT public.ensure_garden_grants();

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────

\echo === V0: updated_at колонка добавлена во все 3 таблицы (v2 fix) ===
SELECT table_name,
       EXISTS (SELECT 1 FROM information_schema.columns c
                WHERE c.table_schema='public'
                  AND c.table_name = t.table_name
                  AND c.column_name = 'updated_at') AS has_updated_at
  FROM (VALUES ('pvl_cohorts'), ('pvl_course_lessons'), ('pvl_mentors')) AS t(table_name)
 ORDER BY table_name;

\echo === V1: pvl_cohorts — две строки, обе с датами ===
SELECT id, title, year, start_date, end_date
  FROM public.pvl_cohorts
 ORDER BY start_date NULLS LAST;

\echo === V2: pvl_students count (ожидание: 28 = 15 + 13) ===
SELECT COUNT(*) AS pvl_students_total FROM public.pvl_students;

\echo === V3: orphan profiles role IN (applicant,intern) (ожидание: 1 — Суроватская, pending_approval) ===
SELECT p.id, p.email, p.role, p.access_status
  FROM public.profiles p
  LEFT JOIN public.pvl_students ps ON ps.id = p.id
 WHERE p.role IN ('applicant', 'intern')
   AND ps.id IS NULL
 ORDER BY p.role, p.email;

\echo === V4: FK pvl_students.id → profiles(id) ===
SELECT conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
 WHERE conname = 'pvl_students_id_fk_profiles';

\echo === V5: trigger function existence + SECURITY DEFINER ===
SELECT proname, prosecdef AS is_definer
  FROM pg_proc
 WHERE proname = 'trg_create_pvl_student_on_approval'
   AND pronamespace = 'public'::regnamespace;

\echo === V6: trigger привязан к profiles UPDATE OF role,access_status ===
SELECT tgname,
       pg_get_triggerdef(oid) AS def
  FROM pg_trigger
 WHERE tgname = 'trg_profiles_pvl_student_on_approval';

\echo === V7: активный cohort на сегодня (для smoke — чтобы знать, что подставит trigger) ===
SELECT id, title, start_date, end_date
  FROM public.pvl_cohorts
 WHERE start_date IS NOT NULL
   AND end_date IS NOT NULL
   AND CURRENT_DATE BETWEEN start_date AND end_date
 ORDER BY start_date DESC
 LIMIT 1;

\echo === V8: RUNBOOK 1.3 sanity — auth/anon grant counts (должны быть 158/4) ===
SELECT
  (SELECT COUNT(*) FROM information_schema.role_table_grants
     WHERE grantee = 'authenticated' AND table_schema = 'public') AS auth_grants,
  (SELECT COUNT(*) FROM information_schema.role_table_grants
     WHERE grantee = 'web_anon'      AND table_schema = 'public') AS anon_grants;
