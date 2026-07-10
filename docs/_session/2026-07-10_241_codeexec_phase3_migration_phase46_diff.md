# MIGRATION-DIFF — Фаза 3: `tg_access_actions` (phase46), на ревью, НЕ применена

**Дата:** 2026-07-10
**Автор:** codeexec (VS Code)
**Статус:** 🔴 миграция в рабочем дереве, НЕ применена. Ждёт 🟢 → apply (первый шаг деплойной лесенки).
**Файл:** [`database/pvl/migrations/2026-07-10_phase46_tg_access_actions.sql`](../../database/pvl/migrations/2026-07-10_phase46_tg_access_actions.sql)
**Код (одобрен):** [`_session/240`](2026-07-10_240_codeexec_phase3_live_impl_diff.md).

---

## Что создаёт
Таблицу `public.tg_access_actions` — журнал действий доступа (kick/admit_invite/admit_approve/unban) + идемпотентность:
- **PK** `id` (identity), `profile_id`→profiles, `telegram_user_id`, `resource`(channel|chat), `action`, `reason`,
  `paid_until_snap`, `status`(planned|executed|failed|skipped), `dedup_key`, `invite_link`, `tg_response`, `batch_id`, времена.
- **uq_tg_access_actions_dedup** — UNIQUE(`dedup_key`) `WHERE status='executed'` → одно исполненное действие на эпизод оплаты.
- **ix_tg_access_actions_planned** — (`status`,`batch_id`) `WHERE status='planned'` → быстрый разбор батча для confirm.

## Модель доступа — проверено на проде (важно)
- push-server коннектится как **`gen_user` = ВЛАДЕЛЕЦ** всех `public.*`. Владелец имеет полный доступ и
  **не затрагивается daily ACL-wipe** Timeweb (тот снимает гранты только у `authenticated`/`web_anon`).
- Таблица серверная, **PII** (`telegram_user_id`), **НЕ PostgREST-facing** → грантов `authenticated`/`web_anon` НЕТ,
  **в `ensure_garden_grants()` НЕ добавляем** (там только authenticated/web_anon-таблицы).
- Образец — `public.tg_notifications_queue`: тоже owner-only (гранты только gen_user), тоже вне `ensure_garden_grants`. Сверено.

→ Ранний черновик содержал TODO «вложить GRANT в ensure_garden_grants» — **снято**: для owner-only таблицы это не нужно и было бы ошибкой (дало бы authenticated лишний доступ к PII).

## VERIFY (в файле)
- **V1** — таблица + 2 частичных индекса (idx_cnt=2).
- **V2** — CHECK'и resource/action/status.
- **V3** — гранты ТОЛЬКО `gen_user` (нет authenticated/web_anon).
- **V4** — dedup-smoke в откатываемой транзакции: второй `executed` с тем же `dedup_key` падает по unique → NOTICE «V4 OK», строки откатываются.

## План применения (после 🟢 миграции — это первый шаг деплоя)
```
ssh root@… 'set -a; . /opt/push-server/.env; set +a; psql "$DATABASE_URL" -f -' < phase46.sql
```
- Идёт как `gen_user` (владелец) — таблица получит правильного владельца.
- Идемпотентно (`IF NOT EXISTS`) — повторный прогон безопасен.
- Ждём V1 tbl≠NULL/idx=2, V3 только gen_user, V4 OK.

## После миграции (дальше по лесенке, отдельными шагами)
1. `git commit` кода (`_session/240`) + rsync 6 файлов push-server → `/opt/push-server/` + **restart** (server.mjs изменён; env всё ещё `TG_ACCESS_MODE=off` → поведение не меняется).
2. Pre-flight: `TG_ACCESS_BOT_TOKEN` в `.env` + твой `/revoke`; включить join-request на ссылках ресурсов.
3. `mode=admit` (grace-окно) → выключить TH-kick → `mode=live` + confirm первого KICK-батча → `AUTOKICK=1`.

**Миграция на ревью. Не применяю до 🟢.** Ничего в БД не менял (recon был read-only).
