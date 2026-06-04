-- Prompt Sets landing page: descriptions, a manual version number, and an
-- aggregated "card" view powering the list (prompt/section/type/run counts).

alter table public.prompt_set add column if not exists description text not null default '';
alter table public.prompt_set add column if not exists version integer not null default 1;

-- security_invoker so the base tables' RLS still scopes rows to the caller.
create or replace view public.prompt_set_card with (security_invoker = true) as
select
  ps.id,
  ps.name,
  ps.description,
  ps.version,
  ps.is_published,
  ps.created_by,
  ps.created_at,
  ps.updated_at,
  ps.deleted_at,
  (select count(*) from public.prompt p where p.prompt_set_id = ps.id) as prompt_count,
  (select count(*)
     from public.prompt_section s
     join public.prompt p on p.id = s.prompt_id
    where p.prompt_set_id = ps.id) as section_count,
  (select count(*)
     from public.prompt p
     join public.prompt_type t on t.id = p.prompt_type_id
    where p.prompt_set_id = ps.id and t.description = 'System') as system_count,
  (select count(*)
     from public.prompt p
     join public.prompt_type t on t.id = p.prompt_type_id
    where p.prompt_set_id = ps.id and t.description = 'Assessment') as assessment_count,
  (select count(*)
     from public.prompt p
     join public.prompt_type t on t.id = p.prompt_type_id
    where p.prompt_set_id = ps.id and t.description = 'Audit') as audit_count,
  (select count(*) from public.run r where r.prompt_set_id = ps.id and r.deleted_at is null) as run_count
from public.prompt_set ps;

grant select on public.prompt_set_card to authenticated;
