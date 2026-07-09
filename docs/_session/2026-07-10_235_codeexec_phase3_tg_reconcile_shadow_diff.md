# DIFF-on-review — Фаза 3: reconcile-логика бота + shadow (код, НЕ задеплоен, НЕ запущен)

**Дата:** 2026-07-10
**Автор:** codeexec (VS Code)
**Статус:** 🔴 код в рабочем дереве, НЕ закоммичен/НЕ задеплоен/НЕ запущен. Жду 🟢.
**Порядок:** этот diff → 🟢 → commit+rsync → **shadow-прогон** → отчёт (`_session/236`). Ни одного мутирующего TG-вызова. TargetHunter не трогаю.

---

## Новые файлы (3, только в `push-server/`, в Express/nightly НЕ подключены)

### 1. [`push-server/tgAccessClient.mjs`](../../push-server/tgAccessClient.mjs) — TG Bot API клиент
- **Только read-методы:** `getMe`, `getChat`, `getChatMember`. **Мутирующих (ban/kick/invite/approve)
  физически НЕТ** — придут отдельным диффом на этапе live. → shadow не может ничего изменить даже по багу.
- Токен `TG_ACCESS_BOT_TOKEN` (@ligagardenbot). Первый исходящий TG в push-server.
- `isInChat(res)` — present = creator/administrator/member (restricted → только если `is_member`); left/kicked → нет.

### 2. [`push-server/tgAccessReconcile.mjs`](../../push-server/tgAccessReconcile.mjs) — ядро `runTgAccessReconcile({mode})`
Хард-правила зашиты (default-safe):
- **Скоуп «известные»:** `role ∈ (intern,leader,mentor)` И `telegram_user_id IS NOT NULL`.
- **KICK** = известный + `paid_until < now` + **реально в ресурсе** (getChatMember) + НЕ exempt + НЕ paused_manual.
- **ADMIT** = `paid_until >= now` + **НЕ в ресурсе** (должен быть, но нет — напр. Соковнина) + НЕ exempt/paused_manual-исключения.
- **SKIP всегда:** `paid_until IS NULL` (не считаем истёкшим), `auto_pause_exempt`, `paused_manual`,
  и **любой uid без профиля** (незнакомец) — «не трогать никогда».
- **Оба ресурса** (канал `-1002377682177` + чат `-1002432957741`), решение НА КАЖДЫЙ отдельно
  (можно быть в чате, но не в канале → кик/впуск точечно).
- `mode='shadow'` → только считает и возвращает списки; `mode='live'` → **бросает ошибку** (не готово).
- «Незнакомцы в чате без профиля» берутся из снимка Telethon (`roster_phase3.json`) — Bot API их не перечислит;
  сверяем roster.members против множества ВСЕХ привязанных `telegram_user_id` (любая роль).

Возвращает: `{counts, kick[], admit[], skip_exempt[], skip_manual[], skip_unknown_paid[], skip_unknown_members[], errors[], membership[]}`.

### 3. [`push-server/tgAccessShadow.mjs`](../../push-server/tgAccessShadow.mjs) — standalone-раннер
- НЕ подключён к Express/nightly. Строит `pg.Pool` из `DATABASE_URL`, клиент из `TG_ACCESS_BOT_TOKEN`,
  читает roster-json аргументом. Печатает человекочитаемый отчёт + JSON. Только чтение.

## Что НЕ трогаю
- `server.mjs`, nightly `setInterval`, `runNightlyExpiryReconcile`, вебхуки — **без изменений** (нулевой риск для живого сервиса).
- Прод `/opt/push-server/.env` — не переписываю. `TG_ACCESS_BOT_TOKEN` в него кладём **на этапе live** (+ `/revoke` Оли).
  Для shadow токен подставлю из временного файла как env одной командой (не пишу в `.env`).

## Как пройдёт shadow-прогон (после 🟢, следующий шаг — НЕ сейчас)
1. commit + rsync 3 файлов на `/opt/push-server/` (тесты/`.env` в exclude, сервис НЕ рестартим — файлы не подключены).
2. scp `roster_phase3.json` на сервер (снимок состава).
3. `set -a; . /opt/push-server/.env; set +a; TG_ACCESS_BOT_TOKEN=<из tmp> node /opt/push-server/tgAccessShadow.mjs <roster.json>`
   → ~2×(число известных) вызовов `getChatMember` (read). Ноль мутаций.
4. Вывод → форматирую в отчёт `_session/236`: **KICK / ADMIT / SKIP-unknown / сверка**.

## Ожидание по сверке (чтобы поймать сюрпризы заранее)
- **KICK** должен содержать только законных должников, реально сидящих в ресурсе: кандидаты — те, кого
  TargetHunter ещё НЕ убрал (большинство истёкших он уже исключил → их getChatMember=left → не в KICK).
  Соковнина в KICK попасть **не может** (она оплачена). Платящих в KICK быть **не должно** — это критерий успеха.
- **ADMIT** — оплаченные, кого нет в чате: ожидаем Соковнину (leader, до 08-06, не в ростере) и, возможно, вернувшихся.
- **SKIP-unknown** — Тютюнник `@businka_777`, боты, ассистенты, платящие-без-профиля. Их бот не трогает.

## Ревью-чеклист (на что смотреть)
- [ ] read-only клиент: точно нет мутирующих методов.
- [ ] KICK-условие содержит ВСЕ 5 предикатов (известный+в ресурсе+истёк+не exempt+не manual).
- [ ] `paid_until IS NULL` → skip (не кик).
- [ ] unknown (нет профиля) → никогда не трогать.
- [ ] `mode='live'` кидает ошибку (не может случайно замутировать).
- [ ] решение на канал и чат раздельно.

**Код в рабочем дереве. Commit/rsync/shadow-run — только после 🟢.**
