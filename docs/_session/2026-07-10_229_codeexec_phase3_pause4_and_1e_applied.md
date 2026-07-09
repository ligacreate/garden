# APPLY — Фаза 3: пауза 4 стажёров (вар. B) + 1e mark-paid Анастасия ✅

**Дата:** 2026-07-10
**Автор:** codeexec (VS Code)
**Статус:** ✅ ПРИМЕНЕНО на проде (оба блока).
**Дифф:** [`_session/228`](2026-07-10_228_codeexec_phase3_pause4_and_1e_markpaid_diff.md). 🟢 получен.

---

## Блок 1 — пауза 4 отвалившихся стажёров (вариант B) ✅

Один ssh: dry-run `ROLLBACK` → сверка → `COMMIT` (self-guarded). Guard'ы прошли (все 4 =
intern/active/paid_until NULL). Вариант B — зеркалим `runNightlyExpiryReconcile`.

**Было → стало (все 4):**

| Профиль | access_status | subscription_status | session_version | legacy status |
|---|---|---|---|---|
| Баженова Наталья | active → **paused_expired** | active → **overdue** | 1 → **2** | → **suspended** |
| Наталья Ильиных | active → **paused_expired** | active → **overdue** | 1 → **2** | → **suspended** |
| Светлана Исламова | active → **paused_expired** | active → **overdue** | 1 → **2** | → **suspended** |
| Ярослава Шайтанова | active → **paused_expired** | active → **overdue** | 1 → **2** | → **suspended** |

- `paid_until`/`telegram_user_id` не тронуты. `UPDATE 4`. `session_version+1` — живые сессии
  гасятся сразу; `status='suspended'` выставлен авто-триггером `sync_status_from_access_status`.
- Идемпотентно (`WHERE access_status='active'`). Будущая оплата вернёт доступ (`paused_expired`,
  не `paused_manual`).

## Блок 2.1 — 1e ручная отметка оплаты: Анастасия Бондаренко ✅

Штатный эндпоинт `POST /api/billing/admin/mark-paid` (admin-JWT сминчен на сервере из
`GARDEN_JWT_SECRET`, `sub`=admin-профиль, exp+300s; реальный код-путь `applyPayment`).

- Запрос: `plan_code=1m, amount=2000, months=1, payment_date=2026-07-01, until_date=2026-08-01,
  note="прямой платёж, +79824143515, hinesta@mail.ru", idempotency_key=manual-anastasia-bondarenko-2026-07-01-1m`.
- **Ответ HTTP 200:** `{ok:true, order_id:"d8a57325-4d8f-4889-9140-dd33b3ac2fc9",
  paid_until:"2026-08-01T20:59:59Z" (=2026-08-01 23:59:59 MSK), access_status:"active"}`.
- Создана строка `payment_orders(provider='manual', status='paid')` + upsert `subscriptions` (аудит).
  Идемпотентно по `idempotency_key` (повторный вызов → `duplicate:true`).

## Блок 2.2 — Анастасия: telegram + telegram_user_id ✅

Один ssh: dry → COMMIT. Guard коллизии uid прошёл.

| Поле | Было | Стало |
|---|---|---|
| `telegram` | (пусто) | **@hi_nes_ta** |
| `telegram_user_id` | NULL | **555066210** (точный @hi_nes_ta-матч, recon 224) |
| `paid_until` | — | 2026-08-01 23:59:59 (из 2.1) |
| `access_status` | active | active |

Побочно (ожидаемо): смена `telegram` синкнула `events.host_telegram` её будущих встреч (триггер phase22).

---

## Заминка и как поймали
Первый прогон: Блок 1 применился штатно (COMMIT), mark-paid — HTTP 200. **Блок 2.2 упал на
DRY-RUN** — в `RAISE EXCEPTION` был лишний параметр без `%`-плейсхолдера
(`'…занят' , n`). `ON_ERROR_STOP` → dry вышел с ошибкой → `&&` НЕ пустил в COMMIT →
**в проде по 2.2 ничего не применилось** (страховка сработала как задумано). Поправил формат
(`'…(%)', n`), перезапустил только Блок 2.2 — dry чистый → COMMIT. mark-paid идемпотентен,
повторно не дёргал.

## Итог покрытия
`telegram_user_id` по платящим ролям Лиги: **22 → 23** (+Анастасия). 4 стажёра переведены в
`paused_expired` (их `telegram_user_id` по-прежнему NULL — в чате их нет, enforcement не нужен).

## Не делал (вне скоупа)
Остальные аномалии B2 (Соковнина и др.), «10 без профиля» (C), оцифровка бартера — не трогал.
Дизайн-лесенки нет.

**Оба блока применены и проверены пост-коммит выборками.**
