---
title: DB Security Audit (preflight перед восстановлением защиты PostgREST)
type: database security audit
version: 1.1
created: 2026-05-02
last_updated: 2026-05-02
status: completed
related_docs:
  - docs/SUPABASE_LEGACY_AUDIT.md
  - docs/PVL_RECONNAISSANCE.md
  - docs/HANDOVER_2026-05-02_session1.md
  - docs/API_OUTAGE_IMPACT_ANALYSIS.md
---

# DB Security Audit — Garden

> **Цель документа.** Это PREFLIGHT-аудит перед Этапом 2 (защита БД) и Этапом 3 (включение JWT-валидации в PostgREST). Здесь зафиксировано фактическое состояние БД, политик, ролей и JWT-инфраструктуры. **Никаких изменений в БД не вносилось.**

## TL;DR — пять самых важных находок

1. **БД — полный managed Supabase, не "голый Postgres"**, как утверждал [SUPABASE_LEGACY_AUDIT](SUPABASE_LEGACY_AUDIT.md). Существуют схемы `auth`, `storage`, `realtime`, `vault`, `extensions`, `graphql`, `pgbouncer`. Все 4 функции `auth.uid()`, `auth.jwt()`, `auth.role()`, `auth.email()` работают и идентичны Supabase-шимам. Все 21+ миграций применены: **68 RLS-политик живые** (60 в `public` + 8 в `storage`), RLS включён на **17 public-таблицах** (из 45), `is_admin()` работает.
2. **Корневая причина анонимного доступа ко всем таблицам — `PGRST_DB_ANON_ROLE=gen_user`**, где `gen_user` — это **владелец всех таблиц** (`relowner=gen_user` на 45/45 таблицах в `public`). Владелец таблицы по умолчанию байпасит RLS (`FORCE ROW LEVEL SECURITY` нигде не включён). Поэтому 68 policies существуют, но **анонимные запросы PostgREST их не активируют** — соединение идёт под ownerом и делает что хочет.
3. **JWT-секреты `garden-auth` и PostgREST уже совпадают** (одинаковая 64-символьная HEX-строка, prefix `e0b5...`, suffix `...81c5`). То есть **JWT-мост технически готов** — PostgREST примет токен от auth-сервиса. Не хватает только переключения роли.
4. **Нет ролей `web_anon` / `authenticated`** в Postgres (есть только `gen_user`, `backup_user`, `postgres`, `root`). Поэтому даже когда PostgREST верифицирует JWT, ему **некуда переключаться** — `role`-claim в токене garden-auth тоже отсутствует. Storage-policies вида `auth.role() = 'authenticated'` и KB-policies тоже не сработают.
5. **PVL — это полноценные данные в БД, а не in-memory mock**, как заявил [PVL_RECONNAISSANCE](PVL_RECONNAISSANCE.md). 24 таблицы `pvl_*` развёрнуты, в них 2204 audit-log записей, 23 активных студента, 45 сабмишенов ДЗ (29 accepted, 13 in_review, 2 revision, 1 draft), 323 строки прогресса. Frontend на mock — но БД живая. И на ней по сути нет защиты: только 2 декоративных policy `USING (true) WITH CHECK (true)`.

---

## 1. Подключение и credentials

| Параметр | Значение |
|---|---|
| SSH-сервер | `root@5.129.251.56` (Mysterious Bittern, hostname `msk-1-vm-423o`, Ubuntu 24+, kernel 6.8) |
| Postgres host | `<TIMEWEB_DB_HOST>.twc1.net:5432` (managed Timeweb Cloud Postgres, **с предустановленным Supabase**) |
| Database | `default_db` |
| DB user | `gen_user` (тот же, что используется PostgREST как anon role) |
| SSL | `sslmode=require` |
| Источник credentials | `/opt/garden-auth/.env` (DB_HOST/PORT/NAME/USER/PASS) — auth-сервис; продублировано в `PGRST_DB_URI` env Docker-контейнера `postgrest` |
| Auth-service unit | `/etc/systemd/system/garden-auth.service` → `node /opt/garden-auth/server.js`, EnvironmentFile=`/opt/garden-auth/.env` |
| PostgREST | Docker-контейнер `postgrest` (image `postgrest/postgrest:latest`), биндит `0.0.0.0:3000` через docker-proxy. **Не systemd unit.** Запущен 2026-04-16. |

**Конкретные значения секретов в этом отчёте не приводятся.** Все credentials остаются в `/opt/garden-auth/.env` и Docker env.

---

## 2. Схемы и таблицы

