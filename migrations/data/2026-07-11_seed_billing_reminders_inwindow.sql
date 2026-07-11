-- ОДНОРАЗОВЫЙ seed (не миграция схемы) — запустить ОДИН РАЗ, ДО первого тика
-- новой billing-спеки (т.е. до rsync+restart push-server).
--
-- Зачем: 7 подписчиков уже В окне [0,7] дней на момент выката, но не на точных
-- порогах. Без seed первый тик отправил бы им Текст-1 с НЕВЕРНОЙ цифрой в теме
-- (напр. «через 7 дней», когда осталось 5). Помечаем как «уже отправленные» те
-- пороги, что человек УЖЕ прошёл (days_left < threshold). Тогда первый тик
-- разошлёт только точные ещё-впереди пороги + T-0 («истекла»).
--
-- Правило: seed порог t, если (paid_until::date - current_date) < t.
--   days_left=5 → seed {7}      → тик пошлёт «3 дня» когда дойдёт, T-0 в день-0.
--   days_left=3 → seed {7}      → тик пошлёт точный «3 дня» (3<3 ложь — не сидируем).
--   days_left=2 → seed {7,3}    → тик пошлёт только T-0 «истекла».
--   days_left=7 → seed {}       → тик пошлёт точный «7 дней».
-- Порог 0 никогда не сидируется (в окне days_left>=0 → 0<0 ложь) → T-0 всем доступен.
--
-- ON CONFLICT DO NOTHING — идемпотентно (повторный запуск безопасен).
-- cycle_date = paid_until::date — тот же ключ, что кладёт движок → дедуп совпадёт.

insert into public.reminders_sent (kind, profile_id, threshold, cycle_date, channels)
select 'billing_reminder',
       p.id,
       thr.t::text,
       p.paid_until::date,
       '{email}'::text[]
  from public.profiles p
  cross join (values (7), (3), (0)) as thr(t)
 where p.role not in ('admin','applicant')
   and p.subscription_status = 'active'
   and coalesce(p.auto_pause_exempt, false) = false
   and p.access_status <> 'paused_manual'
   and p.paid_until is not null
   and (p.paid_until::date - current_date) between 0 and 7   -- только текущие in-window
   and (p.paid_until::date - current_date) < thr.t           -- уже пройденные пороги
on conflict (kind, profile_id, threshold, cycle_date) do nothing;
