# Дизайн-система «Сад ведущих»

Живой справочник по визуальному языку проекта. Используй этот документ при разработке новых экранов и компонентов.

---

## Характер и настроение

Тёплый, природный, уютный. Не корпоративный и не минималистичный. Ощущение — как хорошая книга в мягком свете: надёжно, красиво, живо.

Цвет «главного акцента» — зелёный (лесной, приглушённый), не кричащий. Slate-тона сдвинуты в тёплую сторону (слегка бежеватые, не холодно-серые).

---

## Шрифты

| Переменная | Шрифт | Назначение |
|---|---|---|
| `--font-sans` | **Onest** | Основной текст, UI-элементы |
| `--font-display` | **Bricolage Grotesque** → Onest | Заголовки, акцентные подписи |

### Классы типографики

```
section-title      — text-3xl/4xl font-light tracking-tight (заголовок раздела)
section-kicker     — text-xs uppercase tracking-[0.3em] text-slate-400 (надпись над заголовком)
font-display       — применяет Bricolage Grotesque
font-mono          — моноширинный (цифры, счётчики)
```

### Паттерн заголовка экрана

```jsx
<h1 className="text-3xl font-light text-slate-900 mb-1">Название</h1>
<p className="text-slate-500">Подзаголовок или описание</p>
```

---

## Цветовая палитра

> Все цвета переопределены в HEX (не OKLCH) для совместимости с html2pdf.

### Slate — основная палитра (тёплый серо-бежевый)

| Токен | HEX | Применение |
|---|---|---|
| `slate-50` | `#fbf9f3` | Фон страницы |
| `slate-100` | `#f3eee5` | Фон карточек-заглушек, теги |
| `slate-200` | `#e7dfd2` | Границы, разделители |
| `slate-300` | `#d6c9b6` | Скроллбар, неактивные границы |
| `slate-400` | `#b3a18a` | Плейсхолдеры, иконки, кикеры |
| `slate-500` | `#8f7f6a` | Вторичный текст |
| `slate-700` | `#534a40` | Основной текст тела |
| `slate-900` | `#241f19` | Заголовки, тёмный текст |
| `slate-950` | `#15110c` | Фон `surface-ink` |

### Blue — акцентный (лесной зелёный, называется blue по коду)

| Токен | HEX | Применение |
|---|---|---|
| `blue-50` | `#eef6f1` | Hover-фон кнопок ghost |
| `blue-300` | `#8cc5aa` | Мягкий акцент |
| `blue-500` | `#3f8b6b` | Основной акцент (иконки, счётчики) |
| `blue-600` | `#2f6f54` | Кнопка primary, активные состояния |
| `blue-700` | `#265a47` | Hover кнопки primary |

### Indigo — вторичный приглушённый (сине-серый)

Применяется редко, для вторичных акцентов или тегов. Диапазон `#f1f4f6` → `#151c1f`.

### Emerald — статусный зелёный

Стандартный Tailwind-emerald, не переопределялся. Используется для статусов «активен», «оплачен».

### Rose — ошибки и удаление

Стандартный Tailwind-rose. Кнопка `danger`, предупреждения.

---

## Фон и текстура

```css
body {
  background-color: #fbf9f3;
  background-image:
    radial-gradient(circle at top, rgba(63,139,107,0.08), transparent 55%),
    radial-gradient(circle at 20% 20%, rgba(143,127,106,0.15), transparent 40%),
    linear-gradient(180deg, #fbf9f3 0%, #f7f3ea 100%);
}

/* Зернистость поверх всего */
body::before {
  background-image: radial-gradient(rgba(60,50,40,0.08) 1px, transparent 1px);
  background-size: 3px 3px;
  opacity: 0.25;
  mix-blend-mode: multiply;
}
```

Эффект: тёплая кремово-зелёная подложка с едва заметной «бумажной» зернистостью.

---

## Поверхности (Surfaces)

Три класса для контейнеров:

### `surface-card` — основная карточка
```
bg-white/85 backdrop-blur-xl
border border-white/60
shadow-[0_18px_40px_-24px_rgba(27,35,28,0.4)]
rounded-[2rem]
```
Применение: `<Card>`, модальные окна, основные блоки контента.

### `surface-muted` — второстепенная карточка
```
bg-white/70 backdrop-blur-lg
border border-white/70
shadow-[0_12px_30px_-24px_rgba(27,35,28,0.35)]
rounded-[1.75rem]
```
Применение: вложенные блоки, боковые панели, менее важный контент.

### `surface-ink` — тёмная карточка (инверсия)
```
bg-slate-900 text-slate-50
rounded-[1.75rem]
shadow-[0_20px_40px_-24px_rgba(21,17,12,0.7)]
```
Применение: акцентные блоки на тёмном фоне.

