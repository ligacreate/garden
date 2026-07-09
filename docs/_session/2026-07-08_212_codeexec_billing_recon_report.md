# RECON — Платёжная система подписки (платформо-инициированный checkout, планы 1/3/6 мес)

**Дата:** 2026-07-08
**Автор:** codeexec (VS Code)
**Для:** стратег (claude.ai) → через Ольгу-связного
**Статус:** RECON завершён. Дизайн Фазы 1 — предложение, НЕ строить до 🟢.
**Источники:** прод (ssh root@5.129.251.56, read-only), push-server код, migrations, dataService.js, views/, plans/.

---

## TL;DR (headline)

- **YooKassa — интеграции НЕТ ни в каком виде.** Гринфилд: ноль кода, ноль env, ноль таблиц.
- **Prodamus — живой и принимает платежи прямо сейчас** (48 `payment_success`, последний **сегодня 2026-07-08 17:27**). НО модель — **recurring/webhook-driven** с **нечётким матчем личности** (email→phone→ext_id). **Генерации платёжной ссылки нет. `PRODAMUS_API_KEY` на проде ОТСУТСТВУЕТ.**
- **Целевая модель (платформа кладёт user_id в заказ → вебхук точно знает, кто оплатил) — это архитектурный сдвиг, а не твик.** Нужен слой заказов (`payment_orders`) + серверная инициация checkout + детерминированная идентификация по order_id/user_id вместо fuzzy-матча.
- **Канал напоминаний уже есть и работает:** garden-auth TG-очередь (`@garden_notifications_bot`, FEAT-024) + SMTP, обе полностью сконфигурированы на проде. Web-push формально есть в коде, но **VAPID-ключей на проде НЕТ → push фактически выключен**.
- **Фронт-скелет блокировки доступа уже разведён, но спит:** `_assertActive` — no-op («Temporary open access mode»), `SubscriptionExpiredScreen` + поллинг-логаут в App.jsx подключены, но коды `SUBSCRIPTION_EXPIRED` никто не бросает.

---

## 1. Prodamus на проде — состояние

### Env (`/opt/push-server/.env`, значения замаскированы)
Присутствуют ключи: `DATABASE_URL`, `PORT`, `CORS_ORIGIN=*`, `PRODAMUS_SECRET_KEY` (SET), `PRODAMUS_WEBHOOK_ENABLED=true`, `BOTHUNTER_WEBHOOK_TOKEN`.

**Отсутствуют:**
- ❌ `PRODAMUS_API_KEY` — **НЕТ** (память утверждала обратное — память устарела/ошибочна). → серверная генерация ссылок через Prodamus API сейчас невозможна без добавления ключа.
- ❌ `PRODAMUS_ALLOWED_IPS` — пусто → IP-allowlist вебхука **не форсится**, защита только подписью.
- ❌ `DEFAULT_BOT_RENEW_URL`, `WEB_PUSH_PUBLIC_KEY`/`WEB_PUSH_PRIVATE_KEY`, `AUTH_SERVICE_SECRET` — не заданы.

### Что push-server умеет по Prodamus сейчас
**Только ПРИЁМ вебхука. Генерации платёжной ссылки НЕТ.**
- `POST /api/billing/prodamus/webhook` (= `/webhooks/prodamus`) → `handleProdamusWebhook` (server.mjs:351-433).
- Подпись: `verifyProdamusSignature` (prodamusVerify.mjs) — HMAC-SHA256 по recursive-ksort JSON-canonical (PHP-конвенция), подпись в HTTP-заголовке `Sign` (мостится `pickSignatureSource`). Плюс fallback-кандидаты (sortedBase, md5, sha1). Работает (BUG-PRODAMUS-SIGNATURE-* закрыты).
- Идемпотентность: `billing_webhook_logs` (provider, external_id) partial-unique + `pg_advisory_xact_lock`. `resolveExternalId` берёт event_id/transaction_id/payment_id/order_id, иначе sha256(payload).
- **Идентификация плательщика — fuzzy:** `findProfileByCustomer` (server.mjs:210) матчит по `ext_id/user_id` → **иначе email → иначе телефон**. То есть user_id опционален и в приходящих вебхуках его нет; матч идёт по email. Профиль не найден → `202 replayable`.
- `applyAccessState` (server.mjs:268): на `payment_success/auto_payment` ставит `paid_until = payload.paid_until ?? now()+31д` (фиксированные **31 день**, не план-aware), `access_status=active`, апсертит `subscriptions`. На `deactivation/finish` → `paused_expired` (если не exempt/manual) + `session_version++` + best-effort `POST auth/logout-all`.
- Классификация события — по ключевым словам в payload (`classifyProdamusEvent`, billingLogic.mjs:9).

