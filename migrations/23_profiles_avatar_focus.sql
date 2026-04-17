-- Фокус обрезки аватара в профиле Сада (как на встречах: object-position %).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_focus_x integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS avatar_focus_y integer NOT NULL DEFAULT 50;

COMMENT ON COLUMN public.profiles.avatar_focus_x IS 'Горизонталь фокуса кадра аватара 0–100';
COMMENT ON COLUMN public.profiles.avatar_focus_y IS 'Вертикаль фокуса кадра аватара 0–100';
