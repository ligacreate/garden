# FEAT-025 housekeeping batch — бриф для codeexec

**От:** стратега (claude.ai)
**Кому:** codeexec (VS Code Claude Code)
**Дата:** 2026-05-20
**Зелёный:** Ольга 🟢
**Связано:** `_81` (recon бриф), `_82` (recon отчёт), `_81b` (CinC бриф),
`_82b` (CinC отчёт с моей аннотацией), вчерашние `_80` evening-close +
lesson 2026-05-19-jwt-staleness

---

## Контекст

FEAT-025 password reset **verify-completed** — Ольга утром сделала
live smoke в incognito-окне на своём аккаунте:
- ✅ Письмо пришло (в inbox, не spam)
- ✅ Ссылка работает (открывает reset форму)
- ✅ Новый пароль работает (логин с ним проходит)
- 🟡 Старая (не incognito) сессия с прежним JWT **продолжает работать**
  — password reset **не** инвалидирует существующие JWT (заведено
  отдельным тикетом SEC-PWD-RESET-INVALIDATE-JWTS, P2)

Никаких code/DDL changes нужно — только housekeeping batch:
1. Закрыть FEAT-025 в backlog как DONE
2. Завести 5 новых тикетов (готовые тексты ниже — копипаст)
3. Обновить прод git-remote на ligacreate (Q3 из recon отчёта)

---

## Что делать (в порядке исполнения)

### Шаг 1. Прочитать сохранённый CinC отчёт

`docs/_session/2026-05-20_82b_cinc_pwd_reset_recon.md` — там стратегом
сохранён live UI recon CinC с явной аннотацией про неверную Firebase
атрибуцию. Учти при чтении.

### Шаг 2. Обновить `plans/BACKLOG.md`

#### 2.1. Добавить FEAT-025 в раздел истории (после строки 4520 + блока
от вчерашнего вечера, который я добавила вчера через session `_80`)

```markdown
### 2026-05-20 утро (стратег + codeexec session `_81`..`_83`)

- ✅ **FEAT-025 Password reset email flow** (verify-only, без code changes).
  Recon `_82` показал что полный flow уже реализован: frontend
  AuthScreen «Забыли пароль?» → `onLogin({isReset:true})` →
  `dataService.resetPassword` → `POST /auth/request-reset` → sha256(token)
  в `users_auth` + nodemailer send → email с ссылкой → `?token=`
  парсится в AuthScreen → `POST /auth/reset` → bcrypt новый pwd.
  **Live smoke 2026-05-20 (Ольга):** письмо пришло в inbox, ссылка
  работает, новый пароль работает.
  - Frontend: `views/AuthScreen.jsx:14-26, 95-136, 154, 246`;
    `App.jsx:225, 290`; `services/dataService.js:1340-1348`
  - Backend: `garden-auth/server.js:691, 727`
  - БД: `public.users_auth.reset_token` + `reset_expires` (sha256 hash,
    TTL 30 мин)
  - SMTP: nodemailer + env `SMTP_HOST/PORT/USER/PASS/FROM` в
    `/opt/garden-auth/.env`
  - **Старая сессия НЕ инвалидируется** — заведён отдельный тикет
    [[SEC-PWD-RESET-INVALIDATE-JWTS]] (P2).
  - Live UI recon Claude in Chrome выявил 2 UX-бага (no client
    validation на пустой email + silent fail на 404 backend) —
    заведён тикет [[UX-AUTH-FORM-FEEDBACK]] (P2). См. `_82b` с моей
    аннотацией (CinC ошибочно приписал Garden Firebase, реально
    самописный garden-auth — поправлено).
  - Сессии: `_81, _81b, _82, _82b, _83`.
- ✅ **Открыто (новые тикеты для будущих сессий):**
  - **SEC-PWD-RESET-INVALIDATE-JWTS** (P2) — admin/user reset должен
    bump `jwt_min_iat`, чтобы старые JWT инвалидировались. Закрывает
    root-cause Maria Romanova кейса вчера. Подробности в lesson
    `docs/lessons/2026-05-19-jwt-staleness-after-admin-password-reset.md`.
  - **UX-AUTH-FORM-FEEDBACK** (P2) — AuthScreen reset форма silent
    fails. Объединить с UX-MEETINGS-FORM-NATIVE-ALERT в один эпик
    «AuthForms-UX-Refresh».
  - **FEAT-025-INFO-DISCLOSURE-FIX** (P3) — `/auth/request-reset`
    возвращает 404 для unknown email вместо нейтрального 200.
  - **FEAT-025-EMAIL-HTML** (P3) — HTML template + DKIM/SPF для
    deliverability.
  - **INFRA-AUTH-PROD-GIT-REMOTE** (P3) — `/opt/garden-auth/.git`
    указывает на архив olgaskrebeyko.
```

