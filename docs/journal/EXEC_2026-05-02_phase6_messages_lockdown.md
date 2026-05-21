---
title: SEC-001 Phase 6 — messages: RLS-on lockdown (execution log)
type: execution-log
phase: 6
created: 2026-05-02
status: ✅ COMMITTED (упрощённая версия — без DELETE)
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
prev_phase: docs/EXEC_2026-05-02_phase5_archives_lockdown.md
---

# Phase 6 — `messages`: RLS-on без политик (execution log)

**Время выполнения:** 2026-05-02, ~21:25 MSK.
**Транзакция:** одна, `BEGIN; … COMMIT;` — успешно (со второй попытки).
**Smoke:** прошёл.
**Результат:** ✅ `messages` под двойной защитой: RLS-on + REVOKE. 4 тестовые строки от 2026-03-17 **сохранены** (удаление отложено в CLEAN-010).

---

## Хронология

### Попытка 1 — упала на smoke #1 с `GET DIAGNOSTICS`

Исходный SQL-блок документа (с DELETE + smoke-проверкой через GET DIAGNOSTICS) не сработал:
```
DELETE FROM public.messages WHERE created_at::date = '2026-03-17';
DELETE 4                                                  ← реально удалено 4
DO $$ ... GET DIAGNOSTICS deleted_count = ROW_COUNT;
ERROR:  Expected to delete 4 test messages, deleted 0     ← внутри DO ROW_COUNT=0
ROLLBACK                                                  ← все 4 строки восстановлены
```

**Корень.** В Postgres `GET DIAGNOSTICS … = ROW_COUNT` внутри `DO`-блока возвращает количество строк последнего SQL внутри plpgsql-блока, а не внешнего DELETE. Smoke #1 был спроектирован неверно. Транзакция корректно откатилась, состояние БД не изменилось.

### Решение владельца

Удаление 4 строк не является обязательной частью защиты:
- RLS-on без политик блокирует под `web_anon`/`authenticated` независимо от наличия данных.
- 4 строки — буквально «Тестовое сообщение из БД», «Привет-привет», бизнес-смысла нет.

**Принято решение:** убрать DELETE и smoke #1 из фазы 6, фаза становится копией паттерна `users_auth`/архивов. Удаление 4 строк — отдельной задачей **CLEAN-010** в BACKLOG (низкий приоритет, делается одним SQL под gen_user в любой момент).

### Попытка 2 — упрощённый блок прошёл

Документ `MIGRATION_2026-05-02_security_restoration.md` обновлён (фаза 6 теперь без DELETE). Запуск упрощённого SQL — успех.

---

## SQL (актуальная упрощённая версия)

```sql
BEGIN;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.messages FROM PUBLIC;
REVOKE ALL ON public.messages FROM web_anon;
REVOKE ALL ON public.messages FROM authenticated;

-- Smoke: RLS включён, политик нет
DO $$
DECLARE rls_on bool; n_pols int;
BEGIN
  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid='public.messages'::regclass;
  IF NOT rls_on THEN RAISE EXCEPTION 'messages RLS not enabled'; END IF;
  SELECT count(*) INTO n_pols FROM pg_policies WHERE schemaname='public' AND tablename='messages';
  IF n_pols <> 0 THEN RAISE EXCEPTION 'messages: expected 0 policies, got %', n_pols; END IF;
END $$;

COMMIT;
```

---

## Сырой output psql (попытка 2 — успешная)

```
BEGIN;
BEGIN
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE
REVOKE ALL ON public.messages FROM PUBLIC;
REVOKE
REVOKE ALL ON public.messages FROM web_anon;
REVOKE
REVOKE ALL ON public.messages FROM authenticated;
REVOKE
DO $$ ... END $$;
DO
COMMIT;
COMMIT
```

---

## Верификации после COMMIT

### RLS-status и ACL

```
 relname  | rls_enabled |           relacl
----------+-------------+-----------------------------
 messages | t           | {gen_user=arwdDxt/gen_user}
```
✅ RLS включён, ACL только gen_user (web_anon/authenticated/PUBLIC отозваны).

### Политики

```
 n_policies
------------
          0
```
✅ 0 политик — дизайн «RLS-on без политик».

### Owner-bypass и сохранность данных

```
 messages_count
----------------
              4
```
✅ 4 тестовые строки на месте, gen_user их видит. Owner-bypass работает.

---

## Что изменилось в проде

**Было:** `messages` с RLS=off, 0 политик, 4 тестовые строки.

**Стало:** `messages` с RLS=on, 0 политик, 4 тестовые строки (без изменений).

### Эффект на роли

| Роль | До фазы 6 | После фазы 6 |
|---|---|---|
| `gen_user` (owner) | мог всё | **может всё** через owner-bypass |
| `postgres` (super) | мог всё | мог всё |
| `web_anon` | мог через PUBLIC | 0 строк / 403 |
| `authenticated` | мог через PUBLIC | 0 строк / 403 |

### Почему 4 строки оставлены

- RLS-on без политик защищает одинаково с строками или без них.
- Под `web_anon`/`authenticated` они невидимы (политик нет → 0 строк).
- Под `gen_user` они видимы — но фронт под `gen_user` не ходит, только бекенд.
- Удаление эстетическое, бизнес-эффекта 0.

### Realtime publication

`messages` остаётся в `supabase_realtime` publication (см. v3). Это legacy от Supabase, на безопасность не влияет — удалить отдельной задачей CLEAN-006.

---

## Уроки

### Урок 5: `GET DIAGNOSTICS … ROW_COUNT` внутри DO-блока не видит внешние SQL

В Postgres `GET DIAGNOSTICS … = ROW_COUNT` возвращает количество строк, обработанных **последней SQL-командой внутри текущего plpgsql-контекста**. Внешние SQL-команды (вне DO-блока) для него «невидимы».

**Чтобы smoke действительно проверял ROW_COUNT внешнего DELETE:** нужно перенести сам DELETE внутрь DO-блока:

```sql
DO $$
DECLARE deleted_count int;
BEGIN
  DELETE FROM ... WHERE ...;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count <> 4 THEN RAISE EXCEPTION ...; END IF;
END $$;
```

Зафиксирую этот паттерн на будущее. Сейчас — обошли проблему через упрощение фазы.

---

## Статус

**✅ ФАЗА 6 ЗАКРЫТА.** `messages` защищён RLS-on + REVOKE. 4 тестовые строки сохранены (CLEAN-010 в backlog).

## Следующий шаг

**Жду подтверждения «идём в фазу 7»** — `push_subscriptions`: RLS-on без политик + REVOKE (тот же паттерн, 0 строк в таблице).
