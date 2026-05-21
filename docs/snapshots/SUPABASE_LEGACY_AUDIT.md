---
title: Supabase Legacy Audit
date: 2026-05-02
status: confirmed (после curl-проверки)
---

# Supabase Legacy Audit

## Executive Summary

Миграция «прочь от Supabase» **в инфраструктуре завершена, в коде — нет**. По заголовкам HTTP подтверждено: за `api.skrebeyko.ru` стоит **самохостный PostgREST 14.5 за Caddy** (не Supabase REST), за `auth.skrebeyko.ru` — **Express-приложение** (не Supabase GoTrue). Significantly: **БД точно не Supabase**. Но кодовая база этого ещё не знает: 21 SQL-миграция написана под Supabase-builtins (`auth.uid()`, `storage.buckets`, роль `authenticated`), realtime-клиент `@supabase/supabase-js` всё ещё в `dependencies` и работает в чате через `VITE_SUPABASE_URL`. Главный системный риск — **RLS вероятно не работает совсем**: либо миграции с `auth.uid()` упали при наливке на голый Postgres (где этой функции нет), либо применены, но `postgrestFetch` ходит без `Authorization` ([dataService.js:22-23](../services/dataService.js#L22-L23): «keep PostgREST requests anonymous until auth-service/PostgREST JWT config is aligned»). Второй риск — **чат-realtime мёртв или зомби**: Supabase Realtime читает WAL только своей Postgres, а БД переехала.

## Подтверждение через curl (2026-05-02)

```
$ curl -sI https://api.skrebeyko.ru/
HTTP/2 200
server: postgrest/14.5
server: Caddy
content-type: application/openapi+json; charset=utf-8

$ curl -sI https://auth.skrebeyko.ru/auth/me
HTTP/2 401
x-powered-by: Express
server: Caddy

$ curl -s https://auth.skrebeyko.ru/health
{"ok":true}
```

Выводы:
- `api.skrebeyko.ru` → **PostgREST 14.5 self-hosted** за Caddy. OpenAPI-схема публична на `/` (200 OK без токена) — нормальное поведение PostgREST, но в связке с возможно отключённым RLS это карта таблиц для любого.
- `auth.skrebeyko.ru` → **Express** (`x-powered-by: Express`). НЕ Supabase GoTrue.
- Заголовков `sb-*`, `x-supabase-*` нет ни на одном хосте → Supabase в data-слое **полностью отсутствует**.

## Статистика

| Метрика | Значение |
|---|---|
| Файлов с упоминанием Supabase (исходники) | 7 (без `assets/` и `package-lock.json`) |
| LIVE-кода в рантайме | 1 модуль (`services/realtimeMessages.js`) + 1 потребитель (`views/CommunicationsView.jsx`) |
| DEAD-кода | 4 скрипта в `scripts/legacy/` + 2 билд-артефакта в `assets/` |
| MIXED-зон (опасных) | 3 (см. ниже: Auth+Realtime, Auth+PostgREST, Storage-контракты) |
| SQL-миграций в Supabase-стиле | 21 файл (все используют `auth.uid()` / `storage.buckets`) |
| Хардкод-fallback на prod-домены | `api.skrebeyko.ru`, `auth.skrebeyko.ru` (dataService.js, push-server/server.mjs) |
| `@supabase/*` пакетов в `dependencies` | 1 (`@supabase/supabase-js@^2.99.2`) |

## Карта зависимостей

| Файл | Категория | Статус | Что делает |
|---|---|---|---|
| [package.json:15](../package.json#L15) | 1. Зависимости | **LIVE** (нужен для realtime) | `@supabase/supabase-js@^2.99.2` |
| [package-lock.json](../package-lock.json) | 1. Зависимости | LIVE (транзитив `@supabase/*` под supabase-js) | — |
| [services/realtimeMessages.js](../services/realtimeMessages.js) | 2,3,5. Клиент + Auth + Realtime | **LIVE** | createClient, channel `messages-feed-*`, postgres_changes на `public.messages` |
| [views/CommunicationsView.jsx:5](../views/CommunicationsView.jsx#L5) | 5. Realtime потребитель | **LIVE** | `subscribeToMessages` на табе `chat` |
| [services/dataService.js:7-9](../services/dataService.js#L7-L9) | 1. Конфиг | ✅ MIGRATED | `VITE_POSTGREST_URL`/`VITE_AUTH_URL` → `*.skrebeyko.ru`. PostgREST-роуты остались, но это **самохостный PostgREST 14.5**, а не Supabase REST (подтверждено `server: postgrest/14.5`) |
| [services/dataService.js:22-23](../services/dataService.js#L22-L23) | 3. Auth ↔ DB | **MIXED (критично)** | Комментарий: «keep PostgREST requests anonymous until auth-service/PostgREST JWT config is aligned» — **Bearer-токен не передаётся на PostgREST** |
| [push-server/server.mjs:36](../push-server/server.mjs#L36) | 4. БД | LIVE (Timeweb Postgres) | Прямой `pg.Pool`. Так как `api.skrebeyko.ru` — PostgREST 14.5 self-hosted, `DATABASE_URL` указывает на ту же Timeweb Postgres |
| [push-server/server.mjs:315](../push-server/server.mjs#L315) | 3. Auth | LIVE (Timeweb) | `https://auth.skrebeyko.ru/auth/logout-all` — миграция Auth завершена на этом пути |
| [migrations/02..21](../migrations/) | 7. RLS / схема | 🔴 **БИТЫЕ для Timeweb-Postgres** | 21 файл; все используют `auth.uid()`, `storage.buckets`, `enable row level security`. На голом Postgres функция `auth.uid()` НЕ существует — DDL должен был упасть. Что реально применено на проде — нужен `select * from pg_policies` (см. раздел «SQL для проверки на БД» ниже) |
| [migrations/04_create_storage.sql](../migrations/04_create_storage.sql) | 6. Storage | 🔴 DEAD | Создаёт bucket в `storage.buckets` — это Supabase-схема, на Timeweb-Postgres такой таблицы нет, миграция упадёт при наливке. Современный flow — `/storage/sign` |
| [migrations/19_messages_update_delete_permissions.sql:13](../migrations/19_messages_update_delete_permissions.sql#L13) | 7. RLS | UNKNOWN | Сам файл признаёт двойственность: «Optional strict policies for Supabase-like setups where auth.uid() exists» |
| [scripts/legacy/migrate_meetings.js](../scripts/legacy/migrate_meetings.js) | 4,6. Скрипты | **DEAD** | См. [scripts/legacy/README.md](../scripts/legacy/README.md) — «archived utilities» |
| [scripts/legacy/migrate_questions_notebooks.js](../scripts/legacy/migrate_questions_notebooks.js) | 4,6. Скрипты | **DEAD** | То же |
| [scripts/legacy/dedupe_schedule_events.js](../scripts/legacy/dedupe_schedule_events.js) | 4. Скрипты | **DEAD** | То же |
| [scripts/legacy/update_event_images.js](../scripts/legacy/update_event_images.js) | 4,6. Скрипты | **DEAD** | То же |
| [assets/index-BcMREoGE.js](../assets/index-BcMREoGE.js) | 9. Билд-артефакт | DEAD | Старый Vite-билд; перегенерится при `npm run build`. **`.gitignore` не исключает `assets/`** — стоит проверить, нужны ли они в git |
| [assets/index-D-rk9tAk.js](../assets/index-D-rk9tAk.js) | 9. Билд-артефакт | DEAD | То же |
| [docs/PROJECT_PASSPORT.md](PROJECT_PASSPORT.md) | 9. Документация | OUT-OF-DATE | Описывает архитектуру как «Supabase + PostgREST», но раздел про Auth уже говорит про auth-service. Требует обновления |
| [docs/auth-service-handoff.md](auth-service-handoff.md) | 9. Документация | LIVE | Подтверждает: data layer — «PostgREST + RLS», auth вынесен в отдельный сервис |
| [CLAUDE.md](../CLAUDE.md) | 9. Документация | OUT-OF-DATE | Перечисляет «Supabase (PostgREST + Auth + Realtime + Storage)» как стек |

## Критические находки

### 1. 🔴 NEW (после curl): RLS-миграции писались под Supabase-builtins, которых на Timeweb-Postgres НЕТ
- **Где:** `migrations/05/08/16/17/19/21` — все используют `auth.uid()`, `to authenticated`, `storage.buckets`. См. [migrations/05_profiles_rls.sql:15](../migrations/05_profiles_rls.sql#L15), [migrations/21_billing_subscription_access.sql:149](../migrations/21_billing_subscription_access.sql#L149).
- **Что реально:** за `api.skrebeyko.ru` стоит **самохостный PostgREST 14.5** на чистом Postgres — у него нет встроенной функции `auth.uid()` и роли `authenticated`. Это Supabase-расширения (`auth` schema создаётся при инициализации Supabase-проекта).
- **Что значит:** при наливке миграций на Timeweb-Postgres есть три сценария:
  1. **Миграции упали** → RLS не применён → policies отсутствуют → запросы либо открыты для всех, либо закрыты `revoke`-дефолтом.
  2. **Кто-то вручную создал shim** (`create function auth.uid()` через `current_setting('request.jwt.claims', true)::json->>'sub'`) → RLS работает, но в репо этого DDL нет.
  3. **Применили частично, ошибки проигнорировали** → policies в неконсистентном состоянии.
- **Как проверить:** SQL-команды в разделе «SQL для проверки на БД» ниже.
- **Не путать с критич. находкой №2:** даже если `auth.uid()` существует, [postgrestFetch](../services/dataService.js#L18-L49) не передаёт Bearer-токен, и `auth.uid()` всё равно вернёт `null`. Это два независимых слоя поломки.

### 2. 🔴 LIVE+critical: PostgREST-запросы идут АНОНИМНО (нет `Authorization`)
- **Где:** [services/dataService.js:18-49](../services/dataService.js#L18-L49) (`postgrestFetch`)
- **Что:** функция **не добавляет `Authorization: Bearer <token>`**. Сам автор кода зафиксировал это в комментарии на :22-23: «Temporary fallback: keep PostgREST requests anonymous until auth-service/PostgREST JWT config is aligned.»
- **Последствие в связке с №1:**
  - если `auth.uid()` на БД **не существует** (DDL миграций упал) — RLS-policies нет, запросы фильтруются только grant-ами на роль `web_anon`/`anon`;
  - если `auth.uid()` существует (через shim `current_setting('request.jwt.claims')`) — на анонимном запросе он возвращает `null`, и `auth.uid() = id` → `false` → policies всё закрывают;
  - если grant-ы для `anon` дают `select`/`insert` без RLS — **доступ к таблицам открыт всем без авторизации** (это объясняет, почему фронт «работает» без Bearer).
- **Не путать с push-сервером:** [push-server/server.mjs](../push-server/server.mjs) ходит в Postgres напрямую через `pg.Pool` (минуя PostgREST/RLS) и сам решает доступ через `requireAdminToken`/`x-service-secret`. Это отдельный канал.

### 3. 🔴 Realtime — зомби: подписка на БД, в которой больше нет данных
- **Где:** [services/realtimeMessages.js](../services/realtimeMessages.js)
- **Что (после curl):** `api.skrebeyko.ru` — это **самохостный PostgREST 14.5**, БД переехала на Timeweb-Postgres. Supabase Realtime читает WAL **только своей** Postgres-инстанции. Значит:
  - если `VITE_SUPABASE_URL` указывает на старый Supabase-проект, который ещё жив — там сидят **замороженные сообщения** на момент миграции, а новые в Timeweb-Postgres до Supabase **не доходят** (двух-БД-сценарий, события молчат);
  - если `VITE_SUPABASE_URL` пустой → `getSupabaseClient()` возвращает `null`, `subscribeToMessages` отдаёт `null` без логов → подписки нет;
  - в обоих случаях [views/CommunicationsView.jsx:140](../views/CommunicationsView.jsx#L140) спасается `setInterval(loadMessages, CHAT_POLL_INTERVAL_MS)` — чат «работает» через polling, но обещание realtime не выполняется.
- **Дополнительно:** клиент шлёт в Supabase токен `garden_auth_token` (выдан Express-auth, НЕ Supabase JWT) через `client.realtime.setAuth(token)` — это в любом случае не валидный Supabase-JWT, `setAuth` молча провалится. `onError` колбэк в `subscribeToMessages({ onInsert, onUpdate, onDelete })` не передан → ошибка нигде не логируется.
- **Не путать с «менторы не видят ДЗ»:** ПВЛ-сабмишены НЕ ходят через realtime (см. [services/pvlMockApi.js](../services/pvlMockApi.js)) — это отдельная история. Realtime-критичен только для чата.

### 4. 🟡 MIXED: Storage — три контракта на один эндпоинт
- **Где:** [services/dataService.js:170-233](../services/dataService.js#L170-L233) (`resolveStorageSign`)
- **Что:** функция перебирает 4 формы payload (camelCase, snake_case, bucket/path, mixed legacy) × 2 пути (`/storage/sign`, `/api/storage/sign`) × 2 хоста (AUTH_URL, POSTGREST_URL) — итого до **16 запросов** на один upload. Это «защита от незнания» — никто не уверен, какой именно контракт принят сервером.
- **Последствие:** `migrations/04_create_storage.sql` создаёт Supabase Storage buckets — на Timeweb-Postgres схемы `storage` нет, миграция точно упала. Современный flow — собственный `/storage/sign`, бэкенд за ним нужно посмотреть отдельно (S3-compatible? собственный?).

### 5. 🟡 Хардкод-fallback на прод-домены (без `.env.example`)
- **Где:** [services/dataService.js:7-9](../services/dataService.js#L7-L9), [push-server/server.mjs:315](../push-server/server.mjs#L315)
- **Что:** если переменные окружения не выставлены, локальный dev-стенд **без видимого предупреждения** ходит в продакшен `api.skrebeyko.ru` / `auth.skrebeyko.ru`. Это и опасно (любая правка в dev лезет в прод-БД, если ключи угаданы), и маскирует ошибки.
- **`.env.example` отсутствует** (см. CLAUDE.md «Известные проблемы»).

### 6. 🟢 LIVE pkg, но используется крошечно
- `@supabase/supabase-js@^2.99.2` — единственный реальный потребитель — `realtimeMessages.js` (~60 строк). Учитывая находку №3 (realtime фактически мёртв), пакет можно **удалять без вреда** одновременно с переписыванием realtime на polling/SSE.

## Карта миграции

| Функция | Было в Supabase | Стало в Timeweb / своём | Статус миграции | Комментарий |
|---|---|---|---|---|
| **Auth (signin/refresh)** | `supabase.auth.signIn` / `getSession` | `auth.skrebeyko.ru` (custom auth-service) | ✅ MIGRATED | См. [docs/auth-service-handoff.md](auth-service-handoff.md). В коде нет ни одного вызова `supabase.auth.*` |
| **Auth (token storage)** | `sb-access-token` cookie | `localStorage['garden_auth_token']` | ✅ MIGRATED | Custom format, не Supabase JWT |
| **PostgREST endpoint** | `*.supabase.co/rest/v1/...` | `api.skrebeyko.ru/<table>?...` (PostgREST 14.5 self-hosted) | ✅ MIGRATED | Подтверждено `server: postgrest/14.5` в curl. URL и контракт PostgREST-style — это норма самого PostgREST, а не специфика Supabase |
| **PostgREST auth (JWT)** | Supabase JWT с `auth.uid()` claim | **никакой — анонимно** | 🔴 NOT MIGRATED | [dataService.js:22-23](../services/dataService.js#L22-L23): признано вслух. См. крит. находка №2 |
| **Postgres БД** | Supabase managed Postgres | **Timeweb-managed Postgres** | ✅ MIGRATED | Подтверждено: PostgREST стоит на чистом Postgres (см. crit. находка №1 — `auth.uid()` отсутствует) |
| **Realtime** | `supabase.channel().on('postgres_changes')` | то же самое — Supabase JS SDK | 🔴 NOT MIGRATED, **фактически мёртв** | [services/realtimeMessages.js](../services/realtimeMessages.js); зависит от `VITE_SUPABASE_URL`, который уже не привязан к боевой БД (см. крит. находка №3) |
| **Storage upload** | `supabase.storage.from(b).upload()` | `POST /storage/sign` (own/Timeweb) | ✅ MIGRATED | Шесть payload-вариантов в `resolveStorageSign` намекают, что контракт ещё уточняется |
| **Storage public URL** | `getPublicUrl(...)` | `publicUrl` из ответа `/storage/sign` | ✅ MIGRATED | См. выше |
| **Storage bucket DDL** | `migrations/04` создаёт `storage.buckets` | — (на Timeweb-Postgres схемы `storage` нет) | 🔴 DEAD MIGRATION | Миграция упала при наливке; флоу теперь полностью на бэке `/storage/sign` |
| **RLS / has_platform_access** | RLS-policies через `auth.uid()` | RLS на Timeweb-Postgres | ⚠️ ЛИБО НЕ ПРИМЕНЁН, ЛИБО ЧЕРЕЗ SHIM | DDL под Supabase-builtins на голом Postgres падает. Что реально живёт в проде — нужен `select count(*) from pg_policies` (см. ниже) |
| **Schema migrations** | `supabase db push` | вручную через SQL editor | ⚠️ NO RUNNER | Нет CI/migration runner — историю применений не отследить |
| **Push subscriptions storage** | таблица `push_subscriptions` через PostgREST | напрямую через `pg.Pool` в push-server | ✅ MIGRATED | Минует PostgREST и RLS |
| **Prodamus webhook** | Supabase Edge Function (?) | Express в push-server | ✅ MIGRATED | См. [push-server/server.mjs:390-391](../push-server/server.mjs#L390-L391) |
| **Email-шаблоны Auth** | Supabase шаблоны | в auth-service | ✅ MIGRATED (за пределами этого репо) | — |

## План очистки

### 1. Удалить немедленно (DEAD-код)
- [ ] `scripts/legacy/migrate_meetings.js`, `migrate_questions_notebooks.js`, `dedupe_schedule_events.js`, `update_event_images.js` — заархивированные миграционные скрипты, помеченные README. Если нужна история — оставить тег/PR-ссылку и удалить.
- [ ] `assets/index-BcMREoGE.js`, `assets/index-D-rk9tAk.js` (и `.css`, `index.es-*.js`) — старые билд-артефакты. Проверить, нужны ли они в git (обычно `dist/` и `assets/` не коммитятся; добавить в `.gitignore`).
- [ ] `migrations/04_create_storage.sql` — мёртвая миграция Supabase Storage; заменить README-заметкой о текущем стораджевом контракте `/storage/sign`, либо явно пометить «kept for reference only».

### 2. Срочно мигрировать (LIVE Supabase, есть пользователи)
- [ ] **Realtime для чата** — самый болезненный остаток. Варианты:
  - оставить Supabase Realtime отдельным standalone (тогда **починить токен**: либо PostgREST/Realtime принимают auth-service JWT, либо realtime ходит под `service_role` и фильтрация на клиенте);
  - перейти на SSE/WebSocket в push-server (он уже коннектится к Postgres, может слушать `LISTEN/NOTIFY` на `messages`);
  - убрать realtime, оставить polling, удалить `@supabase/supabase-js` целиком.
- [ ] **PostgREST + Bearer-токен** — починить «анонимные запросы». Согласовать формат JWT между `auth.skrebeyko.ru` и PostgREST: настроить `PGRST_JWT_SECRET`/`PGRST_JWT_AUD`, в `postgrestFetch` всегда передавать `Authorization`. Без этого RLS не работает — это потенциальная утечка данных.

### 3. SQL для проверки на БД
Команды ниже даём DBA / тому, у кого есть psql-доступ к Timeweb-Postgres за `api.skrebeyko.ru`. Каждый блок отвечает на конкретный вопрос аудита.

**3.1. Существует ли `auth.uid()` (от ответа зависят находки №1 и №2):**
```sql
-- Вернёт строку, если schema 'auth' и функция uid() созданы
select n.nspname as schema, p.proname as function, pg_get_function_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'auth' and p.proname = 'uid';
```
- Пусто → миграции с `auth.uid()` упали, RLS как описано не работает.
- Есть строка → надо посмотреть тело: `\df+ auth.uid` — обычно это shim через `current_setting('request.jwt.claims', true)::json->>'sub'`.

**3.2. Какие RLS-policies реально применены:**
```sql
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```
- Пусто или нет policies на `profiles/meetings/messages/course_progress` → RLS отсутствует.
- Есть → сравнить с миграциями 05/08/16/17/19/21.

**3.3. На каких таблицах RLS включён (ENABLED):**
```sql
select c.relname as table, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
```
- `rls_enabled = false` на таблицах с чувствительными данными — критично.

**3.4. Какие grant-ы у роли `web_anon` / `anon` (тот, под которым ходит безтокенный PostgREST):**
```sql
-- Имя анонимной роли смотрим в конфиге PostgREST: PGRST_DB_ANON_ROLE
-- По умолчанию web_anon. Если другая — подставить.
select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where grantee in ('web_anon', 'anon', 'authenticator')
  and table_schema = 'public'
order by grantee, table_name, privilege_type;
```
- Если есть `SELECT/INSERT/UPDATE/DELETE` без RLS — это и есть текущая «открытая дверь».

**3.5. Применена ли `has_platform_access()` (биллинг-блокировка):**
```sql
select proname, pg_get_function_result(oid) as returns
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname = 'has_platform_access';
```
- Пусто → биллинговая блокировка на уровне БД не работает; всё держится на UI/auth-service.

**3.6. Кто сейчас источник для bucket `event-images` (storage-схема):**
```sql
select schema_name from information_schema.schemata where schema_name = 'storage';
```
- Пусто → `migrations/04` точно мёртв; смотреть бэкенд за `/storage/sign` отдельно (S3/own).

**3.7. Что возвращает `VITE_SUPABASE_URL` (это уже не SQL, а проверка env/прода):**
```bash
# в ENV прод-фронтенда:
echo $VITE_SUPABASE_URL
# если пусто — realtime тихо отключён; если URL — пинговать /rest/v1/messages?limit=1
# и сравнить count с count в Timeweb-Postgres → если расходится, БД зомби-Supabase ≠ Timeweb
```

### 4. Оставить временно (совместимая прослойка)
- `@supabase/supabase-js` — пока realtime не переехал.
- PostgREST-style URL-конвенция — ломать её = переписывать половину `dataService.js`. Допустимо оставить как есть, если PostgREST реально стоит за `api.skrebeyko.ru`.
- Документацию ([CLAUDE.md](../CLAUDE.md), [docs/PROJECT_PASSPORT.md](PROJECT_PASSPORT.md)) — обновить **после** того, как пункты 2 и 3 закрыты, иначе документация снова разойдётся с кодом.

## Риски при удалении

1. **Удалить `@supabase/supabase-js` без замены realtime** → чат потеряет live-обновления (если они ещё работают). Сейчас деградирует до polling-а в `CommunicationsView`, поэтому удаление визуально «ничего не сломает», но user-experience просядет.
2. **Удалить `migrations/04_create_storage.sql`** → потеряем единственную инструкцию о структуре bucket-ов; если кто-то будет поднимать новый стенд, нужно знать имя бакета и политики.
3. **Удалить `scripts/legacy/`** → потеряем единственный воспроизводимый рецепт ETL из старого Supabase. Если есть шанс, что данные не до конца перенесены — сначала убедиться, что миграция данных закрыта.
4. **Поднять `Authorization` на `postgrestFetch` без подготовки** → если PostgREST не настроен на JWT auth-service, **все запросы начнут возвращать 401** и фронт перестанет работать целиком. Чинится только в связке: server PGRST_JWT_SECRET → клиент Authorization. Не делать в один PR.
5. **«Просто заменить `auth.uid()` на свою функцию» в RLS** — нужно учесть, что PostgREST подставляет JWT-claims в `current_setting('request.jwt.claims', true)::json`. Если auth-service кладёт `user_id` под другим ключом — в policies нужно `current_setting('request.jwt.claims', true)::json->>'sub'` или эквивалент.
6. **Удаление `VITE_SUPABASE_URL` из env-фолбэков** (если кто-то добавит) → realtime тихо отключится. Это уже текущее поведение, но при будущей миграции стоит сделать ошибку громкой (`throw` при отсутствии URL вместо `return null`).

---

*Аудит подготовлен: 2026-05-02. Источники: статический анализ репозитория + curl-проверка `api.skrebeyko.ru` и `auth.skrebeyko.ru` (заголовки + тело `/`). Большинство UNKNOWN-пунктов первой версии аудита переведены в CONFIRMED после curl. Оставшиеся вопросы (содержимое `pg_policies`, наличие `auth.uid()`, grant-ы `web_anon`) требуют SQL-доступа к Timeweb-Postgres — конкретные запросы приведены в разделе «SQL для проверки на БД».*
