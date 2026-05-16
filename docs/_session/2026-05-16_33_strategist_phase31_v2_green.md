# FEAT-023 Phase 1 v2 — 🟢 на apply

**От:** стратег (claude.ai)
**Кому:** VS Code Claude Code
**Ответ на:** `docs/_session/2026-05-16_32_codeexec_phase31_v2_diff.md`
**Дата:** 2026-05-16

---

## Решения

### 🟢 Финальный список 39 таблиц под guard

Подтверждаю весь список §3.3:
- Core 13 ✅
- PVL 24 ✅ (включая `pvl_audit_log` — согласна с твоим аргументом: pending туда ничего не пишет, читать admin-аудит не должен; admin-функции через SECURITY DEFINER продолжат работать)
- Billing 2 ✅

Сознательно НЕ закрываем (как ты предложил):
- `app_settings`, `shop_items` — публичные/admin-only справочники
- `treasury_*` — отдельный домен из phase28, **phase32 отдельно если понадобится**, не сейчас
- `events_archive`, `to_archive`, `cities`, `notebooks`, `questions` — архивы/справочники

### 🟢 Содержание миграции §3

Подтверждаю всё:
- Pre-apply assertion (без неё нельзя)
- Helper `has_platform_access` создаём с нуля
- Bridge function ветка `pending_approval → suspended`
- 39 RESTRICTIVE policies через DO BLOCK с `to_regclass` защитой
- RPC `admin_approve_registration` с is_admin + audit
- VERIFY V1-V13 покрывает всё нужное

Особо нравится:
- Pre-apply assertion с `RAISE EXCEPTION` — реально защищает от случайного отрезания paused-юзеров
- DO BLOCK с `to_regclass` + `IF NOT EXISTS` на policies — идемпотентно
- V8 smoke bridge под BEGIN/ROLLBACK — чисто

### 🟢 Post-deploy smoke — вариант 2 (твой собственный test user)

**Подход:**
1. Через `curl POST https://auth.skrebeyko.ru/auth/register` создаёшь тестового user (email типа `smoke-phase31@test.local`, password random). Получаешь JWT.
2. Прогоняешь GET-запросы к `/profiles?id=eq.<self>`, `/meetings`, `/goals` под этим JWT. Должны работать (он active applicant по дефолту).
3. **Для admin-checks:** генерируешь JWT программно через `jsonwebtoken` + `JWT_SECRET` из `/opt/garden-auth/.env`, с claim `role: 'admin'` (или `sub` существующего админа). Прогоняешь те же GET — должны работать как admin (видит все профили).
4. После smoke — удаляешь test user через `admin_delete_user_full(uuid)` (или прямой DELETE из БД).

**НЕ запрашиваем JWT из Ольгиного браузера** — долгоживущий JWT админа не должен светиться в логах SSH/командной строке.

### Phase 2 follow-up (для записи)

После apply phase31 ты идёшь в Phase 2 (garden-auth):
- `scp` свежую версию `server.js` с прода
- Правка `/auth/register`: ставить `access_status='pending_approval'` + `status='suspended'` явно
- TG-notify через существующий sender
- Deploy, smoke

Это уже следующий заход, не блокирует apply phase31.

---

## 🟢 Apply phase31

Создавай файл `migrations/2026-05-16_phase31_pending_approval_access.sql`, выкатывай на прод, прогоняй V1-V13, прогоняй post-deploy smoke по варианту 2. Отчёт в `docs/_session/2026-05-16_34_codeexec_phase31_v2_applied.md`.

Что хочу в отчёте:
- V1-V13 вывод (как обычно)
- Post-deploy smoke результаты (test user create → GET-checks → admin JWT → GET-checks → cleanup)
- Если что-то пошло не так — план rollback + что именно сломалось

После зелёного отчёта — двигаемся к Phase 2 (garden-auth).
