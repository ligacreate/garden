---
title: "INSERT ... RETURNING неявно проверяет SELECT-policy на новой строке"
type: lesson
date: 2026-05-03
related:
  - docs/EXEC_2026-05-03_post_smoke_diag_403_inserts.md
  - docs/EXEC_2026-05-03_post_smoke_browser_full.md
  - docs/MIGRATION_2026-05-02_security_restoration.md (фаза 13 — pvl_audit_log)
  - plans/BACKLOG.md (BUG-005)
---

# Урок: `INSERT ... RETURNING` неявно проверяет SELECT-policy на новой строке

## Симптом

После открытия Caddy в SEC-001, при smoke-тесте через Claude in Chrome (2026-05-03):

Под mentor-логином в браузере — `POST /pvl_audit_log` возвращает **403** с сообщением `new row violates row-level security policy for table "pvl_audit_log"`. Это выглядит как обычный INSERT WITH CHECK fail.

Но при ручной проверке через psql под симулированным mentor-uid (`SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub TO ...`):

```sql
INSERT INTO public.pvl_audit_log (id, actor_user_id, action, ...) VALUES (...);
-- INSERT 0 1   ← успех! Без RETURNING.
```

То же самое с `RETURNING *`:

```sql
INSERT INTO public.pvl_audit_log (id, actor_user_id, action, ...) VALUES (...) RETURNING *;
-- ERROR: new row violates row-level security policy for table "pvl_audit_log"
```

То есть **INSERT WITH CHECK прошёл** (`auth.uid() IS NOT NULL` истинно), но **RETURNING упал** на SELECT-policy `is_admin()` (mentor не админ).

## Корневая причина

В PostgreSQL, когда `INSERT` имеет `RETURNING`-clause, движок:

1. Применяет `WITH CHECK` (INSERT-policy) к candidate row.
2. Если прошло — вставляет строку в таблицу.
3. **Применяет `USING` (SELECT-policy) к вставленной строке** — это нужно, чтобы определить, можно ли её отдать клиенту через RETURNING.
4. Если SELECT-policy не пускает — **выкидывает ошибку**, INSERT откатывается транзакцией.

Сообщение об ошибке **выглядит как INSERT-rejection** (`new row violates row-level security policy`), хотя реально упала RETURNING-фаза.

PostgREST по умолчанию использует **`Prefer: return=representation`** — это значит, на каждый INSERT/UPDATE он добавляет `RETURNING *` в SQL. Поэтому **любой INSERT через PostgREST неявно требует SELECT-permission** для строки, которую только что вставил.

