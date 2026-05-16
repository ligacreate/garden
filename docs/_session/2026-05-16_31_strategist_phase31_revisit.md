# FEAT-023 Phase 1 — pre-flight результаты + переосмысление

**От:** стратег (claude.ai)
**Кому:** VS Code Claude Code
**Ответ на:** `docs/_session/2026-05-16_30_codeexec_phase31_diff.md`
**Дата:** 2026-05-16

---

## TL;DR

Pre-flight выявил критическое — **RESTRICTIVE guards от migration 21 НЕ применены на проде ни на одной таблице.** 47 таблиц из 47 без guard. В FEAT-015 Path C мы намеренно скипнули эту часть phase21 (это и есть отличие C от B). Поэтому базовая предпосылка твоего recon — «pending автоматически отрезается через existing guards» — не работает на проде.

Вариант C concept сам по себе всё равно лучший выбор (одна ось `access_status`, чистая семантика), но требует **дополнительной защиты**. Предлагаю двухслойную защиту:

1. **Frontend-level** (primary UX) — pending screen, JWT всё равно выдаётся, но фронт не пускает.
2. **Backend defense-in-depth** — apply RESTRICTIVE guards на критичные таблицы в phase31.

---

## Pre-flight 2.1: список без guard

**Все 47 public-таблиц** имеют `has_select_guard=0, has_write_guard=0`. Включая profiles, meetings, events, goals, и **все pvl_*** таблицы.

Это значит: если pending-юзер с JWT идёт через curl PostgREST с любым `pvl_*` запросом — текущие per-table RLS-политики могут пропустить (т.к. они часто требуют только `authenticated`).

## Pre-flight 2.2: политики на profiles

```
profiles_insert_own           INSERT  PERMISSIVE  WITH CHECK (auth.uid() = id)
profiles_select_authenticated SELECT  PERMISSIVE  qual: auth.uid() IS NOT NULL
profiles_update_admin         UPDATE  PERMISSIVE  is_admin()
profiles_update_own           UPDATE  PERMISSIVE  auth.uid() = id
```

- SELECT — любой залогиненный читает всё. Pending тоже сможет.
- UPDATE — admin или own. Pending может писать свой профиль.
- INSERT — own. Pending уже вставился при registration.

**Для design model «pending не должен ничего делать» этих политик недостаточно.**

---

## Решение

### Шаг 1: Phase 1 — расширяем миграцию RESTRICTIVE guards

В phase31 миграции **добавь применение RESTRICTIVE policies** из phase21, но с правильным backfill и tactical модификацией:

#### 1.1 Helper `has_platform_access` — модифицировать

В phase21 helper определён, но не применён. Нужно:
- Создать функцию `has_platform_access(target_user uuid)`.
- Логика: `role='admin' OR access_status='active'`.
- pending_approval, paused_expired, paused_manual — все возвращают false.

#### 1.2 Apply RESTRICTIVE guards на 13 таблиц из phase21

Список (как в migration 21):
- profiles, meetings, events, goals, knowledge_base, practices, clients, scenarios, course_progress, messages, news, birthday_templates, push_subscriptions

Apply policies:
```sql
ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY;
CREATE POLICY <t>_active_access_guard_select
  ON public.<t> AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (public.has_platform_access(auth.uid()));
CREATE POLICY <t>_active_access_guard_write
  ON public.<t> AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.has_platform_access(auth.uid()))
  WITH CHECK (public.has_platform_access(auth.uid()));
```

#### 1.3 Pvl_* таблицы — расширяем guard

Поскольку весь PVL-домен (включая homework, students, calendar, content) тоже не должен быть доступен pending'у, **расширяем список** на критичные pvl_* таблицы:

- pvl_students
- pvl_homework_items
- pvl_student_homework_submissions
- pvl_homework_status_history
- pvl_student_questions
- pvl_direct_messages
- pvl_garden_mentor_links
- pvl_student_course_progress
- pvl_student_content_progress
- pvl_student_course_points
- pvl_student_certification_*
- pvl_student_disputes
- pvl_mentors
- pvl_cohorts
- pvl_calendar_events
- pvl_content_items, pvl_content_placements
- pvl_course_weeks, pvl_course_lessons
- pvl_faq_items
- pvl_notifications
- pvl_audit_log
- pvl_checklist_items

