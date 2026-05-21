# DB-аудит v4, 2026-05-02 (read-only)

Сессия только на чтение. `psql` под `gen_user` через `/opt/garden-auth/.env`, чтение исходников фронта в `/Users/user/vibecoding/garden_claude/garden/`. Никаких изменений.

Цель: закрыть 3 финальных блокера перед SQL — связь `pvl_students ↔ profiles`, тело триггера `pvl_sync_notification_compat`, риск анонимных SELECT'ов на `profiles` после чистки политик.

---

## Краткое резюме

1. **Гипотеза `pvl_students.id = profiles.id` подтверждена для 22 из 23 студентов.** Единственный «непарный» — синтетическая запись с placeholder UUID `33333333-3333-3333-3333-333333333301` («Участница», `status='active'`). Это явный seed/тестовый студент. Для всех **реальных** строк связь — рабочий контракт. Шаблон B пишется через `auth.uid() = student_id` без денормализации.
2. **Триггер `pvl_sync_notification_compat` синкает только legacy↔new колонки `role/kind/body/text/title/recipient_role/type`.** Колонки адресации **`user_id`, `recipient_student_id`, `recipient_mentor_id` триггером НЕ затрагиваются** — они независимы. Для шаблона D предикат должен явно проверять каждую из них (через OR).
3. **Анонимных SELECT'ов на `profiles` в боевом фронте нет.** Единственный SELECT-всех-профилей (`api.getUsers()`) вызывается из `App.jsx:init()` строго после `getCurrentUser()` из localStorage (если user=null — return до запроса). Чистка 3 политик с `qual=true` безопасна.
4. **Минорный риск:** рассинхрон localStorage (user есть, token истёк или PGRST300-fallback выключил Bearer). В этом случае запрос пойдёт под `web_anon` → после чистки получит пустой массив. Не падение, но «пустой список пользователей». Это **не блокер**, но стоит держать в голове.

---

## Задача 1 — связка `pvl_students ↔ profiles`

### Метрики

```
           metric           | value
----------------------------+-------
 pvl_students_total         | 23
 pvl_students_join_profiles | 22
 pvl_students_no_profile    |  1
 profiles_total             | 59
```

22 / 23 = **95.7 % реальных студентов имеют профиль** с тем же UUID.

### Единственная «непарная» строка

```
              student_id              | student_name | status
--------------------------------------+--------------+--------
 33333333-3333-3333-3333-333333333301 | Участница    | active
```

Признаки фейка:
- Placeholder UUID (`33333333-…-3333-3333-3333-333333333301` — паттерн повторяющихся троек, конец `01`).
- Имя `Участница` (generic, не персональное).
- Никаких связей: нет ментора в `pvl_garden_mentor_links`, нет совпадения в `profiles`.

Это явная seed-запись (вероятно, остаток миграции/сидера, например `migrations/22_*.sql` или ручной INSERT при тестировании). Для проверки можно посмотреть миграции, но это вне scope read-only-аудита.

### Сэмпл совпавших строк (5 из 22)

```
                  id                  | in_pvl_students  |   in_profiles    |   role    | profile_status
--------------------------------------+------------------+------------------+-----------+----------------
 1085e06d-34ad-4e7e-b337-56a0c19cc43f | Настина фея      | Настина фея      | applicant | active
 0e978b3b-bb91-413d-8d5f-d0383b7abb65 | Диана Зернова    | Диана Зернова    | applicant | active
 2f7abb9c-ceff-43a5-baaf-3ed14fd85b78 | Наталья Махнёва  | Наталья Махнёва  | applicant | active
 629ffb8c-9510-47d4-b8b2-7f141f27dbf9 | Ольга Коняхина   | Ольга Коняхина   | applicant | active
 8ed14494-84b0-4d9e-8727-98671f67892e | Дарья Зотова     | Дарья Зотова     | applicant | active
```

