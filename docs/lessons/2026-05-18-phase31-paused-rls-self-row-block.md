---
title: RESTRICTIVE RLS-guard на profiles превращает «приостановку» в hard-block на login
date: 2026-05-18
caught_at: production (3 жертвы: Мария Бардина mb1@bk.ru + 2 ещё paused/pending)
related:
  - migrations/2026-05-04_phase31_*.sql (FEAT-023 — RESTRICTIVE guards на 38 таблиц)
  - migrations/2026-05-18_phase35_profiles_self_read_rls.sql (hotfix)
  - docs/_session/2026-05-18_66_strategist_bug_auth_paused_user_login.md (recon)
  - docs/_session/2026-05-18_68_codeexec_bug_auth_paused_user_login_diff.md (diff)
  - commit 528b0a4 (fix)
audience: будущий codeexec/стратег при вводе любого RESTRICTIVE-гарда на таблицу,
  которую юзер читает про себя
---

# RESTRICTIVE RLS-guard на profiles превращает «приостановку» в hard-block на login

## Симптом

Мария Бардина (`mb1@bk.ru`, leader, `access_status='paused_manual'`) пишет в общий
чат: «Не могу войти, говорит "Не удалось создать пользователя в новой базе.
Напишите администратору"». Та же ошибка у ещё 2 юзеров (1 `paused_manual` +
1 `pending_approval`). Активные юзеры заходят нормально.

## Корневая причина

Phase31 (FEAT-023) ввела RESTRICTIVE RLS-guard `has_platform_access(auth.uid())`
на 38 public-таблиц, **включая `profiles`**:

```sql
profiles_active_access_guard_select  RESTRICTIVE FOR SELECT
  USING (has_platform_access(auth.uid()))
profiles_active_access_guard_write   RESTRICTIVE FOR ALL
  USING (has_platform_access(auth.uid()))
  WITH CHECK (has_platform_access(auth.uid()))
```

`has_platform_access(target_user)` возвращает `true` только если
`role='admin'` ИЛИ `access_status='active'`. Для всех `paused_*` /
`pending_approval` — `false`.

RESTRICTIVE-policy в Postgres `AND`'ится поверх PERMISSIVE → SELECT собственной
строки в `profiles` возвращает **0 rows** для приостановленного юзера.

Login flow в `services/dataService.js:1239-1255`:

```js
let profile = await this._fetchProfile(authUser?.id);  // ← RLS режет, profile=null
if (!profile && authUser?.id) {
    await this._ensurePostgrestUser({...});  // ← POST падает: email conflict / RLS WITH CHECK
    profile = await this._fetchProfile(authUser.id);
}
// profile всё ещё null → throw 'Не удалось создать пользователя в новой базе'
```

Каскад:
1. Phase31 hide own row → `_fetchProfile` = null.
2. Frontend интерпретирует null как «нет профиля» (legacy safety net для
   мигрирующих юзеров) → пытается создать.
3. INSERT либо падает на UNIQUE(email), либо на той же RESTRICTIVE WITH CHECK.
4. Юзер видит generic error и не может ничего сделать сам.

«Приостановка» планировалась как мягкий статус (нельзя писать, можно посмотреть
свой кабинет) — стала hard-block на login.

## Почему так получилось

1. **«Восстановление RLS» думалось через единый шаблон.** Phase31 натянул один и
   тот же RESTRICTIVE guard на 38 таблиц — мускульная защита от «забыли где-то
   ограничить». Без разделения «таблицы, которые юзер читает про себя» vs
   «таблицы общего пользования».
2. **Тестировали на admin и active юзерах.** Они проходят
   `has_platform_access` тривиально → smoke зелёный → выкатили.
3. **Семантика `access_status` дрейфовала.** На момент phase31 был только
   `active` и подразумевалось «остальное не должно влиять на login». Когда
   позже ввели `paused_manual` / `paused_billing` / `pending_approval`, никто
   не пересмотрел RLS-каркас под новые значения.
4. **`has_platform_access` сама по себе спроектирована корректно** — она
   возвращает true/false. Ошибка не в функции, а в том, что RESTRICTIVE-guard
   её применяет к **собственной строке профиля** (которая нужна даже для
   `paused`, чтобы UI понял «вот ты и вот твой статус»).

## Как починили

Phase35 (commit `528b0a4`) — расширение SELECT-policy с self-row exception:

