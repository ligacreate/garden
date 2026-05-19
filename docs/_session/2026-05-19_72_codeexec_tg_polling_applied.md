# TG-WEBHOOK-INBOUND-BLOCKED — applied

**От:** codeexec (VS Code)
**Кому:** Ольга → стратегу
**Дата:** 2026-05-19
**В ответ на:** 🟢 от Ольги (вариант a + correction про правильный репо) ([_70](2026-05-19_70_strategist_tg_webhook_to_polling.md), [_71](2026-05-19_71_codeexec_tg_polling_diff.md))
**Статус:** ✅ deployed на прод → ✅ verified silent polling → ✅ pushed в `ligacreate/garden-auth` → ⏳ ждёт live smoke от Ольги.

---

## (a) Polling deployed via scp

Файл `/opt/garden-auth/server.js` на проде содержит:
- `httpsGetJson` IPv4-only helper после `httpsPostJson`.
- Pure-функция `processTgUpdate(update)` вместо HTTP-route `app.post('/api/tg-bot/webhook/:secret', ...)` — логика парсинга `/start [LINK-XXXXXX]` сохранена 1:1.
- `pollTgUpdates` + рекурсивный `setTimeout` poll-loop (см. ниже про багу с setInterval).

scp + restart прошли чисто:
```
SCP_OK
active
Auth server running on port 3001
```

deleteWebhook + getWebhookInfo:
```
deleteWebhook → {"ok":true,"result":true,"description":"Webhook was deleted"}
getWebhookInfo → {"url":"","has_custom_certificate":false,"pending_update_count":0,"allowed_updates":["message"]}
```

## (b) Verify checks

### Бага 1: setInterval создал self-DoS

Первая попытка использовала `setInterval(pollTgUpdates, 2000)`. С `getUpdates(timeout=25s)` (long-polling) каждые 2 сек стартовал новый getUpdates, пока 12 предыдущих ещё висели в-полёте. TG валит 409 Conflict «make sure that only one bot instance is running» — он считает каждый параллельный запрос **другим** инстансом, хотя они все от одного процесса.

В логах сразу после restart было:
```
[tg-poll] 409 Conflict — webhook still active OR multiple pollers
  {"ok":false,"error_code":409,"description":"Conflict: terminated by other
   getUpdates request; make sure that only one bot instance is running"}
```
— каждые 1-3 секунды без перерыва. Мой явный 409-логирующий код сразу подсветил проблему.

**Fix:** заменил `setInterval` на рекурсивный `setTimeout`:
```js
const pollTgLoop = async () => {
  await pollTgUpdates();          // дождались возврата (или таймаута)
  setTimeout(pollTgLoop, TG_POLL_INTERVAL_MS).unref();  // только потом next
};
if (TG_NOTIF_API_BASE) {
  setTimeout(pollTgLoop, 1000).unref();
}
```

Это гарантирует ровно один in-flight getUpdates. После второго scp+restart 409 ушёл.

### Verify: silent long-poll = good

После recursive-poll fix:
```
$ journalctl -u garden-auth --since '90 seconds ago' | grep -iE 'tg-poll|Auth server'
(empty)
```

Тишина — это **правильное** поведение для idle polling. getUpdates висит на long-poll timeout=25s, возвращается с пустым result, мы тут же делаем next call. Никаких 409, никаких errors. Webhook отключён (`"url":""`).

Когда придёт первый реальный TG-message (через смок) — увидим `[tg-poll]` событие только при unexpected response. Успешная обработка update'а — silent (handler logs только ошибки).

## (c) Git workflow исправлен

Первая попытка — clone `olgaskrebeyko/garden-auth` — был **архивный** repo (read-only с 20 фев 2026). Push провалился (`403`). После твоей correction:

1. `mv ~/code/garden-auth ~/code/garden-auth-archived-olgaskrebeyko` — переименовал старый clone, чтобы больше не путать.
2. `git clone https://github.com/ligacreate/garden-auth.git ~/code/garden-auth` — актуальный.
3. scp прод-файлов в новый clone → diff показал **минимальный** drift:
   - `package.json` / `package-lock.json` — добавились `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (S3 был установлен через `npm install` прямо на проде).
   - `server.js` — diff = ровно мои polling-fix changes, ничего другого.
4. Два чистых коммита в `ligacreate/garden-auth`:
   - **`0b9a6d7`** `chore(deps): add @aws-sdk/client-s3 + s3-request-presigner installed on prod`
   - **`93c21c3`** `feat(tg): switch from webhook to long-polling (TG-WEBHOOK-INBOUND-BLOCKED)`
5. `git push origin main`: `cbad06d..93c21c3 → main`. ✅

**Актуальный clone сейчас:** `~/code/garden-auth/` (= `https://github.com/ligacreate/garden-auth`).
**Архивный мёртвый:** `~/code/garden-auth-archived-olgaskrebeyko/` — содержит локальные commits, никуда не пушится. Безопасно удалить.

«Мираж 633 строк» из [_71](2026-05-19_71_codeexec_tg_polling_diff.md) был относительно архива (там phase32-era baseline). Реального drift'а с actual repo не было — кроме deps.

---

## SHA

- В `ligacreate/garden-auth`:
  - `0b9a6d7` deps housekeeping
  - `93c21c3` polling-fix
- В `garden` (этот): после следующего коммита будет в `git log`.

---

## Smoke (на твоей стороне)

С тестового TG-аккаунта пишем `@garden_notifications_bot`:

1. `/start` (без кода) → ожидаемое: «Здравствуйте! Чтобы подписаться...».
2. `/start LINK-FAKE12` (фиктивный код) → ожидаемое: «🤔 Код не найден. Сгенерируйте новый в профиле Сада.».
3. **Реальная привязка** — открой Garden, профиль, «Привязать Telegram» → код `LINK-XXXXXX` → `/start LINK-XXXXXX` боту → ожидаемое: «✅ Готово! Теперь буду писать сюда...».

После каждого `/start` в журнале появится lag ~2-3 сек до ответа (long-poll возврат + processTgUpdate). Это нормально, обещано в брифе.

Если что-то не отвечает — пришли скрин TG-чата + точное время, грепну `[tg-poll]` и `[tg-update-handler-error]` в journalctl.

## Rollback (если потребуется)

Положить webhook обратно:
```bash
ssh root@5.129.251.56 'set -a; . /opt/garden-auth/.env; set +a;
  curl -fsS "https://api.telegram.org/bot$TG_NOTIFICATIONS_BOT_TOKEN/setWebhook?url=https://auth.skrebeyko.ru/api/tg-bot/webhook/$TG_NOTIFICATIONS_WEBHOOK_PATH"'
```
Плюс `git revert 93c21c3 && git push` в `ligacreate/garden-auth` + scp старого server.js на прод + restart. **Но webhook всё равно не работал** — это и был root cause. Rollback имеет смысл только если polling сам начнёт фейлить (например multi-instance проблема при горизонтальном scale).

---

## Lesson (запишу отдельным файлом)

`docs/lessons/2026-05-19-tg-long-polling-setinterval-self-dos.md` — про
антипаттерн `setInterval(pollLongPoll, dt)` где `dt < timeout`. Сделаю после
успешного smoke от Ольги, чтобы зафиксировать с реальным SHA + цитатой
409-лога.
