# План на 2026-05-09 — handover для нового стратега

**Создано:** 2026-05-08, конец дня.
**Автор:** стратег (claude.ai), сессия 2026-05-08.
**Цель:** Чёткий план для следующей сессии.

---

## Контекст: что закрылось вчера (2026-05-08)

Огромный продуктивный день — закрыто 6 крупных тикетов:

- 🟢 **INFRA-004** — cache-headers через тикет в hightek.ru support.
  Реальный nginx-fix корневой причины «Failed to fetch dynamically
  imported module». Plus meta-tags workaround как defense-in-depth
  (commit `2228f70`).
- 🟢 **BUG-PVL-COHORT-NULL-OVERWRITE** — фикс `ensurePvlStudentInDb`
  (commit `7c28ed3`). Backfill cohort_id больше не регрессирует.
  Lesson: `docs/lessons/2026-05-08-pvl-cohort-null-overwrite.md`.
- 🟢 **FEAT-017 V1** — admin таб «Прогресс ПВЛ» (commits `0867aa6`,
  `377a148`, `296cfb3`). RPC + sortable table + GroupProgressBar
  + hidden-filter. На дашборде 13 строк = реальная картина Поток 1.
- 🟢 **CLEAN-013 partial** — удалены 4 из 5: Лена Ф (вчера утром),
  LIlia dupe + Рита + Екатерина Салама (commit `296cfb3`).
  Настина фея + Настин фиксик **оставлены** как тест-окружение Насти.
- 🟢 **UX-002** — админка на полную ширину viewport (commits
  `03f5dc8`, `9480be4`).
- 🟢 **FEAT-014 магазин** — цифровые товары, кликабельные ссылки в
  описании, упрощённая форма (commits `4998f7f`, `f65c7b4`,
  `3522581`, готов к push: упрощение формы).
- 🟢 **Колотилова Светлана** — отчество убрано из profile.name через
  psql под одобренным 🟢 (UX-QUICK-FIXES).

---

## Что в работе локально (на машине Ольги)

⚠ **ВАЖНО:** некоторые изменения сделаны локально и НЕ закомичены /
НЕ запушены. Не потерять при старте новой сессии.

### A. Магазин: упрощение формы

- **Локальное состояние:** изменения сделаны (убраны секция
  `promo_code` + `link_url` и поле WhatsApp из ShopAdmin формы).
  Vite preview прошёл, форма выглядит компактно.
- **Не закоммичено / не запушено.**
- **Следующее действие:** push commit'а — `_30` промпт уже лежит:
  `docs/_session/2026-05-08_30_strategist_feat016_apply_and_shop_push.md`
  (Шаг 1 — push магазина).

### B. FEAT-016: per-student MD-отчёт + bulk ZIP

- **План готов:** `docs/_session/2026-05-08_29_codeexec_feat016_plan.md`.
- **Стратег согласовал** все 4 open questions (см. `_30`):
  - 5.1 mentor_name через `api.getUsers()`
  - 5.7 control_points исключаем
  - 5.3 cancel button НЕ делаем
  - 6 bulk ZIP включаем в этот заход
- **Локальное состояние:** apply ещё не начат (executor завершил
  preview магазина + написал план FEAT-016, но к коду FEAT-016
  не прикасался).
- **Следующее действие:** apply через локальное preview, потом
  commit + push. Промпт лежит в `_30` (Шаг 2).

---

## План на 2026-05-09

### Шаг 1 — закрыть зависшие push'и (15-30 минут)

**A.** Push commit'а упрощения формы магазина.
**B.** Apply FEAT-016 через локальное preview → ОК Ольги → commit
+ push.

Для этих двух шагов **уже готов промпт executor'у**:
`docs/_session/2026-05-08_30_strategist_feat016_apply_and_shop_push.md`

Просто переслать executor'у одним сообщением: «Забери `…_30…`,
два шага».

### Шаг 2 — Ольга в админке (5-10 минут)

После того как магазин-форма зайдёт в прод:

1. Создать новую карточку «Промокоды для ведущих»:
   - Multi-line описание со всеми кодами и кликабельными ссылками
   - Фото блокнотов
   - sort_order = 0 (первой в списке)
2. Удалить старые карточки LOVELIGA и LIGANOTEBOOKS.

После того как FEAT-016 зайдёт в прод:

1. Cmd+Shift+R на дашборде «Прогресс ПВЛ».
2. Smoke кнопки «📄 Отчёт» в строке студентки → выбрать «Модуль 1»
   → скачать .md → открыть в Obsidian.
3. Smoke кнопки «Скачать архив за модуль…» в Header → выбрать
   «Модуль 1» → ZIP с .md по 13 студенткам.

### Шаг 3 — FEAT-015 Prodamus (новая большая работа)

#### Продуктовые решения (Ольга 2026-05-08)

