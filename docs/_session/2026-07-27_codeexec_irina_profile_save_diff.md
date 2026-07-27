# Ирина Петруня: разбор сбоя сохранения профиля + фикс (на ревью)

**Дата:** 2026-07-27
**Статус:** ⏳ жду 🟢 — код правлен локально, ничего не закоммичено и не задеплоено.
**Пострадавшая:** Ирина Петруня, `panda399@rambler.ru`,
`id=35019374-d7de-4900-aa9d-1797bcca9769`, tg `1886607302`, роль `intern`.
**Прод не изменён:** все прогоны в транзакциях с `ROLLBACK`, строка Ирины до и
после прогонов совпадает (см. «Что происходило с продом»).

---

## 1. Что просили и что получилось

Просили воспроизвести сбой на её строке и показать, на какой колонке падает
гвард. Воспроизвёл — и получилось не то, что ожидалось:

> **На её сегодняшних данных гвард не падает.** PATCH, который шлёт `updateUser`
> при самосохранении, для Ирины вообще ничего не меняет — ни одной колонки.

Но сбой на её строке реальный, и колонка у него та самая — `role`. Падает он не
от данных в базе, а от расхождения между базой и объектом пользователя в её
браузере. Ниже — доказательство обоих утверждений.

## 2. Как собирал PATCH

Задеплоенный на `liga.skrebeyko.ru` бандл (`assets/index-BO6Mug8W.js`) сверен с
исходниками: `updateUser` там та же самая, двумя запросами. Тело собирал не
руками — скриптом, который повторяет цепочку кода буква в букву: ответ
`_fetchProfile` → `_normalizeProfile` → `form` и `handleSave` из `ProfileView` →
сборка тел в `updateUser`, включая `normalizeTelegram`/`normalizeVk`.

**Шаг 1 (`PATCH /profiles`):**

```json
{"role":"intern","status":"active"}
```

**Шаг 2 (`PATCH /profiles`):** `id, name, city, tree, tree_desc, seeds,
avatar_url, x, y, dob, skills, offer, unique_abilities, leader_about,
leader_signature, leader_reviews, telegram, vk, join_date, avatar_focus_x,
avatar_focus_y` — 21 поле, все значения совпадают с тем, что лежит в базе.

Единственная привилегированная колонка во всём сохранении — `role` из шага 1.
`email`, `access_status`, `subscription_status`, `paid_until`,
`auto_pause_exempt`, `telegram_user_id` клиент не шлёт вообще.

## 3. Прогон на её строке (роль authenticated, её `sub` в JWT, транзакции с откатом)

| Сценарий | Итог |
|---|---|
| A. Шаг 1 `{role:'intern', status:'active'}` — как читает клиент | ПРОШЁЛ |
| B. Шаг 2, значения из её же строки | ПРОШЁЛ |
| C. Шаг 2 с реальной правкой города | ПРОШЁЛ |
| D. Шаг 2 с пересчитанными семенами (`seeds+5`) | ПРОШЁЛ |
| E. Контроль: `role='admin'` | ОТКАЗ `42501`, «Отклонены поля: role» |

Гвард на её сохранении **не вызывается вообще**: его `WHEN` требует изменения
колонки (`IS DISTINCT FROM`), а клиент шлёт `role` тем же значением. Это ровно
то, что и планировалось при накате.

## 4. Где сбой на самом деле

Роль в теле запроса берётся из объекта пользователя в браузере. Он и база
расходятся штатно — роль меняют в админке, а открытая вкладка участницы про это
ещё не знает. Прогон на её строке с прежней ролью (`applicant`, она была такой
до повышения):

```
шаг 1 {role:'applicant', status:'active'}
  → ОТКАЗ [42501] Служебные поля профиля меняет только администратор
    || Отклонены поля: role
```

Дальше по коду: `updateUser` пробрасывает это исключение наружу, и до шага 2 —
того самого, где имя, город и «о себе», — выполнение не доходит. Участница
видит «Ошибка сохранения профиля», правки теряются целиком.

**И то же самое до гварда** (прогон под `gen_user`, с откатом): тот же PATCH
проходил и ставил в базу `applicant`. То есть участница своим же сохранением
профиля откатывала себе повышение, молча. Гвард ничего не сломал — он сделал
видимым дефект, который жил давно.

**Корневая причина:** `updateUser` обслуживала две разные операции сразу —
админскую смену роли (`App.updateUserRole` → `api.updateUser({ id, role })`) и
самосохранение профиля. Из-за этого каждое сохранение профиля писало в базу
колонки `role` и `status`, которых не редактирует ни одно поле формы.

