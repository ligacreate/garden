# BUG-MEETINGS-INCOME-NOTIFY-SILENT — applied + pushed

**От:** codeexec (VS Code)
**Кому:** Ольга → стратегу
**Дата:** 2026-05-17
**В ответ на:** 🟢 + доп. правка от стратега ([_55](2026-05-17_55_strategist_bug_meetings_income_notify_silent.md), [_56](2026-05-17_56_codeexec_bug_meetings_income_notify_diff.md))
**Статус:** ✅ applied → ✅ pushed → ⏳ GH Actions деплоит.

---

## Финальный SHA

```
9780ee8
fix(meetings): inline income error + Toast createPortal + nullish-coalesce income load (BUG-MEETINGS-INCOME-NOTIFY-SILENT)
```

`git push origin main`:
```
   7b8efe6..9780ee8  main -> main
```

## Что применено (5 точек, 1 коммит)

### Fix 1 — Toast → createPortal

`components/Toast.jsx`:
- `import { createPortal } from 'react-dom'`
- SSR-guard: `if (typeof document === 'undefined') return null`
- `return createPortal(<div ...>, document.body)`

Решает класс багов «onNotify изнутри открытой модалки не виден» — теперь Toast и ModalShell сидят на одном body-портале, `z-[100] > z-[80]` работает как ожидается.

CRLF line-endings оригинала **сохранены** (`awk BEGIN{ORS="\r\n"}`) — иначе diff превратился бы в полную замену файла.

### Fix 2 — inline error для income

`views/MeetingsView.jsx`:
- Новый state `const [incomeError, setIncomeError] = useState('')` в группе bool-state'ов модалок (после `isGoalCompletionModalOpen`).
- `handleOpenResult` — `setIncomeError('')` при открытии (старая ошибка не «прилипает»).
- `handleSaveResult` — `setIncomeError('...')` вместо `onNotify('...')` + `setIncomeError('')` после успешной валидации.
- Input «Доход» обёрнут в `<div>`, onChange сбрасывает `incomeError`, ниже `<p className="text-xs text-rose-600 mt-1 ml-1">{incomeError}</p>`.

Inline error не уезжает через 3 секунды, всегда привязан к полю, без zIndex-конфликтов.

### Fix 3 — nullish-coalescing для income load (правка стратега из ревью _56)

`views/MeetingsView.jsx` `handleOpenResult`:
```diff
-            income: meeting.income || '',
+            income: meeting.income ?? '',
```

Existing bug, активировался required'ом: `0 || ''` → `''` → ведущая открывает уже-completed встречу (после phase33 бэкфилла таких 11 на проде), не меняет ничего, жмёт «Сохранить» → inline error «Укажите доход». `?? ''` корректно пропускает 0.

---

## GH Actions

- Все runs main: <https://github.com/ligacreate/garden/actions?query=branch%3Amain>
- Конкретный коммит: <https://github.com/ligacreate/garden/commit/9780ee8>

> `gh` без auth-token у меня. Ольга — глянь, что workflow «Deploy to FTP» зелёный (~2–5 мин). Красный — кинь логи, починю.

---

## Smoke-чеклист (после deploy)

1. **Toast portal globally:** где-то сделать действие, которое триггерит `onNotify` ВНУТРИ открытой модалки (например, ошибка сохранения в любой форме) → toast должен быть **поверх** модалки.
2. **Inline income error (новая scheduled-встреча):** открой scheduled-встречу через «Подвести итоги» → income пустое → жми «Сохранить» → под полем «Доход (₽) *» красный текст «Укажите доход (0 если бесплатная)». Модалка не закрывается, кнопка не блокируется.
3. **Inline error сбрасывается:** введи любую цифру в income → красный текст исчезает мгновенно.
4. **Edit completed с income=0 (после phase33 бэкфилла):** найди старую completed-встречу (одна из 11 бэкфилл-цели) → «Редактировать итоги» → в поле «Доход» лежит `0` (а не пусто!) → жмёшь «Сохранить» без правок → сохраняется ОК, без inline error.
5. **Toast по success-пути (не сломали):** ситуация, когда модалка закрывается → toast «...» по центру сверху, видим, исчезает через 3 сек.

---

## Что не делали (per бриф)

- НЕ ищем другие `onNotify` внутри модалок — fix 1 их все вытянет.
- НЕ трогаем data invariant в `dataService` (defense in depth).
- НЕ добавляем error-prop в `Input.jsx` (стандарта в проекте нет).
- НЕ меняем механизм Toast в App.jsx.
- НЕ добавляем красный border у поля (по решению стратега в чате — текста хватит).

Сессия по этому багу закрыта. Жду smoke от Chrome-runner'а.
