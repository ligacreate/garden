---
title: HANDOVER 2026-05-03 session 3 — post-smoke fix in progress
type: handover
created: 2026-05-03
status: WIP — batch frontend fix in progress, step 2 of 8
related:
  - docs/MIGRATION_2026-05-02_security_restoration.md
  - docs/FRONTEND_PATCH_2026-05-02_jwt_fallback.md
  - docs/EXEC_2026-05-03_post_smoke_browser_full.md
  - docs/EXEC_2026-05-03_post_smoke_diag_403_inserts.md
  - plans/BACKLOG.md
---

# HANDOVER 2026-05-03 session 3

Чат стратега-claude.ai заполнялся. Этот документ — снимок состояния для продолжения с новой сессии.

---

## TL;DR

**SEC-001 (восстановление безопасности БД) на уровне DB+PostgREST+Caddy+frontend — закрыто.** Платформа открыта. Live smoke выявил 4 бага → собираем batch-фикс фронта (4 коммита в одном деплое). Сейчас в шаге 2 из 8 этого batch'а.

**Не пишем Насте о работе платформы**, пока batch не задеплоен и повторный smoke не чистый.

---

## Что сделано (хронология одной сессии 2026-05-02 → 03)

1. **Этап 1–2 SEC-001:** 14 SQL-фаз миграции применены к live-БД. 28 таблиц под RLS, +90 политик, –10 hardcoded дублей, helper `is_mentor_for(uuid)`. Полные EXEC-логи: `docs/EXEC_2026-05-02_phase*.md`.
2. **Phase 14.5 fix:** грант EXECUTE на `is_mentor_for` для `authenticated` явно (в фазе 3 декларативно был, но в `proacl` не отразился).
3. **Phase 15 smoke (read-only):** все 6 пунктов прошли.
4. **Этап 3 SEC-001:** PostgREST переключён на JWT-валидацию, `PGRST_DB_ANON_ROLE` сменён с `gen_user` на `web_anon`, garden-auth теперь выдаёт JWT с `role='authenticated'` и `sub=<uuid>`.
5. **Этап 4 SEC-001:** фронт-патч задеплоен (4 коммита: docs + 3 правки кода). Удалены оба latch-флага JWT-fallback, `Promise.all → allSettled` в App.jsx init, добавлен maintenance banner.
6. **Этап 5 SEC-001:** Caddy открыт (убрана 503-заглушка для api.skrebeyko.ru), platform live.
7. **Live smoke в браузере под 3 ролями** через Claude in Chrome (новый MCP-driven сценарий).

---

## Что нашёл live smoke (4 бага)

| ID | Что | Приоритет | Где |
|---|---|---|---|
| BUG-004 | Hard reload (Cmd+Shift+R) → белый экран. Service Worker stale cache. | P0 | `sw.js` или Vite-plugin |
| BUG-PVL-STUDENTS-RETRY = ARCH-012 hotfix | >200 ошибок 403 на `pvl_students` upsert/сессию из `ensurePvlStudentInDb`. RLS правильно блокирует не-admin. | P0 | `services/pvlMockApi.js` |
| BUG-005 | `pvl_audit_log` INSERT 403 от не-admin. PostgREST шлёт `Prefer: return=representation` → RETURNING неявно проверяет SELECT-policy `is_admin()`. | P1 | где формируется POST в audit_log (вероятно `pvlMockApi.js` или `pvlPostgrestApi.js`) |
| BUG-006 | `pvl_homework_status_history` INSERT 403. Фронт пишет `changed_by: null` вместо `currentUser.id`. RLS `WITH CHECK (changed_by = auth.uid() AND ...)` блокирует. | P1 | где меняется статус ДЗ ментором |

**Детали диагностики:**
- `docs/EXEC_2026-05-03_post_smoke_browser_full.md` — отчёт smoke
- `docs/EXEC_2026-05-03_post_smoke_diag_403_inserts.md` — диагностика 403
- `docs/lessons/2026-05-03-rls-returning-implies-select-policy.md` — урок про RETURNING+SELECT-policy
- `docs/lessons/2026-05-03-rls-insert-on-conflict-checks-insert-with-check.md` — урок про ON CONFLICT
- `docs/lessons/2026-05-03-pvl-student-questions-bad-uuid-rls-error-propagation.md` — урок про cast в RLS
- В backlog: BUG-001..BUG-006, ARCH-012

