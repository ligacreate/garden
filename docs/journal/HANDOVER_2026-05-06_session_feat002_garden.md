---
title: HANDOVER 2026-05-06 — FEAT-002 Garden-сторона закрыта (этапы 1-3) + хвосты
type: handover
created: 2026-05-06
status: SESSION CLOSED — FEAT-002 этапы 1-3 deployed, дальше meetings + хвосты
related:
  - plans/BACKLOG.md
  - docs/RECON_2026-05-04_feat002_data_hygiene.md
  - docs/RECON_2026-05-04_feat002_telegram_match.md
  - migrations/2026-05-05_phase22_vk_field_and_event_contacts.sql
  - migrations/2026-05-05_phase23_grants_safety_net.sql
  - migrations/data/2026-05-05_feat002_hygiene.sql
  - migrations/data/2026-05-05_feat002_hygiene_followup_islamova_tg.sql
  - docs/HANDOVER_2026-05-03_session3.md
---

# HANDOVER 2026-05-06 — FEAT-002 Garden-сторона + сессия 2026-05-05/06

Документ-снимок состояния для следующего стратега и Ольги при возврате.
Сессия растянулась с 2026-05-05 (FEAT-002 этап 1 — гигиена контактов)
до 2026-05-06 (deploy этапа 3 в Garden + UI-backfill VK + hot-fix
второго GRANT WIPEOUT). Закрыли крупный блок, остались чёткие хвосты.

---

## TL;DR

**FEAT-002 Garden-сторона закрыта на 3/4 этапов.** Этап 3 задеплоен
2026-05-06 18:36 UTC (commit `aead805`), smoke V1-V5 5/5 PASS через
Claude in Chrome. Параллельно: ручной UI-backfill VK для 4 ведущих
через psql, trigger phase 22 автоматически синкнул в `events`
(11 events `host_vk` заполнен).

**Параллельно за сессию:** второй P0 GRANT WIPEOUT 2026-05-05
(через ~30 минут после phase 22 apply) → SEC-014 phase 23 hot-fix
с трёхслойной защитой (stored procedure + recovery script +
cron-monitor каждые 5 минут). RUNBOOK раздел 1.3 закреплён.

**Что осталось:** meetings-этап 4 FEAT-002, CLEAN-013, CLEAN-014
(удалить `meetings.payment_link` после этапа 4), NB-RESTORE
(переезд админки notebooks/questions/cities из meetings в Garden,
P1), SEC-014 остатки (тикет в Timeweb support + Telegram-бот
для алертов).

---

## Что сделано (хронология сессии 2026-05-05 → 06)

### 2026-05-05

1. **FEAT-002 этап 1 — гигиена `profiles.telegram` + `meetings.payment_link`**
   (commit `e28bfb9`). Через 2-чатовый Telethon-match (приватные чаты
   Лиги под админ-аккаунтом Ольги, 56 уникальных участников) вытянули
   `@username` для 14 ведущих. Дополнительно: 4 manual matches от Ольги,
   нормализация B-секции (`@username` → `https://t.me/...`),
   расщепление composite-полей (Инна Кулиш — TG+VK), очистка 17
   `meetings.payment_link`. **45 UPDATE одной транзакцией под `gen_user`**.

2. **Followup TG для Светланы Исламовой** (commit `d2abc67`) —
   её `telegram` в основной миграции был очищен (там лежал VK),
   Ольга прислала корректный TG, отдельная мини-миграция.

3. **FEAT-002 этап 2 — phase 22 schema migration** (commit `9a14d41`).
   Добавлены `profiles.vk` + `events.host_telegram` + `events.host_vk`,
   расширена `sync_meeting_to_event` (читает `profiles.telegram/vk` →
   пишет в `events.host_*`), добавлен новый trigger
   `on_profile_contacts_change_resync_events` на `profiles`
   AFTER UPDATE OF telegram, vk. **Backfill: 149 events получили
   `host_telegram`, 0 — `host_vk` (vk пустое у всех).**
   Verify V1–V6 зелёные.

4. **Второй P0 GRANT WIPEOUT** (~30 минут после phase 22 apply).
   Counts 158/4 → 0/0, фронт ловит `42501`. Recovery (re-apply
   phase 16/17/18 PART 1) — за минуту по готовому playbook.
   Корреляция с DDL-apply опровергает гипотезу про Timeweb UI quirk
   (никто в UI не заходил, event-triggers пустые) → новая гипотеза:
   managed-Postgres делает ACL-resync с baseline после schema-changing
   операций. Урок:
   `docs/lessons/2026-05-05-timeweb-revokes-grants-after-ddl.md`.

