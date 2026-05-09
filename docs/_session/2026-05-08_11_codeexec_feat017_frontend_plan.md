# FEAT-017 frontend — план реализации

**Адресат:** стратег (claude.ai).
**Автор:** VS Code Claude Code (executor).
**Создано:** 2026-05-08.
**Источник:** [`2026-05-08_10_strategist_feat017_frontend_recon_prompt.md`](2026-05-08_10_strategist_feat017_frontend_recon_prompt.md)
**Статус:** план готов, apply / commit **не делал**.

---

## TL;DR

- **3 файла на правку**: `services/pvlPostgrestApi.js` (+2 метода:
  `listCohorts` и `getAdminProgressSummary`), `views/AdminPvlProgress.jsx`
  (новый, ~250-300 строк), `views/AdminPanel.jsx` (1 import + 1 запись в
  массиве табов + 1 conditional render).
- **AdminStatsDashboard — НЕ отдельный файл**, а inline-компонент внутри
  [AdminPanel.jsx:22](../../views/AdminPanel.jsx#L22). Strategist в prompt'е
  ссылался на `AdminStatsDashboard.jsx` — такого файла нет. Это не
  блокер: AdminPanel и так монолит 1606 строк, новый таб в отдельный
  файл — улучшение, не отклонение от паттерна.
- **RPC `pvl_admin_progress_summary` возвращает `RETURNS jsonb`** — не
  `SETOF jsonb` ([migrations/2026-05-07_phase25_…](../../migrations/2026-05-07_phase25_pvl_admin_progress_summary.sql#L74-L75)). PostgREST для
  `RETURNS jsonb (scalar)` отдаёт значение **напрямую** телом ответа.
  Так как функция внутри делает `jsonb_agg(...)` → возвращается массив
  объектов прямо в body. Никакого outer-wrap'а нет.
- **Когорты — вариант B (fetch).** Проще + чище, и `pvl_cohorts` —
  тривиальная таблица из 4 колонок. Метод `listCohorts` логично жить в
  `pvlPostgrestApi.js`. Hardcode UUID = code smell, отказались.
- **Sortable / filter — inline в AdminPvlProgress.jsx** (для MVP).
  Reusable-инфра в кодовой базе **отсутствует** (recon `_02` это
  подтвердил, проверил повторно — `SortableTable`, `FilterBar`,
  CSV-utility — ничего нет). Дальше — по необходимости.
- **Никаких правок в backend, миграциях, RLS.** Phase 25 + backfill +
  cohort-overwrite-fix уже на проде.

---

## 1. Точки интеграции в AdminPanel.jsx

### 1.1 Текущая структура табов

[`views/AdminPanel.jsx:725-745`](../../views/AdminPanel.jsx#L725-L745):

```jsx
<div className="flex gap-2 items-center justify-between">
    <div className="bg-white/70 p-1 rounded-2xl flex gap-1 w-fit border border-white/60">
        {['stats', 'users', 'content', 'news', 'events', 'shop'].map(t => (
            <button
                key={t}
                onClick={() => { setTab(t); sessionStorage.setItem('adminTab', t); }}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === t
                    ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/70'}`}
            >
                {t === 'stats' ? 'Статистика' : t === 'users' ? 'Пользователи' : t === 'content' ? 'Контент' : t === 'events' ? 'События' : t === 'shop' ? 'Магазин' : 'Новости'}
            </button>
        ))}
    </div>
    {tab === 'users' && <Button variant="ghost" ... />}
</div>

{tab === 'stats' && (
    <AdminStatsDashboard meetings={allMeetings} users={users} />
)}

{tab === 'news' && ( ... )}
```

### 1.2 Diff (правка AdminPanel.jsx)

**А) Добавить import** — рядом с другими импортами views/components в
шапке файла ([L1-L11](../../views/AdminPanel.jsx#L1-L11)):

```diff
 import React, { useState, useEffect, useMemo } from 'react';
 import { Trash2, ... } from 'lucide-react';
 import Button from '../components/Button';
 ...
