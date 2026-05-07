---
title: HANDOVER 2026-05-07 — BUG-ADMIN-DELETE-USER закрыт + UX-QUICK-FIXES batch 1
type: handover
created: 2026-05-07
status: SESSION CLOSED — admin-delete RPC live, 1/5 CLEAN-013 удалён, хвосты определены
related:
  - plans/BACKLOG.md
  - migrations/2026-05-07_phase24_admin_delete_user_rpc.sql
  - docs/journal/HANDOVER_2026-05-06_session_feat002_garden.md
---

# HANDOVER 2026-05-07 — BUG-ADMIN-DELETE-USER + UX-QUICK-FIXES batch 1

Документ-снимок состояния для следующего стратега и Ольги при
возврате. Сессия 2026-05-07 закрыла BUG-ADMIN-DELETE-USER (P2),
запустила прогресс по CLEAN-013 (удалён 1/5 — Лена Ф), накопила
batch UX-фиксов в календаре PVL и завела пять новых карточек в
backlog (PROD-005, ARCH-014, INFRA-004, UX-QUICK-FIXES,
CONTRACT-GARDEN-MEETINGS-001).

---

## TL;DR

**BUG-ADMIN-DELETE-USER ЗАКРЫТ.** Две корневые причины: (1) на
`public.profiles` отсутствовала RLS-policy `FOR DELETE` →
silent no-op у админа в UI, (2) `postgrestFetch` падал на HTTP
204 No Content (PostgREST для `RETURNS void` RPC отдаёт пустое
тело, `response.json()` бросал `SyntaxError`). Решение:
**phase 24 миграция** с RPC `admin_delete_user_full(uuid)`
(SECURITY DEFINER, audit BEFORE delete) + **204-guard в
`postgrestFetch`** (generic-фикс) + UI-refetch на success.

**Smoke** (Claude in Chrome, Ольга): после первого commit'а
(`9fddae4`) backend работал, но refetch ловил 204-bug; после
второго commit'а (`f57d087`, 204-guard) — 5/5 PASS, Лена Ф
удалена через UI без F5.

**Параллельно:** прогресс по CLEAN-013 (1/5), удаление
сломанной кнопки «Смотреть запись» в карточках практикумов
PVL, удаление лишнего dev-style подзаголовка в календаре
PVL.

**Что осталось:** CLEAN-013 (4/5 — Рита готова к удалению,
LIlia MALONG dup готова к прямому DELETE без MERGE,
Настин-set ждёт решение Ольги, Екатерина Салама нуждается
в переподвешивании на реального ментора), новые карточки
PROD-005 / ARCH-014 / INFRA-004 / UX-QUICK-FIXES /
CONTRACT-GARDEN-MEETINGS-001.

---

## Что сделано (хронология сессии 2026-05-07)

### Часть 1 — Recon BUG-ADMIN-DELETE-USER + CLEAN-013

1. **Recon BUG-ADMIN-DELETE-USER** (read-only psql под `gen_user`).
   Установлено:
   - **На `public.profiles` нет policy `FOR DELETE`** — есть
     только insert_own, select_authenticated, update_own,
     update_admin. GRANT DELETE для `authenticated` есть, но
     без policy RLS режет любой DELETE до 0 rows → silent no-op.
   - **FK-карта на profiles**: только 2 FK (course_progress
     CASCADE, meetings без CASCADE).
   - **Связи без FK** (orphan-риск): `users_auth.id`,
     `pvl_students.id`, `pvl_garden_mentor_links` (student_id +
     mentor_id), `pvl_direct_messages` (3 колонки).

2. **Recon CLEAN-013 — verified hypothesis по дублю LIlia MALONG.**
   Read-only под gen_user. Гипотеза Ольги «случайная регистрация
   без значимой активности» **подтверждена**:
   - 8 строк `pvl_student_content_progress` у dup — все на
     материалах, которые main `d302b93d-…fa15` прошла на 100%
     (5 из 8 — `progress_percent=10` «открыл-ушёл»; 1 — 100%
     completed).
   - mentor_link у dup дублирует main (тот же mentor_id
     `6cf385c3-…`).
   - pvl_students у dup пустая (без cohort/mentor).
   - 1 audit-запись `library_complete` с пустым payload.
   - Решение: **прямой DELETE через RPC, MERGE отменён.**

