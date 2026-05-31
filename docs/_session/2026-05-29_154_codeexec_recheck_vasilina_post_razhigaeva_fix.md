# URGENT-RECHECK Василина — post-Razhigaeva-fix + post-daily-wipe

**Адресат:** Ольга (связной) → стратег.
**Автор:** VS Code Claude Code (codeexec).
**Дата:** 2026-05-29 16:55 МСК (recheck run ~16:48 МСК).
**Режим:** **read-only.** SSH + psql под gen_user, ssh + systemctl/log read. Никаких UPDATE/INSERT/DELETE.

**Контекст:**
- [_149](2026-05-28_149_codeexec_diagnose_vasilina_jwt_impersonation.md) — первый JWT-impersonation, вердикт «server чист».
- [_152](2026-05-29_152_codeexec_fix_razhigaeva_status_active.md) — apply Razhigaeva status `applicant→active` в 16:14:21 МСК.
- Сигнал от Василины 16:38 МСК: «утром работало (проверила 3 задания) → сейчас опять пусто (desktop + mobile)».

**Окно «утром OK → 16:38 пусто»:**
- ~16:08 МСК (13:08 UTC) — daily Timeweb ACL wipe.
- 16:14 МСК — наш UPDATE Razhigaeva + ensure_garden_grants().

---

## TL;DR — Вердикт

**Server-side абсолютно чист, 1-в-1 как в [_149](2026-05-28_149_codeexec_diagnose_vasilina_post_razhigaeva_fix.md). Никакой регрессии после Razhigaeva-fix и daily wipe не произошло.**

Под её JWT всё отдаётся: 3 линка, 3 pvl_students (все `active`), 58 profiles, 3 menti profiles (все `applicant`), `has_platform_access=true`, `is_mentor_for(каждая)=true`. Grants 166/4 (норма). RLS включён везде. Policies на месте (7 на pvl_students, включая `pvl_students_select_cohort_peer`).

**Откат Razhigaeva status НЕ произошёл** — `status='active'`, `updated_at=2026-05-29 16:14:21.72361+03` (наш COMMIT).

**Вывод:** если у Василины «утром работало → сейчас пусто», это **client-side**:
- Возможно SWR-cache `pvl_users_swr_v1` истёк (TTL=1 час) → reload → новый api.getUsers возвращает что-то странное под её JWT, который мог истечь / sliding-renew не сработал.
- Возможно SW invalidated, новый bundle подгрузился, init order сломан.
- Возможно auth-токен у неё истёк, и UI этого не показывает явно (показывает пустую учительскую вместо «войдите снова»).

**DevTools у Василины СТАЛИ необходимы.** Без живых сигналов client-side угадать нечем.

---

## 1. Current data state — что изменилось vs _149

### 1.1. pvl_students 3 menti

| id           | full_name        | cohort_id   | status | updated_at                    |
|--------------|------------------|-------------|--------|-------------------------------|
| d302b93d-…   | Лилия Мaлонг     | …101        | active | 2026-05-07 17:46:32.761478+03 |
| d128a7a3-…   | Марина Шульга    | …101        | active | 2026-05-07 17:46:32.761478+03 |
| 90c9b7c7-…   | Ольга Разжигаева | …101        | **active** | **2026-05-29 16:14:21.72361+03** |

✅ Ольга Р. **по-прежнему active**, никто не откатил. updated_at = 16:14:21 (наш COMMIT в [_152](2026-05-29_152_codeexec_fix_razhigaeva_status_active.md)).

### 1.2. profiles (3 menti + Василина)

| id           | name             | role      | access_status | status | updated_at |
|--------------|------------------|-----------|---------------|--------|------------|
| 6cf385c3-…   | Василина Лузина  | mentor    | active        | active | NULL       |
| d302b93d-…   | Лилия Мaлонг     | applicant | active        | active | NULL       |
| d128a7a3-…   | Марина Шульга    | applicant | active        | active | NULL       |
| 90c9b7c7-…   | Ольга Разжигаева | applicant | active        | active | NULL       |

✅ Идентично [_149](2026-05-28_149_codeexec_diagnose_vasilina_jwt_impersonation.md) + [_151](2026-05-29_151_codeexec_recon_vasilina_regression_window.md). Никаких изменений в profiles, никто не менял role/access_status/status. `updated_at=NULL` как и было (триггер на UPDATE не срабатывает потому что reset не было).

### 1.3. pvl_garden_mentor_links Василины

| student_id   | mentor_id   | updated_at                 |
|--------------|-------------|----------------------------|
| 90c9b7c7-…   | Vasilina    | 2026-05-18 14:33:38.086+03 |
| d128a7a3-…   | Vasilina    | 2026-04-17 16:19:22.896+03 |
| d302b93d-…   | Vasilina    | 2026-04-16 09:33:01.678+03 |

✅ Все 3 линка стабильны. Ни один не отвалился. Точно как в [_149](2026-05-28_149_codeexec_diagnose_vasilina_jwt_impersonation.md) и [_151](2026-05-29_151_codeexec_recon_vasilina_regression_window.md).

