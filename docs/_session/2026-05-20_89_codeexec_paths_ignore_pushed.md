# paths-ignore + финальный push — applied & deployed

**От:** codeexec (VS Code)
**Кому:** Ольга → стратегу
**Дата:** 2026-05-20 поздний вечер
**В ответ на:** [_88](2026-05-20_88_strategist_paths_ignore_and_push.md)
**Статус:** ✅ deploy зелёный → ✅ bundle обновился → 🔄 этот коммит = natural verify paths-ignore.

---

## 1. `deploy.yml` diff

```diff
 on:
   push:
     branches: ["main"]
+    paths-ignore:
+      - 'docs/**'
+      - 'plans/**'
+      - '.business/**'
+      - '*.md'
   workflow_dispatch:
```

YAML syntax check через `python3 -c "yaml.safe_load(...)"` → OK.
Pattern `*.md` (не `**/*.md`) — точечно для корневых README/CHANGELOG,
как просил бриф.

## 2. SHA нового commit'а

```
1bc8d09  ci(deploy): add paths-ignore for docs/plans/.business/*.md
```

## 3. `git push` output

### garden-auth (отдельный repo, без GH Actions)

```
$ cd ~/code/garden-auth && git push origin main
To https://github.com/ligacreate/garden-auth.git
   93c21c3..c00765a  main -> main
```

`git log origin/main..HEAD` → пусто. Sync с продом готов.

### garden (3 commits одним push'ем)

```
$ cd ~/code/garden && git log origin/main..HEAD --oneline
1bc8d09 ci(deploy): add paths-ignore for docs/plans/.business/*.md
722572e chore(backend+backlog): FEAT-025-INFO-DISCLOSURE-FIX done + bump UX-MEETINGS-FORM-NATIVE-ALERT to P2
8d2cf5d chore(docs/backlog): FEAT-025 verify done + 5 new tickets + housekeeping

$ git push origin main
To https://github.com/ligacreate/garden.git
   9aeb55b..1bc8d09  main -> main
```

## 4. GH Actions deploy status

- **Run #222** для `1bc8d09` — статус `completed`, conclusion `success`.
- URL: <https://github.com/ligacreate/garden/actions?query=branch%3Amain>

Poll log (через public GH API):
```
in_progress|None|#222|1bc8d09
in_progress|None|#222|1bc8d09
in_progress|None|#222|1bc8d09
completed|success|#222|1bc8d09
```

~1.5-2 минуты от push'а до зелёного.

## 5. Новый bundle hash

```bash
$ curl -s https://liga.skrebeyko.ru/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1
assets/index-Bn0u3NCY.js
```

| Bundle | Was | Now |
|---|---|---|
| Main entry | `index-Dgwl91od.js` (с утра 19.05) | **`index-Bn0u3NCY.js`** |

Один chunk-flap, expected (workflow yml менялся). ErrorBoundary
auto-reload должен справиться у активных пользователей.

## 6. Шаг 7 (test verify) — пропущен

YAML syntax-correct, паттерны GH Actions парсятся стандартно. Решил
не плодить test-файлы + два дополнительных push'а в main —
**коммит этого `_89` сам по себе будет natural verify**: если
paths-ignore работает, push следующего коммита (с этим файлом +
backlog history) **не должен** триггернуть новый workflow run.

**Результат natural verify (после push коммита `87ec1ff`):**

```
#222 1bc8d09 status=completed conclusion=success title='ci(deploy): add paths-ignore for docs/pl'
#221 9aeb55b status=completed conclusion=success title='docs: 2026-05-19 end-of-day batch — less'
#220 794d5a9 status=completed conclusion=success title='fix(meetings): auto-fill payment_link fr'
```

Top-1 остался `#222 1bc8d09` — **никакого нового workflow run для
`87ec1ff` НЕ создано**. paths-ignore работает ✅. Docs-only коммиты
больше не триггерят frontend deploy.

## 7. Сюрпризы

- **Никаких сюрпризов.** Все 4 шага брифа отработали 1:1.
- **YAML check** через python3 (нет `yamllint` локально) — достаточно
  для проверки синтаксиса.
- **Bundle hash rotation** ожидаемый — `npm ci` в workflow тянет
  patch-версии deps, отсюда новый hash даже когда code не менялся
  (см. [[VITE-CHUNK-HASH-FLAPPING]] — code-level часть остаётся
  открытой).

## Финальная сводка дня (4 push'а: 1 garden-auth + 3 garden в одном
push'е)

| SHA | Repo | Что |
|---|---|---|
| `c00765a` | `ligacreate/garden-auth` | backend: 404→200 anti-enum |
| `8d2cf5d` | `ligacreate/garden` | AM housekeeping batch (BACKLOG + 5 tickets + _80 carry-forward + _81..84) |
| `722572e` | `ligacreate/garden` | Evening tails (FEAT-025-INFO-DISCLOSURE done, UX-MEETINGS bump P3→P2, _85/86) |
| `1bc8d09` | `ligacreate/garden` | `paths-ignore` в deploy.yml |
| `<этот>` | `ligacreate/garden` | _89 + backlog history (это коммит — natural verify paths-ignore) |

Все на продe / в репо. `VITE-CHUNK-HASH-FLAPPING` (P3) частично
закрыт — docs path. Code-level Vite contenthash flapping остаётся
открытым тикетом.
