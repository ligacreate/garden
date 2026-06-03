# ЭТАП A (Backend) — phase44: менторский отзыв на тренировочном завтраке — DRYRUN

**От:** codeexec (VS Code) → стратегу/Ольге на ревью (🟢 перед apply)
**Дата:** 2026-06-03
**Recon-основа:** [2026-06-03_180_codeexec_recon_mentor_training_feedback.md](2026-06-03_180_codeexec_recon_mentor_training_feedback.md)
**ТЗ Этапа 1:** [2026-05-26_134_strategist_tz_etap1_training_feedback.md](2026-05-26_134_strategist_tz_etap1_training_feedback.md)
**Миграция:** `database/pvl/migrations/2026-06-03_phase44_pvl_training_feedback_mentor_insert.sql`
**Статус:** DRYRUN выполнен (BEGIN…ROLLBACK, ничего не закоммичено). **Apply — после 🟢.**

---

## Что меняем

Одна новая PERMISSIVE INSERT-политика на `pvl_training_feedback` — зеркало peer-политики, но через
`is_mentor_for(s.student_id)` вместо `is_pvl_cohort_peer()`. PERMISSIVE-политики OR'ятся → INSERT
проходит, если автор **peer** ИЛИ **ментор** менти этой сессии.

```sql
DROP POLICY IF EXISTS pvl_training_feedback_insert_mentor ON pvl_training_feedback;

CREATE POLICY pvl_training_feedback_insert_mentor
  ON pvl_training_feedback FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM pvl_training_sessions s
      WHERE s.id = pvl_training_feedback.session_id
        AND is_mentor_for(s.student_id)
    )
  );

SELECT public.ensure_garden_grants();   -- конвенция: NOTIFY pgrst 'reload schema'
```

## Что НЕ трогаем (и почему)

- **UNIQUE(session_id, author_id)** — уже есть; менторская строка сосуществует с peer-строками (разные `author_id`).
- **UPDATE-политика** `pvl_training_feedback_update_own_or_admin` — уже author-generic
  (`author_id = auth.uid() OR is_admin()`) → ментор правит свой отзыв «бесплатно» после INSERT.
  **Зеркало НЕ нужно** (ТЗ-запрос про «зеркаль UPDATE» — проверено, не требуется).
- **SELECT** — ментор уже видит отзывы своих менти (`is_mentor_for`, phase38). Владелец-менти увидит
  менторский отзыв (owner-sees-all); чужие peer — нет (peer видит только свой).
- **ensure_garden_grants() / recover_grants.sh** — новых таблиц/грантов нет, GRANT не добавляем.
  `ensure_garden_grants()` зовём лишь как конвенцию (reload schema).
- **RESTRICTIVE guard** `*_active_access_guard_write` (`has_platform_access`) AND'ится поверх — ментор
  обязан иметь platform access (у Юли `has_platform_access = t`).

## Механика проверки (как тестировали RLS под gen_user)

- `auth.uid()` = `coalesce(current_setting('request.jwt.claim.sub'), claims->>'sub')::uuid`.
- Импертонизация: `SET LOCAL request.jwt.claim.sub = '<uuid>'; SET LOCAL ROLE authenticated;`
  (`gen_user` владеет таблицей → RLS на него не действует, поэтому обязателен `SET ROLE`).
- `authenticated` имеет EXECUTE на `auth.uid()` (но не USAGE на схему `auth`) — прямой
  `SELECT auth.uid()` под authenticated падает, **но в контексте RLS-политики `auth.uid()`
  вычисляется штатно** (доказано: реальный peer-INSERT под authenticated проходит). Поэтому в
  dryrun исход INSERT печатается строкой через `pg_temp.try_insert()` (RLS-отказ → текст, а не stderr).

## Тестовые акторы (реальные данные Поток 1)

| Роль | Имя | id |
|---|---|---|
| Ментор Даши | Юля Габрух | `492e5d3d-81c7-41d8-8cef-5a603e1389e6` |
| Менти (владелец сессии) | Дарья Старостина | `147aea39-d127-4e31-a66d-dbd47e1c84be` |
| Сессия Даши | «Карта моего отдыха» | `f1237526-0d53-4b9a-8286-fb87b032cfee` |
| Чужой ментор (НЕ Даши) | «Настин фиксик» | `1b10d2ef-8504-4778-9b7b-5b04b24f8751` |
| Peer Поток 1 | Елена Курдюкова | `5aa62776-6229-4270-9886-33316ff035c6` |

## Результаты DRYRUN (BEGIN…ROLLBACK)

```
BASELINE INSERT-политики: { pvl_training_feedback_insert_peer }
ПОСЛЕ apply:              { pvl_training_feedback_insert_mentor, pvl_training_feedback_insert_peer }

TEST 1 [POS]  Юля (ментор Даши)            is_mentor=t  is_peer=f  ->  ALLOWED  ✅
TEST 2 [NEG]  чужой ментор «Настин фиксик»  is_mentor=f  is_peer=f  ->  DENIED (RLS)  ✅
TEST 3 [CTRL] peer Курдюкова               is_mentor=f  is_peer=t  ->  ALLOWED (peer-путь цел)  ✅
TEST 4 [NEG]  участница, peer-политика снята (остался только mentor-путь) -> DENIED (RLS)  ✅

POST-CHECK после ROLLBACK: { pvl_training_feedback_insert_peer }  (ничего не осталось)
```

Вывод: новая политика пускает ментора на сессии СВОИХ менти, отклоняет чужого ментора и участницу
по mentor-пути, peer-путь не сломан. Всё откатано — в БД изменений нет.

## Apply (после 🟢)

```
scp database/pvl/migrations/2026-06-03_phase44_pvl_training_feedback_mentor_insert.sql root@5.129.251.56:/tmp/
ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 -f /tmp/2026-06-03_phase44_pvl_training_feedback_mentor_insert.sql'
```
VERIFY-блок миграции напечатает обе INSERT-политики (ожидание: insert_peer + insert_mentor).

---

**Дисциплина:** dryrun A (этот файл) → 🟢 → apply → ЭТАП B (frontend diff) → 🟢 → smoke → 🟢 commit → 🟢 push.
