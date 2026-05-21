# EXEC 2026-05-02 — post-smoke diagnostics: pvl_direct_messages

**Контекст:** live-smoke после миграции SEC-001 (восстановление безопасности БД Garden).

**Гипотеза:** соответствуют ли UUID-поля `mentor_id` / `student_id` / `author_user_id` в `pvl_direct_messages` значениям `profiles.id` (= `auth.uid()`), или они ссылаются на `pvl_mentors.id` (оторванный справочник).

**Почему критично:** RLS-политика на `pvl_direct_messages` проверяет участие через `auth.uid() = mentor_id OR auth.uid() = student_id`. Если в этих полях UUID не из `profiles`, ни ментор, ни студент не увидят своих ЛС.

**Режим:** read-only. Никаких изменений в БД.

**Подключение:** `gen_user` → `337a9e20fbb7b82646fd9413.twc1.net:5432/default_db` (creds из `/opt/garden-auth/.env` через ssh `root@5.129.251.56`).

---

## Запрос 1 — сэмпл строк (без текста, приватность)

```sql
SELECT mentor_id, student_id, author_user_id, created_at
FROM public.pvl_direct_messages
ORDER BY created_at DESC
LIMIT 5;
```

```
              mentor_id               |              student_id              |            author_user_id            |          created_at
--------------------------------------+--------------------------------------+--------------------------------------+-------------------------------
 6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7 | d302b93d-5d29-4787-82d3-526dfe8c4a15 | d302b93d-5d29-4787-82d3-526dfe8c4a15 | 2026-05-01 22:04:36.299112+03
 6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7 | d302b93d-5d29-4787-82d3-526dfe8c4a15 | 6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7 | 2026-05-01 11:00:41.726599+03
 6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7 | 5aa62776-6229-4270-9886-33316ff035c6 | 6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7 | 2026-05-01 10:57:52.168633+03
 6cf385c3-5d4b-44dc-bcf1-6aa17d50bac7 | 5aa62776-6229-4270-9886-33316ff035c6 | 5aa62776-6229-4270-9886-33316ff035c6 | 2026-05-01 08:51:52.512434+03
 1b10d2ef-8504-4778-9b7b-5b04b24f8751 | 49c267b1-7ef6-48f6-bb2f-0e6741491b90 | 49c267b1-7ef6-48f6-bb2f-0e6741491b90 | 2026-04-29 16:42:08.74514+03
(5 rows)
```

Видно: `author_user_id` равен либо `mentor_id`, либо `student_id` — то есть автор сообщения = один из участников диалога.

---

## Запрос 2 — маппинг на `profiles`

```sql
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE m_in_profiles) AS mentor_in_profiles,
  count(*) FILTER (WHERE s_in_profiles) AS student_in_profiles,
  count(*) FILTER (WHERE a_in_profiles) AS author_in_profiles
FROM (
  SELECT
    EXISTS(SELECT 1 FROM public.profiles WHERE id = d.mentor_id) AS m_in_profiles,
    EXISTS(SELECT 1 FROM public.profiles WHERE id = d.student_id) AS s_in_profiles,
    EXISTS(SELECT 1 FROM public.profiles WHERE id = d.author_user_id) AS a_in_profiles
  FROM public.pvl_direct_messages d
) sub;
```

```
 total | mentor_in_profiles | student_in_profiles | author_in_profiles
-------+--------------------+---------------------+--------------------
    25 |                 25 |                  25 |                 25
(1 row)
```

Все три поля (`mentor_id`, `student_id`, `author_user_id`) для **всех 25 строк** соответствуют `profiles.id`.

---

## Запрос 3 — альтернатива: маппинг на `pvl_mentors`

```sql
SELECT
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.pvl_mentors m WHERE m.id = d.mentor_id)) AS mentor_in_pvl_mentors,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = d.mentor_id)) AS mentor_in_profiles_again
FROM public.pvl_direct_messages d;
```

```
 mentor_in_pvl_mentors | mentor_in_profiles_again
-----------------------+--------------------------
                     0 |                       25
(1 row)
```

Ни одного `mentor_id` не существует в `pvl_mentors`. Все 25 — в `profiles`.

---

## Интерпретация

- `mentor_in_profiles == total` (25/25) ✅
- `student_in_profiles == total` (25/25) ✅
- `author_in_profiles == total` (25/25) ✅
- `mentor_in_pvl_mentors == 0` — справочник `pvl_mentors` не используется как источник ID в `pvl_direct_messages`

**Вывод:** RLS-политика `auth.uid() = mentor_id OR auth.uid() = student_id` **работает корректно**. Все участники диалогов идентифицируются через `profiles.id` (= `auth.uid()`). Фикс не требуется.

**Рекомендация:** ничего не делать. Передаю результаты стратегу.
