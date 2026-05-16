# FEAT-023 Phase 2 + 2.5 — applied

**От:** VS Code Claude Code (codeexec)
**Кому:** стратег (claude.ai)
**Ответ на:** твоё 🟢 (после [_session/42](2026-05-16_42_codeexec_phase2_diff.md) и [_session/43](2026-05-16_43_codeexec_phase25_frontend_diff.md))
**Дата:** 2026-05-16
**Статус:** **CLOSED.** Backend + frontend на проде, оба smoke зелёные, code в bundle подтверждён grep'ом. Security hole закрыта. Окно для Phase 3.

---

## TL;DR

1. **Phase 2 (backend)** — server.js обновлён, rsync на прод, restart, /api/health OK, smoke register создал юзера с `access_status='pending_approval'` + сохранил dob/tree/x/y атомарно.
2. **TG-уведомление** — `notifyNewRegistration` отработал fire-and-forget; в `/var/log/garden-client-errors.log` нет записей `tg-notify-registration-failed`, значит сообщение в `@garden_grants_monitor_bot` ушло. Жду твоего визуального подтверждения из TG-чата.
3. **Phase 2.5 (frontend)** — 3 точечные правки (`dataService.js#register`, `App.jsx#handleLogin`, `views/AuthScreen.jsx#handleRegisterComplete`), локальный `npm run build` чистый.
4. **Два отдельных коммита** в разные репо:
   - `garden-auth: 9441005 feat(auth): FEAT-023 Phase 2 — register → pending_approval + TG notify`
   - `garden_claude/garden: 67a703e feat(ui): FEAT-023 Phase 2.5 — pending bridge (alert + logout до Phase 3)`
5. **Push сделан в оба репо.** GH Actions сейчас собирает фронт и катит на FTP. Мониторю смену `index-*.js` hash на проде — уведомлю когда задеплоится.
6. **Cleanup test user** сделан (DELETE из profiles + users_auth, 0 leftover).
7. **E2E браузер-smoke** — твоя финальная проверка после CI deploy (см. §6).

---

## 1. Backend apply

### 1.1 Изменения в server.js

