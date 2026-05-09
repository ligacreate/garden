# FEAT-016 — план реализации (per-student MD-отчёт + bulk ZIP по модулю)

**Адресат:** стратег (claude.ai).
**Автор:** VS Code Claude Code (executor).
**Создано:** 2026-05-09.
**Источник:** [`2026-05-08_28_strategist_feat016_plan_prompt.md`](2026-05-08_28_strategist_feat016_plan_prompt.md)
+ запрос Ольги в чате (2026-05-09): «можно сделать кнопку скачать
все файлы за первый модуль?» → подтверждено «да, ZIP» → отдельная
секция 6 («Bonus: bulk ZIP-export»).
**Статус:** план готов, apply / commit **не делал**.

---

## TL;DR

- **Mapping `qb-<id>` → текст вопроса** живёт в
  `pvl_content_items.homework_config.questionnaireBlocks[].id ↔ .question`
  (jsonb на content_item). Раскопал прямо в БД, sample подтверждён.
- **API почти есть.** `listStudentHomeworkSubmissions(studentId)` и
  `listHomeworkStatusHistory(submissionId)` — рабочие. Для bulk-mode
  нужен новый метод `listHomeworkStatusHistoryBulk(submissionIds[])`
  через PostgREST `in.(...)`-clause (одиночный запрос вместо N).
- **Submission payload** содержит `versions[]` (с `answersJson` или
  `textContent` в зависимости от типа ДЗ) и `thread[]` (с
  `messageType: 'mentor_review'` для комментариев ментора). Структура
  сложная, но известна (см. секцию 1.4 — sample прямо из БД).
