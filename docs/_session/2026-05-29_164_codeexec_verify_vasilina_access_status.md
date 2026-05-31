# Verify: гипотеза _163 (access_status Василины блокирует RLS) — ОПРОВЕРГНУТА

**Дата:** 2026-05-29 (исполнено 2026-05-30)
**Сессия:** 164
**Режим:** READ-ONLY (ничего не менял)
**Контекст:** _163 предположила, что у Василины `access_status != 'active'` → RLS на `profiles` отдаёт ей только её собственную строку → каскад валит весь mentor view. Я выполнил SQL через `ssh root@5.129.251.56 → psql 337a9e20fbb7b82646fd9413.twc1.net` под `gen_user`.

**Главный результат:** access_status у всех трёх менторов = `'active'`. Гипотеза _163 умерла. Картина даже глубже не сходится: на уровне БД и RLS всё корректно для Василины — она ДОЛЖНА видеть и menti, и линки. Корень регрессии где-то ещё (скорее всего JWT / SWR cache / frontend-ветка).

---

## Раздел 1 — access_status: Василина vs Юля vs Лена

```
id                                  | name             | email                        | role   | access_status | status
6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7 | Василина Лузина  | vasilina_luzina@mail.ru      | mentor | active        | active
0e779c13-4cf8-48f7-9dd0-caa8da9a0d72 | Елена Федотова   | tolstokulakova77@mail.ru     | mentor | active        | active
492e5d3d-81c7-41d8-8cef-5a603e1389e6 | Юлия Габрух      | lyulya777@inbox.ru           | mentor | active        | active
```

Все трое — `access_status = 'active'`, `role = 'mentor'`. Юля/Лена работают, Василина — нет. **Разницы в этом столбце нет.** Гипотеза опровергнута.

`updated_at` пустой у всех трёх (не отображается) — записи давно не правились на уровне профиля.

### Бонус — её 3 menti, тоже целостно
```
id                                  | name              | role      | access_status | status
d302b93d-5d29-4787-82d3-526dfe8c4a15 | Лилия Мaлонг      | applicant | active        | active
d128a7a3-2c1d-4ba9-92fa-cd72d69f9837 | Марина Шульга     | applicant | active        | active
90c9b7c7-db13-41bd-b393-49d79fc571b1 | Ольга Разжигаева  | applicant | active        | active
```

RLS на profiles (`profiles_active_access_guard_select` RESTRICTIVE: `id = auth.uid() OR has_platform_access(auth.uid())`) — Василина проходит (`access_status='active'` → `has_platform_access=true`), все три menti должны быть видны.

### Линки в `pvl_garden_mentor_links` — все три на месте
```
student_id                          | mentor_id                            | updated_at
90c9b7c7-db13-41bd-b393-49d79fc571b1 | 6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7 | 2026-05-18 14:33:38.086+03
d128a7a3-2c1d-4ba9-92fa-cd72d69f9837 | 6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7 | 2026-04-17 16:19:22.896+03
d302b93d-5d29-4787-82d3-526dfe8c4a15 | 6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7 | 2026-04-16 09:33:01.678+03
```

### `pvl_students` — 3 строки есть, но `mentor_id` денормализованный пуст у всех
```
id                                  | full_name         | mentor_id | status | updated_at
d302b93d-5d29-4787-82d3-526dfe8c4a15 | Лилия Мaлонг      | (NULL)    | active | 2026-05-07 17:46:32.761+03
d128a7a3-2c1d-4ba9-92fa-cd72d69f9837 | Марина Шульга     | (NULL)    | active | 2026-05-07 17:46:32.761+03
90c9b7c7-db13-41bd-b393-49d79fc571b1 | Ольга Разжигаева  | (NULL)    | active | 2026-05-29 16:14:21.723+03
```

**Важное:** `mentor_id` NULL у всех трёх — это «фея-кейс» из _154 (path B через `studentProfile.mentorId === resolved` мёртв), но **path A через `pvl_garden_mentor_links` работает** (см. выше). Это не блокер — у Юли/Лены могут быть точно такие же NULL'ы, и у них всё работает.

### RLS на dependent tables — Василина проходит везде
- `pvl_students_select_own_or_mentor_or_admin` PERMISSIVE: `id = auth.uid() OR is_admin() OR is_mentor_for(id)` — для её 3 menti `is_mentor_for(d302b93d) = true` (т.к. в `pvl_garden_mentor_links` есть `(d302b93d, 6cf385c3)`) → пропускает ✓
- `pvl_students_active_access_guard_select` RESTRICTIVE: `has_platform_access(auth.uid())` ✓
- `pvl_garden_mentor_links_select_own_or_mentor_or_admin` PERMISSIVE: `student_id = auth.uid() OR mentor_id = auth.uid() OR is_admin()` → она `mentor_id` в 3 строках ✓
- `pvl_garden_mentor_links_active_access_guard_select` RESTRICTIVE: `has_platform_access(auth.uid())` ✓

**Под её JWT БД ДОЛЖНА вернуть и линки, и menti. Не возвращает (как сказал DevTools) — значит запрос либо вообще не уходит, либо уходит без её JWT.**

---

## Раздел 2 — audit log (что менялось около 29 мая)

### 2.1 Свежее: последние 20 событий по Василине / её menti

Полный лог в Раздел 3 артефакта _162 не нужен — выписываю ключевое:

- **2026-05-29 06:38–06:48** — Василина делает `mentor_review` (statuses: `revision_requested`, `accepted`) для всех трёх menti (`d302b93d` × 1, `d128a7a3` × 2). За 10 минут проверила несколько задач. **mentor view у неё в это время работал.**
- 2026-05-25 06:51–06:57 — она же, `mentor_review` для d302b93d
- 2026-05-25 06:56 — `mentor_review` для 90c9b7c7
- 2026-05-24 15:09 — `mentor_review` для d128a7a3
- 2026-05-21 — реакция на ranges Курдюковой и Разжигаевой

**Никаких событий вида `access_status_change`, `role_change`, `mentor_link_removed`, `student_mentor_unset` в логе нет.** Структурно её доступы не трогали.

### 2.2 Что было ПОСЛЕ 2026-05-29 06:48 (последнее её действие) до сейчас

```
2026-05-29 10:17:14 — actor=90c9b7c7 (Разжигаева), action=submit_task,
                       entity=task-ci-316effbd, "Student submitted task for review"
```

И всё. **Между 06:48 и текущим моментом — ни одного события, изменяющего её доступы, или её менти.**

### 2.3 Разжигаева, pvl_students.updated_at = 2026-05-29 16:14

Этого UPDATE'а в `pvl_audit_log` НЕТ — таблица audit'ит pvl-domain events (mentor_review, submit_task, etc.), но НЕ прямые UPDATE'ы на `pvl_students`. Этот таймстамп совпадает с файлом [_152 codeexec_fix_razhigaeva_status_active.md](docs/_session/2026-05-29_152_codeexec_fix_razhigaeva_status_active.md) — там был UPDATE статуса Разжигаевой на `active`. На Василину это влиять не должно: статус только Разжигаевой, и в нужную сторону.

---

## ВЕРДИКТ

**Гипотеза _163 — ОПРОВЕРГНУТА.** Не из-за `access_status` и не из-за RLS:
- ✅ Василины `access_status = 'active'`, `role = 'mentor'`
- ✅ Юли и Лены — то же самое; ни одна из них не отличается от Василины по этим столбцам
- ✅ Три её menti — `access_status = 'active'`, `role = 'applicant'`
- ✅ Три записи в `pvl_garden_mentor_links` существуют, корректно ссылаются на Василину
- ✅ RLS на profiles / pvl_students / pvl_garden_mentor_links под её JWT должны пропускать всё нужное (`has_platform_access=true`, `is_mentor_for=true` для каждого menti, `mentor_id=auth.uid()` для каждого линка)
- ✅ Audit log показывает её активную работу с menti 29 мая 06:38–06:48; в этот момент mentor view гарантированно работал
- ✅ Никаких изменений access_status / role / mentor_links после 29 мая 06:48

**Что осталось как факт:** Network под её JWT не делает запросов к `pvl_students` и `pvl_garden_mentor_links`. Видна только запрос её собственного профиля `profiles?id=eq.6cf385c3-…`. То есть **`api.getUsers()` либо не вызывается, либо отдаёт из SWR-кеша устаревший snapshot, и каскад дальше схлопывается до hydrate-skip + studentProfiles=[] (как разобрано в _163, но по другой причине)**.

### Куда копать на следующей сессии (новые шахты)

Приоритет 1 — **SWR cache stale**:
- `pvl_users_swr_v1` в её localStorage — что внутри? Если snapshot снят в момент, когда у Василины (или у её menti) был не-`active` access_status, и потом данные починили в БД, **TTL bump в _155** мог растянуть жизнь устаревшего snapshot'а.
- Проверка: распарсить её `localStorage.pvl_users_swr_v1` — есть ли там её 3 menti (`d302b93d`, `d128a7a3`, `90c9b7c7`)? Если нет — это причина.
- Что прошить: либо очистить её cache key руками (быстрый workaround), либо в коде форсированный re-fetch если cache не содержит ожидаемых ID, либо короткий TTL для mentor роли.

Приоритет 2 — **JWT под её сессией**:
- Действительно ли её Authorization header содержит её UUID в `sub`-claim?
- Не истёк ли JWT? (refresh цикл garden-auth)
- DevTools → запрос `profiles?id=eq.6cf385c3-…` — посмотреть Authorization header, декодировать payload (jwt.io / base64), сверить `sub` с её UUID и `exp` с now.

Приоритет 3 — **`pvlPostgrestApi.isEnabled()` под её сессией**:
- В _163 я не проверял, что эта функция возвращает true для её клиента. Если false — sync уходит в no-op без сетевых запросов.
- Зависит ли от LocalStorage флага, который мог сброситься?

Приоритет 4 (слабый) — **`canActAsCourseMentor` или классификатор**:
- Если в normalize её профиль почему-то не получает `role: 'mentor'` (а, скажем, `role: 'ментор'` в кириллице не нормализуется), она НЕ попадает в `mentors`, её `mentorProfile` не создаётся, и в `db.mentorProfiles` под её ID ничего нет → `getMentorMenteeIds → fromMentorProfile = []`. Юля/Лена могут проходить нормализацию иначе (например, у них role в латинице, или статус другой). Проверка: дамп `pvlDomainApi.db.mentorProfiles` в её Console и поиск её UUID.

---

**Артефакт:** `docs/_session/2026-05-29_164_codeexec_verify_vasilina_access_status.md`

**Никаких правок не делал.** Жду от тебя решения, какую из 4-х шахт копать следующей сессией.
