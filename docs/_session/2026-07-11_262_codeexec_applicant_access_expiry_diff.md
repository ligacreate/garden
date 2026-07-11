# DIFF-on-review — Истечение доступа абитуриентов + T-5 напоминание

**Дата:** 2026-07-11 · **Автор:** codeexec · **Статус:** ДИЗАЙН на ревью, изменений НЕТ, жду 🟢.
**Опирается на:** recon `2026-07-09_223` (движок 1f) + recon текущей сессии (прод-числа).

---

## 0. TL;DR — что предлагается

1. **`access_until` = `cohort.end_date + 3 мес`** (derive-on-read через `profiles.id=pvl_students.id → cohort_id → end_date`). Абитуриент без когорты (`cohort_id IS NULL`) → `access_until` нет → **никогда не истекает**.
2. **Ночной cut** (прицеплен к `runNightlyExpiryReconcile`): `role='applicant'` + `access_until < today` + `access_status='active'` → `access_status='paused_expired'`. Аудит-строка в `billing_webhook_logs`.
3. **T-5 напоминание** через **ОБЩИЙ движок** (пороги/тексты = данные; тот же движок обслужит 1f-биллинг T-7/3/1/0). Email primary + TG bonus.
4. **Чистая развязка cross-service:** push-server только **сканирует и кладёт в очереди**, garden-auth **только доставляет** (существующий TG-воркер + новый email-воркер). SMTP остаётся в одном месте.

**3 решения жду от тебя** — см. §6 «Флаги».

---

## 1. Прод-факты, на которых стоит дизайн (текущая сессия)

- 10 абитуриентов, **все 10 в когорте** «ПВЛ 2026 Поток 1» (`end_date=2026-07-01` → `access_until=2026-10-01`), **0 без потока**.
- `access_status`: 8 `active`, 2 `paused_manual`. У всех `paid_until=NULL` → сейчас доступ ничем не ограничен (cut вводит границу впервые).
- Каналы: email **10/10**, TG реально привязан **3/10** → **email = основной**.
- `paused_expired` — валидное значение CHECK (`phase31:88`), биллинг его больше не пишет (В1 освободил) → реюз безопасен.

---

## 2. `access_until` — derive (единый источник, не хранимая копия)

Никакой новой колонки. Выражение считается на лету везде, где нужно:

```sql
-- access_until абитуриента (NULL, если нет когорты → не истекает)
(c.end_date + interval '3 months')::date  AS access_until
FROM profiles p
JOIN pvl_students s ON s.id = p.id           -- 1:1, shared PK
LEFT JOIN pvl_cohorts c ON c.id = s.cohort_id -- LEFT: cohort_id может быть NULL
WHERE p.role = 'applicant'
```

- `LEFT JOIN` + `c.end_date IS NULL` → `access_until` = NULL → все проверки «< today» дают FALSE → **не истекает**. Ровно как ты просила.

---

## 3. Ночной cut — DIFF `push-server/server.mjs`

Прицепляется внутрь существующего `runNightlyExpiryReconcile()` (после блока «В1 overdue», перед `catch`). Тот же ночной тик, отдельный идемпотентный UPDATE.

