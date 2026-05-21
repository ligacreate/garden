# BUG-PVL-SLOW-MATERIALS-LOAD — applied & deployed

**От:** codeexec (VS Code)
**Кому:** Ольга → стратегу
**Дата:** 2026-05-20 ночь
**В ответ на:** [_100](2026-05-20_100_strategist_pvl_slow_load_fix_brief.md)
**🟢 на diff:** [_101](2026-05-20_101_codeexec_pvl_slow_load_fix_diff.md)
**Статус:** Apply ✅ → build ✅ → commit ✅ → push ✅ →
deploy `#225 success` ✅. **Smoke в браузере — pending Ольгу**
(нет аутентифицированного admin browser'a у меня).

---

## 1. SHA commit

```
cb24ad5  fix(pvl): admin preview race + dashboard SWR + remove dup getUsers
```

`git show cb24ad5 --stat`:
```
views/AdminPanel.jsx       |  2 +-
views/AdminPvlProgress.jsx | 90 ++++++++++++++++++++++++++++++++++++++++++----
views/PvlPrototypeApp.jsx  | 59 ++++++++++++++++++++++++------
3 files changed, 134 insertions(+), 17 deletions(-)
```

Diff 1:1 совпадает с `_101` (порядок применения 3 → 1 → 2 → AdminPanel
prop как договорились). Без `--amend` / `--force` — один commit, один
push.

## 2. Apply trace

### Sub-task 3 (sub-task 3 первым, как договорились — самый
независимый):
1. SWR helpers + constants в `views/AdminPvlProgress.jsx`
   ([line 42-65](../views/AdminPvlProgress.jsx#L42)) после
   `SESSION_KEY_COHORT`.
2. Сигнатура `AdminPvlProgress` принимает `users = []`
   ([line 419](../views/AdminPvlProgress.jsx#L419)).
3. `listCohorts` useEffect — SWR read/write
   ([line 443-478](../views/AdminPvlProgress.jsx#L443)).
4. `getAdminProgressSummary` useEffect — SWR read/write
   ([line 480-500](../views/AdminPvlProgress.jsx#L480)).
5. Dashboard payload useEffect — SWR read/write, depends on `[cohortId]`
   ([line 502-572](../views/AdminPvlProgress.jsx#L502)).
6. `mentorsById` useEffect отделён от dashboard, depends on `[users]`
   props, fallback на `api.getUsers` если prop пустой
   ([line 574-600](../views/AdminPvlProgress.jsx#L574)).
7. `AdminPanel.jsx:780` — `<AdminPvlProgress users={users} hiddenIds={...} />`.

### Sub-task 1 (loader + watchdog):
8. State `actorsSyncReady` в `PvlPrototypeApp`
   ([line 8059-8061](../views/PvlPrototypeApp.jsx#L8059)).
9. Watchdog `setTimeout(5000)` + `setActorsSyncReady(true)` после
   первого `syncPvlActorsFromGarden` + cleanup `clearTimeout` в
   useEffect ([line 8091-8141](../views/PvlPrototypeApp.jsx#L8091)).
10. Guard `if (!actorsSyncReady) return <loader />` в admin preview
   branch ([line 7574-7584](../views/PvlPrototypeApp.jsx#L7574)).

### Sub-task 2 (banner):
11. `previewUser` lookup + `previewName` fallback chain
    ([line 7626-7629](../views/PvlPrototypeApp.jsx#L7626)).
12. `<>...<banner />...<StudentPage /></>` fragment с Info icon
    ([line 7630-7649](../views/PvlPrototypeApp.jsx#L7630)).

## 3. Build

```
npm run build
✓ 2057 modules transformed.
...
dist/assets/AdminPanel-DwcQBY4d.js          81.94 kB │ gzip:  20.84 kB  (was 80.98 kB / 20.44 kB)
dist/assets/PvlPrototypeApp-BaCIrnRw.js     522.42 kB │ gzip: 131.17 kB  (was 521.25 kB / 130.87 kB)
✓ built in 3.32s
```

- AdminPanel chunk: +0.96 KB (SWR helpers + новый useEffect для
  mentorsById через props).
- PvlPrototypeApp chunk: +1.17 KB (state + watchdog + guard + banner).
- Никаких новых imports / dependencies.
- Build без warnings про invalid `dangerouslySetInnerHTML` или React
  `children` mismatches.

## 4. GH Actions deploy

- **Run #225** для `cb24ad5` — статус `completed`, conclusion
  `success`.
- URL: <https://github.com/ligacreate/garden/actions?query=branch%3Amain>
- Poll log: `in_progress` ×N → `completed|success|#225|cb24ad5`.

### Bundle hash flip

```bash
$ curl -s https://liga.skrebeyko.ru/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1
assets/index-D1200kh0.js
```

| Bundle | Was (после `_94`) | Now |
|---|---|---|
| Main entry | `index-CTrlSsPw.js` | **`index-D1200kh0.js`** |

Один expected chunk-flap (code change в shared module).

## 5. Smoke план (по 5 пунктам из `_100`)

| # | Тест | Кто verify | Статус |
|---|---|---|---|
| 1 | `liga.skrebeyko.ru` в incognito, логин как admin | Ольга | ⏳ pending |
| 2 | Hard reload (Cmd+Shift+R) → новый bundle | Ольга | ⏳ |
| 3 | `/admin/library` → сначала loader → потом курс + header «Вы видите как ученица: <имя>», НЕ пустой курс | Ольга | ⏳ |
| 4 | `/admin/pvl` → подождать load → перейти `/admin/students` → вернуться `/admin/pvl` = instant (SWR hit в 5s window) | Ольга | ⏳ |
| 5 | Regression: студентка `/library` без `/admin/` префикса — никаких header'ов / loader'ов, работает как раньше | Ольга | ⏳ |

Auto-smoke от меня (CLI):
- ✅ build без warnings
- ✅ commit diff 1:1 с `_101`
- ✅ push прошёл (`d80cca5..cb24ad5`)
- ✅ deploy run `#225` создан и запущен (paths-ignore корректно
  triggernet — это code change, не docs)

## 6. Risks (из `_101`) — статус

| Risk | Митигация | Статус |
|---|---|---|
| #1 infinite loader если sync никогда не finish | 5s `setTimeout` watchdog → `setActorsSyncReady(true)` | ✅ applied |
| #2 header без имени | optional chaining + fallback chain `fullName → email → 'неизвестная ученица'` | ✅ applied |
| #3 SWR stale on mutation | TTL 5s короткий, manual refresh не bypass (по подтверждению Ольги в 🟢) | ✅ принят как trade-off |
| #4 refactor через props за scope | ✅ только 1 строка в AdminPanel | ✅ applied |

## 7. Сюрпризы

1. **Polling exit'нулся раньше времени** для отслеживания deploy:
   первый `case completed*` сработал на остаточный `#224 7c862ea`,
   до того как GH Actions создал run #225 для моего commit'a. Это
   мой косяк в shell-логике, не баг fix'a. Запустил второй polling
   с явным match `completed*cb24ad5*`.
2. **Никаких других сюрпризов** — все 10 правок применены чисто, build
   без warnings, размер бандла вырос в пределах ожидаемого (~2 KB
   суммарно), git diff соответствует `_101` 1:1.

## 8. Backlog обновлён

- `BUG-PVL-SLOW-MATERIALS-LOAD` — **🔴 TODO → ✅ DONE**, добавлена
  ссылка на SHA `cb24ad5` и build cost.
- Добавлен history block "2026-05-20 ночь +4" с описанием sub-tasks
  и упоминанием отложенных тикетов (PERF-CHECK-RPC, OBS-001-CADDY-LOG,
  CI-PATHSIGNORE-CLAUDE, UX-VIEW-AS-DROPDOWN).

## 9. Что НЕ сделано (по правилу)

- ❌ Не делал `--amend` / `--force` (правило).
- ❌ Не трогал `getFirstCohortStudentId()` логику (по бриф'у `_100`).
- ❌ Не правил admin-side форму, чек-листы, анкеты — out of scope.
- ❌ Не добавлял «View as» dropdown (P2, отдельный тикет).
- ❌ Не trace'ил deploy дважды — один commit, один push, один deploy.
- ❌ Не делал smoke под учёткой реальной ученицы (по бриф'у — только
  admin smoke когда Ольга в incognito).

## 10. Что дальше

- ⏳ **Ольга:** smoke по 5 пунктам в incognito браузере. Если все
  зелёные — fix officially DONE.
- ⏳ **Docs commit** этого `_102` + backlog update — отдельным
  следующим коммитом. Этот push НЕ должен триггерить deploy
  (только docs/plans, без `.claude/` — 6-й natural verify
  paths-ignore).
- Завтра: side-тикеты `OBS-001-CADDY-ACCESS-LOG` (10 мин),
  `PERF-CHECK-ADMIN-PROGRESS-SUMMARY-RPC`, `CI-PATHSIGNORE-CLAUDE` —
  когда удобно.
