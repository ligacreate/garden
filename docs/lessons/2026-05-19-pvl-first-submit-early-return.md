# `if (!row) { create; return; }` — early-return съел loop status_history для первой сдачи

**Дата инцидента:** 2026-05-18 (вечер) → 2026-05-19 (fix + verify).
**Связанная миграция:** ни одной (frontend-only).
**Связанные коммиты:** `26b5c54` (fix `services/pvlMockApi.js`), `82b0a6c` (phase36 DB-side, см. parallel-lesson).
**Связанные сессии:** [_72 strategist plan](../_session/2026-05-19_72_strategist_bug_pvl_first_submit_no_history.md), [_73 codeexec applied](../_session/2026-05-19_73_codeexec_pvl_first_submit_diff.md).

## Симптом

После phase36 (DB-side fix, SECURITY DEFINER для trigger-функций) менторы
по-прежнему не получали push о **первых** сданных ДЗ. При повторной сдаче
(когда submission уже существует) — всё работало: ментор получал
revision/accepted push'и корректно.

Конкретно: 28 исторических `draft→in_review` records в
`pvl_homework_status_history` показывали, что записи **могут** там быть,
но за последние сутки (после phase34) — ноль студенческих
`*→in_review` событий. При этом `pvl_audit_log` содержал 5
`submit_task` events за тот же период — frontend submit отправил,
mock-state обновился, audit-log записал, но статус-история **не
обновлялась**.

## Корневая причина

[`services/pvlMockApi.js:2186-2189`](../../services/pvlMockApi.js#L2186-L2189),
функция `doPersistSubmissionToDb`:

```js
if (!row) {
    await pvlPostgrestApi.createHomeworkSubmission(patch);
    return;  // ← EARLY RETURN
}
await pvlPostgrestApi.updateHomeworkSubmission(row.id, patch);
// ... appendHomeworkStatusHistory loop ниже ...
```

**Цепочка отказа для первой сдачи:**
1. Студентка нажимает «Отправить» — submission ещё нет в
   `pvl_student_homework_submissions`.
2. `existing.find(...)` → `undefined` → `!row === true`.
3. Вызывается `createHomeworkSubmission(patch)` → создаёт submission.
4. **`return`** — функция выходит **до** loop'а `appendHomeworkStatusHistory`.
5. Запись в `pvl_homework_status_history` **никогда не создаётся**.
6. Trigger `tg_enqueue_homework_event` (даже после phase36) не вызывается
   — нечему триггериться.
7. `tg_notifications_queue` пуст.
8. Worker garden-auth ничего не подхватывает.
9. Ментор не получает push.

**Менторские последующие действия работали:** для revision/accepted
submission уже существует → попадаем в `updateHomeworkSubmission` ветку
→ loop status_history исполняется → trigger выстреливает → ментор/студентка
получают push корректно.

## Почему так получилось

**Git blame `26b5c54`:** строки добавлены в commit `8bb03bf` (2026-05-01,
Anastasia). 19 дней до обнаружения. Не regression — был всегда. Никто не
замечал, **пока менторы не привязали TG (16 мая вечер)** и не начали
ожидать push'ей. До этого статус-история всё равно создавалась только
для второго и далее status-change'а (revision/accepted) — первый submit
от студенток молча игнорировался audit-trail'ом.

**Antipattern:** «если строки нет — создать и выйти; если есть —
update + side-effects». Side-effects (loop status_history,
push notification) принадлежат **обоим** путям (новый submission +
существующий) и не должны зависеть от того, какая ветка create/update
была пройдена.

**Маскирование DB-баг'ом:** phase36 (SECURITY DEFINER) даже после fix'а
ничего бы не показал на первой сдаче — потому что trigger вообще не
вызывался (нет INSERT в `pvl_homework_status_history`). Стратег
правильно отделил два бага в bug-tracker'е (DB-side =
`BUG-HW-SUBMIT-NO-HISTORY` через phase36, frontend-side =
`BUG-PVL-FRONTEND-STUDENT-HISTORY-WRITE`) — они **складывались** и
маскировали друг друга.

