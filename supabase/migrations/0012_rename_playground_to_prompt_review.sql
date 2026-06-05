-- Rename the "Playground" module to "Prompt Review".
--
-- 0011 created the playground_* objects (and was already applied). This migration
-- renames the tables, columns, triggers, policies, functions and the card view to
-- prompt_review_*. Forward-only: it runs after 0011 on every environment, so both
-- already-migrated and fresh databases converge on the prompt_review_* schema.

-- ---- tables ----
alter table public.playground_session rename to prompt_review_session;
alter table public.playground_prompt  rename to prompt_review_prompt;
alter table public.playground_section rename to prompt_review_section;

-- ---- foreign-key columns ----
alter table public.prompt_review_prompt  rename column playground_session_id to prompt_review_session_id;
alter table public.prompt_review_section rename column playground_prompt_id  to prompt_review_prompt_id;

-- ---- triggers ----
alter trigger trg_playground_session_updated on public.prompt_review_session rename to trg_prompt_review_session_updated;
alter trigger trg_playground_prompt_updated  on public.prompt_review_prompt  rename to trg_prompt_review_prompt_updated;
alter trigger trg_playground_section_updated on public.prompt_review_section rename to trg_prompt_review_section_updated;

-- ---- drop old view, policies and functions (policies depend on functions) ----
drop view if exists public.playground_session_card;

drop policy if exists playground_session_select on public.prompt_review_session;
drop policy if exists playground_session_insert on public.prompt_review_session;
drop policy if exists playground_session_update on public.prompt_review_session;
drop policy if exists playground_prompt_select  on public.prompt_review_prompt;
drop policy if exists playground_prompt_write   on public.prompt_review_prompt;
drop policy if exists playground_section_select on public.prompt_review_section;
drop policy if exists playground_section_write  on public.prompt_review_section;

drop function if exists public.playground_session_visible(integer);
drop function if exists public.playground_session_owned(integer);

-- ---- recreate functions with the new names ----
create or replace function public.prompt_review_session_visible(p_id integer)
returns boolean language sql security invoker stable as $$
  select exists (
    select 1 from public.prompt_review_session s
    where s.id = p_id
      and (s.created_by = auth.uid() or (s.is_published and s.deleted_at is null)));
$$;

create or replace function public.prompt_review_session_owned(p_id integer)
returns boolean language sql security invoker stable as $$
  select exists (
    select 1 from public.prompt_review_session s
    where s.id = p_id and s.created_by = auth.uid());
$$;

-- ---- recreate policies with the new names/columns ----
create policy prompt_review_session_select on public.prompt_review_session for select to authenticated
  using (created_by = auth.uid() or (is_published and deleted_at is null));
create policy prompt_review_session_insert on public.prompt_review_session for insert to authenticated
  with check (created_by = auth.uid());
create policy prompt_review_session_update on public.prompt_review_session for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy prompt_review_prompt_select on public.prompt_review_prompt for select to authenticated
  using (public.prompt_review_session_visible(prompt_review_session_id));
create policy prompt_review_prompt_write on public.prompt_review_prompt for all to authenticated
  using (public.prompt_review_session_owned(prompt_review_session_id))
  with check (public.prompt_review_session_owned(prompt_review_session_id));

create policy prompt_review_section_select on public.prompt_review_section for select to authenticated
  using (exists (
    select 1 from public.prompt_review_prompt p
    where p.id = prompt_review_section.prompt_review_prompt_id
      and public.prompt_review_session_visible(p.prompt_review_session_id)));
create policy prompt_review_section_write on public.prompt_review_section for all to authenticated
  using (exists (
    select 1 from public.prompt_review_prompt p
    where p.id = prompt_review_section.prompt_review_prompt_id
      and public.prompt_review_session_owned(p.prompt_review_session_id)))
  with check (exists (
    select 1 from public.prompt_review_prompt p
    where p.id = prompt_review_section.prompt_review_prompt_id
      and public.prompt_review_session_owned(p.prompt_review_session_id)));

-- ---- recreate the card view with the new name ----
create or replace view public.prompt_review_session_card with (security_invoker = true) as
select
  ps.id,
  ps.name,
  ps.source_prompt_set_id,
  ps.is_published,
  ps.created_by,
  ps.created_at,
  ps.updated_at,
  ps.deleted_at,
  src.name as source_name,
  m.name   as model_name,
  prov.name as provider_name,
  (select count(*) from public.prompt_review_prompt p
     where p.prompt_review_session_id = ps.id) as prompt_count,
  (select count(*) from public.prompt_review_section sec
     join public.prompt_review_prompt p on p.id = sec.prompt_review_prompt_id
    where p.prompt_review_session_id = ps.id) as section_count
from public.prompt_review_session ps
left join public.prompt_set src on src.id = ps.source_prompt_set_id
left join public.ai_model m on m.id = ps.ai_model_id
left join public.ai_model_provider prov on prov.id = m.ai_model_provider_id;

grant select on public.prompt_review_session_card to authenticated;
