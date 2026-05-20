# FEAT-025 password reset — recon бриф для codeexec

**От:** стратега (claude.ai)
**Кому:** codeexec (VS Code Claude Code)
**Дата:** 2026-05-20 утро
**Зелёный:** Ольга 🟢 (read-only recon, без apply/commit/push)
**Связано:** lesson `2026-05-19-jwt-staleness-after-admin-password-reset.md`,
handover `_79`, evening-close `_80`

---

## Зачем

За 18-19 мая два разных пользователя застряли на классе auth-проблем
«не могу войти / пароль не такой / JWT не подходит». Решение, которое
выбрала Ольга утром 2026-05-20 — **классический password reset через
email** (привычный паттерн, не magic-link-как-замена). См. evening-close
`_80` секцию «Что осталось открытым» и сегодняшнее обсуждение.

Прежде чем писать implementation план — нужно понять **что уже есть**.
На скриншоте Маши Романовой 2026-05-19 видна кнопка **«Забыли пароль?»**
прямо под формой входа в AuthScreen. UI элемент существует, но
неизвестно, что он делает (noop / заглушка / частично работает /
полностью работает но без email).

Также критичный блокер: **email transport**. Если smtp/sendgrid не
настроен в garden-auth — мы не сможем отправить ни reset-letter, ни
будущий magic link, ни FEAT-024 Phase 5 (TG-анонс может тоже email
нужен — отдельный вопрос).

---

## Что проверить (по слоям)

### 1. Frontend — кнопка «Забыли пароль?»

Файлы для просмотра:
- `views/AuthScreen.jsx` (или где живёт login форма — найди через grep
  `Забыли пароль` или `forgot_password` или `password_reset`)
- Роутер: `App.jsx`, `views/router.jsx` или похожее — есть ли route
  `/reset-password`, `/auth/reset`, `/forgot-password`, `/auth/recover`?
- `services/authService.js` / `services/dataService.js` — есть ли method
  типа `requestPasswordReset(email)` или `resetPassword(token, newPwd)`?

Ответить:
- **Что делает onClick «Забыли пароль?»** прямо сейчас (точная строка + behavior)
- Есть ли роут под reset-password страницу?
- Есть ли API-method обращения к garden-auth для reset?
- Если есть — куда стучится (`/auth/...` endpoint URL)?

### 2. Backend — garden-auth

⚠ **Важно:** работаем в `~/vibecoding/garden_claude/garden-auth` (или
где у тебя clone). Перед началом — `git remote -v`, должно быть
`ligacreate/garden-auth` (не `olgaskrebeyko/garden-auth` — это АРХИВ).

Файлы/команды:
- `git -C garden-auth log --oneline -20` — есть ли коммиты про
  `password reset` / `pwd_reset` / `forgot`?
- `grep -rn "password.reset\|reset.password\|forgot.password\|pwd.reset" garden-auth/src/` — есть ли any endpoint?
- `cat garden-auth/package.json` — есть ли в dependencies
  `nodemailer`, `@sendgrid/mail`, `postmark`, `mailgun.js`, `aws-sdk`
  (для SES)?
- На проде через `ssh root@5.129.251.56 cat /opt/garden-auth/.env`
  (или твоя текущая команда читания env-vars без выдачи их в чат) —
  есть ли переменные типа `SMTP_HOST`, `SMTP_USER`, `SENDGRID_API_KEY`,
  `POSTMARK_TOKEN`, `EMAIL_FROM`?
- `ls garden-auth/src/email/` или `garden-auth/src/mail/` — есть ли
  модуль email send?

Ответить:
- **Есть ли уже endpoint `/auth/request-password-reset` или похожий?**
  Если да — что делает (404 / 501 / реально отсылает / отсылает но
  email не настроен)?
- **Есть ли работающий email transport в garden-auth?** Каким пакетом,
  какой провайдер, какие env-vars?
- **Был ли когда-то отправлен реальный email через garden-auth?**
  Логи в `/var/log/garden-auth.log` или `journalctl -u garden-auth |
  grep -i email` — есть ли any traces успешной отправки?

### 3. БД — таблицы reset/verification tokens

Через `ssh root@5.129.251.56` под `gen_user` к managed Postgres:

```sql
-- Есть ли таблица под password reset tokens?
\dt password_reset*
\dt email_*token*
\dt *verification*
\dt *reset*

-- Содержимое если есть:
SELECT count(*) FROM password_reset_tokens;  -- или то имя что есть
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = '<имя_таблицы>' ORDER BY ordinal_position;
```

Ответить:
- **Есть ли таблица под reset/verification tokens?**
- Если есть — какая схема (id, user_id, token/token_hash, jti?,
  created_at, expires_at, consumed_at?)
- Сколько строк, есть ли свежие (за последние 30 дней)?
- Есть ли GRANT'ы на эту таблицу для роли `web_anon` /
  `authenticated`?

### 4. Email content — есть ли уже templates?

- `garden-auth/templates/` или `garden-auth/emails/` или `garden-auth/src/email/templates/` — есть ли HTML-шаблоны?
- Файлы типа `reset_password.html`, `verify_email.html`, `welcome.html`?

Ответить — что есть, что отсутствует.

### 5. История: были ли когда-то emails от Garden?

Опросить Ольгу через handover (НЕ тебе спрашивать самой — codeexec не
ходит к Ольге через TG):
- В отчёте обозначь как **open question to strategist** — пользователи
  когда-нибудь получали emails от Garden? (welcome, confirmation,
  notification)?

---

## Формат отчёта

Файл: `docs/_session/2026-05-20_82_codeexec_pwd_reset_recon.md`

Структура:
1. Frontend findings (onClick, route, API method)
2. Backend garden-auth findings (endpoint, transport, env)
3. БД findings (таблицы, schema, grants)
4. Email content findings (templates)
5. **Implementation gap table** — что есть, чего нет, по 5 слоям
6. **Effort estimate** по 3 сценариям:
   - (A) Если всё уже частично сделано, осталось дописать — ~ часов
   - (B) Если есть только UI, остальное с нуля — ~ часов
   - (C) Если ничего нет включая email transport — ~ часов
7. **Open questions to strategist** (если что-то не очевидно)

---

## Что НЕ делать

- ❌ Не апплаить миграции, не править код, не делать commit/push
- ❌ Не публиковать env-vars (`.env` содержимое) в файле отчёта или в
  чате — только подтверждать **наличие** переменных по именам
- ❌ Не отправлять тестовый email самостоятельно (если случайно
  обнаружишь рабочий endpoint — не дёргай его, чтобы не засорить логи)
- ❌ Не делать DDL на проде даже для recon — только `SELECT` и метакоманды psql

---

## Параллельно

Стратег пишет параллельный бриф для **Claude in Chrome** (smoke-runner)
для проверки UX-flow клика по «Забыли пароль?» с DevTools Network.
Это покрывает живое поведение в браузере, а codeexec — код/БД/env.
Делятся scope без overlap.

Файл для CinC: `_session/2026-05-20_81b_strategist_pwd_reset_cinc_brief.md`

---

## Timeline

Recon ~15-30 мин. Отчёт `_82` → стратег → продуктовое решение с Ольгой
(имя FEAT-025 утверждено, scope от effort estimate зависит) →
implementation бриф `_83` → diff `_84` → apply `_85`.
