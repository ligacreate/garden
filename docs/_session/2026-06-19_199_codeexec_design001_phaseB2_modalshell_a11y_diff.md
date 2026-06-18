# Diff на ревью — DESIGN-001 Фаза B2: ModalShell focus-trap + Esc + ARIA

**Дата:** 2026-06-19. **Автор:** codeexec (VS Code). **Статус:** написан локально, сборка зелёная. **НЕ закоммичен — жду 🟢 (есть одно осознанное отклонение от спеки).**
**Файл:** components/ModalShell.jsx. **План:** docs/_session/2026-06-18_197_strategist_design_audit_plan.md (Фаза B).

---

## 1. TL;DR

Реализовал focus-trap + Esc + ARIA (role=dialog, aria-modal, aria-labelledby) в `ModalShell`, dependency-free. Хуки подняты до `if (!isOpen) return null`. Сборка зелёная. Визуально для мышиных пользователей diff = 0 (разметка/классы/анимации не тронуты).

**ВАЖНО — одно отклонение от буквы спеки, требует 🟢:** спека просила `useEffect(deps = [isOpen, onClose])`. Я завёл эффект на `[isOpen]`, а `onClose` дёргаю через `onCloseRef`. Причина — реальная регрессия (focus-steal), см. §2.

---

## 2. ⚠️ Сюрприз: deps [isOpen, onClose] → воровство фокуса (почему отклонился)

**Факт по коду:** доминирующий паттерн вызова — **inline-стрелка** `onClose`:
```
views/AdminPanel.jsx:439   onClose={() => setModalOpen(false)}
views/MeetingsView.jsx     onClose={() => setIsPlanModalOpen(false)}   (×7)
views/PracticesView.jsx    onClose={() => setViewPractice(null)}
... (≈30 call-site'ов, почти все inline)
```
Inline-стрелка = новая ссылка на КАЖДЫЙ ре-рендер родителя.

**Что было бы с deps [isOpen, onClose]:** пока модалка открыта, любой ре-рендер родителя (например, ввод символа в форму, контролируемую состоянием родителя модалки) меняет идентичность `onClose` → эффект перезапускается:
1. cleanup прошлого запуска: `prevFocus?.focus()` → фокус **прыгает на триггер ЗА модалкой**;
2. новый запуск: `prevFocus = document.activeElement` (теперь это триггер) → `dialog.focus()` → фокус на контейнер.

Итог: (а) фокус вырывается из инпута во время набора; (б) `prevFocus` затирается на контейнер → после реального закрытия фокус НЕ вернётся на исходный триггер. Это ломает прямо acceptance-критерии «Tab циклится внутри» и «после закрытия фокус возвращается на триггер», причём именно на форме отзыва (acceptance-модалка).

**Решение (отклонение):** эффект жизненного цикла на `[isOpen]`; актуальный `onClose` держим в `onCloseRef`, обновляемом отдельным эффектом без deps. Обработчики зовут `onCloseRef.current?.()`. Это стандартный паттерн «latest-ref», полностью убирает focus-steal, сохраняя всю требуемую семантику. Никакой stale-closure: ref всегда указывает на свежий onClose.

**Альтернатива (Вариант B):** оставить буквально `[isOpen, onClose]`. Тогда trap «работает», пока родитель не ре-рендерится при открытой модалке — но это хрупко и почти наверняка стрельнёт на формах. Не рекомендую.

---

## 3. Полный diff (ключевое)

Хуки до early-return; эффект гардит `if (!isOpen) return`:

```jsx
const dialogRef = useRef(null);
const titleId = useId();

const onCloseRef = useRef(onClose);
useEffect(() => { onCloseRef.current = onClose; });   // latest-ref, без deps

useEffect(() => {
  if (!isOpen) return;
  const dialog = dialogRef.current;
  const prevFocus = document.activeElement;
  dialog?.focus();                                    // сам контейнер, не первый focusable (там X)

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { onCloseRef.current?.(); return; }
    if (e.key === 'Tab') {
      const focusable = dialog ? Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR)) : [];
      if (focusable.length === 0) { e.preventDefault(); return; }
      const first = focusable[0], last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || active === dialog) { last.focus(); e.preventDefault(); }
      } else if (active === last) { first.focus(); e.preventDefault(); }
    }
  };
  document.addEventListener('keydown', handleKeyDown);
  return () => { document.removeEventListener('keydown', handleKeyDown); prevFocus?.focus?.(); };
}, [isOpen]);                                          // ← отклонение: не [isOpen, onClose]

if (!isOpen) return null;
if (typeof document === 'undefined') return null;
```