Имена `pvl_students.full_name` и `profiles.name` совпадают побайтно во всех 5. Все 22 настоящих PVL-студента в `profiles` имеют `role='applicant'` и `status='active'` — то есть PVL — это «абитуриенты Сада» (соответствует бизнес-логике из CLAUDE.md: путь `Абитуриент → Стажер → Ведущая`).

### Вывод для шаблона B

**Гипотеза подтверждена:** `pvl_students.id` ≡ `profiles.id` ≡ `auth.uid()` для 22 из 23 строк. Это **продуктовый контракт** (auth-сервис создаёт `profiles.id`, ETL/форма зачисления в PVL ставит тот же UUID в `pvl_students.id`), просто без формального FK в БД.

Шаблон B пишется без денормализации:

```sql
-- пример для pvl_student_homework_submissions
CREATE POLICY pvl_submissions_own_select ON public.pvl_student_homework_submissions
  FOR SELECT TO authenticated
  USING (auth.uid() = student_id);
```

Тестовая «Участница» (`333…01`) под политику не попадёт никогда (никто не залогинится с таким `auth.uid()`), но видимая ментору/админу — попадёт через шаблон C.

### Что усилит контракт (рекомендации, вне scope этой сессии)

- Добавить `FOREIGN KEY (id) REFERENCES profiles(id)` на `pvl_students` — заодно решит проблему «забыли создать профиль».
- Удалить тестовую запись `33333333-…-01` или хотя бы перевести её в `status='archived'`.

---

## Задача 2 — триггер `pvl_sync_notification_compat`

### Триггер

```
tgname            : trg_pvl_notifications_compat
table_name        : pvl_notifications
function_name     : pvl_sync_notification_compat
trigger_def       : CREATE TRIGGER trg_pvl_notifications_compat
                      BEFORE INSERT OR UPDATE ON public.pvl_notifications
                      FOR EACH ROW EXECUTE FUNCTION pvl_sync_notification_compat()
```

### Тело функции

```sql
CREATE OR REPLACE FUNCTION public.pvl_sync_notification_compat()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW."role" := COALESCE(NULLIF(NEW."role", ''), NULLIF(NEW.recipient_role, ''), 'all');
  NEW.recipient_role := COALESCE(NULLIF(NEW.recipient_role, ''), NULLIF(NEW."role", ''), 'all');
  NEW.kind := COALESCE(NULLIF(NEW.kind, ''), NULLIF(NEW."type", ''), 'notification');
  NEW."type" := COALESCE(NULLIF(NEW."type", ''), NULLIF(NEW.kind, ''), 'notification');
  NEW.body := COALESCE(NULLIF(NEW.body, ''), NULLIF(NEW."text", ''), NULLIF(NEW.title, ''), '');
  NEW."text" := COALESCE(NULLIF(NEW."text", ''), NULLIF(NEW.body, ''), NULLIF(NEW.title, ''), '');
  RETURN NEW;
END;
$function$
```

### Что синкает триггер (3 пары)

| Пара | Колонки | Дефолт |
|---|---|---|
| 1 | `role` ↔ `recipient_role` | `'all'` |
| 2 | `kind` ↔ `type` | `'notification'` |
| 3 | `body` ↔ `text` ↔ `title` | `''` |

### Что НЕ синкает (важно для RLS)

- `user_id` — единственный
- `recipient_student_id` — единственный
- `recipient_mentor_id` — единственный
- `entity_type`, `entity_id`, `is_read`, `is_system`, `payload` — единственные

То есть **колонки адресации `user_id`, `recipient_student_id`, `recipient_mentor_id` друг с другом не связаны** — ни по триггеру, ни по CHECK-констрейнту. Возможны строки, где заполнено только `user_id`, или только `recipient_student_id`, или комбинация.

### Сэмпл данных

`pvl_notifications` сейчас **пуст** (0 строк), поэтому реальный паттерн заполнения колонок узнать на текущих данных невозможно. Дизайн `pvl_notifications` ясен только по коду фронта/бекенда (вне scope этой задачи).

