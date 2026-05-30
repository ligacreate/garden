# phase42 — DRYRUN тумблера certification_open (Сессия A, storage)

**От:** codeexec → стратегу через Ольгу · **Дата:** 2026-05-30
**Тип:** read-only recon + DRYRUN (BEGIN…ROLLBACK). НЕ применено, НЕ закоммичено, НЕ запушено.
**База:** ТЗ [_171](2026-05-30_171_strategist_tz_certification_toggle.md); контекст [_148](2026-05-28_148_codeexec_etap2_backend_applied.md) (phase40), [_170](2026-05-30_170_codeexec_etap2_split_idfix_copy.md).

---

## 0. TL;DR

✅ **Dryrun зелёный, прод не изменён** (post-rollback колонка отсутствует).

- git: local `main` впереди `origin/main` на **4** cert-коммита, `origin/main = 9b441d4`. НЕ пушу.
- **Хорошая новость:** на `pvl_cohorts` **RLS уже включён** и уже есть **полный корректный набор политик**, ровно покрывающий ТЗ §3 (SELECT для членов когорты + **UPDATE только `is_admin()`**). **RLS трогать не нужно.**
- Миграция сведена к минимуму ТЗ §2: `ADD COLUMN certification_open boolean NOT NULL DEFAULT false` + COMMENT + `ensure_garden_grants()` (reload schema). Файл: `database/pvl/migrations/2026-05-30_phase42_pvl_cohort_certification_open.sql`.
- Net authenticated grants после миграции = **166** (без изменений); add-колонки грантов не требует.
- **Жду 🟢 на apply.**

---

## 1. git — состояние подтверждено

```
On branch main — ahead of 'origin/main' by 4 commits.
001831d fix(pvl): Этап2 — id-проброс + развязка страниц + копирайт   ← local
e2239b3 feat(pvl): Этап2 Сессия4 — compare-view + admin-revision
62da66b feat(pvl): Этап2 Сессия3 — cert Block + wizard self/mentor
5ae3c21 feat(pvl): Этап2 Сессия2 — cert API + reflection + редиректы
9b441d4 hot-patch: SWR TTL … (= origin/main)                        ← origin
```

---

## 2. RECON pvl_cohorts (read-only, gen_user) — ключевое

| # | Что | Результат |
|---|---|---|
| R1 | колонки | id, title, year, created_at, updated_at, start_date, end_date · trigger `trg_pvl_cohorts_updated_at` BEFORE UPDATE |
| **R2** | **RLS** | **`relrowsecurity = t` — УЖЕ ВКЛЮЧЁН** |
| **R3** | **политики** | **6 штук, уже корректные** (ниже) |
| R4 | гранты | `authenticated`: SELECT/INSERT/UPDATE/DELETE · `gen_user`(owner): all · **web_anon: нет** |
| R5 | хелперы | `is_admin()`, `has_platform_access(uuid)`, `is_pvl_cohort_peer(uuid)`, `is_mentor_for(uuid)` — все есть (SECURITY DEFINER) |
| R6 | когорты | Поток 1 `…101` (2026-04-15…07-01) · Поток 2 `ca2b1ce3…` (2026-09-15…12-20) |
| R7 | `certification_open` | **ещё нет** |
| R8 | тест-пара | фея `1085e06d…` → Поток 1 ✓. (фиксик `1b10d2ef…` — ментор, это `profiles`, не строка `pvl_students` — в R8 не вернулся, это нормально.) |

### 2.1 Существующие политики pvl_cohorts (R3) — уже покрывают ТЗ §3

| Политика | Тип | Cmd | Выражение |
|---|---|---|---|
| `pvl_cohorts_active_access_guard_select` | RESTRICTIVE | SELECT | `has_platform_access(auth.uid())` |
| `pvl_cohorts_active_access_guard_write` | RESTRICTIVE | ALL | `has_platform_access(auth.uid())` |
| `pvl_cohorts_select_all` | PERMISSIVE | SELECT | `true` |
| `pvl_cohorts_insert_admin` | PERMISSIVE | INSERT | `is_admin()` |
| **`pvl_cohorts_update_admin`** | PERMISSIVE | UPDATE | **`is_admin()` (USING+CHECK)** |
| `pvl_cohorts_delete_admin` | PERMISSIVE | DELETE | `is_admin()` |

→ **SELECT `certification_open`**: любой active-access authenticated (менти/ментор/admin) читает когорту → флаг виден. ✓ ТЗ §3.
→ **UPDATE `certification_open`**: только `is_admin()` → менти/ментор PATCH'ить не могут (403). ✓ ТЗ §3. **Доп. RLS не требуется.**

### 2.2 Чем когорта читается на фронте (для §4, Сессия B)

- `pvlPostgrestApi.listCohorts()` (services/pvlPostgrestApi.js:581) → `select=id,title,year` — используется в **AdminPvlProgress.jsx** (селектор когорты админки). Сюда же встроим `certification_open` для admin-тумблера (ТЗ §4: «если загрузка когорты уже есть — встрой флаг туда»).
- Для gating менти/ментора (§5) когорта студента известна по `cohort_id` → добавлю точечный `getCohortCertificationOpen(cohortId)` (ТЗ §4). Запись — `setCohortCertificationOpen(cohortId, open)` (PATCH, RLS пустит только admin).

---

## 3. Текст миграции (готов, НЕ применён)

Файл: `database/pvl/migrations/2026-05-30_phase42_pvl_cohort_certification_open.sql`

