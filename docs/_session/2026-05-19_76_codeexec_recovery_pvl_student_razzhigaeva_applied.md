# RECOVERY-PVL-STUDENT-RAZZHIGAEVA — applied report

**От:** codeexec (VS Code Claude)
**Кому:** стратег (claude.ai)
**Дата:** 2026-05-19
**Связан с:** `_75_codeexec_recovery_pvl_student_razzhigaeva_diff.md`

## Итог одной строкой

Razzhigaeva записана в `pvl_students` (1 row, COMMIT'нут). Audit на parallel-orphans вернул **0 строк** — backfill не понадобился. Суроватской `asurovatskaya26@gmail.com` среди orphan'ов **не было**.

---

## Что делали

Один прогон в одной транзакции через ssh `root@5.129.251.56` → `psql "$DATABASE_URL"`:

1. `INSERT … ON CONFLICT DO NOTHING RETURNING` для Razzhigaeva.
2. Verify-SELECT по её `id`.
3. AUDIT — `profiles p` с `role='applicant'` + `access_status='active'` без записи в `pvl_students`, плюс счётчик `pvl_garden_mentor_links`.
4. BACKFILL — `WITH orphans AS (...) INSERT … FROM orphans ON CONFLICT DO NOTHING RETURNING` с тем же предикатом.
5. POST-STATE COUNT — `remaining_orphans` после backfill.
6. `COMMIT`.

---

## Сюрпризы / отклонения от _75-диффа

### 1. Первый прогон откатился — `column p.created_at does not exist`

В audit-запросе стратега была колонка `p.created_at`, а в `profiles` есть только `p.updated_at` (psql дал hint). `ON_ERROR_STOP=1` корректно откатил **всю транзакцию**, включая INSERT Razzhigaeva — до COMMIT ничего не зафиксировалось.

**Фикс:** Ольга через AskUserQuestion дала 🟢 на замену `created_at → updated_at`. Семантика сохранилась (для нового applicant `updated_at` ≈ создание). Повторный прогон прошёл успешно.

### 2. Audit вернул 0 строк, не 1+

Стратег ожидал минимум Александру Суроватскую (`asurovatskaya26@gmail.com`, регистрация 14:15 МСК). Audit-предикат не нашёл её. Возможные причины (требуют отдельной проверки, **в scope этого recovery не входит**):

- У неё уже есть запись в `pvl_students` (тогда не orphan по нашему предикату).
- `role != 'applicant'` или `access_status != 'active'` в `profiles`.
- Её ещё нет в `profiles` (регистрация заглохла раньше создания profile-row).

**Recommendation:** отдельный точечный SELECT по email — `SELECT id, role, access_status, updated_at FROM profiles WHERE email = 'asurovatskaya26@gmail.com';` плюс check `pvl_students` по тому же id. Не делал — вне `🟢`.

---

## Фактический вывод psql

```
=== STEP 1: INSERT Razzhigaeva (recovery from _75) ===
BEGIN
INSERT INTO pvl_students ... RETURNING id, full_name, cohort_id, status;
                  id                  |    full_name     |              cohort_id               |  status
--------------------------------------+------------------+--------------------------------------+-----------
 90c9b7c7-db13-41bd-b393-49d79fc571b1 | Ольга Разжигаева | 11111111-1111-1111-1111-111111111101 | applicant
(1 row)
INSERT 0 1

--- verify Razzhigaeva row ---
                  id                  |    full_name     |              cohort_id               |  status   | mentor_id
--------------------------------------+------------------+--------------------------------------+-----------+-----------
 90c9b7c7-db13-41bd-b393-49d79fc571b1 | Ольга Разжигаева | 11111111-1111-1111-1111-111111111101 | applicant |
(1 row)

=== STEP 2: AUDIT — applicant-orphans in profiles without pvl_students row ===
 id | name | email | updated_at | has_mentor_link
----+------+-------+------------+-----------------
(0 rows)

=== STEP 3: BACKFILL orphans (atomic, same predicate) ===
 id | full_name | cohort_id | status
----+-----------+-----------+--------
(0 rows)
INSERT 0 0

=== STEP 4: POST-STATE — any orphans left? (should be 0) ===
 remaining_orphans
-------------------
                 0
(1 row)

COMMIT
=== DONE ===
```

Полный лог: `/tmp/recovery_75.out` на локальной машине codeexec (не на проде).

---

## Открытые вопросы для стратега

1. **Суроватская** — где она? Точечный SELECT по email из БД покажет (можно ли сделать?).
2. **Root cause** — `BUG-PVL-ONBOARDING-MISSING-STUDENT-RECORD` накапливать в batch backlog-update (см. [[feedback-backlog-batches-not-micro-docs]]) или сразу отдельным diff?
3. **Лесson** — записать ли `docs/lessons/2026-05-19-pvl-student-missing-record-recovery.md` (CLAUDE.md этого просит для bug-fix'ов) или отложить до root-cause fix'а?

---

## Commit

Только `_session/` файлы (`_75_diff` + `_76_applied`). Сам recovery — в БД, не в git.

```
docs(_session): recovery action — pvl_students backfill for orphan applicants (not a migration)
```
