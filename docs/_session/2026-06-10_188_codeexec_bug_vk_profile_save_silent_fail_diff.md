# Diff на ревью — Профиль не сохраняется (поле VK): 2 бага

**Дата:** 2026-06-10
**Статус:** ✅ применено + урок записан (2026-06-10)
**Файлы:** `lib/contactNormalize.js`, `services/dataService.js`, `views/UserApp.jsx`

---

## Симптом
Пользователь сохраняет профиль с заполненным VK → профиль «не сохраняется», при этом
UI показывает успех. Молчаливый ложный успех.

## Корневая причина — два независимых бага

### Баг 1 — `normalizeVk` не срезает суб-хост (`www.` / `m.`) до обработки
Протокол `https?://` срезается (строка 29), НО префиксы `www.` и мобильный `m.`
остаются и попадают внутрь итоговой ссылки. Проверка реального поведения:

```
VK  "https://vk.com/vasya"       -> https://vk.me/vasya              valid=true   ✅ (этот кейс уже работал)
VK  "https://www.vk.com/vasya"   -> https://vk.me/www.vk.com/vasya   valid=false  ❌
VK  "www.vk.com/vasya"           -> https://vk.me/www.vk.com/vasya   valid=false  ❌
VK  "m.vk.com/vasya"             -> https://vk.me/m.vk.com/vasya     valid=false  ❌
```
Поскольку браузер/телефон часто отдаёт ссылку именно с `www.`/`m.` — валидный по сути
VK становится `invalid`.

**Параллельный баг того же типа** (правило: чиню оба) — `normalizeTelegram` ломается
идентично на `www.`:
```
TG  "https://www.t.me/vasya"     -> https://t.me/www.t.me/vasya      valid=false  ❌
```

### Баг 2 — `updateUser` глушит ошибку и возвращает ложный успех
`services/dataService.js` ~1689–1691: блок PATCH профиля обёрнут в `try/catch`,
где `catch` пишет `console.warn` и **проваливается дальше** к `return updatedUser`
(строка 1695). Если внутри `throw new Error('VK должен быть...')` (или PATCH упал) —
ошибка съедается, функция возвращает успех. Вызывающий слой
`UserApp.handleUpdateProfile` уже корректно ловит ошибку и делает `onNotify`,
но до него ошибка не доходит.

Сравни: блок role/status выше (1639–1642) **пробрасывает** ошибку (`throw e`) —
профильный блок ведёт себя несогласованно.

---

## Фикс

### 1. `lib/contactNormalize.js` — срезать `www.`/`m.` ДО обработки хоста

```diff
 export function normalizeTelegram(input) {
     if (!input) return '';
     let v = String(input).trim().replace(/^@+/, '');
     v = v.replace(/^https?:\/\//i, '');
+    v = v.replace(/^(www|m)\.+/i, '');      // www./m. перед хостом — иначе попадёт внутрь ссылки
     v = v.replace(/^telegram\.me\//i, 't.me/');
     if (!/^t\.me\//i.test(v)) v = 't.me/' + v;
     return 'https://' + v;
 }

 export function normalizeVk(input) {
     if (!input) return '';
     let v = String(input).trim().replace(/^@+/, '');
-    v = v.replace(/^https?:\/\//i, '');
+    v = v.replace(/^https?:\/\//i, '');     // срезаем протокол ДО обработки хоста
+    v = v.replace(/^(www|m)\.+/i, '');      // www./m.(мобильный) перед vk.com — иначе vk.me/www.vk.com/x → invalid
     // vk.com/write123 → vk.me/123
     v = v.replace(/^vk\.com\/write/i, 'vk.me/');
     // vk.com/<x> → vk.me/<x> для лички (если хост уже vk.me — оставляем)
     v = v.replace(/^vk\.com\//i, 'vk.me/');
     if (!/^vk\.(me|com)\//i.test(v)) v = 'vk.me/' + v;
     return 'https://' + v;
 }
```

> Безопасность: VK screen-name / TG username не содержат точку, поэтому
> `^(www|m)\.` не может «съесть» легитимный логин — срезается только суб-хост.

### 2. `services/dataService.js` — пробросить ошибку, не возвращать ложный успех

Помечаем валидационные ошибки флагом `userFacing`, чтобы UI показал
конкретный текст (а не технический), и **пробрасываем** их из `catch`.

```diff
             if (hasField(updatedUser, 'telegram')) {
                 const normalizedTg = normalizeTelegram(clean.telegram);
                 if (!isValidTelegram(normalizedTg)) {
-                    throw new Error('Telegram обязателен и должен быть в формате https://t.me/username');
+                    const err = new Error('Telegram обязателен и должен быть в формате https://t.me/username');
+                    err.userFacing = true;
+                    throw err;
                 }
                 dbUser.telegram = normalizedTg;
             }
             if (hasField(updatedUser, 'vk')) {
                 const normalizedVk = normalizeVk(clean.vk);
                 if (normalizedVk && !isValidVk(normalizedVk)) {
-                    throw new Error('VK должен быть в формате https://vk.me/username');
+                    const err = new Error('VK должен быть в формате https://vk.me/username');
+                    err.userFacing = true;
+                    throw err;
                 }
                 dbUser.vk = normalizedVk;
             }
@@
             await postgrestFetch('profiles', { id: `eq.${dbUser.id}` }, {
                 method: 'PATCH',
                 body: dbUser,
                 returnRepresentation: true
             });
         } catch (e) {
-            console.warn("Profile update exception:", e);
+            console.warn("Profile update exception:", e);
+            throw e;   // не глушим: невалидный VK/TG или упавший PATCH не должны выдавать ложный успех
         }
```

### 3. `views/UserApp.jsx` — показать конкретный текст валидации

```diff
         } catch (e) {
             console.error("Failed to update profile:", e);
-            onNotify("Ошибка сохранения профиля");
+            onNotify(e?.userFacing ? e.message : "Ошибка сохранения профиля");
         }
```

> Технические ошибки PATCH (сеть/PostgREST) по-прежнему дают общий текст —
> пользователю не вываливаем сырое сообщение.

---

## Проверка после применения
```
VK  www.vk.com/vasya         -> https://vk.me/vasya     valid=true   ✅
VK  https://www.vk.com/x     -> https://vk.me/x          valid=true   ✅
VK  m.vk.com/vasya           -> https://vk.me/vasya      valid=true   ✅
TG  https://www.t.me/vasya   -> https://t.me/vasya        valid=true   ✅
```
+ Невалидный VK → notify «VK должен быть в формате https://vk.me/username», сейв НЕ
выдаёт ложный успех.

## Связанные слои (проверено, не задеты)
- `ProfileView.jsx` — своя UX-валидация перед сохранением, контракт не меняется.
- Optimistic `onUpdateUser(updated)` в `handleUpdateProfile` срабатывает ДО `await` —
  при ошибке локальный стейт временно расходится с БД, но это существующее
  поведение; вне scope текущего фикса (можно завести отдельным backlog-пунктом).

## После 🟢
- Применить 3 правки.
- Урок → `docs/lessons/2026-06-10-vk-profile-save-silent-fail.md`.
