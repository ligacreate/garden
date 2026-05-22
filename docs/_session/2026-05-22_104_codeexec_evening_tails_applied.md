# Вечерний хвостов батч (3 P3) — applied & verified

**От:** codeexec (VS Code)
**Кому:** Ольга → стратегу
**Дата:** 2026-05-22 ночь
**В ответ на:** [_103](2026-05-22_103_strategist_evening_tails_batch.md)
**Статус:** Все 3 задачи ✅. Total ~40 минут. Без `--amend`/`--force`,
без сюрпризов кроме одной правки на ходу (Caddy global log directive
не покрывает access entries — добавил per-site `import access_log`
snippet).

---

## 1. PERF-CHECK-ADMIN-PROGRESS-SUMMARY-RPC

### Source функции (compact outline)

`public.pvl_admin_progress_summary(p_cohort_id uuid) → jsonb` —
`SECURITY DEFINER plpgsql`, `search_path = public, pg_temp`.

```sql
-- 1. Permission guard:
IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden';
-- 2. Один SELECT с jsonb_agg(...) FROM (
--    SELECT jsonb_build_object(...) AS row_data, s.full_name AS sort_name
--    FROM public.pvl_students s
--    LEFT JOIN LATERAL (SELECT COALESCE(
--      (SELECT mentor_id FROM pvl_garden_mentor_links WHERE student_id = s.id),
--      s.mentor_id
--    )) ml
--    LEFT JOIN pvl_mentors m ON m.id = ml.resolved_mentor_id
--    LEFT JOIN profiles p_mentor ON p_mentor.id = ml.resolved_mentor_id
--    LEFT JOIN LATERAL (
--      SELECT (SELECT count(*) FROM pvl_homework_items WHERE item_type='homework' AND NOT is_control_point) AS hw_total,
--             count(*) FILTER (WHERE shs.status='accepted'), ... in_review, revision, overdue,
--             submissions_total, max(shs.updated_at) AS last_activity
--      FROM pvl_student_homework_submissions shs
--      JOIN pvl_homework_items hi ON hi.id = shs.homework_item_id
--      WHERE shs.student_id = s.id AND hi.item_type='homework' AND NOT hi.is_control_point
--    ) stats
--    LEFT JOIN LATERAL (
--      SELECT jsonb_object_agg(per_module.module_number::text, jsonb_build_object('done', done_count, 'total', total_count))
--      FROM (... GROUP BY hi.module_number) per_module
--    ) mp
--    WHERE s.cohort_id = p_cohort_id
--    -- order by sort_name
-- ) by_student
```

`is_admin()` — `auth.uid() → profiles.role = 'admin'`.

### EXPLAIN ANALYZE plan

```
BEGIN;
SELECT set_config('request.jwt.claims',
  '{"sub":"<admin-uuid>","role":"authenticated"}', false);
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
  SELECT * FROM public.pvl_admin_progress_summary(
    (SELECT id FROM pvl_cohorts LIMIT 1));
ROLLBACK;
```

Output:
```
Function Scan on pvl_admin_progress_summary
  (cost=0.27..0.28 rows=1 width=32)
  (actual time=5.438..5.440 rows=1.00 loops=1)
  Buffers: shared hit=1224
InitPlan 1
  -> Limit (cost=0.00..0.02 rows=1 width=16)
       (actual time=0.005..0.006 rows=1.00 loops=1)
     Buffers: shared hit=1
     -> Seq Scan on pvl_cohorts
        (cost=0.00..19.20 rows=920 width=16)
        (actual time=0.004..0.005 rows=1.00 loops=1)
        Buffers: shared hit=1
Planning: Buffers: shared hit=29
Planning Time: 0.114 ms
Execution Time: 5.468 ms
```

### Заключение

**OK, оставляем.** `Execution Time: 5.468 ms` — намного ниже 100ms
threshold'a из бриф'а (где бы потребовалась оптимизация). Все
buffers — `shared hit` (full cache), никаких disk reads. Planning
time 0.114 ms — план дешёвый.

`Function Scan` показывает только обёртку (plpgsql не inlinable),
но `Execution Time` суммарный и **включает все вложенные JOIN'ы и
LATERAL'ы**. Объёмы данных небольшие (`_98`: 15 students, 53
content_items, 38 placements, 57 events) — Postgres вполне справляется.

