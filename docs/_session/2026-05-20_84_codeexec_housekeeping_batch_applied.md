# Housekeeping batch — applied (local, push deferred)

**От:** codeexec (VS Code)
**Кому:** Ольга → стратегу
**Дата:** 2026-05-20
**В ответ на:** [_83](2026-05-20_83_strategist_housekeeping_batch_brief.md)
**Статус:** ✅ все шаги applied → 🟡 local commit, push отложен (см. шаг 4).

---

## 1. Изменения в `plans/BACKLOG.md`

Все правки — append'ы в существующие секции, ничего не переписано.

| Что | Где | Строки |
|---|---|---|
| **SEC-PWD-RESET-INVALIDATE-JWTS** (P2) | конец секции `## 🟢 P2`, перед `## ⚪ P3` | + ~47 строк |
| **UX-AUTH-FORM-FEEDBACK** (P2) | сразу за SEC-PWD-RESET-INVALIDATE-JWTS | + ~40 строк |
| **FEAT-025-INFO-DISCLOSURE-FIX** (P3) | конец секции `## ⚪ P3`, перед `## 🤔` | + ~24 строки |
| **FEAT-025-EMAIL-HTML** (P3) | сразу за INFO-DISCLOSURE-FIX | + ~31 строка |
| **INFRA-AUTH-PROD-GIT-REMOTE** (P3) | сразу за EMAIL-HTML; **сразу со статусом ✅ DONE** (closed in this batch) | + ~19 строк |
| **History entry «2026-05-20 утро»** | конец файла | + ~50 строк |

Всё по тексту из брифа `_83` без правок, кроме INFRA-AUTH-PROD-GIT-REMOTE
— в нём сразу написал статус `✅ DONE 2026-05-20 (этот же batch)` вместо
`🔴 TODO`, потому что фактически выполнил его в этом же заходе (шаг 3
ниже).

## 2. Прод git-remote update

Выполнен через одну SSH-команду:

```bash
ssh root@5.129.251.56 'cd /opt/garden-auth && git remote -v && \
  git remote set-url origin https://github.com/ligacreate/garden-auth.git && \
  git remote -v'
```

**До:**
```
origin  https://github.com/olgaskrebeyko/garden-auth (fetch)
origin  https://github.com/olgaskrebeyko/garden-auth (push)
```

**После:**
```
origin  https://github.com/ligacreate/garden-auth.git (fetch)
origin  https://github.com/ligacreate/garden-auth.git (push)
```

Случайный `git pull origin main` на проде больше не потянет stale
архивный контент.

## 3. Commit + push decision

**`.github/workflows/deploy.yml` НЕ имеет `paths-ignore`** — проверил
текст файла (никакого `paths`/`paths-ignore` в `on.push`). Это значит
любой push в `main` триггернёт `build-and-deploy` job → re-build → новые
chunk hashes → `feedback-batch-deploys-no-race` нарушен.

По шагу 4 брифа: **«Если уверенности нет (или paths-ignore не настроен)
→ сделать local commit, push отложить до утреннего батча завтра с
первыми фиксами. Безопаснее.»**

→ **Делаю local commit, push не делаю.** Завтра кодекзек возьмёт этот
commit одним батчем вместе с первыми code-фиксами.

**SHA local commit:** `daa1006` (`chore(docs/backlog): FEAT-025 verify done + 5 new tickets + housekeeping`). 9 файлов, +1818 строк.

В коммит вошло:
- `plans/BACKLOG.md` (5 тикетов + history block)
- `docs/_session/2026-05-19_80_strategist_evening_close.md` (carry-forward)
- `docs/_session/2026-05-20_81..._82b` (recon + CinC brief + CinC recon)
- `docs/_session/2026-05-20_83_strategist_housekeeping_batch_brief.md`
- `docs/_session/2026-05-20_84_codeexec_housekeeping_batch_applied.md` (этот файл)
- `docs/lessons/2026-05-19-jwt-staleness-after-admin-password-reset.md` (carry-forward)

## 4. Link на GH commit

N/A — push отложен.

## 5. Сюрпризы / отклонения

- **Никаких сюрпризов.** Бриф `_83` сработал 1:1.
- **Один мелкий decision:** INFRA-AUTH-PROD-GIT-REMOTE завёл сразу со
  статусом `✅ DONE` (а не `🔴 TODO`), так как фактически выполнил
  housekeeping в этом же батче по 🟢 в брифе. Это короче, чем заводить
  TODO и тут же закрывать.
- **paths-ignore рекомендация** — следующая микро-задача (10 строк
  yaml). Может попасть в утренний батч как preparatory:
  ```yaml
  on:
    push:
      branches: ["main"]
      paths-ignore:
        - 'docs/**'
        - 'plans/**'
        - '.business/**'
        - '**/*.md'
    workflow_dispatch:
  ```
  Это закроет `VITE-CHUNK-HASH-FLAPPING` для docs-only коммитов и сделает
  будущие housekeeping batch'и пуш'абельными без отлагательств. Я **НЕ**
  добавляю это в этом батче (вне scope `_83`), но обозначаю как
  recommendation — может пойти отдельным микро-PR с _85.

## Next step

Жду 🟢 на push (или твоё «бери в утренний батч»). После push — допишу
сюда SHA + GH commit URL.
