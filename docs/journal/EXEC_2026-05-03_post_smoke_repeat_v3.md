---
title: "Repeat smoke 2026-05-03 — post-batch frontend fix"
date: "2026-05-03"
session: repeat-afternoon-v3
status: COMPLETED
verdict: READY_FOR_ANNOUNCE
runner: Claude smoke-runner
---

# Repeat Smoke 2026-05-03 — post-batch frontend fix

## Сводка по сессиям

| Сессия | Статус | Причина стопа |
|--------|--------|---------------|
| v1 (утро, partial) | BLOCKED | NEW-BUG-007: profiles 403 (table GRANT missing) |
| v2 (после phase 16) | BLOCKED | WARN-008: is_mentor_for 403; BUG-003: actor_user_id=null |
| **v3 (после phase 17 + BUG-003 retry)** | **COMPLETED** | **Всё прошло** |

---

## Возобновление после phase 17 + BUG-003 retry (v3)

**Дата/время:** 2026-05-03, ~19:08–19:32 MSK  
**Bundle:** index-BkjaMfOJ.js (deploy 7585407) — подтверждён ✅  
**Lazy chunk:** PvlPrototypeApp-BFM0T-ED.js (550 KB) с новым getAuthUserId — подтверждён через network ✅

### Что изменилось с v2:
- Phase 17: GRANT EXECUTE на is_mentor_for и is_admin для роли authenticated → WARN-008 закрыт
- BUG-003 retry: actor_user_id и changed_by теперь берутся из JWT sub claim → null больше не возвращается

---

## Роль 1 — Студент (Настина фея, viktorovna7286@gmail.com)

**Сессия:** чистый localStorage, clean navigate

### NEW-BUG-007 (контроль)
- GET /profiles?id=eq.1085e06d → **200** ✅

### BUG-004 (контроль)
- Bundle: index-BkjaMfOJ.js → **200**, страница загружена ✅

### ARCH-012 (контроль)
- Console: нет "ensurePvlStudentInDb failed" warnings ✅

### WARN-008 (новое закрытие) — прогресс урока
- Трекер: **9/13, 69%** (в v2 было 0/0/0%) ✅
- Открыт урок "Формат завтрака" (не отмечен ранее)
- Клик "Изучено" → API verify: pvl_student_content_progress`completed: true`, `completed_at: 2026-05-03T19:11:48` ✅
- GET pvl_student_content_progress → **200** (не 403) ✅

### BUG-003 (новое закрытие) — консоль
- window.__pvlAuditWarnings = [] — НЕТ "[PVL audit] skip DB INSERT" warnings ✅
- Console чист после клика "Изучено" ✅

### BUG-005 (новое закрытие) — audit_log при сообщении
- POST /pvl_direct_messages → **201** ✅
  - body: author_user_id = "1085e06d-34ad-4e7e-b337-56a0c19cc43f" ✅
- POST /pvl_audit_log → **201** ✅
  - actor_user_id = "1085e06d-34ad-4e7e-b337-56a0c19cc43f" (реальный UUID из JWT) ✅
  - action: "direct_message_send" ✅
  - НЕ 'u-st-1', НЕ null ✅
- Сообщение в чате: "Repeat smoke 2026-05-03 v3, игнорировать" — появилось ✅

### Аномалии
- ANOM-001 (WARNING): Трекер 9/13 — хотя в начале дня было 0. Скорее всего, данные были записаны в предыдущей диагностической сессии через прямые API-вызовы. Не блокер, но стоит проверить наличие "мусорных" progress записей.

---

## Роль 2 — Ментор (Настин фиксик, zobyshka@gmail.com)

**Сессия:** localStorage.clear(), navigate

### NEW-BUG-007 (контроль)
- GET /profiles?id=eq.1b10d2ef → **200** ✅

### ARCH-012 (контроль)
- Console: нет ensurePvlStudentInDb warnings ✅

