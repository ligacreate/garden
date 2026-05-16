# FEAT-024 — TG-уведомления для менторов и студенток ПВЛ

**От:** стратег (claude.ai)
**Кому:** VS Code Claude Code
**Дата:** 2026-05-16
**Тип:** recon + план, до кода.
**Приоритет:** P1 (менторам реально не хватает обратной связи о сдачах ДЗ).
**Очередь:** делаем **после** FEAT-023 (Phase 1 + 2 + 3), не блокирует.

---

## Проблема

Менторы курса ПВЛ узнают о сданных/дополненных ДЗ только когда сами заходят на платформу и проверяют. Часто это с задержкой в день+. Студентки тоже не знают когда их ДЗ проверили — заходят и обновляют экран. Email-уведомлений нет (FEAT-020 в backlog как P2). Telegram-уведомлений нет.

## Решения Ольги (2026-05-16)

1. **TG вместо email** для уведомлений — менторы в TG целый день, почта пропускается.
2. **Новый отдельный бот** `@garden_notifications_bot` (или похожее) — НЕ смешиваем с `@garden_grants_monitor_bot` (там админ-алерты).
3. **Обоим направлениям** — ментор узнаёт о сдачах, студентка о проверках.
4. **Скоп событий MVP:**
   - Студентка сдала ДЗ → **ментору**
   - Студентка дополнила ДЗ → **ментору**
   - Ментор принял ДЗ → **студентке**
   - Ментор попросил доработать → **студентке**
   - Ментор оставил комментарий → **студентке**
5. Опционально на 2-ю фазу (если успеем легко): вопросы студентки на платформе → ментору.

---

## Что нужно — recon + план, без кода

### 1. Recon существующей TG-инфраструктуры

- **`@garden_grants_monitor_bot`** — как настроен, где живёт бот-токен, какая библиотека (`node-telegram-bot-api`? `grammy`? raw fetch?). См. журналы 2026-05-10 (`INCIDENT_2026-05-10_tg_blackbox.md`).
- **Где сейчас отправляются сообщения** — в `garden-auth/server.js` или в push-server? Какой sender используется?
- **TG-bot API integration** — как обходим блокировку (`/etc/hosts` pin? IPv4-only?). Это нужно учесть в новой реализации.

### 2. Дизайн нового бота `@garden_notifications_bot`

- **Создание бота** — через `@BotFather`, Ольга делает руками, получает токен.
- **Хранение токена** — в `/opt/garden-auth/.env` как `TG_NOTIFICATIONS_BOT_TOKEN`.
- **`/start` flow:**
  - Пользователь делает `/start` боту в TG.
  - Бот получает webhook (или polling).
  - Бот пишет «Здравствуй, [Имя]! Привяжи свой аккаунт Сада командой `/link <email>` (укажи email, под которым ты на платформе).»
  - Пользователь шлёт `/link mentor@example.com`.
  - Бот сверяет email с `profiles.email`, если совпало — сохраняет `tg_user_id` в `profiles.telegram_user_id`.
  - Подтверждение: «Привязал! Теперь буду слать уведомления о ДЗ.»

  **Альтернатива linking flow:** на платформе в профиле кнопка «Привязать Telegram» → генерирует одноразовый код `LINK-XXXX` → пользователь шлёт боту `/link LINK-XXXX`. Без email в чате с ботом. **Более защищённый**, не позволяет привязать чужой email.

  **Я бы взяла альтернативу** — генерация кода в профиле. Безопаснее, и пользователю проще понять flow («нажми кнопку в Саду, бот сам тебя найдёт»).

- **Webhook vs polling** — для production webhook чище (бот не висит постоянно как процесс). Но webhook требует HTTPS URL. У нас уже есть `garden-auth` на `auth.skrebeyko.ru`. Webhook URL = `https://auth.skrebeyko.ru/api/tg-bot/webhook`. Решение — webhook.

### 3. Хранение TG `user_id`

Новая колонка в `profiles`:
- `telegram_user_id bigint nullable` — TG user_id (числовой, не username).
- `telegram_linked_at timestamptz nullable` — когда привязка прошла.
- `telegram_notifications_enabled boolean default true` — мастер-выключатель на случай если хочется выключить (для будущего).

Plus временная таблица для linking codes:
- `tg_link_codes(code text PRIMARY KEY, profile_id uuid, expires_at timestamptz, consumed_at timestamptz nullable)`.

### 4. Backend: отправка уведомлений

Где будут жить notifier-функции — в `garden-auth/server.js` или новый микросервис? **Я предлагаю в garden-auth** (там уже nodemailer для email, легко добавить TG-sender рядом). Один service для всех типов нотификаций.

Функция:
```js
async function sendTgNotification(tgUserId, text, options = {}) {
  // вызов TG Bot API sendMessage с pinned IP (как в monitor bot)
  // обработка ошибок: TG отвечает 403 если юзер заблокировал бота — пометить in DB
}
```

### 5. Triggers — где ловить события

#### Вариант A: триггеры в БД на AFTER INSERT/UPDATE таблиц `pvl_homework_submissions`, `pvl_homework_status_history`

Триггер записывает событие в новую таблицу `tg_notifications_queue(id, recipient_user_id, message_text, event_type, created_at, sent_at nullable, error nullable)`.

