# tatrusi@mail.ru — pre-delete audit (Шаг 1)

**От:** codeexec (VS Code Claude Code)
**Кому:** стратега (claude.ai) → Ольга
**Дата:** 2026-05-23
**В ответ на:** «оставляем backfill 13 interns + удаляем tatrusi совсем»
**Тип:** Шаг 1 — read-only audit. **Без apply / commit / push / SQL DELETE.** Жду 🟢 на Шаг 2 (diff v3 + delete-SQL).

---

## TL;DR

- 👤 **tatrusi@mail.ru = Таня Волошанина**, applicant, paused_manual, suspended. id `2234ead5-93e9-43cb-b988-c98fc97db8b7`. Без `name`-фамилии в БД (только «Таня Волошанина» в поле `name`), без `city`, dob 1980-03-13, `join_date` пусто.
- 🧹 **Чистый orphan.** Проверила 22 потенциальных таблицы (10 FK на profiles + 12 без FK или text-uuid) — **во всех 0 rows под её id**. Единственная связь — `users_auth` (1 row, auth-аккаунт; same id, нет FK).
- ✅ **RPC `admin_delete_user_full(uuid)` справится** — она уже умеет всю последовательность DELETE'ов, audit-лог, и привязана к админ-кнопке в UI ([AdminPanel.jsx:1305](../../views/AdminPanel.jsx#L1305) → [dataService.js:1672](../../services/dataService.js#L1672)).
- 🔧 **Рекомендуемый метод delete** — через UI (Ольга жмёт «удалить» в админ-панели). Альтернатива — direct SQL под `gen_user` (теряем audit-log потому что `auth.uid()` = NULL под gen_user → is_admin() = false → RPC внутри psql не отработает).

---

## 1. Профиль tatrusi

```sql
SELECT id, name, email, role, access_status, status, city, dob, join_date
  FROM profiles WHERE email='tatrusi@mail.ru';
```

| поле | значение |
|------|----------|
| id | `2234ead5-93e9-43cb-b988-c98fc97db8b7` |
| name | `Таня Волошанина` |
| email | `tatrusi@mail.ru` |
| role | `applicant` |
| access_status | `paused_manual` |
| status | `suspended` |
| city | _(пусто)_ |
| dob | 1980-03-13 |
| join_date | _(пусто)_ |

**Аккаунт:** active в `users_auth` (1 row под same id). Сейчас не может войти (status=suspended из profiles синхронизируется → users_auth.status). Если зайти попытается — bridge-trigger через access_status='paused_manual' → 403.

---

## 2. FK-карта от `profiles.id`

10 FK ссылаются на `profiles(id)`. Из них 2 без CASCADE:

| from_table | column | on_delete | tatrusi rows |
|------------|--------|-----------|---------------|
| course_progress | user_id | **CASCADE** | 0 |
| goals | user_id | **CASCADE** | 0 |
| **meetings** | user_id | ⚠ **NO CASCADE** (default NO ACTION) | 0 |
| news | author_id | SET NULL | 0 |
| notifications | user_id | **CASCADE** | 0 |
| practices | user_id | **CASCADE** | 0 |
| scenarios | user_id | SET NULL | 0 |
| subscriptions | user_id | **CASCADE** | 0 |
| tg_link_codes | profile_id | **CASCADE** | 0 |
| tg_notifications_queue | recipient_profile_id | **CASCADE** | 0 |

⚠ `meetings.user_id` НЕ CASCADE — если бы у tatrusi была хоть одна встреча, прямой `DELETE FROM profiles` упал бы с FK violation. RPC `admin_delete_user_full` явно DELETE'ит meetings первым шагом — но т.к. их 0, не критично.

---

## 3. Связи БЕЗ FK (orphan-риск)

12 таблиц могут хранить tatrusi.id в uuid/text-колонке без FK-связи:

| table | column | tatrusi rows |
|-------|--------|---------------|
| push_subscriptions | user_id | 0 |
| messages | author_id | 0 |
| pvl_checklist_items | student_id | 0 |
| pvl_direct_messages | author_user_id / mentor_id / student_id | 0 |
| pvl_garden_mentor_links | mentor_id / student_id | 0 |
| pvl_student_certification_scores | student_id | 0 |
| pvl_student_content_progress | student_id | 0 |
| pvl_student_course_points | student_id | 0 |
| pvl_student_course_progress | student_id | 0 |
| pvl_student_disputes | student_id | 0 |
| pvl_student_homework_submissions | student_id | 0 |
| pvl_students | id (orphan) / mentor_id | 0 / 0 |

