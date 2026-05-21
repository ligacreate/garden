---
title: "Repeat Smoke 2026-05-03 — Post-Batch Frontend Fix"
type: smoke-report
session: repeat-afternoon
created: 2026-05-03T16:26:00+03:00
updated: 2026-05-03T17:42:00+03:00
status: COMPLETED
verdict: NOT_READY_FOR_ANNOUNCE
tester: Claude (smoke-runner via Chrome MCP)
---

# Repeat Smoke 2026-05-03 — Post-Batch Frontend Fix

## Резюме (финальный)

Прогон завершён в двух фазах:

**Фаза 1 (16:21–16:26):** Заблокирован на логине студента — NEW-BUG-007 (GRANT SELECT на `profiles` отсутствовал). Частичный отчёт сохранён.

**Фаза 2 (17:18–17:42):** Возобновлён после DB-фикса phase 16. Логин студента и ментора работает. Однако обнаружены **два новых незакрытых бага** (BUG-003 не исправлен, WARN-008 — новая аномалия после bulk GRANT), которые блокируют сохранение прогресса студентов и работу менторской очереди.

**Результат: ⛔ NOT_READY_FOR_ANNOUNCE**

---

## Фаза 1 — Блокер NEW-BUG-007 (16:21–16:26)

### BUG-004 — Hard Reload ✅ FIXED
```
Cmd+Shift+R → index-D12H7H1L.js → 200 (не pending)
AuthScreen отображается без белого экрана
```
Коммит bf57606 (sw.js network-first + purge legacy caches) работает.

### Логин студента → 403 → BLOCKED
```
GET /profiles?select=*&id=eq.1085e06d-34ad-4e7e-b337-56a0c19cc43f → 403
[ERROR] permission denied for table profiles (code: 42501)
```
Root cause: отсутствовал table-level GRANT SELECT ON profiles TO authenticated.
Зафиксирован параллельно Ольгой через App.jsx alert.
**Передан в DB-fix поток (phase 16). Закрыт после фикса.**

---

## Фаза 2 — После DB-фикса phase 16 (17:18–17:42)

### Тест 1 — Студент (viktorovna7286@gmail.com)

**Логин:**
```
POST /auth/login → 200 ✅
GET /profiles?id=eq.1085e06d-34ad-4e7e-b337-56a0c19cc43f → 200 ✅ (NEW-BUG-007 CLOSED)
```
Toast «С возвращением!» ✅. Профиль Настиной феи загружен.

**ARCH-012 (ensurePvlStudentInDb loop):**
Console под студентом: **нет warnings "ensurePvlStudentInDb failed"** ✅
Замечание: POST /pvl_students запросов не обнаружено — фикс 45f1402 работает.

Однако появились новые warnings:
```
[PVL DB] pvl_student_homework_submissions {"code":"42501","message":"permission denied for function is_mentor_for"}
[PVL DB] pvl_student_content_progress {"code":"42501","message":"permission denied for function is_mentor_for"}
[PVL DB] pvl_checklist_items {"code":"42501","message":"permission denied for function is_mentor_for"}
```
→ **WARN-008** (новая аномалия, см. раздел "Найденные баги")

**Трекер курса:**
Показывает 0/13, 0% (утренний прогресс 9/13 не виден — вероятно, связано с WARN-008, `pvl_student_content_progress` не загружается из-за is_mentor_for 403).

**Кнопка «Изучено» (урок «Формат завтрака»):**
```
[WARNING] [PVL audit] skip DB INSERT: actor_user_id is not a valid UUID Object
[WARNING] [PVL DB] pvl_student_content_progress permission denied for function is_mentor_for
[WARNING] [PVL DB] pvl_checklist_items permission denied for function is_mentor_for
```
POST /pvl_student_content_progress — **НЕ ОТПРАВЛЕН**. Прогресс не сохраняется.

→ **BUG-003 НЕ ИСПРАВЛЕН**: actor_user_id не является UUID (фикс e3bd767 не устранил проблему)
→ **WARN-008** блокирует сохранение прогресса через pvl_student_content_progress

**Чат с ментором:**
```
GET /pvl_direct_messages → (история загружена) ✅
POST /pvl_direct_messages → 201 ✅  (сообщение "Repeat smoke 2026-05-03, игнорировать" отправлено)
pvl_audit_log — запрос НЕ отправлен (фронт пропускает: "skip DB INSERT: actor_user_id is not a valid UUID")
```
→ **BUG-005**: pvl_audit_log INSERT пропускается на уровне фронта, до endpoint'а не доходит. Фикс cd72e44 не устранил корневую причину.

**Данные на месте (save→reload):**
- История чата: сообщения из утреннего прогона видны ✅
- Прогресс уроков: показывает 0% (данные утром записались, но не читаются из-за WARN-008) ⚠️

---

### Тест 2 — Ментор (zobyshka@gmail.com)

**Логин:**
```
POST /auth/login → 200 ✅
GET /profiles → 200 ✅ (NEW-BUG-007 CLOSED)
```
Toast «С возвращением!» ✅. Профиль Настина фиксика загружен.

**Учительская — список студентов:**
После ~5 сек задержки: 4 студента загрузились (Лена Ф, Екатерина Салама, Рита, Настина фея) ✅

Console warnings:
```
[PVL DB] pvl_student_homework_submissions {"code":"42501","message":"permission denied for function is_mentor_for"}  (3 раза)
```
→ **WARN-008** — та же аномалия, что и под студентом

