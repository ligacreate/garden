# BUG-HW-SUBMIT-NO-HISTORY — сдача ДЗ студенткой не пишет в pvl_homework_status_history

**От:** стратег (claude.ai)
**Кому:** VS Code Claude Code
**Дата:** 2026-05-18 вечер
**Тип:** P0 — системная регрессия push-notification flow для менторов.
**Аффект:** все ментора привязанные к TG не получают push при сдаче ДЗ студенткой. 3 жалобы за день (Ирина Одинцова, Василина Лузина, Елена Федотова).

---

## Что уже разобрано стратегом

### Симптомы

- **5 записей в `pvl_homework_status_history` за сегодня — все от менторских actions** (3× in_review→accepted Ольгой/Юлей, 1× in_review→revision Еленой Ф., 1× раннее утром). **Ни одной от студенток** (никаких `*→in_review` или `revision→in_review` за сегодня).
- При этом submissions обновляются — Елена Курдюкова submission `0e0ec503-feeb-403e-903e-1e5b467db249` updated в 17:08:51 МСК со status=revision. Самой её предшествующей сдачи (in_review insert) нет в status_history.
- `tg_notifications_queue` пустая за весь день.
- Hotfix phase34 (function `tg_enqueue_homework_event` теперь ловит `to_status='in_review'`) **applied и работает корректно** — но функция-trigger **не вызывается**, потому что INSERT в status_history не происходит.

### Recon кода

В `services/pvlMockApi.js`:

**Line 2955-2972 (submitTask):**
```js
const fromStatus = state.status;
state.status = TASK_STATUS.SUBMITTED;
const history = { id: uid('sh'), studentId, taskId, fromStatus, toStatus: TASK_STATUS.SUBMITTED, changedByUserId: studentId, ... };
db.statusHistory.push(history);
// ... pushEvent, addAuditEvent, addNotification ...
persistSubmissionToDb(studentId, taskId);
```

**Line 2129+ (doPersistSubmissionToDb):**
```js
await ensurePvlStudentInDb(studentId);  // ← ARCH-012: early-exit для не-админа (студентка — no-op)
// ... resolve sqlHomeworkId, possibly upsertHomeworkItem ...
await pvlPostgrestApi.updateHomeworkSubmission(row.id, patch);  // ← submission PATCH работает (мы видим updated_at в submissions)
const changedBy = getAuthUserId();  // ← JWT.sub
const UUID_RE = /^[0-9a-f]{8}-...{12}$/i;
if (!changedBy || !UUID_RE.test(String(changedBy))) {
    throw new Error(`pvl status_history: changed_by is not a valid UUID (got=${changedBy ?? 'null'})`);
}
const historyRows = db.statusHistory.filter((h) => h.studentId === studentId && h.taskId === taskId);
for (const h of historyRows.slice(-3)) {
    await pvlPostgrestApi.appendHomeworkStatusHistory({
        submission_id: row.id,
        from_status: h.fromStatus || null,
        to_status: h.toStatus || null,
        comment: h.comment || '',
        changed_by: changedBy,
        changed_at: h.createdAt || nowIso(),
        payload: { studentId, taskId },
    });
}
```

**Line 2211 (persistSubmissionToDb):** retry × 3 с `fireAndForget` swallow. При retry-exhausted — `addNotification(studentId, ROLES.STUDENT, 'db_save_error', 'Не удалось сохранить ДЗ...')` + `logDbFallback(...)`.

### RLS на pvl_homework_status_history (recon стратега)

- RESTRICTIVE `has_platform_access(auth.uid())` for ALL — студентки с `access_status='active'` проходят (`has_platform_access=true`)
- PERMISSIVE INSERT — `qual=NULL`, но **`with_check`** (доделать recon ↓) скорее всего:
  `changed_by = auth.uid() AND EXISTS submission WHERE student_id = auth.uid() OR is_admin OR is_mentor_for(s.student_id)`
- PERMISSIVE SELECT — `EXISTS submission ... ((s.student_id = auth.uid()) OR is_admin() OR is_mentor_for(s.student_id))`

---

## Гипотезы root cause (по приоритету)

### Hyp 1: RLS WITH CHECK на INSERT отбрасывает запись студентки

Если `changed_by` (= JWT.sub) ≠ `student_id` в submission (= `profiles.id` = тот же UUID, по дизайну), WITH CHECK fails → INSERT reject → exception → retry × 3 → silent fail.