**Side-effect smoke:** статус ДЗ Екатерины Салама (`submission_id = ca7d193e-233f-495d-9dfd-f0144e3d5c8e`) был ошибочно переведён в `accepted` через PATCH (тестовое действие). История в `pvl_homework_status_history` НЕ создалась (BUG-006). **Откатили** в шаге 1 текущего batch'а — статус снова `in_review`.

---

## Текущая работа: batch frontend fix (8 шагов)

Запущена в migration-чате Claude Code. Полный промпт — в чате стратега, копия логики ниже.

| Шаг | Что | Статус |
|---|---|---|
| 1 | Откат submission Екатерины (UPDATE psql) | ✅ DONE |
| 2 | Pre-flight read файлов фронта (git, grep) | 🟡 в процессе, ждёт результат |
| 3 | Fix BUG-004 (SW network-first) | 🔴 TODO, после диффа от стратега |
| 4 | Fix BUG-PVL-STUDENTS-RETRY (ensure early-exit) | 🔴 TODO |
| 5 | Fix BUG-005 (Prefer: return=minimal) | 🔴 TODO |
| 6 | Fix BUG-006 (changed_by = currentUser.id) | 🔴 TODO |
| 7 | (Опционально) Fix BUG-003 (actor_user_id stub-id → currentUser.id) | 🔴 TODO if found in same file |
| 8 | git push, gh run watch, deploy verify | 🔴 TODO после явного 🟢 PUSH |

**Каждый шаг — пауза для diff-ревью. NO push без явного 🟢 PUSH от стратега.**

EXEC-лог batch'а сохраняется в `docs/EXEC_2026-05-03_post_smoke_batch_frontend_fix.md`.

---

## После батч-деплоя

1. **Повторный live smoke** через Claude in Chrome (тот же промпт что был — `EXEC_2026-05-03_post_smoke_browser_full.md`-style).
2. Если всё чисто — **написать Насте**: «Платформа открыта, выйди из старого сеанса в браузере и зайди заново.»
3. **SEC-001 в backlog → 🟢 DONE** с резюме результатов.
4. **Hygiene-хвосты** (можно растягивать на 24-48 ч):
   - SEC-002: сменить пароль Ольги (был использован в curl)
   - Сменить пароли тестовых аккаунтов (Настин фиксик / Настина фея)
   - `shred -u /tmp/pgrst_env.txt` на сервере 5.129.251.56

---

## Ключевые контакты в коде/инфре

- Сервер: `ssh root@5.129.251.56` (Mysterious Bittern, Timeweb Cloud)
- БД: managed Postgres 18.1, роль `gen_user` (owner)
- PostgREST: Docker-контейнер на 127.0.0.1:3000, JWT-валидация активна
- garden-auth: systemd, /opt/garden-auth/server.js на 127.0.0.1:3001
- Caddy: /etc/caddy/Caddyfile, проксирует api.* и auth.skrebeyko.ru
- Фронт: nginx на 185.215.4.44 (отдельная машина), деплой через GitHub Actions FTP
- Репо: ligacreate/garden (фронт), также ligacreate/garden-auth, garden-db, meetings

---

## Если открываешь новый чат со стратегом (claude.ai)

Скажи: «Открываю продолжение SEC-001 после live smoke. Прочитай `docs/HANDOVER_2026-05-03_session3.md`, потом `docs/EXEC_2026-05-03_post_smoke_browser_full.md` и `docs/EXEC_2026-05-03_post_smoke_diag_403_inserts.md`. Я в шаге 2 batch'а из 8, жду от Claude Code в migration-чате результат pre-flight read'а.»

Стратег прочтёт, восстановит контекст и продолжит с шагов 3-8.

---

## Если хочешь продолжить одна с Claude Code в migration-чате

Промпт у него уже полный (8 шагов с шаблонами коммитов). Что от тебя:
- Просматривать diff после каждого шага. Если выглядит разумно (правка узкая, не задевает лишнего, тест-имена/комментарии адекватны) — давать ему 🟢 на следующий fix.
- НЕ давать 🟢 PUSH пока все 4-5 коммитов готовы и ты их посмотрела.
- После push — ждать CI run, потом repeat live smoke через Claude in Chrome.

Если что-то выглядит странно или ты не уверена — стоп, не давай 🟢, открой новый чат стратега и перенеси diff туда.

---

## История изменений

- **2026-05-03 (v1.0):** Создан в момент исчерпания контекста стратега-чата. SEC-001 закрыт на DB/PostgREST/Caddy уровне, batch frontend fix в процессе, шаг 2 из 8.
