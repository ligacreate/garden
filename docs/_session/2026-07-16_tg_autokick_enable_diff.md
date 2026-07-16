# Diff на ревью — включение TG авто-кика (push-server)

**Дата:** 2026-07-16
**Запрос:** `TG_ACCESS_AUTOKICK=0 → 1` в `/opt/push-server/.env`, рестарт
`push-server.service`. Стартовый reconcile исполнит кики (kickRecheck).

## Изменение (прод-only, .env НЕ в git/rsync)

```diff
# /opt/push-server/.env
-TG_ACCESS_AUTOKICK=0
+TG_ACCESS_AUTOKICK=1
```
+ `systemctl restart push-server.service`

Прочие env не трогаю. `TG_ACCESS_MODE=live` уже стоит (autokick без live —
no-op, см. reconcile:124 `if (mode==='live' && autoKick)`).

## Recon перед применением (read-only, прод)

- `TG_ACCESS_MODE=live`, `TG_ACCESS_AUTOKICK=0`, токен задан, сервис active
  (последний старт 2026-07-13).
- Grace = 3 дня (дефолт).
- **[B] Живых кандидатов на кик по правилам reconcile (истёк > grace, не
  exempt/manual, paid_until задан): 0.**
- **[A] Накопленный backlog planned-киков: ровно 1 человек** —
  «Шилова Мария» (uid 292090432, leader), 2 строки (channel+chat), batch
  `tgacc-2026-07-10T0544`, snapshot paid_until на момент плана = 2026-05-05.
  **НО живой `paid_until` = 2026-08-11 (active) — она с тех пор оплатила.**
- [C] История киков: 2 planned, 0 executed. Ни одного кика ещё не исполнено.

## Что реально сделает первый авто-прогон

**Никого не кикнет (0 executed).** Причины (двойная защита):

1. `executeActions(filter:'kick', batchId: <новый батч>)` исполняет только
   кики ИЗ ТЕКУЩЕГО батча. Recompute kick[] на живых данных = 0 кандидатов →
   новый батч пустой. Старые planned-кики Марии в батче `...07-10T0544` под
   фильтр нового батча не попадают → не трогаются.
2. Даже если бы попали — `kickRecheck` вернёт `paid_or_grace` (живой
   paid_until 2026-08-11 ≥ grace-cutoff) → skip, НЕ кик.

Итог: авто-кик безопасно вооружается на будущие ночные прогоны; сейчас
удалять некого. Единственный «висящий» kick (Мария) — оплативший участник,
корректно защищён.

## Открытый вопрос для Оли

Backlog-строки Марии (2 planned) останутся в таблице как cruft (безвредны:
autokick старые батчи не исполняет; confirm-kicks их бы заскипал). Чистить
их (пометить skipped) — отдельным действием, если хочешь. По умолчанию не
трогаю.

## План применения после 🟢
1. `sed -i` AUTOKICK 0→1 в прод `.env` (бэкап рядом).
2. `systemctl restart push-server.service`, verify active + `journalctl`
   строка `[tg-access live] {... "executed_kick":N}` + `tg-access[...,autokick]`.
3. Сверка БД: executed-кики этого прогона (ожидаю 0), отчёт с именами/paid_until.

## ПРИМЕНЕНО 2026-07-16 (оба 🟢)

- Бэкап `.env` → `/opt/push-server/.env.bak-2026-07-16`; `AUTOKICK 0→1`.
- Шилова Мария: 2 planned-kick (id 8 channel, id 9 chat) → **skipped**
  (executed_at 14:15 MSK, `tg_response.manual_skip=paid_active,paid_until=2026-08-11`).
- Рестарт, сервис **active**. Стартовая строка:
  `Server started ... tg-access[live,autokick]` — авто-кик **вооружён**.
- Стартовый reconcile: `{"known":35,"kick":0,"admit":2,"skip_exempt":4,
  "skip_manual":0,"skip_unknown_paid":0,"skip_grace":6,"errors":2,
  "executed_admit":0,"executed_kick":0}` → **кикнуто 0**.
- kick-таблица: только 2 `skipped` (Шилова), 0 executed/failed/planned.
  Нового батча с киками за сегодня нет.
- Побочно (не по задаче, на заметку): `skip_grace=6` — истекли, но в grace
  (кандидаты на кик след. ночами, если не оплатят); `admit=2, executed_admit=0`
  (dedup — инвайты уже разосланы ранее); `errors=2` — getChatMember-ошибки
  (как и в прошлых прогонах; вероятно бот не видит юзера/тот заблокировал).
