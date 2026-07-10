# RECON — Фаза 1f: напоминания об оплате (T-7/3/1/просрочка)

**Дата:** 2026-07-09 · **Автор:** codeexec · **Статус:** recon, изменений НЕТ. Дизайн — на обсуждение.

## ⚠️ ГЛАВНАЯ НАХОДКА (меняет приоритет каналов)
**TG привязан только у 4 из 18** в scope. **Email есть у 18 из 18.** Значит TG-only напоминания дойдут лишь до 4 человек — **email это основной канал охвата, а не «второй слой»**. Рекомендую email в v1 (иначе фича бесполезна для 14 из 18).

## Q1 — контракт `tg_notifications_queue`
**Схема (16 колонок):** `id uuid`, `recipient_profile_id`, `recipient_tg_user_id bigint`, `event_type` NN, `event_source_table` NN, `event_source_id uuid` NN, `event_payload jsonb` NN, `message_text` NN, `dedup_key`, `scheduled_for timestamptz` NN, `sent_at`, `attempt_count int` NN, `last_attempt_at`, `last_error`, `dead_letter_at`, `created_at`.
- **Нет колонки `status`** — состояние выводится: pending = `sent_at is null AND dead_letter_at is null AND scheduled_for<=now`; sent = `sent_at` set; failed = `dead_letter_at` set.
- **Кто кладёт:** в garden-auth **нет INSERT** в очередь → продюсеры пишут напрямую. **push-server может INSERT'ить** (та же БД — `to_regclass` нашёл таблицу через push-server `DATABASE_URL`). Обязательные NN при вставке: `event_type, event_source_table, event_source_id, event_payload, message_text, scheduled_for` (+`attempt_count=0`).
- **Воркер** `processTgQueueBatch` (garden-auth): `setInterval` 15с, батч 50, `FOR UPDATE SKIP LOCKED`. Шлёт `sendTgNotification(recipient_tg_user_id, message_text)`. Бэкофф 1→16 мин × 5 попыток → `dead_letter`. На 403 (юзер заблокировал бота) → `telegram_notifications_enabled=false`.
  - ⚠️ Шлёт по **`recipient_tg_user_id`** — без него TG не уйдёт (отсюда охват 4/18).
- **Индекс dedup:** `uq_tg_notifications_queue_dedup ON (dedup_key) WHERE dedup_key IS NOT NULL AND sent_at IS NULL` — **дедуп только среди НЕотправленных**. После `sent_at` ключ освобождается → повторная вставка того же dedup_key пройдёт. **Для полной идемпотентности недостаточно** (см. Q4).
- **Rate-limit/ретраи:** ретраи встроены (бэкофф×5→dead_letter). Явного per-user throttle нет; ограничение — батч 50/15с.

## Q2 — куда вешать ежедневный скан
- `runNightlyExpiryReconcile` (push-server): запуск **на старте + `setInterval` 24ч**. **НЕ фиксированное UTC** — привязано к времени последнего рестарта (сейчас ~20:30 MSK / ~17:30 UTC, сдвинется при следующем рестарте).
- **Можно прицепить** сканер напоминаний к нему. Тайминг «плавающий», но при идемпотентности (Q4) число/время прогонов не важно — каждый порог сработает один раз за цикл. Опционально — guard «раз в календарный день» или отдельный фикс-тайм крон (не обязательно).

## Q3 — email-канал
- **garden-auth** имеет `nodemailer` transporter + SMTP-креды (`SMTP_HOST/PORT/USER/PASS/FROM`) + `transporter.sendMail(...)` (стр. 86-90, 823). Рабочий.
- **push-server** — **нет** ни nodemailer, ни SMTP в `.env`.
- Варианты email для 1f:
  - **(A)** push-server добавляет `nodemailer` (dep) + `SMTP_*` в `.env` (скопировать из garden-auth) → шлёт письма прямо в скане. Self-contained.
  - **(B)** TG-only v1, email v2. Но охват 4/18 → фича почти пустая.
- **Рекомендация: (A) — email в v1** (охват), TG вторым слоем для 4 привязанных.

## Q4 — идемпотентность
Дедуп очереди **недостаточен** (partial unique только на неотправленных). Нужен **свой sent-log**:
`billing_reminders_sent(user_id uuid, threshold text, cycle_until date, channel text, sent_at timestamptz, unique(user_id, threshold, cycle_until))`.
INSERT-guard `ON CONFLICT DO NOTHING` ПЕРЕД отправкой → одно напоминание на (юзер, порог, цикл `paid_until`) навсегда, независимо от рестартов/числа прогонов.

## Q5 — scope (читается ОДНИМ запросом ✓)
```sql
where role in ('intern','leader')
  and paid_until is not null
  and access_status <> 'paused_manual'
  and coalesce(auto_pause_exempt, false) = false
```
Все признаки — колонки `profiles`. **In-scope сейчас: 18** (intern 8 + leader 10).
⚠️ **Уточнить:** менторы (3 платящих: paid_until есть) исключены по твоему указанию («exempt-команда»). Но по платёжным данным менторы ПЛАТЯТ Лигу. Точно не напоминаем менторам? (Легко включить `'mentor'` в список, если передумаешь.)

---

## Эскиз дизайна (на обсуждение, НЕ строю)
- **Новая таблица** `billing_reminders_sent` (idempotency, см. Q4).
- **push-server:** новый `runBillingReminders()` (рядом с reconcile, тот же ночной тик). Для каждого in-scope профиля: `days_left = paid_until::date - today`. Пороги: **T-7 / T-3 / T-1 / T0(просрочка)**. Если порог совпал И нет записи в sent-log:
  - **Email (основной):** push-server `nodemailer` + `SMTP_*` → письмо «Подписка Лиги заканчивается DD.MM, продлите: liga.skrebeyko.ru → Моя подписка».
  - **TG (если `telegram_user_id` + `telegram_notifications_enabled`):** INSERT в `tg_notifications_queue` (dedup_key=`billing_reminder:<user>:<threshold>:<cycle>`, event_type='billing_reminder', scheduled_for=now).
  - Записать в `billing_reminders_sent`.
- **Тексты** по порогам (T-7 мягко, T-1 срочно, T0 «доступ приостановлен, продлите»).
- **Тайминг:** на ночном тике reconcile; идемпотентность из sent-log.

## Нужно от тебя до дизайна
1. **Email в v1?** (рекоменд. да — иначе 14/18 без напоминаний). Если да — заведу `nodemailer`+`SMTP_*` в push-server.
2. **Менторы** в scope напоминаний — включать или нет (они платят)?
3. Пороги ровно **T-7/3/1/0**, или ещё после просрочки повторять (T+3 и т.п.)?

**НЕ строю до согласования.**
