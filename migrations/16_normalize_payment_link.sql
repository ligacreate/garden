-- Normalize payment_link and registration_link: @username -> https://t.me/username
-- Fixes old records where Telegram handle was saved as @AneleRay instead of full URL

-- Helper: value that doesn't start with http becomes https://t.me/username
UPDATE public.meetings
SET payment_link = (
  'https://t.me/' || regexp_replace(
    regexp_replace(regexp_replace(trim(payment_link), '^@', '', 'i'), '^(https?://)?(www\.)?t\.me/?', '', 'i'),
    '\s+', '', 'g'
  )
)
WHERE payment_link IS NOT NULL
  AND trim(payment_link) <> ''
  AND payment_link !~* '^https?://';

-- Same for events.registration_link (if column exists)
UPDATE public.events
SET registration_link = (
  'https://t.me/' || regexp_replace(
    regexp_replace(regexp_replace(trim(registration_link), '^@', '', 'i'), '^(https?://)?(www\.)?t\.me/?', '', 'i'),
    '\s+', '', 'g'
  )
)
WHERE registration_link IS NOT NULL
  AND trim(registration_link) <> ''
  AND registration_link !~* '^https?://';