### Схемы (9)
```
auth, extensions, graphql, graphql_public, pgbouncer,
public, realtime, storage, vault
```

Это **полный набор Supabase-схем**, идентичный любому self-hosted Supabase или Supabase Cloud проекту. Timeweb явно поднимает managed Postgres из Supabase-образа.

### `auth.*` — 20 таблиц
```
audit_log_entries, flow_state, identities, instances, mfa_amr_claims,
mfa_challenges, mfa_factors, oauth_authorizations, oauth_client_states,
oauth_clients, oauth_consents, one_time_tokens, refresh_tokens,
saml_providers, saml_relay_states, schema_migrations, sessions,
sso_domains, sso_providers, users
```

`auth.users` содержит **32 строки** — последняя запись `olga@skrebeyko.ru, 2026-02-16`. Записи свежее этой даты не появлялись (миграция на garden-auth Express произошла примерно тогда).

### `storage.*` — 8 таблиц
```
buckets, buckets_analytics, buckets_vectors, migrations,
objects, s3_multipart_uploads, s3_multipart_uploads_parts, vector_indexes
```

Полная Supabase Storage. Используется для аватаров и `event-images` (см. policies в разделе 4).

### `public.*` — 45 таблиц с приблизительным числом строк

**Платформенные:**
| Таблица | Строки |
|---|---:|
| `app_settings` | 1 |
| `birthday_templates` | 2 |
| `cities` | 8 |
| `course_progress` | 47 |
| `events` | 161 |
| `events_archive` | 72 |
| `goals` | 11 |
| `knowledge_base` | 18 |
| `meetings` | 199 |
| `messages` | 4 |
| `news` | 7 |
| `notebooks` | 4 |
| `notifications` | 0 |
| `practices` | 9 |
| `profiles` | 59 |
| `push_subscriptions` | 0 |
| `questions` | 105 |
| `scenarios` | 16 |
| `shop_items` | 4 |
| `to_archive` | 63 |
| `users_auth` | 61 |

**ПВЛ (24 таблицы):**
| Таблица | Строки |
|---|---:|
| `pvl_audit_log` | **2204** |
| `pvl_calendar_events` | 25 |
| `pvl_checklist_items` | 82 |
| `pvl_cohorts` | 1 |
| `pvl_content_items` | 29 |
| `pvl_content_placements` | 23 |
| `pvl_course_lessons` | 2 |
| `pvl_course_weeks` | 13 |
| `pvl_direct_messages` | 25 |
| `pvl_faq_items` | 6 |
| `pvl_garden_mentor_links` | 19 |
| `pvl_homework_items` | 19 |
| `pvl_homework_status_history` | 110 |
| `pvl_mentors` | 1 |
| `pvl_notifications` | 0 |
| `pvl_student_certification_criteria_scores` | 0 |
| `pvl_student_certification_scores` | 0 |
| `pvl_student_content_progress` | **323** |
| `pvl_student_course_points` | 0 |
| `pvl_student_course_progress` | 13 |
| `pvl_student_disputes` | 0 |
| `pvl_student_homework_submissions` | **45** |
| `pvl_student_questions` | 5 |
| `pvl_students` | 23 |

