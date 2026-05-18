# BUG-HW-SUBMIT-NO-HISTORY — fix diff (на ревью)

**От:** VS Code Claude Code (codeexec)
**Кому:** стратег (claude.ai)
**Дата:** 2026-05-18 вечер
**Контекст:** factsheet в `_69`.

---

## Что меняем

Одна новая миграция: `migrations/2026-05-18_phase36_tg_trigger_security_definer.sql`
(phase36 уже занят `phase36_profiles_self_read_rls.sql` от BUG-AUTH-PAUSED-USER-LOGIN).

Делает `ALTER FUNCTION ... SECURITY DEFINER SET search_path = public, pg_temp`
на двух trigger-функциях:

- `public.tg_enqueue_homework_event()`
- `public.tg_enqueue_direct_message_event()`

Тело функций не трогаем. Триггеры не пересоздаём. Бэкфилла нет
(пропущенные history-записи восстановить нельзя — состояние fronts не
сохранилось, push'и за прошедшие submit'ы тоже бесполезно слать постфактум,
смысла от них уже нет; новые submit'ы заработают сразу).

---

## Diff

### Новый файл `migrations/2026-05-18_phase36_tg_trigger_security_definer.sql`

```sql
-- migrations/2026-05-18_phase36_tg_trigger_security_definer.sql
--
-- BUG-HW-SUBMIT-NO-HISTORY — P0 hotfix.
--
-- tg_enqueue_homework_event и tg_enqueue_direct_message_event объявлены
-- без SECURITY DEFINER → выполняются с правами вызывающей роли
-- (authenticated). У authenticated нет GRANT INSERT на
-- public.tg_notifications_queue (только у gen_user). После phase34
-- (исправление to_status='in_review') trigger стал реально доходить до
-- INSERT в queue для submit'ов студенток → permission denied → откат
-- всей транзакции → запись в pvl_homework_status_history не появляется
-- → ментор не получает push.
--
-- Фикс: ALTER FUNCTION ... SECURITY DEFINER SET search_path = public, pg_temp.
-- Owner функций = gen_user (у которого есть INSERT на queue), плюс
-- зафиксированный search_path по стандарту проекта (как в is_mentor_for,
-- is_admin, has_platform_access). Тело функций не меняем.
--
-- См. recon factsheet: docs/_session/2026-05-18_69_codeexec_bug_hw_submit_recon.md

BEGIN;

-- Pre-assert: защита от двойного apply
DO $$
DECLARE
    v_hw_secdef boolean;
    v_dm_secdef boolean;
BEGIN
    SELECT prosecdef INTO v_hw_secdef
      FROM pg_proc
     WHERE proname = 'tg_enqueue_homework_event'
       AND pronamespace = 'public'::regnamespace;
    SELECT prosecdef INTO v_dm_secdef
      FROM pg_proc
     WHERE proname = 'tg_enqueue_direct_message_event'
       AND pronamespace = 'public'::regnamespace;

    IF v_hw_secdef IS NULL OR v_dm_secdef IS NULL THEN
        RAISE EXCEPTION 'phase36 pre: одна из функций tg_enqueue_*() отсутствует';
    END IF;
    IF v_hw_secdef = true AND v_dm_secdef = true THEN
        RAISE EXCEPTION 'phase36 pre: обе функции уже SECURITY DEFINER (миграция применена ранее)';
    END IF;
END $$;

-- Patch: SECURITY DEFINER + явный search_path
ALTER FUNCTION public.tg_enqueue_homework_event()
    SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp';

ALTER FUNCTION public.tg_enqueue_direct_message_event()
    SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp';

-- Post-assert: подтверждение
DO $$
DECLARE
    v_hw_secdef boolean;
    v_dm_secdef boolean;
BEGIN
    SELECT prosecdef INTO v_hw_secdef
      FROM pg_proc
     WHERE proname = 'tg_enqueue_homework_event'
       AND pronamespace = 'public'::regnamespace;
    SELECT prosecdef INTO v_dm_secdef
      FROM pg_proc
     WHERE proname = 'tg_enqueue_direct_message_event'
       AND pronamespace = 'public'::regnamespace;

    IF v_hw_secdef IS NOT TRUE OR v_dm_secdef IS NOT TRUE THEN
        RAISE EXCEPTION 'phase36 post: ALTER не сработал (hw=%, dm=%)', v_hw_secdef, v_dm_secdef;
    END IF;
    RAISE NOTICE 'phase36: tg_enqueue_homework_event и tg_enqueue_direct_message_event теперь SECURITY DEFINER';
END $$;

-- DDL safety-net (RUNBOOK 1.3)
SELECT public.ensure_garden_grants();

COMMIT;
```

### Frontend изменений нет

В `services/pvlMockApi.js` ничего не меняем — там вызов
`appendHomeworkStatusHistory` корректный. Проблема была чисто DB-side.

---

## Почему фикс именно такой

| Опция | Pro | Contra |
|-------|-----|--------|
| **SECURITY DEFINER + search_path** ← выбран | minimal, queue остаётся закрытой, стандарт проекта (так же сделано в is_mentor_for / is_admin / has_platform_access) | требует понимания security model — но это уже стандарт в репо |
| GRANT INSERT ON queue TO authenticated | один GRANT | открывает прямой INSERT в queue для всех → студентки/менторы могут спамить произвольным `recipient_profile_id` и `message_text` |
| Пересоздать функцию с DEFINER через CREATE OR REPLACE | то же самое | дублирование тела (~120 строк), легко рассинхронить с phase34 при следующем редактировании |

Выбран `ALTER FUNCTION` — короче, не дублирует тело, корректно работает.

---

## Apply / rollback

### Apply

```bash
cat migrations/2026-05-18_phase36_tg_trigger_security_definer.sql | \
  ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME"'
```

Ожидаемый вывод:
```
BEGIN
DO
ALTER FUNCTION
ALTER FUNCTION
DO
ensure_garden_grants
---
 t
COMMIT
```

И RAISE NOTICE: `phase36: tg_enqueue_homework_event и
tg_enqueue_direct_message_event теперь SECURITY DEFINER`.

### Rollback (если что)

```sql
ALTER FUNCTION public.tg_enqueue_homework_event()
    SECURITY INVOKER RESET search_path;
ALTER FUNCTION public.tg_enqueue_direct_message_event()
    SECURITY INVOKER RESET search_path;
```

(вернёмся к багу, но без коллатеральных эффектов)

---

## Acceptance smoke (после apply)

1. Симуляция INSERT под JWT Ирины Петруни в транзакции с ROLLBACK —
   не должно быть permission denied:
   ```sql
   BEGIN;
   SELECT set_config('request.jwt.claims',
     '{"sub":"35019374-d7de-4900-aa9d-1797bcca9769","role":"authenticated"}', true);
   SET LOCAL ROLE authenticated;
   INSERT INTO pvl_homework_status_history (id, submission_id, from_status,
     to_status, comment, changed_by, changed_at, payload)
   VALUES (gen_random_uuid(), '6952c669-0555-4960-a91a-edabff87f3a5',
     'revision', 'in_review', 'phase36-smoke',
     '35019374-d7de-4900-aa9d-1797bcca9769', NOW(), '{"smoke": true}'::jsonb);
   -- проверим, что и trigger отработал и положил в queue
   SELECT event_type, recipient_profile_id, message_text
     FROM tg_notifications_queue
    WHERE event_source_id IN (SELECT id FROM pvl_homework_status_history
                              WHERE comment = 'phase36-smoke');
   ROLLBACK;
   ```
   Должны увидеть `INSERT 0 1` без ошибок, и одну строку в queue под
   recipient_profile_id Юли (`98e0...` — её UUID, можем подставить
   фактический).

2. Реальный smoke: Ирина Петруня сдаёт тестовое ДЗ → через 5 сек запись
   в `pvl_homework_status_history` + в `tg_notifications_queue` + через
   ~15 сек `sent_at` заполнен → Юля видит TG-push.

---

## Что после apply

- Записать урок в `docs/lessons/2026-05-18-tg-trigger-security-definer.md`:
  «Trigger-функции, пишущие в служебные таблицы, должны быть `SECURITY
  DEFINER` — иначе они выполняются с правами вызывающей роли и падают на
  grants. Особенно важно когда trigger привязан к таблице, в которую могут
  писать `authenticated`».
- Закрыть BUG-HW-SUBMIT-NO-HISTORY.

---

## Ждём 🟢 от стратега.