```diff
   if ((rows || []).length > 0) {
     console.info(`[billing-reconcile ${BILLING_TIMEZONE}] marked overdue (access NOT paused, В1): ${rows.length}`);
   }
+
+  // ── Абитуриенты: авто-пауза по истечении доступа (end_date + 3мес) ──────
+  // Источник даты — pvl_cohorts.end_date через shared PK (profiles.id=pvl_students.id).
+  // Гард access_status='active': paused_manual НЕ трогаем, админ-бан/pending выше — не перетираем.
+  // Идемпотентно: повторный прогон не находит уже 'paused_expired' → returning не шумит.
+  const applicantExpired = await pool.query(
+    `update public.profiles p
+        set access_status = 'paused_expired'
+      where p.role = 'applicant'
+        and p.access_status = 'active'
+        and exists (
+          select 1
+            from public.pvl_students s
+            join public.pvl_cohorts c on c.id = s.cohort_id
+           where s.id = p.id
+             and (c.end_date + interval '3 months')::date < current_date
+        )
+     returning id`
+  );
+  for (const row of applicantExpired.rows || []) {
+    // Отметить причину — аудит в billing_webhook_logs (тот же паттерн, что exempt_expired выше).
+    await pool.query(
+      `insert into public.billing_webhook_logs(
+         provider, event_name, external_id, payload_json, signature_valid, is_processed
+       )
+       values ($1, 'applicant_access_expired', $2, $3::jsonb, true, true)
+       on conflict (provider, external_id) where external_id is not null do nothing`,
+      [
+        PRODAMUS_PROVIDER_NAME,
+        `applicant_expired:${row.id}:${new Date().toISOString().slice(0, 10)}`,
+        JSON.stringify({ profile_id: row.id, source: 'nightly_reconcile', reason: 'cohort_end_plus_3m' })
+      ]
+    );
+  }
+  if ((applicantExpired.rows || []).length > 0) {
+    console.info(`[applicant-reconcile ${BILLING_TIMEZONE}] paused_expired: ${applicantExpired.rows.length} applicants`);
+  }
```

**Каскад, который надо знать (не баг — намеренно):**
- Bridge-триггер (`phase29:194` / `phase31:100`): `access_status → paused_expired` авто-ставит `profiles.status='suspended'` → события/встречи абитуриента скрываются из публичного фида. Для «нет доступа» это корректно.
- `has_platform_access()` = `role='admin' OR access_status='active'` → у paused_expired-абитуриента платформенный доступ закрывается. Это и есть замок.
- **Session_version НЕ бампится** этим UPDATE → активная сессия доживёт до истечения токена, замок применится на следующем refresh. См. флаг №3 (нужен ли немедленный кик).

---

## 4. Общий движок напоминаний (T-5 абитуриенты + T-7/3/1/0 биллинг)

### 4.1 Принцип: спека = данные

Один сканер `runReminders()` в push-server, обходит **список спек**. Каждая спека — как получить популяцию, дату истечения, пороги и тексты:

```js
// push-server/reminders.mjs (новый файл)
const REMINDER_SPECS = [
  {
    kind: 'applicant_access',
    // популяция + дата истечения (access_until). Одним запросом.
    scanSql: `
      select p.id, p.email, p.telegram_user_id, p.telegram_notifications_enabled,
             (c.end_date + interval '3 months')::date as cycle_date,
             ((c.end_date + interval '3 months')::date - current_date) as days_left
        from public.profiles p
        join public.pvl_students s on s.id = p.id
        join public.pvl_cohorts c on c.id = s.cohort_id
       where p.role = 'applicant'
         and p.access_status = 'active'
         and c.end_date is not null`,
    thresholds: [5],                 // T-5 (данные, не код)
    text: (daysLeft, ctx) => ({
      subject: 'Через 5 дней закончится доступ',
      // ВЕРБАТИМ Оли (черновик — подтвердить/дописать, см. флаг №2):
      body: 'Через 5 дней закончится доступ… зайди в текущий поток, сдай '
          + 'сертификационный завтрак, попади в Лигу.'
    })
  },
  // 1f подключается сюда же (той же формы спекой): kind:'billing',
  // scanSql по paid_until, thresholds:[7,3,1,0], text по порогам. НИЧЕГО в движке не меняя.
];
```

### 4.2 Ядро (псевдо-diff, общее для обеих спек)

