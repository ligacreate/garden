# Apply 2026-05-29 — переименование рефлексий модулей 1/2 (Пиши/Веди)

**Адресат:** Ольга (связной) → стратег.
**Автор:** VS Code Claude Code (codeexec).
**Дата:** 2026-05-29.
**Тип:** apply, атомарно одной транзакцией (две UPDATE по pvl_homework_items).
**Авторизация:** 🟢 от стратега на apply preview `_158`. Frontend-grep сделан стратегом — literal "Рефлексия по модулю" только в `data/pvl/seed.js` (не прод), `module_number` без hardcoded сравнений, `is_module_feedback` не используется на фронте. Единственный side-effect — `AdminPvlProgress.jsx:297` console.info счётчик `resolvedFromFallback` уменьшится на 2 (диагностика, не bug).
**Связанные сессии:** `_156` (recon Track E), `_158` (diff-preview).

---

## TL;DR

- ✅ `UPDATE 1` на `2138eb7f-…` → title=«Рефлексия модуля 1 (Пиши)», module_number=1.
- ✅ `UPDATE 1` на `de64aa54-…` → title=«Рефлексия модуля 2 (Веди)», module_number=2, is_module_feedback=t (был f).
- ✅ Post-check (in-transaction): оба item'а в новом state.
- ✅ UNIQUE-sanity: каждый новый title встречается ровно 1 раз.
- ✅ Submissions-sanity: 13 строк на `2138eb7f` сохранились, `de64aa54` — 0 (как было).
- ✅ COMMIT timestamp: **2026-05-29 18:12:49.691235+03**.
- ✅ Post-COMMIT verify (вне транзакции): зафиксировано.

`ensure_garden_grants()` safety-pass — **не вызывал** (row-update, не DDL). NOTIFY pgrst тоже не нужен.

---

## SQL — план, факт, результаты

### 1. Pre-check

```sql
SELECT id, title, module_number, is_module_feedback, external_key
FROM pvl_homework_items
WHERE id IN ('2138eb7f-…', 'de64aa54-…')
ORDER BY created_at;
```

| id | title | module_number | is_module_feedback | external_key |
|---|---|---|---|---|
| `2138eb7f-…` | Рефлексия по модулю | NULL | t | `task-ci-a1bb1513-…` |
| `de64aa54-…` | Рефлексия по модулю | NULL | f | `task-ci-5067b49b-…` |

✅ Совпало с ожидаемым по `_158`. Никаких параллельных правок.

### 2. UPDATE «Рефлексия модуля 1 (Пиши)»

```sql
UPDATE pvl_homework_items
SET title = 'Рефлексия модуля 1 (Пиши)', module_number = 1, updated_at = now()
WHERE id = '2138eb7f-…'
  AND title = 'Рефлексия по модулю'
  AND module_number IS NULL;
```

Результат: **`UPDATE 1`** ✅

### 3. UPDATE «Рефлексия модуля 2 (Веди)»

```sql
UPDATE pvl_homework_items
SET title = 'Рефлексия модуля 2 (Веди)', module_number = 2, is_module_feedback = TRUE, updated_at = now()
WHERE id = 'de64aa54-…'
  AND title = 'Рефлексия по модулю'
  AND module_number IS NULL
  AND is_module_feedback = FALSE;
```

Результат: **`UPDATE 1`** ✅ Побочный fix `is_module_feedback` `f → t` подтверждён.

### 4. Post-check (in-transaction)

| id | title | module_number | is_module_feedback | external_key | updated_at |
|---|---|---|---|---|---|
| `2138eb7f-…` | **Рефлексия модуля 1 (Пиши)** | **1** | t | `task-ci-a1bb1513-…` | 2026-05-29 18:12:49.691235+03 |
| `de64aa54-…` | **Рефлексия модуля 2 (Веди)** | **2** | **t** | `task-ci-5067b49b-…` | 2026-05-29 18:12:49.691235+03 |

✅ Consistent state, оба updated_at синхронны.

### 5. UNIQUE-sanity (на title)

| title | count |
|---|---|
| Рефлексия модуля 1 (Пиши) | 1 |
| Рефлексия модуля 2 (Веди) | 1 |

✅ Никаких дубликатов, никаких неожиданных третьих row'ов.

### 6. Submissions-sanity

| homework_item_id | subs |
|---|---|
| `2138eb7f-…` | **13** |

`de64aa54-…` отсутствует в выборке = **0** subs (как и было до apply).

✅ Submissions не сдвинулись, 13 исторических submissions Курдюковой + 12 peers остались привязаны к `2138eb7f-…` (теперь «Рефлексия модуля 1 (Пиши)»).

### 7. COMMIT

Timestamp: **`2026-05-29 18:12:49.691235+03`** (Moscow time).

### 8. Post-COMMIT verify (вне транзакции)

| id | title | module_number | is_module_feedback |
|---|---|---|---|
| `2138eb7f-…` | Рефлексия модуля 1 (Пиши) | 1 | t |
| `de64aa54-…` | Рефлексия модуля 2 (Веди) | 2 | t |

✅ Зафиксировано в БД.

---

## Что увидят пользователи (готово к проверке)

### Курдюкова (и 12 peers с submission на `2138eb7f-…`)