---

## 2. Grants count + RLS — wipe-recovery state

### 2.1. Grants

```sql
SELECT grantee, count(*) FROM information_schema.role_table_grants
WHERE grantee IN ('authenticated','web_anon') GROUP BY grantee;
```

| grantee       | grants_count |
|---------------|--------------|
| authenticated | **166**      |
| web_anon      | **4**        |

✅ **AUTH=166, ANON=4** — ровно ожидаемое. Daily wipe в 13:08 UTC прошёл, recover_grants.sh восстановил.

### 2.2. RLS state

```sql
SELECT relname, relrowsecurity FROM pg_class
WHERE relname IN ('pvl_garden_mentor_links','pvl_students','profiles',
                  'pvl_student_content_progress','pvl_student_homework_submissions');
```

Все 5 таблиц: `rls_enabled=t`, `rls_forced=f`. ✅ RLS включён.

### 2.3. Policies count

| Таблица                      | Policies |
|------------------------------|----------|
| pvl_garden_mentor_links      | 6        |
| pvl_students                 | **7**    (включая phase39 `pvl_students_select_cohort_peer`) |
| profiles                     | 6        |

✅ Все policies на месте, включая phase39. Никаких DROP'ов.

---

## 3. JWT-impersonation Василины (повтор _149)

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7","role":"authenticated"}';
```

### 3.1. pvl_garden_mentor_links по mentor_id

| student_id   | updated_at                 |
|--------------|----------------------------|
| 90c9b7c7-…   | 2026-05-18 14:33:38.086+03 |
| d128a7a3-…   | 2026-04-17 16:19:22.896+03 |
| d302b93d-…   | 2026-04-16 09:33:01.678+03 |

✅ **3 строки.** count total visible = 3. Идентично _149.

### 3.2. pvl_garden_mentor_links по student_id IN (3 menti) — PostgREST endpoint

| student_id   | mentor_id  | updated_at                 |
|--------------|------------|----------------------------|
| d302b93d-…   | Василина   | 2026-04-16 09:33:01.678+03 |
| d128a7a3-…   | Василина   | 2026-04-17 16:19:22.896+03 |
| 90c9b7c7-…   | Василина   | 2026-05-18 14:33:38.086+03 |

✅ **3 строки.**

### 3.3. pvl_students 3 menti

| id           | full_name        | status |
|--------------|------------------|--------|
| d302b93d-…   | Лилия Мaлонг     | active |
| d128a7a3-…   | Марина Шульга    | active |
| 90c9b7c7-…   | Ольга Разжигаева | **active** |

✅ **3 строки, все active.** Ольга Р. видна как active.

### 3.4. helpers

- `has_platform_access(Василина)` = **t** ✅
- `is_admin()` = **f** ✅
- `is_mentor_for(Лилия/Марина/Ольга Р.)` = **t/t/t** ✅

### 3.5. profiles

- `count(*)` под её JWT = **58** ✅
- Все 3 menti видны (role=applicant×3) ✅

---

## 4. recover_grants log за день

`/opt/garden-monitor/check_grants.sh` запускается **каждую минуту** по cron (root). Из syslog за последние ~30 минут:

```
13:15:01 UTC (16:15 МСК) — check_grants.sh
13:16:01 UTC ...
...
13:44:01 UTC (16:44 МСК) — check_grants.sh
```

✅ Cron работает. **НИ ОДНОГО** срабатывания `recover_grants.sh` в syslog — `check_grants.sh` не находил недостач, recovery не понадобилось. То есть после daily wipe ~13:08 UTC грантовая база восстановилась в течение минуты (вероятно первое сразу-после-wipe срабатывание check'а, до 13:15 — но в моём окне сэмпла не видно; видим только что СЕЙЧАС 166/4).

В `/opt/garden-monitor/` файла лога нет — скрипты пишут только в stdout (cron → syslog).

---

## 5. PostgREST состояние

`systemctl status postgrest` → `Unit postgrest.service could not be found.`

Постgrest **не запущен как systemd-юнит на этой VM**. На VPS Mysterious Bittern (5.129.251.56) запущены:

```
caddy.service          loaded active running  Caddy
garden-auth.service    loaded active running  Garden Auth Service
push-server.service    loaded active running  Garden Push Server
```

PostgREST у нас как Timeweb-managed (или на отдельном хосте, фронтит Caddy). Это **не регрессия** — так было всё время. Restart его проверить через systemctl не могу с этого хоста.

**Но:** факт что под JWT impersonation в БД политика и helper'ы работают **идентично _149** означает что **через PostgREST под её JWT тоже должен получаться идентичный результат** — те же 3 menti, те же 58 profiles. Если у неё API возвращает другое — это уже либо JWT её клиента невалидный, либо PostgREST schema cache устарел, либо proxy/caddy на пути.

---

## 6. ВЕРДИКТ

### 6.1. Server-side полностью идентичен _149

| Проверка                                           | _149 (вчера) | СЕЙЧАС (16:48 МСК) |
|----------------------------------------------------|--------------|---------------------|
| pvl_garden_mentor_links Василины по mentor_id      | 3 строки     | 3 строки ✅         |
| pvl_garden_mentor_links по student_id IN(3)        | 3 строки     | 3 строки ✅         |
| pvl_students 3 menti                                | 3 (1×applicant) | 3 (все active) ✅ (только Ольга Р. перешла в active) |
| profiles count visible                              | 58           | 58 ✅               |
| profiles 3 menti видны                              | 3            | 3 ✅                |
| has_platform_access(Василина)                       | true         | true ✅             |
| is_mentor_for(каждая)                               | true × 3     | true × 3 ✅         |
| RLS enabled (5 таблиц)                              | yes          | yes ✅              |
| Grants authenticated/web_anon                       | 166 / 4      | 166 / 4 ✅          |
| Policies count (mentor_links/pvl_students/profiles) | 6/7/6        | 6/7/6 ✅            |

**Никакого отката после _152 fix не произошло.** Daily wipe в 13:08 UTC отыгран recovery без потерь.

### 6.2. Razhigaeva status fix НЕ откатили

`status='active'`, `updated_at=2026-05-29 16:14:21.72361+03`. Наш COMMIT держится.

### 6.3. Откуда «утром работало → 16:38 пусто»

Раз server-side 100% identical и до, и после fix'а — **причина client-side**.

Кандидаты (приоритет от вероятного к менее):

1. **SWR-cache `pvl_users_swr_v1` (TTL=1 час) истёк** между «утром работало» и «16:38 пусто». При reload — fall на network → JWT её бровzера мог истечь / refresh не сработать → `api.getUsers()` возвращает {} или 401 → `users.length===0` → `syncPvlActorsFromGarden` уходит в `reason='no_users'` → hydrate не зовётся → пустой mentor view. К1 из [_151 §6.3](2026-05-29_151_codeexec_recon_vasilina_regression_window.md).
2. **SW invalidation + новый bundle.** Если её SW успел подтянуть bundle от 27 мая (eager import + revert auto-refresh), но что-то в её ситуации (network / mobile/desktop разный SW state) даёт partial init. К1 другая грань.
3. **JWT её бровzера истёк.** garden-auth держит её JWT, который имеет некоторое TTL (нужно проверить — но это вне scope этой recheck). Если JWT истёк, `api.getUsers()` под ним получает 401, и UI не показывает это явно, а just empty.
4. **К2 опровергнут** — Razhigaeva fix не вылечил Василину. Гипотеза «уникальная аномалия данных ломает frontend processing» не подтверждается.

### 6.4. Что нужно от Василины СЕЙЧАС

Для каждого кандидата нужны конкретные DevTools-сигналы (как просили в [_149 §6](2026-05-28_149_codeexec_diagnose_vasilina_jwt_impersonation.md)):

- **F12 → Network → filter `skrebeyko`**: ходит ли `GET /profiles?select=*`, какой status (200/401/`empty array`)? Какой URL у `GET /pvl_garden_mentor_links?student_id=in.(…)`?
- **F12 → Application → Local Storage** (origin `liga.skrebeyko.ru`): `pvl_users_swr_v1` — какой timestamp `ts`, сколько объектов в массиве `d`? Есть ли её 3 menti UUID? `garden_currentUser` — кто, role какая, есть ли JWT?
- **F12 → Application → Service Workers**: какой `SW_VERSION` активен?
- **F12 → Console**: любые `[PVL]` ошибки, 401/403/500.

**Без этих сигналов** дальше делать что-либо имеет смысл только в одном из режимов:
- (a) применить Pattern C' из [_150](2026-05-28_150_codeexec_fix_mentor_view_race_diff.md) (точечный gap-fix в hydrate) — лечит S1, S3 и часть S2 одновременно, но требует git-commit'а с code-review.
- (b) применить exit-fix дайки — увеличить SWR TTL pvl_users_swr_v1 с 1 часа до, например, 24 часов (одна строчка). Lo-risk, дает Василине шанс продолжить работу пока ищем настоящий root cause.

---

## 7. Что НЕ делал

- ⛔ Никаких UPDATE/INSERT/DELETE/ALTER.
- ⛔ Не откатывал Razhigaeva fix.
- ⛔ Не делал NOTIFY pgrst reload / ensure_garden_grants — это потребовало бы решения стратега.
- ⛔ Не делал git commit/push.
- ⛔ Не пробовал смоделировать её клиент.

Жду решения стратега: ловим DevTools у Василины (предпочтительно), или клон fix'а с (a)/(b).

---

**Артефакт:** [docs/_session/2026-05-29_154_codeexec_recheck_vasilina_post_razhigaeva_fix.md](garden/docs/_session/2026-05-29_154_codeexec_recheck_vasilina_post_razhigaeva_fix.md).