### Вывод для шаблона D

Поскольку любая из трёх колонок может быть «адресатом», а триггер их не выравнивает — **предикат должен проверять все три через OR**:

```sql
-- свой пользователь видит свои нотификации
CREATE POLICY pvl_notifications_own_select ON public.pvl_notifications
  FOR SELECT TO authenticated
  USING (
    auth.uid()::text = user_id
    OR auth.uid()::text = recipient_student_id
    OR auth.uid()::text = recipient_mentor_id
  );
```

Cast `auth.uid()::text` обязателен — все три колонки **TEXT**, не UUID (см. v3).

**Альтернатива:** если по бизнес-смыслу `user_id` = «кому пришла», а `recipient_student_id`/`recipient_mentor_id` = денормализованные хвосты для удобства фильтрации — можно ограничиться предикатом `auth.uid()::text = user_id`. Но это **гипотеза, требующая подтверждения**: на текущих 0 строк её не проверить, а триггер не делает `user_id` обязательным/синхронным.

**Рекомендация:** до прояснения «какая колонка обязательна» — писать предикат через OR (избыточно, но не дырявит). Когда фича будет активна и появятся данные — посмотреть, какие колонки по факту заполняются, и сузить предикат.

---

## Задача 3 — анонимные чтения `profiles` на фронте

### Карта вызовов `postgrestFetch('profiles', …)`

Полный список из `services/dataService.js` (12 вхождений):

| Строка | Метод (в коде) | HTTP | Что делает | Когда вызывается |
|---|---|---|---|---|
| 1263 | `_ensurePostgrestUser` (создание) | POST/GET | upsert профиля при регистрации | после auth-flow (token есть) |
| 1415 | `_ensurePostgrestUser._fetch` | GET | проверка существования профиля | после auth-flow |
| 1442 | `_ensurePostgrestUser._insert` | POST | создание профиля | после auth-flow |
| 1458 | `_fetchProfile(userId)` | GET `select=*&id=eq.<id>` | загрузка одного профиля | внутри `_assertActive` после auth |
| 1477 | `_ensureDefaultApplicantRoleInDb` | PATCH | проставить роль `applicant` | после получения profile |
| **1493** | **`getUsers()`** | **GET `select=*`** | **публичный SELECT всех профилей** | **из App.jsx после setCurrentUser** |
| 1529 | `updateUser` (role/status) | PATCH | админ обновляет роль | админка |
| 1567 | `updateUser` (поля) | PATCH | пользователь обновляет себя | профиль/админка |
| 1582 | `deleteUser` | DELETE | админ удаляет | админка |
| 1592 | `toggleUserStatus` | PATCH | админ меняет статус | админка |
| 2563 | `_resolveGoalsUserId` (by id) | GET `select=id&id=eq.<id>` | fallback при поиске id для goals | после currentUser |
| 2576 | `_resolveGoalsUserId` (by email) | GET `select=id&email=eq.<email>` | то же, fallback | после currentUser |

И один в `services/pvlMockApi.js:1242` — это **mock-режим**, в боевом коде не используется (`pvlMockApi` подгружается только если `VITE_USE_LOCAL_DB=true` или явно).

### Самый рискованный вызов — `getUsers()` (1493)

```js
// services/dataService.js:1491-1496
async getUsers() {
    return this._cachedFetch('users', async () => {
        const { data } = await postgrestFetch('profiles', { select: '*' });
        return (data || []).map((profile) => this._normalizeProfile(profile));
    });
}
```

`SELECT * FROM profiles` без фильтров. Это именно то, что прикрывает политика `Map_View_All` (`USING(true)`) сейчас. После чистки SELECT-дублей останется только `profiles_select_authenticated` (`auth.uid() IS NOT NULL`) → запрос **должен идти с валидным JWT**.

