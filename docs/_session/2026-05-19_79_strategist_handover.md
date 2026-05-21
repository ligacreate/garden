# Handover для нового стратега (claude.ai)

**От:** уходящего стратега (claude.ai, сессия 2026-05-19, ~20h)
**Кому:** свежему стратегу (новый чат)
**Дата:** 2026-05-19 поздний вечер
**Чат-агент:** Ольга Скребейко (главный садовник, владелец Garden)

---

## Кто ты (новый стратег) и что делаешь

Ты — стратег проекта **Garden** (`liga.skrebeyko.ru`), обучающая платформа для ведущих письменных практик. Работаешь в паре с **VS Code Claude Code** (executor). Ольга — связной между чатами.

Память про проект — в `/Users/user/.claude/projects/.../memory/MEMORY.md`. **Read first:**
- `project-garden.md` — архитектура, репозитории (актуальный `ligacreate/`, не `olgaskrebeyko/` который АРХИВ), роли, US sanctions context
- `project-garden-daily-wipe.md` — daily ACL wipe ~13:08 UTC, mitigated cron каждую минуту с 17.05
- `project-pvl-course-2026.md` — текущий курс ПВЛ Поток 1
- `feedback-*.md` — **критически** все feedback правила (особенно про diff-on-review, batch deploys, public artifacts в чат vs файлы, long-polling recursive setTimeout, JWT-verify после trigger changes)

---

## Конвенции работы (повторение из _51, не изменились)

- Всё через `docs/_session/YYYY-MM-DD_NN_*.md`, никаких длинных промптов в чат
- Diff-on-review всегда (codeexec не applies без 🟢)
- Пошагово, не вываливать day-flow одной портянкой
- Не решать за Олгу когда заканчивать
- «Ты», тёплый разговорный тон, не «откликается»/«отзывается»
- Public GH API без auth работает (`ligacreate/*` репозитории public) — read-only status проверки делаешь сам через curl
- Garden-auth deploy через scp + restart (не через GH Actions) — поэтому возможен drift между repo и prod
- Concurrency block в `deploy.yml` страхует от race
- `feedback-batch-deploys-no-race`: не пушить два коммита подряд

---

## Что закрыто за сессию 2026-05-18+19

**Большие фиксы (BUGs):**
- ✅ **BUG-AUTH-PAUSED-USER-LOGIN** (phase35) — paused-юзеры не могли войти, фикс RLS self-row exception (Мария Бардина mb1@bk.ru ребоарding после паузы)
- ✅ **BUG-TG-TRIGGER-STATUS-MISMATCH** (phase34) — `'submitted'→'in_review'` в trigger function
- ✅ **BUG-HW-SUBMIT-NO-HISTORY** (phase36 SECURITY DEFINER) — trigger пробивал permission cascade
- ✅ **BUG-PVL-FRONTEND-STUDENT-HISTORY-WRITE** (`26b5c54`) — first-submit early-return fix в pvlMockApi.js
- ✅ **TG-WEBHOOK-INBOUND-BLOCKED** → switched на long-polling (Timeweb блокирует TG inbound в Caddy)
- ✅ **WORKFLOW-CONCURRENCY** (вчерашний `ca37309`) — concurrency block deploy-ftp, proven
- ✅ **GRANTS-CRON-FREQUENCY** — `*/5` → `*` минуту, daily wipe пойман в ~13:08 UTC

**Recovery actions (manual psql):**
- ✅ **Manual unfreeze Маrии Бардиной** — UPDATE access_status='active' после оплаты
- ✅ **pvl_students INSERT для Razzhigaeva** — onboarding fix
- ✅ **Admin password reset Maria Romanova** (bcryptjs.hashSync + safety guard) — temp pwd `LigaTemp2026!`
- ✅ **Курс «Социальная психология» recovered** — был случайно скрыт через `app_settings.library_settings.hiddenCourses`

