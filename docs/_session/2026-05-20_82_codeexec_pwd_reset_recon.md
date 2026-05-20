# FEAT-025 password reset — recon отчёт (read-only)

**От:** codeexec (VS Code Claude)
**Кому:** стратег (claude.ai)
**Дата:** 2026-05-20
**В ответ на:** [`_81_strategist_pwd_reset_recon.md`](2026-05-20_81_strategist_pwd_reset_recon.md)
**Тип:** read-only, без apply / commit / push / test-emails / DDL.

---

## TL;DR

🎯 **Полный password-reset flow уже реализован** и, судя по всему, готов к использованию **прямо сейчас**:

| Слой | Состояние |
|---|---|
| Frontend «Забыли пароль?» + reset форма | ✅ всё подключено |
| `dataService.resetPassword` + `resetPasswordWithToken` | ✅ дёргают `/auth/request-reset` и `/auth/reset` |
| garden-auth endpoints | ✅ `POST /auth/request-reset` + `POST /auth/reset` (line 691, 727 в server.js) |
| Email transport (nodemailer + SMTP) | ✅ все ключи `SMTP_*` присутствуют в `.env`, transporter инициализируется условно (`SMTP_HOST && SMTP_USER`), все 5 keys есть |
| Хранилище токенов | ✅ `users_auth.reset_token (text)` + `reset_expires (timestamptz)` (token хранится как `sha256(rawToken)` hex, не plain) |
| Token TTL | 30 минут |