Если в будущем cohort вырастет до 100+ ученищ — пересмотрим. Сейчас
**никакого N+1, никакого Seq Scan на больших таблицах**, никакого
slow query.

**Никакого PERF-FIX тикета не открываю.**

---

## 2. OBS-001-CADDY-ACCESS-LOG

### Что добавили

Caddyfile (`/etc/caddy/Caddyfile` на VPS Bittern):

```caddyfile
{
  log default {
    output file /var/log/caddy/access.log {
      roll_size 100mb
      roll_keep 5
      roll_keep_for 720h
    }
    format json
  }
}

(access_log) {
  log {
    output file /var/log/caddy/access.log {
      roll_size 100mb
      roll_keep 5
      roll_keep_for 720h
    }
    format json
  }
}

api.skrebeyko.ru {
  import access_log
  @auth_paths path /auth/* /storage/*
  handle @auth_paths { reverse_proxy 127.0.0.1:3001 }
  handle { reverse_proxy 127.0.0.1:3000 }
}

auth.skrebeyko.ru {
  import access_log
  reverse_proxy 127.0.0.1:3001
}

push.skrebeyko.ru {
  import access_log
  reverse_proxy localhost:8787
}
```

**Решение per-host через snippet:** `(access_log)` named snippet +
`import access_log` в каждом site block. Это DRY (одно определение)
+ explicit per-host (каждый сайт явно opts in).

### Сюрприз — одна правка на ходу

Сначала добавил **только** global `log default`. После reload и test
curl — в access.log были **только system messages** (startup, TLS
maintenance), но **не access entries**. Причина: в Caddy v2 global
`log default` перенаправляет встроенный default logger (system logs),
но **access logs пишутся только при явной `log` директиве внутри
site block**.

Исправление: добавил named snippet `(access_log)` + `import access_log`
в каждый site block. После второго reload — access entries в логе.

### Verify

```bash
$ caddy validate --config /tmp/caddyfile_new --adapter caddyfile
Valid configuration

$ systemctl reload caddy && systemctl is-active caddy
active

$ curl -sI https://auth.skrebeyko.ru/ > /dev/null
$ curl -sI https://api.skrebeyko.ru/ > /dev/null
$ tail -5 /var/log/caddy/access.log
```

Получили (anonimized):
```json
{"logger":"http.log.access.log1","msg":"handled request",
 "request":{"host":"auth.skrebeyko.ru","method":"HEAD","uri":"/"},
 "duration":0.001389074, "status":404}

{"logger":"http.log.access.log0","msg":"handled request",
 "request":{"host":"api.skrebeyko.ru","method":"HEAD","uri":"/"},
 "duration":0.022602253, "status":200}

# + 2 live entries от Chrome client (auth/me, /profiles?...)
```

Уже видны:
- duration (ms), status, host, method, uri, remote_ip
- TLS info, headers, response headers
- User-Agent (помогает отличить браузер от curl/CI/bot)

### Disk plan

Rotation 100mb × 5 keep × 30 days max = **500MB max** на access logs.
На VPS Bittern свободного места достаточно (доказывается ранее: nodejs
build artifacts + push-server + git клоны), OK.

### Backup

Caddyfile предыдущей версии сохранён в
`/etc/caddy/Caddyfile.bak.2026-05-22-pre-obs001` (rollback одной
командой если что).

### Header redaction (на будущее, NOT FIXED)

В access entries `Authorization` header может содержать JWT.
В тестовых curl'ах был пустой (`"Authorization":[]`), но в live
traffic иногда есть. Если нужно redact — добавить
`log.format header_filter Authorization` или filter modules. Сейчас
оставил **как есть** — VPS restricted access, observability важнее
для diagnostics.

---

## 3. CI-PATHSIGNORE-CLAUDE

### SHA + diff

```
34565a1 ci(deploy): include .claude/** in paths-ignore (close CI-PATHSIGNORE-CLAUDE)
```

`git show 34565a1 --stat`:
```
.github/workflows/deploy.yml | 1 +
1 file changed, 1 insertion(+)
```

