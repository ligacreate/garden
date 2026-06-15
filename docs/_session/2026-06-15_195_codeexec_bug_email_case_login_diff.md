# BUG: email регистрозависим на входе — diff на ревью

**Роль:** codeexec · **Дата:** 2026-06-15 · **Статус:** ✅ закрыт — 🟢 «Полный», задеплоено (см. `_196`)

## Симптом
Вход регистрозависим: `Kulish-inn@yandex.ru` ≠ `kulish-inn@yandex.ru` → «Invalid credentials»
при верном пароле (кейс: Инна `kulish-inn@yandex.ru`). Причина — в `/auth/login`
запрос `where email = $1` идёт сырым вводом, БД сравнивает побайтово.

## Где
Репо: **`/Users/user/code/garden-auth`** (`ligacreate/garden-auth`, ветка main).
Это актуальный репо — в нём уже нормализован `/auth/request-reset` (commit `c00765a`),
что соответствует условию «reset уже нормализован, не трогать».

> ⚠️ **Pre-deploy чек (важно):** майский deploy-лог (`..._44_...applied.md`) rsync'ил из
> `/Users/user/vibecoding/garden-auth/` — это **старый** репо (на FEAT-024, без reset-fix).
> Источником считаю `/code/garden-auth`. Перед rsync сверю локальный server.js с прод-копией
> (`diff` через ssh), чтобы не откатить более новый прод. Деплою только при совпадении базы.

## Прод-факт
Все 61 email в `users_auth` уже строчные/без пробелов → нормализация на входе безопасна,
существующие юзеры не ломаются.

---

## Diff (предлагаемые правки)

### 1) `/auth/login` (server.js:602–620)
```diff
 app.post('/auth/login', async (req, res) => {
   const { email, password } = req.body || {};
   if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
+  const normalizedEmail = String(email).trim().toLowerCase();
   try {
-    const { rows } = await pool.query('select id, password_hash, status from public.users_auth where email = $1', [email]);
+    const { rows } = await pool.query('select id, password_hash, status from public.users_auth where email = $1', [normalizedEmail]);
     if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
     const user = rows[0];
     if (user.status !== 'active') return res.status(403).json({ error: 'Account suspended' });

     const ok = await bcrypt.compare(password, user.password_hash);
     if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

     const profile = await pool.query('select * from public.profiles where id = $1', [user.id]);
-    const token = signToken({ sub: user.id, email });
+    const token = signToken({ sub: user.id, email: normalizedEmail });
     res.json({ token, user: profile.rows[0] || { id: user.id, email } });
   } catch (e) {
```

### 2) `/auth/register` (server.js:549–600)
```diff
 app.post('/auth/register', async (req, res) => {
   const { email, password, name, city, dob, tree, tree_desc, treeDesc, x, y } = req.body || {};
   if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
+  const normalizedEmail = String(email).trim().toLowerCase();
   try {
-    const existing = await pool.query('select id from public.users_auth where email = $1', [email]);
+    const existing = await pool.query('select id from public.users_auth where email = $1', [normalizedEmail]);
     if (existing.rows.length) return res.status(409).json({ error: 'User already exists' });

     const id = uuidv4();
     const hash = await bcrypt.hash(password, 10);

     await pool.query(
       'insert into public.users_auth (id, email, password_hash, status) values ($1,$2,$3,$4)',
-      [id, email, hash, 'active']
+      [id, normalizedEmail, hash, 'active']
     );
```

---

## ⚠️ Решение по scope: расширить или нет?

Инструкция стратега для register покрывает **только** existence-check + INSERT `users_auth`.
Но в том же хендлере `email` (сырой) ещё уходит в:
- `INSERT public.profiles (... email ...)` — строка 575
- `signToken({ sub: id, email })` — 581
- ответ `user: { email }` — 584
- `notifyNewRegistration({ email })` — 589

Если нормализовать только `users_auth`, а `profiles.email` оставить сырым →
**та же ошибка, перенесённая на соседнюю таблицу**: `users_auth.email='mixedcase@…'` строчный,
а `profiles.email` — MixedCase. Расхождение между двумя источниками одного email.

**Рекомендую** заменить `email → normalizedEmail` во **всех** ссылках внутри register
(profiles INSERT, signToken, response, notify) — это параллельный баг того же класса.
Login это не затрагивает (там нет записи email, кроме токена — уже учтено выше).

→ **Жду решения:**
- 🟢 **«полный»** — нормализую все email-ссылки в register (рекомендую);
- 🟡 **«по букве»** — строго users_auth + existence, profiles/token оставляю сырыми.

---

## Деплой (после 🟢)
1. `ssh root@5.129.251.56 'diff <(cat /opt/garden-auth/server.js) -'` — сверка базы перед заливкой.
2. backup: `cp /opt/garden-auth/server.js{,.bak.2026-06-15-pre-email-norm}`
3. `rsync -avz /Users/user/code/garden-auth/server.js root@5.129.251.56:/opt/garden-auth/server.js`
4. `systemctl restart garden-auth` → ждём active (running)
5. `curl https://auth.skrebeyko.ru/api/health` → `{"ok":true,...}`

## Smoke (после рестарта)
- Вход `Kulish-inn@yandex.ru` (верхний регистр) с верным паролем → **200 + токен**.
- Регистрация `MixedCase@example.com` → в `users_auth.email` лежит `mixedcase@example.com`
  (и, если «полный», в `profiles.email` тоже строчными). Тестовую запись потом удалить.

## Коммит
По имени файла: `fix(auth): нормализация email (trim+lower) на входе login/register`.
Один репо `garden-auth`, отдельный коммит.
