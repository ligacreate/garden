# paths-ignore + финальный push накопленного — бриф для codeexec

**От:** стратега (claude.ai)
**Кому:** codeexec (VS Code Claude Code)
**Дата:** 2026-05-20 поздний вечер
**Зелёный:** Ольга 🟢
**Связано:** `_84` (housekeeping applied), `_86` (evening tails),
`_87` (day close), bonus rec из `_84`

---

## Контекст

3 локальных commit'а ждут push'a (`c00765a` garden-auth + `8d2cf5d` +
`722572e` garden). Перед push'ем добавляем paths-ignore в
`.github/workflows/deploy.yml` чтобы:
- этот push triggernет **один** frontend deploy (один chunk-flap,
  expected) — потому что workflow yml меняется
- **после** этого docs-only коммиты в `docs/**`, `plans/**`,
  `.business/**`, `*.md` в корне больше не triggerят frontend deploy

Закрывает 70% сценариев [[VITE-CHUNK-HASH-FLAPPING]] (P3).

---

## Шаг 1. Добавить paths-ignore в deploy.yml

Файл: `.github/workflows/deploy.yml` (в garden repo).

Найти секцию `on:`. Должно быть что-то вроде:
```yaml
on:
  push:
    branches: ["main"]
```

Добавить `paths-ignore`:
```yaml
on:
  push:
    branches: ["main"]
    paths-ignore:
      - 'docs/**'
      - 'plans/**'
      - '.business/**'
      - '*.md'
```

⚠ **Намеренно НЕ `**/*.md`** — рекурсивный pattern игнорировал бы
любой .md внутри `src/`, `views/` (если бы они там появились в
будущем). `*.md` точечно для корневых README/CHANGELOG.

⚠ **Не трогать workflow_dispatch** или другие триггеры если есть —
только `push` секция.

Проверь yml через `yamllint .github/workflows/deploy.yml` или просто
визуально (отступы важны).

## Шаг 2. Commit paths-ignore (отдельным logical commit'ом)

```bash
cd ~/code/garden  # или где у тебя clone
git add .github/workflows/deploy.yml
git commit -m "ci(deploy): add paths-ignore for docs/plans/.business/*.md

Закрывает 70% VITE-CHUNK-HASH-FLAPPING — docs-only коммиты больше не
triggerят FTP deploy. Code-level chunk-hash flapping остаётся
отдельной темой (Vite contenthash collision)."
```

## Шаг 3. Push garden-auth (c00765a)

```bash
cd ~/code/garden-auth  # или где у тебя clone
git push origin main
```

🟢 **Безопасно мгновенно** — отдельный repo, нет GH Actions для
frontend, нет deploy. Это просто sync прод-applied кода с git'ом.

Verify: `git log origin/main..HEAD` пуст после push'a (всё ушло).

## Шаг 4. Push garden (8d2cf5d + 722572e + paths-ignore commit)

```bash
cd ~/code/garden
git push origin main
```

🟡 Этот push triggernet GH Actions deploy.yml — **один** chunk-flap у
активных юзеров (если есть). ErrorBoundary auto-reload справится.

## Шаг 5. Мониторить deploy

1. Открой GH Actions UI: `https://github.com/ligacreate/garden/actions`
   (or curl через gh CLI)
2. Жди deploy workflow зелёный (~1-3 мин)
3. Если упал — STOP, читай логи, отчитывайся **без apply дополнительных
   fixes** — мне сначала нужно понимать что произошло

## Шаг 6. Verify bundle обновился

```bash
curl -s https://liga.skrebeyko.ru/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js'
```

Должен быть **новый** hash (не `index-Dgwl91od.js` который был с
утра 19.05). Запиши новый bundle hash в отчёт.

## Шаг 7. Verify paths-ignore работает (опционально, для уверенности)

Tiny test:
```bash
cd ~/code/garden
echo "# paths-ignore verification" >> docs/_session/.paths_ignore_verify_2026-05-20.md
git add docs/_session/.paths_ignore_verify_2026-05-20.md
git commit -m "test(ci): verify paths-ignore — docs-only commit should not trigger deploy"
git push origin main
```

Open GH Actions UI: **никаких** новых workflow runs не должно
запуститься на этот push. Если запустился → paths-ignore не работает,
нужно дебажить syntax. Если пропустил → success.

После verify — удалить тест-файл и push:
```bash
git rm docs/_session/.paths_ignore_verify_2026-05-20.md
git commit -m "test(ci): cleanup paths-ignore verify file"
git push origin main
```

Тоже не triggernет deploy (если первый verify прошёл).

⚠ Если ты считаешь Шаг 7 избыточным (deploy.yml syntax-correct,
почему ему не работать) — можно **пропустить**, мы поймём из next
real docs-only push'a что paths-ignore работает.

## Шаг 8. Update backlog + отчёт

В `plans/BACKLOG.md`:

В разделе истории за 2026-05-20 добавить:

```markdown
### 2026-05-20 поздний вечер (стратег + codeexec session `_88`..`_89`)

- ✅ **paths-ignore в `.github/workflows/deploy.yml`** — docs/plans/.business/*.md
  больше не triggerят frontend deploy. Один chunk-flap при этом push'e
  (expected), после — `feedback-batch-deploys-no-race` перестаёт быть
  narrow constraint для docs-only коммитов. Частично закрывает
  [[VITE-CHUNK-HASH-FLAPPING]] (для docs-path; code-level Vite
  contenthash flapping остаётся отдельной темой).
- ✅ **Push накопленного batch'a** — 4 коммита одним заходом:
  - `c00765a` (garden-auth) backend single-line fix (404→200) — sync с прод
  - `8d2cf5d` (garden) AM housekeeping + carry-forward `_80` + lesson + `_81..84`
  - `722572e` (garden) Evening tails + `_85..86`
  - `<новый SHA>` (garden) paths-ignore в deploy.yml
  Bundle обновился `index-Dgwl91od.js` → `<новый hash>`. Deploy зелёный.
```

Отчёт: `docs/_session/2026-05-20_89_codeexec_paths_ignore_pushed.md`

Структура:
1. paths-ignore yml diff (вставленные строки)
2. SHA нового commit'а
3. `git push` output для обоих repo
4. GH Actions deploy status (link + status)
5. Новый bundle hash
6. (опционально) Шаг 7 verify результат
7. Любые сюрпризы

---

## Что НЕ делать

- ❌ Не пушить `c00765a` и `8d2cf5d`+`722572e` **разными** push'ами в
  garden — это была бы trap (frontend deploy дважды, два chunk-flap).
  Они и так в разных repo (garden-auth vs garden), это разделение
  естественное
- ❌ Не делать paths-ignore через `**/*.md` (см. Шаг 1 пояснение)
- ❌ Не амендить уже push'нутые коммиты (это force push в main)
- ❌ Если deploy упал — STOP, не пытаться чинить самой, отчитывайся

---

## Timeline

~10-15 минут: правка deploy.yml + commit, 2 push'a (mainly waiting on
GH Actions ~1-3 мин), verify bundle, backlog + отчёт `_89`.
