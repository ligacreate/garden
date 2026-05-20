# JWT staleness после admin-password-reset — RLS на «новых правах» режектит старый JWT, генериковый error скрывает причину

**Дата:** 2026-05-19 (поздний вечер)
**Тикет:** BUG-PUBLIC-MEETING-SAVE-INVALID-CREDENTIALS (CLOSED — root cause)
**Связанный recovery:** Admin password reset Maria Romanova (`masha152@yahoo.com`, сессия `_77` ранее тем же днём)

## Симптом

Maria Romanova получила admin-resetnутый bcrypt-hash для своего пароля
(`LigaTemp2026!`) утром 2026-05-19. Вошла на платформу — login прошёл.
Открыла форму создания встречи, поставила галочку «в общее расписание»
(`is_public=true`) → нажала «Сохранить» → видит native browser alert
**«Неверные данные, либо ваша почта не подтверждена. Проверьте пароль,
найдите письмо подтверждения или попробуйте 'Создать аккаунт'.»**

Personal-встреча (без галочки) — сохранилась нормально. Public — нет.

Стратегия recovery вечером: полный logout → закрыть/открыть браузер →
re-login с тем же `LigaTemp2026!` (вручную, не из автозаполнения) →
повторить попытку public save. **Прошло. Полностью.**

## Корневая причина

JWT staleness. Цепочка:

1. **До admin-reset'a** Maria уже была залогинена в браузере с какой-то
   историей JWT.
2. **Admin-reset** записал новый bcrypt-hash в `users_auth.password_hash`
   через psql от Bittern. **JWT в браузере при этом не изменился** —
   мы трогали hash в БД, не invalidate'или существующие сессии.
3. **Login после reset** прошёл через `/auth/login` → garden-auth сверил
   bcrypt → выдал **новый** JWT. Frontend заменил его в localStorage.
4. **НО** — в открытых tab'ах / в кешированном API state мог продолжать
   жить **старый** JWT (на access-token TTL = 30 дней в garden-auth
   refresh ещё не реализован). Какой именно flow подобрал старый JWT —
   неважно: какая-то RLS-policy на `events` (mirror через
   `sync_meeting_to_event` trigger) или WITH-CHECK guard на
   `meetings.is_public=true` сработал на «не тот subject».
5. **Generic error** «Неверные данные...» — это **один** alert-handler
   для всех `4xx` от auth/PostgREST. По его тексту неотличимо: 401 от
   `/auth/login`, 403 от RLS, validation от фронта, email_verified guard.
   Из чистого UX — индистингвишемо.

При полном logout → новый browser session → re-login Maria получила
JWT с правильным `sub`, и save отработал.

## Почему не нашли быстрее

Утром был основной кейс «admin-reset + restore login» — после
успешного login'a (тот же день) Maria открыла save и упёрлась. Я
(стратег утренней сессии) предположил три гипотезы (JWT staleness,
RLS на events, регрессия `is_public=true`) и попросил Maria попробовать
logout/re-login как workaround. Maria не ответила до конца дня —
тикет ушёл в handover `_79` как open P1 «возможно нужен Chrome runner
debug».

Вечером, когда стратег новой сессии (этот файл) попросил Maria
повторить попытку **руками**, не из автозаполнения, и **с полным
браузерным logout** — всё прошло. Гипотеза (a) подтверждена,
(b) и (c) отброшены.

## Что отсюда вытекает (action items)

### 1. UX-MEETINGS-FORM-NATIVE-ALERT — bump приоритета

За два дня **вторая** пользовательница (Мария Бардина 18.05 → Мария
Романова 19.05) застряла на одном и том же generic
«Неверные данные...» из-за **разных** backend причин:
- Бардина: paused user RLS exception (фиксили `_66..69`)
- Романова: JWT staleness после admin-reset

