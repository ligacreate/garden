# 🎉 FEAT-015 → 🟢 DONE 2026-05-16

**От:** VS Code Claude Code
**Кому:** стратег (claude.ai), Ольга
**Ответ на:** [`docs/_session/2026-05-16_14_codeexec_prodamus_algo_deploy.md`](2026-05-16_14_codeexec_prodamus_algo_deploy.md) + ваш зелёный сигнал
**Дата:** 2026-05-16
**Статус:** ✅ FEAT-015 (Авто-пауза ведущей при неоплате Prodamus) закрыта целиком — все 8 фаз.

---

## TL;DR

Sandbox 200 OK + idempotency сошлась. Revert debug-лога (`464779d`) на проде. Три урока в `docs/lessons/`. BACKLOG.md и план FEAT-015 помечены DONE. План закрыт по Path C — гибрид (без RESTRICTIVE-policies миграции 21).

| Phase | Что | Закрыта |
|---|---|---|
| C0 | Pre-flight | 2026-05-15 ✅ |
| C1 | Миграция phase29 (b87ee2a) | 2026-05-15 ✅ |
| C2 | push-server изменения (8ddc198 + e0d60cf) | 2026-05-15 ✅ |
| C3 | Dark deploy (rsync + restart) | 2026-05-15 ✅ |
| C4 | `.env` + webhook ON (Ольга) | 2026-05-15 ✅ |
| C5 | E2E sandbox (200 OK + duplicate detection) | 2026-05-16 ✅ |
| C6 | Admin UI (85a93f2) | 2026-05-16 ✅ |
| C7 | Backlog + 3 урока (этот чат) | 2026-05-16 ✅ |

## Что сделано в этой финализации

### 1. Revert debug-лога (464779d)

Убран TEMPORARY debug-блок из `handleProdamusWebhook`. Был добавлен в `eb2d67a` для диагностики signature-алгоритма; после зелёного sandbox он только бы светил структуру невалидных запросов в stderr.

```
[main 464779d] chore(push-server): revert temporary signature debug trace
 1 file changed, 1 insertion(+), 15 deletions(-)
eb2d67a..464779d  main -> main
```

Deploy:
```
$ rsync push-server/ → /opt/push-server/
server.mjs sent 1600 bytes

$ systemctl restart push-server.service && systemctl is-active
active

$ journalctl -u push-server.service -n 4
May 15 19:43:35 push-server: Server started on :8787 (push=off, prodamus=on)
```

`verifyProdamusSignature` и `buildProdamusCanonical` остались в `prodamusVerify.mjs` — они нужны для production verify.

### 2. Три урока

Записаны в `docs/lessons/`:

| Файл | Тема |
|---|---|
| [`2026-05-16-prodamus-signature-algorithm.md`](../lessons/2026-05-16-prodamus-signature-algorithm.md) | Header `Sign` (не в теле) + recursive ksort + JSON HMAC-SHA256. Источник: github.com/Prodamus/payform-api-php. |
| [`2026-05-16-partial-unique-index-on-conflict.md`](../lessons/2026-05-16-partial-unique-index-on-conflict.md) | Postgres `ON CONFLICT` с partial unique index требует тот же `WHERE`, иначе 42P10. |
| [`2026-05-16-push-server-silent-crash-observability.md`](../lessons/2026-05-16-push-server-silent-crash-observability.md) | 5 дней silent crash в reconcile никто не заметил. Связан с `TECH-DEBT-PUSH-SERVER-STDERR-ALERTING`. |

Все три про неявные контракты (Postgres / HTTP-провайдер / observability gap) — связанные перекрёстными ссылками.

### 3. BACKLOG.md обновлён

- `### FEAT-015` (line 249) — статус `🟢 DONE 2026-05-16`. Полный контекст что в проде, какие коммиты, какие уроки, какие открытые followup'ы.
- Новая хронологическая секция `#### 2026-05-15 / 2026-05-16` в конце «История» — сводка всех 7 коммитов FEAT-015 + 3 урока + новый тикет TECH-DEBT-PUSH-SERVER-STDERR-ALERTING + закрытие TECH-DEBT-PUSH-SERVER-RECONCILE-LOGSPAM same-day.

### 4. План FEAT-015 обновлён

`plans/2026-05-15-feat015-prodamus-c.md` — все 8 чекбоксов отмечены `[x]`, добавлен раздел «Итог» с финальной сводкой.

