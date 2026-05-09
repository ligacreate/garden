# FEAT-017 — Stacked progress bar группы

**Адресат:** VS Code Claude Code (executor).
**Автор:** стратег (claude.ai).
**Создано:** 2026-05-08.

🟢 на apply. Минимальное добавление к существующему компоненту
`views/AdminPvlProgress.jsx`.

## Что делаем

Над текущими badge-счётчиками («Всего: 17 / в ритме: 7 / ...»)
добавить **горизонтальный stacked progress-bar**, визуализирующий
распределение `state_line` по группе.

```
Поток 1 · 17 студенток

[██████████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░]
 в ритме (7)   нужна проверка (7)   есть долги (1)   не начаты (2)
```

Цветовая палитра — переиспользуем существующий `STATE_LINE_TONE` из
этого же файла:
- `'в ритме'` → emerald
- `'нужна проверка'` → blue
- `'есть долги'` → rose
- `'ДЗ не начаты'` → slate

## Места правок

Один файл: `views/AdminPvlProgress.jsx`.

### Что добавить

1. **Новый подкомпонент `GroupProgressBar`** внутри файла (рядом с
   `Header`, `Table`, `ErrorBanner`):

   ```jsx
   function GroupProgressBar({ totals, cohortLabel }) {
       const { total, counts } = totals;
       if (total === 0) return null;
       const segments = [
           { key: 'в ритме',         color: 'bg-emerald-400', label: 'в ритме' },
           { key: 'нужна проверка',  color: 'bg-blue-400',    label: 'нужна проверка' },
           { key: 'есть долги',      color: 'bg-rose-400',    label: 'есть долги' },
           { key: 'ДЗ не начаты',    color: 'bg-slate-300',   label: 'не начаты' },
       ];
       return (
           <div className="space-y-2">
               <div className="text-sm text-slate-600">
                   <span className="font-medium text-slate-800">{cohortLabel}</span>
                   {' · '}
                   <span>{total} студенток</span>
               </div>
               <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
                   {segments.map(seg => {
                       const n = counts[seg.key] || 0;
                       if (n === 0) return null;
                       const pct = (n / total) * 100;
                       return (
                           <div
                               key={seg.key}
                               className={seg.color}
                               style={{ width: `${pct}%` }}
                               title={`${seg.label}: ${n}`}
                           />
                       );
                   })}
               </div>
               <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                   {segments.map(seg => {
                       const n = counts[seg.key] || 0;
                       if (n === 0) return null;
                       return (
                           <span key={seg.key} className="inline-flex items-center gap-1.5">
                               <span className={`inline-block h-2 w-2 rounded-full ${seg.color}`} />
                               {seg.label} ({n})
                           </span>
                       );
                   })}
               </div>
           </div>
       );
   }
   ```

2. **Использовать в основном render** — между `Header` и `Table`,
   передаём `totals` и текущее имя когорты:

   ```jsx
   <Header ... />
   {totals.total > 0 && (
       <GroupProgressBar
           totals={totals}
           cohortLabel={cohorts.find(c => c.id === cohortId)?.title || ''}
       />
   )}
   {error && <ErrorBanner ... />}
   <Table ... />
   ```

### Что НЕ трогаем

- Существующие badge-счётчики в `Header` остаются как есть. Bar их не
  заменяет, дополняет (визуализация vs цифры рядом).
- Никаких правок RPC, `pvlPostgrestApi.js`, миграций, RLS.
- Никаких новых зависимостей.

## Commit

Один commit:

```
ux: FEAT-017 — общий stacked progress bar группы

Над badge-счётчиками — горизонтальная полоска с распределением
по state_line (4 цвета: emerald/blue/rose/slate). Имя когорты
+ N студенток сверху, лейблы с числами под полоской.

Использует существующие totals из useMemo (count по state_line).
Цвета согласованы с STATE_LINE_TONE.

Не V2, не отдельная фича — простая визуализация существующих
данных. ~50 строк JSX.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Push сразу — это UI-патч, не миграция, не безопасностный фикс.

После push — отчёт в файл:
```
docs/_session/2026-05-08_16_codeexec_groupbar_apply_report.md
```

С commit hash, push результат, скриншот не нужен (Ольга проверит
визуально через Cmd+Shift+R).
