# DIFF-ON-REVIEW — 1f: напоминания об оплате Лиги (billing-спека поверх движка)

**Дата:** 2026-07-11 · **Автор:** codeexec · **№** 264 · **Статус:** ждёт 🟢, изменений НЕТ.
**Основа:** движок напоминаний (phase48, выкачен). 1f = ВТОРАЯ спека, email-only.

## TL;DR
- Только `push-server/reminders.mjs` (+ опц. reorder в `server.mjs` — см. Флаг №1).
- **Ни миграции, ни garden-auth:** `reminders_sent` + `email_notifications_queue` уже на проде; billing — email-only, TG не трогаем.
- Деплой: rsync push-server + restart. Окно не нужно.

## Blast-radius (recon сейчас)
Активных подписчиков Лиги в окне **[0,7] дней — 7** (days_left: 6→1, 5→4, 3→1, 2→1; day-0 — никого).
**Первый тик после деплоя разошлёт ~7 писем Текст-1** (по разу, дальше idempotency). Каждый — по своему порогу (см. Флаг №2 про catch-up тему).

---

## 1. Движок — правки (`reminders.mjs`, generic-часть)

Чтобы спека решала канал и текст по порогу, две мелочи в ядре:

**(a) TG-канал — по данным спеки** (у billing нет TG → спека без `tgEventType`):
```diff
         const channels = [];
         if (r.email) channels.push('email');
-        const tgEligible = r.telegram_user_id && r.telegram_notifications_enabled;
+        const tgEligible = spec.tgEventType && r.telegram_user_id && r.telegram_notifications_enabled;
         if (tgEligible) channels.push('tg');
```

**(b) text() получает СРАБОТАВШИЙ порог** (billing выбирает Текст-1/2 и срок в теме по `due`):
```diff
-        const msg = spec.text(r.days_left, r);
+        const msg = spec.text(due, r);
```
```diff
         if (tgEligible) {
           await enqueueTg(pool, {
             profileId: r.id, tgUserId: r.telegram_user_id,
-            eventType: 'access_reminder', messageText: msg.bodyText, dedupKey
+            eventType: spec.tgEventType, messageText: msg.bodyText, dedupKey
           });
         }
```

**(c) applicant-спека — переносим `tgEventType` из хардкода в спеку** (поведение то же):
```diff
   {
     kind: 'applicant_access',
+    tgEventType: 'access_reminder',           // TG-канал включён
     scanSql: `...`,
     thresholds: [5],
-    text: () => {
+    text: (/* due */) => {
       ...
```
> applicant `text()` игнорит аргумент — верстка/текст T-5 не меняются.

---

## 2. Billing-спека — добавить в `REMINDER_SPECS` (email-only)

```js
const LIGA_RENEW_URL = 'https://liga.skrebeyko.ru';
const RENEW_CTA_LABEL = 'Продлить подписку';
const billingCtaHtml =
  `<p style="margin:0;font-size:16px;line-height:1.5;">`
  + `<a href="${LIGA_RENEW_URL}" target="_blank" rel="noopener" `
  + `style="color:#2f6f54;font-weight:600;text-decoration:underline;">`
  + `${RENEW_CTA_LABEL}</a></p>`;

{
  kind: 'billing_reminder',                     // = reminders_sent.kind (Оля)
  // НЕТ tgEventType → канал только email.
  // Аудитория: активные подписчики Лиги; исключены exempt и paused_manual.
  scanSql: `
    select p.id,
           p.email,
           p.paid_until::date                 as cycle_date,
           (p.paid_until::date - current_date) as days_left
      from public.profiles p
     where p.role not in ('admin','applicant')
       and p.subscription_status = 'active'
       and coalesce(p.auto_pause_exempt, false) = false
       and p.access_status <> 'paused_manual'
       and p.paid_until is not null`,
  thresholds: [7, 3, 0],
  text: (due) => {
    if (due === 0) {
      // ТЕКСТ 2 (день истечения) — verbatim.
      const intro = 'Подписка на Лигу завершена. Продли подписку в кабинете, и всё откроется снова. Ждём тебя.';
      return {
        subject: 'Доступ к Лиге закончился',
        bodyText: `${intro}\n\n${RENEW_CTA_LABEL}:\n${LIGA_RENEW_URL}`,
        bodyHtml: `<p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:#334155;">${intro}</p>${billingCtaHtml}`
      };
    }
    // ТЕКСТ 1 (за 7 и 3 дня) — срок в ТЕМУ по порогу, тело константа. Verbatim.
    const subject = due === 3
      ? 'Через 3 дня закроется доступ к Лиге'
      : 'Через 7 дней закроется доступ к Лиге';
    const intro = 'Чтобы остаться с нами — на встречах, в практиках, в чате — продли подписку в кабинете.';
    return {
      subject,
      bodyText: `${intro}\n\n${RENEW_CTA_LABEL}:\n${LIGA_RENEW_URL}`,
      bodyHtml: `<p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:#334155;">${intro}</p>${billingCtaHtml}`
    };
  }
}
```

**Как срабатывает** (движок берёт min-порог, для которого `0 <= days_left <= T`):
`7д→Текст1(«7 дней»)`, `3д→Текст1(«3 дня»)`, `0д→Текст2`. Пороги 5/4/2/1 → уже отправленный порог → skip (idempotency). Overdue (days_left<0) → отфильтрован (`>=0`), больше не шлём.

**Идемпотентность / сброс при продлении:** `reminders_sent(kind='billing_reminder', profile, threshold, cycle_date=paid_until::date)`. Продление → новый `paid_until` → новый `cycle_date` → новые строки разрешены → цикл напоминаний стартует заново. ✅ (ровно как ты описала).

---

## 3. Тексты (verbatim, не редактировать)

**Текст 1** (за 7 / 3 дня):
- Тема: `Через 7 дней закроется доступ к Лиге` / `Через 3 дня закроется доступ к Лиге`
- Тело: `Чтобы остаться с нами — на встречах, в практиках, в чате — продли подписку в кабинете.`
- Кнопка: `Продлить подписку` → https://liga.skrebeyko.ru

**Текст 2** (день истечения, 0):
- Тема: `Доступ к Лиге закончился`
- Тело: `Подписка на Лигу завершена. Продли подписку в кабинете, и всё откроется снова. Ждём тебя.`
- Кнопка: `Продлить подписку` → https://liga.skrebeyko.ru

Кнопка — текст-ссылка (как в T-5, не плашка).

---

## 4. Флаги — 2 решения до apply

**Флаг №1 — порядок vs В1 (влияет на Текст-2 в день-0). ВАЖНО.**
Сейчас в `runNightlyExpiryReconcile`: `exempt → В1-overdue → applicant-cut → runReminders`.
В1-блок помечает `subscription_status='overdue'` там, где `paid_until < now()`. Если тик
проходит ПОСЛЕ времени `paid_until` в день-0 → В1 первым переведёт в `overdue` → billing-скан
(`subscription_status='active'`) его НЕ увидит → **Текст-2 не уйдёт**. Зависит от времени суток
тика (сейчас тик ~11:41 МСК от старта сервиса).

Рекомендую перенести `await runReminders(pool)` **ПЕРЕД** В1-overdue блоком (сразу после exempt-expire):
```diff
     const expired = await pool.query(/* exempt-expire */ ...);
     ...
