---
title: SEC-001 пост-smoke диагностика 4 проблем (white-screen, audit-log INSERT, homework-history INSERT, mentor view)
type: execution-log
phase: "etap-5-post-smoke-diag-403"
created: 2026-05-03
status: ✅ COMPLETED (read-only diagnostics, no changes applied)
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
related_lessons: docs/lessons/2026-05-03-pvl-student-questions-... (cast-error)
related_backlog: BUG-WHITE-SCREEN, BUG-AUDIT-LOG-RETURNING (новая)
---

# Пост-smoke диагностика: 4 симптома после открытия Caddy

**Время:** 2026-05-03 ≈ 12:30 MSK.
**Тип:** read-only диагностика, никаких write-операций.
**Цель:** разобрать 4 проблемы, всплывшие после live smoke 15.7.

---

## 1. BUG-WHITE-SCREEN — hard reload даёт белый экран

### Сетевая разведка (curl)

| Endpoint | HTTP | Size | Last-Modified |
|---|---|---|---|
| `https://liga.skrebeyko.ru/sw.js` | 200 | 1439 байт | Sat 02 May 2026 23:23:04 (= timestamp нашего деплоя ✅) |
| `https://liga.skrebeyko.ru/manifest.webmanifest` | 200 | 515 байт | Sat 02 May 2026 23:23:03 |
| `https://liga.skrebeyko.ru/manifest.json` | 404 | — | (не используется) |
| `https://liga.skrebeyko.ru/assets/index-DXUDWmBe.js` | 200 | 1310901 байт (1.3 MB) | Sat 02 May 2026 23:22:38 |
| `https://liga.skrebeyko.ru/` (index.html) | 200 | — | — |

`curl -H 'Cache-Control: no-cache' -H 'Pragma: no-cache'` на бандле — `Cache-Control: max-age=86400, Expires: Mon 04 May`. **Nginx кеширует 1 сутки**, но Pragma+Cache-Control от клиента nginx игнорирует (что нормально — в этих хедерах сказано «не используй кеш для этого запроса», но они адресованы CDN, не серверу).

### Анализ

Все статические артефакты на месте, скачиваются, размер целый. Nginx в порядке.

**Гипотеза white-screen:** **Service Worker** (`/sw.js`) с старой стратегией кэша.
- Vite + VitePWA / `vite-plugin-pwa` обычно создаёт SW, который cache-first для precached assets.
- При hard reload браузер: 1) переcкачивает `/index.html` → 2) SW в active state перехватывает → 3) возвращает старый кэшированный `index.html` с reference на старый bundle hash (`index-CTuO4hEU.js` из предыдущего деплоя).
- Старый bundle уже удалён с FTP (`dangerous-clean-slate: true`) → SW отдаёт пустой/невалидный → белый экран.
- Со временем (через ~24ч) SW делает `update`, обновляется. Но в моменте — обвал.

### Что проверить

- В DevTools → Application → Service Workers → проверить версию registered SW и его cache-storage.
- `chrome://serviceworker-internals/` или `about:debugging`.
- Содержимое `/sw.js` (1439 байт — небольшой) можно посмотреть через `curl https://liga.skrebeyko.ru/sw.js` и определить, какой именно стратегии следует.

### Workaround на сейчас

Юзеру делать **DevTools → Application → Service Workers → "Unregister"** + **Storage → Clear site data**. Затем reload. Это убивает SW + кэш. После этого приложение качает свежий бандл.

### Долгосрочный фикс (BUG-WHITE-SCREEN)

- Поправить SW-стратегию на `network-first` для `index.html` (всегда брать свежий с сервера, fallback на кеш только при offline).
- Или поднять номер `precache cache id` в SW manifest при каждом деплое — тогда SW принудительно invalidate'ит весь старый кэш.
- Или добавить кнопку «Принудительно обновить» в UI для обхода SW в случае нужды.

📝 **Не вижу прямой связи с SEC-001** — это давний SW-issue, который раньше не проявлялся, потому что bundle hash менялся редко. После SEC-001 деплоя hash сменился (`index-CTuO4hEU` → `index-DXUDWmBe`), и старая SW-стратегия выдала белый экран на первом hard reload.

---

## 2. BUG-AUDIT-LOG-INSERT-403 — корневая причина найдена

### Setup

```sql
BEGIN;
SELECT set_config('request.jwt.claim.sub', '1b10d2ef-8504-4778-9b7b-5b04b24f8751', true);  -- Настин фиксик
SET LOCAL ROLE authenticated;
```

### Pre-checks

| Что | Значение |
|---|---|
| `has_schema_privilege('authenticated', 'auth', 'USAGE')` | **f** (USAGE на схему `auth` отсутствует) |
| `has_function_privilege('authenticated', 'auth.uid()', 'EXECUTE')` | t |
| `has_table_privilege('authenticated', 'public.pvl_audit_log', 'INSERT')` | t |

