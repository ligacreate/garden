# BUG-PVL-ONBOARDING-MISSING-STUDENT-RECORD — implementation-бриф

**От:** стратега (claude.ai)
**Кому:** codeexec (VS Code Claude Code)
**Дата:** 2026-05-22
**Зелёный:** Ольга 🟢
**В ответ на:** [_108](2026-05-22_108_codeexec_pvl_onboarding_recon.md)
**Тип:** Implementation — DIFF на ревью. Без apply / commit / push до отдельного 🟢.

---

## TL;DR

Architectural fix для BUG-PVL-ONBOARDING-MISSING-STUDENT-RECORD по варианту «DB trigger + FK + backfill» из `_108` Recommendation. Закрывает 4 тикета одной миграцией: P1 (BUG-PVL-ONBOARDING), P2 (ARCH-010 FK), P2 (ARCH-012, частично — cleanup отдельным PR через 2-3 дня), P2 (BUG-PVL-ENSURE-RESPECTS-ROLE).

**Расхождение с твоей рекомендацией в `_108`:** триггер привязываем НЕ к INSERT в `profiles`, а к **моменту одобрения админом + выбору роли**. Регистрация ничего не предполагает (человек ещё непонятный); pvl_students row создаётся когда Ольга в админ-UI говорит «это applicant/intern». Если она ставит leader (уже выпускница, вернувшаяся) — pvl_students НЕ создаётся.

**Cohort выбирается автоматически по датам** через новые колонки `pvl_cohorts.start_date` / `end_date`. Никаких `app_settings` ключей, никаких хардкодов.

---

## Продуктовые решения (зафиксировано с Ольгой)

| # | Решение |
|---|---------|
| 1 | Триггер срабатывает в **момент одобрения админом** (когда выбирается роль), не на регистрации |
| 2 | `pvl_students` row создаётся для **applicant и intern**. Leader — НЕ создаётся (выпускницы, не активные ученицы) |
| 3 | Cohort подставляется **по календарю** — активный сейчас. Нет активного → NULL (edge case летом/после декабря, admin проставит вручную) |
| 4 | В БД заводим **два потока** с датами: Поток 1 (15.04–01.07.2026) + Поток 2 (15.09–20.12.2026) |
| 5 | Backfill: только **14 уже одобренных interns**. Суроватская (1 applicant, pending_approval) — ждёт явного одобрения от Ольги, тогда trigger её и подхватит. 18 leaders — НЕ трогаем |
| 6 | Клиентский `ensurePvlStudentInDb` ensure-loop удаляем **отдельным PR через 2-3 дня** после verify trigger'а в проде |

---

## Технические задачи

### Задача A: Mini-recon (до написания миграции)

Прежде чем выбирать механизм триггера, **подтверди в коде/UI** (read-only):

1. **Текущий flow одобрения** в админ-UI Garden:
   - Где (файл + line) админ одобряет нового applicant'а?
   - Что меняется в БД в момент одобрения: `access_status` от `'pending_approval'` → `'active'`? Только это, или вместе с `status`?
   - При **promotion** (applicant → intern → leader) — это отдельные admin-actions или один и тот же?
   - На UI это **отдельная кнопка «одобрить»** или редактирование общей формы профиля?

2. **Выбор механизма триггера** — какой event лучше всего отражает «одобрение + выбор роли»:
   - (a) `AFTER UPDATE OF access_status ON profiles WHEN OLD.access_status = 'pending_approval' AND NEW.access_status = 'active' AND NEW.role IN ('applicant','intern')` — fire'ит ровно на одобрении
   - (b) `AFTER UPDATE OF role ON profiles WHEN OLD.role IS DISTINCT FROM NEW.role AND NEW.role IN ('applicant','intern')` — fire'ит на любой смене роли, но не сработает если applicant'а одобряют без смены роли
   - (c) Комбинированный: `AFTER UPDATE OF role, access_status ...` с OR-логикой в WHEN
   - (d) Другой вариант, который я не вижу из брифа

Выбери лучший вариант исходя из реального flow. **Приоритеты при выборе:**
- Идемпотентность (повторный одобрение / смена access_status не создаёт дубликат — ON CONFLICT DO NOTHING)
- Безопасность от лишних fire'ов (не создаём pvl_students для admin/mentor/leader при role-promotion'ах)
- Простота читаемости

Опиши выбор в начале диффа: «Выбран механизм (X) потому что...».

### Задача B: Миграция одной транзакцией

Файл: `migrations/2026-05-23_phase26_pvl_onboarding_atomic.sql` (или твой номер фазы; следующий по порядку).

Включает:

1. **Расширение схемы `pvl_cohorts`:**
   ```sql
   ALTER TABLE pvl_cohorts ADD COLUMN IF NOT EXISTS start_date date;
   ALTER TABLE pvl_cohorts ADD COLUMN IF NOT EXISTS end_date date;
   ```
   (Опционально — добавить CHECK constraint `end_date >= start_date`.)

2. **Backfill дат Потока 1 + добавление Потока 2:**
   ```sql
   UPDATE pvl_cohorts
      SET start_date = '2026-04-15', end_date = '2026-07-01'
    WHERE id = '11111111-1111-1111-1111-111111111101';

   INSERT INTO pvl_cohorts (id, title, year, start_date, end_date)
   VALUES (gen_random_uuid(), 'ПВЛ 2026 Поток 2', 2026, '2026-09-15', '2026-12-20')
   ON CONFLICT DO NOTHING;
   ```