| # | Вопрос | Ответ Ольги |
|---|---|---|
| 1 | Сколько отвалов в месяц | 3-4, в разные дни (не критично — Prodamus сам отслеживает) |
| 2 | История платежей в админке | НЕ нужна, есть в Prodamus |
| 3 | Разные тарифы | НЕТ, все одинаковые |
| 4 | Manual override (бартер / договорённости) | **Да, обязательно** |

#### Архитектурное решение

**Путь A — упрощённый**, с обязательным флажком `manual_override`.

Полная миграция 21 (биллинг-модель) — overkill для текущих требований
(нет тарифов, нет нужды в истории, всего 3-4 отвала в месяц). Если
платформа вырастет — вернёмся.

#### План реализации (2-3 сессии)

1. **Phase-N миграция:**
   - `ALTER TABLE profiles ADD manual_override boolean DEFAULT false`
   - Опц. `last_billing_event text` для audit.
2. **Webhook endpoint в `garden-auth`** (Express):
   - Приём webhook от Prodamus.
   - Проверка signature.
   - Если `profile.manual_override=true` → пропускаем, не трогаем
     status.
   - Иначе `payment.failed` → `status='suspended'`,
     `payment.success` → `status='active'`.
3. **Frontend в admin users-табе:**
   - Toggle **«👋 Ручной режим»** рядом с каждым пользователем.
   - Когда включён → бейдж «Защищён от автоматики».
4. **Setup webhook URL в Prodamus dashboard.**
5. **End-to-end smoke** на тестовой ведущей (тестовый платёж).

#### Подготовительный recon (можно сделать в начале сессии)

1. **Прочитать `garden-auth`** Express-сервис — где он живёт
   (ssh root@5.129.251.56), какие endpoint'ы есть, как добавить
   webhook (через `dataService.js`? через отдельный route?).
2. **Документация Prodamus webhooks** — формат signature, какие
   события (`payment.success`, `payment.failed`, `subscription.expired`),
   требования к endpoint'у.
3. **Отложенная миграция 21** в `migrations/` — посмотреть что
   спроектировано (`access_status`, `subscriptions`,
   `billing_webhook_logs`). Что-то можно переиспользовать
   (например, `paused_expired` value в `access_status`)? Или
   **оставить миграцию 21 как future-option** и не трогать.

---

## Что нужно обновить в документации

В начале новой сессии executor должен:

