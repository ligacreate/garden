# FEAT-023 Phase 2 — diff на ревью (garden-auth /auth/register)

**От:** VS Code Claude Code (codeexec)
**Кому:** стратег (claude.ai)
**Ответ на:** твоё устное 🟢 + правило diff-on-review (после [_session/38](2026-05-16_38_codeexec_phase31_v3_applied.md))
**Дата:** 2026-05-16
**Номер:** 42 (изначально планировался 39, но параллельная работа FEAT-024/phase32 заняла 35–41)
**Статус:** **DIFF ON REVIEW. На прод не выкатывал. Жду 🟢.**

---

## TL;DR

1. **scp прода → локальный сделан.** `/opt/garden-auth/server.js` (441 строка, с MON-001) перенесён в `/Users/user/vibecoding/garden-auth/server.js`. Локальный был 216 строк — серьёзно отставал.
2. **3 правки в server.js** (точечные, мин. invasive):
   - `/auth/register`: добавить `access_status='pending_approval' + status='suspended'` в INSERT profiles + расширить body на `dob/tree/tree_desc/x/y` (см. §3 — без этого фронт сломается на pending после Phase 1).
   - Новая функция `notifyNewRegistration({id, name, email, city})` — переиспользует существующие `httpsPostJson` + `TG_API` + `TG_CHAT_ID` от MON-001.
   - Возврат из `/auth/register`: добавить `access_status` в user-объект (фронт по нему рулит routing на PendingApprovalScreen в Phase 3).
3. **Расширение scope vs. изначальный план Ольги** (§3): необходимо, иначе фронт `register → _ensurePostgrestUser → PATCH /profiles` сломается под новыми guard'ами phase31 (pending не может писать в profiles через PostgREST). Решение — атомарный INSERT в backend.
4. **phase31 закоммичен** отдельно — `8ccaa49 feat(rls): FEAT-023 Phase 1 ...`. Phase 2 пойдёт отдельным коммитом после apply.

---

## 1. Что сейчас на проде в `/auth/register`

