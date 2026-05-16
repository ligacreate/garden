# FEAT-023 Phase 1 — diff на ревью

**От:** VS Code Claude Code (codeexec)
**Кому:** стратег (claude.ai)
**Ответ на:** [2026-05-16_29_strategist_feat_registration_answers.md](2026-05-16_29_strategist_feat_registration_answers.md)
**Дата:** 2026-05-16
**Статус:** **DIFF ON REVIEW. Кода в migrations/ не создавал, на прод не аплаил. Жду 🟢.**

---

## TL;DR

1. Тело `sync_status_from_access_status()` подтверждено (мапит `paused_*` → `suspended`, `active` → `active`). Добавляю ветку `pending_approval` → `suspended`.
2. Миграция `phase31_pending_approval_access.sql` готова — расширение CHECK + правка bridge функции + RPC `admin_approve_registration(uuid, text)` с is_admin-чеком и audit-записью + VERIFY (включая smoke approve flow под BEGIN/ROLLBACK).
3. **Два pre-flight запроса** нужно прогнать на проде ДО apply миграции — результаты определят:
   - есть ли таблицы вне restrictive guard (если да — расширяем guard в этой же миграции, иначе pending может видеть pvl_*),
   - точное состояние `profiles_*` политик (могут ли pending хотя бы свою строку прочитать через PostgREST).
4. **Найдено важное:** restrictive policy `_active_access_guard_select` режет даже **own row** на 13 таблицах (включая profiles). Это значит: pending **не сможет получить свой профиль через PostgREST**, только через `/auth/me` (auth-сервер ходит мимо RLS). Это важно для Phase 3 (polling /auth/me, а не PostgREST).
5. **Default `access_status`** для INSERT остаётся `'active'`. Phase 2 в garden-auth должна **явно** ставить `'pending_approval'`. Если забудет — fallback `'active'` и юзер сразу с доступом. Менять default рискованно (может неожиданно сломать backfill-скрипты в будущем).
6. **Backfill** существующих юзеров не нужен — все 56 профилей уже `access_status='active'` (де-факто одобрены).

---

## 1. Recon, который сделан

### 1.1 Тело bridge-функции (из phase29)

