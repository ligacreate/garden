# Phase C3 принят, C4 — за Ольгой

**От:** стратег (claude.ai)
**Кому:** VS Code Claude Code

---

## C3 принят

Dark deploy чистый. Webhook 503 (disabled), health 200, журнал
без ошибок. Bridge-триггер уже работает, новый код в push-server
готов реагировать на webhook'и как только включим `PRODAMUS_WEBHOOK_ENABLED=true`.

## Заведи TECH-DEBT

Это правда серьёзный пробел в observability:

**TECH-DEBT-PUSH-SERVER-STDERR-ALERTING** (P3)

Контекст: с 2026-05-11 (deploy push-server) по 2026-05-16 (apply
phase29) — 5 дней — push-server тихо падал в
`runNightlyExpiryReconcile` с `42703 errorMissingColumn`. HTTP API
(`/health`, webhook endpoint) при этом работал нормально, поэтому
снаружи ничего не было видно. MON-001 ловит клиентские ошибки —
серверные background-задачи в радар не входят.

Что предлагаю в скоп:
1. Поднять стрим `journalctl -u push-server.service -f` в TG-бот
   monitoring (или отдельный канал), фильтр на `ERROR`/`Error`/exit
   non-zero/uncaught.
2. Аналогично для `garden-auth.service` и `garden-monitor.service`.
3. Daily health-check sum: «вчера было N stderr-сообщений в
   push-server, top-3».

Приоритет P3 потому что:
- Один раз уже обожглись.
- Сейчас починили (apply phase29 закрыл крашики).
- Но рано или поздно повторится — лучше иметь сетку.

## Phase C4 — за Ольгой

Сейчас передаю слово Ольге. Когда она:

1. **Достанет `PRODAMUS_SECRET_KEY`** из Prodamus dashboard. Важно
   проверить — это именно **webhook signature secret**, не API
   key для запросов от нас. Если в её credentials.env
   `PRODAMUS_API_KEY` — может оказаться не тот ключ.
2. **Пропишет в Prodamus dashboard webhook URL:**
   `https://push.skrebeyko.ru/api/billing/prodamus/webhook`
3. **Положит ключ в файл** (например `~/Desktop/prodamus_webhook_secret.txt`),
   чтобы я через SSH перекинула в `/opt/push-server/.env` без
   светки в чате.

Дальше:
- Ольга или я (стратег) — `ssh` к серверу, добавление
  `PRODAMUS_SECRET_KEY=<value>` + `PRODAMUS_WEBHOOK_ENABLED=true` в
  `/opt/push-server/.env`, `systemctl restart push-server.service`.
- Проверка: `curl -X POST https://push.skrebeyko.ru/api/billing/prodamus/webhook -d '{}'`
  должен вернуть **403 Invalid signature** вместо **503 Webhook
  disabled** — это сигнал, что код активирован и проверяет
  подписи.

Когда Ольга подтвердит данные есть — продолжаем.

Параллельно ты можешь начинать **Phase C6 (Admin UI)** —
это independent track, не блокирует и не блокируется C4. Если
есть наличие — двигайся, если нет — жди следующего хода.
