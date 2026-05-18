# Backlog updates — applied

**От:** codeexec (VS Code)
**Кому:** Ольга → стратегу
**Дата:** 2026-05-18
**В ответ на:** [_64](2026-05-18_64_strategist_backlog_updates.md)
**Статус:** ✅ перенос в `plans/BACKLOG.md` выполнен → ✅ pushed.

---

## SHA

`bf6a68f` (`docs(plans): backlog updates 2026-05-17/18 (closed + new tickets)`).
Push: `2a767a3..bf6a68f` → main.

## Что переехало

### История (closed) — два новых подзаголовка в конец файла

- `#### 2026-05-17` — UX-batch (`b8c2ab4`), phase33 backfill (без SHA — миграция),
  BUG-MEETINGS-INCOME-NOTIFY-SILENT (`9780ee8`), WORKFLOW-CONCURRENCY (`ca37309`),
  GRANTS-CRON-FREQUENCY (`89d4db0`), курс «Социальная психология»
  (UI-recovery, без SHA), Timeweb support ticket.
- `#### 2026-05-18` — BUG-TG-TRIGGER-STATUS-MISMATCH (`2a767a3`, phase34).
  + ссылка на этот сам коммит-backlog-апдейта (SHA `bf6a68f`).

### Новые тикеты в P2 (перед началом ⚪ P3 секции)

- **FEAT-023-PHASE-3 + DEEP-LINK-ROUTING** — PendingApprovalScreen + AdminPanel
  «Ожидают» вкладка + URL query-routing `?tab=*&user=*`. Альтернатива
  минимальная (10 мин): убрать deep-link из TG-шаблона.
- **TECH-DEBT-AUDIT-LOG** — audit-log таблица + universal trigger function
  на критичные таблицы + Caddy access-log с JWT decode + retention policy.
- **VITE-CHUNK-HASH-FLAPPING** — стабилизация chunk-hashes (один из вариантов:
  `npm-shrinkwrap` + `--prefer-offline`, или deterministic chunkFileNames,
  или content-hash-only-on-change).

### В P3 / long-term roadmap (перед началом 🤔 К обсуждению / решению)

- **WORKFLOW-FTP-PARTIAL-DEPLOY-SILENT** (понижен из P2 после
  WORKFLOW-CONCURRENCY, defense-in-depth).
- **PG-MIGRATE-TO-VPS-BITTERN** — long-term roadmap, ~4-8 часов; цель —
  снять зависимость от Timeweb daily reconciliation.

### Стиль

Все новые тикеты — в стиле существующих P2/P3 (Статус / Приоритет /
Создано / Контекст / Скоп / Связано). История — в стиле существующих
date-subheading'ов с буллетами.

## Спорное — `_65` (этот файл)

Ничего спорного не нашёл. Один уточняющий момент: тикет **GRANTS-CRON-FREQUENCY**
по сути — followup в составе уже-открытого **SEC-014**, не отдельная сущность.
Я положил его в Историю как factual change (что изменилось в проде + commit
+ репо-sync), без отдельного P-блока в активном бэклоге. Если хочется
завести как самостоятельный задним числом-closed тикет — скажи, перевешу
формат.

Также **PG-MIGRATE-TO-VPS-BITTERN** положен в P3 (явная отметка
«long-term roadmap, ~4-8 часов» в Статусе). У вас есть `# Дорожная карта
(Roadmap)` в верху файла с этапами 1-5 — туда я НЕ полез, чтобы не
сдвигать структуру. Если он логичнее как новый item в «Этап 4 —
Архитектурные улучшения», скажу — перенесу.

Перепроверь, что ничего не потеряла.
