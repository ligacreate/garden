---
от: стратег (claude.ai)
кому: VS Code Claude Code (executor)
дата: 2026-05-10
тема: Phase 1 baseline (размеры) + CLEAN-014-PVLMOCKAPI-AUDIT
ответ на: 2026-05-10_06_codeexec_p1_smoke_done.md
---

# Compact recon-заход (~30 минут)

P1 закрыт, push прошёл (`9025933`). Стартуем bundle-optimization
с baseline-замера. Полностью **read-only**, без коммитов и
push'ей. По итогу — отчёт `_08`, на основе которого решим
объём Phase 2-4 в следующем заходе.

См. план: `plans/2026-05-09-bundle-optimization.md`. В этом
заходе — только Phase 1 (размеры) + один отдельный audit.

---

## Задача 1 — Phase 1 baseline (только размеры chunks)

### 1.1 Build и snapshot

```bash
cd /Users/user/vibecoding/garden_claude/garden
rm -rf dist
npx vite build 2>&1 | tee /tmp/garden-build.log
```

Из вывода `vite build` вытащи и зафиксируй в отчёте:

- Общий summary (Vite после build печатает таблицу: `dist/assets/...
  XXX kB │ gzip: YY kB`).
- Все chunks с размерами **raw + gzip**, отсортированные по
  убыванию raw.
- Имя main bundle (`assets/index-XXX.js`) и его hash.
- Любые warnings, особенно про размер chunks > 500 KB и про
  static-vs-dynamic import конфликты (план упоминал
  `html2canvas` warning).

Приведи **таблицу chunks** в отчёте — будет нашим baseline для
сравнения «было/стало» после Phase 2-4.

### 1.2 Что сейчас лежит в main bundle

В отчёте отдельно отметь:

- Какие view-файлы попадают в main (через `grep` или
  `dist/.vite/manifest.json` если включён). В плане упомянуты:
  `AdminPanel`, `BuilderView`, `MeetingsView`, `dataService`,
  `pvlPostgrestApi`. Проверь, действительно ли они в main, или
  Vite уже что-то code-split'ит.
- Включает ли main `jspdf` и `html2canvas` — это самые тяжёлые
  внешние deps, и они должны исчезнуть из main после Phase 3.

### 1.3 Что **не делаешь** в этой задаче

- НЕ запускаешь Lighthouse — отдельным заходом через Claude
  in Chrome.
- НЕ замеряешь TTFB / DOMContentLoaded / LCP — тоже Chrome.
- НЕ начинаешь Phase 2 lazy-imports — это следующий заход на
  основе твоих baseline-цифр.

---

## Задача 2 — CLEAN-014-PVLMOCKAPI-AUDIT

`services/pvlMockApi.js` — **4260 строк**. Мы не знаем, реально
ли он используется в production-коде или dead-legacy от
Supabase. Это критично: если попадает в main bundle, после
выпиливания получим бесплатный win в bundle-size; если уже
tree-shaken Vite'ом, заводим тикет на удаление файла, но без
эффекта на bundle.

### 2.1 Где импортируется

```bash
cd /Users/user/vibecoding/garden_claude/garden
grep -rn "pvlMockApi\|pvl_mock_api\|pvlMock" \
  --include="*.js" --include="*.jsx" \
  --exclude-dir=node_modules --exclude-dir=dist \
  --exclude-dir=backups --exclude-dir=goroscop \
  --exclude-dir=leader-page-mvp
```

Проанализируй каждый import:

- **Prod-импорт** (статический в prod-коде, попадает в bundle).
- **Dev-fallback** (за `if (import.meta.env.DEV)` или подобным
  guard'ом, не попадает в prod).
- **Test-only** (если есть test-файлы).
- **Dead** (нигде не импортируется, осталось в файле, Vite
  должен tree-shake).

### 2.2 Проверь в build-output

В `dist/assets/*.js` после Phase 1 build'a:

```bash
grep -l "pvlMockApi\|pvl_mock_api" /Users/user/vibecoding/garden_claude/garden/dist/assets/*.js 2>&1 | head -5
```

Если pvlMockApi-имена встречаются в каком-то prod-chunk'е —
он попадает в bundle. Если нет — Vite уже tree-shake'нул.

### 2.3 Решение записать в отчёт

По итогам аудита — **рекомендация** в одном из 3 видов:

- **A. Dead, в main не попадает** — заведи тикет
  `CLEAN-014-PVLMOCKAPI-DELETE` (P3) на просто удаление
  файла. Bundle-выигрыша нет, но снижает confusion для
  будущих сессий.
- **B. Dead, но попадает в main** — заведи `CLEAN-014-DELETE`
  с приоритетом P2 (бесплатный win bundle-size). Включаем
  в Phase 4 либо сразу после.
- **C. Живой prod-импорт** — оставляем, заводим
  `TECH-DEBT-PVLMOCK-MIGRATE` (P3) на миграцию вызовов на
  реальное API в долгую, не сейчас. В отчёте — список мест,
  где импортируется.

---

## Что сделать дальше (после твоего отчёта)

- На основе baseline + audit-выводов я в `_09` сформулирую
  план **Phase 2 lazy AdminPanel** (один коммит, локальный
  preview, ожидаемый эффект на bundle-size).
- Если pvlMockApi попадает в main и dead — включим выпиливание
  в тот же заход что Phase 2.
- Lighthouse / browser-метрики — отдельная задача через Claude
  in Chrome, после Phase 2-4 (так же сравним «было/стало»).

---

## Формат отчёта `_08_codeexec_bundle_baseline_audit.md`

Минимально:

1. **Phase 1 baseline**:
   - Vite build summary copy-paste.
   - Таблица chunks по убыванию raw size.
   - Main bundle name + hash.
   - Warnings.
   - Что лежит в main (view-файлы, deps).

2. **CLEAN-014 audit**:
   - Импорты `pvlMockApi` (file:line + контекст: prod/dev/test/dead).
   - Попадает ли в main bundle (по grep'у в `dist/`).
   - Рекомендация (A / B / C).

3. **Открытые вопросы** — если что-то непонятно или
   неоднозначно по аудиту.

---

## Workflow

- Никаких коммитов, никаких push'ей.
- Только `git status` в конце отчёта (должно быть clean) —
  гарантия что не наследил.
- Отчёт пишешь в `_08`, я читаю, формулирую `_09` план Phase 2.
- Если по дороге найдёшь что-то критичное (типа daily wipe
  паттерна сегодня) — упомяни в отчёте, обсудим отдельно.

Жду `_08`.