**Можем ли сгенерить Prodamus-ссылку с embedded user_id/order_id?** — Да, но кода пока нет. Prodamus payform — это **hosted-URL с query-параметрами** (`https://<shop>.payform.ru/?order_id=…&customer_extra=…&products[0][price]=…&_param_user_id=…`). Кастомные `_param_*` возвращаются в вебхуке. **API-ключ для генерации ссылки не нужен** (нужен только домен payform-магазина Ольги). Подпись ссылки опциональна. → инициацию строим сами.

### Prodamus на проде — факты БД
- `billing_webhook_logs`: `prodamus payment_success` — **48** (max **2026-07-08 17:27**), `prodamus unknown` — 2, `bothunter finish` — 2.
- `subscriptions`: `prodamus active` — **19**, `bothunter finished` — 1.
- Вебхук **живой, ежедневно принимает платежи**. Это действующая recurring-подписка.

---

## 2. Billing-модель — актуальная схема

### `profiles` billing-колонки (13, все на проде)
`access_status` (text, def 'active'), `subscription_status` (text, def 'active'), `paid_until` (timestamptz), `last_payment_at`, `prodamus_subscription_id`, `prodamus_customer_id`, `last_prodamus_event`, `last_prodamus_payload` (jsonb), `bot_renew_url`, `session_version` (int, def 1), `auto_pause_exempt` (bool), `auto_pause_exempt_until` (date), `auto_pause_exempt_note` (text).

CHECK: `access_status ∈ (active, paused_expired, paused_manual)`; `subscription_status ∈ (active, overdue, deactivated, finished)`.

### Распределение (прод, 2026-07-08)
- **access_status:** active 53, paused_expired 3, paused_manual 3.
- **subscription_status:** active 55, overdue 3, finished 1.
- **role × access:** admin 3 (all active), applicant 14 active + 2 paused_manual, intern 11 active + 3 paused_expired, leader 18 active + 1 paused_manual, mentor 7 active.
- **paid_until:** заполнен у **19** профилей, диапазон **2026-06-24 … 2026-08-08** (т.е. +31д от последнего вебхука). У остальных 37 — NULL (не платят / exempt).

### Таблицы
- `subscriptions` (id, user_id, provider def 'prodamus', provider_subscription_id, status, paid_until, last_payment_at, ended_at, created/updated_at) — история подписок, unique(provider, provider_subscription_id).
- `billing_webhook_logs` (id, provider, event_name, external_id, payload_json, signature_valid, is_processed, error_text, created_at) — аудит + идемпотентность.
- **Таблиц заказов/планов/инвойсов НЕТ.** (`grep bill|subscription|payment|order|plan|invoice` → только `billing_webhook_logs`, `subscriptions`, `push_subscriptions`.)

### Как paid_until/access_status проставляются
- **paid_until** — ТОЛЬКО серверно, из вебхука `applyAccessState`, **фиксированные +31д** (не зависит от плана). Клиент paid_until не пишет и **нигде не отображает**.
- **access_status** — вебхуком (auto-пауза), ночным reconcile, и админ-мутациями `toggleUserStatus`/`setProfileAutoPauseExempt` (paused_manual/exempt). Клиент читает через `_normalizeProfile` (select `*`), пишет только access/exempt.

