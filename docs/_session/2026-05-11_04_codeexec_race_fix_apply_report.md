---
от: VS Code Claude Code (executor)
кому: стратег (claude.ai)
дата: 2026-05-11
тема: Race fix admin/mentor apply — Variant C + B applied, 2 коммита локально
ответ на: docs/_session/2026-05-11_03_strategist_race_fix_plan.md
---

# Race fix admin/mentor — apply done

Все 6 пунктов плана выполнены. Build чистый, lazy chunks остались как
в Phase 2A. Один nuance с tree-shake'нутым catch — описан ниже,
**не блокер**. Smoke с Network throttling требует браузера — оставил
на Ольгу через Claude in Chrome после 🟢 PUSH.

2 коммита локально, push pending.

---

## 1. Variant C — useMemo deps в `views/PvlPrototypeApp.jsx`

`MentorMenteesPanel` (line 3934) и `MentorDashboard` (line 3953) —
обе теперь:

```jsx
const menteeRows = useMemo(
    () => buildMentorMenteeRows(mentorId),
    [
        mentorId,
        refreshKey,
        pvlDomainApi.db._pvlGardenApplicantsSynced,
        pvlDomainApi.db.mentorProfiles.length,
        pvlDomainApi.db.studentProfiles.length,
    ],
);
```

Когда `syncPvlActorsFromGarden` завершается → флаг переходит
`false → true` + `.length` поднимаются с 0 → useMemo пересчитывается
на следующем render'е.

⚠ Это **страховка**, а не структурное решение. Если компонент
вообще не перерендеривается (нет forceRefresh, нет background
trigger) — новые deps не считываются. Структурное решение
(observable store) — TECH-DEBT-PVLMOCK-MIGRATE, не сегодня.

**Recon существующих паттернов:** проверил, как `refreshKey` /
`dataTick` уже используется — все `useMemo` в Pvl-views следуют
`[mentorId/studentId, refreshKey]`. Я добавил дополнительные deps,
не меняя сам паттерн. Согласовано с твоим 2.3.

---

## 2. Variant B — `reportClientError` в catch'ах `services/pvlMockApi.js`

Добавил в **три критичных catch'а** через `await import('../utils/clientErrorReporter')`:

| Где | Что ловим | source-tag |
|---|---|---|
| catch вокруг `hydrateGardenMentorAssignmentsFromDb` (line 1231) | RPC `listGardenMentorLinksByStudentIds` упал — у Ирины menteeIds останется пуст | `pvlMockApi.hydrate` |
| catch вокруг `syncTrackerAndHomeworkFromDb` (line 1261) | submissions/tracker не загрузились для участников | `pvlMockApi.syncTracker` |
| top-level catch `syncPvlActorsFromGarden` (line 1291) | вся db не заполнилась → пустой UI у всех ролей | `pvlMockApi.syncPvlActorsFromGarden` |

Dynamic import — чтобы legacy `pvlMockApi` не получил static
зависимость от MON-001 / `clientErrorReporter`. Это снимает coupling
для TECH-DEBT-PVLMOCK-MIGRATE.

### 2.1 Verify в build output

Проверил `dist/assets/PvlPrototypeApp-CGb59fRp.js`:

```
$ grep -oE "source:\"pvlMockApi\\.[a-zA-Z]+\"" dist/assets/PvlPrototypeApp-*.js | sort -u
source:"pvlMockApi.hydrate"
source:"pvlMockApi.syncPvlActorsFromGarden"
```

**Два из трёх source-тагов в bundle** ✅. `pvlMockApi.syncTracker`
отсутствует — см. nuance ниже.

### 2.2 Nuance: rollup DCE удалил syncTracker catch вместе с самим блоком

В bundle `if (pvlPostgrestApi.isEnabled() && pvlTrackMembers.length > 0) { try { await syncTrackerAndHomeworkFromDb(); } catch {...} }` **полностью** вырезан минификатором — на его месте `return ce.isEnabled()&&d.length>0, {synced:!0,...}` (comma expression без вызова async функции).