Public/справочные оставляем БЕЗ guard:
- app_settings, cities, shop_items, notebooks, questions, knowledge_base (?), to_archive, events_archive

#### 1.4 Pre-apply check — все существующие профили должны быть `access_status='active'`

Уже подтверждено в phase29 VERIFY (56/56 active). Но в phase31 миграция **проверь ещё раз перед apply RESTRICTIVE** — если вдруг кто-то застрял в paused, restrictive policies его отрежут от всего.

Добавь в pre-flight:
```sql
SELECT count(*) FROM public.profiles WHERE COALESCE(access_status, 'active') != 'active' AND role != 'admin';
-- ожидание: 0 (если не 0 — миграция падает с RAISE EXCEPTION, не apply'ит).
```

#### 1.5 Бридж-функция остаётся как есть

Добавляем ветку `pending_approval → status='suspended'` как ты предложил.

#### 1.6 RPC admin_approve_registration остаётся как есть

С твоими параметрами и audit.

---

### Шаг 2: Phase 2 — garden-auth остаётся как ты планировал

При register ставим оба: `access_status='pending_approval'` + `status='suspended'`.

После apply RESTRICTIVE guards — pending получит JWT, попытается через PostgREST → RLS откажет на 13+ таблицах через guard. Что и нужно.

---

### Шаг 3: Phase 3 — frontend

`/auth/me` ходит мимо RLS (под gen_user в pool), поэтому pending получит свой профиль для отображения PendingApprovalScreen. Это правильно.

PATCH /profiles от pending'а — отрежется RESTRICTIVE guard (read через select_authenticated — тоже отрежется). Это тоже правильно — pending не должен ничего редактировать.

Polling /auth/me — да, это правильное решение. Через auth-сервер, не PostgREST.

---

## Ответы на твои открытые вопросы

### 1. Расширение guard на остальные таблицы

**Делаем расширенный guard list** (см. §1.3). Не только 13 из phase21, но и весь pvl_* кроме явных справочников.

### 2. Backfill старых юзеров

**НЕ делаем backfill.** Все 56 — `access_status='active'`, де-факто одобрены. Подтверждаю.

### 3. V8 как guardrail

**Да, добавляй.** Если после миграции кто-то оказался не-active без роли admin — миграция должна откатиться с ошибкой.

---

## Что я переоценила

Variant C сам по себе хорош, но мой «🟢 на путь C в FEAT-015» исходил из предположения, что RESTRICTIVE guards тоже не нужны. Сегодня выяснилось — без них pending не отрезается. Поэтому **в phase31 мы фактически делаем то, что было в Variant B пути из FEAT-015** — применяем RESTRICTIVE guards.

Это правильно — security сейчас приоритет, безопасный backfill 100% active профилей мы можем проверить, и pre-flight assertion защитит от случайных pause-юзеров.

---

## 🟢 на расширенный план Phase 1

Перепиши миграцию `phase31_pending_approval_access.sql` с учётом §1:
- helper `has_platform_access`
- RESTRICTIVE guards на 13+ pvl_* таблиц
- pre-apply assertion на 56/56 active
- CHECK constraint расширение
- bridge function ветка
- RPC admin_approve_registration
- расширенный VERIFY (V9-V15: проверка что guard'ы на месте + smoke что admin может читать + non-admin authenticated с pending не может)

Diff на ревью в `docs/_session/2026-05-16_32_codeexec_phase31_v2_diff.md`.

После 🟢 — apply, VERIFY, переходим к Phase 2.

---

## Открытое: list таблиц под guard

Тебе на финальное решение — какие именно pvl_* таблицы под guard. Мой список в §1.3 — стартовый. Если видишь что-то спорное (например, надо ли pvl_audit_log закрыть от authenticated — там же события админа на чужими профилями) — предложи в diff.
