# Сессия 1 Этапа 2 — backend dryrun миграции phase40

**От:** codeexec → стратегу через Ольгу
**Дата:** 2026-05-28
**Тип:** dryrun на проде под `gen_user` (BEGIN ... ROLLBACK, никакого COMMIT)
**ТЗ:** [_144_strategist_tz_etap2_certification](2026-05-28_144_strategist_tz_etap2_certification.md)
**Recon база:** [_142](2026-05-28_142_codeexec_recon_etap2_certification.md) (DDL/код) + [_143](2026-05-28_143_codeexec_recon_etap2_live_sql.md) (live SQL)

---

## 0. TL;DR — что нужно знать стратегу до review

**Миграция как написана в ТЗ §3.1 — НЕ работает.** DDL применяется чисто, но **SELECT-политики с cross-`EXISTS` клаузами вызывают `infinite recursion detected in policy`** (Postgres детектит цикл `_self ↔ _mentor`). Эта ошибка блокирует все DML/SELECT после неё (5 из 8 RLS-сценариев §3.3 FAIL'ятся каскадно).

**Дополнительно — semantic discrepancy в самом ТЗ:** §3.1 policy (через `OR EXISTS …`) разрешает menti видеть mentor-draft сразу после своего submit, а §3.3 scenario 5 ожидает обратное («Менти SELECT mentor — 0 rows (mentor ещё draft)»).

**Что показал what-if прогон** (drop EXISTS клаузы из обеих SELECT-политик, оставить чистый `status='submitted'` чек):
- recursion исчезла;
- **все 8 RLS-сценариев §3.3 PASS** (включая HEADLINE parallel-blind);
- семантика совпала с §3.3.

**Решение стратега требуется:** упростить SELECT-политики до варианта-Б (без cross-EXISTS, как в what-if), или иначе — например, через SECURITY DEFINER helper-функции которые проверяют статус другой стороны bypass'я RLS. Без правки **миграцию apply'ить нельзя**.

**Что ещё всплыло:**
- TZ §3.1 не включал `CREATE OR REPLACE ensure_garden_grants()` — без него финальный `SELECT public.ensure_garden_grants();` упал бы на GRANT'е дропнутой таблицы. **Расширил миграцию** — добавил swap старых 2 таблиц на новые 2 в proc'е (прецедент phase38, net таблиц = 41).
- TZ §3.2 («обновить recover_grants.sh») **не требует изменений** — на проде это просто bash-wrapper над `ensure_garden_grants()`; все GRANT'ы живут в DB-proc'е, который мы обновили.
- Pre-flight: всё чисто. Старые scores/criteria_scores пустые (0/0). Helper-функции на месте (все 4, SECURITY DEFINER). Тест-пара жива. Olga uuid резолвится → `85dbefda-ba8f-4c60-9f22-b3a7acd45b21` (нет в recon _143).
- COMMIT не делал. Прод не задет — два `ROLLBACK`.

---

## 1. Подключение и сетап

- ssh `root@5.129.251.56` (VPS Bittern)
- `set -a && . /opt/garden-auth/.env && set +a` — DB_HOST/DB_USER/DB_PASS/DB_NAME/DB_SSLMODE/DB_SSLROOTCERT
- `psql` под `gen_user` (роль из .env), `verify-full` SSL через `PGSSLMODE`/`PGSSLROOTCERT`
- Два прогона:
  1. **official** — миграция как в ТЗ §3.1 → `/tmp/phase40_dryrun_official.log`
  2. **what-if** — body + patch (DROP+CREATE упрощённых SELECT-политик) → `/tmp/phase40_whatif.log`
- Оба обёрнуты `BEGIN; … ROLLBACK;` под `\set ON_ERROR_STOP off` (внутри тестов используются SAVEPOINT для expected-fail INSERT'ов)

---

## 2. Pre-flight checks (как §4 брифа Ольги)

| Проверка | Результат | Статус |
|---|---|---|
| count(*) `pvl_student_certification_scores` | 0 | ✅ |
| count(*) `pvl_student_certification_criteria_scores` | 0 | ✅ |
| count(*) `pvl_student_disputes` где `certification_score_id IS NOT NULL` | 0 | ✅ |
| Helper `is_admin()` | exists, SECURITY DEFINER, returns boolean | ✅ |
| Helper `is_mentor_for(uuid)` | exists, SECURITY DEFINER, returns boolean | ✅ |
| Helper `has_platform_access(uuid)` | exists, SECURITY DEFINER, returns boolean | ✅ |
| Helper `is_pvl_cohort_peer(uuid)` | exists, SECURITY DEFINER, returns boolean | ✅ |
| profile фея/фиксик/Ольга | все три active, роли `applicant`/`mentor`/`admin` | ✅ |
| `pvl_garden_mentor_links` fixik→fea (2026-04-18) | присутствует | ✅ |

Все helper'ы — те же что в recon _143, изменений нет.

**Olga uuid** (не было в _143): `85dbefda-ba8f-4c60-9f22-b3a7acd45b21` — резолвится через `profiles.email='olga@skrebeyko.com'`.

---

## 3. Что меняет миграция (DDL/RLS/grants — успешно прошло в обоих прогонах)

DDL-секция миграции применяется чисто (см. лог B-секции в обоих файлах):

```
DO                       -- assert: старые таблицы пустые, нет disputes refs
ALTER TABLE              -- drop FK pvl_student_disputes → certification_scores
DROP TABLE               -- pvl_student_certification_criteria_scores
DROP TABLE               -- pvl_student_certification_scores
CREATE TABLE             -- pvl_student_certification_self (+ 2 индекса + updated_at trigger)
CREATE TABLE             -- pvl_student_certification_mentor (+ 3 индекса + updated_at trigger)
CREATE FUNCTION          -- pvl_set_certification_mentor_id (SECURITY DEFINER, auto-fill auth.uid())
CREATE TRIGGER           -- BEFORE INSERT OR UPDATE → set_mentor_id
ALTER TABLE              -- ENABLE RLS (×2)
CREATE POLICY × 7        -- на _self (2 RESTRICTIVE + 5 PERMISSIVE)
CREATE POLICY × 7        -- на _mentor (2 RESTRICTIVE + 5 PERMISSIVE)
GRANT × 2                -- direct GRANT для authenticated
CREATE FUNCTION          -- CREATE OR REPLACE ensure_garden_grants() с swap'ом таблиц
SELECT public.ensure_garden_grants();  -- successful, NOTIFY pgrst sent
```

Verify-блок (вне транзакции, но в одной сессии — отрабатывает до ROLLBACK):

```
V1 tables: pvl_student_certification_mentor, pvl_student_certification_self
V2 RLS:    оба rls_enabled=t, 7 политик каждая
V3 trigger pvl_set_certification_mentor_id: INSERT+UPDATE, BEFORE
V4 authenticated grants count: 166                            -- ожидание ✓
V5 ensure_garden_grants() body:
   mentions_self=t  mentions_mentor=t  still_old_scores=f  still_old_criteria=f  ✓
```

**Полный текст миграции** (для review) — в `garden/database/pvl/migrations/2026-05-28_phase40_pvl_certification_split.sql`. Файл создан локально, **не закоммичен** (TZ запрещает в этой сессии).

Структурно — строго по §3.1 ТЗ, с одним расширением:

### 3.x. Extension к ТЗ §3.1 (требует подтверждения стратега)

Добавлен блок `CREATE OR REPLACE ensure_garden_grants()` с полным телом proc'а — swap двух дропнутых таблиц на две новые. Net в Part 1 остаётся 41 таблица. Без этого расширения финальный `SELECT public.ensure_garden_grants();` (тот же, что в §3.1) упал бы на `GRANT … ON pvl_student_certification_scores` (таблица только что DROPped).

Прецедент — phase38: там тот же паттерн (CREATE OR REPLACE proc + добавление новых таблиц в Part 1) был тоже добавлен в той же миграции, не отдельно. См. [phase38 sec.6](../../database/pvl/migrations/2026-05-26_phase38_pvl_training_breakfasts.sql) (lines 240-311).

Если стратег предпочитает выделить это в отдельную миграцию `phase41_ensure_garden_grants_phase40_cleanup.sql` — могу разбить. Но тогда phase40 в одиночку apply'ить нельзя (вызов proc' упадёт), значит порядок применения становится критичным. Прецедент phase38 более устойчив.

---

## 4. RLS-тесты §3.3 — официальный прогон (TZ §3.1 как есть)

Формат: запрос → ожидание (TZ §3.3) → факт (out of psql) → PASS/FAIL.

### Test 1 — Menti (fea) пишет свой `_self`

| # | Запрос | Ожидание | Факт | Статус |
|---|---|---|---|---|
| 1a | `INSERT _self (status='draft')` под fea | `INSERT 0 1` | `INSERT 0 1` | ✅ PASS |
| 1b | `UPDATE _self SET status='submitted'` под fea | `UPDATE 1` | **ERROR: infinite recursion** | ❌ FAIL |
| 1c | `UPDATE _self SET status='draft'` под fea (повтор после submit) | `UPDATE 0` (USING блочит) | aborted (transaction in abort) | ❌ FAIL |

### Test 2 — Menti пытается писать `_mentor`

| # | Запрос | Ожидание | Факт | Статус |
|---|---|---|---|---|
| 2a | `INSERT _mentor` под fea для себя | ERROR 42501 (RLS WITH CHECK fail) | **`ERROR: new row violates row-level security policy`** | ✅ PASS |
| 2b | precreate под fixik, затем `UPDATE _mentor` под fea | `UPDATE 0` | **ERROR: infinite recursion** (на стадии row-scan UPDATE) | ❌ FAIL |

### Test 3 — Mentor (fixik) пишет `_mentor`

| # | Запрос | Ожидание | Факт | Статус |
|---|---|---|---|---|
| 3a | `INSERT _mentor (student_id=fea, status='draft')` под fixik | `INSERT 0 1`, mentor_id auto = fixik | `INSERT 0 1` | ✅ PASS (INSERT прошёл) |
| 3a.verify | `SELECT … WHERE student_id=fea` под fixik | mentor_id=fixik | **ERROR: infinite recursion** | ❌ FAIL |
| 3b | `UPDATE _mentor SET status='submitted'` | `UPDATE 1` | aborted | ❌ FAIL |
| 3c | `UPDATE _mentor SET status='draft'` после submit | `UPDATE 0` | aborted | ❌ FAIL |

### Test 4 — Mentor пытается писать `_self`

| # | Запрос | Ожидание | Факт | Статус |
|---|---|---|---|---|
| 4a | `INSERT _self (student_id=fea)` под fixik | ERROR 42501 | **`ERROR: new row violates row-level security policy`** | ✅ PASS |
| 4b | precreate fea-self, затем `UPDATE _self SET status='submitted'` под fixik | `UPDATE 0` | **ERROR: infinite recursion** | ❌ FAIL |

### Test 5 — parallel-blind (HEADLINE)

| # | Запрос | Ожидание §3.3 | Факт | Статус |
|---|---|---|---|---|
| 5.1 | fixik SELECT _self (both draft) | 0 rows | **ERROR: infinite recursion** | ❌ FAIL |
| 5.2 | fea SELECT _mentor (both draft) | 0 rows | aborted | ❌ FAIL |
| 5.3 | fea UPDATE self → submitted | UPDATE 1 | aborted | ❌ FAIL |
| 5.4 | fixik SELECT _self (self submitted, mentor draft) | 1 row | aborted | ❌ FAIL |
| 5.5 | fea SELECT _mentor (self submitted, mentor draft) | 0 rows (§3.3) | aborted | ❌ FAIL |
| 5.6 | fixik UPDATE mentor → submitted | UPDATE 1 | aborted | ❌ FAIL |
| 5.7 | mentor/menti SELECT after both submit | 1 row × 4 | aborted | ❌ FAIL |

### Test 6 — Admin (Olga) видит всё

| # | Запрос | Ожидание | Факт | Статус |
|---|---|---|---|---|
| 6.1 | olga SELECT _self (all draft) | ≥ 1 row | **ERROR: infinite recursion** | ❌ FAIL |
| 6.2 | olga SELECT _mentor (all draft) | ≥ 1 row | aborted | ❌ FAIL |

### Test 7 — Admin revision unlock

| # | Запрос | Ожидание | Факт | Статус |
|---|---|---|---|---|
| 7.0 | fea: INSERT draft → UPDATE submitted | OK, UPDATE 1 | INSERT 0 1, потом recursion на UPDATE | ❌ FAIL (на UPDATE-фазе) |
| 7.1 | fea UPDATE submitted (no-op попытка) | UPDATE 0 | aborted | ❌ FAIL |
| 7.2 | olga UPDATE status='revision' | UPDATE 1 | aborted | ❌ FAIL |
| 7.3 | fea UPDATE revision → submitted | UPDATE 1 | aborted | ❌ FAIL |
| 7.4 | финальное состояние под admin | status=submitted, score_total=10 | aborted | ❌ FAIL |

### Test 8 — web_anon default-deny

| # | Запрос | Ожидание | Факт | Статус |
|---|---|---|---|---|
| 8.1 | web_anon SELECT _self | permission denied (default deny) | **`ERROR: permission denied for table pvl_student_certification_self`** | ✅ PASS |
| 8.2 | web_anon SELECT _mentor | permission denied | **`ERROR: permission denied for table pvl_student_certification_mentor`** | ✅ PASS |

### Сводка официального прогона

- ✅ **PASS:** 1a, 2a, 3a (только INSERT), 4a, 8.1, 8.2 — всё, что попадает в WITH CHECK INSERT-проверки или web_anon GRANT-deny (не требует чтения существующих row).
- ❌ **FAIL:** все остальные — каскад от `infinite recursion` на первом же SELECT/UPDATE который требует row-scan через RLS SELECT-policy.

---

## 5. Диагностика FAIL'а — почему cross-EXISTS рекурсирует

`_self.SELECT.USING` ссылается на `_mentor` через `EXISTS (SELECT 1 FROM _mentor m WHERE m.student_id=… AND m.status='submitted')`. Подзапрос на `_mentor` тоже субъект RLS — его собственная `SELECT.USING` ссылается обратно на `_self` через симметричный EXISTS. Получается цикл `_self → _mentor → _self → …`. Postgres детектит и кидает `42P17 infinite recursion detected in policy for relation`.

Для UPDATE/DELETE — то же самое: при row-scan фазе Postgres применяет USING SELECT-политики, и подсасывает тот же рекурсивный цикл (см. https://www.postgresql.org/docs/16/ddl-rowsecurity.html — «USING of SELECT and UPDATE/DELETE policies are AND'd»).

INSERT не страдает — WITH CHECK не делает row-scan, потому 2a/4a проходят чисто (RLS deny на новой строке).

### Два пути исправления

**Вариант А — упростить policy, оставить только status-чек.**

```sql
-- _self
USING (
  student_id = auth.uid()
  OR is_admin()
  OR (is_mentor_for(student_id) AND status = 'submitted')
);
-- _mentor симметрично
USING (
  mentor_id = auth.uid()
  OR is_admin()
  OR (student_id = auth.uid() AND status = 'submitted')
);
```

Semantic: каждая сторона видит чужую запись **только когда чужая submitted**. Cross-unlock «mentor видит draft menti после своего submit» теряется, но это и так противоречило §3.3 scenario 5 (там menti после своего submit НЕ видит mentor draft).

**Вариант Б — оставить cross-EXISTS, но завернуть в SECURITY DEFINER helper.**

```sql
CREATE FUNCTION pvl_certification_other_side_submitted(p_student uuid, p_side text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM (
      SELECT status FROM pvl_student_certification_mentor WHERE student_id = p_student AND p_side = 'self'
      UNION ALL
      SELECT status FROM pvl_student_certification_self   WHERE student_id = p_student AND p_side = 'mentor'
    ) x WHERE status = 'submitted'
  );
$$;
```

SECURITY DEFINER bypass'ит RLS на читаемой таблице → цикл прерывается. Но: усложняет код, плюс семантика всё ещё противоречит §3.3 scenario 5.

### What-if прогон — proof что вариант А чинит всё

Прогнал dryrun с patch'ем (DROP+CREATE упрощённых SELECT-политик, всё остальное как в official). **Все 8 RLS-сценариев §3.3 PASS:**

| Test | Result |
|---|---|
| 1 (menti writes self) | INSERT 0 1, UPDATE 1, UPDATE 0 ✅ |
| 2 (menti tries mentor) | ERROR 42501 (2a), UPDATE 0 (2b) ✅ |
| 3 (mentor writes mentor) | INSERT 0 1, mentor_id=fixik via trigger ✅, UPDATE 1, UPDATE 0 ✅ |
| 4 (mentor tries self) | ERROR 42501 (4a), UPDATE 0 (4b) ✅ |
| **5 (parallel-blind HEADLINE)** | 5.1=0, 5.2=0, 5.4=1, **5.5=0** ✅ (§3.3 семантика), 5.7×4 = 1/1/1/1 ✅ |
| 6 (admin sees all) | admin self=1, admin mentor=1 ✅ |
| 7 (admin revision unlock) | UPDATE 0 → admin UPDATE 1 → menti UPDATE 1 → final submitted/score=10 ✅ |
| 8 (web_anon deny) | permission denied ×2 ✅ |

Полный лог what-if: `/tmp/phase40_whatif.log` (локально); ключевой блок Test 5 attached в §6 ниже.

### Моя рекомендация — Вариант А

- Чинит recursion.
- Совпадает с §3.3 scenario 5 expectations.
- Соответствует продуктовому решению #1 «parallel-blind до submit обеих» по простому чтению.
- Минимум кода.

«Возможность ментора заглянуть в draft menti после своего submit» — продуктовая фича второстепенная (мне неочевидно, зачем она нужна; mentor же не правит menti's self). Если стратег её намеренно держит — вариант Б с helper'ом, но тогда нужно поправить §3.3 scenario 5 или обосновать раздвоение.

---

## 6. Что показал what-if — ключевой блок parallel-blind (Test 5)

Дословный вывод psql для HEADLINE-теста (после применения миграции + patch упрощения SELECT-политик):

```
==================== TEST 5: parallel-blind (HEADLINE) ====================
-- 5.setup: fea->self draft, fixik->mentor draft
INSERT 0 1
INSERT 0 1
-- 5.1: mentor SELECT fea self (both draft) -- expect 0
          scenario           | rows
-----------------------------+------
 mentor_sees_self_BOTH_DRAFT |    0
(1 row)

-- 5.2: menti SELECT mentor row (both draft) -- expect 0
           scenario           | rows
------------------------------+------
 menti_sees_mentor_BOTH_DRAFT |    0
(1 row)

-- 5.3: menti submits self
UPDATE 1
-- 5.4: mentor SELECT _self (self submitted, mentor draft) -- expect 1
              scenario              | rows
------------------------------------+------
 mentor_sees_self_AFTER_SELF_SUBMIT |    1
(1 row)

-- 5.5: menti SELECT _mentor (self submitted, mentor draft) -- expect 0
                 scenario                 | rows
------------------------------------------+------
 menti_sees_mentor_AFTER_ONLY_SELF_SUBMIT |    0
(1 row)

-- 5.6: mentor submits
UPDATE 1
-- 5.7: both see both
          scenario           | rows
-----------------------------+------
 mentor_sees_self_AFTER_BOTH |    1
(1 row)
           scenario            | rows
-------------------------------+------
 mentor_sees_mentor_AFTER_BOTH |    1
(1 row)
          scenario          | rows
----------------------------+------
 menti_sees_self_AFTER_BOTH |    1
(1 row)
           scenario           | rows
------------------------------+------
 menti_sees_mentor_AFTER_BOTH |    1
(1 row)
```

Семантика precisely как в §3.3 решение #1 + #2.

---

## 7. Полный текст миграции (для review)

Файл: `garden/database/pvl/migrations/2026-05-28_phase40_pvl_certification_split.sql` (создан, **не закоммичен**). Apply-команда в header'е файла (повторяет паттерн phase39).

Структура:
- Section 1: ASSERT-блок (пустота старых таблиц + disputes без cert-ref'ов) + DROP CONSTRAINT pvl_student_disputes_certification_score_id_fkey
- Section 2: DROP TABLE × 2 (CASCADE) — pvl_student_certification_{criteria_scores,scores}
- Section 3: CREATE TABLE pvl_student_certification_self + 2 индекса + updated_at trigger
- Section 4: CREATE TABLE pvl_student_certification_mentor + 3 индекса + updated_at trigger + CREATE FUNCTION pvl_set_certification_mentor_id (SECURITY DEFINER) + trigger BEFORE INSERT OR UPDATE
- Section 5: ALTER ENABLE RLS + 7 политик на _self **(в том виде, как в TZ §3.1 — с cross-EXISTS. ПОДЛЕЖИТ ПРАВКЕ — см. §5 этого отчёта)**
- Section 6: то же для _mentor (тоже с cross-EXISTS — ПОДЛЕЖИТ ПРАВКЕ)
- Section 7: GRANT × 2 direct + CREATE OR REPLACE ensure_garden_grants() (свап) + SELECT public.ensure_garden_grants()
- Verify (вне транзакции): V1 tables, V2 RLS+policies, V3 trigger, V4 grants count, V5 proc body matches new tables

Файл целиком — слишком длинный для inline в этом md-отчёте (~420 строк). Стратег читает с диска.

**Если стратег одобряет Вариант А** — мне нужно отредактировать sections 5 и 6 (drop EXISTS-блоки), потом получаем clean apply-ready миграцию.

---

## 8. recover_grants.sh (TZ §3.2)

Прочитал на VPS: `/opt/garden-monitor/recover_grants.sh`. Это **bash-wrapper над `ensure_garden_grants()` DB-proc'ом** (см. inline). Никаких raw GRANT-statements в скрипте нет. Скрипт делает:

1. source `/opt/garden-auth/.env` → DB_HOST/USER/PASS/NAME/SSL*
2. `psql … -c "SELECT public.ensure_garden_grants();"`
3. read counts: `SELECT count(*) FROM information_schema.role_table_grants WHERE grantee IN (authenticated,web_anon)`
4. assert `AUTH_CNT=166 AND ANON_CNT=4`, exit 1 если нет

Поскольку:
- proc обновляется внутри миграции (swap 2 dropped → 2 new в Part 1);
- net таблиц = 41 (как было);
- counts остаются 166/4 (verify B.4 это подтвердил);

**recover_grants.sh правки НЕ требует.** TZ §3.2 в текущей форме относится к гипотетическому случаю, когда GRANT'ы живут прямо в bash. На текущем VPS — они только в proc'е.

**Что подготовлено** (на случай если стратег хочет всё равно записать историю в bash как backup): никакого diff — текущий файл корректен. После apply миграции советую вызвать `/opt/garden-monitor/recover_grants.sh` руками — он сразу даст confirmation что AUTH_CNT=166 / ANON_CNT=4 после миграции.

---

## 9. Требует решения стратега

Сводно, чтобы не потерять:

1. **Главное — RLS recursion fix.** Какой вариант принимаем?
   - **(А)** Drop cross-EXISTS, оставить только status='submitted' (рекомендую) — what-if proof в §6.
   - **(Б)** SECURITY DEFINER helper-функция `pvl_certification_other_side_submitted(student_id, side)`, через которую SELECT-policy её вызывает — bypass RLS. Семантика как в §3.1, но не совпадает с §3.3.
   - **(В)** Что-то иное?
2. **Discrepancy §3.1 vs §3.3 scenario 5** — независимо от (А/Б). Какая семантика канон? «Менти видит mentor только когда mentor submitted» (§3.3) vs «менти видит mentor когда mentor submitted ИЛИ когда сама submitted» (§3.1). Если канон §3.3 → вариант А и есть единственный путь. Если канон §3.1 → нужен Б, но тогда §3.3 scenario 5 expectations надо переписать.
3. **Extension §3.1 — CREATE OR REPLACE ensure_garden_grants() в той же миграции.** Подтверждаешь pattern phase38, или хочешь выделить в отдельную миграцию? (Если отдельная — phase40 single-apply сломается, recommend оставить inline.)
4. **§3.2 recover_grants.sh правка** — на проде она не нужна (см. §8 отчёта). Подтвердить, что закрываем без deploy.

---

## 10. Дисциплина — что НЕ сделано в этой сессии

- ✅ Никаких COMMIT'ов. Прод не задет — оба прогона `ROLLBACK`. После — `SELECT … FROM pg_tables` показал старые `pvl_student_certification_{scores,criteria_scores}` живыми, новые `_self/_mentor` отсутствуют.
- ✅ Никаких git commit'ов / push'ов. Миграция-файл создан локально, но `git status` не трогал.
- ✅ Apply на прод — после 🟢 стратега, не сейчас.
- ✅ Не «самопочинил» обнаруженный baseline-bug в TZ §3.1. Описал в §5 этого отчёта, what-if прогон — это research, не deploy.
- ✅ Recon helper'ы и тест-пары — без изменений с _143, всё на месте.

---

## 11. Артефакты сессии (для аудита)

| Файл | Где | Назначение |
|---|---|---|
| `database/pvl/migrations/2026-05-28_phase40_pvl_certification_split.sql` | локально, **не commit** | финальная миграция в форме §3.1 + extension proc swap (sections 5/6 пока с cross-EXISTS — подлежат правке после решения стратега) |
| `/tmp/phase40_full.sql` | на VPS | копия файла выше |
| `/tmp/phase40_body.sql` | на VPS | то же, sed-стрипнут от BEGIN/COMMIT для `\i` внутри dryrun-обёртки |
| `/tmp/phase40_dryrun.sql` | локально + VPS | официальный wrapper (BEGIN, \i body, тесты §3.3, ROLLBACK) |
| `/tmp/phase40_dryrun_official.log` | локально (`/tmp/phase40_dryrun_official.log`) | лог официального прогона |
| `/tmp/phase40_dryrun_whatif.sql` | локально + VPS | wrapper с patch'ем упрощённых SELECT-политик |
| `/tmp/phase40_whatif.log` | локально (`/tmp/phase40_whatif.log`) | лог what-if прогона |

Логи локально, не в репо. Если нужны в git — могу переложить в `docs/_session/_raw/`.

---

**Следующий шаг:** жду 🟢 от стратега по §9. После — правлю sections 5/6 миграции (если вариант А), коммитю, готовим apply.

**Файл:** `garden/docs/_session/2026-05-28_145_codeexec_etap2_backend_dryrun.md`
