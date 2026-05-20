# BUG-PVL-ADMIN-HW-HTML-RAW-RENDER — fix бриф для codeexec

**От:** стратега (claude.ai)
**Кому:** codeexec (VS Code Claude Code)
**Дата:** 2026-05-20 поздний вечер
**Зелёный:** Ольга 🟢 на fix + push сегодня (admin-workflow active, не ждём утра)
**Связано:** `_90` (recon бриф), `_91` (recon отчёт), `_82b` (CinC about
silent fails в auth-формах — другой тикет)

---

## Контекст и продуктовое решение

Из recon `_91`: баг в 9 точках 2 файлов — `pvlChecklistShared.jsx`
(lines 16, 45) и `pvlQuestionnaireShared.jsx` (lines 19, 28, 63, 81,
191, 202, 233). Sub-поля рендерятся через React text-node `{value}`,
поэтому HTML вставленный админом в textarea показывается как литерал.

**Продуктовое решение Ольги:** разрешаем inline-форматирование
(`<strong>`, `<em>`, `<p>`, `<br>`, возможно `<a>`) — на скрине админ
использовала `<strong>Шаг 1.</strong>` для структурного выделения
шагов, это legitimate use case.

**Severity:** P1 (не P0 — workaround есть; не P2 — баг активный,
мешает админ-workflow прямо сейчас).

---

## Двухшаговый workflow (diff на review → apply)

### Шаг 1. Diff (без apply)

#### 1.1. Проверить whitelist существующего санитайзера

Перед заменой `{value}` → `dangerouslySetInnerHTML` нужно подтвердить:
- **Какой санитайзер использовать** — `sanitizeHomeworkAnswerHtml`
  (известный по studen homework path) или `normalizeMaterialHtml`
  (используется для главного prompt — успешно)?
- **Что whitelist'ит** этот санитайзер? Достаточно ли inline-тегов
  (`<strong>`, `<em>`, `<p>`, `<br>`, `<a>`)?

Из `_91`: главный prompt идёт через
`dangerouslySetInnerHTML(normalizeMaterialHtml/sanitizeHomeworkAnswerHtml)` —
рекомендую использовать **тот же sanitizer** что и для главного
prompt'a (whatever it is) — гарантия консистентного поведения с
working baseline. Подтверди в diff'е какой именно.

Если **ни один из существующих** не whitelist'ит нужные inline-теги
(маловероятно, но возможно) — STOP, отчитайся в diff: «whitelist
текущих санитайзеров не покрывает, нужен новый санитайзер или
расширение существующего» + предложение. Не apply'ить без обсуждения.

#### 1.2. Diff для 9 точек

Файлы и lines (из `_91`):
- `views/PvlPrototypeApp/pvlChecklistShared.jsx`: lines **16**, **45**
- `views/PvlPrototypeApp/pvlQuestionnaireShared.jsx`: lines **19, 28,
  63, 81, 191, 202, 233**

(имена директорий могут отличаться — найди через `grep -rn` если
location другой)

Паттерн правки (пример для одной точки):
```jsx
// БЫЛО:
<label>{item.prompt}</label>

// СТАЛО:
<label dangerouslySetInnerHTML={{ __html: sanitizeHomeworkAnswerHtml(item.prompt) }} />
```

(или `normalizeMaterialHtml` — в зависимости от Шага 1.1)

⚠ Точный паттерн зависит от того, как сейчас text-node embeded — может
быть `{value}` в `<label>`, может быть в `<div>`, может быть с другим
prop. Сохрани **структурный wrapper** (label/div/span), меняй только
internal {text} → dangerouslySetInnerHTML.

#### 1.3. Поведение при пустом/null value

Проверь — `dangerouslySetInnerHTML={{ __html: undefined }}` или
`__html: null` может react warning'ить. Добавь fallback:
```jsx
__html: sanitizeHomeworkAnswerHtml(item.prompt || '')
```

#### 1.4. Отчёт diff

Файл: `docs/_session/2026-05-20_93_codeexec_pvl_hw_html_render_fix_diff.md`

Структура:
1. Какой санитайзер выбран и почему (с whitelist proof)
2. Полный diff по 9 точкам (можно сжать однотипные, но все 9 явно
   обозначить)