#### 2.2. Добавить 5 новых тикетов в правильные секции

##### **SEC-PWD-RESET-INVALIDATE-JWTS** → в раздел P2 (после строки
829, или куда хронологически правильно)

```markdown
### SEC-PWD-RESET-INVALIDATE-JWTS: password reset / admin-reset должен инвалидировать существующие JWT пользователя
- **Статус:** 🔴 TODO
- **Приоритет:** P2 (security smell; risk profile low — closed community
  + Ольга 2026-05-20 оценила «вряд ли кто-то будет красть пароли», но
  known incident: BUG-PUBLIC-MEETING-SAVE 2026-05-19)
- **Создано:** 2026-05-20 (после verify FEAT-025 — smoke 2026-05-20
  показал что reset не инвалидирует существующие JWT)
- **Контекст:** Подтверждено живым smoke'ом — Ольга сменила пароль в
  incognito, основная (не incognito) сессия с старым JWT продолжает
  работать. Access-token TTL = 30 дней в garden-auth, refresh не
  реализован. Это означает:
  - User-initiated reset (забыл пароль) — не защищает от уже
    выпущенных украденных JWT в течение 30 дней
  - Admin-reset (admin меняет hash через psql) — старые JWT
    пользователя в браузере продолжают жить, RLS/triggers могут
    реджектить странным generic-error'ом
- **Реальный кейс:** BUG-PUBLIC-MEETING-SAVE-INVALID-CREDENTIALS (Maria
  Romanova, 2026-05-19) — admin-reset hash'a не инвалидировал её JWT
  в браузере → public save фейлил с generic «Неверные данные...» →
  час диагностики. См. lesson
  `docs/lessons/2026-05-19-jwt-staleness-after-admin-password-reset.md`.
- **Scope (один батч, ~2-4 часа codeexec):**
  1. DDL миграция: `ALTER TABLE profiles ADD COLUMN jwt_min_iat
     timestamptz DEFAULT '1970-01-01'` (backfill: старые JWT остаются
     валидны до миграции; новые после миграции с `iat > jwt_min_iat`).
  2. garden-auth middleware: при проверке JWT добавить
     `if (decoded.iat * 1000 < user.jwt_min_iat.getTime()) return 401`
  3. garden-auth `/auth/reset` endpoint: после успешной смены пароля —
     `UPDATE profiles SET jwt_min_iat = NOW() WHERE id = user.id`
  4. (опционально) Документировать в RUNBOOK: при ручном admin-reset
     hash через psql — выполнить также
     `UPDATE profiles SET jwt_min_iat = NOW() WHERE id = $1`
  5. ⚠ Не забыть `SELECT public.ensure_garden_grants()` в конце
     миграции (RUNBOOK 1.3)
- **Acceptance:**
  - User делает reset через email → старые JWT во всех
    вкладках/устройствах не работают (401)
  - Admin делает reset через psql + `jwt_min_iat = NOW()` → то же
  - Smoke: воспроизвести Maria-кейс — admin-reset, попытка public save
    в старой вкладке → теперь должна давать 401 (понятный), а не
    silent generic
- **Связано:** lesson 2026-05-19-jwt-staleness, FEAT-025 (закрыт
  verify, этот тикет — security follow-up),
  [[feedback-strategist-trigger-fix-jwt-verify]] (соседняя тема)
```

##### **UX-AUTH-FORM-FEEDBACK** → в раздел P2

```markdown
### UX-AUTH-FORM-FEEDBACK: AuthScreen reset-форма не валидирует пустой email и не показывает backend-ошибки
- **Статус:** 🔴 TODO
- **Приоритет:** P2 (UX smell, тот же класс что
  [[UX-MEETINGS-FORM-NATIVE-ALERT]])
- **Создано:** 2026-05-20 (после live UI recon Claude in Chrome
  `_82b_cinc_pwd_reset_recon.md`)
- **Контекст:** Smoke recon CinC показал два UI бага в reset-форме:
  1. Пустой email + клик «Сбросить пароль» → запрос не уходит, но
     и **никакой ошибки/блокировки** пользователю не показывается.
     Console: silent exception без сообщения. Кнопка остаётся
     активной.
  2. Несуществующий email → запрос уходит (POST
     `/auth/request-reset`), backend возвращает 404 `Email not
     found`, но UI **никак не реагирует** — ни toast, ни inline
     error. Пользователь не понимает, ушло письмо или нет.
- **Это тот же класс** что UX-MEETINGS-FORM-NATIVE-ALERT: silent
  fails + generic alerts. За 18-20 мая третий тикет в этой категории.
- **Recommend объединить** с UX-MEETINGS-FORM-NATIVE-ALERT в один
  эпик «AuthForms-UX-Refresh»:
  - Универсальный handler errors из garden-auth + PostgREST → читаемый
    message по HTTP-status code
  - Inline валидация email (HTML5 `type="email" required` + pre-submit
    check)
  - Toast или inline error compatible с обоими формами (login + reset
    + meeting save)
- **Файлы:** `views/AuthScreen.jsx:95-136` (handleForgot,
  handleResetSubmit), `views/MeetingsView.jsx:894` (window.alert),
  общий компонент Toast (если есть) или создать
- **Acceptance:**
  - Empty submit blocked клиентски с inline-error
  - Backend 4xx показан читаемым сообщением (не generic «Неверные
    данные...»)
  - 404 на unknown email → нейтральное «Если email зарегистрирован,
    ссылка отправлена» (см. также [[FEAT-025-INFO-DISCLOSURE-FIX]])
- **Связано:** [[UX-MEETINGS-FORM-NATIVE-ALERT]] (handover `_79`),
  lesson 2026-05-19-jwt-staleness (та же боль)
```