+import AdminPvlProgress from './AdminPvlProgress';
```

**Б) Добавить `'pvl-progress'` в массив табов и метку** ([L727](../../views/AdminPanel.jsx#L727)):

```diff
-{['stats', 'users', 'content', 'news', 'events', 'shop'].map(t => (
+{['stats', 'users', 'content', 'pvl-progress', 'news', 'events', 'shop'].map(t => (
     <button ...>
-        {t === 'stats' ? 'Статистика' : t === 'users' ? 'Пользователи' : t === 'content' ? 'Контент' : t === 'events' ? 'События' : t === 'shop' ? 'Магазин' : 'Новости'}
+        {t === 'stats' ? 'Статистика' : t === 'users' ? 'Пользователи' : t === 'content' ? 'Контент' : t === 'pvl-progress' ? 'Прогресс ПВЛ' : t === 'events' ? 'События' : t === 'shop' ? 'Магазин' : 'Новости'}
     </button>
 ))}
```

Позиция — после `content`, до `news`: логически админ-аналитика рядом с
content/users, не «зашита» в конец.

**В) Добавить conditional render** — после рендера `stats` ([L743](../../views/AdminPanel.jsx#L743)),
перед `news` ([L745](../../views/AdminPanel.jsx#L745)):

```diff
 {tab === 'stats' && (
     <AdminStatsDashboard meetings={allMeetings} users={users} />
 )}

+{tab === 'pvl-progress' && (
+    <AdminPvlProgress />
+)}
+
 {tab === 'news' && ( ... )}
```

`AdminPvlProgress` без props — он сам ходит за данными в
`pvlPostgrestApi`. Если в будущем понадобится передать что-то из
AdminPanel scope (например, currentUser для тонкой фильтрации) —
расширим.

**Итог по AdminPanel.jsx:** 3 точки правки, всего ~5 добавленных строк.
Никакой логики не двигаем.

### 1.3 Где НЕ трогаем

- `services/dataService.js` — Garden-API, ПВЛ-данные туда не лезут. RPC
  идёт через `pvlPostgrestApi.js`.
- `services/pvlMockApi.js` — это runtime-агрегатор для `PvlPrototypeApp`.
  Админская витрина — отдельный путь напрямую в БД.
- `views/PvlPrototypeApp.jsx` — учительская, к админ-панели отношения
  не имеет.

## 2. Новые методы в `services/pvlPostgrestApi.js`

### 2.1 Где добавлять

После [`upsertPvlStudent`](../../services/pvlPostgrestApi.js#L510-L518) — это конец секции PVL-students,
логически рядом. Точные строки определятся при apply.

### 2.2 Метод 1 — `listCohorts`

```js
async listCohorts() {
    return request('pvl_cohorts', {
        params: { select: 'id,title,year', order: 'year.desc,title.asc' },
    });
},
```

Возвращает массив объектов `{id, title, year}`. Используется в
AdminPvlProgress для select-dropdown'а.

Замечания:
- `select: 'id,title,year'` — не тянем `created_at`, незачем.
- `order: 'year.desc,title.asc'` — последняя когорта сверху.
  Пока одна — порядок неважен; задел на будущее.
- RLS на `pvl_cohorts` — не проверял в этом recon'е (out of scope).
  Если для admin-роли GET запрещён — сделаем читалку через
  RPC `pvl_admin_list_cohorts()` отдельным заходом. Vague-сигнал —
  если на smoke появится 403, будем переделывать.

### 2.3 Метод 2 — `getAdminProgressSummary`

```js
async getAdminProgressSummary(cohortId) {
    const result = await request('rpc/pvl_admin_progress_summary', {
        method: 'POST',
        body: { p_cohort_id: cohortId },
    });
    // RPC RETURNS jsonb, jsonb_agg(...) внутри → PostgREST отдаёт массив
    // объектов телом ответа напрямую. COALESCE(..., '[]'::jsonb)
    // гарантирует, что null не прилетит.
    return Array.isArray(result) ? result : [];
},
```

#### Подтверждение shape ответа (factual)

[`migrations/2026-05-07_phase25_pvl_admin_progress_summary.sql:74-75`](../../migrations/2026-05-07_phase25_pvl_admin_progress_summary.sql#L74-L75):

```sql
CREATE OR REPLACE FUNCTION public.pvl_admin_progress_summary(p_cohort_id uuid)
RETURNS jsonb
```

`RETURNS jsonb` (не `SETOF jsonb`). Тело функции:

```sql
RETURN COALESCE((
    SELECT jsonb_agg(row_data ORDER BY sort_name)
    FROM ( ... ) by_student
), '[]'::jsonb);
```

PostgREST для функций `RETURNS jsonb` возвращает значение скаляром в
HTTP body. Так как `jsonb_agg` производит JSONB array, и
`COALESCE(..., '[]'::jsonb)` гарантирует пустой массив на нулевом
результате, ответ от PostgREST — это **массив объектов** (или `[]`),
без обёртки.

`Array.isArray(result)` страхует, если PostgREST вернёт что-то
неожиданное (теоретически — `null` при отказе). На уровне семантики
RPC не должна возвращать null благодаря COALESCE.

#### Поведение при ошибках

`request()` в `pvlPostgrestApi.js` бросает Error при не-2xx статусе.
Особые случаи:
- **403** — RPC бросает `forbidden: admin role required`, если is_admin()
  ложно. UI должен показать «Доступ только для администратора».
- **JWT misconfig** — есть отдельная обработка в `request()` ([L93-L107](../../services/pvlPostgrestApi.js#L93-L107)),
  падает с `code: 'POSTGREST_JWT_MISCONFIG'`.
- **400 / прочее** — generic ошибка, показываем «Не удалось загрузить»
  + кнопка «Повторить».

## 3. Скелет `views/AdminPvlProgress.jsx`

Новый файл. Один компонент-default-export + локальные хелперы. Стиль
выдержан в духе `AdminStatsDashboard` (inline в AdminPanel) — Tailwind,
`surface-card`, `Card`, `ModalShell` где нужно.

### 3.1 Импорты

```jsx
import React, { useState, useEffect, useMemo } from 'react';
import { ArrowUp, ArrowDown, AlertCircle, RefreshCw } from 'lucide-react';
import Button from '../components/Button';
import { pvlPostgrestApi } from '../services/pvlPostgrestApi';
```

### 3.2 Скелет компонента

```jsx
const STATE_LINE_TONE = {
    'в ритме':         'bg-emerald-50 text-emerald-700 border-emerald-200',
    'нужна проверка':  'bg-blue-50 text-blue-700 border-blue-200',
    'есть долги':      'bg-rose-50 text-rose-700 border-rose-200',
    'ДЗ не начаты':    'bg-slate-100 text-slate-500 border-slate-200',
};

const COLUMNS = [
    { key: 'full_name',     label: 'ФИО',          sortable: true,  align: 'left'  },
    { key: 'mentor_name',   label: 'Ментор',       sortable: true,  align: 'left'  },
    { key: 'hw_total',      label: 'Всего ДЗ',     sortable: true,  align: 'right' },
    { key: 'hw_accepted',   label: 'Принято',      sortable: true,  align: 'right' },
    { key: 'hw_in_review',  label: 'На проверке',  sortable: true,  align: 'right' },
    { key: 'hw_revision',   label: 'На доработке', sortable: true,  align: 'right' },
    { key: 'hw_not_started',label: 'Не начато',    sortable: true,  align: 'right' },
    { key: 'hw_overdue',    label: 'Просрочено',   sortable: true,  align: 'right' },
    { key: 'last_activity', label: 'Активность',   sortable: true,  align: 'right' },
    { key: 'state_line',    label: 'Состояние',    sortable: true,  align: 'left'  },
];

export default function AdminPvlProgress() {
    const [cohorts, setCohorts] = useState([]);
    const [cohortId, setCohortId] = useState(null);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [sort, setSort] = useState({ key: 'full_name', dir: 'asc' });
    const [stateFilter, setStateFilter] = useState('all'); // 'all' | one of state_line

    // 1) Загрузка списка когорт (один раз).
    useEffect(() => {
        let cancelled = false;
        pvlPostgrestApi.listCohorts()
            .then((rows) => {
                if (cancelled) return;
                setCohorts(rows || []);
                if (!cohortId && rows?.length) setCohortId(rows[0].id);
            })
            .catch((e) => !cancelled && setError(formatError(e)));
        return () => { cancelled = true; };
    }, []);

    // 2) Загрузка прогресса при смене когорты.
    useEffect(() => {
        if (!cohortId) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        pvlPostgrestApi.getAdminProgressSummary(cohortId)
            .then((data) => { if (!cancelled) setRows(data); })
            .catch((e) => !cancelled && setError(formatError(e)))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [cohortId]);

    // 3) Сортировка + фильтр (memoized).
    const visibleRows = useMemo(() => {
        let out = rows;
        if (stateFilter !== 'all') out = out.filter(r => r.state_line === stateFilter);
        const { key, dir } = sort;
        const factor = dir === 'asc' ? 1 : -1;
        return [...out].sort((a, b) => compareRows(a, b, key) * factor);
    }, [rows, sort, stateFilter]);

    // 4) Суммарные счётчики.
    const totals = useMemo(() => buildTotals(rows), [rows]);

    return (
        <div className="space-y-4">
            <Header
                cohorts={cohorts}
                cohortId={cohortId}
                onCohortChange={setCohortId}
                onRefresh={() => setCohortId(c => c)}  // re-trigger effect
                totals={totals}
                stateFilter={stateFilter}
                onStateFilterChange={setStateFilter}
            />

            {error && <ErrorBanner error={error} onRetry={() => setCohortId(c => c)} />}

            <Table
                columns={COLUMNS}
                rows={visibleRows}
                sort={sort}
                onSortChange={setSort}
                loading={loading}
                empty={!loading && rows.length === 0}
            />
        </div>
    );
}
```

### 3.3 Подкомпоненты (всё inline в одном файле)

- `Header` — поле «Прогресс студентов ПВЛ», select когорты, фильтр
  state_line, button «Обновить», суммарные счётчики справа.
- `Table` — `<table>` с tbody. Header с `<button onClick={...}>` для
  sortable-колонок + индикатор `ArrowUp`/`ArrowDown`. Строки —
  `state_line` бейджем с тоном из `STATE_LINE_TONE`.
- `ErrorBanner` — простой `<div>` с rose-tint + кнопка «Повторить».

### 3.4 Хелперы

```jsx
function compareRows(a, b, key) {
    const va = a[key], vb = b[key];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;          // null — в конец
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return va - vb;
    return String(va).localeCompare(String(vb), 'ru');
}

function buildTotals(rows) {
    const total = rows.length;
    const counts = rows.reduce((acc, r) => {
        acc[r.state_line] = (acc[r.state_line] || 0) + 1;
        return acc;
    }, {});
    return { total, counts };
}

function formatError(e) {
    if (e?.code === 'POSTGREST_JWT_MISCONFIG') return 'Сервер: PostgREST JWT misconfig.';
    if (String(e?.message || '').includes('forbidden'))
        return 'Доступ только для администратора.';
    return e?.message || 'Не удалось загрузить данные.';
}
```

### 3.5 Что НЕ внутри (по prompt'у)

- CSV-выгрузка — FEAT-016, отдельная сессия.
- Drill-down на студента (клик → подробности) — следующий шаг.
- Группировки по ментору — следующий шаг.
- Графики — overengineering.
- Mobile-стили — стандартный AdminPanel и так не mobile-friendly.

## 4. Колонки таблицы + sortable-поведение

### 4.1 Колонки (10 штук)

| key                | label         | type     | tone source        | align |
|--------------------|---------------|----------|--------------------|-------|
| `full_name`        | ФИО           | string   | —                  | left  |
| `mentor_name`      | Ментор        | string   | —                  | left  |
| `hw_total`         | Всего ДЗ      | int      | —                  | right |
| `hw_accepted`      | Принято       | int      | emerald (мяг.)     | right |
| `hw_in_review`     | На проверке   | int      | blue (мяг.)        | right |
| `hw_revision`      | На доработке  | int      | rose (мяг.)        | right |
| `hw_not_started`   | Не начато     | int      | slate (мяг.)       | right |
| `hw_overdue`       | Просрочено    | int      | rose (жёст.)       | right |
| `last_activity`    | Активность    | timestamp| —                  | right |
| `state_line`       | Состояние     | enum     | STATE_LINE_TONE    | left  |

«Когорта» в таблице **не показываем** — она выбирается выше (один dropdown
= одна когорта на экране). Если стратег захочет колонку «Когорта» — это
лишняя избыточность для MVP.

### 4.2 Поведение sortable

- **Single-column sort.** Клик на header → toggle между `asc` / `desc`
  (третьего «сброса» нет, ведь default-sort `full_name asc` работает по
  тому же принципу).
- **Sort indicator.** Маленькая стрелка (lucide `ArrowUp` / `ArrowDown`)
  справа от label. На несортируемой колонке — ничего.
- **Stable sort.** JS `Array.prototype.sort` стабилен с 2019 (ES2019),
  можно полагаться.
- **`null` / отсутствующие значения** — всегда в конце независимо от
  направления сортировки (см. `compareRows`). Иначе клик «по убыванию» по
  колонке «Просрочено» вышиб бы вверх студентов с `hw_overdue=null`,
  что нелогично.
- **Smart-strings:** `localeCompare(.., 'ru')` для кириллицы, иначе
  «Я» окажется до «А».

### 4.3 Поведение фильтра по `state_line`

Single-select dropdown в Header: `«Все»` / `«в ритме»` /
`«нужна проверка»` / `«есть долги»` / `«ДЗ не начаты»`. Срабатывает
до сортировки (см. `useMemo` в скелете). Дефолт — `«Все»`.

### 4.4 Что с фильтром по ментору?

Strategist заметил: «По ментору (если их > 1)». Сейчас на проде у
большинства студентов `mentor_name = null` (ментор-линки не настроены).
Single-mentor scenario фильтр не нужен — **в MVP не делаем**. Когда
менторов станет >1 на одной когорте, добавим dropdown аналогично
state-фильтру. Open-question 6.3.

## 5. Стратегия по когортам — Вариант B (fetch)

### 5.1 Решение

Берём вариант B. Hardcode UUID — отказ.

### 5.2 Обоснование

- `pvl_cohorts` — таблица из 4 колонок, `select` тривиален.
- Один сетевой round-trip (~50ms) в lifetime компонента — не nightly cost.
- Будущие когорты (FEAT-019 «Сокровищница» + ПВЛ 2027 Поток 2) подъедет
  без правок UI — просто появится вторая опция в dropdown'е.
- Hardcode UUID требовал бы grep'а по коду каждый раз при добавлении
  новой когорты — code smell.

### 5.3 Риск-сценарии

| Сценарий                                | Поведение                                              |
|-----------------------------------------|--------------------------------------------------------|
| Когорт 0 (свежий деплой без seed'а)     | Empty dropdown, заглушка «Когорт нет», без 500.        |
| Когорт 1                                | Auto-select первой при mount'е, dropdown disabled.     |
| Когорт N>1                              | Auto-select первой по `order: year desc, title asc`.   |
| 403 на `pvl_cohorts` (RLS)              | ErrorBanner «Не удалось загрузить когорты». Open-q 6.4 |
| `pvl_cohorts` не существует (404)       | ErrorBanner. Не наш кейс — таблица в seed'е есть.      |

## 6. Open questions

### 6.1 Тест-инфра

В кодовой базе нашёл следы тестов? **Не нашёл** — нет каталога `tests/`,
`__tests__/`, `*.test.js`, нет vitest/jest конфига. Если стратег
хочет smoke-тест на `getAdminProgressSummary` (мок-fetch + проверка,
что возвращается массив) — **отдельный тикет на test-infra**, в этом
не делаем.

### 6.2 RLS на `pvl_cohorts`

Не проверял в recon'е, можно ли сделать GET от admin'а. Если apply
смокается с 403 — придётся завести RPC `pvl_admin_list_cohorts()` с
`SECURITY DEFINER + is_admin()`-чек (по аналогии с phase 25). Pre-apply
проверка: один curl POST на API c admin-JWT. Если стратег согласен,
сделаю это **до** apply'а компонента (быстро, ~2 минуты).

### 6.3 Mentor-фильтр сейчас или потом?

Сейчас: пропускаем. Стратегу — закрепить «когда» (после первого
ментор-онбординга? при N>=2 менторов на когорте?).

### 6.4 Persistence selected cohort

Хранить ли `cohortId` в `sessionStorage` (как `adminTab` у соседних
табов — `views/AdminPanel.jsx:730`)? Логично сохранить — экономит
клик каждый раз. Предлагаю **да**, ключ `adminPvlCohortId`. Решение
стратега.

### 6.5 Refresh-стратегия

В скелете кнопка «Обновить» — re-trigger `useEffect` через `setCohortId(c => c)`.
Это работает (зависимость не сменилась, но мы хотим именно перезапустить).
Альтернатива — отдельный counter-стейт `[refresh, setRefresh]` в deps.
Чище. Предлагаю counter. Open для стратега — мелочь, сам решу при apply.

### 6.6 Auto-refresh (поллинг)

Делать ли auto-refresh каждые N минут? **Не предлагаю.** Админ-таб
открыт редко, ручная кнопка «Обновить» достаточна. Если в будущем
понадобится live-данные — открытый вопрос.

---

## Что НЕ делал (по prompt'у)

- Apply правок в `services/pvlPostgrestApi.js`, `views/AdminPanel.jsx`.
- Создание `views/AdminPvlProgress.jsx`.
- Commit / push.
- Pre-apply smoke (curl на RPC под admin-JWT) — могу сделать перед
  apply'ом, если стратег попросит (open question 6.2).

После 🟢 — apply одним коммитом по структуре «3 файла, ~5 правок в
AdminPanel.jsx + ~30 строк в pvlPostgrestApi.js + новый файл
AdminPvlProgress.jsx ~280 строк». Smoke-чеклист — секция 5 prompt'а
стратега.