## Как починили

`26b5c54` — структурная замена early-return на assign + branch'еватый
update:

```diff
-    const existing = await pvlPostgrestApi.listStudentHomeworkSubmissions(sqlStudentId);
-    const row = (existing || []).find((x) => String(x.homework_item_id) === String(sqlHomeworkId));
+    const existing = await pvlPostgrestApi.listStudentHomeworkSubmissions(sqlStudentId);
+    let row = (existing || []).find((x) => String(x.homework_item_id) === String(sqlHomeworkId));
     // ... patch building ...
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
     // ... loop appendHomeworkStatusHistory остаётся unchanged ...
```

**Ключевое:**
1. `const row → let row` — нужно для reassign после create.
2. `if/else` ветка create vs update.
3. После — `row.id` гарантированно populated, loop status_history исполняется
   в **обоих** случаях.
4. Validation `!row || !row.id` ловит edge case если PostgREST вернул
   странный ответ. `createHomeworkSubmission` возвращает created row
   благодаря `prefer: 'return=representation'`
   ([`pvlPostgrestApi.js:468-477`](../../services/pvlPostgrestApi.js#L468-L477)).

Не трогали: `submitTask` action (line 2955-2972 — он же push'ит в
`db.statusHistory` корректно через mock-state), RLS-policies,
trigger-функции (phase36 fix уже в проде).

## Что проверить в будущем

### Pattern: side-effects должны исполняться независимо от branch

Если функция делает упорядоченные шаги `(A) ensure resource exists →
(B) update related state → (C) emit side-effects`, то **(C) должно
исполняться при обоих исходах (A)** — и при create, и при reuse.
Early-return после (A) ломает (B)+(C).

**Эвристика на ревью:** если видишь
```js
if (!row) {
    await create(...);
    return;       // ← подозрительно
}
await update(...);
await sideEffect(...);  // ← не вызывается для create-ветки!
```
— спроси «должен ли `sideEffect` исполняться и для create?». Чаще
ответ — да.

### Pattern: первая операция инициирует наблюдаемые side-effects

Audit-trail / notification / push'и должны генерироваться при **первом**
изменении состояния. Если первая операция тихо проходит без `*_history`
INSERT — наблюдатели (менторы, audit reviewers, monitoring) узнают о
ней только позже, после второго изменения. Это создаёт «дыру» в
журнале, которая обнажится через сторонний сигнал (жалоба пользователя).

**Проверка:** если у resource'а есть `*_status_history` или `audit_log` —
INSERT туда должен быть в той же транзакции/функции что и INSERT/UPDATE
основной таблицы. Не в условной ветке.

### Pattern: latent bug + fresh DB-fix = stacked masking

Backend phase36 (SECURITY DEFINER) корректно решал permission-cascade
бага, но **не давал визуального подтверждения**, потому что frontend
никогда не доходил до INSERT'а в status_history для первой сдачи.
Если фиксы накладываются, нельзя verify'ить один без второго.

**Эвристика:** после apply DB-fix'а с очаквидным наружным эффектом
(push, notification, …) и **отсутствия наблюдаемого результата** —
проверяй frontend код пути от user action → DB write. Возможно DB-fix
корректен, но не вызывается из приложения.

## Smoke verified

✅ **Natural acceptance — 2026-05-19 11:06 МСК.** Ольга Разжигаева
сдала первую ДЗ. End-to-end: frontend submit → INSERT в `pvl_student_homework_submissions`
(create-ветка) → row reassigned → loop `appendHomeworkStatusHistory` →
INSERT в `pvl_homework_status_history` (`draft → in_review`) → trigger
выстрелил под SECURITY DEFINER (phase36) → INSERT в
`tg_notifications_queue` → worker garden-auth подхватил → **Василина
получила push `hw_submitted_new` через ~5 секунд**.

Парный lesson по DB-стороне:
[`2026-05-18-tg-trigger-security-definer-permission-cascade.md`](2026-05-18-tg-trigger-security-definer-permission-cascade.md).
