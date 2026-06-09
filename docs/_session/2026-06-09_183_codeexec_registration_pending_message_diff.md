# UX регистрации pending — спокойное уведомление вместо «Не удалось создать пользователя» — diff на ревью

**От:** VS Code Claude Code (codeexec)
**Кому:** стратег (claude.ai) → Ольга
**Дата:** 2026-06-09
**Контекст:** FEAT-023 (pending_approval), закрытие login-path дыры из [_43 §5](2026-05-16_43_codeexec_phase25_frontend_diff.md) / [_44 §2.2](2026-05-16_44_codeexec_phase2_25_applied.md)
**Статус:** **DIFF ON REVIEW. Без apply / commit / push до 🟢.**

---

## TL;DR

- 🎯 **Что увидела Ольга:** пугающий alert «Не удалось создать пользователя в новой базе. Напишите администратору». Это **не** ошибка — заявка ушла на одобрение админу (норма для FEAT-023).
- 🔍 **Где именно это всплывает:** **НЕ при самой регистрации**, а когда новый юзер пытается **войти до одобрения**. Это та самая «login-path дыра», которую при Phase 2.5 сознательно оставили на Phase 3 ([_44 §2.2](2026-05-16_44_codeexec_phase2_25_applied.md), [_43 §5](2026-05-16_43_codeexec_phase25_frontend_diff.md)). Только проявляется она хуже, чем прогнозировали: не «пустые экраны», а именно пугающий alert.
- 🩹 **Фикс — 2 файла, тот же паттерн что уже есть для register-ветки:**
  1. `services/dataService.js#login` — ранний `return` для pending (как в `register`), чтобы не дёргать `_ensurePostgrestUser` и не кидать ошибку.
  2. `App.jsx#handleLogin` — спокойное `showNotification` (тост, не alert) с твоим текстом и для register-, и для login-ветки.
- ✅ **«pending vs реальная ошибка» различаем по `access_status === 'pending_approval'`** — backend отдаёт это поле в ответе и `/auth/register`, и `/auth/login` (подтверждено smoke в [_44 §1.3/§8.3](2026-05-16_44_codeexec_phase2_25_applied.md)). Реальный сбой PostgREST у активного юзера по-прежнему даст ошибку — мы его не глушим.

---

## 1. Где живёт сообщение и почему оно пугает