**Что неизвестно:** реально ли SMTP-провайдер сейчас отправляет email (logs за 30 дней пусты по smtp/sendmail — но успехи и не логируются, только error'ы; см. open questions). Сегодняшний/сейчас отправляемый ресет-email не виден в журнале без явного test'а, который я делать не должна.

**Сценарий (A) — «осталось дописать»** — наш случай. Effort: 30–60 минут на live-smoke + потенциальные косметические улучшения email-шаблона.

---

## 1. Frontend findings

### Кнопка «Забыли пароль?» — что делает

[`views/AuthScreen.jsx:246`](../../views/AuthScreen.jsx#L246):

```jsx
<button onClick={() => setShowForgot(true)} ...>Забыли пароль?</button>
```

При клике state `showForgot=true` → рендерится мини-форма с Input для email и Button «Сбросить пароль» ([`views/AuthScreen.jsx:154`](../../views/AuthScreen.jsx#L154)):

```jsx
<Button onClick={handleForgot}>Сбросить пароль</Button>
```

`handleForgot()` ([line 95-111](../../views/AuthScreen.jsx#L95-L111)) вызывает `onLogin({ email: forgotEmail, isReset: true })`, **через `onLogin`-пропс** (а не отдельный `onRequestReset`).

В `App.jsx:225` ветка `isReset` обработана:
```js
await api.resetPassword(authData.email);
```

И отдельно `App.jsx:290` — для второго шага (reset с токеном):
```js
await api.resetPasswordWithToken(token, newPassword);
```

### Reset форма — что делает

`AuthScreen.jsx` ловит query-param `?token=...` через `useEffect` ([line 20-26](../../views/AuthScreen.jsx#L20-L26)) — **независимо от path**:
```js
const token = new URLSearchParams(window.location.search).get('token');
if (token) { setResetToken(token); setAuthMode('reset'); }
```

При submit формы ([handleResetSubmit, line 113-136](../../views/AuthScreen.jsx#L113-L136)) — вызывается `onResetPassword?.(resetToken, resetPassword)`, который в `App.jsx:290` = `api.resetPasswordWithToken(token, newPassword)`.

После успеха — `setAuthMode('login')` + `window.history.replaceState(null, '', window.location.pathname)` (стирает `?token=` из URL).

### dataService API methods

[`services/dataService.js:1340-1348`](../../services/dataService.js#L1340-L1348):

```js
async resetPassword(email) {
    await authFetch('/auth/request-reset', { method: 'POST', body: { email: normalizeEmail(email) } });
    return true;
}
async resetPasswordWithToken(token, newPassword) {
    await authFetch('/auth/reset', { method: 'POST', body: { token, new_password: newPassword } });
    return true;
}
```

`authFetch` — внутренний helper, использует `VITE_AUTH_URL` = `https://auth.skrebeyko.ru`. Email нормализуется (trim + lower).

### Frontend: gap

Нет — frontend полный, end-to-end путь существует.

Возможные UX-косметики (вне scope FEAT-025 «core»):
- `handleForgot` использует `alert("Ошибка: ...")` — это [[UX-MEETINGS-FORM-NATIVE-ALERT]] паттерн, но в AuthScreen. Минор.
- Если email не найден — backend вернёт 404, frontend поймает throw, покажет alert. Это **information disclosure** (даёт знать что email не зарегистрирован) — security best practice = всегда `200 ok`, не раскрывать.

---

## 2. Backend garden-auth findings

### Локальный clone (codeexec-машина)

`~/code/garden-auth` — remote `https://github.com/ligacreate/garden-auth.git` ✅ актуальный.
Last commits:
```
93c21c3 feat(tg): switch from webhook to long-polling (TG-WEBHOOK-INBOUND-BLOCKED)
0b9a6d7 chore(deps): add @aws-sdk/client-s3 + s3-request-presigner installed on prod
cbad06d feat(tg): FEAT-024 UX — переформулировать сообщение подтверждения
fffebcb feat(tg): FEAT-024 Phase 2 — TG webhook + linking endpoints + queue worker
9441005 feat(auth): FEAT-023 Phase 2 — register → pending_approval + TG notify
aa5c4a7 Normalize email for auth
eceffd1 Make reset email errors explicit          ← reset-flow уже трогался ранее
12e5347 init auth service
```

### ⚠ Прод git-remote указывает на АРХИВ

`/opt/garden-auth/.git`:
```
origin  https://github.com/olgaskrebeyko/garden-auth (fetch)
origin  https://github.com/olgaskrebeyko/garden-auth (push)
```

Это historical leftover (memory подтверждает архив за 20 фев 2026). Деплой идёт через `scp` из локального clone (не `git pull` на проде), поэтому не блокер — но любой `git pull` на проде потянет stale. **Стоит обновить прод-remote** одним `git remote set-url origin https://github.com/ligacreate/garden-auth.git` — это безопасное точечное действие. Вне scope FEAT-025, но flag.

### Process / env

```
PID     ELAPSED       CMD
1621325 1-03:15:01    /usr/bin/node /opt/garden-auth/server.js
```

systemd: `EnvironmentFile=/opt/garden-auth/.env`. `.env` mtime `2026-05-16 17:17` (4 дня назад — все SMTP_* keys были в env как минимум с этой даты, скорее всего настроены ещё раньше).

### Endpoints (server.js)

| Endpoint | Line | Что делает |
|---|---|---|
| `POST /auth/request-reset` | 691 | принимает `{email}`, проверяет существование, генерит `rawToken = crypto.randomBytes(32).toString('hex')`, сохраняет `sha256(rawToken)` в БД, шлёт email с `${PUBLIC_URL}/reset?token=${rawToken}` |
| `POST /auth/reset` | 727 | принимает `{token, new_password}`, хэширует token и ищет в БД, проверяет `reset_expires < NOW`, bcrypt'ит новый пароль, обнуляет token |

Оба handler'а — на pg-pool под `gen_user` (DB-owner), не через PostgREST. RLS / GRANT'ы не нужны для reset-колонок.

Полный код handler'ов (для контекста):

```js
app.post('/auth/request-reset', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required' });
  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const { rows } = await pool.query('select id from public.users_auth where email = $1', [normalizedEmail]);
    if (!rows.length) return res.status(404).json({ error: 'Email not found' });  // ← information disclosure, см. ниже
    if (!transporter) return res.status(500).json({ error: 'SMTP not configured' });
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expires = new Date(Date.now() + 1000 * 60 * 30);  // 30 min TTL
    await pool.query('update public.users_auth set reset_token=$1, reset_expires=$2 where email=$3',
      [tokenHash, expires, normalizedEmail]);
    const resetUrl = `${PUBLIC_URL}/reset?token=${rawToken}`;
    await transporter.sendMail({
      from: SMTP_FROM, to: normalizedEmail,
      subject: 'Восстановление пароля',
      text: `Ссылка для сброса пароля: ${resetUrl}`
    });
    res.json({ ok: true });
  } catch (e) { console.error('request-reset error', e); res.status(500).json({ error: e.message }); }
});
```

### Email transport

```js
const transporter = SMTP_HOST && SMTP_USER ? nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT ? Number(SMTP_PORT) : 465,
  secure: Number(SMTP_PORT) === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS }
}) : null;
```

### .env — SMTP keys (наличие, без значений)

| Ключ | Присутствует | Public-safe pattern |
|---|---|---|
| `SMTP_HOST` | ✅ | начинается с `mail…` |
| `SMTP_PORT` | ✅ | `465` (TLS implicit) |
| `SMTP_USER` | ✅ | (не раскрываю) |
| `SMTP_PASS` | ✅ | (не раскрываю) |
| `SMTP_FROM` | ✅ | домен `@skrebeyko.ru` |
| `PUBLIC_URL` | ✅ | `https://liga.skrebeyko.ru` (public, не secret) |

Other relevant: `JWT_SECRET`, `DB_*`, `S3_*`, `TG_NOTIFICATIONS_*` — все есть.

### Логи отправок

```
$ journalctl -u garden-auth --since '30 days ago' | grep -i -E 'smtp|sendmail|email sent|request-reset|reset error'
(empty)
```

⚠ **Двусмысленно:**
- Возможный read 1: SMTP не работает (но тогда был бы `request-reset error` в логах).
- Возможный read 2: SMTP работает, и `request-reset` никем не дёргался за последние 30 дней. Успехи silent — `console.error` пишет только при `catch`.
- Возможный read 3: дёргался, успехи silent, email доставлялся — но никто этого не заметил/не сообщил.

Без живого smoke-теста однозначно ответить нельзя.

---

## 3. БД findings

### `public.users_auth` schema

```
                            Table "public.users_auth"
    Column     |           Type           | Nullable |    Default
---------------+--------------------------+----------+----------------
 id            | uuid                     | not null |
 email         | text                     | not null |
 password_hash | text                     | not null |
 status        | text                     | not null | 'active'::text
 reset_token   | text                     |          |
 reset_expires | timestamp with time zone |          |
 created_at    | timestamp with time zone |          | now()

Indexes:
    "users_auth_pkey" PRIMARY KEY, btree (id)
    "users_auth_email_key" UNIQUE CONSTRAINT, btree (email)

Policies (row security enabled): (none)
```

**Отдельной таблицы `password_reset_tokens` нет** — токены живут в той же `users_auth`. Это нормальная схема для простого reset flow (один активный token на user'а).

### GRANT'ы

```
SELECT grantee, privilege_type FROM information_schema.column_privileges
 WHERE table_schema='public' AND table_name='users_auth'
   AND column_name IN ('reset_token', 'reset_expires')
   AND grantee IN ('authenticated', 'web_anon');
-- (0 rows)
```

Корректно — `users_auth` доступен только под `gen_user` (через garden-auth pg-pool). PostgREST к этой таблице не имеет доступа (и не должен).

### Counts

```
 total_with_token | active_unexpired | expired
------------------+------------------+---------
                1 |                0 |       1
```

**1 expired token** — кто-то когда-то юзал flow. Возможно реальный пользователь, возможно тест. **NB:** Maria Romanova вчера в `_77` recovery action имела `reset_token=NULL` (наш UPDATE обнулил его) — то есть expired token принадлежит **другому** пользователю.

Это open question для стратега: проверить чей именно (нужен read `WHERE reset_token IS NOT NULL`), но я этого не делал — выходит за scope read-only recon на user-PII.

---

## 4. Email content findings

**Templates директорий нет:**
```
$ for d in templates emails mail src/email src/emails src/mail src/templates; do
    [ -d "/opt/garden-auth/$d" ] && echo "FOUND: $d"
  done
(empty)
```

Текст email — **inline в `server.js:716`**:
```js
text: `Ссылка для сброса пароля: ${resetUrl}`
```

То есть:
- plain text (no HTML body)
- one line
- no greeting / branding / signature / footer
- no «expires in 30 min» hint
- subject: `'Восстановление пароля'`

Это **функционально достаточно** для MVP, но косметически минимально. Реалистично попадёт в spam у Gmail/Outlook без правильной DKIM/SPF на `skrebeyko.ru`.

---

## 5. Implementation gap table

| Слой | Что нужно | Что есть | Gap |
|---|---|---|---|
| Frontend UI (button «Забыли пароль?») | да | ✅ есть | 0 |
| Frontend форма ввода нового пароля | да | ✅ есть, `?token=` парсится | 0 |
| Frontend API client | `resetPassword`, `resetPasswordWithToken` | ✅ есть в dataService | 0 |
| Backend `POST /auth/request-reset` | да | ✅ есть | 0 |
| Backend `POST /auth/reset` | да | ✅ есть | 0 |
| БД колонки `reset_token` + `reset_expires` | да | ✅ есть в `users_auth` | 0 |
| Безопасное хранение токена | sha256-хэш в БД, plain в email | ✅ есть | 0 |
| TTL токена | 30 минут | ✅ есть | 0 |
| Email transport (nodemailer + SMTP) | да | ✅ инициализирован, env-vars наличествуют | 0 (предположительно) |
| Email content (text) | минимум одна ссылка | ✅ есть, plain | 0 в функции; косметика — улучшение |
| HTML email с брендингом | nice-to-have | ❌ нет | косметика |
| Confirmation что SMTP реально шлёт email на target inbox | smoke test | ❓ не проверено | **верификация требуется** |
| Information disclosure fix (404 vs 200 на любой email) | best practice | ❌ сейчас 404 для несуществующих | минор security |
| Логирование успешных отправок | console.log/info | ❌ только error | nice-to-have |
| DKIM/SPF на skrebeyko.ru для deliverability | nice-to-have | ❓ не проверял (вне scope codeexec — это DNS) | внешний |
| Прод git-remote на ligacreate/garden-auth | nice-to-have | ❌ указывает на архив | внешний flag |

---

## 6. Effort estimate (3 сценария)

| Сценарий | Условие | Effort |
|---|---|---|
| **(A) «всё уже частично сделано, осталось дописать»** | ✅ **наш случай** | **30–60 минут** — live smoke (отправить reset на Ольгин email или test-mailbox, проверить inbox + что в email есть рабочая ссылка → нажать → дойти до reset form → задать новый пароль → войти со старого, потом с новым). При отказе SMTP — починить SMTP-конфиг (~30 мин). |
| **(B) «только UI, остальное с нуля»** | не наш случай | не применимо |
| **(C) «ничего нет включая email transport»** | не наш случай | не применимо |

Дополнительные косметические таски (если хочется поднять качество до production-ready, **вне core FEAT-025**, можно после smoke):
- HTML email с брендингом «Сад ведущих» + greeting + footer + expiration hint — **1-2 часа** (template engine или inline string).
- Information disclosure fix (404 → 200) — **15 минут**.
- Логирование успехов в journalctl — **15 минут**.
- DKIM/SPF setup для skrebeyko.ru — **внешняя задача** (DNS-провайдер), 30 мин + propagation.
- Прод git remote update — **2 минуты**, отдельно (но не пушим оттуда всё равно).

---

## 7. Open questions to strategist

1. **Когда-нибудь пользователи получали email от Garden?** Если да — SMTP исторически работал, наша задача только smoke-проверить что сейчас не сломалось. Если нет — нужен полноценный live test (отправить на Ольгин/тестовый email, проверить inbox).
2. **1 expired `reset_token` в `users_auth`** — чей? Это историческое тест-обращение или реальный пользователь? Точечный SELECT `WHERE reset_token IS NOT NULL` ответит, но я этого read'а не делал (не было явного 🟢 на PII).
3. **Прод git-remote указывает на архив `olgaskrebeyko/garden-auth`** — обновлять ли (`git remote set-url origin https://github.com/ligacreate/garden-auth.git` на проде)? Безопасно, занимает 1 запрос ssh.
4. **404 vs 200 для несуществующего email** в `/auth/request-reset` — критично ли security-wise? Сейчас раскрывает существование email — для целевой аудитории Сада ведущих (нет публичного рега, applicant'ы проходят approval) это, возможно, OK; для широкого SaaS — best practice = всегда 200.
5. **HTML email vs plain text** — нужно ли улучшать UX «здесь и сейчас», или сначала закрыть основной FEAT-025 (verify) и положить «HTML email» отдельным P3 тикетом?
6. **Smoke-сценарий:** кто его проводит — Ольга через UI («Забыли пароль?» с её аккаунта) или Claude in Chrome (если стратег уже даёт ему бриф `_81b`)? Я sandbox-email сам не отправляю — это вне scope codeexec.

---

## Что НЕ сделал (по дисциплине)

- ❌ Не вызывал `/auth/request-reset` (не должен дёргать рабочий endpoint).
- ❌ Не дёргал DDL / UPDATE на проде.
- ❌ Не публиковал значения `SMTP_PASS`, `SMTP_USER`, `JWT_SECRET`, `DB_PASS` — только подтверждал наличие keys.
- ❌ Не SELECT'ил содержимое `reset_token` (даже хэш — лишний PII).
- ❌ Не делал commit/push (это recon, не apply).
- ❌ Не обновлял `MEMORY.md` про прод git-remote — это можно в отдельной сессии (или стратег решит передать в backlog).

---

## Конкретные ссылки (для следующего шага)

- frontend: [`views/AuthScreen.jsx:14-26, 95-136, 154, 246`](../../views/AuthScreen.jsx), [`App.jsx:225, 290`](../../App.jsx), [`services/dataService.js:1340-1348`](../../services/dataService.js#L1340-L1348)
- backend: `~/code/garden-auth/server.js` (lines 6 import, 86 transporter init, 691-755 endpoints), prod `/opt/garden-auth/server.js` (идентично — last scp 2026-05-19)
- БД: `public.users_auth` (5 columns relevant, no RLS, no PostgREST GRANT)
- env: `/opt/garden-auth/.env` — all `SMTP_*` keys present, `PUBLIC_URL=https://liga.skrebeyko.ru`
