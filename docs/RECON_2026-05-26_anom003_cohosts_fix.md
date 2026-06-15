# RECON — ANOM-003 fix, Layer 1 (Garden migration)

**Дата recon:** 2026-06-15 · **Режим:** read-only, без apply · **Цель:** sync `meetings.co_hosts (uuid[])` → `events.co_hosts (text)` в триггере + backfill.
**Связано:** [meetings/docs/RECON_2026-05-25_3_cohosts.md](../../../meetings_claude/meetings/docs/RECON_2026-05-25_3_cohosts.md), ANOM-003 (`plans/BACKLOG.md:1564`), [phase22 trigger](../migrations/2026-05-05_phase22_vk_field_and_event_contacts.sql).

---

## Состояние прода (verified read-only)

| Проверка | Результат |
|---|---|
| `meetings.co_hosts` | `uuid[]`, default `'{}'::uuid[]` |
| `events.co_hosts` | `text`, **default NULL** (колонка уже существует — ALTER не нужен) |
| `profiles.name` | `text` ✓ |
| Триггер `sync_meeting_to_event()` упоминает `co_hosts`? | **нет** (`f`) → текущая логика = [phase22](../migrations/2026-05-05_phase22_vk_field_and_event_contacts.sql), co_hosts не трогает |
| Meetings с co_hosts | **20** (18 × 1 со-ведущая, **2 × 2 со-ведущих**) |
| `events.co_hosts` непустых | **0 / 179** — подтверждает ANOM-003 (никогда не синкалось) |
| Последняя миграция | `phase43` (2026-05-31) → **следующая = phase44** |

⚠ **Важно для постановки:** на проде сейчас **нет ни одной встречи с 3 co-hosts** — максимум 2. То есть встреча Ольги с 3-мя со-ведущими ещё не сохранена в БД (либо она её только планирует). Лимита на 3+ нет (проверено в прошлом recon: ни CHECK-констрейнта, ни кода) — она может добавить 3-го прямо сейчас. Этот фикс делает их **видимыми** публично; саму встречу с 3 co-hosts Ольге надо создать/досохранить в Garden.

---

## Решение Layer 1

Точечная дельта к `sync_meeting_to_event()` — по образцу phase22 (`host_telegram`/`host_vk`):
1. Новая переменная `cohosts_label TEXT` — резолв `NEW.co_hosts (uuid[])` → имена через `unnest … WITH ORDINALITY` (сохраняет порядок массива) + JOIN на `profiles`, склейка `string_agg(', ')`, `trim` имён, пустые отброшены, NULL/пустой массив → `''`.
2. Добавить `co_hosts = cohosts_label` в обе ветки (UPDATE + INSERT).
3. Backfill всех `events` из `meetings.co_hosts`.
4. `SELECT public.ensure_garden_grants();` (RUNBOOK §1.3 — Timeweb wipe после DDL) **до COMMIT**.
5. `NOTIFY pgrst, 'reload schema';`.

### Решения по дизайну
- **Порядок имён** — как в массиве `co_hosts` (через `WITH ORDINALITY`), а не алфавит. Совпадает с порядком выбора в Garden-форме.
- **`trim(name)`** — режу хвостовые пробелы (в проде есть «Юлия Габрух », «Василина Лузина »). speaker по хосту не тримит, но для списка «Имя1, Имя2» чище. Низкий риск.
- **Пустой результат → `''`** (не NULL) — единообразно с `host_telegram`/`host_vk` (default `''`). Фронт рендерит блок только если непусто.
- **Формат events.co_hosts = text** (не JSON) — таков существующий тип колонки + так просил бэклог ANOM-003. Фронт показывает строку как есть.

