# BUG-WEBHOOK-LOG-PARTIAL-INDEX — fix diff на ревью

**От:** VS Code Claude Code
**Кому:** стратег (claude.ai)
**Дата:** 2026-05-16
**Статус:** код написан локально + прод-smoke синтаксиса прошёл, **не закоммичен** — ждёт 🟢.

---

## TL;DR

Postgres `ON CONFLICT (cols) DO …` не матчится с **partial unique index**
(`CREATE UNIQUE INDEX … WHERE …`) если в ON CONFLICT не указан тот же
WHERE-clause. Иначе валится с `42P10: there is no unique or exclusion
constraint matching the ON CONFLICT specification`. Без фикса webhook
после активации (Phase C4) упал бы на первом же event'е.

Стратег указал на `billing_webhook_logs`. Подтверждаю, **в коде такая
же проблема в `subscriptions`** — там тоже partial-индекс
(`subscriptions_provider_subscription_uidx … WHERE provider_subscription_id IS NOT NULL`).
Чиню оба ради консистентности — не имеет смысла оставлять часть багов «на потом».

| Файл | Что | LOC |
|---|---|---|
| `push-server/server.mjs` | 4 ON CONFLICT-сайта получили `WHERE … IS NOT NULL` | +8 / −4 |

Тесты push-server остались **16/16 ✅** (синтаксис JS без изменений в логике).
Прод-smoke синтаксиса под транзакцией с ROLLBACK подтвердил что
`ON CONFLICT … WHERE …` корректно матчится с partial-индексом.

## Прод-smoke (factory-acceptance test, в транзакции с ROLLBACK)

```sql
BEGIN;
INSERT INTO billing_webhook_logs (provider, event_name, external_id, payload_json, signature_valid, is_processed)
  VALUES ('prodamus', 'smoke_partial_idx', 'phase29-smoke-001', '{}'::jsonb, true, true)
  ON CONFLICT (provider, external_id) WHERE external_id IS NOT NULL DO NOTHING;
-- результат: INSERT 0 1

INSERT INTO billing_webhook_logs (provider, event_name, external_id, payload_json, signature_valid, is_processed)
  VALUES ('prodamus', 'smoke_partial_idx_dup', 'phase29-smoke-001', '{}'::jsonb, true, true)
  ON CONFLICT (provider, external_id) WHERE external_id IS NOT NULL DO NOTHING;
-- результат: INSERT 0 0  ← дедуп сработал

SELECT count(*) FROM billing_webhook_logs WHERE external_id = 'phase29-smoke-001';
-- dedup_count: 1

ROLLBACK;
```

Доказывает:
1. Синтаксис `ON CONFLICT (cols) WHERE …` валиден и матчится с partial-индексом.
2. Дедуп работает корректно (count=1, не 2).
3. Без WHERE-clause Postgres выкинул бы 42P10 (проверено мысленно — стандартное поведение).

## Diff

### `push-server/server.mjs` (+8 / −4) — 4 ON CONFLICT-сайта

**Сайт 1 (line 233-241): `persistWebhookLog` — billing_webhook_logs**

```diff
+  // BUG-WEBHOOK-LOG-PARTIAL-INDEX: ON CONFLICT с partial unique index требует
+  // явного WHERE-clause, совпадающего с индексом, иначе Postgres выкидывает
+  // 42P10 «no unique or exclusion constraint matching».
+  // Индекс: billing_webhook_logs_provider_external_uidx … WHERE external_id IS NOT NULL.
   const q = await client.query(
     `insert into public.billing_webhook_logs(provider, event_name, external_id, payload_json, signature_valid, is_processed)
      values ($1, $2, $3, $4::jsonb, $5, false)
-     on conflict (provider, external_id) do nothing
+     on conflict (provider, external_id) where external_id is not null do nothing
      returning id, is_processed`,
```

**Сайт 2 (line ~298): `applyAccessState` payment — subscriptions**

```diff
     await db.query(
       `insert into public.subscriptions(user_id, provider, provider_subscription_id, status, paid_until, last_payment_at, ended_at, updated_at)
        values ($1, $2, $3, $4, $5, now(), null, now())
-       on conflict (provider, provider_subscription_id) do update
+       on conflict (provider, provider_subscription_id) where provider_subscription_id is not null do update
          set status = excluded.status,
              paid_until = excluded.paid_until,
              last_payment_at = now(),
              ended_at = null,
              updated_at = now()`,
       [profile.id, PRODAMUS_PROVIDER_NAME, subscriptionId || `${profile.id}`, mutation.subscription_status, effectivePaidUntil.toISOString()]
     );
```

**Сайт 3 (line ~328): `applyAccessState` deactivation/finish — subscriptions**

```diff
     await db.query(
       `insert into public.subscriptions(user_id, provider, provider_subscription_id, status, paid_until, ended_at, updated_at)
        values ($1, $2, $3, $4, $5, now(), now())
