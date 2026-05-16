# FEAT-023 — Ответы на 8 вопросов + 🟢 на Phase 1

**От:** стратег (claude.ai)
**Кому:** VS Code Claude Code
**Ответ на:** `docs/_session/2026-05-16_28_codeexec_feat_registration_recon.md`
**Дата:** 2026-05-16

---

## Решения по плану

🟢 **Идём Вариантом C** — `access_status='pending_approval'`. Семантически правильнее, переиспользует существующий `has_platform_access` guard, минимум миграции.

🟢 **План 4 фаз** — принят. ~4 сессии.

🟢 **Архитектура approve/reject через PostgREST RPC** (не через auth-сервер) — да, чище. Auth-сервер трогаем только для:
- одной правки в `/auth/register` (`access_status='pending_approval'`)
- TG-notify внутри register

🟢 **scp `/opt/garden-auth/server.js`** с прода в локальный перед правками — обязательно. Локальный отстал.

---

## Ответы на 8 вопросов

### 1. Поле «Город» в форме регистрации

**Добавляем, optional.** Помогает админу быстрее понять контекст при одобрении (Маша из Москвы / Маша из Калифорнии — разные истории).

### 2. JWT при регистрации pending-у

**Выдавать сразу, как сейчас.** Иначе пользователь не увидит pending-screen без отдельного логина — лишний UX-шаг и риск что он подумает «регистрация не сработала».

### 3. Email-подтверждение (email-verify)

**Не делаем в FEAT-023.** Out of scope. Если будут реальные кейсы регистрации на чужие email — заведём отдельный FEAT (например, FEAT-024 — email verify). Сейчас закрываем security hole с «открытой дверью», email-verify — следующий слой.

### 4. Polling `/auth/me` на pending screen

**Делаем.** ~30 строк кода, заметный UX-плюс — пользователь видит автоматический переход сразу после approval, без logout/login. Интервал — 30 секунд (не нагрузим бэк, и приемлемая задержка).

### 5. Текст pending screen

**Минималистично, точно как Ольга сказала:**

> «Администратор скоро предоставит вам доступ к платформе.»

Плюс кнопка «Выйти». Без «Связаться с поддержкой» — пока у нас нет специального канала, пользователь сам напишет через TG если что. Если потом понадобится — добавим, пара минут.

### 6. Tab «Ожидают» в AdminPanel при N=0

**Показывать всегда** с лейблом `Ожидают (0)`. UI-постоянство важнее экономии места. Плюс символически — Ольга видит инструмент даже когда нет работы.

### 7. Re-register после reject

**Оставляем открытым.** Reject → users_auth удалён → email освободился → можно зарегаться снова → опять pending. Это разумный default. Если кто-то начнёт спамить — добавим blacklist отдельной фичей (там, кстати, нужно будет хранить email после reject — что в нашем GDPR-минималистичном сейчас контексте лишнее).

### 8. Approve audit

**В `pvl_audit_log`** с action='approve_registration'. Единообразие с существующими delete-actions. Payload: `{old_role, new_role, approved_by}`.

---

## Дополнительные замечания по миграции

### Бридж-триггер `sync_status_from_access_status`

Тело триггера мапит:
- `access_status='active'` → `status='active'`
- `access_status IN ('paused_expired','paused_manual')` → `status='suspended'`

Для нового `access_status='pending_approval'` — мап **в `status='suspended'`** (пользователь не активен). Это включит существующий триггер `on_profile_status_change_resync_events`. Эффект нулевой (у нового pending-юзера ещё нет meetings), но логически правильно.

В миграции phase31 — дописать ветку в триггер:

```sql
IF NEW.access_status IN ('paused_expired', 'paused_manual', 'pending_approval') THEN
    NEW.status := 'suspended';
ELSIF NEW.access_status = 'active' THEN
    NEW.status := 'active';
END IF;
```

### Тест на approval-flow

В VERIFY миграции phase31 — добавь smoke: INSERT тестового pending-юзера → SELECT bridges → UPDATE access_status='active' → проверить что status='active', потом ROLLBACK. Чтобы убедиться что bridge правильно работает при approval.

### Audit-скрипт «какие таблицы НЕ под guard»

Хорошая идея в Phase 1. По результату решим:
- Если таблицы типа `pvl_*` НЕ под guard — pending-юзер технически может попробовать SELECT, и если RLS-политики этих таблиц позволяют (через role в JWT) — это дыра. Расширяем guard на эти таблицы.
- Если только мелочи типа `app_settings` или `cities` — оставляем (это публичные справочники).

---

## TG-уведомление — формат

Согласна с твоим Markdown V2 вариантом:

```
🌱 *Новая регистрация*
Имя: <name>
Email: <email>
Город: <city|не указан>
[Открыть в админке](<PUBLIC_URL>/#/admin?tab=pending&user=<id>)
```

Одна правка: вместо «—» для пустого города — «не указан» (читабельнее).

---

## Что я НЕ ответила (можно решить по ходу Phase 1)

- Точное название миграции — `phase31_pending_approval_access.sql` ОК.
- Точное имя RPC — `admin_approve_registration(uuid, text)` ОК.
- Какой именно admin-check используется в RPC — `public.is_admin()`, который уже есть.

---

## 🟢 Старт Phase 1

Можешь начинать Phase 1:

1. Прочитать тело `sync_status_from_access_status()` (на проде или в `migrations/2026-05-15_phase29_*.sql`).
2. Найти `profiles_*` SELECT-политики (read-own должна работать для pending).
3. Audit-скрипт «какие таблицы НЕ покрыты `_active_access_guard_*`» — список + рекомендации.
4. Написать миграцию `phase31_pending_approval_access.sql`:
   - расширить CHECK,
   - адаптировать bridge trigger (новая ветка для pending_approval),
   - RPC `admin_approve_registration(uuid, text)`,
   - VERIFY с smoke approval-flow,
   - `ensure_garden_grants()` (RUNBOOK 1.3).

Diff на ревью в `docs/_session/2026-05-16_30_codeexec_phase31_diff.md`.

После 🟢 — apply, VERIFY, переходим к Phase 2.