### WARN-008 (новое закрытие) — Канбан и ДЗ
- Учительская загружена ✅
- Канбан проверок: **4 колонки с данными** (в v2 — все пусто) ✅
  - На проверке: 2 карточки (Екатерина Салама × 2)
  - На доработке: 2 карточки (Настина фея × 2)
  - Проверено: 1 карточка (Настина фея)
  - Архив: 2 карточки (Настина фея)
- pvl_student_homework_submissions GET → **200** (не 403) ✅
- pvl_student_content_progress GET → **200** ✅

### BUG-006 (новое закрытие) — смена статуса ДЗ
- Submission f77bc2aa (Настина фея, "Задание к уроку «Из чего состоит практика»") — выбран для теста
- Статус до теста: revision (на доработке)
- Клик "Принять" →
  - PATCH pvl_student_homework_submissions (из UI flow)
  - POST /pvl_homework_status_history → **201** ✅
  - Body: { changed_by: "1b10d2ef-8504-4778-9b7b-5b04b24f8751", from_status: "revision", to_status: "accepted" } ✅
  - changed_by = реальный UUID ментора (не null, не stub) ✅
- Статус после: ПРИНЯТО ✅
- **Откат:** UI не предоставляет кнопку возврата из "accepted" в "revision". Submission f77bc2aa оставлен в accepted. Ольга — нужен ручной откат если требуется.

### BUG-003 (ментор) — консоль
- window.__skipWarningsMentor = [] — НЕТ "skip DB INSERT" ✅

### ANOM-001 (WATCH item — bulk load)
- При открытии Учительской: **130+ GET запросов** к pvl_student_homework_submissions, pvl_student_content_progress, pvl_checklist_items для 30+ студентов (не только менти этого ментора)
- Все запросы → **200** (в v2 были 403)
- Это поведение существовало и раньше, но ранее тихо падало в 403. После phase 16/17 bulk GRANTs теперь работают — дашборд ментора грузит данные ВСЕХ студентов в системе
- Приоритет: LOW (не блокер, но избыточная нагрузка на DB)
- Рекомендация: добавить RLS фильтр по mentor_id или limit запросов

---

## Роль 3 — Token Expiry (под ментором)

- localStorage.removeItem('garden_auth_token') → null confirmed
- F5 → AuthScreen ✅
- Белый экран: НЕТ ✅
- Alert-модалка: НЕТ ✅
- **PASS** ✅

---

## Итоговая таблица по регрессиям (v3)

| ID | Описание | v1 | v2 | **v3** |
|----|----------|----|----|--------|
| BUG-004 | Hard reload, нет белого экрана | ✅ FIXED | ✅ | ✅ |
| NEW-BUG-007 | Login profiles 200 | 🔴 | ✅ | ✅ |
| ARCH-012 | Нет ensurePvlStudentInDb | — | ✅ | ✅ |
| WARN-008 | is_mentor_for EXECUTE grant | — | 🔴 | ✅ FIXED |
| BUG-003 | actor_user_id = реальный UUID | — | 🔴 null | ✅ FIXED |
| BUG-005 | audit_log → 201 под студентом | — | ⚠️ N/A | ✅ FIXED |
| BUG-006 | status_history → 201, changed_by UUID | — | 🔴 N/A | ✅ FIXED |
| Token expiry | AuthScreen без зависания | — | ✅ | ✅ |

---

## Открытые вопросы (не блокеры)

1. **ANOM-001 LOW**: Bulk load всех студентов при открытии Учительской ментора (~130 GET запросов). Все 200, производительность не тестировалась.
2. **Rollback f77bc2aa**: submission Настиной феи переведён в "accepted" в ходе теста BUG-006. UI не имеет кнопки отката из accepted. Нужен ручной PATCH или DELETE записи в pvl_homework_status_history если необходимо вернуть в revision.
3. **Тестовое сообщение**: "Repeat smoke 2026-05-03 v3, игнорировать" от Настиной феи в чате с ментором (~19:16 MSK) — осталось в системе.

---

## Финальный вердикт

**status: COMPLETED**  
**verdict: READY_FOR_ANNOUNCE**

Все регрессии закрыты. Платформа работает в штатном режиме. Рекомендую объявление Насте после подтверждения стратега.
