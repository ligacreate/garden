---
title: SEC-001 пост-smoke fix #2 — попытка расширения INSERT/UPDATE-политик pvl_students (откатано)
type: execution-log
phase: "etap-5-post-smoke-fix-2"
created: 2026-05-03
status: ⏪ ROLLED BACK (политики вернулись к admin-only)
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
prev_phase: docs/EXEC_2026-05-02_etap5_post_smoke_fix1_pvl_student_questions.md
related_backlog: ARCH-012 (убрать ensurePvlStudentInDb на стороне фронта)
---

# Пост-smoke fix #2 — pvl_students INSERT/UPDATE policy (попытка + rollback)

**Время:** 2026-05-03 ≈ 03:00 MSK.
**Триггер:** Live smoke Настин фиксик в браузере. После fix #1 (pvl_student_questions seed cleanup) фронт ментора всё ещё пишет в console 17 ошибок RLS-violation от `ensurePvlStudentInDb` upsert'ов в `pvl_students`. UI работает (косметический шум), но шум хочется убрать.
**Решение по итогам:** ❌ rollback. Политика осталась строгой (admin-only INSERT/UPDATE), фронт продолжает шуметь. **17 console-warnings — cosmetic-шум, UI не деградирует.** Архитектурное решение — убрать `ensurePvlStudentInDb` с клиента (ARCH-012).

---

## Что попробовали (PART 1)

Расширили INSERT/UPDATE-политики `pvl_students`:

```sql
DROP POLICY IF EXISTS pvl_students_insert_admin ON public.pvl_students;
CREATE POLICY pvl_students_insert_self_or_admin
  ON public.pvl_students FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS pvl_students_update_admin ON public.pvl_students;
CREATE POLICY pvl_students_update_self_mentor_or_admin
  ON public.pvl_students FOR UPDATE TO authenticated
  USING (id = auth.uid() OR is_admin() OR public.is_mentor_for(id))
  WITH CHECK (id = auth.uid() OR is_admin() OR public.is_mentor_for(id));
```

**Дизайн:**
- INSERT — self/admin (mentor НЕ может INSERT новых студентов).
- UPDATE — self/mentor/admin (mentor может update менти).
- DELETE — admin (без изменений).

После CREATE: 4 политики (SELECT/INSERT/UPDATE/DELETE), pg_policies-проверка прошла.

---

## Smoke под mentor-JWT (Настин фиксик `1b10d2ef-…`) — найден неожиданный баг

| Тест | Ожидание | Результат |
|---|---|---|
| INSERT self (`auth.uid()`) | SUCCESS | ✅ `INSERT 0 1` |
| INSERT menti (Лена Ф `037603f7-…` ON CONFLICT DO UPDATE) | SUCCESS | ❌ **`new row violates row-level security policy`** |
| INSERT stranger (`33333…01`) | RLS VIOLATION | ✅ ожидаемо отклонено |

### Корневая причина — поведение PostgreSQL для `INSERT ... ON CONFLICT DO UPDATE` + RLS

> **PostgreSQL docs (CREATE POLICY):** «If both INSERT and UPDATE policies are applied to the same command (as is the case for `INSERT ... ON CONFLICT DO UPDATE`), and the row to be inserted is rejected by the INSERT row security policy, an error is raised, even if the row does not require insertion (because of a conflict).»

То есть:
1. Лена Ф (`037603f7-…`) **уже существует** в `pvl_students` (поэтому SELECT mentor видит 4 строки).
2. `INSERT ON CONFLICT DO UPDATE` мог бы пойти по UPDATE-пути.
3. Но Postgres **сначала проверяет INSERT WITH CHECK** на candidate row.
4. INSERT WITH CHECK = `id = auth.uid() OR is_admin()` — для Лены Ф (`037603f7-…`) ни одно не true для mentor → reject.
5. UPDATE-путь даже не запускается → ERROR.

📝 **Урок:** для поддержки `upsert(menti_id)` со стороны ментора через `ON CONFLICT DO UPDATE` нужно расширять не только UPDATE, но и **INSERT WITH CHECK** до `is_mentor_for(id)`. Это вариант A в обсуждении.

---

## Решение — Вариант 1 ROLLBACK (стратегическое)

Стратег принял решение **не расширять политики**, оставить admin-only:

