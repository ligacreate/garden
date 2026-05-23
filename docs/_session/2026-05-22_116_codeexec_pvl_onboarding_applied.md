# phase37 v3 apply — ✅ COMMIT, все verify прошли

**От:** codeexec (VS Code Claude Code)
**Кому:** стратега (claude.ai) → Ольга
**Дата:** 2026-05-23
**В ответ на:** 🟢 APPLY phase37 v3
**Тип:** Applied report. **Без commit (git), без push.** Прод в новом состоянии.

---

## TL;DR

- ✅ **Apply прошёл целиком.** `BEGIN → 8 секций → ensure_garden_grants → COMMIT`. Backfill assertion: 13 rows вставлено, как и ожидалось.
- ✅ **Все V0..V8 = ожидания** (см. § 2 ниже).
- 🎯 Прод в целевом состоянии: pvl_students=28, 2 cohort'а с датами, FK активен, trigger создаёт rows на одобрении, 14 orphans → 1 orphan (Суроватская ждёт явного одобрения админом).
- 🛑 git-commit и push НЕ делала.

---

## 1. Apply log (raw, сокращённый)

```
BEGIN
ALTER TABLE × 3       ← Section 1a: pvl_cohorts/pvl_course_lessons/pvl_mentors.updated_at
COMMENT × 3
ALTER TABLE × 2       ← Section 1b: pvl_cohorts.start_date/end_date
NOTICE: constraint "pvl_cohorts_dates_check" does not exist, skipping
ALTER TABLE           ← CHECK
COMMENT × 2
UPDATE 1              ← Section 2: даты Поток 1
INSERT 0 1            ← Section 2: Поток 2
DO                    ← Section 3: pre-check orphan reverse = 0 OK
ALTER TABLE × 2 + COMMENT  ← Section 4: FK
CREATE FUNCTION + COMMENT  ← Section 5: trigger function
NOTICE: constraint "pvl_students_id_fk_profiles" ... does not exist, skipping
NOTICE: trigger "trg_profiles_pvl_student_on_approval" ... does not exist, skipping
DROP TRIGGER + CREATE TRIGGER  ← Section 6: trigger AFTER UPDATE OF role, access_status
DO                    ← Section 7: backfill интернов
NOTICE: phase37 backfill: вставлено 13 rows для interns (ожидалось 13)
SELECT 1              ← Section 8: ensure_garden_grants
COMMIT  ✅
```

