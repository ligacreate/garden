# BUG-TG-TRIGGER-STATUS-MISMATCH — applied

**От:** codeexec (VS Code)
**Кому:** Ольга → стратегу
**Дата:** 2026-05-18
**В ответ на:** 🟢 от Ольги (вариант A, доверие на apply)
**Статус:** ✅ migration applied → ✅ post-verify OK → ⏳ ждёт push кода и natural smoke.

---

## Apply log

```
$ cat migrations/2026-05-18_phase34_tg_trigger_status_fix.sql | ssh ... psql ...

BEGIN
DO                             ← pre-assert: функция содержит старое 'submitted' ✓
CREATE FUNCTION                ← CREATE OR REPLACE tg_enqueue_homework_event
DO                             ← post-assert
NOTICE:  phase34: tg_enqueue_homework_event patched OK (in_review)
 ensure_garden_grants
----------------------
 (1 row)                       ← RUNBOOK 1.3 safety-net отработала
COMMIT
```

Post-apply verify через `pg_get_functiondef`:
```
IF NEW.to_status = 'in_review' THEN  -- BUG-TG-TRIGGER-STATUS-MISMATCH: было 'submitted' (несуществующий статус)
ELSIF NEW.to_status = 'accepted' THEN
ELSIF NEW.to_status = 'revision' THEN
```

Функция на проде ловит `'in_review'`. Триггер `trg_tg_enqueue_homework_event` уже привязан и enabled (`O`), вызов функции отрабатывает.

---

## Recon-correction (для протокола)

Первая версия _62 ошибочно заявила «триггеры отсутствуют». Причина — фильтр `WHERE tgname LIKE 'tg_%'`, который не ловит фактические имена `trg_tg_*`. Корректный фильтр через `tgrelid IN ('pvl_homework_status_history'::regclass, 'pvl_direct_messages'::regclass)` показал оба триггера ENABLED. Ольгин catch в чате.

Очередь сейчас пуста потому что до 17.05 ни одна студентка не привязала Telegram — функция упиралась в `IF v_recipient_tg IS NULL THEN RETURN NEW`. Ирина Петруня — первая привязанная (17.05 15:06). Это и есть «природный» нулевой baseline.

---

## SHA (заполнится после push)

См. `git log` после следующего коммита: `fix(pvl/tg): trigger ловит to_status='in_review' (BUG-TG-TRIGGER-STATUS-MISMATCH)`.

---

## Smoke (natural event, ждём)

1. **Ирина → Юля:** когда Ирина сдаст следующее ДЗ (новое или дополнение) → INSERT в `pvl_homework_status_history` с `to_status='in_review'` → trigger → enqueue → `tg_notifications_queue` пополнится записью `hw_submitted_new` или `hw_submitted_revision`.
2. **Юля принимает ДЗ Ирины:** `to_status='accepted'` → запись `hw_accepted` (получатель = Ирина, у неё TG привязан → push отправится).
3. **Юля просит доработать:** `to_status='revision'` → `hw_revision_requested`.
4. **Worker check:** garden-auth должен подхватить через ~15 сек, проставить `sent_at`. Если запись висит pending — отдельный recon.

Verify-запрос:
```sql
SELECT event_type, recipient_profile_id, scheduled_for, sent_at, last_error
  FROM tg_notifications_queue ORDER BY created_at DESC LIMIT 5;
```

---

## Rollback (если потребуется)

Точечно — re-apply миграции с `'in_review'` → `'submitted'` в одной строке (или просто откатить функцию обратной CREATE OR REPLACE). В транзакции с `ensure_garden_grants()`. Однострочный change, не страшно.

---

## Lesson — не пишем (по Ольгиному ответу)

Гипотеза про missing triggers опровергнута, инцидент чисто на уровне функции. Один сорт-баг (несинхронизированный status enum), не системный класс. Без lesson'а.