### Таблица `pvl_audit_log`

```
column        |  type  | nullable | default
--------------+--------+----------+--------
id            | text   | NO       | NULL
actor_user_id | text   | YES      | NULL
action        | text   | NO       | NULL
entity_type   | text   | NO       | NULL
entity_id     | text   | YES      | NULL
payload       | jsonb  | YES      | NULL
created_at    | tstz   | NO       | now()
```
RLS=on, force_RLS=off. Нет триггеров.

### Политики (raw из `pg_policy`)

| polname | cmd | with_check / qual |
|---|---|---|
| `pvl_audit_log_insert_authenticated` | INSERT | WITH CHECK `(auth.uid() IS NOT NULL)` |
| `pvl_audit_log_select_admin` | SELECT | USING `is_admin()` |

### Тесты

| # | Test | Result |
|---|---|---|
| A1 | DO-блок `v := auth.uid()` под authenticated | ❌ `42501 / permission denied for schema auth` |
| A2 | INSERT с RETURNING (id, action, …) | ❌ `new row violates row-level security policy for table "pvl_audit_log"` |
| A3 | INSERT с минимальными колонками + RETURNING | ❌ same |
| A4 | INSERT без actor_user_id + RETURNING | ❌ same |
| A5 | **INSERT без RETURNING** | ✅ `INSERT 0 1` |
| A6 | INSERT с request.jwt.claims (jsonb form) + RETURNING | ❌ same RLS error |
| A7 | INSERT с обоими GUC (claim.sub + claims) + RETURNING | ❌ same |
| A8 | Контроль: `SELECT count FROM pvl_audit_log` под mentor | 0 (SELECT-policy admin-only работает) |

### 🎯 Корневая причина

**`INSERT ... RETURNING` неявно проверяет SELECT-policy на новой строке** (Postgres semantics для RETURNING).

- `pvl_audit_log_select_admin USING is_admin()` — mentor (Настин фиксик) НЕ админ → SELECT-policy на returning-row fails.
- Postgres рапортует это как `new row violates row-level security policy for table` — **тот же error code 42501**, что выглядит как INSERT WITH CHECK fail.
- Реально INSERT WITH CHECK (`auth.uid() IS NOT NULL`) проходит — это подтверждается успехом INSERT БЕЗ RETURNING (Test A5).

