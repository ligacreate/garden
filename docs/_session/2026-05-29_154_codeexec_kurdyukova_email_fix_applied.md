# Apply 2026-05-29 — email-fix Курдюковой (`курдюкова` → `puhlick2004@mail.ru`)

**Адресат:** Ольга (связной) → стратег.
**Автор:** VS Code Claude Code (codeexec).
**Дата:** 2026-05-29.
**Тип:** apply (UPDATE), атомарно в одной транзакции.
**Авторизация:** 🟢 от стратега в ТЗ сессии _154. Курдюкова предупреждена (логин после apply — по `puhlick2004@mail.ru`, пароль тот же).
**Предыдущий контекст:** диагностика _153 (Track C, mentee-blind отзыва) — email side-finding оттуда. Email-fix НЕ чинит Track C (это frontend-bug), это отдельная гигиена.

---

## TL;DR

- ✅ `UPDATE 1` на `profiles` (5aa62776-…).
- ✅ `UPDATE 1` на `users_auth` (5aa62776-…).
- ✅ Post-check (in-transaction): обе таблицы → `puhlick2004@mail.ru`.
- ✅ UNIQUE sanity: 1 строка с новым email (она).
- ✅ COMMIT timestamp: **2026-05-29 16:45:30.009028+03**.
- ✅ Post-COMMIT verify: обе таблицы → `puhlick2004@mail.ru`.

`ensure_garden_grants()` safety-pass — **не вызывал**, это row-update (не DDL/schema change), grants не затрагиваются. NOTIFY pgrst тоже не нужен.

---

## SQL — план, факт, результаты

### 1. Pre-check

```sql
SELECT 'profiles' AS tbl, id, email FROM profiles
WHERE id = '5aa62776-6229-4270-9886-33316ff035c6'
UNION ALL
SELECT 'users_auth' AS tbl, id, email FROM users_auth
WHERE id = '5aa62776-6229-4270-9886-33316ff035c6';
```

| tbl | id | email |
|---|---|---|
| profiles | `5aa62776-…` | `курдюкова` |
| users_auth | `5aa62776-…` | `курдюкова` |

✅ Обе с placeholder'ом, ожидаемо. Параллельных правок не было.

### 2. UPDATE profiles

```sql
UPDATE profiles
SET email = 'puhlick2004@mail.ru'
WHERE id = '5aa62776-6229-4270-9886-33316ff035c6'
  AND email = 'курдюкова';
```

Результат: **`UPDATE 1`** ✅

### 3. UPDATE users_auth (login-критичная)

```sql
UPDATE users_auth
SET email = 'puhlick2004@mail.ru'
WHERE id = '5aa62776-6229-4270-9886-33316ff035c6'
  AND email = 'курдюкова';
```

Результат: **`UPDATE 1`** ✅ UNIQUE-constraint `users_auth_email_key` не нарушен (свободность подтверждена в _153 recon).

### 4. Post-check (внутри транзакции)

| tbl | id | email |
|---|---|---|
| profiles | `5aa62776-…` | `puhlick2004@mail.ru` |
| users_auth | `5aa62776-…` | `puhlick2004@mail.ru` |

✅ Consistent. Обе таблицы синхронно обновлены.

### 5. UNIQUE sanity

```sql
SELECT count(*) FROM users_auth WHERE email = 'puhlick2004@mail.ru';
```

→ `1` ✅ только она.

### 6. COMMIT

Timestamp: `2026-05-29 16:45:30.009028+03` (Moscow time).

### 7. Final verify (вне транзакции)

| tbl | id | email |
|---|---|---|
| profiles | `5aa62776-…` | `puhlick2004@mail.ru` |
| users_auth | `5aa62776-…` | `puhlick2004@mail.ru` |

✅ Зафиксировано в БД.

---

## Что теперь может Курдюкова

| Действие | До | После |
|---|---|---|
| Логин в поле «email» | вводила `курдюкова` | вводит `puhlick2004@mail.ru` |
| Пароль | прежний (bcrypt hash не менялся, привязан к id) | прежний |
| Password recovery | reset-link слался в никуда | пойдёт на `puhlick2004@mail.ru` |
| Email-уведомления | в никуда | на `puhlick2004@mail.ru` |
| Push-уведомления | работают (по uuid) | работают (по uuid) |
| Track C — видимость отзыва | НЕ работает | **по-прежнему НЕ работает** (frontend-bug, см. `_153`) |

---

## Реверс-команда (если что)

```sql
BEGIN;
UPDATE profiles
SET email = 'курдюкова'
WHERE id = '5aa62776-6229-4270-9886-33316ff035c6'
  AND email = 'puhlick2004@mail.ru';

UPDATE users_auth
SET email = 'курдюкова'
WHERE id = '5aa62776-6229-4270-9886-33316ff035c6'
  AND email = 'puhlick2004@mail.ru';

-- проверка
SELECT 'profiles' AS tbl, id, email FROM profiles WHERE id = '5aa62776-6229-4270-9886-33316ff035c6'
UNION ALL
SELECT 'users_auth' AS tbl, id, email FROM users_auth WHERE id = '5aa62776-6229-4270-9886-33316ff035c6';

COMMIT;
```

Использовать **только** если Курдюкова не смогла залогиниться по новому email И стратег явно подтвердил роллбек. Иначе — отдельная сессия с диагнозом «почему не пускает» (например, password_hash повреждён, status != 'active', etc).

---

## Backlog: AUTH-VALIDATION-HARDENING (P3, future)

Добавлено отдельным тикетом в `plans/BACKLOG.md` (P3 секция). Краткое содержание:

1. **Frontend** (auth.skrebeyko.ru, форма регистрации): `<input type="email" required>` + JS regex-валидация на blur и submit.
2. **Backend** (auth-сервис): server-side regex `^[^@\s]+@[^@\s]+\.[^@\s]+$` перед INSERT в users_auth → 400 если не проходит.
3. **БД** (`users_auth.email`): CHECK-constraint:
   ```sql
   ALTER TABLE users_auth
   ADD CONSTRAINT users_auth_email_shape_check
   CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
   ```
   Применять только **после** apply этого тикета (иначе CHECK не пройдёт на исторических данных — у Курдюковой был placeholder).

Аргументация:
- Этот случай — индивидуальный, не паттерн (1 из 60 юзеров).
- Не блокер прода, recovery flow для остальных работает.
- Но если повторится — снова админский ручной fix. Лучше системно.
- P3 = «хотелось бы, но не срочно». Можно объединить с AUTH-form aughit, если будет соседний тикет.

---

## Что я НЕ делал

- ⛔ Не менял password_hash (логин остаётся с прежним паролем).
- ⛔ Не трогал `telegram_user_id`, `telegram_linked_at` и прочую TG-привязку.
- ⛔ Не делал deploy / NOTIFY / restart — это row-update, кеши не нужно прогревать.
- ⛔ Не применял CHECK-constraint (это для отдельного тикета AUTH-VALIDATION-HARDENING).
- ⛔ Не отправлял Курдюковой никаких уведомлений (это Ольга-связной).
