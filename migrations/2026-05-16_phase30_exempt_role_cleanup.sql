-- phase30: чистка auto_pause_exempt от бэкфилла phase29 + триггер на смену роли.
--
-- Контекст: phase29 поставил `auto_pause_exempt=true` всем admin/applicant/intern
-- (31 профиль) как защиту от автопаузы. После прода 2026-05-16 решили:
-- - admin (3) и applicant (15) защищаются СТРУКТУРНО по роли в коде push-server,
--   флаг им не нужен.
-- - intern (13) — платят, бэкфилл был ошибочный.
-- - leader/mentor — платят как и раньше.
--
-- Список «Без автопаузы» в админке должен показывать только индивидуальные
-- исключения (бартеры, постоянные льготы среди платящих ролей). После apply'я
-- этой миграции список будет пустым — это правильное поведение.
--
-- Дополнительно: триггер сбрасывает exempt при смене роли из non-paying
-- (admin, applicant) в paying (intern, leader, mentor) — кейс «абитуриентка
-- прошла курс → стажёр → должна начать платить».
--
-- RUNBOOK:
--   1) SSH прод, psql под gen_user.
--   2) BEGIN; \i этот файл; VERIFY; COMMIT/ROLLBACK.
--   3) Ожидание после COMMIT: 0 exempt по всем ролям.

BEGIN;

-- 1. Снять exempt с тех, у кого он был от бэкфилла phase29 (admin/applicant/intern).
-- Реальных исключений сейчас НЕТ — это очистка ошибочного бэкфилла. Если
-- появятся реальные exempt в будущем (бартеры) — их Ольга поставит вручную
-- через UI «Без автопаузы».
UPDATE public.profiles
   SET auto_pause_exempt = false,
       auto_pause_exempt_until = null,
       auto_pause_exempt_note = null
 WHERE role IN ('admin', 'applicant', 'intern')
   AND auto_pause_exempt = true;

-- 2. Триггер на смену role: при переходе из non-paying в paying — сбросить exempt.
-- Кейс: абитуриент закончил курс ПВЛ, ему ставят role='intern' — он начинает
-- платить. Если на нём остался флаг exempt (например, бартерный был раньше),
-- автопауза не сработает и человек будет пользоваться платформой бесплатно.
-- Лучше сбросить флаг и дать админу решить осознанно.
CREATE OR REPLACE FUNCTION public.reset_exempt_on_role_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.role IN ('admin', 'applicant')
       AND NEW.role IN ('intern', 'leader', 'mentor')
       AND COALESCE(NEW.auto_pause_exempt, false) = true THEN
        NEW.auto_pause_exempt := false;
        NEW.auto_pause_exempt_until := NULL;
        NEW.auto_pause_exempt_note := COALESCE(NEW.auto_pause_exempt_note, '')
            || ' [auto-reset on role change to ' || NEW.role || ' at ' || now()::text || ']';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_exempt_on_role_change ON public.profiles;
CREATE TRIGGER trg_reset_exempt_on_role_change
  BEFORE UPDATE OF role
  ON public.profiles
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION public.reset_exempt_on_role_change();

-- 3. Защита от Timeweb «role-permissions UI revokes all».
SELECT public.ensure_garden_grants();

COMMIT;

-- VERIFY:
-- SELECT role, count(*) FILTER (WHERE auto_pause_exempt) as exempt
-- FROM public.profiles GROUP BY role ORDER BY role;
-- Ожидание: 0 exempt по всем ролям (никаких manual override'ов пока нет).
--
-- Trigger smoke (под BEGIN/ROLLBACK):
--   BEGIN;
--   UPDATE public.profiles SET auto_pause_exempt = true
--     WHERE role = 'applicant' LIMIT 1 RETURNING id, role, auto_pause_exempt;
--   UPDATE public.profiles SET role = 'intern'
--     WHERE id = '<id из предыдущего>' RETURNING id, role, auto_pause_exempt, auto_pause_exempt_note;
--   -- Ожидание: auto_pause_exempt=false, note содержит 'auto-reset on role change to intern'.
--   ROLLBACK;
