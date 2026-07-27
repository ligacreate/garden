-- migrations/2026-07-27_profiles_privileged_write_guard.sql
--
-- SEC — самоназначение привилегий через PATCH /profiles (P0).
--
-- Симптом (доказан на проде, ROLLBACK-прогон 2026-07-27):
--   Любой активный залогиненный пользователь одним PATCH к
--   api.skrebeyko.ru/profiles ставил себе role='admin' (после чего видел
--   и правил все профили) либо продлевал себе paid_until на десять лет.
--   Отчёт: docs/journal/RECON_2026-07-27_profiles_role_self_escalation.md
--
-- Корневая причина (owner layer = права на запись в public.profiles):
--   RLS работает построчно и про колонки ничего не знает: политика
--   profiles_update_own (auth.uid() = id) разрешает менять СВОЮ СТРОКУ
--   ЦЕЛИКОМ. Табличный GRANT UPDATE выдан authenticated без колоночного
--   среза. Ни один из пяти триггеров на profiles не спрашивал, кто автор
--   изменения. PGRST_DB_PRE_REQUEST не задан — прослойки между токеном и
--   этим UPDATE нет.
--
-- Почему не колоночными грантами:
--   администратор ходит через тот же PostgREST под той же ролью
--   authenticated, поэтому REVOKE UPDATE (role) сломал бы админку вместе
--   с атакой. Отделить «свой» UPDATE от «админского» можно только по
--   содержанию запроса — то есть триггером.
--
-- Фикс:
--   BEFORE UPDATE-триггер на profiles. Если запрос пришёл НЕ от владельца
--   базы (gen_user) и НЕ от суперюзера, а is_admin() при этом ложно —
--   изменение привилегированной колонки отбивается исключением 42501
--   (PostgREST отдаёт 403).
--
-- Набор привилегированных колонок живёт в ОДНОМ месте —
--   public.profiles_privileged_columns(). Решение Ольги 2026-07-27:
--   role, access_status, subscription_status, paid_until,
--   auto_pause_exempt, email, telegram_user_id.
--   telegram_user_id добавлен после разведки: клиент эту колонку только
--   читает, пишут её бот и join-поллер под gen_user. Без гварда можно было
--   привязать к своему профилю чужой telegram-аккаунт и впустить его в
--   канал и чат Лиги вместо себя.
--   Пользовательские поля профиля (имя, город, аватар, описание,
--   компетенции, offer, ссылки tg/vk, дерево, дата рождения) остаются
--   свободно редактируемыми — их эта миграция не трогает.
--
-- Про seeds: колонка в наборе ПОКА закомментирована намеренно. Сегодня
--   свои семена дописывает клиент — views/UserApp.jsx вызывает
--   onUpdateUser({ ...user, seeds }) в одиннадцати местах (встреча
--   создана и проведена, практика, сценарий, урок, клиент), плюс
--   пересчёт баланса при загрузке и списание при удалении встречи. Всё
--   это идёт PATCH /profiles под authenticated. Включить seeds в гвард
--   раньше, чем начисление уедет на сервер, — значит сломать экономику
--   семян целиком. Перенос — отдельной задачей
--   (plans/2026-07-27-семена-на-сервер.md), после неё применяется
--   migrations/2026-07-30_profiles_guard_add_seeds.sql: там ровно одна
--   правка — строка 'seeds' в этом списке. Триггер и его WHEN уже сейчас
--   учитывают seeds, пересоздавать их не придётся.
--   Отдельно: RPC increment_user_seeds (SECURITY DEFINER) сейчас
--   исполняема ролью authenticated без проверки прав — начислить себе
--   через неё можно и после гварда. Это дыра того же рода, живёт давно,
--   закрывается той же задачей.
--
-- Смежные пути (проверены, ни один не ломается — см. диff-документ
-- docs/_session/2026-07-27_codeexec_profiles_privileged_guard_diff.md):
--   - биллинг-вебхук и ночной reconcile: push-server ходит прямым pg-пулом
--     под gen_user (владелец) → ветка раннего выхода;
--   - garden-auth (регистрация, логин, email-воркер): тот же gen_user;
--   - ручная отметка оплаты из админки: идёт через push-server, не через
--     PostgREST;
--   - пауза/разморозка и льгота из админки: PostgREST под JWT админа,
--     is_admin() истинно → пропускаем;
--   - approve регистрации: RPC admin_approve_registration, SECURITY
--     DEFINER под gen_user → ветка раннего выхода;
--   - привязка Telegram: telegram_user_id пишет бот через garden-auth
--     (tg_link_codes), клиент эту колонку только читает;
--   - обычное сохранение профиля: гвард смотрит на ИЗМЕНЕНИЕ колонки
--     (IS DISTINCT FROM), а фронт шлёт role/status тем же значением.
--
-- Оговорка про пустую роль: _ensureDefaultApplicantRoleInDb (dataService)
--   при входе патчит role='applicant', если в БД роль пустая. На проде
--   таких профилей 0, но путь живой — поэтому в гварде есть узкая
--   форточка: пустая роль → 'applicant' в своей строке. Ничего, кроме
--   самой низкой роли, через неё не поставить, а обнулить роль, чтобы
--   форточкой воспользоваться, гвард не даст.