+    // Напоминания ДО мутаций статуса — чтобы billing день-0 видел ещё active-подписку.
+    await runReminders(pool);
+
     // В1: истёкшая Лига-подписка → subscription_status='overdue' ...
     const { rows } = await pool.query(/* overdue */ ...);
     ...
     // applicant-cut ...
-    // Напоминания (T-5 + 1f) — общий движок.
-    await runReminders(pool);
   } catch (e) {
```
На T-5 не влияет (истечение абитуриента — за 3 мес до applicant-cut). **Альтернатива** (менее инвазивно, только в billing-скане): `subscription_status in ('active','overdue')` — тогда day-0-overdue тоже попадёт (long-overdue отсечёт `days_left>=0`). Скажи, какой вариант.

**Флаг №2 — catch-up тема на первом тике.**
7 подписчиков уже В окне [0,7], но не на точных порогах (напр. days_left=5 → сработает порог 7 → тема «Через 7 дней», а осталось 5). Одноразово, только для тех, кто в окне на момент деплоя; будущие пересечения — тема точная (срабатывает в сам день порога). Принять как есть, или подавить первый catch-up (сложнее)? Рекомендую **принять** — 7 писем, разово.

---

## 5. Файлы (при 🟢)
| Файл | Действие |
|---|---|
| `push-server/reminders.mjs` | billing-спека + generic-правки (due/tgEventType) |
| `push-server/server.mjs` | (Флаг №1, если reorder) перенос `runReminders` перед В1 |

Деплой: rsync push-server + restart + smoke. **Ничего не применяю до 🟢 и ответа на флаги.**

---

## 6. FINAL — флаги решены, apply-набор собран (ждёт «go» на rsync)

**Флаг №1 → Вариант A.** `runReminders(pool)` перенесён ПЕРЕД В1-overdue блоком
(сразу после exempt-expire). Не мутирует `subscription_status` → В1 следом как обычно;
T-5 и пороги 7/3 не затронуты. Diff `server.mjs`:
```diff
     if ((expired.rows || []).length > 0) { console.info(... auto_pause_exempt expired ...); }
+
+    // Напоминания ДО мутаций статуса: billing день-0 (Текст-2) уходит, пока active.
+    await runReminders(pool);
+
     // В1: истёкшая Лига → subscription_status='overdue' ...
     const { rows } = await pool.query(/* overdue */);
     ...
     if ((applicantExpired.rows||[]).length>0) { console.info(... paused_expired ...); }
-
-    // Напоминания (T-5 + задел 1f) — общий движок.
-    await runReminders(pool);
   } catch (e) {
```

**Флаг №2 → seed (не accept).** Одноразовый `migrations/data/2026-07-11_seed_billing_reminders_inwindow.sql`:
помечает в `reminders_sent` пройденные пороги (`days_left < threshold`) для каждого
in-window подписчика. Запуск — ДО первого тика (до rsync+restart).

**Валидация seed на проде (read-only, dry preview):**
| days_left | людей | due (min порог≥days_left) | первый тик |
|---|---|---|---|
| 2 | 1 | 3 | skip (seeded) → получит T-0 |
| 3 | 1 | 3 | **SEND** «Через 3 дня» (точно) |
| 5 | 4 | 7 | skip (seeded) → «3 дня» в день-3, T-0 в день-0 |
| 6 | 1 | 7 | skip (seeded) → то же |

→ **первый тик = 1 письмо** (точное «3 дня»), 0 писем с неверной цифрой. ✅

**Проверки:** `node --check` reminders/server — OK; push-server тесты 18/18 зелёные.

**Порядок выката (жду «go»):**
1. `seed_billing_reminders_inwindow.sql` на прод (ДО тика).
2. rsync push-server (reminders.mjs + server.mjs) + restart.
3. Verify: is-active, smoke 200, лог reconcile без ошибок, `email_notifications_queue` = 1 новое письмо (days_left=3), `reminders_sent` billing-строк = seed + 1.

**Файлы:** `push-server/reminders.mjs`, `push-server/server.mjs`, `migrations/data/2026-07-11_seed_billing_reminders_inwindow.sql`. Rsync НЕ запускал.
