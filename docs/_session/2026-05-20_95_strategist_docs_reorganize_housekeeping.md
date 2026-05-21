# docs/ → docs/journal/ reorganize + .claude permissions sync — housekeeping бриф

**От:** стратега (claude.ai)
**Кому:** codeexec (VS Code Claude Code)
**Дата:** 2026-05-20 поздний вечер
**Зелёный:** Ольга 🟢
**Связано:** `_87` day close (карри-forward), `_88..89` paths-ignore deploy

---

## Контекст

В working tree накопились незакоммиченные изменения из ранней сессии —
кто-то начал реорганизовать `docs/` структуру согласно обновлённому
плану в `CLAUDE.md`:

- В корне `docs/` остаются только живые справочники (RUNBOOK,
  design-system, feedback, *.sql) + `lessons/`, `snapshots/`,
  `_session/`, **`journal/`**
- В `docs/journal/` переехали датированные артефакты:
  `EXEC_*`, `HANDOVER_*`, `REPORT_*`, `INCIDENT_*`, `DECISION_*`,
  `RECON_*`, `MIGRATION_*`, `FRONTEND_PATCH_*`, и т.п.

Файлы **физически перемещены** на диск (через mv/Finder), но git это
видит как «удалил 54 из `docs/` + добавил 56 untracked в `docs/journal/`»,
а не как rename. Дополнительно: модифицирован `CLAUDE.md` (описание
новой структуры) + новый `README.md` (продуктовый «что и зачем», 108
строк) + накопленные permissions в `.claude/settings.json` и
`settings.local.json`.

Плюс **карри-forward от утра** — `docs/_session/2026-05-20_87_strategist_day_close.md`
остался untracked (я его создала после `_86`, в брифе `_88` не упомянула
включить).

---

## Что делать (selective add, БЕЗ `git add -A`)

### Шаг 1. Verify pre-state

```bash
cd ~/code/garden  # твой clone, не iCloud
git status --short | wc -l   # ~148 строк ожидается
git status --short | grep "^ D docs/" | wc -l   # ~54 deleted из docs/
ls docs/journal/ | wc -l   # ~56 файлов
```

Если cifрas сильно разходятся с этими ожиданиями — STOP, отчитайся
что видишь.

### Шаг 2. Selective staging — 5 групп

**Группа A: docs/ → docs/journal/ rename** (git автодетектит при add)
```bash
git add docs/         # staged delete'ы из docs/ + new файлы из docs/journal/
```

Это безопасно: paths `docs/`, ничего за пределами. Git distinguished
rename vs delete+create по similarity threshold.

**Группа B: CLAUDE.md обновление** (новая структура docs/)
```bash
git add CLAUDE.md
```

**Группа C: README.md** (новый файл, 108 строк, продуктовый обзор)
```bash
git add README.md
```

**Группа D: .claude/settings*.json** (накопленные Bash permissions)
```bash
git add .claude/settings.json .claude/settings.local.json
```

**Группа E: carry-forward `_87`** (untracked с утра)
```bash
git add docs/_session/2026-05-20_87_strategist_day_close.md
```

### Шаг 3. Verify staging (КРИТИЧНО)

```bash
git status --short
```

Должно быть staged:
- Группа A: ~50+ rename'ы (`R  docs/EXEC_xxx.md -> docs/journal/EXEC_xxx.md`)
  + возможно несколько `A  docs/journal/<new>.md` (файлы которые сразу
  были созданы в journal без аналога в docs/)
- `M  CLAUDE.md`
- `A  README.md`
- `M  .claude/settings.json`
- `M  .claude/settings.local.json`
- `A  docs/_session/2026-05-20_87_strategist_day_close.md`

⚠ **НЕ должно быть staged:**
- `dist/**` ничего (это bundled код, отдельная тема CLEAN-002, не сейчас)
- Никаких других случайных файлов

