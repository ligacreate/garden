# DB-аудит 2026-05-02 (read-only)

Сессия: только `SELECT` и метакоманды psql, никаких изменяющих операций. Подключение: `ssh root@5.129.251.56` → `psql` под `gen_user` через `/opt/garden-auth/.env`.

Источники данных:
- Локальный backup всех RLS-политик: `~/Desktop/policies_backup_2026-05-02.txt` (68 политик: 63 в `public` + 5 в `storage`).
- Live read-only запросы к Postgres на 5.129.251.56.
- `curl https://liga.skrebeyko.ru/` для проверки прод-фронта.
- Локальный репо `/Users/user/vibecoding/garden_claude/garden/` (git HEAD `8bb03bf`).

---

## Краткое резюме

**Критично (требует решения до открытия Caddy):**
1. **Bundle prod ≠ локальная сборка.** Хеши JS/CSS-бандлов на проде не совпадают с локальным `dist/`. Утверждение «код в репо = задеплоенный код» этой сессией не подтверждено.
2. **На `profiles` есть 3 дублирующих SELECT-политики с `qual=true`** — это и есть корневая причина утечки ПД (даже без owner-bypass анонимный SELECT прошёл бы по любой из них).
3. **На `messages`, `push_subscriptions`, `pvl_students`, `pvl_garden_mentor_links` RLS вообще выключен.** Защита этих таблиц сейчас держится исключительно на отсутствии grants для новых ролей.
4. **PVL: из 18 активных таблиц RLS включён только на 2**, и там политики `qual=true` (no-op). Учительская и весь PVL-курс на уровне БД сейчас не защищены.

**В порядке:**
- Все 4 функции `auth.*` существуют, корректны, EXECUTE для `web_anon`/`authenticated` есть. `auth.uid()` без JWT возвращает NULL, не падает.
- `is_admin()` уже существует (SECURITY DEFINER), часть политик её использует. Замена 4 hardcoded-политик на `is_admin()` — это «привести в соответствие», а не «писать с нуля».
- Все 3 админа (Ольга, Анастасия, Ирина) имеют `role='admin'` и `status='active'`.
- Роли `web_anon` и `authenticated` созданы корректно (NOLOGIN), `gen_user` — член обеих.
- `REVOKE ALL ... FROM PUBLIC` на `messages` и `push_subscriptions` реально применился.

---

## 1. AUTH-функции (Supabase-наследие)

**Вывод:** все 4 функции (`auth.email`, `auth.jwt`, `auth.role`, `auth.uid`) существуют и работают. EXECUTE есть у обеих новых ролей. Без JWT возвращают NULL. Зависят от `current_setting('request.jwt.claims', true)` — стандартный механизм PostgREST.

### Список функций
```
                       List of functions
 Schema | Name  | Result data type | Argument data types | Type
--------+-------+------------------+---------------------+------
 auth   | email | text             |                     | func
 auth   | jwt   | jsonb            |                     | func
 auth   | role  | text             |                     | func
 auth   | uid   | uuid             |                     | func
(4 rows)
```

### Исходники

```sql
-- auth.uid()
CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid LANGUAGE sql STABLE
AS $function$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$

-- auth.jwt()
CREATE OR REPLACE FUNCTION auth.jwt()
 RETURNS jsonb LANGUAGE sql STABLE
AS $function$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$function$

-- auth.role()
CREATE OR REPLACE FUNCTION auth.role()
 RETURNS text LANGUAGE sql STABLE
AS $function$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$function$
```

### Поведение без JWT
```
SELECT auth.uid();                                  → NULL
SELECT auth.jwt();                                  → NULL
SELECT auth.role();                                 → NULL
SELECT current_setting('request.jwt.claims', true); → '' (пусто)
```

### EXECUTE-привилегии для новых ролей
```
 proname | web_anon_exec | authenticated_exec
---------+---------------+--------------------
 email   | t             | t
 jwt     | t             | t
 role    | t             | t
 uid     | t             | t
```

### Дополнительная находка — `public.is_admin()`
```sql
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$function$
```
Уже используется политиками `profiles_update_admin`, `app_settings_write_admin`, `shop_items_write_admin`. То есть инфраструктура для замены hardcoded-email на role-based уже готова.

---

## 2. Тела ключевых политик (из локального backup)

**Вывод:** на `profiles` 14 политик (включая 3 откровенно дырявых с `qual=true` и 2 hardcoded на `olga@skrebeyko.com`). На `messages`, `pvl_students`, `pvl_garden_mentor_links` политик нет вообще, и RLS на них выключен (см. п.5). На `knowledge_base` 5 политик, из которых 2 hardcoded на `olga@skrebeyko.com`.