И text-uuid колонки:

| table | column | tatrusi rows |
|-------|--------|---------------|
| pvl_audit_log | actor_user_id | 0 |
| pvl_audit_log | entity_id (entity_type='profile') | 0 |
| pvl_calendar_events | created_by | 0 |
| pvl_content_items | created_by | 0 |
| pvl_faq_items | created_by | 0 |
| pvl_notifications | user_id | 0 |
| events | (jsonb-скан по любому полю) | 0 |
| billing_webhook_logs | (jsonb-скан) | 0 |

**Итог: 0 связанных rows во всех 22 проверенных таблицах.** Tatrusi реально только зарегалась — никаких следов активности.

---

## 4. RPC `admin_delete_user_full(uuid)` — что делает

Существует с phase24, SECURITY DEFINER. Тело ([migrations/2026-05-07_phase24_admin_delete_user_rpc.sql](../../migrations/2026-05-07_phase24_admin_delete_user_rpc.sql)):

```sql
1. is_admin() check                                  → raises if not admin
2. INSERT pvl_audit_log (action='admin_delete_user_full', actor, target)
3. DELETE FROM meetings  WHERE user_id = p_user_id   (NO CASCADE handling)
4. DELETE FROM pvl_direct_messages WHERE ...         (нет FK)
5. DELETE FROM pvl_garden_mentor_links WHERE ...     (нет FK)
6. DELETE FROM pvl_students WHERE id = p_user_id     (CASCADE на 7 PVL-таблиц)
7. DELETE FROM users_auth WHERE id = p_user_id       (нет FK)
8. DELETE FROM profiles WHERE id = p_user_id         (CASCADE на course_progress)
```

Для tatrusi:
- Шаги 3, 4, 5, 6 — DELETE'ят 0 rows (всё чисто). Audit-log получит запись о действии.
- Шаг 7 — DELETE 1 row (users_auth).
- Шаг 8 — DELETE 1 row (profiles). CASCADE отработает по 10 FK, все по 0 rows.

**Результат:** 2 удалённые строки (users_auth + profiles) + 1 audit-log запись.

⚠ **Нюанс:** RPC внутри проверяет `is_admin()`, которая использует `auth.uid()` (caller JWT). При вызове через PostgREST под admin'ом — auth.uid() возвращает admin id → проходит. **При вызове напрямую через psql под gen_user** — auth.uid() = NULL → is_admin() = false → RAISE EXCEPTION. То есть нельзя просто `psql -c "SELECT admin_delete_user_full('...')"`.

---

## 5. Методы удаления (для Шага 2)

### Метод A (рекомендую) — через админ-UI

