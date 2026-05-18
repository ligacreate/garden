# BUG-AUTH-PAUSED-USER-LOGIN — diff на ревью (короткий)

**От:** codeexec (VS Code)
**Кому:** Ольга → стратегу
**Дата:** 2026-05-18
**В ответ на:** [_66](2026-05-18_66_strategist_bug_auth_paused_user_login.md)
**Статус:** ⏳ жду 🟢. После — apply на прод, single commit + push.

---

## Подтверждение recon

Текущая policy на проде (read-only через psql под `gen_user`):

```
             policyname              | permissive  |  cmd   |              qual
-------------------------------------+-------------+--------+---------------------------------
 profiles_active_access_guard_select | RESTRICTIVE | SELECT | has_platform_access(auth.uid())
 profiles_active_access_guard_write  | RESTRICTIVE | ALL    | has_platform_access(auth.uid())
```

Строка `qual` ровно совпадает с pre-assertion в миграции — `WHERE qual = 'has_platform_access(auth.uid())'` пройдёт. Pre-check защищает от двойного apply.

Frontend готов к paused-юзерам:
- [App.jsx:6](../../App.jsx#L6) `import SubscriptionExpiredScreen`
- [App.jsx:25](../../App.jsx#L25) `accessBlock` state
- [App.jsx:178, :210, :269](../../App.jsx#L178) — три точки `setAccessBlock(...)` (login + token refresh + access check)
- [App.jsx:499](../../App.jsx#L499) — рендер `<SubscriptionExpiredScreen .../>`

После миграции `_fetchProfile` вернёт реальный объект с `access_status='paused_manual'/'pending_approval'`, login flow в `services/dataService.js:1239` пойдёт нормальным путём (без `_ensurePostgrestUser`), `App.jsx` повесит `accessBlock` → пользователь увидит `SubscriptionExpiredScreen`. Без дополнительных frontend-правок.

## Миграция

`migrations/2026-05-18_phase35_profiles_self_read_rls.sql` — точно как в брифе [_66](2026-05-18_66_strategist_bug_auth_paused_user_login.md), полная копия без изменений.

Effective diff в RLS policy:

```diff
-USING (has_platform_access(auth.uid()))
+USING (
+    id = auth.uid()
+    OR has_platform_access(auth.uid())
+)
```

Через `DROP POLICY IF EXISTS` + `CREATE POLICY` (postgres не поддерживает `ALTER POLICY ... USING (...)` для изменения qual). Внутри транзакции, riско-нейтрально.

## Открытые вопросы стратегу

1. **`profiles_active_access_guard_write` (ALL, RESTRICTIVE)** — НЕ трогаем (по [_66 §1](2026-05-18_66_strategist_bug_auth_paused_user_login.md#L173)). Paused юзер не должен PATCH'ить даже свой профиль (особенно `access_status`). Принято.
2. **`pending_approval` flow** — после миграции `_fetchProfile` для pending-юзера вернёт строку с `access_status='pending_approval'`. App.jsx сейчас имеет ветку `accessBlock` для `paused_*` — нужно проверить, что pending тоже корректно маршрутизируется (на PendingApprovalScreen или хотя бы на тот же SubscriptionExpiredScreen с понятным текстом). Если App.jsx сейчас не знает про `pending_approval` — пользователь увидит «недоступен» по дефолту, но без явного «ожидайте одобрения». Это **отдельный тикет** (FEAT-023-PHASE-3 уже в P2 бэклоге, см. _64). НЕ блокер для этого hotfix'а.
3. **2 paused_manual + 1 pending_approval** — общее count на проде 3 жертвы. Все получат пользу одной миграцией.

## Apply flow (после 🟢)

1. SSH+psql apply миграции `2026-05-18_phase35_profiles_self_read_rls.sql`.
2. Verify через NOTICE из post-assert + повторный `\d policies` запрос.
3. Single commit: `fix(rls): paused users can read own profile row (BUG-AUTH-PAUSED-USER-LOGIN)` + миграция + _66/_68/_69(applied).
4. Push, GH Actions деплоит фронт (фронт не задет, но _session коммитим).
5. Smoke — Мария Бардина пробует войти.

## Acceptance criteria (per бриф)

- Мария Бардина (`mb1@bk.ru`) может войти → попадает на `SubscriptionExpiredScreen` или аналогичный, без alert «Не удалось создать пользователя».
- Второй `paused_manual` + один `pending_approval` — то же.
- Active юзеры — без регрессии (login работает как раньше).
- Security сохранена: paused user НЕ может читать чужие профили (verify через psql под student-JWT'ом, опционально).

Жду 🟢 или комменты.
