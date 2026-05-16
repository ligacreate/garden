---
title: FEAT-024 — recon TG-инфраструктуры + дизайн notifier + draft phase32 + ответы на 6 вопросов
date: 2026-05-16
from: VS Code Claude Code (codeexec)
to: стратег (claude.ai)
reply_to: 2026-05-16_35_strategist_feat024_tg_notifications.md
type: recon + design + DRAFT-only (no code, no apply, no migration files created)
status: 🟡 awaiting strategist review + waiting for FEAT-023 phase31 v2 close before any apply
queue_lock: НЕ создавал `migrations/phase32_tg_notifications.sql`. НЕ трогал прод. НЕ правил garden-auth локально. Draft sql живёт inline в §6 этого файла.
---

# FEAT-024 — Recon + дизайн TG-уведомлений ПВЛ

## 0. TL;DR — что нашёл, что предлагаю

1. **Существующий TG-канал работает только в одну сторону** — `@garden_grants_monitor_bot` шлёт алерты в фиксированный `TELEGRAM_CHAT_ID`. Боту никто не пишет, polling/webhook отсутствуют, юзер-привязки нет. Для FEAT-024 это даёт нам только **рабочий sender-паттерн** (curl/https с pinned IP), но flow «бот ↔ пользователь» придётся строить с нуля.
2. **TG-blackbox 2026-05-06→10 закрыт двумя слоями** ([INCIDENT_2026-05-10_tg_blackbox.md](../journal/INCIDENT_2026-05-10_tg_blackbox.md)):
   - `/etc/hosts` pin `149.154.167.220 api.telegram.org` — для bash/curl;
   - `httpsPostJson(...)` поверх `https.request({ family: 4 })` — для Node fetch (обход undici happy-eyeballs).
   - Оба фикса **обязательны и для нового бота**, иначе IPv6/DNS уведёт в timeout.
