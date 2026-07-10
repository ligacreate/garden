# DEPLOY — Фаза 3: код live-ступени задеплоен (mode=off) ✅

**Дата:** 2026-07-10
**Автор:** codeexec (VS Code)
**Статус:** ✅ код на проде, `TG_ACCESS_MODE=off` → неактивен (поведение сервиса не изменилось).
**Коммит:** `8dc3f2d`. **Дифф:** [`_session/240`](2026-07-10_240_codeexec_phase3_live_impl_diff.md).

## Что сделано
- commit 6 файлов push-server (`8dc3f2d`) → **rsync** в `/opt/push-server/` (только эти 6, `.env`/тесты не трогали).
- **restart** `push-server.service`.

## Smoke ✅
- `systemctl is-active` = **active**.
- Лог старта: `Server started on :8787 (push=off, prodamus=on, bothunter=on, checkout[...], **tg-access[off]**)` — модуль загружен, неактивен.
- `GET /health` → **200**.
- `POST /api/tg-access/run` → **401**, `GET /api/tg-access/planned` → **401** (эндпоинты зарегистрированы, `requireAdmin` гейтит — не 404).
- prodamus/bothunter вебхуки, checkout — без изменений.

## Состояние лесенки
- [x] Шаг 1 — миграция phase46.
- [x] **Шаг 2 — деплой кода + restart (mode=off).** ← эта запись.
- [ ] **Шаг 3 — pre-flight (ручное, Оля):** `/revoke` старого токена в @BotFather → новый токен в `/opt/push-server/.env` как `TG_ACCESS_BOT_TOKEN` (я вставлю по твоему сигналу, не переписывая остальной .env) + включить «Заявки на вступление» на инвайт-ссылках канала и чата (НЕ трогая живые TH-ссылки).
- [ ] Шаг 4 — `mode=admit` (grace) → выключить TH-kick → `mode=live` + confirm первого KICK-батча (Шилова+Габрух) → `AUTOKICK=1`.

**Код живой и спит. Активация — только через env (шаг 3-4), пошагово с твоим 🟢. Перед `mode=live` остановлюсь и покажу список.**
