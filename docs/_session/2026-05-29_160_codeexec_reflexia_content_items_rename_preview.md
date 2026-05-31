# Preview 2026-05-29 — переименование рефлексий модулей 1/2 в pvl_content_items

**Адресат:** Ольга (связной) → стратег.
**Автор:** VS Code Claude Code (codeexec).
**Дата:** 2026-05-29.
**Тип:** preview (diff-on-review). **SQL НЕ применён**, ждёт отдельного 🟢 на apply.
**Авторизация (этап preview):** 🟢 от стратега на UPDATE pvl_content_items.title для двух рефлексий после root-cause из `_159` smoke (frontend читает title из content_items, не из homework_items).
**Связанные сессии:** `_156` (recon Track E), `_158` (preview homework_items), `_159` (apply homework_items + Telegram-смок Курдюковой → title не обновился в UI).

---

## TL;DR

- 2 строки UPDATE на 2 row'а в `pvl_content_items`.
- Chain-audit подтвердил: третьей таблицы с title «Рефлексия по модулю» **нет** (есть только pvl_content_items + pvl_homework_items + immutable pvl_audit_log).
- SWR cache (`pvl_swr_v1`, TTL 24h) **автоматически** инвалидируется через `syncPvlRuntimeFromDb()` на mount/reload PvlPrototypeApp — ручная очистка localStorage не требуется.
- После apply Курдюкова + 12 peers увидят новый title после **reload страницы** (на 1-2 сек мигнёт старый из cache, потом фоновый sync перетрёт).
- Реверс-команда зафиксирована.

---

## Chain-audit ДО UPDATE (read-only) — что проверил

### 1. Все pvl_* таблицы с title/name/heading

```sql
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema='public' AND column_name IN ('title','name','heading')
  AND table_name LIKE 'pvl_%';
```

Найдено 7 таблиц:

| table_name | column_name |
|---|---|
| pvl_calendar_events | title |
| pvl_cohorts | title |
| **pvl_content_items** | **title** ← target |
| pvl_course_lessons | title |
| pvl_course_weeks | title |
| **pvl_homework_items** | **title** ← уже обновлено в _159 |
| pvl_notifications | title |

### 2. Probe каждой таблицы на «Рефлексия» (title-колонка)

| table | hits |
|---|---|
| pvl_calendar_events | 0 |
| pvl_cohorts | 0 |
| **pvl_content_items** | **3** |
| pvl_course_lessons | 0 |
| pvl_course_weeks | 0 |
| **pvl_homework_items** | **3** |
| pvl_notifications | 0 |

### 3. Полный dump найденных строк

| src | id | title |
|---|---|---|
| pvl_content_items | `82f79a48-…` | «Вопросы для рефлексивного отклика» (другое, не цель) |
| **pvl_content_items** | **`a1bb1513-…`** | **«Рефлексия по модулю»** (module_number=1) ← UPDATE |
| **pvl_content_items** | **`5067b49b-…`** | **«Рефлексия по модулю»** (module_number=2) ← UPDATE |
| pvl_homework_items | `2138eb7f-…` | «Рефлексия модуля 1 (Пиши)» (уже после _159) |
| pvl_homework_items | `de64aa54-…` | «Рефлексия модуля 2 (Веди)» (уже после _159) |
| pvl_homework_items | `af4d0eb1-…` | «Рефлексия по модулю 1» (legacy task-4, не трогаем) |

### 4. JSONB-колонки на «Рефлексия по модулю» literal

Просканированы все 19 jsonb-колонок в pvl_*:

| src | hits | действие |
|---|---|---|
| pvl_content_items.metadata | 0 | — |
| pvl_content_items.homework_config | 0 | — |
| pvl_content_items.library_payload | 0 | — |
| pvl_content_items.glossary_payload | 0 | — |
| pvl_student_homework_submissions.payload | 0 | — |
| pvl_homework_status_history.payload | 0 | — |
| pvl_content_placements.metadata | 0 | — |
| pvl_notifications.payload | 0 | — |
| **pvl_audit_log.payload** | **2** | **immutable history, НЕ ТРОГАЕМ** |

### 5. body_html в целевых content_items

| id | body_html length | contains literal? |
|---|---|---|
| `a1bb1513-…` | 0 | false |
| `5067b49b-…` | 0 | false |

body_html пустые → title нигде не дублирован в HTML-теле.

### 6. pvl_content_placements для двух рефлексий

