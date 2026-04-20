-- Migration 25: Global app settings (library order, hidden courses, etc.)
-- Stores shared key-value config accessible to all users; only admins can write.

CREATE TABLE IF NOT EXISTS public.app_settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_settings IS 'Глобальные настройки приложения (порядок материалов, скрытые курсы и т.д.)';

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.app_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.app_settings TO authenticated;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'app_settings' AND policyname = 'app_settings_select_all'
    ) THEN
        CREATE POLICY app_settings_select_all
            ON public.app_settings FOR SELECT
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'app_settings' AND policyname = 'app_settings_write_admin'
    ) THEN
        CREATE POLICY app_settings_write_admin
            ON public.app_settings FOR ALL
            TO authenticated
            USING (public.is_admin())
            WITH CHECK (public.is_admin());
    END IF;
END $$;
