# BUG-PVL-ONBOARDING-MISSING-STUDENT-RECORD — implementation DIFF

**От:** codeexec (VS Code Claude Code)
**Кому:** стратега (claude.ai) → Ольга
**Дата:** 2026-05-23
**В ответ на:** `_109_strategist_pvl_onboarding_impl_brief.md`
**Тип:** DIFF на ревью. **Без apply / commit / push.** Жду 🟢.

---

## TL;DR

- Mini-recon (Задача A) → выбран механизм **(c) Комбинированный** триггер `AFTER UPDATE OF role, access_status` с OR-логикой в WHEN. Обоснование в Section 2.
- Миграция (Задача B) → файл [`migrations/2026-05-23_phase37_pvl_onboarding_atomic.sql`](../../migrations/2026-05-23_phase37_pvl_onboarding_atomic.sql) — одна транзакция, 8 секций. Pre-check + backfill-assertion + verify-блок снаружи COMMIT.
- Smoke-план (Задача C) → ниже, paste-ready SQL + 3 UI-сценария + rollback.
- Скоп жёстко по `_109`: НЕ удаляем client-side ensure-loop, НЕ обёртываем `/auth/register` в BEGIN/COMMIT, НЕ меняем RLS.

---

## 0. Файлы в diff'е

| файл | действие | LoC |
|------|----------|-----|
| `migrations/2026-05-23_phase37_pvl_onboarding_atomic.sql` | NEW | ~220 |

Это всё. Никаких правок в `services/`, `views/`, `App.jsx`, `garden-auth/` — серверная миграция полностью закрывает корень. Cleanup client-side ensure-loop (ARCH-012) — отдельным PR через 2-3 дня (Задача D из `_109` пункт 1).

---

## 1. Mini-recon flow одобрения (Задача A)

### 1.1 Где админ одобряет в UI

Два независимых admin-action в [views/AdminPanel.jsx](../../views/AdminPanel.jsx):