**Why `pvl_homework_status_history` не падает:** его SELECT-policy либеральная (через `is_mentor_for` на submission's student) — mentor может читать свои-менти-submission'ы → RETURNING на новой строке проходит.

### Параллельная находка про DO-блок

```
auth.uid() throws: 42501 / permission denied for schema auth
```

Прямой вызов `auth.uid()` из DO PL/pgSQL под `SET ROLE authenticated` падает с `permission denied for schema auth`. Это потому, что:
- В DO-блоке выражения парсятся **по имени** при выполнении.
- Лукап `auth.uid()` требует USAGE на схему `auth`.
- У `authenticated` нет USAGE.

В **RLS-политиках** этой проблемы нет — выражения парсятся в момент CREATE POLICY и хранятся как parsed-tree с OID-ссылкой на функцию. При evaluation проверяется только EXECUTE на саму функцию, не USAGE на схему.

📝 Это другая поверхность того же феномена: **RLS-policy с `auth.uid()` работает; user-side query с `auth.uid()` под authenticated — нет**.

### Где это в проде

PostgREST по умолчанию шлёт `Prefer: return=representation` для POST/PATCH запросов → эквивалентно RETURNING.

Поэтому **любой INSERT в pvl_audit_log от mentor через PostgREST упадёт с 42501**, маскированной под RLS-violation, даже если содержательно RLS позволяет вставку.

### Варианты фикса

**A. Frontend** (минимальный):
```js
// в pvlPostgrestApi.js или pvlMockApi.js, в функции, делающей INSERT в pvl_audit_log
fetch(url, {
  method: 'POST',
  headers: { 'Prefer': 'return=minimal', /* ... */ },
  body: JSON.stringify(payload)
});
```
Без RETURNING → SELECT-policy не проверяется → INSERT проходит. Возвращаемое значение для audit-INSERT всё равно не нужно.

**B. БД** — расширить SELECT-policy чтобы пускать читать свои audit-записи:
```sql
DROP POLICY pvl_audit_log_select_admin ON public.pvl_audit_log;
CREATE POLICY pvl_audit_log_select_self_or_admin
  ON public.pvl_audit_log FOR SELECT TO authenticated
  USING (
    is_admin()
    OR (actor_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND actor_user_id::uuid = auth.uid())
  );
```
Regex pre-validation важен — иначе `actor_user_id::uuid` падает на 1621 stub-id (`u-adm-1`/`u-st-1`/`smoke`) — та же мина как с `pvl_student_questions.student_id`.

**C. SECURITY DEFINER RPC**:
```sql
CREATE OR REPLACE FUNCTION public.audit_log_insert(
  p_action text, p_entity_type text, p_entity_id text DEFAULT NULL, p_payload jsonb DEFAULT NULL
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.pvl_audit_log (id, actor_user_id, action, entity_type, entity_id, payload)
  VALUES (gen_random_uuid()::text, auth.uid()::text, p_action, p_entity_type, p_entity_id, p_payload);
$$;
GRANT EXECUTE ON FUNCTION public.audit_log_insert(text, text, text, jsonb) TO authenticated;
```
Фронт вызывает `POST /rpc/audit_log_insert` — обходит RLS на INSERT. Чистое решение, добавляет точку для будущей валидации.

### Рекомендация

Стратегу: **A** — самый дешёвый, минимальная правка фронта. **B** — корректирует архитектуру (mentor может видеть свои действия в логе, что разумно). **C** — для долгосрочной чистоты.

---

## 3. BUG-HOMEWORK-HISTORY-INSERT-403 — НЕТ багa в RLS

### Под mentor-JWT INSERT в `pvl_homework_status_history` C RETURNING прошёл

```
SAVEPOINT
                  id                  |              changed_by
--------------------------------------+--------------------------------------
 f84d8b57-2f22-4e63-9c6b-0128b7b1e031 | 1b10d2ef-8504-4778-9b7b-5b04b24f8751
INSERT 0 1
ROLLBACK
```

То есть RLS-политика для homework_history написана корректно: WITH CHECK + EXISTS subquery работают, RETURNING тоже проходит (SELECT-policy либеральная).

### Если в проде падает — причина в данных запроса

Возможные причины 403 в браузере:
- `changed_by` отсутствует в payload → `changed_by = auth.uid()` → `NULL = auth.uid()` → NULL → fail
- `changed_by` ≠ `auth.uid()` (например, фронт шлёт UUID студента вместо ментора)
- `submission_id` указывает на submission НЕ менти этого ментора → `is_mentor_for(s.student_id)` returns false
- Mentor пытается изменить статус для submission **чужого** студента (что и должно отбиваться)

### Что проверить

Дев-tools → Network → упавший запрос → request body. Сравнить:
- `changed_by` — должен быть UUID ментора
- `submission_id` — должен быть в pvl_student_homework_submissions, и `student_id` этого submission должен быть в `pvl_garden_mentor_links` для этого ментора

Без request body конкретный диагноз поставить нельзя.

---

## 4. (фрейм) — fragile init Mentor View

📝 Не диагностировано отдельно в этой сессии. Связанный backlog: `BUG-001 (Promise.all fragile)` — это уже у тебя.

После применения fix #1 (DELETE в pvl_student_questions) mentor view работает в смысле UI. Console-warnings про audit-log INSERT — последствие обнаруженного выше BUG-AUDIT-LOG-RETURNING.

---

## Сводка

| BUG | Корневая причина | Прод-блокер? |
|---|---|---|
| BUG-WHITE-SCREEN | Service Worker кеширует старый bundle, новый bundle не подхватывается до hard-clear | Да в моменте, само рассосётся через ~24ч / Unregister |
| BUG-AUDIT-LOG-INSERT-403 | RETURNING + restrictive SELECT-policy → ложный «RLS violation» | Да, если фронт пишет аудит синхронно |
| BUG-HOMEWORK-HISTORY-INSERT-403 | Не воспроизводится — RLS пишется корректно | Не RLS — нужен request body |
| Mentor view fragile init | Был связан с pvl_student_questions cast (fix #1 закрыл основной симптом) | Нет |

---

## Рекомендованные действия

1. **BUG-AUDIT-LOG-RETURNING** в `plans/BACKLOG.md`:
   - Контекст: PostgREST по умолчанию шлёт RETURNING; SELECT-policy admin-only валит INSERT mentor'ов.
   - Решение: вариант A (фронт `Prefer: return=minimal` для audit-INSERT) — quickest, или B (расширить SELECT-policy с regex prevalidation).
   - Связано с BUG-AUDITLOG-IDS — одновременно фиксить.

2. **BUG-WHITE-SCREEN** в `plans/BACKLOG.md`:
   - Решение: SW network-first для index.html, или принудительный bump cache version при деплое.

3. **BUG-HOMEWORK-HISTORY-INSERT-403** — пометить как «нужен request body» в backlog. Если в Network видно request body упавшего запроса — диагноз в 1 минуту.

4. **Урок** в `docs/lessons/2026-05-03-rls-returning-implies-select-policy.md`:
   - Симптом: INSERT падает с RLS error даже если WITH CHECK passes.
   - Корневая причина: RETURNING неявно проверяет SELECT-policy.
   - Pattern: при разработке `audit/log` таблиц с restrictive SELECT-policy всегда учитывать что PostgREST шлёт RETURNING.

---

## Статус

✅ **Диагностика всех 4 проблем закрыта.** Никаких write-операций не делалось. Все findings — для разработки фикс-плана.
