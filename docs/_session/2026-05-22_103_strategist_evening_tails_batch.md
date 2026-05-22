# Вечерний хвостов батч (3 P3 тикета) — бриф для codeexec

**От:** стратега (claude.ai)
**Кому:** codeexec (VS Code Claude Code)
**Дата:** 2026-05-22 ночь
**Зелёный:** Ольга 🟢
**Связано:** `_98` recon (origin для OBS-001 + PERF-CHECK), `_89`/`_96`
(origin для CI-PATHSIGNORE-CLAUDE)

---

## Контекст

Закрываем 3 P3 хвоста одним батчем. Они независимы. Порядок безопасный
→ рискованный (последний triggernет frontend deploy).

**Не в этом батче:** UX-VIEW-AS-DROPDOWN (P2, 2-3 часа — отдельный
session, утром свежим темпом).

---

## Задача 1 — PERF-CHECK-ADMIN-PROGRESS-SUMMARY-RPC (P3, ~30 мин, read-only)

### Цель

Понять что внутри RPC `public.pvl_admin_progress_summary(p_cohort_id uuid)` —
быстрая ли она, есть ли там slow query или N+1 паттерн. Это **открытый
вопрос** из `_98` recon (Q2 в open questions). Чисто observability,
никаких изменений.

### Что сделать

1. Через psql под `gen_user` на проде получить **исходник** функции:
   ```sql
   SELECT pg_get_functiondef(p.oid)
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'pvl_admin_progress_summary';
   ```

2. **EXPLAIN ANALYZE** на актуальной когорте Поток 1 (есть в БД, см.
   `pvl_cohorts` table):
   ```sql
   EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
   SELECT * FROM public.pvl_admin_progress_summary(
       (SELECT id FROM pvl_cohorts ORDER BY created_at DESC LIMIT 1)
   );
   ```

3. **Анализ результата:**
   - Total execution time
   - Какие основные операции (Seq Scan, Index Scan, Hash Join, etc)
   - Есть ли N+1 (нестабильно, если в function loop через rows)
   - Используются ли индексы (или Seq Scan на больших таблицах)
   - Buffers: shared hit vs read (cache effectiveness)

4. **Сравнение с rows**: `_98` показал — pvl_students 15, pvl_homework_items
   N, pvl_homework_status_history M. Если total > 500ms — есть что
   оптимизировать. Если < 100ms — OK, оставляем.

### Что НЕ делать

- ❌ Не запускать на проде многократно (1 раз EXPLAIN — достаточно)
- ❌ Не модифицировать функцию (это recon, не fix)
- ❌ Не запускать без EXPLAIN — реальный SELECT может быть тяжёлым

### Output

В отчёт (см. конец брифа) — короткая секция:
- Исходник функции (если short ≤30 строк целиком, иначе outline + key
  blocks)
- EXPLAIN ANALYZE plan (если длинный — top operations + total time)
- Заключение: «OK, оставляем» / «есть что оптимизировать, открыть
  P3 PERF-FIX тикет с подходом X» / «требует продуктового решения»

---

## Задача 2 — OBS-001-CADDY-ACCESS-LOG (P3, ~10 мин, backend config)

### Цель

Включить access log на Caddy. Сейчас `/var/log/caddy/access.log` не
существует (`_98` recon), что не даёт debug live-сессий пользователей.

### Что сделать

1. На VPS Bittern (`5.129.251.56`) посмотреть текущий Caddyfile:
   ```bash
   ssh root@5.129.251.56 'cat /etc/caddy/Caddyfile'
   ```
   (или где он у нас — `/etc/caddy/`, `/opt/caddy/`, etc — найти
   через `systemctl status caddy | grep Loaded` или `caddy version`)