FOCUSABLE_SELECTOR = `a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])` — ровно по спеке.

Контейнер диалога:
```jsx
<div ref={dialogRef} role="dialog" aria-modal="true"
     aria-labelledby={labelledBy} tabIndex={-1}
     className="surface-card ... (без изменений)">
```
где `const labelledBy = !header && title ? titleId : undefined;`
`<h2 id={titleId} ...>` — только в title-ветке (как в спеке).

---

## 4. Два мелких уточнения сверх буквы спеки (оба — корректность, не «амбиции»)

1. **`aria-labelledby = !header && title ? titleId : undefined`** (спека: `title ? titleId : undefined`). Причина: `<h2 id={titleId}>` рендерится ТОЛЬКО когда нет `header`. Если вызвать ModalShell сразу с `header` И `title`, буквальный `title ?` дал бы aria-labelledby на несуществующий id (битая ARIA-ссылка). Гард `!header && title` повторяет реальное условие рендера h2 — ровно то, что в спеке описано прозой «только в title-ветке». Поведение для обычных модалок идентично.
2. **`active === dialog` в Shift+Tab-ветке.** После открытия фокус на контейнере. Без этого первый же Shift+Tab (фокус ещё на контейнере, не на `first`) утёк бы за модалку. Добавил контейнер в условие — trap честно держит и стартовую позицию. На «Shift+Tab с первого элемента» (acceptance) поведение то же.

---

## 5. Что НЕ затронуто / вне scope

- Закрытие по клику на оверлей — НЕ добавлял (явно вне scope).
- Разметка, классы, `animate-in fade-in/zoom-in`, размеры, выравнивание — без изменений.
- aria-describedby для `description` — не добавлял (спека просила только labelledby).
- Прочие модалки-компоненты (ConfirmationModal и т.п.), которые НЕ через ModalShell, — не трогал (вне scope B2).

## 6. Edge / известные ограничения

- **Стекинг нескольких модалок одновременно:** глобальный `document` keydown на каждую модалку. Если открыть две сразу — Escape закроет обе (каждый слушатель зовёт свой onClose), а trap'ы могут конкурировать. У нас модалки практически не стэкаются, так что ок — но фиксирую как известное ограничение (как и просили).
- **Контейнер с tabIndex=-1 + Shift+Tab:** закрыт гардом `active === dialog` (см. §4.2).
- **Пустой набор focusable:** `preventDefault()` — фокус остаётся в диалоге.

## 7. Acceptance (как проверять клавиатурой)

На любой модалке (напр. форма отзыва `PvlTrainingFeedbackForm` или админ-модалка):
- открытие → фокус в модалке (не на триггере за ней);
- Tab циклится внутри; Shift+Tab с первого → последний; Tab с последнего → первый;
- Esc закрывает;
- после закрытия фокус назад на триггер;
- инспектор: role=dialog, aria-modal=true, aria-labelledby → заголовок (в title-модалках).
- **доп. проверка регрессии (ради §2):** в открытой модалке-форме набрать текст в инпуте — фокус НЕ должен прыгать (это и подтверждает правильность `[isOpen]`-деп).

## 8. Apply-порядок (после 🟢)

1. `git add components/ModalShell.jsx docs/_session/2026-06-19_199_*.md`
2. Commit: `design(DESIGN-001): phase B2 — ModalShell focus-trap + Esc + ARIA`
3. `git push origin main`
4. FTP-джоба запустится (components = код). Пост-деплой smoke: главная 200, свежий бандл.
5. Живой keyboard-чек — можно делегировать Claude in Chrome.

## 9. Предлагаемый commit message

```
design(DESIGN-001): phase B2 — ModalShell focus-trap + Esc + ARIA

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```
