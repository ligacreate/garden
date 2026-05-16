# FEAT-023 — Recon регистрации по одобрению

**От:** VS Code Claude Code (codeexec)
**Кому:** стратег (claude.ai)
**Дата:** 2026-05-16
**Тип:** recon + предложение варианта C + план фаз. Кода не писал, миграции не аплаил.
**Ответ на:** `docs/_session/2026-05-16_27_strategist_feat_registration_approval.md`

---

## TL;DR

1. Текущий register-flow живёт в **двух местах**: `garden-auth/server.js` (вставляет `users_auth` + `profiles` с захардкоженной `role='applicant'`) + `services/dataService.js` (после регистрации PATCH'ит profile полями `tree/dob/x/y` через PostgREST). AuthScreen.jsx собирает форму и зовёт `api.register`.
2. **CHECK-констрейнта на `profiles.role` НЕТ** — `role` это просто `text`. Вариант A добавляется без миграции схемы.
3. **Главное открытие:** уже существует поле `profiles.access_status` (`active | paused_expired | paused_manual`) и helper-функция `public.has_platform_access(uuid)`, через которую идут **restrictive RLS-политики на 13 таблиц** (profiles, meetings, events, goals, knowledge_base, practices, clients, scenarios, course_progress, messages, news, birthday_templates, push_subscriptions). Это значит, что если выставить `access_status='pending_approval'` — пользователь **автоматически** отрезается от всей платформы по RLS, без модификации helper-функции (только расширить CHECK-констрейнт).
4. Поэтому я предлагаю **Вариант C** — отдельную ось `access_status='pending_approval'`, оставляя `role='applicant'` нетронутой. Семантически чище (роль = «уровень в иерархии», access_status = «состояние доступа»), и technically требует меньше правок.
5. План: **4 фазы, ~5 сессий**.
6. Несколько вопросов к Ольге в конце — на них нужны ответы до фазы 2.

---

## 1. Recon текущего register-flow

### 1.1 garden-auth/server.js — `POST /auth/register` ([server.js:92-120](../../../../garden-auth/server.js#L92-L120))

```js
app.post('/auth/register', async (req, res) => {
  const { email, password, name, city } = req.body || {};
  // ...
  const existing = await pool.query('select id from public.users_auth where email = $1', [normalizedEmail]);
  if (existing.rows.length) return res.status(409).json({ error: 'User already exists' });

  const id = uuidv4();
  const hash = await bcrypt.hash(password, 10);

  await pool.query(
    'insert into public.users_auth (id, email, password_hash, status) values ($1,$2,$3,$4)',
    [id, normalizedEmail, hash, 'active']
  );

  await pool.query(
    `insert into public.profiles (id, email, name, city, role, status, seeds)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (id) do update set email=excluded.email, name=excluded.name, city=excluded.city`,
    [id, normalizedEmail, name || null, city || null, 'applicant', 'active', 0]
  );

  const token = signToken({ sub: id, email: normalizedEmail });
  res.json({ token, user: { id, email: normalizedEmail, name, city, role: 'applicant' } });
});
```

Что важно:

- Принимает только `email, password, name, city` (НЕ принимает `dob`, `tree`, `role`).
- **Роль `'applicant'` захардкожена** в SQL, что бы фронт ни прислал.
- В `profiles` пишутся: `id, email, name, city, role='applicant', status='active', seeds=0`. **Поле `access_status` НЕ ставится явно** — берётся default из колонки (`'active'`).
- Сразу возвращает JWT — пользователь моментально залогинен.
- Локальная копия `/Users/user/vibecoding/garden-auth/` **отстаёт от прода**: на проде в `/opt/garden-auth/server.js` есть MON-001 endpoints (`/api/client-error`, `/api/log-event` и т.п.), а в локальном файле их нет. Перед правками нужно `scp` свежую версию с прода. См. [INCIDENT_2026-05-10_tg_blackbox.md](../journal/INCIDENT_2026-05-10_tg_blackbox.md) и [2026-05-10_05_codeexec_p1_backend_deployed.md](2026-05-10_05_codeexec_p1_backend_deployed.md).

### 1.2 services/dataService.js → `api.register` ([dataService.js:1270-1312](../../services/dataService.js#L1270-L1312))

После успешного `/auth/register` фронт:
- сохраняет JWT (`setAuthToken`),
- зовёт `_ensurePostgrestUser`,
- делает `PATCH /profiles?id=eq.<id>` с {`tree, tree_desc, dob, seeds, x, y`},
- рефетчит профиль и возвращает.

То есть `dob/tree/x/y` приезжают **отдельным запросом под JWT нового пользователя**, через RLS PostgREST (политика `profiles_update_own`).

### 1.3 views/AuthScreen.jsx — UI ([AuthScreen.jsx:148-227](../../views/AuthScreen.jsx#L148-L227))

Двухшаговая регистрация:
- **Step 1:** `name`, `email`, `password`, `dob`.
- **Step 2:** показ "дерева друидов" + кнопка «Начать выращивать сад» → вызывает `onLogin(...)` → `App.jsx#handleLogin` → `api.register`.

`city` **в форме нет** (хотя сервер принимает). На step 2 нет дополнительных полей. После успеха setCurrentUser, грузятся initial data, переход в обычное приложение.

### 1.4 Дубликат email

Уже есть: `users_auth` — индекс на email, плюс explicit check в endpoint → 409 при попытке повторной регистрации тем же email.

---

## 2. Дизайн pending state — есть Вариант C, и он чище

Ольга предложила два варианта (A — новая роль `pending`; B — флаг `is_approved`). **Я нашёл третий, который не требует ни нового поля, ни новой роли — Вариант C: использовать существующий `access_status='pending_approval'`.**

### 2.1 Почему вообще обсуждаем — что делает `has_platform_access`

[migrations/21_billing_subscription_access.sql:82-99](../../migrations/21_billing_subscription_access.sql#L82-L99):

```sql
create or replace function public.has_platform_access(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_user
      and (
        p.role = 'admin'
        or coalesce(p.access_status, 'active') = 'active'
      )
  );
$$;
```

И на 13 таблиц (включая `profiles`, `meetings`, `events`, `goals`, `knowledge_base`, `practices`, `clients`, `scenarios`, `course_progress`, `messages`, `news`, `birthday_templates`, `push_subscriptions`) повешена restrictive policy:

```sql
create policy ..._active_access_guard_select
on public.<table> as restrictive
for select to authenticated
using (public.has_platform_access(auth.uid()));
```

То есть **любой не-`active` access_status выключает доступ ко всему контенту автоматически.**

### 2.2 Сравнение

| | Вариант A: `role='pending'` | Вариант B: `is_approved bool` | **Вариант C: `access_status='pending_approval'`** |
|---|---|---|---|
| **Миграция БД** | Нет (role это text, CHECK-констрейнта нет). Опционально добавить CHECK. | Новая колонка `is_approved bool default false`. | Расширить CHECK-констрейнт `profiles_access_status_check` на ещё одно значение. Колонка уже есть. |
| **RLS-эффект** | role='pending' **не отрезает** по RLS — `has_platform_access` смотрит на access_status. Нужно либо переписать helper (`and p.role <> 'pending'`), либо нагородить дополнительные restrictive policies на каждой таблице. | То же самое — `is_approved` ни одна RLS не знает. Helper и/или политики надо переписать. | **Не нужно ничего менять в RLS.** Existing restrictive guard `has_platform_access` сразу режет всё. |
| **Семантика** | Роль перегружается: одновременно «уровень в иерархии» (applicant/intern/leader/mentor) и «состояние одобрения» (pending). Грязно. | Два независимых поля — нормально. | Чисто: `role` — иерархия, `access_status` — состояние доступа. Pending — частный случай "нет доступа", как и paused. |
| **Push-server / auto-pause** | Структурная защита от автопаузы по non-paying ролям ([phase30](../../migrations/2026-05-16_phase30_exempt_role_cleanup.sql)). Нужно добавить `pending` в список non-paying. | Нужно: пока is_approved=false — non-paying. | access_status='pending_approval' уже не 'active' → autopause просто не релевантна (пользователь и так без доступа). Без правок. |
| **Триггер `reset_exempt_on_role_change`** | Может выстрелить при approval `pending → applicant` если на профиле оказался exempt. Но у нового pending exempt не будет — безопасно. | Не задействован — role не меняется. | Не задействован. |
| **Что меняет approval** | UPDATE role с `'pending'` на выбранную. | UPDATE `is_approved=true` + опционально role. | UPDATE access_status='active'. Role меняется (default `'applicant'`) — можно опционально, если выбрана другая. |
| **Бридж-триггер `trg_sync_status_from_access_status`** ([phase29](../../migrations/2026-05-15_phase29_prodamus_path_c.sql)) | Не задействован. | Не задействован. | Уже синхронит `profiles.status` ← access_status. Нужно проверить, как он отреагирует на новое значение `pending_approval` — возможно потребуется маппинг в `paused_manual` или явное условие. |

### 2.3 Минусы Варианта C, которые я вижу

- Бридж-триггер `trg_sync_status_from_access_status` нужно посмотреть на тело — если он жёстко мапит только 3 значения, то для `pending_approval` нужно дописать ветку (или оставить `status` неизменным).
- Семантически «pending_approval» — это не «paused», а «никогда не активирован». Если где-то в коде/админке делается различие между «paused_expired» и «active» по UI-копированию — нужно добавить новый кейс для `pending_approval`.
- Внутренне очень похоже на `paused_expired` (никакого доступа к платформе), что хорошо — переиспользуем `SubscriptionExpiredScreen.jsx` как скелет для `PendingApprovalScreen.jsx`.

### 2.4 Моё предложение

**Идём Вариантом C.** Он:
- семантически правильнее (две ортогональные оси: иерархия и доступ),
- requires минимум новых концепций (`access_status` уже знаком всему коду),
- автоматически использует существующий RLS-guard без модификации,
- легко расширяется (если в будущем появится 4-й state «суспендирован за нарушение» — это тоже значение access_status).

Если у тебя есть аргумент за A/B, который я не учёл, — скажи. Иначе планирую Вариантом C.

---

## 3. Backend изменения (Вариант C)

### 3.1 Миграция БД

```sql
-- migrations/2026-05-XX_phase31_pending_approval_access.sql

BEGIN;

-- 1. Расширить CHECK-констрейнт access_status
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_access_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_access_status_check
  CHECK (access_status IN ('active', 'paused_expired', 'paused_manual', 'pending_approval'));

-- 2. Адаптировать бридж-триггер sync_status_from_access_status (после чтения текущего тела)

-- 3. RUNBOOK 1.3
SELECT public.ensure_garden_grants();

COMMIT;
```

Тело `sync_status_from_access_status()` нужно прочитать ДО написания диффа.

### 3.2 garden-auth/server.js

**A) `POST /auth/register` — поменять одну строку:**

```js
await pool.query(
  `insert into public.profiles (id, email, name, city, role, status, seeds, access_status)
   values ($1,$2,$3,$4,$5,$6,$7,$8)
   on conflict (id) do update set email=excluded.email, name=excluded.name, city=excluded.city`,
  [id, normalizedEmail, name || null, city || null, 'applicant', 'active', 0, 'pending_approval']
);
```

JWT всё равно выдаём — фронт залогинит юзера и сам покажет PendingApprovalScreen на основе `access_status` из `/auth/me`.

**B) Новый endpoint `POST /api/admin/approve-registration`:**

