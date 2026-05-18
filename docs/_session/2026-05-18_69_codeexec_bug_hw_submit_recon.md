# BUG-HW-SUBMIT-NO-HISTORY — recon factsheet

**От:** VS Code Claude Code (codeexec)
**Кому:** стратег (claude.ai)
**Дата:** 2026-05-18 вечер
**Статус:** root cause **подтверждён**, не одна из 4 гипотез стратега.

---

## TL;DR

Trigger-функции `tg_enqueue_homework_event` и `tg_enqueue_direct_message_event`
объявлены **без `SECURITY DEFINER`** (`prosecdef=f`), а значит выполняются с
правами вызывающей роли (`authenticated`). У `authenticated` **нет
`GRANT INSERT` на `public.tg_notifications_queue`** — есть только у владельца
(`gen_user`). При любом INSERT в `pvl_homework_status_history` со стороны
студентки/ментора trigger пытается записать в queue и падает с
`permission denied for table tg_notifications_queue`.

Поскольку trigger срабатывает в той же транзакции, что и сам INSERT, **весь
INSERT в `pvl_homework_status_history` откатывается** — поэтому в таблице
истории нет ни одной записи от студенток.

Submission PATCH успевает выполниться (в коде [pvlMockApi.js:2190](services/pvlMockApi.js#L2190)
он идёт до INSERT в history) — поэтому мы видим обновлённый `updated_at` /
`status=in_review` в `pvl_student_homework_submissions`.

Это **регрессия от phase34 hotfix** (BUG-TG-TRIGGER-STATUS-MISMATCH): до
phase34 функция искала `to_status='submitted'` и для реальных submit-событий
(`to_status='in_review'`) **возвращала NEW в первом же ELSE до INSERT в
queue**. То есть permission denied не выстреливал, потому что код не
доходил до INSERT. После phase34 trigger корректно ловит `in_review` — и
сразу падает на permission.

---

## Доказательство (recon на проде)

### 1. RLS-policies `pvl_homework_status_history` — пропускают

```
pvl_homework_status_history_insert  (PERMISSIVE)
  WITH CHECK:
    changed_by = auth.uid()
    AND EXISTS (SELECT 1 FROM pvl_student_homework_submissions s
                WHERE s.id = submission_id
                  AND (s.student_id = auth.uid()
                       OR is_admin()
                       OR is_mentor_for(s.student_id)))

pvl_homework_status_history_active_access_guard_write  (RESTRICTIVE)
  WITH CHECK: has_platform_access(auth.uid())
```

Для студентки `student_id = auth.uid() = profiles.id` (шаблон C, см.
`docs/RUNBOOK_garden.md`) — обе политики пропускают. `has_platform_access()` для
active-студенток = true.

Hyp 1 стратега (RLS WITH CHECK отбрасывает) — **отклоняю**.

### 2. Симуляция INSERT под JWT Ирины Петруни — падает на queue

Симулировал в транзакции с ROLLBACK:

```sql
BEGIN;
SELECT set_config('request.jwt.claims',
  '{"sub":"35019374-d7de-4900-aa9d-1797bcca9769","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO pvl_homework_status_history (id, submission_id, from_status,
  to_status, comment, changed_by, changed_at, payload)
VALUES (gen_random_uuid(), '6952c669-0555-4960-a91a-edabff87f3a5',
  'draft', 'in_review', 'recon-test-insert',
  '35019374-d7de-4900-aa9d-1797bcca9769', NOW(), '{"recon": true}'::jsonb);
ROLLBACK;
```

Результат:

```
ERROR:  permission denied for table tg_notifications_queue
CONTEXT:  SQL statement "INSERT INTO public.tg_notifications_queue (...)
          ON CONFLICT (dedup_key) ... DO NOTHING"
          PL/pgSQL function tg_enqueue_homework_event() line 89 at SQL statement
```

### 3. Trigger-функции БЕЗ SECURITY DEFINER

```sql
SELECT proname, prosecdef FROM pg_proc
 WHERE proname IN ('tg_enqueue_homework_event','tg_enqueue_direct_message_event',
                   'tg_resolve_mentor_profile','tg_compute_scheduled_for');
```

| proname                          | security_definer |
|----------------------------------|------------------|
| tg_resolve_mentor_profile        | f (но STABLE, не пишет)|
| tg_compute_scheduled_for         | f (но STABLE, не пишет)|
| tg_enqueue_direct_message_event  | **f** ← пишет в queue |
| tg_enqueue_homework_event        | **f** ← пишет в queue |

### 4. Grants на `tg_notifications_queue`

```sql
SELECT grantee, privilege_type FROM information_schema.role_table_grants
 WHERE table_name='tg_notifications_queue';
```

Только `gen_user` (owner) имеет все привилегии. `authenticated` / `web_anon` /
`public` — **нет**. Так и должно быть (queue — служебная таблица, прямой
INSERT извне нежелателен).

### 5. Почему менторские INSERTs за сегодня всё-таки прошли

5 записей в history за сегодня (3× admin, 2× mentor) — все `to_status` =
`accepted` / `revision`. В обеих ветках trigger:

```sql
v_recipient_profile_id := v_student_id;  -- recipient = ученица
...
IF v_recipient_tg IS NULL OR v_recipient_enabled IS DISTINCT FROM TRUE THEN
    RETURN NEW;  -- ← early-return до INSERT в queue
END IF;
```

Большинство студенток без привязанного TG → ранний `RETURN NEW` → INSERT в
queue **не выполняется** → permission denied **не срабатывает**.

Для Ирины Петруни TG привязан — если ментор Юля поставит ей `accepted`,
тот же permission denied случится. Подтвердил симуляцией под Еленой
Фёдотовой для её подопечной: INSERT в history прошёл — потому что у её
подопечной (`746c80bc-...`) тоже нет TG — early-return.

### 6. Audit log за 36ч

`pvl_audit_log` показывает 5 `submit_task` events за вчера+сегодня (Елена
Курдюкова, Наталья Махнёва ×2, Ирина Петруня, Лилия Малонг). Это значит
**фронт отправил submit, mock-state обновился, `addAuditEvent` сработал** —
но `pvl_homework_status_history` пуст для этих событий.

Записей про `db_save_error` / homework-fallback в audit_log **нет** —
`logDbFallback` шлёт в localStorage/console, не в БД (стратег упомянул как
Hyp 2 — отклоняю).

### 7. Почему Ирина Петруня 2026-05-17 20:32 успешно записала в history

Это было **до apply phase34** (phase34 applied утром 2026-05-18). До
phase34 trigger искал `to_status='submitted'`. Submit студентки даёт
`to_status='in_review'` → trigger проваливался в финальный ELSE →
`RETURN NEW` без INSERT в queue → permission на queue не проверялся →
INSERT в history успешен.

Hyp 3 (db.statusHistory пуст в момент slice(-3)) — отклоняю: история уже
в memory когда вызывается persistSubmissionToDb (см. [pvlMockApi.js:2962-2971](services/pvlMockApi.js#L2962-L2971)).

Hyp 4 (field validation в appendHomeworkStatusHistory) — отклоняю: RLS-
ошибка приходит до constraint-проверок payload.

---

## Регрессионный механизм

| Дата          | Событие                                  | Поведение                |
|---------------|------------------------------------------|--------------------------|
| 2026-05-16    | phase32: trigger создан, `to_status='submitted'` (ошибка) | submit'ы не доходят до INSERT в queue, но history пишется |
| 2026-05-17    | Ирина Петруня 20:32 успешно submit       | history записан, push не ушёл (trigger early-return)|
| 2026-05-18 утро | phase34: trigger исправлен на `to_status='in_review'` | теперь trigger пытается INSERT в queue под `authenticated` → permission denied → откат всей транзакции |
| 2026-05-18    | 4 студентки submit'ят — history пустой   | трое менторов жалуются |

Phase34 был **корректным fix'ом первого слоя** (status mismatch), но
**обнажил второй слой** — security context. Это классический «снимаем
один маскирующий блок, под ним другой».

---

## Fix

Сделать обе trigger-функции `SECURITY DEFINER` с явным `search_path`
(стандартный pattern проекта, см. `is_mentor_for`, `is_admin`,
`has_platform_access`):

```sql
ALTER FUNCTION public.tg_enqueue_homework_event()
    SECURITY DEFINER SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.tg_enqueue_direct_message_event()
    SECURITY DEFINER SET search_path TO 'public', 'pg_temp';
```

Owner функций = `gen_user`, у которого все права на queue → INSERT
проходит. `SET search_path` защищает от injection через подмену пути
(требование Postgres для SECURITY DEFINER функций).

### Почему именно DEFINER, не GRANT на authenticated

`GRANT INSERT ON tg_notifications_queue TO authenticated` решил бы
permission, но открыл бы прямой INSERT в queue для любой студентки/ментора
→ они смогут спамить произвольным `recipient_profile_id` с произвольным
`message_text`. Это security regression.

`SECURITY DEFINER` оставляет queue закрытой от прямого внешнего INSERT,
запись возможна только через trigger (который контролирует контент).

### Точечно vs системно

Trigger-функции — единственное место, где `authenticated` должен
писать в queue. `tg_resolve_mentor_profile` и `tg_compute_scheduled_for`
тоже без DEFINER, но они только читают (`STABLE`) — пока read-access у
`authenticated` есть, они работают. **Не трогаю** их в этой миграции,
чтобы не расширять scope.

---

## Acceptance smoke

После apply:

1. Ирина Петруня (`35019374-...`) сдаёт тестовое ДЗ.
2. Через ~5 сек:
   ```sql
   SELECT id, submission_id, from_status, to_status, changed_at
     FROM pvl_homework_status_history
    WHERE changed_at > NOW() - INTERVAL '5 min'
    ORDER BY changed_at DESC;
   ```
   Должна быть запись `from_status=draft|revision, to_status=in_review,
   changed_by=35019374-...`.
3. Через ~5 сек:
   ```sql
   SELECT recipient_profile_id, event_type, message_text, scheduled_for, sent_at
     FROM tg_notifications_queue
    ORDER BY created_at DESC LIMIT 3;
   ```
   Должен быть `event_type=hw_submitted_new|hw_submitted_revision`,
   `recipient_profile_id=Юля`, `sent_at=NULL` сразу, через 15 сек
   worker'а → `sent_at` заполнен.
4. Юля видит в TG: «📥 Ирина Петруня сдала ДЗ «<title>»».

Если smoke прошёл — закрываем баг + lessons-файл.