1. **BACKLOG.md** — отметить как DONE:
   - INFRA-004 → 🟢 DONE
   - BUG-PVL-COHORT-NULL-OVERWRITE → 🟢 DONE
   - FEAT-017 V1 → 🟢 DONE (V2-VISUALIZATIONS остаётся как future)
   - CLEAN-013 → partial DONE (4 из 5)
   - UX-002 → 🟢 DONE
   - FEAT-014 → 🟢 DONE (после push'а магазина и FEAT-016)
   - UX-QUICK-FIXES — добавить пункт «Колотилова — DONE 2026-05-08»

2. **Создать HANDOVER 2026-05-08** в
   `garden/docs/journal/HANDOVER_2026-05-08_*.md` — снимок дня:
   - 6 закрытых тикетов
   - Хронология коммитов
   - Что carry-forward на 2026-05-09 (FEAT-015 Prodamus, FEAT-019
     Сокровищница, остальные P1/P2)

3. **Закоммитить всю папку `_session/2026-05-08_*` целиком** (как
   договорились с 2026-05-07 — папка идёт в git).

---

## Открытые задачи в backlog (carry-forward)

**P1 (срочно):**
- **INFRA-005-SW-CACHE** — повышен с P3 до P1 (2026-05-08 вечер).
  Service worker `/sw.js` кэшируется на сутки и обходит cache-control,
  отдавая старые chunks. После каждого deploy кто-то попадает в
  «Failed to fetch dynamically imported module». Сегодня Марина
  Шульга поймала. Решение: invalidation logic в sw.js или удалить
  SW целиком если он не нужен (~30 мин работы).
- **MON-001 — frontend error reporter в TG-бот** (повышен из P2,
  2026-05-08 вечер по Ольгиному вопросу «почему бот не упал в бот?»).
  Текущий `@garden_grants_monitor_bot` следит только за GRANT-counts.
  Клиентские ошибки (типа ChunkLoadError у Марины) сервер не видит.
  Решение: ~20 строк JS error boundary в Garden + ~30 строк Express
  endpoint в garden-auth + reuse существующего бота для алертов.
  Заодно — post-deploy healthcheck в GitHub Actions (curl + sanity
  check после FTP-deploy). ~1 час работы.
- **FEAT-015 Prodamus auto-pause** — план готов выше, начнём после
  закрытия магазина+FEAT-016+INFRA-005+MON-001.
- **FEAT-N: уведомления менторам Telegram-бот** (заведён 2026-05-08
  поздним вечером Ольгой). Подробности в новом разделе ниже.
- **NB-RESTORE** — переезд админки notebooks/questions/cities из
  meetings в Garden. 3-5 сессий.
- **FEAT-018** — TZ + flow добавления нового города.
- **BUG-PVL-MENTORS-PAGE-BROKEN** — страница «Ученицы» в PVL
  показывает «Нет ментора» у всех (читает legacy
  `pvl_students.mentor_id`, нужно переключить на
  `pvl_garden_mentor_links`).
- **BUG-PVL-ENSURE-RESPECTS-ROLE** — `ensurePvlStudentInDb`
  должна проверять role перед upsert (без этого лишние снова
  попадут в pvl_students).

**P2:**
- **FEAT-019 Сокровищница + маркетплейс** — большая фича, план
  в `_session/2026-05-07_10_idea_treasury_marketplace.md`.
- **FEAT-017-V2-VISUALIZATIONS** — heat-map, графики, sparklines.

**P3:**
- **TECH-DEBT-FK-CONTRACTS** — FK на 3 таблицах + CASCADE на
  `meetings.user_id`.
- **TEST-INFRA-SETUP** — настройка тестовой инфры.
- **PROD-DB-MIGRATE-ISPMANAGER** — стратегическая идея, не сейчас.

---

---

## FEAT-N: уведомления менторам о ДЗ на проверку

**Заведён:** 2026-05-08 (поздно вечером, Ольга).
**Контекст:** менторы не знают когда у них новое ДЗ на проверку.
Сейчас Ольга или сама ментор должна заходить в учительскую и
проверять. Хотим уведомления.

### Что есть в инфраструктуре

- `garden-auth` (Express-сервис) — можно добавить email-sender.
- `pvl_notifications` таблица — уже есть для in-app уведомлений
  (`listNotifications` / `markNotificationRead` в `pvlPostgrestApi`).
- `@garden_grants_monitor_bot` — уже работающий Telegram-бот
  (для GRANT-wipeout алертов). Может быть переиспользован для
  уведомлений менторам.
- `pvl_homework_status_history` — события переходов статуса
  submission'а. Trigger на INSERT с `to_status='in_review'` →
  отправить уведомление ментору.
- `pvl_garden_mentor_links` — связка студент↔ментор для адресации.

### Решения Ольги (2026-05-08 поздно вечером)

- **Канал доставки: Telegram-бот** (НЕ email). TG быстрее, у нас
  уже работает `@garden_grants_monitor_bot` — можно переиспользовать
  или завести второй бот для продуктовых уведомлений.

### Открытые продуктовые вопросы

1. **Мгновенные vs daily digest** — при 3-4 ДЗ в неделю мгновенные
   могут раздражать; digest (1 сообщение в день со списком) спокойнее.
2. **Расширять существующий `@garden_grants_monitor_bot`** или
   **завести новый** (типа `@garden_mentors_bot`)? Разделение
   служебных алертов (только Ольга) и продуктовых (менторы)
   — чище, но +1 бот в управлении.
3. **Кому уведомления** — только связанному ментору (через
   `pvl_garden_mentor_links`) или всем менторам как fallback
   если связки нет?
4. **Онбординг менторов в бота** — каждая ментор пишет /start,
   бот сохраняет `chat_id`. Где хранить:
   - `profiles.telegram_chat_id` (новое поле в существующей таблице).
   - Или отдельная таблица `mentor_bot_registrations`.
   Первый вариант проще.

### Архитектурный план (предварительно)

**Путь A — простой (1-2 сессии):**
- Webhook-style: при `INSERT pvl_homework_status_history` с
  `to_status='in_review'` → DB-trigger pg_notify → worker в
  garden-auth слушает → шлёт email через SMTP.
- Параллельно `INSERT pvl_notifications` для in-app.

**Путь B — полный (2-3 сессии):**
- + Daily digest (cron каждое утро шлёт сводку).
- + Telegram-бот.
- + Preferences ментора (хочет мгновенные / digest / молчать).

Решим завтра по ответам на вопросы выше. Скорее всего **A для MVP**,
с расширением до B по потребности.

---

## Workflow напоминания

- Стратег ↔ executor через файлы в `garden/docs/_session/`.
- Стратег умеет read-only ssh+psql, write — через executor под 🟢.
- Push строго отдельным 🟢 PUSH словом.
- UI-изменения — через локальное preview ПЕРЕД commit (Vite dev
  server).
- Принцип **«один раз, не возвращаться»** — структурные решения,
  не точечные хаки. См. `~/.claude/memory/feedback-design-for-future.md`.

---

## Первые слова стратега в новой сессии

«Прочитала plan-файл `2026-05-09_00_PLAN_handover.md` + memory
`project-garden.md`. Понимаю, что вчера закрыли 6 тикетов; в работе
локально магазин-форма (push) + FEAT-016 (preview). Первый шаг —
закрыть зависшие push'и через промпт `_30`. Готова, Ольга?»
