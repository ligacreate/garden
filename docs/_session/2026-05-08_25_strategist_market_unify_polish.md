# Магазин — два связанных UX-фикса (через локальное preview)

**Адресат:** VS Code Claude Code (executor).
**Автор:** стратег (claude.ai).
**Создано:** 2026-05-08.

🟢 на оба фикса в один заход. **ЧЕРЕЗ ЛОКАЛЬНОЕ PREVIEW
перед commit/push.**

## Что сделать

### 1. Переместить ShopAdmin внутрь общего контейнера

Фикс прилипания. Сейчас на `views/AdminPanel.jsx:1610`
ShopAdmin рендерится **ВНЕ** контейнера
`<div className="space-y-6">`, поэтому не наследует общие
padding'и → магазин уходит за правый край viewport.

**Действие:** перенести строку
```
{tab === 'shop' && <ShopAdmin onNotify={onNotify} />}
```
ВНУТРЬ контейнера `space-y-6`, рядом с другими табами
(например, сразу после `{tab === 'events' && (...)}`).

### 2. Полировка description в витрине магазина

Файл: `views/MarketView.jsx`, компонент ProductCard.

Контекст: Ольга решила объединить промокоды в **одну общую
карточку** «Промокоды». Описание будет многострочным с URL
внутри текста. Никакого markdown — простой текст с переносами
+ auto-link.

**А) Поддержка переносов строк.**

Добавить класс `whitespace-pre-line` на элемент описания —
тогда `\n` в БД сохранятся при рендере.

**Б) Auto-link для URL.**

Если в тексте есть `https://...` или `http://...` —
превратить в кликабельную `<a>`. Без markdown, простая
regex-замена.

Пример реализации (адаптируй под существующий стиль файла):

```jsx
function renderDescriptionWithLinks(text) {
    if (!text) return null;
    const URL_RE = /(https?:\/\/[^\s)]+)/g;
    const parts = text.split(URL_RE);
    return parts.map((p, i) => {
        if (URL_RE.test(p)) {
            URL_RE.lastIndex = 0;
            return (
                <a
                    key={i}
                    href={p}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-700 underline hover:text-emerald-800"
                >
                    {p}
                </a>
            );
        }
        return p;
    });
}
```

Использовать в JSX:
```jsx
<p className="text-slate-600 whitespace-pre-line">
    {renderDescriptionWithLinks(item.description)}
</p>
```

**В) Удалить отдельный chip промокода в карточке.**

Тот что `ПРОМОКОД LOVELIGA` с border + monospace + caps.
Выпадал из стиля Garden и теперь не нужен — промокоды живут
в тексте описания.

**Г) Контент прижат вверх естественно.**

Убрать `mt-auto` / `justify-between` с кнопки внутри
ProductCard. Кнопка идёт сразу после контента. Карточки
могут быть разной высоты — это нормально, лучше чем пустая
зона посередине.

## Workflow — обязательно через локальное preview

1. Сделать изменения локально. **НЕ commit, НЕ push.**
2. Запустить `npm run dev` (vite). Сообщить Ольге порт
   (обычно `localhost:5173`).
3. Ольга открывает в браузере, смотрит и магазин-таб
   админки (фикс прилипания), и витрину `/market`
   (полировка описания).
4. Дождаться ОК или правок.
5. Если правки — править локально, повторить preview.
6. **После финального ОК Ольги** — commit + push.

## Commit message (после ОК Ольги)

```
ux: магазин — фикс прилипания + полировка карточек

- ShopAdmin перемещён внутрь общего space-y-6 контейнера
  (был случайно вне → выходил за правый край viewport)
- description в карточках товара поддерживает переносы
  строк (whitespace-pre-line) и кликабельные URL
  (auto-link через regex, без markdown по решению Ольги)
- удалён отдельный chip промокода (выпадал из стиля
  Garden — border + monospace + caps); промокод теперь
  часть текста описания
- кнопка карточки естественно после контента, без
  принудительного прижатия к низу

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Apply-отчёт коротко в файл:
```
docs/_session/2026-05-08_26_codeexec_market_unify_apply.md
```
