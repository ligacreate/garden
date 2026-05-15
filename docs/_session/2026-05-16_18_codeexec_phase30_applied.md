# phase30 applied + trigger smoke зелёный

**От:** VS Code Claude Code
**Кому:** стратег (claude.ai)
**Ответ на:** 🟢 в этом чате на apply phase30
**Дата:** 2026-05-16
**Статус:** ✅ **миграция применена на прод, VERIFY: 0 exempt по всем ролям, trigger smoke прошёл.**

---

## TL;DR

Phase30 в проде. UPDATE 31 (весь бэкфилл phase29 снят), trigger `trg_reset_exempt_on_role_change` создан, COMMIT атомарно. Trigger smoke под BEGIN/ROLLBACK подтвердил автосброс exempt при applicant→intern + audit-suffix в note.

**Готов к этапу 2 — commit + push + rsync + restart push-server.** Ждёт 🟢.

---

## Pre-VERIFY (baseline)

```
   role    | exempt
-----------+--------
 admin     |      3
 applicant |     15
 intern    |     13
 leader    |      0
 mentor    |      0
```

Совпадает с брифом стратега (3 + 15 + 13 = 31 = весь бэкфилл phase29). leader/mentor — 0 (правильно, они платят).

## Apply

```
$ ssh root@5.129.251.56 'psql ...' < migrations/2026-05-16_phase30_exempt_role_cleanup.sql
BEGIN
UPDATE 31
CREATE FUNCTION
DROP TRIGGER
NOTICE:  trigger "trg_reset_exempt_on_role_change" for relation "public.profiles" does not exist, skipping
CREATE TRIGGER
 ensure_garden_grants
----------------------

(1 row)

COMMIT
```

NOTICE на DROP TRIGGER IF EXISTS — корректно (это первый apply, старого триггера не было). UPDATE 31 = весь бэкфилл снят. Транзакция коммитнулась атомарно.

## Post-VERIFY

```
   role    | exempt
-----------+--------
 admin     |      0
 applicant |      0
 intern    |      0
 leader    |      0
 mentor    |      0
```

**0 exempt по всем ролям.** ✅ Список «Льготы» в админке теперь пустой — это правильное поведение (никаких индивидуальных льгот пока не назначено).

## Trigger smoke

Под `BEGIN/ROLLBACK` — изменения откачены, прод в чистом состоянии.

**Шаг 1 — пометить applicant как exempt:**
```
                  id                  |   role    | auto_pause_exempt |          note
--------------------------------------+-----------+-------------------+-------------------------
 0e978b3b-bb91-413d-8d5f-d0383b7abb65 | applicant | t                 | test before role change
```

**Шаг 2 — сменить role на intern:**
```
                  id                  |  role  | auto_pause_exempt |                                              note
--------------------------------------+--------+-------------------+------------------------------------------------------------------------------------------------
 0e978b3b-bb91-413d-8d5f-d0383b7abb65 | intern | f                 | test before role change [auto-reset on role change to intern at 2026-05-15 23:22:51.980491+03]
```

`ROLLBACK`.

**Что подтверждено:**
1. ✅ Триггер сработал (`auto_pause_exempt: t → f`).
2. ✅ Audit-suffix дописан в note (`[auto-reset on role change to intern at ...]`).
3. ✅ Существующий note сохранён (не затёрт).
4. ✅ Изменения откачены — прод в чистом состоянии.

## Что дальше

**Готов к этапу 2 — commit + push + rsync + restart push-server + frontend.** Жду 🟢.

После 🟢:
1. `git add migrations/2026-05-16_phase30_exempt_role_cleanup.sql push-server/billingLogic.mjs push-server/server.mjs push-server/billingLogic.test.mjs views/AdminPanel.jsx`
2. `git commit` (push-server + миграция + UI одним коммитом или раздельно).
3. `git push origin main`.
4. `rsync push-server/ → /opt/push-server/` (без tests/.env/lock).
5. `ssh systemctl restart push-server.service && verify active + journalctl чистый`.
6. Frontend (AdminPanel.jsx) задеплоится автоматически через GH Actions FTP.
7. Smoke на UI у Ольги — открыть админку, tab «Льготы» должен быть пустым с подсказкой; Shield на admin'е → инфо-блок «Льгота не требуется».

Diff: [`docs/_session/2026-05-16_17_codeexec_exempt_cleanup_diff.md`](2026-05-16_17_codeexec_exempt_cleanup_diff.md).
