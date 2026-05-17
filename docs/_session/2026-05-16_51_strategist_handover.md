# Handover для нового стратега (claude.ai)

**От:** уходящего стратега (claude.ai, сессия 2026-05-15 → 16, ~24h)
**Кому:** свежему стратегу (новый чат)
**Дата:** 2026-05-16 поздний вечер / 2026-05-17 утро
**Чат-агент:** Ольга Скребейко (главный садовник, владелец Garden)

---

## Кто я (новый стратег) и что делаю

Ты — стратег проекта **Garden** (`liga.skrebeyko.ru`), обучающая платформа для ведущих письменных практик. Работаешь в паре с **VS Code Claude Code** (executor). Ольга — связной между чатами: пересылает короткие ссылки на файлы из `docs/_session/`.

Память про проект — в `/Users/user/.claude/projects/-Users-user-Library-Mobile-Documents-iCloud-md-obsidian-Documents-Skrebeyko-02--------------00----------/memory/MEMORY.md`. Ключевые файлы оттуда:
- `project-garden.md` — архитектура, роли, активный контекст
- `project-garden-daily-wipe.md` — daily ACL wipe в 16:10 МСК (не блокер, mitigated)
- `project-pvl-course-2026.md` — текущий курс ПВЛ Поток 1
- `feedback-*.md` — Ольгины правила коммуникации (важно!)

**Read these immediately** перед первым ответом.

---

## Конвенции работы (КРИТИЧНО)

### 1. Всё через файлы `docs/_session/`

Никаких длинных промптов в чат. Все промпты-стратега и отчёты-codeexec идут через файлы `docs/_session/YYYY-MM-DD_NN_*.md`. Ольга пересылает только ссылки. На момент handover'а последний номер — **51** (этот файл). Дальше `_52`, `_53` и т.д.

Формат имени:
- `_NN_strategist_<topic>.md` — от тебя
- `_NN_codeexec_<topic>.md` — от VS Code Claude Code

### 2. Diff-on-review всегда

VS Code Claude Code НЕ применяет код, не апплаит миграции, не пушит без явного 🟢 от тебя. Сначала — diff в `_session/`, потом твой 🟢, потом apply.

### 3. Стиль общения с Ольгой

- **Пошагово.** Один шаг → ждать результат → следующий. Не вываливать day-flow одной портянкой.
- **Не решать за неё когда заканчивать.** Никаких «уже поздно, давай завтра» — Ольга сама решает темп.
- **Чётко разделять рассуждения и paste-ready.** Если даёшь промпт для пересылки — выделяй блоком, остальное — обсуждение.
- **Не «откликается»/«отзывается»/«колода»** — клишированные слова, под запретом. Используй: «нравится», «интересно», «как тебе», «практики», «коллекция».
- **«Ты», не «вы»** в любой коммуникации.
- **Тёплый разговорный тон**, не канцелярит.

Подробнее в `feedback-*.md` файлах памяти.

### 4. Технические права

- SSH к проду: `ssh -i ~/.ssh/id_ed25519 root@5.129.251.56` (без пароля)
- psql на проде (через gen_user): через SSH + `PGPASSWORD='xHJQ349k9QT' PGSSLMODE=verify-full PGSSLROOTCERT=/root/.cloud-certs/root.crt psql -h 337a9e20fbb7b82646fd9413.twc1.net -p 5432 -U gen_user -d default_db -c "..."`
- Можешь делать read-only diagnostic SQL сама через SSH. **НЕ делай DDL/UPDATE без 🟢 от Ольги.**
- Локальный репо: `/Users/user/vibecoding/garden_claude/garden/`
- Ольгины credentials: `/Users/user/.skrebeyko/credentials.env` (chmod 600, не светить значения)

### 5. Параллельные чаты codeexec

Сейчас иногда одновременно работают **два** VS Code Claude Code чата (основной + параллельный). Они трогают разные файлы → не конфликтуют. Если обе хотят править одно — последовательно. Координируется через сигналы стратега в `_session/`.

---

## Что закрыто за прошлую сессию (2026-05-15 → 16)

### FEAT-023 — Регистрация по одобрению админа ✅ MVP

Закрытое сообщество получало «открытую дверь» — любой с ссылкой мог зарегистрироваться и получить доступ. Закрыто:

- **Phase 1** (phase31 миграция) — расширили `access_status` CHECK на `pending_approval` + helper `has_platform_access(uuid)` + RESTRICTIVE RLS-guards на 38 таблиц (13 core + 23 pvl_* + 2 billing). Pre-flight assertion защитил от случайного отрезания paused-юзеров.
- **Phase 2** (garden-auth) — `/auth/register` теперь ставит `access_status='pending_approval'`, принимает all fields атомарно (dob/tree/x/y), шлёт TG-уведомление в `@garden_grants_monitor_bot`.
- **Phase 2.5** (frontend) — фронт распознаёт `pending_approval` → показывает «Регистрация отправлена. Администратор скоро предоставит вам доступ к платформе.» + logout.
- **Phase 3** (полный UI: PendingApprovalScreen с polling, AdminPanel «Ожидают» вкладка) — **пропустили намеренно** для текущего масштаба. Ольга approve через psql, TG-уведомление с deep-link. Если регистраций станет много — вернёмся.

**Security hole закрыта.** Утечка существующих paused_manual юзеров через PostgREST тоже закрыта (parallel bug из FEAT-015 Path C).

### FEAT-024 — TG-уведомления для менторов и студенток ПВЛ ✅ инфра

- **Phase 1** (phase32 миграция) — `profiles.telegram_user_id` (UNIQUE partial) + `tg_link_codes` + `tg_notifications_queue` + 4 функции + 2 триггера на `pvl_homework_status_history` и `pvl_direct_messages`. **БЕЗ** PostgREST-grants на новые таблицы (PII protection — урок в `docs/lessons/2026-05-16-no-postgrest-grant-for-pii-tables.md`).
- **Phase 2** (garden-auth) — бот `@garden_pvl_bot` с webhook, linking flow через `LINK-XXXXXX` коды, 3 endpoint'а (`/api/profile/generate-tg-link-code`, `/api/profile/unlink-telegram`, `/api/tg-bot/webhook/:secret`), worker `setInterval(processTgQueueBatch, 15s)` с FOR UPDATE SKIP LOCKED + exponential backoff. **Quiet hours 23:00-08:00 МСК** в триггере через `scheduled_for`.
- **Phase 2b** (frontend UI) — секция «Telegram-уведомления» в профиле + ModalShell с deep-link + polling 5с.

**На 2026-05-16 ~22:00** Ольга отправила менторам анонс TG-уведомлений. Ждём что они привяжутся завтра, дальше — реальный smoke (студентка сдаёт ДЗ → ментор получает push).

### BUG-001 — PvlPrototypeApp fragile init ✅

`Promise.all` → `Promise.allSettled` в `loadRuntimeSnapshot` + `syncPvlActorsFromGarden` + per-student loop. `_partial.failed` контракт + MON-001 alerts + defense-in-depth `try/catch` в `AdminStudents` useEffect. Урок: `docs/lessons/2026-05-16-promise-all-vs-allsettled-init-batch.md`.

### BUG-PVL-SYNC-FAILED-TO-FETCH ✅

Recon выявил: silent anon-fallback'а **нет** (моя память была неверной), реальная причина — network blip у мобильных Safari. Уровень 2 retry × 1 в `pvlPostgrestApi.request` (1.5s backoff, только GET, только TypeError). Через ~24h сравним baseline частоту алертов.

### Прочие закрытые сегодня

- BUG-CORS-SCRIPT-ERROR — Vite-плагин убирает `crossorigin` attr с same-origin scripts (ранее `.htaccess` не работал на nginx)
- BUG-PRACTICE-DELETE-ZINDEX — diff confirm modal через `createPortal`
- BUG-WEBHOOK-LOG-PARTIAL-INDEX — `ON CONFLICT WHERE` для partial unique
- Сокровищница MVP (FEAT-019) — закрыт раньше 2026-05-15
- Phase27 (FEAT-022) — миграция 5 FK с auth.users на profiles, Supabase legacy

---

## Что СЕЙЧАС в работе

### Активный батч: 3 UX-фикса (файл `_49`, ждём diff `_50`)

Ольга в свежем VS Code Claude Code чате запустила батч:

