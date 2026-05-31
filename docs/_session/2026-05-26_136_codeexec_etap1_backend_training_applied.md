# Сессия 1 Этапа 1 — Backend: applied + push

**От:** codeexec → стратегу через Ольгу
**Дата:** 2026-05-26
**Скоп:** §3 ТЗ [_134](2026-05-26_134_strategist_tz_etap1_training_feedback.md) — Backend (миграция + RLS + GRANT + recover_grants.sh)
**Связано:** [_135 diff-on-review](2026-05-26_135_codeexec_etap1_backend_training_dryrun.md)
**Статус:** ✅ applied, ✅ committed `d65969e`, ✅ pushed `origin/main`

---

## 1. TL;DR

- `phase38` миграция применена на prod (Bittern), все 7 verify прошли.
- `recover_grants.sh` baseline обновлён `158 → 166`, ручной запуск exit=0.
- Commit `d65969e` запушен в `origin/main`.
- Бэкенд для Этапа 1 готов — можно стартовать Сессию 2 (Frontend backbone).

---

## 2. Хронология этой сессии

| Шаг | Артефакт | Гейт |
|---|---|---|
| 1. Recon helpers + тестовые ID на проде | helpers OK, акторы выбраны | — |
| 2. Создание миграции `database/pvl/migrations/2026-05-26_phase38_pvl_training_breakfasts.sql` | 2 таблицы + helper + trigger + 12 RLS + GRANT + `CREATE OR REPLACE ensure_garden_grants()` | — |
| 3. Dry-run на проде `BEGIN; <migration>; <27 ассертов>; ROLLBACK;` | 27/27 PASS, post-rollback verify clean | — |
| 4. Diff-on-review отчёт [_135](2026-05-26_135_codeexec_etap1_backend_training_dryrun.md) | `pvl_training_tables=0` после rollback | 🟢 стратега → apply |
| 5. Apply на prod + V1-V7 verify (см. §3 ниже) | AUTH_CNT=166, web_anon=4 | — |
| 6. Patch `/opt/garden-monitor/recover_grants.sh` 158→166 + ручной run | exit=0, baseline 166/4 | — |
| 7. Commit `d65969e` | hash | 🟢 стратега → push |
| 8. Push в `origin/main` | `9a6192f..d65969e` | — |
| 9. Этот отчёт | — | — |

---

## 3. Post-commit verify (V1–V7) — на проде после COMMIT

```
=== V1: таблицы созданы ===
       tablename
-----------------------
 pvl_training_feedback
 pvl_training_sessions
(2 rows)

=== V2: RLS включено + политики ===
                   table_name                   | rls_enabled | policies_count
------------------------------------------------+-------------+----------------
 pvl_training_feedback                          | t           |              6
 pvl_training_feedback_pkey                     | f           |              0
 pvl_training_feedback_session_id_author_id_key | f           |              0
 pvl_training_sessions                          | t           |              6
 pvl_training_sessions_pkey                     | f           |              0
(5 rows)
-- ✅ обе таблицы rls_on=t, pol_cnt=6. pkey/unique-key индексы — нормальный
-- листинг pg_class, не таблицы.

=== V3: is_pvl_cohort_peer — функция создана, SECURITY DEFINER ===
      proname       | is_definer |        args         | returns
--------------------+------------+---------------------+---------
 is_pvl_cohort_peer | t          | target_student uuid | boolean
(1 row)

=== V4: triggers ===
             trigger_name             | event_manipulation |  event_object_table   | action_timing
--------------------------------------+--------------------+-----------------------+---------------
 trg_pvl_training_feedback_updated_at | UPDATE             | pvl_training_feedback | BEFORE
 trg_pvl_training_sessions_limit      | INSERT             | pvl_training_sessions | BEFORE
 trg_pvl_training_sessions_updated_at | UPDATE             | pvl_training_sessions | BEFORE
(3 rows)

=== V5: authenticated grant-rows (ожидание: 166) ===
 authenticated_grants
----------------------
                  166
(1 row)
-- ✅ 41 таблиц × 4 priv + pvl_audit_log × 2 = 166

=== V6: web_anon grant-rows (ожидание: 4) ===
 web_anon_grants
-----------------
               4
(1 row)

=== V7: EXECUTE grants на is_pvl_cohort_peer ===
 auth_has_exec_cohort_peer
---------------------------
 t
(1 row)
```

---

## 4. recover_grants.sh — patched + verified

