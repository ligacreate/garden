# DIFF-ON-REVIEW (финал) — Истечение доступа абитуриентов + T-5 (verbatim текст)

**Дата:** 2026-07-11 · **Автор:** codeexec · **№** 263
**Статус:** финализация одобренного дизайна [262](2026-07-11_262_codeexec_applicant_access_expiry_diff.md) · изменений в коде НЕТ · жду 🟢 → выкат в окно.
**Дельта к 262:** флаги закрыты + verbatim-текст T-5 + вёрстка под длинную кнопку. Всё остальное — как в 262, дословно, не переписываю.

---

## 0. Закрытые флаги (решения Оли)

| Флаг 262 | Решение |
|---|---|
| №1 развязка email | **Вариант B** — push-server продюсер (пишет в очереди), garden-auth consumer (SMTP в одном месте). Единая `reminders_sent(kind,…)` — принято. |
| №2 текст T-5 | **Финал verbatim — см. §2. Не редактировать.** |
| №3 немедленный кик | `session_version` **НЕ бампить** — замок применяется на следующем refresh токена (мягко). |

**Cross-service факт:** garden-auth живёт в **отдельном репо** `ligacreate/garden-auth` (`/opt/garden-auth` на Bittern), не в этом дереве. Поэтому §4 (email-воркер) применяется там, push-server-часть + миграция — здесь. Line-exact diff по garden-auth сниму по ssh перед выкатом (§5 флаг).

---

## 1. Что берём из 262 без изменений

- **§2** `access_until = cohort.end_date + 3мес` (derive, без когорты → не истекает).
- **§3** ночной applicant-cut в `runNightlyExpiryReconcile` (`role='applicant'` + `access_until<today` + `access_status='active'` → `paused_expired`, аудит в `billing_webhook_logs`). Сверено с реальным кодом [server.mjs:675-732](../../push-server/server.mjs#L675) — паттерн insert совпадает 1:1.
- **§4.2** ядро `runReminders()` (порог = самый срочный не отправленный; идемпотентность INSERT перед отправкой).
- **§4.3** единая `reminders_sent(kind, profile_id, threshold, cycle_date, unique)`.
- **§5.3** расширение CHECK `tg_notifications_queue.event_type` (+`access_reminder`,`billing_reminder`).

Ниже — **только дельта**: финальный текст-спек и вёрстка длинного CTA.

---

## 2. T-5 текст — VERBATIM (дословно, не редактировать)

- **Тема:** `Через 5 дней закроется доступ к платформе`
- **Тело:** `Напоминаем: можно присоединиться к потоку курса, сдать сертификационный завтрак и перейти в Лигу. Мы всегда ждем!`
- **Кнопка (лейбл):** `Чтобы сдать сертификационный завтрак, напишите Ирине Одинцовой`
- **Ссылка кнопки:** `https://t.me/odintsova_ii`

Слова кнопки не резать — вёрстка подстраивается под длину (§3).

---

## 3. Спека T-5 с финальным текстом — DIFF `push-server/reminders.mjs`

Заменяет черновой `text:` из 262 §4.1. `text()` теперь отдаёт **три** представления
(subject / plaintext / html), чтобы длинный CTA был кликабельной ссылкой в письме
и текстом-ссылкой в TG.

```js
const ODINTSOVA_TG_URL = 'https://t.me/odintsova_ii';
const T5_CTA_LABEL = 'Чтобы сдать сертификационный завтрак, напишите Ирине Одинцовой';

// применимо и к 1f-биллингу: другой spec, тот же контракт {subject, bodyText, bodyHtml}
const applicantAccessSpec = {
  kind: 'applicant_access',
  scanSql: /* из 262 §4.1 — без изменений */,
  thresholds: [5],
  text: () => {
    const subject = 'Через 5 дней закроется доступ к платформе';
    const intro   = 'Напоминаем: можно присоединиться к потоку курса, сдать '
                  + 'сертификационный завтрак и перейти в Лигу. Мы всегда ждем!';
    // PLAINTEXT (TG + фолбэк письма): лейбл целиком + ссылка отдельной строкой,
    // слова не режем; TG сам делает URL кликабельным.
    const bodyText = `${intro}\n\n${T5_CTA_LABEL}:\n${ODINTSOVA_TG_URL}`;
    // HTML (письмо): CTA — ТЕКСТ-ССЫЛКА (не плашка), лейбл целиком → t.me.
    // Перенос по словам естественный (inline <a>), макет не рвётся.
    const bodyHtml =
      `<p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:#334155;">${intro}</p>`
    + `<p style="margin:0;font-size:16px;line-height:1.5;">`
    +   `<a href="${ODINTSOVA_TG_URL}" target="_blank" rel="noopener" `
    +   `style="color:#2f6f54;font-weight:600;text-decoration:underline;">`
    +   `${T5_CTA_LABEL}</a></p>`;
    return { subject, bodyText, bodyHtml };
  }
};
```

**Вёрстка CTA — решено (🟢):**
- Письмо: **текст-ссылка** (`<a>` подчёркнутая, не плашка), лейбл целиком, перенос по
  словам естественный — слова не режем, макет не рвётся.
- TG: inline-кнопок в очереди нет ([recon 223](2026-07-09_223_codeexec_phase1f_reminders_recon.md): воркер шлёт только `message_text`) → CTA = лейбл + ссылка строкой. TG делает ссылку кликабельной.

---

## 4. Дельта к очереди/воркеру письма (вариант B) — нужен HTML

262 §5.1/§5.2 несли только `body_text`. Для кликабельного CTA добавляем HTML-поле.

**Миграция — `email_notifications_queue` +1 колонка:**
```diff
 CREATE TABLE IF NOT EXISTS public.email_notifications_queue (
   ...
   body_text            text        NOT NULL,
+  body_html            text,               -- HTML-версия (CTA-ссылка); NULL → шлём только text
   dedup_key            text,
   ...
 );