1. **PVL «нужна проверка» vs «ждём доработку»** (`PvlPrototypeApp.jsx:3569`) — feedback Юли Габрух. Менторы путаются. Фикс: split + счётчики в скобках.
2. **Meetings `income` required при закрытии** — Ольга обнаружила что на дашборде «72 гостя, 3500₽ дохода» за май. Реальность: 4/6 completed встреч с `income=0`. Сама Ольга на «Серендипности» (16.05) не указала доход. **Важно:** required только на переходе `scheduled→completed`, не на редактировании уже-completed. Бэкфилл `UPDATE meetings SET income=0 WHERE status='completed' AND income IS NULL` ДО включения required (иначе старые встречи нельзя редактировать).
3. **Width mismatch «Календарь» vs «Мастерство»** в Встречах — один контейнер шире другого.

**Жди отчёт от codeexec в `_session/50_codeexec_ux_batch_diff.md`.** Когда Ольга его пришлёт — ревью, 🟢, apply, push.

---

## Что в бэклоге, не блокер

- **FEAT-024 Phase 3** — finalize smoke с реальной привязкой и проверкой ДЗ-flow когда хоть один ментор привяжется
- **FEAT-024 Phase 5** — rollout анонс для студенток (после первой недели стабильности)
- **FEAT-023 Phase 3** — полный UI Pending screen + AdminPanel «Ожидают» — отложено
- **FEAT-021** — Свой TG-бот для управления каналом/чатом (заменить TargetHunter) P2
- **FEAT-022 magic link login** — passwordless, P2
- **FEAT-020 email-уведомления для PVL** P2 — менторы выбрали TG, email отложен
- **TEST-001** — базовые тесты на критичные потоки, блокер для REFACTOR-001
- **REFACTOR-001** — разбиение монолитных файлов
- **BUG-CORS-SCRIPT-ERROR** — закрыт, но 24h baseline ещё не сравнили
- **INFRA-005-PRESERVE-ROUTE** P3 — auto-reload не сохраняет URL
- **TECH-DEBT-PUSH-SERVER-STDERR-ALERTING** P3 — observability gap (5 дней silent crash до apply phase29 никто не заметил)
- **TECH-DEBT-DROP-PASSWORD-HASH** P3 — после FEAT-022 ship
- **BUG-PVL-DASHBOARD-STATUS-MERGE** — в текущем батче `_49`
- **BUG-UX-MEETINGS-WIDTH-MISMATCH** — в текущем батче `_49`
- **phase33-cleanup** — truncated policy name на `pvl_student_certification_criteria_scores` + минор V10 в phase31

Полный бэклог: `plans/BACKLOG.md`.

---

## Контекст про Ольгу

- Владелец Garden, главный садовник.
- Параллельно ведёт издательство Skrebeyko, курс ПВЛ Поток 1 (~13 абитуриенток + менторы Василина, Лена, Юля, Ирина).
- Работает с двумя Claude параллельно (стратег здесь + executor в VS Code).
- Любит **темп**. Не любит когда за неё решают «уже поздно» или предлагают уведомить Настю как milestone.
- Email: `skrebeyko@proton.me`, на платформе `olga@skrebeyko.com`.
- Сегодня (16.05) огромный день — закрыли 3 крупных фичи + кучу багов. Возможно к утру 17.05 захочет отдохнуть, возможно сразу в работу.

---

## Что НЕ делать

- Не отвечать «давай завтра» / «уже поздно» — Ольга решает темп.
- Не предлагать «уведомить Настю» как часть закрытия задачи.
- Не использовать слова из запретного списка (откликается, отзывается, колода).
- Не лезть в код самостоятельно (Read/Grep/SSH можно, Edit/Write — только через VS Code Claude Code).
- Не вываливать длинные промпты — короткие сообщения с ссылками на `_session/` файлы.
- Не светить значения секретов в чате (SSH read через REDACTED-маски).

---

## Первое сообщение Ольге

Когда ты получишь handover (этот файл) — ответь Ольге короткое подтверждение типа:

> Привет. Контекст принял — handover в `_session/51` прочитан. Жду отчёт от codeexec по UX-батчу (`_session/50_codeexec_ux_batch_diff.md`), либо твою следующую задачу.

Без излишней welcome-болтовни. Ольга в курсе что у нас handover.

---

## Финальное

Спасибо за продолжение. Ольга — отличный продакт, чёткая, тёплая. Береги её темп и не вали обилием. Удачи.
