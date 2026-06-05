-- Playground (renamed to "Prompt Review" in 0012): load a prompt set as ONE
-- editable document, then audit, clean, restructure and improve it — and publish
-- a new set.
--
-- A session holds a working copy of the document: playground_prompt rows (typed
-- System/Assessment/Audit/Summary) each with playground_section rows (title +
-- content). Editing mutates the working copy only; "Publish as set" writes it
-- out as a brand-new prompt_set the user owns.
--
-- RLS mirrors the optimizer: owner sees own rows (any soft-delete state); others
-- see published, non-deleted sessions. Writes are owner-only.
--
-- NOTE: 0012 renames all of these objects to prompt_review_*. This migration is
-- kept as-is because it was already applied; do not edit it.

-- ---------------------------------------------------------------------------
-- 'Summary' prompt type (Playground supports an extra type; harmless elsewhere)
-- ---------------------------------------------------------------------------
insert into public.prompt_type (description) values ('Summary')
  on conflict (description) do nothing;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.playground_session (
  id                   serial primary key,
  name                 text not null,
  source_prompt_set_id integer references public.prompt_set(id),  -- null = blank document
  ai_model_id          integer references public.ai_model(id),
  created_by           uuid not null default auth.uid() references auth.users(id),
  is_published         boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);
create index on public.playground_session (created_by);

-- Working-copy prompts (the editable document).
create table public.playground_prompt (
  id                    serial primary key,
  playground_session_id integer not null references public.playground_session(id) on delete cascade,
  name                  text not null default 'New prompt',
  prompt_type_id        integer not null references public.prompt_type(id),
  sequence              integer not null default 1,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on public.playground_prompt (playground_session_id);

create table public.playground_section (
  id                  serial primary key,
  playground_prompt_id integer not null references public.playground_prompt(id) on delete cascade,
  title               text not null default 'New section',
  content             text not null default '',
  sequence            integer not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on public.playground_section (playground_prompt_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger trg_playground_session_updated before update on public.playground_session
  for each row execute function public.set_updated_at();
create trigger trg_playground_prompt_updated before update on public.playground_prompt
  for each row execute function public.set_updated_at();
create trigger trg_playground_section_updated before update on public.playground_section
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.playground_session enable row level security;
create policy playground_session_select on public.playground_session for select to authenticated
  using (created_by = auth.uid() or (is_published and deleted_at is null));
create policy playground_session_insert on public.playground_session for insert to authenticated
  with check (created_by = auth.uid());
create policy playground_session_update on public.playground_session for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

create or replace function public.playground_session_visible(p_id integer)
returns boolean language sql security invoker stable as $$
  select exists (
    select 1 from public.playground_session s
    where s.id = p_id
      and (s.created_by = auth.uid() or (s.is_published and s.deleted_at is null)));
$$;

create or replace function public.playground_session_owned(p_id integer)
returns boolean language sql security invoker stable as $$
  select exists (
    select 1 from public.playground_session s
    where s.id = p_id and s.created_by = auth.uid());
$$;

alter table public.playground_prompt enable row level security;
create policy playground_prompt_select on public.playground_prompt for select to authenticated
  using (public.playground_session_visible(playground_session_id));
create policy playground_prompt_write on public.playground_prompt for all to authenticated
  using (public.playground_session_owned(playground_session_id))
  with check (public.playground_session_owned(playground_session_id));

alter table public.playground_section enable row level security;
create policy playground_section_select on public.playground_section for select to authenticated
  using (exists (
    select 1 from public.playground_prompt p
    where p.id = playground_section.playground_prompt_id
      and public.playground_session_visible(p.playground_session_id)));
create policy playground_section_write on public.playground_section for all to authenticated
  using (exists (
    select 1 from public.playground_prompt p
    where p.id = playground_section.playground_prompt_id
      and public.playground_session_owned(p.playground_session_id)))
  with check (exists (
    select 1 from public.playground_prompt p
    where p.id = playground_section.playground_prompt_id
      and public.playground_session_owned(p.playground_session_id)));

-- ---------------------------------------------------------------------------
-- Card view for the Playground list (security_invoker keeps RLS in force).
-- ---------------------------------------------------------------------------
create or replace view public.playground_session_card with (security_invoker = true) as
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
  (select count(*) from public.playground_prompt p
     where p.playground_session_id = ps.id) as prompt_count,
  (select count(*) from public.playground_section sec
     join public.playground_prompt p on p.id = sec.playground_prompt_id
    where p.playground_session_id = ps.id) as section_count
from public.playground_session ps
left join public.prompt_set src on src.id = ps.source_prompt_set_id
left join public.ai_model m on m.id = ps.ai_model_id
left join public.ai_model_provider prov on prov.id = m.ai_model_provider_id;

grant select on public.playground_session_card to authenticated;
