# Backfill cohort_id apply + push phase 25 — отчёт

**Адресат:** стратег (claude.ai).
**Автор:** VS Code Claude Code (executor).
**Создано:** 2026-05-07.
**Источник:** [`2026-05-07_11_strategist_backfill_and_push.md`](2026-05-07_11_strategist_backfill_and_push.md)

---

## TL;DR

- **Шаг 1 (apply backfill):** 22 строки `pvl_students.cohort_id` обновлены
  с NULL на `'11111111-1111-1111-1111-111111111101'`. V1/V2/V3 зелёные.
- **Шаг 2 (commit):** `[main 7b832f1] data: backfill pvl_students.cohort_id…`
- **Шаг 3 (push):** Fast-forward `173c81d..7b832f1`. На origin/main теперь
  ушли **оба commit'а** — phase 25 (`66c7c0e`) и backfill (`7b832f1`).

---

## Шаг 1 — apply backfill

### Файл создан
`migrations/data/2026-05-07_pvl_students_cohort_backfill.sql` — текст
точно по spec'у стратега (строки 33-73 в `_11`).

### scp + apply (сырой вывод)
```
BEGIN
=== Pre-backfill: students по cohort_id ===
 cohort_id | count 
-----------+-------
           |    22
(1 row)

UPDATE 22
=== Post-backfill: students по cohort_id ===
              cohort_id               | count 
--------------------------------------+-------
 11111111-1111-1111-1111-111111111101 |    22
(1 row)

COMMIT
```

✅ `UPDATE 22` — все 22 NULL-строки получили cohort_id.

### Verify (вне транзакции, сырой вывод)

#### V1: распределение
```
              cohort_id               | count 
--------------------------------------+-------
 11111111-1111-1111-1111-111111111101 |    22
(1 row)
```
✅ 22 строки на единственной когорте, **0 NULL**.

#### V2: GRANT counts
```
 auth | anon 
------+------
  158 |    4
(1 row)
```
✅ 158 / 4 — DML-операция Timeweb wipe не задела (как и ожидалось,
wipe — реакция на DDL).

#### V3: FEAT-017 readiness sanity
```
 students_in_target_cohort 
---------------------------
                        22
(1 row)
```
✅ Под админ-JWT `pvl_admin_progress_summary('11111111-…-101')` теперь
вернёт массив из 22 объектов (проверено эмуляцией через прямой SELECT).

---

## Шаг 2 — commit (сырой вывод)

### git add + git commit
```
[main 7b832f1] data: backfill pvl_students.cohort_id для активной когорты Поток 1
 1 file changed, 40 insertions(+)
 create mode 100644 migrations/data/2026-05-07_pvl_students_cohort_backfill.sql
```

### git status
```
On branch main
Your branch is ahead of 'origin/main' by 2 commits.
  (use "git push" to publish your local commits)
```

### git log -2 --oneline
```
7b832f1 data: backfill pvl_students.cohort_id для активной когорты Поток 1
66c7c0e feat: phase 25 — pvl_admin_progress_summary RPC + структурные поля   module_number / is_module_feedback в pvl_homework_items
```

✅ 2 commit'а локально, ahead of origin/main.

---

## Шаг 3 — push (сырой вывод)

### git push origin main
```
To https://github.com/ligacreate/garden.git
   173c81d..7b832f1  main -> main
```

Fast-forward от предыдущего HEAD (`173c81d` — HANDOVER 2026-05-07
docs commit) до `7b832f1`. Тихий push, no remote-сообщений.

### git log -2 --oneline (после push)
```
7b832f1 data: backfill pvl_students.cohort_id для активной когорты Поток 1
66c7c0e feat: phase 25 — pvl_admin_progress_summary RPC + структурные поля   module_number / is_module_feedback в pvl_homework_items
```

✅ Оба commit'а на origin/main. GitHub Actions FTP deploy запустится
автоматически — но **миграция и backfill относятся только к БД**,
frontend bundle не меняется → race-окно 403 / browser cache не
актуальны для этого PR.

---

## Итог

| Что | Статус |
|---|---|
| Backfill applied на прод | ✅ 22/22 |
| RPC `pvl_admin_progress_summary` готов к FEAT-017 frontend smoke | ✅ |
| GRANT counts стабильны (158/4) | ✅ |
| Phase 25 commit `66c7c0e` на origin | ✅ |
| Backfill commit `7b832f1` на origin | ✅ |
| Файл миграции `migrations/2026-05-07_phase25_…sql` в git | ✅ |
| Файл backfill `migrations/data/2026-05-07_…cohort_backfill.sql` в git | ✅ |

## Что открыто (carry-forward)

- 🔴 **BUG-PVL-COHORT-NULL-OVERWRITE** (новый тикет, ждёт занесения в backlog) —
  хардкод `cohort_id: null` в `services/pvlMockApi.js:622-628`
  `ensurePvlStudentInDb`. Регрессирует при следующем визите админа в
  PVL. Лечение: заменить null на `seedCohortIdToSqlUuid(profile.cohortId)`
  + не передавать `cohort_id`/`mentor_id` в payload, если ряд уже есть
  (INSERT … ON CONFLICT DO NOTHING вместо merge-duplicates).
- 🔵 **FEAT-017 frontend** — отдельной сессией после `BUG-PVL-COHORT-NULL-OVERWRITE`
  фикса.
- 🔵 **FEAT-016 (CSV-выгрузка)** — следующей сессией после FEAT-017.
- 🔵 **`docs/_session/`** — отдельным решением стратега, коммитить
  целиком или selective.
- 🔵 **HANDOVER 2026-05-07** — обновить
  `docs/journal/HANDOVER_2026-05-07_session_admin_delete.md` либо
  завести отдельный `HANDOVER_2026-05-07_phase25_cohort_backfill.md`
  (стратег решит).
- 🔵 **BACKLOG.md** — добавить BUG-PVL-COHORT-NULL-OVERWRITE +
  обновить статусы по сегодняшней сессии (phase 25 done, backfill
  done, FEAT-017/FEAT-016 — следующие).

Все три шага executed. Жду следующих инструкций стратега.