**UX:**
- ✅ **UX-MEETINGS-PUBLIC-FORM-AUTOFILL** (`794d5a9`) — auto-fill `payment_link` из profile.telegram/vk + label «(TG/VK из профиля)»

**Verified natural acceptance 2026-05-19 11:06 МСК:** Razzhigaeva сдала ДЗ → status_history INSERT → trigger → INSERT в queue → worker → push доставлен Vasilина через @garden_pvl_bot. Полная цепочка работает на live данных.

**Финальный deploy дня:** commit `9aeb55b`, bundle `index-Dgwl91od.js` (12:55 МСК), все lessons + backlog + recovery docs в одном push'е.

---

## 🔴 Открытое СЕЙЧАС (требует завтрашнего внимания)

### 1. BUG-PUBLIC-MEETING-SAVE-INVALID-CREDENTIALS (новый, ~13:00 МСК сегодня)

Maria Romanova (masha152@yahoo.com) после admin-password-reset вошла на платформу с temp pwd → попыталась сохранить **публичную встречу** (toggle is_public=true, в общее расписание) → видит **`Неверные данные, либо ваша почта не подтверждена...`** (тот же text что login fail).

Recon:
- Profile её: TG `https://t.me/mari_rroma` есть ✅, access_status='active', role='leader' ✅
- Personal meeting сохранила успешно (is_public=false работает)
- Public save фейлит с `invalid_credentials`-like error

Гипотезы (без её browser DevTools):
- (a) JWT staleness после admin-reset — frontend cached old token, фронт сразу-же re-login не работает
- (b) RLS на `events` (public mirror через trigger) — что-то новое в guard
- (c) Какая-то регрессия which only manifests for `is_public=true` save

Workaround Олга попросила Maria попробовать: **полный logout → reopen browser → login с temp pwd → hard-reload → retry public save**. Не получила ответа Maria когда я переезжаю.

Если retry не помог — это **P1 на завтра**, нужен Chrome runner debug под её сессией (или попросить её через TG-link send DevTools Network screenshot конкретного API call которым 401).

### 2. FEAT-022 magic link login — P1, **next day priority**

Ольга решила завтра делать FEAT-022 (passwordless email link login). Это закроет class «не могу войти» проблем (как у Бардиной из-за paused и у Romanova из-за password mismatch). Effort 3-5 часов codeexec:
- Backend `/auth/request-magic-link` (email → generate one-time token → save в БД с TTL → email send)
- `/auth/consume-magic-link?token=X` (verify → set JWT → redirect)
- Frontend «Войти по ссылке» в AuthScreen
- Email template

### 3. BUG-PVL-ONBOARDING-MISSING-STUDENT-RECORD — P1, architectural

Recovery psql лечит симптом (Razzhigaeva manual INSERT), но **каждая новая ученица** повторит саге если не починить корень. Trigger AFTER INSERT ON `pvl_garden_mentor_links` → SECURITY DEFINER function → auto-create `pvl_students` record для student_id если отсутствует. Берёт cohort_id из active Поток 1, name из `profiles.name`, status='applicant'. Effort 1-2 часа.

---

## Бэклог (полный — в `plans/BACKLOG.md` после commit'а `9aeb55b`)

### P1 (срочно)
- BUG-PUBLIC-MEETING-SAVE-INVALID-CREDENTIALS (новый, см. выше)
- FEAT-022 magic link login
- BUG-PVL-ONBOARDING-MISSING-STUDENT-RECORD

### P2
- TECH-DEBT-AUDIT-LOG — universal audit trigger + Caddy access-log
- TG-WEBHOOK-INBOUND-BLOCKED (closed но lesson еще можно дописать)
- FEAT-024 Phase 5 — анонс TG-уведомлений студенткам
- FEAT-018 — TZ + flow добавления нового города
- FEAT-015 — Prodamus auto-pause/unpause (95% сделано, осталось enable env flag + register webhook URL в Prodamus dashboard + smoke, **30-60 мин**)
- NB-RESTORE — переезд админки notebooks/questions/cities
- FEAT-019 — Сокровищница + маркетплейс

