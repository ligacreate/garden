# PVL-RAZHIGAEVA-STATUS-FIX — applied. Тест гипотезы К2 (regression Василины).

**Адресат:** Ольга (связной) → стратег.
**Автор:** VS Code Claude Code (codeexec).
**Дата:** 2026-05-29.
**Режим:** **DATA-FIX APPLIED** — точечный UPDATE одной строки в проде, BEGIN/COMMIT.
**Backlog:** `PVL-RAZHIGAEVA-STATUS-FIX` (P3) — **закрыт** этим отчётом.

**Контекст:** [_151](2026-05-29_151_codeexec_recon_vasilina_regression_window.md) §4.5 — единственная Василина-специфичная аномалия в БД: `pvl_students.status='applicant'` у Ольги Разжигаевой (uuid `90c9b7c7-db13-41bd-b393-49d79fc571b1`). У всех 11 остальных menti семи менторов — `status='active'`.

**Гипотеза К2:** аномалия одной строки может ронять frontend processing всего списка menti Василины (даже если явной фильтрации по status в `getMentorMentees` codeexec не нашёл — цепочка могла ломаться в downstream `.map`/`.find`, ожидающем `status='active'`).

---

## 1. SQL apply

### 1.1. Pre-check (внутри BEGIN)

```sql
SELECT id, full_name, cohort_id, status, updated_at FROM pvl_students
WHERE id = '90c9b7c7-db13-41bd-b393-49d79fc571b1';
```

Результат:

| id           | full_name        | cohort_id                              | status    | updated_at                    |
|--------------|------------------|----------------------------------------|-----------|-------------------------------|
| 90c9b7c7-…   | Ольга Разжигаева | 11111111-1111-1111-1111-111111111101   | applicant | 2026-05-19 10:41:54.118381+03 |

✅ Pre-check совпал с ожиданием — `status='applicant'`.

### 1.2. UPDATE

```sql
UPDATE pvl_students
SET status = 'active', updated_at = NOW()
WHERE id = '90c9b7c7-db13-41bd-b393-49d79fc571b1'
  AND status = 'applicant';
```

Результат: `UPDATE 1` ✅ (ровно одна строка, условие `AND status='applicant'` защитило от no-op).

### 1.3. Post-check (внутри BEGIN, до COMMIT)

| id           | full_name        | status | updated_at                    | apply_now                    |
|--------------|------------------|--------|-------------------------------|------------------------------|
| 90c9b7c7-…   | Ольга Разжигаева | active | 2026-05-29 16:14:21.72361+03  | 2026-05-29 16:14:21.72361+03 |

✅ status='active', updated_at = `NOW()` = `apply_now` (триггер `trg_pvl_students_updated_at` отработал корректно).

### 1.4. COMMIT

```
COMMIT
Time: 1.091 ms
```

✅ Транзакция закрыта успешно.

### 1.5. Final verify (после COMMIT, новая транзакция)

| id           | full_name        | status | updated_at                    |
|--------------|------------------|--------|-------------------------------|
| 90c9b7c7-…   | Ольга Разжигаева | active | 2026-05-29 16:14:21.72361+03  |

✅ Изменение зафиксировано вне транзакции.

### 1.6. ensure_garden_grants() safety pass

```sql
SELECT public.ensure_garden_grants();
```

✅ Выполнено успешно (NULL return — это норма, функция void-like).

---

## 2. Apply timestamp

- **COMMIT:** 2026-05-29 ~16:14:21+03 (мск)
- **Apply actor:** root@5.129.251.56 → gen_user (`set -a && . /opt/garden-auth/.env`).
- **Реверс:** при необходимости — `UPDATE pvl_students SET status='applicant' WHERE id='90c9b7c7-db13-41bd-b393-49d79fc571b1'` (один UUID, точечно).
- **Связанные таблицы НЕ трогали:** `profiles` (там Ольга Р. остаётся `role='applicant'`), `pvl_garden_mentor_links` (её линк с Василиной от 2026-05-18 не менялся).

---

## 3. Backlog reference

`PVL-RAZHIGAEVA-STATUS-FIX` (P3) — **закрыт** через этот отчёт.

**Связанные backlog items (для истории):**
- `BUG-PVL-ONBOARDING-MISSING-STUDENT-RECORD` (P1) — закрыт 2026-05-23 через phase37. Тогда вручную создавалась row в pvl_students для Ольги Р. с дефолтным `status='applicant'`. Сегодняшний UPDATE — следующий шаг той же ленты восстановления (status переведён в 'active', соответствуя её реальному progress в когорте Потока 1).
- `BUG-PVL-ENSURE-RESPECTS-ROLE` (P2) — открыт, не закрыт этим фиксом.

---

## 4. Smoke pending — что нужно от Василины

**Просьба Ольге передать Василине:**

> Василина, попробуйте обновить страницу учительской (Ctrl+Shift+R / Cmd+Shift+R, **жёсткая** перезагрузка с очисткой кэша). Зайдите в «Мои менти» и доложите:
>
> 1. Видны ли теперь Лилия Мaлонг, Марина Шульга, Ольга Разжигаева?
> 2. Если видны не все — кто именно?
> 3. Если по-прежнему пусто — приложите скрин консоли DevTools (F12 → Console) — там должны быть строки `[PVL]`.

**Если все 3 menti появились** → гипотеза К2 подтверждена, root cause — аномалия `status='applicant'` ломала processing цепочки. Можно искать в коде точное место (likely в `processStudentTrackerAndHomework` или downstream `getStudentResults`/`buildMentorMenteeRows`).

**Если появились 2 из 3 (без Ольги Р.)** → status был блокером **только для самой Ольги Р.**, остальные двое (Лилия + Марина) видны независимо. Это **другая** регрессия — возможно frontend кеш / SW / bundle issue у Василины.

**Если по-прежнему пусто (0 из 3)** → К2 опровергнута, причина в другом месте. Возвращаемся к К1 (cold start + SW bump + revert auto-refresh) или К3 (это не регрессия, а скрытый давний баг) из [_151 §6.3](2026-05-29_151_codeexec_recon_vasilina_regression_window.md). Прямо в этот момент: применять Pattern C' из [_150](2026-05-28_150_codeexec_fix_mentor_view_race_diff.md) или сначала собирать DevTools-сигналы по [_149 §6](2026-05-28_149_codeexec_diagnose_vasilina_jwt_impersonation.md).

---

## 5. Что НЕ делал

- ⛔ `recover_grants.sh` — не требуется, GRANT'ы не менялись.
- ⛔ NOTIFY pgrst reload — не требуется (row-update, не schema-change). `ensure_garden_grants()` для safety pass сделан (он сам шлёт NOTIFY если что).
- ⛔ Не трогал profiles Ольги Р. (там по-прежнему `role='applicant'` — это её реальное состояние в Garden).
- ⛔ Не трогал pvl_garden_mentor_links.
- ⛔ Не делал git commit/push — это data-fix, не код.

---

**Артефакт:** [docs/_session/2026-05-29_152_codeexec_fix_razhigaeva_status_active.md](garden/docs/_session/2026-05-29_152_codeexec_fix_razhigaeva_status_active.md).

**Лог apply:** сохранён в `/tmp/razhigaeva_status_fix.log` на dev-машине (не на проде).

Жду от Василины через Ольгу — что показывает её UI после hard-reload.
