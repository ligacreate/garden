# BUG-PRACTICE-DELETE-ZINDEX — confirm-диалог под формой

**Дата:** 2026-05-15
**Где всплыло:** smoke phase28b. Удаление практики из `PracticeFormModal`.
**Тип:** stacking context isolation, не z-index.

## Симптом

В форме редактирования практики (`PracticeFormModal`, открыт через `ModalShell`)
есть красная кнопка X — открывает `<ConfirmationModal>` «Удалить практику?».
Клик по X **видимого эффекта не даёт**. Если закрыть форму руками («Отмена»)
— на месте уже стоит непринятый диалог. Пользователь читает это как «X не работает».

## Postmortem: первый фикс не сработал

**Первая гипотеза (неверная):** default `zIndex` ConfirmationModal (`z-50`)
ниже ModalShell (`z-[80]`) → подняли до `z-[100]`. Build зелёный, deploy
прошёл — баг **остался**.

**Почему мимо:** z-index сравнивается **только внутри одного stacking
context**. ConfirmationModal жил внутри `<App>`, который внутри `#root` —
а `#root` имеет `position: relative; z-index: 1; overflow: auto`, что
создаёт изолированный stacking context. Любой z-index дочернего элемента
нормализуется в пределах этого контекста — `z-[100]` внутри `#root`
никогда не победит элемент с `z-[80]` в `body`.

ModalShell этого избегает через `createPortal(..., document.body)`:
порталится в `body`, минуя `#root` и его stacking context. Confirm — не
порталился, поэтому проигрывал даже с z-[100].

Диагноз поставлен через DOM-инспекцию (Chrome DevTools): сравнили
`getComputedStyle` у фактических узлов формы и диалога — у формы
parent === `body`, у диалога parent === `#root`.

## Корневая причина

Дырявая абстракция дизайн-системы: `ConfirmationModal` не использовал
`createPortal`, в отличие от `ModalShell`. Это «работало» пока confirm
не открывался поверх ModalShell-формы — потому что без формы-конкурента
z-index диалога сравнивался с обычным контентом приложения и побеждал
по визуальному порядку.

## Как починили

`components/ConfirmationModal.jsx`:
1. `import { createPortal } from 'react-dom'`.
2. SSR-guard: `if (typeof document === 'undefined') return null;` — паттерн
   ModalShell.
3. Обернули JSX в `createPortal(..., document.body)`.
4. `zIndex` default оставлен `z-[100]` (выше ModalShell `z-[80]`) — теперь
   он **реально** работает, потому что оба компонента сиблинги в `body`
   и сравниваются в одном stacking context.

Связанных слоёв не задели: 9 callsites (`AdminPanel ×2`, `PracticesView`,
`BuilderView`, `CRMView`, `MeetingsView ×2`, `ProfileView`, формы внутри
`PracticeFormModal`) — никто не передавал `zIndex` prop, изменение
default безопасно. Контракт props сохранён.

## Что проверить в будущем

- **Любой fixed/absolute overlay-компонент должен порталиться в `body`.**
  Это правило design-system'а. Сейчас в проекте: `ModalShell` ✅ портал,
  `ConfirmationModal` ✅ портал (после фикса). Если введём `Toast`,
  `Drawer`, `Popover`, `Tooltip`, `CommandPalette` — каждый должен
  использовать `createPortal(..., document.body)` или жить внутри
  ModalShell.
- **Сигнал stacking context bug:** «z-index явно больше, но элемент
  всё равно под». Не повышай z-index дальше — проверь parent chain
  через DevTools (`Computed → position/z-index/overflow`).
- **Stacking context создают:** `position: relative/absolute/fixed/sticky`
  + `z-index ≠ auto`; `opacity < 1`; `transform/filter/perspective ≠ none`;
  `will-change: transform/opacity`; `isolation: isolate`. Любое из этих
  на родителе изолирует всех потомков.
- **Не доверяй однократному фиксу симптома** — проверяй на проде
  визуально (или хотя бы через DOM-инспекцию), что симптом ушёл, не
  только что build/типчек зелёный.

## История фиксов

- `9c85612` (2026-05-15) — попытка #1: подняли default z-index. **Не сработала.**
- (текущий коммит) — попытка #2: createPortal в body. Работает.
