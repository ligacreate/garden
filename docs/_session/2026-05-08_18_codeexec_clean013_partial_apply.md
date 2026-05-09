# Hidden-filter FEAT-017 + cleanup CLEAN-013 partial — apply report

**Адресат:** стратег (claude.ai).
**Автор:** VS Code Claude Code (executor).
**Создано:** 2026-05-08.
**Источник:** [`2026-05-08_17_strategist_clean013_partial_and_hidden_filter.md`](2026-05-08_17_strategist_clean013_partial_and_hidden_filter.md)
**Итог:** ✅ оба шага применены. Один commit `296cfb3`, пушнут.
`pvl_students 17 → 14`, frontend учитывает `hiddenGardenUserIds`.

---

## 1. Frontend — hidden-filter

### Правки

`views/AdminPanel.jsx` — 1 строка:
```diff
-{tab === 'pvl-progress' && ( <AdminPvlProgress /> )}
+{tab === 'pvl-progress' && ( <AdminPvlProgress hiddenIds={hiddenGardenUserIds} /> )}
```

`views/AdminPvlProgress.jsx` — 3 правки:
1. Сигнатура: `({ hiddenIds = [] })`.
2. `visibleRows` useMemo — фильтр **первым** (до stateFilter / сортировки),
   `hiddenIds` добавлен в deps.
3. `totals` useMemo — пересчёт по visible (без скрытых), `hiddenIds`
   в deps. Это нужно, чтобы счётчики и `GroupProgressBar` тоже
   показывали только видимых.

`hiddenGardenUserIds` уже был prop'ом `AdminPanel` ([L483](../../views/AdminPanel.jsx#L483)),
так что transitive чейн в дашборд тривиальный.

### Сравнение `String(r.student_id)` vs `r.student_id`

`hiddenGardenUserIds` (localStorage) хранит id строками. RPC
возвращает `student_id` как UUID-строку. На текущих данных формат
один и тот же, но `String(...)` страхует на случай, если PostgREST
когда-нибудь начнёт отдавать UUID без кавычек или с приведением.
Дёшево и без побочек.

## 2. Data — cleanup CLEAN-013 partial

Файл: `migrations/data/2026-05-08_cleanup_clean013_partial.sql` (96
строк, как в prompt'е без отклонений).

### Apply (raw output)

```bash
$ scp migrations/data/2026-05-08_cleanup_clean013_partial.sql root@5.129.251.56:/tmp/
$ ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
    -v ON_ERROR_STOP=1 -f /tmp/2026-05-08_cleanup_clean013_partial.sql'
```

```
BEGIN
=== Pre-cleanup ===
 pvl_students
--------------
           17
(1 row)

 profiles
----------
        3
(1 row)

INSERT 0 3        ← audit: 3 записи в pvl_audit_log
DELETE 3          ← pvl_garden_mentor_links
DELETE 3          ← pvl_students (CASCADE → pvl_student_*)
DELETE 3          ← users_auth
DELETE 3          ← profiles
=== Post-cleanup ===
 pvl_students
--------------
           14
(1 row)

 profiles_left
---------------
             0
(1 row)

COMMIT
```

### Снимок до / после

| метрика                        | до | после | дельта |
|--------------------------------|---:|------:|-------:|
| `pvl_students` total           | 17 |    14 |     -3 |
| `profiles` для 3 целевых UUID  |  3 |     0 |     -3 |
| `pvl_audit_log` (новые записи) | 0 |    +3 |     +3 |

Все 4 DELETE'а отработали по 3 строки — таблицы были консистентны
(никаких orphan'ов / отсутствующих звеньев). `INSERT 0 3` означает
«вставлено 3 строки, OID=0» — стандартный psql-вывод для INSERT'а
без RETURNING.

## 3. Commit + push

```
296cfb3 feat: hidden-filter в FEAT-017 + cleanup CLEAN-013 partial (3 user)

 .../data/2026-05-08_cleanup_clean013_partial.sql   | 96 ++++++++++++++++++++++
 views/AdminPanel.jsx                               |  2 +-
 views/AdminPvlProgress.jsx                         | 14 +++-
 3 files changed, 108 insertions(+), 4 deletions(-)
```

```
$ git push origin main
To https://github.com/ligacreate/garden.git
   377a148..296cfb3  main -> main
```

Stage был чист — только 3 целевых файла. Прочая «грязь» в working
tree (модификации `.claude/settings.json`, `CLAUDE.md`, deleted
`docs/*.md`, untracked `_session/*.md`) не залетела.

## 4. Что ждёт после deploy (~1.5 минуты от push'а)

По prompt'у:
1. ⏸️ Cmd+Shift+R на FEAT-017 → 14 строк (Настина фея ещё в списке).
2. ⏸️ В AdminPanel → users → найти `viktorovna7286@gmail.com` (Настина
   фея) и `zobyshka@gmail.com` (Настин фиксик) → «глазик» → скрыть.
3. ⏸️ Возврат в FEAT-017 → 12 строк (минус 2 скрытых).
4. ⏸️ Это и есть реальная картина Поток 1.

GroupProgressBar и badge-счётчики после клика «глазика» сразу
пересчитают `totals` — `hiddenIds` в deps `useMemo`, React триггернёт
re-render. Без F5.

## Итог одной строкой

`pvl_students 17 → 14` в БД, frontend уважает «глазик», Ольга
догребёт две тест-учётки до 12 одним кликом каждый.
