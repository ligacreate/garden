-- Migration 26: Shop items for leaders marketplace

CREATE TABLE IF NOT EXISTS public.shop_items (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT        NOT NULL,
    description      TEXT,
    price            INTEGER     NOT NULL,
    old_price        INTEGER,
    image_url        TEXT,
    options          JSONB,
    contact_telegram TEXT,
    contact_whatsapp TEXT,
    sort_order       INTEGER     NOT NULL DEFAULT 0,
    is_active        BOOLEAN     NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.shop_items IS 'Товары магазина для ведущих (витрина, контакт напрямую с производителем)';

ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.shop_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.shop_items TO authenticated;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'shop_items' AND policyname = 'shop_items_select_all'
    ) THEN
        CREATE POLICY shop_items_select_all
            ON public.shop_items FOR SELECT
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'shop_items' AND policyname = 'shop_items_write_admin'
    ) THEN
        CREATE POLICY shop_items_write_admin
            ON public.shop_items FOR ALL
            TO authenticated
            USING (public.is_admin())
            WITH CHECK (public.is_admin());
    END IF;
END $$;

INSERT INTO public.shop_items (name, description, price, options, sort_order) VALUES
    (
        'Ароманабор масел',
        'Натуральные масла для практик и медитаций',
        2000,
        '{"label":"Материал кейса","values":["Эко-кожа","Экозамша"]}',
        1
    ),
    (
        '«Пиши, веди, люби»',
        'Авторская футболка для ведущих. Мягкий хлопок, аккуратный принт.',
        3500,
        '{"label":"Размер","values":["XS","S","M","L","XL"]}',
        2
    );

UPDATE public.shop_items SET old_price = 4900 WHERE name = '«Пиши, веди, люби»';
