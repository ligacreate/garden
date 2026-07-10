# DIFF-on-review — Фаза 3: поллер матч по @username + бэкфилл uid (НЕ активировано)

**Дата:** 2026-07-10
**Автор:** codeexec (VS Code)
**Статус:** 🔴 правка в рабочем дереве, НЕ задеплоена, НЕ активирована. `node --check` + runtime-import OK.
**Файл:** [`push-server/tgAccessJoinPoller.mjs`](../../push-server/tgAccessJoinPoller.mjs).

## Что меняется
На `chat_join_request`:
1. **Матч по `from.id` ИЛИ `from.username` = `profiles.telegram`** (case-insensitive, точное). Нормализация хендла:
   снять `https://t.me/`/`telegram.me/`/`www.`/`@` и хвостовой `/`.
2. Найден И (`paid_until >= now` OR `auto_pause_exempt`) И не `paused_manual` → `approveChatJoinRequest`.
3. **username-матч + пустой `telegram_user_id`** → бэкфилл `telegram_user_id = from.id`
   (guard: uid не занят другим профилем; `WHERE telegram_user_id IS NULL`).
4. Не найден / не оплачен / нет username → **pending** (заявка висит), в лог (journal). В `tg_access_actions`
   пишем только approve (`admit_approve`); skip остаётся в journal (нет skip-экшена в CHECK — намеренно).
Идемпотентность approve — как была (dedup по эпизоду).

Зачем: непривязанные (нет `telegram_user_id`), но оплатившие, теперь авто-впускаются по @username, и заодно
им проставляется числовой id — дальше действуют штатно.

## ✅ Кик НЕ активируется (подтверждение)
- `startJoinPoller` вызывает ТОЛЬКО `approveChatJoinRequest` (+ backfill UPDATE). Kick-методов не касается.
- `executeActions(filter='kick')` (единственный путь кика) зовётся лишь при `mode==='live' && autoKick`
  (reconcile) или через `POST /api/tg-access/confirm-kicks` (ручной, requireAdmin).
- Активируем `mode=admit` (НЕ live), `AUTOKICK` не ставим → KICK только планируется (`status='planned'`),
  не исполняется. Авто-кика нет.

## План активации (СЛЕДУЮЩИЙ шаг, по твоему 🟢)
1. rsync обновлённого `tgAccessJoinPoller.mjs` (+ commit).
2. Новый `TG_ACCESS_BOT_TOKEN` (после твоего `/revoke`) → в `/opt/push-server/.env` (не переписывая остальное).
3. `TG_ACCESS_MODE=admit` в `.env`. `AUTOKICK` НЕ трогаем.
4. restart → smoke: лог `tg-access[admit]`, поллер стартовал; `mode=admit` reconcile создаст `admit_invite`-ссылки
   для Соковниной/Бочкарёвой/Титовой (заберу из `tg_access_actions.invite_link` → тебе на пересылку), KICK — `planned`.
5. Включить «Заявки на вступление» на инвайт-ссылках канала/чата (не трогая живые TH-ссылки) → первые заявки авто-одобрятся.

## Фронт (отдельно, окно 403)
В «Моя подписка» — 2 кнопки: **Вступить в канал** `https://t.me/+dVRWs_cl2VA3OTVi`, **Вступить в чат** `https://t.me/+GH0sjSaUzOc2N2Zi`. Это фронт-правка `ProfileView`, уйдёт в общий фронт-батч следующего окна 403 (не этот шаг).

**Правка на ревью. Активацию (rsync+токен+mode=admit+restart) делаю по твоему 🟢. Кик остаётся gated.**