### Пауза→session_version→logout-all и ночной reconcile — работают?
- **Да, механика на месте:**
  - `deriveAccessMutation` (billingLogic.mjs:50) на deactivation/finish → `bumpSessionVersion=true` (если не exempt/manual). `applyAccessState` инкрементит `session_version` и делает `POST {AUTH_URL}/auth/logout-all` с `x-service-secret`.
  - **⚠️ Но:** `AUTH_SERVICE_SECRET` на проде push-server **не задан** → logout-all уходит с пустым секретом (best-effort, `.catch(()=>{})`). Нужно проверить, что auth-service его принимает, иначе форс-логаут по факту не срабатывает.
  - **⚠️ Клиент session_version не сверяет** — поле нормализуется в dataService.js:2849 и нигде не используется. Инвалидация сессии на клиенте = только 60-сек поллинг `getCurrentUser` в App.jsx:200-219 (ловит SUBSCRIPTION_EXPIRED/ACCESS_PAUSED_MANUAL → logout). Т.е. session_version — серверный только, реальный logout зависит от auth-service `/auth/logout-all`.
- **runNightlyExpiryReconcile** (server.mjs:550): (а) снимает истёкшие `auto_pause_exempt_until` в false + аудит-лог; (б) `active + paid_until < now()` (кроме admin/applicant и exempt) → `subscription_status=overdue`, `access_status=paused_expired`, `session_version++`. Запуск на старте + `setInterval` 24ч. Работает.

---

## 3. YooKassa

**Интеграции НЕТ, подтверждено с двух сторон:**
- Код: `grep -i yookassa|yoo_kassa|юкасса|yoo-checkout` по всем `*.js/.jsx/.sql` (кроме node_modules) → **0 совпадений**. dataService-агент подтвердил: только `prodamus` как провайдер.
- Прод: в `/opt/push-server/.env` YooKassa-ключей нет. Таблиц нет.

**Точки, которые нужно построить с нуля:**
1. Серверный вызов **POST `https://api.yookassa.ru/v3/payments`** (Basic auth: shopId:secretKey) с `amount`, `confirmation{type:redirect, return_url}`, `capture:true`, `metadata:{user_id, order_id, plan}`, `Idempotence-Key` header. Возвращает `confirmation.confirmation_url` → редирект юзера.
2. Приём вебхука `POST /webhooks/yookassa` — событие `payment.succeeded`. **⚠️ YooKassa вебхуки НЕ подписывает.** Верификация — по (а) IP-allowlist YooKassa + (б) обратный запрос `GET /v3/payments/{id}` для подтверждения статуса (рекомендуется).
3. Идентификация — детерминированно по `object.metadata.user_id` / `metadata.order_id`.

---

## 4. Инфра уведомлений (для напоминаний «подписка кончается»)

| Канал | Состояние на проде | Пригодность для напоминаний |
|---|---|---|
| **garden-auth TG-очередь** (`@garden_notifications_bot`, FEAT-024) | ✅ Ключи заданы: `TG_NOTIFICATIONS_BOT_TOKEN/_USERNAME/_WEBHOOK_PATH/_WEBHOOK_SECRET`. Queue-worker + linking-flow, long-polling. | ⭐ **Лучший вариант.** Целевой push конкретному user_id, юзеры уже линкуют TG (ProfileView `:642` «Telegram-уведомления»). |
| **SMTP (email)** | ✅ `SMTP_HOST/PORT/USER/PASS/FROM` заданы (garden-auth). | ✅ Fallback для тех, кто не залинковал TG. |
| **Web-push (push-server VAPID)** | ❌ `WEB_PUSH_*` ключей на проде НЕТ → `pushEnabled=false`, фактически выключен. `/push/news` — только админ-броадкаст, не таргет. | ⚠️ Не готов, не таргетируемый — не для напоминаний. |
| **BotHunter** | Приёмник событий чата Лиги, не исходящий канал. | ❌ Не для напоминаний. |

