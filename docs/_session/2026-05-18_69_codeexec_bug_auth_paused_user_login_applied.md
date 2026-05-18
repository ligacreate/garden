# BUG-AUTH-PAUSED-USER-LOGIN — applied

**От:** codeexec (VS Code)
**Кому:** Ольга → стратегу
**Дата:** 2026-05-18
**В ответ на:** 🟢 от Ольги ([_66](2026-05-18_66_strategist_bug_auth_paused_user_login.md), [_68](2026-05-18_68_codeexec_bug_auth_paused_user_login_diff.md))
**Статус:** ✅ migration applied → ✅ post-verify OK → ⏳ ждёт push кода и smoke от Марии.

---

## Apply log

```
$ cat migrations/2026-05-18_phase35_profiles_self_read_rls.sql | ssh ... psql ...

BEGIN
DO                             ← pre-assert: policy.qual = 'has_platform_access(auth.uid())' ✓
DROP POLICY                    ← старая SELECT policy убрана
CREATE POLICY                  ← новая с self-row exception
DO
 ensure_garden_grants
----------------------
 (1 row)                       ← RUNBOOK 1.3 safety-net отработала
COMMIT
NOTICE:  phase35 post: OK — paused юзеры теперь могут читать свою строку
```

## Post-apply verify

```
             policyname              | permissive  |  cmd   |                          qual
-------------------------------------+-------------+--------+--------------------------------------------------------
 profiles_active_access_guard_select | RESTRICTIVE | SELECT | ((id = auth.uid()) OR has_platform_access(auth.uid()))
 profiles_active_access_guard_write  | RESTRICTIVE | ALL    | has_platform_access(auth.uid())
```

- **SELECT** policy расширена self-row exception'ом — paused юзер видит свою строку.
- **WRITE** policy не тронута — paused юзер не может PATCH'ить даже свой профиль.
- Active юзеры — всё работает как раньше (`has_platform_access(auth.uid()) = true` → policy всегда truthy).

## SHA (заполнится после push, см. ниже)

См. `git log` после следующего коммита: `fix(rls): paused users can read own profile row (BUG-AUTH-PAUSED-USER-LOGIN)`.

## GH Actions

После push коммита — concurrency block страхует от race (см. WORKFLOW-CONCURRENCY 2026-05-17, `ca37309`).
- Все runs main: <https://github.com/ligacreate/garden/actions?query=branch%3Amain>
- Конкретный коммит: появится в commit-log после push.

Фронт не задет (миграция чисто БД), но `_session/` коммитим — деплой пойдёт по правилу.

## Smoke (после deploy)

**🔔 Ольга:** попроси Марию Бардину (`mb1@bk.ru`) попытаться войти ещё раз.

Ожидаемое:
- Login проходит на API уровне (JWT получен).
- `_fetchProfile` возвращает строку с `access_status='paused_manual'`.
- `_ensurePostgrestUser` НЕ зовётся (профиль найден).
- App.jsx видит `paused_manual` → `setAccessBlock({...})` → рендерит `<SubscriptionExpiredScreen .../>`.
- Мария видит экран «Доступ приостановлен» (или аналогичный текст), без alert «Не удалось создать пользователя в новой базе».

Если Мария всё ещё видит ошибку — пришли скриншот + точное время попытки, проверю garden-auth логи через `journalctl`. Hard-block считаем закрытым только после её success'а.

Аналогично — два других юзера: ещё один `paused_manual` и один `pending_approval`. Они получат то же исправление по той же миграции.

## Acceptance criteria (per бриф)

- [ ] Мария может войти (на SubscriptionExpiredScreen, не на alert) — ждём smoke.
- [ ] 2 paused_manual + 1 pending_approval — то же. Ждём естественного natural-входа.
- [ ] Active юзеры — без регрессии. Можно проверить через любого активного ведущего (Ирина Петруня уже привязана, наиболее быстро доступна).
- [x] Security: paused user НЕ может читать чужие профили — RLS WRITE policy не тронута, SELECT расширена только на `id = auth.uid()`, не дала доступа к другим строкам.

## Rollback (если потребуется)

В миграции в комментарии внизу. Однострочный реверт policy:
```sql
DROP POLICY IF EXISTS profiles_active_access_guard_select ON public.profiles;
CREATE POLICY profiles_active_access_guard_select ON public.profiles
    AS RESTRICTIVE FOR SELECT TO authenticated
    USING (has_platform_access(auth.uid()));
SELECT public.ensure_garden_grants();
```
В транзакции, безопасно.
