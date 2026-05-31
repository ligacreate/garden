# Preview 2026-05-29 — переименование рефлексий модулей 1/2 (Пиши/Веди)

**Адресат:** Ольга (связной) → стратег.
**Автор:** VS Code Claude Code (codeexec).
**Дата:** 2026-05-29.
**Тип:** preview (diff-on-review). **SQL НЕ применён**, ждёт отдельного 🟢 на apply.
**Авторизация (этап preview):** 🟢 от стратега на минимальную миграцию из плана отчёта `_156`. Курс из 3 модулей «Пиши»/«Веди»/«Люби», выложены два, третий потом. Цель — раздельные item-id под рефлексии модулей 1 и 2.
**Связанные сессии:** `_156` (recon Track E, обнаружение двух items с одинаковым title), `_153` (первый JWT-impersonation Курдюковой).

---

## TL;DR

- 2 строки UPDATE на 2 row-а в `pvl_homework_items`.
- Никаких INSERT/DELETE. Никаких schema-changes. Никаких submissions trogаем.
- 13 существующих submissions на `2138eb7f-…` продолжают висеть на нём же — просто item теперь явно называется «Рефлексия модуля 1 (Пиши)». История сохраняется.
- `de64aa54-…` (0 submissions) переименовывается в «Рефлексия модуля 2 (Веди)» и получает `is_module_feedback=t` (был `=f` — побочный fix баги вчерашнего импорта).
- Реверс-команда зафиксирована (на случай если что).

---

## Items до апдейта (pre-check, для верификации targets)

```sql
SELECT id, title, module_number, is_module_feedback, external_key, created_at
FROM pvl_homework_items
WHERE id IN (
  '2138eb7f-a8ad-459a-8b08-552d3926020f',
  'de64aa54-df66-483c-b162-d8eb94e174ee'
)
ORDER BY created_at;
```

Ожидаемое **до**:

| id | title | module_number | is_module_feedback | external_key | created_at |
|---|---|---|---|---|---|
| `2138eb7f-…` | `Рефлексия по модулю` | NULL | **t** | `task-ci-a1bb1513-97ab-4411-90a5-9857e16fd4a0` | 2026-05-01 19:09:35+03 |
| `de64aa54-…` | `Рефлексия по модулю` | NULL | **f** | `task-ci-5067b49b-38b9-466d-8286-7c0b8786088a` | 2026-05-29 15:22:52+03 |

Если pre-check вернёт что-то иное (title уже изменён, module_number уже проставлен, items не найдены) — **ROLLBACK, докладывай**. Это значит кто-то параллельно правил данные.

---

## SQL — diff-preview

```sql
BEGIN;

-- 1. Pre-check (для верификации в логе run'а)
SELECT id, title, module_number, is_module_feedback, external_key
FROM pvl_homework_items
WHERE id IN (
  '2138eb7f-a8ad-459a-8b08-552d3926020f',
  'de64aa54-df66-483c-b162-d8eb94e174ee'
)
ORDER BY created_at;
-- ожидание (см. таблицу выше): 2 строки, обе title='Рефлексия по модулю', module_number=NULL
-- если иное — ROLLBACK, докладывай

-- 2. UPDATE item «Рефлексия модуля 1 (Пиши)» — куда привязаны 13 исторических submissions
UPDATE pvl_homework_items
SET
  title = 'Рефлексия модуля 1 (Пиши)',
  module_number = 1,
  updated_at = now()
WHERE id = '2138eb7f-a8ad-459a-8b08-552d3926020f'
  AND title = 'Рефлексия по модулю'
  AND module_number IS NULL;
-- ожидание: UPDATE 1
-- is_module_feedback не трогаем — уже =t, корректно

-- 3. UPDATE item «Рефлексия модуля 2 (Веди)» — сегодняшний дубликат, 0 submissions
UPDATE pvl_homework_items
SET
  title = 'Рефлексия модуля 2 (Веди)',
  module_number = 2,
  is_module_feedback = TRUE,
  updated_at = now()
WHERE id = 'de64aa54-df66-483c-b162-d8eb94e174ee'
  AND title = 'Рефлексия по модулю'
  AND module_number IS NULL
  AND is_module_feedback = FALSE;
-- ожидание: UPDATE 1
-- побочный fix: is_module_feedback FALSE → TRUE (вчера при импорте флаг не проставился)

-- 4. Post-check (in-transaction)
SELECT id, title, module_number, is_module_feedback, external_key, updated_at
FROM pvl_homework_items
WHERE id IN (
  '2138eb7f-a8ad-459a-8b08-552d3926020f',
  'de64aa54-df66-483c-b162-d8eb94e174ee'
)
ORDER BY module_number;
-- ожидание: 2 строки, title новые, module_number=1 и 2, is_module_feedback=t у обоих

-- 5. UNIQUE-sanity (новые titles не создают конфликта — на title нет UNIQUE, но проверим что в БД не появилось третьего такого названия)
SELECT title, count(*) FROM pvl_homework_items
WHERE title IN ('Рефлексия модуля 1 (Пиши)', 'Рефлексия модуля 2 (Веди)')
GROUP BY title;
-- ожидание: по 1 строке на каждый title

-- 6. Submissions sanity — 13 на первом item, 0 на втором, ничего не сдвинулось
SELECT homework_item_id, count(*) AS subs
FROM pvl_student_homework_submissions
WHERE homework_item_id IN (
  '2138eb7f-a8ad-459a-8b08-552d3926020f',
  'de64aa54-df66-483c-b162-d8eb94e174ee'
) GROUP BY homework_item_id;
-- ожидание:
--   2138eb7f-… | 13
--   de64aa54-… | (отсутствует в выборке = 0 строк)

SELECT now() AS commit_ts;
COMMIT;

-- 7. Post-COMMIT verify (вне транзакции)
SELECT id, title, module_number, is_module_feedback
FROM pvl_homework_items
WHERE id IN (
  '2138eb7f-a8ad-459a-8b08-552d3926020f',
  'de64aa54-df66-483c-b162-d8eb94e174ee'
)
ORDER BY module_number;
```

