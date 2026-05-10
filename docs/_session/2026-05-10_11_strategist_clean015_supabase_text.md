---
от: стратег (claude.ai)
кому: VS Code Claude Code (executor)
дата: 2026-05-10
тема: Точный текст backlog-записи CLEAN-015-SUPABASE-REMOVAL
ответ на: вопрос executor'а к Ольге через AskUserQuestion
---

# Текст для замены в `plans/BACKLOG.md`

Бери **второй вариант** из своего AskUserQuestion (стратег
положит в `_session/_11_*.md`). Ниже — точный текст записи,
которая должна заменить `CLEAN-015-DEAD-DEPS-AUDIT (P3)` в
backlog'е.

---

## Что заменяешь

Текущая запись (от твоего коммита `7e6419d`):

```
CLEAN-015-DEAD-DEPS-AUDIT (P3) — после CLEAN-014 (CLEAN-006 занят
legacy auth.users из Supabase, использовал следующий свободный ID).
Описание: проверить, что @supabase/supabase-js, browser-image-compression,
sharp действительно мёртвые в prod-bundle и удалить из dependencies.
```

## На что заменяешь

```markdown
### CLEAN-015-SUPABASE-REMOVAL

- **Статус:** 🔴 TODO
- **Приоритет:** P2
- **Контекст:** `@supabase/supabase-js` остался в `package.json`
  после миграции с Supabase на голый PostgREST. Стратег recon'нула
  2026-05-10 — пакет **живой**, импортируется в
  `services/realtimeMessages.js` (websocket subscription), который
  используется в `views/CommunicationsView.jsx` для real-time
  чата между ведущими.
- **Решение Ольги (2026-05-10):** real-time в Сообщениях не нужен.
  Заменяем websocket subscription на polling.
- **Шаги:**
  - [ ] Recon: посмотреть текущий flow `subscribeToMessages` в
    `realtimeMessages.js` + использование в `CommunicationsView.jsx`.
    Понять, какой PostgREST endpoint нужен (есть ли уже
    `GET /messages?after=<last_seen>` или нужен новый view).
  - [ ] Спроектировать polling: interval 5-10 сек (TBD по продуктовому
    ощущению), pause при `document.hidden` (tab неактивен), exponential
    backoff при ошибках, mark-as-read механизм сохранить.
  - [ ] Заменить `subscribeToMessages` на polling в
    `views/CommunicationsView.jsx`.
  - [ ] Удалить `services/realtimeMessages.js`.
  - [ ] Удалить `scripts/legacy/*.js` (4 файла:
    `dedupe_schedule_events.js`, `migrate_meetings.js`,
    `migrate_questions_notebooks.js`, `update_event_images.js`) —
    после удаления `@supabase` становятся 100% dead.
  - [ ] `npm uninstall @supabase/supabase-js` →
    обновить `package.json` + `package-lock.json`.
  - [ ] Build: проверить что Supabase chunks вылетели полностью
    (grep по `dist/assets/*.js` строк типа `@supabase/auth-js` —
    должно быть ноль).
  - [ ] Smoke: реальный продуктовый тест на двух устройствах (один
    пишет в Сообщения, второй видит через polling-окно). Регрессия
    Notification → проверить (если есть), regressions в Communications
    UI → проверить.
- **Влияние:**
  - −5.9 MB `node_modules/@supabase` (чище npm install в CI).
  - main bundle: всё что от Supabase осталось после Phase 2A
    tree-shake — уйдёт окончательно.
  - Bundle для Сообщений уменьшится ещё (websocket-libs выпадут).
  - UX-downgrade: моментальная доставка → задержка polling-interval.
    Решение Ольги — приемлемо.
- **НЕ удалять:** `browser-image-compression` — **живой**, в
  `services/dataService.js:6` для сжатия фото при upload. Не
  трогаем в этой задаче.
- **Когда делаем:** ПОСЛЕ Phase 2B (lazy MeetingsView /
  CommunicationsView / MarketView / LeaderPageView). Логика:
  если `CommunicationsView` станет lazy в Phase 2B, основная
  bundle-проблема Supabase на main изначально не существует, и
  CLEAN-015 ускоряется (нужно только заменить Realtime на polling
  внутри CommunicationsView, без ребалансировки main).
- **Связано:** `INFRA-005-SW-CACHE` (RESOLVED), `Phase 2A` (DONE,
  bundle baseline снят), `Phase 2B` (TODO).
- **Дата завода:** 2026-05-10.
```

---

## Что делать

1. **Open `plans/BACKLOG.md`**, найти запись `CLEAN-015-DEAD-DEPS-AUDIT`.
2. Заменить полностью на блок выше (от `### CLEAN-015-SUPABASE-REMOVAL`
   до `**Дата завода:** 2026-05-10.`).
3. **amend в `7e6419d`** (один файл-один коммит, не плодим).
   - `git add plans/BACKLOG.md`
   - `git commit --amend --no-edit` (или с правкой message —
     можешь поменять `chore(docs): backlog — TECH-DEBT-PVLMOCK-MIGRATE
     + CLEAN-015-DEAD-DEPS-AUDIT` на
     `chore(docs): backlog — TECH-DEBT-PVLMOCK-MIGRATE +
     CLEAN-015-SUPABASE-REMOVAL`).
4. **Жди 🟢 PUSH** от стратега.

---

## Что **не** делаешь сейчас

- Не реализуешь CLEAN-015 (это отдельный заход после Phase 2B).
- Не трогаешь `browser-image-compression` — живой.
- Не удаляешь `scripts/legacy/*.js` сейчас — они формально пока ещё
  используют `@supabase`, удаление станет осмысленным когда сам
  пакет уберётся (это часть CLEAN-015 шагов).

---

После amend — отчитайся коротко (один абзац, не отдельный файл),
что замена сделана, в какой коммит amend'нул, какой `git log
--oneline -3` показывает. Дальше — стратег даст 🟢 PUSH.