- **Утилита `homeworkAnswerPlainText`** существует
  ([`utils/pvlHomeworkAnswerRichText.js:37`](../../utils/pvlHomeworkAnswerRichText.js#L37)) — DOMPurify с пустым whitelist
  превращает HTML в plain text.
- **JSZip отсутствует в deps** — нужен `npm install jszip` (~30KB
  gzip). Альтернативы (StreamSaver.js / native) не дают преимуществ.
- **Реализация — frontend-only.** Никаких новых RPC. 1 новый утилит-файл
  `utils/pvlHomeworkReport.js` + ~80 строк правок в `views/AdminPvlProgress.jsx`
  + 1 batch-метод в `services/pvlPostgrestApi.js`.

---

## 1. Code-recon (что нашёл в кодовой базе и БД)

### 1.1 Mapping `qb-<id>` → текст вопроса

`qb-id` генерируется per-block:
```js
// utils/pvlQuestionnaireBlocks.js:17-18
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return `qb-${crypto.randomUUID().slice(0, 8)}`;
return `qb-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
```

Это значит — **глобального mapping'а НЕТ.** Каждый homework_item
имеет свои `questionnaireBlocks` с уникальными `qb-<id>`. Mapping
живёт в **`pvl_content_items.homework_config.questionnaireBlocks[]`**
(jsonb на каждый content_item). Подтверждено sample-запросом из БД:

```json
{
  "questionnaireBlocks": [
    {"id": "qb-qa-1", "type": "qa_pair", "question": "Что больше всего запомнилось? ..."},
    {"id": "qb-04603a67", "type": "qa_pair", "question": "Что забираю с собой. ..."},
    {"id": "qb-88318763", "type": "qa_pair", "question": "Что бы я изменила. ..."},
    {"id": "qb-8a7fbf52", "type": "qa_pair", "question": "Мой ментор ..."}
  ]
}
```

**Связь `pvl_homework_items` ↔ `pvl_content_items`:** через
`pvl_homework_items.external_key`. Mock-логика
([`services/pvlMockApi.js:413, 456`](../../services/pvlMockApi.js#L413))
маппит `homework_config ↔ lessonHomework` без преобразований.

### 1.2 API методы для submissions / homework_items / content_items

[`services/pvlPostgrestApi.js`](../../services/pvlPostgrestApi.js) (review):

| Метод | Что делает | Нужно? |
|---|---|---|
| `listStudentHomeworkSubmissions(studentId)` ([L416](../../services/pvlPostgrestApi.js#L416)) | Все submissions студента (включая `payload`) | ✅ как есть |
| `listHomeworkItems()` ([L372](../../services/pvlPostgrestApi.js#L372)) | Все homework_items (с `module_number`, `title`, `external_key`) | ✅ как есть |
| `listContentItems()` ([L180](../../services/pvlPostgrestApi.js#L180)) | Все content_items (с `homework_config`) | ✅ как есть |
| `listHomeworkStatusHistory(submissionId)` ([L468](../../services/pvlPostgrestApi.js#L468)) | History per-submission — 1 ID | ⚠ для bulk нужен batch-вариант |

**Новый метод (план 4.1):**
```js
async listHomeworkStatusHistoryBulk(submissionIds) {
    if (!submissionIds?.length) return [];
    const rows = await request('pvl_homework_status_history', {
        params: {
            select: '*',
            submission_id: `in.(${submissionIds.join(',')})`,
            order: 'submission_id.asc,changed_at.asc',
        },
    });
    return asArray(rows).map((row) => ({
        ...row,
        from_status: normalizeHomeworkStatusFromDb(row.from_status),
        to_status: normalizeHomeworkStatusFromDb(row.to_status),
    }));
}
```

PostgREST поддерживает `in.(...)` нативно. URL может вырасти при
~17 студентов × 17 ДЗ = 289 UUID — это около 11 KB query string.
PostgREST/nginx обычно пропускает до 8 KB. Если упрётся — fallback
на чанкинг по 100 IDs.

### 1.3 Структура submission.payload (real DB sample)

Sample прямо с проды (один из submissions Лилии Малаг по модулю 1):

```json
{
  "versions": [
    {
      "id": "ver-1777364124389-4496",
      "isCurrent": true,
      "isDraft": false,
      "authorRole": "student",
      "answersJson": null,                    // null для free-form
      "textContent": "<p>...</p>",            // HTML, plain-text есть утилитой
      "versionNumber": 1,
      "createdAt": "2026-04-28T08:15:24.389Z",
      ...
    }
    // могут быть version 2, 3 (revision-цикл)
  ],
  "thread": [
    {
      "messageType": "version_submitted",     // студент сдал
      "authorRole": "student",
      "createdAt": "2026-04-28T08:15:24.389Z",
      ...
    },
    {
      "messageType": "status",                // системное сообщение
      "isSystem": true,
      ...
    },
    {
      "messageType": "mentor_review",         // комментарий ментора ←  важно для отчёта
      "authorRole": "mentor",
      "authorUserId": "<uuid>",
      "createdAt": "2026-04-28T18:54:40.080Z",
      "text": "<p>Лилия, добрый день. ...</p>",
      ...
    }
  ],
  "currentVersionId": "ver-1777364124389-4496",
  "draftVersionId": null
}
```

**Два формата ответа:**
- `versions[].answersJson` (Object): `{"qb-...": "<html>", ...}` —
  для типа questionnaire.
- `versions[].textContent` (string): один большой HTML — для
  free-form (например «опишите практику»).

В одной версии заполнено что-то одно: либо answersJson, либо textContent.

### 1.4 Утилита plain-text + где живёт

[`utils/pvlHomeworkAnswerRichText.js:37`](../../utils/pvlHomeworkAnswerRichText.js#L37):
```js
export function homeworkAnswerPlainText(html) {
    /* DOMPurify с пустым whitelist + cleanup */
}
```
Возвращает чистый текст без тегов.

### 1.5 JSZip — ставится отдельно

Нет в `package.json`. Нужно `npm i jszip` — 30KB gzip,
популярная (>10M weekly downloads), стандарт для browser ZIP.
ESM-импорт: `import JSZip from 'jszip';`. Размер bundle вырастет
на ~80KB raw / ~30KB gzip.

### 1.6 AdminPvlProgress — точка интеграции

Текущая структура таблицы ([`views/AdminPvlProgress.jsx`](../../views/AdminPvlProgress.jsx)):

```jsx
{COLUMNS.map((col) => <th>...</th>)}
// COLUMNS: full_name / mentor_name / hw_total / hw_accepted / ... / state_line
```

В строке таблицы нет ячейки «Действия». Нужно добавить:
- 11-я колонка `actions` (без label, header пустой) — содержит
  иконку 📄 / `<Download />` (lucide-react).
- Клик → выпадающее меню с пунктами «Модуль 0…3», «Все модули».

Над таблицей в Header — bulk-action button «Скачать архив».

### 1.7 Browser blob-download — паттерн уже подтвердил

Стандартный паттерн `URL.createObjectURL(blob) → a.click() → revokeObjectURL`,
работает на всех современных браузерах. Помещу в утилиту.

---

## 2. План markdown-шаблона

Финальный шаблон файла (per-student, per-module):

````markdown
# {ФИО студентки} — Модуль {N}

**Курс:** {cohort.title}
**Ментор:** {mentor_name}
**Период:** {min(week.starts_at)} — {max(week.ends_at)}
**Сгенерировано:** {YYYY-MM-DD}

---

## ДЗ {sort_order}: «{homework_item.title}»

**Статус:** {iconStatus} {labelStatus}{`· {score}/{max_score} баллов` if accepted}
**Сдано:** {submitted_at} · **Принято:** {accepted_at}{` · Ревизий: {revision_cycles}` if > 0}

### Ответ

**В: {question}**
{answersJson[qb-id] → plainText}

**В: {question}**
{...}

(или для textContent)
{textContent → plainText}

### Комментарии ментора

**{mentor_name}, {dd.MM.yyyy} — на доработку:**
{thread[].text → plainText}

**{mentor_name}, {dd.MM.yyyy} — принято:**
{...}

---

## ДЗ {sort_order+1}: «...»

(если submission == null → пометка «Не сдано», без секции «Ответ»)

**Статус:** ❌ Не сдано

(контент пропущен)

---
````

### Иконки статусов

| status | icon | label |
|---|---|---|
| `accepted` | ✅ | Принято |
| `in_review` | ⏳ | На проверке |
| `revision` | 🔄 | На доработке |
| `submitted` | 📨 | Отправлено (ждёт начала проверки) |
| `draft` | 📝 | Черновик |
| `overdue` | ❌ | Просрочено |
| (нет submission'а) | ❌ | Не сдано |

### Edge-кейсы

- Версия с `answersJson` И `textContent` одновременно (теоретически) —
  выводим обе.
- Версия с обоими полями `null` — пометка «(пусто)».
- Никаких `mentor_review`-сообщений в thread → секция «Комментарии
  ментора» опускается.
- `revision_cycles > 0`, но текущая версия 1 → пишем «Ревизий: N»
  в шапке. Все версии не выводим (по решению Ольги — только финальная);
  ревизия видна по статусу + комментариям ментора.

---

## 3. Имена файлов

### Per-student / per-module:

`{Имя_Фамилия}_Модуль_{N}_{YYYY-MM-DD}.md`

Пример: `Александра_Титова_Модуль_1_2026-05-09.md`

### Per-student / все модули:

`{Имя_Фамилия}_все_модули_{YYYY-MM-DD}.md`

### Bulk ZIP:

`{cohort_short}_Модуль_{N}_{YYYY-MM-DD}.zip` (содержит N .md-файлов
по одному на студента).

Пример: `Поток_1_Модуль_1_2026-05-09.zip`

### Транслитерация и safe-chars

- **Кириллицу оставляем** (macOS / Obsidian / Windows-NTFS — все
  поддерживают).
- Пробелы в имени → `_`.
- Запрещённые символы (`/ \ : * ? " < > |`) → выкидываем.
- Двойные подчёркивания → одно (нормализация).

Утилита `safeFileName(text)`:
```js
function safeFileName(text) {
    return String(text || 'Без_имени')
        .replace(/[\\/:*?"<>|]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}
```

---

## 4. План реализации

### 4.1 Новый файл `utils/pvlHomeworkReport.js`

API utility-функций:

```js
// Plain-text helper (re-export или import из существующего)
import { homeworkAnswerPlainText } from './pvlHomeworkAnswerRichText.js';

// Безопасное имя файла
export function safeFileName(text) { ... }

// Иконки статусов
export const STATUS_ICONS = { accepted: '✅', in_review: '⏳', ... };
export const STATUS_LABELS = { accepted: 'Принято', ... };

// Собрать questionnaire mapping из content_items для одного homework_item
// Возвращает Map<qb-id, question-text> или null если не questionnaire
export function buildQuestionnaireMap(homeworkItem, contentItems) { ... }

// Главная функция — собирает MD-отчёт по одному студенту/одному модулю
// args: {
//   student: { full_name, ... },
//   mentorName: string,
//   cohortTitle: string,
//   moduleNumber: number | 'all',
//   homeworkItems: [...],         // отфильтрованные по модулю
//   submissions: [...],           // submissions этого студента
//   statusHistoryBySubmission: Map<submission_id, [...history]>,
//   contentItems: [...],          // все, для маппинга qb-id → текст
//   weeks: [...],                 // для расчёта периода модуля
//   mentorsById: Map<uuid, full_name>,  // для имени автора комментария
// }
// → string (markdown)
export function buildStudentMarkdownReport(args) { ... }

// Browser blob-download
export function downloadAsMarkdownFile(filename, content) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// Browser blob-download для ZIP
export async function downloadAsZipFile(filename, files /* Map<name, content> */) {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    for (const [name, content] of files) zip.file(name, content);
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
```

`JSZip` импортирую через **dynamic import**, чтобы не раздувать
основной bundle — он подгрузится только при первом клике на bulk-ZIP.

### 4.2 Новый метод в `services/pvlPostgrestApi.js`

`listHomeworkStatusHistoryBulk(submissionIds[])` — см. 1.2.

Безопасный fallback при больших списках (если PostgREST отдаст 414
URI Too Long):

```js
async listHomeworkStatusHistoryBulk(submissionIds, chunkSize = 100) {
    if (!submissionIds?.length) return [];
    const chunks = [];
    for (let i = 0; i < submissionIds.length; i += chunkSize) {
        chunks.push(submissionIds.slice(i, i + chunkSize));
    }
    const all = [];
    for (const chunk of chunks) {
        const rows = await request('pvl_homework_status_history', {
            params: { select: '*', submission_id: `in.(${chunk.join(',')})`, order: 'submission_id.asc,changed_at.asc' },
        });
        all.push(...asArray(rows).map(/* normalize */));
    }
    return all;
}
```

### 4.3 Правки `views/AdminPvlProgress.jsx`

#### Добавить колонку «Отчёт»

```js
const COLUMNS = [
    ...existing 10 columns...,
    { key: '__actions', label: '', align: 'right' },  // not sortable
];
```

В рендере строки — последняя ячейка с `<td>`, внутри:
```jsx
<ReportDownloadButton
    student={r}
    cohortTitle={cohorts.find(c => c.id === cohortId)?.title || ''}
    homeworkItems={homeworkItems}
    contentItems={contentItems}
    weeks={weeks}
    mentorsById={mentorsById}
/>
```

`ReportDownloadButton` — новый inline-компонент:

```jsx
function ReportDownloadButton({ student, cohortTitle, homeworkItems, contentItems, weeks, mentorsById }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const modules = useMemo(() => {
        const set = new Set(homeworkItems
            .filter(hi => hi.module_number != null)
            .map(hi => hi.module_number)
        );
        return [...set].sort((a, b) => a - b);
    }, [homeworkItems]);

    const handleClick = async (moduleFilter) => {
        setLoading(true);
        try {
            const submissions = await pvlPostgrestApi.listStudentHomeworkSubmissions(student.student_id);
            const submissionIds = submissions.map(s => s.id);
            const history = await pvlPostgrestApi.listHomeworkStatusHistoryBulk(submissionIds);
            const historyByS = groupBy(history, 'submission_id');

            const filteredItems = moduleFilter === 'all'
                ? homeworkItems
                : homeworkItems.filter(hi => hi.module_number === moduleFilter);

            const md = buildStudentMarkdownReport({
                student, mentorName: student.mentor_name, cohortTitle,
                moduleNumber: moduleFilter,
                homeworkItems: filteredItems, submissions,
                statusHistoryBySubmission: historyByS,
                contentItems, weeks, mentorsById,
            });

            const moduleSlug = moduleFilter === 'all' ? 'все_модули' : `Модуль_${moduleFilter}`;
            const filename = `${safeFileName(student.full_name)}_${moduleSlug}_${todayIso()}.md`;
            downloadAsMarkdownFile(filename, md);
        } catch (err) {
            // показать ошибку (через onError callback в parent)
        } finally {
            setLoading(false);
            setOpen(false);
        }
    };

    return (
        <div className="relative">
            <Button variant="ghost" size="sm" onClick={() => setOpen(o => !o)} disabled={loading} title="Скачать отчёт">
                {loading ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}
            </Button>
            {open && (
                <div className="absolute right-0 top-full mt-1 z-10 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[160px]">
                    {modules.map(m => (
                        <button key={m} onClick={() => handleClick(m)} className="block w-full text-left px-3 py-2 hover:bg-slate-50 text-sm">
                            Модуль {m}
                        </button>
                    ))}
                    <div className="border-t border-slate-100 my-1" />
                    <button onClick={() => handleClick('all')} className="block w-full text-left px-3 py-2 hover:bg-slate-50 text-sm">
                        Все модули
                    </button>
                </div>
            )}
        </div>
    );
}
```

#### Загрузка дополнительных данных в основной компонент

Сейчас `AdminPvlProgress` фетчит только `cohorts` + `progress summary`.
Нужно добавить в `useEffect` (один раз):
```js
useEffect(() => {
    Promise.all([
        pvlPostgrestApi.listHomeworkItems(),
        pvlPostgrestApi.listContentItems(),
        pvlPostgrestApi.listCourseWeeks(),
        // mentors via existing API or skip — mentor_name уже в r из RPC
    ]).then(([items, content, weeks]) => {
        setHomeworkItems(items);
        setContentItems(content);
        setWeeks(weeks);
    }).catch(err => setError(formatError(err)));
}, []);
```

(`mentor_name` уже приходит из RPC в каждой строке `r.mentor_name` —
не нужен отдельный fetch.)

### 4.4 Правки в Header (для bulk-export)

Над таблицей добавить кнопку «Скачать архив за модуль…» (рядом с
selectами когорты и state-фильтра):

```jsx
<BulkExportButton
    visibleStudents={visibleRows}
    cohortTitle={...}
    homeworkItems={homeworkItems}
    contentItems={contentItems}
    weeks={weeks}
/>
```

`BulkExportButton`:

```jsx
function BulkExportButton({ visibleStudents, cohortTitle, homeworkItems, contentItems, weeks }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);

    const modules = useMemo(() => /* same as ReportDownloadButton */, [homeworkItems]);

    const handleBulkClick = async (moduleFilter) => {
        setLoading(true);
        setProgress(0);
        try {
            const studentIds = visibleStudents.map(s => s.student_id);
            // Один батч-запрос для всех студентов
            const submissions = await Promise.all(
                visibleStudents.map(s => pvlPostgrestApi.listStudentHomeworkSubmissions(s.student_id))
            );
            const allSubmissionIds = submissions.flat().map(s => s.id);
            const history = await pvlPostgrestApi.listHomeworkStatusHistoryBulk(allSubmissionIds);
            const historyByS = groupBy(history, 'submission_id');

            const filteredItems = moduleFilter === 'all'
                ? homeworkItems
                : homeworkItems.filter(hi => hi.module_number === moduleFilter);

            const files = new Map();
            visibleStudents.forEach((student, idx) => {
                const md = buildStudentMarkdownReport({
                    student, mentorName: student.mentor_name, cohortTitle,
                    moduleNumber: moduleFilter,
                    homeworkItems: filteredItems,
                    submissions: submissions[idx],
                    statusHistoryBySubmission: historyByS,
                    contentItems, weeks, mentorsById: null,
                });
                const moduleSlug = moduleFilter === 'all' ? 'все_модули' : `Модуль_${moduleFilter}`;
                const name = `${safeFileName(student.full_name)}_${moduleSlug}.md`;
                files.set(name, md);
                setProgress(idx + 1);
            });

            const cohortSlug = safeFileName(cohortTitle.replace(/SQL.*$/, '').trim());
            const moduleSlug = moduleFilter === 'all' ? 'все_модули' : `Модуль_${moduleFilter}`;
            const zipName = `${cohortSlug}_${moduleSlug}_${todayIso()}.zip`;
            await downloadAsZipFile(zipName, files);
        } catch (err) { /* show */ } finally {
            setLoading(false);
            setOpen(false);
        }
    };

    return (
        <div className="relative">
            <Button variant="secondary" onClick={() => setOpen(o => !o)} disabled={loading || visibleStudents.length === 0}>
                {loading ? `Готовлю архив... ${progress}/${visibleStudents.length}` : 'Скачать архив за модуль…'}
            </Button>
            {open && (
                <div className="absolute right-0 top-full mt-1 z-10 bg-white border ...">
                    {modules.map(m => <button onClick={() => handleBulkClick(m)}>Модуль {m}</button>)}
                    <div className="border-t" />
                    <button onClick={() => handleBulkClick('all')}>Все модули</button>
                </div>
            )}
        </div>
    );
}
```

**Важная семантика bulk:** работает по **`visibleRows`** (после
`hiddenIds`-фильтра + state-фильтра). Если Ольга отфильтровала «есть
долги» и нажала bulk — получит архив только должников. Это
естественное расширение существующего UX.

### 4.5 Зависимости — `npm i jszip`

Один раз. Никаких peer-deps. Lazy-загрузка через dynamic import — не
влияет на initial bundle.

---

## 5. Open questions для стратега

### 5.1 mentor_name в комментариях

В thread `mentor_review` сообщения содержат `authorUserId` (UUID
ментора), но не имя. Чтобы вывести «Елена Федотова, dd.MM.yyyy»,
нужно резолвить uuid → имя. Варианты:

- **A.** Использовать только `student.mentor_name` из FEAT-017 RPC
  (один основной ментор для студента). **Минус:** если ментор сменился
  по ходу курса, или комментарий оставил co-mentor / куратор —
  будет неверное имя.
- **B.** Загрузить map `id → full_name` для всех users (через
  `dataService.api.getUsers()` или PostgREST `profiles`). **Плюс:**
  точное имя автора.
- **C.** Не выводить имя автора, только дату: «**dd.MM.yyyy** — на
  доработку».

Рекомендация: **B** для точности, опираясь на existing
`api.getUsers()` (он уже вызывается в Garden AdminPanel для users-таба).

### 5.2 Период модуля — точно

Период = min/max по `pvl_course_weeks.starts_at/ends_at` для weeks
данного модуля. Простой `Math.min(...starts_at)` и `Math.max(...ends_at)`
по weeks с `module_number === N`. Готово.

### 5.3 Обработка переноса bulk-семантики

Если `visibleStudents.length > 50` — fetch'и (по 1 на студента) могут
занять минуту. Покажу `progress`. Кнопка «Отменить» — open question
(пока не делаю, complexity не оправдана).

### 5.4 ZIP в bulk vs много .md в bulk

Из чата: ZIP. Подтверждаю.

### 5.5 Серверная генерация (RPC) — нет

Frontend-only. Аргумент: для 1 студента × 17 ДЗ — клиент справится за
секунды. Для bulk 17×17 = ~300 submissions + history — тоже OK
(пара секунд на одной машине ментора). Если упрётся — RPC future.

### 5.6 sort_order ДЗ внутри модуля

`pvl_homework_items.sort_order` — используем для упорядочивания ДЗ
внутри модуля в МД-отчёте. Внутри `homeworkItems` в `useEffect`
сортирую по `module_number ASC, sort_order ASC`.

### 5.7 Что делать с control_points / certification_tasks

Они тоже в `pvl_homework_items` (`item_type IN ('homework',
'control_point', 'certification_task', 'other')`). Phase 25 RPC
агрегирует только `item_type = 'homework' AND NOT is_control_point`.
Для FEAT-016 — оставлю **только `item_type='homework' AND
is_control_point=false`**, чтобы быть консистентным с FEAT-017.
Если Ольга хочет включить control_points — отдельный тикет.

---

## 6. Bonus: bulk ZIP-export модуля (по запросу Ольги 2026-05-09)

Описано в 4.4. Кратко:

- **UX:** кнопка «Скачать архив за модуль…» в Header (рядом с
  cohort/state-фильтрами).
- **Скоп:** работает по `visibleRows` (учитывает hidden-filter + state-фильтр).
- **Выходной артефакт:** `{cohort_slug}_Модуль_{N}_{YYYY-MM-DD}.zip` с
  N .md-файлами.
- **Прогресс:** «Готовлю архив... K/N».
- **Lazy JSZip:** dynamic import — не раздувает initial bundle.

Если стратег НЕ хочет включать в этот заход — секция 6 + 4.4 + 4.5
выкидываются. Per-student остаётся.

---

## 7. Smoke-чеклист (после apply)

⏸️ Локальный preview:
- Сцена 1: per-student кнопка → клик → выпадающее меню → выбор «Модуль 1» →
  скачивается `Александра_Титова_Модуль_1_2026-05-09.md`.
- Открыть в Obsidian / VS Code → отрендерены статусы + ответы
  + комментарии ментора + период.
- Сцена 2: bulk «Скачать архив» → «Модуль 1» → ZIP с N файлами по
  visibleRows.
- Edge-кейс: ученица «Не сдано» → пометка в МД, без блока «Ответ».
- Edge-кейс: ученица с textContent (не questionnaire) → одним блоком plain-text.
- Edge-кейс: ученица с revision-циклом → видим «Ревизий: N» + 2
  комментария ментора в треде.

⏸️ Прод-smoke (после push):
- Cmd+Shift+R на FEAT-017 → колонка «Отчёт» появилась.
- Скачать одну реальную ученицу → проверить МД.

---

## 8. Что НЕ делаю (по prompt'у + договорённостям)

- CSV-сводка по когорте.
- PDF-генерация.
- Server-side report-RPC.
- Email отправка.
- Mock-mode (PVL без БД) — отчёт работает только когда
  `pvlPostgrestApi.isEnabled()`. Под mock'ом — кнопка disabled с
  hint'ом «Только под реальной БД».
- Удаление поля `shop_items.promo_code` (не related, отдельный
  легаси-тикет).

---

## 9. Размер изменений

- **Новых строк кода:** ~350-400 (utility) + ~150-200 (UI components).
- **Новых файлов:** 1 (`utils/pvlHomeworkReport.js`).
- **Правок существующих:** 2 (`views/AdminPvlProgress.jsx`,
  `services/pvlPostgrestApi.js`).
- **Нового deps:** 1 (`jszip`).

Всё за 1 коммит после apply.

---

## Жду 🟢 от стратега

Особенно по:
- 5.1 (mentor_name source — A/B/C).
- 6 (включаем bulk ZIP в этот же заход — да/нет).
- 5.7 (control_points исключаем — подтвердить).
- 5.3 (cancel button для bulk — пока не делаем — подтвердить).

После 🟢 — apply через **локальное preview** (как с магазином), потом
commit + push, отчёт в `_30`.
