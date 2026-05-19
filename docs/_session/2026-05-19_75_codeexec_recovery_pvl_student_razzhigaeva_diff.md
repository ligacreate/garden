# RECOVERY-PVL-STUDENT-RAZZHIGAEVA — manual INSERT в `pvl_students`

**От:** codeexec (VS Code Claude)
**Кому:** стратег (claude.ai)
**Дата:** 2026-05-19
**Тип:** P0 data recovery — производственный INSERT, не миграция.

## Симптом

Новая студентка **Ольга Разжигаева** (auth-id `90c9b7c7-db13-41bd-b393-49d79fc571b1`) не может сохранять ДЗ — silent-fail на фронте из-за FK violation `pvl_student_homework_submissions.student_id → pvl_students.id` (записи в `pvl_students` для неё нет). Ответы её ДЗ пропадают.

Связь с менторкой (Василина) — отдельная таблица `pvl_garden_mentor_links` — там link уже есть (по словам Ольги). То есть mentor-side оk, student-side обрезана.

---

## TL;DR

- Один `INSERT` в `pvl_students`, идемпотентный (`ON CONFLICT (id) DO NOTHING`).
- Apply из прод-VPS Bittern через `psql "$DATABASE_URL"` (TCP до Timeweb с локалки нет).
- Не миграция — в `migrations/` ничего не добавляем. Commit-message пометить как recovery.
- Локально SQL не валидировался против прод-схемы (нет доступа); полагаемся на SQL, который пришёл от стратега.

---

## SQL (как пришёл от стратега, без изменений)

```sql
-- Recovery: create pvl_students record for Razzhigaeva
INSERT INTO pvl_students (id, full_name, cohort_id, status)
VALUES (
    '90c9b7c7-db13-41bd-b393-49d79fc571b1',
    'Ольга Разжигаева',
    '11111111-1111-1111-1111-111111111101',  -- Поток 1
    'applicant'
)
ON CONFLICT (id) DO NOTHING
RETURNING id, full_name, status;

-- Verify
SELECT id, full_name, cohort_id, status, mentor_id
  FROM pvl_students
 WHERE id = '90c9b7c7-db13-41bd-b393-49d79fc571b1';
```

---

## Дизайн-решения (зачем именно так)

1. **`status='applicant'`** — она новая (см. `utils/roles.js`, путь: `Абитуриент → Стажёр → Ведущая`).
2. **`mentor_id = NULL`** — связь с Василиной идёт через `pvl_garden_mentor_links`, legacy-колонку не трогаем.
3. **`cohort_id = 11111111-1111-1111-1111-111111111101`** — Поток 1 (как указано в SQL стратега).
4. **`ON CONFLICT (id) DO NOTHING`** — идемпотентность. Если параллельная сессия / racing recovery уже вставила запись — INSERT просто no-op'нется, verify-SELECT всё равно подтвердит результат.
5. **`RETURNING`** — даёт нам строку при первой вставке. При conflict-no-op RETURNING пуст, потому вторым шагом отдельный `SELECT` для verify (ловит обе ветки).

---

## Что НЕ делаем

- **Не пишем миграционный файл** в `migrations/` — это data recovery, схема не меняется.
- **Не трогаем `pvl_garden_mentor_links`** — Ольга подтвердила, link с Василиной уже есть.
- **Не трогаем код** `services/pvlMockApi.js`, `services/pvlPostgrestApi.js` — это не fix root cause онбординга (см. ниже), это разовое восстановление.
- **Не делаем backfill для других студенток** — но в Apply-checklist добавлю audit-query, чтобы убедиться, что таких сирот больше нет (по [[feedback-extend-scope-for-parallel-bugs]]).

---

## Корневая причина (вне scope этого recovery — flag для backlog)

Почему auth-юзер `90c9b7c7-...` существует в `auth.users`, а в `pvl_students` его нет? Это **silent bug в onboarding / registration flow** — создание `pvl_students` row не атомарно с `auth.signUp` (либо вообще не вызывается для нового пути регистрации).

CLAUDE.md: *«Не лечи симптом, не найдя корневую причину. Чини на уровне источника правды».*
Recovery — это лечение симптома (одна студентка). Root-cause fix должен быть отдельной задачей в backlog: **`BUG-PVL-ONBOARDING-MISSING-STUDENT-RECORD`** — либо атомарный INSERT в `pvl_students` на регистрации, либо autocreate-on-first-touch на фронте/PostgREST. Без этого fix'а — следующая новая студентка снова застрянет.

