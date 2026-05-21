---
title: INSERT ON CONFLICT DO UPDATE проверяет INSERT WITH CHECK всегда
type: lesson
date: 2026-05-03
related:
  - docs/EXEC_2026-05-02_post_smoke_fix2_pvl_students_ensure_policy.md
  - docs/MIGRATION_2026-05-02_security_restoration.md (фаза 11.1)
  - plans/BACKLOG.md (ARCH-012)
---

# Урок: `INSERT ... ON CONFLICT DO UPDATE` проверяет `INSERT WITH CHECK` всегда

## Симптом

После открытия Caddy в финале SEC-001 (2026-05-03 ~02:00 МСК) под mentor-логином в браузерной консоли наблюдалось 17 ошибок:

```
api.skrebeyko.ru/pvl_students?on_conflict=id  →  403
[PVL DB] ensurePvlStudentInDb failed for <UUID>
{"code":"42501","message":"new row violates row-level security policy for table pvl_students"}
```

Фронт через `services/pvlMockApi.js:ensurePvlStudentInDb` делает upsert (`INSERT ... ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name`) для каждого видимого applicant-профиля. Все 17 строк — `pvl_students`, которые **уже существуют** (mentor видит их через `is_mentor_for(id)` в SELECT-политике). Логически казалось, что upsert должен попасть в UPDATE-ветку и пройти.

При попытке исправить через расширение UPDATE-политики (добавить `is_mentor_for(id)` в `USING/WITH CHECK`), но **оставить INSERT-политику строгой** (`is_admin()` only) — Test 2 (mentor upsert по существующей строке menti) всё равно падал с тем же 403.

## Корневая причина

В PostgreSQL при `INSERT ... ON CONFLICT DO UPDATE`:

> «If both INSERT and UPDATE policies are applied to the same command (as is the case for INSERT ... ON CONFLICT DO UPDATE), and the row to be inserted is rejected by the INSERT row security policy, an error is raised, **even if the row does not require insertion (because of a conflict)**.»
>
> — [PostgreSQL docs, CREATE POLICY](https://www.postgresql.org/docs/current/sql-createpolicy.html)

То есть:

1. Postgres **обязательно** оценивает `INSERT WITH CHECK` для candidate-row, **до** того как проверит наличие конфликта.
2. Если `INSERT WITH CHECK` отклоняет — ERROR немедленно. Conflict-detection и UPDATE-путь не запускаются.
3. Это значит: для UPSERT-операции **обе политики** (INSERT и UPDATE) должны быть симметричны для разрешения операции.

Если одна разрешает, а другая — нет, операция отвергается **по более строгой**.

## Почему пропустили

Когда я (стратег) писала шаблон C для `pvl_students` в фазе 11.1, я:

- Поставила INSERT/UPDATE/DELETE как `is_admin()` only — корректно для прямого INSERT/UPDATE через админ-UI.
- **Не подумала про upsert-pattern**, который активно использует `pvlMockApi.js:ensurePvlStudentInDb`. Под прежним PostgREST-`gen_user`-bypass фронт это делал безболезненно. После переключения на `authenticated` — RLS обнажила несоответствие.
- Когда увидела 17 ошибок в смоке, попробовала «расширить UPDATE-политику» как fix #2 — это естественная интуиция «хочу разрешить mentor-апдейт менти». Не помогло, потому что INSERT-политика отвергала candidate-row до conflict-resolution.

Эта особенность Postgres задокументирована, но не интуитивна. Она наказывает «асимметричные» RLS-политики при наличии upsert.

## Как починили

После анализа — решили **не расширять INSERT-политику** ради косметики (см. [ARCH-012](../../plans/BACKLOG.md)). Аргументы:

1. **17 ошибок не блокируют UI.** Фронт каталяет их в `console.error`, но `pvlMockApi.js` ловит исключения, не останавливает рендеринг. Mentor видит menti через SELECT-цепочку, которая работает корректно.
2. **Расширение INSERT даст mentor-у право CREATE строк в `pvl_students`.** В нашей закрытой модели риск умеренный, но архитектурно неправильный — pvl_students должен пополняться **только** через админ-flow или серверный триггер на `profiles.role='applicant'`.
3. **Правильное решение — убрать `ensurePvlStudentInDb` с клиента вообще** (ARCH-012 в backlog). Self-heal-паттерн на стороне браузера противоречит RLS-модели. Sync должен идти через серверный триггер.

Итого: rollback fix #2, оставили строгие политики, согласились с косметическим шумом до ARCH-012.

EXEC-лог: `docs/EXEC_2026-05-02_post_smoke_fix2_pvl_students_ensure_policy.md`.

## Что проверить в будущем

**При написании RLS-политик на таблицах с upsert-паттерном:**

1. **Проверь, есть ли в коде upsert** на эту таблицу. Поищи в кодовой базе:
   ```bash
   grep -rn "on_conflict\|ON CONFLICT\|upsert" services/ views/
   ```
   Если есть — INSERT и UPDATE политики должны быть **симметричны** для тех же ролей, иначе upsert падает.

2. **Тестируй с реальным upsert**, не только прямой INSERT/UPDATE:
   ```sql
   BEGIN;
   SET LOCAL ROLE authenticated;
   SET LOCAL request.jwt.claim.sub TO '<uid>';
   INSERT INTO public.<table> (id, ...) VALUES (...)
   ON CONFLICT (id) DO UPDATE SET ... ;
   ROLLBACK;
   ```
   Если падает — пересмотри политику.

3. **Принимай решение архитектурно**, не патчем. Если client-code делает upsert на таблице, которой по бизнес-логике должен управлять только admin/server — это **client-side antipattern**, а не «RLS слишком строгая». Правильное решение — убрать upsert с клиента.

4. **Документируй RLS-модель**: для каждой таблицы — кто может SELECT, INSERT, UPDATE, DELETE. Если симметрия не очевидна — сделай её явной в комментариях или CLAUDE.md.

## Альтернативное решение, которое мы не выбрали

Если бы мы хотели сохранить client-side upsert и не делать ARCH-012, нужно было бы расширить **обе** политики:

```sql
-- INSERT — добавить self + mentor:
DROP POLICY pvl_students_insert_admin ON public.pvl_students;
CREATE POLICY pvl_students_insert_self_mentor_or_admin
  ON public.pvl_students FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR is_admin() OR public.is_mentor_for(id));

-- UPDATE — то же самое:
DROP POLICY pvl_students_update_admin ON public.pvl_students;
CREATE POLICY pvl_students_update_self_mentor_or_admin
  ON public.pvl_students FOR UPDATE TO authenticated
  USING (id = auth.uid() OR is_admin() OR public.is_mentor_for(id))
  WITH CHECK (id = auth.uid() OR is_admin() OR public.is_mentor_for(id));
```

Это работало бы, но мы сознательно от этого отказались — см. секцию «Как починили».
