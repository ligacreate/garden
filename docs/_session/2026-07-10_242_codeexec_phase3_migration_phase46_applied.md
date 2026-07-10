# APPLY — Фаза 3: миграция phase46 `tg_access_actions` ✅

**Дата:** 2026-07-10
**Автор:** codeexec (VS Code)
**Статус:** ✅ ПРИМЕНЕНО на проде (как gen_user, один ssh, идемпотентно).
**Дифф:** [`_session/241`](2026-07-10_241_codeexec_phase3_migration_phase46_diff.md).

## Результат
`CREATE TABLE / CREATE INDEX ×2 / COMMENT / REVOKE / COMMIT` — без ошибок. VERIFY:
- **V1** — `to_regclass='tg_access_actions'`, `idx_cnt=2` (uq_dedup + ix_planned) ✓
- **V2** — 3 CHECK'а: action(kick|admit_invite|admit_approve|unban), resource(channel|chat), status(planned|executed|failed|skipped) ✓
- **V3** — гранты **только `gen_user`** (владелец); authenticated/web_anon — нет ✓ (owner-only PII, как задумано)
- **V4** — dedup-smoke: второй `executed` с тем же `dedup_key` → `unique_violation`, «V4 OK», тестовые строки откатились ✓

`ensure_garden_grants()` не трогали (owner-права ACL-wipe не снимает). Данные в таблице: 0 строк.

## Состояние деплойной лесенки
- [x] **Шаг 1 — миграция phase46** (эта запись).
- [ ] Шаг 2 — commit кода (`_session/240`) + rsync 6 файлов push-server + **restart** (env `TG_ACCESS_MODE=off` → поведение не меняется, сервис как был).
- [ ] Шаг 3 — pre-flight: `TG_ACCESS_BOT_TOKEN` в `.env` + `/revoke` Оли; join-request на ссылках ресурсов.
- [ ] Шаг 4 — `mode=admit` (grace-окно) → выключить TH-kick → `mode=live` + confirm первого KICK-батча → `AUTOKICK=1`.

**Миграция закрыта. Дальше — шаг 2 (деплой кода + restart) по твоему 🟢.**
