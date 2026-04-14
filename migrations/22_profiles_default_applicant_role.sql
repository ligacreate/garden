-- Пустой role в profiles: дефолт платформы — абитуриент (см. utils/roles ROLES.APPLICANT).
-- Без этого ПВЛ и списки по role не видят людей; клиент при входе тоже патчит (dataService._ensureDefaultApplicantRoleInDb).
-- Выполнить на проде под ролью с правом UPDATE на public.profiles.

UPDATE public.profiles
SET role = 'applicant'
WHERE role IS NULL OR trim(role) = '';