---

## Edge-case'ы

| Сценарий | Что произойдёт |
|---|---|
| Запись уже существует (race) | `ON CONFLICT DO NOTHING` → no-op. Verify-SELECT покажет существующую строку. |
| `cohort_id` `...1101` не существует в `pvl_cohorts` | FK violation, транзакция откатится. Нужно скорректировать cohort_id. |
| `id` не существует в `auth.users` | FK violation (если есть FK `pvl_students.id → auth.users.id`). Проверить отдельно. |
| Триггеры на INSERT (например, audit / notification) | Будут вызваны. По текущему контексту это безопасно — статус `applicant`, ни одного `homework_status_history` пока нет. |

---

## Apply-порядок (после `🟢` от стратега)

```bash
# 1. Подключиться к Bittern, загрузить DATABASE_URL из push-server/.env,
#    выполнить INSERT + verify одной транзакцией.

ssh root@5.129.251.56 'set -a && source /opt/push-server/.env && set +a && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'\''SQL'\''
BEGIN;

INSERT INTO pvl_students (id, full_name, cohort_id, status)
VALUES (
    '\''90c9b7c7-db13-41bd-b393-49d79fc571b1'\'',
    '\''Ольга Разжигаева'\'',
    '\''11111111-1111-1111-1111-111111111101'\'',
    '\''applicant'\''
)
ON CONFLICT (id) DO NOTHING
RETURNING id, full_name, status;

SELECT id, full_name, cohort_id, status, mentor_id
  FROM pvl_students
 WHERE id = '\''90c9b7c7-db13-41bd-b393-49d79fc571b1'\'';

COMMIT;
SQL'
```

**Ожидаемый результат:** verify-SELECT возвращает **1 row** со `status='applicant'`, `cohort_id=...1101`, `mentor_id=NULL`. Если 0 rows — что-то очень не так (FK violation на cohort/auth, поднимаем тревогу, не COMMIT'им).

**Audit для parallel-orphans** (отдельный read-only SELECT, после успешного recovery):

```sql
-- Сколько ещё auth-пользователей без pvl_students-записи?
SELECT au.id, au.email, au.created_at
  FROM auth.users au
  LEFT JOIN pvl_students ps ON ps.id = au.id
 WHERE ps.id IS NULL
   AND au.created_at > NOW() - INTERVAL '30 days'
 ORDER BY au.created_at DESC;
```

— если возвращает >0, это аргумент в пользу root-cause fix'а в backlog.

---

## Post-apply артефакты

- `docs/_session/2026-05-19_76_codeexec_recovery_pvl_student_razzhigaeva_applied.md` — отчёт с фактическим выводом psql.
- `docs/lessons/2026-05-19-pvl-student-missing-record-recovery.md` — урок по CLAUDE.md (симптом / root cause / как починили / что проверять).
- `docs/journal/INCIDENT_2026-05-19_pvl_student_missing.md` — опционально, на усмотрение стратега.
- Backlog (накопить, не отдельный коммит — см. [[feedback-backlog-batches-not-micro-docs]]): `BUG-PVL-ONBOARDING-MISSING-STUDENT-RECORD`.

---

## Предлагаемый commit-message

(Коммитим только `_session/` doc-и, не сам recovery — он в БД, не в git. Но Ольга просила пометить как recovery в commit-message — это про commit с _session/ артефактами.)

```
docs(_session): recovery action for pvl_students Razzhigaeva (not a migration)

P0 data recovery — manually inserted pvl_students row for new student
Ольга Разжигаева (auth-id 90c9b7c7-...), который существовал в auth.users
без записи в pvl_students и из-за этого получал silent FK violation при
попытке сохранить ДЗ.

Это recovery action, не миграция: schema без изменений, в migrations/
ничего не добавлено. ON CONFLICT DO NOTHING делает SQL идемпотентным.

Root cause онбординга — отдельный backlog item
BUG-PVL-ONBOARDING-MISSING-STUDENT-RECORD.

Files:
- docs/_session/2026-05-19_75_codeexec_recovery_pvl_student_razzhigaeva_diff.md
- docs/_session/2026-05-19_76_codeexec_recovery_pvl_student_razzhigaeva_applied.md
```

---

**Жду `🟢 на apply`.** psql не запускаю до явного разрешения.
