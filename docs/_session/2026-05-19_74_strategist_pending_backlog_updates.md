# Pending backlog updates — для следующего docs-batch'а

**От:** стратег (claude.ai)
**Кому:** VS Code Claude Code (когда будет следующий накопительный docs/lessons commit)
**Дата:** 2026-05-19
**Тип:** snapshot тикетов для переноса в `plans/BACKLOG.md` при следующем batch-commit'е (избегаем micro-deploys → chunk-hash rotation).

---

## Закрыто сегодня 2026-05-19 — отметить в «История» BACKLOG'а

- ✅ **TG-WEBHOOK-INBOUND-BLOCKED** — long-polling fallback, garden-auth commit `93c21c3` в `ligacreate/garden-auth`. Webhook deleted, polling работает. Step 1 smoke verified (Олга в `@garden_pvl_bot` → `/start` → help-ответ).
- ✅ **BUG-PVL-FRONTEND-STUDENT-HISTORY-WRITE** — `pvlMockApi.js doPersistSubmissionToDb` фикс early-return для first-submit, commit `26b5c54`. Synthetic SQL smoke verified (queue получает корректную запись с recipient=mentor через JWT-симуляцию). Ждём natural acceptance при первой реальной сдаче ДЗ — потом lesson.
- ✅ **UX-MEETINGS-PUBLIC-FORM-AUTOFILL** — `MeetingsView.jsx handleOpenPlan` auto-fill `payment_link` из `user.telegram` или `user.vk` + label «Ссылка для регистрации (TG/VK из профиля)», commit `794d5a9`. Унаследовано из FEAT-002 (TG/VK в profiles). Verified — Мария Бардина и любая ведущая с заполненным profile.telegram получит prefill автоматически.

## Открытое — добавить в «Текущий бэклог»

### P3

- **UX-MEETINGS-FORM-NATIVE-ALERT** — refactor `views/MeetingsView.jsx:894` native `window.alert()` на inline-error pattern (как BUG-MEETINGS-INCOME-NOTIFY-SILENT вчера). Сейчас при missing fields пользователь видит браузерный native dialog с «Блокировать диалоговые окна», что inconsistent с нашим Toast portal + inline rose-error для других validation'ов. Косметика, ~30 мин codeexec. **Не блокер**, форма работает, error message доходит. Завязано на текущий refactor UX-консистентности.

## Параллельные открытые петли (без действий, просто статус)

- 🟡 **FEAT-015 Prodamus auto-pause/unpause** — 95% сделано до сегодня (phase29 applied, push-server handler 436 строк готов, `PRODAMUS_WEBHOOK_ENABLED=false`). Осталось: enable env flag + restart push-server + register webhook URL в Prodamus dashboard + smoke. 30-60 мин отдельной сессии.
- 🟡 **Natural acceptance первой сдачи ДЗ** для BUG-PVL-FRONTEND-STUDENT-HISTORY-WRITE — codeexec ждёт реальную submission любой студенткой, потом dual lesson:
  - `docs/lessons/2026-05-19-tg-trigger-security-definer-permission-cascade.md` (phase36)
  - `docs/lessons/2026-05-19-pvl-first-submit-early-return.md` (этот fix)
- 🟡 **Lesson по TG self-DoS** — `docs/lessons/2026-05-19-tg-long-polling-setinterval-self-dos.md` после Step 3 опционального e2e smoke (если Олга сделает реальную привязку через LINK-код).

## Когда применять

Дождитесь:
- Natural acceptance первой сдачи ДЗ → lesson #1 + lesson #2 finalized + smoke verified для BUG-PVL-FRONTEND-STUDENT-HISTORY-WRITE
- Опционально: Step 3 e2e smoke для TG polling → lesson по self-DoS

Когда хотя бы один из этих наступит — **накопительный docs commit'ом** перенести в BACKLOG.md:
1. Этот файл `_74` (closed + new tickets выше)
2. Финальный lessons (1-3 файлов)
3. Любые другие накопившиеся `_session/` updates

Single commit `docs: lessons + backlog 2026-05-18+19 batch` → один deploy → один chunk-rotation у юзеров вместо 3-4.