\set ON_ERROR_STOP on

BEGIN;

-- Pre: таблица и ожидаемые колонки на месте
DO $$
DECLARE v_missing text;
BEGIN
    SELECT string_agg(c.name, ', ') INTO v_missing
      FROM (VALUES ('role'),('access_status'),('subscription_status'),
                   ('paid_until'),('auto_pause_exempt'),('email'),
                   ('telegram_user_id'),('seeds')) AS c(name)
     WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='profiles'
           AND column_name = c.name
     );
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'guard pre: в profiles нет колонок: % — остановка', v_missing;
    END IF;
END $$;

-- Единственный источник правды по набору привилегированных колонок.
CREATE OR REPLACE FUNCTION public.profiles_privileged_columns()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $function$
    SELECT ARRAY[
        'role',
        'access_status',
        'subscription_status',
        'paid_until',
        'auto_pause_exempt',
        'email',
        'telegram_user_id'
        -- ,'seeds'  -- включим после переноса начисления на сервер (см. шапку)
    ]::text[];
$function$;

COMMENT ON FUNCTION public.profiles_privileged_columns() IS
    'Колонки profiles, которые под клиентской ролью может менять только администратор. Читается триггером trg_profiles_privileged_write_guard.';

CREATE OR REPLACE FUNCTION public.profiles_privileged_write_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER          -- принципиально: нужен настоящий current_user вызывающего
SET search_path TO 'public'
AS $function$
DECLARE
    v_owner   text;
    v_super   boolean;
    v_uid     text;
    v_old     jsonb;
    v_new     jsonb;
    v_col     text;
    v_changed text[] := '{}';