| id | content_item_id | module_number | week_number | is_published | updated_at |
|---|---|---|---|---|---|
| `6de1eb99-…` | `a1bb1513-…` | 1 | 1 | t | 2026-05-29 12:40:56+03 |

Для `5067b49b-…` placement **нет** — этот content_item опубликован (`status=published`), но в курс ещё не размещён. На UI он попадает через `ensureTaskForContentItem` fallback в pvlMockApi.js, который тянет все `published homework content items` независимо от placements.

### 7. pvl_audit_log — два create-event'а

```
aud-1777626909562-7337 | content_item create_content | actor=u-adm-1                              | 2026-05-01 12:15:09+03 | id=a1bb1513 (Пиши)
aud-1780047534212-2766 | content_item create_content | actor=e6de2a97-60f8-4864-a6d9-eb7da2831bf4 | 2026-05-29 12:38:54+03 | id=5067b49b (Веди)
```

Второй create — сегодня в **12:38 МСК**. Через ~3 часа (15:22:52) frontend-sync создал homework_item `de64aa54` через `upsertHomeworkItem` (читая `title=ci.title` — отсюда title «Рефлексия по модулю» в обоих местах). Audit_log — immutable, оставляем как есть.

### Chain-audit резюме

🟢 Третьей таблицы с title «Рефлексия по модулю» **нет**.
🟢 Все JSONB-копии — либо чистые, либо immutable (audit_log) → не требуют UPDATE.
🟢 UPDATE 2 строк в `pvl_content_items.title` — достаточно для полной синхронизации UI.

---

## Items до апдейта (pre-check)

```sql
SELECT id, title, module_number, status, updated_at
FROM pvl_content_items
WHERE id IN (
  'a1bb1513-97ab-4411-90a5-9857e16fd4a0',
  '5067b49b-38b9-466d-8286-7c0b8786088a'
)
ORDER BY module_number;
```

Ожидаемое **до**:

| id | title | module_number | status |
|---|---|---|---|
| `a1bb1513-…` | `Рефлексия по модулю` | 1 | published |
| `5067b49b-…` | `Рефлексия по модулю` | 2 | published |

Если pre-check вернёт что-то иное (title уже изменён, module_number сдвинулся) → **ROLLBACK, докладывай**.

---

## SQL — diff-preview

```sql
BEGIN;

-- 1. Pre-check
SELECT id, title, module_number, status, updated_at
FROM pvl_content_items
WHERE id IN (
  'a1bb1513-97ab-4411-90a5-9857e16fd4a0',
  '5067b49b-38b9-466d-8286-7c0b8786088a'
)
ORDER BY module_number;
-- ожидание: 2 строки, обе title='Рефлексия по модулю', module_number=1 и 2

-- 2. UPDATE content_item «Рефлексия модуля 1 (Пиши)»
UPDATE pvl_content_items
SET
  title = 'Рефлексия модуля 1 (Пиши)',
  updated_at = now()
WHERE id = 'a1bb1513-97ab-4411-90a5-9857e16fd4a0'
  AND title = 'Рефлексия по модулю'
  AND module_number = 1;
-- ожидание: UPDATE 1

-- 3. UPDATE content_item «Рефлексия модуля 2 (Веди)»
UPDATE pvl_content_items
SET
  title = 'Рефлексия модуля 2 (Веди)',
  updated_at = now()
WHERE id = '5067b49b-38b9-466d-8286-7c0b8786088a'
  AND title = 'Рефлексия по модулю'
  AND module_number = 2;
-- ожидание: UPDATE 1

-- 4. Post-check (in-transaction)
SELECT id, title, module_number, status, updated_at
FROM pvl_content_items
WHERE id IN (
  'a1bb1513-97ab-4411-90a5-9857e16fd4a0',
  '5067b49b-38b9-466d-8286-7c0b8786088a'
)
ORDER BY module_number;
-- ожидание: title новые, module_number и status не сдвинуты

-- 5. UNIQUE-sanity (новые titles)
SELECT title, count(*) FROM pvl_content_items
WHERE title IN ('Рефлексия модуля 1 (Пиши)', 'Рефлексия модуля 2 (Веди)')
GROUP BY title;
-- ожидание: по 1 строке на каждый title

-- 6. Cross-table sanity — content_items.title теперь совпадает с homework_items.title
SELECT
  c.id AS content_id,
  c.title AS content_title,
  c.module_number,
  h.id AS homework_id,
  h.title AS homework_title,
  (c.title = h.title) AS titles_match
FROM pvl_content_items c
JOIN pvl_homework_items h ON h.external_key = 'task-ci-' || c.id
WHERE c.id IN (
  'a1bb1513-97ab-4411-90a5-9857e16fd4a0',
  '5067b49b-38b9-466d-8286-7c0b8786088a'
)
ORDER BY c.module_number;
-- ожидание: titles_match=t для обеих строк (full sync с _159)

SELECT now() AS commit_ts;
COMMIT;

-- 7. Post-COMMIT verify (вне транзакции)
SELECT id, title, module_number, status
FROM pvl_content_items
WHERE id IN (
  'a1bb1513-97ab-4411-90a5-9857e16fd4a0',
  '5067b49b-38b9-466d-8286-7c0b8786088a'
)
ORDER BY module_number;
```