```js
async function runReminders(pool) {
  for (const spec of REMINDER_SPECS) {
    const { rows } = await pool.query(spec.scanSql);
    for (const r of rows) {
      // выбрать САМЫЙ срочный ещё не отправленный порог, для которого days_left <= T
      const due = spec.thresholds
        .filter(t => r.days_left <= t && r.days_left >= 0)
        .sort((a, b) => a - b)[0];          // минимальный T = самый срочный
      if (due === undefined) continue;

      // идемпотентность ПЕРЕД отправкой (переживает рестарты/двойные тики)
      const claim = await pool.query(
        `insert into public.reminders_sent(kind, profile_id, threshold, cycle_date)
         values ($1,$2,$3,$4)
         on conflict (kind, profile_id, threshold, cycle_date) do nothing
         returning 1`,
        [spec.kind, r.id, String(due), r.cycle_date]
      );
      if (claim.rowCount === 0) continue;    // уже слали этот (порог, цикл) — молча дальше

      const msg = spec.text(r.days_left, r);
      // EMAIL (primary) — в очередь, доставляет garden-auth (см. §5)
      if (r.email) await enqueueEmail(pool, {
        profileId: r.id, email: r.email, subject: msg.subject, body: msg.body,
        dedupKey: `${spec.kind}:${r.id}:${r.cycle_date}:${due}`
      });
      // TG (bonus, только привязанные) — очередь phase32
      if (r.telegram_user_id && r.telegram_notifications_enabled) {
        await enqueueTg(pool, {
          profileId: r.id, tgUserId: r.telegram_user_id,
          eventType: 'access_reminder',        // ⚠ требует расширения CHECK, §5.3
          text: msg.body,
          dedupKey: `${spec.kind}:${r.id}:${r.cycle_date}:${due}`
        });
      }
    }
  }
}
```

Подключение к тику: в `runNightlyExpiryReconcile` в конце — `await runReminders(pool);` (или отдельный `setInterval` рядом; тайминг «плавающий», но идемпотентность из `reminders_sent` делает число прогонов неважным — как и в recon 223).

### 4.3 Единая таблица идемпотентности (замена двух таблиц из recon 223)

```sql
-- migrations/2026-07-11_phaseXX_reminders_engine.sql  (фрагмент)
CREATE TABLE IF NOT EXISTS public.reminders_sent (
    kind         text        NOT NULL,          -- 'applicant_access' | 'billing'
    profile_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    threshold    text        NOT NULL,          -- '5' | '7' | '3' | '1' | '0'
    cycle_date   date        NOT NULL,          -- access_until ИЛИ paid_until::date — «цикл»
    channels     text[]      NOT NULL DEFAULT '{}',
    sent_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_reminders_sent UNIQUE (kind, profile_id, threshold, cycle_date)
);
COMMENT ON TABLE public.reminders_sent IS
  'Идемпотентность движка напоминаний. Одна запись = один (kind,порог,цикл) навсегда. '
  'INSERT ON CONFLICT DO NOTHING ПЕРЕД отправкой. Заменяет billing_reminders_sent/access_reminders_sent.';
```

> Отличие от recon 223 / твоего ТЗ: **одна** `reminders_sent(kind,…)` вместо `billing_reminders_sent` + `access_reminders_sent`. Так как движок общий — одна таблица чище. Флаг №1.

---

## 5. Cross-service развязка — РЕКОМЕНДАЦИЯ (флаг №1 главный)

**Проблема:** сканер живёт в push-server (там ночной тик + БД), а `nodemailer` — только в garden-auth. Кто шлёт email?

### Вариант A (из recon 223) — nodemailer в push-server
push-server добавляет `nodemailer` + `SMTP_*` в `.env`, шлёт письма прямо в скане.
➖ SMTP-креды в двух сервисах, логика доставки (retry/backoff) дублируется, «кто шлёт email» размазан.

### Вариант B (РЕКОМЕНДУЮ) — очередь + producer/consumer, зеркало phase32
- **push-server = продюсер:** только пишет строки в очереди (`email_notifications_queue`, `tg_notifications_queue`). Ничего не шлёт. SMTP-кред не знает.
- **garden-auth = consumer:** владеет ВСЕЙ доставкой. Уже есть TG-воркер (`processTgQueueBatch`). Добавляем **симметричный** `processEmailQueueBatch()` на `transporter.sendMail`.
- ➕ SMTP в одном месте, retry/backoff/dead-letter бесплатно и одинаково для email и TG, нет cross-service HTTP/JWT-связки. Стоимость: 1 таблица + ~40 строк воркера.

**Диаграмма B:**
```
push-server (scan) ──INSERT──▶ email_notifications_queue ──▶ garden-auth processEmailQueueBatch ──▶ SMTP
                   └─INSERT──▶ tg_notifications_queue    ──▶ garden-auth processTgQueueBatch (есть) ─▶ TG
```

