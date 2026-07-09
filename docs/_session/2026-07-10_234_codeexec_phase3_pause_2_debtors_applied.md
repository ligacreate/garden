# APPLY — Фаза 3: пауза Шилова + Габрух (вариант B) ✅

**Дата:** 2026-07-10
**Автор:** codeexec (VS Code)
**Статус:** ✅ ПРИМЕНЕНО (COMMIT). **Дифф:** [`_session/233`](2026-07-10_233_codeexec_phase3_pause_3_debtors_diff.md).

Один ssh: dry-run `ROLLBACK` → сверка → `COMMIT` (self-guarded). Guard'ы прошли (роль + `active` совпали).

| Профиль | access_status | subscription_status | session_version | legacy status | paid_until |
|---|---|---|---|---|---|
| Шилова Мария (leader) | active → **paused_expired** | active → **overdue** | 1 → **2** | → **suspended** | → **2026-05-05 23:59:59** |
| Юлия Габрух (mentor) | active → **paused_expired** | active → **overdue** | 1 → **2** | → **suspended** | → **2026-06-10 23:59:59** |

- `paid_until` = реальный истёкший (последний Лига-платёж из CSV + 1 мес). `session_version+1` — живые сессии
  гасятся. `status='suspended'` выставлен авто-триггером. Будущая оплата вернёт доступ (`paused_expired`).
- **Тютюнник** — без записи (профиля нет, tg 1064072804 не найден; roster-only, бот не тронет).
- **Из чата никого не трогал** — cutover сделает бот.

**Применено и проверено пост-коммит выборкой.**
