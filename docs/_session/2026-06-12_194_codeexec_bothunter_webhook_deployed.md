# Деплой-отчёт — BotHunter webhook (FEAT-015) на прод

**Дата:** 2026-06-12. **Автор:** codeexec. **Статус:** ✅ задеплоено и проверено на проде.
**Diff на ревью:** `docs/_session/2026-06-12_193_codeexec_bothunter_webhook_diff.md` (🟢 от стратега).
**Commit:** `7622088` (`feat(push-server): BotHunter webhook receiver for subscription auto-pause`).

## Что выкачено
- `/opt/push-server/.env` — добавлена строка `BOTHUNTER_WEBHOOK_TOKEN=…` (append, не перезапись).
- rsync `push-server/` → `/opt/push-server/` (exclude: node_modules, *.test.mjs, .env, package-lock.json).
- `systemctl restart push-server.service` → active; в логе `Server started on :8787 (push=off, prodamus=on, bothunter=on)`.

## Smoke с прода (https://push.skrebeyko.ru/webhooks/bothunter)

| # | Запрос | Ожидание | Факт |
|---|---|---|---|
| a | неверный токен | 401/403 | **403** `{"error":"Forbidden"}` (лог-строка не создаётся — выход до persist) |
| b | `olgapogranitskaya` / `expired` | 200 processed:true, профиль остаётся paused_manual, строка provider='bothunter' | **200** `processed:true,event:finish`; access_status **остался `paused_manual`**, subscription_status → `finished`; лог `bothunter/finish` `is_processed=t` |
| c | `nonexistent_user_xyz` / `expired` | 202 processed:false | **202** `processed:false, reason:profile_not_found`; лог `bothunter/finish` `is_processed=f` `error_text='Profile not found (replayable)'` |
| d | инвайт `https://t.me/+AbCdEf123` | 422 | **422** `invalid_username` |
| e | повтор (b) тот же день | идемпотентность | **200** `duplicate:true` (paid_until/статус не двигаются дважды) |

### Прод-БД после smoke (профиль Пограницкой `f8ba746a-…`)
```
access_status | subscription_status | last_prodamus_event
paused_manual | finished            | finish
```
Приоритет ручной паузы сохранён: вебхук `finish` записал `subscription_status='finished'`, но `access_status` остался `paused_manual` (как и требовалось).

### Цепочка блокировки (подтверждено стратегом в прод-БД)
Триггер `trg_sync_status_from_access_status` сам синкает старое поле `status` при апдейте `access_status`; garden-auth гейтит вход по `status`. Цепочка вебхук → access_status → триггер → блокировка входа сходится. Отдельный синк `status` в коде не нужен.

## Для блока «Запрос во вне» BotHunter
- **URL:** `https://push.skrebeyko.ru/webhooks/bothunter?token=e9c83ef459ee2af61207e6d2f31f64eda4bcb15f37b8ede984c9221c077f857e` (POST)
- цепочка окончания → тело `{ "username": "{username}", "event": "expired" }`
- цепочка возобновления → тело `{ "username": "{username}", "event": "active" }`
- `{username}` — подставить переменную BotHunter (@username/user_link; нормализатор примет любой из форматов).

## Осталось (вне кода — на стороне BotHunter, делает Ольга/настройщик)
Вставить URL+тело в блоки «Запрос во вне» обеих цепочек на ЖИВОМ боте, прогнать тест на одном пользователе. ⚠️ Бот управляет доступом в каналы — точечно, через настройщика.
</content>
