# phase37 v2 apply — ❌ ABORTED на backfill assertion (моя ошибка в _108)

**От:** codeexec (VS Code Claude Code)
**Кому:** стратега (claude.ai) → Ольга
**Дата:** 2026-05-23
**В ответ на:** 🟢 APPLY phase37 v2
**Тип:** Failure report + признание ошибки + proposed fix. **Без commit, без push, без retry.** Жду 🟢 на amended migration v3.

---

## TL;DR

- ❌ Apply v2 упал в **Section 7 (backfill 14 interns)**. Assertion `IF v_inserted <> 14 RAISE EXCEPTION` сработал — найдено **13**, не 14. Транзакция атомарно откатилась.
- ✅ Прод чисто в pre-apply state: pvl_students = 15, pvl_cohorts без `updated_at`/start_date/end_date, FK/trigger/function отсутствуют, у всех 3 таблиц updated_at не появилась.
- 🔥 **Корень — моя ошибка в `_108` recon'е, НЕ drift.** Я неправильно разбила total 33 orphan'а: написала «1 applicant + 14 intern + 18 leader», на самом деле **2 applicant + 13 intern + 18 leader**. Total (33) сходился, разбивка нет. `_109` бриф унаследовал «14», assertion построил на этом.
- 🛑 Сделанно по инструкции «STOP без retry если backfill-assertion упадёт». Жду 🟢 на v3 — поправить assertion на 13.

---

## 1. Что произошло (вывод psql)

```
BEGIN
ALTER TABLE     ← Section 1a: pvl_cohorts.updated_at
ALTER TABLE     ← Section 1a: pvl_course_lessons.updated_at
ALTER TABLE     ← Section 1a: pvl_mentors.updated_at
COMMENT × 3
ALTER TABLE × 2 + COMMENT × 2     ← Section 1b: start_date/end_date + комментарии
NOTICE: constraint "pvl_cohorts_dates_check" does not exist, skipping
ALTER TABLE     ← CHECK constraint
UPDATE 1        ← Section 2: даты Потока 1 (UPDATE 1 — сработало!)
INSERT 0 1      ← Section 2: Поток 2 вставлен
DO              ← Section 3: pre-check orphan reverse = 0 OK
ALTER TABLE × 2 + COMMENT     ← Section 4: FK pvl_students.id → profiles(id)
CREATE FUNCTION + COMMENT     ← Section 5: trigger function
NOTICE: constraint "pvl_students_id_fk_profiles" does not exist, skipping
NOTICE: trigger "trg_profiles_pvl_student_on_approval" ... does not exist, skipping
DROP TRIGGER + CREATE TRIGGER     ← Section 6: trigger AFTER UPDATE OF role, access_status

psql:...:303: ERROR:  phase37 backfill abort: ожидалось 14 intern-orphan
строк, найдено 13. _108 audit рассинхронизировался с проднутым состоянием
— пере-проверить руками перед apply.
CONTEXT:  PL/pgSQL function inline_code_block line 24 at RAISE
```

Exit code 3. ON_ERROR_STOP=1 → psql close → implicit ROLLBACK.

**Что прошло до assertion'а (всё откатилось!):**
- 1a: 3 ALTER TABLE для updated_at колонок ✓
- 1b: ALTER TABLE для start_date/end_date + CHECK ✓
- 2: UPDATE Потока 1 + INSERT Поток 2 ✓
- 3: pre-check `orphan_reverse = 0` ✓
- 4: FK ✓
- 5: trigger function CREATE ✓
- 6: CREATE TRIGGER ✓
- 7: backfill начался, INSERT прошёл, но `v_inserted = 13`, RAISE EXCEPTION.

Всё это **откатилось** (ROLLBACK).

## 2. Verify rollback ✅