**Вывод:** напоминания слать через **garden-auth TG-очередь** (основной) + **email** (fallback). Механизм: ночной job в push-server (или расширение reconcile) находит `paid_until` в окнах T-7/T-3/T-1/expired → кладёт задачу в `tg_notifications_queue` (нужно уточнить контракт очереди в garden-auth) и/или шлёт email. Дедуп напоминаний — по (user_id, окно, paid_until) чтобы не слать дважды.

---

## 5. Фронт — где «Моя подписка / Продлить»

**Сейчас billing-UI для участника практически нет.** `paid_until`/`subscription_status`/`last_payment_at`/`prodamus_*` нормализуются, но **нигде не отображаются**.

- Дом участника — `views/StatsDashboardView.jsx` (геймификация/статы, НЕ StudentDashboard — тот в PVL-прототипе, к биллингу не относится). Монтаж: `views/UserApp.jsx:1006`.
- Единственный billing-экран — **`views/SubscriptionExpiredScreen.jsx`**: «Подписка завершена», кнопка «Продлить подписку» → `renewUrl` (внешний бот), кнопка «Я уже оплатил» → retry.
- Гейтинг — в **App.jsx** (централизованно): state `accessBlock` (:25), ловит `SUBSCRIPTION_EXPIRED`/`ACCESS_PAUSED_MANUAL` на init (:175), login (:273), 60-сек поллинге (:200-219 — кикает активную сессию на paywall). Рендер-гейт :587-609.
- **⚠️ Всё это спит:** `_assertActive` (dataService.js:1242) = `return profile` («Temporary open access mode»), `makeAccessError` определён но не вызывается → коды никто не бросает. `paused_manual` вообще не имеет бросаемого кода на клиенте. Фактический контроль доступа сейчас — серверные PostgREST-гарды + resync_events-триггер (события ведущей на паузе исчезают из публичного фида) + 401.
- Админ: `toggleUserStatus` (suspend/restore, пишет status+access_status) и `setProfileAutoPauseExempt` («Льгота», FEAT-015). **Нет UI для установки paid_until / просмотра subscription_status / prodamus_***.

**Кандидаты под «Моя подписка / Продлить»:**
1. ⭐ **`views/ProfileView.jsx`** — карточный «Профиль/Настройки». Новая `Card` «Моя подписка» встаёт органично (там уже есть блок Telegram-уведомлений `:642`, к которому привяжем напоминания). Плюс баннер-плитка на `StatsDashboardView`.
2. Отдельный `view === 'subscription'` + SidebarItem в `views/UserApp.jsx` — если хотим выделенную вкладку.

**Связка:** ARCH-011 (BACKLOG.md:698) — «спроектировать подписочную модель» — это ровно данная задача; открытые продуктовые вопросы там уже зафиксированы (модель/тарифы/провайдер/что при просрочке).

---

# ПРЕДЛОЖЕНИЕ ДИЗАЙНА — Фаза 1

> Принцип: **карты не трогаем**, только hosted-checkout провайдера. Идентификация — **детерминированная по user_id/order_id**, а не по email. Переиспользуем `billing_webhook_logs` (идемпотентность + подпись) и `subscriptions` (история).

## 🔑 Ключевой стратегический вопрос (нужно решение до кода)
**Сосуществование двух моделей.** Сейчас живёт **recurring Prodamus** (19 активных подписок, auto_payment ежедневно) + BotHunter для ведущих. Новая модель — **разовая покупка плана 1/3/6 мес, без автопродления**. Варианты:
- **(A) Полный переход:** новые платежи — только через платформо-инициированные планы. Старые recurring-подписки Prodamus либо отменяем на стороне Prodamus, либо оставляем дожить. `auto_payment`-вебхуки продолжат приходить — их надо продолжать обрабатывать (продлевать), но новых recurring не создаём.
- **(B) Сосуществование:** recurring для действующих 19, планы для новых. Сложнее в UI/логике.
- **Рекомендация codeexec: (A)** — чище, соответствует «НЕ автопродление». Но требует, чтобы Ольга в Prodamus-кабинете перевела/отменила recurring. **Решает стратег+Ольга.**

