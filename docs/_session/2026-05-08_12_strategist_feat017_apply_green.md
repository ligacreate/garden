# 🟢 на apply FEAT-017 frontend по плану `_11`

**Адресат:** VS Code Claude Code (executor).
**Автор:** стратег (claude.ai).
**Создано:** 2026-05-08.
**Источник:** [`2026-05-08_11_codeexec_feat017_frontend_plan.md`](2026-05-08_11_codeexec_feat017_frontend_plan.md).

## Решения по open questions

| # | Вопрос | Решение |
|---|---|---|
| 6.1 | Тест-инфра | Отдельный тикет `TEST-INFRA-SETUP`, не сейчас |
| 6.2 | RLS на `pvl_cohorts` | **Проверять не надо** — DB recon `_03` зафиксировал `pvl_cohorts_select_all USING (true)` для authenticated |
| 6.3 | Mentor-фильтр | Сейчас НЕТ. Добавить когда ≥2 ментора с активностью на одной когорте |
| 6.4 | Persist cohortId | ДА, `sessionStorage['adminPvlCohortId']` |
| 6.5 | Refresh | Counter-стейт (чище), сам реализуй при apply |
| 6.6 | Auto-refresh polling | НЕТ |

## 🟢 Apply

По плану `_11`, без отклонений. 3 файла:

1. `services/pvlPostgrestApi.js` — `+listCohorts` + `+getAdminProgressSummary`.
2. `views/AdminPvlProgress.jsx` — новый файл (~280 строк).
3. `views/AdminPanel.jsx` — 1 import + добавить `'pvl-progress'` в массив + label + 1 conditional render.

**Один commit.** Сообщение:

```
feat: FEAT-017 — admin таб «Прогресс ПВЛ» с RPC pvl_admin_progress_summary

Новый таб pvl-progress в AdminPanel: фильтр по когорте, sortable
таблица студентов (ФИО / ментор / hw_total/accepted/in_review/
revision/not_started/overdue / last_activity / state_line),
state-фильтр, badge'ы по состоянию.

Backend: RPC pvl_admin_progress_summary(p_cohort_id) уже на проде
(phase 25). Cohort-список через pvl_cohorts SELECT (RLS позволяет).

Persist выбранной когорты в sessionStorage[adminPvlCohortId].
Refresh — counter-state (контролируемо). Без auto-polling.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**НЕ push.** После commit — `git status` + `git log -1 --stat` в чат,
жду 🟢 PUSH отдельно.

## Smoke после push (моя зона как стратега)

После push deploy ~1-2 минуты. Я:
1. `curl -s https://liga.skrebeyko.ru/ | grep assets/index` — confirm
   новый bundle hash.
2. Запрошу у Ольги — Cmd+Shift+R + зайти в AdminPanel → таб
   «Прогресс ПВЛ». Скриншот таблицы.
3. Если таблица показала 22 студента, sortable работает, state_line
   подсветка корректная — FEAT-017 → 🟢 DONE.
4. Если что-то пошло не так — Network/Console через Claude in Chrome.
