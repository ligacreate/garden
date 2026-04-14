# PostgREST / profiles и синхронизация ПВЛ

`syncPvlActorsFromGarden()` вызывает `GET /profiles?select=*` с JWT пользователя из `localStorage` (`garden_auth_token`).

## Политика из репозитория (`migrations/05_profiles_rls.sql`)

- `profiles_select_authenticated` — `USING (auth.uid() IS NOT NULL)` для роли `authenticated`: при такой формулировке **любой** залогиненный пользователь теоретически может читать **все** строки `profiles` (если нет более узкой политики и политики объединяются через OR).

На продакшене схема может отличаться. Если SELECT разрешён только для «своей» строки (`auth.uid() = id`), то `getUsers()` вернёт **одну** запись (текущего пользователя), и в учительской не появятся абитуриенты.

## Что сделать на стороне БД (варианты)

1. Для пользователей с `profiles.role = 'admin'` добавить отдельную политику `SELECT` на все строки `profiles` (через `is_admin()` уже есть для UPDATE).
2. Либо выделить RPC/представление только для админов с списком абитуриентов.
3. Либо синк через service role на бэкенде (не из браузера).

Источник истины роли абитуриента в Саду: колонка **`public.profiles.role`** (значение `applicant` и пустое/null после миграции `22_profiles_default_applicant_role.sql`).
