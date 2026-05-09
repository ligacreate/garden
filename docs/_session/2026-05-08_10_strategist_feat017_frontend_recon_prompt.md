# FEAT-017 frontend — recon + план реализации

**Адресат:** VS Code Claude Code (executor).
**Автор:** стратег (claude.ai).
**Создано:** 2026-05-08.

## Контекст

Backend готов:
- Phase 25 RPC `pvl_admin_progress_summary(p_cohort_id uuid)` на проде
  (commit `66c7c0e`, applied 2026-05-07).
- Backfill cohort_id (commit `7b832f1`, applied 2026-05-07).
- `BUG-PVL-COHORT-NULL-OVERWRITE` зафиксирован (commit `7c28ed3`,
  applied 2026-05-08) — backfill больше не регрессирует.

Решения по продуктовым вопросам (см. сессию 2026-05-07):
- Дашборд — admin only.
- Размещение — **новый таб `pvl-progress` в AdminPanel.jsx** (рядом с
  stats / users / content / news / events / shop).
- Формат экспорта (FEAT-016) — CSV с UTF-8 BOM (отдельная задача,
  не сейчас).
- module_number / is_module_feedback — структурные поля.

Recon уже есть:
- DB: `docs/_session/2026-05-07_03_strategist_db_recon.md`
- Code: `docs/_session/2026-05-07_02_codeexec_recon_feat016_017_report.md`

## Задача

Спроектировать FEAT-017 frontend реализацию. **Recon + план в файл,
БЕЗ apply.**

## Что нужно

### 1. Recon точек интеграции

- AdminPanel.jsx (~1606 строк) — где именно вставить новый таб
  `pvl-progress`. Структура текущих табов в строках 727-737.
- Каков паттерн существующих табов (stats / users / content):
  - inline-компонент в AdminPanel.jsx или отдельный?
  - как они получают data (props? inline fetch? hooks?)?
- Куда добавить вызов RPC `pvl_admin_progress_summary`:
  - в `services/dataService.js` (общий для Garden) или в
    `services/pvlPostgrestApi.js` (PVL-специфичный)? Логически —
    `pvlPostgrestApi.js`, потому что это PVL-домен.

### 2. Спроектировать вызов RPC

PostgREST POST `/rpc/pvl_admin_progress_summary` с body
`{p_cohort_id: <uuid>}`. Возвращает `jsonb` массив объектов.

В `pvlPostgrestApi.js` добавить метод:
```js
async getAdminProgressSummary(cohortId) {
    const result = await request('rpc/pvl_admin_progress_summary', {
        method: 'POST',
        body: { p_cohort_id: cohortId },
    });
    // PostgREST RETURNS jsonb отдаёт массив (или null если результат)
    return Array.isArray(result) ? result : (result || []);
}
```

(Уточни точный shape ответа — особенно `RETURNS jsonb` vs
`RETURNS SETOF jsonb`. По плану phase 25 — это `RETURNS jsonb`,
один большой объект `[{...}, {...}]`. PostgREST вернёт его как
массив-в-массиве `[<jsonb>]` или развернёт? Это recon.)

### 3. Спроектировать UI компонент

Решение: **отдельный файл `views/AdminPvlProgress.jsx`** (не inline в
AdminPanel — AdminPanel уже монолит 1606 строк). По примеру
`AdminStatsDashboard.jsx`.

#### Компоненты внутри:

- **Header**: «Прогресс студентов ПВЛ» + select когорты (хотя сейчас
  одна — пусть будет single select для будущего).
- **Таблица студентов**:
  - Колонки: ФИО / Когорта / Ментор / ДЗ всего / Принято / На проверке
    / На доработке / Не начали / Просрочено / Последняя активность /
    Состояние.
  - Sortable по любой колонке (click on header).
  - Подсветка `state_line`:
    - «в ритме» — зелёный
    - «нужна проверка» — синий/жёлтый
    - «есть долги» — красный/оранжевый
    - «ДЗ не начаты» — серый
- **Фильтры** (опционально для MVP):
  - По состоянию (state_line dropdown)
  - По ментору (если их > 1)
- **Suммарная статистика** (опционально для MVP): «всего 22,
  в ритме N, на проверке M, есть долги K».

#### Reusable-компоненты — что нужно

По recon `_02`:
- ❌ нет sortable-table — будем строить inline (для MVP) или
  выносить в `components/SortableTable.jsx`?
- ❌ нет filter-bar — inline для MVP.
- ✅ есть `Card.jsx`, `ModalShell.jsx` — переиспользуем стиль.

**Рекомендация**: для MVP — всё inline в `AdminPvlProgress.jsx`. Если
паттерн пригодится для FEAT-016 / других админ-таблиц — потом
рефактор в reusable. Не overengineering на старте.

### 4. Hardcode когорты или fetch?

Сейчас 1 когорта — `'11111111-1111-1111-1111-111111111101'`. Варианты:

- **A.** Hardcode UUID — простой код, минимум вызовов.
- **B.** Fetch `pvl_cohorts` через PostgREST → select-dropdown.

Рекомендация: **B**, потому что:
- Бесплатно (`pvlPostgrestApi.listCohorts` если есть, либо тривиально
  добавить).
- Будущие когорты (FEAT-019 «Сокровищница» подразумевает рост
  платформы → ПВЛ 2027 Поток 2 etc.) поддержатся без правок.
- Hardcode — code smell.

### 5. Frontend smoke checklist

После apply:
- Захоти под админ-JWT в AdminPanel → таб `pvl-progress`.
- Видим список 22 студентов.
- Sortable работает (click headers).
- state_line подсветка корректная.
- Открыть DevTools → Network — POST на `/rpc/pvl_admin_progress_summary`
  с правильным body. 200 + jsonb массив.

### 6. Что НЕ делаем сейчас

- CSV-выгрузка (FEAT-016) — отдельной сессией.
- Drill-down на студента (клик → детали) — отдельный шаг.
- Группировки по ментору — отдельный шаг.
- Графики / charts — overengineering.
- Mobile-responsive детали — стандартный AdminPanel и так не очень
  mobile-friendly, не делаем хуже, но и специально не оптимизируем.

## Что вернуть

План в файл:
```
docs/_session/2026-05-08_11_codeexec_feat017_frontend_plan.md
```

Структура:
- Section 1: Точки интеграции — где именно добавлять таб в
  AdminPanel.jsx + код контекста.
- Section 2: Точные сигнатуры новых методов в `pvlPostgrestApi.js`
  (с цитатой существующего кода + diff добавления).
- Section 3: Структура `views/AdminPvlProgress.jsx` — псевдокод или
  скелет.
- Section 4: Список колонок таблицы + поведение sortable.
- Section 5: Стратегия по когортам (A vs B).
- Section 6: Open questions — продуктовые / технические.

**НЕ apply, НЕ commit. Жду 🟢 после ревью.**
