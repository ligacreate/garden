# phase30 — этап 2 deploy: commit + push + rsync + restart, всё в проде

**От:** VS Code Claude Code
**Кому:** стратег (claude.ai), Ольга
**Ответ на:** 🟢 на этап 2
**Дата:** 2026-05-16
**Статус:** ✅ **commit `588d96c` в проде. push-server restarted, smoke OK, journal чистый. Frontend в main → ждёт GH Actions FTP (1-2 минуты).**

---

## TL;DR

Single commit `588d96c` со всеми 5 файлами phase30 батча. Rsync передал push-server (без tests/.env), restart `active`, journal чистый, external smoke OK. Frontend (AdminPanel.jsx) в main — задеплоится автоматически через GH Actions FTP.

## Поэтапно

### Commit (single batch)

```
[main 588d96c] feat(garden): FEAT-015 phase30 — Льготы (role-based exemption + cleanup)
 5 files changed, 214 insertions(+), 24 deletions(-)
 create mode 100644 migrations/2026-05-16_phase30_exempt_role_cleanup.sql
464779d..588d96c  main -> main
```

Файлы:
- `migrations/2026-05-16_phase30_exempt_role_cleanup.sql` (+83) — миграция (уже applied на этапе 1).
- `push-server/billingLogic.mjs` (+8) — `isExemptRole` helper.
- `push-server/server.mjs` (+19/−7) — autoPauseExempt OR by role + SKIPPED_BY_ROLE + reconcile WHERE NOT IN.
- `push-server/billingLogic.test.mjs` (+53) — 5 новых тестов.
- `views/AdminPanel.jsx` (+75/−24) — UI «Льготы» + role-based инфо-блок.

### Rsync push-server

```
$ rsync -av --exclude=node_modules --exclude='*.test.mjs' --exclude='.env' --exclude='package-lock.json' \
    push-server/ root@5.129.251.56:/opt/push-server/
billingLogic.mjs
server.mjs
sent 5286 bytes  received 274 bytes
```

Только 2 файла переданы (billingLogic.mjs + server.mjs). Тесты исключены, .env сохранён.

### Restart + verify

```
$ systemctl restart push-server.service && systemctl is-active
active

$ journalctl -u push-server.service -n 6
20:25:57 systemd: Stopping push-server.service
20:25:57 systemd: Started push-server.service
20:25:57 push-server: Server started on :8787 (push=off, prodamus=on)
```

### External smoke

```
$ curl https://push.skrebeyko.ru/health
HTTP 200

$ curl -X POST https://push.skrebeyko.ru/api/billing/prodamus/webhook -d '{}'
HTTP 403 — {"error":"Invalid signature"}
```

Корректно — пустой POST без подписи получает 403.

### Journal чистый

```
$ journalctl -u push-server.service --since "5 minutes ago" | grep -iE "error|exception|reconcile"
(пусто)
```

Reconcile запускается immediate at startup + раз в 24 часа. Startup-вызов прошёл без ошибок (новый SQL `WHERE role NOT IN ('admin', 'applicant')` корректно matches схему). Никаких 42703/42P10/exception в journal.

## Состояние FEAT-015 + phase30

| Артефакт | Статус |
|---|---|
| Phase29 миграция | ✅ Applied 2026-05-15 |
| Webhook signature header (7dcab90) | ✅ В проде |
| Webhook log partial-index (e0d60cf) | ✅ В проде |
| Prodamus algorithm (eb2d67a) + revert debug (464779d) | ✅ В проде |
| Phase C5 sandbox 200 OK | ✅ Подтверждено 2026-05-16 |
| Phase C6 admin UI базовый (85a93f2) | ✅ В проде |
| **Phase30 миграция** | ✅ Applied 2026-05-16, VERIFY 0 exempt, trigger smoke зелёный |
| **Phase30 push-server** | ✅ Commit `588d96c`, rsync + restart OK |
| **Phase30 UI «Льготы»** | ⏳ Commit `588d96c` в main, ждёт GH Actions FTP (1-2 мин) |

## Что ждёт следующий шаг

**Ольга:** через 1-2 минуты (после GH Actions FTP) проверь в админке Garden:

1. **Tab «Льготы»** (был «Без автопаузы») — должен быть пустым с подсказкой «Индивидуальные исключения: бартеры, постоянные льготы для конкретных людей. Админы и абитуриенты защищены автоматически по роли...».
2. **Карточки «Постоянная льгота» / «Льгота до даты»** — обе пустые «Пока никого». Это правильное поведение (никаких индивидуальных льгот пока не назначено).
3. **Tab «Пользователи» → Shield-кнопка** на любом юзере (admin или applicant) → откроется модалка «Льгота — {имя}» → должен быть **инфо-блок** «Льгота не требуется — защищён по роли (admin)» с кнопкой «Закрыть» (НЕ форма с чекбоксом).
4. **Shield-кнопка на любом intern/leader/mentor** → должна открыть **обычную модалку** с чекбоксом «Дать льготу (не паузить автоматически)» + Always/Until + textarea.
5. **Tooltip Shield-кнопки** в строке Users:
   - У юзера БЕЗ льготы — `Льготы нет`.
   - У юзера С льготой бессрочной — `Льгота: всегда`.
   - У юзера С льготой до даты — `Льгота: до 2026-12-31`.

Если что-то не так — дай знать.

## Открытые followup'ы

- **Реальный E2E с платежом** (~100₽ Ольгиного аккаунта) — отложенный smoke task. Не блокер.
- **TECH-DEBT-PUSH-SERVER-STDERR-ALERTING** (P3) — алёртинг на stderr push-server'а в TG. Заведён в BACKLOG.

## Что НЕ закоммичено (документация phase30)

- `docs/_session/2026-05-16_16_strategist_exempt_cleanup_role_based.md` (стратегов брифинг)
- `docs/_session/2026-05-16_16b_strategist_rename_lgoty.md` (стратегов брифинг)
- `docs/_session/2026-05-16_17_codeexec_exempt_cleanup_diff.md` (мой diff-док)
- `docs/_session/2026-05-16_18_codeexec_phase30_applied.md` (мой apply-отчёт)
- `docs/_session/2026-05-16_19_codeexec_phase30_deployed.md` (этот файл)

Жду 🟢 на коммит документации (или скажи если оставить uncommitted на ревью).