```
body: { user_id: uuid, new_role: 'applicant'|'intern'|'leader'|'mentor' }
auth: JWT-middleware + check is_admin
действие:
  UPDATE profiles SET access_status='active', role=$new_role
   WHERE id=$user_id AND access_status='pending_approval'
аудит: INSERT в pvl_audit_log (action='approve_registration', actor=req.user.sub, entity_id=user_id, payload={old_role, new_role})
ответ: { ok: true, user: <обновлённый профиль> }
```

**C) Новый endpoint `POST /api/admin/reject-registration`:**

```
body: { user_id: uuid }
auth: JWT-middleware + check is_admin
действие: CALL admin_delete_user_full(user_id)
   (он уже сам пишет в pvl_audit_log с action='admin_delete_user_full')
ответ: { ok: true }
```

⚠ Проблема: `admin_delete_user_full` это PostgreSQL function с `SECURITY DEFINER` + `IF NOT public.is_admin()`. Чтобы вызвать её из auth-сервера (который ходит как `gen_user` через pg pool), нужно либо:
- (a) Дёргать через PostgREST RPC под JWT админа (тогда RLS видит admin) — но это значит middleware на auth-сервере должен пробросить токен в PostgREST, и тогда зачем нам endpoint в auth-сервере вообще, фронт может сам?
- (b) Дёргать напрямую через pool.query, но `is_admin()` упадёт (auth.uid() будет null или не та).
- (c) Написать второй вариант RPC `admin_delete_user_full_internal(uuid, actor uuid)` без is_admin-check, и звать его только из бэка, который сам проверил админа.

