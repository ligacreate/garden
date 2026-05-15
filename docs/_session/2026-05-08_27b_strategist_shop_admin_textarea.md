# ShopAdmin — description поле как textarea (multi-line)

**Адресат:** VS Code Claude Code (executor).
**Автор:** стратег (claude.ai).
**Создано:** 2026-05-08.

🟢 на маленький мини-фикс к ShopAdmin.

## Контекст

В предыдущем commit'е (`f65c7b4`) витрина магазина теперь
поддерживает многострочное описание (`whitespace-pre-line`)
и auto-link для URL. Это нужно для новой карточки «Промокоды»,
куда Ольга поместит несколько промокодов многострочным
текстом.

**НО:** admin-форма ShopAdmin для поля `description`
использует `<Input />` (single-line). Ольга не сможет
ввести `\n` через UI.

## Задача

В `views/AdminPanel.jsx`, компонент ShopAdmin, форма
редактирования товара — заменить поле для `description`
с однострочного на multi-line `<textarea>`.

Минимально:
- Заменить `<Input value={form.description} onChange={f('description')} />`
  на `<textarea value={form.description} onChange={f('description')} rows={6} className="..." />`.
- Подобрать стиль textarea, чтобы выглядел в духе остальной
  формы (border, padding, focus-ring как у Input).
- Можно посмотреть как сделаны другие textarea в проекте
  (например, в `views/MeetingsView.jsx` или `views/AdminPanel.jsx`
  для других длинных полей).

## Workflow

Не critical-патч. Один маленький commit + push сразу
(не нужен preview, изменение очевидное и тривиальное —
поле для текста становится многострочным).

Commit message:

```
ux: ShopAdmin — description как multi-line textarea

Поле description в admin-форме товара было single-line
<Input>, что не позволяло ввести многострочный текст для
карточки "Промокоды" (несколько кодов с переносами и
ссылками). Заменено на <textarea rows={6}>. Стиль
согласован с другими полями формы.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Apply-отчёт коротко в:
docs/_session/2026-05-08_28_codeexec_shop_textarea.md