> Скругление — `2rem` (32px) для основных, `1.75rem` (28px) для вложенных. Меньше не используется без причины.

---

## Компоненты

### Button

Четыре варианта, все `rounded-2xl px-4 py-3`:

| Вариант | Класс | Применение |
|---|---|---|
| `primary` | `btn-primary` | Главное действие. Зелёный фон, белый текст |
| `secondary` | `btn-secondary` | Альтернативное действие. Белый, граница |
| `ghost` | `btn-ghost` | Третичное. Прозрачный, hover зелёный |
| `danger` | `btn-danger` | Удаление / деструктивное. Rose-50 фон |

```jsx
<Button variant="primary" icon={Save}>Сохранить</Button>
<Button variant="secondary">Отмена</Button>
<Button variant="ghost" icon={Trash2} />
<Button variant="danger">Удалить</Button>
```

Все кнопки: `active:scale-[0.98]` + `transition-all duration-300`.

---

### Input

```jsx
<Input label="Название" placeholder="Введите..." value={v} onChange={e => setV(e.target.value)} />
```

- Label: `text-xs font-semibold uppercase tracking-widest text-slate-400`
- Поле: `input-field` = `rounded-2xl border border-slate-200 bg-white/90 px-4 py-3`
- Focus: `border-blue-400 ring-4 ring-blue-500/10`
- Поддерживает `type="password"` с иконкой показать/скрыть

---

### Card

```jsx
<Card className="...доп. классы">контент</Card>
```

Обёртка над `surface-card p-6`. Поддерживает `onClick`.

---

### ModalShell

```jsx
<ModalShell isOpen={open} onClose={() => setOpen(false)} title="Заголовок" size="md">
  контент
</ModalShell>
```

Размеры: `sm` / `md` / `lg` / `xl` / `full`.
Backdrop: `bg-slate-900/30 backdrop-blur-sm`.
Анимация открытия: `animate-in zoom-in-95 duration-200`.

---

### Pill (тег/бейдж)

```jsx
<span className="pill">Ведущая</span>
```

`rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-500`

---

## Скроллбар

Класс `.custom-scrollbar` — тонкий, тёплый.

```
scrollbar-width: thin
цвет: slate-300 / slate-400 при hover
трек: прозрачный
```

---

## Анимации

Все экраны при появлении:
```
animate-in fade-in slide-in-from-bottom-4 duration-500
```

Модальные окна:
```
animate-in fade-in duration-200        (backdrop)
animate-in zoom-in-95 duration-200     (само окно)
```

Иконка загрузки: `animate-spin-slow` (spin 3s linear infinite).

---

## Иконки

Библиотека: **Lucide React**. Размер по умолчанию в кнопках — `18px`, в заголовках — `20–24px`, декоративные — `48px`.

---

## Паттерн шапки экрана

```jsx
<div className="flex justify-between items-end mb-8">
  <div>
    <h1 className="text-3xl font-light text-slate-900 mb-1">Раздел</h1>
    <p className="text-slate-500">Описание раздела</p>
  </div>
  <div className="text-right hidden md:block">
    <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Метка</div>
    <div className="font-mono text-xl text-blue-600">{count}</div>
  </div>
</div>
```

---

## Паттерн вкладок (tabs)

```jsx
<div className="flex gap-2 bg-slate-100 rounded-2xl p-1 mb-8">
  {tabs.map(t => (
    <button key={t.id}
      className={`flex-1 py-2 px-4 rounded-xl text-sm font-semibold transition-all
        ${tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
      onClick={() => setTab(t.id)}>
      {t.label}
    </button>
  ))}
</div>
```

---

## Паттерн пустого состояния

```jsx
<div className="text-center py-20 text-slate-400">
  <IconName size={48} className="mx-auto mb-4 opacity-50" />
  <p>Текст пустого состояния</p>
</div>
```

---

## Выделение текста

```css
::selection {
  background: rgba(63, 139, 107, 0.2);
  color: #183429;
}
```

---

## Сводка: что не делать

- Не использовать стандартный синий Tailwind (`blue-500 = #3b82f6`) — у нас blue переопределён в зелёный
- Не делать скругления меньше `rounded-xl` (16px) для карточек и кнопок
- Не добавлять тени `shadow-md/lg` напрямую — использовать кастомные через `shadow-[...]` или поверхности
- Не использовать `font-bold` для заголовков — стиль проекта `font-light` / `font-semibold`
- Не делать тёмный текст чисто чёрным — максимум `slate-900` (`#241f19`)
