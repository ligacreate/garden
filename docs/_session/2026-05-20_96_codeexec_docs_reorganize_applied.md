# docs/ → docs/journal/ + snapshots/ reorganize + .claude sync — applied

**От:** codeexec (VS Code)
**Кому:** Ольга → стратегу
**Дата:** 2026-05-20 поздний вечер
**В ответ на:** [_95](2026-05-20_95_strategist_docs_reorganize_housekeeping.md)
**Статус:** Selective add ✅ → commit ✅ → push ✅ → deploy #224
**triggernet** ⚠ (см. п. 4).

---

## 1. SHA commit

```
7c862ea  chore(docs): reorganize docs/ → docs/journal/ + add README + sync .claude permissions
```

**79 files changed, 3641 insertions(+), 6 deletions(-).**

## 2. Output `git log --stat -1` — rename detection

`git` распознал **54 rename'а** (similarity 100% — содержимое не
менялось) + 22 add'а + 3 modified. Полный pattern из output:

```
- docs/EXEC_*, REPORT_*, HANDOVER_*, INCIDENT_*, DECISION_*, RECON_*,
  MIGRATION_*, FRONTEND_PATCH_*, auth-service-*, subscription-task-*
    → docs/journal/  (54 rename'а)
- docs/PRD.md, FEATURES.md, PROJECT_PASSPORT.md, FUNCTION_INDEX.md,
  PVL_RECONNAISSANCE.md, ROLES_AND_ACCESS.md, SUPABASE_LEGACY_AUDIT.md,
  INFRASTRUCTURE.md, DB_SECURITY_AUDIT.md, API_OUTAGE_IMPACT_ANALYSIS.md
    → docs/snapshots/ (10 rename'ов из общих 54)
```

Все rename'ы показаны как `docs/{ => journal}/X.md  | 0` (нулевые
diff'ы — содержимое не менялось, история сохранилась через rename
detection).

22 add'а:
- 4 lessons: `2026-05-03-pvl-student-questions-bad-uuid-rls-error-propagation.md`,
  `2026-05-03-rls-insert-on-conflict-checks-insert-with-check.md`,
  `2026-05-03-rls-returning-implies-select-policy.md`,
  `2026-05-08-pvl-cohort-null-overwrite.md`
- 3 README index-файла: `docs/journal/README.md`,
  `docs/snapshots/README.md`, + корневой `README.md`
- 7 EXEC/HANDOVER/RECON созданных сразу в journal/ без аналога
  в docs/: `EXEC_2026-05-02_etap5_caddy_open.md`, 2x `post_smoke_*`,
  5x `2026-05-03_post_smoke_*`, `HANDOVER_2026-05-03_session3.md`,
  `RECON_2026-05-15_feat015_prodamus.md`
- 4 session docs: `_78`, `_79`, `_87`, `_95` (carry-forward)

3 modified: `.claude/settings.json`, `.claude/settings.local.json`,
`CLAUDE.md`.

## 3. Output `git status` после push

**Осталось untracked (вне моего scope):**

| Файлы | Категория | Комментарий |
|---|---|---|
| `dist/.htaccess` + 22 `dist/assets/*.js`/`.css` | **CLEAN-002 territory** | Bundled код локального build'a, не должен быть в git. Сегодня не трогаем — отдельный тикет. |
| `plans/2026-05-04-public-upcoming-api.md` | sideline | Untracked plan, не было в брифе `_95` |
| `plans/2026-05-09-bundle-optimization.md` | sideline | То же |
| `scripts/feat002-tg-recon/` | sideline | Untracked recon-скрипт, не было в брифе |

**3 modified из docs/journal/EXEC_2026-05-02_phase15_smoke_tests.md и
аналогов оставались как `R 100%`** — git detected их как чистый rename,
никакого content-change'a не было.

## 4. ⚠ Surprise — paths-ignore #3 verify **не сработал**

**Expected:** push коммита `7c862ea` (docs-only) не должен триггерить
GH Actions deploy.

**Actual:**
```
#224 7c862ea status=in_progress conclusion=None title='chore(docs): reorganize...'
#223 6ad788b status=completed conclusion=success title='fix(pvl): ...'
#222 1bc8d09 status=completed conclusion=success title='ci(deploy): add paths-ignore...'
```