##### **FEAT-025-INFO-DISCLOSURE-FIX** → в раздел P3

```markdown
### FEAT-025-INFO-DISCLOSURE-FIX: /auth/request-reset возвращает 404 для несуществующего email — раскрытие
- **Статус:** 🔴 TODO
- **Приоритет:** P3 (минорный security smell; для Garden = closed
  community с approval-flow для applicant'ов — невысокий риск)
- **Создано:** 2026-05-20 (после recon `_82` line 151)
- **Контекст:** `garden-auth/server.js:151` —
  `if (!rows.length) return res.status(404).json({ error: 'Email not found' })`.
  Это раскрывает существование email-адреса в системе. Security best
  practice — всегда возвращать 200 OK независимо от существования
  email.
- **Решение:** изменить на:
  ```js
  if (!rows.length) {
    console.info(`[request-reset] unknown email: ${normalizedEmail}`);
    return res.json({ ok: true });  // silent для security
  }
  ```
- **Effort:** ~15 минут, single-line fix в server.js + scp на прод +
  restart garden-auth
- **Связано:** [[FEAT-025]] (parent), [[UX-AUTH-FORM-FEEDBACK]]
  (frontend часть — нейтральное сообщение)
```

##### **FEAT-025-EMAIL-HTML** → в раздел P3

```markdown
### FEAT-025-EMAIL-HTML: HTML email template + brand + DKIM/SPF для deliverability
- **Статус:** 🔴 TODO
- **Приоритет:** P3 (cosmetic + deliverability)
- **Создано:** 2026-05-20 (после verify FEAT-025; smoke 2026-05-20
  показал что текущий plain text доходит в inbox у Ольги — но без
  warmup на массовых провайдерах риск spam для других пользователей)
- **Контекст:** Текущее email — `garden-auth/server.js:716` —
  однострочный plain text «Ссылка для сброса пароля: <url>».
  Функционально OK, но:
  - Plain text + no DKIM/SPF → высокий шанс spam-фильтрации на mail.ru,
    yandex, gmail, outlook (особенно для массовых отправок в будущем)
  - Без брендинга «Сад ведущих» / приветствия / footer / expiration-hint
    — пользователь может подумать что фишинг
- **Scope:**
  1. HTML template с inline CSS — приветствие, кнопка-ссылка, expiration
     hint (30 минут), footer с brand
  2. Plain text fallback с тем же содержанием (в `text:` параллельно с
     `html:`)
  3. Subject: «Восстановление пароля — Сад ведущих» (вместо
     «Восстановление пароля»)
  4. Проверить DKIM/SPF на `skrebeyko.ru` через mxtoolbox.com или
     dig, при необходимости — обновить DNS у hightek
  5. (опционально) `console.info` об успешной отправке в garden-auth
     logs для observability
- **Effort:** ~1-2 часа на template + plain fallback; +30 мин на
  DKIM/SPF проверку + DNS update (внешняя зависимость — hightek
  поддержка)
- **Связано:** [[FEAT-025]] (parent), будущий magic link если решим
  делать, [[FEAT-024 Phase 5]] (TG-анонс если будет email-fallback)
```

##### **INFRA-AUTH-PROD-GIT-REMOTE** → в раздел P3

```markdown
### INFRA-AUTH-PROD-GIT-REMOTE: /opt/garden-auth/.git origin указывает на архив olgaskrebeyko
- **Статус:** 🔴 TODO (5-минутный housekeeping)
- **Приоритет:** P3
- **Создано:** 2026-05-20 (после recon `_82` Q3)
- **Контекст:** На проде `/opt/garden-auth/.git` remote `origin` =
  `https://github.com/olgaskrebeyko/garden-auth` (АРХИВ с 20 фев 2026,
  GitHub не пускает push). Не блокер (deploy через scp, не git pull
  на проде), но любой случайный `git pull origin main` на проде
  потянет stale контент.
