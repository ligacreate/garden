---
title: FEAT-024 Phase 2 — diff на server.js (TG webhook + 3 endpoint'а + worker)
date: 2026-05-16
from: VS Code Claude Code (codeexec)
to: стратег (claude.ai) + Ольга
reply_to: phase1 closed (_42 + push f29a337), сигнал «server.js свободен» получен
type: diff-on-review BEFORE scp на прод (никаких правок на проде, локальный server.js не сохранён)
status: 🛑 wait for green
---

# Phase 2 — server.js: TG webhook + endpoints + worker

## 0. TL;DR

- ✅ scp прод-`/opt/garden-auth/server.js` (502 строки) → `/Users/user/vibecoding/garden-auth/server.js`. md5 prod/local совпали `5476ac673cd05d0d5c78c8a9e0ec840d`. Локальный устаревший (216 строк) перезаписан свежим прод-кодом.
- ✅ Прочитал: `httpsPostJson` уже есть (l127-156), `notifyNewRegistration` от FEAT-023 Phase 2 на месте (l176-208), `escapeMd` (l171), `logClientError` (l210-214) — **ничего не трогаю**.
- 📝 Все правки FEAT-024 — **чисто additive**: новые env-константы, новый helper `sendTgNotification`, `escapeHtml`, `generateLinkCode`, 3 endpoint'а, worker `setInterval`. Существующие endpoint'ы (`/auth/*`, `/storage/sign`, `/api/client-error`, `/api/health`) — не трогаются.
- 🛑 **НЕ применил Edit'ы локально, НЕ scp'ал обратно, НЕ restart'ил прод.** Жду 🟢 на этот diff.

## 1. Что добавляю — обзор

| Блок | Куда вставить (по l от текущего файла) | Содержание |
|---|---|---|
| A. Env-константы | сразу после `const TG_API = ...` (l116) | `TG_NOTIF_BOT_TOKEN`, `TG_NOTIF_BOT_USERNAME`, `TG_NOTIF_WEBHOOK_PATH`, `TG_NOTIF_WEBHOOK_SECRET`, `TG_NOTIF_API_BASE` |
| B. `escapeHtml` helper | сразу после `escapeMd` (l171) | HTML escape для `parse_mode=HTML` (мы шлём `<b>...</b>` в нотификациях) |
| C. `sendTgNotification` | сразу после `notifyNewRegistration` (l208) | sender для FEAT-024 бота, 403/400/5xx обработка |
| D. `generateLinkCode` | рядом с `sendTgNotification` | 6 знаков `[A-Z2-9 без 0OI1L]`, формат `LINK-XXXXXX` |
| E. Endpoint `/api/profile/generate-tg-link-code` (JWT) | после `/auth/me` (l437) | генерит код, кладёт в `tg_link_codes`, возвращает deep_link |
| F. Endpoint `/api/profile/unlink-telegram` (JWT) | рядом с E | UPDATE profiles SET telegram_user_id=NULL |
| G. Endpoint `/api/tg-bot/webhook/:secret` | после `/api/client-error` (l296) | обработка `/start LINK-XXX`, Q7 reject duplicate TG, привязка |
| H. Worker `processTgQueueBatch` + `setInterval` | перед `app.listen` (l500) | sweep queue каждые 15с, бэкофф, dead-letter после 5 попыток, 403→disable |

Никаких изменений в существующих 502 строках.

## 2. Точные тексты блоков

### A. Env-константы (вставка после l116 `const TG_API = ...`)

```js
// FEAT-024 — отдельный TG-бот для уведомлений менторам/студенткам ПВЛ.
// НЕ путать с TG_BOT_TOKEN/TG_CHAT_ID выше (тот — @garden_grants_monitor_bot
// для админ-алертов). Этот — @garden_notifications_bot, юзер-направленный.
const TG_NOTIF_BOT_TOKEN = process.env.TG_NOTIFICATIONS_BOT_TOKEN;
const TG_NOTIF_BOT_USERNAME = process.env.TG_NOTIFICATIONS_BOT_USERNAME || 'garden_notifications_bot';
const TG_NOTIF_WEBHOOK_PATH = process.env.TG_NOTIFICATIONS_WEBHOOK_PATH;
const TG_NOTIF_WEBHOOK_SECRET = process.env.TG_NOTIFICATIONS_WEBHOOK_SECRET;
const TG_NOTIF_API_BASE = TG_NOTIF_BOT_TOKEN
  ? `https://api.telegram.org/bot${TG_NOTIF_BOT_TOKEN}`
  : null;
```

### B. `escapeHtml` (вставка после l171 `const escapeMd = ...`)

```js
// HTML-escape для parse_mode='HTML' в FEAT-024 уведомлениях.
const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');
```

### C. `sendTgNotification` (вставка после l208 `};` закрывающего `notifyNewRegistration`)

```js
// FEAT-024 — sender уведомлений в @garden_notifications_bot.
// Возвращает { ok, terminal?, code?, detail? }:
//   ok=true                 — отправлено;
//   ok=false terminal=true  — больше не пробуем (403/400);
//   ok=false terminal=false — retry с бэкоффом (5xx/timeout/network).
// Использует httpsPostJson (IPv4-only, обход happy-eyeballs к api.telegram.org).
const sendTgNotification = async (tgUserId, text, options = {}) => {
  if (!TG_NOTIF_API_BASE) {
    return { ok: false, terminal: true, code: 'bot_not_configured' };
  }
  const body = {
    chat_id: tgUserId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...options,
  };
  try {
    const r = await httpsPostJson(`${TG_NOTIF_API_BASE}/sendMessage`, body);
    if (r.ok) return { ok: true };
    if (r.status === 403) {
      return { ok: false, terminal: true, code: 'blocked_by_user', detail: r.text };
    }
    if (r.status === 400) {
      return { ok: false, terminal: true, code: 'bad_request', detail: r.text };
    }
    return { ok: false, terminal: false, code: `http_${r.status}`, detail: r.text };
  } catch (e) {
    return { ok: false, terminal: false, code: 'network_error', detail: String(e?.message || e) };
  }
};
```

### D. `generateLinkCode` (рядом с C)

```js
// FEAT-024 linking flow — одноразовый код LINK-XXXXXX.
// Алфавит без визуально похожих символов (0/O, 1/I/L) — UX при ручном вводе.
const LINK_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const generateLinkCode = () => {
  const bytes = crypto.randomBytes(6);
  let s = '';
  for (let i = 0; i < 6; i++) s += LINK_CODE_ALPHABET[bytes[i] % LINK_CODE_ALPHABET.length];
  return `LINK-${s}`;
};
```

### E. `POST /api/profile/generate-tg-link-code` (JWT, вставка после l437 — `/auth/me`)

```js
// FEAT-024 — генерация одноразового LINK-кода для привязки TG.
app.post('/api/profile/generate-tg-link-code', authMiddleware, async (req, res) => {
  try {
    // Гасим прошлые активные коды этого юзера — на один профиль не больше
    // одного «живого» неконсумированного кода.
    await pool.query(
      `update public.tg_link_codes
          set consumed_at = now()
        where profile_id = $1 and consumed_at is null and expires_at > now()`,
      [req.user.sub]
    );

    // Retry на коллизию PK (вероятность мизерная, 31^6 = ~887M).
    let code = null;
    for (let attempt = 0; attempt < 5 && !code; attempt++) {
      const candidate = generateLinkCode();
      try {
        await pool.query(
          `insert into public.tg_link_codes (code, profile_id) values ($1, $2)`,
          [candidate, req.user.sub]
        );
        code = candidate;
      } catch (e) {
        if (e.code !== '23505') throw e; // 23505 = unique_violation, retry
      }
    }
    if (!code) {
      return res.status(500).json({ error: 'Failed to allocate link code' });
    }

    return res.json({
      code,
      deep_link: `https://t.me/${TG_NOTIF_BOT_USERNAME}?start=${code}`,
      expires_in_seconds: 15 * 60,
    });
  } catch (e) {
    console.error('generate-tg-link-code error', e);
    return res.status(500).json({ error: e.message });
  }
});
```

### F. `POST /api/profile/unlink-telegram` (JWT, рядом с E)

```js
// FEAT-024 — отвязка TG (по кнопке «Отвязать Telegram» в UI).
app.post('/api/profile/unlink-telegram', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      `update public.profiles
          set telegram_user_id = null,
              telegram_linked_at = null,
              telegram_notifications_enabled = true
        where id = $1`,
      [req.user.sub]
    );
    return res.json({ ok: true });
  } catch (e) {
    console.error('unlink-telegram error', e);
    return res.status(500).json({ error: e.message });
  }
});
```

> Заметка: `telegram_notifications_enabled` сбрасываем обратно в `true` при отвязке. Иначе если юзер раньше заблокировал бота → flag упал в false → отвязал → перепривязал — нотификации не работают, потому что флаг забыли поднять. Безопаснее сбрасывать при unlink.

### G. `POST /api/tg-bot/webhook/:secret` (вставка после l296 — `/api/client-error`)

```js
// FEAT-024 — webhook handler для @garden_notifications_bot.
// Регистрация webhook'а: см. документацию в конце Phase 2 (curl setWebhook).
app.post('/api/tg-bot/webhook/:secret', async (req, res) => {
  // 1. Проверка секретного path в URL (если бот не настроен — 404 без шума).
  if (!TG_NOTIF_WEBHOOK_PATH || req.params.secret !== TG_NOTIF_WEBHOOK_PATH) {
    return res.status(404).end();
  }
  // 2. Опциональная проверка X-Telegram-Bot-Api-Secret-Token (если включали при setWebhook).
  if (TG_NOTIF_WEBHOOK_SECRET) {
    const got = req.headers['x-telegram-bot-api-secret-token'];
    if (got !== TG_NOTIF_WEBHOOK_SECRET) return res.status(403).end();
  }

  // ACK сразу — TG retry'ит при non-200 в течение 60с, нам это не нужно.
  res.status(200).end();

  // Дальше — асинхронная обработка update'а. Если упадёт — лог, не retry.
  try {
    const update = req.body || {};
    const msg = update.message;
    if (!msg || !msg.from || typeof msg.text !== 'string') return;

    const tgUserId = msg.from.id;
    const text = msg.text.trim();

    // Только команды /start (с LINK-кодом или без). Всё остальное — silently игнорим.
    const startMatch = text.match(/^\/start(?:\s+(LINK-[A-Z2-9]{6}))?\s*$/i);
    if (!startMatch) {
      return;
    }
    const code = (startMatch[1] || '').toUpperCase();
    if (!code) {
      // Голый /start без кода — отвечаем help'ом.
      await sendTgNotification(tgUserId,
        'Здравствуйте! Чтобы подписаться на уведомления о ДЗ, откройте свой профиль в Саду ведущих и нажмите «Привязать Telegram» — там появится одноразовый код.');
      return;
    }

    // 3. Найти код в БД, проверить валидность.
    const { rows: codeRows } = await pool.query(
      `select code, profile_id, expires_at, consumed_at
         from public.tg_link_codes
        where code = $1
        limit 1`,
      [code]
    );
    if (!codeRows.length) {
      await sendTgNotification(tgUserId,
        '🤔 Код не найден. Сгенерируйте новый в профиле Сада.');
      return;
    }
    const codeRow = codeRows[0];
    if (codeRow.consumed_at) {
      await sendTgNotification(tgUserId,
        '⌛️ Этот код уже использован. Сгенерируйте новый в профиле Сада.');
      return;
    }
    if (new Date(codeRow.expires_at) < new Date()) {
      await sendTgNotification(tgUserId,
        '⌛️ Код истёк (срок жизни — 15 минут). Сгенерируйте новый в профиле Сада.');
      return;
    }

    // 4. Q7 — этот TG уже привязан к ДРУГОМУ профилю?
    const { rows: existingTg } = await pool.query(
      `select id from public.profiles where telegram_user_id = $1 limit 1`,
      [tgUserId]
    );
    if (existingTg.length && existingTg[0].id !== codeRow.profile_id) {
      await sendTgNotification(tgUserId,
        '⚠️ Этот Telegram уже привязан к другому профилю Сада. Сначала отвяжите его там (в карточке профиля кнопка «Отвязать Telegram»), потом сгенерируйте новый код.');
      // Код НЕ консумируем — может попробовать после unlink.
      return;
    }

    // 5. Привязка транзакционно: UPDATE profiles + UPDATE tg_link_codes.
    const client = await pool.connect();
    let userName = null;
    try {
      await client.query('BEGIN');
      await client.query(
        `update public.profiles
            set telegram_user_id = $1,
                telegram_linked_at = now()
          where id = $2`,
        [tgUserId, codeRow.profile_id]
      );
      await client.query(
        `update public.tg_link_codes
            set consumed_at = now(),
                consumed_by_tg_user_id = $1
          where code = $2`,
        [tgUserId, code]
      );
      const { rows: profRows } = await client.query(
        `select name from public.profiles where id = $1`,
        [codeRow.profile_id]
      );
      userName = profRows[0]?.name || null;
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    // 6. Подтверждение.
    const greeting = userName ? `, ${escapeHtml(userName)}` : '';
    await sendTgNotification(tgUserId,
      `✅ Готово${greeting}! Теперь буду писать сюда о ДЗ — когда студентка сдаст, когда ментор проверит. Тихие часы: 23:00–08:00 МСК, в это время ничего не приходит.`);
  } catch (e) {
    logClientError({
      ts: new Date().toISOString(),
      level: 'tg-webhook-handler-error',
      error: String(e?.message || e),
    });
  }
});
```

### H. Worker `processTgQueueBatch` + `setInterval` (вставка перед `app.listen` l500)

```js
// FEAT-024 worker — vacuum tg_notifications_queue, send to TG with backoff.
// Запускается setInterval каждые 15с. SKIP LOCKED защищает от двойной
// обработки (даже если случайно запустим два инстанса garden-auth).
// Бэкофф: 1→1м, 2→2м, 3→4м, 4→8м, 5→16м; после 5 attempts — dead_letter.
const TG_QUEUE_INTERVAL_MS = 15_000;
const TG_QUEUE_BATCH_SIZE = 50;
const TG_QUEUE_MAX_ATTEMPTS = 5;

const computeBackoffMs = (attempts) => Math.pow(2, attempts - 1) * 60_000;

const processTgQueueBatch = async () => {
  if (!TG_NOTIF_API_BASE) return; // бот не настроен — silent skip
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `select id, recipient_profile_id, recipient_tg_user_id,
              event_type, message_text, attempt_count
         from public.tg_notifications_queue
        where sent_at is null
          and dead_letter_at is null
          and scheduled_for <= now()
        order by scheduled_for asc
        limit $1
        for update skip locked`,
      [TG_QUEUE_BATCH_SIZE]
    );
    if (rows.length === 0) {
      await client.query('COMMIT');
      return;
    }

    for (const row of rows) {
      const result = await sendTgNotification(row.recipient_tg_user_id, row.message_text);
      const nextAttempts = (row.attempt_count || 0) + 1;
      if (result.ok) {
        await client.query(
          `update public.tg_notifications_queue
              set sent_at = now(),
                  attempt_count = $2,
                  last_attempt_at = now(),
                  last_error = null
            where id = $1`,
          [row.id, nextAttempts]
        );
        continue;
      }
      const errText = `${result.code}: ${String(result.detail || '').slice(0, 200)}`;
      if (result.terminal) {
        await client.query(
          `update public.tg_notifications_queue
              set dead_letter_at = now(),
                  attempt_count = $2,
                  last_attempt_at = now(),
                  last_error = $3
            where id = $1`,
          [row.id, nextAttempts, errText]
        );
        if (result.code === 'blocked_by_user') {
          // 403 → юзер заблокировал бота → выключаем нотификации в профиле
          // (когда сделает /start снова — Q7 reset через unlink восстановит).
          await client.query(
            `update public.profiles
                set telegram_notifications_enabled = false
              where telegram_user_id = $1`,
            [row.recipient_tg_user_id]
          );
        }
        continue;
      }
      // Transient → backoff или dead-letter если достигли max.
      if (nextAttempts >= TG_QUEUE_MAX_ATTEMPTS) {
        await client.query(
          `update public.tg_notifications_queue
              set dead_letter_at = now(),
                  attempt_count = $2,
                  last_attempt_at = now(),
                  last_error = $3
            where id = $1`,
          [row.id, nextAttempts, `max_attempts: ${errText}`]
        );
      } else {
        const backoff = computeBackoffMs(nextAttempts);
        await client.query(
          `update public.tg_notifications_queue
              set attempt_count = $2,
                  last_attempt_at = now(),
                  last_error = $3,
                  scheduled_for = now() + ($4 || ' milliseconds')::interval
            where id = $1`,
          [row.id, nextAttempts, errText, String(backoff)]
        );
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('[tg-queue] batch error', e);
  } finally {
    client.release();
  }
};

setInterval(() => {
  processTgQueueBatch().catch((e) => console.error('[tg-queue] unhandled', e));
}, TG_QUEUE_INTERVAL_MS).unref();
```

> `.unref()` — чтобы worker не держал процесс от gracefulshutdown (если будут такие сценарии).

## 3. Env-переменные, которые нужно добавить в `/opt/garden-auth/.env` на проде

```env
TG_NOTIFICATIONS_BOT_TOKEN=<токен от @BotFather>
TG_NOTIFICATIONS_BOT_USERNAME=garden_notifications_bot
TG_NOTIFICATIONS_WEBHOOK_PATH=wh_<random32hex>
TG_NOTIFICATIONS_WEBHOOK_SECRET=<random32hex>
```

Сгенерировать random32hex (один раз, локально):
```
openssl rand -hex 16    # для WEBHOOK_PATH
openssl rand -hex 16    # для WEBHOOK_SECRET
```

**ВАЖНО:** Ольга, добавь эти 4 переменные в `/opt/garden-auth/.env` ДО `systemctl restart garden-auth` после моего scp. Если их не будет — webhook вернёт 404 на любой запрос (TG_NOTIF_WEBHOOK_PATH=undefined), а worker безмолвно скипнется (TG_NOTIF_API_BASE=null). Restart всё равно безопасен (никакого падения), но фича не заработает.

## 4. setWebhook у TG (одна команда, делается ПОСЛЕ deploy + env)

После того как server.js на проде с новыми env'ами и restart прошёл:
```bash
ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a &&
  curl -fsS -X POST "https://api.telegram.org/bot$TG_NOTIFICATIONS_BOT_TOKEN/setWebhook" \
    --data-urlencode "url=https://auth.skrebeyko.ru/api/tg-bot/webhook/$TG_NOTIFICATIONS_WEBHOOK_PATH" \
    --data-urlencode "secret_token=$TG_NOTIFICATIONS_WEBHOOK_SECRET" \
    --data-urlencode "drop_pending_updates=true" \
    --data-urlencode "allowed_updates=[\"message\"]"'
```

Ожидаемый ответ: `{"ok":true,"result":true,"description":"Webhook was set"}`.

Проверка статуса:
```bash
ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a &&
  curl -fsS "https://api.telegram.org/bot$TG_NOTIFICATIONS_BOT_TOKEN/getWebhookInfo"'
```

`url` должен совпасть с тем что выставили, `has_custom_certificate=false`, `pending_update_count=0`, `last_error_date` — пусто.

## 5. План apply после 🟢

1. Edit'ы локально в `/Users/user/vibecoding/garden-auth/server.js` (8 блоков из §2 этого файла, точечные вставки в указанные места).
2. `scp /Users/user/vibecoding/garden-auth/server.js root@5.129.251.56:/opt/garden-auth/server.js.new` (заливаем рядом, не перетираем сразу — на случай если syntax error).
3. На проде: `node --check /opt/garden-auth/server.js.new` (быстрая проверка синтаксиса).
4. Если OK: `cp /opt/garden-auth/server.js /opt/garden-auth/server.js.bak.2026-05-16-pre-feat024-phase2 && mv /opt/garden-auth/server.js.new /opt/garden-auth/server.js`.
5. **Перед** restart — Ольга добавляет 4 env-переменные в `/opt/garden-auth/.env` (см. §3). Если ещё не сделала — restart всё равно безопасен, фича просто не активируется.
6. `systemctl restart garden-auth.service && sleep 2 && systemctl is-active garden-auth.service && journalctl -u garden-auth.service -n 20 --no-pager`.
7. Smoke `/health` + `/api/health`:
   ```
   curl -s https://auth.skrebeyko.ru/health
   curl -s https://auth.skrebeyko.ru/api/health
   ```
8. Smoke linking flow (если env'ы на проде есть):
   - Cgenerate code локально через `curl -X POST -H "Authorization: Bearer $JWT" https://auth.skrebeyko.ru/api/profile/generate-tg-link-code`
   - Ольга в TG шлёт боту `/start LINK-XXXXXX`
   - Должна получить «✅ Готово, ...!»
   - Проверить `profiles.telegram_user_id` в БД.
9. setWebhook у TG (см. §4).
10. Отчёт `_session/2026-05-16_46_codeexec_feat024_phase2_applied.md`.
11. Commit (Phase 2 ровно).

## 6. Точки риска / edge cases — что обдумано

| Риск | Митигация |
|---|---|
| Race condition: два юзера одновременно `/start` с одним кодом | UNIQUE PK на `code` + `consumed_at` check + UNIQUE partial на `profiles.telegram_user_id` — один привяжется, второй получит «уже использован» |
| TG retry'ит на 200 OK | мы шлём 200 СРАЗУ перед обработкой — TG retry не сработает, дубликаты исключены |
| TG_NOTIF_BOT_TOKEN не задан | endpoint webhook вернёт 404, linking endpoints сгенерят код но deep_link с дефолтным `@garden_notifications_bot` username (не сломается), worker silent skip |
| Worker стартует до готовности БД | первый sweep вернёт `[tg-queue] batch error`, через 15с повторит — ничего не сломается |
| Очень длинный `message_text` в queue (>4096 символов TG лимит) | в триггерах §6 (миграция) уже обрезаем comment/text до 200 символов; общая длина < 4096, безопасно |
| Юзер заблокировал бота, потом разблокировал и сделал unlink+link заново | unlink сбрасывает `telegram_notifications_enabled` в true; новые нотификации пойдут |
| Юзер с привязанным TG_A делает /start с кодом своего же профиля (re-confirm) | `existingTg[0].id === codeRow.profile_id` → не блокируем, идём в шаг 5 транзакции; effectively no-op + код консумируется (заплатили один LINK-код за подтверждение) — приемлемое поведение |
| Бот получил сообщение не `/start` | silent ignore. Не отвечаем — экономим TG-quota, не спамим юзера |
| undefined `req.user.sub` в JWT (старый токен FEAT-023 era) | `authMiddleware` уже проверяет валидность JWT — sub точно есть, иначе 401 |

## 7. Что НЕ делаю в Phase 2

- ❌ Phase 2b — frontend UI кнопка «Привязать Telegram» — отдельный заход.
- ❌ Регистрация webhook'а через `setWebhook` — это пункт §4, после restart, после того как env'ы на проде.
- ❌ Soft rate-limit «5 нотификаций от одной студентки за минуту → отложить» — стратег согласился что это опционально, в Phase 4 если понадобится.
- ❌ Cleanup job для просроченных `tg_link_codes` (15 мин TTL) — они не мешают, partial index `WHERE consumed_at IS NULL` маленький; можно добавить отдельным cron в backlog.
- ❌ Метрики (`/metrics` для queue depth, attempt rate) — backlog.

## 8. Состояние локального файла

- `/Users/user/vibecoding/garden-auth/server.js` — **свежий прод-код (502 строки, md5 5476ac673cd05d0d5c78c8a9e0ec840d)**, БЕЗ моих Edit'ов. Применю Edit'ы после 🟢 на этот diff.
- Прод-файл не тронут.
- `.env` на проде не тронут.

## 9. Что прошу

**🟢/🔴 на:**
- Блоки A-H из §2 (тексты для вставки).
- Env-переменные из §3 (имена и наличие WEBHOOK_PATH + WEBHOOK_SECRET).
- Edge cases из §6 (особенно «re-confirm своего же TG» — приемлемо ли заплатить один LINK-код).
- Текст подтверждения после успешной привязки («✅ Готово, {name}! Теперь буду писать сюда о ДЗ — когда студентка сдаст, когда ментор проверит. Тихие часы: 23:00–08:00 МСК, в это время ничего не приходит.»).

Если 🟢 — иду по §5.
Если 🔴 на чём-то — точечная правка, новый diff.