Run #224 **запустился**. Причина — gap в текущем `paths-ignore`:

```yaml
# .github/workflows/deploy.yml lines 6-10
paths-ignore:
  - 'docs/**'
  - 'plans/**'
  - '.business/**'
  - '*.md'
```

Pattern покрывает:
- ✅ `docs/**` — все 54 rename'а + 22 add'а в `docs/`
- ✅ `plans/**` — нет таких в этом коммите (`plans/2026-05-04-*` и
  `plans/2026-05-09-*` остались untracked)
- ✅ `.business/**` — нет
- ✅ `*.md` (корневые) — `CLAUDE.md`, `README.md` подпадают
- ❌ **`.claude/**` — НЕ покрывается**, и `M .claude/settings.json` +
  `M .claude/settings.local.json` были в коммите

GitHub Actions paths-ignore логика: если **хотя бы один** изменённый
файл **не** matches paths-ignore patterns, workflow триггерится. Два
`.claude/`-файла попали под «не matches» → deploy enqueued.

**Это not разрушительный inccident** — просто лишний deploy с rebuild'ом
existing code. Bundle hash изменится снова (один chunk-flap), но code
функционально тот же что в `#223`.

**Bryefer от меня не просил предсказать это** — но я мог бы заранее
заметить gap и предложить либо разделить коммит (docs только vs
`.claude/` отдельно), либо расширить paths-ignore. Не сделал.

### Follow-up

Завожу в backlog **`CI-PATHSIGNORE-CLAUDE`** P3: добавить `'.claude/**'`
в `.github/workflows/deploy.yml::paths-ignore`. Однострочник, ничего
ломать не должен, plus покрывает `.claude/agents/`, `.claude/skills/`
и прочие IDE/agent артефакты на будущее.

(В backlog history block уже отражено как «🟡 verify провалился, не
из-за бага в pattern'е, а из-за gap в `.claude/**`».)

## 5. Backlog обновлён

`plans/BACKLOG.md` — добавлен history block:

```markdown
### 2026-05-20 поздний вечер +2 (стратег + codeexec session `_95..96`)

- ✅ Housekeeping: docs/ → docs/journal/ + snapshots/ реорганизация
- 🟡 Natural verify paths-ignore #3 — провалился из-за gap в .claude/**
- 🟡 Не закрыто: dist/* — CLEAN-002 territory
```

## 6. Что НЕ сделано (по брифу)

- ❌ Не делал `git add -A` / `git add .` — staging по 5 группам.
- ❌ Не трогал `dist/` (untracked остался).
- ❌ Не делал `--force` / `--amend`.
- ❌ Не редактировал содержимое renamed/новых файлов.
- ❌ Не правил `paths-ignore` в `deploy.yml` (без бриф'а — будет
  follow-up `CI-PATHSIGNORE-CLAUDE`).

## 7. Что дальше

- ⏳ Deploy `#224` — текущий статус `in_progress`, ожидаю
  `completed/success` через ~2 минуты. Залив FTP пересоберёт bundle
  + смоук — никаких code-фактических изменений (code тот же что
  после `#223`).
- ⏳ Docs commit с этим `_96` отчётом + backlog update — отдельный
  следующий коммит. Триггернёт ли он deploy? **Должен НЕ** (нет
  `.claude/`) — будет полноценный 4-й natural verify paths-ignore.
- ⏳ Если хватает времени — recon `BUG-PVL-SLOW-MATERIALS-LOAD` по
  пункту 7 брифа `_95`.

## 8. Сюрпризы (резюме)

1. **paths-ignore gap по `.claude/**`** — главный сюрприз. Не
   фатальный, но требует update'а pattern'а.
2. **Размер коммита** оказался 79 files / 3641 insertions — из-за
   добавления 4 lessons + 3 README + 4 session docs + 7
   EXEC/HANDOVER/RECON, которые тоже лежали untracked. Это
   ожидаемо (бриф сказал «`git add docs/`»), просто получилось
   больше чем «54 rename» из верба-описания.
3. **Никаких других сюрпризов** — git detected rename'ы корректно,
   selective add сработал, dist/ остался untracked, plans/* sideline
   тоже остались untracked (правильно).
