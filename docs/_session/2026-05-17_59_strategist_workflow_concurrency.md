# WORKFLOW-CONCURRENCY — добавить concurrency group в deploy.yml

**От:** стратег (claude.ai)
**Кому:** VS Code Claude Code
**Дата:** 2026-05-17 (вечер)
**Тип:** P1 infra, страховка от вчерашней саги.

---

## Контекст

Вчера 17.05 (днём по UTC) была production-incident сага из-за race condition между двумя параллельными deploys.

Скрин GH Actions показал:
```
#201 b8c2ab4 fix(ux-batch)         → failed   9:55 AM
#202 7b8efe6 docs(_session/53)     → success  9:56 AM   ← через 1 минуту!
#203 9780ee8 fix(meetings)         → success ~11:30
#204 c698104 docs(_session/57)     → success ~11:31    ← снова через 1 минуту
```

Code-коммит и docs-follow-up пушились с интервалом ~1 минута. Deploy занимает 2-3 минуты. Параллельные runs FTP-Deploy-Action с `dangerous-clean-slate: true` пересекались: один стирал dist пока другой заливал → **partial garbage state** на проде → 6 chunks 404 → пользователи ловили `ChunkLoadError → auto-reload`.

Recovery — re-run #204 через ~1.5 часа после первого incident-а.

Сегодня вечером (17.05 ~18:50 UTC) проверила — повторный single-push (cron-commit 89d4db0) прошёл чисто, все 14 chunks 200. Подтверждает что **race был корнем**, не FTP transient fail.

---

## Что делаем

Добавить `concurrency` block в `.github/workflows/deploy.yml`. Стандартная GitHub Actions фича — новые runs ждут в очереди пока текущий завершится, не пересекаются.

### Diff — `.github/workflows/deploy.yml`

```diff
 name: Deploy to FTP

 on:
   push:
     branches: ["main"]
   workflow_dispatch:

+concurrency:
+  group: deploy-ftp
+  cancel-in-progress: false
+
 jobs:
   build-and-deploy:
     runs-on: ubuntu-latest
     steps:
```

### Почему `cancel-in-progress: false`, не `true`

- **false** (ждём в очереди) — новый run **ждёт пока текущий завершится**, потом стартует. Безопасно: каждый push даёт полный deploy.
- **true** (отменяем текущий) — новый run **отменяет** текущий, стартует сразу. **НЕ подходит** нам: если docs-коммит идёт после code-коммита, он отменит deploy кода → код может никогда не задеплоиться (или только частично).

Нам нужен **queueing**, не cancellation. → `false`.

---

## Чек-лист apply (после 🟢)

- [ ] Применить diff в `.github/workflows/deploy.yml`.
- [ ] Single коммит `infra(workflow): add concurrency group to prevent FTP-deploy race`, push.
- [ ] **Verify механики:** через 30 секунд после первого push'а — второй push с тривиальным изменением (например пустой коммит `git commit --allow-empty -m "test: verify concurrency queueing"`). Открой GH Actions → должен увидеть что второй run **stays pending** пока первый не завершится. Это и есть подтверждение что concurrency работает.
- [ ] После verify — single docs-коммит с отчётом в `_session/_60_codeexec_workflow_concurrency_applied.md` (push после того как concurrency верифицирована, чтобы тест случайно не словил вчерашний race).
- [ ] Отчёт включает: SHA коммита, GH Actions run URL, скрин или текст из Actions показывающий queued state второго run'а.

---

## Открытое (не сейчас, в roadmap)

Vite на каждом `npm run build` выдаёт **новые chunk hashes**, даже если код не менялся (вероятно `npm ci` тянет patch-версии deps). Это означает каждый деплой ломает старых юзеров (auto-reload их вытащит, но они увидят моргание).

Решения:
- Зафиксировать deps через `npm-shrinkwrap` / точный lockfile с `--prefer-offline`
- Стабилизировать chunk hashes через Vite config (`build.rollupOptions.output.chunkFileNames` с deterministic naming)
- ИЛИ перейти на content-based hashes только для изменённых файлов

Тикет: **VITE-CHUNK-HASH-FLAPPING**. Не блокер, страничный класс багов. Отдельная сессия recon + fix.
