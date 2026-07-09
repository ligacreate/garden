# ДИЗАЙН live-ступени TG-доступа + diff-on-review (НЕ применять)

**Дата:** 2026-07-10
**Автор:** codeexec (VS Code)
**Статус:** 🔴 дизайн + код на ревью. Ничего не задеплоено/не применено/не запущено.
**Основание:** shadow #2 [`_session/238`](2026-07-10_238_codeexec_phase3_shadow_final.md) (роутер подтверждён на проде).
**Инвариант:** **никакого окна, где кикают И TargetHunter, И новый бот.** Первый боевой KICK — только с явным подтверждением Оли.

---

## 0. Цели / не-цели
- **Цель:** довести reconcile до исполнения — ADMIT (впуск оплаченных) + KICK (удаление истёкших), идемпотентно, с аудитом, с чистым handoff от TargetHunter.
- **Не-цель сейчас:** отключать TargetHunter (это ручной шаг Оли в кабинете TH), ротация токена (отдельный pre-flight), автокик без первого подтверждения.

## 1. Машина режимов — единый гейт (source of truth)
`TG_ACCESS_MODE` (env, дефолт `off`):
| mode | reconcile | ADMIT | KICK |
|---|---|---|---|
| `off` | не запускается | — | — |
| `shadow` | считает+лог | ❌ (только план) | ❌ (только план) |
| `admit` | считает+лог | ✅ исполняет | ❌ (план, не исполняет) |
| `live` | считает+лог | ✅ | ✅ (но первый батч — через confirm) |

Плюс два подчинённых флага:
- `TG_ACCESS_AUTOKICK` (дефолт `false`) — разрешить исполнять KICK в nightly БЕЗ ручного подтверждения. Ставится в `true` **только после** первого успешного подтверждённого батча.
- Токен `TG_ACCESS_BOT_TOKEN` — если пуст, весь модуль спит (как сейчас в проде: его там нет).

**Почему единый env-гейт:** kill-switch в одном месте. Пока `off`/`shadow` — бот физически не может замутировать (в mode≠admit/live executor не вызывается).

## 2. 🔴 CUTOVER без двойного кика (крит)
Порядок строго последовательный, KICK нового включаем **после** выключения кика TH — оверлапа нет by construction:

```
Шаг A (сейчас→): mode=shadow.           TH: полный (add+kick).  Новый: только отчёт.
Шаг B (наблюдение): mode=admit.         TH: полный.             Новый: ТОЛЬКО ADMIT (впуск).
        └─ два «добавляющих» не конфликтуют (add идемпотентен). Новый НЕ кикает вообще.
        └─ гоняем N дней, сверяем: KICK-план нового == реальные удаления TH (расхождения → разбор).
Шаг C (handoff, human-sequenced):
    C1. Оля ВЫКЛЮЧАЕТ в кабинете TargetHunter цепочку «исключить из 2 чатов» (kill TH-kick).
    C2. Подтверждаем, что TH больше не кикает (наблюдаем сутки / Оля видит в TH, что автоматизация off).
    C3. mode=live + первый KICK-батч через CONFIRM (§4). TH-add можно оставить или выключить — не важно для кика.
```
**Инвариант держится тем, что KICK исполняется ТОЛЬКО при mode=live, а mode=live выставляется РУКАМИ после C1/C2.** Между C1 и C3 не кикает никто (TH-kick off, новый ещё не live). Никогда не кикают оба.

Доп. страховка (даже если руки перепутают порядок): executor идемпотентен (§3) и **никогда не кикает оплаченного/exempt/paused_manual/unknown** — то есть «двойной кик» в худшем случае = повторный ban уже удалённого (no-op), а не удаление лишнего.

## 3. Таблица идемпотентности действий (миграция — на ревью, не применена)
Каждое действие фиксируем; повторно то же действие для того же «эпизода оплаты» не делаем.