**Канбан проверок:**
Все колонки пусты: «Пока тихо», «Нет активных доработок», «Пока пусто», «Архив пока пуст».
Root cause: `pvl_student_homework_submissions` → 403 `permission denied for function is_mentor_for` — ментор не видит submissions студентов.

Прямой API запрос:
```
GET /pvl_student_homework_submissions?status=eq.in_review → 403
{"code":"42501","message":"permission denied for function is_mentor_for"}
```

**BUG-006 (pvl_homework_status_history):**
**Не может быть проверен** — нет доступных submissions для смены статуса.

**Чат с менти:**
Сайдбар отображает «Чат с менти» ✅ (не открывался, блокер в очереди ДЗ приоритетнее)

---

### Тест 3 — Token Expiry

```
localStorage.removeItem('garden_auth_token') → null ✅
F5 → AuthScreen ✅
Нет белого экрана ✅
Нет alert-модалки (была ранее с NEW-BUG-007) ✅
```
**Тест 3: ✅ PASS**

---

## Найденные баги

### 🔴 WARN-008 — is_mentor_for: permission denied (НОВЫЙ БЛОКЕР)

| Поле | Значение |
|------|----------|
| Severity | CRITICAL — блокирует прогресс студентов И очередь ДЗ у ментора |
| Endpoints | pvl_student_content_progress, pvl_checklist_items, pvl_student_homework_submissions |
| HTTP Status | 403 |
| PG Error | `permission denied for function is_mentor_for` |
| Affected roles | authenticated (студенты и менторы) |
| Root cause | Функция `is_mentor_for` используется в RLS-политиках таблиц pvl_*. После bulk GRANT (phase 16) table-level доступ появился, но EXECUTE GRANT на функцию is_mentor_for не выдан для роли `authenticated` |
| Impact | Студент: прогресс уроков не читается/не сохраняется, 0% в трекере. Ментор: весь Канбан пуст, ДЗ не читаются. |
| Trigger | Появился после применения bulk GRANT phase 16 (ранее 403 не были видны из-за отсутствия GRANT на profiles) |
| Fix required | GRANT EXECUTE ON FUNCTION is_mentor_for TO authenticated; |

### 🔴 BUG-003 — actor_user_id не UUID (НЕ ИСПРАВЛЕН)

| Поле | Значение |
|------|----------|
| Severity | HIGH |
| Console | `[PVL audit] skip DB INSERT: actor_user_id is not a valid UUID Object` |
| Behavior | Фронтенд проверяет UUID перед INSERT в pvl_audit_log и пропускает вставку. Запрос к /pvl_audit_log не отправляется. |
| Fix e3bd767 | Заявленный фикс НЕ устранил проблему — actor_user_id всё ещё не является UUID |
| Impact | BUG-005 (pvl_audit_log 403) недостижим — запрос не доходит до сервера |

### 🟡 ARCH-012 (ensurePvlStudentInDb) — ✅ ЗАКРЫТ

POST /pvl_students warnings в консоли **отсутствуют**. Фикс 45f1402 работает.

---

## Таблица регрессий (итоговая)

| Баг | Утро | Фаза 1 | Фаза 2 | Статус |
|-----|------|--------|--------|--------|
| BUG-004 white screen hard reload | 🔴 | ✅ FIXED | ✅ | CLOSED |
| NEW-BUG-007 profiles GRANT | — | 🔴 | ✅ FIXED | CLOSED (phase 16) |
| ARCH-012 ensurePvlStudentInDb | 🔴 | ⏸ | ✅ FIXED | CLOSED |
| BUG-003 actor_user_id | 🟡 | ⏸ | 🔴 НЕ ИСПРАВЛЕН | OPEN |
| BUG-005 pvl_audit_log 403 | 🔴 | ⏸ | ⚠️ не достижим (BUG-003) | OPEN |
| BUG-006 pvl_homework_status_history | 🔴 | ⏸ | ⚠️ не достижим (WARN-008) | OPEN |
| WARN-008 is_mentor_for | — | — | 🔴 НОВЫЙ | OPEN |
| Token expiry → AuthScreen | ✅ | ⏸ | ✅ | PASS |

---

## Финальный вердикт

```
⛔ NOT_READY_FOR_ANNOUNCE
```

**Блокеры:**
1. **WARN-008** — RLS функция `is_mentor_for` недоступна для роли `authenticated`. Студенты не могут сохранить прогресс, ментор не видит ДЗ.
2. **BUG-003 не исправлен** — actor_user_id не UUID, audit_log не работает.

**Что исправлено:**
- ✅ BUG-004 (hard reload white screen) — CLOSED
- ✅ NEW-BUG-007 (profiles GRANT) — CLOSED  
- ✅ ARCH-012 (ensurePvlStudentInDb loop) — CLOSED
- ✅ Token expiry → AuthScreen — PASS

**Рекомендации для следующего прогона:**
1. GRANT EXECUTE ON FUNCTION is_mentor_for TO authenticated
2. Исследовать BUG-003 (e3bd767 не дал эффекта, возможно нужен hot-reload или другой путь передачи actor_user_id)
3. После фиксов — повторить Тест 1 (прогресс уроков + audit_log) и Тест 2 (Канбан + BUG-006)

**Не писать Насте.** Ожидать 🟢 от стратега.

---

## Тестовые данные в БД (для Ольги)

Добавлены в этом прогоне:
- Сообщение в чате Настина фея ↔ Настин фиксик: "Repeat smoke 2026-05-03, игнорировать" (студент, ~17:28 MSK)

---

*Отчёт обновлён: 2026-05-03 ~17:42 MSK. Smoke-runner: Claude via Chrome MCP. Сессия: repeat-afternoon (фаза 2).*
