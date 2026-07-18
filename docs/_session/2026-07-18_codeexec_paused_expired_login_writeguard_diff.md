# DIFF-ON-REVIEW — фикс входа замкнутых (paused_expired) — FOR ALL write-guard

**Дата:** 2026-07-18
**Автор:** codeexec
**Статус:** ✅ ПРИМЕНЕНО 2026-07-18 (🟢) + верифицировано её JWT'ом через PostgREST. Громова и все paused_expired читают свою строку; запись закрыта; утечки нет; active без регресса. Урок: `docs/lessons/2026-07-18-paused-expired-login-forall-writeguard.md`.
**Жертва:** Громова (muza_skorpi@mail.ru / d427f212, paused_expired, intern) + все 19 paused_expired.

## Что ИСКЛЮЧЕНО (проверено, не тратить)
- RLS phase35 self-row exception **на месте** (`profiles_active_access_guard_select` = `(id=auth.uid()) OR has_platform_access()`). Переприменять НЕ надо.
- `users_auth.id = profiles.id = d427f212`, её строка в БД есть.
- garden-auth подписывает `signToken({ sub: user.id, … })` → в JWT корректный `sub`. Токен не при чём.
- Table-GRANT'ы authenticated здоровы (171/4, не wipe-окно). Ежедневный wipe 13:10 UTC — не причина ЭТОГО отказа (в 13:41 гранты были целы).
- `auth`-схема USAGE=f под psql SET ROLE — **артефакт симуляции**, не прод: в живом PostgREST `auth.uid()` работает (active это доказывает).

## Root cause (owner layer = RLS на profiles)
`profiles_active_access_guard_write` (phase31) создан как RESTRICTIVE **`FOR ALL`** → его `USING has_platform_access(auth.uid())` применяется и к **SELECT**. RESTRICTIVE склеиваются по AND:

```
эффективный SELECT-фильтр =
  guard_select ((id=uid) OR hpa)  AND  guard_write (hpa)  ==  hpa
```

У замкнутых `hpa=false` → своя строка не читается, self-row phase35 **аннулирован** write-guard'ом. Active/admin (`hpa=true`) проходят — баг был замаскирован до массового paused_expired (замок 2026-07-12).

**Цепочка:** `_fetchProfile`→`[]`/null → `_ensurePostgrestUser` POST → **42501** `violates "profiles_active_access_guard_write"` → «Не удалось создать пользователя».

## Доказательство (read-only, ROLLBACK-тест на проде 2026-07-18)
| Условие (как authenticated, sub=d427f212) | own-row |
|---|---|
| как есть (guard_write FOR ALL) | **0** |
| в откате: DROP guard_write | **1** (и всего 1 = только своя) |
| предикаты по отдельности | `permissive_ok=t`, `id_eq_uid=t`, `hpa=f` — клозы TRUE, но AND с write-guard режет |

Прямой PostgREST-репро (её JWT): `GET own-row → [] (200)`, `GET all → [] (200)`, `POST → 42501 (403)`. Active-контроль: свою строку читает, всех видит.

## Фикс — `migrations/2026-07-18_phase46_profiles_writeguard_split.sql`
Расщепить `FOR ALL` write-guard на command-specific, чтобы SELECT перестал им гейтиться:
```sql
DROP POLICY profiles_active_access_guard_write ON public.profiles;      -- был FOR ALL
CREATE POLICY ..._guard_insert FOR INSERT WITH CHECK (has_platform_access(auth.uid()));
CREATE POLICY ..._guard_update FOR UPDATE USING (…) WITH CHECK (…);
CREATE POLICY ..._guard_delete FOR DELETE USING (has_platform_access(auth.uid()));
```
SELECT остаётся под `guard_select` (self-row OR hpa). Запись замкнутым по-прежнему закрыта. Есть pre/post-assert + `ensure_garden_grants()`. Правим ТОЛЬКО profiles.

## Security (не регрессирует — «269 держится»)
- SELECT: замкнутый видит ТОЛЬКО свою строку; чужие профили 0; другие таблицы 0 (их select-guard'ы без self-row).
- INSERT/UPDATE/DELETE: `hpa`-only → замкнутый писать не может.

## Unblock
Фикс = unblock. DB-only, без окна/даунтайма, без фронта. Разблокирует всех 19 paused_expired разом. Отдельный per-user хак не нужен (менять `access_status` нельзя — дало бы полный доступ в обход оплаты).

## Apply flow (после 🟢)
1. `psql -f migrations/2026-07-18_phase46_profiles_writeguard_split.sql` под gen_user (один SSH-коннект, fail2ban).
2. Verify (read-only, её JWT через PostgREST): `GET own-row → 1 строка`; `GET all → 1` (нет утечки); `POST/UPDATE → 42501` (запись всё ещё закрыта); paused-контроль ещё один uid; active-контроль без регресса.
3. Frontend-smoke: Громова входит → `SubscriptionExpiredScreen` → checkout (фронт не менялся, флоу `_assertActive`→accessBlock уже есть).
4. Commit: миграция + этот diff + урок `docs/lessons/`. Фронт не задет → пуш только для _session/lesson (деплой не критичен, можно приложить к следующему).

## Открытый вопрос
- Кто применяет миграцию — я по твоему go или ты. Колонок/данных не трогает, только политики. Без окна.