Exit code 0. Все три NOTICE «constraint/trigger does not exist, skipping» — ожидаемые от `DROP IF EXISTS` (первый apply, нечего DROP'ить).

---

## 2. VERIFY V0..V8

### V0: updated_at колонки добавлены во все 3 таблицы (v2 fix)

```
     table_name     | has_updated_at 
--------------------+----------------
 pvl_cohorts        | t
 pvl_course_lessons | t
 pvl_mentors        | t
```

✅ 3 строки, все `t`. **Латентный bug класса закрыт** для всех трёх таблиц с trigger'ом `pvl_set_updated_at`.

### V1: pvl_cohorts — два потока с датами

```
                  id                  |      title       | year | start_date |  end_date  
--------------------------------------+------------------+------+------------+------------
 11111111-1111-1111-1111-111111111101 | ПВЛ 2026 Поток 1 | 2026 | 2026-04-15 | 2026-07-01
 ca2b1ce3-c716-49b8-a303-216704b50f13 | ПВЛ 2026 Поток 2 | 2026 | 2026-09-15 | 2026-12-20
```

✅ Поток 1 backfill'нут датами (15.04–01.07.2026). Поток 2 создан с новым UUID (15.09–20.12.2026).

### V2: pvl_students count

```
 pvl_students_total 
--------------------
                 28
```

✅ **28 = 15 (было) + 13 (backfill)**. Точно как ожидалось.

### V3: orphan profiles (applicant + intern без pvl_students row)

```
                  id                  |           email           |   role    |  access_status   
--------------------------------------+---------------------------+-----------+------------------
 e5343d9d-0a51-4d1b-9a8d-6832796b429b | asurovatskaya26@gmail.com | applicant | pending_approval
```

✅ **Ровно 1 строка** — Суроватская, pending_approval. Это **корректное** состояние: она ждёт явного одобрения админа; trigger её подхватит при одобрении (smoke-сценарий 3.2 из `_110`).

### V4: FK pvl_students.id → profiles(id)

```
           conname           |                            def                             
-----------------------------+------------------------------------------------------------
 pvl_students_id_fk_profiles | FOREIGN KEY (id) REFERENCES profiles(id) ON DELETE CASCADE
```

✅ FK на месте. ARCH-010 закрыт.

### V5: trigger function existence + SECURITY DEFINER

```
              proname               | is_definer 
------------------------------------+------------
 trg_create_pvl_student_on_approval | t
```

✅ Функция создана, `is_definer = t`. Обходит RLS `pvl_students_insert_admin`.

### V6: trigger привязан к profiles UPDATE OF role, access_status

```
trg_profiles_pvl_student_on_approval | CREATE TRIGGER trg_profiles_pvl_student_on_approval
    AFTER UPDATE OF role, access_status ON public.profiles
    FOR EACH ROW
    WHEN (
        ((new.role = ANY (ARRAY['applicant'::text, 'intern'::text]))
         AND (((old.access_status = 'pending_approval'::text)
                AND (new.access_status = 'active'::text))
              OR (old.role IS DISTINCT FROM new.role)))
    )
    EXECUTE FUNCTION trg_create_pvl_student_on_approval()
```

✅ Trigger подвешен на `AFTER UPDATE OF role, access_status` с правильным комбинированным WHEN (механизм c из `_110` § 1.5).

### V7: активный cohort на сегодня (2026-05-23)

```
                  id                  |      title       | start_date |  end_date  
--------------------------------------+------------------+------------+------------
 11111111-1111-1111-1111-111111111101 | ПВЛ 2026 Поток 1 | 2026-04-15 | 2026-07-01
```

✅ Поток 1. Сегодня 2026-05-23 попадает в окно 15.04–01.07. Trigger подставит этот cohort_id при одобрении Суроватской.

### V8: RUNBOOK 1.3 — grants

```
 auth_grants | anon_grants 
-------------+-------------
         158 |           4
```

✅ **158/4** — точно как требует RUNBOOK 1.3. `ensure_garden_grants()` отработала, GRANT-wipeout от Timeweb DDL предотвращён.

---

## 3. Сводка ожиданий vs факта

| verify | ожидание | факт | статус |
|--------|----------|------|--------|
| V0 | 3 строки, все t | 3/3 t | ✅ |
| V1 | 2 потока с датами | 2 потока с правильными датами | ✅ |
| V2 | 28 | 28 | ✅ |
| V3 | 1 orphan (Суроватская) | 1 (Суроватская) | ✅ |
| V4 | FK существует | FK + ON DELETE CASCADE | ✅ |
| V5 | function, is_definer=t | trg_create_pvl_student_on_approval, t | ✅ |
| V6 | trigger AFTER UPDATE OF role, access_status | exact match с правильным WHEN | ✅ |
| V7 | Поток 1 активен | Поток 1 | ✅ |
| V8 | 158 / 4 | 158 / 4 | ✅ |

**9/9 verify прошли.** Никаких расхождений.

---

## 4. Backfill — кто получил pvl_students row

13 интернов, всем подставлен `cohort_id = 11111111-...-101` (Поток 1, активный сегодня):
- soboleva.yanna@yandex.ru
- bondarenko.lightlin@gmail.com
- nbazhenova@mail.ru
- muza_skorpi@mail.ru
- ru.traibl@gmail.com
- I.am.yaroslava@mail.ru
- ivashova.0@yandex.ru
- anastskoro@gmail.com
- kulish-inn@yandex.ru
- ruxshana_89@mail.ru
- natali228@ya.ru
- e.yaroschuk@gmail.com
- zakirovas2008@rambler.ru

Каждый получил `full_name` из `profiles.name`, `status='active'`, `cohort_id` Потока 1.

---

## 5. Что закрылось

- ✅ **BUG-PVL-ONBOARDING-MISSING-STUDENT-RECORD (P1)** — корневой fix. Новые applicant'ы при одобрении админом будут получать `pvl_students` row атомарно (trigger).
- ✅ **ARCH-010 (P2)** — FK `pvl_students.id → profiles(id) ON DELETE CASCADE` формализовал convention.
- ✅ **BUG-PVL-ENSURE-RESPECTS-ROLE (P2)** — whitelist `NEW.role IN ('applicant','intern')` в WHEN не пускает admin/mentor/leader.
- 🟡 **ARCH-012 (P2)** — серверный flow готов, но client-side ensure-loop пока остаётся как fallback. **Cleanup отдельным PR через 2-3 дня** после verify trigger'а в проде (по плану `_109` Workflow пункт 6).
- ✅ **Латентный bug `pvl_set_updated_at` без колонки** — закрыт для `pvl_cohorts`, `pvl_course_lessons`, `pvl_mentors`. Параллельный bug, найденный в _111.

---

## 6. Smoke (следующий шаг)

Полный smoke-план в [`_110_codeexec_pvl_onboarding_impl_diff.md`](2026-05-22_110_codeexec_pvl_onboarding_impl_diff.md) § 3.

**Главный smoke (одобри Суроватскую):**
1. Открыть /admin под Ольгой → найти `asurovatskaya26@gmail.com` (applicant, suspended).
2. Нажать ⛔️ (вернуть доступ).
3. Проверка в SQL:
   ```sql
   SELECT p.email, p.role, p.access_status,
          ps.id IS NOT NULL AS has_pvl_row,
          ps.cohort_id IS NOT NULL AS has_cohort
     FROM profiles p
     LEFT JOIN pvl_students ps ON ps.id = p.id
    WHERE p.email = 'asurovatskaya26@gmail.com';
   ```
   Ожидание: `applicant | active | t | t` — trigger создал row, cohort_id = Поток 1.

**Дополнительные smoke-сценарии** — intern сдаёт ДЗ (FK regression check), admin write не создаёт фейк-row.

---

## 7. Что я НЕ сделала (по инструкции)

- ❌ `git commit` / `git push` ни в локальном репо, ни в garden-auth. Прод-схема обновлена, репозиторий — нет. Жду 🟢 на commit.
- ❌ Smoke-сценарии 3.1-3.4 из `_110` не выполняла (это для Ольги в Chrome).
- ❌ Не обновляла BACKLOG.md тикетов (статусы ARCH-010/012, BUG-PVL-* — отдельный коммит после smoke).
- ❌ Не удаляла client-side ensure-loop (`ARCH-012` cleanup) — отдельный PR через 2-3 дня.

---

## 8. Эффорт

- V2 echo micro-edit: ~1 мин
- scp + apply: ~30 сек
- парсинг V0..V8 + проверка ожиданий: ~3 мин
- _116 отчёт: ~10 мин

Итого ~15 мин на финальный apply + verify.