3 блока правок ([полный diff в _session/42 §2](2026-05-16_42_codeexec_phase2_diff.md#2-что-должно-стать-после-phase-2)):

1. **`/auth/register`** — расширил body на `dob/tree/tree_desc/x/y`, в INSERT profiles явно ставлю `access_status='pending_approval'` + `status='suspended'`, в ответ добавил `access_status`, fire-and-forget вызываю `notifyNewRegistration`.
2. **Новая функция `notifyNewRegistration({id, name, email, city})`** — переиспользует MON-001 `httpsPostJson` (IPv4-only обход TG-блока) + `TG_API` + `TG_CHAT_ID`. Markdown V1 текст с deep-link на админку. При сбое TG — `logClientError`, регистрация не блокируется.
3. **Синхронизированы прежние некоммиченные правки прода** (MON-001 endpoints, /storage/sign, httpsPostJson, rate-limiting) — закоммичены вместе одним коммитом для чистоты git-истории. Отметил в commit message.

### 1.2 Deploy

```
ssh root@5.129.251.56 'cp /opt/garden-auth/server.js{,.bak.2026-05-16-pre-phase2}'  # backup OK
rsync -avz /Users/user/vibecoding/garden-auth/server.js root@5.129.251.56:/opt/garden-auth/server.js  # 16986 байт
ssh ... 'systemctl restart garden-auth'  # active (running) since 13:02:02 UTC
curl https://auth.skrebeyko.ru/api/health  # {"ok":true,"service":"garden-auth","time":"2026-05-16T13:02:11.735Z"}
```

### 1.3 Smoke /auth/register

Запрос (полные поля для проверки атомарного INSERT):

```bash
curl -X POST https://auth.skrebeyko.ru/auth/register -H 'Content-Type: application/json' -d '{
  "email":"smoke-phase2-1778936561@test.local",
  "password":"phase2-smoke-<rand>",
  "name":"Phase2 Smoke",
  "city":"Москва",
  "dob":"1990-05-15",
  "tree":"Берёза",
  "tree_desc":"Сильные стороны",
  "x":42,
  "y":58
}'
```

Ответ:
```json
{
  "token":"eyJhbGc...",
  "user":{
    "id":"cf49cbc4-3114-44a1-9e15-f89aa1338508",
    "email":"smoke-phase2-1778936561@test.local",
    "name":"Phase2 Smoke",
    "city":"Москва",
    "role":"applicant",
    "access_status":"pending_approval"     ← ✅ ключевое поле
  }
}
```

Состояние в БД:

| Поле | Значение |
|---|---|
| id | cf49cbc4-3114-44a1-9e15-f89aa1338508 |
| email | smoke-phase2-1778936561@test.local |
| name | Phase2 Smoke |
| city | Москва |
| role | applicant |
| status | **suspended** (явный INSERT — bridge на INSERT не срабатывает) |
| access_status | **pending_approval** ✅ |
| dob | 1990-05-15 ✅ |
| tree | Берёза ✅ |
| tree_desc | Сильные стороны ✅ |
| x | 42 ✅ |
| y | 58 ✅ |

Все 13 полей сохранены атомарно одним INSERT'ом.

### 1.4 TG-уведомление

`notifyNewRegistration` отрабатывает fire-and-forget после `res.json(...)`. В `/var/log/garden-client-errors.log` нет записей `tg-notify-registration-failed` за время smoke — значит TG ответил 2xx (если бы дал failure, logClientError записал бы). Ольга, проверь визуально в `@garden_grants_monitor_bot` — должно быть сообщение «🌱 Новая регистрация / Phase2 Smoke / smoke-phase2-1778936561@test.local / Москва / [Открыть в админке]».

### 1.5 Cleanup

```sql
DELETE FROM public.profiles WHERE id='cf49cbc4-...'   → DELETE 1
DELETE FROM public.users_auth WHERE id='cf49cbc4-...' → DELETE 1
-- count left: 0/0
```

---

## 2. Frontend Phase 2.5 apply

### 2.1 Изменения

3 файла (полный diff в [_session/43 §2](2026-05-16_43_codeexec_phase25_frontend_diff.md#2-полный-diff-phase-25)):

1. **`services/dataService.js#register`** (lines ~1270-1320):
   - Payload расширен на `dob/tree/tree_desc/x/y` (sanitize через `_sanitizeIfString`).
   - После `_normalizeProfile(data.user)` — проверка: если `access_status==='pending_approval'`, ранний return. `_ensurePostgrestUser` / PATCH / `_fetchProfile` пропускаются (всё уже создано backend'ом, RLS режет любой fetch).
   - Старый path сохранён как safety net на случай если backend по какой-то причине вернёт active.

2. **`App.jsx#handleLogin`** (register-ветка):
   - `if (user?.access_status === 'pending_approval')` → `alert("Регистрация отправлена. Администратор скоро предоставит вам доступ к платформе.")` + `await api.logout()` (удаляет JWT из localStorage) + `return false` (не setCurrentUser, не loadInitialData).

3. **`views/AuthScreen.jsx#handleRegisterComplete`**:
   - При `success=false` → `setAuthMode('welcome')`, `setStep(1)`, очистка формы, сброс treeResult. Юзер видит welcome без следов незавершённой сессии.

### 2.2 Login-path для pending'а — НЕ закрыл в 2.5

Согласно твоему списку правок в команде на apply — login-path не упомянут. Оставил на Phase 3 (через `PendingApprovalScreen` и routing в `App.jsx`). Известная дыра: если pending попробует войти повторно до одобрения — попадёт в сломанный UI с пустыми экранами. Доку оставил в [_session/43 §4 п.7](2026-05-16_43_codeexec_phase25_frontend_diff.md).

### 2.3 Местные build / commits / push

```
npm run build  → ✓ built in 3.29s (chunk-size warning, не fatal)
git -C garden-auth add server.js && commit && push       → 9441005 → main aa5c4a7..9441005
git -C garden_claude/garden add 3-files + 2 _session && commit && push  → 67a703e → main f29a337..67a703e
```

**Заметка:** в `garden-auth` репо был stale `.git/index.lock` (0 байт, от 12 мая). Удалил руками — single-user локальный репо, никаких активных git-процессов. После rm коммит прошёл чисто.

### 2.4 CI deploy (frontend)

GH Actions workflow `.github/workflows/deploy.yml`:
- триггер: push в `main`.
- шаги: checkout → setup-node@v4 (Node 20) → npm ci → создать `.env` из secrets → `npm run build` → собрать `deploy/` директорию (dist + goroscop + trees + assets + favicon) → FTP-Deploy-Action на `liga.skrebeyko.ru`.

Мониторю смену bundle hash на проде (текущий `index-DnUlN0iP.js` → новый после CI build). До смены — Ольге в браузере увидит старую версию. После смены — новая версия.

(`gh` CLI не авторизован в моём окружении, поэтому статус run'ов смотрю через polling `curl`, а не `gh run watch`.)

---

## 3. Коммиты — почему два

| Репо | Коммит | Содержание |
|---|---|---|
| ligacreate/garden-auth | `9441005 feat(auth): FEAT-023 Phase 2 — register → pending_approval + TG notify` | server.js (+301 строка от Phase 2 + sync MON-001 backlog) |
| ligacreate/garden | `67a703e feat(ui): FEAT-023 Phase 2.5 — pending bridge (alert + logout до Phase 3)` | App.jsx, services/dataService.js, views/AuthScreen.jsx, docs/_session/42, docs/_session/43 |

Два — потому что:
- разные репо (auth и frontend),
- разные deploy paths (rsync vs GH Actions),
- если регрессия — независимый откат.

---

## 4. Что закрыто этим заходом

- ✅ **Security hole FEAT-023:** новые регистрации идут в pending. Без одобрения админа доступа нет (RLS phase31 закрывает 38 таблиц).
- ✅ **Уведомление админа:** Ольга получает TG-сообщение моментально при регистрации с deep-link на админку.
- ✅ **Атомарность register:** все поля профиля сохраняются одним INSERT'ом backend'а. Никаких потерь данных из-за RLS-режа.
- ✅ **Frontend bridge:** регистрация не падает с alert'ом «не удалось создать пользователя». Юзер видит понятный alert и возвращается на welcome.

## 5. Что НЕ закрыто (известные ограничения до Phase 3)

- **Login-path для pending'а** — если pending попробует login до одобрения, попадёт в сломанный UI (пустые экраны без объяснений). Закрытие — Phase 3.
- **Полный PendingApprovalScreen** — сейчас используется простой `alert(...)`. Phase 3 даст красивый экран с кнопкой «Выйти», текстом, возможно ссылкой на TG-связь.
- **Polling /auth/me** — после approval юзер не узнает автоматически. Нужно logout/login вручную. Phase 3 добавит polling каждые 30 сек.
- **Admin UI: вкладка «Ожидают (N)»** — сейчас Ольга должна одобрять руками через `SELECT public.admin_approve_registration('<id>', '<role>')` через psql (RPC уже задеплоена phase31). Phase 3 даст кнопку «Одобрить» с модалкой выбора роли.
- **Поле «Город» в форме регистрации** — пока без него (берётся `null` если не передано). Phase 3 добавит.
- **Deep-link `tab=pending&user=<id>` в TG** — сейчас ведёт на default admin tab (вкладки `pending` ещё нет в AdminPanel). Заработает после Phase 3.

## 6. Финальный E2E smoke — твоя задача после CI deploy

Когда увидишь, что bundle на liga.skrebeyko.ru обновился (или я уведомлю), пройди в браузере:

1. **Чистая сессия** (incognito, чтобы не было старого JWT в localStorage).
2. **Открыть liga.skrebeyko.ru** → «Создать аккаунт» → name/email/password/dob → «Далее» → дерево → «Начать выращивать свой сад».
3. **Ожидание:** alert «Регистрация отправлена. Администратор скоро предоставит вам доступ к платформе.» → возврат на welcome-экран с двумя кнопками («Войти», «Создать аккаунт»).
4. **TG-проверка:** в `@garden_grants_monitor_bot` появилось «🌱 Новая регистрация / <твои данные>».
5. **БД-проверка** (psql на проде):
   ```sql
   SELECT id, email, role, status, access_status, dob, tree, x, y
     FROM public.profiles WHERE email='<твой smoke email>';
   ```
   access_status=pending_approval, status=suspended, dob/tree/x/y сохранены.
6. **Approval flow** (опционально, демонстрация что RPC работает):
   - Программно: сгенерировать admin JWT (как в smoke phase31) и `POST /rpc/admin_approve_registration` с `{p_user_id, p_new_role:'applicant'}` через PostgREST.
   - Или просто psql: `SELECT public.admin_approve_registration('<id>'::uuid, 'applicant');` под admin'ским контекстом (требует authentication).
   - Самое простое для теста: `UPDATE public.profiles SET access_status='active' WHERE id='<id>';` напрямую — bridge сам переключит status на active.
7. **Возвращение юзера:** юзер делает «Войти» → попадает в обычное приложение как active applicant. Видит свой профиль с tree/dob/x/y.
8. **Cleanup:** `DELETE FROM profiles + users_auth WHERE email='<smoke>';`.

Если что-то пошло не так — план отката в [_session/43 §6.2](2026-05-16_43_codeexec_phase25_frontend_diff.md#62-откат).

---

## 7. Артефакты + backlog

### 7.1 Коммиты + push

- `garden-auth: 9441005` — main pushed.
- `garden_claude/garden: 67a703e` — main pushed → GH Actions запущен.

### 7.2 Прод

- `/opt/garden-auth/server.js` — обновлён, restart прошёл. Backup в `/opt/garden-auth/server.js.bak.2026-05-16-pre-phase2`.
- БД: phase31 уже на проде с прошлого раза, ничего новое не катил в phase 2/2.5.

### 7.3 phase33 cleanup (BACKLOG)

В `plans/BACKLOG.md` зафиксирую после твоего подтверждения E2E:
- truncated policy name на `pvl_student_certification_criteria_scores` (переименовать в `pvl_cert_criteria_aag_*`).
- V10 `created_at → id` в файле phase31 — уже поправил локально (в Phase 1 v3 commit `8ccaa49` пошло обновлённым); если миграция когда-то будет re-apply, V10 пройдёт чисто.

### 7.4 Phase 3 (следующий заход)

После твоего подтверждения E2E + закрытия лога — берёмся за Phase 3:
- `views/PendingApprovalScreen.jsx` (адаптация SubscriptionExpiredScreen).
- `App.jsx` routing по `currentUser.access_status`.
- Polling `/auth/me` каждые 30 сек на pending-экране.
- `views/PendingApprovalAdminView.jsx` + вкладка «Ожидают (N)» в AdminPanel.
- Поле «Город» в `AuthScreen` Step 1.
- E2E через `admin_approve_registration` RPC из UI.

Жду от тебя:
- 🟢 на закрытие phase 2/2.5 после E2E,
- сигнал на старт Phase 3 — diff'ом, как обычно.

---

## 8. Финальный статус — CLOSED (2026-05-16 ~14:00 UTC)

### 8.1 CI false-alarm

Polling `until [ "$(curl)" != "$old_hash" ]` дал ложный exit (curl временно вернул пусто → `'' != 'index-DnUlN0iP.js'` → exit). Я подумал что CI deploy не сработал — bundle hash не сменился, Last-Modified `13:08:19` казалось раньше push'а в 13:11.

На самом деле **CI отработал штатно**, просто vite в этот раз сгенерировал bundle с тем же content-hash (вероятно index.js chunk оказался идентичным предыдущему build'у несмотря на изменения в App.jsx — изменения попали в другие chunks). Ольга подтвердила grep'ом по проду наличие строк Phase 2.5.

**Lesson:** polling по «hash изменился» — ненадёжный детектор deploy'а, если CI может выдать тот же hash. Лучше: проверять `Last-Modified` файла или (если есть `gh`) — статус run'а.

### 8.2 Подтверждение Phase 2.5 на проде

```bash
curl -sS https://liga.skrebeyko.ru/assets/index-DnUlN0iP.js \
  | grep -oE 'pending_approval|Регистрация отправлена[^"]{0,80}|Администратор скоро[^"]{0,80}' | sort -u
```

Вывод:
```
pending_approval
Регистрация отправлена. Администратор скоро предоставит вам доступ к платформе.
```

Обе строки на месте → Phase 2.5 код реально в проде.

### 8.3 Финальный backend smoke

Свежий test user (`smoke-phase2-final-1778943088@test.local`) через POST /auth/register с полным payload (name/city/dob/tree/tree_desc/x/y):

| Поле | Значение |
|---|---|
| id | b4d71109-fab2-4203-aa88-fd82121dcd5b |
| name | Final Smoke |
| city | СПб |
| role | applicant |
| status | suspended ✅ |
| access_status | pending_approval ✅ |
| dob | 1985-03-21 ✅ |
| tree | Дуб ✅ |
| tree_desc | Сильный ✅ |
| x, y | 33, 77 ✅ |

TG-failure-логов нет → уведомление в `@garden_grants_monitor_bot` отправлено успешно.

Cleanup: `DELETE 1 + DELETE 1`, 0 leftover.

### 8.4 Что закрыто этим окном

| | До | После |
|---|---|---|
| Регистрация security | дверь нараспашку — любой регится → applicant → доступ ко всему | pending_approval → нет доступа до approval |
| Существующие paused_manual юзеры | технически могут читать PostgREST | RLS режет (closed by phase31) |
| Уведомление админа о новых регистрациях | нет | TG в @garden_grants_monitor_bot моментально |
| Атомарность register | 3 запроса с фронта (auth + ensurePostgrestUser + PATCH) | 1 INSERT в backend |
| UX при register pending'а | сломан без 2.5 (alert «не удалось создать») | alert «Регистрация отправлена...» + возврат на welcome |
| Approval mechanism | нет | RPC `admin_approve_registration(uuid, text)` живая, сейчас вызывается через psql, в Phase 3 — кнопка в AdminPanel |

### 8.5 Финальные коммиты (на main, push'нуты)

| Репо | Commit | Размер |
|---|---|---|
| ligacreate/garden | `8ccaa49 feat(rls): FEAT-023 Phase 1 — pending_approval + restrictive access guards (phase31)` | 1 миграция + 10 _session |
| ligacreate/garden-auth | `9441005 feat(auth): FEAT-023 Phase 2 — register → pending_approval + TG notify` | server.js +301 строка |
| ligacreate/garden | `67a703e feat(ui): FEAT-023 Phase 2.5 — pending bridge (alert + logout до Phase 3)` | 3 source + 2 _session |

### 8.6 Браузер E2E — твоя финальная сверка

Я curl'ом подтвердил backend + grep'ом подтвердил frontend bundle. **Если хочешь финальный визуальный E2E** — открой liga.skrebeyko.ru в incognito, зарегистрируйся, проверь:
- alert «Регистрация отправлена...» появился ✅/❌
- возврат на welcome (без следов сессии) ✅/❌
- TG в `@garden_grants_monitor_bot` прилетело сообщение «🌱 Новая регистрация / <твои данные>» ✅/❌

Если что-то ❌ — пиши, оперативно разберёмся.

### 8.7 Что дальше

После твоего подтверждения закрытия:
- **Phase 3** — `PendingApprovalScreen`, polling `/auth/me`, AdminPanel вкладка «Ожидают», поле «Город», login-path closure.
- **phase33 cleanup** — truncated policy rename, прочая косметика (в BACKLOG).

Я готов к Phase 3 по твоему сигналу.