[AdminPanel.jsx:1298-1308](../../views/AdminPanel.jsx#L1298) — кнопка `🗑️ Удалить` в правом столбце user-row → confirm dialog → `api.deleteUser(u.id)` → POST `/rpc/admin_delete_user_full` с body `{p_user_id: '...'}` под JWT Ольги (admin) → RPC отрабатывает целиком с audit-log.

**Шаги для Ольги:**
1. Залогиниться как admin на https://liga.skrebeyko.ru/
2. Перейти в `/admin` → вкладка «Пользователи».
3. Найти `tatrusi@mail.ru` (Таня Волошанина).
4. Нажать 🗑️ → подтвердить.
5. Verify в SQL: `SELECT COUNT(*) FROM profiles WHERE email='tatrusi@mail.ru'` → должно быть 0.

**Плюсы:** audit-log, atomicity, без psql-командной строки.
**Минусы:** нужен Ольгин клик в UI.

### Метод B — direct SQL под gen_user (если без UI)

`admin_delete_user_full` через psql не сработает (см. § 4 нюанс). Можно либо:

**B1 — обойти is_admin() check через SECURITY DEFINER wrapper:**
Слишком сложно для одного удаления, не предлагаю.

**B2 — прямой DELETE последовательностью:**
```sql
BEGIN;
-- Аудит руками (опционально — для consistency с RPC):
INSERT INTO public.pvl_audit_log (id, actor_user_id, action, entity_type, entity_id, payload, created_at)
VALUES (
    gen_random_uuid()::text,
    'manual_psql_gen_user',  -- маркер что не через RPC
    'admin_delete_user_full_manual',
    'profile',
    '2234ead5-93e9-43cb-b988-c98fc97db8b7',
    jsonb_build_object(
        'summary', 'Manual cleanup of accidental registration (tatrusi@mail.ru, Таня Волошанина)',
        'reason',  'phase37 backfill scope cleanup — tatrusi не из ПВЛ потока, случайный залёт',
        'session', '_114'
    ),
    now()
);

-- В порядке RPC (для tatrusi всё кроме последних двух — no-op):
DELETE FROM public.meetings                WHERE user_id = '2234ead5-93e9-43cb-b988-c98fc97db8b7';
DELETE FROM public.pvl_direct_messages
 WHERE author_user_id = '2234ead5-93e9-43cb-b988-c98fc97db8b7'
    OR mentor_id      = '2234ead5-93e9-43cb-b988-c98fc97db8b7'
    OR student_id     = '2234ead5-93e9-43cb-b988-c98fc97db8b7';
DELETE FROM public.pvl_garden_mentor_links
 WHERE student_id = '2234ead5-93e9-43cb-b988-c98fc97db8b7'
    OR mentor_id  = '2234ead5-93e9-43cb-b988-c98fc97db8b7';
DELETE FROM public.pvl_students            WHERE id = '2234ead5-93e9-43cb-b988-c98fc97db8b7';
DELETE FROM public.users_auth              WHERE id = '2234ead5-93e9-43cb-b988-c98fc97db8b7';
DELETE FROM public.profiles                WHERE id = '2234ead5-93e9-43cb-b988-c98fc97db8b7';
COMMIT;
```

**Плюсы:** одно psql-action без UI. Audit-log есть (через ручной INSERT, с явным маркером что не через RPC).
**Минусы:** теряем сходство с обычным flow удаления (если Ольга/audit смотрят что было «через UI кнопку» — этой записи как RPC-вызова не будет, но pvl_audit_log запись сохранится).

### Метод C (минимальный) — только profiles + users_auth

Все остальные таблицы 0 rows, можно сократить до:
```sql
BEGIN;
DELETE FROM public.users_auth WHERE id = '2234ead5-93e9-43cb-b988-c98fc97db8b7';
DELETE FROM public.profiles   WHERE id = '2234ead5-93e9-43cb-b988-c98fc97db8b7';
COMMIT;
```
**Плюсы:** короче.
**Минусы:** нет audit-log; нет consistency с RPC-паттерном (если в будущем добавится новая FK-таблица и забудется обновить, ручной DELETE её пропустит — RPC форсит апдейт). На уровне доверия — мы знаем что сейчас 0 rows во всех 22 таблицах, риск нулевой.

---

## 6. Что я НЕ сделала

- ❌ Не делала `DELETE` ничего на проде.
- ❌ Не правила миграцию `phase37_pvl_onboarding_atomic.sql`.
- ❌ Не commit / push.
- ❌ Не предлагаю объединить delete tatrusi с phase37 миграцией — это разная семантика (миграция = архитектурный fix; delete user = разовая cleanup). Лучше отдельно.

---

## 7. Решение требуется от тебя

**Метод delete (выбрать):**
- A — через UI (Ольга кликает). Я ничего не делаю.
- B2 — прямой psql под gen_user с audit-log. Я готовлю SQL-файл в `_session/`, ты ревьюишь, по 🟢 — apply.
- C — минимальный psql (без audit). Не рекомендую.

**Порядок (выбрать):**
- (1) Сначала удалить tatrusi → потом diff v3 phase37 → потом apply.
- (2) Сначала diff v3 phase37 → ревью → apply (с assertion'ом 13) → потом удалить tatrusi отдельным шагом.

Я бы рекомендовала **(2) + Метод A** — фикс архитектурного бага первый, чистка tatrusi отдельным небольшим действием через UI после.

---

## 8. Шаг 2 (когда дашь 🟢)

Diff v3 phase37 — изменения:
- Section 7 backfill assertion: `<> 14` → `<> 13`.
- Шапка миграции: добавить блок «v3 (2026-05-23)» с упоминанием recon-ошибки `_113` + tatrusi exclusion (`role='applicant'` всё равно вне scope backfill'а, но контекст полезен).
- Section 7 RAISE NOTICE сообщение: «вставлено 13» → consistent.

**+ опционально, если выбрал Метод B2:** отдельный SQL-файл `_session/2026-05-23_delete_tatrusi.sql` (НЕ в `migrations/`, т.к. это не схема-change, а data-cleanup).

Жду 🟢 на: метод + порядок.

---

## 9. Эффорт

- profile lookup + FK map: ~3 мин
- 22-таблиц cross-audit (3 SQL-блока): ~6 мин
- RPC admin_delete_user_full source read: ~2 мин
- UI-интеграция grep: ~1 мин
- _114 отчёт: ~13 мин

Итого ~25 мин.
