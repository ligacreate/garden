# FEAT-015 E2E smoke — recon бриф для codeexec

**От:** стратега (claude.ai)
**Кому:** codeexec (VS Code Claude Code)
**Дата:** 2026-05-22 ночь
**Зелёный:** Ольга 🟢
**Тип:** Read-only recon — собрать пошаговую инструкцию для Ольги
(real-money smoke с её аккаунта)

---

## Контекст

FEAT-015 (Prodamus auto-pause) — DONE 2026-05-16. В проде работает по
sandbox + idempotency. Но **E2E real-money smoke не делался**. Без
него не уверены что **production Prodamus integration** работает (может
отличаться формат payload, secret rotation, IP whitelist, etc).

Ольга готова сделать smoke с реальным платежом ~100₽ со своего
аккаунта. Нужна **точная пошаговая инструкция**, чтобы:
1. Понимала где в Prodamus dashboard сделать тест-платёж
2. Знала на какой email/account будет триггер
3. Имела SQL/команду чтобы проверить что webhook доставлен и
   `access_status` обновился
4. Знала где смотреть логи если что-то не сработает

---

## Что собрать (read-only)

### 1. Prodamus payment endpoint / product

В коде/конфигах найти:
- Какой payment link / product configured в Prodamus account для нашей
  интеграции (если документировано в `garden/docs/journal/` или комментах)
- На какой URL Prodamus должен POST'ить webhook (мы знаем
  `https://push.skrebeyko.ru/api/billing/prodamus/webhook` — confirm)
- Какие env vars в push-server для Prodamus (`PRODAMUS_SECRET_KEY`,
  `PRODAMUS_WEBHOOK_ENABLED`) — confirm присутствие на проде

Источники:
- `push-server/server.mjs`, `push-server/prodamusVerify.mjs`,
  `push-server/billingLogic.mjs`
- `docs/journal/RECON_2026-05-15_feat015_prodamus.md`
- `docs/journal/subscription-task-final-status.md`
- ssh root@5.129.251.56 `cat /opt/push-server/.env` (если хост такой)
  — **не публиковать значения**, только подтвердить keys

### 2. Какой email / account будет затронут

Prodamus webhook содержит `email` или похожий identifier ученицы. По
этому email мы находим `users_auth` → `profiles` → обновляем
`access_status`.

Найти в коде (push-server):
- Какой ключ в payload используется для matching (email? phone? custom_id?)
- Что происходит если email не найден в `users_auth` (создаётся новый
  profile? ignored? alert?)

⚠ **Важно для smoke:** Ольгин email `olga@skrebeyko.com` в системе —
admin role. Smoke на её аккаунте может **триггернуть** изменение
`access_status` на её же профиле. **Это backfill'ится по rule**
`auto_pause_exempt=true для admin/applicant/intern` (per FEAT-015
backlog entry). То есть Ольгин профиль **не** должен `paused`-нуться
от реального платежа. Но webhook **должен** прийти, logs должны
записаться, и derive должен (no-op для exempt) выполниться.

**Если хочется чистый smoke** на non-exempt профиле — нужен test
account (не admin). Но создание test account — отдельная задача. Для
P0 verify Ольгин аккаунт достаточен (видим что webhook доставлен +
processed, даже если effect — no-op).

### 3. SQL для verify

Подготовить **готовые** SELECT-запросы, которые Ольга/я прогоним
ДО и ПОСЛЕ smoke:

**ДО (snapshot):**
```sql
-- Baseline: что сейчас у Ольгиного профиля
SELECT id, email, status, access_status, auto_pause_exempt,
       paused_manual, exempt_until, exempt_reason
  FROM profiles
 WHERE email = 'olga@skrebeyko.com';

-- Baseline: сколько webhook'ов за последний день
SELECT count(*) FROM billing_webhook_logs WHERE created_at > NOW() - INTERVAL '1 day';

-- Baseline: latest webhook event_name
SELECT created_at, event_name, payload->>'email' AS email
  FROM billing_webhook_logs
 ORDER BY created_at DESC LIMIT 5;
```

**ПОСЛЕ (1-2 минуты после оплаты):**
```sql
-- Verify: пришёл ли webhook от Ольгиного платежа
SELECT created_at, event_name, payload->>'email' AS email,
       payload->>'order_id' AS order_id, processed_at, error
  FROM billing_webhook_logs
 WHERE created_at > NOW() - INTERVAL '10 min'
 ORDER BY created_at DESC;

-- Verify: профиль Ольги (должен быть no-op из-за auto_pause_exempt)
SELECT id, email, status, access_status, updated_at
  FROM profiles
 WHERE email = 'olga@skrebeyko.com';
```

### 4. Где смотреть live (если SQL show ничего)

- Caddy access log (если включён на push.skrebeyko.ru — проверить
  в `_104` setup):
  ```bash
  ssh root@5.129.251.56 'tail -20 /var/log/caddy/access.log | grep prodamus'
  ```
- push-server logs:
  ```bash
  ssh root@5.129.251.56 'journalctl -u push-server --since "5 min ago" | tail -50'
  ```
  (или какой там systemd unit name)
- Prodamus dashboard webhook history (если Prodamus имеет такой UI)

### 5. Rollback / cleanup

Если что-то пошло не так:
- Если `access_status` Ольги изменился (не должен — exempt) → ручной
  UPDATE на возврат
- Если webhook упал с error → отчёт codeexec'у для дебага, не для
  Ольги

---

## Формат отчёта (paste-ready инструкция для Ольги)

Файл: `docs/_session/2026-05-22_106_codeexec_feat015_smoke_instructions.md`

Структура — **полная инструкция как чек-лист**, чтобы Ольга могла её
просто читать и выполнять по шагам:

```markdown
# FEAT-015 E2E real-money smoke — пошаговая инструкция для Ольги

## Подготовка (1 мин)

[Bash command для baseline SQL — paste-ready]

## Шаг 1: Сделать тестовый платёж в Prodamus (~5 мин)

1. Открой [URL] в Prodamus dashboard
2. Нажми [конкретная кнопка]
3. Введи сумму 100₽ (или минимум который Prodamus позволяет)
4. Email plателя: olga@skrebeyko.com (твой)
5. Оплати с твоей карты

## Шаг 2: Подожди 1-2 минуты (webhook propagation)

## Шаг 3: Verify SQL (1 мин)

[Готовый SQL, который Ольга копирует и прогоняет — либо сама через
psql, либо передаёт codeexec'у]

## Шаг 4: Что ожидать в результате

- billing_webhook_logs: новая строка с event_name='...' и
  email='olga@skrebeyko.com'
- profiles: access_status НЕ изменился (no-op из-за auto_pause_exempt)
- processed_at: not null
- error: null

## Если что-то пошло не так

[Конкретные сценарии: webhook не пришёл / пришёл но error / etc]
```

---

## Что НЕ делать

- ❌ Не делать сам тест-платёж от своего имени — это Ольгино действие
- ❌ Не публиковать `PRODAMUS_SECRET_KEY` или другие env-values
- ❌ Не модифицировать profiles или billing_webhook_logs данные
- ❌ Не предполагать formal — verify через код / прод-проверку

---

## Timeline

~15-20 минут recon + написание инструкции.