3. Возможные regression risk'и (например, если sanitizer стрипает
   `\n` — длинные сообщения могут потерять переносы)
4. **БЕЗ APPLY** — жди 🟢 от стратега

### Шаг 2. Apply + commit + push + smoke

После моего 🟢 на diff:

1. Apply правки в 9 точках
2. Test build локально: `npm run build` — должен пройти без warning
   про invalid `dangerouslySetInnerHTML`
3. Commit:
   ```
   fix(pvl): render HTML in admin-defined sub-fields via dangerouslySetInnerHTML

   BUG-PVL-ADMIN-HW-HTML-RAW-RENDER: 9 точек text-node {value} →
   dangerouslySetInnerHTML с <sanitizer>. Позволяет inline-форматирование
   (<strong>, <em>, <p>, <br>, <a>) в чек-листах и анкетах ПВЛ.
   Главный prompt ДЗ уже работал нормально (RichEditor + санитайзер).

   - views/PvlPrototypeApp/pvlChecklistShared.jsx lines 16, 45
   - views/PvlPrototypeApp/pvlQuestionnaireShared.jsx lines 19, 28, 63, 81, 191, 202, 233

   Recon: _91. Fix brief: _92. Diff: _93. Applied: _94.
   ```
4. Push (триггерит frontend deploy — **один** chunk-flap, expected;
   workaround: paths-ignore уже работает, но это **code change**, не
   docs)
5. **Smoke:**
   - Открой студенческую страницу с ДЗ которое админ редактировала
     сегодня (по timestamp `updated_at > NOW() - INTERVAL '6 hours'`
     в `pvl_homework_items`)
   - Verify визуально: `<p><strong>Шаг 1.</strong>` рендерится как
     **жирный отформатированный текст**, не как литерал
   - Если возможно, дёрни админ-форму и попробуй сохранить тестовый
     `<strong>Test</strong>` в одно из sub-полей — должно так же
     отрендериться
6. Backlog update: BUG-PVL-ADMIN-HW-HTML-RAW-RENDER → ✅ DONE с SHA +
   smoke ссылкой (screen или описание)

#### Отчёт apply

Файл: `docs/_session/2026-05-20_94_codeexec_pvl_hw_html_render_fix_applied.md`

Структура:
1. SHA commit
2. GH Actions deploy status (link + status)
3. Новый bundle hash
4. Smoke результат (verify визуально + (опционально) admin-side test
   save)
5. Backlog update summary

---

## Что НЕ делать

- ❌ Не делать `git push --force` или `git commit --amend` (новое
  feedback правило, см. memory `feedback-codeexec-no-self-authorized-force-push`)
- ❌ Не трогать admin-side (textarea вместо RichEditor) — это **P3
  follow-up** на потом, не вечерний scope
- ❌ Не делать BUG-PVL-SLOW-MATERIALS-LOAD и BUG-PVL-WHITESPACE-CORRUPTION —
  они в backlog как отдельные тикеты, фокус на raw HTML render
- ❌ Не делать DDL/UPDATE на raw data в БД — данные сами по себе
  валидны (HTML legitimate), фикс на render-стороне
- ❌ Если diff показывает что нужный санитайзер не существует или его
  whitelist не подходит — STOP, не apply'ить, обсуждать

---

## Timeline

- **Шаг 1 (diff `_93`):** ~10-15 минут
- **Стратег review:** ~5 минут
- **Шаг 2 (apply + push + smoke `_94`):** ~15-20 минут

Итого ~30-40 минут от начала до закрытия. С учётом frontend deploy
(~1-3 мин ожидание).

---

## После закрытия

- Backlog: BUG-PVL-ADMIN-HW-HTML-RAW-RENDER → ✅ DONE в P1 secting (его
  ещё нет в backlog — добавь как closed-сразу в History блок 2026-05-20
  ночь, или отдельной P1 секцией с пометкой ✅ DONE)
- Lesson? Не нужен — это типовой react-render баг, известный паттерн.
- Day-close handover `_87` обновлять не нужно (он не запушен, обновим
  если потребуется — или утренний стратег обновит)
- **Утром:** оставшиеся два P2/P3 баг (slow load + whitespace) +
  основная P1 работа BUG-PVL-ONBOARDING trigger.
