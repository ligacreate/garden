---
title: SEC-001 Phase 13 — pvl_audit_log (шаблон E, write-once) (execution log)
type: execution-log
phase: 13
created: 2026-05-02
status: ✅ COMMITTED
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
prev_phase: docs/EXEC_2026-05-02_phase12_3_pvl_homework_status_history.md
---

# Phase 13 — `pvl_audit_log` (шаблон E, write-once) (execution log)

**Время выполнения:** 2026-05-02, ~23:15 MSK.
**Транзакция:** одна, `BEGIN; … COMMIT;` — успешно с первой попытки (через scp + `psql -f`).
**Smoke:** прошёл (n=2 политики).
**Результат:** ✅ `pvl_audit_log` под защитой шаблона E: SELECT только админ, INSERT всем authenticated, UPDATE/DELETE невозможны (без политик). Это последняя PVL-таблица в SEC-001.

---

## SQL

Точно как в [docs/MIGRATION_2026-05-02_security_restoration.md](MIGRATION_2026-05-02_security_restoration.md#фаза-13--шаблон-e-audit-log-1-таблица):

```sql
BEGIN;

ALTER TABLE public.pvl_audit_log ENABLE ROW LEVEL SECURITY;

-- SELECT: только админ
CREATE POLICY pvl_audit_log_select_admin
  ON public.pvl_audit_log FOR SELECT TO authenticated
  USING (is_admin());

-- INSERT: любой залогиненный
CREATE POLICY pvl_audit_log_insert_authenticated
  ON public.pvl_audit_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE/DELETE: запрещены (нет политик, RLS блокирует)

-- Smoke
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='pvl_audit_log';
  IF n <> 2 THEN RAISE EXCEPTION 'pvl_audit_log: expected 2 policies (select+insert), got %', n; END IF;
END $$;

COMMIT;
```

Запущен через `scp /tmp/phase13.sql + psql -f` (по уроку 16) — чтобы избежать возможных проблем с zsh-парсингом.

---

## Сырой output psql

```
BEGIN;
BEGIN
ALTER TABLE public.pvl_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE
CREATE POLICY pvl_audit_log_select_admin ...;
CREATE POLICY
CREATE POLICY pvl_audit_log_insert_authenticated ...;
CREATE POLICY
DO $$ ... END $$;
DO
COMMIT;
COMMIT
```

---

## Верификации после COMMIT

### (a) RLS включён

```
    relname    | rls_enabled
---------------+-------------
 pvl_audit_log | t
(1 row)
```

✅ `rls_enabled=t`.

### (b) Ровно 2 политики (без UPDATE/DELETE)

```
             policyname             |  cmd
------------------------------------+--------
 pvl_audit_log_insert_authenticated | INSERT
 pvl_audit_log_select_admin         | SELECT
(2 rows)
```

✅ Только SELECT и INSERT. UPDATE и DELETE отсутствуют — write-once.

### (c) Тела политик

```
             policyname             |    qual    |        with_check
------------------------------------+------------+--------------------------
 pvl_audit_log_insert_authenticated |            | (auth.uid() IS NOT NULL)
 pvl_audit_log_select_admin         | is_admin() |
(2 rows)
```

✅
- `select_admin`: `qual = is_admin()` — только админы могут читать.
- `insert_authenticated`: `with_check = (auth.uid() IS NOT NULL)` — любой залогиненный может писать.

### (d) Owner-bypass: 2204 строки

```
 audit_log_count
-----------------
            2204
(1 row)
```

✅ 2204 записи (как в v3). Owner-bypass работает.

---

## Что изменилось в проде

**Было:** `pvl_audit_log` с RLS=off, 0 политик, 2204 строки.

**Стало:** RLS=on, **2 политики** (write-once: SELECT admin, INSERT all), 2204 строки.

### Логика политик

```
SELECT: USING (is_admin())                        ← только админ
INSERT: WITH CHECK (auth.uid() IS NOT NULL)       ← любой залогиненный
UPDATE: ❌ нет политики → RLS блокирует
DELETE: ❌ нет политики → RLS блокирует
```

### Эффект на роли

| Роль | SELECT | INSERT | UPDATE | DELETE |
|---|:---:|:---:|:---:|:---:|
| Любой `authenticated` | ✗ | ✓ создаёт audit-запись | ✗ | ✗ |
| Админ | ✓ читает все 2204 | ✓ | ✗ | ✗ |
| `gen_user` | ✓ owner-bypass | ✓ | ✓ | ✓ |
| `web_anon` | ✗ | ✗ | ✗ | ✗ |

### Эффект на бекенд / фронт

- **Фронт:** `pvlPostgrestApi.createAuditLog()` (см. [services/pvlPostgrestApi.js:355](../services/pvlPostgrestApi.js#L355)) делает только INSERT — продолжит работать для любого залогиненного.
- **Админ-панель:** при показе журнала действий админу — SELECT через `is_admin()` пройдёт.
- **Студент / ментор:** не может читать audit-журнал (по дизайну). Если в каком-то UI студента есть «история моих действий» — этот экран сломается. Возможно потребуется отдельная политика «свои audit-записи через `actor_user_id = auth.uid()::text`», но это вне scope SEC-001.

---

## Все 5 шаблонов A/B/C/D/E применены — итог

| Шаблон | Назначение | Таблиц | Политик | Особенности |
|---|---|:---:|:---:|---|
| **A** | Контент курса (read-all + write-admin) | 8 | 32 | Через DO FOREACH |
| **B** | Свои данные ученика (own/mentor/admin) | 9 | 36 | UUID×7, TEXT×1, JOIN×1 |
| **C** | Реестр PVL (студенты, связки, менторы) | 3 | 12 | + правка 2 для pvl_mentors → A |
| **D** | Личные сообщения и нотификации | 3 | 10 | append-only для history |
| **E** | Audit log | 1 | 2 | write-once, без UPDATE/DELETE |
| **Итого** | | **24** | **92** | |

Плюс 6 «не-PVL» таблиц (фазы 1, 2, 4–8): `profiles` (4 политики после чистки), `knowledge_base` (5), `birthday_templates` (4), 4 lockdown без политик.

---

## Промежуточный итог по миграции

| Фаза | Что | Защищено таблиц | Политик |
|---|---|:---:|:---:|
| 1 | profiles cleanup | (без изменений) | -10, итого 4 |
| 2 | knowledge_base hardcoded → role | (без изменений) | +2, итого 5 |
| 3 | is_mentor_for(uuid) | (функция) | — |
| 4 | users_auth lockdown | +1 | 0 |
| 5 | to_archive + events_archive | +2 | 0 |
| 6 | messages | +1 | 0 |
| 7 | push_subscriptions | +1 | 0 |
| 8 | birthday_templates | +1 | +4 |
| 9 | PVL шаблон A (8 таблиц) | +8 | +32 |
| 10.1–10.3 | PVL шаблон B (9 таблиц) | +7 (+2 уже on) | +36 |
| 11.1–11.3 | PVL шаблон C (3 таблицы) | +3 | +12 |
| 12.1–12.3 | PVL шаблон D (3 таблицы) | +3 | +10 |
| **13** | **PVL шаблон E (1 таблица)** | **+1** | **+2** |
| **Итого 13 фаз** | | **28 таблиц под RLS** | **+90, -10** |

---

## Что осталось

- **Фаза 14** — Grants (USAGE/SELECT/INSERT/UPDATE/DELETE по матрице).
- **Smoke-тесты** (раздел 15 документа MIGRATION) — read-only финальная верификация.
- **Чек-лист после миграции:**
  - [ ] `REVOKE CREATE ON SCHEMA public FROM gen_user;` (было выдано в фазе 3)
  - [ ] **Не открывать** Timeweb web-форму «Привилегии gen_user»
  - [ ] **DELETE 4 тестовых сообщений в `messages`** — CLEAN-010 (отложено)
  - [ ] **Восстановить `migrations/05_profiles_rls.sql`** — CLEAN-009

---

## Статус

**✅ ФАЗА 13 ЗАКРЫТА. Все CREATE POLICY миграции SEC-001 применены.** Защищено 28 таблиц.

## Следующий шаг

**Жду подтверждения «идём в фазу 14»** — Grants. Это последняя фаза с изменениями: USAGE на схему `public` для `web_anon`/`authenticated`, SELECT на все таблицы для `authenticated` + точечный REVOKE на закрытые, INSERT/UPDATE/DELETE точечно по списку, USAGE+SELECT на sequences.

После фазы 14 — раздел 15 (smoke-тесты).