## 5. Фикс

Чиню на owner-слое: клиент перестаёт писать колонки, которыми не владеет.

**`services/dataService.js` → `RemoteApiService.updateUser`** — удалён шаг 1
целиком (было 18 строк), на его месте комментарий с объяснением. Самосохранение
теперь ровно один PATCH — пользовательские поля.

**`services/dataService.js` → новый `RemoteApiService.setUserRole(userId, role)`**
— админский путь: PATCH одной колонки под JWT администратора, `is_admin()`
истинно, гвард пропускает; инвалидация кэша `users` как была.

**`App.jsx` → `updateUserRole`** — вызывает `api.setUserRole(id, role)` вместо
`api.updateUser({ id, role })`. Это единственное место, откуда админка меняет
роль (`AdminPanel` → `onUpdateUserRole`).

**`services/dataService.js` → `LocalStorageService`** — парный `setUserRole` и
`updateUser`, который берёт `role`/`status` из уже сохранённой записи. Иначе
локальный режим прятал бы баг, который прод отбивает.

Пауза и разморозка (`toggleUserStatus`) и льгота по автопаузе
(`setProfileAutoPauseExempt`) уже жили отдельными методами — их не трогал.

## 6. Проверка после фикса — на её же строке, с откатом

| Проверка | Итог |
|---|---|
| Сохранение профиля новым телом (город и «о себе» реально изменены), клиентская роль устарела | **ПРОШЁЛ**, 1 строка |
| Роль в базе после этого сохранения | `intern` — не тронута |
| Город и «о себе» после сохранения | записались |
| Контроль: `role='admin'` | ОТКАЗ `42501`, «Отклонены поля: role» |
| Контроль: `paid_until` + 10 лет | ОТКАЗ `42501`, «Отклонены поля: paid_until» |

Защита не ослабла: гвард по-прежнему отбивает и самоназначение роли, и
продление оплаты.

Сборка: `npm run build` проходит, `Role/status update failed` из бандла исчезло,
`setUserRole` в бандле присутствует. Ошибки eslint в `dataService.js` — прежние,
на моих строках новых нет.

## 7. Что происходило с продом

- Все SQL-прогоны — в транзакциях с `ROLLBACK`, временные функции-обёртки
  создавались и откатывались внутри тех же транзакций (после прогонов
  `осталось_repro_функций = 0`).
- Один реальный запрос всё же ушёл: проба, поддерживает ли PostgREST
  `Prefer: tx=rollback`. Не поддерживает (`PGRST_DB_TX_END` не задан), поэтому
  проба записалась. Тело пробы — `{"city":"Москва"}`, то есть её же текущее
  значение: содержимое строки не изменилось. После этого записей через живой
  PostgREST не делал вообще.
- Строка Ирины на момент закрытия работы: `role=intern`, `status=active`,
  `city=Москва`, `seeds=65`, `paid_until=2026-08-08 23:59:59+03` — как и до
  начала.

## 8. Чего фикс НЕ делает

- **Не деплою и не коммичу** — жду 🟢. Фронт по плану выкатывается 30–31 июля
  вместе с блоком входа в Лигу и формой встреч.
- **Не трогаю семена.** `updateUser` по-прежнему шлёт `seeds` из клиента — это
  тот же класс дефекта, и миграция `2026-07-30_profiles_guard_add_seeds.sql`
  повторит ровно эту поломку сохранения профиля, если накатить её раньше, чем
  начисление уедет на сервер (`plans/2026-07-27-семена-на-сервер.md`).
- **Не чиню устаревание объекта пользователя во вкладке.** После фикса оно
  безобидно: роль из клиента в базу больше не едет, интерфейс покажет свежую
  роль после перезагрузки страницы. Отдельным пунктом в бэклог, если захочешь
  обновлять роль на лету.

## 9. Диф

```diff
--- a/App.jsx
+++ b/App.jsx
@@ -347,7 +347,7 @@ export default function App() {
         if (!userToUpdate) return;
 
         try {
-            await api.updateUser({ id, role });
+            await api.setUserRole(id, role);
             const updated = { ...userToUpdate, role };
             setUsers(users.map(u => u.id === id ? updated : u));
             if (currentUser?.id === id) setCurrentUser(updated);
```