Дисциплина apply (на случай нештатных результатов):
- Если pre-check (шаг 1) вернул что-то иное → ROLLBACK.
- Если любой `UPDATE` дал `UPDATE 0` (либо WHERE-фильтр не сматчился — кто-то параллельно поменял) → ROLLBACK.
- Если post-check (шаг 4) показал inconsistent state → ROLLBACK.
- `ensure_garden_grants()` safety-pass — **не требуется** (это row-update, не DDL).
- NOTIFY pgrst — **не требуется** (schema не меняется).

---

## Items после апдейта (ожидаемый post-state)

| id | title | module_number | is_module_feedback | external_key |
|---|---|---|---|---|
| `2138eb7f-…` | **`Рефлексия модуля 1 (Пиши)`** | **1** | t | `task-ci-a1bb1513-…` |
| `de64aa54-…` | **`Рефлексия модуля 2 (Веди)`** | **2** | **t** (был f) | `task-ci-5067b49b-…` |

`external_key` и `id` обоих items **не меняются** — это важно для:
- existing submissions (привязаны по `homework_item_id` = id, не по title или external_key);
- frontend-rendering — карточки не «исчезают» из UI, просто меняют заголовок;
- любых внешних интеграций, которые держат ссылку на `external_key`.

---

## Влияние на UI — что увидят пользователи

### Menti (например, Курдюкова)

**До:**
- В разделе «Подготовка к сертификационному завтраку» — две карточки с одинаковым названием «Рефлексия по модулю»:
  - Одна (`2138eb7f`) со статусом «Принято» (её submission от 4 мая, пустой контент, accepted Василиной из доверия).
  - Вторая (`de64aa54`) — без submission, открывается как новая.
- Жалоба «откуда Принято на задании которое не писала» — из-за этой двойственности.

**После:**
- Карточка **«Рефлексия модуля 1 (Пиши)»** — со статусом «Принято» (её историческая submission, теперь явно привязана к нужному модулю).
- Карточка **«Рефлексия модуля 2 (Веди)»** — открывается как новая, можно сдать рефлексию модуля «Веди» (она дойдёт до модуля 2 после прохождения уроков «Веди»).
- Жалоба Курдюковой получает объяснение: «ты сдавала рефлексию модуля Пиши 4 мая, Василина приняла. Рефлексия модуля Веди — это новое задание, его пока никто не сдавал».
- Аналогично у всех 13 menti когорты 1, у которых есть submission на `2138eb7f` — все увидят её под новым заголовком «модуля 1 (Пиши)».

### Менторы (Федотова, Лузина, …)

**До:** два item'а с одинаковым именем в admin/mentor view, путаница «куда смотреть».