2. Найти секцию для `auth.skrebeyko.ru` (и других reverse proxy
   target'ов если есть в нашем Caddyfile). Добавить директиву `log`:

   ```caddyfile
   auth.skrebeyko.ru {
       reverse_proxy localhost:3000  # или какой там порт
       log {
           output file /var/log/caddy/access.log {
               roll_size 100mb
               roll_keep 5
               roll_keep_for 720h  # 30 days
           }
           format json
       }
   }
   ```

   Если у нас несколько хостов — добавить **global log directive**:
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
   ```

   Решение (per-host vs global) — на твоё усмотрение.

3. Проверить syntax: `caddy validate --config /etc/caddy/Caddyfile`

4. Создать директорию для логов с правильными permissions:
   ```bash
   mkdir -p /var/log/caddy
   chown caddy:caddy /var/log/caddy  # или какая роль у Caddy
   ```

5. Reload (graceful): `systemctl reload caddy` (или `caddy reload --config /etc/caddy/Caddyfile`)

6. Verify:
   ```bash
   sleep 5
   curl -sI https://auth.skrebeyko.ru/health  # или любой known endpoint
   tail -3 /var/log/caddy/access.log
   ```
   Должна появиться JSON-запись от только что сделанного curl.

### Что НЕ делать

- ❌ Не делать `systemctl restart caddy` без необходимости (reload
  graceful, restart создаёт downtime ~1-2 сек)
- ❌ Не включать verbose logging (level=DEBUG) — забьёт диск
- ❌ Не публиковать содержимое Caddyfile в отчёт (могут быть upstream
  ports / internal hostnames)

### Output

В отчёт:
- Где Caddyfile, что добавили (per-host или global)
- Output `caddy validate` (success)
- Output `tail -3 /var/log/caddy/access.log` (одна-две JSON-записи)
- Disk usage планируемый: 100mb × 5 rolls = 500mb max. OK?

---

## Задача 3 — CI-PATHSIGNORE-CLAUDE (P3, ~5 мин, frontend yml)

### Цель

Добавить `.claude/**` в paths-ignore deploy.yml. Сейчас изменения в
`.claude/settings*.json` triggerят frontend deploy (см. `_96` gap —
housekeeping deploy #224 был accidental).

### Что сделать

1. Файл `.github/workflows/deploy.yml` — найти секцию `paths-ignore`,
   добавить `.claude/**`:

   ```yaml
   on:
     push:
       branches: ["main"]
       paths-ignore:
         - 'docs/**'
         - 'plans/**'
         - '.business/**'
         - '*.md'
         - '.claude/**'           # ← новое
   ```

2. Commit + push:
   ```bash
   git add .github/workflows/deploy.yml
   git commit -m "ci(deploy): include .claude/** in paths-ignore (close CI-PATHSIGNORE-CLAUDE)

   Закрывает gap из _96 — .claude/settings*.json больше не triggerят
   frontend deploy. С этого момента docs + plans + .business + *.md +
   .claude/** свободны для частых коммитов без chunk-hash flap."
   git push origin main
   ```

3. ⚠ **Этот commit сам triggernет deploy** (потому что workflow yml
   меняется — а workflow yml не в paths-ignore). Это **expected** —
   последний "выкуп" за свободу future `.claude/` commits. Будет
   chunk-hash flap, возможно 1-2 TG алерта.

4. Verify через GH Actions UI — deploy зелёный, новый bundle hash.

5. После deploy: **natural verify #7** на любом future `.claude/`
   commit — не должен triggerить deploy. (Можно тестово сделать `chmod
   +x .claude/dummy.json && rm .claude/dummy.json` — но это
   преждевременно, верифицируем при first real `.claude/` change.)

### Что НЕ делать

- ❌ Не делать `--amend` / force-push (правило)
- ❌ Не комбинировать этот commit с другими изменениями (один deploy =
  один точечный commit для clean attribution)
- ❌ Не добавлять `.github/**` в paths-ignore (workflow changes должны
  triggerить deploy чтобы новые workflow рабочали)

### Output

В отчёт:
- SHA commit'a
- GH Actions deploy status (run number + success/fail)
- Новый bundle hash
- Подтверждение что 5 строк только в deploy.yml изменилось

---

## Backlog update (после всех 3)

В `plans/BACKLOG.md` в раздел истории добавить (NEW DAY 2026-05-22):

```markdown
### 2026-05-22 ночь (стратег + codeexec session `_103..104`)

- ✅ **PERF-CHECK-ADMIN-PROGRESS-SUMMARY-RPC** (P3 recon) — EXPLAIN
  ANALYZE на проде показал [total time]. [Заключение: OK / есть что
  оптимизировать / открыт follow-up].
- ✅ **OBS-001-CADDY-ACCESS-LOG** (P3) — включён access log на Caddy
  на VPS Bittern (`/var/log/caddy/access.log`, JSON format, rotation
  100mb × 5 × 30 days). Verified через test curl.
- ✅ **CI-PATHSIGNORE-CLAUDE** (P3) — `.claude/**` добавлен в
  paths-ignore deploy.yml. Этот commit сам triggernул deploy #N
  (expected, последний "выкуп"). Bundle: <new hash>.
```

---

## Финальный отчёт

Файл: `docs/_session/2026-05-22_104_codeexec_evening_tails_applied.md`

Структура (~80-120 строк):
1. **PERF-CHECK** — function source outline + EXPLAIN ANALYZE summary +
   заключение
2. **OBS-001** — Caddyfile diff + verify output
3. **CI-PATHSIGNORE-CLAUDE** — SHA + GH Actions link + new bundle hash
4. **Backlog updates** — line refs
5. **Сюрпризы / отклонения** (если есть)

---

## Timeline

- Задача 1: ~25 мин (psql + EXPLAIN + анализ)
- Задача 2: ~10 мин (Caddyfile edit + reload + verify)
- Задача 3: ~10 мин (yml edit + commit + push + wait deploy + verify)
- Финальный отчёт: ~5 мин
- **Итого:** ~50 мин

Если какая-то задача упрётся в неизвестное — STOP, отчитайся, не
угадывай.
