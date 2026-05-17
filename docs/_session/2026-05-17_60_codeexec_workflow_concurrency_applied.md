# WORKFLOW-CONCURRENCY — applied + verified

**От:** codeexec (VS Code)
**Кому:** Ольга → стратегу
**Дата:** 2026-05-17
**В ответ на:** [_59_strategist_workflow_concurrency.md](2026-05-17_59_strategist_workflow_concurrency.md)
**Статус:** ✅ applied → ✅ concurrency proven через GH API → финальные SHA ниже после прохода обоих runs.

---

## Diff применён

`.github/workflows/deploy.yml`:
```diff
 on:
   push:
     branches: ["main"]
   workflow_dispatch:

+concurrency:
+  group: deploy-ftp
+  cancel-in-progress: false
+
 jobs:
```

`cancel-in-progress: false` — новые runs **ждут в очереди**, не отменяют текущий. Если бы было `true` — docs-коммит после code-коммита отменил бы deploy кода, что хуже текущего race'а.

---

## Verify механики (главное)

Сразу после первого push'а сделал второй (пустой) коммит. Через GitHub public REST API (репо публичный — токен не нужен) получил снапшот состояния runs:

```
#207  5edae95  'test: verify concurrency queueing'                          status='pending'      conclusion=None
#206  ca37309  'infra(workflow): add concurrency group to prevent FTP-deploy race'  status='in_progress'  conclusion=None
#205  89d4db0  'infra: increase grants-monitor cron from every 5 minutes...'  status='completed'    conclusion='success'
```

**#207 = pending пока #206 = in_progress.** Это и есть доказательство: оба run'а в одной concurrency group `deploy-ftp`, очередь работает, никакого пересечения двух FTP-deploys.

Если бы concurrency НЕ был добавлен — оба run'а сидели бы в `in_progress` параллельно, как вчера, и опять словили бы wipe/upload race.

API endpoint для воспроизведения:
```bash
curl -fsS "https://api.github.com/repos/ligacreate/garden/actions/runs?branch=main&per_page=3" | jq '.workflow_runs[] | {n: .run_number, sha: .head_sha[:7], title: .display_title, status, conclusion}'
```

---

## SHA

- **`ca37309`** — concurrency fix (`.github/workflows/deploy.yml` + бриф `_59`)
- **`5edae95`** — пустой verify-коммит (`test: verify concurrency queueing`)

## Финальная картина (полный лог полла каждые 20 сек)

```
#207=pending(None)      #206=in_progress(None)    ← очередь работает
#207=pending(None)      #206=in_progress(None)
#207=pending(None)      #206=in_progress(None)
#207=pending(None)      #206=in_progress(None)
#207=in_progress(None)  #206=completed(success)   ← #207 стартовал только после
#207=in_progress(None)  #206=completed(success)
#207=in_progress(None)  #206=completed(success)
#207=in_progress(None)  #206=completed(success)
#207=in_progress(None)  #206=completed(success)
#207=in_progress(None)  #206=completed(success)
#207=completed(success) #206=completed(success)   ← оба success, без race
```

**Никакого пересечения двух in_progress в один момент. Concurrency работает 1:1 как задумано.**

> Тонкость GH Actions: при `cancel-in-progress: false` если **уже есть pending в группе** и приходит **новый** run — pending отменяется в пользу нового (только один pending allowed). Так что push этого _60 до завершения #207 → #207 был бы cancelled. Поэтому ждал.

---

## Чек-лист (по брифу)

- [x] Применить diff в `.github/workflows/deploy.yml`.
- [x] Single коммит + push.
- [x] Тестовый пустой коммит + push.
- [x] Verify через GH Actions: второй run в pending, пока первый бежит.
- [x] Дождаться завершения обоих runs (#206 success, #207 success).
- [x] Push этого `_60` отчёта с финальными SHA и итогами обоих runs.

---

## Открытое (per бриф, не сейчас)

Тикет **VITE-CHUNK-HASH-FLAPPING** — каждый build даёт новые chunk hashes (вероятно `npm ci` тянет patch deps), даже без code-изменений. Auto-reload вытаскивает юзеров, но они видят моргание. Решения: `npm-shrinkwrap` + `--prefer-offline`, или deterministic chunk naming в Vite config. Отдельная сессия recon + fix.
