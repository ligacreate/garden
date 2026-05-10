---
title: TECH-DEBT-AUTH-BACKUPS-CLEAN — стратегия для backup'ов /opt/garden-auth/server.js
date: 2026-05-10
priority: P3
status: open
related:
  - docs/_session/2026-05-10_05_codeexec_p1_backend_deployed.md (раздел 5.5)
  - docs/journal/INCIDENT_2026-05-10_tg_blackbox.md (был использован при деплое)
audience: тот, кто следующим будет править server.js на проде
---

# Cleanup стратегия для server.js.bak* в /opt/garden-auth/

## Текущее состояние

```
$ ssh root@5.129.251.56 'ls -la /opt/garden-auth/server.js*'
-rw-r--r-- 1 root root 13218 May 10 14:52 server.js                              ← live (post-MON-001)
-rw-r--r-- 1 root root  6996 Feb 23 18:03 server.js.bak                          ← old, ~3 месяца
-rw-r--r-- 1 root root  8935 Feb 24 03:51 server.js.bak.2026-05-02-pre-role-claim ← перед фиксом role: 'authenticated'
-rw-r--r-- 1 root root  8965 May 10 14:40 server.js.bak.2026-05-10-pre-mon001    ← сегодняшний (нужен на ближайшие дни)
```

Февральские backup'ы (2 штуки) — за 3 месяца некому пригодились
бы для отката. Текущий MON-001 backup — нужен ещё пару дней,
пока убедимся, что endpoint стабилен.

## Проблема

1. **Файлов растёт** с каждым deploy через scp. Без cleanup за
   год накопится 20–30 backup'ов и затруднит навигацию в
   `/opt/garden-auth/`.
2. **Имена не унифицированы:** `.bak`, `.bak.YYYY-MM-DD-описание`,
   `.bak.YYYY-MM-DD-pre-X`. Нет стандарта.
3. **Backup-стратегия не задокументирована** в RUNBOOK.

## Варианты решения

### A. Rotate keep-last-N (recommended)

Скрипт `/opt/garden-auth/rotate_backups.sh`:

```bash
#!/bin/bash
# Удалить все backup'ы кроме N последних по mtime.
KEEP=5
cd /opt/garden-auth
ls -1t server.js.bak* 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -v
```

Запускать **в конце каждого deploy-запуска** (после успешного
restart + smoke). Никаких cron'ов — иначе risk удалить backup,
который ещё нужен для отката.

Плюсы: автоматически, никто не забывает.
Минусы: нужно встроить в любой deploy-flow (будь то ручной scp
или будущий git-based).

### B. Ручной cleanup при каждом deploy

«Перед scp нового server.js — посмотри `ls -la server.js.bak*`,
если их больше 5 — удали лишние».

Плюсы: ноль автоматизации, ноль рисков от cleanup-скрипта.
Минусы: легко забыть, особенно когда deploy делает другой
человек/агент.

### C. Переход на git-based deploy (TECH-DEBT-AUTH-REPO-SYNC)

Если `/Users/user/vibecoding/garden-auth/` будет синхронизирован
с прод-кодом, deploy идёт через `git pull` на сервере, и backup
вообще не нужен — git хранит историю.

Плюсы: канонический подход, нет хаоса с backup'ами.
Минусы: требует довольно объёмного TECH-DEBT-AUTH-REPO-SYNC
(P3), сегодня ещё не сделано.

## Рекомендация

Вариант **A** на ближайшее время + Вариант **C** в долгосрочной
перспективе. Когда AUTH-REPO-SYNC будет закрыт, rotate-скрипт
можно будет удалить как лишнюю абстракцию.

## Имена backup'ов — конвенция (proposed)

```
server.js.bak.YYYY-MM-DD-pre-<short-tag>
```

Где `<short-tag>` — что меняется (`mon001`, `role-claim`,
`s3-block`). Без описания → `bak.YYYY-MM-DD` достаточно.
Старые `server.js.bak` (без даты) — переименовать в
`server.js.bak.2026-02-23-legacy` или удалить (ручная операция,
не сейчас).

## Action items

- [ ] Решить — A или сразу прыгать в C?
- [ ] Если A — написать `rotate_backups.sh` и закрепить в
  RUNBOOK как обязательный шаг любого scp-based deploy.
- [ ] Унифицировать имена существующих backup'ов (5 минут,
  но не критично).
- [ ] При закрытии TECH-DEBT-AUTH-REPO-SYNC — удалить этот
  тех-долг (станет неактуален).

## Не блокирует

Текущий backup `server.js.bak.2026-05-10-pre-mon001` — нужен на
случай отката MON-001. Не удалять до подтверждения, что endpoint
стабильно работает (минимум 7 дней без `tg-failed`/`handler-error`
в `/var/log/garden-client-errors.log`).
