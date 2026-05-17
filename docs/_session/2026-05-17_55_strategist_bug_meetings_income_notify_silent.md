# BUG-MEETINGS-INCOME-NOTIFY-SILENT — fix toast invisible behind modal + inline error

**От:** стратег (claude.ai)
**Кому:** VS Code Claude Code
**Дата:** 2026-05-17
**Контекст:** UX-батч `b8c2ab4` smoke выявил — форма блокирует пустой income (защита работает), но `onNotify('Укажите доход...')` не показывает toast. Пользователь видит «жму кнопку → ничего», не понимает что требуется.

---

## Root cause (стратег уже отрековил)

- `components/Toast.jsx`: `z-[100]`, **рендерится без `createPortal`**, в дереве `App.jsx`.
- `components/ModalShell.jsx:32` рендерится через `createPortal(<div ... z-[80] ...>, document.body)`.

Stacking context: Toast сидит внутри родительского контейнера App (где есть собственные stacking contexts из-за transforms/z-index в layout), Modal сидит на root body. Эффективно Toast `z-100` оказывается **ниже** Modal `z-80` визуально.

В Smoke 3 (success-path) модалка закрывается перед `onNotify` → toast виден. В Smoke 2 (validation) модалка остаётся открытой → toast рендерится, но за модалкой.

Это **класс багов**: любой `onNotify` из контекста открытой модалки сейчас не виден. Скорее всего есть и другие места (любая pre-submit-валидация внутри модалки).

---

## Что чиним

### Фикс 1 — Toast через createPortal (universal)

Завернуть Toast в `createPortal(..., document.body)`, как ModalShell. Тогда оба в одном stacking context body → z-100 действительно над z-80 → toast виден поверх модалки.

**Файл:** `components/Toast.jsx`

```diff
-import React, { useEffect } from 'react';
+import React, { useEffect } from 'react';
+import { createPortal } from 'react-dom';
 import { CheckCircle2 } from 'lucide-react';

 const Toast = ({ message, onClose }) => {
     useEffect(() => {
         if (message) {
             const timer = setTimeout(onClose, 3000);
             return () => clearTimeout(timer);
         }
     }, [message, onClose]);

     if (!message) return null;
+    if (typeof document === 'undefined') return null;

-    return (
+    return createPortal(
         <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-white/90 backdrop-blur-lg text-slate-700 px-6 py-3 rounded-full shadow-[0_18px_40px_-20px_rgba(21,17,12,0.6)] flex items-center gap-3 animate-in slide-in-from-top-4 fade-in duration-300 pointer-events-none border border-white/70">
             <CheckCircle2 size={20} className="text-blue-600" />
             <span className="text-sm font-semibold tracking-wide">{message}</span>
-        </div>
+        </div>,
+        document.body
     );
 };
```

### Фикс 2 — inline error у поля Доход в Result modal

Toast — это для async/system feedback. Для pre-submit-валидации правильный UX — inline error у конкретного поля. Видно сразу, явно указывает что не так, не уезжает через 3 секунды.

**Файл:** `views/MeetingsView.jsx`

В `handleSaveResult` (~926-955) — заменить `onNotify(...)` на установку локального state `incomeError`, и убрать onNotify-вызов. State сбрасывается при изменении input.

```diff
+    const [incomeError, setIncomeError] = useState('');
+
     const handleSaveResult = async () => {
         if (isSaving) return;
         const incomeRaw = formData.income;
         const incomeMissing = incomeRaw === null || incomeRaw === undefined || String(incomeRaw).trim() === '';
         if (incomeMissing) {
-            onNotify('Укажите доход (0 если встреча была бесплатной)');
+            setIncomeError('Укажите доход (0 если встреча была бесплатной)');
             return;
         }
+        setIncomeError('');
```

И при изменении input — сбросить ошибку (~1572):

```diff
-                    <Input
+                    <div>
+                    <Input
                         type="number"
                         label="Доход (₽) *"
                         placeholder="0 если бесплатная"
                         value={formData.income}
-                        onChange={e => setFormData({ ...formData, income: e.target.value })}
+                        onChange={e => {
+                            setFormData({ ...formData, income: e.target.value });
+                            if (incomeError) setIncomeError('');
+                        }}
                     />
+                    {incomeError && (
+                        <p className="text-xs text-rose-600 mt-1">{incomeError}</p>
+                    )}
+                    </div>
```

Также при открытии модалки (`handleOpenResult` вокруг ~890-924) — сбросить `setIncomeError('')` чтобы при следующем закрытии встречи не показывалась старая ошибка:

```diff
     const handleOpenResult = (meeting) => {
         setSelectedMeeting(meeting);
+        setIncomeError('');
         setFormData({
             ...meeting,
```

(Уточни `handleOpenResult` — может быть называется иначе. Я видела в коде `setIsResultModalOpen(true)` около строки 923 — там и сбрось.)

---

## Чего НЕ делаем сейчас

- **Не ищем другие места** с `onNotify` внутри модалок. Toast-portal-fix их все автоматом починит. Если визуально что-то всплывёт в дальнейшем smoke'е — отдельным тикетом.
- **Не меняем data-инвариант** в `dataService` — он остаётся, как есть, как defense-in-depth.
- **Не трогаем механизм Toast** в App.jsx — он же.

---

## Чек-лист apply

- [ ] Прочитать `components/Toast.jsx`, `views/MeetingsView.jsx` функции `handleSaveResult` и `handleOpenResult` (или аналог), Input блок.
- [ ] Применить fix 1 (Toast → createPortal).
- [ ] Применить fix 2 (inline error в Result modal).
- [ ] Diff в `docs/_session/2026-05-17_56_codeexec_bug_meetings_income_notify_diff.md` для ревью стратегу.
- [ ] После 🟢 — apply, commit отдельным микро-коммитом «fix(meetings): show pre-submit validation error inline + toast portal», push, GH Actions.
- [ ] После зелёного workflow — короткий smoke через Claude in Chrome (стратег даст промпт): открыть тестовую встречу `smoke-test-2026-05-17`, попробовать перевыставить income='' и сохранить → ожидаем inline error под полем красным.

---

## Открытые вопросы

1. Тестовая встреча `smoke-test-2026-05-17` уже completed (Smoke 3 закрыл с income=0). Сможем ли мы повторно проверить required-валидацию через редактирование (= clearing income)? Hmm. Лучше создать новую `smoke-test-bugfix-2026-05-17` в scheduled-статусе для теста после фикса. (Это уже задача Chrome smoke runner'а, не codeexec.)
2. Подсветка input border красным дополнительно — на твоё чутьё. Если в проекте есть стандарт error-border у Input — применяй; если нет — оставь только текст под полем.