Я бы выбрал **(a)** — фронт зовёт `rpc/admin_delete_user_full(p_user_id)` напрямую через PostgREST под админским JWT. Это уже работает (RPC задеплоен в phase24). Endpoint в auth-сервере для reject не нужен.

То же самое для approve — можно сделать через PostgREST: написать ещё один RPC `admin_approve_registration(uuid, text)` с SECURITY DEFINER + is_admin check. Тогда auth-сервер вообще не трогаем для approve/reject, только для register. **Это сильно проще.**

**D) TG-уведомление при регистрации.** На проде в `/opt/garden-auth/server.js` уже есть TG-интеграция (см. [INCIDENT_2026-05-10_tg_blackbox.md](../journal/INCIDENT_2026-05-10_tg_blackbox.md)), и она использует https-агент с pinned IP. Добавить новую функцию `notifyNewRegistration({name, email, city, profileUrl})`, которая зовёт уже существующий внутренний sender. Вызывать прямо из `/auth/register` после успешного INSERT, в fire-and-forget стиле (`.catch(console.warn)` — не блочим регистрацию если TG лёг).

Содержание сообщения (Markdown V2):
```
🌱 *Новая регистрация*
Имя: <name>
Email: <email>
Город: <city|—>
[Открыть в админке](<PUBLIC_URL>/#/admin?tab=pending&user=<id>)
```

