# Вечерний хвостов батч — бриф для codeexec

**От:** стратега (claude.ai)
**Кому:** codeexec (VS Code Claude Code)
**Дата:** 2026-05-20 вечер
**Зелёный:** Ольга 🟢
**Связано:** `_83` (housekeeping бриф), `_84` (housekeeping applied),
recon `_82` line 151

---

## Контекст

Два хвоста — backend single-line fix + одно decision-only обновление
backlog'a. Push **не делаем сегодня** (нет paths-ignore ещё, frontend
deploy не нужен) — local commit, накопится с утренним батчем.

---

## Шаг 1. FEAT-025-INFO-DISCLOSURE-FIX

### 1.1. Правка `garden-auth/server.js:151`

Найти:
```js
if (!rows.length) return res.status(404).json({ error: 'Email not found' });
```

Заменить на:
```js
if (!rows.length) {
  console.info(`[request-reset] unknown email: ${normalizedEmail}`);
  return res.json({ ok: true });  // silent ok для anti-enum
}
```

Если найдёшь смежно похожий паттерн в любом другом auth-endpoint
(`/auth/login`, `/auth/reset`) — **не трогай** в этом батче, scope
FEAT-025-INFO-DISCLOSURE-FIX узкий. Другие — отдельным тикетом если
понадобится.

### 1.2. Deploy на прод

```bash
scp garden-auth/server.js root@5.129.251.56:/opt/garden-auth/server.js
ssh root@5.129.251.56 'systemctl restart garden-auth && sleep 2 && systemctl status garden-auth --no-pager | head -10'
```

Подтвердить что service `active (running)` после restart.

### 1.3. Smoke

```bash
curl -i -X POST https://auth.skrebeyko.ru/auth/request-reset \
  -H "Content-Type: application/json" \
  -d '{"email":"nonexistent_xyz_20250520@example.invalid"}'
```

Ожидание: **`HTTP/1.1 200 OK`** + body `{"ok":true}` (раньше было
`404` + `{"error":"Email not found"}`).

Также verify journalctl показывает `[request-reset] unknown email:
nonexistent_xyz_20250520@example.invalid` запись.

### 1.4. Регрессия-check для реального flow

⚠ Важно: убедиться что **существующий** email всё ещё получает
письмо. Можно через тот же curl но с реальным registered email
(например Ольгин `olga@skrebeyko.com`) — **но это спамит её inbox**
ещё одним reset email'ом.

Альтернатива (предпочтительная): прямой psql под `gen_user` на проде,
посмотреть `users_auth.reset_token` ДО smoke и ПОСЛЕ smoke с реальным
email. Если он обновился → endpoint всё ещё работает для existing
users. Это **без отправки реального email**, просто observation что
backend не сломался.