### profiles — 14 политик

| Политика | CMD | USING | WITH CHECK |
|---|---|---|---|
| Map_View_All | SELECT | `true` | — |
| **Olga Power** | ALL | `(auth.jwt() ->> 'email') = 'olga@skrebeyko.com'` | (то же) |
| **Olga_Power_Profiles** | ALL | `(auth.jwt() ->> 'email') = 'olga@skrebeyko.com'` | (то же) |
| Public View | SELECT | `true` | — |
| Public profiles are viewable by everyone. | SELECT | `true` | — |
| Self Update | UPDATE | `auth.uid() = id` | — |
| User_Edit_Self | UPDATE | `auth.uid() = id` | — |
| User_Insert_Self | INSERT | — | `auth.uid() = id` |
| Users can insert their own profile. | INSERT | — | `auth.uid() = id` |
| Users can update own profile. | UPDATE | `auth.uid() = id` | — |
| profiles_insert_own | INSERT | — | `auth.uid() = id` |
| profiles_select_authenticated | SELECT | `auth.uid() IS NOT NULL` | — |
| profiles_update_admin | UPDATE | `is_admin()` | `is_admin()` |
| profiles_update_own | UPDATE | `auth.uid() = id` | `auth.uid() = id` |

### messages — 0 политик, RLS = OFF

### knowledge_base — 5 политик

| Политика | CMD | USING | WITH CHECK |
|---|---|---|---|
| **KB_Delete_Admin** | DELETE | `(auth.jwt() ->> 'email') = 'olga@skrebeyko.com'` | — |
| KB_Edit_Auth | ALL | `auth.role() = 'authenticated'` | (то же) |
| KB_Insert_Auth | INSERT | — | `auth.role() = 'authenticated'` |
| **KB_Update_Admin** | UPDATE | `(auth.jwt() ->> 'email') = 'olga@skrebeyko.com'` | — |
| KB_View_All | SELECT | `true` | — |

### pvl_students — 0 политик, RLS = OFF

### pvl_garden_mentor_links — 0 политик, RLS = OFF

### Дополнительно — две PVL-таблицы с RLS=on

На `pvl_checklist_items` и `pvl_student_content_progress` RLS включён, но политики — `ALL with qual=true`, фактически no-op (пропускают всё):

```
 public | pvl_checklist_items          | pvl_checklist_items_all              | ALL | true | true
 public | pvl_student_content_progress | pvl_student_content_progress_student | ALL | true | true
```

---

## 3. Админы

**Вывод:** все три указанных админа найдены, у всех `role='admin'` и `status='active'`. Других админов в БД нет.

```
                  id                  |            email             | role  | status |        name
--------------------------------------+------------------------------+-------+--------+--------------------
 e6de2a97-60f8-4864-a6d9-eb7da2831bf4 | ilchukanastasi@yandex.ru     | admin | active | Анастасия Зобнина
 ebd79a0f-1bac-49f9-a3f2-aeeb165a10d7 | odintsova.irina.ig@gmail.com | admin | active | Ирина Одинцова
 85dbefda-ba8f-4c60-9f22-b3a7acd45b21 | olga@skrebeyko.com           | admin | active | Ольга Скребейко
(3 rows)
```

Запрос `WHERE role='admin'` без фильтра по email вернул те же 3 строки — других админов нет.

---

## 4. SHA prod vs локальный репо — расхождение

**Вывод:** хеши бандлов на проде и в локальном `dist/` различаются. Утверждение «`ligacreate/garden HEAD = 8bb03bf` совпадает с задеплоенным» этой сессией **не подтверждено**.

### Сравнение бандлов

| Источник | JS bundle | CSS bundle |
|---|---|---|
| Прод (`https://liga.skrebeyko.ru/`) | `index-CTuO4hEU.js` | `index-DrURQwUx.css` |
| Локальный `dist/` (собран 2026-05-02 20:44) | `index-CyrNAtkj.js` | `index-BTr__Bdv.css` |
| Локальный git HEAD | `8bb03bf` (2026-05-01 19:28) | — |

Хеши Vite детерминированные относительно содержимого. Разные хеши = разное содержимое. Возможные причины:
- Прод собран из другого коммита (не текущего HEAD).
- Прод собран в другом окружении (env-переменные, версии зависимостей, NODE_ENV).
- Локальная сборка `npm run build` использует другие настройки, чем GitHub Actions.

### Прод-html
```html
<script type="module" crossorigin src="/assets/index-CTuO4hEU.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-DrURQwUx.css">
```
Сервер: `nginx` (не Caddy 5.129.251.56) — фронт хостится на отдельной машине.