Текст кидается **из одного места** — [services/dataService.js:1541](../../services/dataService.js#L1541), внутри `_ensurePostgrestUser`:

```js
} catch (e) {
    console.warn('PostgREST user ensure failed:', e);
    throw new Error('Не удалось создать пользователя в новой базе. Напишите администратору.');
}
```

`_ensurePostgrestUser` делает `POST /profiles`. Для pending-юзера phase31 **restrictive write guard** режет этот POST → `catch` → throw → пузырём до [App.jsx:283](../../App.jsx#L283) `alert(msg)`. Отсюда «confirm-стиль».

## 2. Почему это норма, а не ошибка (и где грань)

- **Регистрация (`register`)** уже обработана корректно ([dataService.js:1311](../../services/dataService.js#L1311)): при `access_status === 'pending_approval'` — ранний `return`, `_ensurePostgrestUser` не вызывается, App.jsx показывает уведомление и делает logout. Здесь пугающего текста нет.
- **Логин до одобрения (`login`)** — НЕ обработан. Трассировка для pending-юзера:
  1. [login() / dataService.js:1240](../../services/dataService.js#L1240) — `_fetchProfile` → `null` (guard режет чтение своей строки).
  2. [строка 1244](../../services/dataService.js#L1244) — `if (!profile && authUser?.id)` → `true` → `_ensurePostgrestUser(...)`.
  3. POST режется guard'ом → **throw «Не удалось создать пользователя…»** → [App.jsx:283](../../App.jsx#L283) alert.

  Прогноз в [_43 §5](2026-05-16_43_codeexec_phase25_frontend_diff.md) был «пустые экраны», но фактически `_ensurePostgrestUser` кидает раньше — отсюда именно пугающий alert.

**Грань pending / реальная ошибка** — поле `access_status`. Backend кладёт `pending_approval` в ответ обоих эндпоинтов (smoke [_44 §1.3/§8.3](2026-05-16_44_codeexec_phase2_25_applied.md)). Проверяем его **до** того, как полезем в PostgREST. Если у нормального активного юзера PostgREST реально упадёт — `access_status` будет `active`, ранний return не сработает, ошибка покажется как и раньше. **Реальные сбои не маскируем.**

---

## 3. Diff

### 3.1 `services/dataService.js` — `login()` (ранний return для pending)

Вставка между [строкой 1239](../../services/dataService.js#L1239) и [1240](../../services/dataService.js#L1240):

```diff
     async login(email, password) {
         const normalizedEmail = normalizeEmail(email);
         const data = await authFetch('/auth/login', { method: 'POST', body: { email: normalizedEmail, password } });
         if (data?.token) setAuthToken(data.token);
         const authUser = this._normalizeProfile(data.user);
+
+        // FEAT-023: pending — заявка ещё на одобрении админа. PostgREST для неё
+        // закрыт restrictive guard'ом (phase31): _fetchProfile вернёт null, а
+        // _ensurePostgrestUser упадёт на write guard и кинет «Не удалось создать
+        // пользователя…». Это НЕ ошибка — профиль уже создан backend'ом при
+        // регистрации. Возвращаем нормализованный объект; App.jsx#handleLogin
+        // покажет спокойное уведомление и сделает logout (как в register-ветке).
+        if (authUser?.access_status === 'pending_approval') {
+            return authUser;
+        }
+
         let profile = await this._fetchProfile(authUser?.id);

         // Safety net for partially migrated users: auth account exists but profile row is missing.
         if (!profile && authUser?.id) {
             await this._ensurePostgrestUser({
```

### 3.2 `App.jsx` — `handleLogin` (спокойный тост вместо alert, в обеих ветках)

**Register-ветка** — [строки 232–236](../../App.jsx#L232) (меняем `alert` → `showNotification` + твой текст):

```diff
             } else if (authData.isNew) {
                 user = await api.register(authData);
                 // FEAT-023 Phase 2.5: pending — backend создал профиль, ждём одобрения.
                 // До Phase 3 (полный PendingApprovalScreen + polling) — alert + logout,
                 // чтобы JWT pending'а не висел в localStorage и не делал лишних fetch'ей.
                 if (user?.access_status === 'pending_approval') {
-                    alert('Регистрация отправлена. Администратор скоро предоставит вам доступ к платформе.');
+                    showNotification('Заявка отправлена! Администратор одобрит её в ближайшее время — после этого у вас появится вход.');
                     await api.logout();
                     return false;
                 }
                 showNotification("Добро пожаловать!");
```

**Login-ветка** — [строки 238–241](../../App.jsx#L238) (добавляем такую же проверку):

```diff
             } else {
                 user = await api.login(authData.email, authData.password);
+                // FEAT-023: pending — заявка ещё на одобрении. Не пускаем в пустой UI
+                // (PostgREST под guard'ом), показываем то же спокойное уведомление.
+                if (user?.access_status === 'pending_approval') {
+                    showNotification('Заявка отправлена! Администратор одобрит её в ближайшее время — после этого у вас появится вход.');
+                    await api.logout();
+                    return false;
+                }
                 showNotification("С возвращением!");
             }
```

> `showNotification` — App-level state ([App.jsx:21/38](../../App.jsx#L38)), тост рендерится поверх любого экрана и переживает переход на welcome. `return false` → `AuthScreen` сбрасывает register-форму на welcome ([_43 §2.3](2026-05-16_43_codeexec_phase25_frontend_diff.md)); для login-формы юзер остаётся на месте и видит тост.

**Других правок нет.** `AuthScreen.jsx` трогать не нужно — он уже корректно реагирует на `success=false`.

---

## 4. Почему именно так (root-cause, не симптом)

- Чиним на **owner-слое**: `login()` сам решает не лезть в PostgREST для pending — зеркало уже существующего решения в `register()` (1311). Не глушим `_ensurePostgrestUser` (он общий — его зовут ещё `getCurrentUser`, login safety-net, и т.д.; глушить там — спрятать реальные сбои активных юзеров).
- **Параллельный баг того же типа:** register-ветку уже починили в Phase 2.5, login-ветку — забыли (осознанно отложили). Это один класс — «pending-юзер упирается в PostgREST-guard». Чиним обе точки одним заходом.
- **Сообщение** меняем на тост (не alert) в обеих ветках — единый спокойный UX и для «только что зарегистрировался», и для «зашёл повторно до одобрения».

## 5. Что это НЕ закрывает (осознанно, Phase 3)

- Полноценный `PendingApprovalScreen` с polling `/auth/me` и авто-входом после одобрения — остаётся на Phase 3 ([_44 §5](2026-05-16_44_codeexec_phase2_25_applied.md)). Текущий фикс — спокойный мост: уведомление + logout + возврат, без сломанного UI и без пугалок.

## 6. Smoke после apply (браузер, твоя сверка)

1. Incognito → liga.skrebeyko.ru → «Создать аккаунт» → пройти регистрацию.
   - Ожидание: тост «Заявка отправлена! Администратор одобрит её в ближайшее время — после этого у вас появится вход.», возврат на welcome. **Нет** пугающего «Не удалось создать пользователя».
2. Сразу «Войти» теми же credentials (до одобрения).
   - Ожидание: тот же спокойный тост. **Нет** alert «Не удалось создать пользователя в новой базе».
3. (Опц.) Одобрить через psql `UPDATE profiles SET access_status='active' WHERE email='<smoke>'` → «Войти» → попадает в обычное приложение.
4. Cleanup test-юзера.

---

## 7. Что нужно от тебя

- **🟢** на этот diff → применю правки в 2 файла, локальный `npm run build`, отдам на браузер-smoke, дальше deploy + commit по обычному окну.
- Подтверждение, что текст уведомления финальный (использую дословно твой: «Заявка отправлена! Администратор одобрит её в ближайшее время — после этого у вас появится вход.»).