### 4.1 Diff

```diff
--- /opt/garden-monitor/recover_grants.sh.bak_phase38
+++ /opt/garden-monitor/recover_grants.sh
@@ -59 +59 @@
-log "after recovery: authenticated=$AUTH_CNT web_anon=$ANON_CNT (expected 158/4)"
+log "after recovery: authenticated=$AUTH_CNT web_anon=$ANON_CNT (expected 166/4)"
@@ -61 +61 @@
-if [[ "$AUTH_CNT" -ne 158 || "$ANON_CNT" -ne 4 ]]; then
+if [[ "$AUTH_CNT" -ne 166 || "$ANON_CNT" -ne 4 ]]; then
@@ -66 +66 @@
-log "OK: grants restored to baseline (158/4)"
+log "OK: grants restored to baseline (166/4)"
```

Бэкап: `/opt/garden-monitor/recover_grants.sh.bak_phase38` (на Bittern).

### 4.2 Ручной запуск

```
[2026-05-26T16:55:53Z] recover: calling ensure_garden_grants()
[2026-05-26T16:55:53Z] recover: after recovery: authenticated=166 web_anon=4 (expected 166/4)
[2026-05-26T16:55:53Z] recover: OK: grants restored to baseline (166/4)
exit=0
```

Defense-in-depth для daily Timeweb wipe (13:08 UTC) работает.

---

## 5. RLS smoke результаты (5 ролей × sessions + feedback)

Полные выкладки в [_135 §3.3-3.7](2026-05-26_135_codeexec_etap1_backend_training_dryrun.md). Сводно:

### 5.1 Тестовые акторы

| Роль | Имя | id |
|---|---|---|
| admin | Ольга Скребейко | `85dbefda-…` |
| mentor | Юлия Габрух | `492e5d3d-…` (менторит Ирину, Диану, Дашу, Анжелику) |
| applicant (owner) | Ирина Петруня | `35019374-…` cohort `…101` |
| applicant (peer) | Ольга Разжигаева | `90c9b7c7-…` cohort `…101` |
| applicant (peer-2) | Дарья Зотова | `8ed14494-…` cohort `…101` |
| intern (negative) | Анастасия Ван | `4250ffac-…` cohort `…101`, role='intern' |

### 5.2 pvl_training_sessions SELECT (3 засеянных строки: 2 Ирины + 1 Ольги)

| Тест | Acceptance criterion §3.3 | Результат |
|---|---|---|
| D1 web_anon | «web_anon: 401/403 на pvl_training_*» | ✅ PASS — permission denied (GRANT-уровень) |
| D2 Ирина-owner | menti видит свои + peer-сессии когорты | ✅ 3 (2 own + 1 peer Ольги) |
| D3 Ольга-peer | menti видит peer-сессии когорты с фильтром applicant | ✅ 3 (1 own + 2 Ирины) |
| D4 Юля-mentor | ментор видит сессии своих менти через is_mentor_for | ✅ 2 (только Ирина), 0 Ольги |
| D5 admin | admin видит всё | ✅ 3 |
| D6 peer-фильтр applicant vs intern | role='applicant' отсекает интернов | ✅ Ольга=t, Анастасия=f |

### 5.3 pvl_training_feedback SELECT (2 засеянных отзыва от Ольги + Дарьи на сессию Ирины)

| Тест | Acceptance | Результат |
|---|---|---|
| E1 Ольга-peer (author) — confidentiality | ТЗ §2 #4: peer видит только свой отзыв | ✅ 1 own, 0 чужих |
| E2 Ирина-owner | владелец сессии видит все отзывы | ✅ 2 |
| E3 Юля-mentor | ментор видит отзывы на сессии своих менти | ✅ 2 |
| E4 admin | admin видит всё | ✅ 2 |
| E5 web_anon | default deny | ✅ permission denied |

### 5.4 Write policies (insert/update/delete)