```sql
-- database/pvl/migrations/2026-07-XX_phaseXX_tg_access_actions.sql (ЧЕРНОВИК, не применять)
CREATE TABLE IF NOT EXISTS public.tg_access_actions (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id        uuid REFERENCES public.profiles(id),
  telegram_user_id  bigint NOT NULL,
  resource          text NOT NULL CHECK (resource IN ('channel','chat')),
  action            text NOT NULL CHECK (action IN ('kick','admit_invite','admit_approve','unban')),
  reason            text NOT NULL,                    -- 'expired' | 'paid_not_in_resource'
  paid_until_snap   timestamptz,                      -- снимок paid_until на момент решения (эпизод)
  status            text NOT NULL DEFAULT 'planned'   -- planned|executed|failed|skipped
                    CHECK (status IN ('planned','executed','failed','skipped')),
  dedup_key         text NOT NULL,                    -- action:uid:resource:paid_until_iso
  invite_link       text,                             -- для admit_invite
  tg_response       jsonb,
  batch_id          text,                             -- id прогона (для confirm первого батча)
  created_at        timestamptz NOT NULL DEFAULT now(),
  executed_at       timestamptz
);
-- идемпотентность: одно ИСПОЛНЕННОЕ действие на (action,uid,resource,эпизод)
CREATE UNIQUE INDEX IF NOT EXISTS uq_tg_access_actions_dedup
  ON public.tg_access_actions(dedup_key) WHERE status = 'executed';
CREATE INDEX IF NOT EXISTS ix_tg_access_actions_planned
  ON public.tg_access_actions(status, batch_id) WHERE status = 'planned';
-- В ensure_garden_grants() добавить GRANT'ы (owner-only, PII) — как для tg_notifications_queue.
```
`dedup_key = action:uid:resource:YYYY-MM-DD(paid_until)`. Оплатил заново → paid_until меняется → новый эпизод → можно снова кикнуть при следующем истечении. Один и тот же кик дважды в одном эпизоде — заблокирован unique-индексом (`WHERE status='executed'`).

## 4. Первый боевой KICK — через явное подтверждение
1. Reconcile в mode=live пишет KICK-решения в `tg_access_actions` со `status='planned'`, `batch_id=<ts>`.
2. **НЕ исполняет автоматически**, пока `TG_ACCESS_AUTOKICK=false`.
3. Оля видит список планового батча (endpoint/отчёт) → подтверждает конкретный `batch_id`.
4. Confirm-эндпоинт исполняет только этот батч: для каждого planned-kick → `kickChatMember` → `status=executed`/`failed` + `tg_response`.
5. После успешного первого батча — можно выставить `TG_ACCESS_AUTOKICK=true` (дальше nightly кикает сам, всё так же идемпотентно и только «известных истёкших»).

ADMIT в mode=admit/live исполняется сразу (низкий риск — впуск оплаченного не навредит), тоже логируется и идемпотентен.

## 5. Мутирующие методы клиента (diff к `tgAccessClient.mjs` — на ревью)
```js
// ДОБАВИТЬ в makeTgAccessClient (сейчас там только read). НЕ активны, пока mode≠admit/live.
banChatMember:   (chatId, userId) => tgGet(token, 'banChatMember',   { chat_id: chatId, user_id: userId }),
unbanChatMember: (chatId, userId) => tgGet(token, 'unbanChatMember', { chat_id: chatId, user_id: userId, only_if_banned: true }),
approveChatJoinRequest: (chatId, userId) => tgGet(token, 'approveChatJoinRequest', { chat_id: chatId, user_id: userId }),
createChatInviteLink:   (chatId, opts={}) => tgGet(token, 'createChatInviteLink', { chat_id: chatId, ...opts }),

// KICK = ban + сразу unban (удалить, но НЕ забанить навсегда — сможет вернуться при оплате):
async kickChatMember(chatId, userId) {
  const ban = await this.banChatMember(chatId, userId);
  if (!ban.ok) return { ok:false, step:'ban', ...ban };
  const unban = await this.unbanChatMember(chatId, userId); // снимаем бан, чтобы вернулась по оплате
  return { ok: unban.ok, ban, unban };
}
```
Kick-семантика для нас — «удалить с возможностью вернуться» (ban+unban), не blacklist. Для broadcast-канала banChatMember тоже удаляет подписчика.

## 6. ADMIT в broadcast-канал (force-add невозможен)
Бот не может добавить юзера в канал/чат насильно. Два механизма (оба логируем):
- **A) approve-on-request (основной, авто):** на инвайт-ссылках ресурсов включить «заявки на вступление» (`creates_join_request`). Бот слушает `chat_join_request` (getUpdates/webhook, `allowed_updates:['chat_join_request']`). Если uid заявителя = известный ОПЛАЧЕННЫЙ профиль → `approveChatJoinRequest`. Не оплачен/unknown → НЕ трогаем (в отчёт).
- **B) персональная инвайт-ссылка (проактивно, для «оплачен, но не в ресурсе и не подавал заявку»):** `createChatInviteLink(resource,{member_limit:1, expire_date, name:'liga-<uid>'})` → одноразовая ссылка → пишем в `tg_access_actions.invite_link` и **отдаём Оле на пересылку** (бот не может доставить в личку тем, кто его не запускал). Для наших трёх (Соковнина, Бочкарёва, Титова) — путь B: сгенерим по ссылке на нужный ресурс, Оля перешлёт; либо они вступят по общей ссылке → путь A авто-подтвердит.

