-- Добавляем поля для промокода и ссылки перехода на внешний ресурс
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS promo_code text;
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS link_url text;
