# Trigger SECURITY DEFINER vs caller permissions: каскадный отказ через AFTER INSERT

**Дата инцидента:** 2026-05-18
**Связанные миграции:** phase34 (`2026-05-18_phase34_tg_trigger_status_fix.sql`), phase36 (`2026-05-18_phase36_tg_trigger_security_definer.sql`)
**Связанные сессии:** [_61](../_session/2026-05-18_61_strategist_bug_tg_trigger_status_mismatch.md), [_62](../_session/2026-05-18_62_codeexec_bug_tg_trigger_status_diff.md), [_63](../_session/2026-05-18_63_codeexec_bug_tg_trigger_status_applied.md), [_67](../_session/2026-05-18_67_strategist_bug_hw_submit_no_history.md), [_69 recon](../_session/2026-05-18_69_codeexec_bug_hw_submit_recon.md), [_70](../_session/2026-05-18_70_codeexec_bug_hw_submit_diff.md)

## Симптом

Менторы не получают TG-push о сданных ДЗ. После apply phase34
(`'submitted'→'in_review'`) — всё ещё не получают. Дополнительно: за
сегодня **5 записей** в `pvl_homework_status_history` (3× admin,
2× ментор — все `accepted`/`revision`), но **0 записей от студенток**
(`*→in_review`). При этом `pvl_audit_log` показывает 5 `submit_task`
events за тот же период — то есть frontend submit отправил, mock-state
обновился, audit-log записал, но запись в `pvl_homework_status_history`
не появилась.

## Корневая причина

Каскадный отказ из-за непредвиденного взаимодействия двух факторов:

1. **Trigger-функция без `SECURITY DEFINER`** — `tg_enqueue_homework_event`
   и `tg_enqueue_direct_message_event` выполнялись с правами вызывающей
   роли (`authenticated`).
2. **`authenticated` не имел GRANT INSERT** на служебную таблицу
   `public.tg_notifications_queue` (только у владельца `gen_user`, и это
   правильно — прямой INSERT в queue извне нежелателен).

Цепочка отказа для студентки со привязанным TG:
- Студентка делает INSERT в `pvl_homework_status_history` (`to_status='in_review'`).
- AFTER INSERT trigger вызывает `tg_enqueue_homework_event()` под её JWT.
- Функция проходит проверки (ментор резолвится, TG привязан, ...) и
  доходит до `INSERT INTO public.tg_notifications_queue (...)`.
- PostgreSQL проверяет права `authenticated` на queue → **permission denied**.
- Исключение в trigger откатывает **всю внешнюю транзакцию** — INSERT в
  `pvl_homework_status_history` тоже откатывается.
- Frontend через `services/pvlMockApi.js:persistSubmissionToDb` retry × 3
  → all failed → `fireAndForget`-swallow → silent.

## Почему так получилось

**Phase34 unmasked phase32 bug.** До phase34 trigger-функция уходила в
`RETURN NEW` без INSERT в queue (потому что искала несуществующий
`to_status='submitted'`). Permission denied не выстреливал, потому что
до INSERT'а просто не доходило. Phase34 заставил функцию реально дойти
до INSERT — и обнажил permission-cascade.

**Менторские INSERTs продолжали проходить** — для веток `accepted`/`revision`
recipient = студентка. У большинства студенток TG не привязан → функция
делает `RETURN NEW` ДО INSERT в queue (см. ветку
`IF v_recipient_tg IS NULL THEN RETURN NEW`), permission denied не
выстреливает. Это создавало иллюзию, что «триггер работает, просто
студентки молчат». Падали только submit'ы — и только от тех студенток,
у которых TG был привязан (Ирина Петруня).

**В брифе _61** стратег предложил 4 гипотезы корня (RLS / JWT-claim
mismatch / `changed_by` UUID throw / fire-and-forget swallow без
visibility). **Security context trigger-функции среди них не было.** Это
скрытый failure mode — trigger-функция выглядит «черным ящиком»
по отношению к caller'у, но фактически наследует его permissions.

**Recon через JWT-симуляцию** дал точный root cause за один запрос (см.
шаблон ниже). Без симуляции пришлось бы перебирать гипотезы стратега
до пятой.

## Как починили

**phase36 (`2026-05-18_phase36_tg_trigger_security_definer.sql`):**

```sql
ALTER FUNCTION public.tg_enqueue_homework_event()
    SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp';

ALTER FUNCTION public.tg_enqueue_direct_message_event()
    SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp';
```

Тело функций не меняем. Owner функций = `gen_user`, у которого есть
INSERT GRANT на queue. После `SECURITY DEFINER` функция выполняется с
его правами независимо от вызывающего пользователя. `search_path`
фиксирован по стандарту проекта (как у `is_mentor_for`, `is_admin`,
`has_platform_access`) — защита от поиска объектов в чужих схемах
через injected `search_path`.

