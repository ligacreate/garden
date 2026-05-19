# `setInterval(pollLongPoll, dt)` где `dt < timeout` → self-DoS через параллельные in-flight запросы

**Дата инцидента:** 2026-05-19 (apply + immediate detect через прод-логи).
**Связанный коммит:** `93c21c3` в `ligacreate/garden-auth` (TG-WEBHOOK-INBOUND-BLOCKED → polling переезд).
**Связанные сессии:** [_70 strategist](../_session/2026-05-19_70_strategist_tg_webhook_to_polling.md), [_71 codeexec diff](../_session/2026-05-19_71_codeexec_tg_polling_diff.md), [_72 codeexec applied](../_session/2026-05-19_72_codeexec_tg_polling_applied.md).

## Симптом

Сразу после `systemctl restart garden-auth` (первая попытка polling-deploy
для TG-бота `@garden_notifications_bot`) журнал `journalctl -u garden-auth`
заливало одинаковыми сообщениями каждые 1-3 секунды без перерыва:

```
[tg-poll] 409 Conflict — webhook still active OR multiple pollers
  {"ok":false,"error_code":409,"description":"Conflict: terminated by other
   getUpdates request; make sure that only one bot instance is running"}
```

Webhook был корректно удалён (`getWebhookInfo → "url":""`), второго инстанса
garden-auth не запущено (`systemctl status` показывал ровно один процесс).
Тем не менее, TG считал, что есть «множество инстансов».

## Корневая причина

Первая версия polling-loop'а в `server.js`:

```js
setInterval(pollTgUpdates, TG_POLL_INTERVAL_MS).unref();  // dt = 2000 мс
```

а `pollTgUpdates` внутри делал:

```js
const url = `${TG_API}/getUpdates?timeout=25&offset=${nextOffset}`;
const res = await httpsGetJson(url);  // long-poll до 25 секунд
```

`setInterval` запускает callback **по таймеру**, **не дожидаясь возврата
предыдущего**. Через 2 секунды стартует новый `getUpdates`, пока первый
ещё висит в long-poll. Через 4 секунды — третий. К 25-й секунде —
**12 параллельных in-flight long-poll'ов**.

С точки зрения TG Bot API:
- `getUpdates` — exclusive: на каждом боте может быть **ровно один
  активный long-poll**.
- Когда приходит second `getUpdates` с тем же token'ом → TG **завершает**
  первый с 409 Conflict и пытается обслужить второй.
- Через 2 сек — третий → второй валится с 409. И так далее.

Каждый прилёт callback'а `setInterval` → новый запрос → 409 предыдущему
→ цикл не завершается, потому что новые продолжают вливаться.

С точки зрения нашего процесса:
- Это **не multi-instance**. Это один процесс, шлющий запросы из одного
  Node-цикла.
- TG не различает inflight-пулы внутри одного клиента — у него только
  «активный long-poll этим бот-токеном».

## Почему так получилось

**Mental model `setInterval` vs `setTimeout` для async-callback'ов:**
`setInterval(fn, dt)` имеет implicit assumption «fn возвращается до
следующего тика». Для синхронных функций — это всегда так. Для async —
**нет** гарантии. Если `fn` делает long-running операцию (IO, fetch,
long-poll), параллельные тики накапливаются.

Это **общий антипаттерн для long-polling**: any periodic-trigger где
`period < expected_response_time` создаёт inflight-стек.

В нашем случае проблема была бы скрыта при `timeout=0` (short-poll) или
`timeout < 2s` — getUpdates возвращался бы быстрее, чем приходил new
tick. Но short-poll даёт высокий QPS (30 запросов/мин), что
противоречит TG rate-limits и эффективности long-poll'а.

`.unref()` для graceful shutdown не помогает — он только убирает interval
из event-loop-keepalive, не влияет на параллельность.

## Как починили

Замена `setInterval` на рекурсивный `setTimeout`:

```js
const pollTgLoop = async () => {
    try {
        await pollTgUpdates();                            // ← await завершения
    } catch (e) {
        console.error('[tg-poll-loop-fatal]', e?.message);
    }
    setTimeout(pollTgLoop, TG_POLL_INTERVAL_MS).unref();  // ← schedule next ПОСЛЕ
};

if (TG_NOTIF_API_BASE) {
    setTimeout(pollTgLoop, 1000).unref();  // start
}
```

**Ключевое:**
- `await pollTgUpdates()` блокирует pollTgLoop до возврата (или
  таймаута/error).
- Только после возврата планируется next tick.
- В любой момент времени — **ровно один in-flight** `getUpdates`.
- Try/catch гарантирует, что transient error (network blip) не уронит
  весь loop — schedule next в `finally`-стиле.

После apply: 409 пропали, журнал замолчал (silent long-poll = good —
никаких ошибок, getUpdates висит до timeout=25s, возвращается empty,
сразу next iteration).

## Что проверить в будущем

### Pattern: long-poll triggered by `setInterval`

Любая периодическая операция с длительностью > period — кандидат на
self-overlap. Особенно опасна для:
- Long-poll API (TG getUpdates, AWS SQS long-poll, Slack RTM).
- Webhook retry-handler'ов с long DB транзакциями.
- Crawler'ов, где fetch может зависнуть.

**Эвристика на ревью:**
```js
setInterval(asyncFn, dt);  // ← подозрительно, если asyncFn может занять > dt
```
Замени на `setTimeout(loop, dt)` где `loop = async () => { await asyncFn(); setTimeout(loop, dt); }`.

### Pattern: API rate-limit как симптом параллельности

Если внешний API внезапно начал отвечать 429 Too Many Requests / 409 /
«concurrent connection limit exceeded» — **первый вопрос:** сколько у
тебя одновременных in-flight запросов? Часто это не превышение
rate-limit'а вообще, а параллельность одного «логического» цикла.

В нашем случае TG говорил «multiple bot instances», что прозвучало как
«у тебя где-то второй garden-auth запущен». Это сбило с пути. Правильный
read: «у тебя на одном bot-token'е больше одного активного getUpdates»
— что верно даже для **одного** процесса с overlapping polling.

### Pattern: `setInterval(.unref())` — добавляет иллюзию управляемости

`.unref()` решает graceful-shutdown problem (не блокирует Node от exit'а),
но не overlapping problem. Не полагайся на `.unref()` для «контроля
исполнения» — это только signal к event-loop'у, не sync-barrier.

## Smoke verified

✅ После recursive-setTimeout fix:
```
$ journalctl -u garden-auth --since '90 seconds ago' | grep -iE 'tg-poll|Auth server'
(empty)
```

Silent long-poll — это правильное поведение. Идеально, если поле `409`
вообще исчезает (мы убрали root cause, а не подавили лог).

Production validation 2026-05-19 11:06 МСК — Ольга Разжигаева сдала ДЗ,
worker подхватил push из queue через polling, доставка ~5 секунд. Polling
работает.
