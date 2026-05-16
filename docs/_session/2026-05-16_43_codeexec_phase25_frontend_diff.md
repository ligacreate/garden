# FEAT-023 Phase 2.5 — diff на ревью (минимальный фронт-мост)

**От:** VS Code Claude Code (codeexec)
**Кому:** стратег (claude.ai)
**Дата:** 2026-05-16
**Парный diff:** [_session/42_codeexec_phase2_diff.md](2026-05-16_42_codeexec_phase2_diff.md) (backend)
**Статус:** **DIFF ON REVIEW. Готовлю параллельно с Phase 2; apply одним окном по твоему сигналу.**

---

## TL;DR

1. Phase 2.5 — **минимальный фронт-мост** между Phase 2 (backend → pending) и Phase 3 (полный PendingApprovalScreen + AdminPanel вкладка + polling). Цель: не сломать регистрацию в момент когда Phase 2 уже live, а Phase 3 ещё нет.
2. **3 точечные правки** во фронте, без новых компонентов:
   - `services/dataService.js#register` — расширить payload на dob/tree/x/y; пропустить `_ensurePostgrestUser`/PATCH/refetch если backend ответил `access_status='pending_approval'`.
   - `App.jsx#handleLogin` — после `api.register` если user.access_status='pending_approval': показать alert «Регистрация отправлена», `api.logout()`, return false (не setCurrentUser, не loadInitialData).
   - `views/AuthScreen.jsx#handleRegisterComplete` — при success=false сбросить state регистрации и вернуть на `welcome` (чтобы юзер не остался на step 2 с экраном «дерева»).
3. **Что НЕ делаем в 2.5** (Phase 3): полноценный `PendingApprovalScreen.jsx`, polling `/auth/me`, вкладка «Ожидают (N)» в `AdminPanel`, deep-link `tab=pending&user=<id>` в TG.
4. Apply **только вместе с Phase 2** (backend). По отдельности 2.5 не имеет смысла — без Phase 2 backend всё ещё ставит `access_status='active'`, ранний return не сработает.

---

## 1. Что ломается без Phase 2.5 (после apply одного Phase 2)