## Модель планов (1/3/6 мес)
Новая таблица `billing_plans` (или config-константа + seed):
`code` (`m1`/`m3`/`m6`), `title`, `months` (1/3/6), `price_rub` (цены даст Ольга), `provider_price_map` (на случай разных сумм у провайдеров), `is_active`, `sort`.
Держать источником правды **DB-таблицу** (чтобы Ольга меняла цены без деплоя) с чтением через PostgREST.

## Слой заказов (детерминированная идентификация) — НОВОЕ
Таблица `payment_orders`:
`id uuid pk` (= order_id, кладётся в заказ провайдера), `user_id uuid` (FK profiles — **источник истины о плательщике**), `plan_code`, `months`, `provider` (`yookassa`/`prodamus`), `amount`, `currency`, `status` (`pending`/`paid`/`failed`/`expired`), `provider_payment_id`, `created_at`, `paid_at`, `expires_at`, `raw_confirmation_url`.
→ Вебхук находит юзера по `order_id`→`payment_orders.user_id`. **Никакого email-матча.**

## Инициация checkout (серверная, на push-server)
Новый эндпоинт `POST /api/billing/checkout` (auth: JWT пользователя, чтобы user_id брать из токена, не из тела — anti-tamper):
Body `{ plan_code, provider }` (provider выбирает юзер: «российская карта» → `yookassa`, «зарубежная» → `prodamus`).
Логика:
1. Валидируем план (из `billing_plans`), берём цену.
2. Создаём `payment_orders` (status=pending, генерим order_id=uuid).
3. **YooKassa:** POST `/v3/payments` c `metadata:{user_id, order_id, plan_code, months}`, `Idempotence-Key=order_id` → сохраняем `provider_payment_id`, возвращаем `confirmation_url`.
4. **Prodamus:** строим payform-URL: `https://<shop>.payform.ru/?order_id=<order_id>&customer_phone=…&products[0][name]=…&products[0][price]=<amount>&products[0][quantity]=1&_param_user_id=<user_id>&_param_plan=<plan_code>&urlReturn=…&urlSuccess=…` → возвращаем URL. (Ключ не нужен; домен payform — от Ольги.)
5. Клиент редиректит на возвращённый URL.

## Вебхук-хендлеры (идентификация по user_id/order_id, идемпотентность, подпись)
- **Prodamus** (`/webhooks/prodamus`, расширить существующий): если в payload есть `order_id`/`_param_user_id` → это платёж по плану. Находим `payment_orders` по order_id, берём `user_id` и `months` из заказа (**не из payload и не по email**). Подпись — существующий `verifyProdamusSignature`. Идемпотентность — `billing_webhook_logs` (external_id = `order_id` или payment_id) + status заказа. Обратная совместимость: если order_id нет — старый recurring-путь (fuzzy).
- **YooKassa** (`/webhooks/yookassa`, новый): событие `payment.succeeded`, `metadata.order_id`/`user_id`. Верификация: IP-allowlist YooKassa + **обратный `GET /v3/payments/{id}`** (подписи нет). Идемпотентность — `billing_webhook_logs` (provider='yookassa', external_id=payment_id).
- **Общий apply (новый `applyPlanPayment`, отдельно от recurring `applyAccessState`):**
  - `paid_until = max(now, coalesce(profiles.paid_until, now)) + interval 'N months'` — **продление стопкой** (важно: не фикс +31д, а месяцы плана; renewal докидывает поверх остатка).
  - `access_status='active'`, `subscription_status='active'`, `last_payment_at=now`.
  - `payment_orders.status='paid'`, `paid_at=now`.
  - Запись в `subscriptions` (история платежа, provider, months).
  - Всё в одной транзакции + advisory-lock по order_id.