| Тест | Логика | Результат |
|---|---|---|
| F1 peer-Ольга INSERT отзыв | insert_peer (author=me AND session.student is cohort peer) | ✅ PASS |
| F2 impersonation (author_id чужой) | WITH CHECK author_id=auth.uid() | ✅ PASS — «row violates row-level security policy» |
| F3 peer-Ольга UPDATE свой | update_own_or_admin (без 48ч — ТЗ §2 #5) | ✅ rows=2 |
| F4 applicant DELETE feedback | delete_admin → admin only | ✅ PASS — rows=0 |
| F5 applicant DELETE session | delete_admin | ✅ PASS — rows=0 |

### 5.5 Trigger constraint

| Тест | Результат |
|---|---|
| 2 сессии на менти Ирину | ✅ OK |
| 3-я сессия | ✅ PASS — `RAISE EXCEPTION 'Лимит тренировочных завтраков превышен (максимум 2 на менти)'` |

---

## 6. Apply commit

```
d65969e feat(pvl): phase38 — pvl_training_sessions + pvl_training_feedback
```

Файлы:
- `database/pvl/migrations/2026-05-26_phase38_pvl_training_breakfasts.sql` (+602 строки)
- `docs/_session/2026-05-26_135_codeexec_etap1_backend_training_dryrun.md`

Push: `9a6192f..d65969e main -> main` (origin/main = ligacreate/garden).

---

## 7. Acceptance §3.3 ТЗ — полный чек-лист

| ТЗ §3.3 acceptance | Где доказательство | Результат |
|---|---|---|
| Под `authenticated` menti: видит свои + peer-сессии когорты с фильтром applicant, НЕ видит сессии других когорт | §5.2 D2, D6, §5.3 E1 | ✅ |
| Под `authenticated` mentor: видит сессии своих menti через `is_mentor_for()` | §5.2 D4, §5.3 E3 | ✅ |
| Под `authenticated` admin: видит всё | §5.2 D5, §5.3 E4 | ✅ |
| Под `web_anon`: 401/403 на все pvl_training_* (default deny) | §5.2 D1, §5.3 E5 | ✅ |

---

## 8. Diff vs §3 ТЗ (что я расширил)

1. **Миграция переопределяет `ensure_garden_grants()`** (а не только `SELECT public.ensure_garden_grants();`). Иначе после следующего daily Timeweb wipe `recover_grants.sh → ensure_garden_grants()` НЕ восстановит GRANT на новые таблицы → 401 для applicant'ов. Паттерн SEC-014 phase 23 (memory `[[feedback_extend_scope_for_parallel_bugs]]`).
2. **+1 GRANT EXECUTE** `is_pvl_cohort_peer(uuid) TO authenticated` явно в миграции и в Part 4 функции — без этого RLS под applicant даст false на любом select через `is_pvl_cohort_peer`.
3. **recover_grants.sh baseline 158 → 166** — следствие #1: 39+2=41 таблиц × 4 priv = 164 + audit_log × 2 = 166.

Эти 3 пункта были подсвечены стратегу в [_135 §5](2026-05-26_135_codeexec_etap1_backend_training_dryrun.md), стратег дал 🟢.

---

## 9. Что НЕ сделано в этой сессии (намеренно, по ТЗ §5)

- Frontend файлы (5 новых + 2 правки) — Сессии 2-3.
- `LeaderPageView` не трогали (ТЗ §7 явно).
- Никаких других pvl_* таблиц.

## 10. Точки внимания для Сессии 2 (Frontend backbone)

- `services/pvlPostgrestApi.js` — 5 новых методов (`listMyCohortPeers`, `listTrainingSessions`, `createTrainingSession`, `deleteTrainingSession`, `listTrainingFeedback`, `upsertTrainingFeedback`). Все таблицы и RLS готовы.
- При INSERT через PostgREST лимит 2 даст `400 Bad Request` с message от RAISE EXCEPTION — фронт обработать как toast «Лимит достигнут».
- `upsertTrainingFeedback` через `Prefer: resolution=merge-duplicates` — UNIQUE (session_id, author_id) уже в схеме.
- Для peer-confidentiality (ТЗ §2 #4): PostgREST вернёт только `author_id=auth.uid()` строки автоматически — фильтрацию на клиенте делать НЕ нужно, RLS уже отсекает.

## 11. Pending / backlog (не блокирует Сессию 2)

- Накопленный долг untracked `docs/_session/*` (10 файлов) — отдельный chore commit когда стратег скажет. См. memory `[[feedback_session_docs_must_be_committed]]` — правило существует, но я не расширял scope текущего apply-коммита.
- Untracked `dist/` — это build артефакты, не должны лежать рядом. Возможно нужен `.gitignore` review (не в scope этой сессии).

---

## 12. Готовность

✅ Backend Этапа 1 готов. Стратег может писать ТЗ Сессии 2 (Frontend backbone — 5 API-методов + маршруты + sidebar + скелеты Views).
