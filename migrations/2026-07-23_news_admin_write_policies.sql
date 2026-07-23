-- BUG: удаление/редактирование новостей в админке молча «успешно», но 0 строк.
--
-- Корневая причина (не гипотеза про author_id!): на public.news НЕТ ни одной
-- PERMISSIVE-политики для DELETE и для UPDATE. Есть только:
--   • «News are viewable by everyone.» — PERMISSIVE SELECT (public, true)
--   • «Admins can insert news.»        — PERMISSIVE INSERT (public, true)
--   • news_active_access_guard_select  — RESTRICTIVE SELECT (has_platform_access)
--   • news_active_access_guard_write   — RESTRICTIVE ALL    (has_platform_access)
-- В Postgres RLS команда без единой PERMISSIVE-политики запрещена ВСЕМ:
-- RESTRICTIVE только сужает, но никогда не разрешает. Поэтому DELETE и UPDATE
-- на news не проходят вообще ни у кого (доказано dry-run'ом: админ не мог
-- удалить даже строку, где author_id = его собственный uid). PostgREST при этом
-- отдаёт пустой representation без ошибки → фронт рапортует ложный успех.
--
-- Фикс: добавить PERMISSIVE-политики для админа на DELETE и UPDATE.
-- Предикат — public.is_admin() (SECURITY DEFINER, уже с GRANT EXECUTE
-- authenticated; тот же, что в treasury/app_settings-политиках). Он не зависит
-- от строки → админ удаляет/правит ЛЮБУЮ новость, включая author_id IS NULL
-- (канальные новости Лиги). RESTRICTIVE-гвард has_platform_access(auth.uid())
-- для админа всегда true (ветка role='admin'), так что писать он не мешает.
--
-- Идемпотентно: DROP IF EXISTS + CREATE.

DROP POLICY IF EXISTS "Admins can delete news." ON public.news;
CREATE POLICY "Admins can delete news."
  ON public.news
  FOR DELETE
  TO authenticated
  USING ( public.is_admin() );

DROP POLICY IF EXISTS "Admins can update news." ON public.news;
CREATE POLICY "Admins can update news."
  ON public.news
  FOR UPDATE
  TO authenticated
  USING ( public.is_admin() )
  WITH CHECK ( public.is_admin() );

-- ── Верификация ──────────────────────────────────────────────────────────────
\echo === Политики news после миграции (ожидание: появились DELETE и UPDATE) ===
SELECT policyname, cmd, permissive, roles::text AS roles, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='news'
ORDER BY cmd, policyname;
