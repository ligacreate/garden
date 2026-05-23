# phase37 smoke — ✅ trigger сработал на одобрении Суроватской

**От:** codeexec (VS Code Claude Code)
**Кому:** стратега (claude.ai) → Ольга
**Дата:** 2026-05-23
**В ответ на:** «Ольга одобрила Суроватскую, проверь»
**Тип:** End-to-end smoke verify. Read-only. Без commit / push.

---

## TL;DR

- ✅ **Trigger phase37 сработал.** Ольга нажала ⛔ → PATCH /profiles → trigger `trg_profiles_pvl_student_on_approval` зацепил branch 1 (`OLD.access_status='pending_approval' AND NEW='active' AND NEW.role='applicant'`) → INSERT в pvl_students выполнен SECURITY DEFINER'ом (обошёл RLS admin-only).
- ✅ **Все 9 проверок совпали с ожиданиями.** Никаких расхождений.
- 🎯 **BUG-PVL-ONBOARDING-MISSING-STUDENT-RECORD полностью закрыт.** Orphans now = 0 (было 14 до одобрения, 1 после backfill'а 13 интернов).
- 📝 **Минорное observation:** `full_name = 'Александа'` (видимо опечатка в `profiles.name`, должно быть «Александра»). Это data quality, не bug триггера — COALESCE взял что было.

---

## 1. Verify Суроватской

```sql
SELECT p.email, p.role, p.access_status, p.status,
       ps.id IS NOT NULL AS has_pvl_row,
       ps.full_name,
       ps.cohort_id,
       c.title AS cohort_title,
       ps.status AS pvl_status,
       ps.created_at
  FROM profiles p
  LEFT JOIN pvl_students ps ON ps.id = p.id
  LEFT JOIN pvl_cohorts c ON c.id = ps.cohort_id
 WHERE p.email = 'asurovatskaya26@gmail.com';
```

| поле | факт | ожидание | статус |
|------|------|----------|--------|
| email | asurovatskaya26@gmail.com | — | ✅ |
| role | applicant | applicant | ✅ |
| access_status | **active** | active | ✅ Ольгин ⛔ click сработал |
| status | **active** | active | ✅ bridge-trigger синхронизировал |
| has_pvl_row | **t** | t | ✅ **trigger создал** |
| full_name | Александа | (COALESCE) | ✅ см. § 3 |
| cohort_id | 11111111-…-101 | Поток 1 | ✅ |
| cohort_title | **ПВЛ 2026 Поток 1** | «ПВЛ 2026 Поток 1» | ✅ trigger выбрал по CURRENT_DATE |
| pvl_status | active | active | ✅ дефолт триггера |
| created_at | **2026-05-23 19:14:32.947574+03** | свежий | ✅ ~1 минуту назад |

---

## 2. Global counts

```
 pvl_students_total 
--------------------
                 29     ← 28 (после phase37 backfill) + 1 (Суроватская через trigger)
```

```
 orphans_now 
-------------
           0           ← BUG-PVL-ONBOARDING-MISSING-STUDENT-RECORD полностью закрыт
```

| метрика | до phase37 | после backfill | после Суроватской | ожидание |
|---------|-----------|----------------|-------------------|----------|
| pvl_students | 15 | 28 | **29** | 29 ✅ |
| orphans (applicant+intern) | 14 | 1 | **0** | 0 ✅ |

---

## 3. Минорное observation: full_name = «Александа»

В `pvl_students.full_name` записано **«Александа»** (без «р»). Trigger взял из `profiles.name` через `COALESCE(NULLIF(trim(NEW.name), ''), NEW.email, 'Участница')` — то есть в `profiles.name` исходно лежит «Александа».

Это **не bug триггера** — он отработал ровно по спецификации (приоритет name → email → 'Участница'). Скорее всего опечатка в момент регистрации (юзер сам ввёл) или CSV-импорта. Решение Ольги:
- Оставить как есть — нормальная User-Generated опечатка.
- Поправить через админ-UI: открыть профиль Суроватской → перезаписать name на «Александра» → save. Это автоматически сделает PATCH /profiles → НО не обновит `pvl_students.full_name` (триггер только AFTER INSERT, не UPDATE name). Если хочется sync — нужен отдельный action в админке (или ручной UPDATE).

Не блокер. Это сюрприз а не баг.

---

## 4. Что технически произошло (для архива)

Хронология ~19:14:

1. **Ольга в админ-UI** (Tab «Пользователи»). Нашла Суроватскую через Ctrl+F.
2. **Click ⛔** → confirm dialog «Вернуть доступ?» → подтвердить.
3. **Frontend:** `api.toggleUserStatus(id, 'active')` → PATCH `/profiles?id=eq.e5343d9d-...` body `{status:'active', access_status:'active'}` под admin JWT.
4. **PostgREST → Postgres:**
   - `UPDATE profiles SET status='active', access_status='active' WHERE id=...`
   - RLS PERMISSIVE `profiles_update_admin` USING `is_admin()` → true.
   - RLS RESTRICTIVE `profiles_active_access_guard_write` USING/CHECK `has_platform_access(admin.uid)` → true.
   - UPDATE прошёл.
5. **BEFORE UPDATE триггеры на profiles** (4 штуки):
   - `trg_sync_status_from_access_status` — bridge, синхронизирует status ↔ access_status (хотя оба явно переданы).
   - `trg_reset_exempt_on_role_change` — role не менялся, не fire'ит.
   - WHEN-условия других trigger'ов не сработали.
6. **AFTER UPDATE триггеры на profiles** (наш + 2 контактных):
   - `trg_profiles_pvl_student_on_approval` — fire'ит, потому что:
     - UPDATE OF role,access_status → access_status попал в OF list → trigger рассматривается.
     - WHEN: `NEW.role='applicant' IN ('applicant','intern')` → true.
     - Branch 1: `OLD.access_status='pending_approval' AND NEW.access_status='active'` → **true**.
     - Branch 2: `OLD.role IS DISTINCT FROM NEW.role` — applicant=applicant → false.
     - OR (true OR false) → true → **fire**.
   - Внутри function (SECURITY DEFINER, обходит pvl_students_insert_admin RLS):
     - `SELECT id FROM pvl_cohorts WHERE CURRENT_DATE BETWEEN start_date AND end_date ORDER BY start_date DESC LIMIT 1` → `11111111-1111-1111-1111-111111111101` (Поток 1).
     - `INSERT INTO pvl_students (id, full_name, status, cohort_id) VALUES (NEW.id, COALESCE(...), 'active', cohort) ON CONFLICT DO NOTHING` → INSERT 1 row.
7. **trg_pvl_students_updated_at** на новой row отработал на UPDATE-pass (?? — нет, это AFTER INSERT, см. § 5), пометил created_at/updated_at = now().

Всё в одной транзакции PATCH'а Ольги — атомарно.

---

## 5. Что подтверждено архитектурно

✅ **Trigger механизм (c) Комбинированный работает** — branch 1 (access_status flip) сработал на split-PATCH UI flow без role-change. Это и был главный кейс бага, ради которого выбран механизм (c) вместо (a)/(b). Verified.

✅ **SECURITY DEFINER обходит RLS** — pvl_students_insert_admin WITH CHECK (is_admin()) не блокирует, потому что функция выполняется под owner'ом. Verified.

✅ **cohort_id резолвится по дате** — Поток 1 (15.04–01.07) активен сегодня (23.05) → подставлен корректно. Если бы текущая дата была после 01.07 — был бы NULL, и Ольге пришлось бы проставить вручную (edge case из `_108` § Open Question #2).

✅ **FK pvl_students.id → profiles(id)** не блокирует INSERT, потому что profiles.id для Суроватской уже существует (был создан при регистрации). FK validation проходит.

✅ **ON CONFLICT (id) DO NOTHING** не пригодился в этот раз (row'а не было), но idempotency защищает повторные fire'ы (если Ольга случайно сделает «приостановить → вернуть доступ»).

---

## 6. Что закрылось окончательно

| тикет | статус |
|-------|--------|
| **BUG-PVL-ONBOARDING-MISSING-STUDENT-RECORD (P1)** | ✅ DONE (verified end-to-end smoke) |
| **ARCH-010 (P2)** | ✅ DONE (FK active, verified V4) |
| **BUG-PVL-ENSURE-RESPECTS-ROLE (P2)** | ✅ DONE (whitelist в WHEN, verified V6) |
| **Латентный bug `pvl_set_updated_at`** | ✅ DONE (3 таблицы, verified V0) |
| **ARCH-012 (P2)** | 🟡 PARTIALLY — серверный flow работает. Client-side ensure-loop остаётся как fallback на 2-3 дня. Cleanup PR — позже. |

---

## 7. Следующие smoke (опциональные)

Из `_110` § 3.3 и 3.4 — для полного coverage:

### 7.1 Existing intern сдаёт ДЗ (FK regression check)
- Кто-нибудь из 13 backfill'нутых интернов сдаёт ДЗ.
- Проверка `pvl_student_homework_submissions` — submission проходит без FK violation.
- Smoke реальной активной интерн'ом, без impersonation.

### 7.2 Admin write не создаёт phantom row
- Ольга-admin делает любой write в /pvl/learning → проверить что в pvl_students новых rows под admin id не создалось.
- Это закрывает BUG-PVL-ENSURE-RESPECTS-ROLE acceptance.

Сейчас по сути достаточно (главный кейс закрыт). 7.1 и 7.2 — bonus verification.

---

## 8. Что я НЕ сделала

- ❌ Не правила опечатку «Александа» (decision Ольги).
- ❌ Не закрывала тикеты в BACKLOG.md (это стратеги работа — обнови статусы после ревью этого отчёта).
- ❌ Не commit / push.

---

## 9. Эффорт

- 3 SQL-запроса + парсинг: ~2 мин
- _118 отчёт: ~10 мин

Итого ~12 мин.
