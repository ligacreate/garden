# DB-аудит v6, 2026-05-02 (read-only)

Сессия только на чтение. `psql` под `gen_user`. Никаких изменений.

Цель: финальная верификация контракта `pvl_garden_mentor_links.mentor_id = profiles.id` перед написанием SQL для `is_mentor_for(uuid)` и шаблонов B/C.

---

## Краткое резюме

✅ **Контракт подтверждён 100% (19/19).** Все `mentor_id` в `pvl_garden_mentor_links` существуют в `profiles` с тем же `id`. Это значит, что `auth.uid()` ментора, прошедшего через garden-auth, **гарантированно совпадает** с `mentor_id` в links. Хелпер `public.is_mentor_for(uuid)` будет работать корректно для всех 19 действующих связок.

✅ **Шаблон A для `pvl_mentors` оправдан.** Ни один из 5 действующих менторов в links не присутствует в `pvl_mentors`; в `pvl_mentors` лежит 1 строка с placeholder uuid `22222222-…-01` («Елена Ментор»). Таблица — оторванный справочник, не источник истины. Применять шаблон C было бы бессмысленно (предикаты на `pvl_mentors.id = auth.uid()` всегда дали бы `false`).

📝 **Заметка.** 1 из 5 менторов (`ebd79a0f-…` — Ирина Одинцова) имеет `role='admin'` в `profiles`, не `mentor`. Это совмещение ролей: админ платформы одновременно ведёт студентов как ментор курса. Не баг — уточнение к шаблонам.

---

## Запросы и результаты

### 1. Совпадение `mentor_id ↔ profiles.id`

```sql
SELECT count(*) AS links_with_profile,
       (SELECT count(*) FROM public.pvl_garden_mentor_links) AS links_total
FROM public.pvl_garden_mentor_links l
WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = l.mentor_id);
```

```
 links_with_profile | links_total
--------------------+-------------
                 19 |          19
```

**19 / 19 = 100%.** Каждая запись `pvl_garden_mentor_links` указывает на существующий `profiles.id`. Совпадает с гипотезой v3/v4: `pvl_garden_mentor_links.mentor_id = profiles.id ментора`.

### 2. Содержимое `pvl_mentors`

```sql
SELECT id, full_name FROM public.pvl_mentors LIMIT 5;
```

```
                  id                  |  full_name
--------------------------------------+--------------
 22222222-2222-2222-2222-222222222201 | Елена Ментор
```

**Всего 1 строка**, с placeholder UUID `22222222-…-01` (паттерн идентичен тестовой «Участнице» `33333…01` из v3 — явно seed). «Елена Ментор» как имя — generic, не совпадает ни с одним именем из реальных 5 менторов в links.

### 3. Контрольные счёты

```sql
SELECT count(DISTINCT mentor_id) FROM public.pvl_garden_mentor_links;
SELECT count(*) FROM public.pvl_mentors;
```

```
 distinct_mentors_in_links: 5
 pvl_mentors_total:         1
```

**Расхождение 5 vs 1.** В links 5 уникальных действующих менторов; в `pvl_mentors` — 1 placeholder. Реестр действующих менторов фактически живёт в links (через FK `mentor_id` без явного FK-объявления), а не в `pvl_mentors`.

### 4. Кросс-таблица: где находится каждый mentor_id

```sql
SELECT
  l.mentor_id,
  (p.id IS NOT NULL) AS in_profiles,
  p.role AS profile_role,
  (m.id IS NOT NULL) AS in_pvl_mentors,
  count(*) AS students_count
FROM public.pvl_garden_mentor_links l
LEFT JOIN public.profiles p ON p.id = l.mentor_id
LEFT JOIN public.pvl_mentors m ON m.id = l.mentor_id
GROUP BY l.mentor_id, p.id, p.role, m.id
ORDER BY students_count DESC;
```

```
              mentor_id               | in_profiles | profile_role | in_pvl_mentors | students_count
--------------------------------------+-------------+--------------+----------------+----------------
 492e5d3d-81c7-41d8-8cef-5a603e1389e6 | t           | mentor       | f              |              4
 1b10d2ef-8504-4778-9b7b-5b04b24f8751 | t           | mentor       | f              |              4
 ebd79a0f-1bac-49f9-a3f2-aeeb165a10d7 | t           | admin        | f              |              4
 6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7 | t           | mentor       | f              |              4
 0e779c13-4cf8-48f7-9dd0-caa8da9a0d72 | t           | mentor       | f              |              3
```

Все 5: `in_profiles=t`, `in_pvl_mentors=f`. Распределение учеников: четверо менторов по 4 студента, один — 3 (= 4×4 + 3 = 19 ✓).

`ebd79a0f-…` — это Ирина Одинцова из v1 (одна из 3 админов платформы). У неё `role='admin'` в `profiles`, и при этом она ведёт 4 студентов. Это означает: **`is_mentor_for()` сработает для неё корректно через links, а `is_admin()` сработает через `profiles.role='admin'`. Оба true одновременно** — она пройдёт через любой из OR-веток наших политик.

### 5. Несовпадения

```sql
SELECT DISTINCT l.mentor_id
FROM public.pvl_garden_mentor_links l
LEFT JOIN public.profiles p ON p.id = l.mentor_id
WHERE p.id IS NULL;
```

```
 mentor_id
-----------
(0 rows)
```

**Несовпадений нет.** Это и есть «зелёный свет» для миграции.

---

## Что подтверждено

| Утверждение | Подтверждение |
|---|---|
| `pvl_garden_mentor_links.mentor_id ≡ profiles.id` | ✅ 19/19 |
| `auth.uid()` ментора найдёт свои связки через `is_mentor_for(uuid)` | ✅ для всех 5 действующих менторов |
| `pvl_mentors` — оторванный справочник, не реестр | ✅ 0/5 пересечений |
| Совмещение admin+mentor работает «через OR» | ✅ `is_admin()` true + `is_mentor_for()` true одновременно |

## Что не подтверждено и не нужно для миграции

- Что произойдёт, если в links появится строка с `mentor_id`, которого нет в `profiles`. Сейчас — 0 таких. Если когда-то появится — `is_mentor_for(uuid)` корректно вернёт `false` (`auth.uid()` не равен такому id), не упадёт.
- Что произойдёт с `pvl_mentors.id` после миграции. Шаблон A: ничего, SELECT всем виден, CRUD только админу. Если в будущем «Елена Ментор» будет удалена админом — без последствий, она нигде в links не упомянута.

---

## Рекомендация

**Миграция готова к исполнению.** Все 4 контракта, на которых построены шаблоны B/C, верифицированы:

1. `pvl_students.id = profiles.id` — 22/23 (v4), 1 тестовая «Участница» исключена сознательно.
2. `pvl_garden_mentor_links.mentor_id = profiles.id` — 19/19 (v6, эта проверка).
3. `auth.uid()` всех залогиненных пользователей = `profiles.id` — гарантировано garden-auth-сервисом.
4. `is_admin()` существует и работает (v1).

Можно переходить к ревью SQL с веб-Claude и далее — к исполнению миграции.