**После:**
- В review-листе видят раздельно «Рефлексия модуля 1 (Пиши)» (где уже есть 13 принятых) и «Рефлексия модуля 2 (Веди)» (где будут поступать новые).
- При желании можно фильтровать/сортировать по `module_number` (если frontend это поддерживает — но это уже follow-up, не блокер).

### Frontend (потенциальные риски)

- Если в коде есть **жёсткое сравнение title по строке** (`title === 'Рефлексия по модулю'`) — оно перестанет матчиться. Это надо проверить grep'ом по коду перед apply. **Если такое сравнение есть — это уже bug** (title не должно быть кодовым идентификатором).
- Если UI группирует/дедуплицирует items по title — старая логика «было две карточки с одинаковым title» больше не сработает. После rename titles разные → две карточки рендерятся как две, что и нужно.
- `module_number` сейчас в task-ci-* пуле нигде не проставлен (`_156` показал). Если frontend читает `module_number` и применяет какую-то logic типа «показывать только items текущего модуля» — теперь две новые карточки могут начать фильтроваться по этому полю. **Стоит грепнуть `module_number` в коде перед apply** (на случай если UI начнёт скрывать одну из карточек).

Я предлагаю стратегу/Ольге сделать quick-grep перед apply:
```bash
grep -rn "module_number\|Рефлексия по модулю" /Users/user/vibecoding/garden_claude/garden/views /Users/user/vibecoding/garden_claude/garden/components /Users/user/vibecoding/garden_claude/garden/services
```
Если что-то критичное найдём — закладываем в apply-сессию.

---

## Реверс-команда (если что)

```sql
BEGIN;

-- Откат 2138eb7f
UPDATE pvl_homework_items
SET
  title = 'Рефлексия по модулю',
  module_number = NULL,
  updated_at = now()
WHERE id = '2138eb7f-a8ad-459a-8b08-552d3926020f'
  AND title = 'Рефлексия модуля 1 (Пиши)'
  AND module_number = 1;

-- Откат de64aa54
UPDATE pvl_homework_items
SET
  title = 'Рефлексия по модулю',
  module_number = NULL,
  is_module_feedback = FALSE,
  updated_at = now()
WHERE id = 'de64aa54-df66-483c-b162-d8eb94e174ee'
  AND title = 'Рефлексия модуля 2 (Веди)'
  AND module_number = 2
  AND is_module_feedback = TRUE;

-- Verify
SELECT id, title, module_number, is_module_feedback
FROM pvl_homework_items
WHERE id IN (
  '2138eb7f-a8ad-459a-8b08-552d3926020f',
  'de64aa54-df66-483c-b162-d8eb94e174ee'
);

COMMIT;
```

Использовать только при apply-stage failure или если frontend сломался после rename — отдельным заходом, с явным 🟢 от стратега.

---

## Что НЕ входит в эту мини-миграцию

- ⛔ Модуль 3 «Люби» — отложен, заведём когда выложите.
- ⛔ Остальные 19 task-ci-* items — НЕ трогаем (не получают `module_number`). Их распределение по модулям — отдельная мини-миграция в будущем.
- ⛔ Legacy task-* (Этап 1, 9 items, 0 subs) — НЕ трогаем, остаются как есть.
- ⛔ submission'ы — НЕ трогаем. 13 строк на `2138eb7f` остаются как были, payload не меняется, status не меняется.
- ⛔ frontend-код — НЕ трогаем (если grep что-то найдёт — отдельный fix отдельным заходом).
- ⛔ Жалоба Курдюковой по статусу «Принято» — после rename симптом исчезнет (она увидит свою submission под правильным title), но это **не означает что в БД что-то поменялось** для неё. Просто UI станет менее путающим.

---

## Готов к apply при 🟢

Когда стратег/Ольга дадут 🟢:
1. Прогон `BEGIN; … COMMIT;` из секции «SQL — diff-preview» одним блоком через `psql`.
2. Capture output (UPDATE counts, pre/post-check rows, commit_ts).
3. Артефакт `docs/_session/2026-05-29_NN_codeexec_reflexia_modules_rename_applied.md` с фактическими результатами (по шаблону `_154`).
4. Telegram-сигнал Ольге чтобы попросила Курдюкову (или любую menti с _156-paттерном) проверить UI — увидит ли она «Рефлексия модуля 1 (Пиши) — Принято».
