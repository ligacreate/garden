-- Run in staging database with a real test user.
-- Replace placeholders:
--   :user_id, :email, :customer_id, :subscription_id

-- 0) Baseline
select id, role, access_status, subscription_status, paid_until, session_version
from public.profiles
where id = :'user_id';

-- 1) Active subscription, access allowed
update public.profiles
set access_status = 'active',
    subscription_status = 'active',
    paid_until = now() + interval '30 days'
where id = :'user_id';

select id, access_status, subscription_status, paid_until, session_version
from public.profiles
where id = :'user_id';

-- 2) finish/deactivation -> blocked and session_version bumped
-- Send webhook (example):
-- curl -X POST "$PUSH_URL/api/billing/prodamus/webhook" \
--   -H "Content-Type: application/json" \
--   -d '{"event":"finish","event_id":"evt-finish-001","email":":email","customer_id":":customer_id","subscription_id":":subscription_id"}'

select id, access_status, subscription_status, paid_until, session_version, last_prodamus_event
from public.profiles
where id = :'user_id';

select provider, event_name, external_id, is_processed, error_text, created_at
from public.billing_webhook_logs
where provider = 'prodamus'
order by id desc
limit 5;

-- 3) auto_payment after block -> access restored, paused_manual remains paused_manual
-- curl -X POST "$PUSH_URL/api/billing/prodamus/webhook" \
--   -H "Content-Type: application/json" \
--   -d '{"event":"auto_payment","event_id":"evt-pay-001","email":":email","customer_id":":customer_id","subscription_id":":subscription_id","paid_until":"2030-12-31T00:00:00Z"}'

select id, access_status, subscription_status, paid_until, session_version, last_prodamus_event
from public.profiles
where id = :'user_id';

select provider, event_name, external_id, is_processed, error_text, created_at
from public.billing_webhook_logs
where provider = 'prodamus'
order by id desc
limit 10;

-- 4) paused_manual should NOT auto-open on payment
update public.profiles
set access_status = 'paused_manual',
    subscription_status = 'active'
where id = :'user_id';

-- curl -X POST "$PUSH_URL/api/billing/prodamus/webhook" \
--   -H "Content-Type: application/json" \
--   -d '{"event":"auto_payment","event_id":"evt-pay-002","email":":email","customer_id":":customer_id","subscription_id":":subscription_id","paid_until":"2030-12-31T00:00:00Z"}'

select id, access_status, subscription_status, paid_until, session_version, last_prodamus_event
from public.profiles
where id = :'user_id';