BEGIN
    -- Владелец базы (gen_user) — это весь бэкенд: push-server, garden-auth,
    -- миграции, а также тело любой SECURITY DEFINER-функции. Плюс суперюзер
    -- (обслуживание). Всё остальное — клиентский путь через PostgREST.
    SELECT pg_get_userbyid(relowner) INTO v_owner
      FROM pg_class WHERE oid = 'public.profiles'::regclass;
    SELECT rolsuper INTO v_super FROM pg_roles WHERE rolname = current_user;

    IF current_user = v_owner OR COALESCE(v_super, false) THEN
        RETURN NEW;
    END IF;

    IF public.is_admin() THEN
        RETURN NEW;
    END IF;

    -- Свой id берём из JWT тем же способом, что и auth.uid(), но БЕЗ обращения
    -- к схеме auth: у роли authenticated есть EXECUTE на auth.uid(), но нет
    -- USAGE на саму схему, и прямой вызов из SECURITY INVOKER-триггера падает
    -- с «permission denied for schema auth» (поймано на ROLLBACK-прогоне
    -- 2026-07-27). В RLS-политиках auth.uid() при этом работает — там
    -- выражение исполняется от имени владельца таблицы.
    v_uid := coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    );

    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);

    FOREACH v_col IN ARRAY public.profiles_privileged_columns() LOOP
        CONTINUE WHEN (v_new -> v_col) IS NOT DISTINCT FROM (v_old -> v_col);

        -- Форточка для _ensureDefaultApplicantRoleInDb: пустая роль →
        -- applicant в своей же строке. Поднять себя выше applicant через
        -- неё нельзя, а обнулить роль, чтобы ей воспользоваться, не даст
        -- этот же гвард.
        CONTINUE WHEN v_col = 'role'
                  AND COALESCE(btrim(OLD.role), '') = ''
                  AND NEW.role = 'applicant'
                  AND NEW.id::text = v_uid;

        v_changed := v_changed || v_col;
    END LOOP;

    IF array_length(v_changed, 1) > 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Служебные поля профиля меняет только администратор',
            DETAIL  = 'Отклонены поля: ' || array_to_string(v_changed, ', '),
            HINT    = 'Роль назначает админка, оплату — биллинг, паузу — админка.';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.profiles_privileged_write_guard() IS
    'P0-гвард самоназначения привилегий в profiles: под клиентской ролью без is_admin() запрещает менять колонки из profiles_privileged_columns(). RECON_2026-07-27_profiles_role_self_escalation.md';

DROP TRIGGER IF EXISTS trg_profiles_privileged_write_guard ON public.profiles;

-- WHEN перечисляет ВЕСЬ возможный набор (включая seeds наперёд), чтобы
-- расширение списка не требовало пересоздавать триггер. На обычном
-- сохранении профиля (имя, город, аватар) функция не вызывается вообще.
CREATE TRIGGER trg_profiles_privileged_write_guard
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    WHEN (
           OLD.role                IS DISTINCT FROM NEW.role
        OR OLD.access_status       IS DISTINCT FROM NEW.access_status
        OR OLD.subscription_status IS DISTINCT FROM NEW.subscription_status
        OR OLD.paid_until          IS DISTINCT FROM NEW.paid_until
        OR OLD.auto_pause_exempt   IS DISTINCT FROM NEW.auto_pause_exempt
        OR OLD.email               IS DISTINCT FROM NEW.email
        OR OLD.telegram_user_id    IS DISTINCT FROM NEW.telegram_user_id
        OR OLD.seeds               IS DISTINCT FROM NEW.seeds
    )
    EXECUTE FUNCTION public.profiles_privileged_write_guard();

-- Post: триггер на месте, BEFORE UPDATE, включён; набор колонок ожидаемый
DO $$
DECLARE v_cnt int; v_cols text[];
BEGIN
    SELECT count(*) INTO v_cnt FROM pg_trigger
     WHERE tgrelid = 'public.profiles'::regclass
       AND tgname = 'trg_profiles_privileged_write_guard'
       AND tgenabled = 'O';
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'guard post: триггер не создан или выключен (cnt=%)', v_cnt;
    END IF;

    v_cols := public.profiles_privileged_columns();
    IF NOT ('role' = ANY(v_cols) AND 'paid_until' = ANY(v_cols)) THEN
        RAISE EXCEPTION 'guard post: набор колонок неожиданный: %', v_cols;
    END IF;
    RAISE NOTICE 'guard post: OK — триггер активен, колонки: %', array_to_string(v_cols, ', ');
END $$;

-- DDL safety-net (RUNBOOK 1.3 — Timeweb сносит гранты после DDL)
SELECT public.ensure_garden_grants();

COMMIT;

-- ROLLBACK (одной строкой):
--   DROP TRIGGER IF EXISTS trg_profiles_privileged_write_guard ON public.profiles;
--
-- Полный откат (с функциями):
--   BEGIN;
--     DROP TRIGGER IF EXISTS trg_profiles_privileged_write_guard ON public.profiles;
--     DROP FUNCTION IF EXISTS public.profiles_privileged_write_guard();
--     DROP FUNCTION IF EXISTS public.profiles_privileged_columns();
--     SELECT public.ensure_garden_grants();
--   COMMIT;
