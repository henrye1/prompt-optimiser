-- Run timing + token usage, and a card view powering the Runs list.

alter table public.run add column if not exists started_at    timestamptz;
alter table public.run add column if not exists completed_at  timestamptz;
alter table public.run add column if not exists input_tokens  integer not null default 0;
alter table public.run add column if not exists output_tokens integer not null default 0;

-- security_invoker so base-table RLS still scopes rows (own + published runs).
create or replace view public.run_card with (security_invoker = true) as
select
  r.id,
  r.name,
  r.run_status_id,
  r.is_published,
  r.created_by,
  r.created_at,
  r.started_at,
  r.completed_at,
  r.input_tokens,
  r.output_tokens,
  r.deleted_at,
  ps.name as prompt_set_name,
  m.name as model_name,
  mp.name as provider_name,
  (select count(*) from public.run_section s where s.run_id = r.id) as section_total,
  (select count(*) from public.run_section s where s.run_id = r.id and s.run_section_status_id = 4) as section_complete,
  (select s.title from public.run_section s
     where s.run_id = r.id and s.run_section_status_id = 2
     order by s.sequence limit 1) as running_section,
  (select l.message from public.run_log l
     where l.run_id = r.id and l.level = 'error'
     order by l.created_at desc limit 1) as last_error
from public.run r
left join public.prompt_set ps on ps.id = r.prompt_set_id
left join public.ai_model m on m.id = r.ai_model_id
left join public.ai_model_provider mp on mp.id = m.ai_model_provider_id;

grant select on public.run_card to authenticated;
