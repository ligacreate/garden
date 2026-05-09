# Lesson 2026-05-08 — записать урок BUG-PVL-COHORT-NULL-OVERWRITE

**Адресат:** VS Code Claude Code (executor).
**Автор:** стратег (claude.ai).
**Создано:** 2026-05-08.

## Задача

Записать lesson по BUG-PVL-COHORT-NULL-OVERWRITE в формате других
файлов в `docs/lessons/`.

Путь: `docs/lessons/2026-05-08-pvl-cohort-null-overwrite.md`.

Структура — как в существующих lesson'ах
(`docs/lessons/2026-05-04-postgrest-role-switch-anon-clients.md`,
`2026-05-05-timeweb-revokes-grants-after-ddl.md` и т.п.):

- YAML frontmatter (title, type=lesson, created, related_files,
  related_lessons если применимо)
- Симптом
- Корневой механизм
- Sample код / SQL
- Recovery / fix
- Профилактика
- Связанные документы

## Содержание (key points)

### Симптом

При визите админа в PVL-учительскую через mock-domain ensure-loop
делал upsert `pvl_students` с payload `{cohort_id: null, mentor_id: null}`,
PostgREST с `Prefer: resolution=merge-duplicates` транслировал в
`ON CONFLICT (id) DO UPDATE SET cohort_id=NULL, mentor_id=NULL` — все
существующие значения cohort_id для 22 студентов обнулялись. После
backfill (UPDATE … SET cohort_id='11111111-…-101') — следующий визит
админа стирал backfill обратно к NULL.

### Корневой механизм

PostgREST `resolution=merge-duplicates` транслируется в стандартный PG
`INSERT … ON CONFLICT DO UPDATE SET col = EXCLUDED.col` для **каждой
переданной в payload колонки**. Если поле передано как `null`, оно и
будет записано как `null`. Поле, **отсутствующее** в payload, в
SET-клозу не попадает — существующее значение сохраняется.

→ Хардкод `cohort_id: null` (наряду с прямым отсутствием) семантически
**не эквивалентен** «не трогать поле». Это явный INSERT/UPDATE с null.

### Fix

Гибрид: резолвить значение из source (например, через
`seedCohortIdToSqlUuid(profile.cohortId)` + `uuidOrNull(profile.mentorId)`),
**передавать поле в payload только если резолвинг даёт валидное значение**.
Иначе опускать ключ — merge-duplicates сохранит существующее.

```js
const resolvedCohortId = profile?.cohortId
    ? seedCohortIdToSqlUuid(profile.cohortId)
    : null;
const payload = { id, full_name, status: 'active' };
if (resolvedCohortId) payload.cohort_id = resolvedCohortId;
await pvlPostgrestApi.upsertPvlStudent(payload);
```

### Профилактика

- При работе с upsert через PostgREST `merge-duplicates` — НИКОГДА
  не передавать `null` в payload, если намерение «не трогать».
  Используй conditional spread / `if (x) payload.x = x`.
- Если нужно явно записать NULL — это намеренное действие, должно быть
  задокументировано в коде (комментарий «//намеренно обнуляем
  существующее значение», ссылка на тикет).
- При обнаружении подобного паттерна — recon: backfill регрессирует
  ли на каждом cycle?
- Code review checklist: в любом upsert payload через PostgREST
  проверять, что поля `null` намеренные.

### Sample-код

Полный diff из commit'а `7c28ed3` —
`services/pvlMockApi.js` `ensurePvlStudentInDb`.

### Связанные

- Рекон: `docs/_session/2026-05-07_09_codeexec_cohort_id_recon.md`
- План: `docs/_session/2026-05-08_08_codeexec_bug_pvl_cohort_plan.md`
- Apply: commit `7c28ed3`
- Smoke: `docs/_session/2026-05-08_06...` нет, smoke сделал стратег
  через psql + Claude in Chrome 2026-05-08
- Связано с ARCH-012 — выкорчёвывание ensure-loop с клиента (анти-
  паттерн admin-only RLS на client-side ensure)

## После записи

Один commit:

```
docs: lesson 2026-05-08 — pvl cohort null overwrite через merge-duplicates

Пишет урок про PostgREST merge-duplicates и null payload.
Связан с commit 7c28ed3 (fix BUG-PVL-COHORT-NULL-OVERWRITE).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Push сразу (это документация, не код / не миграция, push = commit
для lesson'ов по конвенции). Стратегу можно вернуть `git log -1
--oneline` для подтверждения.