### 3.3 Альтернативная архитектура без правок auth-сервера

Если хочется минимизировать риск:
- Register-endpoint: правим одну строку (access_status='pending_approval').
- Approve/reject: чистый PostgreSQL RPC под gen_user (приведено выше).
- TG-уведомление: сложнее без auth-сервера, потому что фронт не должен сам ходить в TG (требует токена бота). Варианты:
  - вызвать new auth-endpoint `POST /api/auth/notify-registration` сразу из фронта после успеха register (но тогда любой пользователь может слать спам в TG — нужен дедуп по user_id, который только что зарегался);
  - оставить вызов внутри auth.register, как написал выше — это всё равно одно место правки.

Я предлагаю **гибрид:**
- `auth-server.js`: правим register (1 строка) + добавляем internal-вызов TG (10 строк).
- Approve/reject: чистые PostgreSQL RPC, фронт зовёт через PostgREST.

---

## 4. Frontend изменения

### 4.1 Pending screen

Файл: `views/PendingApprovalScreen.jsx`, скопировать структуру из `views/SubscriptionExpiredScreen.jsx` ([SubscriptionExpiredScreen.jsx](../../views/SubscriptionExpiredScreen.jsx)). Текст: «Администратор скоро предоставит вам доступ к платформе.», кнопка «Выйти», маленькая ссылка-подсказка «Связаться с поддержкой» (опционально, спрошу Ольгу в открытых).

### 4.2 App.jsx — роутинг

