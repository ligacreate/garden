# BUG-PVL-ONBOARDING-MISSING-STUDENT-RECORD — recon-бриф

**От:** стратега (claude.ai)
**Кому:** codeexec (VS Code Claude Code)
**Дата:** 2026-05-22
**Зелёный:** Ольга 🟢
**Тип:** Read-only recon — собрать факты, не писать код / SQL / миграции

---

## Контекст (1 минута)

19 мая Разжигаева застряла на сохранении ДЗ ПВЛ. Корень: у неё был
`profiles` row + `users_auth` row, но **не было** `pvl_students` row.
Frontend пытался INSERT в `pvl_student_homework_submissions`, FK на
`pvl_students.id` падал silently — ответы пропадали.

Recovery: direct INSERT в `pvl_students` под `gen_user`. Лечит **одну**
запись. Следующая новая applicant'ка снова застрянет.

Backlog entry: [BUG-PVL-ONBOARDING-MISSING-STUDENT-RECORD](../../plans/BACKLOG.md)
(строка ~166), P1, TODO architectural.

Предыдущие session-доки:
- `_75_codeexec_recovery_pvl_student_razzhigaeva_diff.md`
- `_76_codeexec_recovery_pvl_student_razzhigaeva_applied.md`

---

## Цель recon

Собрать факты, чтобы Ольга смогла принять продуктовое решение между
тремя вариантами архитектурного fix'а:

1. **DB trigger** `AFTER INSERT ON profiles WHERE role IN (...)` →
   auto-INSERT в `pvl_students`
2. **garden-auth atomic flow** — Express signup endpoint создаёт обе
   записи в одной транзакции
3. **Frontend** `ensurePvlStudentInDb` — починить existing client-side
   self-heal

Ни одно решение пока не принято. Бриф **только** про recon.

---

## Что собрать (read-only)

### 1. Текущий онбординг flow — кто создаёт `profiles` row?

Найти в коде **все** точки INSERT в `profiles` и `users_auth`:

- `garden-auth/server.js` — endpoint(ы) signup / register / auth (включая
  FEAT-023, FEAT-025 password reset — если касаются)
- `views/AuthScreen.jsx` и связанные frontend-flow создания нового
  пользователя
- DB triggers на `profiles INSERT` (есть ли вообще?)

Для каждой точки ответить:
- HTTP path / функция
- Какие таблицы пишет (в какой последовательности)
- Транзакция? Single statement? Несколько REST-вызовов?
- Какие role значения может выставить (`applicant`, `intern`, `leader`,
  `guest`, etc.)
- Что происходит при ошибке середины flow (rollback? half-state?)

Команды для recon:

```bash
# поиск всех INSERT'ов в profiles
grep -rn "INSERT INTO profiles\|insert.*profiles\|from('profiles')" \
  garden-auth/ src/ views/ services/ 2>/dev/null

# триггеры на profiles (psql под gen_user)
ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
  -c "\d+ profiles"'

# триггеры в целом
ssh root@... -c "SELECT event_object_table, trigger_name, event_manipulation, action_statement \
  FROM information_schema.triggers \
  WHERE event_object_schema='public' AND event_object_table IN ('profiles','users_auth') \
  ORDER BY event_object_table, trigger_name;"
```

### 2. `ensurePvlStudentInDb` — что делает, почему не сработал

Найти определение, все вызовы, conditions.

```bash
grep -rn "ensurePvlStudentInDb" src/ views/ services/
```

Конкретные вопросы:
- Где определён (файл + line)
- Когда вызывается (login? первый mount PvlPrototypeApp? при попытке save ДЗ?)
- Какая роль/condition нужна, чтобы он fire'нулся
- Почему **не** сработал для Разжигаевой — was she not on a code path
  that calls it, или predicates не пропустили?
- Статус связанного [BUG-PVL-ENSURE-RESPECTS-ROLE] (P2) — где он в
  backlog, какой scope

### 3. Схема `pvl_students` и зависимости

```bash
ssh root@... -c "\d+ pvl_students"
ssh root@... -c "SELECT conname, conrelid::regclass AS from_table, \
                        confrelid::regclass AS to_table, \
                        pg_get_constraintdef(oid) AS def \
  FROM pg_constraint \
  WHERE contype = 'f' AND confrelid = 'public.pvl_students'::regclass;"
```