> Примечание: `getUpdates` для approve-on-request конфликтует, если у бота уже есть вебхук; т.к. это НОВЫЙ бот `@ligagardenbot` без вебхука — используем long-poll `getUpdates` в отдельном воркере push-server (как `@garden_notifications_bot` в garden-auth). Спроектируем в импл-диффе.

## 7. `runTgAccessReconcile` live + executor (эскиз)
```
runTgAccessReconcile({ mode, pool, tg, now }):
  decisions = (как в shadow: known-профили × getChatMember × правила)   // roster НЕ нужен в live
  if mode == 'shadow': return decisions                                 // ничего не пишем
  // admit/live: материализуем план
  for d in decisions.admit:  upsertAction('admit_*', d, status='planned')
  for d in decisions.kick:   upsertAction('kick',    d, status='planned')
  // исполняем ADMIT сразу (admit и live)
  executeActions(filter=admit, tg, pool)
  // исполняем KICK только в live И только если AUTOKICK (иначе ждём confirm)
  if mode=='live' and TG_ACCESS_AUTOKICK: executeActions(filter=kick, tg, pool)
  return { ...decisions, batch_id }

executeActions(...):
  for a in planned actions of filter:
    if exists executed dedup_key: mark skipped; continue        // идемпотентность
    res = (a.action=='kick' ? tg.kickChatMember : approve/invite)(...)
    a.status = res.ok ? 'executed' : 'failed'; a.tg_response=res; a.executed_at=now
```
Все мутации идут ТОЛЬКО через executeActions, который смотрит на mode/флаги. В shadow executeActions не вызывается вовсе.

## 8. Подключение к nightly + ручной триггер
- **nightly:** рядом с `runNightlyExpiryReconcile` ([server.mjs:901](../../push-server/server.mjs)) добавить `runTgAccessReconcile({mode: process.env.TG_ACCESS_MODE || 'off'})`. При `off`/пустом токене — мгновенный no-op. Порядок: сначала expiry-reconcile (проставит paused_expired), потом tg-access (кикнет уже помеченных). Тем же pool.
- **Ручной триггер (admin):**
  - `POST /api/tg-access/run?mode=shadow|admit|live` (`requireAdmin`) → запускает reconcile, возвращает отчёт (для проверки перед/без nightly).
  - `GET  /api/tg-access/planned?batch_id=…` → список планового KICK-батча (для глаз Оли).
  - `POST /api/tg-access/confirm-kicks` body `{batch_id}` (`requireAdmin`) → исполняет KICK этого батча (шаг §4.3-4).
  Все под `requireAdmin` (уже есть, HS256).

## 9. Pre-flight перед ПЕРВЫМ боевым (отдельный шаг, НЕ сейчас)
- [ ] `TG_ACCESS_BOT_TOKEN` в `/opt/push-server/.env` (сейчас нет) + **`/revoke` старого токена Олей** (был засвечен в переписке) → новый токен сразу в .env, не в чат.
- [ ] Инвайт-ссылки ресурсов с «заявками на вступление» (для approve-on-request).
- [ ] `TG_ACCESS_MODE=admit`, наблюдение N дней (шаг B).
- [ ] Оля выключает TH-kick (шаг C1), подтверждаем (C2).
- [ ] `mode=live`, первый KICK-батч через confirm (Шилова+Габрух — текущий финальный список), проверяем.
- [ ] `TG_ACCESS_AUTOKICK=true` — авто-кик в nightly.

## 10. Открытые вопросы к Оле
1. Kick = ban+unban (вернётся по оплате) — ок? (Альтернатива — только ban, но тогда возврат руками.)
2. approve-on-request: включаем «заявки» на ссылках обоих ресурсов? (Нужно для авто-впуска.)
3. Доставка персональных инвайтов (Соковнина/Бочкарёва/Титова) — бот генерит ссылку, ты пересылаешь? Ок?
4. Наблюдательное окно admit-фазы — сколько дней?

## Что в этом диффе НЕ делаю
- Не создаю .mjs/миграцию на диске (чтобы не плодить непротестированный код) — весь код здесь как ревью-эскиз.
- Ничего не деплою/не применяю/не запускаю. Мутирующих вызовов ноль.

**Дизайн на ревью. После 🟢 — импл-дифф (реальные файлы client-методов + миграция + endpoints + nightly), тоже diff-on-review, тоже без авто-применения.**
