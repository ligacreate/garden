# DIFF-ON-REVIEW — «Шеринг» в модели практики (sharing_prompt)

**Дата:** 2026-07-18
**Автор:** codeexec
**Статус:** ✅ ПРИМЕНЕНО 2026-07-18 (🟢, вариант A). Миграция накатана ДО фронта (`\d practices` подтвердил колонку). Код: сериализатор (5 plain + 2 fork), форма (поле «Шеринг (вопрос для обмена в группе)»), рендер сценария (рефлексия+шеринг блоками, порядок инструкция→рефлексия→шеринг), «Финальный шеринг» в конце встречи. Verify PASS: колонка round-trip + PostgREST отдаёт; рендер оба блока (html2canvas-pro скриншот); «Финальный шеринг» на месте; PDF без регресса. JC-2 заголовок оставлен как есть; миграцию применял codeexec.
**Образец:** существующее поле `reflection_questions` (прошёл по всем его точкам).

## Что делаем
Новое поле практики **`sharing_prompt`** (text) — подводка/вопрос, с которым ведущая запускает шеринг (обмен в группе). Модель — как у `reflection_questions`, плюс (сверх образца) рендер в сценарии и строка в шаблоне конца встречи.

## Карта слоёв `reflection_questions` (что зеркалим)
| Слой | Файл:строки | Действие для `sharing_prompt` |
|---|---|---|
| БД-колонка | `migrations/15_practices_extended_fields.sql` (`reflection_questions text`) | новая миграция `sharing_prompt text` |
| Сериализатор (mock localStorage) | `dataService.js` 822, 835 + fork 863 | добавить в `plain` + fork-копию |
| Сериализатор (PostgREST) | `dataService.js` 2347, 2360, 2416 + fork 2411 | добавить в `plain` + fork-копию |
| Чтение | `getPractices/getAdminPractices/getTreasuryPractices/forkPractice` — `select:'*'` | ✅ **без правок** (звёздочка вернёт колонку) |
| Save/load сценария | `normalizeScenarioTimelineItem` (316) — `{ ...entry }` spread | ✅ **без правок** (поле переживает сохранение) |
| Форма | `PracticeFormModal.jsx` 17 (default), 143–150 (поле рефлексии) | default + новое поле сразу ПОСЛЕ рефлексии |
| Timeline item | `addToTimeline` (BuilderView 638) — `{ ...practice }` | ✅ **без правок** (несёт все поля практики) |

---

## Изменения (по файлам)

### 1. Новая миграция — `migrations/2026-07-18_practice_sharing_prompt.sql`
Зеркало миграции 15 (idempotent):
```sql
-- Практики: поле «Шеринг» (подводка/вопрос для обмена в группе).
-- Модель — как reflection_questions (migrations/15_practices_extended_fields.sql).
\set ON_ERROR_STOP on

ALTER TABLE IF EXISTS public.practices
  ADD COLUMN IF NOT EXISTS sharing_prompt text;
```
⚠️ **Порядок выката критичен** (см. раздел «Выкат»): колонка ДО фронта.

### 2. `services/dataService.js` — сериализатор (обе реализации)
5 массивов `plain` — добавить `'sharing_prompt'` рядом с `'reflection_questions'`:
```diff
- plain: ['title', 'description', 'short_goal', 'instruction_short', 'instruction_full', 'reflection_questions', 'time', 'type', 'icon']
+ plain: ['title', 'description', 'short_goal', 'instruction_short', 'instruction_full', 'reflection_questions', 'sharing_prompt', 'time', 'type', 'icon']
```
Строки: **822, 835, 2347, 2360, 2416**.

2 fork-копии — добавить строку рядом с `reflection_questions:` (строки **863** и **2411**):
```diff
  reflection_questions: original.reflection_questions,
+ sharing_prompt: original.sharing_prompt,
```

### 3. `components/PracticeFormModal.jsx`
**buildEmpty** (после строки 17):
```diff
  reflection_questions: '',
+ sharing_prompt: '',
```
**Новое поле** — вставить МЕЖДУ блоком «Вопросы для рефлексивного отклика» (кончается на 150) и «Описание» (151):
```jsx
<div>
    <label className="text-sm font-medium text-slate-700 mb-2 block">Шеринг (вопрос для обмена в группе)</label>
    <textarea
        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 outline-none h-28 resize-y text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
        placeholder="Подводка/вопрос, с которым ведущая запускает шеринг"
        value={formData.sharing_prompt}
        onChange={e => setFormData({ ...formData, sharing_prompt: e.target.value })}
    />
</div>
```