Нужно:
- Колонки, NOT NULL, defaults
- Foreign keys: что ссылается на `pvl_students.id` (для понимания, что
  ломается без этой записи — не только submissions)
- Какие колонки можно/нужно заполнить **автоматически** в trigger'е, а
  какие требуют user input (например, `goals`, `bio` — наверное nullable
  на старте; `cohort_id` — берём из `app_settings`)

### 4. `app_settings.current_cohort_id` — источник дефолта

```bash
ssh root@... -c "\d+ app_settings"
ssh root@... -c "SELECT * FROM app_settings;"
```

Нужно:
- Существует ли таблица + колонка?
- Какое сейчас значение `current_cohort_id`?
- Кто/как её обновляет (admin UI, manual psql, миграция)?
- Что если NULL — какое поведение?

### 5. Audit: сколько сейчас «осиротевших» profiles без pvl_students

```sql
SELECT p.id, p.email, p.role, p.created_at, p.cohort_id
  FROM profiles p
  LEFT JOIN pvl_students ps ON ps.profile_id = p.id  -- ⚠ уточни FK column name!
 WHERE p.role IN ('applicant','intern','leader')
   AND ps.id IS NULL
 ORDER BY p.created_at DESC;
```

⚠ Имя FK-колонки в `pvl_students` уточни через `\d+ pvl_students`
(может быть `profile_id`, `user_id`, `id` сам по себе, etc.).

Если найдены orphans помимо Суроватской — список с email + created_at +
role. Это пойдёт в backfill-часть будущего fix'а.

### 6. Связанные архитектурные тикеты

Прочитать в [BACKLOG.md](../../plans/BACKLOG.md):
- **ARCH-010** — формализовать связь pvl_students ↔ profiles (P2)
- **ARCH-012** — убрать клиентский self-heal в пользу серверного flow (P2)
- **BUG-PVL-ENSURE-RESPECTS-ROLE** (P2)

Кратко передать:
- Какой scope каждого тикета
- Пересекается ли с нашим fix'ом (могут ли быть закрыты вместе)
- Конфликтуют ли решения

### 7. Какие роли реально нуждаются в `pvl_students` row

Это продуктовый вопрос, но frontend-код может подсказать факты:

- В каких code paths требуется `pvl_students.id` (поиск usage)?
- Mentor — нужен ли ей row в `pvl_students`? (Скорее нет — она в
  `pvl_mentors`.) Confirm через grep + схему.
- Admin? Applicant? Intern? Leader? Guest?

Команда:
```bash
grep -rn "pvl_students\b" src/ views/ services/ | grep -v __tests__ | head -40
```

### 8. UPDATE-сценарии (важно для trigger-варианта)

Если admin **меняет** `profiles.role`:
- guest → applicant — нужна новая запись в `pvl_students`?
- applicant → intern — что-то менять?
- любая роль → admin — что с существующим `pvl_students` row (soft-delete? оставить?)

Это влияет на trigger condition: только `AFTER INSERT`, или ещё
`AFTER UPDATE OF role`?

---

## Формат отчёта

Файл `_108_codeexec_pvl_onboarding_recon.md` со структурой:

1. **TL;DR** — 5-8 строк: где сейчас создаётся profiles, почему НЕ создаётся pvl_students, что предлагаешь как фикс
2. **Section 1-8** в порядке выше — факты + код-ссылки + SQL-output
3. **Recommendation** — твой вариант (trigger / garden-auth / frontend)
   с обоснованием (atomicity, simplicity, future-proof, dependency на
   ARCH-010/012)
4. **Open questions для Ольги** — то, что не решается из кода и требует
   продуктового решения

⚠ **Не писать код / миграции / fix.** Только факты + рекомендация.
Implementation-бриф я напишу после того, как Ольга примет решение.

---

## Ограничения

- Read-only. Никаких INSERT/UPDATE/DELETE на проде.
- Никаких commit'ов / push'ей.
- Если нужно psql — только под `gen_user` (read-only). Если нужно
  `postgres` superuser — STOP, отчёт стратегу.
- Не публиковать в отчёте значения env-vars (DB_PASS, secrets).
- Email'ы реальных пользователей в audit-секции — OK (это рабочий
  контекст), но не публиковать **больше**, чем строго нужно для
  идентификации orphan'ов.

---

## Ожидаемый эффорт

~30-60 минут recon. Если что-то идёт сильно дольше — приостанови и
отчитайся, что заблокирован (например, не понятна структура какой-то
таблицы — спроси).