5. **SEC-014 phase 23 hot-fix — трёхслойная защита** (commit `83a0ca9`):
   - `migrations/2026-05-05_phase23_grants_safety_net.sql` — stored
     procedure `public.ensure_garden_grants()`, идемпотентно повторяет
     phase 16 + 17 + 18 PART 1, SECURITY DEFINER. Apply прошёл,
     V1-V4 зелёные.
   - `scripts/recover_grants.sh` — idempotent CLI-обёртка, лежит в
     `/opt/garden-monitor/recover_grants.sh`, тестовый прогон OK.
   - `scripts/check_grants.sh` — cron каждые 5 минут
     (`/etc/cron.d/garden-monitor`), при wipe (authenticated < 100
     ИЛИ web_anon < 4) шлёт Telegram-alert и авто-вызывает recovery.
   - RUNBOOK раздел 1.3 (новый): обязательно
     `SELECT public.ensure_garden_grants();` в конце каждой
     DDL-миграции, ДО `COMMIT`.

6. **ANOM-004 закрыт фактом.** Ольга через Claude in Chrome
   выполнила `POST /notebooks` без JWT → `permission denied` (42501).
   web_anon имеет только SELECT после phase 18, INSERT/UPDATE/DELETE
   grant'ов нет. Дыры нет.

### 2026-05-06

7. **FEAT-002 этап 3 — Garden фронт** (commit `aead805`). Deploy
   через GitHub Actions FTP на 185.215.4.44 в 18:36 UTC. Артефакты:
   - `lib/contactNormalize.js` — утилита нормализации (`@user`/bare → URL).
   - `services/dataService.js` — required TG валидация в save профиля,
     убран `access_status` из тела PATCH в `toggleUserStatus`,
     убран auto-fill `meetings.payment_link` в save события.
   - 3 view-файла (профиль с полем VK + LeaderPageView с двумя кнопками
     контакта + MeetingsView без auto-fill payment_link).
   
   **Smoke V1-V5 5/5 PASS** через Claude in Chrome (Ольга):
   - V1: нормализация VK при сохранении профиля.
   - V2: required TG валидация — пустое поле блокирует save.
   - V3: две кнопки контакта (TG + ВК) на LeaderPageView показываются.
   - V4: `toggleUserStatus` без PGRST204 (BUG-TOGGLE-USER-STATUS-GHOST-COLUMN
     закрыт).
   - V5: save события без auto-fill `payment_link`.

8. **UI-backfill VK для 4 ведущих** через psql под `gen_user`
   (стратегом, потому что UI-backfill через форму был бы слишком
   медленным, а данные у Ольги собраны заранее в RECON-документе):
   Инна Кулиш, Юлия Громова, Светлана Исламова, Колотилова Светлана.
   Trigger `on_profile_contacts_change_resync_events` (phase 22)
   автоматически синкнул в events: **11 events `host_vk` заполнен**
   (по числу будущих событий этих 4 ведущих).

---

## 5 коммитов сессии

| Hash | Что | Когда |
|---|---|---|
| `e28bfb9` | data: FEAT-002 этап 1 — гигиена `profiles.telegram` + `meetings.payment_link` (45 UPDATE, V1-V4 зелёные) | 2026-05-05 |
| `d2abc67` | data: FEAT-002 followup — backfill TG для Светланы Исламовой | 2026-05-05 |
| `9a14d41` | schema: FEAT-002 phase 22 — VK поле + денормализация контактов в events (новый trigger, 149 events backfilled) | 2026-05-05 |
| `83a0ca9` | sec: SEC-014 phase 23 hot-fix — safety net против Timeweb DDL GRANT wipeout (stored procedure + cron-monitor + RUNBOOK 1.3) | 2026-05-05 |
| `aead805` | feat: FEAT-002 этап 3 — поле VK + автонормализация + кнопки ВК + required TG (Garden фронт deployed, smoke 5/5) | 2026-05-06 |

---

## Числа

- **45 UPDATE** в гигиене этапа 1 одной транзакцией под `gen_user`.
- **149 events** получили `host_telegram` после phase 22 backfill;
  0 — `host_vk` (на момент phase 22 у всех vk пустое).
- **11 events `host_vk`** заполнены автоматически после ручного
  UI-backfill для 4 ведущих 2026-05-06 через trigger phase 22.
- **Smoke V1-V5: 5/5 PASS** через Claude in Chrome.
- **Counts grants после phase 23 apply:** authenticated 158, web_anon 4
  (стабильно, wipe сразу после COMMIT не наблюдался).
- **Cron-monitor** работает каждые 5 минут, в logging-only режиме
  (Telegram-бот не настроен).

---

## Что закрыто

- **FEAT-002 этапы 1, 2, 3** (Garden-сторона). Остался этап 4
  (meetings).
- **SEC-014 основной скоуп.** Трёхслойная защита active. Остаётся
  тикет в Timeweb support + Telegram-бот.
- **ANOM-004.** Verified by anon write attempt → 42501.
- **BUG-TOGGLE-USER-STATUS-GHOST-COLUMN.** Fixed в этапе 3
  (commit `aead805`).

---

## Что открыто

