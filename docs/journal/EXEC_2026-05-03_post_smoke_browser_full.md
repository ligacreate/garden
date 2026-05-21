---
title: Smoke-тест POST-SEC-001 — полный прогон по трём ролям через Claude in Chrome
type: smoke-report
created: 2026-05-03T08:06:00Z
status: completed-with-blockers
verdict: NOT_READY_FOR_WIDE_ANNOUNCE
related_docs:
  - docs/MIGRATION_2026-05-02_security_restoration.md
  - docs/FRONTEND_PATCH_2026-05-02_jwt_fallback.md
  - docs/EXEC_2026-05-02_etap5_caddy_open.md
  - plans/BACKLOG.md (BUG-001..BUG-003, ARCH-012)
---

# Smoke-тест POST-SEC-001 — полный прогон по трём ролям

Проведён 2026-05-03 ~10:30–11:10 МСК через Claude in Chrome (MCP-driven Chrome browser) под трёх ролями:
- Студент: Настина фея
- Ментор: Настин фиксик (zobyshka@gmail.com)
- Token-expiry edge case: под ментором, удаление garden_auth_token

Цель — финальная проверка перед широким анонсом после миграции SEC-001 (RLS на 28 таблицах + JWT в PostgREST + фронт-патч).

---

## Резюме

⛔ **НЕ ГОТОВО К ШИРОКОМУ АНОНСУ.** Два критичных блокера:

1. **BUG-WHITE-SCREEN** — Cmd+Shift+R (hard reload) ломает загрузку: JS-бандл `index-DXUDWmBe.js` зависает в `pending` > 10 сек, белый экран. F5 / navigate() работают.
2. **BUG-PVL-STUDENTS-RETRY** — `POST /pvl_students?on_conflict=id` → 403, **>200 запросов за 5 мин сессии** (бесконечный retry от `ensurePvlStudentInDb`). Это серьёзная нагрузка на API.

Ключевые позитивы:
- ✅ Логин работает по всем трём ролям, JWT с `role='authenticated'` доставляется.
- ✅ **Save → reload → данные на месте** (то, чего опасалась Ольга): прогресс уроков, ДЗ, переписка, статусы — все цикл сохранения работает.
- ✅ Token-expiry edge case (BUG-7 фронт-патча) работает: удаление токена → reload → AuthScreen, без зависания.
- ✅ Менторская очередь работает, статусы ДЗ обновляются.
- ✅ Чат ученик-ментор работает (pvl_direct_messages).

---

## Тест 1: Студент (Настина фея)

### Шаг 1 — подготовка / hard reload
- `localStorage.clear()` + `Cmd+Shift+R` → 🔴 **белый экран**, JS-бандл `index-DXUDWmBe.js` в `pending` > 10 сек. **Воспроизводится стабильно.**
- Повторная `navigate()` → загрузка нормальная.
- 1 EXCEPTION в консоли при запуске (Object без stack-trace).

### Шаг 2 — логин
- ✅ Успешен, тост "С возвращением!"
- `GET /profiles` → 200, `GET /goals` → 200
- `garden_auth_token` в localStorage

### Шаги 4–5 — профиль
- ✅ Профиль (14% заполнения)
- `PATCH /profiles` → 200 (Smoke-test-city → откат)
- ⚠️ Поле «Новый пароль» автозаполняется браузером

### Шаги 6–7 — Курс ПВЛ / Трекер
- ✅ Трекер: 7/13 шагов (54%), ментор «Настин фиксик»
- 🔴 **Консоль: 100+ WARNING `[PVL DB] ensurePvlStudentInDb failed code:42501`** — циклический retry без backoff
- ⚠️ `DELETE /pvl_checklist_items` → 503 (единократно при открытии трекера)

### Шаги 8–10 — Урок + чекпоинт (КРИТИЧНО)
- `POST /pvl_student_content_progress` → 201 ✅
- После navigate-reload: данные подгружаются ~5 сек (9/13, 69%)
- ✅ **Данные сохранились после reload — критичный критерий Ольги выполнен**
- 🟡 Кратковременно показывается 0% — UX пугает

### Шаги 11–13 — Чат с ментором
- ✅ `GET /pvl_direct_messages` → 200
- ✅ `POST /pvl_direct_messages` → 201
- ⚠️ `POST /pvl_audit_log` → 403

---