### Известное ограничение (вне scope, зафиксировать)
Триггеры resync на `profiles` (phase21 status, phase22 telegram/vk) **не** ловят изменение `profiles.name` со-ведущего → если со-ведущая переименуется, `events.co_hosts` устареет до следующего редактирования встречи (любой UPDATE meetings re-fire'ит триггер и перечитает имена). Для хоста та же модель (speaker обновляется только при resync). Приемлемо; отдельный тикет при необходимости.

---

## Предлагаемый файл миграции (DIFF — без apply)

**Имя:** `migrations/2026-06-15_phase44_event_cohosts_sync.sql`
⚠ Имя отличается от твоего черновика `2026-05-26_phaseXX`: (а) phase = **44** (после 43); (б) дата — сегодня **2026-06-15**, а не 05-26 (иначе файл сортируется раньше phase43 от 05-31). Скажи, если хочешь именно 05-26 — поправлю.

```sql
-- migrations/2026-06-15_phase44_event_cohosts_sync.sql
--
-- ANOM-003 fix — sync meetings.co_hosts (uuid[]) → events.co_hosts (text).
--
-- Контекст:
--   Триггер sync_meeting_to_event() (phase22) зеркалит meeting в events,
--   но co_hosts не переносит → публичный Meetings-фронт никогда не
--   показывает со-ведущих (events.co_hosts = NULL у всех 179 строк).
--   См. plans/BACKLOG.md ANOM-003, docs/RECON_2026-05-26_anom003_cohosts_fix.md.
--
-- Контракт (1 транзакция):
--   PART 1. CREATE OR REPLACE sync_meeting_to_event() — добавить
--           cohosts_label (uuid[]→имена через profiles) в UPDATE+INSERT.
--           Вся остальная логика phase22 без изменений.
--   PART 2. Backfill events.co_hosts из meetings.co_hosts.
--   PART 3. SELECT public.ensure_garden_grants();  (RUNBOOK §1.3)
--   PART 4. NOTIFY pgrst, 'reload schema'.
--
-- Не трогает: схему (events.co_hosts text уже существует), RLS, GRANT'ы
--   (кроме safety-net), resync-триггеры profiles.
--
-- Apply: scp + psql, \set ON_ERROR_STOP on, \i этот файл.

\set ON_ERROR_STOP on

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- PART 1: sync_meeting_to_event() + cohosts_label
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_meeting_to_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_city TEXT;
    user_name TEXT;
    user_role TEXT;
    user_status TEXT;
    user_telegram TEXT;
    user_vk TEXT;
    final_city TEXT;
    final_city_key TEXT;
    final_format TEXT;
    final_online_visibility TEXT;
    speaker_label TEXT;
    cohosts_label TEXT;          -- ★ phase44
    event_day DATE;
    event_starts_at TIMESTAMPTZ;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        DELETE FROM public.events WHERE garden_id = OLD.id;
        RETURN OLD;
    END IF;

    SELECT city, name, role, COALESCE(status, 'active'),
           COALESCE(telegram, ''), COALESCE(vk, '')
      INTO user_city, user_name, user_role, user_status,
           user_telegram, user_vk
    FROM public.profiles
    WHERE id = NEW.user_id;

    final_format := CASE
        WHEN lower(COALESCE(NEW.meeting_format, '')) IN ('offline', 'online', 'hybrid')
            THEN lower(NEW.meeting_format)
        WHEN lower(COALESCE(NEW.city, '')) IN ('online', 'онлайн')
            THEN 'online'
        ELSE 'offline'
    END;

    final_city := CASE
        WHEN final_format = 'online' THEN 'Онлайн'
        ELSE COALESCE(NULLIF(NEW.city, ''), NULLIF(user_city, ''), '')
    END;

    final_city_key := CASE
        WHEN final_format = 'online' THEN 'online'
        ELSE regexp_replace(
            regexp_replace(lower(trim(COALESCE(final_city, ''))), '[^a-zа-я0-9]+', '-', 'g'),
            '(^-+|-+$)', '', 'g'
        )
    END;

    final_online_visibility := CASE
        WHEN final_format = 'online' AND lower(COALESCE(NEW.online_visibility, '')) = 'all_cities'
            THEN 'all_cities'
        WHEN final_format = 'online'
            THEN 'online_only'
        ELSE NULL
    END;

    speaker_label := COALESCE(NULLIF(user_name, ''), 'Ведущая');
    IF lower(COALESCE(user_role, '')) = 'intern' THEN
        speaker_label := speaker_label || ' (Стажер)';
    END IF;

    -- ★ phase44: co_hosts (uuid[]) → "Имя1, Имя2" в порядке массива.
    SELECT string_agg(trim(p.name), ', ' ORDER BY ch.ord)
      INTO cohosts_label
    FROM unnest(COALESCE(NEW.co_hosts, '{}'::uuid[])) WITH ORDINALITY AS ch(uid, ord)
    JOIN public.profiles p ON p.id = ch.uid
    WHERE COALESCE(trim(p.name), '') <> '';
    cohosts_label := COALESCE(cohosts_label, '');

    event_day := NEW.date::date;
    event_starts_at := (
        (NEW.date::date::text || ' ' || COALESCE(NULLIF(NEW.time, ''), '00:00'))::timestamp
        AT TIME ZONE COALESCE(NULLIF(NEW.timezone, ''), 'Europe/Moscow')
    );

    IF (NEW.is_public = true AND user_status = 'active') THEN
        IF EXISTS (SELECT 1 FROM public.events WHERE garden_id = NEW.id) THEN
            UPDATE public.events
            SET
                date = to_char(event_day, 'DD.MM.YYYY'),
                day_date = event_day,
                starts_at = event_starts_at,
                title = COALESCE(NEW.title, 'Без названия'),
                time = NEW.time,
                description = COALESCE(NEW.description, ''),
                price = NEW.cost,
                location = NEW.address,
                registration_link = NEW.payment_link,
                image_url = NEW.cover_image,
                image_focus_x = COALESCE(NEW.image_focus_x, 50),
                image_focus_y = COALESCE(NEW.image_focus_y, 50),
                city = final_city,
                city_key = final_city_key,
                meeting_format = final_format,
                online_visibility = final_online_visibility,
                speaker = speaker_label,
                category = 'Встреча',
                host_telegram = user_telegram,
                host_vk       = user_vk,
                co_hosts      = cohosts_label    -- ★ phase44
            WHERE garden_id = NEW.id;
        ELSE
            INSERT INTO public.events (
                garden_id, date, day_date, starts_at, title, time, description,
                price, location, registration_link, image_url, image_focus_x, image_focus_y,
                city, city_key, meeting_format, online_visibility, speaker, category, image_gradient,
                host_telegram, host_vk,
                co_hosts     -- ★ phase44
            ) VALUES (
                NEW.id,
                to_char(event_day, 'DD.MM.YYYY'),
                event_day,
                event_starts_at,
                COALESCE(NEW.title, 'Без названия'),
                NEW.time,
                COALESCE(NEW.description, ''),
                NEW.cost,
                NEW.address,
                NEW.payment_link,
                NEW.cover_image,
                COALESCE(NEW.image_focus_x, 50),
                COALESCE(NEW.image_focus_y, 50),
                final_city,
                final_city_key,
                final_format,
                final_online_visibility,
                speaker_label,
                'Встреча',
                'linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 100%)',
                user_telegram,
                user_vk,
                cohosts_label            -- ★ phase44
            );
        END IF;
    ELSE
        DELETE FROM public.events WHERE garden_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- PART 2: backfill events.co_hosts
-- ─────────────────────────────────────────────────────────────────────
UPDATE public.events e
SET co_hosts = COALESCE((
        SELECT string_agg(trim(p.name), ', ' ORDER BY ch.ord)
        FROM unnest(COALESCE(m.co_hosts, '{}'::uuid[])) WITH ORDINALITY AS ch(uid, ord)
        JOIN public.profiles p ON p.id = ch.uid
        WHERE COALESCE(trim(p.name), '') <> ''
    ), '')
FROM public.meetings m
WHERE e.garden_id = m.id;

-- ─────────────────────────────────────────────────────────────────────
-- PART 3: Timeweb GRANT safety-net (RUNBOOK §1.3)
-- ─────────────────────────────────────────────────────────────────────
SELECT public.ensure_garden_grants();

-- ─────────────────────────────────────────────────────────────────────
-- PART 4: PostgREST schema cache reload
-- ─────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY (вне транзакции)
-- ─────────────────────────────────────────────────────────────────────

\echo === V1: триггер теперь пишет co_hosts ===
SELECT pg_get_functiondef('public.sync_meeting_to_event()'::regprocedure) ~ 'cohosts_label' AS has_cohosts_logic,
       prosecdef AS is_definer
FROM pg_proc WHERE proname='sync_meeting_to_event';
-- ожидание: t, t

\echo === V2: backfill — events.co_hosts непустых == meetings с co_hosts и event ===
SELECT count(*) FILTER (WHERE COALESCE(co_hosts,'') <> '') AS events_with_cohosts,
       count(*) AS events_total
FROM public.events;
-- ожидание (на момент recon): events_with_cohosts = 20 (все meetings с co_hosts публичны и имеют event)

\echo === V3: probe — встреча 341 / event 435 ===
SELECT e.garden_id, e.speaker, e.co_hosts
FROM public.events e WHERE e.garden_id = 341;
-- ожидание: co_hosts = 'Елена Федотова, Мария Романова'
```

---

## Probe-план после 🟢 apply (Layer 1)

1. `VERIFY V1–V3` из миграции (см. выше).
2. **Точечный probe** (read-only): event 435 (garden_id 341) → `co_hosts = 'Елена Федотова, Мария Романова'`; event 244 → `'Мария Романова, Рухшана'`.
3. Опц. live-probe триггера: no-op `UPDATE meetings SET title=title WHERE id=341` → re-fire → co_hosts перезаписан тем же → подтверждает INSERT/UPDATE-ветку. (Это write; делаю только по 🟢.)

---

## Что дальше (после 🟢 Layer 1)

- **Layer 2** (meetings-фронт, отдельный репо): select + `Event.co_hosts?: string` + рендер под speaker + `CACHE_VERSION` v5→v6. Диф отдельно по запросу.
- ⚠ **Phase 4A Step 4 (backfill картинок)** — на паузе до закрытия ANOM-003.

## Чего НЕ делал
Без apply / commit / push. Только read-only probe прода (типы колонок, def триггера, распределение co_hosts). Файл миграции **не создан** — SQL выше это diff, жду 🟢 apply.