3. **Recon активности 4 тестовых.** Под gen_user проверены
   реальные UUID (BACKLOG имел сокращённые `…`-префиксы):
   - **Лена Ф** (`037603f7-f215-4a49-8d5c-e5e1c93632fa`) — чистая
     для удаления.
   - **Рита** (`3746da91-…-dae6`) — чистая, готова к удалению.
   - **Настина фея** (`1085e06d-34ad-4e7e-b337-56a0c19cc43f`) —
     активность реальная (5 hw, 20 cont, 70 audit, 3 cprog).
   - **Настин фиксик** (`1b10d2ef-8504-4778-9b7b-5b04b24f8751`) —
     ⚠ числится фейк-ментором для **4 студентов**, включая
     **реального applicant Екатерину Салама**
     (`49c267b1-7ef6-48f6-bb2f-0e6741491b90`).

### Часть 2 — Apply phase 24 миграции

4. **Phase 24 миграция applied** под `gen_user` через ssh+psql:
   `migrations/2026-05-07_phase24_admin_delete_user_rpc.sql`.
   - RPC `public.admin_delete_user_full(uuid)`: SECURITY DEFINER,
     `SET search_path = public, pg_temp`, проверка `is_admin()`,
     audit BEFORE delete (запись в `pvl_audit_log` action
     `admin_delete_user_full`), удаление в порядке «дети →
     родители»: meetings → pvl_direct_messages →
     pvl_garden_mentor_links → pvl_students → users_auth →
     profiles.
   - GRANT EXECUTE для `authenticated`.
   - **RUNBOOK 1.3:** `SELECT public.ensure_garden_grants()`
     ДО `COMMIT` (защита от Timeweb DDL GRANT-wipeout, см.
     phase 23).
   - V1 (функция создана, SECURITY DEFINER), V2 (EXECUTE),
     V3 (158/4 grant counts) — все зелёные.
   - **NULL-guard sanity**: `SELECT admin_delete_user_full(NULL)`
     отдал `ERROR: p_user_id is null` (line 6 = первый RAISE,
     до `is_admin()` чека) — контракт RPC соблюдён.

### Часть 3 — Frontend patch (commit `9fddae4`)