- **Решение:** один ssh-команда:
  ```bash
  ssh root@5.129.251.56 'cd /opt/garden-auth && git remote set-url origin https://github.com/ligacreate/garden-auth.git && git remote -v'
  ```
- **Acceptance:** `git remote -v` на проде показывает
  `ligacreate/garden-auth.git` для fetch и push
- **Effort:** ~2 минуты — может быть выполнено прямо в этом батче,
  если есть 🟢 от стратега (см. Шаг 3 ниже)
- **Связано:** [memory project-garden] (актуальные репозитории под
  ligacreate)
```

### Шаг 3. Выполнить housekeeping: обновить прод git-remote

🟢 от стратега на это действие в этом батче:

```bash
ssh root@5.129.251.56 'cd /opt/garden-auth && git remote set-url origin https://github.com/ligacreate/garden-auth.git && git remote -v'
```

Ожидаемый output: `origin  https://github.com/ligacreate/garden-auth.git (fetch)` + `(push)`.

После — обновить статус [[INFRA-AUTH-PROD-GIT-REMOTE]] в backlog на
✅ DONE + добавить timestamp в History блок выше.

### Шаг 4. Commit + push

⚠ **Important:** Решение про push требует твоего понимания —

- Все изменения в этом батче: `plans/BACKLOG.md` + `docs/_session/_82b`
  + `docs/_session/_83` + (опционально) запись от меня вчера в
  `docs/lessons/2026-05-19-jwt-staleness-after-admin-password-reset.md`
  и `docs/_session/_80_strategist_evening_close.md` (я их положила
  вчера локально, push не делала)
- **Никакого frontend code** не меняем
- **Никакого garden-auth code** не меняем (только git remote URL на
  проде, не файлы)
- Frontend bundle `index-Dgwl91od.js` остаётся тем же — re-build не
  нужен

**Если ты уверен что GH Actions frontend deploy workflow имеет
`paths-ignore` на `docs/**` + `plans/**`** → можно безопасно push'ить
сейчас одним коммитом. Frontend deploy не triggered, chunk-hash flap
не случится, `feedback-batch-deploys-no-race` не нарушается.

**Если уверенности нет** (или paths-ignore не настроен) → сделать
local commit, push отложить до утреннего батча завтра с первыми
фиксами. Безопаснее.

Проверь .github/workflows/*.yml на frontend repo и реши сам.

Commit message (для опции «можно push'ить»):

```
chore(docs/backlog): FEAT-025 verify done + 5 new tickets + housekeeping

- FEAT-025 password reset: verify-only smoke success, no code changes
- New P2: SEC-PWD-RESET-INVALIDATE-JWTS, UX-AUTH-FORM-FEEDBACK
- New P3: FEAT-025-INFO-DISCLOSURE-FIX, FEAT-025-EMAIL-HTML, INFRA-AUTH-PROD-GIT-REMOTE
- Housekeeping: prod /opt/garden-auth git remote → ligacreate
- Session docs: _81, _81b, _82, _82b, _83
- Carry-forward from yesterday evening: _80 + lesson 2026-05-19-jwt-staleness
```

---

## Что НЕ делать

- ❌ Не трогать frontend код (никаких изменений в `src/`, `views/`,
  `services/`) — это рисковало бы chunk-hash rotation
- ❌ Не трогать garden-auth `server.js` (исправления info-disclosure
  отложены в P3 тикет, не в этот батч)
- ❌ Не делать DDL миграцию SEC-PWD-RESET-INVALIDATE-JWTS — это P2
  тикет на будущий батч
- ❌ Не отправлять никаких test emails через /auth/request-reset
  (smoke уже сделан Ольгой)
- ❌ Не публиковать `.env` содержимое
- ❌ Не пушить если нет уверенности про paths-ignore на GH Actions —
  local commit, ждать утра

---

## Формат отчёта

Файл: `docs/_session/2026-05-20_84_codeexec_housekeeping_batch_applied.md`

Структура (компактная):
1. Какие изменения в `plans/BACKLOG.md` сделаны (cited line numbers)
2. Что с прод git-remote (output `git remote -v` до и после)
3. Status коммита (SHA, push'ен ли, или local-only с explanation)
4. Если push — link на GH commit
5. Любые сюрпризы / отклонения от плана

---

## Timeline

Весь батч ~15-30 мин: чтение CinC отчёта, добавление 5 тикетов в
backlog + 1 история-запись, ssh для git remote update, commit (+ push
если безопасно), отчёт `_84`.
