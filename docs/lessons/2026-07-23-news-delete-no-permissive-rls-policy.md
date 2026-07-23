# Удаление новостей молча «успешно», но 0 строк — не было PERMISSIVE-политики на DELETE

## Симптом
В админке новости не удаляются: Оля дважды удаляла тестовые новости (#15, #16),
тост показывал «Новость удалена», но записи оставались в ленте. То же скрыто
касалось редактирования (UPDATE).

## Корневая причина
На `public.news` **не было ни одной PERMISSIVE-политики для DELETE и UPDATE**.
Существовали только:
- `News are viewable by everyone.` — PERMISSIVE **SELECT** (public, true)
- `Admins can insert news.` — PERMISSIVE **INSERT** (public, true)
- `news_active_access_guard_select` — RESTRICTIVE SELECT (`has_platform_access`)
- `news_active_access_guard_write` — RESTRICTIVE **ALL** (`has_platform_access`)

В Postgres RLS команда, для которой нет ни одной PERMISSIVE-политики, запрещена
**всем**: итоговое право = `(OR всех permissive) AND (AND всех restrictive)`, а
пустой OR = false. RESTRICTIVE только сужает, но никогда не разрешает. Поэтому
DELETE/UPDATE на `news` не проходили вообще ни у кого. Доказано dry-run'ом на
проде: админ не мог удалить даже строку, где `author_id` = его собственный uid
(0 строк). Гипотеза «политика гейтит по `author_id = auth.uid()`, а у канальных
новостей `author_id IS NULL`» — **опровергнута**: политики по `author_id` не
существовало вовсе.

Второй слой бага — фронт. `deleteNews`/`updateNews` слали DELETE/PATCH с
`Prefer: return=representation`, но **игнорировали ответ** и возвращали `true`.
PostgREST на удалении 0 строк отдаёт пустой representation без ошибки → тихий
ложный успех.

## Почему так получилось
Миграция впуска канальных новостей (`2026-07-19_news_tg_channel_ingest`) и
раскатка RESTRICTIVE-гвардов `has_platform_access` на 39 таблиц добавили на
`news` write-guard (RESTRICTIVE ALL), но PERMISSIVE-грант на запись остался
только для INSERT. DELETE/UPDATE «провалились в дыру»: RESTRICTIVE есть,
PERMISSIVE нет. Симптом заметили не сразу, потому что фронт маскировал отказ
ложным «успехом».

## Как починили
1. **DB (owner-слой):** добавили две PERMISSIVE-политики для админа —
   `Admins can delete news.` (FOR DELETE, `USING is_admin()`) и
   `Admins can update news.` (FOR UPDATE, `USING/ WITH CHECK is_admin()`).
   Предикат `public.is_admin()` — SECURITY DEFINER, не зависит от строки → админ
   правит/удаляет **любую** новость, включая `author_id IS NULL`. RESTRICTIVE
   `has_platform_access(auth.uid())` для админа всегда true (ветка role='admin'),
   писать не мешает. Миграция: `migrations/2026-07-23_news_admin_write_policies.sql`.
2. **Фронт:** `deleteNews`/`updateNews` теперь читают representation и бросают
   ошибку `NO_ROWS_AFFECTED`, если затронуто 0 строк; `App.jsx` показывает
   честный тост вместо ложного «удалено/обновлено».

Проверено на проде: после миграции удаление #15/#16 через RLS-путь (роль
`authenticated`, `sub` = uid админа) вернуло `deleted_count = 2` — раньше 0.

## Что проверить в будущем
- Раскатывая RESTRICTIVE-гвард `FOR ALL` на таблицу, проверь, что для **каждой**
  нужной команды (SELECT/INSERT/UPDATE/DELETE) есть своя PERMISSIVE-политика.
  RESTRICTIVE ALL без permissive на UPDATE/DELETE = тихий deny-all на запись.
  Сигнал: `SELECT cmd, permissive FROM pg_policies WHERE tablename=…` — если у
  команды есть только RESTRICTIVE строки, запись по ней невозможна.
- Любая мутация с `return=representation` должна проверять число затронутых
  строк. `2xx` от PostgREST ≠ «строка изменилась». Не выдавать пустой ответ за
  успех (см. паттерн «единый источник, derive-on-read»).