## Механизм напоминаний (без автосписания)
Ночной проход (расширить `runNightlyExpiryReconcile` или отдельный `runRenewalReminders`):
- Найти профили с платящей ролью, `access_status='active'`, `paid_until` в окнах **T-7 / T-3 / T-1 / T0(истёк)**.
- Слать напоминание через **garden-auth TG-очередь** (основной) + **email** (fallback): «Подписка заканчивается DD.MM, продлите — [ссылка на /subscription]».
- Дедуп: таблица `billing_reminders_sent (user_id, paid_until, window)` unique, чтобы не слать повтор.
- Истёкшие (`paid_until < now`) — существующий reconcile уже переводит в `paused_expired` (реюз).
- ⚠️ Нужно уточнить контракт `tg_notifications_queue` в garden-auth (как класть задачу — INSERT в таблицу очереди / HTTP-эндпоинт).

## Фронт
- **Новая `Card` «Моя подписка»** в `views/ProfileView.jsx`: статус (активна до DD.MM / истекла), кнопка «Продлить» → экран выбора плана.
- **Экран выбора плана + типа карты:** планы 1/3/6 (цены из `billing_plans`), радио «Российская карта (YooKassa) / Зарубежная (Prodamus)» → `POST /api/billing/checkout` → редирект.
- **Баннер** на `StatsDashboardView` при `paid_until` близко/истёк.
- Переиспользуем `SubscriptionExpiredScreen` для hard-block, но `renewUrl` → внутренний `/subscription`, а не внешний бот.
- **⚠️ Включение `_assertActive` (hard-block) — осторожно:** сейчас 53 active-юзера, резкий hard-block рискован. Рекомендация: Фаза 1 — **soft** (баннер + карточка, доступ не режем), hard-block (`_assertActive` бросает SUBSCRIPTION_EXPIRED) — отдельной фазой после обкатки напоминаний и наполнения paid_until.

## Env-добавления (прод push-server)
`YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`, `YOOKASSA_RETURN_URL`, `PRODAMUS_PAYFORM_URL` (домен магазина), опц. `YOOKASSA_ALLOWED_IPS`. `AUTH_SERVICE_SECRET` — проверить/задать (для logout-all). Возможно `PRODAMUS_API_KEY` НЕ нужен (ссылку строим URL-ом).

## План песочницы
1. **YooKassa test-shop** (тестовый shopId/secret, тестовые карты YooKassa) → полный цикл: checkout → confirmation_url → оплата → `payment.succeeded` вебхук → `payment_orders.paid` → `paid_until` +N мес → карточка обновилась.
2. **Prodamus demo** (`&demo_mode=1` на payform / sandbox от Ольги) → тот же цикл, подпись валидна, идентификация по order_id.
3. **Идемпотентность:** повторный вебхук того же order_id → `duplicate`, `paid_until` не двигается второй раз.
4. **Продление стопкой:** оплата при активной подписке → `paid_until` = остаток + N мес (не перезатёрт).
5. **Напоминания:** искусственно выставить `paid_until` в T-3 → ночной проход кладёт задачу в очередь (dry-run без реальной отправки).
6. **Истечение:** `paid_until < now` → reconcile → `paused_expired` (+ soft-баннер на фронте).
7. **Anti-tamper:** checkout берёт user_id из JWT, не из тела; попытка подменить plan/amount — сверка с `billing_plans`.

---

## Открытые вопросы стратегу/Ольге
1. **Модель сосуществования (A/B выше)** — переходим полностью на планы или держим recurring для 19-ти?
2. **Цены планов 1/3/6** (руб.) — от Ольги. Разные ли суммы у YooKassa vs Prodamus?
3. **Prodamus payform-домен** (`<shop>.payform.ru`) и наличие sandbox/demo.
4. **YooKassa:** есть ли уже магазин/тестовый shopId, или регистрировать?
5. **Контракт `tg_notifications_queue`** в garden-auth (как ставить задачу).
6. **Hard-block:** Фаза 1 soft или сразу режем доступ по истечении?
7. **`AUTH_SERVICE_SECRET`** на push-server — задать, чтобы logout-all реально работал?

**НЕ строю до 🟢 стратега на дизайн.**