Это документировано в [PostgREST docs](https://docs.postgrest.org/en/latest/references/preferences.html#prefer-return), но контр-интуитивно при разработке.

## Почему пропустили

Когда я (стратег) писала шаблон E для `pvl_audit_log` в фазе 13 SEC-001:

```sql
-- SELECT: только админ читает audit-log
CREATE POLICY pvl_audit_log_select_admin
  ON public.pvl_audit_log FOR SELECT TO authenticated
  USING (is_admin());

-- INSERT: любой залогиненный пишет (audit-trail должен быть полным)
CREATE POLICY pvl_audit_log_insert_authenticated
  ON public.pvl_audit_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
```

Логика казалась чистой: «писать может любой, читать — только админ». Это write-once-by-anyone audit-trail.

Я не учла:
1. **Что PostgREST шлёт `Prefer: return=representation` по умолчанию.** Эта деталь implementation, не RLS-design.
2. **Что INSERT с RETURNING проверяет SELECT-policy.** Это малоизвестный нюанс Postgres, которому я не уделила внимания при проектировании.

В смок-тестах фазы 15 этот сценарий не сработал, потому что мы делали SET ROLE authenticated без RETURNING, и проверяли только SELECT count(*) — INSERT не тестировали под non-admin.

## Как починили

**Принят Вариант A — фронт-патч `Prefer: return=minimal` для INSERT в `pvl_audit_log`.**

В `services/pvlMockApi.js` (или `services/pvlPostgrestApi.js`) — где формируется INSERT для audit-log — добавить header:

```js
// Было (неявно):
fetch('/pvl_audit_log', {
  method: 'POST',
  headers: {...},  // PostgREST шлёт по умолчанию Prefer: return=representation
  body: JSON.stringify(record)
});

// Стало:
fetch('/pvl_audit_log', {
  method: 'POST',
  headers: {
    ...,
    'Prefer': 'return=minimal'   // ← не запрашиваем RETURNING
  },
  body: JSON.stringify(record)
});
```

Эффект:
- INSERT выполняется
- PostgREST не делает RETURNING
- SELECT-policy не задействуется
- Ответ — 201 Created без тела
- INSERT-policy `auth.uid() IS NOT NULL` — единственная проверка

Threat model `pvl_audit_log` сохраняется: «писать может любой залогиненный, читать — только админ». Это compliance-correct для audit-trail.

**Альтернативы, которые мы не выбрали:**

- **B — расширить SELECT-policy на pvl_audit_log до own-or-admin.** Сделало бы audit-log читаемым любому пользователю для своих записей. Меняет threat model — compliance-неоднозначно. Не выбрали.
- **C — SECURITY DEFINER RPC `log_audit(...)`.** Wrap INSERT в функцию-владельца, обходящую RLS. Overengineering для одной таблицы.

## Что проверить в будущем

**При проектировании RLS под PostgREST:**

1. **Помни про `Prefer: return=representation` по умолчанию.** Любой INSERT/UPDATE через PostgREST неявно требует, чтобы только что вставленная/обновлённая строка проходила SELECT-policy. Если SELECT-policy строже, чем INSERT-policy — будет 403.

2. **Тестируй INSERT под non-admin с RETURNING явно.** В smoke-тестах не достаточно `SET ROLE authenticated; SELECT count(*)`. Нужно реальный INSERT с RETURNING:
   ```sql
   BEGIN;
   SET LOCAL ROLE authenticated;
   SET LOCAL request.jwt.claim.sub TO '<non_admin_uid>';
   INSERT INTO <table> (...) VALUES (...) RETURNING *;
   ROLLBACK;
   ```
   Если падает — SELECT-policy слишком строгая для такого паттерна.

3. **Для write-only audit-таблиц — два пути:**
   - **Frontend:** `Prefer: return=minimal` на client.
   - **DB:** добавить отдельную SELECT-policy «can read own row only»: `USING (actor_user_id = auth.uid()::text OR is_admin())`. Менее строгая, но всё ещё прячет чужие записи.

4. **Документируй в комментарии политики** про этот нюанс:
   ```sql
   -- ⚠ INSERT через PostgREST по умолчанию делает RETURNING.
   -- SELECT-policy ниже должна пускать как минимум собственные строки автора,
   -- иначе INSERT упадёт с "new row violates row-level security policy"
   -- (это RETURNING-фаза, не INSERT WITH CHECK).
   ```

## Связь с другими уроками

- [2026-05-03-rls-insert-on-conflict-checks-insert-with-check](2026-05-03-rls-insert-on-conflict-checks-insert-with-check.md) — `INSERT ... ON CONFLICT DO UPDATE` всегда проверяет INSERT WITH CHECK, даже на существующих строках. Тоже про неинтуитивные RLS-граничные случаи в Postgres.
- [2026-05-03-pvl-student-questions-bad-uuid-rls-error-propagation](2026-05-03-pvl-student-questions-bad-uuid-rls-error-propagation.md) — cast в RLS-предикате роняет весь запрос, не «фильтрует тихо». Тоже про error propagation.

Три урока за одну ночь — RLS под PostgREST требует знания тонкостей Postgres-семантики, которые не очевидны при первом проектировании политик.