```sql
SELECT COUNT(*) FROM pvl_students;
-- 15 (как было)

SELECT id, title FROM pvl_cohorts ORDER BY year DESC NULLS LAST;
-- 1 строка «ПВЛ 2026 Поток 1» (Поток 2 не появился)

SELECT conname FROM pg_constraint WHERE conname='pvl_students_id_fk_profiles';
-- 0 rows

SELECT proname FROM pg_proc WHERE proname='trg_create_pvl_student_on_approval';
-- 0 rows

SELECT tgname FROM pg_trigger WHERE tgname='trg_profiles_pvl_student_on_approval';
-- 0 rows

SELECT column_name FROM information_schema.columns
 WHERE table_schema='public'
   AND table_name IN ('pvl_cohorts','pvl_course_lessons','pvl_mentors')
   AND column_name='updated_at';
-- 0 rows  ← updated_at не добавилась нигде
```

**Прод pre-apply state. Никаких следов.**

---

## 3. Root-cause — моя ошибка в _108, не drift

### 3.1 Текущая реальность (свежий audit)

```sql
SELECT p.role, COUNT(*) AS orphan_count
  FROM profiles p
  LEFT JOIN pvl_students ps ON ps.id = p.id
 WHERE p.role IN ('applicant','intern','leader') AND ps.id IS NULL
 GROUP BY p.role ORDER BY p.role;
```

| role | orphan_count |
|------|--------------|
| applicant | **2** |
| intern | **13** |
| leader | 18 |
| **total** | **33** |

### 3.2 Что я написала в _108 (Section 5.2)

| role | count (заявлено) |
|------|------------------|
| applicant | 1 (Суроватская) |
| intern | **14** |
| leader | 18 |
| **total** | 33 ✓ |

Total (33) сходится, разбивка — нет. Реально было 2+13+18=33, я написала 1+14+18=33. Сумма совпала случайно, что замаскировало ошибку.

### 3.3 Где конкретно ошибка

В _108 Section 5.3 я выгрузила полный список orphan'ов и **выписала всех 33**. Если пройти по строкам:
- applicant'ов: 2 — Суроватская (pending_approval) + tatrusi@mail.ru (paused_manual)
- intern'ов: 13 — soboleva, bondarenko, nbazhenova, muza_skorpi, ru.traibl, I.am.yaroslava, ivashova.0, anastskoro, kulish-inn, ruxshana_89, natali228, e.yaroschuk, zakirovas2008
- leader'ов: 18

Я в Section 5.2 (summary table) и в TL;DR строке 6 написала **«14 interns»** — это перенос tatrusi@mail.ru из applicant в intern или просто off-by-one при ручном подсчёте. Список в 5.3 правильный, summary — нет.

`_109` бриф унаследовал «14 interns» из моего _108 TL;DR. Я в migration assertion проверила ровно 14. Apply нашёл 13 → assertion fire'ит как и должна.

### 3.4 Это **не** drift

Чтобы исключить drift, проверила:
- Из 13 текущих intern-orphans все 13 emails совпадают с `_108` списком 5.3.
- Никаких интернов между _108 и сейчас не получили pvl_students row (свежий запрос: 0 interns IN pvl_students).
- Никаких UPDATE на profiles с 2026-05-22: `WHERE updated_at >= '2026-05-22'` → 0 rows.
- Applicant tatrusi@mail.ru, которую я неправильно записала как intern в _108 summary, есть и сейчас (id `2234ead5-...`, applicant, paused_manual).

**Это чисто моя ошибка в recon, не реальное изменение состояния.**

### 3.5 Что должно было быть в _108 (поправка)

```
| applicant | 2 | Суроватская (pending_approval) + tatrusi@mail.ru (paused_manual, старый orphan не из этого потока) |
| intern    | 13 | стажёры — большинство join_date 2026-02 |
| leader    | 18 | ведущие — join_date от 2019 до 2026-02 |
```

---

## 4. Предлагаемая правка (нужен 🟢 на v3)

### 4.1 Минимальный fix

В Section 7 миграции единственное число изменить:

```sql
IF v_inserted <> 14 THEN
```
на
```sql
IF v_inserted <> 13 THEN
```

И обновить сопровождающий RAISE message + COMMENT'ы в шапке («Backfill: 14 уже одобренных interns» → «13»).

### 4.2 Defensive альтернатива — сравнивать с pre-flight count