-       on conflict (provider, provider_subscription_id) do update
+       on conflict (provider, provider_subscription_id) where provider_subscription_id is not null do update
          set status = excluded.status,
              paid_until = excluded.paid_until,
              ended_at = now(),
              updated_at = now()`,
       [profile.id, PRODAMUS_PROVIDER_NAME, subscriptionId || `${profile.id}`, mutation.subscription_status, paidUntil ? paidUntil.toISOString() : null]
     );
```

**Сайт 4 (line ~450): `runNightlyExpiryReconcile` exempt-expired — billing_webhook_logs**

(добавлен в моём C2 коммите — тот же паттерн).

```diff
       await pool.query(
         `insert into public.billing_webhook_logs(
            provider, event_name, external_id, payload_json, signature_valid, is_processed
          )
          values ($1, 'auto_pause_exempt_expired', $2, $3::jsonb, true, true)
-         on conflict (provider, external_id) do nothing`,
+         on conflict (provider, external_id) where external_id is not null do nothing`,
```

## Что НЕ затронуто

- **`push_subscriptions.endpoint`** ON CONFLICT (server.mjs:91) — НЕ трогаем,
  там **полный** unique constraint (миграция 20), не partial.
  Подтверждение: `push.subscribe` уже работает в проде live.
- Сама миграция phase29 — НЕ менялась. Индексы остаются partial (это хорошо:
  если когда-нибудь придёт payload без `event_id`/`order_id`/etc., наш
  `resolveExternalId` отдаст sha256 fallback — NULL не возникает; но если
  возникнет, partial-индекс не будет блокировать INSERT).
- `prodamusVerify.mjs`, `billingLogic.mjs`, тестовые файлы — без изменений.

## Альтернативы, которые НЕ выбрал

1. **Сделать индекс полным** (без `WHERE external_id IS NOT NULL`).
   Минус: NULL-значения сразу будут конфликтовать как (provider, NULL).
   Postgres трактует `(provider, NULL)` как разные ключи (NULL ≠ NULL),
   так что full unique тут нормально работает. Но тогда теряем смысл
   `WHERE` (была защита от лишних индексных записей для NULL-rows). Не
   принципиально, но в нашем коде NULL не должен приходить — оставляю
   partial для строгости.

2. **`ON CONFLICT ON CONSTRAINT name`.** Работает только с CONSTRAINTами,
   не с INDEX'ами. У нас именно `CREATE UNIQUE INDEX`, не `ALTER TABLE …
   ADD CONSTRAINT … UNIQUE` — этот вариант не подходит синтаксически.

## Готов к commit + push + deploy

Предлагаемый commit message:

```
fix(push-server): BUG-WEBHOOK-LOG-PARTIAL-INDEX — ON CONFLICT WHERE для partial unique индексов

Postgres требует, чтобы ON CONFLICT (cols) с partial unique index
содержал тот же WHERE-clause, что и индекс — иначе 42P10 «no unique
or exclusion constraint matching». Без фикса webhook после активации
(Phase C4) падал бы на первом же event'е.

Стратег указал на billing_webhook_logs. В коде ровно тот же баг в
subscriptions (тот же паттерн partial unique). Чиню оба:

- billing_webhook_logs.provider+external_id (2 сайта: persistWebhookLog
  и runNightlyExpiryReconcile.exempt-expired-block).
- subscriptions.provider+provider_subscription_id (2 сайта в applyAccessState:
  payment-branch и deactivation/finish-branch).

Проверено прод-smoke под BEGIN/ROLLBACK: INSERT 0 1 → INSERT 0 0 →
dedup_count=1. Без WHERE-clause Postgres дал бы 42P10.

push-server тесты 16/16 зелёные (логика JS без изменений).

Diff: docs/_session/2026-05-16_10_codeexec_partial_index_fix.md
```

После 🟢:
1. `git add push-server/server.mjs`
2. `git commit + git push origin main`
3. `rsync push-server/ → /opt/push-server/` (без tests/.env/lock).
4. `ssh systemctl restart push-server.service` + verify health 200, журнал чистый, webhook 503 (по-прежнему disabled).
5. После — Ольга включает webhook, ждём sandbox-тест. Sandbox-event теперь должен:
   - Пройти signature verify (фикс в 7dcab90).
   - Записаться в `billing_webhook_logs` без 42P10 (этот фикс).
   - Получить 200 OK / 403 Invalid signature (зависит от того, как именно sandbox подписывает).

---

## Урок?

Заводить ли отдельный `docs/lessons/2026-05-16-postgres-partial-index-on-conflict.md`?
По правилам CLAUDE.md «после каждого фикса бага» — да. Сделаю короткий
урок при finalize FEAT-015 (Phase C7), вместе с уроком про
header-Sign — оба про неявные контракты Postgres/HTTP.
