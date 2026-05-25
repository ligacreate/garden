# `[skip ci]` в HEAD commit скипает workflow для ВСЕГО push'а, включая код ниже

**Дата инцидента:** 2026-05-25 (ночь).
**Связанные коммиты:** `a7399e5` (mentee name UX fix, реальный код), `d4d6f6e` (chore docs с `[skip ci]` в message).
**Связанные сессии:** [_128 codeexec — uxfix mentee name на странице проверки ДЗ](../_session/2026-05-25_128_codeexec_uxfix_mentee_name_on_homework_review.md).

## Симптом

После push'а двух коммитов на main (`a7399e5` feat код + `d4d6f6e` chore docs) GH Actions deploy **не запустился**. Polling `https://liga.skrebeyko.ru/` 5.4 минуты подряд показывал тот же bundle hash `index-XTevhYBM.js` (от предыдущего deploy `ba057b6`), без 404 от dangerous-clean-slate, без новых hash'ей. На проде остался старый код **без** UX-фикса.

## Корневая причина

`d4d6f6e` (HEAD push'а) содержал `[skip ci]` в commit message:

```
chore(docs): commit untracked _session reports from prior sessions

...

[skip ci]
```

GitHub Actions проверяет наличие `[skip ci]` / `[ci skip]` маркера **в HEAD commit** push'а. Если найден — **весь workflow run пропускается**, независимо от того, что ниже в push'е. То есть `a7399e5` с реальным кодом, который пушнулся в том же push'е и сам не содержал skip-ci, **тоже не задеплоился**.

Спецификация: <https://docs.github.com/en/actions/managing-workflow-runs/skipping-workflow-runs>

> If you do not want a workflow to run when you push commits, you can include "skip-checks" trigger phrases in the commit message of the last commit pushed. <…> **GitHub Actions evaluates only the most recent commit message in a push.**

## Почему так получилось

В сессии `_128` Ольга прислала commit-message для chore с `[skip ci]` в нём — логика «docs-only коммит, deploy не нужен». Это было бы валидно, **если бы chore был отдельным push'ем**. Но я (codeexec) уже до этого закоммитил `a7399e5` (реальный код) локально, и потом по её 🟢 PUSH сделал **один push** для обоих коммитов сразу. `d4d6f6e` оказался HEAD'ом → skip-ci сработал для всего.

В моменте я **подумал** про этот риск ещё во время commit'а d4d6f6e (видел `[skip ci]` в message), но **не озвучил** Ольге. Когда после push'а deploy не запустился — пришлось разбираться постфактум.

## Как починили

Ольга вручную запустила workflow_dispatch через GitHub UI:
- Repo → Actions → Deploy to FTP → Run workflow → main → Run

Через ~30 сек workflow начался, ~2-3 мин до prod'а. Bundle hash сменился `index-XTevhYBM.js` → `index-ChQK4w6a.js`. `a7399e5` (mentee name fix) задеплоен. Юля Габрух подтвердила что видит имя менти на странице проверки ДЗ.

**Не использовали** альтернативу — empty commit без `[skip ci]` (`git commit --allow-empty -m "trigger ci"` + push). Workflow_dispatch чище: не оставляет служебный коммит в истории.

## Что проверить в будущем

### Правило: `[skip ci]` ставить только если ВСЁ в push'е docs-only

**Эвристика перед commit'ом с `[skip ci]`:**
1. Проверить `git log origin/main..HEAD --oneline` — видны ли коммиты, которые ещё не на remote'е и **содержат код** (не `docs/**`, `plans/**`, `.business/**`, `.claude/**`, `*.md`)?
2. Если **да** → НЕ ставить `[skip ci]` в HEAD commit, иначе скипнется workflow для код-коммита.
3. Если **нет** (только docs накопились) → `[skip ci]` безопасен.

**Альтернативы для chore docs батча, когда параллельно есть код-коммит:**
- **Вариант A (recommended):** chore commit БЕЗ `[skip ci]`. Deploy workflow всё равно отфильтрует docs через `paths-ignore` в `.github/workflows/deploy.yml`. Лишний skip-маркер не нужен — он просто дублирует существующую защиту.
- **Вариант B:** chore commit делать **первым**, код-коммит **вторым** (HEAD). Тогда `[skip ci]` в первом игнорируется (GH смотрит только HEAD), HEAD без skip-ci → workflow запускается.

В нашем `deploy.yml` (`.github/workflows/deploy.yml`) уже есть paths-ignore:
```yaml
on:
  push:
    branches: ["main"]
    paths-ignore:
      - 'docs/**'
      - 'plans/**'
      - '.business/**'
      - '.claude/**'
      - '*.md'
```

Это значит **`[skip ci]` в docs commit избыточен** — workflow и так не сработает, если в push'е только файлы из paths-ignore. `[skip ci]` нужен только если в push'е есть файлы вне paths-ignore, но мы хотим явно скипнуть. Этот случай **редкий** (обычно если есть код-коммит — мы как раз хотим deploy).

### Правило: озвучивать риск ДО commit'а, не после

Когда вижу `[skip ci]` в предложенном commit-message Ольги — **сразу** проверить, что push в итоге окажется. Если в push'е есть код-коммиты → пушнуть до chore + chore отдельным push'ем, либо убрать `[skip ci]` совсем. Молчать «думаю что может рискнуть, посмотрим» — потеря времени потом на recovery.

### Recovery options (для будущих случаев)

1. **workflow_dispatch вручную** (чище — без лишних коммитов). Требует UI access.
2. **Empty commit без skip-ci** (`git commit --allow-empty -m "trigger ci"` + push). Не требует UI, но оставляет служебный коммит.
3. **Revert + re-push** (тяжёлый, не нужен для этого случая).

## Smoke verified

✅ После workflow_dispatch — Юля Габрух открыла страницу проверки ДЗ менти и увидела имя менти в шапке. Bundle на проде `index-ChQK4w6a.js`. Inцидент закрыт.