## Тест 2: Ментор (Настин фиксик / zobyshka@gmail.com)

### Шаг 2 — логин
- ✅ Логин, роль ментор подтверждена

### Шаги 4–5 — учительская
- При первом показе: 1 студент (задержка 3–5 сек)
- После подгрузки: **4 студента** (Лена Ф, Екатерина Салама, Рита, Настина фея) ✅

### Шаги 7–10 — ДЗ / смена статуса
- ✅ Очередь проверок открылась
- Введён комментарий «Smoke-тест 2026-05-03, игнорировать»
- `PATCH /pvl_student_homework_submissions` → 200 ✅
- ⚠️ `POST /pvl_homework_status_history` → 403 (история не пишется)
- ✅ После reload статус ДЗ в колонке «Проверено» — **данные сохранились**

### Шаги 13–15 — чат с ментором
- ✅ Видно сообщение студента «Smoke-тест 2026-05-03, можно игнорировать» из Теста 1
- ✅ `POST /pvl_direct_messages` → 201
- Reload → ✅ сообщение на месте

---

## Тест 3: Token-expiry edge case

- `garden_auth_token` удалён из localStorage
- F5 (soft reload)
- ✅ **ОЖИДАЕМОЕ ПОВЕДЕНИЕ**: экран «Войти / Создать аккаунт»
- ✅ Нет белого экрана, нет зависания
- Фронт-патч `jwt_fallback` работает корректно

---

## Найденные баги

### 🔴 Критично

**BUG-WHITE-SCREEN (новый)**
Hard reload (Cmd+Shift+R) → белый экран, JS-бандл `index-DXUDWmBe.js` в `pending` > 10 сек. Воспроизводится при каждом hard reload. F5 / navigate() работают.
**Гипотеза:** конфликт между browser cache-bypass и nginx (фронт хостится на 185.215.4.44, не Caddy). Возможно, Service Worker (`sw.js`) перехватывает запрос и не отдаёт.
**Приоритет:** P0 — первое впечатление при проблемах.

**BUG-PVL-STUDENTS-RETRY (расширение ARCH-012, поднимаем приоритет)**
`POST /pvl_students?on_conflict=id` → 403, **>200 запросов за 5 мин сессии**. Это `ensurePvlStudentInDb` без backoff и без exit-condition. Затрагивает все роли.
**Решение:** немедленно — frontend hotfix `if (!isAdmin) return early` в `ensurePvlStudentInDb`. ARCH-012 поднимаем с P2 до **P0**.

### 🟡 Важно

**BUG-AUDIT-LOG-INSERT-403** — `POST /pvl_audit_log` → 403. История операций не пишется. Странно — RLS-политика `WITH CHECK (auth.uid() IS NOT NULL)` должна пропустить, нужно диагностировать.

**BUG-HOMEWORK-HISTORY-INSERT-403** — `POST /pvl_homework_status_history` → 403. Тот же паттерн — INSERT-политика требует `changed_by = auth.uid() AND EXISTS(...)`. Если фронт пишет stub-id — упадёт. Связан с BUG-003 в backlog.

**BUG-CHECKLIST-DELETE-503** — единократно, транзитный, может быть просто гонкой.

**BUG-PVL-LOAD-DELAY** — задержка 3–5 сек при загрузке PVL-данных, кратковременно 0%/0 menti. Снижает доверие.

### 🟢 Косметика

**BUG-AUTOFILL-PASSWORD** — поле «Новый пароль» автозаполняется браузером.
**BUG-TELEGRAM-WRONG-DATA** — у Настиной феи в Telegram поле = "olga@skrebeyko.com" (видимо, чужие тестовые данные в seed).

---

## Финальный вердикт

⛔ **НЕ ГОТОВО К ШИРОКОМУ АНОНСУ.**

Два P0-блокера перед релизом:
1. **BUG-WHITE-SCREEN** (hard reload белый экран)
2. **BUG-PVL-STUDENTS-RETRY** (200+ failed-requests/session)

Также два P1, желательно перед анонсом:
3. **BUG-AUDIT-LOG-INSERT-403**
4. **BUG-HOMEWORK-HISTORY-INSERT-403**

После закрытия P0+P1 — можно отдавать пользователям.

Всё остальное (логин, профиль, ДЗ, чат, прогресс, token-expiry, save→reload→data на месте) — работает.