**Recon (доделать):**
```sql
SELECT polname, pg_get_expr(polqual, polrelid) AS using_qual,
       pg_get_expr(polwithcheck, polrelid) AS with_check
  FROM pg_policy
 WHERE polrelid = 'public.pvl_homework_status_history'::regclass
 ORDER BY polname;
```

Сравнить `with_check` для INSERT-policy и `changed_by` логику. Если `auth.uid() != profile.id` для студенток (JWT.sub mismatch) — это корень.

### Hyp 2: `logDbFallback` показывает реальный exception

Если flow реально падает с retry-exhausted → должна быть запись в `logDbFallback`. Где хранится? Возможно в `pvl_audit_log` или в memory.

**Recon:**
```sql
SELECT * FROM pvl_audit_log
 WHERE created_at > NOW() - INTERVAL '36 hours'
   AND (action LIKE '%db_save_error%' OR event_type LIKE '%db_save_error%')
 ORDER BY created_at DESC LIMIT 20;
```

И в frontend — `logDbFallback` функция, какая endpoint имеет? Если localStorage или just console.warn — может ничего на проде.

### Hyp 3: `db.statusHistory.filter(...)` возвращает [] для студенток

В мульти-tab / сессионных сценариях `db.statusHistory` может быть пуст для некоторых student-tasks (in-memory state не sync'ится).

**Recon:** add `console.warn` в doPersistSubmissionToDb перед `slice(-3)`, deploy, посмотреть consoleLog (или dedicated event-emitter в monitor).

### Hyp 4: `pvlPostgrestApi.appendHomeworkStatusHistory` бросает на конкретном field validation

Например `comment` имеет длину > limit, или `payload jsonb` malformed.

**Recon:** проверить constraints на pvl_homework_status_history (уже recon'ил, нет explicit limit'ов кроме FK на submission_id).

---

## План работы для codeexec

### Шаг 1 — recon доделать (read-only, ~15 минут)

1. Полные RLS policies через `pg_policy.polwithcheck` для `pvl_homework_status_history` (INSERT WITH CHECK).
2. `pvl_audit_log` за 36ч с фильтром `db_save_error` / homework / status_history.
3. Сравнить `auth.uid()` для типичной студентки с её `profiles.id` через тест-INSERT под JWT'ом (можно через `set_config('request.jwt.claims', '...')` в psql, симуляция).
4. Тест-INSERT в `pvl_homework_status_history` под JWT'ом Ирины Петруни (валидный pvl-student): получится ли?

Все 4 — read-only / dry-run. Без write на проде.

### Шаг 2 — определить фактическую гипотезу

После шага 1 — поймём какая из Hyp 1/2/3/4 точная. Записать в `_session/_69_codeexec_bug_hw_submit_recon.md` factsheet.

### Шаг 3 — fix-diff в `_session/_70_codeexec_bug_hw_submit_diff.md`

Точный diff зависит от гипотезы:
- **Hyp 1** — поправить RLS WITH CHECK (либо JWT-sub mapping).
- **Hyp 2** — fix exception source.
- **Hyp 3** — посмотреть почему db.statusHistory пуст в подходящий момент.
- **Hyp 4** — поправить serialization.

Diff на ревью стратегу. После 🟢 — apply.

### Шаг 4 — smoke

Acceptance: попросить Ирину Петруню сдать тестовое ДЗ (она привязана к TG, её ментор Юля тоже). Через ~30 сек проверить:
```sql
SELECT * FROM pvl_homework_status_history WHERE changed_at > NOW() - INTERVAL '5 min';
SELECT * FROM tg_notifications_queue ORDER BY created_at DESC LIMIT 3;
```

Должны увидеть **запись в history** + **event в queue** + **sent_at** через 15 сек worker'а. И Юля должна получить TG-push.

---

## Что от стратега нужно (когда вернётся отчёт)

- Прочитать `_69` (recon) — подтвердить гипотезу
- 🟢 на diff `_70` — apply
- Verify smoke у Юли

## Параллельность с BUG-2

BUG-2 (`_session/_66`) — отдельный домен (auth + RLS profiles). Можно apply параллельно — файлы разные, миграции независимые. Concurrency block в `deploy.yml` гарантирует sequential deploy без race.

Порядок не критичен; рекомендую: **сначала apply BUG-2** (Мария hard-block, простой fix), **параллельно стартует BUG-1 recon**, потом apply BUG-1 (более сложный).
