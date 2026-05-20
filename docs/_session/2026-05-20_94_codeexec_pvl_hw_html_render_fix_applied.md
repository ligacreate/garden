# BUG-PVL-ADMIN-HW-HTML-RAW-RENDER — applied & deployed

**От:** codeexec (VS Code)
**Кому:** Ольга → стратегу
**Дата:** 2026-05-20 ночь
**В ответ на:** [_92](2026-05-20_92_strategist_pvl_hw_html_render_fix_brief.md)
**🟢 на diff:** [_93](2026-05-20_93_codeexec_pvl_hw_html_render_fix_diff.md) → Ольга 🟢
**Статус:** Apply 9 правок ✅ → build ✅ → commit ✅ → push ✅ →
deploy `#223 success` ✅ → bundle обновился ✅ → auto-smoke ✅.
**Visual verify в браузере** — pending от Ольги (у меня нет
аутентифицированного браузера).

---

## 1. SHA commit

```
6ad788b  fix(pvl): render HTML in admin-defined sub-fields via dangerouslySetInnerHTML
```

`git show 6ad788b --stat`:
```
views/pvlChecklistShared.jsx     | 10 ++++++++--
views/pvlQuestionnaireShared.jsx | 36 +++++++++++++++++++++++++++++-------
2 files changed, 37 insertions(+), 9 deletions(-)
```

Diff 1:1 совпадает с _93. Все 9 точек заменены, тех же файлах,
с тем же sanitizer (`sanitizeHomeworkAnswerHtml`), теми же тремя
паттернами (A/B/C из _93).

⚠ **Гигиена:** не делал `--amend` и `--force-push` (новое правило
из [feedback-codeexec-no-self-authorized-force-push]). Один обычный
commit, один push, всё.

## 2. GH Actions deploy

- **Run #223** для `6ad788b` — статус `completed`, conclusion `success`.
- URL: <https://github.com/ligacreate/garden/actions?query=branch%3Amain>
- Poll log (public GH API):
  ```
  completed|success|#223|6ad788b
  ```
- Время от push'а до зелёного: ~3 минуты (один запуск, всё прошло
  чисто).

## 3. Новый bundle hash

```bash
$ curl -s https://liga.skrebeyko.ru/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1
assets/index-CTrlSsPw.js
```

| Bundle | Was (после `_89`) | Now |
|---|---|---|
| Main entry | `index-Bn0u3NCY.js` | **`index-CTrlSsPw.js`** |

Один expected chunk-flap (code change в shared module). CSS hash
тоже изменился (`index-BTr__Bdv.css → index-y9ZebroK.css`) — потому
что `lessonHomework`-related стили могли touched`. Не критично.

## 4. Smoke (auto + pending visual)

### 4.1. Auto-smoke (CLI)

- ✅ `npm run build` локально — без warnings, без errors про invalid
  `dangerouslySetInnerHTML`. Полный output build: 2057 modules, 3.58s.
- ✅ Entry bundle `index-CTrlSsPw.js` доступен (HTTP/1.1 200 OK,
  Last-Modified `Wed, 20 May 2026 17:23:43 GMT`).
- ✅ Grep по entry bundle: содержит `ALLOWED_TAGS` и
  `blockquote","pre","code` — это сериализованный whitelist из
  `sanitizeHomeworkAnswerHtml`, подтверждает что новый bundle несёт
  обновлённый санитайзер.
- ✅ `https://liga.skrebeyko.ru/` отдаёт 200, HTML интегрен (нет
  кэширования старой версии — `Cache-Control: no-cache` уже работает).

### 4.2. Visual verify (pending от Ольги)

Не могу выполнить из CLI:
- ❓ `<p><strong>Шаг 1.</strong>` в одном из ДЗ с админ-сохранёнными
  HTML-тегами рендерится как **жирный отформатированный текст**.
