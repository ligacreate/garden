# Сессия 1 Этапа 2 — apply phase40 на прод

**От:** codeexec → стратегу через Ольгу
**Дата:** 2026-05-28
**Тип:** apply на прод (Timeweb managed Postgres, gen_user, single-transaction)
**Базируется на:** 🟢 стратега по [_147](2026-05-28_147_codeexec_etap2_backend_dryrun_v2.md) (Вариант А, все 28/28 PASS)

---

## 0. TL;DR

✅ **Phase40 applied. Прод в новом состоянии.**

- git commit `5d1d8a7` (local main, не запушен)
- Apply на проде: **APPLY_START=2026-05-28T18:30:45Z → APPLY_END=2026-05-28T18:30:49Z (~4 сек)**, exit 0
- `recover_grants.sh`: AUTH_CNT=166 / ANON_CNT=4, exit 0
- Все 4 post-apply check'а PASS
- Старые `pvl_student_certification_{scores,criteria_scores}` дропнуты, новые `_self`/`_mentor` живут (0 rows каждая, RLS=on, 7 политик каждая, 3 триггера на `_mentor` включая auto-fill `mentor_id`)
- push НЕ сделан (отдельным 🟢)

---

## 1. git commit

```
$ git log -1 --format="%H%n%an <%ae>%n%ai%n%s"
5d1d8a79306e7d570b588d9a941cfdb8189819db
olgaskrebeyko <olga.skrebeyko@gmail.com>
2026-05-28 21:30:09 +0300
phase40: split pvl_student_certification_scores into _self + _mentor
```

Содержание (1 файл, +416 строк):

```
A  database/pvl/migrations/2026-05-28_phase40_pvl_certification_split.sql
```

Полный текст message — из стратег-брифа, без изменений. `push` НЕ сделан (отдельным 🟢, ждём подтверждения).

---

## 2. Apply на прод