```

**garden-auth `processEmailQueueBatch` — отдаём и text, и html:**
```diff
 const r = await transporter.sendMail({
   from: SMTP_FROM, to: row.recipient_email,
   subject: row.subject,
-  text: row.body_text
+  text: row.body_text,
+  ...(row.body_html ? { html: row.body_html } : {})
 });
```
(остальной скелет воркера — зеркало `processTgQueueBatch`, как в 262 §5.2: `for update skip locked limit 50`, backoff×5 → dead_letter, `if(!transporter) return`.)

**`enqueueEmail` (push-server) — прокидывает html:**
```diff
 await enqueueEmail(pool, {
   profileId: r.id, email: r.email,
-  subject: msg.subject, body: msg.body,
+  subject: msg.subject, bodyText: msg.bodyText, bodyHtml: msg.bodyHtml,
   dedupKey: `${spec.kind}:${r.id}:${r.cycle_date}:${due}`
 });
```
INSERT в `email_notifications_queue(recipient_profile_id, recipient_email, subject, body_text, body_html, dedup_key, scheduled_for)`.

**TG-ветка (bonus):** `enqueueTg` кладёт `message_text = msg.bodyText` (лейбл+ссылка уже внутри), `event_type='access_reminder'` — контракт NN-полей из recon 223, без изменений.

---

## 4b. garden-auth `server.js` — LINE-EXACT diff email-воркера

Снят реальный `/opt/garden-auth/server.js` (1025 стр., 2026-06-30). Транспорт уже есть
([`transporter`](#) стр. 86-91, `nodemailer` стр. 6, `SMTP_FROM` стр. 28, `computeBackoffMs` стр. 870).
Воркер — **точное зеркало** `processTgQueueBatch` (стр. 872-967). Вставка **сразу после** его
`setInterval` (после стр. 967). Отличие от TG: у письма нет «terminal»-ошибки (как TG-403) →
все ошибки transient до `MAX_ATTEMPTS` → `dead_letter`. Отправка через `sendMail(text + html?)`.

```diff
 setInterval(() => {
   processTgQueueBatch().catch((e) => console.error('[tg-queue] unhandled', e));
 }, TG_QUEUE_INTERVAL_MS).unref();
