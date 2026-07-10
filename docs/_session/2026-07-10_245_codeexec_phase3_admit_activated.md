# ACTIVATION — Фаза 3: mode=admit включён, поллер запущен ✅ (KICK gated)

**Дата:** 2026-07-10
**Автор:** codeexec (VS Code)
**Статус:** ✅ `TG_ACCESS_MODE=admit`, поллер работает, ADMIT исполняется, **KICK — planned/gated** (не live).
**Токен:** existing (Оля решила НЕ делать /revoke) — из temp-файла в `/opt/push-server/.env`.

## Что сделано
- rsync `tgAccessJoinPoller.mjs` (commit `30e4e3f`).
- В `/opt/push-server/.env` (append, без перезаписи): `TG_ACCESS_BOT_TOKEN=<existing>` + `TG_ACCESS_MODE=admit`.
- restart push-server.

## Smoke ✅
- лог: `[join-poller] старт (allowed_updates=chat_join_request)` + `Server started … tg-access[admit]`; `is-active`=active.
- `GET /health` → 200.
- `tg_access_actions`: **admit_invite=5 executed, kick=2 planned** → ADMIT сработал, **KICK НЕ исполнен** (gated). ✓

## Ответ по Габрух (проверено)
`telegram_user_id=240614513` поллер **НЕ** ставил: `tg_access_actions`=0 approves (поллер до этого не работал).
Её uid привязан ещё **2026-05-16** через FEAT-024 self-linking (`telegram_linked_at`). Из KICK она ушла,
т.к. **оплатила** (`paid_until=2026-08-10`, active) — обычный Prodamus-вебхук. → авто-впуск поллером на реальном
человеке **пока не демонстрировался**; это проверим на первой живой заявке уже при работающем поллере.

## ADMIT — персональные одноразовые инвайты (тебе на пересылку)
Ссылки `member_limit=1`, живут 7 дней. Разошли каждому именно его:

| Кому | Канал | Чат |
|---|---|---|
| **Елена Соковнина** (leader, до 08-06) | `https://t.me/+pDTDkZ5bzYw1NTAy` | `https://t.me/+gZcVlDLJo5EzNGU6` |
| **Мария Бочкарёва** (intern, до 07-27) | `https://t.me/+ZeOAz-JKOwVjZDAy` | — (уже в чате) |
| **Дарья Старостина** (intern, до 07-30) | `https://t.me/+Ee2r6A4zcNEwY2Yy` | `https://t.me/+UOiuVwZxn7VmNjIy` |

**Про изменения состава (не сюрприз, а свежие данные):**
- **Старостина** попала в ADMIT, потому что её роль теперь `intern` (повышена с applicant), есть `telegram_user_id=376007549`
  и оплата (07-30) — легитимный оплаченный, но не в каналах. (uid ей проставил не поллер — он появился раньше запуска.)
- **Титова** из ADMIT ушла — она теперь в **обоих** ресурсах (вступила в чат), впуск не нужен.

## KICK — только Шилова, planned (gated) ✅
`kick planned`: Шилова Мария (канал+чат). Габрух ушла (оплатила). **Ничего не исполнено** — ждёт `mode=live` + confirm.

## Дальше
- Ты рассылаешь 5 инвайтов; включаешь «Заявки на вступление» на общих ссылках ресурсов → поллер начнёт авто-approve заявок оплаченных (тогда и увидим авто-впуск на живом человеке).
- Когда впуск подтверждён на практике → шаг 4: выключаешь TH-kick → `mode=live` + `confirm-kicks` по батчу Шиловой → `AUTOKICK=1`. Перед этим покажу финальный KICK-список.

**mode=admit активен. KICK gated. Ничего не кикнуто.**