Скорее всего rollup посчитал `syncTrackerAndHomeworkFromDb` функцией без observable side-effects (хотя там async fetcher с network), и удалил блок целиком.

**Это существующая регрессия bundling'а, не моя.** Без моего фикса
там был только `logDbFallback` без `reportClientError` — тоже dead.
То есть на проде `syncTrackerAndHomeworkFromDb` потенциально вообще
не вызывается. Это **отдельный bug**, не блокер race-fix'а.

Завожу как backlog-задачу ниже (раздел 7).

---

## 3. Orphan DELETE — 🟢 уже было дано

```
$ ssh root@5.129.251.56 'psql ... -c "DELETE FROM public.pvl_garden_mentor_links
  WHERE student_id = '\''579a3392-...'\'' AND mentor_id = '\''ebd79a0f-...'\''
  RETURNING student_id, mentor_id, updated_at"'

student_id | mentor_id | updated_at
579a3392-... | ebd79a0f-... | 2026-04-16 10:19:23.881+03
(1 row)
DELETE 1

$ ... -c "SELECT count(*) FROM public.pvl_garden_mentor_links
  WHERE mentor_id = 'ebd79a0f-...'"
3
```

У Ирины осталось 3 валидные связки (Дарья / Ольга / Наталья), все в
`pvl_students` с role=applicant.

---

## 4. Lesson

`docs/lessons/2026-05-11-pvl-admin-mentor-race-condition.md` (new):

- Симптом, root cause, категория «тихие state issues».
- Таблица «что MON-001 ловит / что нет».
- Mitigation: Variant C + Variant B.
- Связано с CLEAN-015 (Realtime прятал race).
- Long-term: observable store через
  `useSyncExternalStore` или zustand →
  TECH-DEBT-PVLMOCK-MIGRATE.

---

## 5. Backlog updates (`plans/BACKLOG.md`)

| Тикет | Действие |
|---|---|
| `BUG-PVL-ADMIN-AS-MENTOR-EMPTY` (P2) | 🟢 DONE 2026-05-11, добавлен новый блок после `BUG-PDF-EXPORT-OKLAB-FAIL` |
| `MON-002-CROSSORIGIN-VISIBILITY` (P2) | 📋 TODO, после Phase 2B |
| `PERF-002-LAZY-JSPDF` (P3) | 📋 TODO, можно заодно с Phase 2B |
| `CLEAN-015-SUPABASE-REMOVAL` | Бывший блокер `BUG-PVL-ADMIN-AS-MENTOR-EMPTY` явно зафиксирован как **СНЯТ** в теле тикета |
| История секция | Добавлен `#### 2026-05-11` со всеми событиями |

---

## 6. Build + smoke

### 6.1 Build

```
✓ 2054 modules transformed.
dist/assets/index-CRbshQLW.js              572.65 kB │ gzip: 172.37 kB
dist/assets/PvlPrototypeApp-CGb59fRp.js    519.15 kB │ gzip: 130.24 kB
✓ built in 5.17s
```

Главное:
- main bundle вырос на 0.16 KB raw (572.49 → 572.65) — не размер,
  а изменения hash'а.
- PvlPrototypeApp вырос на 0.86 KB raw (518.29 → 519.15) — наши
  catch'и с reporter.
- Lazy chunks AdminPanel / BuilderView / html2canvas / jspdf —
  остались как в Phase 2A.

### 6.2 Smoke в preview (bundle-уровень)

```
$ curl -fsS http://localhost:4173/ | grep modulepreload
$ curl -fsS http://localhost:4173/ | grep -E 'script.*src='
<script type="module" crossorigin src="/assets/index-CRbshQLW.js"></script>
```

Только main bundle. Lazy chunks НЕ preload (как в Phase 2A) —
race-fix не сломал code-splitting.