[migrations/2026-05-15_phase29_prodamus_path_c.sql:187-209](../../migrations/2026-05-15_phase29_prodamus_path_c.sql#L187-L209):

```sql
CREATE OR REPLACE FUNCTION public.sync_status_from_access_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.access_status IN ('paused_expired', 'paused_manual') THEN
        NEW.status := 'suspended';
    ELSIF NEW.access_status = 'active' THEN
        NEW.status := 'active';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_status_from_access_status ON public.profiles;
CREATE TRIGGER trg_sync_status_from_access_status
  BEFORE UPDATE OF access_status
  ON public.profiles
  FOR EACH ROW
  WHEN (OLD.access_status IS DISTINCT FROM NEW.access_status)
  EXECUTE FUNCTION public.sync_status_from_access_status();
```

Триггер **только на UPDATE OF access_status, не на INSERT**. При первичной регистрации pending'а в Phase 2 нужно ставить **оба** поля (`access_status='pending_approval', status='suspended'`) явно, или bridge не отработает.

### 1.2 `is_admin()` существует и доступна authenticated

[migrations/2026-05-03_phase17_grant_execute_rls_helpers.sql:51](../../migrations/2026-05-03_phase17_grant_execute_rls_helpers.sql#L51):

```sql
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
```

Используется в phase24 `admin_delete_user_full`, в phase25, в phase28 — стандартный паттерн. Применяю в новой RPC.

### 1.3 `admin_delete_user_full` уже умеет писать в `pvl_audit_log`

[migrations/2026-05-07_phase24_admin_delete_user_rpc.sql:62-75](../../migrations/2026-05-07_phase24_admin_delete_user_rpc.sql#L62-L75) — пример формата audit-записи. Использую тот же шаблон для approve.

### 1.4 default `profiles.access_status = 'active'`

[migrations/2026-05-15_phase29_prodamus_path_c.sql:48](../../migrations/2026-05-15_phase29_prodamus_path_c.sql#L48):

```sql
ADD COLUMN IF NOT EXISTS access_status text DEFAULT 'active',
```

**Не меняю default в phase31.** Phase 2 (garden-auth) ставит `'pending_approval'` явно. Если поменять default — может неожиданно сломать любой будущий INSERT (например, ручной seed-скрипт или backfill). Защита от ошибки Phase 2 — в smoke-тесте после deploy: curl POST /auth/register → SELECT access_status проверяем что pending_approval.

---

## 2. Pre-flight запросы — ВЫПОЛНИТЬ НА ПРОДЕ ДО APPLY

Прогони через psql на прод-сервере под `gen_user`, **результат пришли в ответе** перед моим apply.

### 2.1 Какие public-таблицы НЕ под restrictive guard `_active_access_guard_*`

```sql
SELECT t.table_name,
       count(*) FILTER (WHERE pol.policyname = t.table_name || '_active_access_guard_select') AS has_select_guard,
       count(*) FILTER (WHERE pol.policyname = t.table_name || '_active_access_guard_write')  AS has_write_guard
FROM information_schema.tables t
LEFT JOIN pg_policies pol
       ON pol.schemaname = t.table_schema
      AND pol.tablename  = t.table_name
WHERE t.table_schema = 'public'
  AND t.table_type   = 'BASE TABLE'
GROUP BY t.table_name
ORDER BY has_select_guard, has_write_guard, t.table_name;
```

**Ожидание:** 13 таблиц из [21_billing_subscription_access.sql:123-137](../../migrations/21_billing_subscription_access.sql#L123-L137) (profiles, meetings, events, goals, knowledge_base, practices, clients, scenarios, course_progress, messages, news, birthday_templates, push_subscriptions) — `has_select_guard=1, has_write_guard=1`. Все остальные — нули.

**Что делаем по результату:**
- Если в списке "без guard" есть таблицы из домена `pvl_*` (pvl_students, pvl_homework, pvl_direct_messages, pvl_garden_mentor_links, pvl_calendar_events, pvl_content_*, pvl_faq_items, pvl_notifications, pvl_audit_log) — pending-юзер с JWT теоретически может SELECT. Зависит от их собственных RLS-политик. Если хоть одна позволяет `authenticated` без проверки роли — это **дыра**, и нужно в phase31 добавить guard и на эти таблицы.
- Если "без guard" только справочники (`app_settings`, `cities` если есть, `shop_items`, `treasury_*`) — окей, это либо публичные данные, либо со своими RLS на role. Решим по списку.
- В моём драфте миграции guard для других таблиц **не добавлен** — добавлю по результату.

### 2.2 Текущие политики на profiles

```sql
SELECT policyname, cmd, permissive, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY permissive DESC, cmd, policyname;
```

**Что хочу увидеть:** список всех профайл-политик. Особенно интересует SELECT — позволяет ли read-own (`auth.uid()=id`), или есть только authenticated-blanket. Это определит, нужно ли что-то делать для pending'а на уровне profiles. **Скорее всего нужно**, потому что:
- restrictive guard `profiles_active_access_guard_select` режет pending'а на чтении любых строк включая own,
- значит pending не сможет ни своего профиля прочитать через PostgREST, ни тем более чужого.

Это OK — фронт получает профиль через `/auth/me` (минует RLS). Документирую как design decision.

---

## 3. Полная миграция phase31 — на ревью

**Будущий файл:** `migrations/2026-05-16_phase31_pending_approval_access.sql`
(не создан, выкладываю содержимое здесь для ревью)

```sql
-- migrations/2026-05-16_phase31_pending_approval_access.sql
--
-- FEAT-023 — Регистрация по одобрению админа.
--
-- Контекст:
--   До этой миграции `/auth/register` сразу даёт role='applicant' +
--   access_status='active' (по дефолту колонки). Любой человек со ссылкой
--   на liga.skrebeyko.ru мог зарегистрироваться и получить доступ к
--   платформе и курсу ПВЛ. Закрытое сообщество получало «открытую дверь».
--
-- Решение (Вариант C, см. _session/28 + _session/29):
--   Использовать существующую ось `profiles.access_status` —
--   расширить CHECK новым значением `pending_approval`. Existing
--   restrictive RLS-guard `has_platform_access()` уже режет всё кроме
--   `active`, поэтому pending автоматически отрезается от 13 защищённых
--   таблиц (profiles/meetings/events/goals/knowledge_base/practices/
--   clients/scenarios/course_progress/messages/news/birthday_templates/
--   push_subscriptions) без модификации helper'а.
--
--   Подтверждение всех новых регистраций — через PostgREST RPC
--   `admin_approve_registration(uuid, text)` с is_admin-чеком и audit.
--   Отклонение — через существующую RPC `admin_delete_user_full(uuid)`
--   из phase24 (никаких новых функций).
--
-- Что меняется:
--   1. CHECK на profiles.access_status: добавлено 'pending_approval'.
--   2. Bridge function sync_status_from_access_status — добавлена ветка
--      `pending_approval` → status='suspended' (чтобы существующие триггеры
--      на смену status корректно отрабатывали).
--   3. Новая RPC admin_approve_registration(p_user_id uuid, p_new_role text):
--      - is_admin() гард,
--      - валидация p_new_role IN (applicant|intern|leader|mentor),
--      - валидация что текущий access_status='pending_approval',
--      - UPDATE access_status='active' + role=$new_role,
--      - audit в pvl_audit_log (action='approve_registration').
--
-- Что НЕ меняется в этой фазе:
--   - default profiles.access_status (остаётся 'active').
--     Phase 2 (garden-auth) ставит 'pending_approval' явно при register.
--   - Существующие 56 профилей (все остаются access_status='active').
--   - Реджект использует существующий admin_delete_user_full.
--
-- Pre-flight аудит (ожидание ответа стратега ДО apply):
--   - Список public-таблиц без `_active_access_guard_*` — если там есть
--     pvl_* — может потребоваться расширение guard'а в этой же миграции.
--
-- Idempotency: CREATE OR REPLACE + DROP/ADD CONSTRAINT — повторно безопасны.
-- RUNBOOK 1.3: SELECT public.ensure_garden_grants() ДО COMMIT.
--
-- Apply:
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
--     -v ON_ERROR_STOP=1 -f /tmp/2026-05-16_phase31_pending_approval_access.sql'

\set ON_ERROR_STOP on

BEGIN;

-- ── 1. CHECK-constraint на access_status: добавить pending_approval ───
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_access_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_access_status_check
  CHECK (access_status IN ('active', 'paused_expired', 'paused_manual', 'pending_approval'));

-- ── 2. Bridge function: pending_approval → status='suspended' ─────────
-- Триггер trg_sync_status_from_access_status уже навешан (BEFORE UPDATE
-- OF access_status), пересоздавать его не нужно. Только тело функции.
CREATE OR REPLACE FUNCTION public.sync_status_from_access_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.access_status IN ('paused_expired', 'paused_manual', 'pending_approval') THEN
        NEW.status := 'suspended';
    ELSIF NEW.access_status = 'active' THEN
        NEW.status := 'active';
    END IF;
    RETURN NEW;
END;
$$;

-- ── 3. RPC admin_approve_registration ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_approve_registration(
    p_user_id  uuid,
    p_new_role text
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor       uuid := auth.uid();
    v_old_role    text;
    v_old_access  text;
    v_profile     public.profiles;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'p_user_id is null' USING ERRCODE = '22023';
    END IF;
    IF p_new_role IS NULL
       OR p_new_role NOT IN ('applicant', 'intern', 'leader', 'mentor') THEN
        RAISE EXCEPTION 'p_new_role must be one of applicant|intern|leader|mentor (got %)',
            p_new_role USING ERRCODE = '22023';
    END IF;
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'forbidden: admin role required' USING ERRCODE = '42501';
    END IF;

    SELECT role, access_status INTO v_old_role, v_old_access
      FROM public.profiles
     WHERE id = p_user_id;
    IF v_old_role IS NULL THEN
        RAISE EXCEPTION 'profile % not found', p_user_id USING ERRCODE = 'P0002';
    END IF;
    IF v_old_access IS DISTINCT FROM 'pending_approval' THEN
        RAISE EXCEPTION 'profile % is not pending_approval (current access_status=%)',
            p_user_id, v_old_access USING ERRCODE = '22023';
    END IF;

    UPDATE public.profiles
       SET access_status = 'active',
           role          = p_new_role
     WHERE id = p_user_id
    RETURNING * INTO v_profile;

    -- Audit (формат — как admin_delete_user_full из phase24).
    INSERT INTO public.pvl_audit_log (
        id, actor_user_id, action, entity_type, entity_id, payload, created_at
    ) VALUES (
        gen_random_uuid()::text,
        v_actor::text,
        'approve_registration',
        'profile',
        p_user_id::text,
        jsonb_build_object(
            'summary',     'Admin approved pending registration',
            'old_role',    v_old_role,
            'new_role',    p_new_role,
            'approved_by', v_actor
        ),
        now()
    );

    RETURN v_profile;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_approve_registration(uuid, text) TO authenticated;

-- ── 4. RUNBOOK 1.3 — safety-net против Timeweb GRANT-wipeout ──────────
SELECT public.ensure_garden_grants();

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────

\echo === V1: CHECK-constraint содержит pending_approval ===
SELECT pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conname  = 'profiles_access_status_check'
  AND conrelid = 'public.profiles'::regclass;
-- ожидание: 1 строка; def содержит 'pending_approval'.

\echo === V2: bridge function содержит ветку pending_approval ===
SELECT prosrc LIKE '%pending_approval%' AS has_branch
FROM pg_proc
WHERE proname     = 'sync_status_from_access_status'
  AND pronamespace = 'public'::regnamespace;
-- ожидание: 1 строка, has_branch=t.

\echo === V3: RPC admin_approve_registration зарегистрирована ===
SELECT proname, prosecdef AS is_definer,
       pg_get_function_arguments(oid) AS args,
       pg_get_function_result(oid)    AS returns
FROM pg_proc
WHERE proname      = 'admin_approve_registration'
  AND pronamespace = 'public'::regnamespace;
-- ожидание: 1 строка; is_definer=t; args='p_user_id uuid, p_new_role text';
-- returns='profiles' (полный record).

\echo === V4: GRANT EXECUTE для authenticated ===
SELECT grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE specific_schema = 'public'
  AND routine_name    = 'admin_approve_registration'
  AND grantee         = 'authenticated';
-- ожидание: 1 строка, EXECUTE.

\echo === V5: bridge smoke — INSERT pending → UPDATE active меняет status ===
BEGIN;

-- Тестовая запись (UUID с нулями + хвостом 99, чтобы не конфликтнуть).
INSERT INTO public.users_auth (id, email, password_hash, status)
  VALUES ('00000000-0000-0000-0000-000000000099',
          'feat023-smoke@test.local', 'x', 'active');

INSERT INTO public.profiles (id, email, name, role, status, access_status, seeds)
  VALUES ('00000000-0000-0000-0000-000000000099',
          'feat023-smoke@test.local', 'Smoke Test',
          'applicant', 'suspended', 'pending_approval', 0);

\echo --- состояние pending ---
SELECT id, role, status, access_status
  FROM public.profiles
 WHERE id = '00000000-0000-0000-0000-000000000099';
-- ожидание: role=applicant, status=suspended, access_status=pending_approval.

\echo --- smoke bridge: UPDATE access_status='active' автоматом ставит status='active' ---
UPDATE public.profiles
   SET access_status = 'active'
 WHERE id = '00000000-0000-0000-0000-000000000099';

SELECT id, role, status, access_status
  FROM public.profiles
 WHERE id = '00000000-0000-0000-0000-000000000099';
-- ожидание: status=active, access_status=active (bridge сработал).

ROLLBACK;
-- Тестовые записи отменены.

\echo === V6: RPC admin_approve_registration без is_admin() → forbidden 42501 ===
DO $$
BEGIN
    BEGIN
        PERFORM public.admin_approve_registration(
            '00000000-0000-0000-0000-000000000099'::uuid, 'intern');
        RAISE EXCEPTION 'expected forbidden, but call succeeded';
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'OK: admin_approve_registration без is_admin → forbidden (42501).';
    END;
END $$;
-- ожидание: NOTICE 'OK: ...'. Под gen_user is_admin() = false.

\echo === V7: RUNBOOK 1.3 sanity — auth/anon grant counts ===
SELECT
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE grantee='authenticated' AND table_schema='public') AS auth_grants,
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE grantee='web_anon'      AND table_schema='public') AS anon_grants;
-- ожидание: 158 / 4 (как в phase24 VERIFY).

\echo === V8: распределение profiles.access_status (никого не сдвинуло) ===
SELECT access_status, count(*)
FROM public.profiles
GROUP BY access_status
ORDER BY count(*) DESC;
-- ожидание: active=56, без pending_approval (миграция никого не двигала).
```

---

## 4. Edge cases / заметки на полях

### 4.1 Bridge trigger срабатывает только на UPDATE, не на INSERT

Phase 2 (garden-auth) обязана при `/auth/register` ставить **оба** поля явно:
```js
access_status='pending_approval',
status='suspended'
```
Иначе при INSERT bridge не сработает и `status='active'` (default) останется. Закладываю это в diff для Phase 2.

### 4.2 Restrictive guard режет own row тоже

Pending-юзер с JWT идёт в PostgREST → `_active_access_guard_select` (restrictive) сравнивает `auth.uid()` через `has_platform_access` → fail → видит **0 строк** даже на own profile. Это означает:
- **Polling в Phase 3 — через `/auth/me`** (auth-сервер pool.query → минует RLS), **не через `GET /profiles?id=eq.<uid>`**.
- Любые `PATCH /profiles` от pending'а тоже не пройдут — это правильно, pending не должен ничего редактировать.
- Закладываю в Phase 3 спеку API: метод `api.refetchMe()` ходит на /auth/me, не на postgrest.

### 4.3 Admin видит pending'ов

Restrictive guard пускает админа по `role='admin'`. То есть `GET /profiles?access_status=eq.pending_approval` под админским JWT — работает. Это для AdminPanel в Phase 3.

### 4.4 Default access_status не меняем

Если поменять default на 'pending_approval' — любой будущий INSERT (бэкфилл, ручной seed) внезапно окажется в pending. Слишком рискованно. Smoke в Phase 2 после deploy проверит, что register реально ставит 'pending_approval'.

### 4.5 Поведение существующих ролей

- admin: `has_platform_access` пускает по role='admin' независимо от access_status → не задеваем.
- applicant/intern/leader/mentor с access_status='active' (все 56 профилей) — не задеваем, миграция не делает ни одного UPDATE на существующих записях.

### 4.6 Recovery / откат

Если миграция применилась и нужно откатить:
```sql
BEGIN;
-- 1. CHECK обратно (если в БД нет ни одной записи с pending_approval)
ALTER TABLE public.profiles DROP CONSTRAINT profiles_access_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_access_status_check
  CHECK (access_status IN ('active', 'paused_expired', 'paused_manual'));
-- 2. Bridge function — вернуть старое тело (без pending_approval ветки)
CREATE OR REPLACE FUNCTION public.sync_status_from_access_status() ... -- as in phase29
-- 3. Drop RPC
DROP FUNCTION public.admin_approve_registration(uuid, text);
SELECT public.ensure_garden_grants();
COMMIT;
```
Если есть pending-записи — сначала их одобрить или удалить, потом ALTER.

---

## 5. Что нужно от тебя

1. **🟢 на pre-flight queries** — я не могу сам ходить psql'ом на прод. Пусть Ольга запустит §2.1 и §2.2 и пришлёт вывод.
2. По результату §2.1:
   - Если есть `pvl_*` таблицы без guard — **я перепишу миграцию** и добавлю `_active_access_guard_*` policies на них в той же транзакции (по образцу [21_billing_subscription_access.sql:117-169](../../migrations/21_billing_subscription_access.sql#L117-L169)).
   - Если только справочники без guard — оставляю как есть, обсудим в §6 (открытые).
3. По результату §2.2:
   - Узнаём финальный список политик на profiles. Это нужно для документирования в lesson, а на саму миграцию не влияет.
4. **🟢 на содержимое миграции** §3 — apply на прод (RUNBOOK как у phase24/phase29).

После 🟢 — я создам файл `migrations/2026-05-16_phase31_pending_approval_access.sql`, выкачу его на прод через scp, выполню под gen_user через psql, проверю V1–V8, доложу в `_session/31_codeexec_phase31_applied.md`.

---

## 6. Открытые на ход (можешь решить сейчас или в Phase 2)

1. **Расширение guard на остальные таблицы** — зависит от §2.1. Если pvl_* открыты — расширяем. Если только справочники — оставляем.
2. **Backfill старых юзеров в pending_approval** — НЕ делаем. Все 56 уже одобрены де-факто. Подтверждаешь?
3. **VERIFY V8 как guardrail** — добавил проверку, что никто не сдвинут в pending после миграции. Если ожидание active=56 не совпадает — миграция не применяется чисто (rollback и расследование). Согласна?