`garden-auth` имеет worker (cron каждую минуту), который читает unsent из queue, отправляет в TG, помечает sent_at или error.

**Плюсы:** надёжно (БД-триггер не пропустит), retry легко.
**Минусы:** дополнительная queue-таблица, worker.

#### Вариант B: hooks в Node.js коде

В `services/pvlMockApi.js` или там где сейчас INSERT в submissions — после успешного INSERT звать `notifyMentor()`, после смены статуса — `notifyStudent()`. Через fetch на endpoint в `garden-auth` `POST /api/notify/homework-event`.

**Плюсы:** меньше инфры.
**Минусы:** если фронт делает INSERT напрямую через PostgREST (минуя Node), notify не сработает.

**Сейчас фронт ходит напрямую в PostgREST** (см. `services/pvlPostgrestApi.js`), поэтому вариант B не сработает. **Берём вариант A — БД-триггеры + queue.**

#### Triggers (примерные):

- `AFTER INSERT ON pvl_homework_submissions` → ставим в queue для ментора («Студентка X сдала ДЗ по уроку Y»).
- `AFTER UPDATE ON pvl_homework_submissions WHEN OLD.content != NEW.content` → ставим в queue для ментора («дополнила»).
- `AFTER INSERT ON pvl_homework_status_history WHEN status IN ('accepted','revision_requested','reviewed')` → ставим в queue для студентки.

### 6. Worker / sender

Cron job каждые 30 секунд (или быстрее) в `garden-auth`:
1. SELECT FROM `tg_notifications_queue` WHERE sent_at IS NULL LIMIT 50;
2. Для каждого — `sendTgNotification(...)`.
3. Если 403 (юзер заблокировал бота) — `UPDATE telegram_notifications_enabled=false` на профиле.
4. Если 5xx или network — retry next cycle.
5. UPDATE `tg_notifications_queue` SET sent_at или error.

### 7. Plan фаз

#### Phase 1: миграция БД (~0.3 сессии)
- Колонки `telegram_user_id`, `telegram_linked_at`, `telegram_notifications_enabled` в `profiles`.
- Таблица `tg_link_codes`.
- Таблица `tg_notifications_queue`.
- Триггеры на `pvl_homework_submissions` и `pvl_homework_status_history`.
- VERIFY + ensure_garden_grants.

#### Phase 2: бот webhook + linking flow (~1 сессия)
- Endpoint `POST /api/tg-bot/webhook` в garden-auth — приём update'ов от TG.
- Команды `/start`, `/link <CODE>`.
- Endpoint `POST /api/profile/generate-tg-link-code` (под JWT юзера) — создаёт код, кладёт в `tg_link_codes`.
- UI на платформе: в карточке профиля кнопка «Привязать Telegram» → показывает код + ссылку на бота с `?start=CODE`.

#### Phase 3: notifier-worker (~0.5 сессии)
- Cron в garden-auth (каждые 30 сек) — читает queue, шлёт.
- TG API sendMessage с pinned IP (как у monitor-бота).
- Обработка 403 (заблокировал бота).
- Логирование sent_at / error.

#### Phase 4: smoke (~0.5 сессии)
- Привязать тестового user.
- Из админки симулировать сдачу ДЗ → проверить что queue заполнилась → worker отправил → ментор получил.
- Тест 403 при «заблокировал бота».

#### Phase 5: rollout (~0.2 сессии)
- Пост для команды менторов: «Приходите в `@garden_notifications_bot`, привязывайте профиль».
- Опционально для студенток (после первой недели стабильности).

**Итого:** ~2.5 сессии.

### 8. Открытые вопросы для Ольги (можно ответить после recon)

1. **Имя бота** — `@garden_notifications_bot`, `@skrebeyko_garden_bot`, или ещё какое? Ольге решать (создаёт через @BotFather).
2. **Linking flow** — генерация кода через профиль (моя рекомендация) или просто `/link <email>`? Если код — нужно небольшой UI кусок в профиле.
3. **Tone of voice** уведомлений — «🔔 Дарья сдала задание по уроку 5», или «Привет! У Дарьи готова работа по уроку 5», или нейтральнее?
4. **Группировка** — если ментор за день получит 5 сдач, шлём 5 сообщений или одно сводное? Я бы голосовала за **5 отдельных** (моментальная реакция), но можно подумать.
5. **Тихие часы** — не слать уведомления в 23:00-08:00? Или Ольга считает что менторы сами TG mute'ят?
6. **Пропуск собственных событий** — если ментор сам пишет комментарий студентке, она получает уведомление. А если ментор сам себе пишет (тестирует, например) — не шлём. Edge case, но стоит зафиксировать.

---

## Pre-work для Ольги (можно начать сейчас параллельно с phase31)

1. **Создать бота** через `@BotFather` в TG:
   - `/newbot`
   - Имя: что выберет (моё предложение `@garden_notifications_bot`)
   - Получить токен — положить в файл `~/.skrebeyko/credentials.env` как `TG_NOTIFICATIONS_BOT_TOKEN=...`
2. **Подумать над текстами** уведомлений (короткие, тёплые, в стиле Сада).

---

## Ответ положи в

`docs/_session/2026-05-16_36_codeexec_feat024_recon.md` (или какой свободный номер после phase31).

**Очередь:** не начинай FEAT-024 пока phase31 v2 не закрыт. Сначала apply phase31, потом этот recon.
