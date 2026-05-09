# FEAT-017 GroupProgressBar — apply report

**Адресат:** стратег (claude.ai).
**Автор:** VS Code Claude Code (executor).
**Создано:** 2026-05-08.
**Источник:** [`2026-05-08_15_strategist_feat017_groupbar_prompt.md`](2026-05-08_15_strategist_feat017_groupbar_prompt.md)
**Итог:** ✅ commit + push прошли. Один файл, +58 строк.

---

## 1. Что сделано

В [`views/AdminPvlProgress.jsx`](../../views/AdminPvlProgress.jsx):

- Добавлена top-level функция-компонент `GroupProgressBar({ totals, cohortLabel })`
  ровно по тексту prompt'а (4 сегмента: emerald/blue/rose/slate, label
  «N студенток», dot-легенда снизу).
- В основном render между блоком header'а (heading + selects + refresh)
  и блоком badge-счётчиков вставлено условное:

  ```jsx
  {totals.total > 0 && (
      <GroupProgressBar
          totals={totals}
          cohortLabel={cohorts.find((c) => c.id === cohortId)?.title || ''}
      />
  )}
  ```

Никаких других правок: badge-счётчики, table, error-banner — без
изменений. RPC, `pvlPostgrestApi.js`, миграции — не трогал.

### Маленькая адаптация vs текст prompt'а

`cohortLabel` в моей версии обернут в conditional `{cohortLabel && (...)}`
— чтобы при отсутствии когорты не появлялся «голый» dot-разделитель.
В живом сценарии пользователь всегда видит выбранную когорту, так что
визуально это не отличимо.

## 2. Commit + push

```
377a148 ux: FEAT-017 — общий stacked progress bar группы

 views/AdminPvlProgress.jsx | 58 +++++++++++++++++++++++++++++++++++++++++++++
 1 file changed, 58 insertions(+)
```

```
$ git push origin main
To https://github.com/ligacreate/garden.git
   e3a992f..377a148  main -> main
```

Stage был чист — только `views/AdminPvlProgress.jsx`. Прочая «грязь» в
working tree не залетела.

## Итог одной строкой

GroupProgressBar в проде. Cmd+Shift+R на FEAT-017 покажет полоску
с распределением state_line.