Текущий [`dataService.register`](../../services/dataService.js#L1270-L1312):

```js
async register(userData) {
    const { email, password, ...rest } = userData;
    const normalizedEmail = normalizeEmail(email);
    const payload = {
        email: normalizedEmail, password,
        name: this._sanitizeIfString(rest.name),
        city: this._sanitizeIfString(rest.city)
    };
    const data = await authFetch('/auth/register', { method: 'POST', body: payload });
    if (data?.token) setAuthToken(data.token);
    const created = this._normalizeProfile(data.user);

    if (created?.id) {
        await this._ensurePostgrestUser({...});   // 1. POST /profiles → restrictive write FAIL для pending
        const patch = { tree, tree_desc, dob, x, y };
        if (Object.keys(patch).length > 0) {
            await postgrestFetch('profiles', { id: `eq.${created.id}` }, {
                method: 'PATCH', body: patch, ...                 // 2. PATCH /profiles → fail
            });
        }
    }
    try {
        const refetched = await this._fetchProfile(created.id);  // 3. GET /profiles → пусто (RLS)
        if (refetched) return refetched;
    } catch (e) { ... }
    return created;
}
```

Что произойдёт с pending-юзером после **только** Phase 2 (без Phase 2.5):
1. `_ensurePostgrestUser`: GET вернёт `[]` (restrictive guard режет own row), пойдёт POST → fail → **throw `'Не удалось создать пользователя в новой базе'`**.
2. Регистрация на фронте падает с alert'ом «Ошибка регистрации: Не удалось создать...» — выглядит как баг, хотя профиль в БД создан корректно.
3. dob/tree/x/y, которые фронт собрал — потеряются, потому что до PATCH дело не дошло.

Поэтому Phase 2 без Phase 2.5 = сломанная регистрация. Обязательно одно окно.

---

## 2. Полный diff Phase 2.5

### 2.1 `services/dataService.js` — `register` (строки 1270–1312)

```diff
 async register(userData) {
     const { email, password, ...rest } = userData;
     const normalizedEmail = normalizeEmail(email);
     const payload = {
         email: normalizedEmail,
         password,
         name: this._sanitizeIfString(rest.name),
-        city: this._sanitizeIfString(rest.city)
+        city: this._sanitizeIfString(rest.city),
+        // FEAT-023 Phase 2.5: передаём всё backend'у атомарно — после phase31
+        // restrictive write guard режет PATCH/POST /profiles под JWT pending'а,
+        // backend (Phase 2) поддерживает эти поля в /auth/register.
+        dob: rest.dob || null,
+        tree: this._sanitizeIfString(rest.tree),
+        tree_desc: this._sanitizeIfString(rest.treeDesc || rest.tree_desc),
+        x: rest.x ?? null,
+        y: rest.y ?? null
     };
     const data = await authFetch('/auth/register', { method: 'POST', body: payload });
     if (data?.token) setAuthToken(data.token);
     const created = this._normalizeProfile(data.user);
+
+    // FEAT-023 Phase 2.5: pending — это новая регистрация ждущая одобрения.
+    // PostgREST для неё закрыт restrictive guard'ом (фaза 31), любые
+    // _ensurePostgrestUser/PATCH/_fetchProfile вернут пусто или упадут.
+    // Backend (Phase 2) уже создал полный профиль атомарно. Возвращаем
+    // нормализованный объект — App.jsx#handleLogin поймёт по access_status
+    // и переведёт юзера на pending-flow (alert + logout до Phase 3).
+    if (created?.access_status === 'pending_approval') {
+        return created;
+    }
+
+    // Старый path для не-pending'ов. Технически после Phase 2 backend всегда
+    // возвращает pending_approval, но оставляем как safety net на случай
+    // ручного backfill / тестового админ-юзера с active по-умолчанию.
     if (created?.id) {
         await this._ensurePostgrestUser({
             ...data.user,
             ...created,
             email: normalizedEmail || created.email
         });
         const patch = {};
         if (rest.tree) patch.tree = this._sanitizeIfString(rest.tree);
         if (rest.treeDesc || rest.tree_desc) patch.tree_desc = this._sanitizeIfString(rest.treeDesc || rest.tree_desc);
         if (rest.dob) patch.dob = rest.dob;
         if (rest.seeds !== undefined) patch.seeds = rest.seeds;
         if (rest.x !== undefined) patch.x = rest.x;
         if (rest.y !== undefined) patch.y = rest.y;
         if (Object.keys(patch).length > 0) {
             await postgrestFetch('profiles', { id: `eq.${created.id}` }, {
                 method: 'PATCH',
                 body: patch,
                 returnRepresentation: true
             });
         }
     }
     if (created?.id) {
         try {
             const refetched = await this._fetchProfile(created.id);
             if (refetched) return refetched;
         } catch (e) {
             console.warn('register: profile refetch failed', e);
         }
     }
     return created;
 }
```

### 2.2 `App.jsx` — `handleLogin` (строки 221–242)

```diff
 const handleLogin = async (authData) => {
     try {
         let user;
         if (authData.isReset) {
             await api.resetPassword(authData.email);
             return true;
         } else if (authData.isNew) {
             user = await api.register(authData);
+            // FEAT-023 Phase 2.5: pending — backend создал профиль, ждём одобрения.
+            // До Phase 3 (полный PendingApprovalScreen + polling) — alert + logout.
+            if (user?.access_status === 'pending_approval') {
+                alert('Регистрация отправлена. Администратор скоро предоставит вам доступ к платформе.');
+                await api.logout();
+                return false;
+            }
             showNotification("Добро пожаловать!");
         } else {
             user = await api.login(authData.email, authData.password);
             showNotification("С возвращением!");
         }

         setCurrentUser(user);
         setAccessBlock(null);
         ...
```

### 2.3 `views/AuthScreen.jsx` — `handleRegisterComplete` (строки 44–77)

```diff
 const handleRegisterComplete = async () => {
     if (isProcessing) return;
     setIsProcessing(true);
     const randX = Math.floor(Math.random() * 80) + 10;
     const randY = Math.floor(Math.random() * 80) + 10;

     try {
         const success = await onLogin({
             name: regData.name,
             email: regData.email,
             password: regData.password,
             dob: regData.dob,
             tree: treeResult.name,
             role: 'applicant',
             seeds: 0,
             isNew: true,
             x: randX,
             y: randY
         });

         if (success) {
             onNotify("Добро пожаловать в Сад!");
+        } else {
+            // FEAT-023 Phase 2.5: onLogin вернул false (pending или ошибка).
+            // App.jsx уже показал alert. Сбрасываем форму и возвращаем на welcome,
+            // чтобы юзер не остался на step 2 с «деревом» без объяснений.
+            setAuthMode('welcome');
+            setStep(1);
+            setRegData({ name: '', email: '', password: '', dob: '' });
+            setTreeResult(null);
         }
     } catch (e) {
         console.error("Registration error details:", e);
         alert("Ошибка регистрации: " + (e.message || JSON.stringify(e) || "Проверьте данные"));
         if (e.message && (e.message.includes("password") || e.message.includes("6 characters"))) {
             setStep(1);
         }
     } finally {
         setIsProcessing(false);
     }
 };
```

---

## 3. Что НЕ делаем в Phase 2.5 (это Phase 3)

| Компонент | Phase 2.5 | Phase 3 |
|---|---|---|
| Pending после register | alert + logout | `PendingApprovalScreen.jsx` (адаптация SubscriptionExpiredScreen) с текстом, кнопкой «Выйти» |
| Polling /auth/me | нет | каждые 30 сек, auto-переход после approval |
| Admin UI | нет | вкладка «Ожидают (N)» в AdminPanel + `PendingApprovalAdminView.jsx` с одобрить/отклонить + модалка с выбором роли |
| Deep-link `tab=pending&user=<id>` | нет (TG-уведомление шлёт ссылку, она по клику просто ведёт на default admin tab) | работает, ведёт прямо к нужному pending'у |
| Поле «Город» в форме регистрации | нет (опционально-NULL) | добавляется (`Input` после `email`) |

---

## 4. Поведение конечного юзера в Phase 2.5

1. Юзер открывает регистрацию, заполняет name/email/password/dob, нажимает «Далее» → видит дерево.
2. Нажимает «Начать выращивать свой сад».
3. Backend создаёт профиль с `access_status='pending_approval'`. Возвращает JWT + user. TG в `@garden_grants_monitor_bot` срабатывает.
4. Фронт: `dataService.register` видит pending → возвращает `created`. `App.jsx#handleLogin` видит pending → alert «Регистрация отправлена. Администратор скоро предоставит вам доступ к платформе.» → `api.logout()` (удаление JWT) → return false.
5. `AuthScreen.handleRegisterComplete` видит false → возврат на welcome, форма очищена.
6. Юзер видит welcome-экран с кнопками «Войти / Создать аккаунт». Никаких следов незавершённой сессии.
7. Если юзер попробует «Войти» с этими же credentials до одобрения админом — `/auth/login` отработает успешно (users_auth.status='active'), вернёт профиль с `access_status='pending_approval'`. App.jsx#handleLogin для login (не register) сейчас не проверяет pending — пойдёт `setCurrentUser` → `loadAndApplyInitialData`, который вернёт пусто из-за RLS, и юзер попадёт в **сломанный UI** (пустые экраны, никакого explainer).

   **Это известная дыра в Phase 2.5**: я НЕ правлю login-path. Phase 3 закроет через PendingApprovalScreen (App.jsx routing по `currentUser.access_status`). Альтернатива в 2.5 — добавить такую же проверку и в login-ветке handleLogin (мне это +3 строки). **Стоит ли — твоё решение.**

---

## 5. Решение по login-path в Phase 2.5

Минимум (3 строки) для login-path, чтобы юзер не попал в сломанный UI если попробует логиниться до одобрения:

```diff
 } else {
     user = await api.login(authData.email, authData.password);
+    if (user?.access_status === 'pending_approval') {
+        alert('Ваша регистрация ещё ожидает одобрения администратора.');
+        await api.logout();
+        return false;
+    }
     showNotification("С возвращением!");
 }
```

**Рекомендую добавить** — копеечная стоимость, закрывает дыру.

---

## 6. Apply / deploy plan (вместе с Phase 2)

### Последовательность одного окна

1. **Backend Phase 2:**
   - backup `cp /opt/garden-auth/server.js{,.bak.2026-05-16-pre-phase2}`
   - rsync `server.js` на прод
   - `systemctl restart garden-auth`
   - smoke: curl `/api/health`, curl `/auth/register` тестовым email, проверка SQL access_status='pending_approval' + TG-сообщение пришло
2. **Frontend Phase 2.5:**
   - правки в 3 файлах (`dataService.js`, `App.jsx`, `AuthScreen.jsx`)
   - локальный билд (`npm run build`)
   - smoke в браузере (см. §7)
   - deploy через CI/CD (GitHub Actions → FTP, по [CLAUDE.md](../../CLAUDE.md))
3. **Cleanup** test users (DELETE из profiles + users_auth).
4. **Commit** одним PR'ом: Phase 2 (server.js) + Phase 2.5 (frontend) + соответствующие _session файлы.

### Откат

- Backend: `cp /opt/garden-auth/server.js.bak.2026-05-16-pre-phase2 /opt/garden-auth/server.js && systemctl restart garden-auth`
- Frontend: git revert + redeploy через CI/CD (на FTP). Старая версия попадёт в проде через несколько минут.
- БД: phase31 guards остаются — без backend Phase 2 новых pending'ов не появится, существующие на проде — нет.

### Smoke browser (новый юзер E2E)

1. Открыть https://liga.skrebeyko.ru на чистой сессии.
2. «Создать аккаунт» → пройти 2 шага → подтвердить.
3. Ожидание: alert «Регистрация отправлена...», возврат на welcome.
4. Проверить TG: «🌱 Новая регистрация» с именем/email/городом.
5. Попробовать «Войти» с теми же credentials → alert «...ожидает одобрения...» (если приняли §5), либо сломанный UI (если не приняли).
6. SQL: проверить что профиль в БД (`access_status='pending_approval'`, dob/tree/x/y сохранены).
7. Через psql: `SELECT public.admin_approve_registration('<id>', 'applicant')` под админским JWT (через тестовый node-скрипт как в smoke phase31). Или просто `UPDATE profiles SET access_status='active' WHERE id=<id>;` (триггер bridge переведёт status в active).
8. Юзер делает «Войти» → попадает в обычное приложение как active applicant.
9. Cleanup: DELETE из profiles + users_auth.

---

## 7. Что нужно от тебя

1. **🟢 на Phase 2 diff** ([_session/42](2026-05-16_42_codeexec_phase2_diff.md) §8, ждёт твоего ответа).
2. **🟢 на Phase 2.5 diff** (этот файл, §2).
3. **Решение по §5** (закрыть login-path в 2.5 или оставить на Phase 3) — рекомендую закрыть.
4. **Сигнал что phase32 завершён в параллельном чате**, и мы можем apply Phase 2 + Phase 2.5 одним окном.
5. **Решение по поле «Город»** — добавлять ли в форму регистрации в 2.5 или ждать Phase 3? Я бы оставил на Phase 3 (минимальные правки в 2.5).

После всех 🟢 и сигнала:
- Apply Phase 2 backend (rsync, restart, smoke).
- Apply Phase 2.5 frontend (правки + локальный build + smoke + deploy).
- Cleanup.
- Коммит.
- Отчёт в `_session/<следующий свободный номер>_codeexec_phase2_apply.md`.

---

## 8. Сопутствующее

### 8.1 Phase 31 закоммичен

`8ccaa49 feat(rls): FEAT-023 Phase 1 ...`. Phase 2 + 2.5 пойдут отдельным коммитом одним окном.

### 8.2 phase33 cleanup (в BACKLOG после Phase 2.5 apply)

- truncated policy name на `pvl_student_certification_criteria_scores`
- V10 `created_at → id` в файле phase31 (уже поправил локально для документации)

### 8.3 Параллельная работа

Вижу, что появился ещё один файл `_42_codeexec_phase32_applied.md` (от другого Claude). Похоже phase32 уже apply'ен на проде. Жду твоего подтверждения и сигнал на Phase 2 + 2.5 apply.