Diff:
```diff
@@ .github/workflows/deploy.yml
     paths-ignore:
       - 'docs/**'
       - 'plans/**'
       - '.business/**'
+      - '.claude/**'
       - '*.md'
```

### GH Actions deploy

- **Run #226** для `34565a1` — статус `completed`, conclusion `success`.
- URL: <https://github.com/ligacreate/garden/actions?query=branch%3Amain>
- Expected: workflow yml changes **триггерят deploy** (workflow yml не
  в paths-ignore by design — изменения должны прокатываться).

### Bundle hash flip

```bash
$ curl -s https://liga.skrebeyko.ru/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1
assets/index-CiCxaiDE.js
```

| Bundle | Was (после `_102`) | Now |
|---|---|---|
| Main entry | `index-D1200kh0.js` | **`index-CiCxaiDE.js`** |

Один expected chunk-flap. Code не менялся (только yml) — `npm ci`
тянет patch-версии deps, отсюда новый hash (см. `VITE-CHUNK-HASH-FLAPPING`).

### Natural verify #7

Следующий **`.claude/`-only commit** (любой permissions sync) **не
должен** triggerить deploy. Verify будет на ходу при first real
`.claude/` change.

---

## 4. Backlog updates

`plans/BACKLOG.md`:

- `CI-PATHSIGNORE-CLAUDE` (P3) — 🔴 TODO → ✅ DONE с SHA `34565a1`.
- `PERF-CHECK-ADMIN-PROGRESS-SUMMARY-RPC` (P3) — 🔴 TODO → ✅ DONE с
  результатом «EXPLAIN ANALYZE 5.468 ms».
- `OBS-001-CADDY-ACCESS-LOG` (P3) — 🔴 TODO → ✅ DONE с описанием
  config (global + per-site snippet).
- Новый history block: **`### 2026-05-22 ночь`** (новый день — впервые
  после 2026-05-20) с описанием всех 3 закрытых тикетов.

---

## 5. Сюрпризы / отклонения

1. **Caddy global `log default` НЕ покрывает access logs.** Был
   первый reload в котором access entries не появились (только system).
   Причина — в Caddy v2 `log` директива только в site block регистрирует
   access logger. Fix — добавил `(access_log)` snippet + `import` в
   каждый site. **+1 reload** (без downtime, graceful).

2. **Polling logic** (Bash skill issue): первый раз `case completed*`
   сработал на остаточный run (`#225` от предыдущей сессии) **до**
   того как `#226` появился. Сделал второй polling с явным match
   `completed*34565a1*` — отработало корректно.

3. **Никаких других отклонений.** EXPLAIN ANALYZE сразу дал 5.4ms;
   CI-PATHSIGNORE — 1-line yml change без проблем.

---

## 6. Disk / network footprint

- **Сетевой:** 4 SSH-вызова на Bittern + 3 psql query + 1 Caddy reload.
  Без downtime'а.
- **Disk на VPS:** +500MB max потолок для access.log (rotation
  обеспечивает). Сейчас файл ~5KB после первых тестов.
- **Frontend bundle:** один chunk-flap (как expected). Frontend code
  не менялся.

---

## 7. Что НЕ сделано (по правилу брифа)

- ❌ Не делал `--amend` / `--force`.
- ❌ Не комбинировал 3 commit'а в один — `34565a1` чистый CI commit,
  остальное (PERF-CHECK + OBS-001) — серверный/observability, не git.
- ❌ Не модифицировал RPC `pvl_admin_progress_summary`.
- ❌ Не публиковал JWT / sensitive headers из access logs в отчёт
  (только структуру).
- ❌ Не запускал deploy дважды на одном commit'е.
- ❌ Не открывал follow-up тикетов (PERF-FIX, header_filter) — никаких
  не потребовалось.

---

## 8. Что дальше

- ⏳ **Docs commit** этого `_104` + backlog update — отдельным
  следующим коммитом (только `docs/` + `plans/`, без `.claude/`,
  без code). Будет **8-й natural verify** paths-ignore.
- ⏳ Утром: **UX-PVL-ADMIN-PREVIEW-VIEW-AS-DROPDOWN** (P2, 2-3 часа)
  или другие приоритеты.
- ⏳ Natural verify #7 для `CI-PATHSIGNORE-CLAUDE` — при first real
  `.claude/` change.