```sql
DROP POLICY IF EXISTS profiles_active_access_guard_select ON public.profiles;
CREATE POLICY profiles_active_access_guard_select ON public.profiles
    AS RESTRICTIVE FOR SELECT TO authenticated
    USING (
        id = auth.uid()
        OR has_platform_access(auth.uid())
    );
```

- `id = auth.uid()` — каждый видит **только свою** строку даже если приостановлен.
- `has_platform_access(auth.uid())` — остальные строки видят только active/admin.
- WRITE-policy **не трогаем** — paused юзер не должен PATCH'ить (включая свою
  строку: например `access_status` может менять только admin/Prodamus-вебхук).

Smoke под JWT Марии (paused_manual): `SELECT * FROM profiles WHERE id=auth.uid()`
вернул её строку. Login прошёл.

## Bonus issue — manual UPDATE против UI

До phase35 Ольга пыталась размять Марию через админ-UI («поставь обратно active»).
Не помогло: `toggleUserStatus` в `services/dataService.js` PATCH'ит
**`profiles.status`** (старое поле), а не `profiles.access_status` (новое поле,
которое читает `has_platform_access`). Это **BUG-TOGGLE-USER-STATUS-GHOST-COLUMN**
(уже в backlog, заведён 2026-05-04 при phase21).

PostgREST принимает PATCH с лишним ключом и **молча игнорирует unknown column**,
если у пользователя нет права писать в эту колонку (а нет — её просто нет в
схеме). Никакой ошибки на фронт не возвращается → Ольга думает «изменил статус»,
а реально ничего не поменялось. Размять Марию пришлось через psql под `gen_user`:
`UPDATE profiles SET access_status='active' WHERE id='...'`.

## Принцип на будущее (для backlog/чек-листа)

**При вводе RESTRICTIVE RLS-guard на таблицу с самореференциальными запросами
(юзер читает свою же строку — `profiles`, `users_auth`, `subscriptions`,
`user_settings`) всегда добавляй `OR id = auth.uid()` exception.**

Иначе любая логика «приостановки доступа» превращается в hard-block на login,
потому что фронту нужно прочитать собственный профиль ДО решения «куда тебя
маршрутизировать» (включая страницу «вы на паузе»).

Альтернативная защита: если хочешь спрятать **поля** для paused (например, не
показывать его другим юзерам), используй **column-level grants** или
view-обёртку, а RLS-policy на «свой ID» оставь permissive.

## Что проверить в будущем — паттерн

При следующей RLS-миграции с RESTRICTIVE на user-facing таблице — пройти
чек-листом:

1. **Может ли юзер прочитать СВОЮ строку этой таблицы под любой ролью /
   `access_status`?** Если ответ «нет» — добавь `OR id = auth.uid()` (или
   эквивалент по FK к auth-юзеру).
2. **Что делает фронт когда `_fetchProfile`/`_fetchSettings`/etc возвращает
   null?** Если запускает «safety net» создания → проверь, не получишь ли
   email-conflict / unique constraint hell.
3. **Существуют ли в этой таблице «промежуточные статусы»** (paused, suspended,
   pending, archived)? Проверь под JWT юзера в каждом таком статусе, не только
   active.
4. **Прогон smoke под JWT неактивного юзера** через `set_config('request.jwt.claims', ...)`
   в psql + `SET LOCAL ROLE authenticated` — обязательный шаг перед applied
   RLS-миграции, которая трогает таблицу с собственными записями юзеров.

## Related

- `has_platform_access(uuid)` — STABLE SECURITY DEFINER, корректная by design,
  ошибка не в ней.
- BUG-TOGGLE-USER-STATUS-GHOST-COLUMN (BACKLOG.md, P2) — фронт PATCH'ит
  несуществующую колонку, маскирует невозможность размять юзера через UI.
- Phase31 (FEAT-023) — RESTRICTIVE guards на 38 таблиц. Возможно ещё несколько
  таблиц имеют ту же проблему «не видишь свою строку» для не-active — нужно
  пройтись чек-листом выше по каждой.

## Smoke verified

После phase35 apply:

- `SELECT count(*) FROM profiles WHERE id = auth.uid()` под JWT Марии
  (paused_manual) = 1 row.
- Мария вошла в платформу 2026-05-18 (см. _session/_69 Step 2 + commit `be61966`
  про разморозку до `active`).
