# _175 — fix: дашборд Потока 1 показывает выпускниц (фильтр абитуриенток) + cert-таргетинг

**Дата:** 2026-05-31. **Роль:** codeexec. **Режим:** RECON→FIX, diff-on-review.
**Статус:** diff готов, build зелёный, **НЕ закоммичено / НЕ применено на прод**. Жду 🟢.

---

## 1. RECON

### Как формируется список/счётчик
- Фронт: [AdminPvlProgress.jsx:491](../../views/AdminPvlProgress.jsx#L491) → `pvlPostgrestApi.getAdminProgressSummary(cohortId)` → RPC **`pvl_admin_progress_summary(p_cohort_id)`** ([pvlPostgrestApi.js:624](../../services/pvlPostgrestApi.js#L624)).
- Счётчик «29 студенток» = `rows.length` (computeTotals → `{total} студенток`, AdminPvlProgress.jsx:77/119). И список, и счётчик — из RPC. **Owner-слой = RPC.**
- RPC (phase25): `FROM pvl_students s ... WHERE s.cohort_id = p_cohort_id` — **без фильтра роли/статуса**, отдаёт ВСЕХ студентов когорты.

### Различитель (определён по живым данным, read-only psql под gen_user)
**Поток 1** (`11111111-1111-1111-1111-111111111101`, certification_open=`f`), 29 строк:

| profile_role | pvl_students.status | count |
|---|---|---|
| **applicant** (текущие абитуриентки) | active | **16** |
| **intern** (выпустившиеся) | active | **13** |

- `pvl_students.status` у всех = `active` → **НЕ различитель**.
- **Различитель = `profiles.role`**. Join: `profiles.id = pvl_students.id` (подтверждено комментом миграции phase32: `pvl_students.id = profiles.id`).
- ⚠️ **Нюанс vs формулировка ТЗ:** «лишние» 13 — это `role='intern'` (Стажер), а **не `leader`** (Ведущая). Глобально в `profiles`: leader 19, applicant 16, intern 13, mentor 7, admin 3 — но **leader'ов в `pvl_students` НЕТ вообще** (они не студенты). pvl_students = ровно эти 29, все в Потоке 1; Поток 2 пуст. Поэтому единственный role-фильтр, исключающий 13 «лишних» = **`role='applicant'`** (как и предполагал стратег). «Кто они» не перепроверял (по указанию Ольги).

**Реальных текущих абитуриенток в Потоке 1 = 16.**

---

## 2. FIX 1 — дашборд (RPC), owner-слой

Новый файл миграции **`migrations/2026-05-31_phase43_pvl_admin_progress_applicants_only.sql`** — `CREATE OR REPLACE FUNCTION pvl_admin_progress_summary`, идентичный phase25, +2 строки:
```sql
            FROM public.pvl_students s
+           JOIN public.profiles sp ON sp.id = s.id        -- профиль студента
            ...
            WHERE s.cohort_id = p_cohort_id
+             AND sp.role = 'applicant'                     -- только текущие абитуриентки
```
- **ДАННЫЕ НЕ меняются** (никаких UPDATE; cohort_id выпускниц не трогаем — только фильтр выборки). Фиксит и список, и счётчик разом (29→16).
- VERIFY V2 в файле — прямой count (не вызов RPC: под psql нет JWT, `is_admin()` бросит forbidden).
- **Деплой отдельный:** это DB-миграция, едет НЕ через FTP, а `psql -f` на прод (рецепт в шапке файла). Применять **только на 🟢**.

## 3. FIX 2 — cert-таргетинг (фронт)

### Проверка (step 3): получат ли выпускницы бланк? — **ДА, получили бы.**
- Бланк самооценки живёт на «Моей странице» = `/student/peer/<self-id>` → [PvlPeerProfileView.jsx:64](../../views/PvlPeerProfileView.jsx#L64) → `PvlCertificationBlock` (isSelf).
- Гейтинг блока ([PvlCertificationBlock.jsx:103-109](../../components/PvlCertificationBlock.jsx#L103)) = `isSelf/isMentor/isAdmin` + `certOpen` — **роли нет**. `getStudentCertificationOpen` читал только `certification_open` когорты.
- → intern на своей странице при открытом Потоке 1: `isSelf=true, certOpen=true` → **визард самооценки**, не LockedCard. Тот же различитель нужен здесь.

### Правка — [pvlPostgrestApi.js getStudentCertificationOpen](../../services/pvlPostgrestApi.js#L612) (build зелёный):
```diff
-    select: 'cohort_id,cohort:pvl_cohorts(certification_open)',
+    select: 'cohort_id,cohort:pvl_cohorts(certification_open),profile:profiles!inner(role)',
 ...
-    return Boolean(asArray(rows)[0]?.cohort?.certification_open);
+    const row = asArray(rows)[0];
+    return Boolean(row?.cohort?.certification_open) && row?.profile?.role === 'applicant';
```
- intern/leader → `certOpen=false` → **LockedCard** («приём откроется позже»), визард не монтируется. Fail-closed.
- Паттерн `profiles!inner(role)` — копия рабочего `listMyCohortPeers` (pvlPostgrestApi.js:789), FK уже известен PostgREST.
- Едет через FTP (обычный код).

---

## 4. Build
`npm run build` — **зелёный** (`✓ built in 4.35s`, postbuild `dist/reset/` OK). Менялся только `services/pvlPostgrestApi.js`.

## 5. Что трогали (рабочее дерево, НЕ закоммичено)
- `M services/pvlPostgrestApi.js` — cert-eligibility (Fix 2).
- `?? migrations/2026-05-31_phase43_pvl_admin_progress_applicants_only.sql` — RPC (Fix 1).
- (dist/ грязный после build — в коммит не идёт, CI билдит сам.)

## 6. Открытые вопросы / флаги (на решение перед 🟢)
1. **applicant→intern по ходу программы.** Фильтр `role='applicant'` исключает ЛЮБОГО intern. Если текущая абитуриентка позже станет Стажером (intern) в рамках Потока 1 — она пропадёт и из дашборда, и из права на бланк. Подтвердить, что это ОК (по словам Ольги 13 intern = именно выпустившиеся, не прогрессирующие текущие — тогда ОК).
2. **Blast-radius RPC** — общий для всех когорт, но непуста только Поток 1, так что сейчас затрагивает лишь её. На будущее: если заведут когорту, где interns = легитимные текущие студенты, фильтр их скроет.
3. **Defense-in-depth (опционально, P3):** Fix 2 — это UI-гейт. Жёсткий запрет сабмита бланка не-абитуриенткой держала бы RLS на INSERT в `pvl_student_certification_scores` (role='applicant'). Не в scope этой задачи — отдельным тикетом, если нужно.
4. **RLS-зависимость Fix 2:** `profiles!inner(role)` требует, чтобы RLS profiles отдавал role для own/menti (как уже делает listMyCohortPeers). Если вдруг не отдаст — `!inner` уронит строку → false → LockedCard (fail-closed, без падения).

## 7. Применение на 🟢 (план, НЕ выполнено)
1. **commit** (на 🟢): `services/pvlPostgrestApi.js` + `migrations/2026-05-31_phase43_*.sql`.
2. **PUSH** (отдельный 🟢) → CI FTP-деплой подхватит Fix 2 (фронт).
3. **psql apply** (отдельный 🟢) миграции Fix 1 на прод (RPC не деплоится через FTP). Без этого шага дашборд останется 29.
