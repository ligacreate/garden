# End-of-day batch — pushed & deployed

**От:** codeexec (VS Code Claude)
**Кому:** стратег (claude.ai), Ольга
**Дата:** 2026-05-19 12:54 МСК
**В ответ на:** 🟢 от Ольги на end-of-day batch.

## Push'нут — оба commit'а в одной операции

```
$ git push origin main
   794d5a9..9aeb55b  main -> main
```

| SHA | Тип | Что |
|---|---|---|
| `d1ca2ca` | docs(_session) | recovery action — pvl_students backfill for orphan applicants (Razzhigaeva). _75 diff + _76 applied. Commit от ранее в этой сессии, остался как есть. |
| `9aeb55b` | docs | 2026-05-19 end-of-day batch — lessons + backlog + recovery docs. |

## Что вошло в `9aeb55b`

**Lessons (1 update + 2 new):**
- `docs/lessons/2026-05-18-tg-trigger-security-definer-permission-cascade.md` — заменил «⏳ Ждём first natural event» на ✅ verified блок с natural acceptance 2026-05-19 11:06 МСК (Разжигаева → Василина hw_submitted_new push через ~5 сек).
- `docs/lessons/2026-05-19-pvl-first-submit-early-return.md` — NEW. Frontend сторона `BUG-PVL-FRONTEND-STUDENT-HISTORY-WRITE` (`26b5c54`). Early-return after create съедал loop status_history, stacked-masking с phase36.
- `docs/lessons/2026-05-19-tg-long-polling-setinterval-self-dos.md` — NEW. Antipattern `setInterval(pollLongPoll, dt)` где `dt < timeout` → 12 параллельных in-flight getUpdates → 409 «multiple instances» от TG.

**Backlog (`plans/BACKLOG.md`):**
- Закрыто (в Историю 2026-05-19): TG-WEBHOOK-INBOUND-BLOCKED, BUG-PVL-FRONTEND-STUDENT-HISTORY-WRITE, UX-MEETINGS-PUBLIC-FORM-AUTOFILL, recovery Разжигаевой, admin-reset Maria Romanova.
- Удалено из P2: TG-WEBHOOK-INBOUND-BLOCKED (закрыт).
- Открыто в P1: **BUG-PVL-PVL-ONBOARDING-MISSING-STUDENT-RECORD** — architectural fix (recovery лечит симптом, корень — отсутствие атомарного INSERT в pvl_students при регистрации applicant'а).
- Открыто в P3: **UX-MEETINGS-FORM-NATIVE-ALERT** — refactor `views/MeetingsView.jsx:894` `window.alert()` → inline-error/Toast.

**Session docs:**
- `docs/_session/2026-05-19_74_strategist_pending_backlog_updates.md` — твой snapshot pending тикетов (был untracked, теперь зафиксирован).
- `docs/_session/2026-05-19_77_strategist_admin_password_reset_maria_romanova.md` — audit-trail password reset Maria (БЕЗ plaintext).

## Deploy verify

| что | до push'а | после deploy'я |
|---|---|---|
| `curl https://liga.skrebeyko.ru/` | `assets/index-DdIV0l4d.js` | `assets/index-Dgwl91od.js` ✅ |
| HTTP code | 200 | 200 |
| Время от push'а до новой версии в prod | — | ~80 секунд |

Polling-таймлайн:
```
12:54:18 iter=1 hash=                            ← FTP clean-slate, index.html временно отсутствовал
12:54:50 iter=2 hash=assets/index-Dgwl91od.js    ← new bundle live
=== NEW CHUNK DETECTED ===
```

## GitHub Actions

Workflow run для `9aeb55b` — `https://github.com/ligacreate/garden/actions` (точный run ID не достал — локальный `gh` без auth, blocked на `gh auth login`). Концепт concurrency block в `deploy.yml` отработал — FTP clean-slate сменил bundle, новый chunk-hash подтверждён curl'ом выше.

## Финальный статус 2026-05-19

| Дело | Статус |
|---|---|
| Recovery `pvl_students` row для Разжигаевой | ✅ committed `d1ca2ca`, pushed |
| Audit applicant-orphans | ✅ 0 rows (Суроватская — separate point-lookup, отложено) |
| Admin password reset Maria Romanova | ✅ applied (БД), audit-trail в `_77` |
| Lessons батч (phase36 verified + first-submit + tg-polling) | ✅ committed `9aeb55b`, pushed |
| BACKLOG.md update (5 closed → История, 2 new → P1+P3) | ✅ committed `9aeb55b`, pushed |
| `_74` strategist-snapshot + `_77` audit-trail | ✅ committed `9aeb55b`, pushed |
| Prod bundle rotated to `index-Dgwl91od.js` | ✅ verified via curl ~80 сек после push'а |
| Single deploy → one chunk-rotation у пользователей | ✅ (VITE-CHUNK-HASH-FLAPPING expectation met) |

## Что не делалось (open для будущих сессий)

- **Суроватская point-lookup** — `SELECT id, role, access_status, updated_at FROM profiles WHERE email = 'asurovatskaya26@gmail.com';` + проверка в `pvl_students`. Не было в scope сегодняшних 🟢.
- **`BUG-PVL-ONBOARDING-MISSING-STUDENT-RECORD` architectural fix** — заведён в P1, реализация на завтра. Без него следующий новый applicant снова застрянет.
- **`UX-MEETINGS-FORM-NATIVE-ALERT`** — заведён в P3, ~30 мин когда руки дойдут.
- **Lesson `2026-05-19-pvl-onboarding-missing-student-record.md`** — после implementation root-cause fix'а (сейчас был бы lesson «recovery action» — не системный класс).

## Working tree остаётся загрязнённым

Untracked файлы в `docs/journal/` (миграция старых `docs/EXEC_*` / `HANDOVER_*` / `REPORT_*` в новую `journal/` структуру по CLAUDE.md), `dist/assets/*` (новые сборки vs deleted старые), `.claude/settings.json` — **не моё**, не трогал. Это работа предыдущих сессий, ждёт отдельного cleanup-PR.
