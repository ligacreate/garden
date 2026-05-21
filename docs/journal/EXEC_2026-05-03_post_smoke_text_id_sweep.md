---
title: SEC-001 пост-smoke превентивный sweep — TEXT-id колонки в RLS-таблицах
type: execution-log
phase: "etap-5-post-smoke-text-id-sweep"
created: 2026-05-03
status: ✅ COMPLETED (read-only, no changes applied)
related_doc: docs/MIGRATION_2026-05-02_security_restoration.md
related_lessons: docs/EXEC_2026-05-02_etap5_post_smoke_fix1_pvl_student_questions.md
related_backlog: BUG-AUDITLOG-IDS (новая), CLEAN-008 (новая)
---

# Превентивный sweep: TEXT-id колонки в RLS-таблицах

**Время:** 2026-05-03 ≈ 03:15 MSK.
**Тип:** read-only.
**Цель:** найти `non-UUID-shape` значения в TEXT-колонках, на которые ссылаются RLS-политики через cast `text::uuid` (после fix #1 на `pvl_student_questions` — превентивный поиск аналогичных мин).

---

## Шаг A — типы колонок (контекст)

Проверены 9 колонок в 5 PVL-таблицах:

| Таблица | Колонка | Тип | nullable |
|---|---|---|---|
| `pvl_audit_log` | `actor_user_id` | text | yes |
| `pvl_calendar_events` | `created_by` | text | yes |
| `pvl_content_items` | `created_by` | text | yes |
| `pvl_content_items` | `updated_by` | text | yes |
| `pvl_faq_items` | `created_by` | text | yes |
| `pvl_notifications` | `recipient_mentor_id` | text | yes |
| `pvl_notifications` | `recipient_student_id` | text | yes |
| `pvl_notifications` | `user_id` | text | **NO** |
| `pvl_student_questions` | `student_id` | text | **NO** |

Все 9 — `text`, не `uuid`. Способны хранить мусор.

---

## Шаг B — non-UUID-shape values

### Сводка по колонкам

| Колонка | bad | total non-null |
|---|---|---|
| `pvl_audit_log.actor_user_id` | **1621** | 2205 |
| `pvl_calendar_events.created_by` | 0 | 0 (таблица пуста) |
| `pvl_content_items.created_by` | 0 | 0 |
| `pvl_content_items.updated_by` | 0 | 0 |
| `pvl_faq_items.created_by` | 0 | 0 |
| `pvl_notifications.recipient_mentor_id` | 0 | 0 |
| `pvl_notifications.recipient_student_id` | 0 | 0 |
| `pvl_notifications.user_id` | 0 | 0 |
| `pvl_student_questions.student_id` | 0 | 0 (после fix #1) |

**Только `pvl_audit_log.actor_user_id` содержит legacy-значения.** Все остальные таблицы пустые → риска нет.

### Распределение значений в pvl_audit_log.actor_user_id

```
 actor_user_id | rows
---------------+------
 u-adm-1       | 1532
 u-st-1        |   88
 smoke         |    1
```

Из 2205 non-null строк:
- **584** — валидные UUID (реальные `auth.uid()` пользователей)
- **1532** — `u-adm-1` (admin-placeholder, очевидно от seed/dev-периода)
- **88** — `u-st-1` (student-placeholder)
- **1** — `smoke`

---

## Шаг C — есть ли `::uuid` cast в RLS-политиках?

### Политики `pvl_audit_log`

```
             policyname             |  cmd   |    qual    |        with_check
------------------------------------+--------+------------+--------------------------
 pvl_audit_log_insert_authenticated | INSERT | <none>     | (auth.uid() IS NOT NULL)
 pvl_audit_log_select_admin         | SELECT | is_admin() | <none>
```

✅ **Нет `actor_user_id::uuid` cast'а.** Политика `is_admin()` для SELECT — простая проверка, не трогает `actor_user_id`. INSERT-политика — только проверка наличия `auth.uid()`, не валидирует значение.

**Следствие:** legacy-значения `u-adm-1` / `u-st-1` / `smoke` в `actor_user_id` **не вызывают RLS-error**. Ольга (admin) свободно читает все 2205 строк через PostgREST (мы это видели в этапе 5.4 — `/pvl_audit_log` вернул 2204 строк).

---

## 🔴 Persistent bug — фронт всё ещё пишет stub-id

### Свежие записи (2026-05-01 = вчера в проектном таймлайне)

```
           id           | actor_user_id |        action         |    entity_type    |         created_at
------------------------+---------------+-----------------------+-------------------+----------------------------
 aud-1777655172156-314  | u-st-1        | submit_task           | task              | 2026-05-01 20:06:12.156+03
 aud-1777652443480-3322 | u-adm-1       | assign_student_mentor | student_profile   | 2026-05-01 19:20:43.48+03
 aud-1777649997849-1095 | u-adm-1       | assign_student_mentor | student_profile   | 2026-05-01 18:39:57.849+03
 aud-1777627330513-924  | u-adm-1       | publish_content       | content_item      | 2026-05-01 12:22:10.513+03
 aud-1777627330512-9527 | u-adm-1       | assign_placement      | content_placement | 2026-05-01 12:22:10.512+03
```

То есть **фронт продолжает писать `u-adm-1` / `u-st-1` вместо `auth.uid()` в `actor_user_id` audit-log'а** — даже после миграции на JWT и реальной production-работы.

### Где скорее всего лежит баг

В коде, который инсертит в `pvl_audit_log`. Основные подозреваемые:
- `services/pvlMockApi.js` (4221 строка, гибрид seed/PostgREST — runbook 4.1) — функции типа `auditLog(...)` или `recordAudit(...)`.
- `services/pvlPostgrestApi.js` — функция-обёртка для INSERT в `pvl_audit_log`.
- `views/PvlPrototypeApp.jsx` — где-то в admin/mentor-action хендлерах.

Жёсткие константы `'u-adm-1'` / `'u-st-1'` явно где-то в коде. После SEC-001 их надо заменить на `currentUser.id` или `getAuthToken() → decoded sub`.

---

## Чем это опасно (и чем — нет)

### Опасности НЕТ:
- RLS не падает (нет cast'а в политиках).
- Функционально audit-log читается (видим 2204 строк под админом).
- INSERT под authenticated проходит (политика `auth.uid() IS NOT NULL` — даже если в payload `actor_user_id='u-adm-1'`, важен только наличие токена).

### Опасность ЕСТЬ (compliance / debugging):
- **Нельзя восстановить «кто что сделал»** для 1621 строки — `actor_user_id` не указывает на реального пользователя.
- При расследовании инцидентов в админке ("кто опубликовал этот content_item в 12:22") — таймстемп есть, but actor — `u-adm-1`. Если админов несколько, это бесполезно.
- Поскольку фронт продолжает писать stub-id, **в новых записях после SEC-001 тоже теряется атрибуция** — этот процесс активный, не legacy.

---

## Что предлагаю в backlog

### BUG-AUDITLOG-IDS (новая, P2)

> **Фронт пишет stub `u-adm-1` / `u-st-1` вместо `auth.uid()` в `pvl_audit_log.actor_user_id`.**
>
> - **Контекст:** sweep 2026-05-03 показал 1621 строку с stub-id в audit-log, включая свежие записи от 2026-05-01.
> - **Шаги:**
>   - [ ] `grep -rn "u-adm-1\|u-st-1" services/ views/` — найти точки записи
>   - [ ] Заменить на `currentUser.id` / `auth.uid()` (через decoded JWT)
>   - [ ] Тест: сделать `assign_student_mentor` под админом → проверить, что в `actor_user_id` пишется UUID Ольги, не `u-adm-1`
> - **Риск пропуска:** низкий технический (RLS не блокирует), средний compliance (audit-trail некорректен).

### CLEAN-008 (новая, P3)

> **Очистить legacy stub-id в `pvl_audit_log.actor_user_id` после фикса BUG-AUDITLOG-IDS.**
>
> - 1532 строки `u-adm-1`: неоднозначно (несколько админов было? только Ольга?). Если только Ольга — `UPDATE ... SET actor_user_id = '85dbefda-...' WHERE actor_user_id = 'u-adm-1'`. Иначе — оставить и пометить как unknown.
> - 88 строк `u-st-1`: атрибуция к конкретному студенту восстановима только через timestamp-correlation с другими таблицами. Возможно, тоже пометить как unknown.
> - 1 строка `smoke`: точно тестовая, можно DELETE.
> - После cleanup — миграция колонки на `uuid`-тип (с FK на `profiles.id`).
> - **Зависит от** BUG-AUDITLOG-IDS (сначала перестать писать новые stub'ы).

---

## Что НЕ обнаружено (хорошие новости)

- В 7 других TEXT-колонках (calendar_events, content_items, faq_items, notifications) — **0 строк**. Когда фронт начнёт массово их использовать, новые INSERT'ы будут с правильным UUID, если фронт-код не повторит ту же ошибку, что в audit_log. Но превентивно стоит проверить INSERT-логику этих колонок (возможно, та же копи-паста, что в audit_log).
- `pvl_student_questions.student_id` — 0 строк после fix #1. Чисто.
- Все 9 проверенных колонок — `text`, не `uuid`. Это потенциально проблемно при росте данных. **CLEAN-007** в backlog покрывает миграцию `pvl_student_questions`; нужно расширить до всех 9 колонок постепенно.

---

## Статус

✅ **Sweep ЗАКРЫТ.** Превентивная проверка нашла 1621 «слепых» actor_user_id в pvl_audit_log, но без RLS-блокера (нет cast'а в политике). Записаны BUG-AUDITLOG-IDS и CLEAN-008 в backlog. Live smoke может продолжаться без cleanup-фикса.