### 4. `views/BuilderView.jsx` — рендер сценария ведущей (scenario-ветка)
После блока практики (`item.description`, строки 409–412), ВНУТРИ `timeline.map` шага, добавить блоки. **См. judgment call JC-1 ниже** — предлагаю рендерить и рефлексию, и шеринг, чтобы получить заявленный порядок «инструкция → рефлексивный отклик → шеринг»:
```jsx
{(item.reflection_questions || item.sharing_prompt) && (
    <div className="mt-3 space-y-3">
        {item.reflection_questions && (
            <div className="bg-amber-50/60 border border-amber-100 rounded-2xl p-4">
                <div className="text-[10px] uppercase tracking-wider text-amber-600 font-bold mb-1">Рефлексивный отклик</div>
                <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{item.reflection_questions}</div>
            </div>
        )}
        {item.sharing_prompt && (
            <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-4">
                <div className="text-[10px] uppercase tracking-wider text-emerald-600 font-bold mb-1">Шеринг</div>
                <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{item.sharing_prompt}</div>
            </div>
        )}
    </div>
)}
```

### 5. `views/BuilderView.jsx:419` — шаблон конца встречи
```diff
  <CheckBoxLine text="Рефлексивный отклик по завтраку (письменно/устно)" />
+ <CheckBoxLine text="Финальный шеринг" />
```

---

## 🟡 Judgment calls — нужно решение вместе с 🟢

**JC-1 (главный) — рендер рефлексии в сценарии.**
`reflection_questions` СЕЙЧАС **нигде в UI не рендерится** — только форма + хранение. Сценарий показывает по шагу лишь `item.description`. Значит заявленный порядок «инструкция → **рефлексивный отклик** → шеринг» буквально недостижим, пока рефлексию не начать рендерить.
- **Вариант A (рекомендую):** рендерить в сценарии оба блока — «Рефлексивный отклик» и «Шеринг» (код в п.4). Плюс: заявленный порядок выполнен, рефлексия наконец видна ведущей. Минус: попутно «включаем» дремавшее поле рефлексии (у старых практик оно пустое → блок не покажется, безопасно).
- **Вариант B (минимальный):** рендерить ТОЛЬКО «Шеринг» после блока практики; рефлексию не трогать. Плюс: строго «добавь шеринг». Минус: порядок «…→ рефлексивный отклик →…» остаётся на бумаге.

**JC-2 — заголовок поля в форме.** Предложил «Шеринг (вопрос для обмена в группе)». Ок или короче/иначе?

**JC-3 — где/когда применяем миграцию.** Прод-БД — только `ssh root@5.129.251.56` (write). Кто применяет: я по твоему go, или ты сама? Колонка обязана лечь ДО фронта (иначе PATCH/POST практики с `sharing_prompt` → PostgREST 400 unknown column).

---

## План верификации (`/verify`, после apply)
1. `npm run build` — чисто.
2. **Миграция** на целевой БД: `\d practices` показывает `sharing_prompt text`.
3. **Форма:** Admin/Practices → редактировать практику → поле «Шеринг» видно сразу после «рефлексивного отклика»; сохранение проходит (PATCH 200/204), значение персистится (reload).
4. **Fork:** форк опубликованной практики сохраняет `sharing_prompt`.
5. **Сценарий:** практика с заполненным шерингом в таймлайне → превью сценария показывает блок «Шеринг» после блока практики (и «Рефлексивный отклик», если вариант A).
6. **Конец встречи:** в блоке «Завершение встречи» есть строка «Финальный шеринг».
7. **PDF сценария:** экспортится с новыми блоками без ошибок (регресс html2canvas-pro).

## Выкат (порядок обязателен)
1. **Миграция ПЕРВОЙ** (write в прод-БД, по твоему go) → проверить колонку.
2. Затем фронт → `git push` (GitHub Actions → FTP на liga, окно 403 ожидаемо).
Разрыв «фронт без колонки» недопустим: сохранение практики с новым полем упадёт на PostgREST.
