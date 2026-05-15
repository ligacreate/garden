# Урок: Postgres `ON CONFLICT` с partial unique index требует тот же `WHERE`-clause

**Дата:** 2026-05-16
**Контекст:** FEAT-015 Phase C2 (push-server doработка). Замечен стратегом во время review кода до Phase C5 sandbox.

## Симптом

В `push-server/server.mjs` четыре места писали upsert по таблицам с partial unique индексами:

```sql
INSERT INTO billing_webhook_logs(provider, event_name, external_id, ...)
VALUES (...)
ON CONFLICT (provider, external_id) DO NOTHING;
```

Соответствующий индекс из миграции `phase29`:
```sql
CREATE UNIQUE INDEX billing_webhook_logs_provider_external_uidx
  ON billing_webhook_logs(provider, external_id)
  WHERE external_id IS NOT NULL;
```

Без фикса первый же реальный sandbox-event упал бы с:
```
ERROR: 42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification
```

Аналогично для `subscriptions(provider, provider_subscription_id) WHERE provider_subscription_id IS NOT NULL` — два сайта в `applyAccessState` (payment-branch и deactivation-branch).

## Корневая причина

Postgres трактует `ON CONFLICT (cols)` как точную ссылку на индекс/constraint, который покрывает эти колонки. **Partial unique index не считается «соответствующим» без явного указания того же `WHERE`-clause.** Это потому что один и тот же `(provider, external_id)` может присутствовать в индексе и отсутствовать (если `external_id IS NULL`) — Postgres не угадывает, какой набор строк ты имеешь в виду.

Правильный синтаксис:
```sql
ON CONFLICT (provider, external_id) WHERE external_id IS NOT NULL DO NOTHING;
```

## Почему так получилось

- **Recon FEAT-015** опирался на ранее спроектированную миграцию 21 (биллинг). Я переиспользовал её схему индексов в `phase29`, не подумав о том, что на стороне INSERT-кода такие partial-индексы требуют синтаксической точности.
- В `push-server/server.mjs` уже был успешно работающий аналогичный паттерн для `push_subscriptions(endpoint)` ON CONFLICT — но там **полный** unique constraint (миграция 20), не partial. Я скопировал паттерн, не сверив тип индекса.
- Тесты push-server — только unit-тесты `billingLogic.mjs` (чистая JS-логика). Нет интеграционного теста, который бы триггернул `INSERT INTO billing_webhook_logs` на проде → 42P10 поймали бы только на первом реальном webhook.
- **Удачное совпадение**: стратег указал на проблему в `billing_webhook_logs` ДО первого sandbox-event'а. Я нашёл аналогичный баг в `subscriptions` (тот же паттерн partial unique) и починил оба сразу.

## Как починили

Commit `e0d60cf`. 4 ON CONFLICT-сайта получили `WHERE … IS NOT NULL`:

| Сайт | Файл | Колонка |
|---|---|---|
| `persistWebhookLog` | `server.mjs:233` | `(provider, external_id) WHERE external_id IS NOT NULL` |
| `applyAccessState` payment-branch | `server.mjs:298` | `(provider, provider_subscription_id) WHERE provider_subscription_id IS NOT NULL` |
| `applyAccessState` deactivation-branch | `server.mjs:328` | `(provider, provider_subscription_id) WHERE provider_subscription_id IS NOT NULL` |
| `runNightlyExpiryReconcile` exempt-block | `server.mjs:450` | `(provider, external_id) WHERE external_id IS NOT NULL` |

Прод-smoke под `BEGIN/ROLLBACK`:
```sql
INSERT ... ON CONFLICT (provider, external_id) WHERE external_id IS NOT NULL DO NOTHING;
-- INSERT 0 1 (первый раз)
INSERT ... ON CONFLICT (provider, external_id) WHERE external_id IS NOT NULL DO NOTHING;
-- INSERT 0 0 (дедуп сработал)
```

Без `WHERE`-clause Postgres дал бы 42P10. Подтверждено.

## Что проверить в будущем

- **При создании нового partial unique index в миграции — сразу grep'нуть кодовую базу на ON CONFLICT по этим колонкам** и убедиться что везде указан тот же `WHERE`. Лучше — оставить комментарий в миграции:
  ```sql
  -- ON CONFLICT-сайты должны указать `WHERE external_id IS NOT NULL`,
  -- иначе 42P10 «no unique or exclusion constraint matching».
  ```
- **Альтернатива — `ON CONFLICT ON CONSTRAINT name`.** Работает только с CONSTRAINTами (`ALTER TABLE ... ADD CONSTRAINT ... UNIQUE`), не с index'ами (`CREATE UNIQUE INDEX`). У нас именно index — этот вариант не подходит синтаксически.
- **Ещё альтернатива — сделать индекс полным** (без `WHERE`). Postgres трактует `(provider, NULL)` как разные ключи (NULL ≠ NULL), так что полный unique тут тоже работает. Но теряется смысл partial (защита индекса от лишних строк с NULL). Оставили partial для строгости.
- **Если нужен upsert по таблице с partial index** — сразу пишешь `ON CONFLICT (cols) WHERE <тот же предикат> DO UPDATE/NOTHING`. Это часть «контракта» partial-индекса.
- **Тестируй ON CONFLICT-сайты прод-smoke'ом под `BEGIN/ROLLBACK`** до первого реального события. Один INSERT + один дублирующий — за минуту увидишь, матчится ли индекс.

## Связанные уроки

- [`2026-05-16-prodamus-signature-algorithm.md`](2026-05-16-prodamus-signature-algorithm.md) — параллельный баг в той же сессии (signature canonical form).
- [`2026-05-16-push-server-silent-crash-observability.md`](2026-05-16-push-server-silent-crash-observability.md) — почему такие ошибки нужно ловить алёртингом.
