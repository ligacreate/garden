# IMPL-DIFF — Фаза 3 live-ступень TG-доступа (код на ревью, НЕ задеплоен)

**Дата:** 2026-07-10
**Автор:** codeexec (VS Code)
**Статус:** 🔴 код в рабочем дереве, НЕ закоммичен/НЕ задеплоен/НЕ применён. Все 5 файлов `node --check` OK.
**Дизайн:** [`_session/239`](2026-07-10_239_codeexec_phase3_live_step_design.md) (🟢 одобрен).
**Гейт:** `TG_ACCESS_MODE=off` по умолчанию → полный no-op. Без токена модуль спит.

---

## Изменения (uncommitted)
| Файл | | Что |
|---|---|---|
| `push-server/tgAccessClient.mjs` | M | + мутирующие методы (ban/unban/approve/decline/createInviteLink) + `kickChatMember`=ban+unban + `getUpdates` |
| `push-server/tgAccessActions.mjs` | **new** | `dedupKey`, `upsertPlanned`, `executeActions` (единственная точка мутаций) |
| `push-server/tgAccessReconcile.mjs` | M | live-режим: материализация плана + исполнение ADMIT + gated KICK |
| `push-server/tgAccessJoinPoller.mjs` | **new** | long-poll `chat_join_request` → авто-approve известного оплаченного |
| `push-server/server.mjs` | M (+60/-2) | env-переменные, nightly-подключение, poller-старт, 3 admin-эндпоинта, лог |
| `database/pvl/migrations/2026-07-10_phase46_tg_access_actions.sql` | **new** | таблица идемпотентности + индексы + VERIFY |

## Ключевая логика (как ревьюить)
- **Мутации — только через `executeActions`.** В `shadow` он не вызывается вообще (reconcile выходит до материализации). → mode=off/shadow физически не мутирует.
- **kick = ban+unban** (`tgAccessClient.kickChatMember`) — удалить, но не blacklist.
- **Идемпотентность** (`tgAccessActions`): `dedup_key = action:uid:resource:paid_until-эпизод`; unique-индекс `WHERE status='executed'`. Оплатил заново → новый эпизод → снова можно; дважды в эпизоде — нельзя. Перед каждым вызовом TG — повторная проверка «нет executed dedup».
- **Reconcile live** (`tgAccessReconcile`): считает как в shadow → пишет `admit_invite`+`kick` в план (`status='planned'`, общий `batch_id`) → **ADMIT исполняет сразу** (admit и live) → **KICK исполняет ТОЛЬКО `mode==='live' && autoKick`** (иначе planned ждёт confirm).
- **ADMIT = персональная одноразовая инвайт-ссылка** (`createChatInviteLink member_limit=1, expire 7д`) — «executed» = ссылка сгенерирована и записана в `invite_link`; **Оля пересылает**. Фактический вход — когда перейдут (или через approve-poller). TH-ссылки не трогаем.
- **Poller** (`tgAccessJoinPoller`): `getUpdates(allowed_updates:['chat_join_request'])` → для заявителя ищет профиль по `telegram_user_id`; approve, если `exempt` или `paid_until>=now` и не `paused_manual`; иначе заявка висит (в лог). Стартует только при admit/live.
- **server.mjs:** `runTgAccess()` в nightly (gated), poller-старт (gated), эндпоинты (`requireAdmin`):
  - `POST /api/tg-access/run?mode=…` — ручной прогон; **`autoKick:false` жёстко** → ADMIT да, KICK только в план.
  - `GET /api/tg-access/planned?batch_id=…` — плановый KICK-батч на глаза Оле.
  - `POST /api/tg-access/confirm-kicks {batch_id}` — исполнить KICK конкретного батча (первый боевой).

## Инвариант «без двойного кика» (как реализован)
KICK исполняется только (а) в nightly при `mode=live && TG_ACCESS_AUTOKICK=1`, либо (б) через `confirm-kicks`.
`mode=live`/`AUTOKICK` выставляются РУКАМИ в env **после** выключения TH-kick. Пока `off/shadow/admit` — KICK не исполняется никогда (только план). Оверлапа нет.

## Порядок деплоя (ПОСЛЕ 🟢 кода — отдельным шагом, НЕ сейчас)
1. **Миграция phase46** (diff-review отдельно): при apply — прочитать тело `ensure_garden_grants()` и **вложить GRANT'ы** таблицы (иначе daily ACL-wipe снимет). Applied → VERIFY V1-V2.
2. `git commit` кода + **rsync** (3 M + 2 new .mjs) → `/opt/push-server/`.
3. **⚠ Рестарт push-server** (server.mjs изменён — в отличие от shadow). Env всё ещё `TG_ACCESS_MODE=off` → поведение не меняется, сервис как был. Проверить `tg-access[no-token]`/`[off]` в логе + `/health` 200.
4. Прогонять по лесенке: `TG_ACCESS_BOT_TOKEN` в .env (+ `/revoke`) → `mode=admit` (grace-окно: 3 именных инвайта + первые авто-approve) → выключить TH-kick → `mode=live` + `confirm-kicks` первого батча (Шилова+Габрух) → `AUTOKICK=1`.

## Verify-план (на этапе admit, не сейчас)
- `run?mode=shadow` через эндпоинт == текущий shadow-отчёт (регресс).
- `run?mode=admit` → в `tg_access_actions` появились `admit_invite` (executed, с invite_link) для Соковниной(×2)/Бочкарёвой/Титовой; KICK — planned, НЕ executed.
- `getUpdates`-poller: тестовая заявка от оплаченного → approve; от неизвестного → висит.
- `confirm-kicks` на тест-батч → только этот батч executed.

## НЕ сделал (осознанно)
- Не коммитил/не деплоил/не применял миграцию/не запускал. `mode=off`.
- Токен в `.env`, `/revoke`, включение join-request на ссылках ресурсов — **pre-flight перед admit**, отдельно.
- Persist offset поллера — сейчас in-memory (на рестарте getUpdates подхватит свежие; приемлемо, отметил).

## Ревью-чеклист
- [ ] мутации только в `executeActions`; shadow туда не заходит.
- [ ] KICK не исполняется вне `live+autoKick`/`confirm-kicks`.
- [ ] dedup: повтор в одном эпизоде оплаты блокируется.
- [ ] poller approve-условие (exempt/paid, не manual, не unknown).
- [ ] эндпоинты под `requireAdmin`; ручной run не авто-кикает.
- [ ] `mode=off` / нет токена → no-op (сервис не меняет поведение).

**Код на ревью. После 🟢 — миграция (diff), затем commit+rsync+restart, дальше лесенка admit→live.**
