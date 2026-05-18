# BUG-TG-TRIGGER-STATUS-MISMATCH — fix one-liner в функции tg_enqueue_homework_event

**От:** стратег (claude.ai)
**Кому:** VS Code Claude Code
**Дата:** 2026-05-18 утро
**Тип:** P0 production hotfix
**Контекст:** менторы сообщили в общий чат, что не получают push о сданных ДЗ. Recon показал, что функция-trigger проверяет несуществующий статус `'submitted'` — в реальной схеме студентка после сдачи попадает в статус `'in_review'`. Trigger никогда не срабатывает на сдачу.

---

## Root cause

```sql
-- Текущая функция public.tg_enqueue_homework_event() — строка 17 от BEGIN:
IF NEW.to_status = 'submitted' THEN
    -- hw_submitted_new / hw_submitted_revision → отправить ментору
```

В реальной схеме `pvl_student_homework_submissions.status` принимает значения: `in_review`, `revision`, `accepted`. **Значение `'submitted'` не существует.** Подтверждено через выборку последних 10 переходов в `pvl_homework_status_history` — все `revision → in_review` или `in_review → accepted`.

Эффект: функция при INSERT в status_history доходит до `ELSIF NEW.to_status = 'accepted'` (ловит → шлёт студентке) или `ELSIF NEW.to_status = 'revision'` (ловит → шлёт студентке). Менторы по `to_status = 'in_review'` попадают в финальный `ELSE RETURN NEW` — без enqueue.

То есть **никакой ментор не может получить push о сданном ДЗ в текущей версии функции** — это не у Ирины и Василины проблема, это у всех. Просто никто другой ещё не успел сесть и обратить внимание.

---

## Fix — миграция CREATE OR REPLACE FUNCTION

Файл: `migrations/2026-05-18_phase34_tg_trigger_status_fix.sql`

Содержимое — `CREATE OR REPLACE FUNCTION public.tg_enqueue_homework_event() RETURNS trigger ...` целиком, как сейчас, с **одним изменением**:

```diff
-    IF NEW.to_status = 'submitted' THEN
+    IF NEW.to_status = 'in_review' THEN
```

Остальная логика остаётся ровно как сейчас:
- `IF NEW.from_status = 'revision' THEN v_event_type := 'hw_submitted_revision' ELSE v_event_type := 'hw_submitted_new' END` — правильно (revision → in_review = дополнила, иначе = впервые)
- Self-event skip остаётся
- Проверка `recipient.telegram_user_id IS NOT NULL AND telegram_notifications_enabled = TRUE` остаётся
- Dedup_key, ON CONFLICT — остаются

Полное тело функции достанешь через:
```sql
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='tg_enqueue_homework_event';
```

Скопируй as-is, делай diff одной строкой.

В миграции добавь pre-apply assertion + post-apply RAISE NOTICE для логирования что function definition updated:

```sql
BEGIN;

-- Pre: убеждаемся что функция существует и старая.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'tg_enqueue_homework_event'
          AND pg_get_functiondef(oid) LIKE '%NEW.to_status = ''submitted''%'
    ) THEN
        RAISE EXCEPTION 'tg_enqueue_homework_event либо отсутствует, либо уже patched';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.tg_enqueue_homework_event()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
-- ... (полное тело, копируй из текущего pg_get_functiondef)
-- с заменой 'submitted' → 'in_review' в строке IF NEW.to_status = 'submitted' THEN
$function$;

-- Post: подтверждение
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'tg_enqueue_homework_event'
          AND pg_get_functiondef(oid) LIKE '%NEW.to_status = ''in_review''%'
    ) THEN
        RAISE NOTICE 'phase34: tg_enqueue_homework_event patched OK (in_review)';
    ELSE
        RAISE EXCEPTION 'phase34: patch FAILED — функция не содержит in_review';
    END IF;
END $$;

-- Не забудь вызвать ensure_garden_grants() ДО COMMIT (RUNBOOK 1.3 — DDL safety-net)
SELECT public.ensure_garden_grants();

COMMIT;
```

---

## Apply flow

1. Подготовь миграцию `migrations/2026-05-18_phase34_tg_trigger_status_fix.sql` по шаблону выше.
2. Diff на ревью в `_session/_62_codeexec_bug_tg_trigger_status_diff.md` (на всякий случай, миграция БД).
3. После 🟢 — apply на прод через psql.
4. Single коммит `fix(pvl/tg): trigger ловит to_status='in_review' (was 'submitted', BUG-TG-TRIGGER-STATUS-MISMATCH)` + миграция + `_session/`.
5. Push (один коммит → один deploy → concurrency block гарантирует отсутствие race).
6. **Verify сразу:** прогнать тестовый INSERT в `pvl_homework_status_history` под dev-аккаунтом, либо просто подождать natural event (Ирина Петруня → Юля привязка готова). Проверить через 30 сек после event:

```sql
SELECT event_type, recipient_profile_id, scheduled_for, sent_at, last_error
FROM tg_notifications_queue
ORDER BY created_at DESC LIMIT 5;
```

Если появилась запись с `event_type IN ('hw_submitted_new', 'hw_submitted_revision')` — функция теперь enqueue'ит ✅.

7. **Worker check:** ранее queue была total=0 за всё время, значит worker никогда не имел работы. Проверь что worker (`garden-auth` service на VPS) активен. После first event в queue — должен подхватить через 15 сек polling, отправить через TG bot, проставить `sent_at`. Если запись висит pending → worker под подозрением, отдельный recon.

---

## Backfill — НЕ делаем

За последние 36ч было ~5 событий `to_status = 'in_review'` (Юля, Ирина О., Василина — их менти сдавали). Backfill (вручную INSERT в queue с историческими событиями) **не делаем** — менторы уже узнали другими способами (написаниями от менти, наблюдением на платформе). Спамить их теперь старыми push'ами = confusion. Считаем эти 5 events потерянными, идём от свежих.

---

## Открытые вопросы

1. **Откуда mismatch.** Status `'submitted'` в функции — это исторический след? Был ли он реально в схеме раньше, потом переименовали на `'in_review'`, а функцию не обновили? Если так — стоит проверить нет ли других мест с этим mismatch (RLS, frontend, отчёты). Recon: `grep -rn "submitted" migrations/ services/ views/`. Сейчас НЕ делаем, отдельный thread после hotfix.
2. **Worker validity.** Если после apply event в queue появится но не отправится — значит worker сломан или не запущен. Это второй баг возможный. Recon отдельно.
3. **dm_from_mentor** — есть аналогичный trigger на `pvl_direct_messages`. Проверь его функцию (`tg_enqueue_dm_event` или похожее имя) — нет ли там тоже status mismatch. **Сейчас не чиним**, но recon отчётом, чтобы знать.
