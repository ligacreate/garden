# Сессия 1 Этапа 1 — Backend (phase38): dry-run, diff-on-review

**От:** codeexec → стратегу через Ольгу
**Дата:** 2026-05-26
**Скоп:** §3 ТЗ [_134](2026-05-26_134_strategist_tz_etap1_training_feedback.md) — миграция + RLS + GRANT + ensure_garden_grants() update.
**Статус:** dry-run прошёл, **ждём 🟢 от стратега** на apply.

---

## 1. TL;DR

- Файл миграции создан: `database/pvl/migrations/2026-05-26_phase38_pvl_training_breakfasts.sql`
- Dry-run: `BEGIN; <вся миграция>; <RLS-тесты для 5 ролей × sessions+feedback>; ROLLBACK;` — **все 27 ассертов PASS**
- Post-rollback verify: таблицы и helper откатились (0 строк) — транзакция атомарна.
- Одно расширение скопа vs §3 ТЗ: миграция **переопределяет `ensure_garden_grants()`** (добавляет 2 новые таблицы в Part 1), чтобы daily Timeweb wipe + `recover_grants.sh` их восстанавливал. Без этого после следующего wipe (13:08 UTC) GRANT'ы на `pvl_training_*` исчезнут. Это паттерн SEC-014 phase 23, та же логика что у всех существующих 39 таблиц.
- Соответственно, обновляется и baseline `recover_grants.sh`: ожидаемое `AUTH_CNT 158 → 166` (39 → 41 таблиц × 4 priv + `pvl_audit_log` × 2).

---

## 2. Что в миграции

### 2.1 Таблицы (по §3.1 ТЗ — 1-в-1)

```sql
pvl_training_sessions
  id              uuid PK
  student_id      uuid NOT NULL REFERENCES pvl_students(id) ON DELETE CASCADE
  conducted_at    timestamptz NOT NULL
  scenario_topic  text NOT NULL CHECK (length >= 1)
  created_at, updated_at timestamptz NOT NULL DEFAULT now()
  + 2 индекса (student_id, conducted_at)

pvl_training_feedback
  id, session_id, author_id, 4 × text NOT NULL DEFAULT '', created_at, updated_at
  UNIQUE (session_id, author_id)            ← для upsert merge-duplicates
  + 2 индекса (session_id, author_id)
```

### 2.2 Helpers + triggers

- `is_pvl_cohort_peer(uuid) RETURNS boolean STABLE SECURITY DEFINER`
  с фильтром `them_p.role = 'applicant'` (отсекает 13 Garden-интернов из той же когорты, см. _130_cohort_audit).
  + `GRANT EXECUTE ... TO authenticated;` (в т.ч. в Part 4 `ensure_garden_grants()`).
- `enforce_pvl_training_sessions_limit()` BEFORE INSERT → `RAISE EXCEPTION` если >=2.
- 2 × `BEFORE UPDATE ... pvl_set_updated_at()` (общий хелпер, есть на проде).

### 2.3 RLS