- В разделе «Подготовка к сертификационному завтраку» теперь видна карточка **«Рефлексия модуля 1 (Пиши) — Принято»** (её submission от 4 мая 2026, accepted Василиной 5 мая).
- Жалоба Track E «откуда Принято на задании которое не писала» получает explanation: «это рефлексия модуля Пиши, ты её сдавала, ментор приняла из доверия после твоего TG-сообщения».
- Появилась новая карточка **«Рефлексия модуля 2 (Веди)»** — пустая, можно сдать (если она уже дошла до модуля Веди по программе).

### Менторы (Федотова, Лузина и т.д.)

- В mentor/admin view карточки теперь явно разделены по модулям. Где раньше было два item'а с одинаковым заголовком — теперь «Пиши» и «Веди».
- При желании UI может фильтровать по `module_number` (если frontend это поддерживает; на сегодня без явной поддержки, но и не мешает).

### Frontend side-effect

`AdminPvlProgress.jsx:297` console.info счётчик `resolvedFromFallback` уменьшится на 2 (стратег проверил при grep'е). Это диагностический счётчик, не bug.

---

## Реверс-команда (если что)

```sql
BEGIN;

UPDATE pvl_homework_items
SET title = 'Рефлексия по модулю', module_number = NULL, updated_at = now()
WHERE id = '2138eb7f-a8ad-459a-8b08-552d3926020f'
  AND title = 'Рефлексия модуля 1 (Пиши)'
  AND module_number = 1;

UPDATE pvl_homework_items
SET title = 'Рефлексия по модулю', module_number = NULL, is_module_feedback = FALSE, updated_at = now()
WHERE id = 'de64aa54-df66-483c-b162-d8eb94e174ee'
  AND title = 'Рефлексия модуля 2 (Веди)'
  AND module_number = 2
  AND is_module_feedback = TRUE;

SELECT id, title, module_number, is_module_feedback
FROM pvl_homework_items
WHERE id IN (
  '2138eb7f-a8ad-459a-8b08-552d3926020f',
  'de64aa54-df66-483c-b162-d8eb94e174ee'
);

COMMIT;
```

Использовать **только** если frontend сломался или стратег явно подтвердил откат. Иначе — отдельная сессия с диагнозом.

---

## Backlog — для будущих сессий (не сейчас)

### REFLEXIA-MODULE-3-LYUBI: завести «Рефлексия модуля 3 (Люби)» когда выложат третий модуль

- **Статус:** 🔴 TODO (отложен до выкладывания модуля 3)
- **Приоритет:** P2 (продуктовая фича, не блокер)
- **Создано:** 2026-05-29 (после `_159` apply rename модулей 1/2)
- **Контекст:** Курс «Сад ведущих» — 3 модуля: «Пиши» (1), «Веди» (2), «Люби» (3). Сейчас выложены 1 и 2. Item'ы рефлексий для 1 и 2 заведены apply `_159` (`2138eb7f`, `de64aa54` соответственно). Для модуля 3 «Люби» item'а нет.
- **Что сделать (когда выложат):**
  - INSERT новый row в `pvl_homework_items` с `title='Рефлексия модуля 3 (Люби)'`, `module_number=3`, `is_module_feedback=t`, `item_type='homework'`, `external_key='task-ci-<new uuid>'`, `sort_order=0`.
  - Через `pvl_homework_items.created_at` будет 2026-XX-XX — это норма (как любой новый item).
- **Acceptance:** в pool `task-ci-*` есть 3 item'а `is_module_feedback=t` с `module_number=1/2/3`, каждый с уникальным title.
- **Связано:** `_156` (recon), `_158` (preview), `_159` (apply, тот файл что вы читаете).

### REFLEXIA-ANALYTICS-VIEW: аналитика по рефлексиям курса

- **Статус:** 🔴 TODO
- **Приоритет:** P3 (хотелось бы, после модуля 3)
- **Создано:** 2026-05-29
- **Контекст:** Ольга в развилке (см. `_156` Track E) сказала «нам важно проанализировать все рефлексии студентов». После того как 3 модуля заведены — нужен админский view (или Notion-отчёт), где видно:
  - Сколько menti сдали рефлексию по каждому модулю (cohort × module_number).
  - Какие тренды в текстах (sentiment, длина, ключевые слова).
  - Кросс-таб «у кого все 3 рефлексии accepted vs кто застрял на 1/2».
- **Что сделать (когда зайдут):** определить scope (admin-view внутри Garden vs скрипт-выгрузка). Schema уже готова: SELECT по `pvl_student_homework_submissions` JOIN `pvl_homework_items` WHERE `is_module_feedback=t` GROUP BY `module_number`.
- **Не делать сейчас:** модуль 3 не выложен, аналитика преждевременна.

(Тикеты пока **не добавлены в `plans/BACKLOG.md`** — это batched в lessons/_session, чтобы не плодить micro-doc-commits согласно правилу проекта. Стратег решит, когда переносить.)

---

## Что я НЕ делал

- ⛔ Не трогал submissions — 13 строк на `2138eb7f` остались как были, payload не меняется.
- ⛔ Не трогал остальные 19 task-ci-* items (распределение по модулям — отдельная мини-миграция в будущем).
- ⛔ Не трогал legacy `task-*` (Этап 1, 9 items, 0 subs).
- ⛔ Не делал INSERT нового item для модуля 3 «Люби» — отложен по договорённости.
- ⛔ Не делал git commit / push — это data-fix, не код. Артефакты `_158` / `_159` коммитятся обычным flow.
- ⛔ Не отправлял уведомлений Курдюковой / другим menti — это Ольга-связной.