### Кто и когда вызывает `getUsers()`

`grep getUsers` по кодовой базе:

```
services/dataService.js:610   — другая копия в legacy-классе
services/dataService.js:1491  — основная (текущая)
App.jsx:109                   — init() в useEffect
App.jsx:174                   — handleLogin после setCurrentUser
App.jsx:411                   — onRefreshUsers в AdminPanel (только админ)
services/pvlMockApi.js:1061   — mock
services/pvlMockApi.js:1075   — mock
```

Три точки входа в боевом коде: `init()`, `handleLogin()`, `AdminPanel.onRefreshUsers`. Разбираем каждую.

### App.jsx init() — критичный путь

```js
// App.jsx:98-133
useEffect(() => {
    const init = async () => {
        try {
            const user = await api.getCurrentUser();
            if (!user) {
                setLoading(false);
                return;             // ← АНОНИМНЫЙ ВЫХОД, getUsers НЕ вызывается
            }
            setCurrentUser(user);

            const [allUsers, kb, settings, newsData] = await Promise.all([
                api.getUsers(),     // ← вызывается ТОЛЬКО если user был в localStorage
                api.getKnowledgeBase(),
                api.getLibrarySettings(),
                api.getNews(),
            ]);
            …
```

`api.getCurrentUser()` (строка 600 dataService) — **читает из `localStorage.getItem('garden_currentUser')`, не делает сетевых запросов**. Если null → ранний return без `getUsers()`.

`getAuthToken()` тоже из `localStorage.getItem('garden_auth_token')` (строка 20). User в localStorage есть тогда и только тогда, когда раньше был успешный логин, который записал и user, и token.

**Вывод: на анонимном старте (user в localStorage нет) `profiles` вообще не запрашивается.** Чистка SELECT-дублей не сломает анонимный путь.

### App.jsx handleLogin() — после login

```js
// App.jsx:156-204
const handleLogin = async (authData) => {
    …
    user = await api.login(authData.email, authData.password);    // ← устанавливает token в localStorage
    …
    setCurrentUser(user);
    …
    const [allUsers, …] = await Promise.all([
        api.getUsers(),    // ← после login token уже в localStorage
        …
    ]);
};
```

`api.login()` обязан установить токен. Если установил — `postgrestFetch` пошлёт `Authorization: Bearer <token>` → политика `profiles_select_authenticated` пройдёт.

### App.jsx AdminPanel.onRefreshUsers — только для админа

```js
// App.jsx:410-414
: (currentUser.role === 'admin' && viewMode !== 'app') ? <AdminPanel … onRefreshUsers={async () => {
    const allUsers = await api.getUsers();
    …
```

Условие рендеринга — `currentUser.role === 'admin'`. У админа token обязан быть.

### `postgrestFetch` без токена

```js
// services/dataService.js:37-96
const tryBearer =
    !POSTGREST_SKIP_JWT && !postgrestJwtDisabledAfterPgrst300 && Boolean(getAuthToken());
…
if (includeBearer && !POSTGREST_SKIP_JWT && !postgrestJwtDisabledAfterPgrst300) {
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
}
```

Bearer прилагается только если:
- `VITE_POSTGREST_SKIP_JWT` не установлен (на проде не установлен — см. v2);
- флаг `postgrestJwtDisabledAfterPgrst300` не выставлен глобально;
- `getAuthToken()` возвращает непустую строку из localStorage.

Если ни одно условие не выполнено → запрос идёт **анонимно** под ролью `web_anon`. Сейчас под `Map_View_All` это работает; после чистки — вернёт пустой массив (политика `profiles_select_authenticated` проверяет `auth.uid() IS NOT NULL`, для `web_anon` → false).

### Сценарии «getUsers под web_anon» после чистки

