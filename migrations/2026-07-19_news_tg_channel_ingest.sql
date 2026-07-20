-- Канальные новости: идемпотентность впуска постов канала Лиги в public.news.
-- Храним Telegram message_id поста-источника; повторная обработка (рестарт
-- поллера / передоставка getUpdates) не плодит дубли.

ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS tg_message_id bigint;

-- Частичный уникальный индекс: одна новость на один пост канала.
-- Только для канальных строк (tg_message_id IS NOT NULL); ручные админ-новости
-- (tg_message_id IS NULL) не затронуты — их может быть много с NULL.
CREATE UNIQUE INDEX IF NOT EXISTS news_tg_message_id_uidx
  ON public.news (tg_message_id)
  WHERE tg_message_id IS NOT NULL;

COMMENT ON COLUMN public.news.tg_message_id IS
  'Telegram message_id поста-источника из канала Лиги (type=channel). NULL у ручных новостей. Единственный ключ идемпотентности впуска (канал один — TG_CHANNEL_ID).';
