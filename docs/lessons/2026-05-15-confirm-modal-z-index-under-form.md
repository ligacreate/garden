# BUG-PRACTICE-DELETE-ZINDEX — confirm-диалог под формой

**Дата:** 2026-05-15
**Где всплыло:** smoke phase28b. Удаление практики из `PracticeFormModal`.
**Тип:** дырявый контракт дизайн-системы.

## Симптом

В форме редактирования практики (`PracticeFormModal`, открыт через `ModalShell`)
есть красная кнопка X — открывает `<ConfirmationModal>` «Удалить практику?».
Клик по X **видимого эффекта не даёт**. Если закрыть форму руками («Отмена»)
— на месте уже стоит непринятый диалог подтверждения. Пользователь
интерпретирует это как «кнопка не работает».

## Корневая причина

Чисто CSS-конфликт стека модалок:

| Компонент | default `zIndex` |
|---|---|
| `ModalShell` ([components/ModalShell.jsx:16](../../components/ModalShell.jsx#L16)) | `z-[80]` |
| `ConfirmationModal` ([components/ConfirmationModal.jsx:5](../../components/ConfirmationModal.jsx#L5)) | `z-50` ← было |

`50 < 80` → confirm рендерится **под** формой. Видеть его можно только
после `onClose` формы (которая снимает z-[80] оверлей).

Корневая причина — **дырявая абстракция дизайн-системы**: design-system
неявно подразумевала, что `ConfirmationModal` никогда не открывается
поверх `ModalShell`-формы. На самом деле это типовой паттерн (форма с
кнопкой удаления) — и контракт проваливается. Default z-index
ConfirmationModal был ниже ModalShell, что **противоположно** UX-конвенции
(confirm всегда top-most).

## Почему пропустили

- `PracticeFormModal` — extracted shared компонент, появился в phase28b.
  Раньше форма редактирования практики жила inline в `PracticesView`,
  а `<ConfirmationModal>` был сиблингом в том же `PracticesView` — и
  визуально работал по случайности (на каких именно z-index браузер
  решал отрисовать — зависело от порядка JSX и stacking context).
- При extract'е PracticeFormModal в shared компонент `ModalShell`-обёртка
  стала единственным родителем формы → stacking context определился
  жёстко через z-index, и баг проявился стабильно.
- В `ConfirmationModal` уже был `zIndex` prop с default'ом — но default
  был выбран без учёта верхушки стека модалок проекта.

## Как починили

`components/ConfirmationModal.jsx`: default `zIndex = "z-50"` → `zIndex = "z-[100]"`.

- Все 9 callsites (`AdminPanel ×2`, `PracticesView`, `BuilderView`,
  `CRMView`, `MeetingsView ×2`, `ProfileView`, формы внутри
  `PracticeFormModal`) полагались на default — никто не передавал prop.
  Регрессий нет, наоборот — лечит и **похожие потенциальные баги** в
  Builder/CRM/Meetings/Profile/Admin (везде, где confirm может открываться
  из ModalShell-формы).
- Связанных слоёв не задели: контракт props сохранён (override через
  `zIndex` prop работает как раньше).

## Альтернатива «закрыть форму перед confirm»

Рассмотрена и отвергнута. Минусы:
- При Cancel в confirm пользователь возвращается в список, а не в форму
  — теряет свою несохранённую правку.
- Требует менять каждое место использования (9+ файлов) — высокий риск.
- Не решает корневую причину (дырявый контракт остался бы).

## Что проверить в будущем

- При появлении нового overlay-компонента (toast, popover, drawer,
  command palette) сверять его default z-index с уже существующими.
  Сейчас в проекте две точки правды: `ModalShell` (z-[80]) и
  `ConfirmationModal` (z-[100]). Если введём drawer/command palette
  — задокументировать в design-system.
- Паттерн «кнопка действия внутри формы → confirm» — типовой;
  при extract'е любых форм в shared компоненты проверить, что confirm
  поверх работает.
- Сигнал: «кнопка X в форме делает невидимый клик» / «диалог появляется
  после закрытия формы» → это z-index конфликт, не логический баг.