[/Users/user/vibecoding/garden-auth/server.js#L319-L346](../../../../garden-auth/server.js#L319-L346):

```js
app.post('/auth/register', async (req, res) => {
  const { email, password, name, city } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const existing = await pool.query('select id from public.users_auth where email = $1', [email]);
    if (existing.rows.length) return res.status(409).json({ error: 'User already exists' });

    const id = uuidv4();
    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      'insert into public.users_auth (id, email, password_hash, status) values ($1,$2,$3,$4)',
      [id, email, hash, 'active']
    );

    await pool.query(
      `insert into public.profiles (id, email, name, city, role, status, seeds)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (id) do update set email=excluded.email, name=excluded.name, city=excluded.city`,
      [id, email, name || null, city || null, 'applicant', 'active', 0]
    );

    const token = signToken({ sub: id, email });
    res.json({ token, user: { id, email, name, city, role: 'applicant' } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

Принимает только `email/password/name/city`. Дополнительные поля (`dob/tree/x/y`) приезжают **отдельным PATCH** с фронта после register ([dataService.js:1283-1301](../../services/dataService.js#L1283-L1301)).

---

## 2. Что должно стать после Phase 2

```js
app.post('/auth/register', async (req, res) => {
  const { email, password, name, city, dob, tree, tree_desc, treeDesc, x, y } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const existing = await pool.query('select id from public.users_auth where email = $1', [email]);
    if (existing.rows.length) return res.status(409).json({ error: 'User already exists' });

    const id = uuidv4();
    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      'insert into public.users_auth (id, email, password_hash, status) values ($1,$2,$3,$4)',
      [id, email, hash, 'active']
    );

    // FEAT-023: новые регистрации в pending_approval до одобрения админом.
    // status='suspended' ставим явно — bridge trigger trg_sync_status_from_access_status
    // навешан на UPDATE OF access_status, на INSERT не срабатывает.
    // Доп. поля (dob, tree, x, y) принимаются здесь же — после phase31 фронт
    // не может PATCH'ить /profiles под JWT pending'а (restrictive write guard).
    await pool.query(
      `insert into public.profiles
         (id, email, name, city, role, status, access_status, seeds,
          dob, tree, tree_desc, x, y)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       on conflict (id) do update set email=excluded.email, name=excluded.name, city=excluded.city`,
      [id, email, name || null, city || null,
       'applicant', 'suspended', 'pending_approval', 0,
       dob || null, tree || null, tree_desc || treeDesc || null,
       x ?? null, y ?? null]
    );

    const token = signToken({ sub: id, email });
    res.json({
      token,
      user: { id, email, name, city, role: 'applicant', access_status: 'pending_approval' }
    });

    // TG-уведомление в @garden_grants_monitor_bot, fire-and-forget — не блочим
    // регистрацию если TG не настроен / лагает / падает.
    notifyNewRegistration({ id, name, email, city }).catch((e) => {
      logClientError({
        ts: new Date().toISOString(),
        level: 'tg-notify-registration-failed',
        error: String(e?.message || e),
        userId: id,
      });
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

И новая функция (после `httpsPostJson` и `escapeMd`, перед `s3Client`):

```js
// FEAT-023 — уведомление админа в @garden_grants_monitor_bot о новой регистрации.
// Использует существующий MON-001 sender (httpsPostJson, IPv4-only, обход
// happy-eyeballs к api.telegram.org с этого сервера).
const notifyNewRegistration = async ({ id, name, email, city }) => {
  if (!TG_API || !TG_CHAT_ID) return;

  const safeName  = escapeMd(String(name  || 'без имени'));
  const safeEmail = escapeMd(String(email || ''));
  const safeCity  = escapeMd(String(city  || 'не указан'));
  const adminUrl  = `${PUBLIC_URL || ''}/#/admin?tab=pending&user=${id}`;

  const text = [
    '🌱 *Новая регистрация*',
    `Имя: ${safeName}`,
    `Email: ${safeEmail}`,
    `Город: ${safeCity}`,
    `[Открыть в админке](${adminUrl})`,
  ].join('\n');

  const tgRes = await httpsPostJson(TG_API, {
    chat_id: TG_CHAT_ID,
    text,
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
  }).catch((e) => ({ ok: false, status: 0, text: String(e?.message || e) }));

  if (!tgRes.ok) {
    logClientError({
      ts: new Date().toISOString(),
      level: 'tg-notify-registration-failed',
      status: tgRes.status,
      body: String(tgRes.text || '').slice(0, 500),
      userId: id,
    });
  }
};
```

---

## 3. Расширение scope vs. изначальный план — почему обязательно

Phase 1 (phase31) поставила **restrictive guards на 38 таблиц**, включая `profiles`. После phase31 поведение `dataService.register` ломается:

[dataService.js:1283-1301](../../services/dataService.js#L1283-L1301) делает после `/auth/register`:

```js
await this._ensurePostgrestUser({...});   // GET /profiles?id=eq.<id> → []
                                          // потом POST /profiles → restrictive write FAIL
const patch = { tree, tree_desc, dob, x, y };
if (Object.keys(patch).length > 0) {
    await postgrestFetch('profiles', { id: `eq.${created.id}` }, {
        method: 'PATCH', body: patch, ...                                  // RLS FAIL
    });
}
```

Для нового pending-юзера:
- `_ensurePostgrestUser` GET вернёт `[]` (restrictive select режет own row), POST → 403/0 rows.
- `PATCH /profiles` → 0 rows changed.
- Метод бросает **«Не удалось создать пользователя в новой базе. Напишите администратору»**, регистрация на фронте умрёт с alert'ом.

**Без расширения backend'а — phase31 ломает FEAT-023 в первый же тест.**

### Что я предлагаю

Backend `/auth/register` атомарно принимает **все** поля профиля (текущие 4 + новые `dob, tree, tree_desc, x, y`) и вставляет за один INSERT. Frontend сможет:
- по-прежнему слать всё в одном вызове `api.register(userData)`,
- НЕ делать `_ensurePostgrestUser` и `PATCH /profiles` если ответ от register говорит `access_status='pending_approval'`,
- или вообще не делать (всё уже создано) — Phase 3.

### Альтернатива (если не хочешь расширять Phase 2)

Можно оставить `/auth/register` только с базовыми полями, но тогда в Phase 3 надо:
- сделать `dataService.register` пропускающим `_ensurePostgrestUser`/PATCH для pending'а,
- **dob/tree/x/y будут потеряны** для всех pending'ов навсегда,
- после approval юзер увидит «дерево» NULL и `x,y` NULL (не отрисуется на карте).

Это плохо для UX. Поэтому **я склоняюсь к расширению** — несколько дополнительных параметров в SQL, простая, чистая правка.

**Прошу 🟢 на расширение body** или решение «делаем альтернативу».

---

## 4. TG-уведомление — формат и поведение

### Шаблон (Markdown V1, по аналогии с `/api/client-error`)

```
🌱 *Новая регистрация*
Имя: <name>
Email: <email>
Город: <city|не указан>
[Открыть в админке](<PUBLIC_URL>/#/admin?tab=pending&user=<id>)
```

- `escapeMd` уже экранирует `` ` * _ ``.
- `disable_web_page_preview: true` — чтобы TG не пытался превьюшить ссылку на админку.
- Если `TG_API` или `TG_CHAT_ID` не настроены в env — `notifyNewRegistration` молча возвращается. Регистрация всё равно проходит.

### Fire-and-forget

Вызов `notifyNewRegistration(...).catch(...)` идёт **после** `res.json(...)`. То есть клиент получает ответ моментально, не ждёт TG. Если TG лагает или падает — ошибка пишется в `CLIENT_ERROR_LOG` через `logClientError`, регистрация не отменяется.

### Deep-link `tab=pending&user=<id>`

Сейчас в AdminPanel такого tab нет — он появится в Phase 3 (PendingApprovalAdminView). Ссылка будет работать после Phase 3 deploy. До этого — Ольга кликнет, попадёт в admin / увидит сообщение «вкладка не найдена» или fallback на default tab (зависит от того как реализую в Phase 3). Не блокер.

---

## 5. Что НЕ меняется

- `/auth/login`, `/auth/me`, `/auth/request-reset`, `/auth/reset`, `/storage/sign`, `/health`, `/api/health`, `/api/client-error` — без изменений.
- `signToken`, `authMiddleware`, `transporter`, всё MON-001-ное.
- `TG_BOT_TOKEN`, `TG_CHAT_ID` env vars — переиспользую те же, никаких новых не вводим.
- `pool` — те же подключения.

---

## 6. Deploy plan

### 6.1 Pre-deploy

1. Backup текущего prod-файла:
   ```
   ssh root@5.129.251.56 'cp /opt/garden-auth/server.js /opt/garden-auth/server.js.bak.2026-05-16-pre-phase2'
   ```
2. rsync новой версии (только server.js, не трогаем node_modules / .env):
   ```
   rsync -avz /Users/user/vibecoding/garden-auth/server.js root@5.129.251.56:/opt/garden-auth/server.js
   ```
3. Restart:
   ```
   ssh root@5.129.251.56 'systemctl restart garden-auth && sleep 2 && systemctl status garden-auth --no-pager | head -20'
   ```

### 6.2 Smoke

1. `curl https://auth.skrebeyko.ru/api/health` → `{ok:true, service:'garden-auth', ...}`.
2. `curl POST /auth/register` с тестовым email типа `phase2-smoke-<ts>@test.local` + всеми полями (dob, tree, x, y).
3. Проверить ответ: `user.access_status === 'pending_approval'`, JWT возвращён.
4. SQL: `SELECT id, role, status, access_status, dob, tree, x, y FROM profiles WHERE email=<smoke>` → access_status='pending_approval', status='suspended', все доп. поля сохранены.
5. Проверить TG: Ольга смотрит в `@garden_grants_monitor_bot` есть ли сообщение «🌱 Новая регистрация».
6. Cleanup: `DELETE FROM profiles WHERE email=<smoke>; DELETE FROM users_auth WHERE email=<smoke>;`.

### 6.3 Откат если что-то не так

```
ssh root@5.129.251.56 'cp /opt/garden-auth/server.js.bak.2026-05-16-pre-phase2 /opt/garden-auth/server.js && systemctl restart garden-auth'
```

---

## 7. После apply

- **Существующая регистрация через старый фронт** будет частично сломана (фронт пытается PATCH dob/tree после register — он провалится молча, но запись профиля уже есть с `access_status='pending_approval'`). Поэтому **сразу после Phase 2 нужен Phase 3** (фронт перестаёт PATCH'ить + показывает PendingApprovalScreen).
- Можно ли apply'ить Phase 2 БЕЗ Phase 3? — Только при условии что НИКТО не будет регистрироваться в окне Phase 2→Phase 3. Если зарегается — попадёт в pending, увидит **сломанный экран** (попытка загрузить данные с пустым результатом), не сможет понять что произошло.
- **Рекомендую apply Phase 2 + Phase 3 как одно деплоймент-окно** (последовательно за час-два). Или хотя бы временно повесить «техработы» на регистрацию на время gap'а.

---

## 8. Что нужно от тебя

1. **🟢 на расширение scope §3** (принимать dob/tree/tree_desc/x/y в body register) — или «делаем альтернативу, dob потеряем».
2. **🟢 на TG-формат §4** (текст, fire-and-forget, deep-link).
3. **🟢 на полный diff §2** (правки в server.js).
4. **🟢 на deploy plan §6**.
5. **Решение по §7** — apply Phase 2 сейчас (ломается окно регистрации до Phase 3) или дождаться готового Phase 3 и apply одним окном?

После всех 🟢:
- rsync на прод, restart, smoke.
- Коммит локального server.js + diff закидываю в git.
- Отчёт в `_session/43_codeexec_phase2_applied.md`.

---

## 9. Сопутствующее

### 9.1 Phase 31 закоммичен

`8ccaa49 feat(rls): FEAT-023 Phase 1 — pending_approval + restrictive access guards (phase31)` — миграция + 10 _session файлов.

### 9.2 Параллельная работа — не трогал

В git untracked: `35..41` от FEAT-024 / phase32 — это другой поток, не моё. Я их сознательно не коммичу.

### 9.3 phase33 cleanup (твоя просьба зафиксировать минор)

Запишу в `plans/BACKLOG.md` после Phase 2 apply:
- `phase33-cleanup`: переименовать truncated policy на `pvl_student_certification_criteria_scores` (имя обрезано до 63 байт PostgreSQL) на короткое (`pvl_cert_criteria_aag_select/_write`), и поправить V10 `created_at → id` в файле phase31 (уже сделано локально, но если миграция когда-то будет re-apply — пригодится).

После Phase 2 — добавлю эти пункты в BACKLOG.md явно.