Команда (точно по header'у миграции):

```
scp …phase40_pvl_certification_split.sql root@5.129.251.56:/tmp/
ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
  PGPASSWORD="$DB_PASS" PGSSLMODE="$DB_SSLMODE" PGSSLROOTCERT="$DB_SSLROOTCERT" \
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 -f /tmp/2026-05-28_phase40_pvl_certification_split.sql'
```

Тайминг:

| Событие | UTC |
|---|---|
| APPLY_START (scp + psql call) | `2026-05-28T18:30:45Z` |
| APPLY_END (COMMIT + verify завершились) | `2026-05-28T18:30:49Z` |
| **Длительность** | **~4 сек** |

Все DDL'ные стейтменты прошли по порядку (выписка из лога apply):

```
BEGIN
DO                              -- ASSERT: scores=0, criteria=0, disputes_with_cert=0
ALTER TABLE                     -- DROP CONSTRAINT pvl_student_disputes_…_fkey
DROP TABLE                      -- pvl_student_certification_criteria_scores
DROP TABLE                      -- pvl_student_certification_scores
CREATE TABLE                    -- _self
CREATE INDEX × 2                -- self_cohort, self_status
CREATE TRIGGER                  -- self_updated_at
CREATE TABLE                    -- _mentor
CREATE INDEX × 3                -- mentor_mentor, mentor_cohort, mentor_status
CREATE TRIGGER                  -- mentor_updated_at
CREATE FUNCTION                 -- pvl_set_certification_mentor_id (SECURITY DEFINER)
CREATE TRIGGER                  -- mentor_set_mentor_id (BEFORE INS/UPD)
ALTER TABLE                     -- ENABLE RLS on _self
CREATE POLICY × 7               -- _self policies
ALTER TABLE                     -- ENABLE RLS on _mentor
CREATE POLICY × 7               -- _mentor policies
GRANT × 2                       -- direct GRANT _self/_mentor → authenticated
CREATE FUNCTION                 -- CREATE OR REPLACE ensure_garden_grants() (swap)
SELECT public.ensure_garden_grants();  -- exec swap, NOTIFY pgrst reload schema
COMMIT
```

В-блок (вне транзакции, в той же psql-сессии) — финальный verify:

```
V1 tables          : pvl_student_certification_mentor, pvl_student_certification_self
V2 RLS+policies    : both rls_enabled=t, 7 policies each
V3 trigger         : mentor_set_mentor_id (INS+UPD BEFORE) + mentor_updated_at (UPD BEFORE)
V4 grant rows      : 166 (net unchanged)
V5 proc body sanity: mentions_self=t, mentions_mentor=t, still_mentions_old_scores=f
```

---

## 3. recover_grants.sh — verify

```
$ ssh root@5.129.251.56 /opt/garden-monitor/recover_grants.sh
[2026-05-28T18:31:09Z] recover: calling ensure_garden_grants()
[2026-05-28T18:31:09Z] recover: after recovery: authenticated=166 web_anon=4 (expected 166/4)
[2026-05-28T18:31:09Z] recover: OK: grants restored to baseline (166/4)

$ ssh root@5.129.251.56 '/opt/garden-monitor/recover_grants.sh >/dev/null 2>&1; echo "EXIT=$?"'
EXIT=0
```

- AUTH_CNT=166 ✓
- ANON_CNT=4 ✓
- exit 0 ✓

Daily Timeweb wipe в 13:08 UTC корректно восстановит новый `_self`+`_mentor` через обновлённый `ensure_garden_grants()`.

---

## 4. Post-apply psql checks

Все из стратег-брифа п.4:

### 4.1 Row counts на новых таблицах (expect 0/0)

```
  tbl   | count
--------+-------
 self   |     0
 mentor |     0
```

✅ PASS — fresh empty tables.

### 4.2 Policies count на новых (expect 14)

```
 policies_total
----------------
             14
```

✅ PASS — 7 на `_self` + 7 на `_mentor`.

### 4.3 Старые таблицы дропнуты, новые на месте

```
            tablename
----------------------------------
 pvl_student_certification_mentor
 pvl_student_certification_self
```

✅ PASS — `pvl_student_certification_{scores,criteria_scores}` отсутствуют в `pg_tables`, новые два присутствуют.

### 4.4 `ensure_garden_grants()` body sanity

```
 mentions_self | mentions_mentor | still_old_scores | still_old_criteria
---------------+-----------------+------------------+--------------------
 t             | t               | f                | f
```

✅ PASS — swap внутри stored proc'а активен; daily recover будет работать корректно.

---

## 5. Что в проде сейчас

| Объект | До phase40 | После phase40 |
|---|---|---|
| `pvl_student_certification_scores` | exists, 0 rows, 6 policies, FK from disputes | **DROPPED** |
| `pvl_student_certification_criteria_scores` | exists, 0 rows, 6 policies | **DROPPED** |
| `pvl_student_certification_self` | — | **created**, 0 rows, RLS on, 7 policies, 1 trigger (updated_at) |
| `pvl_student_certification_mentor` | — | **created**, 0 rows, RLS on, 7 policies, 2 triggers (updated_at + set_mentor_id) |
| `pvl_student_disputes.certification_score_id_fkey` | active | **DROPPED** (колонка осталась без FK) |
| `pvl_set_certification_mentor_id()` | — | **created** SECURITY DEFINER auto-fill `mentor_id := auth.uid()` |
| `ensure_garden_grants()` Part 1 list | mentions old certification_scores/criteria_scores | **swap** → mentions new `_self`/`_mentor` |
| `authenticated` grant-rows count | 166 | **166** (net unchanged) |
| `web_anon` grant-rows count | 4 | **4** |

PostgREST schema cache reload (`NOTIFY pgrst, 'reload schema'`) отправлен внутри `ensure_garden_grants()` — фронт через PostgREST сразу увидит новые endpoint'ы `/pvl_student_certification_self` и `/pvl_student_certification_mentor`.

---

## 6. Что НЕ сделано (по дисциплине)

- ❌ `git push` — ждём отдельный 🟢. Локальный `main` ушёл вперёд remote на 1 коммит.
- ✅ Никаких ручных правок прода вне миграции.
- ✅ recover_grants.sh не правился — только запущен для verify (как п.4 решения стратега в _147).

---

## 7. Артефакты

| Файл / артефакт | Где | Назначение |
|---|---|---|
| commit `5d1d8a7` | local main, **не запушен** | applied migration commit |
| `database/pvl/migrations/2026-05-28_phase40_pvl_certification_split.sql` | репо | 416 строк, applied |
| `/tmp/2026-05-28_phase40_pvl_certification_split.sql` | на VPS | копия для apply (можно удалить вручную, не критично) |
| `/tmp/phase40_apply.log` | локально | полный stdout apply'а |
| `/tmp/phase40_recover.log` | локально | вывод recover_grants.sh |

---

## 8. Следующий шаг

- Ждём 🟢 на `git push origin main` (отдельным шагом).
- После push — Сессия 2: frontend API (8 методов в `services/pvlPostgrestApi.js` + редиректы старых роутов + `SZ_REFLECTION_PROMPTS_MENTOR` placeholder'ы + `id` поле в `SZ_ASSESSMENT_CRITICAL`).

**Файл:** `garden/docs/_session/2026-05-28_148_codeexec_etap2_backend_applied.md`