### P3
- UX-MEETINGS-FORM-NATIVE-ALERT — refactor alert() → inline-error
- UPDATE-PASSWORD-FROM-SETTINGS — enable `updatePassword` endpoint
- ERROR-TOAST-VISIBILITY — toast исчезает за секунду
- VITE-CHUNK-HASH-FLAPPING — стабилизация chunk hashes между билдами
- WORKFLOW-FTP-PARTIAL-DEPLOY-SILENT — после WORKFLOW-CONCURRENCY менее приоритетный
- TECH-DEBT-GARDEN-AUTH-PROD-DRIFT — CI/CD или процесс для garden-auth
- BOT-DISPLAY-NAME-RENAME — `@garden_pvl_bot` display name в BotFather (твоё ручное)

### Long-term
- PG-MIGRATE-TO-VPS-BITTERN — переезд PG self-managed на Bittern

---

## Контекст про Олгу (повторение из _51)

- Владелец Garden, главный садовник
- Параллельно издательство, курс ПВЛ Поток 1 (~13 абитуриенток + менторы Юля/Лена/Василина/Ирина О.)
- Любит темп. Не решай за неё «уже поздно»
- НЕ предлагать «уведомить Настю» как milestone
- НЕ использовать «откликается»/«отзывается»/«колода»
- Тёплый разговорный тон, «ты»
- Email: skrebeyko@proton.me, на платформе olga@skrebeyko.com

**Эта сессия (19.05) была очень плотная** — 7 закрытых тикетов, 4 recovery actions, 4 verified smoke'а, день закончили в 13:00 МСК. Олга устала. Завтра — пусть начинает свежим темпом.

---

## Финальная сводка чтобы понять состояние

| Что | Статус |
|---|---|
| Платформа | стабильна, bundle `index-Dgwl91od.js` 12:55 МСК ✅ |
| Все backend fixes сегодня | applied, verified |
| Lessons + backlog | в git after `9aeb55b` push |
| TG bot @garden_pvl_bot | работает через polling, привязки идут |
| Maria Бардина | вошла, активна ✅ |
| Maria Romanova | login работает, **public save broken** 🔴 |
| Razzhigaeva | submission работает, ментор получает push ✅ |
| Daily ACL wipe | mitigation cron каждую минуту работает |
| Concurrency на deploy | работает |

---

## Что НЕ делать

- Не сразу же делать архитектурные изменения по утренним сообщениям Олги — сначала пиши план в `_session/`, ждать 🟢
- Не пушить два коммита подряд (concurrency не race-protect, но chunk-hash rotation = моргание у юзеров)
- Не путать `olgaskrebeyko/garden-auth` (АРХИВ) с `ligacreate/garden-auth` (актуальный) — всегда проверяй `git remote -v` если работаешь в garden-auth clone
- Не задавать Олге технические вопросы про схемы БД — иди через codeexec / curl prod API сам
- Не делать `setInterval(longPoll, T<timeout)` — recursive `setTimeout` после await (см. `feedback-strategist-long-polling-recursive-not-interval`)
- Не давать миграции trigger-функций без post-apply JWT-симуляции (см. `feedback-strategist-trigger-fix-jwt-verify`)

---

## Первое сообщение Олге

Когда получишь handover (этот файл) — короткое:

> Привет. Контекст принял — handover `_79` прочитан, memory сверила. Открытое: BUG-PUBLIC-MEETING-SAVE-INVALID-CREDENTIALS (Maria Romanova) + FEAT-022 magic link login + BUG-PVL-ONBOARDING trigger. Жду твоего сигнала с чего начнём — нужна ли deep-recon Maria Romanova baga через её browser DevTools, или сначала FEAT-022.

Спасибо за продолжение. Удачи 🌱