```diff
--- a/services/dataService.js   (LocalStorageService)
+++ b/services/dataService.js
@@ -598,8 +598,14 @@
     async updateUser(updatedUser) {
         const sanitizeIfString = (val) => (typeof val === 'string' ? this._sanitize(val) : val);
+        // Роль и статус сохранение профиля не меняет — как и в реальном режиме
+        // (см. RemoteApiService.updateUser). Берём их из уже сохранённой записи,
+        // чтобы локальный режим не прятал баг, который в проде отбивает гвард.
+        const stored = this.users.find(u => u.id === updatedUser.id);
         const sanitizedUser = {
             ...updatedUser,
+            role: stored ? stored.role : updatedUser.role,
+            status: stored ? stored.status : updatedUser.status,
             name: sanitizeIfString(updatedUser.name),
@@ -623,6 +629,17 @@
+    /** Пара к RemoteApiService.setUserRole — админская смена роли в локальном режиме. */
+    async setUserRole(userId, role) {
+        this.users = this.users.map(u => (u.id === userId ? { ...u, role } : u));
+        this._saveUsers();
+        const current = await this.getCurrentUser();
+        if (current && current.id === userId) {
+            localStorage.setItem('garden_currentUser', JSON.stringify({ ...current, role }));
+        }
+        return this.users.find(u => u.id === userId) || null;
+    }
```

```diff
--- a/services/dataService.js   (RemoteApiService.updateUser)
+++ b/services/dataService.js
@@ -1640,25 +1657,16 @@
-        // 1. Update role/status first
-        try {
-            const roleStatusUpdate = {};
-            if (hasField(updatedUser, 'role')) roleStatusUpdate.role = updatedUser.role;
-            if (hasField(updatedUser, 'status')) roleStatusUpdate.status = updatedUser.status;
-
-            if (Object.keys(roleStatusUpdate).length > 0) {
-                await postgrestFetch('profiles', { id: `eq.${updatedUser.id}` }, {
-                    method: 'PATCH',
-                    body: roleStatusUpdate,
-                    returnRepresentation: true
-                });
-            }
-        } catch (e) {
-            console.warn("Role/status update failed:", e);
-            throw e;
-        }
-
-        // 2. Update profile fields
+        // Роль и статус здесь НЕ трогаем. Раньше сохранение профиля первым шагом
+        // патчило `role`/`status` значениями из клиентского объекта — при том, что
+        // ни одно поле формы их не редактирует. Владелец этих колонок — админка
+        // (setUserRole, toggleUserStatus) и бэкенд, поэтому self-save шлёт только
+        // пользовательские поля. Пока клиентский объект совпадал с БД, лишний PATCH
+        // был не виден; стоило им разойтись (роль сменили в админке, а вкладка
+        // участницы этого ещё не знает) — и клиент тихо возвращал БД прежнюю роль,
+        // а после гварда привилегированных колонок тот же PATCH стал отбиваться
+        // с 42501 и ронять всё сохранение целиком, включая имя и город.
+        // Разбор: docs/lessons/2026-07-27-профиль-не-сохраняется-роль-в-self-save.md
         try {
             const dbUser = { id: updatedUser.id };
```

```diff
--- a/services/dataService.js   (новый метод, перед deleteUser)
+++ b/services/dataService.js
@@ -1717,6 +1725,26 @@
+    /**
+     * Смена роли участницы — админская операция, отдельный от сохранения профиля путь.
+     * Идёт под JWT админа, `is_admin()` истинно → гвард привилегированных колонок
+     * (trg_profiles_privileged_write_guard) пропускает. Раньше админка ходила сюда
+     * через `updateUser({ id, role })`, из-за чего тот же PATCH-код обслуживал и
+     * self-save участницы — см. комментарий в updateUser.
+     * @param {string} userId
+     * @param {string} role
+     */
+    async setUserRole(userId, role) {
+        const { data } = await postgrestFetch('profiles', { id: `eq.${userId}` }, {
+            method: 'PATCH',
+            body: { role },
+            returnRepresentation: true
+        });
+        this._invalidateCache('users');
+        const row = Array.isArray(data) ? data[0] : data;
+        return row ? this._normalizeProfile(row) : null;
+    }
```

## 10. Что проверить руками после выката

1. Под Ириной (или любой участницей): открыть профиль, изменить город, сохранить
   — «Профиль сохранен», после перезагрузки правка на месте.
2. В админке сменить кому-нибудь роль — роль меняется, список обновляется.
3. Сценарий, который и ломался: сменить участнице роль в админке, **не
   перезагружая** её вкладку сохранить у неё профиль — сохранение проходит, роль
   в базе остаётся новой (раньше откатывалась или падала ошибка).

Урок записан: `docs/lessons/2026-07-27-профиль-не-сохраняется-роль-в-self-save.md`.
