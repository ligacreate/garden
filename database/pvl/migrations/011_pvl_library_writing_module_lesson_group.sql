-- Первые шесть материалов категории «Дополнительные материалы к модулю „Пиши“» —
-- общий заголовок рамки в библиотеке (library_payload.lessonGroupTitle).

BEGIN;

UPDATE public.pvl_content_items
SET
  library_payload = COALESCE(library_payload, '{}'::jsonb) || jsonb_build_object(
    'lessonGroupTitle',
    'Научные основы письменных практик'
  ),
  updated_at = NOW()
WHERE target_section = 'library'
  AND btrim(title) IN (
    'Книги о письменных практиках и вокруг них',
    'Исследования о письменных практиках',
    'Лестница письменных практик — модель Кэтлин Адамс',
    'Карта письменных практик',
    'Польза групповых встреч',
    'Правила встречи с письменными практиками'
  );

COMMIT;