```sql
BEGIN;

ALTER TABLE public.pvl_cohorts
  ADD COLUMN certification_open boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pvl_cohorts.certification_open IS
  'Тумблер приёма сертификационных завтраков (Этап 2). DEFAULT false = приём
   закрыт; существующие когорты после миграции ЗАКРЫТЫ намеренно — фича катится
   готовой-закрытой, admin открывает вручную (phase42, 2026-05-30).';

SELECT public.ensure_garden_grants();   -- reload schema + idempotent grants; тело proc'а НЕ меняем
COMMIT;

-- + VERIFY V1–V4 (вне транзакции)
```

**RLS не трогаем** (уже корректный, §2.1). **ensure_garden_grants() не модифицируем** — `pvl_cohorts` уже в grant-листе, add-колонки грантов не требует; вызов нужен ради `NOTIFY pgrst 'reload schema'` (новая колонка в API) + idempotent-страховки от Timeweb daily wipe (~13:08 UTC).

---

## 4. DRYRUN — результат (BEGIN…ROLLBACK на проде, прогон ×2 идентичный)

### `\d pvl_cohorts` внутри транзакции (после ADD COLUMN):

```
       Column       |   Type    | Nullable | Default
--------------------+-----------+----------+-------------------
 id                 | uuid      | not null | gen_random_uuid()
 title              | text      | not null |
 year               | integer   |          |
 created_at         | timestamptz| not null| now()
 updated_at         | timestamptz| not null| now()
 start_date         | date      |          |
 end_date           | date      |          |
 certification_open | boolean   | not null | false          ← НОВОЕ
Check constraints: pvl_cohorts_dates_check
Referenced by: pvl_student_certification_{self,mentor}.cohort_id, pvl_students.cohort_id
Policies: (6 — без изменений) active_access_guard_select/_write (RESTRICTIVE),
          select_all (true), insert_admin/update_admin/delete_admin (is_admin())
Triggers: trg_pvl_cohorts_updated_at BEFORE UPDATE
```

| Verify | Результат | Ожидание | ✓ |
|---|---|---|---|
| V1 колонка | `certification_open · boolean · NO · false` | boolean NOT NULL false | ✓ |
| V2 когорты закрыты | `total=2, open_cnt=0` | 2 / 0 | ✓ |
| V3 RLS / политики | `rls_enabled=t`, `policies=6` | t / 6 (без изменений) | ✓ |
| V4 net grants | `166` | 166 | ✓ |

### POST-ROLLBACK (прод не тронут):

```
колонка certification_open : (0 rows)   ← отсутствует
```
✅ Прод в исходном состоянии. Никаких записей не сделано.

---

## 5. Дисциплина / что НЕ сделано

- ❌ apply — жду 🟢. ❌ commit — жду 🟢. ❌ push — отдельный 🟢 PUSH.
- ✅ Только read-only recon + BEGIN…ROLLBACK. Прод не изменён.
- ✅ `ensure_garden_grants()` не правил. `recover_grants.sh` не трогал.
- Файлы на VPS `/tmp/recon_phase42_cohorts.sql`, `/tmp/dryrun_phase42.sql` — безвредны.

---

## 6. После 🟢 (план)

- **A (apply):** scp + psql single-tx phase42 → V1–V4 PASS → `recover_grants.sh` (ожид. 166/4, exit 0) → commit (после 🟢).
- **A (API):** `getCohortCertificationOpen` / `setCohortCertificationOpen` в `services/pvlPostgrestApi.js` + встроить флаг в `listCohorts` select для admin-UI (ТЗ §4).
- **B (frontend):** gating `PvlCertificationBlock` (locked «Приём откроется позже» при closed & не-admin; admin всегда видит) + admin-тумблер по когорте (ТЗ §5–6).

---

## 7. APPLY — ВЫПОЛНЕНО ✅ (🟢 Ольги, 2026-05-30)

Команда — scp + psql single-tx (точно по header'у миграции, gen_user).

| Событие | UTC |
|---|---|
| APPLY_START | `2026-05-30T13:00:30Z` |
| APPLY_END | `2026-05-30T13:00:41Z` |
| Длительность | ~11 сек, exit 0 |

Лог apply: `BEGIN → ALTER TABLE → COMMENT → ensure_garden_grants() → COMMIT`.

### In-migration VERIFY (post-COMMIT, live) + независимый повторный VERIFY (×2 идентично):

| Verify | Результат | ✓ |
|---|---|---|
| V1 колонка | `certification_open · boolean · NO · false` | ✓ |
| V2 когорты | Поток 1 `…101` = `f` · Поток 2 `ca2b1ce3…` = `f` | ✓ |
| V2b счётчик | total=2, open_cnt=0 | ✓ |
| V3 RLS / политики | `t` / `6` (без изменений) | ✓ |
| V4 net authenticated grants | `166` (без изменений) | ✓ |
| V5 COMMENT | проставлен дословно | ✓ |

### recover_grants.sh:
```
[2026-05-30T13:01:04Z] recover: calling ensure_garden_grants()
[2026-05-30T13:01:04Z] recover: after recovery: authenticated=166 web_anon=4 (expected 166/4)
[2026-05-30T13:01:04Z] recover: OK: grants restored to baseline (166/4)
RECOVER_EXIT=0
```
→ **166 / 4, exit 0** ✓. Daily Timeweb wipe корректно восстановит грант на `pvl_cohorts` (колонка покрыта table-level грантом).

**Состояние прода:** обе когорты `certification_open=false` (приём закрыт). RLS/политики не менялись. PostgREST schema reload отправлен (`NOTIFY pgrst`) — колонка видна в API.

**НЕ закоммичено** (ждём отдельный 🟢 на commit), **НЕ запушено** (отдельный 🟢 PUSH). Файлы на VPS `/tmp/*phase42*.sql` — безвредны.

**Файл:** `docs/_session/2026-05-30_172_codeexec_phase42_cohort_toggle_dryrun.md`
