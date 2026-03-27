-- Audit restrictive and permissive policies on protected tables.
with protected as (
  select unnest(array[
    'profiles',
    'meetings',
    'events',
    'goals',
    'knowledge_base',
    'practices',
    'clients',
    'scenarios',
    'course_progress',
    'messages',
    'news',
    'birthday_templates',
    'push_subscriptions'
  ]) as table_name
)
select
  p.table_name,
  c.relrowsecurity as rls_enabled,
  pol.policyname,
  pol.permissive,
  pol.cmd,
  pol.roles,
  pol.qual,
  pol.with_check
from protected p
join pg_class c on c.relname = p.table_name
left join pg_policies pol
  on pol.schemaname = 'public'
 and pol.tablename = p.table_name
order by p.table_name, pol.permissive desc, pol.policyname;