### Серверный Caddy (5.129.251.56) обслуживает только api/auth
```
api.skrebeyko.ru {
  @auth_paths path /auth/* /storage/*
  handle @auth_paths { reverse_proxy 127.0.0.1:3001 }
  handle { respond "API temporarily closed for maintenance" 503 }
}
auth.skrebeyko.ru { reverse_proxy 127.0.0.1:3001 }
```
`/var/www` на сервере отсутствует. Фронт-хостинг — `185.215.4.44` (не проверял в этой сессии).

### Локальный репо
```
HEAD: 8bb03bfbdddc97ee17deac6cbfa319398aa2388c
last commit: fix: все уроки-задания видны в Результатах даже без записи в content_placements
remote: https://github.com/ligacreate/garden.git
dist/index-CyrNAtkj.js (1.3 MB, 2026-05-02 20:44)
```

---

## 5. Roles state

**Вывод:** все вчерашние действия (2.1–2.3) применились корректно. Обнаружены две мелкие странности: дубли в `pg_auth_members` и отсутствие USAGE на `auth`/`storage` для новых ролей (для `auth` это не критично, т.к. EXECUTE на функции есть).

### Роли web_anon и authenticated
```
 Role name     |  Attributes
---------------+--------------
 web_anon      | Cannot login
 authenticated | Cannot login
```

### Membership (gen_user — член обеих)
```
 granted_role  | member_role | admin_option
---------------+-------------+--------------
 authenticated | gen_user    | t
 authenticated | gen_user    | f
 web_anon      | gen_user    | t
 web_anon      | gen_user    | f
```
Двойные записи (с admin_option=t и f) — GRANT'ы выполнялись дважды, один раз с `WITH ADMIN OPTION`, один раз без. Не ломает безопасность, но «грязно».

### REVOKE FROM PUBLIC применился
```
 Schema |        Name        | Type  |     Access privileges      | Policies
--------+--------------------+-------+----------------------------+----------
 public | messages           | table | gen_user=arwdDxtm/gen_user |
 public | push_subscriptions | table | gen_user=arwdDxtm/gen_user |
```
`PUBLIC` сорван, остался только `gen_user`. Колонка `Policies` пустая — политик нет (RLS на этих таблицах выключен, см. ниже).

### Schema-level USAGE
```
 nspname | web_anon_usage | authenticated_usage
---------+----------------+---------------------
 storage | f              | f
 public  | t              | t
 auth    | f              | f
```
- `public` — USAGE есть (видимо, унаследовано от PUBLIC).
- `auth` — USAGE нет, но EXECUTE на функции `auth.*` есть. Для RLS-политик этого достаточно.
- `storage` — USAGE нет. Если планируется доступ к `storage.objects` через PostgREST под этими ролями — потребуется явный GRANT.

### RLS-статус по public
- Всего таблиц в `public`: **45**
- RLS включён: **17**
- FORCE RLS включён: **0**

Таблицы с RLS=on:
```
app_settings, cities, course_progress, events, goals, knowledge_base, meetings,
news, notebooks, notifications, practices, profiles, pvl_checklist_items,
pvl_student_content_progress, questions, scenarios, shop_items
```

Таблицы из выборочной проверки с RLS=off:
```
messages, push_subscriptions, pvl_students, pvl_garden_mentor_links
```

Полная таблица по 8 таблицам интереса:
```
 schema |            table             | rls_enabled | rls_forced
--------+------------------------------+-------------+------------
 public | knowledge_base               | t           | f
 public | messages                     | f           | f
 public | profiles                     | t           | f
 public | push_subscriptions           | f           | f
 public | pvl_checklist_items          | t           | f
 public | pvl_garden_mentor_links      | f           | f
 public | pvl_student_content_progress | t           | f
 public | pvl_students                 | f           | f
```

---

## Что выглядит неожиданно

1. **Бандлы прода и локальной сборки расходятся.** Прод: `index-CTuO4hEU.js`, локальный `dist/`: `index-CyrNAtkj.js`. ПРИОРИТЕТ 1 (верификация кодовой базы) этой сессией не закрыт — нужен другой источник истины (deploy log GitHub Actions, FTP timestamp, или ssh на хостинг фронта `185.215.4.44`).

2. **На `profiles` три дублирующих SELECT-политики с `qual=true`** — `Map_View_All`, `Public View`, `Public profiles are viewable by everyone.`. Это прямая первопричина утечки ПД на уровне политик: даже если бы owner-bypass у `gen_user` не было, эти политики всё равно открывают SELECT всем. Более строгая `profiles_select_authenticated` (`auth.uid() IS NOT NULL`) есть, но `PERMISSIVE`-политики складываются по `OR` — наличие любой `qual=true` нивелирует ограничение.

