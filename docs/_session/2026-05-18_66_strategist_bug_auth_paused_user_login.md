# BUG-AUTH-PAUSED-USER-LOGIN — paused-юзер не может войти

**От:** стратег (claude.ai)
**Кому:** VS Code Claude Code
**Дата:** 2026-05-18 вечер
**Тип:** P0 production hotfix — пользователи не могут войти.
**Аффект:** 3 юзера (2 paused_manual + 1 pending_approval), один пожаловался в общий чат (Мария Бардина, mb1@bk.ru).

---

## Root cause (стратег раскрыл полностью)

`has_platform_access(target_user uuid)` функция:

```sql
SELECT EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id = target_user
    AND (p.role = 'admin' OR COALESCE(p.access_status, 'active') = 'active')
);
```

Возвращает `false` для всех не-admin с `access_status != 'active'` (т.е. `paused_manual`, `paused_billing`, `pending_approval`).

RLS на `profiles`:
```
profiles_active_access_guard_select | SELECT | RESTRICTIVE | has_platform_access(auth.uid())
profiles_active_access_guard_write  | ALL    | RESTRICTIVE | has_platform_access(auth.uid())
```

RESTRICTIVE — AND'ится поверх permissive. Для paused юзера `has_platform_access(auth.uid()) = false` → SELECT собственного profile возвращает 0 rows.

Login flow в `services/dataService.js:1239-1255`:
```js
const authUser = this._normalizeProfile(data.user);
let profile = await this._fetchProfile(authUser?.id);  // ← RLS режет, profile=null

// Safety net for partially migrated users
if (!profile && authUser?.id) {
    await this._ensurePostgrestUser({...});  // ← POST пытается создать профиль
    profile = await this._fetchProfile(authUser.id);
}
```

`_ensurePostgrestUser` бросает `'Не удалось создать пользователя в новой базе. Напишите администратору'` потому что:
- profile уже есть в БД (unique email constraint)
- ИЛИ RLS блокирует INSERT (та же restrictive guard)

Состояние на проде:
```
access_status        | count
---------------------|------
active               |   55
paused_manual        |    2   ← Мария + ещё 1
pending_approval     |    1
```

---

## Fix — однострочная миграция RLS

Файл: `migrations/2026-05-18_phase35_profiles_self_read_rls.sql`

```sql
-- migrations/2026-05-18_phase35_profiles_self_read_rls.sql
--
-- BUG-AUTH-PAUSED-USER-LOGIN — hotfix.
--
-- Контекст:
--   После phase31 (FEAT-023, RESTRICTIVE RLS-guards с has_platform_access)
--   юзеры с access_status != 'active' (paused_manual, paused_billing,
--   pending_approval) не могут читать СВОЮ собственную строку в profiles
--   при login. _fetchProfile возвращает null → frontend пытается
--   _ensurePostgrestUser → POST падает (email conflict / RLS) →
--   юзер видит "Не удалось создать пользователя в новой базе".
--
-- Реальные жертвы на 2026-05-18:
--   - mb1@bk.ru (Мария Бардина, leader, paused_manual)
--   - +1 paused_manual
--   - +1 pending_approval
--
-- Фикс:
--   Расширяем RESTRICTIVE SELECT-policy на profiles так, чтобы paused
--   юзер мог читать СВОЮ строку (id = auth.uid()), но не других. Для
--   других — has_platform_access guard остаётся, security не страдает.
--
-- WRITE остаётся жёстким: paused юзер не должен модифицировать данные.

BEGIN;

-- Pre: убедимся что policy существует и старая
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'profiles'
           AND policyname = 'profiles_active_access_guard_select'
           AND qual = 'has_platform_access(auth.uid())'
    ) THEN
        RAISE EXCEPTION 'phase35 pre: profiles_active_access_guard_select не найдена или уже patched';
    END IF;
END $$;

-- Re-create policy с self-row exception
DROP POLICY IF EXISTS profiles_active_access_guard_select ON public.profiles;

CREATE POLICY profiles_active_access_guard_select ON public.profiles
    AS RESTRICTIVE
    FOR SELECT
    TO authenticated
    USING (
        id = auth.uid()
        OR has_platform_access(auth.uid())
    );

-- Post: подтверждение
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'profiles'
           AND policyname = 'profiles_active_access_guard_select'
           AND qual LIKE '%id = auth.uid()%'
    ) THEN
        RAISE EXCEPTION 'phase35 post: policy не получила self-row exception';
    END IF;
    RAISE NOTICE 'phase35 post: OK — paused юзеры теперь могут читать свою строку';
END $$;

-- DDL safety-net (RUNBOOK 1.3)
SELECT public.ensure_garden_grants();

COMMIT;

-- ROLLBACK:
-- BEGIN;
--   DROP POLICY IF EXISTS profiles_active_access_guard_select ON public.profiles;
--   CREATE POLICY profiles_active_access_guard_select ON public.profiles
--       AS RESTRICTIVE FOR SELECT TO authenticated
--       USING (has_platform_access(auth.uid()));
--   SELECT public.ensure_garden_grants();
-- COMMIT;
```

---

## Frontend (опционально, после миграции БД)

После применения миграции login flow получит profile с `access_status='paused_manual'` → нужно убедиться что frontend корректно показывает `SubscriptionExpiredScreen` (а не пускает в приложение).

В `App.jsx` уже есть handler для `paused_*` → `setAccessBlock(...)`. **Проверь визуально** что Мария после миграции попадает на SubscriptionExpiredScreen, а не куда-то ещё. Если нужен дополнительный frontend fix — отдельным комментом.

---

## Apply flow

1. Diff-on-review в `_session/_68_codeexec_bug_auth_paused_user_login_diff.md` (короткий — миграция уже готова).
2. После 🟢 — apply миграции на прод через SSH+psql.
3. Single коммит `fix(rls): paused users can read own profile row (BUG-AUTH-PAUSED-USER-LOGIN)` + миграция + `_session/`.
4. Push.
5. **Smoke:** попросить Марию ещё раз попробовать войти. Ожидаемое — попадает на SubscriptionExpiredScreen ("Доступ приостановлен" или похожее), не на alert "Не удалось создать пользователя".

## Acceptance

- Мария может войти (попадает на правильный screen, без error alert).
- 2 paused_manual + 1 pending_approval юзеры — то же самое.
- Active юзеры — без регрессии (всё работает как раньше).
- Запись в pvl_audit_log (если ведём) — paused user не может читать чужие профили (security сохранена).

## Открытые вопросы

1. **`profiles_active_access_guard_write`** (ALL, RESTRICTIVE) — оставить или тоже расширить? Я бы **оставила жёстким** — paused юзер не должен PATCH'ить profile (особенно `access_status`). Если frontend ломается на каких-то PATCH'ах — отдельный recon.
2. **`pending_approval`** flow — register() в dataService.js:1304-1306 имеет special-case (`if access_status === 'pending_approval' return created;`). Но `login()` (line 1239+) такого special-case **не имеет** — pending юзер после миграции попробует залогиниться обычным flow. С новой policy он сможет SELECT свой profile → попадёт на screen в зависимости от access_status. Если нужно — добавим pending special-case в login.
