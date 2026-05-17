# BUG-MEETINGS-INCOME-NOTIFY-SILENT — diff на ревью

**От:** codeexec (VS Code)
**Кому:** Ольга → стратегу
**Дата:** 2026-05-17
**В ответ на:** [55_strategist_bug_meetings_income_notify_silent.md](2026-05-17_55_strategist_bug_meetings_income_notify_silent.md)
**Статус:** ⏳ жду 🟢. После — отдельный микро-коммит + push.

---

## Recon (подтверждение факта)

- **`components/Toast.jsx`** — 22 строки, без `createPortal`. Подтверждаю root cause: рендерится в дереве App, `z-[100]` ловится stacking context'ом родителя, ModalShell на body-портале с `z-[80]` визуально перекрывает.
- **`views/MeetingsView.jsx`:**
  - useState блок строки **640–666** (есть куда воткнуть `incomeError`).
  - `handleOpenResult` строки **914–924** (сбросить ошибку при открытии).
  - `handleSaveResult` строки **926–933** (заменить `onNotify` на `setIncomeError`).
  - Input «Доход» строки **1578–1584** (обернуть в div, добавить onChange-сброс, рендер ошибки под).
- **`components/Input.jsx`** — нет `error` prop'а, нет встроенного стандарта error-border. Поддерживает `inputClassName` для прокидки классов. По брифу: «если нет стандарта — оставь только текст». **Оставляю только текст под полем.** Подсветку border не добавляю (был бы пропс-инвазивный фикс на компонент).

---

## Fix 1 — Toast через createPortal

**Файл:** `components/Toast.jsx` (полная замена — файл крошечный)

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

 export default Toast;
```

> `typeof document === 'undefined'` guard — для SSR-safety, как принято для портального кода. У вас Vite/CSR, но это копеечная защита от регрессии, если когда-нибудь полезете в prerender. Если не нравится — выкину.

---

## Fix 2 — inline error в Result modal

**Файл:** `views/MeetingsView.jsx`

### 2a — добавить state (после строки 657, в группу bool-state'ов модалок — логически ближе всего)

```diff
     const [isGoalCompletionModalOpen, setIsGoalCompletionModalOpen] = useState(false);
+    const [incomeError, setIncomeError] = useState('');
```

### 2b — сбросить при открытии модалки (`handleOpenResult`, строка 914)

```diff
     const handleOpenResult = (meeting) => {
         setSelectedMeeting(meeting);
+        setIncomeError('');
         setFormData({
             ...meeting,
             income: meeting.income || '',
```

### 2c — заменить `onNotify` на `setIncomeError` в `handleSaveResult` (строки 926-933)

```diff
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
         setIsSaving(true);
```

### 2d — Input «Доход» с inline error (строки 1578-1584)

```diff
-                    <Input
-                        type="number"
-                        label="Доход (₽) *"
-                        placeholder="0 если бесплатная"
-                        value={formData.income}
-                        onChange={e => setFormData({ ...formData, income: e.target.value })}
-                    />
+                    <div>
+                        <Input
+                            type="number"
+                            label="Доход (₽) *"
+                            placeholder="0 если бесплатная"
+                            value={formData.income}
+                            onChange={e => {
+                                setFormData({ ...formData, income: e.target.value });
+                                if (incomeError) setIncomeError('');
+                            }}
+                        />
+                        {incomeError && (
+                            <p className="text-xs text-rose-600 mt-1 ml-1">{incomeError}</p>
+                        )}
+                    </div>
```

> `ml-1` — чтобы выровнялось по label Input'а (там тоже `ml-1`).

---

## Чего НЕ делаем (по брифу)

- Не ищем другие `onNotify` внутри модалок — Toast portal fix их всех вытянет.
- Не трогаем data invariant в `dataService` (defense in depth).
- Не добавляем error-prop в `Input.jsx` (стандарта в проекте нет, инвазивно).
- Не меняем механизм Toast в App.jsx.

---

## Чек-лист apply (после 🟢)

- [ ] Применить fix 1 (Toast.jsx).
- [ ] Применить fix 2 (MeetingsView.jsx, 4 точки).
- [ ] Один микро-коммит: `fix(meetings): inline income error + Toast createPortal (BUG-MEETINGS-INCOME-NOTIFY-SILENT)`.
- [ ] Push, дождаться GH Actions.
- [ ] Отчёт в `_session/_57_codeexec_bug_meetings_income_notify_applied.md` с SHA + ссылкой на actions.
- [ ] Smoke по новой scheduled-встрече `smoke-test-bugfix-2026-05-17` (Chrome runner — не моя ответственность).

## Открытые вопросы

1. **SSR guard** в Toast (`typeof document === 'undefined'`) — оставить или выкинуть? По умолчанию оставлю.
2. **Подсветка border красным** — НЕ добавляю (стандарта нет). Если хочешь — скажи, прокину через `inputClassName={incomeError ? '!border-rose-300 ...' : ''}`.

Жду 🟢 или комменты.