> 17 console-ошибок остаются как cosmetic-шум. UI продолжает работать (мы это видим — проблема была в pvl_student_questions cast, fix #1 хватило). Архитектурное решение — убрать `ensurePvlStudentInDb` с клиента (ARCH-012).

### SQL rollback

```sql
BEGIN;

DROP POLICY IF EXISTS pvl_students_insert_self_or_admin ON public.pvl_students;
DROP POLICY IF EXISTS pvl_students_update_self_mentor_or_admin ON public.pvl_students;

CREATE POLICY pvl_students_insert_admin
  ON public.pvl_students FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY pvl_students_update_admin
  ON public.pvl_students FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Smoke
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='pvl_students';
  IF n <> 4 THEN RAISE EXCEPTION 'expected 4, got %', n; END IF;
END $$;

COMMIT;
```

### Финальное состояние политик (= pre-fix2 = phase 11.1)

```
                 policyname                 |  cmd   |                          qual                          | with_check
--------------------------------------------+--------+--------------------------------------------------------+------------
 pvl_students_delete_admin                  | DELETE | is_admin()                                             | <none>
 pvl_students_insert_admin                  | INSERT | <none>                                                 | is_admin()
 pvl_students_select_own_or_mentor_or_admin | SELECT | ((id = auth.uid()) OR is_admin() OR is_mentor_for(id)) | <none>
 pvl_students_update_admin                  | UPDATE | is_admin()                                             | is_admin()
```

### Smoke под mentor (после rollback)

```
INSERT self  → RLS violation ✓ (mentor не admin)
INSERT menti → RLS violation ✓
SELECT count = 4 ✓ (видимость не изменилась)
```

✅ Состояние идентично pre-fix2. Видимость через SELECT-policy не задета.

---

## Что для записи в backlog

### ARCH-012 — убрать `ensurePvlStudentInDb` с клиента

**Контекст:** функция вызывается фронтом ментора 17 раз при инициализации view. Каждый upsert в `pvl_students` под authenticated отбивается RLS (correct: только admin может). Console пишет 17 RLS-violation предупреждений — cosmetic-шум.

**Альтернативы:**
- Вынести создание pvl_students-строк на admin-onboarding (когда роль `applicant` назначается).
- Или service-role endpoint в garden-auth, который под gen_user-привилегиями создаёт строку.
- Или просто не упоминать `pvl_students` со стороны клиента, если для UI-логики достаточно профиля + связки `pvl_garden_mentor_links`.

**До устранения** — допустимый cosmetic-шум.

### Урок (записать в `docs/lessons/2026-05-03-rls-insert-on-conflict-checks-insert-with-check.md`)

**Симптом:** `INSERT ... ON CONFLICT DO UPDATE` под user-role фейлится с `new row violates row-level security policy`, хотя UPDATE-политика разрешает доступ к существующей строке.

**Корневая причина:** Postgres проверяет INSERT WITH CHECK **всегда** для candidate row, даже когда есть conflict и UPDATE-путь сработал бы. Это документировано, но контр-интуитивно.

**Почему пропустили:** в plan миграции (`MIGRATION_2026-05-02_security_restoration.md`) и в фазе 11.1 рассматривался вариант «mentor не должен INSERT». Сценарий «фронт делает upsert как форму idempotent-кода» не был учтён. Поведение Postgres + INSERT-WITH-CHECK-всегда выкатило проблему только при live smoke с реальным фронтом.

**Как починили:** не расширили политику. Вместо этого приняли решение, что **архитектурно** клиент не должен делать upsert в pvl_students — это admin-операция при онбординге.

**Что проверить в будущем:**
- При проектировании RLS-политик для таблиц, в которые делают `upsert` с фронта — INSERT и UPDATE policies должны иметь **симметричный** WITH CHECK; иначе upsert будет работать криво.
- Любой `ON CONFLICT DO ...` запрос — проверять оба пути (INSERT WITH CHECK + UPDATE USING+WITH CHECK).

---

## Статус

⏪ **ROLLED BACK.** Политики `pvl_students` возвращены к pre-fix2 admin-only состоянию (= phase 11.1). 17 RLS-warnings в console — cosmetic, не блокер. Архитектурное решение в `ARCH-012`.
