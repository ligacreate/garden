# Урок: silent crash в background-задачах push-server'а — 5 дней без алёрта

**Дата:** 2026-05-16
**Контекст:** FEAT-015 recon Phase C0. Случайно обнаружили историю крашей при просмотре `journalctl -u push-server.service`.

## Симптом

С 2026-05-11 (deploy push-server'а) по 2026-05-16 (apply миграции `phase29`) — **5 дней** — функция `runNightlyExpiryReconcile()` каждые 24 часа падала в stderr:

```
SyntaxError: error: column profiles.access_status does not exist
```

(`42703 errorMissingColumn` — UPDATE по несуществующей колонке: миграция 21 добавляющая `access_status` была спроектирована, но НЕ применена; reconcile-код полагался на её наличие.)

`try/catch` в reconcile глотал ошибку, процесс жил, HTTP API (`/health`, `/api/v1/upcoming.json`, webhook endpoint) работал — снаружи ничего не было видно. Никто не заметил.

Узнали случайно: при apply `phase29` посмотрели `journalctl -u push-server.service -n 25` чтобы увидеть restart-events после рестарта, и наткнулись на цепочку из 5 крашей с одинаковым стектрейсом.

## Корневая причина

**Observability gap:** background-задачи push-server'а никогда не попадали в систему алёртинга.

- **MON-001** (TG-бот клиентских ошибок) ловит `window.onerror` на фронте — это покрывает frontend-ошибки.
- **Серверные процессы** (push-server.service, garden-auth.service, garden-monitor.service) пишут в systemd journal, но никто не читает journal автоматически. На сервер заходишь только когда уже что-то сломалось снаружи.
- **HTTP API остаётся живым** даже когда background-cron падает. Health-check `GET /health` возвращает 200, потому что Express-handler не делает ничего сложного. Снаружи сервис «работает».

Получается классический failure mode: **non-fatal ошибка тихо съедается try/catch, наружу торчит OK, а критическая работа (reconcile подписок) не делается.**

## Почему так получилось

- При деплое push-server'а 2026-05-11 миграция 21 была «следующая в очереди», предполагалось что её применят в течение нескольких дней. Reconcile-код был написан с расчётом на её наличие.
- Миграцию 21 застряла на review (RESTRICTIVE-policies требовали отдельного решения). Через 5 дней рефлексия про неё была затёрта другими задачами. Reconcile тихо крашился каждую ночь.
- Не было алёрта на «push-server stderr содержит Error/SyntaxError/exit-non-zero». Мы заметили **только потому что лезли в journal по другому поводу**.
- Фронт-ориентированный observability (`MON-001`) у нас приоритет, потому что баги клиента болезненны для пользователя сразу. Серверные background-задачи не упоминались в acceptance критерии деплоя.

## Как починили

**Точечно** — миграция `phase29` (apply 2026-05-16) добавила недостающие колонки + сама ошибка прошла.

**Системно** — создан тикет `TECH-DEBT-PUSH-SERVER-STDERR-ALERTING` (P3) в `plans/BACKLOG.md`:

- Стрим `journalctl -u push-server.service -f` в TG-канал monitoring-бота. Фильтр на `ERROR` / `Error:` / `unhandled` / exit non-zero / restart events.
- Аналогично для `garden-auth.service` и `garden-monitor.service` — все background-сервисы.
- **Daily health-check sum** в TG: «вчера в push-server было N stderr-сообщений, top-3 уникальных по началу строки» — обзор тренда без real-time-алёртов.

P3 потому что один раз обожглись и починили сразу, но рано или поздно повторится. Не блокер, но сетка нужна.

## Что проверить в будущем

- **При деплое любого нового long-running background-сервиса** — заранее настроить, как сообщения из stderr попадают в alerting. Хотя бы daily health-check sum.
- **При написании новой background-функции с try/catch** — задавай вопрос «что произойдёт если этот блок упадёт прямо сейчас? Кто-то узнает в течение часа?». Если ответ «нет» — пиши явный alert (TG webhook, email, ping в Sentry).
- **Health-check endpoint должен зависеть от ключевой работы**, не быть автономным. Если reconcile упал последние N часов — `/health` должен возвращать `degraded`. Это превращает silent failure в visible failure.
- **При apply миграции, на которую полагается код в другом сервисе** — сразу проверь journal этого сервиса (`journalctl -u <name>.service --since "1 hour ago"`). Если код полагался на колонку/таблицу, а её 5 дней не было — там уже есть цепочка крашей, хорошо бы их увидеть и закрыть.
- **Cron / setInterval-задачи в Node должны логировать success тоже** (`info: reconcile completed, N rows updated`), не только errors. Тогда отсутствие success-лога за 24+ часа — само по себе сигнал.

## Связанные уроки

- [`2026-05-16-prodamus-signature-algorithm.md`](2026-05-16-prodamus-signature-algorithm.md) — параллельный баг в той же сессии. **Без debug-лога мы бы не диагностировали почему 403** — даже сейчас потенциально нужно временно включать stderr-трейсы и читать journal руками. Алёртинг бы автоматизировал.
- [`2026-05-16-partial-unique-index-on-conflict.md`](2026-05-16-partial-unique-index-on-conflict.md) — параллельный баг, тоже потенциально silent (INSERT 42P10 в reconcile проглотился бы тем же try/catch).

## Связанные тикеты

- `TECH-DEBT-PUSH-SERVER-STDERR-ALERTING` (P3, BACKLOG.md:3186) — основной системный фикс.
- `TECH-DEBT-PUSH-SERVER-RECONCILE-LOGSPAM` (DONE 2026-05-16) — частный кейс этой проблемы, закрыт apply'ем `phase29`.
- `MON-001` — клиентский error-tracking (TG-бот по `window.onerror`). Серверный аналог пока отсутствует.