**Action A1 — смена роли** ([line 1226](../../views/AdminPanel.jsx#L1226)):
```jsx
<select value={u.role}
        onChange={(e) => onUpdateUserRole(u.id, e.target.value)} ...>
```
Handler [App.jsx:307-321](../../App.jsx#L307): `api.updateUser({ id, role })` → PATCH `/profiles?id=eq.<uuid>` с body `{ role }` ([dataService.js:1607](../../services/dataService.js#L1607)).

**Action A2 — суспенд/анбан** ([line 1253-1280](../../views/AdminPanel.jsx#L1253)):
кнопка ⛔️/⏸ → `api.toggleUserStatus(u.id, isSuspended ? 'active' : 'suspended')` → PATCH `/profiles` с body `{ status: 'active'|'suspended', access_status: 'active'|'paused_manual' }` ([dataService.js:1681-1697](../../services/dataService.js#L1681)).

### 1.2 Что меняется в БД при одобрении

**Сценарий регистрация → одобрение** (Суроватская сегодня):
1. `/auth/register` → `profiles.role='applicant'`, `status='suspended'`, `access_status='pending_approval'`.
2. Админ открывает /admin → видит её в списке с ⛔️ кнопкой (status=suspended).
3. Админ нажимает ⛔️ → `toggleUserStatus(id, 'active')` → PATCH с `{status:'active', access_status:'active'}`.
4. Опционально — админ меняет role в dropdown'е (applicant → intern, если хочет сразу промоутить).

**Промоушн applicant → intern → leader:** просто dropdown в той же админке (Action A1).

### 1.3 Промоушн (applicant → intern → leader) — отдельные или один action?

**Отдельные.** Каждое изменение role — отдельный PATCH. UI не имеет combo-action «promote». Также нет отдельной кнопки «одобрить»: одобрение де-факто = unblock через ⛔️/⏸.

### 1.4 RPC admin_approve_registration существует, но UI её НЕ использует

В [phase31](../../migrations/2026-05-16_phase31_pending_approval_access.sql#L191) есть RPC `admin_approve_registration(p_user_id, p_new_role)` — делает оба UPDATE в одной транзакции (audit-log как бонус). Но grep по `services/`, `views/`, `App.jsx`, `components/` — **0 callsite'ов**. UI использует только legacy split-PATCH (Action A1 + A2).

Это значит — триггер должен покрыть **оба будущих сценария**: текущий split-PATCH UI и потенциальный RPC-вызов, если кто-то его подключит.

### 1.5 Выбор механизма триггера — вариант (c)

Соответствие вариантам из `_109`:

| вариант | покрывает unblock без role-change | покрывает role-change без unblock | риск лишних fire'ов | сложность |
|---------|----------------------------------|----------------------------------|---------------------|-----------|
| (a) только OF access_status WHEN pending→active | ✅ | ❌ | низкий | низкая |
| (b) только OF role WHEN role-changed | ❌ ← главный кейс бага! | ✅ | низкий | низкая |
| **(c) OF role,access_status + OR-WHEN** | ✅ | ✅ | низкий | средняя (+1 строка WHEN) |

(a) не покрывает кейс «admin re-promote leader → applicant без касания access_status». (b) не покрывает **главный кейс бага** — applicant зарегался, admin его unblock'нул без смены role. Только (c) ловит оба.

WHEN-clause финального триггера:

```sql
WHEN (
    NEW.role IN ('applicant', 'intern')
    AND (
        -- Branch 1: одобрение через unblock (pending → active)
        (OLD.access_status = 'pending_approval' AND NEW.access_status = 'active')
        OR
        -- Branch 2: смена роли В whitelist (leader → applicant и т.п.)
        (OLD.role IS DISTINCT FROM NEW.role)
    )
)
```

Idempotency через `ON CONFLICT (id) DO NOTHING` в trigger function. PostgreSQL fires AFTER UPDATE trigger ровно один раз на UPDATE statement (даже если match'ат обе ветки OR — например, RPC `admin_approve_registration` меняет role И access_status одной транзакцией).

Защита от лишних fire'ов:
- `NEW.role IN ('applicant','intern')` — admin/mentor/leader/curator никогда не получат phantom-row (закрывает BUG-PVL-ENSURE-RESPECTS-ROLE).
- `OLD.access_status = 'pending_approval'` в branch 1 — пауз/анпауз для уже-одобренного юзера не fire'ит (OLD будет 'paused_manual' или 'active', не 'pending_approval').

---

## 2. Миграция (Задача B) — структура

Файл: [`migrations/2026-05-23_phase37_pvl_onboarding_atomic.sql`](../../migrations/2026-05-23_phase37_pvl_onboarding_atomic.sql)

**Phase 37** (следующий после phase36 от 2026-05-18). Дата файла = 2026-05-23 (сегодня).

### 2.1 Структура (8 секций внутри одной BEGIN..COMMIT)

| # | Секция | LoC |
|---|--------|-----|
| 1 | SCHEMA: `pvl_cohorts.start_date`/`end_date` + CHECK `end_date >= start_date` | ~15 |
| 2 | DATA: UPDATE Поток 1 (15.04–01.07) + INSERT Поток 2 (15.09–20.12) | ~10 |
| 3 | PRE-CHECK: orphan reverse = 0 (DO block с RAISE EXCEPTION) | ~15 |
| 4 | FK `pvl_students.id → profiles(id) ON DELETE CASCADE` (закрывает ARCH-010) | ~8 |
| 5 | TRIGGER FUNCTION `trg_create_pvl_student_on_approval()` SECURITY DEFINER | ~30 |
| 6 | CREATE TRIGGER `trg_profiles_pvl_student_on_approval` (механизм c) | ~15 |
| 7 | BACKFILL 14 interns (DO block с GET DIAGNOSTICS + RAISE если ≠14) | ~30 |
| 8 | `SELECT public.ensure_garden_grants();` (RUNBOOK 1.3) | 1 |

Снаружи COMMIT — VERIFY блок с 8 проверками (V1..V8) под `\echo`.

### 2.2 Ключевые решения внутри миграции

**Идемпотентность повторного apply:**
- `ADD COLUMN IF NOT EXISTS` для дат когорт.
- `DROP CONSTRAINT IF EXISTS` + ADD для CHECK и FK.
- `DROP TRIGGER IF EXISTS` + CREATE.
- `CREATE OR REPLACE FUNCTION`.
- Поток 2 INSERT через `NOT EXISTS (SELECT 1 FROM pvl_cohorts WHERE title='ПВЛ 2026 Поток 2')` — без unique-constraint на title использовать ON CONFLICT нельзя, поэтому guard.
- UPDATE дат Потока 1 имеет `AND (start_date IS NULL OR end_date IS NULL)` — повторный apply не перетирает.
- Backfill через `LEFT JOIN pvl_students ps WHERE ps.id IS NULL` — уже-вставленные не дублируются.

**Pre-check abort (Section 3):** `_108` audit показал `orphan_pvl_students = 0`, но между recon и apply ситуация может рассинхронизироваться. DO block с COUNT + RAISE EXCEPTION гасит миграцию ДО ALTER TABLE если orphan-reverse > 0.

**Backfill assertion (Section 7):** `_108` audit показал ровно 14 intern-orphans. Если на момент apply число другое — `GET DIAGNOSTICS v_inserted = ROW_COUNT` + `IF v_inserted <> 14 RAISE EXCEPTION` гасит транзакцию. Защита от drift.

**Trigger function SECURITY DEFINER:** обходит RLS `pvl_students_insert_admin WITH CHECK (is_admin())`. Паттерн повторяет `admin_approve_registration` из phase31. `SET search_path = public, pg_temp` — защита от инъекций через resolution.

**full_name построение:** `COALESCE(NULLIF(trim(NEW.name), ''), NEW.email, 'Участница')` — name приоритетный, пустая строка считается отсутствием (NULLIF), fallback email, последний fallback 'Участница' (на случай если оба null — теоретически не должно быть, но защита есть).

**cohort_id резолюция:** `SELECT id FROM pvl_cohorts WHERE CURRENT_DATE BETWEEN start_date AND end_date ORDER BY start_date DESC LIMIT 1`. Если ничего не активно — NULL (edge case летом или зимой между потоками; админ проставит вручную). Доп. guard `start_date IS NOT NULL AND end_date IS NOT NULL` — на случай если в будущем добавят cohort без дат (current Поток 1 + Поток 2 backfill'нем датами в этой же миграции).

**CASCADE на FK:** при DELETE profile дропаются pvl_students row и все её submissions / progress / checklist (т.к. там тоже CASCADE на student_id). Согласовано с `_108` § Open Question #6.

### 2.3 Verify-блок (вне транзакции)

8 \echo-секций после COMMIT — paste-able в `psql -f file.sql` вывод. Включает:
- V1: даты обоих потоков
- V2: pvl_students count (ожидание 29 = 15 + 14)
- V3: orphan profiles (ожидание 1 — Суроватская pending_approval)
- V4: FK по pg_constraint
- V5: trigger function существует + SECURITY DEFINER
- V6: trigger привязан к profiles UPDATE OF role,access_status
- V7: активный cohort на сегодня (для smoke — чтобы знать что подставит trigger)
- V8: RUNBOOK 1.3 sanity — auth/anon grant counts должны быть 158/4

---

## 3. Smoke-план (Задача C)

Paste-ready для Ольги (или Claude in Chrome) **после apply**.

### 3.1 SQL verify-блок (повторяет V1..V8 из миграции — для проверки руками)

```bash
ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" <<EOF
-- S1: даты потоков
SELECT id, title, start_date, end_date FROM pvl_cohorts ORDER BY start_date NULLS LAST;
-- S2: pvl_students count (ожидание 29)
SELECT COUNT(*) FROM pvl_students;
-- S3: orphans (ожидание 1 — Суроватская)
SELECT email, role, access_status FROM profiles p
 LEFT JOIN pvl_students ps ON ps.id = p.id
 WHERE p.role IN ('applicant','intern') AND ps.id IS NULL;
-- S4: trigger существует
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_profiles_pvl_student_on_approval';
-- S5: активный cohort
SELECT title FROM pvl_cohorts
 WHERE CURRENT_DATE BETWEEN start_date AND end_date LIMIT 1;
EOF'
```

Ожидаемо:
- S1: 2 строки, обе с датами.
- S2: 29.
- S3: 1 строка — `asurovatskaya26@gmail.com applicant pending_approval`.
- S4: одна строка `trg_profiles_pvl_student_on_approval`.
- S5: `ПВЛ 2026 Поток 1` (сегодня 2026-05-23, попадает в 15.04–01.07).

### 3.2 UI сценарий 1: одобри Суроватскую (главный smoke)

**Шаги в Chrome:**
1. Открыть https://liga.skrebeyko.ru/ под админом (Ольга).
2. Перейти в `/admin` → вкладка «Пользователи».
3. Найти `asurovatskaya26@gmail.com` (role=applicant, status=suspended).
4. Нажать ⛔️ (вернуть доступ) → confirm dialog → подтвердить.
5. UI должен показать «Доступ возвращён».

**Проверка в SQL** (сразу после клика):
```bash
ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "
SELECT p.email, p.role, p.access_status,
       ps.id IS NOT NULL AS has_pvl_row,
       ps.cohort_id IS NOT NULL AS has_cohort
  FROM profiles p
  LEFT JOIN pvl_students ps ON ps.id = p.id
 WHERE p.email = '\''asurovatskaya26@gmail.com'\'';"'
```

Ожидаемо: `applicant | active | t | t` — row создалась триггером, cohort_id заполнен (Поток 1 активный).

### 3.3 UI сценарий 2: existing intern сдаёт ДЗ (FK regression check)

Любой intern из backfill'нутых 14. Например, `soboleva.yanna@yandex.ru` (или Ольга выбирает другую — кто реально активен).

**Шаги:**
1. Сделать impersonation в админке (если есть) или попросить юзера зайти.
2. Открыть любой урок с ДЗ.
3. Заполнить ответ, нажать «Сохранить».
4. UI должен показать сохранение без ошибок.

**Проверка в SQL:**
```bash
ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "
SELECT COUNT(*) AS submissions
  FROM pvl_student_homework_submissions
 WHERE student_id = (SELECT id FROM profiles WHERE email = '\''soboleva.yanna@yandex.ru'\'');"'
```

Ожидаемо: count >= 1 (submission записалась, FK прошёл).

### 3.4 UI сценарий 3: проверить что admin не получает фейк-row (negative case)

Логин под Ольгой → переход в `/pvl/library` или любое write-action.

**Проверка в SQL:**
```bash
ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "
SELECT p.role, COUNT(*)
  FROM pvl_students ps
  JOIN profiles p ON p.id = ps.id
 GROUP BY p.role
 ORDER BY 2 DESC;"'
```

Ожидаемо: только `applicant 16, intern 14`. **Никаких** `admin`, `mentor`, `leader`. (До phase37: `applicant 15`. После apply backfill: 15+14=29 строк; после smoke 3.2: 16+14=30. После 3.3: всё то же 30, ибо intern уже есть.)

### 3.5 Rollback (если smoke падает)

**Что откатываем:**
- DROP TRIGGER + DROP FUNCTION (триггер не fire'ит на старых сценариях, безопасно).
- DROP CONSTRAINT FK (вернёт схему как было).
- DELETE 14 backfill'нутых intern rows (но **осторожно**: если intern уже что-то сабмитнул через trigger-window, CASCADE дропнет его submissions).
- ALTER TABLE DROP COLUMN start_date, end_date (CASCADE на CHECK).
- DELETE Поток 2 row.

**Rollback SQL** (paste-ready):

```sql
BEGIN;
DROP TRIGGER IF EXISTS trg_profiles_pvl_student_on_approval ON public.profiles;
DROP FUNCTION IF EXISTS public.trg_create_pvl_student_on_approval();
ALTER TABLE public.pvl_students DROP CONSTRAINT IF EXISTS pvl_students_id_fk_profiles;
-- DANGER: следующие 2 DELETE CASCADE'ят student-данные. Проверь
-- руками сначала: SELECT COUNT(*) FROM pvl_student_homework_submissions
-- WHERE student_id IN (SELECT id FROM profiles WHERE role='intern' AND ...);
DELETE FROM public.pvl_students WHERE id IN (
    SELECT p.id FROM profiles p
     WHERE p.role = 'intern'
       AND p.id NOT IN (SELECT id FROM pvl_students ps2
                          WHERE ps2.created_at < '2026-05-23'::date)
);
DELETE FROM public.pvl_cohorts WHERE title = 'ПВЛ 2026 Поток 2';
ALTER TABLE public.pvl_cohorts DROP CONSTRAINT IF EXISTS pvl_cohorts_dates_check;
ALTER TABLE public.pvl_cohorts DROP COLUMN IF EXISTS start_date;
ALTER TABLE public.pvl_cohorts DROP COLUMN IF EXISTS end_date;
SELECT public.ensure_garden_grants();
COMMIT;
```

Я бы НЕ rollback'ил без явного решения — schema-changes здесь все аккуратные, trigger fires только на bounded WHEN, FK не блокирует insert'ы (просто требует существования profiles row, что и так convention). Если что-то странное — лучше отчёт стратегу + точечный hot-patch, чем массовый DELETE.

---

## 4. Что НЕ сделано (явно, по `_109` Задача D)

- ❌ **НЕ удалил** `ensurePvlStudentInDb` + 8 callsite'ов в `services/pvlMockApi.js`. Старый client-side ensure остаётся как fallback на 2-3 дня после verify trigger'а. Cleanup — отдельным PR.
- ❌ **НЕ оборачивал** `/auth/register` (`garden-auth/server.js:528-579`) в BEGIN/COMMIT. Это другой half-state risk (users_auth + profiles), отдельная задача P2.
- ❌ **НЕ менял** RLS на pvl_students. Trigger SECURITY DEFINER обходит её.
- ❌ **НЕ делал** apply / commit / push. Жду 🟢.

---

## 5. Open items / вопросы Ольге

1. **Backfill 18 leaders?** В `_108` § Open Question #1 я предлагал НЕ трогать leaders. В `_109` подтверждено «18 leaders НЕ трогаем». Закрыто, просто фиксирую.

2. **Cohort_id NULL fallback — приемлемо?** Если в edge case (1 июля 2026 уже прошло, 15 сентября ещё не наступило) приходит новый applicant — trigger создаёт pvl_students row с `cohort_id = NULL`. Это **рабочее** состояние (RLS не блокирует, ДЗ не падает), но в админке учительская будет показывать «без потока». Если хочется fail-loud, можно RAISE EXCEPTION при NULL — но тогда онбординг сломается летом. Текущее решение: NULL + админ решает. Подтверди при ревью.

3. **Поток 2 даты (15.09 – 20.12)?** Взял из брифа дословно. Уточни если надо подвинуть.

4. **Применять ли миграцию вечером 23.05 или утром 24.05?** Если днём — поток активный (Поток 1: 15.04–01.07), trigger корректно подставит. Если ночью / выходные — никакой разницы (CURRENT_DATE = дата, не время).

5. **После apply — нужна ли отдельная команда «закрой ARCH-010 / ARCH-012 / BUG-PVL-ENSURE-RESPECTS-ROLE в BACKLOG.md»?** Не делаю в этом diff'е (`_109` ничего про это не говорит), но напоминаю — статусы тикетов надо обновить после verify.

---

## 6. Эффорт

- Mini-recon Задача A: ~20 мин (включая обнаружение admin_approve_registration RPC через grep).
- Миграция Задача B: ~35 мин (включая precedent-чтение phase30/phase31 для стиля + продумывание edge-cases в WHEN).
- Smoke-план Задача C: ~10 мин.
- Отчёт `_110`: ~15 мин.

Итого ~80 мин (в `_109` оценено ~70 мин — +10 на recon RPC).

---

## 7. Ограничения соблюдены

- ✅ Только DIFF (1 новый SQL файл + этот отчёт).
- ✅ Apply миграции — единая транзакция BEGIN..COMMIT.
- ✅ Email Суроватской упомянут в smoke-плане как рабочий контекст; email Соболевой в smoke 3.3 как пример intern'а — оба для smoke-сценариев, не публикую полный список 33 orphan'ов второй раз.
- ✅ Без `--amend`, без `--force`, без apply / commit / push.
- ✅ Read-only SQL во время recon (только `\d`, SELECT). Никаких INSERT/UPDATE/DELETE на проде.
