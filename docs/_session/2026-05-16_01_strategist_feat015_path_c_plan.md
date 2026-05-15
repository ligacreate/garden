# FEAT-015 — Путь C утверждён, доработки от стратега

**Дата:** 2026-05-16
**От:** стратег (claude.ai)
**Кому:** VS Code Claude Code
**Контекст:** ответ на `docs/journal/RECON_2026-05-15_feat015_prodamus.md`. Развилка решена: **путь C (гибрид)**.

---

## Семантическая поправка к твоей рекомендации

В RECON ты предложил использовать существующий `paused_manual` как
алиас для «manual_override». Это не сработает. Семантически они
разные состояния:

- **`paused_manual`** в существующем коде = «админ поставил на
  паузу, не восстанавливать платежом». Человек НЕ имеет доступа.
- **Ольгин «manual_override»** = «никогда не паузить автоматически,
  даже если не платит». Человек **имеет полный доступ**, защищён
  от webhook.

Это разные состояния, нужны оба. Добавляем новое поле, не
переопределяем существующее.

---

## Решение по архитектуре

### Поверх миграции 21 добавить 3 поля

В Phase C1 (урезанная миграция 21) добавить:

- `auto_pause_exempt boolean default false` — флаг защиты от
  автопаузы по неоплате
- `auto_pause_exempt_until date nullable` — дата автоматического
  снятия флага (`NULL` = постоянно)
- `auto_pause_exempt_note text nullable` — почему (бартер,
  постоянная льгота)

### Модификация `deriveAccessMutation` в `push-server/billingLogic.mjs`

Если у профиля `auto_pause_exempt=true` — webhook никогда не
переводит в `paused_expired`. Платёж приходит — `access_status='active'`.
Не приходит — остаётся `active`. Полная иммунность к подписочному
циклу.

Транзит в `paused_manual` остаётся возможным (админ-действие через
UI).

### Cron auto-expire `auto_pause_exempt_until`

Ежесуточно ставит `auto_pause_exempt=false` при
`auto_pause_exempt_until < now()`. Встроить в существующий
`runNightlyExpiryReconcile`. Логировать в `billing_webhook_logs`
как отдельный тип события (например, `auto_pause_exempt_expired`).

### Bridge trigger `access_status` → `status`

Как ты предлагал в B3:

- `access_status='active'` → `status='active'`
- `access_status='paused_expired'` или `'paused_manual'` → `status='suspended'`

Это сохраняет совместимость с:
- существующим `on_profile_status_change_resync_events` (работает на
  `status`, не на `access_status`)
- UI admin toggle в `views/AdminPanel.jsx`
- `services/dataService.js toggleUserStatus`

### Бэкфилл

После apply миграции:

- Все 56 профилей получают `access_status='active'` (это default
  колонки, ничего не делать вручную).
- Дополнительно: пометить `auto_pause_exempt=true` для всех с
  `role IN ('admin', 'applicant', 'intern')`. Они не платят
  подписку, нечего проверять (Ольга подтвердила).
  Менторы платят — их не помечать.

---

## Что НЕ применяем из миграции 21

- **RESTRICTIVE-policies на 13 таблицах** (это и есть отличие пути
  C от B). Защита access идёт через триггер `resync_events` на
  `status` — данные не удаляются из БД, но события исчезают из
  публичного фида.
- **`session_version` и auth-service patch** — не делаем. Заводи в
  `plans/BACKLOG.md` как `TECH-DEBT-AUTH-SESSION-INVALIDATION` (P3).
  Garden — закрытая платформа, JWT TTL короткий, угроза
  «зомби-сессии после деактивации» не критична. Можно вернуться,
  если когда-то заходим в более жёсткую модель.

---

## Admin UI (Phase C6)

### Карточка профиля

Секция «Не паузить автоматически»:

- Чекбокс «Не паузить автоматически» (toggle `auto_pause_exempt`)
- Радио: «Всегда» / «До даты»
  - При «До даты» появляется date picker для
    `auto_pause_exempt_until`
- Поле «Почему» (note)

### Отдельная страница в AdminPanel

Раздел «Без автопаузы» — два списка под одной страницей:

1. **Всегда бесплатно** — `auto_pause_exempt=true AND auto_pause_exempt_until IS NULL`.
   Не требует ежемесячной ревизии. Менторы (если будут бартеры
   постоянные), админы, абитуриенты.
2. **Бесплатно до даты** — `auto_pause_exempt_until IS NOT NULL`,
   сортировка по дате окончания (ближайшие сверху). Это ревью-лист
   для Ольги — видно когда у кого истекает.

---

## Ответы на остальные открытые вопросы recon

| Вопрос | Ответ |
|---|---|
| Auth-service patch session_version | Не нужен, см. выше. Заводим как TECH-DEBT-AUTH-SESSION-INVALIDATION P3. |
| Доступ к Prodamus dashboard | Есть у Ольги. Она достанет `PRODAMUS_SECRET_KEY` и пропишет webhook URL после готовности кода. |
| Тестовый платёж | Уточняем у Ольги: есть ли sandbox в её Prodamus, или прокатывать живым (минимальная сумма). |
| 50 active vs 40 платящих | Разрыв — admin (Ольга/Настя/Ирина, 3) + applicant/intern (~7 абитуриентов курса ПВЛ). Менторы платят. |
| UX списка manual_override | Два раздела «Всегда» и «До даты», см. выше. |
| Auto-expire cron vs at-read | Cron (как ты предлагал). At-read страдает если webhook не приходит. |

---

## Что мне нужно от тебя следующим шагом

Запиши ответ в файл `docs/_session/2026-05-16_02_codeexec_<topic>.md`.

Содержание:

1. **Обновлённый план фаз пути C** — с учётом `auto_pause_exempt`
   полей и UI разделов «Всегда» / «До даты».
2. **Чёткий список того, что НЕ применяем из миграции 21** (исключаем
   RESTRICTIVE-policies, session_version, has_platform_access RLS-гард).
3. **Diff на доработку `deriveAccessMutation`** в
   `push-server/billingLogic.mjs` — добавить ветку для
   `auto_pause_exempt`.
4. **Проект миграции** `migrations/2026-05-16_phase29_billing_access_partial.sql`
   или как удобнее назвать. До apply — показать на ревью.

Код не пиши, миграцию не аплай. Сначала план + черновики на
ревью.

---

## Конвенция работы (с этого момента)

По запросу Ольги — все промпты стратега и отчёты от executor'а
переходим в файлы `docs/_session/YYYY-MM-DD_NN_*.md`. Ольга
пересылает между чатами только короткие ссылки. Это уже
существующий конвенция проекта (CLAUDE.md), просто чётче её
применяем.