**Если в staged попало что-то из dist/** — `git reset HEAD dist/` чтобы
убрать, потом re-verify.

### Шаг 4. Commit (один логический)

```bash
git commit -m "$(cat <<'EOF'
chore(docs): reorganize docs/ → docs/journal/ + add README + sync .claude permissions

- docs/EXEC_*, HANDOVER_*, REPORT_*, INCIDENT_*, DECISION_*, RECON_* и пр.
  → docs/journal/ (rename, история сохранена через git rename detection)
- CLAUDE.md: описание новой структуры docs/ (live + lessons/ + snapshots/ + journal/)
- README.md: новый продуктовый «что и зачем» (108 строк)
- .claude/settings*.json: накопленные Bash permissions из последних сессий
- carry-forward: docs/_session/2026-05-20_87_strategist_day_close.md

Реорганизация была начата ранее, файлы физически перемещены через
mv/Finder, но не закоммичены. Этим коммитом фиксируем как git rename.

Docs-only + .claude config — paths-ignore (.github/workflows/deploy.yml)
исключает frontend deploy. Третий natural verify подряд.
EOF
)"
```

### Шаг 5. Push

```bash
git push origin main
```

**Без `--force` / `--amend`** (новое правило, `feedback-codeexec-no-self-authorized-force-push`).

### Шаг 6. Verify paths-ignore сработал

После push — открой GH Actions UI и подтверди:
- **НЕ создан** новый workflow run для этого commit'a
- Top-1 run остался от code-commit `6ad788b` (сегодняшний fix-deploy)

Это **третий natural verify** paths-ignore (первый — codeexec test 20.05 в `_89`, второй — docs commit `ef1bc9f` тоже в `_89`, третий — этот).

Если deploy **всё-таки** triggernet — paths-ignore работает не так как мы
думаем, и нужно дебажить. Но это маловероятно.

### Шаг 7. Backlog history block + отчёт

В `plans/BACKLOG.md` в раздел истории за 2026-05-20 добавить:

```markdown
### 2026-05-20 поздний вечер (стратег + codeexec session `_95..96`)

- ✅ **Housekeeping: docs/ → docs/journal/ реорганизация** — завершена
  накопленная незакоммиченная реорганизация структуры docs/ из ранней
  сессии. ~54 файла перемещены через git rename detection (история
  сохранена), CLAUDE.md обновлён с описанием новой структуры, добавлен
  README.md (продуктовый обзор, 108 строк), синхронизированы накопленные
  `.claude/settings*.json` permissions, добавлен carry-forward `_87`
  day-close от утра.
- ✅ **Третий natural verify paths-ignore** — большой docs-only push
  без frontend deploy. Production-proof что инфраструктура работает.
- 🟡 **Не закрыто:** `dist/*` (untracked + modified) — это bundled код,
  не должен быть в git. Отдельный тикет [[CLEAN-002]] (есть в P2).
  Сегодня не трогаем.
```

Отчёт: `docs/_session/2026-05-20_96_codeexec_docs_reorganize_applied.md`

Структура (короткая):
1. SHA commit'a
2. Output `git log --stat -1` показывает rename detection (R записи)
3. Output `git status` после push — должно быть только `dist/*` если
   осталось
4. GH Actions UI link + подтверждение no new run
5. Сюрпризы / отклонения

---

## Что НЕ делать

- ❌ **`git add -A`** или **`git add .`** — заберёт `dist/*` которые не
  должны быть в git
- ❌ **Не трогать `dist/`** — отдельная тема CLEAN-002, gitignore + git rm --cached в будущем
- ❌ **Не делать `--force` / `--amend`** (правило)
- ❌ **Не править содержимое** files в reorganize — только rename
- ❌ **Не редактировать README.md или CLAUDE.md** в этом батче — оставить
  как уже лежит в working tree

---

## Timeline

~15-20 минут: staging (Шаги 1-3) самое аккуратное, остальное быстрое.

---

## После этого батча

Если ещё есть время в полчасовом окне Ольги — переходим к (b) recon
BUG-PVL-SLOW-MATERIALS-LOAD (read-only, ~20-30 мин). Если нет — день
официально закрыт.
