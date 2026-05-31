# Recon: callsites syncPvlActorsFromGarden, `_pvlGardenApplicantsSynced` lifecycle, getUsers → studentProfiles фильтры

**Дата:** 2026-05-29
**Сессия:** 163
**Режим:** READ-ONLY
**Триггер:** _162 вердикт — `getMentorMenteeIds()` возвращает `[]` потому что оба источника пусты. Гипотеза о корне выше — `syncPvlActorsFromGarden` не вызывается, не доходит до hydrate, или `db.studentProfiles` не заполняется её 3 menti. Network подтверждает: НЕТ запросов к `pvl_students` и `pvl_garden_mentor_links` под её JWT — только её собственный profile.

**Главный вывод вперёд:** в коде нет role-gate на mentor — sync вызывается для всех. Корень почти точно лежит на уровне БД: **RLS на `profiles` отдаёт Василине только её собственную строку**, потому что её `access_status != 'active'`. Это каскадно валит всё остальное. Подробности и доказательная цепочка ниже.

---

## Раздел 1 — Callsites `syncPvlActorsFromGarden` + guards + early-return ветки

### 1.1 Все callsites (6 штук)

| # | Файл:строка | Контекст | Guard / условие |
|---|---|---|---|
| 1 | [views/PvlPrototypeApp.jsx:7009](views/PvlPrototypeApp.jsx#L7009) | `AdminStudents` useEffect on mount | без role-check |
| 2 | [views/PvlPrototypeApp.jsx:7267](views/PvlPrototypeApp.jsx#L7267) | `AdminMentors` useEffect on mount | без role-check |
| 3 | [views/PvlPrototypeApp.jsx:8197](views/PvlPrototypeApp.jsx#L8197) | Основная инициализация PvlPrototypeApp (первый sync) | без role-check; вызывается для ВСЕХ ролей |
| 4 | [views/PvlPrototypeApp.jsx:8213](views/PvlPrototypeApp.jsx#L8213) | Повторный sync через ~600 мс | guard `if (!embeddedInGarden) return;` (8209) |
| 5 | [views/PvlPrototypeApp.jsx:8228](views/PvlPrototypeApp.jsx#L8228) | Периодический refresh каждые 30 сек | без role-check |
| 6 | [views/PvlStudentTrackerView.jsx:528](views/PvlStudentTrackerView.jsx#L528) | Hydrate при изменении mentorUserId | срабатывает в контексте ментора |

**Вывод:** для Василины sync ОБЯЗАН вызваться (минимум callsite #3 при заходе в `/pvl`). **Role-gate'а нет** — её роль mentor не блокирует sync.

### 1.2 Все early-return / throw ветки внутри `syncPvlActorsFromGarden`
**Файл:** [services/pvlMockApi.js:1183-1426](services/pvlMockApi.js#L1183)

| Строка | Условие | Возврат | Влияние |
|---|---|---|---|
| 1190-1221 | SWR cache / retry network 3× с backoff (0/100/200 мс) | продолжает | если network упал — ставит `users = []` |
| **1222** | `!Array.isArray(users) \|\| users.length === 0` | **`{ synced: false, reason: 'no_users' }`** | **EARLY EXIT** — `db.studentProfiles` НЕ заполняется |
| 1337 | `pvlTrackMembers.length === 0` | продолжает | ставит `_pvlGardenApplicantsSynced = false` |
| 1343 | `hydrateGardenMentorAssignmentsFromDb()` в try/catch | silent fail | дальше работает, но menteeIds не подтянутся |
| 1371-1395 | `syncTrackerAndHomeworkFromDb()` в try/catch | silent fail | НЕ блокирует остальное |
| 1404-1425 | top-level try/catch | `{ synced: false, reason: 'error' }` | last-resort выход с error reporter |

**Критическое узкое горло:** строка 1222. Если `api.getUsers()` вернул пустой массив или не-массив → весь sync схлопывается, `db.studentProfiles` остаётся `[]`, hydrate не вызывается. Это объясняет отсутствие сетевых запросов к `pvl_students`/`pvl_garden_mentor_links`.

---

## Раздел 2 — Lifecycle `_pvlGardenApplicantsSynced`

### 2.1 Где SET
- [services/pvlMockApi.js:1337](services/pvlMockApi.js#L1337):
  ```js
  db._pvlGardenApplicantsSynced = pvlTrackMembers.length > 0;
  ```
  → `true` если хоть один track-member нашёлся; `false` иначе. Если sync упал на early-return 1222 — эта строка вообще не достигается.

### 2.2 Где READ (6 точек)
1. [views/PvlPrototypeApp.jsx:4002](views/PvlPrototypeApp.jsx#L4002) — useMemo deps в `MentorMenteesPanel`
2. [views/PvlPrototypeApp.jsx:4031](views/PvlPrototypeApp.jsx#L4031) — useMemo deps в `MentorDashboard`
3. [services/pvlMockApi.js:1954](services/pvlMockApi.js#L1954) — фильтр в `getMentorMenteeIds` (отрезает seed-демо-IDs)
4. [services/pvlMockApi.js:1970](services/pvlMockApi.js#L1970) — фильтр в `buildMentorCohortApplicantRows`
5. [services/pvlMockApi.js:3213](services/pvlMockApi.js#L3213) — фильтр в `getMentorMentees` (отрезает seed)
6. [services/pvlMockApi.js:3837](services/pvlMockApi.js#L3837) — ещё один потребитель

### 2.3 Влияние на UI
Когда флаг меняется `false → true` после успешного sync — useMemo в `MentorMenteesPanel` и `MentorDashboard` пересчитывается, `buildMentorMenteeRows` запускается заново. Это правильный механизм для гонки sync ↔ render (см. комментарий [PvlPrototypeApp.jsx:3993-3996](views/PvlPrototypeApp.jsx#L3993)).

**У Василины этот переход никогда не происходит:** если sync вылетает на 1222, флаг не выставляется (остаётся `undefined`/`false`), useMemo деп не дрогнет, fallback ветка `_pvlGardenApplicantsSynced=true` для отсечения seed-демо тоже не активируется — но это не важно, потому что и `mentorProfile.menteeIds`, и `studentProfiles` всё равно пусты.

---

## Раздел 3 — getUsers → db.studentProfiles цепочка

### 3.1 Цепочка fetch
1. **Caller:** [services/pvlMockApi.js:1215](services/pvlMockApi.js#L1215) → `api.getUsers()`
2. **`api`:** [services/dataService.js:1786](services/dataService.js#L1786) — в продакшене это `RemoteApiService`
3. **`RemoteApiService.getUsers()`:** [services/dataService.js:1568-1572](services/dataService.js#L1568)
   ```js
   async getUsers() {
       return this._cachedFetch('users', async () => {
           const { data } = await postgrestFetch('profiles', { select: '*' });
           return (data || []).map((profile) => this._normalizeProfile(profile));
       });
   }
   ```
   Endpoint: `GET /profiles?select=*`, JWT в заголовке (см. dataService.js:44).

### 3.2 RLS на profiles (КРИТИЧНО)
**Файл:** [migrations/2026-05-18_phase35_profiles_self_read_rls.sql:44-51](migrations/2026-05-18_phase35_profiles_self_read_rls.sql#L44)

```sql
CREATE POLICY profiles_active_access_guard_select ON public.profiles
    AS RESTRICTIVE FOR SELECT TO authenticated
    USING (
        id = auth.uid()
        OR has_platform_access(auth.uid())
    );
```

`has_platform_access`: [migrations/2026-05-16_phase31_pending_approval_access.sql:110-126](migrations/2026-05-16_phase31_pending_approval_access.sql#L110)

```sql
CREATE OR REPLACE FUNCTION public.has_platform_access(target_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = target_user
      AND (p.role = 'admin' OR COALESCE(p.access_status, 'active') = 'active')
  );
$$;
```

**Юзер видит все строки `profiles` ТОЛЬКО если:**
- он admin, **ИЛИ**
- его собственный `access_status = 'active'`

Иначе видит лишь свою строку (`id = auth.uid()`).

### 3.3 Трансформации после fetch
- [services/pvlMockApi.js:1224-1239](services/pvlMockApi.js#L1224) — нормализация ролей и `classifyGardenProfileForPvlStudent`
- [utils/pvlGardenAdmission.js:48-72](utils/pvlGardenAdmission.js#L48) — возвращает `null` для staff (ментор/админ/куратор/leader) → они НЕ попадают в `pvlTrackMembers`
- [services/pvlMockApi.js:1278-1327](services/pvlMockApi.js#L1278) — цикл pushает каждого track-member'а в `db.studentProfiles`

### 3.4 Исключающие фильтры

| Фильтр | Где | Эффект |
|---|---|---|
| **RLS `access_status='active'` или admin** | [phase35_profiles_self_read_rls.sql:44](migrations/2026-05-18_phase35_profiles_self_read_rls.sql#L44) + [phase31_pending_approval_access.sql:110](migrations/2026-05-16_phase31_pending_approval_access.sql#L110) | Если `access_status != 'active'` и не admin — видна только своя строка |
| Staff role exclusion | [pvlGardenAdmission.js:37-49](utils/pvlGardenAdmission.js#L37) | Менторы/админы/leader'ы → НЕ в studentProfiles (это норма) |
| No-ID skip | [pvlMockApi.js:1279](services/pvlMockApi.js#L1279) | Профили без id отбрасываются |

### 3.5 Hardcoded UUID exclusions для её 3 menti — НЕТ
Грепнул по всему репо `d302b93d-5d29-4787-82d3-526dfe8c4a15`, `d128a7a3-2c1d-4ba9-92fa-cd72d69f9837`, `90c9b7c7-db13-41bd-b393-49d79fc571b1` — нигде не захардкожены. Никаких индивидуальных denylist'ов на них нет.

---

## Раздел 4 — Server-side check (PENDING — нужен запуск SQL)

Этот раздел требует прогона SQL через `gen_user psql` (у меня нет credentials в этом окружении). Пока пишу как **TODO для Ольги**.

### 4.1 Главный SQL для Василины (требуется)

```sql
-- (a) Её собственный access_status — это ключевая проверка
SELECT id, full_name, role, access_status
FROM profiles
WHERE id = '6cf385c3-…';  -- UUID Василины

-- (b) Денормализованный mentor_id у её 3 menti
SELECT id, full_name, mentor_id, status
FROM pvl_students
WHERE id IN ('d302b93d-5d29-4787-82d3-526dfe8c4a15',
             'd128a7a3-2c1d-4ba9-92fa-cd72d69f9837',
             '90c9b7c7-db13-41bd-b393-49d79fc571b1');

-- (c) Записи в линк-таблице
SELECT student_id, mentor_id, created_at, updated_at
FROM pvl_garden_mentor_links
WHERE student_id IN ('d302b93d-5d29-4787-82d3-526dfe8c4a15',
                     'd128a7a3-2c1d-4ba9-92fa-cd72d69f9837',
                     '90c9b7c7-db13-41bd-b393-49d79fc571b1')
   OR mentor_id = '6cf385c3-…';

-- (d) Сравнение с Юлей — чтобы подтвердить разницу в access_status
SELECT id, full_name, role, access_status
FROM profiles
WHERE full_name ILIKE '%Габрух%' OR full_name ILIKE '%Юля%';
```

### 4.2 Ожидаемые результаты по гипотезе
- (a) **`access_status` у Василины ≠ `'active'`** (вероятно `'paused_manual'`, `'paused_expired'`, `'pending_approval'` или NULL без дефолта)
- (d) у Юли `access_status = 'active'`

Если так — это исчерпывающе объясняет всё:
- RLS отдаёт Василине только её строку
- `pvlTrackMembers = []` → `db.studentProfiles = []`
- hydrate с `ids = []` → ранний `return` → нет сетевого запроса к `pvl_garden_mentor_links`
- `syncTrackerAndHomeworkFromDb` guard на `pvlTrackMembers.length > 0` → пропуск запроса к `pvl_students`
- Совпадает с DevTools: единственный запрос `profiles?id=eq.6cf385c3-…` (это её собственная строка)

Если (b) покажет `mentor_id = NULL` у её menti — это вторичная проблема (фея-кейс из _154), но **она бы не объяснила отсутствие запросов** — была бы видна попытка fetch и пустой ответ. Сейчас же запросов **вообще нет** — это указывает именно на RLS-блокировку выше по цепочке.

---

## ВЕРДИКТ

**Наиболее вероятный корень (доказательная цепочка):**

[migrations/2026-05-18_phase35_profiles_self_read_rls.sql:44-51](migrations/2026-05-18_phase35_profiles_self_read_rls.sql#L44) + [migrations/2026-05-16_phase31_pending_approval_access.sql:110-126](migrations/2026-05-16_phase31_pending_approval_access.sql#L110) — RLS на `profiles` пропускает чтение чужих строк только когда `access_status = 'active'` или `role = 'admin'`. Василина — ментор без `access_status='active'` → `api.getUsers()` возвращает массив с 1 строкой (только она сама).

**Каскад:**
1. [pvlMockApi.js:1215](services/pvlMockApi.js#L1215) `api.getUsers()` → 1 строка (только Василина) — но это не пустой массив, поэтому early-return 1222 НЕ срабатывает
2. [pvlMockApi.js:1224-1234](services/pvlMockApi.js#L1224) — она классифицируется как staff (ментор) → попадает в `mentors`, создаётся её `mentorProfile` с `menteeIds: []`
3. [pvlMockApi.js:1237](services/pvlMockApi.js#L1237) — `pvlTrackMembers = []` (она — staff, никаких applicant/student'ов в выдаче нет)
4. [pvlMockApi.js:1278-1327](services/pvlMockApi.js#L1278) — цикл по studentProfiles не запускается, `db.studentProfiles = []`
5. [pvlMockApi.js:1337](services/pvlMockApi.js#L1337) — `db._pvlGardenApplicantsSynced = false`
6. [pvlMockApi.js:1131](services/pvlMockApi.js#L1131) — `hydrateGardenMentorAssignmentsFromDb` ранний return, `ids.length === 0` → **нет сетевого запроса к `pvl_garden_mentor_links`** ✓ совпадает с DevTools
7. [pvlMockApi.js:1371-1372](services/pvlMockApi.js#L1371) — `syncTrackerAndHomeworkFromDb` guard `pvlTrackMembers.length > 0` → пропуск → **нет сетевого запроса к `pvl_students`** ✓ совпадает с DevTools
8. `getMentorMenteeIds(6cf385c3)` возвращает `[]`
9. UI: «Список менти пуст»

**Что отличает Юлю:** её `access_status = 'active'` (или она admin) → `has_platform_access` возвращает true → RLS отдаёт все строки `profiles` → `pvlTrackMembers` непустой → её menti попадают в `db.studentProfiles` → hydrate реально стучит в `pvl_garden_mentor_links`.

**Конкретное место провала:** RLS-полиси `profiles_active_access_guard_select` блокирует Василине чтение профилей менти из-за её собственного `access_status`. Не код во фронте — БД-уровень.

**Что подтвердить SQL'ом перед fix'ом** (Раздел 4 выше):
- (a) `profiles.access_status` для UUID `6cf385c3-…` — ожидаем НЕ `'active'`
- (d) у Юли — ожидаем `'active'`
- (b)+(c) — дополнительная диагностика; даже если они «нормальные», RLS-блокировка всё равно объясняет картинку

**Альтернативная (более слабая) гипотеза:** `access_status` нормальный, но RLS-функция `has_platform_access` имеет какой-то баг (например `SECURITY DEFINER` с неправильным search_path, или сама `profiles` строка Василины имеет NULL в `access_status` без COALESCE). Проверится той же SQL.

---

**Артефакт:** `docs/_session/2026-05-29_163_codeexec_recon_vasilina_sync_callsites.md`

**Следующий шаг (отдельной сессией):** Ольга прогоняет SQL из раздела 4.1, ты пишешь промпт на targeted fix исходя из результата:
- Если `access_status` ≠ `'active'` → fix на уровне БД (UPDATE profiles SET access_status='active' для Василины), либо обновление RLS
- Если `access_status = 'active'`, но запросов всё равно нет → есть третья шахта (наприм., JWT не передаётся в эту вкладку, или `pvlPostgrestApi.isEnabled()` возвращает false под её сессией)