3. **Локальный `/Users/user/vibecoding/garden-auth/server.js` ОТСТАЁТ от прода** — 216 строк, нет ни одного TG-фрагмента, нет `httpsPostJson`, нет `/api/client-error`. TECH-DEBT-AUTH-REPO-SYNC из мая ещё не закрыт. Для Phase 2 **обязателен `scp` свежего прод-`server.js` → локально → правки → `scp` назад** (как в правиле Ольги). НЕ редактирую локальный файл сейчас.
4. **Frontend ходит в БД напрямую через PostgREST** (см. `services/pvlPostgrestApi.js:468-505`). Hooks в Node-слое **не сработают** — подтверждаю выбор стратега: **Вариант A (DB-триггеры + queue)**.
5. **Имена таблиц в ТЗ страт-чата отличаются от реальных** — реально это `pvl_student_homework_submissions` (не `pvl_homework_submissions`). Дополнения студентки **не определяются** по «`OLD.content != NEW.content`» — нет такой колонки; источник истины — `pvl_homework_status_history` (там `from_status/to_status/changed_by`). Поэтому в draft миграции — **триггер на `pvl_homework_status_history`** (одна точка истины для обоих направлений).
6. **`profiles.telegram TEXT` уже занят** — это **@username/телефон для матчинга и для phone-resolve в push-webhook'е** (см. `push-server/server.mjs:225`). Не используем его. Новая колонка `telegram_user_id BIGINT` — чистая, не конфликтует.
7. **Linking flow** — рекомендую вариант стратега (одноразовый код в профиле + `?start=CODE` deep-link), но в формате `LINK-XXXXXX` 6 заглавных букв/цифр, TTL 15 минут, `consumed_by_tg_user_id` для аудита. Email в DM с ботом **не вводим** — это утечка PII и атака «привяжу чужой email».
8. **Worker** — `setInterval` внутри `garden-auth` сразу после `app.listen` (легче cron'а; не нужен systemd-timer). Каждые 15 с, lock через `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 50`. Бэкофф exponential: 1м → 5м → 30м → dead-letter после 5 попыток.
9. **Тихие часы** — поле `scheduled_for` в queue, триггер ставит `LEAST(NOW(), today 08:00 MSK)` если NOW() ∈ [23:00, 08:00 MSK). Worker фильтрует `scheduled_for <= NOW()`.
10. **Skip self-events** — фильтрация в WHERE триггера: не нотифаем когда `changed_by = recipient_profile_id` (ментор тестит свои сообщения / студентка сама перевела статус).

---

## 1. Recon — где сейчас живёт TG

### 1.1 `@garden_grants_monitor_bot` — приёмник, не отправитель

| Атрибут | Значение |
|---|---|
| Где запускается | cron `*/5 * * * * root /opt/garden-monitor/check_grants.sh` на msk-1-vm-423o (5.129.251.56) |
| Куда шлёт | `chat_id=${TELEGRAM_CHAT_ID}` — один фиксированный чат Ольги, не юзеры |
| Транспорт | `curl -fsS -m 10 -X POST https://api.telegram.org/bot${TOKEN}/sendMessage --data-urlencode ...` |
| Библиотека | НЕТ — голый `curl` из bash. Параметры в `--data-urlencode` (Markdown). Никаких `node-telegram-bot-api`/`grammy`. |
| Где токен | `/opt/garden-auth/.env`: `TELEGRAM_BOT_TOKEN=...`, `TELEGRAM_CHAT_ID=...` (env-shared между garden-auth и check_grants.sh через `set -a; . $ENV_FILE; set +a`) |
| Webhook/polling | НЕТ — бот вообще не принимает, только шлёт исходящие. |
| Юзер-привязок | НЕТ — все алерты в один админ-чат. |

См. [`scripts/check_grants.sh:45-58`](../../scripts/check_grants.sh#L45-L58) — функция `notify_tg()`. Это весь существующий sender-паттерн для админ-алертов.

### 1.2 Прод-`garden-auth/server.js` (MON-001, 2026-05-10) — клиент-ошибки в тот же чат

| Атрибут | Значение |
|---|---|
| Хост-кода | `/opt/garden-auth/server.js` на 5.129.251.56 (НЕ в этом репо, см. §1.3) |
| Endpoint | `POST /api/client-error` (фронт шлёт `window.onerror` сюда) |
| Sender | `httpsPostJson(url, body, timeoutMs)` — собственный helper поверх `https.request({ family: 4 })`. Полный код см. [INCIDENT_2026-05-10_tg_blackbox.md:104-122](../journal/INCIDENT_2026-05-10_tg_blackbox.md#L104-L122) |
| Зачем `family: 4` | undici happy-eyeballs параллельно пробует IPv6 → ENETUNREACH → весь fetch валится. `https.request({ family: 4 })` форсит IPv4 и обходит проблему. |
| Куда шлёт | Тот же `TELEGRAM_CHAT_ID` через тот же `TELEGRAM_BOT_TOKEN` — общий канал админ-алертов. |
| Webhook от TG? | НЕТ — `garden-auth` сейчас не принимает update'ы от TG. |

**Вывод для FEAT-024:** sender-функцию `httpsPostJson` уже изобрели — переиспользуем 1-в-1, но с **новым токеном** `TG_NOTIFICATIONS_BOT_TOKEN`. IP-фикс `/etc/hosts` уже активен на сервере, нам ничего не надо добавлять для outbound.

### 1.3 Локальная копия `garden-auth/` — устарела

| Файл | Где | Состояние |
|---|---|---|
| `/Users/user/vibecoding/garden-auth/server.js` | локально | **216 строк, БЕЗ TG-кода, БЕЗ `httpsPostJson`, БЕЗ `/api/client-error`** |
| `/opt/garden-auth/server.js` | прод (5.129.251.56) | актуальный, с TG-фиксом от 2026-05-10 |
| `/Users/user/vibecoding/garden-auth/package.json` | локально | `express^4, pg^8, jsonwebtoken^9, nodemailer^6, bcryptjs^2, cors, uuid, dotenv` — **ни `node-telegram-bot-api`, ни `grammy` НЕ нужны** (мы и так на raw `https`) |

**Жёсткий блок для Phase 2:** перед любой правкой `server.js` обязателен сценарий «scp from prod → edit → scp to prod → restart» (см. [project_push_server.md] в auto-memory и правило Ольги). Иначе откатим TG-blackbox-фикс. **Заведу это явным шагом в Phase 2 ниже.**

### 1.4 Сетевая блокировка TG из РФ — статус 2026-05-16

- **Только один IP работает с msk-1-vm-423o** — `149.154.167.220` (был один на 2026-05-10). Остальные подсети 149.154.16*/91.108.*/IPv6 — timeout/ENETUNREACH.
- **`/etc/hosts` pin** — стоит (`149.154.167.220 api.telegram.org # INFRA fix 2026-05-10`), `curl` и Node fetch работают. Это **inherited** для FEAT-024 — ничего делать не надо.
- **INFRA-007-TG-IP-MONITORING (P3)** в backlog — cron-валидация IP + ротация из пула. Пока не реализован; для FEAT-024 не блокер (одного IP хватает), но добавляет «single-point-of-failure»: если 149.154.167.220 сам отвалится, и линкинг (webhook handler getUpdates ответ), и уведомления остановятся одновременно.

### 1.5 Push-сервер vs garden-auth — где живут нотификации

| Кандидат | За | Против | Вердикт |
|---|---|---|---|
| `push-server/` (Node, порт 8787) | уже есть web-push инфра, отдельный процесс, можно нагрузить очередью | другая БД-пул (или общая? — см. `push-server/server.mjs`), нет общего env с garden-auth, нет nodemailer/SMTP — но он нам не нужен | ❌ — добавит switch-боли |
| `garden-auth/` (Node, порт 3001) | уже **умеет**: `pg.Pool`, `httpsPostJson`, `TELEGRAM_BOT_TOKEN` в env, nodemailer для email-аналогов | ещё один endpoint на тот же процесс, нужно следить за blocking | ✅ — **выбираем его**, в логике стратега |
| Новый микросервис `garden-notify/` | чистый scope | новый systemd-unit, новая зона деплоя, ещё одно место для secrets | ❌ — overkill для MVP |

**Выбор:** `garden-auth` — webhook handler + worker внутри того же процесса, отдельный TG-токен `TG_NOTIFICATIONS_BOT_TOKEN` (не пересекается с `TELEGRAM_BOT_TOKEN`).

---

## 2. Реальная схема PVL-таблиц (что чинить в ТЗ страт-чата)

Стратег в [_35.md:81,99-103](2026-05-16_35_strategist_feat024_tg_notifications.md#L81) ссылается на `pvl_homework_submissions` и `WHEN OLD.content != NEW.content`. **Этого в БД нет.** Реально:

| Стратег написал | Реально в БД (`database/pvl/migrations/001_pvl_scoring_system.sql`) |
|---|---|
| `pvl_homework_submissions` | `pvl_student_homework_submissions` |
| `OLD.content != NEW.content` | колонки `content` нет; есть `payload jsonb`, `status`, `revision_cycles`, `accepted_at`, `submitted_at`, `score`, `mentor_bonus_score` |
| `pvl_homework_status_history(... status ...)` | реально: `pvl_homework_status_history(id, submission_id, from_status, to_status, comment, changed_by, changed_at, payload jsonb)` — **колонка `to_status`, не `status`**. |

### 2.1 Жизненный цикл submission

CHECK: `status IN ('draft', 'submitted', 'in_review', 'revision', 'accepted', 'rejected', 'overdue')`.

Все переходы (по соглашению, см. `pvlPostgrestApi.js:494-505` — `appendHomeworkStatusHistory`) **пишутся в `pvl_homework_status_history`** одной отдельной INSERT'ой. Это значит:

> **Один триггер на `pvl_homework_status_history.AFTER INSERT` ловит ВСЕ интересные нам переходы.**
> Триггер на `pvl_student_homework_submissions` нам не нужен — он бы дублировал и не отловил «дополнила» чётко.

### 2.2 Маппинг «событие → нотификация»

| `to_status` | Кто получает | Текст |
|---|---|---|
| `submitted` (`from_status` IS NULL или `draft`) | mentor | «Студентка X сдала ДЗ по уроку Y» |
| `submitted` (`from_status` = `revision`) | mentor | «Студентка X дополнила ДЗ по уроку Y» |
| `accepted` | student | «Ментор принял ваше ДЗ по уроку Y» |
| `revision` | student | «Ментор просит доработать ДЗ по уроку Y. Комментарий: <comment>» |
| `in_review`, `rejected`, `overdue` | — | в MVP не шлём (in_review — internal; rejected/overdue — обсудить отдельно) |

Плюс **`pvl_direct_messages.AFTER INSERT`** для комментариев: если `author_user_id` = `mentor_id` → notify student. Это покрывает 5-й сценарий Ольги («ментор оставил комментарий»).

### 2.3 Резолюция «кто получает» — самая тонкая часть

`pvl_student_homework_submissions.student_id` → это `pvl_students.id`, **который технически совпадает с `profiles.id`** (см. `phase27 line 173-174` — `DELETE FROM public.pvl_students WHERE id = p_user_id`, где `p_user_id` это profile id из RPC `admin_delete_user`). То есть **`pvl_students.id = profiles.id`** — это известное соглашение проекта (1:1, не FK).

Mentor резолвится через `pvl_garden_mentor_links`:
```sql
SELECT mentor_id FROM public.pvl_garden_mentor_links WHERE student_id = <pvl_students.id>
```
**Но** `mentor_id` там — legacy duality (см. `phase25:28`): может быть `pvl_mentors.id` ИЛИ `profiles.id`. В phase25 они делают `LEFT JOIN profiles p_mentor ON p_mentor.id = ml.resolved_mentor_id` — резолвят best-effort.

**Решение для триггера:** функция `tg_resolve_mentor_profile(p_student_id uuid)` возвращает `profiles.id` ментора или NULL:
```sql
CREATE OR REPLACE FUNCTION public.tg_resolve_mentor_profile(p_student_id uuid)
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT p.id
    FROM public.pvl_garden_mentor_links ml
    LEFT JOIN public.profiles p ON p.id = ml.mentor_id
   WHERE ml.student_id = p_student_id
   LIMIT 1;
$$;
```
Если NULL — триггер кладёт в queue с `recipient_profile_id = NULL` и `dead_letter_at = now()` + `last_error='mentor_unresolved'` (видимо в worker'е/логе, не теряем событие).

---

## 3. Дизайн нового бота `@garden_notifications_bot`

### 3.1 Linking flow — рекомендую «код в профиле»

| Шаг | Где | Что происходит |
|---|---|---|
| 1 | Платформа (UI профиля) | Юзер жмёт «Привязать Telegram» → fetch `POST /api/profile/generate-tg-link-code` (под JWT) → бэк генерит `LINK-A3F7K9` (6 chars [A-Z0-9 без 0OI1L]), сохраняет в `tg_link_codes`, TTL 15 мин. Возвращает `{ code, deep_link: "https://t.me/garden_notifications_bot?start=LINK-A3F7K9" }`. |
| 2 | UI | Показывает кнопку «Открыть бота» (deep-link) + код для ручного ввода (на случай если deep-link не сработает в TG-app). |
| 3 | TG-бот | Webhook ловит `/start LINK-A3F7K9` (TG деливерит payload в `message.text` как `/start LINK-A3F7K9`). |
| 4 | Webhook handler в garden-auth | `SELECT profile_id FROM tg_link_codes WHERE code=$1 AND consumed_at IS NULL AND expires_at > now() FOR UPDATE` → если найден: `UPDATE profiles SET telegram_user_id=$tg_uid, telegram_linked_at=now() WHERE id=$profile_id` + `UPDATE tg_link_codes SET consumed_at=now(), consumed_by_tg_user_id=$tg_uid`. Отвечает «Привязал, теперь буду писать про ДЗ». |
| 5 | Если кода нет/просрочен | Бот: «Код не найден или истёк. Сгенерируйте новый в профиле Сада». |

**Почему НЕ `/link <email>`:**
1. PII в DM с ботом (юзер пишет свой email в чат, который видит TG).
2. Возможна атака: «я знаю чужой email → пишу `/link victim@example.com` → перехватываю их уведомления». Защиты от этого через email нет — никакого подтверждения.
3. UX хуже: пользователь должен помнить точный email под которым он на платформе.

**Защита от «один TG привязан к двум профилям»:** UNIQUE partial index на `profiles.telegram_user_id WHERE telegram_user_id IS NOT NULL`. Если юзер делает второй `/link` с того же TG — отвязать первый и привязать новый (нужно подтвердить с Ольгой — это open question #6 ниже).

### 3.2 Webhook vs polling

**Webhook** (рекомендую):
- `POST /api/tg-bot/webhook/<SECRET_PATH>` на garden-auth. SECRET_PATH — рандомный путь типа `wh_a3k9f7m...` в env `TG_NOTIFICATIONS_WEBHOOK_PATH`, защищает от непрошеных POST'ов (TG-документация рекомендует именно так).
- Регистрация webhook'а у TG: `curl -X POST "https://api.telegram.org/bot$TOKEN/setWebhook?url=https://auth.skrebeyko.ru/api/tg-bot/webhook/$SECRET_PATH"` (делается одной командой при первом деплое).
- Проверка `X-Telegram-Bot-Api-Secret-Token` header (TG умеет посылать secret в header при `setWebhook ... -d secret_token=...`) — дополнительный belt-and-suspenders.

**Polling** — отвергаем: бот висит как процесс, потребляет HTTPS-quota TG, лишний CPU.

### 3.3 Хранение токена

`/opt/garden-auth/.env`:
```
TG_NOTIFICATIONS_BOT_TOKEN=<from BotFather>
TG_NOTIFICATIONS_BOT_USERNAME=garden_notifications_bot
TG_NOTIFICATIONS_WEBHOOK_PATH=wh_<random32hex>
TG_NOTIFICATIONS_WEBHOOK_SECRET=<random32hex>  # для X-Telegram-Bot-Api-Secret-Token
```
**НЕ хранить** в git, **НЕ путать** с существующим `TELEGRAM_BOT_TOKEN` (тот остаётся за `@garden_grants_monitor_bot`).

### 3.4 Notifier API (внутри garden-auth/server.js)

```js
// Псевдокод — точная форма в Phase 2.
async function sendTgNotification(tgUserId, text, options = {}) {
  const url = `https://api.telegram.org/bot${process.env.TG_NOTIFICATIONS_BOT_TOKEN}/sendMessage`;
  const body = { chat_id: tgUserId, text, parse_mode: 'HTML', disable_web_page_preview: true };
  const r = await httpsPostJson(url, body, 8000);  // тот же helper из MON-001
  if (r.status === 403) return { ok: false, terminal: true, code: 'blocked_by_user' };
  if (r.status === 400) return { ok: false, terminal: true, code: 'bad_request', detail: r.text };
  if (!r.ok)            return { ok: false, terminal: false, code: `http_${r.status}` };
  return { ok: true };
}
```

- 403 (Forbidden: bot was blocked by the user) → `UPDATE profiles SET telegram_notifications_enabled=false WHERE telegram_user_id=$1`. Terminal — больше не пробуем.
- 400 (Bad Request: chat not found / user deactivated) → terminal, без disable (логически: tg_user_id невалидный).
- 5xx / timeout / network → retry с бэкоффом.

### 3.5 Worker — внутри garden-auth, без cron

```js
// Псевдокод — точная форма в Phase 3.
const TG_QUEUE_INTERVAL_MS = 15_000;
setInterval(async () => {
  try {
    await processTgQueueBatch();   // SELECT ... FOR UPDATE SKIP LOCKED LIMIT 50, send, UPDATE
  } catch (e) {
    console.error('[tg-queue] batch error', e);
  }
}, TG_QUEUE_INTERVAL_MS);
```

Преимущество перед cron:
- один процесс, общий `pool`, общий env;
- `FOR UPDATE SKIP LOCKED` защищает от двойной отправки даже если случайно запустим два инстанса;
- легко вырубить (Ольга `systemctl restart garden-auth` — и worker остановился).

**Бэкофф:** `next_attempt_at = now() + interval '1 minute' * power(2, attempt_count)` (1м → 2м → 4м → 8м → 16м), `dead_letter_at = now()` после 5 неудач.

**Тихие часы 23:00-08:00 MSK** (timezone `Europe/Moscow`):
- Триггер при INSERT в `tg_notifications_queue` ставит `scheduled_for = now()` всегда, КРОМЕ интервала 23:00-08:00 MSK → ставит `scheduled_for = today_08:00_MSK` (если now ∈ 23-24) или `today 08:00_MSK` (если now ∈ 00-08).
- Worker фильтрует `WHERE scheduled_for <= now()` — натурально откладывает доставку.

---

## 4. Ответы на 6 открытых вопросов стратега

> Это мои **рекомендации**. Ольга в финале принимает решение.

### Q1. Имя бота — `@garden_notifications_bot`?

**Рекомендую:** `@garden_notifications_bot`. Симметрично с `@garden_grants_monitor_bot`, ясно отделяет роль («уведомления» vs «мониторинг»), не требует пояснений менторам. Альтернативы — `@garden_pvl_bot` (узко, не масштабируется на не-ПВЛ нотификации в будущем), `@skrebeyko_garden_bot` (личный бренд, путает читателя). Финал — за Ольгой при `/newbot`.

### Q2. Linking flow — код в профиле или `/link <email>`?

**Рекомендую: одноразовый код через профиль** (см. §3.1). Формат `LINK-A3F7K9` (6 знаков из A-Z0-9 без 0OI1L), TTL 15 мин, deep-link `?start=LINK-A3F7K9`. Защищает от перехвата чужого email + UX лучше (deep-link одной кнопкой).

### Q3. Tone of voice уведомлений

**Рекомендую:** короткое, нейтральное, с эмодзи в начале (TG-нативный стиль), HTML-формат для жирного:

| Event | Текст |
|---|---|
| Студентка сдала | `📥 <b>Анна Иванова</b> сдала ДЗ\n«Урок 3. Работа с метафорой»` |
| Студентка дополнила | `📥 <b>Анна Иванова</b> дополнила ДЗ\n«Урок 3. Работа с метафорой»` |
| Ментор принял | `✅ Ваше ДЗ принято\n«Урок 3. Работа с метафорой»\nБалл: 18/20` |
| Ментор просит доработать | `🔄 Ментор просит доработать ДЗ\n«Урок 3. Работа с метафорой»\n\n<i>{comment первые 200 символов}</i>` |
| Ментор написал в DM | `💬 Новое сообщение от ментора\n\n<i>{text первые 200 символов}</i>` |

Тон «Сада»: без восклицаний, без «Привет!», без обращения по имени получателя (имя действующего лица — да, это polite). Полные имена курса — да; «уроку Y» в страт-черновике — заменил на полное название урока через JOIN на `pvl_course_lessons.title` в триггере.

### Q4. Группировка vs отдельные сообщения

**Рекомендую: отдельные сообщения** (как у стратега). 5 сдач = 5 пушей. Аргументы:
- Каждая сдача — отдельный actionable item (зайти, проверить). Группировка скрывает action.
- TG сам схлопывает уведомления в индикатор «5 непрочитанных», UX-ущерба нет.
- Группировка усложняет логику queue (нужен «debounce window») и worker (нужен JOIN-формат). Делать в MVP — пере-инженерия.

**Защита от спама:** если за минуту от одной студентки прилетит >3 событий — это похоже на тестирование/сбой. Добавить **soft-rate-limit в worker'е**: если для recipient_profile_id за последнюю минуту уже отправлено ≥3 сообщений с одинаковым `event_type` — отложить (`scheduled_for = now() + interval '1 min'`). Опционально, можно отложить в Phase 4.

### Q5. Тихие часы

**Рекомендую: 23:00 — 08:00 MSK не слать**, копить в queue со `scheduled_for = today 08:00 MSK` (см. §3.5). Аргументы Ольги (что менторы сами замьютят) валидны для давних пользователей бота, но для новичков «бот разбудил в 02:00 первой же сдачей» = высокий шанс снести бота. Защитная политика на старте полезна.

**Исключение:** в MVP — никаких исключений. Все события одинаково попадают под quiet hours. Если позже появятся «срочные» (например, дедлайн через час) — добавим колонку `priority` и worker будет шлёт `high` без quiet hours.

### Q6. Пропуск собственных событий

**Рекомендую: фильтровать в `WHERE` триггера** (раньше чем в worker'е — экономим INSERT'ы в queue):

```sql
-- pseudocode для триггера на pvl_homework_status_history
WHERE NEW.changed_by <> v_recipient_profile_id  -- skip self
```

Edge cases:
- Ментор сам себе пишет в DM (тестирует): `pvl_direct_messages.author_user_id = mentor_id` И recipient = student_id; если ментор реально автор и студентка ≠ ментор → нормальный путь, нотифаем студентку. Self-skip срабатывает только если `author_user_id = recipient`, что в DM невозможно по схеме.
- Админ от лица ментора нажал accept: `changed_by` будет id админа, а recipient (студентка) не равен ему → нотифаем. **Это правильно** — студентке всё равно кто внутри принял.
- Если ментор сам перевёл submission в `submitted` (теоретически через админку, чтобы протестить flow): `changed_by = mentor`, recipient = mentor → НЕ нотифаем себя. Корректно.

**Дополнительный фильтр:** `telegram_notifications_enabled = true AND telegram_user_id IS NOT NULL` — не загромождаем queue для непривязанных юзеров вообще (триггер просто не вставляет строку). Это решает «куда деваются нотификации до того как ментор привязал TG» — нигде не копятся, ему просто видны новые сдачи в UI как обычно.

---

## 5. Дизайн архитектуры — окончательный

### 5.1 Слои

```
[Frontend]                                                          [TG]
  │                                                                  ▲
  │ PostgREST PATCH/POST                                             │ HTTPS (149.154.167.220, IPv4-only)
  ▼                                                                  │
[PostgreSQL]                                                         │
  │ pvl_homework_status_history (INSERT)                             │
  │ pvl_direct_messages (INSERT)                                     │
  │                                                                  │
  │ trigger: enqueue_tg_notification_*                               │
  ▼                                                                  │
[tg_notifications_queue]   ◄─── worker (setInterval 15s) ────────────┤
                                  │ FOR UPDATE SKIP LOCKED LIMIT 50  │
                                  │ httpsPostJson(sendMessage, ...)  │
                                  │ UPDATE sent_at | last_error      │
                                  ▼                                  │
                            [garden-auth (Node)]  ──── webhook POST ─┘
                                  ▲
                                  │ /api/tg-bot/webhook/<SECRET>
                                  │ /api/profile/generate-tg-link-code (JWT)
                                  │ /api/profile/unlink-telegram (JWT)
                                  │
                            [Frontend UI: «Привязать Telegram»]
```

### 5.2 Новые сущности

| Слой | Что |
|---|---|
| БД | 3 колонки в `profiles`, 2 новые таблицы (`tg_link_codes`, `tg_notifications_queue`), 3 функции (`tg_resolve_mentor_profile`, `tg_enqueue_notification`, `tg_compute_scheduled_for`), 2 триггера на `pvl_homework_status_history` и `pvl_direct_messages` |
| garden-auth | 1 sender (`sendTgNotification` = reuse `httpsPostJson` + новый токен), 1 worker (`setInterval` poll), 3 endpoint'а (`POST /api/tg-bot/webhook/:secret`, `POST /api/profile/generate-tg-link-code`, `POST /api/profile/unlink-telegram`) |
| Frontend | 1 UI-блок в карточке профиля (кнопка «Привязать Telegram», статус «Привязано: @username / не привязано», кнопка «Отвязать»). |
| Деплой | `setWebhook` curl-команда один раз при первом раскладе, добавить env-переменные на проде |

### 5.3 Что НЕ меняем

- `@garden_grants_monitor_bot`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `notify_tg()` в check_grants.sh, `/api/client-error` в garden-auth — **не трогаем**. Это отдельный канал админ-алертов.
- `profiles.telegram TEXT` — не трогаем (используется в FEAT-002 матчинге и в `push-server/server.mjs:225`).
- `pvl_notifications` (in-app нотификации) — не трогаем; FEAT-024 шлёт **через другой канал** в TG, in-app живёт параллельно.

---

## 6. DRAFT миграции `phase32_tg_notifications.sql`

> **⚠️ ЭТО DRAFT. Файл НЕ создан в `migrations/`. Apply НЕ запускался. Жду 🟢 от стратега + сигнала «phase31 v2 закрыт» от другого чата.**

> Когда дойдёт до apply — создам `migrations/2026-05-XX_phase32_tg_notifications.sql` ровно из этого блока + добавлю шапку-чеклист как в phase31. Имя файла подгоню под фактическую дату apply.

```sql
-- ============================================================================
-- phase32 — TG-уведомления для менторов и студенток ПВЛ (FEAT-024)
-- ============================================================================
-- ЗАВИСИМОСТИ:
--   * phase31 v2 (pending_approval guards) — должна быть applied.
--   * Существующие таблицы: profiles, pvl_student_homework_submissions,
--     pvl_homework_status_history, pvl_direct_messages, pvl_garden_mentor_links,
--     pvl_course_lessons, pvl_homework_items.
--   * Расширение pgcrypto (для gen_random_uuid) — уже есть.
--
-- ЧТО ДОБАВЛЯЕТ:
--   §1 Колонки в profiles (telegram_user_id, telegram_linked_at,
--       telegram_notifications_enabled).
--   §2 Таблица tg_link_codes — одноразовые коды для linking flow.
--   §3 Таблица tg_notifications_queue — очередь отправки.
--   §4 Функция tg_resolve_mentor_profile(p_student_id) → profiles.id ментора.
--   §5 Функция tg_compute_scheduled_for() — quiet hours 23-08 MSK.
--   §6 Функция tg_enqueue_homework_event() — триггер-обработчик для history.
--   §7 Функция tg_enqueue_direct_message_event() — триггер-обработчик для DM.
--   §8 Триггеры на pvl_homework_status_history и pvl_direct_messages.
--   §9 GRANTS для authenticated/web_anon/postgrest_authenticator (через
--       ensure_garden_grants pattern из phase23).
--   §10 VERIFY V1..V12.
--
-- ЧТО НЕ ДЕЛАЕТ:
--   * Не отправляет ничего в TG (это worker в garden-auth — Phase 3).
--   * Не создаёт endpoint'ов (это Node — Phase 2).
--   * Не трогает существующие grants / policies на other tables.
-- ============================================================================

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- §0 PRE-CHECK: ничего не должно быть привязано к telegram_user_id ДО миграции
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_col_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='profiles'
           AND column_name='telegram_user_id'
    ) INTO v_col_exists;
    IF v_col_exists THEN
        RAISE NOTICE 'phase32 pre-check: profiles.telegram_user_id уже существует — продолжаем идемпотентно';
    ELSE
        RAISE NOTICE 'phase32 pre-check: чистая инсталляция telegram_user_id';
    END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- §1 КОЛОНКИ В profiles
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT,
    ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS telegram_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_telegram_user_id
    ON public.profiles(telegram_user_id)
    WHERE telegram_user_id IS NOT NULL;

COMMENT ON COLUMN public.profiles.telegram_user_id IS
    'TG chat_id (числовой). Заполняется при linking flow FEAT-024. NULL = не привязан. Не путать с profiles.telegram (@username, FEAT-002).';

-- ───────────────────────────────────────────────────────────────────────────
-- §2 ТАБЛИЦА tg_link_codes — одноразовые коды для привязки
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tg_link_codes (
    code TEXT PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes'),
    consumed_at TIMESTAMPTZ,
    consumed_by_tg_user_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tg_link_codes_profile
    ON public.tg_link_codes(profile_id, consumed_at);

CREATE INDEX IF NOT EXISTS idx_tg_link_codes_expires
    ON public.tg_link_codes(expires_at)
    WHERE consumed_at IS NULL;

COMMENT ON TABLE public.tg_link_codes IS
    'Одноразовые коды LINK-XXXXXX для привязки TG-аккаунта к profile. TTL 15 мин. Заполняется через /api/profile/generate-tg-link-code, погашается в /api/tg-bot/webhook.';

-- ───────────────────────────────────────────────────────────────────────────
-- §3 ТАБЛИЦА tg_notifications_queue
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tg_notifications_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_tg_user_id BIGINT,                    -- snapshot на момент enqueue
    event_type TEXT NOT NULL,
    event_source_table TEXT NOT NULL,               -- 'pvl_homework_status_history' | 'pvl_direct_messages'
    event_source_id UUID NOT NULL,                  -- id строки в исходной таблице
    event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    message_text TEXT NOT NULL,
    dedup_key TEXT,                                 -- например 'submission:UUID:to_status:accepted'
    scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ,
    attempt_count INT NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    last_error TEXT,
    dead_letter_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tg_notifications_queue_event_type_check
        CHECK (event_type IN (
            'hw_submitted_new',
            'hw_submitted_revision',
            'hw_accepted',
            'hw_revision_requested',
            'dm_from_mentor'
        ))
);

CREATE INDEX IF NOT EXISTS idx_tg_notifications_queue_pending
    ON public.tg_notifications_queue(scheduled_for)
    WHERE sent_at IS NULL AND dead_letter_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tg_notifications_queue_recipient
    ON public.tg_notifications_queue(recipient_profile_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tg_notifications_queue_dedup
    ON public.tg_notifications_queue(dedup_key)
    WHERE dedup_key IS NOT NULL AND sent_at IS NULL;

COMMENT ON TABLE public.tg_notifications_queue IS
    'Очередь TG-уведомлений FEAT-024. Заполняется триггерами, опустошается worker в garden-auth (setInterval 15с).';

-- ───────────────────────────────────────────────────────────────────────────
-- §4 ФУНКЦИЯ tg_resolve_mentor_profile
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_resolve_mentor_profile(p_student_id uuid)
RETURNS uuid LANGUAGE sql STABLE AS $$
    -- pvl_garden_mentor_links.mentor_id может быть pvl_mentors.id ИЛИ profiles.id (legacy).
    -- LEFT JOIN на profiles фильтрует только реальные profile id.
    SELECT p.id
      FROM public.pvl_garden_mentor_links ml
      LEFT JOIN public.profiles p ON p.id = ml.mentor_id
     WHERE ml.student_id = p_student_id
       AND p.id IS NOT NULL
     LIMIT 1;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- §5 ФУНКЦИЯ tg_compute_scheduled_for — quiet hours 23-08 MSK
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_compute_scheduled_for()
RETURNS timestamptz LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_now_msk timestamp;
    v_hour int;
    v_target_date date;
BEGIN
    v_now_msk := now() AT TIME ZONE 'Europe/Moscow';
    v_hour := EXTRACT(HOUR FROM v_now_msk)::int;
    IF v_hour >= 23 THEN
        -- сейчас 23:00-23:59 MSK → отложить до завтра 08:00 MSK
        v_target_date := (v_now_msk + interval '1 day')::date;
        RETURN (v_target_date::timestamp + time '08:00') AT TIME ZONE 'Europe/Moscow';
    ELSIF v_hour < 8 THEN
        -- сейчас 00:00-07:59 MSK → отложить до сегодня 08:00 MSK
        v_target_date := v_now_msk::date;
        RETURN (v_target_date::timestamp + time '08:00') AT TIME ZONE 'Europe/Moscow';
    ELSE
        -- 08:00-22:59 MSK → шлём сразу
        RETURN now();
    END IF;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- §6 ФУНКЦИЯ + ТРИГГЕР: pvl_homework_status_history → queue
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_enqueue_homework_event()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_student_id uuid;
    v_mentor_profile_id uuid;
    v_recipient_profile_id uuid;
    v_recipient_tg bigint;
    v_recipient_enabled boolean;
    v_event_type text;
    v_lesson_title text;
    v_homework_title text;
    v_student_name text;
    v_msg text;
    v_dedup text;
BEGIN
    -- 1. Определяем тип события и получателя
    IF NEW.to_status = 'submitted' THEN
        -- ментор получает
        SELECT student_id INTO v_student_id
          FROM public.pvl_student_homework_submissions
         WHERE id = NEW.submission_id;
        v_mentor_profile_id := public.tg_resolve_mentor_profile(v_student_id);
        v_recipient_profile_id := v_mentor_profile_id;
        IF NEW.from_status = 'revision' THEN
            v_event_type := 'hw_submitted_revision';
        ELSE
            v_event_type := 'hw_submitted_new';
        END IF;
    ELSIF NEW.to_status = 'accepted' THEN
        SELECT student_id INTO v_student_id
          FROM public.pvl_student_homework_submissions
         WHERE id = NEW.submission_id;
        v_recipient_profile_id := v_student_id;  -- pvl_students.id = profiles.id
        v_event_type := 'hw_accepted';
    ELSIF NEW.to_status = 'revision' THEN
        SELECT student_id INTO v_student_id
          FROM public.pvl_student_homework_submissions
         WHERE id = NEW.submission_id;
        v_recipient_profile_id := v_student_id;
        v_event_type := 'hw_revision_requested';
    ELSE
        RETURN NEW;  -- in_review/rejected/overdue в MVP не шлём
    END IF;

    -- 2. Self-event skip + receiver-not-resolved skip
    IF v_recipient_profile_id IS NULL THEN
        RETURN NEW;  -- ментор не назначен / резолв упал — тихо пропускаем
    END IF;
    IF NEW.changed_by = v_recipient_profile_id THEN
        RETURN NEW;  -- сам себе не нотифаем
    END IF;

    -- 3. Получатель привязал TG?
    SELECT telegram_user_id, telegram_notifications_enabled
      INTO v_recipient_tg, v_recipient_enabled
      FROM public.profiles
     WHERE id = v_recipient_profile_id;
    IF v_recipient_tg IS NULL OR v_recipient_enabled IS DISTINCT FROM TRUE THEN
        RETURN NEW;  -- не привязан / выключил
    END IF;

    -- 4. Собираем контекст для текста
    SELECT cl.title, hi.title
      INTO v_lesson_title, v_homework_title
      FROM public.pvl_student_homework_submissions s
      LEFT JOIN public.pvl_homework_items hi ON hi.id = s.homework_item_id
      LEFT JOIN public.pvl_course_lessons cl ON cl.id = hi.lesson_id
     WHERE s.id = NEW.submission_id;

    -- 5. Имя студентки — для сообщений ментору
    IF v_event_type IN ('hw_submitted_new', 'hw_submitted_revision') THEN
        SELECT COALESCE(p.name, p.email, 'студентка')
          INTO v_student_name
          FROM public.profiles p
         WHERE p.id = v_student_id;
    END IF;

    -- 6. Формируем текст (HTML mode TG)
    v_msg := CASE v_event_type
        WHEN 'hw_submitted_new' THEN
            E'📥 <b>' || COALESCE(v_student_name, 'Студентка') || E'</b> сдала ДЗ\n«' ||
            COALESCE(v_homework_title, v_lesson_title, 'без названия') || '»'
        WHEN 'hw_submitted_revision' THEN
            E'📥 <b>' || COALESCE(v_student_name, 'Студентка') || E'</b> дополнила ДЗ\n«' ||
            COALESCE(v_homework_title, v_lesson_title, 'без названия') || '»'
        WHEN 'hw_accepted' THEN
            E'✅ Ваше ДЗ принято\n«' || COALESCE(v_homework_title, v_lesson_title, 'без названия') || '»'
        WHEN 'hw_revision_requested' THEN
            E'🔄 Ментор просит доработать ДЗ\n«' || COALESCE(v_homework_title, v_lesson_title, 'без названия') || '»' ||
            CASE WHEN NEW.comment IS NOT NULL AND length(trim(NEW.comment)) > 0
                 THEN E'\n\n<i>' || substring(NEW.comment, 1, 200) || '</i>'
                 ELSE '' END
    END;

    v_dedup := 'history:' || NEW.id::text;  -- 1 история = 1 нотификация

    -- 7. Кладём в queue
    INSERT INTO public.tg_notifications_queue (
        recipient_profile_id, recipient_tg_user_id,
        event_type, event_source_table, event_source_id,
        event_payload, message_text, dedup_key, scheduled_for
    ) VALUES (
        v_recipient_profile_id, v_recipient_tg,
        v_event_type, 'pvl_homework_status_history', NEW.id,
        jsonb_build_object(
            'submission_id', NEW.submission_id,
            'from_status', NEW.from_status,
            'to_status', NEW.to_status,
            'changed_by', NEW.changed_by,
            'lesson_title', v_lesson_title,
            'homework_title', v_homework_title
        ),
        v_msg, v_dedup,
        public.tg_compute_scheduled_for()
    )
    ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL AND sent_at IS NULL DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tg_enqueue_homework_event ON public.pvl_homework_status_history;
CREATE TRIGGER trg_tg_enqueue_homework_event
    AFTER INSERT ON public.pvl_homework_status_history
    FOR EACH ROW EXECUTE FUNCTION public.tg_enqueue_homework_event();

-- ───────────────────────────────────────────────────────────────────────────
-- §7 ФУНКЦИЯ + ТРИГГЕР: pvl_direct_messages → queue (комментарий ментора)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_enqueue_direct_message_event()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_recipient_tg bigint;
    v_recipient_enabled boolean;
    v_msg text;
BEGIN
    -- Шлём только когда автор — ментор (mentor_id из строки), получатель — студентка
    IF NEW.author_user_id IS DISTINCT FROM NEW.mentor_id THEN
        RETURN NEW;  -- автор не ментор (например, студентка пишет ментору) — в MVP не нотифаем
    END IF;

    IF NEW.student_id = NEW.author_user_id THEN
        RETURN NEW;  -- self-message edge case
    END IF;

    SELECT telegram_user_id, telegram_notifications_enabled
      INTO v_recipient_tg, v_recipient_enabled
      FROM public.profiles
     WHERE id = NEW.student_id;
    IF v_recipient_tg IS NULL OR v_recipient_enabled IS DISTINCT FROM TRUE THEN
        RETURN NEW;
    END IF;

    v_msg := E'💬 Новое сообщение от ментора\n\n<i>' ||
             substring(COALESCE(NEW.text, ''), 1, 200) || '</i>';

    INSERT INTO public.tg_notifications_queue (
        recipient_profile_id, recipient_tg_user_id,
        event_type, event_source_table, event_source_id,
        event_payload, message_text, dedup_key, scheduled_for
    ) VALUES (
        NEW.student_id, v_recipient_tg,
        'dm_from_mentor', 'pvl_direct_messages', NEW.id,
        jsonb_build_object('mentor_id', NEW.mentor_id, 'student_id', NEW.student_id),
        v_msg,
        'dm:' || NEW.id::text,
        public.tg_compute_scheduled_for()
    )
    ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL AND sent_at IS NULL DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tg_enqueue_direct_message_event ON public.pvl_direct_messages;
CREATE TRIGGER trg_tg_enqueue_direct_message_event
    AFTER INSERT ON public.pvl_direct_messages
    FOR EACH ROW EXECUTE FUNCTION public.tg_enqueue_direct_message_event();

-- ───────────────────────────────────────────────────────────────────────────
-- §8 GRANTS — пускаем worker (через garden-auth → pg pool) и authenticated
-- ───────────────────────────────────────────────────────────────────────────
-- Worker подключается под gen_user (DB_USER из /opt/garden-auth/.env), у которого
-- права на public schema есть. Но через PostgREST authenticated тоже должен иметь
-- SELECT/UPDATE для отображения статуса «привязан/не привязан» и для unlink.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tg_link_codes        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tg_notifications_queue TO authenticated;

-- ensure_garden_grants pattern (см. phase23): если grant-wipe сработает, ensure
-- должен переусыновить эти таблицы. Это апдейт функции — НЕ забыть в Phase 1
-- регенерировать ensure_garden_grants(), либо включить эти 2 таблицы в её body.
-- ⚠ TODO для Phase 1 apply: проверить body public.ensure_garden_grants() и
-- добавить туда tg_link_codes + tg_notifications_queue, иначе нас зацепит wipe.

-- ───────────────────────────────────────────────────────────────────────────
-- §9 VERIFY (V1..V12 — после COMMIT)
-- ───────────────────────────────────────────────────────────────────────────
COMMIT;

-- V1 — колонки profiles
SELECT 'V1' AS check,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='telegram_user_id') AS telegram_user_id,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='telegram_linked_at') AS linked_at,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='telegram_notifications_enabled') AS enabled_flag;

-- V2 — UNIQUE index на telegram_user_id
SELECT 'V2' AS check, count(*) AS unique_indexes
  FROM pg_indexes WHERE schemaname='public' AND indexname='uq_profiles_telegram_user_id';

-- V3 — tg_link_codes структура
SELECT 'V3' AS check, count(*) AS columns
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='tg_link_codes';

-- V4 — tg_notifications_queue структура
SELECT 'V4' AS check, count(*) AS columns
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='tg_notifications_queue';

-- V5 — CHECK на event_type
SELECT 'V5' AS check, conname
  FROM pg_constraint WHERE conname='tg_notifications_queue_event_type_check';

-- V6 — функции созданы
SELECT 'V6' AS check, count(*) AS fn_count
  FROM pg_proc
 WHERE pronamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')
   AND proname IN ('tg_resolve_mentor_profile','tg_compute_scheduled_for','tg_enqueue_homework_event','tg_enqueue_direct_message_event');

-- V7 — триггеры на месте
SELECT 'V7' AS check, tgname, tgrelid::regclass AS tbl
  FROM pg_trigger
 WHERE tgname IN ('trg_tg_enqueue_homework_event','trg_tg_enqueue_direct_message_event');

-- V8 — quiet-hours sanity check (быстрый smoke без insert'ов)
SELECT 'V8' AS check, public.tg_compute_scheduled_for() AS scheduled_for_now;

-- V9 — pvl_garden_mentor_links доступен из функции
SELECT 'V9' AS check, public.tg_resolve_mentor_profile((SELECT id FROM public.pvl_garden_mentor_links LIMIT 1)) AS sample_mentor;

-- V10 — индексы queue
SELECT 'V10' AS check, indexname
  FROM pg_indexes
 WHERE schemaname='public' AND tablename='tg_notifications_queue'
 ORDER BY indexname;

-- V11 — никаких неожиданных активных строк в queue
SELECT 'V11' AS check, count(*) AS rows_in_queue FROM public.tg_notifications_queue;

-- V12 — никаких сюрпризов в profiles.telegram_user_id
SELECT 'V12' AS check, count(*) AS profiles_with_tg
  FROM public.profiles WHERE telegram_user_id IS NOT NULL;

-- ============================================================================
-- ROLLBACK (если что — отдельным заходом, НЕ в transactional)
-- ============================================================================
-- DROP TRIGGER IF EXISTS trg_tg_enqueue_homework_event ON public.pvl_homework_status_history;
-- DROP TRIGGER IF EXISTS trg_tg_enqueue_direct_message_event ON public.pvl_direct_messages;
-- DROP FUNCTION IF EXISTS public.tg_enqueue_homework_event();
-- DROP FUNCTION IF EXISTS public.tg_enqueue_direct_message_event();
-- DROP FUNCTION IF EXISTS public.tg_compute_scheduled_for();
-- DROP FUNCTION IF EXISTS public.tg_resolve_mentor_profile(uuid);
-- DROP TABLE IF EXISTS public.tg_notifications_queue;
-- DROP TABLE IF EXISTS public.tg_link_codes;
-- ALTER TABLE public.profiles
--     DROP COLUMN IF EXISTS telegram_notifications_enabled,
--     DROP COLUMN IF EXISTS telegram_linked_at,
--     DROP COLUMN IF EXISTS telegram_user_id;
```

### 6.1 Известные точки риска в draft'е (ловлю заранее)

| Риск | Митигация |
|---|---|
| `ensure_garden_grants()` не знает про новые 2 таблицы → следующий grant-wipe их зацепит | Перед apply: открыть body `ensure_garden_grants` на проде, добавить туда `tg_link_codes`, `tg_notifications_queue`. **Зафиксировано как TODO в §8**. |
| `tg_resolve_mentor_profile` возвращает NULL если ментор-это-pvl_mentors.id, а не profile.id | Тихо пропускаем (`v_recipient_profile_id IS NULL → RETURN NEW`). Альтернатива: в Phase 4 smoke проверить % таких случаев и решить — нужен ли fallback. |
| Триггер падает (`RAISE`) → ломает INSERT в history → ломает фронт | Все мои IF-ы возвращают `NEW`, ни одного `RAISE EXCEPTION`. Опционально — обернуть весь body в `BEGIN ... EXCEPTION WHEN OTHERS THEN RETURN NEW; END` для абсолютной безопасности (но это спрячет баги в триггере). **Решение:** не оборачивать; падение покажется в логе INSERT'а сразу, исправим. |
| `dedup_key` UNIQUE может конфликтнуть на повторе попытки worker'а после крэша | UNIQUE partial `WHERE sent_at IS NULL` — после успешной отправки строка остаётся (история), новая нотификация с тем же dedup_key не вставится в течение того же лайфтайма. Это правильное поведение (id строки в history уникальный — повторов событий быть не должно). |
| Длинный `NEW.comment` (>200 символов) обрезается без эллипсиса | Можно добавить `|| '…'` при `length(NEW.comment) > 200`. Косметика — поправлю если Ольга попросит. |
| `quiet_hours` в `Europe/Moscow` — если сервер в UTC и DST изменится | `AT TIME ZONE 'Europe/Moscow'` берёт текущее DST-правило из pg_timezone_names. Москва без DST с 2014, риск нулевой. |
| Откладка при quiet_hours делает «волну в 08:00» | OK для MVP. Если в Phase 5 окажется проблемой — добавим jitter (`+ random() * interval '15 minutes'`). |

---

## 7. План фаз (актуализирован после recon)

> Все оценки в «сессиях» — относительно вашей метрики. Не блокирует FEAT-023.

| Фаза | Что | Оценка | Где живёт |
|---|---|---|---|
| **Phase 0** — pre-work Ольги | `@BotFather → /newbot → @garden_notifications_bot`, токен в `~/.skrebeyko/credentials.env`. Можно делать параллельно. | 5 мин | Ольга |
| **Phase 1** — миграция БД | Создать `migrations/2026-05-XX_phase32_tg_notifications.sql` из §6. ensure_garden_grants обновить. scp на прод → `psql -v ON_ERROR_STOP=1 -f` → VERIFY V1..V12. | 0.3 | codeexec |
| **Phase 2** — бот webhook + linking flow | **scp `/opt/garden-auth/server.js` локально** (или работать прямо на проде через ssh). Добавить `httpsPostJson` (если ещё не там — он там), `sendTgNotification(uid, text)`, `setWebhook` команду, 3 endpoint'а (`/api/tg-bot/webhook/:secret`, `/api/profile/generate-tg-link-code`, `/api/profile/unlink-telegram`). scp обратно → `systemctl restart garden-auth`. | 1.0 | codeexec |
| **Phase 2b** — Frontend UI | Кнопка «Привязать Telegram» в карточке профиля (`views/ProfileView*` или подобный), статус «Привязан: <username> / Не привязан», кнопка «Отвязать». Fetch на 2 endpoint'а Phase 2. | 0.5 | codeexec |
| **Phase 3** — worker | `setInterval(processTgQueueBatch, 15000)` сразу после `app.listen`. Лог `[tg-queue]` префикс. Бэкофф/dead-letter в SQL UPDATE'ах. | 0.4 | codeexec |
| **Phase 4** — smoke + Ольгино тестирование | Ольга привязывает свой тестовый юзер, codeexec симулирует INSERT в `pvl_homework_status_history` через psql → проверяет queue → видит сообщение в TG. Тест 403 (Ольга блокирует бота). Тест quiet hours. | 0.5 | codeexec + Ольга |
| **Phase 5** — rollout | Пост в TG канал менторов: «Добавьте `@garden_notifications_bot`, привяжите через профиль». Опционально через неделю — пост для студенток. | 0.2 | Ольга |

**Итого:** ~3 сессии (на 0.5 больше чем у стратега — за счёт явного Phase 2b на фронт, который в страт-плане был неявный).

---

## 8. Что НЕ сделано (по правилам сессии)

- ❌ НЕ создал `migrations/phase32_tg_notifications.sql` — draft inline в §6.
- ❌ НЕ правил `/Users/user/vibecoding/garden-auth/server.js` — он устаревший, требует scp с прода.
- ❌ НЕ трогал прод-БД (`psql` не запускал).
- ❌ НЕ запускал `setWebhook` у TG (бота ещё нет).
- ❌ Не делал commit/push.

---

## 9. Что нужно от стратега

1. **🟢/🔴 по дизайну §3-§5** (бот через webhook в garden-auth, worker через setInterval, реальные имена таблиц, триггеры на `pvl_homework_status_history` + `pvl_direct_messages`).
2. **🟢/🔴 по 6 ответам в §4** (имя бота, linking, тон, группировка, тихие часы, self-skip).
3. **🟢/🔴 по draft миграции §6** — особенно по двум выборам:
   - резолюция ментора через `tg_resolve_mentor_profile` (тихо пропускаем при NULL — vs. писать в dead_letter с маркером);
   - quiet hours implemented в триггере (`scheduled_for`) vs. в worker'е (filter).
4. **Решение по «один TG → один профиль» edge case** (Q6 в моём списке, забыл в страт-листе):
   - Если юзер с привязанным TG делает второй `/link` с того же TG к другому профилю — отвязать первый? отказать? скрытый race-condition.
   - Моё предложение: **отказать с сообщением «Этот Telegram уже привязан к другому профилю Сада. Сначала отвяжите его там»**. Безопасно, без сюрпризов.
5. **Подтвердить очередь:** не начинать apply пока другой чат не дал сигнал «phase31 v2 закрыт + ensure_garden_grants v2 на проде».

Жду 🟢 — после него обновляю draft, создаю реальную миграцию, scp на прод, apply, VERIFY, отчёт.
