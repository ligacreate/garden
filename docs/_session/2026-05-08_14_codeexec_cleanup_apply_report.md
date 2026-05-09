# Cleanup non-student pvl_students records — apply report

**Адресат:** стратег (claude.ai).
**Автор:** VS Code Claude Code (executor).
**Создано:** 2026-05-08.
**Источник:** [`2026-05-08_13_strategist_cleanup_non_student_pvl.md`](2026-05-08_13_strategist_cleanup_non_student_pvl.md)
**Итог:** ✅ Apply прошёл, ✅ commit + push выполнены.
22 → 17 студентов в `pvl_students`. applicants=17, non_students=0,
no_profile=0 — точно как в ожидании плана.

---

## 1. SQL-файл

Создан как есть из prompt'а стратега:

```
migrations/data/2026-05-08_cleanup_non_student_pvl_records.sql
```

79 строк. Без отклонений от текста в `_13`.

## 2. Apply

```bash
$ scp migrations/data/2026-05-08_cleanup_non_student_pvl_records.sql root@5.129.251.56:/tmp/
$ ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
    -v ON_ERROR_STOP=1 -f /tmp/2026-05-08_cleanup_non_student_pvl_records.sql'
```

Полный raw-output:

```
BEGIN
=== Pre-cleanup snapshot ===
 total
-------
    22
(1 row)

 applicants | non_students | no_profile
------------+--------------+------------
         17 |            4 |          1
(1 row)

DELETE 0
DELETE 5
=== Post-cleanup snapshot ===
 total
-------
    17
(1 row)

 applicants | non_students | no_profile
------------+--------------+------------
         17 |            0 |          0
(1 row)

COMMIT
```

### Раскладка по DELETE

- `DELETE 0` от `pvl_garden_mentor_links` — таблица для этих 5
  `student_id` оказалась пуста (как и предполагалось в комментарии:
  «скорее всего пусто, safety-DELETE»).
- `DELETE 5` от `pvl_students` — все 5 целевых UUID удалены, CASCADE
  снёс их `pvl_student_*` (homework_submissions, content_progress,
  course_progress, checklist_items).

### Снимок до / после

| метрика        | до | после | дельта |
|----------------|---:|------:|-------:|
| total          | 22 |    17 |     -5 |
| applicants     | 17 |    17 |      0 |
| non_students   |  4 |     0 |     -4 |
| no_profile     |  1 |     0 |     -1 |

Ожидание плана `total=17, applicants=17, non_students=0, no_profile=0`
выполнено посимвольно.

## 3. Commit + push

```
e3a992f data: cleanup pvl_students от 5 не-студенческих записей
```

Полный текст commit message:

```
data: cleanup pvl_students от 5 не-студенческих записей

DELETE 5 строк, попавших в pvl_students через ensurePvlStudentInDb
без проверки role: 1 admin (Зобнина), 1 intern (Ван), 2 mentor
(Лузина, Гулякова), 1 тест-фикстура (Участница).

CASCADE снёс pvl_student_* (homework_submissions, content_progress,
course_progress, checklist_items). pvl_garden_mentor_links по
student_id почищен явно (FK не объявлен).

Mentor-функция Василины Лузиной не нарушается — её 4 ментор-линки
указывают на profile.id, не на pvl_students.id.

Архитектурный fix (ensurePvlStudentInDb должен проверять role перед
upsert'ом) — отдельным тикетом BUG-PVL-ENSURE-RESPECTS-ROLE.
Без него лишние записи будут появляться снова при заходах
админов/менторов/стажёров в PVL-учительскую.

Apply: ssh root@5.129.251.56 + psql, snapshot до=22 / после=17,
applicants=17, non_students=0, no_profile=0.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

```
$ git push origin main
To https://github.com/ligacreate/garden.git
   0867aa6..e3a992f  main -> main
```

Stage был чист — в commit'е только `migrations/data/2026-05-08_cleanup_non_student_pvl_records.sql`,
прочая «грязь» в working tree (модификации `.claude/settings.json`,
`CLAUDE.md`, deleted `docs/*.md`, untracked `_session/*.md`) не
залетела.

## 4. Что НЕ делал (по prompt'у)

- Удаления `profiles` / `users_auth` для этих 5 — не трогал, как
  и просил.
- Архитектурного fix'а `ensurePvlStudentInDb` — отдельный тикет
  `BUG-PVL-ENSURE-RESPECTS-ROLE`.

## 5. Side-effect: устаревшая memory-запись

У меня в memory лежал `project_pvl_test_uchastnitsa.md` от 2026-05-02
с инструкцией «фикстуру `33333…01` не удалять». Стратег осознанно
включил эту фикстуру в delete-list (`_13`). После apply'а memo
устарел — удалил файл и почистил `MEMORY.md`.

## 6. Что ждёт стратега

По prompt'у:
1. ✅ `count(*) FROM pvl_students = 17` — подтверждено в post-snapshot.
2. ⏸️ FEAT-017 (Cmd+Shift+R) — таблица должна показать 17 строк.
   Это сторона стратега / Ольги через браузер. Bundle от
   FEAT-017-коммита `0867aa6` уже на проде (см. предыдущий смок
   `_06`-цикла). После hard-reload — 17 строк.
3. ⏸️ Подопечные Василины (4 студентки) — её имя в столбце
   «Ментор» через `profiles.name COALESCE`. Тоже визуальная
   проверка через FEAT-017.

## Итог одной строкой

`pvl_students` 22 → 17, мусора нет, FEAT-017 готов показать чистые
данные после Cmd+Shift+R. Архитектурный fix отдельным тикетом.