### 5.1 Новая таблица `email_notifications_queue` (зеркало tg-очереди)
```sql
CREATE TABLE IF NOT EXISTS public.email_notifications_queue (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_email      text        NOT NULL,
    subject              text        NOT NULL,
    body_text            text        NOT NULL,
    dedup_key            text,
    scheduled_for        timestamptz NOT NULL DEFAULT now(),
    sent_at              timestamptz,
    attempt_count        int         NOT NULL DEFAULT 0,
    last_attempt_at      timestamptz,
    last_error           text,
    dead_letter_at       timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_queue_pending
    ON public.email_notifications_queue(scheduled_for)
    WHERE sent_at IS NULL AND dead_letter_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_queue_dedup
    ON public.email_notifications_queue(dedup_key)
    WHERE dedup_key IS NOT NULL AND sent_at IS NULL;
-- НЕ доступна authenticated (как tg-очередь): PII в теле. Только gen_user.
```

### 5.2 `processEmailQueueBatch()` в garden-auth — зеркало `processTgQueueBatch`
Тот же скелет (BEGIN → `for update skip locked limit 50` → send → sent_at / backoff×5 → dead_letter). Отличие одно:
```js
const r = await transporter.sendMail({ from: SMTP_FROM, to: row.recipient_email,
                                       subject: row.subject, text: row.body_text });
// ok → sent_at; throw → backoff (computeBackoffMs) или dead_letter при attempt>=5
setInterval(() => processEmailQueueBatch().catch(...), 15_000).unref();
```
`if (!transporter) return;` — silent skip, как TG-воркер при незаданном боте.

### 5.3 Расширить `event_type` CHECK у tg-очереди (для TG-bonus)
```sql
ALTER TABLE public.tg_notifications_queue
  DROP CONSTRAINT tg_notifications_queue_event_type_check;
ALTER TABLE public.tg_notifications_queue
  ADD  CONSTRAINT tg_notifications_queue_event_type_check
  CHECK (event_type IN (
     'hw_submitted_new','hw_submitted_revision','hw_accepted',
     'hw_revision_requested','dm_from_mentor',
     'access_reminder','billing_reminder'   -- ← новые (сразу и под 1f)
  ));
```
`enqueueTg` INSERT'ит с NN-полями (`event_type, event_source_table='profiles', event_source_id=profile_id, event_payload='{}', message_text, scheduled_for=now(), attempt_count=0`) — по контракту из recon 223.

---

## 6. Флаги — 3 решения от тебя до сборки

1. **Развязка email:** вариант **B (очередь+воркер, рекомендую)** или **A (nodemailer в push-server, проще, но дублирует SMTP)**? От этого зависит: заводим `email_notifications_queue` + воркер в garden-auth, ИЛИ добавляем `nodemailer`+`SMTP_*` в push-server. Также: **одна `reminders_sent(kind,…)`** вместо `billing_reminders_sent`+`access_reminders_sent` — ок?
2. **Текст T-5 verbatim:** твой черновик «через 5 дней закончится доступ… зайди в текущий поток, сдай сертификационный завтрак, попади в Лигу». Нужны финальные: **тема письма** + **полное тело** (для email), и то же для TG (там HTML/plain). Дать ссылку в CTA (какую — `liga.skrebeyko.ru`?).
3. **Немедленный кик:** бампить ли `session_version` при cut, чтобы активная сессия абитуриента слетела сразу? Или замок применяется на следующем refresh токена (мягче). По умолчанию — НЕ бампить.

---

## 7. Файлы, которые тронем (при 🟢)

| Файл | Что |
|---|---|
| `migrations/2026-07-11_phaseXX_reminders_engine.sql` | `reminders_sent`, `email_notifications_queue` (если B), extend `event_type` CHECK |
| `push-server/server.mjs` | applicant-cut в `runNightlyExpiryReconcile` + вызов `runReminders` |
| `push-server/reminders.mjs` (новый) | движок + `REMINDER_SPECS` + `enqueueEmail`/`enqueueTg` |
| `garden-auth/server.js` (если B) | `processEmailQueueBatch` + `setInterval` |
| `plans/2026-07-11-applicant-access-expiry.md` (новый) | план функции (правило проекта) |

**Ничего не применяю. Жду 🟢 и ответы на 3 флага.**