| Сценарий | Сейчас | После чистки |
|---|---|---|
| Анонимный пользователь (user=null в localStorage) | `getUsers` не вызывается | `getUsers` не вызывается |
| Залогиненный с валидным токеном | возвращает все 59 профилей | возвращает все 59 профилей (через `profiles_select_authenticated`) |
| **Залогиненный, но `garden_auth_token` пуст / устарел** | возвращает все 59 (через `Map_View_All`) | возвращает **пустой массив** |
| Любой запрос с PGRST300-fallback (флаг включился где-то в сессии) | возвращает все 59 | возвращает **пустой массив** |

Третий и четвёртый сценарии — **тот самый минорный риск.** Это не падение приложения (фронт получит `[]`, а не ошибку), но «список пользователей пуст» в UI.

### Карта (Map view) — не делает свой fetch

```
views/MapView.jsx:114
const MapView = ({ users, currentUser, onOpenLeader }) => { … }
```

`users` приходит **пропсом** из `UserApp`, который получает его из `App.jsx`. Своего запроса к `profiles` `MapView` не делает. То есть имя политики `Map_View_All` (`qual=true` SELECT) — это исторический namespace для «карты ведущих», но фактически карта читает уже подгруженный `users` state. Если state пуст (см. сценарий выше) — карта будет пуста, но не упадёт.

### `LeaderPageView` и публичные ссылки

```
views/LeaderPageView.jsx:440 — publicScenarios.slice(0, 4).map(…)
```

`publicScenarios` приходит пропсом, не fetchится. Никаких прямых запросов к `profiles` без auth здесь нет. Если в проекте есть публичная ссылка на профиль ведущей (по slug/id) — она шла бы через те же `users`, уже загруженные после логина. Анонимного публичного просмотра карты по URL у залогиненных, но без токена — нет в коде.

### Итог по задаче 3

**Чистка 3 SELECT-политик `qual=true` (Map_View_All, Public View, Public profiles are viewable by everyone.) безопасна для анонимного старта.** Анонимных запросов к `profiles` фронт не делает. Единственное «но» — рассинхрон localStorage (user без токена) или PGRST300-fallback. В этом случае залогиненный получит пустой список — UI пустоват, но не падает.

---

## Что неожиданно

1. **«Участница» с placeholder UUID `33333…01`.** Тестовая запись в проде, не на dev. Не попадает под политику B (никто не залогинится с таким `auth.uid()`), но засоряет реестр PVL. Стоит запланировать очистку отдельной задачей.

2. **Триггер `pvl_sync_notification_compat` синкает только legacy-колонки контента (kind/type, body/text/title, role/recipient_role), но НЕ адресацию.** То есть `pvl_notifications` — это смесь двух дизайнов: «легаси по контенту, новый по адресации». Для шаблона D это означает, что предикат либо избыточен (OR по 3 колонкам), либо требует выбора одной обязательной — но это решение должен принять владелец, на текущих 0 строк не проверить.

3. **PVL-студенты ≡ «абитуриенты» в `profiles`** — все 22 совпавших имеют `role='applicant'`. Это согласуется с бизнес-логикой `Абитуриент → Стажер → Ведущая` из CLAUDE.md: PVL — это путь именно для абитуриентов. Никто не повышает роль автоматически после сертификации (`status='certified'` в `pvl_students` не транслируется обратно в `profiles.role` в БД — только если есть отдельный flow).

4. **`api.getCurrentUser()` — это `JSON.parse(localStorage)`, не сетевой запрос.** Это критично для понимания init flow: проверка «залогинен ли» происходит на клиенте без обращения к auth-сервису. Минус: если token истёк, а user в localStorage остался — фронт думает что залогинен, но запросы под Bearer падают. Но это известный паттерн, отдельный таймер `useEffect` (App.jsx:135) каждые 60 сек делает `api.getCurrentUser()` (а внутри — `authFetch('/auth/me')` где-то рядом по логике, проверим если нужно).