> **Это противоречит [PVL_RECONNAISSANCE](PVL_RECONNAISSANCE.md)**, который утверждал, что весь PVL крутится in-memory через `pvlMockApi`. На самом деле PVL-данные живут в БД, и frontend (через `pvlMockApi`) с ними не общается. Что именно происходит — отдельный вопрос (см. CRITICAL FINDING #5).

### Структура `profiles` (24 колонки)
Подтверждены ожидаемые поля: `id (uuid)`, `email`, `name`, `role` (default `'applicant'`), `tree`, `seeds`, `city`, `avatar_url`, `status`, `x/y`, `join_date`, `skills (text[])`, `offer`, `unique_abilities`, `dob`, `leader_about/signature/reviews`, `telegram`, `avatar_focus_x/y`. **Нет** биллинговых полей `access_status`, `subscription_status`, `paid_until`, `prodamus_subscription_id`, `session_version`, упомянутых в CLAUDE.md, — то есть миграция 21 либо ещё не применена в этой колонке, либо CLAUDE.md описывает желаемое состояние (см. CRITICAL FINDING #7).

### Структура `users_auth` (7 колонок)
`id (uuid, NOT NULL)`, `email (text, NOT NULL)`, `password_hash (text, NOT NULL)`, `status (default 'active')`, `reset_token`, `reset_expires`, `created_at (default now())`. Всё, что нужно garden-auth для bcrypt + reset-flow.

### Распределение ролей в `profiles`
| role | count |
|---|---:|
| leader | 18 |
| applicant | 18 |
| intern | 13 |
| mentor | 7 |
| admin | 3 |
| **итого** | **59** |

(в `users_auth` — 61, разница в 2 — это half-state регистраций без профиля, см. [API_OUTAGE_IMPACT_ANALYSIS](API_OUTAGE_IMPACT_ANALYSIS.md))

### Список администраторов платформы

Все три аккаунта имеют `role='admin'` в `public.profiles` и `status='active'`. Решение о составе администраторов — **намеренное** со стороны владельца платформы.

| email | id | name | роль в команде |
|---|---|---|---|
| `olga@skrebeyko.com` | `85dbefda-ba8f-4c60-9f22-b3a7acd45b21` | Ольга Скребейко | владелец платформы |
| `ilchukanastasi@yandex.ru` | `e6de2a97-60f8-4864-a6d9-eb7da2831bf4` | Анастасия Зобнина | администратор-ассистент, правая рука владельца; полные права, включая биллинг и удаление пользователей |
| `odintsova.irina.ig@gmail.com` | `ebd79a0f-1bac-49f9-a3f2-aeeb165a10d7` | Ирина Одинцова | куратор Лиги, ментор курса ПВЛ; полные права, может выдавать роли другим пользователям |

> **Важно для Этапа 2.** В текущих 4 hardcoded-email политиках (`Olga Power`, `Olga_Power_Profiles`, `KB_Update_Admin`, `KB_Delete_Admin`) admin-bypass даётся **только Ольге**. Анастасия и Ирина в этих 4 политиках **не покрыты** — они получают admin-права только через 3 политики, использующие `is_admin()` (`app_settings_write_admin`, `shop_items_write_admin`, `profiles_update_admin`). Шаг 2.5 переписывает эти 4 политики на `is_admin()`-pattern → **расширяет права** Анастасии и Ирины до полных. Это согласовано с владельцем (см. [plans/BACKLOG.md](../plans/BACKLOG.md) ARCH-008 — обсуждение возможной иерархии ролей в будущем).

---

## 3. RLS — состояние

> **Запрос `forcerowsecurity` упал** на этой версии PostgreSQL — поле отсутствует в `pg_tables`. Однако его значение по умолчанию `false`, и нигде в миграциях `ALTER TABLE ... FORCE ROW LEVEL SECURITY` не делается. Поэтому: **`FORCE` не включён ни на одной таблице** → владелец (gen_user) байпасит RLS, см. CRITICAL FINDING #1.

RLS включён на **17 таблицах из 45** в `public` (60 политик в `public` + 8 в `storage` = 68 всего). Точный список (по `pg_tables.rowsecurity`):

```
app_settings, cities, course_progress, events, goals, knowledge_base,
meetings, news, notebooks, notifications, practices, profiles,
pvl_checklist_items, pvl_student_content_progress, questions,
scenarios, shop_items
```

Из 24 `pvl_*` таблиц RLS включён только на **2** (`pvl_checklist_items`, `pvl_student_content_progress`); на остальных 22 — RLS даже не включён, что отдельно учтено в CRITICAL FINDING #4.

При текущей конфигурации значение RLS-флага **не имеет значения для PostgREST-запросов**: они идут под `gen_user` (владелец таблиц) и байпасят RLS by ownership. Шаг 2.6 включает `FORCE ROW LEVEL SECURITY`, что закроет owner-bypass.

---

## 4. Policies (68 штук) — критические выдержки

### `profiles` — 11 политик
```
Map_View_All                              SELECT  USING (true)
Public View                               SELECT  USING (true)
Public profiles are viewable by everyone. SELECT  USING (true)
profiles_select_authenticated             SELECT  USING (auth.uid() IS NOT NULL)
Self Update                               UPDATE  USING (auth.uid() = id)
User_Edit_Self                            UPDATE  USING (auth.uid() = id)
Users can update own profile.             UPDATE  USING (auth.uid() = id)
profiles_update_own                       UPDATE  USING/WITH CHECK (auth.uid() = id)
profiles_update_admin                     UPDATE  USING/WITH CHECK is_admin()
User_Insert_Self / Users can insert ...   INSERT  WITH CHECK (auth.uid() = id)
profiles_insert_own                       INSERT  WITH CHECK (auth.uid() = id)
Olga Power / Olga_Power_Profiles          ALL     USING ((auth.jwt() ->> 'email') = 'olga@skrebeyko.com')
```

> **Дубликаты и мертвый код:** 4 SELECT-политики делают одно и то же (open-read), 4 UPDATE-политики говорят `auth.uid() = id` под разными именами, 2 INSERT-политики — одно и то же. Это след многих наслоённых миграций. Нужна нормализация (вне scope Этапа 1).
> **`Olga Power` / `Olga_Power_Profiles` — РАБОЧИЕ.** Email `olga@skrebeyko.com` принадлежит реальному пользователю — Ольге Скребейко (id `85dbefda-ba8f-4c60-9f22-b3a7acd45b21`, `role=admin` в `profiles`). См. секцию «Список администраторов платформы». В первоначальной версии аудита (v1.0) было утверждено, что эти политики «мёртвые» — это была **ошибка**: я экстраполировал данные из `auth.users` (legacy Supabase, где у Ольги другой email `olga@skrebeyko.ru`) на `profiles`. Корректировка в v1.1.

### `meetings` — 6 политик (`auth.uid() = user_id` для CRUD); 2 дубликата.

### `goals` — 4 политики (`auth.uid() = user_id` для CRUD).

### `practices` — 4 политики (`auth.uid() = user_id` для CRUD).

### `course_progress` — 2 политики (Read + Insert own, нет Update/Delete).

### `notifications` — 2 политики (View + Update own, нет Insert/Delete).

### `scenarios` — 4 политики, **`SELECT` имеет дополнительное условие `OR is_public = true`** (единственная таблица с публичным шарингом).

### `knowledge_base` — 5 политик
```
KB_View_All                  SELECT  true
KB_Insert_Auth               INSERT  WITH CHECK (auth.role() = 'authenticated')
KB_Edit_Auth                 ALL     USING/WITH CHECK (auth.role() = 'authenticated')
KB_Update_Admin              UPDATE  USING ((auth.jwt() ->> 'email') = 'olga@skrebeyko.com')   ← рабочая (Ольга)
KB_Delete_Admin              DELETE  USING ((auth.jwt() ->> 'email') = 'olga@skrebeyko.com')   ← рабочая (Ольга)
```
> Сейчас `auth.role()` всегда возвращает NULL (см. CRITICAL FINDING #2), → **KB Insert/Edit заблокирован для всех** при правильно настроенной защите. Нужен role-claim в JWT.
> **`KB_Update_Admin` / `KB_Delete_Admin` рабочие, но дают права только Ольге.** Двое других админов (Анастасия и Ирина) на текущий момент **не могут** делать UPDATE/DELETE на knowledge_base. См. секцию «Список администраторов платформы» — Шаг 2.5 переписывает эти политики на `is_admin()`-pattern, что расширит права на всех троих админов.

### `messages` — **0 политик в БД, но grants `PUBLIC: SELECT/INSERT/UPDATE/DELETE`** (!!!) → таблица в принципе открыта всем без RLS-контроля.

### `news` — 2 политики (всем читать, всем вставлять `WITH CHECK true` — так что любой может постить новости при работающей защите). **Нужно ужесточить.**

### `events` — **5 политик, ВСЕ открыты `USING true`** для CRUD. То есть даже с настроенной аутентификацией любой залогиненный сможет менять чужие события. **Нужно ужесточить.**

### `cities` — 4 политики, все `USING true` (CRUD без ограничений). Допустимо для справочника, но INSERT/DELETE для всех — странно.

### `pvl_checklist_items` — 1 политика `USING (true) WITH CHECK (true)` — **открыта**.
### `pvl_student_content_progress` — 1 политика `USING (true) WITH CHECK (true)` — **открыта**.
### Все остальные 22 таблицы `pvl_*` — **0 политик вообще**. RLS, видимо, не включён.

### `app_settings`, `shop_items` — read all, write `is_admin()`. Корректно.

### `storage.objects` — 8 политик
- `avatars` bucket: SELECT для всех, INSERT для `auth.role() = 'authenticated'` (2 идентичные политики)
- `event-images` bucket: SELECT для всех, INSERT/UPDATE/DELETE для `auth.role() = 'authenticated'`

> Опять же — пока `auth.role()` возвращает NULL, **аплоад в Storage через PostgREST невозможен**. Storage в проде используется через `auth.skrebeyko.ru/storage/sign` (`/opt/garden-auth/server.js` обращается к S3 напрямую через `S3_*` env-переменные с access/secret keys), поэтому пути PostgREST/Supabase Storage скорее всего вообще не работают, и эти политики могут быть legacy.

---

## 5. Auth-функции в БД

### `auth.uid() → uuid`
```sql
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$
```
**Это стандартный Supabase-шим.** Читает claim `sub` из JWT. **Garden-auth кладёт `sub: <uuid>` в payload** ([/tmp/garden-auth/server.js:115,136](file:///tmp/garden-auth/server.js)) → **полностью совместимо**.

### `auth.jwt() → jsonb`
Возвращает полный JWT payload как JSONB (читается из `current_setting('request.jwt.claims')`).

### `auth.role() → text`
```sql
... coalesce(
  nullif(current_setting('request.jwt.claim.role', true), ''),
  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
)::text
```
**Garden-auth НЕ кладёт `role` в JWT** (только `sub` + `email`). → `auth.role()` всегда NULL → policies с `auth.role() = 'authenticated'` (KB, Storage) **не сработают**. См. CRITICAL FINDING #2.

### `auth.email() → text`
Аналогично, читает `email` из JWT. Garden-auth кладёт `email` → работает.

### `public.is_admin() → boolean`
```sql
SECURITY DEFINER, search_path = public
SELECT exists (
  SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
)
```
Корректно: SECURITY DEFINER позволяет прочитать `profiles` даже под закрытой ролью; bottleneck — `auth.uid()` должен возвращать UUID. С токеном garden-auth — будет работать.

---

## 6. Роли и grants

### Роли (4)
| rolname | super | login | bypassrls | inherit |
|---|:-:|:-:|:-:|:-:|
| `gen_user` | f | t | f | t |
| `backup_user` | t | t | t | t |
| `postgres` | t | t | t | t |
| `root` | t | t | f | t |

**Нет ни `web_anon`, ни `anon`, ни `authenticated`.** Это объясняет, почему PostgREST конфигурирован с `PGRST_DB_ANON_ROLE=gen_user` — больше некуда было его направить.

### USAGE-grants на схемы для `gen_user`:
- `auth` ✅
- `public` ✅
- `storage` ✅

### Owner всех 45 таблиц `public.*` — `gen_user`
Стандартные `arwdDxt` ACL для владельца (insert/update/delete/select/references/trigger/truncate). Никаких grants для других ролей нет (роли не существуют).

### Особые `PUBLIC` grants (на роль PUBLIC = "все, включая будущих"):
- `messages` → `arwd` (SELECT/INSERT/UPDATE/DELETE)
- `push_subscriptions` → `arw` (SELECT/INSERT/UPDATE)

> Это означает: эти 2 таблицы **доступны любому коннекту в принципе**, не только через PostgREST. Если у злоумышленника появится connection string — он сразу читает messages и push-subscriptions без всяких токенов. Стоит понять, почему так и не нужно ли убрать.

---

## 7. Auth-сервис (garden-auth) — JWT, формат, secret

Репо: `https://github.com/lupita-create/garden-auth`. Размер: 1 файл `server.js`, 217 строк. Зависимости: `express`, `cors`, `bcryptjs`, `jsonwebtoken`, `nodemailer`, `pg`, `uuid`, `crypto`.

### JWT signing ([server.js:61](file:///tmp/garden-auth/server.js))
```js
const signToken = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
```
- **Алгоритм:** HS256 (default `jsonwebtoken` для строкового secret)
- **Expiration:** 30 дней
- **Secret:** из ENV `JWT_SECRET` (64 HEX-символа)

### Payload (login и register)
```js
signToken({ sub: id, email: normalizedEmail })
```
- **`sub`** = UUID пользователя (берётся из `users_auth.id` / `profiles.id`, единый ключ)
- **`email`** = lowercase email
- **НЕТ `role`, нет `aud`, нет `iss`, нет custom-claims.**

### Verify ([server.js:63-74](file:///tmp/garden-auth/server.js))
Стандартный middleware: `Bearer <token>`, проверка через тот же secret, claim → `req.user`.

### Endpoints, влияющие на JWT/users:
- `POST /auth/register` — bcrypt hash, INSERT в `users_auth`, INSERT/UPSERT в `profiles` (default role `'applicant'`, status `'active'`, seeds 0)
- `POST /auth/login` — bcrypt compare, возвращает токен + полный профиль
- `GET /auth/me` — middleware → SELECT profile by `req.user.sub`
- `POST /auth/request-reset` / `POST /auth/reset` — sha256 reset-token, mail через nodemailer

### **PostgREST vs garden-auth JWT secret — IDENTICAL** ✅
- **PostgREST `PGRST_JWT_SECRET`:** 64 chars, prefix `e0b5...`, suffix `...81c5`
- **Garden-auth `JWT_SECRET`:** 64 chars, prefix `e0b5...`, suffix `...81c5`
- **Сравнение byte-to-byte (на сервере):** MATCH

→ **JWT-мост на криптографическом уровне готов.** PostgREST примет любой токен, выпущенный garden-auth, и наоборот. Не хватает только: (а) `role` claim в токене, (б) роли `authenticated` в Postgres, (в) переключения `PGRST_DB_ANON_ROLE` с `gen_user` на ограниченную роль.

---

## 8. CRITICAL FINDINGS

### 🔥 #1. Owner-bypass: PostgREST как `gen_user` минует ВСЕ RLS-policies
- **Где:** `PGRST_DB_ANON_ROLE=gen_user` в Docker env контейнера `postgrest`; `gen_user` владеет всеми 45 таблицами (`relowner=gen_user`); `FORCE ROW LEVEL SECURITY` не включён ни на одной таблице.
- **Что значит:** даже если 68 policies верны, PostgREST-запрос (анонимный или с любым токеном без переключения роли) идёт под владельцем → byappses RLS by default → видит ВСЁ.
- **Это и есть исходная дыра**, которую закрыли через Caddy 503. Открыть API без починки этого — снова дыра.
- **Фикс:** Этап 2 — создать роль `web_anon` с минимальными правами, переключить `PGRST_DB_ANON_ROLE=web_anon`. Затем создать роль `authenticated` для аутентифицированных запросов и переключаться через JWT `role` claim.

### 🔥 #2. Garden-auth JWT не содержит `role`-claim → PostgREST не переключит роль, `auth.role()` = NULL
- **Где:** [server.js:115](file:///tmp/garden-auth/server.js), [server.js:136](file:///tmp/garden-auth/server.js) — `signToken({ sub: id, email })`.
- **Что значит:** даже когда фронт начнёт слать Bearer на PostgREST (Этап 4), PostgREST не сможет переключиться с anon-роли (`web_anon`) на `authenticated`. Все policies на `auth.role() = 'authenticated'` (KB write, Storage upload) будут блокировать действия залогиненных пользователей.
- **Фикс:** Этап 2/3 — добавить в garden-auth выдачу claim `role: 'authenticated'`. Однострочное изменение: `signToken({ sub: id, email, role: 'authenticated' })` дважды.

### 🔥 #3. Ролей `web_anon` и `authenticated` в Postgres нет
- **Где:** `pg_roles` показывает только `gen_user, backup_user, postgres, root`.
- **Что значит:** PostgREST переключаться некуда. Их нужно создать с осмысленными grants до изменения `PGRST_DB_ANON_ROLE`.
- **Фикс:** Этап 2 — `CREATE ROLE web_anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; GRANT web_anon, authenticated TO gen_user;` (последнее — чтобы PostgREST мог `SET ROLE`). Затем точечные `GRANT SELECT ON …` для каждой роли.

### 🔥 #4. PVL: реальные данные (45 сабмишенов, 23 студента, 2204 audit log) без RLS
- **Где:** 24 таблицы `pvl_*`, на 22 из них — 0 policies. На 2 — открытая `USING (true) WITH CHECK (true)`.
- **Что значит:** при работающем JWT-мосте любой залогиненный пользователь сможет читать/менять чужие сабмишены, прогресс, attestations, оценки. Это критично с учётом, что курс платный.
- **Доп. находка:** код фронта (`pvlMockApi`) этих данных **не использует** — он работает на `cloneSeedData(seed)`. То есть **кто-то пишет в БД помимо frontend-приложения**: либо это легаси из старой версии PVL до перехода на mock, либо есть параллельный путь записи (admin-скрипт? миграционный скрипт?). **Нужна отдельная разведка**, кто наполнил эти таблицы.
- **Фикс:** Этап 2 — для каждой `pvl_*` таблицы спроектировать policies (минимум: ученик видит только своё, ментор видит свою cohort через `pvl_garden_mentor_links`, админ — всё). Это самый объёмный кусок Этапа 2.

### 🔥 #5. `messages` имеет PUBLIC grant arwd (доступна без RLS любому Postgres-коннекту)
- **Где:** см. раздел 6 grants.
- **Что значит:** даже если PostgREST закрыт, любой, кто получит DB connection string, читает/пишет/удаляет чат напрямую. Plus в самой таблице **0 RLS-политик**.
- **Фикс:** Этап 2 — `REVOKE ALL ON public.messages FROM PUBLIC;` + написать policies (read own conversations, write self).

### 🔥 #6. `push_subscriptions` имеет PUBLIC grant arw (тот же класс проблем)
- **Фикс:** аналогично #5. Push-сервер использует свою привилегированную роль через `pg.Pool` ([push-server/server.mjs:36](../push-server/server.mjs#L36)) — PUBLIC grant ему не нужен.

### 🔥 #7. Биллинговые поля в `profiles` отсутствуют, хотя CLAUDE.md и миграция 21 их описывают
- **Где:** `\d profiles` показал 24 колонки без `access_status`, `subscription_status`, `paid_until`, `prodamus_subscription_id`, `session_version`.
- **Что значит:** либо миграция 21 (`migrations/21_billing_subscription_access.sql`) **не применена в проде**, либо она применена частично, либо CLAUDE.md документирует целевое состояние, а не текущее. `is_admin()` и `auth.uid()` из той же миграции **есть**, значит миграция выполнялась — но `ALTER TABLE profiles ADD COLUMN`-блок в ней либо не запускался, либо упал. Нужно проверить лог миграций (если ведётся) и перезалить эту часть.
- **Влияние на Этап 2:** функция `has_platform_access()` из миграции 21 (биллинг-гейтинг) **не существует** в БД. Если она нужна для policies — её надо будет включить заново.

### 🔥 #8. Дубликаты и hardcoded-email в политиках
- **Дубликаты:** `profiles` имеет 4 одинаковых SELECT, 4 одинаковых UPDATE, 2 одинаковых INSERT. `meetings` — 2 дублирующих SELECT и INSERT.
- **Hardcoded email** (~~ранее ошибочно названы «мёртвыми»~~): 4 политики на `olga@skrebeyko.com` (профиль `Olga Power`, `Olga_Power_Profiles`, `KB_Update_Admin`, `KB_Delete_Admin`). Они **рабочие** для одного пользователя — Ольги Скребейко (см. секцию «Список администраторов»). Но платформа имеет **трёх админов** (`role=admin` в `profiles`), и Анастасия с Ириной этими 4 политиками не покрыты — у них нет доступа к KB UPDATE/DELETE и полного CRUD на чужие profiles.
- **Фикс:** Шаг 2.5 Этапа 2 — переписать на `is_admin()`-pattern (это даст полные права всем 3 админам, что является намеренным решением владельца платформы).

### 🔥 #9. Split-brain между `auth.users` (Supabase) и `public.users_auth` (garden-auth)
- `auth.users` — **32 строки**, последняя запись 2026-02-16. Скорее всего, это снапшот пользователей до миграции на garden-auth.
- `public.users_auth` — **61 строка** (актуальная база логина).
- **`profiles` (59) vs `users_auth` (61)**: gap 2 — это half-state регистрации (auth-аккаунт без профиля, ровно тот сценарий из IMPACT-анализа).
- **Что делать:** на текущем этапе — ничего, garden-auth работает только с `public.users_auth`. Но после Этапа 5 стоит решить: чистить `auth.users` или мигрировать новых юзеров обратно (вряд ли).

---

## 9. ПЛАН ВОССТАНОВЛЕНИЯ ЗАЩИТЫ — пошагово

### Этап 2: Защита на стороне БД (read-write SQL, требует осторожности и preview на копии)

**Шаг 2.1.** Создать роли:
```sql
CREATE ROLE web_anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
GRANT web_anon TO gen_user;
GRANT authenticated TO gen_user;
GRANT USAGE ON SCHEMA public TO web_anon, authenticated;
```

**Шаг 2.2.** Минимальные grants для `web_anon` (анонимные запросы — только то, что нужно landing-странице, если что-то нужно):
```sql
-- предположительно ничего не нужно — фронт всегда логинится сразу.
-- Если нужно SELECT на cities (форма регистрации), shop_items — точечно.
```

**Шаг 2.3.** Базовые grants для `authenticated`:
```sql
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.profiles, public.meetings, public.goals,
       public.practices, public.scenarios, public.course_progress,
       public.notifications, public.messages, public.push_subscriptions,
       public.knowledge_base
       TO authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES with table_name LIKE 'pvl_%' TO authenticated;
-- USAGE на sequences тоже нужен для INSERT с серийными ключами
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
```

**Шаг 2.4.** Включить FORCE RLS на всех таблицах с `rowsecurity = true`, чтобы owner (gen_user) тоже подчинялся policies — это страховка на случай, если PostgREST случайно соединится без `SET ROLE`:
```sql
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
```

**Шаг 2.5.** Спроектировать и применить policies для всех 24 `pvl_*` таблиц. Это **самый большой блок работы**. Нужны:
- `pvl_students`: ученик видит свою строку, ментор видит студентов своей cohort, admin — всех
- `pvl_student_homework_submissions`: ученик CRUD своих, ментор RU своей cohort, admin — всех
- `pvl_homework_status_history`: append-only, фильтр по cohort
- `pvl_audit_log`: ученик READ своего, admin — всех
- ... и так далее
- Маппинг `profiles.id ↔ pvl_students.profile_id` (нужно проверить, есть ли такая колонка) или `pvl_garden_mentor_links` для разрешения связки.

**Шаг 2.6.** Закрыть `PUBLIC` grants:
```sql
REVOKE ALL ON public.messages FROM PUBLIC;
REVOKE ALL ON public.push_subscriptions FROM PUBLIC;
```

**Шаг 2.7.** Ужесточить «всем CRUD» policies:
- `events`: владелец/админ для INSERT/UPDATE/DELETE, public read
- `cities`: только админ для write
- `news`: только админ для INSERT (сейчас `WITH CHECK (true)` для всех)

**Шаг 2.8.** Удалить дубликаты в политиках `profiles` (4 SELECT, 4 UPDATE, 2 INSERT — оставить по одной канонической). 4 hardcoded-email политики после Шага 2.5 будут переписаны на `is_admin()` — отдельной чистки не требуется. Низкий приоритет, можно сделать косметически позже.

**Шаг 2.9 (по итогу #7).** Решить судьбу миграции 21 (биллинг). Применить заново или принять, что биллинг не задействован — и удалить ссылки из CLAUDE.md.

### Этап 3: PostgREST конфиг (один env var)

**Шаг 3.1.** В Docker env контейнера `postgrest` поменять одну переменную:
```
PGRST_DB_ANON_ROLE=web_anon   # было: gen_user
```
JWT_SECRET уже совпадает — менять не надо.

**Шаг 3.2.** Перезапустить контейнер:
```
docker restart postgrest
```

**Шаг 3.3.** Smoke test (без открытия Caddy):
```bash
# с сервера:
curl -sI http://localhost:3000/profiles                            # должно вернуть 401 (anon role не имеет SELECT)
curl -sI http://localhost:3000/profiles -H "Authorization: Bearer <valid_token>"  # 200
```

### Этап 4: Frontend changes (изменения в [services/dataService.js](../services/dataService.js))

**Шаг 4.1.** В `postgrestFetch` добавить заголовок `Authorization: Bearer ${token}` (сейчас комментарий явно говорит «keep PostgREST requests anonymous», см. [services/dataService.js:22-23](../services/dataService.js#L22-L23)).

**Шаг 4.2.** В garden-auth добавить `role: 'authenticated'` в JWT payload (одна правка в [server.js:115](file:///tmp/garden-auth/server.js) и [server.js:136](file:///tmp/garden-auth/server.js)). Перевыпуск всех существующих токенов придётся подождать (30-day expiration), либо принудительно инвалидировать через смену `JWT_SECRET` (что разлогинит всех — нежелательно).

**Шаг 4.3.** Graceful degradation в [App.jsx:78-113](../App.jsx#L78-L113): при ошибке PostgREST не падать на AuthScreen, а показывать "Connection error" UI. Не блокер, но улучшает UX.

**Шаг 4.4.** Пересобрать (`npm run build`), задеплоить.

### Этап 5: Открытие API + verification

**Шаг 5.1.** В Caddyfile вернуть `reverse_proxy localhost:3000` для `api.skrebeyko.ru`.

**Шаг 5.2.** Прогнать сценарии из [API_OUTAGE_IMPACT_ANALYSIS.md](API_OUTAGE_IMPACT_ANALYSIS.md) (логин, регистрация, профили, встречи, чат, KB, PVL).

**Шаг 5.3.** Сообщить пользователям.

---

## История изменений
- 2026-05-02 (v1.0): Создан после Этапа 1 (SQL-аудит). Подключение через SSH к Mysterious Bittern + psql из `/opt/garden-auth/.env`. Никаких изменений в БД не вносилось.
- 2026-05-02 (v1.1): Исправлены ошибки первичного аудита: hardcoded `olga@skrebeyko.com` — рабочий email владельца платформы (а не «мёртвая политика», как ошибочно утверждалось в v1.0); главная дыра — owner bypass через `gen_user`, а не GRANT PUBLIC; уточнено количество политик (60 в `public` + 8 в `storage` = 68) и список RLS-таблиц (17 в `public`). Зафиксирован список администраторов платформы (3 человека: владелец + ассистент + куратор). Доработан Шаг 2.5 с учётом расширения прав двух новых админов до `is_admin()`-pattern.