3. **На `messages`, `push_subscriptions`, `pvl_students`, `pvl_garden_mentor_links` RLS вообще выключен.** Backup политик их не «потерял» — их физически нет. Сейчас защита держится только на отсутствии grants для `web_anon`/`authenticated`. После выдачи grants эти таблицы станут открытыми всем держателям роли — без какой-либо фильтрации по владельцу.

4. **PVL: из 18 таблиц, активно используемых фронтом, RLS включён только на 2** (`pvl_checklist_items`, `pvl_student_content_progress`), и обе политики там — `ALL with qual=true` (no-op). Остальные 16 PVL-таблиц без RLS. То есть вся PVL-«учительская» сейчас защищена только обскуром (закрытый Caddy + отсутствие grants).

5. **Hardcoded `olga@skrebeyko.com` — ровно 4 политики**, как и ожидалось:
   - `profiles."Olga Power"` (ALL)
   - `profiles."Olga_Power_Profiles"` (ALL)
   - `knowledge_base.KB_Delete_Admin` (DELETE)
   - `knowledge_base.KB_Update_Admin` (UPDATE)

6. **`is_admin()` уже существует и используется частью политик** — `profiles_update_admin`, `app_settings_write_admin`, `shop_items_write_admin`. Замена hardcoded-email на role-based — это не «писать с нуля», а «довести до конца начатую работу».

7. **Двойные записи в `pg_auth_members`** (admin_option=t и f для каждой пары) — GRANT'ы выполнялись дважды. Не ломает безопасность, но в идеале однажды почистить.

8. **`auth` schema USAGE для новых ролей = false, но EXECUTE на `auth.*` функции = true.** Для RLS-политик этого достаточно (политике нужен EXECUTE на функцию, не USAGE на схему). Но непривычно — обычно дают и то, и другое. Прямо сейчас политик с обращением к `auth.*` *таблицам* в backup'е не вижу, поэтому риск минимальный.

---

## Открытые вопросы / blockers

1. **Какой именно коммит сейчас на проде?** Без этого нельзя утверждать «код в репо = задеплоенный». Возможные источники истины:
   - GitHub Actions deploy log (последний успешный run на main).
   - FTP-timestamp бандла на хостинге фронта.
   - SSH на `185.215.4.44` и `git log` в директории деплоя (если там вообще git, а не просто скопированный `dist/`).
   - Сравнение содержимого `dist/index-CyrNAtkj.js` локального и `https://liga.skrebeyko.ru/assets/index-CTuO4hEU.js` (если прод собирался из того же коммита, контент будет очень близким — диффом можно понять, что именно отличается).

2. **`pvlPostgrestApi.js` JWT-fallback — где именно?** Знаем, что при ошибках PGRST300/PGRST302 фронт ставит `pvlJwtDisabledAfterError=true` и роняет Authorization header. Линии в файле и точная логика — нужно прочитать перед Этапом 3, чтобы понять, патчить или нет.

3. **Где на сервере хранится JWT-secret для garden-auth?** Скорее всего `/opt/garden-auth/.env` (мы оттуда читали `DB_PASS`). Перед Этапом 3 нужно подтвердить переменную, формат секрета, алгоритм (HS256/RS256) и совпадение с тем, что выдаёт auth-сервис.

4. **PVL: что делать с 16 таблицами без RLS?** Два пути на выбор владельца:
   - (a) Включить RLS + написать политики (по аналогии с `profiles`/`knowledge_base`). Долго, но правильно.
   - (b) Оставить RLS off и положиться на JWT-проверку PostgREST + grants на `authenticated`. Быстро, но «все залогиненные видят всё PVL».
   Это решение по объёму работы — обсудить отдельно.

5. **Дубли политик на `profiles` (3× `qual=true`-SELECT, 2× `Olga Power`).** План чистки — оставить минимально необходимый набор, остальные DROP. Перед DROP — список «что точно не использует фронт».

6. **`storage` schema — USAGE для `authenticated`?** Если фронт грузит/читает аватары через PostgREST (а не напрямую через storage-сервис) — нужно дать. Из политик видно `Auth Upload`, `Auth upload event-images` и т.д. на `storage.objects` для `authenticated` role — значит фронт работает через PostgREST. Подтвердить.

7. **GRANT-матрица для шага 2.4 — какие таблицы каким ролям и в каких CRUD-операциях.** До составления и согласования с владельцем — никаких GRANT'ов не делать.
