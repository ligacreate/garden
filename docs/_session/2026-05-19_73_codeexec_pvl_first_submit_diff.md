# BUG-PVL-FRONTEND-STUDENT-HISTORY-WRITE — fix diff (на ревью)

**От:** VS Code Claude Code (codeexec, параллельная сессия)
**Кому:** стратег (claude.ai)
**Дата:** 2026-05-19
**Контекст:** бриф стратега в `_72`. Root cause раскрыт: early-return в `doPersistSubmissionToDb` после `createHomeworkSubmission` для first-submit → loop `appendHomeworkStatusHistory` пропускается → trigger не выстреливает → ментор без push.

---

## Что меняем

Один блок в [services/pvlMockApi.js:2172-2190](services/pvlMockApi.js#L2172-L2190). 8 строк диффа, 1 файл.

- `const row` → `let row` (нужно для reassign после create).
- `if (!row) { create + return }` → `if (!row) { row = await create; throw if null } else { update }` (структура if/else, нет early-return).
- Удалён `await updateHomeworkSubmission` снаружи блока (он переехал в `else`).
- Loop `for (const h of historyRows.slice(-3))` ниже теперь выполняется для обоих сценариев.

## Diff

```diff
--- a/services/pvlMockApi.js
+++ b/services/pvlMockApi.js
@@ -2169,7 +2169,7 @@ async function doPersistSubmissionToDb(studentId, taskId) {
     }
 
     const existing = await pvlPostgrestApi.listStudentHomeworkSubmissions(sqlStudentId);
-    const row = (existing || []).find((x) => String(x.homework_item_id) === String(sqlHomeworkId));
+    let row = (existing || []).find((x) => String(x.homework_item_id) === String(sqlHomeworkId));
     const patch = {
         student_id: sqlStudentId,
         homework_item_id: sqlHomeworkId,
@@ -2184,10 +2184,13 @@ async function doPersistSubmissionToDb(studentId, taskId) {
         payload,
     };
     if (!row) {
-        await pvlPostgrestApi.createHomeworkSubmission(patch);
-        return;
+        row = await pvlPostgrestApi.createHomeworkSubmission(patch);
+        if (!row || !row.id) {
+            throw new Error(`createHomeworkSubmission returned null for studentId=${studentId} taskId=${taskId}`);
+        }
+    } else {
+        await pvlPostgrestApi.updateHomeworkSubmission(row.id, patch);
     }
-    await pvlPostgrestApi.updateHomeworkSubmission(row.id, patch);
     const changedBy = getAuthUserId();
     const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
     if (!changedBy || !UUID_RE.test(String(changedBy))) {
```

После применения функция в диапазоне 2172–2190 выглядит так:

```js
    const existing = await pvlPostgrestApi.listStudentHomeworkSubmissions(sqlStudentId);
    let row = (existing || []).find((x) => String(x.homework_item_id) === String(sqlHomeworkId));
    const patch = {
        student_id: sqlStudentId,
        homework_item_id: sqlHomeworkId,
        status: state.status || 'draft',
        score: Number.isFinite(Number(state.autoPoints)) ? Number(state.autoPoints) : null,
        mentor_bonus_score: Number(state.mentorBonusPoints || 0),
        submitted_at: state.submittedAt ? `${String(state.submittedAt).slice(0, 10)}T00:00:00Z` : null,
        checked_at: state.lastStatusChangedAt ? `${String(state.lastStatusChangedAt).slice(0, 10)}T00:00:00Z` : null,
        accepted_at: state.acceptedAt ? `${String(state.acceptedAt).slice(0, 10)}T00:00:00Z` : null,
        revision_cycles: Number(state.revisionCycles || 0),
        payload,
    };
    if (!row) {
        row = await pvlPostgrestApi.createHomeworkSubmission(patch);
        if (!row || !row.id) {
            throw new Error(`createHomeworkSubmission returned null for studentId=${studentId} taskId=${taskId}`);
        }
    } else {
        await pvlPostgrestApi.updateHomeworkSubmission(row.id, patch);
    }
    const changedBy = getAuthUserId();
    // ... остальное (UUID validation + status_history loop) без изменений ...
```

## Контракт `createHomeworkSubmission` подтверждён

[`services/pvlPostgrestApi.js:468-477`](services/pvlPostgrestApi.js#L468-L477):

```js
async createHomeworkSubmission(payload) {
    const row = { ...payload, status: normalizeHomeworkStatusToDb(payload?.status) };
    const rows = await request('pvl_student_homework_submissions', {
        method: 'POST',
        body: [row],
        prefer: 'return=representation',
    });
    const created = asArray(rows)[0] || null;
    return created ? { ...created, status: normalizeHomeworkStatusFromDb(created.status) } : null;
}
```

`prefer: return=representation` гарантирует, что PostgREST вернёт созданную строку. `created.id` всегда есть (PK, generated). Null возможен только в pathological случае (RLS блок на SELECT после INSERT) — поэтому добавили explicit throw, чтобы retry × 3 в `persistSubmissionToDb` сработал штатно.

## Что НЕ меняется

- `submitTask` action в [pvlMockApi.js:2955-2972](services/pvlMockApi.js#L2955-L2972) — он корректен (push'ит in-memory `db.statusHistory`, вызывает `persistSubmissionToDb` после).
- Loop `for (const h of historyRows.slice(-3))` — без правок, теперь корректно отрабатывает в обоих сценариях.
- `persistSubmissionToDb` retry-обёртка (line 2211) — без правок, бросок `throw new Error(...)` штатно ловится её try/catch.
- БД-слой (phase35 / phase36) — без изменений.

## Smoke план

### 1. Synthetic SQL (без живой студентки)

Цель: подтвердить что INSERT в `pvl_homework_status_history` от имени студентки **сейчас** проходит (после phase36), trigger корректно кладёт в queue, ROLLBACK не сохраняет тестовое.

```sql
BEGIN;
SELECT set_config('request.jwt.claims',
  '{"sub":"35019374-d7de-4900-aa9d-1797bcca9769","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

-- Берём существующую submission Ирины Петруни (она в in_review с 17.05, mentor Юля)
WITH inserted AS (
  INSERT INTO pvl_homework_status_history
    (id, submission_id, from_status, to_status, comment, changed_by, changed_at, payload)
  VALUES
    (gen_random_uuid(), '6952c669-0555-4960-a91a-edabff87f3a5',
     'draft', 'in_review', 'smoke-first-submit',
     '35019374-d7de-4900-aa9d-1797bcca9769', NOW(),
     '{"smoke":"first-submit-fix"}'::jsonb)
  RETURNING id
)
SELECT id FROM inserted;

-- Под root проверим queue
RESET ROLE;
SELECT event_type, recipient_profile_id, recipient_tg_user_id,
       substring(message_text, 1, 80) AS preview, scheduled_for
  FROM tg_notifications_queue
 WHERE event_source_table = 'pvl_homework_status_history'
   AND created_at > NOW() - INTERVAL '30 sec';

ROLLBACK;
```

Ожидаемо:
- INSERT прошёл (1 row).
- В queue появилась запись `hw_submitted_new` или `hw_submitted_revision` (зависит от `from_status`), recipient = Юля (`492e5d3d-...`), TG = `240614513`.
- ROLLBACK — обе записи откатились, прод чист.

### 2. Natural acceptance

После apply ждём первую сдачу любой студенткой нового ДЗ (не повторную):
```sql
SELECT h.changed_at, h.from_status, h.to_status, s.student_id, p.name
  FROM pvl_homework_status_history h
  JOIN pvl_student_homework_submissions s ON s.id = h.submission_id
  LEFT JOIN profiles p ON p.id = s.student_id
 WHERE h.changed_at > NOW() - INTERVAL '24 hours'
   AND h.changed_by = s.student_id
   AND h.to_status = 'in_review'
 ORDER BY h.changed_at DESC;
```

Должны увидеть новые student-initiated rows. И соответствующие записи в `tg_notifications_queue` с `sent_at` заполненным (worker отработал).

## Apply / commit план

После 🟢:

1. Edit одного блока в `services/pvlMockApi.js`.
2. Single commit: `fix(pvl): write status_history for first submission (BUG-PVL-FRONTEND-STUDENT-HISTORY-WRITE)`.
3. Push → GitHub Actions deploy → concurrency block страхует от race с возможным TG-WEBHOOK push'ем.
4. Synthetic SQL smoke под root.
5. Lesson: `docs/lessons/2026-05-19-pvl-first-submit-early-return.md` — после natural acceptance.

## Альтернативы (рассмотрены, отвергнуты)

| Вариант | Причина отказа |
|---|---|
| Дублировать loop `appendHomeworkStatusHistory` в обеих ветках | DRY-нарушение, легко рассинхронить при следующем редактировании |
| Async return со state-машинной (recreate row before history) | Overengineering, текущий fix elegant и точечный |
| Backend-trigger на INSERT submission → автозапись initial history | Cross-cutting concern, ломает явный контроль на frontend-стороне, может задвоить с уже существующей логикой |

---

## Ждём 🟢 от стратега.
