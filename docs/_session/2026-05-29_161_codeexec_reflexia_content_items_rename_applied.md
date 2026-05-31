# Apply 2026-05-29 — переименование рефлексий модулей 1/2 в pvl_content_items

**Адресат:** Ольга (связной) → стратег.
**Автор:** VS Code Claude Code (codeexec).
**Дата:** 2026-05-29.
**Тип:** apply, атомарно одной транзакцией (две UPDATE по pvl_content_items).
**Авторизация:** 🟢 от стратега на apply preview `_160` (chain-audit пройден, SWR auto-invalidation работает, cross-table sanity защита от рассинхрона).
**Связанные сессии:** `_156` (recon Track E), `_158`/`_159` (rename pvl_homework_items), `_160` (preview content_items).

---

## TL;DR

- ✅ `UPDATE 1` на `pvl_content_items` (`a1bb1513-…`) → title=«Рефлексия модуля 1 (Пиши)».
- ✅ `UPDATE 1` на `pvl_content_items` (`5067b49b-…`) → title=«Рефлексия модуля 2 (Веди)».
- ✅ Post-check (in-transaction): оба item'а в новом state, status=published сохранён.
- ✅ UNIQUE-sanity: каждый новый title встречается ровно 1 раз.
- ✅ **Cross-table sanity:** `content_items.title == homework_items.title` для обеих строк (`titles_match=t/t`) — full sync с `_159`.
- ✅ COMMIT timestamp: **2026-05-29 18:35:20.81465+03**.
- ✅ Post-COMMIT verify (вне транзакции): зафиксировано.

`ensure_garden_grants()` safety-pass — не вызывал (row-update). NOTIFY pgrst — не требуется.

---

## SQL — план, факт, результаты

### 1. Pre-check

```sql
SELECT id, title, module_number, status, updated_at
FROM pvl_content_items
WHERE id IN ('a1bb1513-…', '5067b49b-…')
ORDER BY module_number;
```

| id | title | module_number | status | updated_at |
|---|---|---|---|---|
| `a1bb1513-…` | Рефлексия по модулю | 1 | published | 2026-05-29 12:40:52.020588+03 |
| `5067b49b-…` | Рефлексия по модулю | 2 | published | 2026-05-29 12:40:52.379541+03 |

✅ Совпало с ожидаемым по `_160`. Никаких параллельных правок между preview и apply.

**Note:** `updated_at = 12:40:52` для обоих — это timestamp создания placement (для a1bb1513) и trigger-обновления при создании 5067b49b. Не наша работа, исторический контекст.

### 2. UPDATE «Рефлексия модуля 1 (Пиши)»

```sql
UPDATE pvl_content_items
SET title = 'Рефлексия модуля 1 (Пиши)', updated_at = now()
WHERE id = 'a1bb1513-…' AND title = 'Рефлексия по модулю' AND module_number = 1;
```

Результат: **`UPDATE 1`** ✅

### 3. UPDATE «Рефлексия модуля 2 (Веди)»

```sql
UPDATE pvl_content_items
SET title = 'Рефлексия модуля 2 (Веди)', updated_at = now()
WHERE id = '5067b49b-…' AND title = 'Рефлексия по модулю' AND module_number = 2;
```

Результат: **`UPDATE 1`** ✅

### 4. Post-check (in-transaction)

| id | title | module_number | status | updated_at |
|---|---|---|---|---|
| `a1bb1513-…` | **Рефлексия модуля 1 (Пиши)** | 1 | published | 2026-05-29 18:35:20.81465+03 |
| `5067b49b-…` | **Рефлексия модуля 2 (Веди)** | 2 | published | 2026-05-29 18:35:20.81465+03 |

✅ Consistent state. `status` сохранён (`published`), `module_number` не сдвинуты, `updated_at` синхронны.

### 5. UNIQUE-sanity

| title | count |
|---|---|
| Рефлексия модуля 1 (Пиши) | 1 |
| Рефлексия модуля 2 (Веди) | 1 |

✅ Никаких дубликатов.

### 6. Cross-table sanity (зачёт по защите от рассинхрона с `_159`)

| content_id | content_title | module_number | homework_id | homework_title | titles_match |
|---|---|---|---|---|---|
| `a1bb1513-…` | Рефлексия модуля 1 (Пиши) | 1 | `2138eb7f-…` | Рефлексия модуля 1 (Пиши) | **t** |
| `5067b49b-…` | Рефлексия модуля 2 (Веди) | 2 | `de64aa54-…` | Рефлексия модуля 2 (Веди) | **t** |

✅ Полная синхронизация content_items ↔ homework_items по external_key. Никакого рассинхрона.

### 7. COMMIT

Timestamp: **`2026-05-29 18:35:20.81465+03`** (Moscow time).

### 8. Post-COMMIT verify (вне транзакции)

| id | title | module_number | status |
|---|---|---|---|
| `a1bb1513-…` | Рефлексия модуля 1 (Пиши) | 1 | published |
| `5067b49b-…` | Рефлексия модуля 2 (Веди) | 2 | published |

✅ Зафиксировано в БД.

---

## Что увидят пользователи

### Курдюкова