Вместо хардкода 13 — заменить ассерт на: «backfill должен вставить ровно столько rows, сколько мы насчитали orphan'ов в pre-check»:

```sql
DO $$
DECLARE
    v_expected int;
    v_inserted int;
BEGIN
    SELECT COUNT(*) INTO v_expected
      FROM public.profiles p
      LEFT JOIN public.pvl_students ps ON ps.id = p.id
     WHERE p.role = 'intern' AND ps.id IS NULL;

    INSERT INTO public.pvl_students (...)
    SELECT ... ;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted <> v_expected THEN
        RAISE EXCEPTION 'backfill rows (%) <> pre-count expected (%)',
            v_inserted, v_expected;
    END IF;

    RAISE NOTICE 'phase37 backfill: вставлено %', v_inserted;
END $$;
```

Это убирает зависимость от моего recon'а — assertion ловит **реальный** рассинхрон (например, если concurrent INSERT/UPDATE прошёл между SELECT и INSERT в той же транзакции; на practical уровне для одного admin'а — невозможно, но defence-in-depth).

**Я бы рекомендовала 4.2** — устраняет источник ошибки на уровне паттерна, а не цифры. Цена: +5 строк в DO block.

### 4.3 Что ещё в v3

- Шапка: добавить блок «v3 (2026-05-23) — backfill assertion поправлен после ошибки в _108 (см. _113)».
- COMMENT'ы про «14 interns» в шапке миграции → «13» или «N intern-orphans (резолвится в runtime)».
- Section 7 RAISE NOTICE сообщение → актуальное число.

Никаких других правок. Section 1a/1b/2/3/4/5/6/8/Verify — без изменений.

---

## 5. Что я НЕ сделала

- ❌ Не retry без правок (instruction: «STOP без retry если backfill-assertion упадёт»).
- ❌ Не правила миграцию без 🟢 (memory `[[feedback_diff_on_review]]`).
- ❌ Не commit / push.

---

## 6. V0..V8 — НЕ выполнены

Транзакция откатилась → нечего verify'ить. Но **косвенно подтверждено что v2 ALTER'ы работают**: первые три ALTER TABLE для updated_at прошли без error (Section 1a), и Section 2's UPDATE на pvl_cohorts тоже прошёл (UPDATE 1 в выводе). Это значит:
- v2 fix латентного bug'а **корректен** — pvl_cohorts UPDATE через PostgreSQL trigger trg_pvl_cohorts_updated_at теперь не падает.
- Section 2/3/4/5/6 целиком отработали в этой попытке (всё откатилось COMMIT'ом который не наступил, но шаги прошли без ошибок).

Так что когда v3 поправим число — apply должен пройти без сюрпризов.

---

## 7. Решение требуется от тебя

**Вариант A:** правка только числа `14 → 13`. Простейший fix.

**Вариант B (рекомендуемый):** заменить hardcoded assertion на dynamic `v_expected` через pre-count в той же DO block'е. Защищает от моих будущих recon-ошибок.

**Вариант C:** убрать assertion целиком. Trust LEFT JOIN. Минус — нет защиты от случайного INSERT'а не туда.

После 🟢 на вариант — обновлю миграцию (новый diff в `_session/`, жди ревью), потом apply.

---

## 8. Признание

Это моя ошибка в _108. Стратеги и Ольга действовали на основании моего отчёта, brief и assertion построились на «14», assertion корректно сработал — но проблема была в моём подсчёте, а не в архитектуре. Защитный механизм (assertion + STOP без retry) сработал ровно как задуман — не дал применить миграцию на основе несоответствующих данных.

Хорошая новость: assertion поймал ошибку **до того как** что-то закоммитилось. Прод чист, можем спокойно поправить число и re-apply.

---

## 9. Эффорт

- scp + apply attempt: ~1 мин
- verify rollback: ~3 мин
- root-cause analysis (свежий audit + сравнение с _108): ~5 мин
- _113 отчёт: ~12 мин

Итого ~20 мин на повторный failed-apply + recovery.