5. **Frontend patch + UX batch 1, commit `9fddae4`** (3 файла +
   миграция):
   - `services/dataService.js` — `deleteUser` теперь шлёт
     `POST /rpc/admin_delete_user_full {p_user_id}` вместо
     прямого `DELETE /profiles?id=eq.…`.
   - `views/AdminPanel.jsx` — после успеха дёргает
     `onRefreshUsers()`, тост «Пользователь удалён» (без «обновите
     страницу»), читаемые тосты для `forbidden` / `p_user_id is
     null` / прочих ошибок.
   - `views/PvlCalendarBlock.jsx` — удалён developer-style
     `<p>` под заголовком «Записи проведённых практикумов».
   - `migrations/2026-05-07_phase24_admin_delete_user_rpc.sql` —
     добавлена в commit для аудит-следа (по конвенции phase 22 +
     phase 23).
   - **Реверт грязного коммита.** Первый `git commit` подхватил
     54 чужих docs/* ренейма из staged-индекса (кто-то ранее
     приготовил, забыл закоммитить). Откачено через
     `git reset --soft HEAD~1` + `git restore --staged docs/`,
     перекомичено только нужное.

6. **Smoke 1** (Claude in Chrome, Ольга): backend OK
   (POST /rpc/admin_delete_user_full → 204, профиль удалён в
   БД), но **`onRefreshUsers` не сработал** — Лена Ф осталась
   в DOM до F5.

### Часть 4 — Recon refetch-хвоста

7. **Recon корневой причины refetch-failure** (read-only,
   изучен код после commit `9fddae4`):
   - `onRefreshUsers` корректно destructured из props
     `AdminPanel` ([AdminPanel.jsx:482](views/AdminPanel.jsx#L482)),
     передаётся из App.jsx как `async () => { getUsers; setUsers;
     showNotification; }` ([App.jsx:497-501](App.jsx#L497-L501)).
     Используется без проблем на строках 739 и 1395.
   - **Реальная причина:** [postgrestFetch](services/dataService.js#L33-L78)
     на строке 69 безусловно делает `await response.json()`.
     PostgREST для `RETURNS void` RPC возвращает HTTP 204 No
     Content с пустым телом → `response.json()` бросает
     `SyntaxError: Unexpected end of JSON input`.
   - Цепочка: POST → 204 → parse-throw → `await
     api.deleteUser()` бросает после уже выполненного DELETE →
     catch → error toast → `onRefreshUsers` НИКОГДА не вызван.
   - **Латентность:** та же проблема живёт у `deleteShopItem`
     ([dataService.js:1347](services/dataService.js#L1347)) и
     других DELETE без `returnRepresentation` (1916, 2004,
     2052, 2117, 2252, 2543) — там просто никто не замечал,
     потому что бэк успешно удалял, а UI обновлялся через
     другие механизмы.

### Часть 5 — Frontend patch round 2 (commit `f57d087`)

8. **Commit `f57d087`** (2 файла, generic-фикс):
   - `services/dataService.js` — добавлен 204-guard перед
     `response.json()`:
     ```js
     if (response.status === 204) {
         return { data: null };
     }
     ```
   - `views/PvlCalendarBlock.jsx` — удалена сломанная кнопка
     «Смотреть запись» (`<a href={ev.recordingUrl}>` где
     `recordingUrl` содержал embed-iframe HTML, не URL → 400
     от nginx). Embed-плеер в карточке остаётся. Также убран
     лишний import `ExternalLink` из `lucide-react`.

9. **Smoke 2** (после deploy `f57d087`): **5/5 PASS** через
   Claude in Chrome. Лена Ф удалена через UI без F5, тост
   «Пользователь удалён», список обновлён, профиль исчез из
   БД. Backend, frontend, refetch, UX — всё чисто.

### Часть 6 — BACKLOG обновление + HANDOVER

10. Обновлён `plans/BACKLOG.md`:
    - BUG-ADMIN-DELETE-USER → 🟢 DONE.
    - CLEAN-013 → 🟡 IN PROGRESS (1/5), статус каждого из
      5 кандидатов, отменён MERGE для дубля.
    - Добавлены 5 новых карточек: UX-QUICK-FIXES (P3,
      накопительная), INFRA-004 (P3, cache-headers index.html),
      ARCH-014 (P3, контрактные FK), PROD-005 (P2, soft vs
      hard delete), CONTRACT-GARDEN-MEETINGS-001 (P2
      documentation, `events.host_telegram NOT NULL и непуст`),
      BUG-MEETINGS-VK-BUTTON-OVERFLOW (HANDED OFF meetings).
    - Раздел История пополнен `#### 2026-05-07`.

---

## 2 коммита сессии (на main, push'нуты)

| Hash | Что | Файлы |
|---|---|---|
| `9fddae4` | fix: BUG-ADMIN-DELETE-USER — RPC + UI refetch + UX (подзаголовок календаря) | `migrations/2026-05-07_phase24_admin_delete_user_rpc.sql`, `services/dataService.js`, `views/AdminPanel.jsx`, `views/PvlCalendarBlock.jsx` |
| `f57d087` | fix: postgrestFetch — поддержка HTTP 204 + ux: убрать сломанную кнопку «Смотреть запись» | `services/dataService.js`, `views/PvlCalendarBlock.jsx` |

История создания первого коммита нечистая: исходный коммит
прихватил 54 чужих docs/* ренейма из давно-staged индекса.
Откачено через `git reset --soft HEAD~1` + `git restore
--staged docs/`, перекомичен чисто (нынешний `9fddae4`).
В push ушёл уже чистый коммит.

---

## Числа

- **Phase 24 миграция applied** под gen_user: V1/V2/V3 зелёные,
  158/4 grant counts стабильны (Timeweb DDL wipeout не
  сработал в этот раз).
- **NULL-guard sanity** для `admin_delete_user_full(NULL)` —
  бросает `22023 p_user_id is null` на line 6 (до `is_admin()`),
  контракт RPC соблюдён.
- **Smoke 1** (commit `9fddae4`): backend PASS, refetch FAIL
  (204-bug в postgrestFetch).
- **Smoke 2** (commit `f57d087`, 204-guard): **5/5 PASS** через
  Claude in Chrome, Лена Ф удалена через UI без F5.
- **CLEAN-013 удалено: 1 / 5 кандидатов** (Лена Ф).
- **Активность Лены Ф (perished с её удалением):** profile + auth
  + pvl_students + 1 mentor_link + 13 cont + 1 course + 1 chk +
  4 audit (orphan, остаются в audit-trail by design).
- **Изменения в коде:** 4 файла, +149 / -8 строк (commit `9fddae4`)
  + 2 файла, +3 / -12 строк (commit `f57d087`).

---

## Что закрыто

- **BUG-ADMIN-DELETE-USER** (P2). RPC + 204-guard + UI refetch.
- **CLEAN-013, 1/5** (Лена Ф удалена через UI).
- **UX-QUICK-FIXES batch 1** (2 пункта): подзаголовок календаря
  + кнопка «Смотреть запись».

---

## Что открыто (carry-forward)

| ID | Что | Приоритет | Где |
|---|---|---|---|
| CLEAN-013 (4/5) | Рита (готова к удалению), LIlia MALONG dup (готова к прямому DELETE), Настина фея + Настин фиксик (ждут решения Ольги), Екатерина Салама (переподвесить перед удалением Настин фиксик) | P2 | UI / psql |
| PROD-005 | Soft-delete vs hard-delete для реальных пользователей — продуктовое решение | P2 | продуктовый цикл |
| CONTRACT-GARDEN-MEETINGS-001 | `events.host_telegram NOT NULL и непуст` — живая документация контракта; verify-запрос периодически | P2 | health-check / smoke |
| ARCH-014 | Контрактные FK на 3 таблицах (`users_auth.id`, `pvl_students.id`, `pvl_garden_mentor_links.student_id`, `pvl_direct_messages.*`) + ON DELETE CASCADE на `meetings.user_id` | P3 | DDL-миграция |
| INFRA-004 | cache-headers index.html — `max-age=86400` слишком агрессивен; стандарт: hashed assets immutable, html no-cache | P3 | nginx-config на 185.215.4.44 |
| UX-QUICK-FIXES (cont.) | Layout 3 колонок в «Записи проведённых практикумов» — продуктовое решение Ольги | P3 | `views/PvlCalendarBlock.jsx` |
| BUG-MEETINGS-VK-BUTTON-OVERFLOW | Кнопка ВКонтакте подрезается + опечатка «Телеграмма» | P3 | репо `meetings` (HANDED OFF meetings-стратегу) |

Полные карточки — в `plans/BACKLOG.md`.

---

## Артефакты сессии

**Код:**
- `services/dataService.js` — `deleteUser` → POST RPC + 204-guard
  в `postgrestFetch`
- `views/AdminPanel.jsx` — refetch + читаемые тосты
- `views/PvlCalendarBlock.jsx` — удалён `<p>` (подзаголовок)
  и `<a>«Смотреть запись»` + import `ExternalLink`
- См. полные diff'ы: `git show 9fddae4`, `git show f57d087`

**Миграция:**
- `migrations/2026-05-07_phase24_admin_delete_user_rpc.sql` —
  RPC `admin_delete_user_full(uuid)` + RUNBOOK 1.3
  `ensure_garden_grants()` + V1-V3 verify

**Документация:**
- `plans/BACKLOG.md` — обновлены BUG-ADMIN-DELETE-USER, CLEAN-013;
  добавлены 5 новых карточек + History 2026-05-07.
- `docs/journal/HANDOVER_2026-05-07_session_admin_delete.md`
  (этот файл).

---

## Если продолжаешь CLEAN-013 (хвосты 4/5)

Заходишь в админ-панель `liga.skrebeyko.ru` под Ольгой, тестовых
пользователей удаляешь через UI кнопку-корзину (теперь работает,
RPC `admin_delete_user_full` через POST в admin-flow).

Порядок (предлагается):

1. **Рита** (`3746da91-5c66-4e91-9966-15643136dae6`) — чистая,
   удалить первой.
2. **LIlia MALONG dup** (`1431f70e-63bd-4709-803a-5643540fc759`) —
   verified hypothesis (см. recon-секцию выше). Прямой DELETE.
3. **Решение Ольги по Настин-set** (Настина фея + Настин
   фиксик): удалять или сохранить как фикстуры? Если удалять —
   **перед удалением Настин фиксик** переподвесить Екатерину
   Салама на реального ментора (или явное OK на потерю
   mentor_link).
4. **Финальная сверка** через Claude in Chrome: списки публичных
   ведущих + админская таблица не показывают тестовые профили.

После завершения — обновить CLEAN-013 → 🟢 DONE в BACKLOG.

---

## Если делаешь PROD-005 (soft-delete vs hard-delete)

Это продуктовое решение, не техническое. Нужен brief от Ольги:

- Готова ли потерять hard-delete как стандарт? (Сейчас
  `admin_delete_user_full` делает hard.)
- Какое значение в `profiles.status` для soft-delete?
  (`deleted` / `archived` / др.)
- Период удержания до hard-purge (если гибрид)?
- GDPR-аспект — право на забвение требует hard-purge в N
  дней после запроса; нужно решить на уровне политики
  платформы.

После решения — спроектировать `admin_archive_user(uuid)` или
модификацию существующего RPC + обновить frontend-фильтры
`getUsers` и публичные списки.

---

## Если делаешь ARCH-014 (контрактные FK)

DDL-миграция, P3. Скоп:

1. Recon — что сейчас (read-only под gen_user через
   `pg_constraint`).
2. Решение по `pvl_students.id`: добавить FK на `profiles(id)`
   с CASCADE — или явно отвергнуть (если pvl_students должен
   оставаться независимым агрегатом).
3. Аналогично для `users_auth.id`,
   `pvl_garden_mentor_links.student_id|mentor_id`,
   `pvl_direct_messages.author_user_id|mentor_id|student_id`.
4. Изменить `meetings.user_id` FK на `ON DELETE CASCADE` —
   или явно решить NO ACTION (зависит от PROD-005 — если
   реальный hard-delete не делается, FK без CASCADE
   приемлем).
5. После миграции — упростить `admin_delete_user_full`,
   убрать явные DELETE для таблиц, которые покрылись CASCADE.
6. Verify через тест-DELETE случайного профиля в транзакции
   с ROLLBACK.

ВАЖНО: DDL-миграция → RUNBOOK 1.3 (`ensure_garden_grants()`
ДО COMMIT).

---

## Если открываешь новый чат стратега (claude.ai)

Скажи: «Открываю продолжение после сессии 2026-05-07
BUG-ADMIN-DELETE-USER + CLEAN-013. Прочитай
`docs/journal/HANDOVER_2026-05-07_session_admin_delete.md`,
потом карточки CLEAN-013, BUG-ADMIN-DELETE-USER (DONE),
PROD-005, ARCH-014, INFRA-004, UX-QUICK-FIXES,
CONTRACT-GARDEN-MEETINGS-001 в `plans/BACKLOG.md`, и секцию
История 2026-05-07.»

Стратег прочтёт и восстановит контекст.

---

## Контакты в коде/инфре (актуальный снимок)

- Сервер: `ssh root@5.129.251.56` (Mysterious Bittern, Timeweb Cloud)
- БД: managed Postgres 18.1, роль `gen_user` (owner)
- PostgREST: Docker-контейнер на 127.0.0.1:3000, JWT-валидация active
- garden-auth: systemd, `/opt/garden-auth/server.js` на 127.0.0.1:3001
- Caddy: `/etc/caddy/Caddyfile`, проксирует api.* и auth.skrebeyko.ru
- Фронт Garden: nginx на 185.215.4.44, деплой через GitHub Actions FTP
- Cron-monitor: `/etc/cron.d/garden-monitor`, лог в
  `/var/log/garden-monitor.log`
- Stored procedures (актуальный список): `public.is_admin()`,
  `public.is_mentor_for(uuid)`, `public.ensure_garden_grants()`,
  `public.sync_meeting_to_event()`,
  `public.resync_events_for_user(uuid)`,
  `public.admin_delete_user_full(uuid)` ← **NEW phase 24**
- Репо: ligacreate/garden (фронт), ligacreate/garden-auth, garden-db,
  ligacreate/meetings

---

## История изменений документа

- **2026-05-07 (v1.0):** Создан в финале сессии 2026-05-07.
  BUG-ADMIN-DELETE-USER закрыт (RPC phase 24 + 204-guard +
  UI refetch + UX-batch 1), CLEAN-013 1/5 done, 5 новых
  карточек заведены (PROD-005, ARCH-014, INFRA-004,
  UX-QUICK-FIXES, CONTRACT-GARDEN-MEETINGS-001).
