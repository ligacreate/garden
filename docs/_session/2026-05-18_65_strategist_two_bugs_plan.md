# План действий по двум багам — recon + fix

**От:** стратег (claude.ai)
**Кому:** Ольга → codeexec (когда подключится)
**Дата:** 2026-05-18 (вечер)
**Тип:** план recon → fix для двух открытых production-issue, обнаруженных в эту сессию.

---

## BUG-1: HW-SUBMIT-NO-HISTORY — сдача ДЗ студенткой не пишет в status_history

### Контекст / симптом

3 жалобы за день, одна причина:
- Ирина Одинцова (06:03 МСК): «менти написала, что сдала домашку, но уведомление не пришло»
- Василина Лузина (06:45 МСК): «У меня тоже уведомление не пришло о домашке. На платформе вижу что сдано задание вчера»
- Елена Федотова (16:42 МСК): «Мне уведомление о домашке не пришло». Менти — Елена Курдюкова (submission `0e0ec503-...`), сдала → Елена потом сама отправила на доработку.

### Что я уже узнала

- ✅ Hotfix phase34 (`'submitted'→'in_review'` в функции `tg_enqueue_homework_event`) applied и работает корректно
- ✅ Триггеры на месте (`trg_tg_enqueue_homework_event` AFTER INSERT)
- ✅ Worker garden-auth активен, polling каждые 15 сек
- ✅ Все 3 ментора + Елена Курдюкова привязали TG
- 🔴 **За сегодня 5 записей в `pvl_homework_status_history` — ВСЕ от менторских actions (3× in_review→accepted, 1× in_review→revision). Ни одной от студенток (`*→in_review` или `revision→in_review`).**
- 🔴 `tg_notifications_queue` пустая, ни одного hw_submitted_new/_revision event за сегодня.
- 🔴 Submissions в `pvl_student_homework_submissions` обновляются (status='revision' у `0e0ec503-...` в 17:08 МСК), но соответствующего INSERT в status_history нет.

### Где код пишет в status_history

- В коде есть **только одно место**, где вызывается `pvlPostgrestApi.appendHomeworkStatusHistory`: `services/pvlMockApi.js:2199`, внутри функции `doPersistSubmissionToDb` (которую обёрнули в `persistSubmissionToDb` с retry × 3 и `fireAndForget`-swallow).
- Берёт last 3 entries из локального `db.statusHistory` (in-memory state-machine) и INSERT'ит каждую в Postgres.
- Validation: `changed_by` должен быть валидным UUID, иначе `throw`.
- При retry-exhausted: `addNotification(studentId, 'db_save_error', 'Не удалось сохранить ДЗ на сервере...')` + `logDbFallback(...)`.

### Гипотезы root cause (по приоритету)

1. **`db.statusHistory` локальный state-machine не получает запись при сдаче** — frontend mutates submissions/state без push в statusHistory. Тогда `persistSubmissionToDb` берёт `last 3` уже **старые** entries (или пусто) → новый event не появляется в Postgres.
2. **RLS блокирует INSERT для студенток.** Recent commits: `f46049d` (homework_status_history.changed_by — реальный UUID, BUG-006), `7585407` (JWT sub для actor_user_id и changed_by, BUG-003). Если RLS требует `changed_by = auth.uid()` AND `is_mentor_for OR student_id=auth.uid() OR is_admin()`, для студентки `student_id=auth.uid()` — должно проходить. Но если auth.uid() ↔ changed_by mismatch из-за JWT-sub vs profile.id путаницы — INSERT отбрасывается.
3. **`changed_by` UUID throw** в коде (line 2192-2195): если `getAuthUserId()` возвращает не-UUID для студентки, exception при первой попытке → retry × 3 → exhausted → addNotification → silent.
4. **fireAndForget swallow без visible error.** Если flow реально падает, должны быть entries в `logDbFallback` или `addNotification` (с `db_save_error`). Recon обоих.

### Recon шаги (доделать перед fix)

1. **`logDbFallback` за сегодня** — есть ли записи `endpoint='/pvl_student_homework_submissions'` с `status='error'`? Где хранится — в БД или в memory?
2. **`addNotification` с type='db_save_error'** — есть ли в `pvl_notifications` за сегодня для студенток?
3. **Полный код `doPersistSubmissionToDb`** (line 2129-~2210) — посмотреть, как формируется entries для `appendHomeworkStatusHistory`, что в `db.statusHistory` ожидается.
4. **RLS policy на `pvl_homework_status_history_insert`** — повторить detailed check, симулировать INSERT под student-аккаунтом.
5. **Логи `garden-auth` за сегодня** — может быть exceptions от postgrest/JWT при попытках student INSERT'ов.

### Fix-стратегия (когда recon доделан)

- Если гипотеза (1) — добавить push entry в `db.statusHistory` при flow сдачи.
- Если гипотеза (2) — поправить RLS или JWT-sub mapping.
- Если гипотеза (3) — нормализовать `changedBy` через robust UUID resolver, fallback на pvl_students.id.
- Если гипотеза (4) — добавить console.error / explicit logging в catch, чтобы видеть real exception.

### Acceptance criteria

После fix:
- Ирина Петруня (привязана) сдаёт ДЗ → запись в `pvl_homework_status_history` создаётся → event `hw_submitted_*` в queue → Юля получает push в TG.
- За первые 24h после deploy — наблюдаем хотя бы один natural случай (любая менти любого ментора).