+
+// ── Email queue worker (зеркало processTgQueueBatch) — доставка писем-напоминаний.
+// Продюсер (push-server) пишет в email_notifications_queue; здесь единственная точка
+// отправки через SMTP. Бэкофф общий (computeBackoffMs). У письма нет «terminal»-ошибки
+// как TG-403 → все ошибки transient до max_attempts → dead_letter.
+const EMAIL_QUEUE_INTERVAL_MS = 15_000;
+const EMAIL_QUEUE_BATCH_SIZE = 50;
+const EMAIL_QUEUE_MAX_ATTEMPTS = 5;
+
+const processEmailQueueBatch = async () => {
+  if (!transporter) return; // SMTP не настроен — silent skip
+  const client = await pool.connect();
+  try {
+    await client.query('BEGIN');
+    const { rows } = await client.query(
+      `select id, recipient_email, subject, body_text, body_html, attempt_count
+         from public.email_notifications_queue
+        where sent_at is null
+          and dead_letter_at is null
+          and scheduled_for <= now()
+        order by scheduled_for asc
+        limit $1
+        for update skip locked`,
+      [EMAIL_QUEUE_BATCH_SIZE]
+    );
+    if (rows.length === 0) {
+      await client.query('COMMIT');
+      return;
+    }
+
+    for (const row of rows) {
+      const nextAttempts = (row.attempt_count || 0) + 1;
+      try {
+        await transporter.sendMail({
+          from: SMTP_FROM,
+          to: row.recipient_email,
+          subject: row.subject,
+          text: row.body_text,
+          ...(row.body_html ? { html: row.body_html } : {})
+        });
+        await client.query(
+          `update public.email_notifications_queue
+              set sent_at = now(), attempt_count = $2,
+                  last_attempt_at = now(), last_error = null
+            where id = $1`,
+          [row.id, nextAttempts]
+        );
+      } catch (err) {
+        const errText = String(err?.message || err).slice(0, 200);
+        if (nextAttempts >= EMAIL_QUEUE_MAX_ATTEMPTS) {
+          await client.query(
+            `update public.email_notifications_queue
+                set dead_letter_at = now(), attempt_count = $2,
+                    last_attempt_at = now(), last_error = $3
+              where id = $1`,
+            [row.id, nextAttempts, `max_attempts: ${errText}`]
+          );
+        } else {
+          const backoff = computeBackoffMs(nextAttempts);
+          await client.query(
+            `update public.email_notifications_queue
+                set attempt_count = $2, last_attempt_at = now(), last_error = $3,
+                    scheduled_for = now() + ($4 || ' milliseconds')::interval
+              where id = $1`,
+            [row.id, nextAttempts, errText, String(backoff)]
+          );
+        }
+      }
+    }
+    await client.query('COMMIT');
+  } catch (e) {
+    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
+    console.error('[email-queue] batch error', e);
+  } finally {
+    client.release();
+  }
+};
+
+setInterval(() => {
+  processEmailQueueBatch().catch((e) => console.error('[email-queue] unhandled', e));
+}, EMAIL_QUEUE_INTERVAL_MS).unref();
```

**Сверено по факту:** `pool`, `transporter`, `SMTP_FROM`, `computeBackoffMs` — все в области
видимости на точке вставки. `email_notifications_queue` (+`body_html`) заводится миграцией в
garden-репо (та же БД, `pool` garden-auth её видит). Деплой — коммит в `ligacreate/garden-auth`.

## 5. Флаги на этот шаг

1. **Вид длинной кнопки в письме** (§3): переносящаяся «пилюля» на 2-3 строки — ок? Или хочешь просто подчёркнутую ссылку-текст без плашки? (тексту всё равно, вопрос вида).
2. **garden-auth = отдельный репо.** Перед выкатом сниму реальный `server.js` по ssh и дам line-exact diff `processEmailQueueBatch` (сейчас — против известного паттерна). Ок, что этот кусок коммитится в `ligacreate/garden-auth`, а не сюда?

---

## 6. Файлы (при 🟢)

| Файл | Репо | Что |
|---|---|---|
| `migrations/2026-07-11_phaseXX_reminders_engine.sql` | garden | `reminders_sent`, `email_notifications_queue` (**+`body_html`**), extend `event_type` CHECK, applicant-cut — как 262 §3 |
| `push-server/server.mjs` | garden | applicant-cut в `runNightlyExpiryReconcile` + `await runReminders(pool)` |
| `push-server/reminders.mjs` (new) | garden | движок + `REMINDER_SPECS` (**T-5 verbatim, §3**) + `enqueueEmail`/`enqueueTg` |
| `garden-auth/server.js` | **ligacreate/garden-auth** | `processEmailQueueBatch` (text+**html**) + `setInterval` |
| `plans/2026-07-11-applicant-access-expiry.md` (new) | garden | план функции |

**Ничего не применяю. Жду 🟢 (и ack по §5).** Текст T-5 зафиксирован дословно, слова кнопки целые.