После **обычного reload** (F5 / Ctrl+R / Cmd+R):
1. На ~1-2 сек мигнёт старый title из cached `pvl_swr_v1` snapshot.
2. `syncPvlRuntimeFromDb()` async подтянет свежий snapshot → обновит `db.contentItems` → `forceRefresh()` → React re-render.
3. UI отображает:
   - Карточка **«Рефлексия модуля 1 (Пиши)» — Принято** (её историческая submission `ee4f8784-…` от 4 мая, accepted Василиной).
   - Карточка **«Рефлексия модуля 2 (Веди)»** — пустая, можно сдать когда дойдёт по программе.

Жалоба Track E «откуда Принято на задании которое не писала» получает чёткое explanation в UI: «это рефлексия модуля Пиши, ты её сдавала 4 мая, ментор приняла».

### 12 peers Курдюковой (тот же _156-paттерн)

Александра Титова, Анжелика Тарасова, Дарья Зотова, Дарья Старостина, Диана Зернова, Ирина Петруня, Лилия Мaлонг, Марина Шульга, Наталья Махнёва, Ольга Коняхина, Ольга Разжигаева, Ольга Садовникова — после reload увидят свои исторические submissions на «Рефлексия модуля 1 (Пиши)» в статусе «Принято».

### Менторы

В mentor/admin view карточки больше не дубликаты по title — раздельно «Пиши» и «Веди».

### Frontend side-effect

Никаких. SWR auto-invalidation через `syncPvlRuntimeFromDb` отрабатывает автоматически.

### Smoke pending (для Ольги)

Попросить Курдюкову (или сама зайти под ней / посмотреть в admin):
1. **Закрыть таб с pvl-prototype** и открыть заново (или Cmd/Ctrl+R reload).
2. Подождать 2-3 сек после рендера страницы.
3. Должна увидеть оба новых названия рефлексий.
4. Если всё ещё «Рефлексия по модулю» через 10+ сек — DevTools → Application → Local Storage → удалить ключ `pvl_swr_v1` → ещё один reload. (Не должно понадобиться — auto-invalidation работает.)

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
WHERE id IN (
  'a1bb1513-97ab-4411-90a5-9857e16fd4a0',
  '5067b49b-38b9-466d-8286-7c0b8786088a'
)
ORDER BY module_number;

COMMIT;
```

**После реверса content_items** для симметрии стоит откатить и `_159` через [реверс из _158](2026-05-29_158_codeexec_reflexia_modules_rename_preview.md). Иначе останется рассинхрон content_items vs homework_items.

Использовать только при frontend-failure после reload или если стратег явно подтвердил откат.

---

## Backlog для будущих сессий (не сейчас)

### CONTENT-PLACEMENT-MISSING-REFLEXIA-VEDI: добавить placement для `5067b49b-…` (модуль 2 «Веди»)

- **Статус:** 🟡 OPEN
- **Приоритет:** P3 (не блокер — UI fallback в `ensureTaskForContentItem` показывает item без placement)
- **Создано:** 2026-05-29 (после `_160`/`_161` rename рефлексии модуля 2)
- **Контекст:** Chain-audit `_160` показал: для `a1bb1513-…` (Рефлексия модуля 1 «Пиши») есть placement в `pvl_content_placements` (`6de1eb99-…`, module_number=1, week_number=1, target_section=lessons). Для `5067b49b-…` (Рефлексия модуля 2 «Веди») placement **отсутствует**. Frontend всё равно показывает item через fallback в [services/pvlMockApi.js:756-774](../services/pvlMockApi.js#L756-L774) — берёт ВСЕ published homework content items.
- **Риск без placement:** item видим в UI, но не привязан к конкретной неделе/уроку модуля 2. Если frontend в каком-то контексте фильтрует по placement (admin views, reports) — карточка может исчезать. Сейчас 0 submissions у неё, проблема не острая.
- **Что сделать (когда зайдут):** INSERT row в `pvl_content_placements` с content_item_id=`5067b49b-…`, module_number=2, target_section='lessons', cohort_id=когорта 1, is_published=true, week_number (уточнить какая неделя модуля Веди).
- **Связано:** `_156`, `_158`/`_159`, `_160`/`_161`.

### REFLEXIA-MODULE-3-LYUBI: уже зафиксирован в `_159` — ждёт выкладывания модуля 3 «Люби»

### REFLEXIA-ANALYTICS-VIEW: уже зафиксирован в `_159` — аналитика по 3 рефлексиям

(Тикеты пока **не добавлены в `plans/BACKLOG.md`** — batched, по правилу проекта `feedback_backlog_batches_not_micro_docs`. Стратег решит, когда переносить.)

---

## Что я НЕ делал

- ⛔ Не трогал pvl_homework_items (уже синхронны после `_159`).
- ⛔ Не трогал pvl_audit_log (immutable history, 2 create-event'а оставлены как есть).
- ⛔ Не трогал pvl_content_placements (отдельный backlog-тикет про missing placement).
- ⛔ Не делал INSERT нового content_item для модуля 3 «Люби» — отложен.
- ⛔ Не делал git commit / push.
- ⛔ Не отправлял уведомлений Курдюковой / другим menti — это Ольга-связной.

---

## Lesson

После apply положен файл `docs/lessons/2026-05-29-title-lives-in-two-layers.md` — «UI rename = chain-audit content_items + homework_items одновременно, иначе frontend покажет старый title».
