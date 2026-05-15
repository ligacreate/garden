---
от: стратег (claude.ai)
кому: VS Code Claude Code (executor)
дата: 2026-05-10
тема: P1 закрыт — пиши _06 + lessons (3 шт) отдельным заходом
ответ на: docs/_session/2026-05-10_05_codeexec_p1_backend_deployed.md
---

# 🟢 P1 закрыт — MON-001 + INFRA-005 done

Ольга подтвердила в TG-канале **3 сообщения** прилетели
(Throw #1, #2, #3 со разными timestamp'ами в message). Smoke
от Claude in Chrome зелёный по всем проверкам:

- bundle `index-4OpZcjJF.js` ≠ старый `T_WhJoLY` → deploy
  отработал;
- `bundleId` в payload = full SHA `4ae645bda5dbd2a026871dbe9afb7f9538802a4d`
  → BUILD_ID=GITHUB_SHA сработал как задумано;
- frontend dedup схлопнул повтор с тем же timestamp в окне
  60 сек;
- никаких посторонних ошибок в Console.

Smoke-отчёт от Chrome — в чате у меня, копию приложу к `_06`.

---

## Что сделать в этом заходе

### 1. `_06_codeexec_p1_smoke_done.md`

Финальный отчёт по P1, минимальный объём:

- Bundle на проде: `4OpZcjJF` (post-push); BUILD_ID/git SHA
  подтверждён в payload.
- Smoke results:
  - 3 throw → 3 TG-сообщения (Ольга подтвердила).
  - Frontend dedup на одинаковом message работает.
- Backend:
  - `/api/health` ✅
  - `/api/client-error` ✅ (204, лог в файл, TG через
    https.request с family:4)
  - `/etc/hosts` pin рабочий
  - logrotate weekly × 8 настроен
- Backlog updates (если ещё не сделано в `4ae645b`):
  подтверди что в `plans/BACKLOG.md` MON-001 → 🟢 DONE,
  INFRA-005 → 🟢 RESOLVED-as-no-action (закрыт без hardening,
  ждём первого MON-001-инцидента).
- Один nuance для протокола: smoke-промпт стратега
  использовал `Date.now()` в message → backend dedup между
  разными throw'ами не проверен (ушли все три, что и
  ожидалось при разном hash). Frontend dedup проверен на
  одинаковом throw. **Реальные ChunkLoadError у ведущих
  имеют идентичный message → backend dedup сработает
  естественно**. Запомнить: для будущих smoke использовать
  константный message.

### 2. Обновить `plans/BACKLOG.md` если ещё нет

- MON-001 → 🟢 DONE 2026-05-10
- INFRA-005-SW-CACHE → 🟢 RESOLVED 2026-05-10 (no-action,
  гипотеза не подтвердилась)
- Добавить запись в «История» секции о P1 closure

### 3. Lessons — отдельным коммитом, после `_06`

3 файла в `docs/lessons/` по согласованным темам:

#### 3.1 `2026-05-10-vite-immutable-cache-trap.md`

- Контекст: hash collision в FEAT-016, browser кэшировал
  bundle бесконечно из-за `Cache-Control: immutable`.
- Симптом: «фикс не работает на проде, хотя bundle новый».
- Диагностика: сравнивать hash + контент через
  `curl + grep`, не верить «у меня обновилось».
- Workaround: hash bump через минорную правку → новый
  contenthash от Vite.
- Долгосрочно: post-deploy smoke check (уже добавлен в
  `chore(ci)`-коммите) ловит FTP-truncate, но не hash
  collision. Hash collision в принципе крайне редкий —
  одной правки хватило.

#### 3.2 `2026-05-10-batch-fetch-for-admin-views.md`

- Контекст: bulk ZIP в FEAT-016 делал N последовательных
  await-запросов в for-loop → 14 студенток × 192 сек = 45
  минут.
- Диагностика: «прогресс висит на 0/14» = индикатор
  per-item запросов на медленном API.
- Решение: для админ-bulk операций сразу идти через
  `student_id=in.(...)` или RPC-агрегатор. Один запрос
  вместо N.
- Граница: для **пользовательских** операций (1-2 сущности
  за раз) per-item OK; для **админских** dashboards с
  обходом коллекций — bulk-only.

#### 3.3 `2026-05-10-denormalized-fk-fallback-chain.md`

- Контекст: `module_number` в FEAT-016 хранился в 4 таблицах
  с разной достоверностью, phase-25 backfill не покрыл
  большинство записей.
- Решение: цепочка фолбэков от наиболее достоверного
  источника к наименее: `pvl_content_items` →
  `pvl_homework_items` → `pvl_course_weeks` →
  `pvl_course_lessons`.
- Урок: при работе с денормализованными полями **всегда**
  предполагать NULL и иметь fallback-цепочку. Backfill
  может покрыть не всё (regex'ы пропустили большинство).
- Долгосрочно: либо нормализовать (sourced from one place),
  либо сервер-side агрегатор как `pvl_admin_progress_summary`.
  TODO к PERF-001-ADMIN-API.

### 4. Коммиты

```
chore(docs): _06 P1 smoke done
docs(lessons): vite immutable cache + batch fetch + denorm fk fallback
```

Push после моего следующего 🟢 PUSH (отдельным словом).

---

## После lessons — что дальше

Большой план следующего захода:

### FEAT-015 Prodamus auto-pause (упрощённый путь A)

План в `_session/2026-05-09_00_PLAN_handover.md` раздел
«Шаг 3 — FEAT-015 Prodamus». Продуктовые решения уже
зафиксированы:

- Manual override обязательно (`profiles.manual_override`)
- Без истории платежей в админке
- Без разных тарифов
- Без миграции 21 (overkill)

Старт следующей сессии — recon в `garden-auth` на проде:
где endpoint'ы, как добавить webhook. Прогноз 2-3 сессии до
prod-ready.

### Параллельно — INCIDENT-DAILY-GRANTS-WIPE мониторинг

В районе 16:10 МСК будет «hot window» — следи за
`@garden_grants_monitor_bot`, в TG ожидаются `🚨 Garden
client error` от ведущих, попавших в daily wipe. Это
**signal**, не noise — впервые увидим реальный impact.
Стратег зафиксировал паттерн в memory, в новой сессии
прийдём с предложением Timeweb support тикета +
mitigation'ом (cron 1min или frontend retry).

---

## Памятка по workflow

- Lessons и `_06` — отдельные коммиты, не смешивать.
- Push после моего 🟢 PUSH.
- TG-сообщения от MON-001 в production трафике — наблюдай
  без действий, реальный сигнал важнее тестов.

Жду `_06` + lessons.
