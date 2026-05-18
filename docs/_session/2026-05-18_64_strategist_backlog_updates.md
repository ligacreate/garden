# Backlog updates — 2026-05-17/18 (две активные сессии)

**От:** стратег (claude.ai)
**Кому:** VS Code Claude Code (в следующей сессии)
**Дата:** 2026-05-18
**Тип:** snapshot тикетов для переноса в `plans/BACKLOG.md`.

---

## Закрыто за сессии 17.05 + 18.05 (отметить в «История» BACKLOG'а)

- ✅ **UX-batch** (commit `b8c2ab4`) — PVL pills split + meetings income required + admin counter «по N из M» + width consistency. Полный smoke verify.
- ✅ **phase33 migration** — income backfill для 11 completed-встреч с NULL.
- ✅ **BUG-MEETINGS-INCOME-NOTIFY-SILENT** (commit `9780ee8`) — inline error в Result modal + Toast createPortal + nullish-coalesce для load. Smoke all green.
- ✅ **WORKFLOW-CONCURRENCY** (commit `ca37309`) — `concurrency: deploy-ftp, cancel-in-progress: false` в `deploy.yml`. Proved железно (#206 in_progress + #207 pending без overlap).
- ✅ **GRANTS-CRON-FREQUENCY** (commit `89d4db0`) — cron `*/5 → *`, окно недоступности ≤1 сек вместо ≤5 сек. Today's wipe пойман в 13:08:01 UTC ровно, recovery <1 sec.
- ✅ **BUG-TG-TRIGGER-STATUS-MISMATCH** (commit `2a767a3`, phase34) — функция `tg_enqueue_homework_event` теперь проверяет `to_status='in_review'` (было `'submitted'` — несуществующий статус). Менторы наконец смогут получать push о сданных ДЗ.
- ✅ **Курс «Социальная психология»** — recovered (был случайно скрыт через `app_settings.library_settings.hiddenCourses`, fix через UI).
- ✅ **Timeweb support ticket** про daily ACL wipe — отправлен, ответ принят (root cause = их scheduled reconciliation, через панель грантов нельзя — security regression).

## Открытые тикеты (внести в BACKLOG, приоритеты)

### P1 (срочно или с активным риском)

— все P1 на 18.05 закрыты выше. Активных нет.

### P2 (важно, не блокер)

- **FEAT-023-PHASE-3 + DEEP-LINK-ROUTING** (новый, 18.05)
  - Pending Approval UI: `PendingApprovalScreen` с polling + AdminPanel «Ожидают» вкладка с approve/reject кнопками
  - URL query-param routing в AdminPanel: `?tab=*&user=*` (сейчас тags не парсятся фронтом)
  - Контекст: garden-auth уже формирует `${PUBLIC_URL}/#/admin?tab=pending&user=${id}` в TG-сообщении о новой регистрации, но фронт его игнорирует. Сейчас admin вынужден искать pending-юзера по email в общем списке.
  - Альтернатива минимальная: убрать кнопку «Открыть в админке» из TG-шаблона и оставить только email/имя/город как достаточный контекст. Это 5 минут codeexec вместо полноценной Phase 3.
  - Дискуссия и обоснование: `_session/_64` (этот файл), и `_session/_*_FEAT-023-Phase-3` когда возьмём в работу.

- **TECH-DEBT-AUDIT-LOG** (новый, 18.05)
  - Контекст: курс «Социальная психология» был случайно скрыт через `app_settings.library_settings`, обнаружили в 12:19:16 МСК. Узнать кто именно скрыл — невозможно: в `app_settings` нет `updated_by`, Caddy access-log не настроен, Postgres-уровневое логирование на managed Timeweb недоступно.
  - Объём:
    1. Audit-log таблица: `id, changed_at, changed_by_user_id, table_name, row_id, action, old_value_jsonb, new_value_jsonb`
    2. Universal trigger function `log_audit_event()` на критичные таблицы:
       - `app_settings` (всё)
       - `profiles.role`, `profiles.access_status`, `profiles.email` (UPDATE)
       - `knowledge_base` (DELETE)
       - Ключевые `pvl_*` (DELETE: `pvl_garden_mentor_links`, `pvl_student_homework_submissions`)
    3. Включить Caddy access-log с JWT в headers → отдельный pipeline для decode + persist user_id в access-log
    4. Retention policy (90 days?) — отдельный cron на TRUNCATE старых записей.
  - Приоритет: P2 — без него любые «кто это сделал» вопросы заканчиваются «спросить трёх админов».

- **VITE-CHUNK-HASH-FLAPPING** (новый, 18.05)
  - Контекст: Vite даёт разные chunk hashes даже на docs-only commit (например `npm ci` тянет patch-версии deps). Каждый деплой ломает пользователей со старого bundle — auto-reload их вытащит, но это моргание.
  - Решения (один из, не нужны все):
    - Зафиксировать `package-lock.json` через `npm ci --prefer-offline` + strict version pins
    - `build.rollupOptions.output.chunkFileNames` с deterministic naming
    - Стабилизация через content-hash только для изменённых файлов
  - Recon + 1 решение — ~1-2 часа.

### P3 (tech debt, делать когда циклы свободны)

- **WORKFLOW-FTP-PARTIAL-DEPLOY-SILENT** (понижен после WORKFLOW-CONCURRENCY)
  - Контекст: workflow self-smoke в `deploy.yml` проверяет только index.html + main bundle, не chunks. Сценарий — concurrency-block теперь предотвращает race, но FTP transient fail в одиночном run всё ещё может silent-fail на chunk-uploads.
  - Fix: после Deploy step добавить extract chunk-manifest из bundle → curl всех chunks → exit 1 если 404 хоть один.
  - Приоритет: P3 (concurrency-block покрывает основной риск, это defense-in-depth).

### Long-term roadmap (отдельная сессия, полдня+)

- **PG-MIGRATE-TO-VPS-BITTERN** (новый, 17.05)
  - Переезд с managed Postgres Timeweb (где daily ACL wipe — их штатное reconciliation, не отключается) на self-managed PostgreSQL на VPS «Mysterious Bittern» (`5.129.251.56`, где сейчас auth + cron-monitor + push-server).
  - Что даёт: полный контроль ACL (никакого reconciliation), latency localhost между API и БД (нынешние мобильные blips уйдут), любые extensions.
  - Что требует:
    - Setup PostgreSQL 15+ на Bittern (apt install, base config, pg_hba.conf, SSL)
    - pg_dump текущей managed → restore на Bittern + integrity check (row counts по всем таблицам)
    - Переключение connection strings: garden-auth, PostgREST, scripts/check_grants.sh
    - Полноценный backup pipeline: pg_dump → cron daily → отдельный disk / S3-compatible storage с retention 30 дней
    - Verify PostgREST `web_anon` + `authenticated` роли с правильными GRANT'ами, RLS политики живые
    - Decommission managed cluster после ~7 дней backup-period
  - Объём: 4-8 часов работы (recon + dump-restore + cutover + backup setup). Подготовительная сессия (план + dump structure) + migration сессия (live cutover).
  - Приоритет: NOT срочно — текущий cron каждую минуту держит окно недоступности ≤1 сек. Это roadmap-level, не fix.

## Открытые петли — natural acceptance

- 🟡 **PVL pills split** — visually-verified не было; ждём естественного feedback'а от Юли когда у её менти будет одновременно `pendingReview>0 + inRevision>0`.
- 🟡 **FEAT-024 Phase 3 — TG push после ДЗ** — после phase34 hotfix технически работает; ждём первого natural in_review event (Ирина Петруня → Юля привязка готова) для real-world confirmation.
- 🟡 **Curve attack vector Ирины Одинцовой / Василины** — после первого их менти, кто сдаст ДЗ → они получат push в TG. Это и будет smoke.

## Дисциплина из сегодня (lessons зафиксированы в memory стратега)

- `feedback-batch-deploys-no-race` — не пушить два коммита подряд в Garden; concurrency block теперь подстрахует системно.
- `feedback-external-artifacts-in-chat` — короткие артефакты для копирования во внешние сервисы — в чат кодблоком, не в `_session/`.
- `feedback-garden-tech-questions-via-claude-code` (расширение) — public GH API доступен без auth (Garden repo public), curl/WebFetch — первая попытка, не fallback.
- `feedback-delegate-to-claude-in-chrome` (расширение) — smoke after deploy — всегда paste-ready промпт для Chrome runner, не чек-лист руками Ольге.
- `project-garden-daily-wipe` — точное время wipe `~13:08 UTC` (не `:10` как думали), confirmed Timeweb scheduled.

---

## Что от тебя нужно (codeexec, в следующей сессии)

1. Прочитать этот файл.
2. Открыть `plans/BACKLOG.md`, добавить **закрытое сегодня** в секцию «История» (с датами + commit SHA где есть).
3. Добавить **открытые тикеты** в секцию «Текущий бэклог» с правильными приоритетами (P1/P2/P3/long-term).
4. Single коммит «docs(plans): backlog updates 2026-05-17/18 (closed + new tickets)».
5. Подтверди в `_session/_65` ссылкой на коммит — я перепроверю что ничего не потеряла.

Если что-то в этом файле выглядит спорно или неполно — пиши в `_65` вопрос, разберём.