- ❓ Regression: главный prompt ДЗ (через RichEditor) продолжает
  рендериться корректно (он работал и до моего fix'а).
- ❓ Admin-side test save: вставить `<strong>Test</strong>` в одно
  из 9 sub-полей через админ-форму → сохранить → открыть как
  студентка → должно отрендериться жирным.

**Сейчас в БД нет ни одной записи с HTML-тегами в `b.question` /
`item.prompt` / `questionnaireDescription`** (см. recon `_91` —
0 строк после Obsidian-workaround'а админа). Так что visual verify
возможен только после **новой админ-вставки** с HTML — это естественно
произойдёт в ходе обычной работы.

**Не делаю сам admin-side save** — это вне моего scope (только
render-fix), и я не хочу мутировать боевые данные курса для теста.

### 4.3. Regression-проверки автоматические

- ✅ Diff 6ad788b 1:1 с _93 (verified `git diff HEAD~1..HEAD`).
- ✅ Build без warnings про React `children` + dangerouslySetInnerHTML
  (Variant B правильно разносит children в outer `<span>` и
  dangerouslySetInnerHTML на inner `<span>`).
- ✅ Никаких новых imports, никакого admin-side изменения, никаких
  DB-операций.
- ✅ `whitespace-pre-wrap` сохранён в обоих местах
  (questionnaireDescription) — обратная совместимость с plain-text
  старыми анкетами.

## 5. Backlog update

Файл: `plans/BACKLOG.md`.

### Добавлен closed-сразу тикет в P1 секцию (после `BUG-PVL-ONBOARDING`):

```
### BUG-PVL-ADMIN-HW-HTML-RAW-RENDER: HTML-теги в админских sub-полях
анкеты/чек-листа рендерились как литерал ✅ DONE
- **Статус:** ✅ DONE 2026-05-20 ночь (session `_90`..`_94`)
- **Приоритет:** P1 (admin-workflow blocker — workaround через Obsidian был)
- **Создано:** 2026-05-20 поздний вечер ...
- **Симптом / Корневая причина / Fix / SHA / Bundle** — см. ниже.
- **SHA:** `6ad788b` (deploy run #223 — completed/success).
  Bundle: `index-Bn0u3NCY.js → index-CTrlSsPw.js`.
```

### Добавлен history block за 2026-05-20 ночь (после `_88..89` вечера):

```
### 2026-05-20 ночь (стратег + codeexec session `_90`..`_94`)

- ✅ BUG-PVL-ADMIN-HW-HTML-RAW-RENDER закрыт за один заход (recon →
  fix-brief → diff → apply). 9 точек text-node {value} →
  dangerouslySetInnerHTML(sanitizeHomeworkAnswerHtml). Узкий scope:
  admin-side не трогали, БД не правили (данные валидны), только render.
  SHA: 6ad788b. Deploy #223 success.
- 📋 Заведены два параллельных тикета без recon (из брифа _90):
  BUG-PVL-SLOW-MATERIALS-LOAD, BUG-PVL-WHITESPACE-CORRUPTION — утром.
```

## 6. Сюрпризы (без них)

- **Не делал --amend и не push --force** — новое правило соблюдено.
- **Не трогал admin-side `<input>`/`<textarea>`** — оставлено как P3
  follow-up на потом.
- **Не правил БД** — данные сейчас валидны (после Obsidian-workaround
  админа в течение вечера); fix только на render.
- **Не правил RichEditor** — он не сломан; sub-поля — отдельный path.
- **`PvlPrototypeApp` chunk не оказался в entry bundle preloads** —
  норма, lazy-loaded через React.lazy; `pvlChecklistShared` и
  `pvlQuestionnaireShared` попадают в этот же chunk. Поэтому смотреть
  диф через entry bundle бесполезно для самих правок — но я подтвердил
  через `ALLOWED_TAGS` grep, что `sanitizeHomeworkAnswerHtml` доехал в
  деплой.
- **Большой git status noise** (deleted `docs/EXEC_*.md`, modified
  `.claude/`, `CLAUDE.md`, untracked `docs/journal/*`) — **ничего
  этого не коммитил**. Это, видимо, незакоммиченная реорганизация
  доков от другой сессии. Это **вне моего scope** — оставлю как было.
  Стратег утром решит что с ней делать.

## 7. Следующие шаги (по брифу _92)

- ✅ Backlog: `BUG-PVL-ADMIN-HW-HTML-RAW-RENDER` → ✅ DONE с SHA и
  smoke сводкой (этот файл).
- ✅ Lesson НЕ нужен (типовой react-render баг, известный паттерн —
  бриф _92 явно сказал «не нужен»).
- ⏳ Docs-commit: отдельным следующим коммитом запушу `_91`, `_93`,
  `_94`, `plans/BACKLOG.md`. **paths-ignore работает** — этот docs
  push **не** триггернёт frontend deploy (paths-ignore покрывает
  `docs/**`, `plans/**`, `.business/**`, `*.md`). Натуральный verify
  paths-ignore работы.
- ⏳ Visual verify ждёт Ольгу. Когда она в браузере зайдёт на
  страницу ДЗ с прежним BUG-репродом — должно быть жирным.