5. **`postgrestJwtDisabledAfterPgrst300`-флаг — глобальный sticky-bit.** Если он выставился один раз в сессии (PGRST300 по любому запросу) — все последующие запросы идут анонимно. Это резервный механизм («если PostgREST не понимает наш JWT, не падать совсем»), но он же — путь анонимного SELECT'а. На сегодняшнем проде PGRST300 не должно быть (auth-сервис и PostgREST один JWT-secret), но если когда-то рассинхронятся — всё фронт-приложение мгновенно станет анонимным.

6. **В коде есть legacy-fallback на таблицу `users` (`_resolveGoalsUserId`, строки 2589-2606).** Идея: если `goals.user_id` ссылается на старую `public.users`, попробовать туда. Проверить, существует ли `public.users` сейчас — отдельный вопрос, но эта ветка может попытаться сделать SELECT к **отсутствующей** или **другой** таблице. К `profiles`-чистке не относится, но фрагмент legacy.

7. **`pvlMockApi.js:1242` упоминает `'profiles'`** — это mock-режим (`VITE_USE_LOCAL_DB=true`). На проде неактивен (см. v2). Не риск.

---

## Открытые вопросы / blockers

1. **Тестовая «Участница» (`33333…-01`) — что с ней делать?** Можно: (a) удалить, (b) перевести в `status='archived'`, (c) оставить. После включения RLS она автоматически невидима (никто с таким `auth.uid()` не существует), но её увидят админ и ментор по шаблону C. Нужно решение владельца.

2. **`pvl_notifications` — обязательная колонка адресации?** До прояснения — предикат шаблона D пишется через OR по 3 колонкам. Если владелец/код-флоу скажет «всегда заполняется только `user_id`» — можно сузить.

3. **Что если фронт после чистки получит пустой `users`-массив из-за токен-рассинхрона?** Симптом: UI-список «нет пользователей», карта пустая. Минимальный фикс — на стороне фронта добавить проверку «если `users.length === 0` после успешного login — повторно `getCurrentUser()` чтобы обновить токен и retry». Это вне scope чистки RLS, но стоит зафиксировать.

4. **`api.getCurrentUser()` возвращает данные из localStorage без проверки токена.** Если токен истёк, user в state, getUsers идёт без Bearer → пустой массив. На текущих политиках это маскируется через `Map_View_All`. После чистки — выйдет наружу. Сценарий редкий (60-секундный таймер регулярно дёргает auth-сервис), но возможный при долгом простое.

5. **Подтвердить отсутствие `VITE_POSTGREST_SKIP_JWT=true` на проде.** В v2 показано, что в `.github/workflows/deploy.yml` этой переменной нет — но если кто-то прокинул её через GitHub Secret и она читается из env на runtime, то Bearer вообще не отправляется, и **все запросы прода идут под web_anon**. Тогда чистка SELECT-дублей реально сломает залогиненного: его `getUsers()` станет анонимным. Способ удостовериться — либо в браузере DevTools → Network → Headers (увидеть `Authorization: Bearer …`), либо проверить переменные на CI/secret-store. Это вне read-only-сессии.

6. **DROP-очерёдность.** `profiles` сейчас имеет 14 политик `PERMISSIVE` (OR). После DROP трёх SELECT'ов с `qual=true` — остаётся одна `profiles_select_authenticated`. Между DROP'ами одного и тем же SELECT'а нет «окна неработоспособности», потому что оставшиеся `qual=true` ещё пускают. Но если делать DROP в одну транзакцию — вообще без окна. Рекомендация: один `BEGIN; DROP …; DROP …; DROP …; COMMIT;`.

7. **Отдельная заметка:** в коде есть file `database/pvl/notes/garden-profiles-rls-for-pvl-sync.md` (упомянут в комментарии `dataService.js:1490`). Если он существует — там, возможно, уже был накоплен анализ RLS для синхронизации PVL ↔ profiles. Стоит прочитать перед написанием SQL — может, часть работы уже продумана.