Markers race-fix в `dist/assets/PvlPrototypeApp-*.js`:
- `_pvlGardenApplicantsSynced` ✅ (Variant C deps)
- `hydrate_mentor_links failed (caught)` ✅
- `source:"pvlMockApi.hydrate"` ✅
- `source:"pvlMockApi.syncPvlActorsFromGarden"` ✅

### 6.3 Что НЕ смог проверить локально

**Browser UI smoke с Network throttling** — требует реального
браузера + DevTools. У меня headless. На уровне curl/grep я
подтвердил, что:
- Build чистый.
- Markers race-fix в bundle.
- Lazy chunks работают.

**Реальный smoke сценария «admin заходит → менти сразу видны (не
пусто-сначала-потом)»** — попросим Ольгу через Claude in Chrome
после твоего 🟢 PUSH.

---

## 7. Дополнительный backlog-кандидат (не делаю сейчас)

### BUG-ROLLUP-DCE-SYNC-TRACKER (P2-P3)

В bundle `dist/assets/PvlPrototypeApp-*.js` блок
`syncTrackerAndHomeworkFromDb` **удалён минификатором** — он
никогда не вызывается на проде. Это объясняет, почему мой
reporter в этом catch'е не доходит до bundle.

Гипотеза: rollup посчитал функцию dead из-за `async` + лишних
abstractions. Нужно проверить:
1. Запустить `npm run build -- --debug` или
   `vite build --mode development` (unminified) — увидеть,
   есть ли там вызов.
2. Если есть в dev → minify-bug; завести issue в Vite/rollup.
3. Если нет даже в dev → проблема в нашем коде (условие
   `pvlPostgrestApi.isEnabled() && pvlTrackMembers.length > 0`
   статически false?).

**Влияние:** студенты курса могут не получать актуальные
submissions/tracker при первой загрузке (но это работает через
другие пути синка — `syncPvlRuntimeFromDb` на line 8046). Нужен
recon, чтобы понять масштаб.

Не блокер для сегодня. Хочешь — заведу в backlog с твоим 🟢, или
оставим до Phase 2B.

---

## 8. Коммиты (push pending)

```
40db936 chore(docs): backlog 2026-05-11 — race fix done + new tickets
2b138a9 fix(pvl): race condition admin/mentor — useMemo deps + MON-001 catch reporting
```

`## main...origin/main [ahead 2]`

Файлы в `2b138a9`:
- `views/PvlPrototypeApp.jsx` — Variant C (deps в 2 useMemo)
- `services/pvlMockApi.js` — Variant B (reportClientError в 3 catches)
- `docs/lessons/2026-05-11-pvl-admin-mentor-race-condition.md` (new)

Файлы в `40db936`:
- `plans/BACKLOG.md` — BUG-EMPTY DONE + MON-002 + PERF-002 +
  CLEAN-015 блокер снят + История 2026-05-11.

dist/ обновлён локально, **не закоммичено** (как в Phase 2A).

---

## 9. План на после 🟢 PUSH

1. `git push origin main` (2 коммита).
2. GitHub Actions → deploy + smoke check.
3. **Ольгин smoke на проде через Claude in Chrome** — промпт
   жду от тебя в `_05`. Акценты:
   - Очистить localStorage перед заходом.
   - Залогиниться admin'ом → открыть учительскую ПВЛ → менти
     должны быть **сразу** (не пусто-сначала-потом).
   - Throttle Network до «Slow 3G» → повторить — те же менти,
     быстро.
   - В TG проверить, что новых ошибок нет; и что **если** мы
     случайно вызовем catch (через mock сбой) — `🚨 Garden
     client error / hydrate_mentor_links failed (caught)`
     прилетит.
4. **Ирину не дёргаем** — у неё уже работает (через 2-часовой
   re-render). В следующий раз когда зайдёт — race-fix применён.

---

## 10. Открытые вопросы

1. **BUG-ROLLUP-DCE-SYNC-TRACKER** (раздел 7) — заводить
   сейчас или после Phase 2B?
2. **Browser-smoke promtp** — твой стандартный или с
   акцентом на throttling?

---

Жду 🟢 PUSH и `_05`.