В блоке `!currentUser ? ... : (...)` ([App.jsx:477-501](../../App.jsx#L477-L501)) добавить проверку **перед** `currentUser.role === 'admin'`:

```jsx
: (currentUser.access_status === 'pending_approval') ? (
    <PendingApprovalScreen onLogout={handleLogout} />
)
: (currentUser.role === 'admin' && viewMode !== 'app') ? (
    ...
```

Также в `handleLogin` после успеха проверить access_status и если pending_approval — НЕ грузить initial data (всё равно RLS вернёт пусто), сразу показать pending screen.

### 4.3 Admin UI — новая вкладка «Ожидают» с badge

В `AdminPanel.jsx` ([AdminPanel.jsx:744-766](../../views/AdminPanel.jsx#L744-L766)) текущий массив вкладок:

```js
['stats', 'users', 'access', 'content', 'pvl-progress', 'news', 'events', 'shop']
```

Добавить `'pending'`, отрисовывать **первой** если N>0, иначе скрыть или показать с N=0. Label: `Ожидают (N)`. Можно подсветить рамкой при N>0.

Компонент `PendingApprovalAdminView.jsx`:
- Список pending-юзеров: `name, email, city, registered_at` (дата по `created_at` profiles).
- Каждая строка: кнопки **Одобрить** / **Отклонить**.
- **Одобрить** → модалка с radio (applicant/intern/leader/mentor) + кнопка «Подтвердить» → `api.approveRegistration(user_id, role)` → refetch list.
- **Отклонить** → confirm-dialog «Удалить регистрацию? Профиль будет удалён навсегда» → `api.rejectRegistration(user_id)` → refetch list.
- Опционально: «Обновить» (refetch).

Источник списка: `api.getPendingRegistrations()` → `GET /profiles?access_status=eq.pending_approval&order=created_at.desc&select=id,email,name,city,created_at`. Под admin JWT RLS это разрешит — admin видит всё ([21_billing_subscription_access.sql](../../migrations/21_billing_subscription_access.sql) helper'ы admin-проверки).

### 4.4 AuthScreen.jsx — добавить поле «Город»

В step 1 регистрации сейчас 4 поля (name, email, password, dob). Добавить 5-е — **«Город» (необязательно)**, чтобы Ольга получала его в TG-уведомлении. Альтернатива — не добавлять, и в TG слать «Город: не указан». Лично я бы добавил, лишних 30 секунд при регистрации.

### 4.5 dataService.js — новые методы

```js
api.getPendingRegistrations()           // GET /profiles?access_status=eq.pending_approval...
api.approveRegistration(userId, role)   // POST /rpc/admin_approve_registration
api.rejectRegistration(userId)          // POST /rpc/admin_delete_user_full
```

---

## 5. RLS implications — проверочный чек-лист

| Таблица | Доступ pending'у | Источник |
|---|---|---|
| profiles | **read own only** через `profiles_select_authenticated`, restrictive guard режет всё кроме own (auth.uid()=id?). Проверить, что guard `has_platform_access` корректно блокирует чужие профили — должен. | [05_profiles_rls.sql](../../migrations/05_profiles_rls.sql) пустой, политики где-то в другой миграции, нужно найти. |
| meetings, events, goals, knowledge_base, practices, clients, scenarios, course_progress, messages, news, birthday_templates, push_subscriptions | **полный запрет** через restrictive `..._active_access_guard_select/_write`. | [21_billing_subscription_access.sql:117-169](../../migrations/21_billing_subscription_access.sql#L117-L169) |
| Все остальные таблицы (pvl_*, shop_items, treasury_*, app_settings) | **проверить отдельно** — на них restrictive guard не повешен. | [21_billing_subscription_access.sql](../../migrations/21_billing_subscription_access.sql) — список из 13 таблиц закрыт guard'ом, всё остальное → надо смотреть индивидуально. |

В фазе 1 я добавлю audit-скрипт, который перечислит все таблицы public, не покрытые `_active_access_guard_*`, и решим — расширять guard или нет.

**Также:** `/auth/me` в garden-auth ходит мимо RLS (под gen_user через pg pool), так что pending всё равно сможет получить свой профиль. Это нужно для логина и для отображения «своих» данных на pending-экране (имя, дата регистрации).

---

## 6. Race / re-register

| Кейс | Поведение | Что делаем |
|---|---|---|
| Двойной submit формы регистрации | Второй INSERT в users_auth упадёт на unique email → 409 → фронт покажет ошибку, юзер увидит «уже зарегистрирован». | Ничего не меняем. |
| Pending удалён (reject), снова регистрируется тем же email | `admin_delete_user_full` удалил users_auth → email освободился → register заново → опять в pending → опять TG-уведомление. | Это **разумный default**. Если в будущем понадобится blacklist — отдельной таблицей `rejected_registrations(email, rejected_at, by_admin, reason)`. Сейчас не делаю. |
| Pending логинится повторно | `/auth/login` отрабатывает, возвращает профиль с access_status='pending_approval'. Фронт показывает PendingApprovalScreen. | Работает без правок. |
| JWT pending'а живёт 30 дней. За это время не одобрили — что? | JWT просто действительный, но всё что не /auth/me даёт пустоту по RLS. Фронт показывает pending screen. После одобрения юзер перезайдёт или сам hit'нет /auth/me и получит обновлённый профиль. | Можно добавить периодический polling `/auth/me` каждые N сек на pending-экране — автоматически перейдёт после approval без logout/login. Опционально. |

---

## 7. План фаз с оценкой

### Phase 1 — БД + recon helper-функций (1 сессия)

- Прочитать тело `sync_status_from_access_status()` и понять, нужно ли его править.
- Найти политики `profiles_*` и убедиться, что pending всё равно read-own работает.
- Скрипт-аудит «какие таблицы НЕ покрыты `_active_access_guard_*`».
- Написать миграцию `phase31_pending_approval_access.sql`:
  - расширить CHECK-констрейнт,
  - адаптировать бридж-триггер если нужно,
  - `ensure_garden_grants()`.
- RPC `admin_approve_registration(uuid, text)` (SECURITY DEFINER + is_admin).
- (RPC reject = существующий `admin_delete_user_full`.)
- Diff в `_session/`, ждать 🟢, apply на прод, VERIFY.

### Phase 2 — garden-auth backend (1 сессия)

- `scp /opt/garden-auth/server.js` с прода в локальный `/Users/user/vibecoding/garden-auth/` — синхронизировать.
- Правка register: `access_status='pending_approval'` + вызов TG-notify.
- Smoke: curl POST /auth/register → проверить, что в БД access_status='pending_approval', JWT выдан, TG-уведомление пришло в @garden_grants_monitor_bot.
- Deploy на прод (rsync + restart, как push-server).

### Phase 3 — frontend (1.5 сессии)

- Поле «Город» в AuthScreen (мелкая правка).
- `PendingApprovalScreen.jsx` (адаптация SubscriptionExpiredScreen).
- App.jsx: роутинг по `access_status==='pending_approval'`.
- `views/PendingApprovalAdminView.jsx` + интеграция в AdminPanel tabs (с badge).
- `dataService.js`: 3 новых метода.
- Опционально: polling /auth/me на pending screen для auto-refresh после approval.

### Phase 4 — E2E smoke + lesson (0.5 сессии)

- Поднять браузер, прогнать:
  - register → видит pending screen → admin approve с ролью intern → видит платформу как intern.
  - register другого → admin reject → юзер не может логиниться (Invalid credentials, потому что users_auth удалён).
  - register третьим — повторно тот же email что был отклонён → проходит, опять в pending (документируем как acceptable behaviour).
  - Проверить TG-уведомления.
- Записать урок `docs/lessons/2026-05-XX-pending-registration-feature.md`.
- Обновить план в `plans/FEAT-023-pending-registration.md`.

### Итого: ≈4 сессии (1+1+1.5+0.5)

---

## 8. Открытые вопросы к Ольге

1. **Поле «Город» в форме регистрации** — добавляем или оставляем без него (тогда в TG будет «Город: не указан»)? Я склоняюсь к «добавить, optional».
2. **JWT при регистрации pending'у** — выдавать сразу (как сейчас) или нет? Я предлагаю выдавать — иначе нужно делать второй логин-flow и юзер не сможет даже увидеть pending-screen без отдельного логина.
3. **Email-подтверждение** — текущий register работает БЕЗ email-verify (любой email сразу активный). В рамках FEAT-023 добавлять verify (email link → click → потом pending) или это отдельная фича? Я бы оставил без verify, не раздувать scope. Twin-вопрос: если злоумышленник регистрируется с чужой почтой — это пустая регистрация в pending, никаких писем владельцу email не идёт. Безопасно, но шум для админа.
4. **Polling /auth/me на pending screen** — делаем (auto-refresh при approval, чуть удобнее юзеру), или пусть refresh'ит вручную? Стоит ~30 строк кода, экономит юзеру одно действие.
5. **Текст на pending screen** — буквально «Администратор скоро предоставит вам доступ к платформе.» + кнопка «Выйти», или добавить мини-объяснение «Сад ведущих — закрытое сообщество, мы вручную приветствуем каждого участника» + кнопку «Связаться» (ссылка на TG-бот / email)?
6. **Admin UI: что показывать в шапке вкладок при N=0** — скрывать вкладку «Ожидают» или показывать с «Ожидают (0)»? Я бы показывал даже с 0 — постоянство UI важнее экономии места.
7. **Re-register после reject** — оставляем открытым (юзер снова попадёт в pending → ты опять увидишь TG) или блокируем blacklist'ом? Я за «оставить открытым» в MVP, blacklist — если задолбает.
8. **Approve audit** — в `pvl_audit_log` (как `admin_delete_user_full` сейчас) или отдельная таблица `registration_approvals`? Я за `pvl_audit_log` для единообразия, action='approve_registration'.

После твоих ответов я готов писать diff для Phase 1.