---

## BUG-2: AUTH-USER-CREATE-FAIL — «Не удалось создать пользователя в новой базе»

### Контекст / симптом

Мария Бардина (`mb1@bk.ru`) пытается войти на платформу, получает: «Не удалось создать пользователя в новой базе. Напишите администратору».

### Что я уже узнала

- ✅ Мария **существует** в `profiles` (id `0b2c96cc-9b2a-496a-b5b9-0c7ef87b151f`, role='leader', **access_status='paused_manual'**) и в `users_auth` с тем же id. Не в `auth.users` (legacy).
- 🔴 access_status='paused_manual' — её аккаунт **на ручной паузе**.
- 🔴 Сообщение «Не удалось создать пользователя в новой базе» throw'ится из `_ensurePostgrestUser` в `services/dataService.js` (документировано в `_session/_42`, `_session/_43`, `snapshots/API_OUTAGE_IMPACT_ANALYSIS.md`).

### Гипотезы root cause (по приоритету)

1. **Login flow для paused-юзера сломался после FEAT-023 phase31.** Phase31 ввела RESTRICTIVE RLS-guards `has_platform_access(auth.uid())` на 38 таблиц. Если `has_platform_access` возвращает `false` для `access_status='paused_manual'`, то при login:
   - `_fetchProfile` идёт через PostgREST с JWT'ом Марии
   - RLS-guard режет SELECT (потому что paused → no platform access)
   - `_fetchProfile` возвращает `null` (или `[]`)
   - Login кодом: «если профиля нет → попробовать создать через `_ensurePostgrestUser`»
   - POST tries to create profile, но RLS блокирует INSERT тоже (или unique constraint на email, потому что profile уже есть)
   - throw → frontend показывает «Не удалось создать пользователя в новой базе»
2. **Половинная миграция Phase31:** для paused-юзеров access_status не приведён к 'paused_manual' корректно, profile в half-state.
3. **JWT-claim issue:** auth-token Марии не содержит правильный sub или role, PostgREST не находит её строку из-за RLS на (auth.uid() = id).

### Recon шаги (доделать перед fix)

1. **Тело функции `has_platform_access(uuid)`** — пропускает ли она `paused_manual`? Какие статусы дают `true`?
2. **Тело `_ensurePostgrestUser` в `services/dataService.js`** — что именно делает после `_fetchProfile`-NULL?
3. **Логи garden-auth за окно её попытки** (Мария жаловалась 18.05, надо узнать когда конкретно — спросить @staysil или Марию). Должен быть POST /auth/login + последующий POST/PATCH /profiles с failure.
4. **Список pause-юзеров на проде:** `SELECT count(*), access_status FROM profiles GROUP BY access_status` — есть ли ещё пользователи в этом состоянии, которым может не дать войти.
5. **`SubscriptionExpiredScreen` flow** — куда login должен направлять paused-юзеров? Per memory `project-garden.md`: «Концептуально пауза = полный лок. Не входит в приложение, выкидывает на SubscriptionExpiredScreen». Если frontend перестал распознавать paused → fallback на «новой базе» error.

### Fix-стратегия (когда recon доделан)

- Если гипотеза (1) — расширить `has_platform_access` чтобы `paused_manual` разрешал SELECT на profile (для distinguishing «exists but paused» от «doesn't exist»), плюс frontend должен корректно показать SubscriptionExpiredScreen.
- Если гипотеза (3) — поправить JWT-claim mapping или RLS predicate.

### Acceptance criteria

После fix:
- Мария Бардина может попасть на SubscriptionExpiredScreen (а не на «новой базе» error).
- Все paused-юзеры показывают правильный screen при попытке входа.
- Новые регистрации не страдают (FEAT-023 продолжает работать).

---

## Workflow на возврат Ольги

### Порядок выполнения

1. **Стратег (claude.ai):** доделать recon шаги для обоих багов (read-only через SSH+psql + чтение кода). Без write.
2. **Стратег:** написать diff-on-review план для codeexec по каждому багу (отдельные `_session/` файлы — `_66` для BUG-1, `_67` для BUG-2).
3. **Codeexec:** apply фиксы по очереди (BUG-2 первым — критичен для login, потом BUG-1 — push'и не критично-блокер).
4. **Каждый fix — отдельный коммит**, push последовательно (concurrency block страхует от race).
5. **Smoke после каждого:** для BUG-2 — попросить Марию ещё раз попробовать войти. Для BUG-1 — попросить Ирину Петруню сдать тестовое ДЗ (она привязана, мента Юля привязана).

### Что нужно от Ольги, когда вернётся

- 🟢 на recon-расширение (я доделаю чтение БД и кода)
- Уточнить когда Мария жаловалась — нам нужно знать примерное время для grep garden-auth логов
- Решить порядок fix'ов: BUG-2 (login fail) или BUG-1 (push fail) первым? Я склоняюсь к **BUG-2 первым** — Мария вообще не может войти на платформу, это hard-block; BUG-1 — push'и не приходят, но менторы продолжают работать через UI.

---

## Параллельный side-finding (не сегодня)

Текст сообщения «Не удалось создать пользователя в новой базе. Напишите администратору» **не объясняет пользователю что делать**. После fix BUG-2 стоит улучшить message: для paused-юзеров «Ваш аккаунт на паузе. Свяжитесь с administratorом для активации». Это UX-fix следующей сессии.
