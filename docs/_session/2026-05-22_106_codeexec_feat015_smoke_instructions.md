# FEAT-015 E2E real-money smoke — пошаговая инструкция для Ольги

**От:** codeexec (VS Code)
**Для:** Ольга (delivery: paste-ready чек-лист)
**Дата:** 2026-05-22 ночь
**В ответ на:** [_105](2026-05-22_105_strategist_feat015_smoke_recon.md)

> **Цель:** оплатить ~100₽ через Prodamus и убедиться, что
> production-интеграция работает (webhook доставлен → подпись валидна
> → лог записан → событие обработано). На твоём `admin`-аккаунте
> effect будет **no-op** (структурно exempt через `isExemptRole`),
> и это **OK** — нам нужна проверка integration path, не paused-эффект.

---

## TL;DR pre-state

Перед началом запомни актуальное состояние (для diff'a после):

| Параметр | Сейчас (verified) |
|---|---|
| profile `olga@skrebeyko.com` | `role=admin`, `status=active`, `access_status=active`, `subscription_status=active` |
| `auto_pause_exempt` | **false** (флаг НЕ установлен — защита приходит структурно через role=admin) |
| `paid_until` | `null` |
| `webhookEnabled` на проде | `true` (`PRODAMUS_WEBHOOK_ENABLED=true`) |
| `PRODAMUS_SECRET_KEY` | установлен (значение не публикую) |
| `PRODAMUS_ALLOWED_IPS` | пустой → IP whitelist выключен (защищает только signature) |
| Webhook endpoint | `POST https://push.skrebeyko.ru/api/billing/prodamus/webhook` (alias `/webhooks/prodamus`) |
| Последний реальный webhook | `2026-05-20 22:38:03` — `payment_success`, `signature_valid=t`, `is_processed=f` (был от другого email — `Profile not found (replayable)`). Это нормально. |

**Замечание про брифа:** в `_105` упоминается `auto_pause_exempt=true`
для admin-роли — это **терминологическая путаница**. Правда:
- `auto_pause_exempt` (boolean column) — индивидуальный флаг,
  выставляется руками админом для leader/intern/mentor с бартером.
  У тебя он **false**.
- `isExemptRole(role)` (логика в `push-server/billingLogic.mjs:6-7`) —
  **структурная** защита, срабатывает для `admin` и `applicant`
  всегда. **Это тебя защищает.**

Для `payment_success` события **никакая** из защит не нужна (платёж
не паузит, только активирует). Effect: `subscription_status=active`,
`access_status=active`, `bumpSessionVersion=false`. У тебя оба уже
active → no-op.

---

## Подготовка (1 мин)

### Baseline SQL — выполни ДО оплаты

Скопируй и прогони (через `psql` или попроси codeexec через `ssh root@5.129.251.56`):

```sql
\echo === Профиль Ольги до оплаты ===
SELECT id, email, role, status, access_status, subscription_status,
       auto_pause_exempt, paid_until, last_prodamus_event,
       prodamus_customer_id, prodamus_subscription_id, updated_at
  FROM profiles
 WHERE email = 'olga@skrebeyko.com';

\echo === Последние 5 webhook'ов (baseline) ===
SELECT id, created_at, event_name, signature_valid, is_processed, error_text,
       payload_json->>'customer_email' AS customer_email,
       payload_json->>'order_id'       AS order_id,
       payload_json->>'order_num'      AS order_num,
       payload_json->>'sum'            AS amount
  FROM billing_webhook_logs
 ORDER BY created_at DESC LIMIT 5;

\echo === Count за последний час ===
SELECT count(*) AS webhooks_last_hour
  FROM billing_webhook_logs
 WHERE created_at > NOW() - INTERVAL '1 hour';
```

**Запомни:**
- `updated_at` профиля
- `id` последнего webhook'а (после оплаты появится новый ID)
- count за час

---

## Шаг 1 — Тест-платёж в Prodamus (~5 мин)

> Я не знаю точно URL платёжной страницы в твоём Prodamus dashboard
> (нет в репо). Скорее всего у тебя есть либо payment-link под
> ligacreate (типа `https://ligacreate.payform.ru/?...`), либо доступ
> к Prodamus admin для создания test-платежа.

### Что нужно

1. Открыть Prodamus dashboard (login → `prodamus.ru` или зеркало).
2. Найти **существующую** payment-страницу нашей интеграции (та, что
   webhook'и шлёт на `push.skrebeyko.ru/api/billing/prodamus/webhook`).
   В payment-page settings → Webhook URL — должно стоять именно это.
   ⚠ Если у тебя несколько payment-страниц — выбери ту, чей webhook
   указывает на нашу прод-инфру.
3. Оплатить **минимальную** доступную сумму (Prodamus обычно ≥10₽,
   у тебя в брифе ~100₽ — OK).
4. **Email плательщика:** `olga@skrebeyko.com` — твой. Это критично:
   webhook matching ищет профиль по `customer_email`
   ([push-server/server.mjs:201-206, 216-222](../../push-server/server.mjs#L201))
   через `LOWER(TRIM(...))`. Если email будет любой другой — наш
   handler ответит `202 profile_not_found_replayable` и НЕ обновит
   твой профиль.
5. Заплатить со своей карты. Платёж пройдёт реально (твои ~100₽).

### Что НЕ делать

- Не подставлять email не-Ольги — webhook не сматчится.
- Не выбирать рекуррент/подписку, если не хочешь чтобы Prodamus делал
  ежемесячные авто-списания на твоей карте. Если есть «однократная
  оплата» — берём её.

---

## Шаг 2 — Подожди 1-2 минуты (webhook propagation)

Prodamus асинхронно POST'ит webhook на наш endpoint. Обычно <30 сек,
но даём 1-2 минуты на safety.

Если у тебя есть GUI dashboard в Prodamus с историей webhook delivery
— можно проследить статус (success/fail). Если статус **fail у них**
— значит наш endpoint вернул не-2xx (см. troubleshooting ниже).

---

## Шаг 3 — Verify SQL (1 мин)

### A. Главное — пришёл ли webhook

```sql
\echo === Свежие webhook'и за последние 10 мин ===
SELECT id, created_at, event_name, signature_valid, is_processed, error_text,
       payload_json->>'customer_email' AS customer_email,
       payload_json->>'order_id'       AS order_id,
       payload_json->>'order_num'      AS order_num,
       payload_json->>'sum'            AS amount,
       payload_json->>'payment_status' AS payment_status
  FROM billing_webhook_logs
 WHERE created_at > NOW() - INTERVAL '10 min'
 ORDER BY created_at DESC;
```

**Ожидание:**
- Появилась **одна** новая строка с `customer_email = 'olga@skrebeyko.com'`
- `event_name = 'payment_success'`
- `signature_valid = t`
- `is_processed = t`
- `error_text = NULL` (т.к. событие НЕ deactivation/finish, skip-логика
  не сработает)
- `amount` совпадает с тем что ты заплатила

### B. Профиль — diff с baseline

```sql
SELECT id, email, role, status, access_status, subscription_status,
       auto_pause_exempt, paid_until, last_prodamus_event,
       prodamus_customer_id, prodamus_subscription_id, updated_at
  FROM profiles
 WHERE email = 'olga@skrebeyko.com';
```

**Ожидание (no-op эффект):**
- `status`, `access_status`, `subscription_status` — **не изменились** (все были `active`, остались `active`)
- `last_prodamus_event` — может стать `'payment_success'` (логируется в `applyAccessState`)
- `prodamus_customer_id` / `prodamus_subscription_id` — могут заполниться, если payload содержал их
- `paid_until` — заполнится если Prodamus прислал `paid_until` в payload
- `updated_at` — обновлён (свежий timestamp)

⚠ Если `last_prodamus_event` стал `'payment_success'` — это позитивная
verify integration: handler видел event, classify работал, sync с
профилем прошёл.

---

## Шаг 4 — Что ожидать в результате (итог)

| Чек | Ожидаемый результат | Где смотреть |
|---|---|---|
| Webhook доставлен | новая строка в `billing_webhook_logs` за последние 5-10 мин | SQL §3.A |
| Signature валидна | `signature_valid = t` | SQL §3.A |
| Idempotency сработала | `is_processed = t`, `error_text = NULL` | SQL §3.A |
| Event classified правильно | `event_name = 'payment_success'` | SQL §3.A |
| Customer matched | `payload_json->>'customer_email' = 'olga@skrebeyko.com'` + профиль найден через `findProfileByCustomer` | SQL §3.A + §3.B |
| Effect no-op (твой профиль admin) | `access_status` остался `'active'` | SQL §3.B |
| Audit trail | `last_prodamus_event = 'payment_success'`, `updated_at` свежий | SQL §3.B |

**Если все 7 чеков ✅ — FEAT-015 production integration VERIFIED.**

---

## Если что-то пошло не так

### Сценарий 1: webhook не пришёл в БД (нет новой строки)

Возможные причины:
- **Prodamus не отправил** (зависает на их стороне или endpoint не
  настроен). Смотри в Prodamus dashboard webhook delivery history.
- **Endpoint не отвечает 2xx** → Prodamus retry'ит, но в БД ничего нет.
  Смотри push-server logs:
  ```bash
  ssh root@5.129.251.56 'journalctl -u push-server --since "5 min ago" | tail -50'
  ```
- **Endpoint вернул 503 "Webhook disabled"** → `PRODAMUS_WEBHOOK_ENABLED`
  каким-то образом не `true`. Проверь:
  ```bash
  ssh root@5.129.251.56 'systemctl status push-server | head -5; grep -o "^PRODAMUS_WEBHOOK_ENABLED=.*" /opt/push-server/.env'
  ```
- **Caddy access log** (включён `_104`):
  ```bash
  ssh root@5.129.251.56 'tail -50 /var/log/caddy/access.log | grep prodamus'
  ```
  Должна быть запись POST на `push.skrebeyko.ru/api/billing/prodamus/webhook`.
  Если её **нет** — Prodamus вообще не достучался. Если **есть с status=2xx** — наш сервер принял; ищи в БД глубже.

### Сценарий 2: webhook пришёл, но `signature_valid = f`

Симптом: строка появилась, `signature_valid = false`, `error_text = 'Invalid signature'`.

Причина: либо неверный `PRODAMUS_SECRET_KEY` на проде (rotated в Prodamus
dashboard, но не sync'нулся в `/opt/push-server/.env`), либо Prodamus
изменил алгоритм подписи.

Fix: STOP, отчёт codeexec'у — нужна синхронизация secret или дебаг
сигнатуры (известная сложная история — см. `BUG-PRODAMUS-SIGNATURE-HEADER`
+ `BUG-PRODAMUS-SIGNATURE-ALGO` в коде).

### Сценарий 3: webhook пришёл, `signature_valid = t`, но `is_processed = f`, `error_text = 'Profile not found (replayable)'`

Симптом: matching не сработал — наш `findProfileByCustomer` не нашёл
профиль по `customer_email`.

Причины:
- В payload `customer_email` пустой / не `olga@skrebeyko.com`.
- В payload email отличается по case/whitespace (хотя handler делает
  `LOWER(TRIM(...))`, должен сматчиться).

Проверь:
```sql
SELECT payload_json->>'customer_email' AS customer_email,
       payload_json->>'email'          AS email,
       payload_json->>'customer_phone' AS phone,
       payload_json->>'external_id'    AS ext_id,
       payload_json->>'user_id'        AS user_id
  FROM billing_webhook_logs
 WHERE id = <ID нового webhook'a>;
```

Если email не твой — Prodamus вытянул дефолтный email из аккаунта
плательщика (что у тебя в карте/кошельке). Скорректировать на стороне
Prodamus payment-form'ы (заполнить «Email плательщика» перед оплатой)
и повторить.

### Сценарий 4: профиль изменился неожиданно (access_status стал НЕ active)

⚠ Не должно произойти для `payment_success`. Но если **по ошибке**
Prodamus прислал `deactivation`/`finish`:

```sql
-- Возврат к active (только под админом, нужен JWT с твоим uid)
UPDATE profiles
   SET access_status = 'active', subscription_status = 'active',
       updated_at = NOW()
 WHERE email = 'olga@skrebeyko.com' AND id = '85dbefda-ba8f-4c60-9f22-b3a7acd45b21';
```

Дальше отчёт codeexec'у — что-то с classify или event mismatch.

### Сценарий 5: push-server упал/перезагружен после webhook

Маловероятно (FEAT-015 production stable с 2026-05-16), но если в
journalctl `push-server` видишь crash:
```bash
ssh root@5.129.251.56 'journalctl -u push-server --since "5 min ago" -p err'
```
Отчёт codeexec'у.

---

## Cleanup / rollback

В этом smoke ничего не нужно cleanup'ить:
- 100₽ — реальные деньги, не возвращаем (это «инфраструктурный налог»
  на verify production).
- Прод-данные не модифицировались: твой профиль остался `active`,
  webhook лог — это audit-trail, его не удаляем.

Если хочется иметь чистый smoke на non-exempt профиле — **отдельная
задача:**
1. Создать test-аккаунт с ролью `leader`/`intern` (НЕ admin/applicant).
2. Сделать payment + проверить что `subscription_status=active`,
   `access_status=active`.
3. Симулировать `deactivation` через Prodamus dashboard sandbox или
   через прямой POST с правильной подписью — посмотреть, что
   `access_status → paused_expired`.

Сейчас это **не блокер** — `_104` показал что E2E real-money path
сам по себе работает (видно по реальным webhook'ам 2026-05-16,
2026-05-18, 2026-05-20 с `signature_valid=t`).

---

## После smoke — что сделать

1. Скрин или текст SQL-результата — отправь codeexec'у.
2. codeexec задокументирует в `_107` (FEAT-015 E2E smoke verified)
   + closes `FEAT-015-E2E-SMOKE-PRODUCTION` (если такой тикет
   откроют) или просто отметит DONE в backlog.
3. Если **что-то** не сработало — `_107` будет инцидент-документ с
   trace'ом + fix-бриф.

---

## Краткая шпаргалка по командам

```bash
# psql из любого места (с правильным DATABASE_URL)
ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
  -c "<SQL>"'

# push-server live logs
ssh root@5.129.251.56 'journalctl -u push-server -f'  # follow
ssh root@5.129.251.56 'journalctl -u push-server --since "5 min ago" | tail -50'

# Caddy access (включён в _104)
ssh root@5.129.251.56 'tail -50 /var/log/caddy/access.log | grep prodamus'
```

---

## Что НЕ публиковал в этой инструкции (по правилу `_105`)

- ❌ Значение `PRODAMUS_SECRET_KEY` (только подтверждаю что установлен).
- ❌ Полные payload'ы прошлых webhook'ов (только структура keys).
- ❌ Уплачиваемые суммы / номера карт.
- ❌ Не запускал тест-платёж сам (Ольгино действие).
- ❌ Не модифицировал `profiles` или `billing_webhook_logs`.
- ❌ Не дёргал webhook endpoint от своего имени.