## Архитектурный итог (для памяти)

**Path C — гибрид.** Вместо RESTRICTIVE-policies миграции 21 в полном объёме, применили `phase29` (9 колонок mig21 + 3 NEW `auto_pause_exempt`) с **bridge-trigger** `access_status → status`. Сохранили текущую модель `profiles.status` как owner of state, на неё повешен phase 21 resync-trigger.

```
Webhook (Prodamus) → push-server → applyAccessState
                                       ↓
                           UPDATE profiles SET access_status = ...
                                       ↓
                         trigger trg_sync_status_from_access_status
                                       ↓
                            UPDATE profiles SET status = ...
                                       ↓
                          trigger on_profile_status_change_resync_events
                                       ↓
                            события скрываются из публичного meetings
```

`auto_pause_exempt` — отдельный признак (admin/applicant/intern по умолчанию) который останавливает auto-pause при `deactivation`/`finish`. Установлен на 31 профиле через backfill в phase29.

## Открытые followup'ы (не блокеры)

| Followup | Приоритет | Кто | Когда |
|---|---|---|---|
| **Полный E2E с реальным платежом** (~100₽ Ольгиного) | P3 | Ольга | Когда удобно |
| **Smoke Phase C6 UI на проде** — вкладка «Без автопаузы» | P3 | Ольга | Сейчас (см. ниже) |
| **TECH-DEBT-PUSH-SERVER-STDERR-ALERTING** | P3 | Любая будущая сессия | Когда созреем |

## Сообщение для Ольги

🎉 **FEAT-015 закрыта.** Webhook от Prodamus автоматически паузит подписки при неоплате, иммунитет от автопаузы доступен через админку.

**Просьба прогнать smoke Phase C6 UI:**
1. Открой админку Garden (https://liga.skrebeyko.ru/admin).
2. Найди новую вкладку **«Без автопаузы»**.
3. Должны быть видны **два списка**: «Всегда» (постоянный иммунитет — должны быть админы и применённый по бэкфилу состав) + «До даты» (временный — пусто пока не назначено).
4. Попробуй на каком-нибудь тестовом пользователе нажать иконку щита (Shield) в основном списке Users — откроется модал «Иммунитет к автопаузе» с чекбоксом и radio (Всегда / До даты + дата + причина).

Если что-то не так — дай знать в этом чате.

## Состояние репо после этой сессии

```
git log --oneline -8
464779d chore(push-server): revert temporary signature debug trace
eb2d67a fix(push-server): BUG-PRODAMUS-SIGNATURE-ALGO — настоящий Prodamus алгоритм + debug-лог
e0d60cf fix(push-server): BUG-WEBHOOK-LOG-PARTIAL-INDEX — ON CONFLICT WHERE для partial unique индексов
7dcab90 fix(push-server): BUG-PRODAMUS-SIGNATURE-HEADER — мост header Sign в payload перед verify
85a93f2 feat(admin): FEAT-015 Path C C6 — auto_pause_exempt UI + toggleUserStatus две колонки
8ddc198 feat(push-server): FEAT-015 Path C — auto_pause_exempt в deriveAccessMutation + reconcile
b87ee2a feat(db): phase29 prodamus path C — 9 колонок mig21 + auto_pause_exempt + bridge trigger
e86d2ed fix(build): BUG-CORS-SCRIPT-ERROR — Vite-плагин снимает crossorigin с same-origin asset-тегов
```

7 коммитов FEAT-015 + 1 fix CORS до этого.

## Ещё что нужно закоммитить

В этой финализации добавлены/обновлены файлы (не закоммичены):
- `docs/lessons/2026-05-16-prodamus-signature-algorithm.md` (новый)
- `docs/lessons/2026-05-16-partial-unique-index-on-conflict.md` (новый)
- `docs/lessons/2026-05-16-push-server-silent-crash-observability.md` (новый)
- `plans/BACKLOG.md` (FEAT-015 → DONE + chronology entry)
- `plans/2026-05-15-feat015-prodamus-c.md` (8 фаз ✅ + итоговый блок)
- `docs/_session/2026-05-16_14_codeexec_prodamus_algo_deploy.md` (предыдущий отчёт)
- `docs/_session/2026-05-16_15_codeexec_feat015_done.md` (этот файл)

Жду 🟢 на коммит документации (или возражение «давай оставим uncommitted на ревью»).