3. **FK `pvl_students.id → profiles(id) ON DELETE CASCADE`** (закрывает ARCH-010):
   ```sql
   ALTER TABLE pvl_students
     ADD CONSTRAINT pvl_students_id_fk_profiles
     FOREIGN KEY (id) REFERENCES profiles(id) ON DELETE CASCADE;
   ```
   Предварительно подтверди что `orphan_pvl_students = 0` (`_108` это уже показал — FK добавится без ошибок).

4. **Trigger function** (SECURITY DEFINER, обходит RLS):
   ```sql
   CREATE OR REPLACE FUNCTION public.trg_create_pvl_student_on_approval()
   RETURNS trigger
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public, pg_temp
   AS $$
   DECLARE
       v_cohort_id uuid;
   BEGIN
       -- Активный поток на сегодня
       SELECT id INTO v_cohort_id
         FROM public.pvl_cohorts
        WHERE CURRENT_DATE BETWEEN start_date AND end_date
        ORDER BY start_date DESC
        LIMIT 1;

       INSERT INTO public.pvl_students (id, full_name, status, cohort_id)
       VALUES (NEW.id,
               COALESCE(NEW.name, NEW.email, 'Участница'),
               'active',
               v_cohort_id)  -- может быть NULL в edge case
       ON CONFLICT (id) DO NOTHING;

       RETURN NEW;
   END;
   $$;
   ```

5. **CREATE TRIGGER** с механизмом из Задачи A.

6. **Одноразовый backfill 14 interns:**
   ```sql
   INSERT INTO pvl_students (id, full_name, status, cohort_id)
   SELECT p.id,
          COALESCE(p.name, p.email, 'Участница'),
          'active',
          (SELECT id FROM pvl_cohorts
            WHERE CURRENT_DATE BETWEEN start_date AND end_date
            ORDER BY start_date DESC LIMIT 1)
     FROM profiles p
     LEFT JOIN pvl_students ps ON ps.id = p.id
    WHERE p.role = 'intern'
      AND ps.id IS NULL;
   ```
   Ожидаемо: 14 строк. Если число другое — STOP, отчёт стратегу.

7. **`SELECT public.ensure_garden_grants();`** в конце (RUNBOOK 1.3 — обязательно после DDL).

8. **Verify-блок** в конце миграции (комментарии или RAISE NOTICE с counts):
   - `SELECT count(*) FROM pvl_students;` — было 15, ожидается 29 (15+14)
   - `SELECT count(*) FROM pvl_cohorts;` — было 1, ожидается 2
   - `SELECT count(*) FROM profiles p LEFT JOIN pvl_students ps ON ps.id = p.id WHERE p.role IN ('applicant','intern') AND ps.id IS NULL;` — ожидается 1 (Суроватская, ждёт одобрения)

### Задача C: Smoke-план (для после apply)

В отчёт включи **paste-ready smoke-сценарий**, который Ольга (или Claude in Chrome от её имени) выполнит после apply. Минимум:
1. SQL verify-блок (counts из задачи B)
2. Шаг «одобри Суроватскую» (admin UI) → проверка что pvl_students row появилась
3. Шаг «попроси любую existing intern сдать ДЗ» → проверка что submission проходит без FK violation

### Задача D: Что НЕ делать в этом PR

- **НЕ удалять** клиентский `ensurePvlStudentInDb` и 8 callsite'ов из `services/pvlMockApi.js`. Это **отдельный PR** через 2-3 дня после verify trigger'а в проде (старый код остаётся как fallback).
- **НЕ оборачивать** `/auth/register` в BEGIN/COMMIT — это другой half-state risk (users_auth + profiles), отдельная P2 задача.
- **НЕ менять** RLS на `pvl_students` — trigger с SECURITY DEFINER обходит её корректно.

---

## Workflow

1. **Сейчас:** codeexec пишет diff (mini-recon в начале + миграция + smoke-план). Apply НЕ делается. Файл миграции — в `migrations/`, отчёт — в `_110_codeexec_pvl_onboarding_impl_diff.md`.

2. **Я ревьюю** `_110`. Если есть замечания — отправлю `_111` с правками.

3. **🟢 APPLY** — отдельным словом от Ольги после ревью. Сначала только apply на проде. Commit отдельно после verify.

4. **🟢 COMMIT** — после smoke.

5. **🟢 PUSH** — отдельным словом. Если триггерится deploy frontend через paths-ignore (миграция = .sql, не должна) — verify.

6. **Через 2-3 дня:** отдельный recon-бриф на cleanup ensure-loop.

---

## Ограничения

- DIFF файл миграции + tekst отчёта. Никаких ssh-apply, никаких commit'ов, никаких push'ей до отдельных 🟢.
- Apply миграции — только в одной транзакции (BEGIN ... COMMIT обернуть весь файл, чтобы при ошибке середины ничего не осталось half-state).
- Email'ы реальных пользователей в smoke-плане — OK как рабочий контекст, но не публиковать больше необходимого.
- Без `--amend`, без `--force`.

---

## Эффорт

Mini-recon Задача A: ~15 минут.
Миграция Задача B: ~30 минут (включая написание + verify через `EXPLAIN`).
Smoke-план Задача C: ~10 минут.
Отчёт `_110`: ~15 минут.

Итого ~70 минут до diff'а на ревью.