| ID | Что | Приоритет | Где |
|---|---|---|---|
| FEAT-002 этап 4 | meetings-сторона: показ `host_vk`/`host_telegram` на странице события + разделение кнопок контакта | P3 | репо `meetings` |
| CLEAN-013 | data hygiene profiles: 4 тестовых аккаунта + дубль LIlia MALONG (MERGE по 3 ссылкам) | P2 | psql |
| NB-RESTORE | переезд админки `notebooks`/`questions`/`cities` из meetings в Garden | **P1** | Garden + meetings |
| CLEAN-014 | удалить колонку `meetings.payment_link` (после этапа 4) | P3 | psql |
| SEC-014 хвосты | тикет в Timeweb support про DDL-wipeout + Telegram-бот для cron-alerts | P1 | внешняя коммуникация + env-vars |

Полные карточки — в `plans/BACKLOG.md`.

---

## Артефакты сессии

**Код:**
- `lib/contactNormalize.js` (новый) — нормализация VK/TG-ссылок
- `services/dataService.js` — required TG, убран `access_status`,
  убран auto-fill `payment_link`
- 3 view-файла (профиль, LeaderPageView, MeetingsView)
- См. полный diff: `git show aead805`

**Миграции:**
- `migrations/data/2026-05-05_feat002_hygiene.sql` (этап 1)
- `migrations/data/2026-05-05_feat002_hygiene_followup_islamova_tg.sql`
  (followup)
- `migrations/2026-05-05_phase22_vk_field_and_event_contacts.sql`
  (этап 2)
- `migrations/2026-05-05_phase23_grants_safety_net.sql` (SEC-014 hot-fix)

**Документация:**
- `docs/RECON_2026-05-04_feat002_data_hygiene.md` (зоопарк)
- `docs/RECON_2026-05-04_feat002_telegram_match.md` (Telethon-match
  отчёт + apply-результаты)
- `docs/lessons/2026-05-05-timeweb-revokes-grants-after-ddl.md`
- `docs/HANDOVER_2026-05-06_session_feat002_garden.md` (этот файл)

**Не в git (private):**
- `scripts/feat002-tg-recon/*` (`.env`, `*.session`, `members.json`,
  `match_result.json` — Telethon)
- `/etc/cron.d/garden-monitor` на проде
- `/opt/garden-monitor/recover_grants.sh` на проде

---

## Если продолжаешь FEAT-002 этап 4

Заходишь в репо `meetings`, не Garden. Скоп:

1. **Прочитать страницу события на meetings.skrebeyko.ru** — где сейчас
   показывается «Зарегистрироваться» / payment_link, как именно
   формируется кнопка.
2. **Перейти на чтение `events.host_telegram` и `events.host_vk`** вместо
   `meetings.payment_link`/`registration_link` (они уже денормализованы
   через phase 22 trigger). Показать на странице две кнопки:
   «Связаться в Телеграм» и «Связаться ВКонтакте» (если есть VK).
3. **Smoke** через Claude in Chrome: открыть событие любой ведущей с
   уже backfilled VK (Инна Кулиш / Юлия Громова / Светлана Исламова /
   Колотилова Светлана) — обе кнопки должны открыть правильные ссылки.
4. **Только после deploy этапа 4** — запускать CLEAN-014 (удаление
   `meetings.payment_link`).

---

## Если открываешь новый чат стратега (claude.ai)

Скажи: «Открываю продолжение после сессии 2026-05-05/06 FEAT-002 Garden.
Прочитай `docs/HANDOVER_2026-05-06_session_feat002_garden.md`, потом
карточки FEAT-002, NB-RESTORE, CLEAN-014, SEC-014 в `plans/BACKLOG.md`,
секцию История 2026-05-05 и 2026-05-06.»

Стратег прочтёт и восстановит контекст.

---

## Контакты в коде/инфре (актуальный снимок)

- Сервер: `ssh root@5.129.251.56` (Mysterious Bittern, Timeweb Cloud)
- БД: managed Postgres 18.1, роль `gen_user` (owner)
- PostgREST: Docker-контейнер на 127.0.0.1:3000, JWT-валидация active
- garden-auth: systemd, /opt/garden-auth/server.js на 127.0.0.1:3001
- Caddy: /etc/caddy/Caddyfile, проксирует api.* и auth.skrebeyko.ru
- Фронт Garden: nginx на 185.215.4.44, деплой через GitHub Actions FTP
- Cron-monitor: `/etc/cron.d/garden-monitor`, лог в
  `/var/log/garden-monitor.log`
- Stored procedure: `public.ensure_garden_grants()` — в БД, idempotent
- Репо: ligacreate/garden (фронт), ligacreate/garden-auth, garden-db,
  meetings

---

## История изменений документа

- **2026-05-06 (v1.0):** Создан в финале сессии 2026-05-05/06.
  FEAT-002 этап 3 deployed, этапы 1-3 закрыты, хвосты определены
  (этап 4 + CLEAN-013 + CLEAN-014 + NB-RESTORE + SEC-014 остатки).
