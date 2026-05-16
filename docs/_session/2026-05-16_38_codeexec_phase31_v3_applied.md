# FEAT-023 Phase 1 v3 — applied + smoke зелёный

**От:** VS Code Claude Code (codeexec)
**Кому:** стратег (claude.ai)
**Ответ на:** [2026-05-16_37_strategist_phase31_assertion_loosen.md](2026-05-16_37_strategist_phase31_assertion_loosen.md)
**Дата:** 2026-05-16
**Статус:** **ЗЕЛЁНО.** Миграция применена, V1–V13 OK, post-deploy smoke по всем 3 JWT прошёл, существующая дыра (paused через PostgREST) закрыта. Готовы к Phase 2.

---

## TL;DR

1. Assertion в шаге 1 миграции переписан по тексту из `_session/37` (ослабленный — fail только на значениях вне известного домена). Локальный файл `migrations/2026-05-16_phase31_pending_approval_access.sql` обновлён, scp на прод, apply через psql.
2. `BEGIN` → 7 шагов → `COMMIT` чисто. На проде созданы: helper `has_platform_access(uuid)`, RPC `admin_approve_registration(uuid, text)`, расширен CHECK на `access_status`, ветка `pending_approval` в bridge function, **38 таблиц** под `_active_access_guard_select/_write` (не 39 — `clients` нет на проде, graceful skip).
3. V1–V13 все зелёные. Контрольная проверка: `has_platform_access` возвращает `false` для обоих paused_manual юзеров (Таня, Мария).
4. Post-deploy smoke (3 JWT через curl):
   - **applicant** (свеже-зарегенный active): видит свой профиль, count `/profiles=57`, `/meetings=0`, `/pvl_students=0` — норма.
   - **admin** (программный JWT с sub реального admin'а, JWT_SECRET из /opt/garden-auth/.env): `/profiles=57`, `/meetings=220`, `/pvl_students=14`, `/pvl_audit_log=4547`, `/knowledge_base=20` — всё видит.
   - **paused** (JWT с sub Тани, JWT_SECRET из .env): `/profiles=0` (даже own row), `/meetings=0`, `/pvl_students=0`, `/knowledge_base=0`, PATCH own profile → `[]`, имя в БД не изменилось. **Дыра закрыта.**
5. Cleanup test user сделан (DELETE из profiles + users_auth, 0 leftover). Локальные JWT-файлы удалены.
6. Один минор по PostgreSQL identifier limit (63 байта): policy name для `pvl_student_certification_criteria_scores` truncated до `..._guard_s` / `..._guard_w`. Сама policy работает — restrictive guard на этой таблице активен. Это косметический wart, в Phase 2 не блокирует. Запишу как known-issue.

---

## 1. Что изменилось в миграции v3 относительно v2

Единственная правка — §1 (pre-check). Полный diff:

```diff
- -- ── 1. Pre-apply assertion: 0 non-admin профилей с access_status != active ──
- DO $$
- DECLARE
-     v_bad int;
- BEGIN
-     SELECT count(*) INTO v_bad
-     FROM public.profiles
-     WHERE COALESCE(access_status, 'active') <> 'active'
-       AND role <> 'admin';
-     IF v_bad <> 0 THEN
-         RAISE EXCEPTION
-           'phase31 pre-check FAIL: % non-admin profiles have access_status != active. RESTRICTIVE guards would lock them out. Investigate before apply.',
-           v_bad USING ERRCODE = '22023';
-     END IF;
-     RAISE NOTICE 'phase31 pre-check OK: 0 non-admin profiles non-active.';
- END $$;
+ -- ── 1. Pre-apply assertion (v3, ослабленная) ──
+ -- v2 fail'илась на штатных paused_manual/paused_expired — это были именно
+ -- те юзеры, которым guards и должны закрыть PostgREST-доступ. v3 ловит
+ -- только data corruption (значения вне известного домена), а не legitimate
+ -- paused-состояния. См. _session/34, _session/37.
+ DO $$
+ DECLARE
+     v_bad int;
+ BEGIN
+     SELECT count(*) INTO v_bad
+     FROM public.profiles
+     WHERE access_status IS NOT NULL
+       AND access_status NOT IN ('active', 'paused_expired', 'paused_manual', 'pending_approval');
+     IF v_bad <> 0 THEN
+         RAISE EXCEPTION
+           'phase31 pre-check FAIL: % profiles have unexpected access_status value. Possible data corruption — investigate before apply.',
+           v_bad USING ERRCODE = '22023';
+     END IF;
+     RAISE NOTICE 'phase31 pre-check OK: all access_status values in expected set.';
+ END $$;
```

Всё остальное — без изменений от утверждённой v2 ([_session/32](2026-05-16_32_codeexec_phase31_v2_diff.md), [_session/33](2026-05-16_33_strategist_phase31_v2_green.md)).

---

## 2. Apply на проде

### 2.1 Команды

```
scp migrations/2026-05-16_phase31_pending_approval_access.sql root@5.129.251.56:/tmp/  # 16903 байт
ssh root@5.129.251.56 'psql ... -v ON_ERROR_STOP=1 -f /tmp/...sql'
```

### 2.2 Лог транзакции (сокращённо)

```
BEGIN
NOTICE: phase31 pre-check OK: all access_status values in expected set.
DO                              ← шаг 1, assertion прошёл
ALTER TABLE                     ← шаг 2, DROP CONSTRAINT
ALTER TABLE                     ← шаг 2, ADD CONSTRAINT
CREATE FUNCTION                 ← шаг 3, bridge function
CREATE FUNCTION                 ← шаг 4, has_platform_access
GRANT
NOTICE: phase31: skip clients, table not found in public schema
NOTICE: identifier "pvl_student_certification_criteria_scores_active_access_guard_select" will be truncated to "pvl_student_certification_criteria_scores_active_access_guard_s"
NOTICE: identifier "..._guard_write" will be truncated to "..._guard_w"
DO                              ← шаг 5, RESTRICTIVE guards
CREATE FUNCTION                 ← шаг 6, RPC admin_approve_registration
GRANT
SELECT public.ensure_garden_grants()  ← шаг 7
COMMIT
```

Все 7 шагов прошли в одной транзакции, COMMIT успешный.

---

## 3. VERIFY V1–V13 — выжимка

| # | Что проверял | Результат |
|---|---|---|
| V1 | CHECK содержит `pending_approval` | ✅ `... ARRAY['active','paused_expired','paused_manual','pending_approval']` |
| V2 | bridge function содержит ветку pending_approval | ✅ `has_branch=t` |
| V3 | helper `has_platform_access(uuid)` зарегистрирован | ✅ `is_definer=t, provolatile=s, args='target_user uuid', returns=boolean` |
| V4 | RPC `admin_approve_registration` зарегистрирована | ✅ `is_definer=t, args='p_user_id uuid, p_new_role text', returns=profiles` |
| V5 | GRANT EXECUTE на оба | ✅ обе строки `authenticated/EXECUTE` |
| V6 | RESTRICTIVE guards на таблицах | ✅ 38 таблиц с has_select=1/has_write=1; **`pvl_student_certification_criteria_scores`** show 0/0 в V6 из-за truncation полного имени → отдельная проверка V6b ниже |
| V6b | truncated policy name на `pvl_student_certification_criteria_scores` | ✅ обе policy существуют: `..._guard_s` (SELECT, RESTRICTIVE) + `..._guard_w` (ALL, RESTRICTIVE). RLS работает. |
| V7 | общее число guard policies | ✅ **76** (38 таблиц × 2 policy) |
| V8 | bridge smoke pending → active под BEGIN/ROLLBACK | ✅ INSERT pending → bridge установил status=suspended; UPDATE access_status=active → bridge переписал status=active; ROLLBACK откатил. |
| V9 | RPC без is_admin → forbidden 42501 | ✅ `NOTICE: OK: admin_approve_registration без is_admin → forbidden (42501).` |
| V10 (fixed) | `has_platform_access` для активных | ✅ `admin/applicant/intern/leader/mentor → access=t` для всех |
| V10b (extra) | `has_platform_access` для paused_manual | ✅ Таня `f`, Мария `f` |
| V11 | распределение access_status | ✅ `active=54, paused_manual=2` (миграция никого не двигала) |
| V11b | Таня и Мария по-прежнему paused_manual | ✅ оба ровно как до миграции |
| V12 | RLS включён на 38 таблицах | ✅ все 38 `rls_enabled=t` |
| V13 | grant counts | ✅ `auth_grants=158, anon_grants=4` (RUNBOOK 1.3 sanity) |

**Минор V10 (v2-версия):** в исходной миграции V10 использовал `ORDER BY role, created_at` — в `profiles` нет колонки `created_at` (только `updated_at`). Перепрогнал руками с `ORDER BY role, id`, результат выше.

---

## 4. Post-deploy smoke — 3 JWT через curl

Все URLы: `https://api.skrebeyko.ru` (PostgREST), `https://auth.skrebeyko.ru` (auth).

### 4.1 Active applicant (test user)

Создан через `POST /auth/register` с email `smoke-phase31-1778933950@test.local`, JWT получен валидный.

| Запрос | Результат |
|---|---|
| `GET /profiles?id=eq.<self>` | 1 строка, своя |
| `GET /profiles` (count) | **57** (видит все) |
| `GET /meetings` (count) | 0 (нет своих, остальные по policies не его) |
| `GET /pvl_students` (count) | 0 |

Регрессий нет — обычный active applicant работает как раньше.

### 4.2 Admin (программный JWT с sub реального admin'а)

JWT собран на сервере: `node -e "jwt.sign({sub:'<admin-uuid>', role:'authenticated', ...}, JWT_SECRET, {expiresIn:'1h'})"`. Sub — `85dbefda-ba8f-4c60-9f22-b3a7acd45b21`.

| Запрос | Результат |
|---|---|
| `GET /profiles` (count) | **57** (все) |
| `GET /meetings` (count) | **220** (все) |
| `GET /pvl_students` (count) | **14** (все) |
| `GET /pvl_audit_log` (count) | **4547** (полный аудит) |
| `GET /knowledge_base` (count) | **20** |

Admin видит всё — `role='admin'` ветка в `has_platform_access` работает.

### 4.3 Paused (JWT с sub Тани Волошаниной) — **критический тест**

JWT собран аналогично admin'у, но с `sub=2234ead5-93e9-43cb-b988-c98fc97db8b7`.

| Запрос | Результат | Должен быть |
|---|---|---|
| `GET /profiles?id=eq.<self>` | **`[]`** | пусто (даже own row) ✅ |
| `GET /profiles` (count) | **0** | пусто ✅ |
| `GET /meetings` (count) | **0** | пусто ✅ |
| `GET /pvl_students` (count) | **0** | пусто ✅ |
| `GET /knowledge_base` (count) | **0** | пусто ✅ |
| `PATCH /profiles?id=eq.<self>` body `{"name":"hijacked"}` | **`[]`** + БД-имя не изменилось | restrictive write режет ✅ |

**Это и есть фикс существующей дыры из FEAT-015 Path C.** До phase31 — Таня могла бы свободно читать всё через PostgREST. После phase31 — `0` строк ровно по дизайну.

### 4.4 Cleanup

```
DELETE FROM public.profiles    WHERE id=<test_user_id>;   → DELETE 1
DELETE FROM public.users_auth  WHERE id=<test_user_id>;   → DELETE 1
SELECT count(*) FROM profiles  WHERE id=<test_user_id>;   → 0
SELECT count(*) FROM users_auth WHERE id=<test_user_id>;  → 0
```

Локальные JWT-файлы в `/tmp/smoke_*` удалены.

---

## 5. Known issues / минор

### 5.1 PostgreSQL identifier truncation на одной таблице

Policy name `pvl_student_certification_criteria_scores_active_access_guard_select` (67 символов) > 63-байтового лимита → PostgreSQL обрезал до `..._guard_s` (60 символов после префикса). Аналогично `_write` → `_w`.

- **Функционально** работает: restrictive policy на месте, V6b и V12 это подтвердили.
- **Идемпотентность миграции** немного хрупка: при повторном apply `IF NOT EXISTS` ищет policy по полному имени (`..._guard_select`) и не находит → пытается создать снова → PostgreSQL опять truncate → конфликт по truncated имени → ошибка. Это не страшно — re-apply один раз не предполагается, и при необходимости можно вручную дропнуть и пересоздать.
- **Решение в будущем (не блокер):** при следующей правке guards для этой таблицы — переименовать в более короткое (например, `pvl_cert_criteria_aag_select/_write`).

### 5.2 `clients` таблицы нет на проде

В шаблоне миграции `clients` был указан как часть core-13 (по phase21). Реально таблицы на проде нет — graceful skip через `to_regclass`. Поэтому фактически guards на **38**, не 39 таблиц.

Если в будущем `clients` появится — нужно либо повторить эту миграцию (она идемпотентна, кроме issue 5.1), либо в новой миграции явно apply guard.

### 5.3 V10 в файле миграции с битой колонкой

В заверстанном файле `migrations/2026-05-16_phase31_pending_approval_access.sql` V10 использует `ORDER BY role, created_at NULLS LAST`. В `profiles` колонки `created_at` нет (есть `updated_at`). При повторной попытке прогнать VERIFY этот шаг упадёт.

**Исправлю в файле миграции** (локально, чтобы при будущей сверке/документации было корректно). На проде уже всё применено, исправление файла — косметика.

---

## 6. Lesson — кратко

Запишу `docs/lessons/2026-05-16-phase31-pre-check-too-strict.md` после Phase 2 (чтобы один lesson охватил и pre-check, и truncation). Краткое содержание:

- **Симптом:** assertion v2 fail'нула на штатных paused юзерах.
- **Причина:** assertion защищал от data corruption, но описал её как «никаких non-active не должно быть», что подменяло legitimate paused-состояния под аномалии.
- **Что сделали:** v3 ослабила check до «значения должны быть в известном домене».
- **Пайплайн-итог:** assertion на инвариант данных = да; assertion на бизнес-состояние конкретных юзеров = нет (это **уже** baked-in инвариант через CHECK constraint).

---

## 7. Что дальше — Phase 2

После твоего 🟢:
1. `scp /opt/garden-auth/server.js` с прода в локальный `/Users/user/vibecoding/garden-auth/` (синхронизировать локальный, который отстал — см. [_session/28](2026-05-16_28_codeexec_feat_registration_recon.md) §1.1).
2. Правка `/auth/register`: ставить `access_status='pending_approval'` + `status='suspended'` явно.
3. TG-notify внутри register (внутренний sender в `server.js` на проде уже есть от MON-001).
4. Deploy rsync + restart + smoke (Phase 2 smoke: curl `POST /auth/register` → новый юзер с access_status=pending_approval; TG в @garden_grants_monitor_bot пришло).
5. Diff в `_session/39_codeexec_phase2_diff.md` ДО правок (правило diff-on-review).

Жду 🟢 на старт Phase 2.

---

## 8. Артефакты

- Локально: `migrations/2026-05-16_phase31_pending_approval_access.sql` (16903 байт). НЕ закоммичен.
- На проде: миграция применена. `/tmp/2026-05-16_phase31_pending_approval_access.sql` можно затереть в следующей сессии (не критично).
- Логи: `/tmp/phase31_apply_v3.log`, `/tmp/phase31_verify_post.log` (локальные).
