-- Add image attachment support to chat messages.
-- Safe to re-run.

alter table public.messages
  add column if not exists image_url text null;