**Альтернатива** — `GRANT INSERT ON tg_notifications_queue TO authenticated` —
была бы хуже: она позволяет прямой INSERT в queue в обход trigger-логики
(например с произвольным `recipient_profile_id` или мусорным `event_type`).
Queue — служебная таблица, она по дизайну должна быть писаема ТОЛЬКО
через trigger'ы.

**Связанные слои выровнены:**
- Phase36 + pre/post-asserts + `ensure_garden_grants()` (RUNBOOK 1.3).
- Frontend не трогали — он молча retry'ил и swallow'ил, что
  поведенчески норм; реальный fix на DB-слое.

## Что проверить в будущем

### Pattern: trigger пишет в admin-only таблицу под user INSERT'ом

Если trigger AFTER INSERT/UPDATE/DELETE на user-writable таблицу
выполняет INSERT/UPDATE/DELETE на admin-only таблицу — функция
**обязана** быть `SECURITY DEFINER` + `SET search_path = public, pg_temp`.

Проверка для существующих и будущих trigger-функций:

```sql
SELECT p.proname, p.prosecdef, p.proconfig
  FROM pg_proc p
  JOIN pg_trigger t ON t.tgfoid = p.oid
 WHERE NOT t.tgisinternal
 ORDER BY p.proname;
```

Если функция пишет в служебную таблицу и `prosecdef = false` — это
бомба замедленного действия. Один из таких триггеров уже подсветился
этим инцидентом, но в репо может быть ещё.

### Pattern: AFTER INSERT exception откатывает внешнюю транзакцию

PostgreSQL **не имеет soft-fail** для триггеров. Любой `RAISE EXCEPTION`
или unhandled error внутри trigger-функции откатывает внешнюю
транзакцию, инициировавшую INSERT/UPDATE/DELETE.

Если приложение не должно зависеть от сайд-эффекта (например, queue —
nice-to-have), trigger должен оборачивать сайд-эффект в `BEGIN ... EXCEPTION
WHEN OTHERS THEN RAISE NOTICE ...; END;` чтобы payload-операция
гарантированно прошла. Это компромисс между «надёжность side-effect»
и «надёжность основной операции» — выбирать осознанно.

В нашем случае правильное решение — починить permission (SECURITY DEFINER),
а не глушить exception. Queue нужна для каждого корректного события.

### Tool: JWT-симуляция через `set_config` — must-have для RLS/trigger debug

Когда баг проявляется только под конкретной user-ролью (не под
`gen_user`), повторить под `gen_user` ничего не показывает. Шаблон
симуляции в `BEGIN ... ROLLBACK` transaction:

```sql
BEGIN;
SELECT set_config('request.jwt.claims',
  '{"sub":"<user-uuid>","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

-- симулируемое действие (как из фронта)
INSERT INTO ... VALUES (...);

ROLLBACK;  -- ничего не сохраняется на проде
```

Что даёт:
- Видим точный `permission denied for table <X>` с `CONTEXT` и
  `PL/pgSQL function <fn> line N`.
- Безопасно — `ROLLBACK` гарантирует zero side-effect.
- Воспроизводимо — можно подставлять разных пользователей через `sub`.

В этом инциденте симуляция через JWT Ирины Петруни (`sub=35019374...`)
выдала точный root cause за **один запрос**:

```
ERROR:  permission denied for table tg_notifications_queue
CONTEXT:  SQL statement "INSERT INTO public.tg_notifications_queue (...)"
          PL/pgSQL function tg_enqueue_homework_event() line 89 at SQL statement
```

Без симуляции пришлось бы последовательно отбрасывать 4 гипотезы по
RLS / JWT / UUID / silent-swallow. Симуляция должна быть **первым**
шагом recon'а, не последним.

### Pattern: fix unmasks latent bug

Phase34 был корректным fix'ом для status mismatch, но обнажил
latent phase32-bug (permission cascade). Это нормально — fix движет
систему по graph'у состояний, и latent bugs могут проявиться. Правило:

> **После любого DB-fix'а, который меняет control-flow trigger-функции
> (новые ветки исполнения), проверь permission-cascade через
> JWT-симуляцию под user-role.**

Если phase34 включал бы JWT-симуляцию как verify step — `BUG-HW-SUBMIT-NO-HISTORY`
вылез бы при apply, не через жалобы менторов спустя несколько часов.

## Smoke verified

⏳ Ждём первый natural event: Ирина Петруня сдаёт ДЗ → запись в
`pvl_homework_status_history` создаётся → trigger выстреливает → запись
`hw_submitted_new` или `hw_submitted_revision` в `tg_notifications_queue`
→ worker garden-auth отправляет push в TG → Юля получает уведомление.

Verify-SQL:
```sql
SELECT event_type, recipient_profile_id, scheduled_for, sent_at, last_error
  FROM tg_notifications_queue
 ORDER BY created_at DESC LIMIT 5;
```

После подтверждения от Юли — дополним этот lesson SHA коммита phase36 и
timestamp'ом первого успешного push'а.