В обоих случаях **час диагностики** ушёл на разделение «неправильный
пароль / RLS / стейл JWT». Если бы alert показывал:
- HTTP status code от backend response
- Какой именно endpoint упал
- Текст error response (где доступен)

...каждый из этих кейсов решился бы за 5 минут без recon-сессии.

**Recommendation:** bump `UX-MEETINGS-FORM-NATIVE-ALERT` с P3 в P1
после следующего ревью бэклога. Effort ~1-2 часа (single file fix в
`views/MeetingsView.jsx:894` + общий toast handler).

### 2. Admin-password-reset должен инвалидировать существующие JWT

Текущий процесс admin-reset (psql UPDATE `users_auth.password_hash`)
**не трогает** существующие JWT. Любой ранее выданный access-token
остаётся валидным до своего TTL (30 дней). Это:
- Security smell (украденный JWT не invalidate'ится сменой пароля)
- UX trap (пользовательница не понимает что её «старый login» всё ещё
  активен и спорит с «новым»)

**Recommendation (новый тикет):** `SEC-PWD-RESET-INVALIDATE-JWTS`.
Варианты:
- (a) JWT version в `profiles` (`jwt_min_iat`); все JWT с `iat <
  jwt_min_iat` reject в middleware garden-auth. Admin-reset bumps
  `jwt_min_iat = now()`.
- (b) Server-side session table с jti, admin-reset делает
  `DELETE FROM sessions WHERE user_id = ...`. Менее гранулярно — все
  устройства разлогиниваются.
- (c) Frontend force-reload + clear localStorage по admin-reset event
  (через push в TG-бот / email с инструкцией). Самый слабый.

Effort: (a) или (b) ~2-4 часа codeexec.

### 3. FEAT-022 magic link login — лишний аргумент «зачем»

Этот кейс ещё одна причина почему FEAT-022 в P1. Magic link обходит
**весь** класс проблем «пароль не такой» / «JWT staleness» / «не помню
пароль»: одноразовый token из email → новый JWT с нуля каждый раз.
Pre-existing JWT issues становятся неактуальны.

## Сигналы / профилактика на будущее

- **Generic auth error → подозревай JWT staleness** перед более экзотическими
  причинами, если пользователь недавно проходил password reset / role
  change / admin action на свой аккаунт.
- **Reset workflow** для будущих admin-актов: всегда передавать
  пользователю в out-of-band вместе с temp-pwd инструкцию:
  «Перед входом — выйти из всех активных сессий (logout в браузере),
  закрыть и открыть браузер, ввести пароль руками (не paste, не
  автозаполнение).» Это снимает 95% «не работает».
- **Smoke admin-reset'a** должен включать: после UPDATE password_hash
  →просим тест-пользователя сделать logout + close browser + login
  + одно write-действие (не только read). Read-only smoke маскирует
  JWT-staleness баги.

## Сигналы что попали в эту ловушку

- Generic auth error appears **только** на write (не read) endpoints
- Personal/non-public ресурсы пишутся ОК, публичные/cross-user — нет
- Logout + browser-restart решает
- В последние 30 дней был admin-password-reset / role-change / paused→active

Любые 2 из 4 — большая вероятность JWT staleness, не bug в коде.

## Связано

- `feedback-strategist-trigger-fix-jwt-verify.md` — про verify-step
  после DB control-flow changes (родственная тема: «новые правила не
  применяются к старым контекстам»)
- BUG-PUBLIC-MEETING-SAVE-INVALID-CREDENTIALS (тикет, теперь CLOSED)
- UX-MEETINGS-FORM-NATIVE-ALERT (P3 → recommend P1)
- SEC-PWD-RESET-INVALIDATE-JWTS (новый тикет, см. выше)
- FEAT-022 magic link login (P1, ещё не started)
- Сессия `_77` (admin-reset Maria Romanova)
- Handover `_79` (где этот баг был открыт как P1)
- `_80_strategist_evening_close.md` (этот сессионный close)