Дисциплина apply:
- Если pre-check (шаг 1) показал что-то иное → ROLLBACK.
- Если `UPDATE 0` на любом из шагов 2/3 → ROLLBACK.
- Если cross-table sanity (шаг 6) показал `titles_match=f` → ROLLBACK (рассинхрон с homework_items, значит pre-check был ложный).
- `ensure_garden_grants()` — не требуется (row-update).
- NOTIFY pgrst — не требуется.

---

## Ожидаемый post-state

| id | title | module_number | status |
|---|---|---|---|
| `a1bb1513-…` | **«Рефлексия модуля 1 (Пиши)»** | 1 | published |
| `5067b49b-…` | **«Рефлексия модуля 2 (Веди)»** | 2 | published |

Cross-table consistency после apply:

| content_id | content_title | homework_id | homework_title | match |
|---|---|---|---|---|
| `a1bb1513-…` | Рефлексия модуля 1 (Пиши) | `2138eb7f-…` | Рефлексия модуля 1 (Пиши) | ✅ |
| `5067b49b-…` | Рефлексия модуля 2 (Веди) | `de64aa54-…` | Рефлексия модуля 2 (Веди) | ✅ |

---

## SWR cache audit + влияние на UI

### SWR-механизм (что есть)

- **Ключ:** `localStorage['pvl_swr_v1']` ([services/pvlMockApi.js:1039](garden/services/pvlMockApi.js#L1039)).
- **TTL:** 24 часа ([services/pvlMockApi.js:1068](garden/services/pvlMockApi.js#L1068)).
- **Содержимое:** `{ ts, d: snapshot }`, где `snapshot.items` — это `pvl_content_items` rows (включая title).
- **Когда читается:** `syncPvlRuntimeFromCache()` ([services/pvlMockApi.js:1061](garden/services/pvlMockApi.js#L1061)) — синхронно на mount `PvlPrototypeApp` ([views/PvlPrototypeApp.jsx:8183](garden/views/PvlPrototypeApp.jsx#L8183)).
- **Когда переписывается:** `syncPvlRuntimeFromDb()` ([services/pvlMockApi.js:1074](garden/services/pvlMockApi.js#L1074)) — async на mount **после** cache-применения. Получает свежий snapshot из БД → `applyRuntimeSnapshot` → `localStorage.setItem(pvl_swr_v1, {ts: Date.now(), d: snapshot})`. Затем `forceRefresh()` в UI → React re-render.

### Поведение Курдюковой после apply

**Сценарий 1 — она reload'ит страницу** (наиболее вероятно):

1. Mount PvlPrototypeApp.
2. `syncPvlRuntimeFromCache` — instant: применяет старый snapshot, UI на ~1-2 сек показывает «Рефлексия по модулю» (старый title из её cache).
3. `syncPvlRuntimeFromDb` (async) — приходит свежий snapshot с новым title.
4. `applyRuntimeSnapshot` обновляет `db.contentItems`.
5. localStorage перезаписан свежим snapshot'ом.
6. `forceRefresh()` → React re-render → UI показывает **«Рефлексия модуля 1 (Пиши)» — Принято** и **«Рефлексия модуля 2 (Веди)» — пусто**.

Итог: видит новый title через ~1-3 сек после reload. **Ручная очистка localStorage не нужна.**

**Сценарий 2 — она НЕ reload'ит, держит таб открытым:**

- UI не обновляется до следующего mount компонента / route change на `/pvl-prototype/*`.
- Не нашёл периодического `setInterval` на runtime sync — то есть в открытом табе обновления может не быть до явного reload или ре-навигации.
- Совет: Ольга через TG говорит Курдюковой просто перезагрузить страницу.

### Дополнительно (для других menti с paттерном `_156`)

- 12 peers Курдюковой (Александра Титова, Анжелика Тарасова, Дарья Зотова, Дарья Старостина, Диана Зернова, Ирина Петруня, Лилия Мaлонг, Марина Шульга, Наталья Махнёва, Ольга Коняхина, Ольга Разжигаева, Ольга Садовникова) — у них submissions на `2138eb7f-…` со status=accepted, тоже увидят новый title после reload.
- Менторы (Федотова, Лузина, etc) — в admin/mentor view карточки уже не будут дубликатами по title после reload.

### Smoke pending (для Ольги после apply)

После apply попросить Курдюкову:
1. **Закрыть таб с pvl-prototype** и открыть заново (или Cmd/Ctrl+R reload).
2. Подождать 2-3 сек после рендера страницы.
3. В разделе с «Подготовкой к сертификационному завтраку» должна увидеть:
   - Карточку **«Рефлексия модуля 1 (Пиши)» — Принято** (её историческая submission).
   - Карточку **«Рефлексия модуля 2 (Веди)»** — пусто, если она ещё не сдавала.
4. Если после reload всё ещё «Рефлексия по модулю» — DevTools → Application → Local Storage → удалить ключ `pvl_swr_v1` → ещё один reload. (Это nuclear option, не должен понадобиться.)

---

## Реверс-команда (если что)

```sql
BEGIN;

UPDATE pvl_content_items
SET title = 'Рефлексия по модулю', updated_at = now()
WHERE id = 'a1bb1513-97ab-4411-90a5-9857e16fd4a0'
  AND title = 'Рефлексия модуля 1 (Пиши)'
  AND module_number = 1;

UPDATE pvl_content_items
SET title = 'Рефлексия по модулю', updated_at = now()
WHERE id = '5067b49b-38b9-466d-8286-7c0b8786088a'
  AND title = 'Рефлексия модуля 2 (Веди)'
  AND module_number = 2;

SELECT id, title, module_number, status
FROM pvl_content_items
WHERE id IN ('a1bb1513-…', '5067b49b-…');

COMMIT;
```

**После реверса content_items** для полной симметрии стоит также откатить `_159` через [реверс из _158](2026-05-29_158_codeexec_reflexia_modules_rename_preview.md#реверс-команда-если-что). Иначе останется рассинхрон content_items vs homework_items в title.

---

## Что НЕ входит в эту мини-миграцию

- ⛔ pvl_audit_log — immutable history, никогда не правим.
- ⛔ pvl_content_placements — placement для `5067b49b-…` отсутствует. Может быть **отдельная задача** (стратегу): добавить placement для модуля 2 «Веди» (или решить, что UI fallback в ensureTaskForContentItem достаточен и placement не нужен). НЕ делаем сейчас.
- ⛔ Модуль 3 «Люби» — отложен до выкладывания.
- ⛔ Frontend-код — НЕ трогаем. SWR auto-invalidation работает корректно.
- ⛔ Никаких git commit/push, никаких schema-changes.

---

## Lesson после apply (для memory / lessons)

**Что упустил в `_158`:** title в проекте живёт в **двух слоях** — `pvl_content_items` (источник для UI через `ensureTaskForContentItem.task.title = contentItem.title`) и `pvl_homework_items` (источник для admin-reports/аналитики). Перед любым переименованием UI-видимого title — chain-audit обеих таблиц + JSONB-колонки + body_html. В `_158` я смотрел только homework_items. Надо запомнить: «UI rename — это всегда content_items first, homework_items second (для аналитики)».

После apply `_160` положу краткий lesson-файл в `docs/lessons/` (batched, не отдельным коммитом — по правилу проекта).

---

## Готов к apply при 🟢

Когда стратег/Ольга дадут 🟢:
1. Прогон `BEGIN; … COMMIT;` из секции «SQL — diff-preview» одним блоком через `psql`.
2. Capture output (UPDATE counts, pre/post-check rows, cross-table sanity, commit_ts).
3. Артефакт `docs/_session/2026-05-29_NN_codeexec_reflexia_content_items_rename_applied.md` с фактическими результатами (шаблон `_159`).
4. Сигнал Ольге — попросить Курдюкову reload + проверить новый title в UI.