ИЛИ просто пропустить regression check — fix настолько узкий
(одна ветка branch'a `!rows.length`), что вероятность сломать
existing-email path близка к нулю. На твоё усмотрение.

---

## Шаг 2. BACKLOG update — bump UX-MEETINGS-FORM-NATIVE-ALERT

Решение Ольги 🟢 — bump из **P3 в P2** + linked с **UX-AUTH-FORM-FEEDBACK**
как эпик «AuthForms-UX-Refresh».

### 2.1. Переместить тикет

В `plans/BACKLOG.md`:
- Найти `UX-MEETINGS-FORM-NATIVE-ALERT` (он сейчас где-то в P3 секции
  как карри-foward из handover `_79`)
- Если он там как одна строка-упоминание — **расширить в полноценный
  тикет** на месте, со статусом / scope / контекстом. Пример ниже.
- Переместить в P2 секцию (физическое перемещение блока)

Готовый текст тикета (можно прямо так):

```markdown
### UX-MEETINGS-FORM-NATIVE-ALERT: window.alert() в MeetingsView сохранении встречи + общая необработка backend errors
- **Статус:** 🔴 TODO
- **Приоритет:** P2 (bumped 2026-05-20 — третий тикет в классе AuthForms-UX за три дня)
- **Создано:** 2026-05-19 (handover `_79` после Maria Romanova BUG-PUBLIC-MEETING-SAVE)
- **Контекст:** `views/MeetingsView.jsx:894` использует
  `window.alert('Неверные данные, либо ваша почта не подтверждена...')`
  для отображения всех 4xx backend errors при сохранении встречи. За
  18-20 мая **три** пользовательницы попались на этот generic text при
  **разных** backend причинах:
  - Бардина 18.05: на самом деле paused-RLS exception
  - Романова 19.05: на самом деле JWT staleness после admin-reset
  - Reset форма (CinC recon 20.05): silent fail на 404 unknown email
  Каждый раз ~час диагностики ушёл на разбор «какая ошибка на самом
  деле».
- **Эпик «AuthForms-UX-Refresh»** объединяет этот тикет с
  [[UX-AUTH-FORM-FEEDBACK]] — решаем оба одним рефакторингом:
  1. Универсальный handler errors из garden-auth + PostgREST →
     читаемый message по HTTP-status code + endpoint context
  2. Inline валидация на форме (HTML5 + pre-submit check) — пустой
     email, неправильный формат
  3. Toast или inline error component (не `window.alert`) compatible
     со всеми формами (login, register, reset, meeting save)
  4. Нейтральное «Если email зарегистрирован, ссылка отправлена» для
     unknown email (синхронно с FEAT-025-INFO-DISCLOSURE-FIX ✅ DONE
     2026-05-20)
- **Файлы:** `views/MeetingsView.jsx:894` (window.alert),
  `views/AuthScreen.jsx:95-136` (handleForgot, handleResetSubmit),
  общий компонент Toast (если есть) или создать
- **Acceptance:**
  - Никаких `window.alert()` в auth/meeting формах
  - Empty submit blocked клиентски с inline-error
  - Backend 4xx показан читаемым сообщением (не «Неверные данные...»)
- **Effort:** ~3-4 часа одним батчем (рефакторинг + новый Toast/Error
  component + перевод 2 форм на новый flow)
- **Связано:** [[UX-AUTH-FORM-FEEDBACK]] (sister в эпике),
  [[FEAT-025-INFO-DISCLOSURE-FIX]] (backend часть нейтрального
  сообщения, уже ✅ DONE), lesson
  `2026-05-19-jwt-staleness-after-admin-password-reset.md`
  (мотивация — генерик ошибки маскируют root causes)
```

### 2.2. Обновить UX-AUTH-FORM-FEEDBACK

Найти `UX-AUTH-FORM-FEEDBACK` (мы его сегодня утром добавили в P2 в
`_83`).

В секции «Связано» добавить упоминание:
```
- **Эпик «AuthForms-UX-Refresh»** вместе с [[UX-MEETINGS-FORM-NATIVE-ALERT]]
  (теперь тоже P2, bumped 2026-05-20)
```

### 2.3. Закрыть FEAT-025-INFO-DISCLOSURE-FIX

В тикете FEAT-025-INFO-DISCLOSURE-FIX:
- Статус: 🔴 TODO → ✅ DONE
- Добавить раздел «Закрыто 2026-05-20 (вечер)» с:
  - SHA commit'a
  - Output smoke curl
  - Подтверждение что garden-auth restart прошёл успешно

### 2.4. Добавить History block

В разделе истории backlog'a (после блока «2026-05-20 утро» из `_83`):

```markdown
### 2026-05-20 вечер (стратег + codeexec session `_85`..`_86`)

- ✅ **FEAT-025-INFO-DISCLOSURE-FIX** — `garden-auth/server.js:151`
  404 → 200 для unknown email. Backend-only scp + restart, без
  frontend deploy. Smoke: curl с несуществующим email → 200
  `{"ok":true}` ✅. Journalctl показывает `[request-reset] unknown
  email: ...` info-log. SHA: `<заполнить>`.
- ✅ **Bump UX-MEETINGS-FORM-NATIVE-ALERT P3 → P2** — объединено
  с [[UX-AUTH-FORM-FEEDBACK]] в эпик «AuthForms-UX-Refresh» (3-4h
  одним батчем). Decision Ольги 2026-05-20.
- 🟡 **Не пушили** — paths-ignore в `deploy.yml` ещё не настроен,
  любой push triggernet frontend deploy + chunk-flap. Утром
  следующая сессия начинает с paths-ignore, после чего безопасно
  пушит накопленные коммиты (`8d2cf5d` + вечерний batch).
```

---

## Шаг 3. Local commit (НЕ push)

```bash
git add garden-auth/server.js plans/BACKLOG.md docs/_session/_85_strategist_evening_tails_brief.md docs/_session/_86_codeexec_evening_tails_applied.md
git commit -m "chore(backend+backlog): FEAT-025-INFO-DISCLOSURE-FIX done + bump UX-MEETINGS-FORM-NATIVE-ALERT to P2

- backend: server.js:151 404 → 200 for unknown email (anti-enum)
- backlog: FEAT-025-INFO-DISCLOSURE-FIX ✅ DONE
- backlog: UX-MEETINGS-FORM-NATIVE-ALERT P3 → P2 (3rd in AuthForms-UX class за 3 дня)
- backlog: эпик «AuthForms-UX-Refresh» = UX-MEETINGS-FORM-NATIVE-ALERT + UX-AUTH-FORM-FEEDBACK
- session docs: _85, _86

Не пушим вечером (paths-ignore deploy.yml не настроен — будет утром)."
```

Push отложен на утро (по правилу из `_83` шаг 4).

---

## Что НЕ делать

- ❌ Не пушить — paths-ignore ещё нет, deploy triggernet, TG алерты
  будут шуметь ночью
- ❌ Не трогать frontend код (никаких `views/`, `services/`) — вечерний
  scope чисто backend + backlog
- ❌ Не делать ту же 404→200 правку в других endpoint'ах (`/auth/login`,
  `/auth/reset`) — scope узкий, другие отдельным тикетом если
  потребуется
- ❌ Не лезть в paths-ignore сегодня — это утренняя задача с deploy и
  вниманием на регрессии

---

## Формат отчёта

Файл: `docs/_session/2026-05-20_86_codeexec_evening_tails_applied.md`

Структура (компактная, ~50-80 строк):
1. server.js:151 diff (короткий)
2. Output scp + restart + systemctl status
3. Output curl smoke (statusline + body)
4. (опционально) Output regression psql check
5. backlog updates summary (какие строки/секции)
6. local commit SHA
7. Если что-то непонятно или прошло не как ожидалось — open
   question'ом в конце

---

## Timeline

~20-30 минут: правка server.js, scp + restart, curl smoke, backlog
updates, local commit, отчёт `_86`.
