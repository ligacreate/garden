-- Цена необязательна (для товаров с промокодом вместо цены)
ALTER TABLE shop_items ALTER COLUMN price DROP NOT NULL;