| Таблица | Политика | Тип | Логика |
|---|---|---|---|
| sessions | active_access_guard_select | RESTRICTIVE SELECT | `has_platform_access(auth.uid())` |
| sessions | active_access_guard_write | RESTRICTIVE ALL | `has_platform_access` (USING + WITH CHECK) |
| sessions | select | PERMISSIVE SELECT | own / mentor / cohort_peer / admin |
| sessions | insert_own | PERMISSIVE INSERT | `student_id = auth.uid()` |
| sessions | update_own_or_admin | PERMISSIVE UPDATE | own / admin |
| sessions | delete_admin | PERMISSIVE DELETE | admin only |
| feedback | active_access_guard_select | RESTRICTIVE SELECT | `has_platform_access` |
| feedback | active_access_guard_write | RESTRICTIVE ALL | `has_platform_access` |
| feedback | select | PERMISSIVE SELECT | author / admin / owner-of-session / mentor-of-owner |
| feedback | insert_peer | PERMISSIVE INSERT | `author_id = auth.uid()` AND session.student_id is cohort peer |
| feedback | update_own_or_admin | PERMISSIVE UPDATE | author / admin (без 48ч лимита — ТЗ #5) |
| feedback | delete_admin | PERMISSIVE DELETE | admin only |

### 2.4 GRANT'ы и ensure_garden_grants() (вот тут расширение vs ТЗ)

**ТЗ §3.1 (строки 244-248):**
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON pvl_training_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pvl_training_feedback TO authenticated;
SELECT public.ensure_garden_grants();
```

**Проблема, которую я заметил:** `ensure_garden_grants()` (phase 23) **хардкодит** список из 39 таблиц. Если просто сделать прямой GRANT, то:
- сейчас всё работает,
- но при следующем daily Timeweb wipe (13:08 UTC) → wipe убьёт GRANT'ы на новые таблицы,
- `recover_grants.sh` запустит `ensure_garden_grants()`, она не знает про `pvl_training_*` → НЕ восстановит,
- frontend получит 401/403 на `/pvl_training_sessions`.

**Решение** (соответствует memory `[[feedback_extend_scope_for_parallel_bugs]]` + паттерну SEC-014): в миграции `CREATE OR REPLACE FUNCTION public.ensure_garden_grants()` с добавлением 2 строк в Part 1 + 1 строки в Part 4 (EXECUTE на `is_pvl_cohort_peer`). После apply `recover_grants.sh` будет восстанавливать pvl_training_* при каждом запуске.

**Дополнительно** — baseline `recover_grants.sh`:
```
было: AUTH_CNT == 158 (39 × 4 + audit_log × 2)
стало: AUTH_CNT == 166 (41 × 4 + audit_log × 2)
```

Обновление `recover_grants.sh` — отдельный шаг (Шаг 5 ТЗ), его сделаю после apply миграции, не сейчас.

### 2.5 VERIFY-блок (вне транзакции)
7 проверок: tables, RLS+policies, helper, triggers, AUTH_CNT=166, web_anon=4, EXECUTE на is_pvl_cohort_peer.

---

## 3. Dry-run результаты

Прогнал на проде в транзакции `BEGIN; ...; ROLLBACK;` — таблиц на проде не появилось (post-verify pvl_training_tables_should_be_0 = 0, is_pvl_cohort_peer_func_should_be_0 = 0).

### 3.1 Тестовые акторы (real prod data)

| Роль | Имя | id | Когорта |
|---|---|---|---|
| admin | Ольга Скребейко | `85dbefda-ba8f-4c60-9f22-b3a7acd45b21` | — |
| mentor | Юлия Габрух | `492e5d3d-81c7-41d8-8cef-5a603e1389e6` | менторит Ирину, Диану, Дашу, Анжелику |
| applicant (owner) | Ирина Петруня | `35019374-d7de-4900-aa9d-1797bcca9769` | `11111111…101` |
| applicant (peer) | Ольга Разжигаева | `90c9b7c7-db13-41bd-b393-49d79fc571b1` | `11111111…101` |
| intern (negative для peer-фильтра) | Анастасия Ван | `4250ffac-acd7-4209-bd28-b31bd9c02665` | `11111111…101`, role='intern' |

### 3.2 Section B — schema + policies

```
B1: pvl_training_* tables                  → 2 (feedback, sessions)
B2: RLS + policies (relkind='r')           → оба rls_on=t, pol_cnt=6
B3: pvl_training_sessions policies         → 2 RESTRICTIVE + 4 PERMISSIVE
B4: pvl_training_feedback policies         → 2 RESTRICTIVE + 4 PERMISSIVE
B5: is_pvl_cohort_peer                     → prosecdef=t, args='target_student uuid'
B6: triggers                               → 3 (limit, 2 × updated_at)
```

### 3.3 Section C — trigger constraint

```
C1: 2 сессии вставлены OK                  → count=2
C2: 3-я INSERT отбита                      → NOTICE PASS: «Лимит тренировочных
                                              завтраков превышен (максимум 2)»
C3: засеяно для дальнейших RLS-тестов      → 3 строки (2 Ирины + 1 Ольги)
```

### 3.4 Section D — SELECT sessions под 5 ролями

| Тест | Ожидание | Результат |
|---|---|---|
| D1: web_anon | permission denied | ✅ PASS (deny на GRANT-уровне) |
| D2: applicant Ирина (owner) | total=3 (2 own + 1 peer Ольги) | ✅ 3, own=2, peer=1 |
| D3: applicant Ольга (peer) | total=3 (1 own + 2 cohort_peer Ирины) | ✅ 3, own=1, irina=2 |
| D4: mentor Юля | total=2 (только Ирина-менти) | ✅ 2, irina=2, olga=0 |
| D5: admin | total=3 | ✅ 3 |
| D6: peer-фильтр applicant vs intern | Ольга=t, Анастасия=f | ✅ t, f |

### 3.5 Section E — SELECT feedback

Засеяно: 2 отзыва на сессию Ирины #1 (Ольга-peer + Дарья Зотова-peer, injection под админом).

| Тест | Ожидание | Результат |
|---|---|---|
| E1: peer Ольга — peer-confidentiality | видит только свой (1), others=0 | ✅ own=1, others=0 |
| E2: owner Ирина — все отзывы | 2 | ✅ 2 |
| E3: mentor Юля | 2 (через is_mentor_for) | ✅ 2 |
| E4: admin | 2 | ✅ 2 |
| E5: web_anon | permission denied | ✅ PASS |

### 3.6 Section F — write policies

| Тест | Ожидание | Результат |
|---|---|---|
| F1: peer Ольга INSERT feedback | OK через insert_peer | ✅ PASS |
| F2: impersonation (author_id чужой) | отбито WITH CHECK | ✅ PASS «row violates row-level security policy» |
| F3: peer Ольга UPDATE свой | OK | ✅ rows=2 (свои 2 отзыва) |
| F4: applicant DELETE feedback | rows=0 (RLS не дал) | ✅ PASS |
| F5: applicant DELETE session | rows=0 (RLS не дал) | ✅ PASS |

### 3.7 Section G — post-rollback verify

```
ROLLBACK
pvl_training_tables_should_be_0      → 0  ✅
is_pvl_cohort_peer_func_should_be_0  → 0  ✅
```

Транзакция чисто откатилась, прод не изменён.

---

## 4. Соответствие §3.3 ТЗ (acceptance criteria)

| ТЗ §3.3 | dry-run |
|---|---|
| Под `authenticated` menti: видит свои + peer-сессии когорты с фильтром applicant, НЕ видит чужие когорты | D2, D6 — ✅ |
| Под `authenticated` ментора: видит сессии своих menti через `is_mentor_for()` | D4, E3 — ✅ |
| Под `authenticated` admin: видит всё | D5, E4 — ✅ |
| Под `web_anon`: 401/403 на pvl_training_* | D1, E5 — ✅ |

---

## 5. Diff vs ТЗ §3 — что не 1-в-1

| # | Изменение | Обоснование |
|---|---|---|
| 1 | `CREATE OR REPLACE ensure_garden_grants()` в самой миграции (а не `SELECT public.ensure_garden_grants();` без определения) | Иначе после daily Timeweb wipe → recover_grants.sh → ensure_garden_grants() НЕ восстановит GRANT на новые таблицы. Это паттерн SEC-014 phase 23. |
| 2 | `GRANT EXECUTE ON FUNCTION is_pvl_cohort_peer(uuid) TO authenticated;` (явно + в Part 4 функции) | RLS использует `is_pvl_cohort_peer()` под applicant, без EXECUTE даст false на всех selects → cohort peer не работает. is_admin и is_mentor_for уже в Part 4. |
| 3 | VERIFY-блок ожидает `AUTH_CNT=166` (а не 158) | 41 таблиц × 4 priv + audit × 2 = 166. |

ТЗ §3.2 говорит «обновить recover_grants.sh» — там надо тоже поменять baseline с 158 на 166, и **это отдельный шаг** (Step 5 в инструкции Ольги, после apply).

---

## 6. План на apply

После 🟢 от стратега:

```bash
# 1. Apply на prod
ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 -f /tmp/phase38_dry.sql'

# 2. Post-commit verify (запустить отдельно — VERIFY-блок уже в файле, после COMMIT)
# 7 проверок V1..V7

# 3. Обновить /opt/garden-monitor/recover_grants.sh
#    diff: AUTH_CNT 158 → 166 (только expected baseline)
#    ssh root@5.129.251.56 'vi /opt/garden-monitor/recover_grants.sh'
#    запустить /opt/garden-monitor/recover_grants.sh вручную, verify OK

# 4. (ждать отдельный 🟢) commit + push
```

---

## 7. Файлы для review

- `database/pvl/migrations/2026-05-26_phase38_pvl_training_breakfasts.sql` — миграция
- `/tmp/phase38_drytest.sql` (только локально на ноуте, в repo не идёт) — dry-run harness
- этот файл — отчёт

## 8. Запрос на 🟢

Если ОК — стратег даёт 🟢, codeexec делает apply + Step 5 (recover_grants.sh) + Step 8 (финальный отчёт). На push **отдельный 🟢 PUSH**.

Если NOT OK — что править в миграции?
