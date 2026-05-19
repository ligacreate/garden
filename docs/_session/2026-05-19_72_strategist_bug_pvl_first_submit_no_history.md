# BUG-PVL-FRONTEND-STUDENT-HISTORY-WRITE — first-submit early-return

**От:** стратег (claude.ai)
**Кому:** VS Code Claude Code (вторая параллельная сессия, не та что делает TG-WEBHOOK)
**Дата:** 2026-05-19
**Тип:** P1 hotfix для frontend — реальная функция курса наполовину сломана.
**Аффект:** при ПЕРВОЙ сдаче любой ДЗ студенткой её ментор НЕ получает push в TG. Касается всех привязанных к TG менторов (Юля, Василина, Ирина Одинцова, Лена Федотова). Mentor→student push'и (revision/accepted) работают корректно после вчерашнего phase36.

---

## Root cause (стратег раскрыл код-only)

Файл: `services/pvlMockApi.js`, функция `doPersistSubmissionToDb` (line 2129-2209).

Строки **2186-2189:**

```js
if (!row) {
    await pvlPostgrestApi.createHomeworkSubmission(patch);
    return;  // ← EARLY RETURN
}
await pvlPostgrestApi.updateHomeworkSubmission(row.id, patch);
// ... appendHomeworkStatusHistory loop ниже ...
```

**Сценарий:**
- Студентка впервые сдаёт ДЗ → submission ещё нет в `pvl_student_homework_submissions`
- `existing.find(...)` returns undefined → `!row = true`
- Функция вызывает `createHomeworkSubmission(patch)` → создаёт submission → **`return`**
- Loop `appendHomeworkStatusHistory` (line 2196-2208) **никогда не выполняется**
- → запись в `pvl_homework_status_history` не создаётся
- → trigger `tg_enqueue_homework_event` не выстреливает
- → нет INSERT в `tg_notifications_queue`
- → worker garden-auth ничего не подхватывает
- → ментор не получает push

**Подтверждение в БД:**
- Ирина Курдюкова (менти Лены Федотовой) и Ирина Петруня (менти Юли) вчера сдавали впервые → submissions созданы с `status='in_review'`, но `pvl_homework_status_history` пустая для этих submission_id'ов
- Менторские actions (Юля → Ирина Петруня на доработку 21:18 МСК) — submission уже существовала → попадаем в `updateHomeworkSubmission` ветку → loop status_history выполняется → trigger → push Ирине ✅

**Git blame:** строки добавлены в commit `8bb03bf` (2026-05-01, Anastasia). 19 дней. Не regression — был всегда. Просто никто не замечал, пока менторы не привязали TG (16 мая вечер) и не начали ожидать push'ей.

**Почему 28 исторических `draft→in_review` records есть в БД:** скорее всего ранее код был другой (без early-return), либо seed-данные. Не важно для fix'а.

---

## Fix — заменить early-return на assign

### Diff

```diff
-    const existing = await pvlPostgrestApi.listStudentHomeworkSubmissions(sqlStudentId);
-    const row = (existing || []).find((x) => String(x.homework_item_id) === String(sqlHomeworkId));
+    const existing = await pvlPostgrestApi.listStudentHomeworkSubmissions(sqlStudentId);
+    let row = (existing || []).find((x) => String(x.homework_item_id) === String(sqlHomeworkId));
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
     // ... остальное без изменений (UUID check + loop appendHomeworkStatusHistory) ...
```

**Что меняется:**
1. `const row → let row` (нужно для reassign).
2. `if (!row)` теперь **assign**'ит created row вместо return, плюс validation.
3. `if/else` структура: для existing — update, для new — create. После него `row` всегда populated.
4. Удалена `return` после create — loop status_history теперь выполняется в обоих случаях.

**`createHomeworkSubmission` возвращает the created row** благодаря `prefer: 'return=representation'` (см. `pvlPostgrestApi.js:468-477`) — у нас сразу есть `row.id` для последующего `appendHomeworkStatusHistory`.

### Что НЕ меняется

- Тело функции `doPersistSubmissionToDb` остальное (line 2129-2185, 2191-2208) — без правок.
- RLS / триггеры / phase36 SECURITY DEFINER — без изменений (они уже на проде с вчера).
- `submitTask` action (line 2955-2972) — без изменений (он уже push'ит в `db.statusHistory` корректно).

---

## Apply checklist

- [ ] Diff в `_session/_73_codeexec_pvl_first_submit_diff.md` на ревью стратегу (короткий, изменение в одном блоке).
- [ ] После 🟢 — apply, single commit `fix(pvl): write status_history for first submission (BUG-PVL-FRONTEND-STUDENT-HISTORY-WRITE)`.
- [ ] Push (concurrency block страхует от race с TG-WEBHOOK сессией).
- [ ] Smoke — Ольгу не грузим Ириной, прогоним synthetic SQL test:
  - Найди существующую submission Ирины Петруни в status='accepted' (или любую закрытую)
  - Симулируй "frontend draft→in_review" под её JWT через psql:
    ```sql
    BEGIN;
    SET LOCAL "request.jwt.claims" = '{"sub":"35019374-d7de-4900-aa9d-1797bcca9769"}';
    SET LOCAL role authenticated;
    INSERT INTO pvl_homework_status_history (submission_id, from_status, to_status, changed_by, changed_at)
    VALUES ('<her_submission_id>', 'draft', 'in_review', '35019374-d7de-4900-aa9d-1797bcca9769', NOW());
    -- Должно успешно вставить + trigger ставит в queue
    SELECT event_type, recipient_profile_id, sent_at FROM tg_notifications_queue
     WHERE event_source_id = (SELECT id FROM pvl_homework_status_history WHERE changed_at > NOW() - INTERVAL '10 sec' LIMIT 1);
    ROLLBACK;  -- не сохраняем тестовую запись
    ```
  - Должно показать `hw_submitted_revision` event для recipient = Юля. Worker не подхватит (мы откатим транзакцию). Главное — что INSERT в status_history прошёл + trigger выстрелил.

- [ ] Если synthetic SQL passes — backend часть готова, frontend fix готов, ждём natural acceptance: следующая первая сдача любой студенткой → ментор получит push.

---

## Параллельность с TG-WEBHOOK-INBOUND-BLOCKED

Эта задача в **`pvlMockApi.js`**, та — в **`server.js` garden-auth**. Файлы независимые, не пересекаются. Concurrency block в `deploy.yml` страхует от FTP-race.

После apply **обеих** — функция уведомлений будет восстановлена полностью:
- Mentor→student push (вчера phase36)
- Student→mentor push (этот fix)
- Новые TG-привязки (TG-WEBHOOK → polling)
