# План: истечение доступа абитуриентов + T-5 напоминание (движок напоминаний)

**Статус:** ВЫКАЧЕНО 2026-07-11 (migration→garden-auth→push-server, все зелёные, стартовый reconcile — чистый no-op). Дизайн: `docs/_session/2026-07-11_262` + финал `263`. Открыто: git-push garden-auth (репо отстал от прода — решение Оли).

## Зачем
Абитуриент получает доступ к платформе на время потока ПВЛ + 3 месяца после. По
истечении доступ должен закрываться, а за 5 дней до — приходить напоминание с
предложением сдать сертификационный завтрак и перейти в Лигу.

## Ключевые решения
- **`access_until` = `cohort.end_date + 3 мес`** — derive-on-read (без хранимой колонки),
  через shared PK `profiles.id = pvl_students.id → cohort_id → pvl_cohorts.end_date`.
  Абитуриент без когорты → доступ не истекает.
- **Реюз `access_status='paused_expired'`** (В1 освободил это значение от биллинга).
  `paused_manual` не трогаем (админ-бан). `session_version` НЕ бампим — замок на следующем refresh.
- **Общий движок напоминаний** (`reminders.mjs`): спека = данные (популяция/пороги/тексты).
  T-5 абитуриентов сейчас; 1f-биллинг (T-7/3/1/0) подключится той же формой спекой.
- **Cross-service развязка (вариант B):** push-server — продюсер (пишет в очереди),
  garden-auth — консюмер (единственная точка SMTP). Email primary, TG bonus.

## Фазы

### [x] Дизайн (262, 263)
Recon прод-чисел, derive access_until, движок, cross-service, verbatim-текст T-5.

### [x] Apply-набор + выкат (2026-07-11)
- [ ] `migrations/2026-07-11_phase48_reminders_engine.sql` — `reminders_sent`,
      `email_notifications_queue` (+`body_html`), extend `event_type` CHECK (+access_reminder,+billing_reminder).
- [ ] `push-server/server.mjs` — applicant-cut в `runNightlyExpiryReconcile` + `await runReminders(pool)`.
- [ ] `push-server/reminders.mjs` (new) — движок + `REMINDER_SPECS` (T-5 verbatim) + `enqueueEmail`/`enqueueTg`.
- [ ] `garden-auth/server.js` (репо `ligacreate/garden-auth`) — `processEmailQueueBatch` (text+html).

### [x] Выкат — порядок: миграция → garden-auth → push-server (2026-07-11)
- Миграция применена: `reminders_sent`, `email_notifications_queue`, CHECK=7 значений. ✅
- garden-auth: файл обновлён + рестарт, `active`, `/health`={ok:true}. ✅ (git-push репо — отдельно, открыто)
- push-server: rsync (2 файла) + рестарт, `active`, external smoke 200. ✅
- Стартовый reconcile: 0 paused_expired, 0 в очередях — чистый no-op (все абитуриенты ~82 дня до истечения). ✅

### [ ] Проверка после выката
- Миграция применилась (3 объекта), CHECK содержит 7 значений.
- Ночной тик: applicant-cut логирует `paused_expired: N`, `runReminders` без ошибок.
- Тест-абитуриент с `end_date+3мес` через 5 дней → письмо в очереди → доставлено;
  привязанный TG → сообщение; идемпотентность: второй тик не задваивает (`reminders_sent`).

## Вербатим-текст T-5 (не редактировать)
- Тема: `Через 5 дней закроется доступ к платформе`
- Тело: `Напоминаем: можно присоединиться к потоку курса, сдать сертификационный завтрак и перейти в Лигу. Мы всегда ждем!`
- CTA (текст-ссылка → https://t.me/odintsova_ii): `Чтобы сдать сертификационный завтрак, напишите Ирине Одинцовой`

## Ограничения
- Co-hosted тут ни при чём. Абитуриент как co-host встречи — вне scope этой фичи.
- `dead_letter` в очередях требует ручного разбора (нет авто-алерта) — приемлемо для v1.
