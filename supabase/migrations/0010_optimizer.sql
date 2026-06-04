-- Optimizer: tune a prompt set's section prompts against real documents.
--
-- A session snapshots a prompt set's sections (System + Assessment/Audit). The
-- user edits each section's prompt and reruns it (Assessment/Audit only) to see
-- the new output; every run is kept as history. Edits live ONLY in the session
-- until "Save to prompt set", which writes them out as a NEW VERSION of the set.
--
-- RLS mirrors runs: owner sees own rows (any soft-delete state); others see
-- published, non-deleted rows. Writes are owner-only.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.optimizer_session (
  id            serial primary key,
  name          text not null,
  prompt_set_id integer not null references public.prompt_set(id),
  ai_model_id   integer references public.ai_model(id),
  created_by    uuid not null default auth.uid() references auth.users(id),
  is_published  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index on public.optimizer_session (created_by);
create index on public.optimizer_session (prompt_set_id);

-- One row per prompt_section of the set, with the editable (tuned) prompt.
create table public.optimizer_section (
  id                   serial primary key,
  optimizer_session_id integer not null references public.optimizer_session(id),
  prompt_section_id    integer references public.prompt_section(id),
  prompt_name          text not null,                 -- parent prompt name (e.g. "Liquidity")
  prompt_type_id       integer not null references public.prompt_type(id),
  prompt_sequence      integer not null default 1,    -- parent prompt order
  title                text not null,                 -- section title (e.g. "Current ratio")
  sequence             integer not null default 1,    -- section order within the prompt
  original_content     text not null default '',      -- snapshot at session creation (baseline)
  current_content      text not null default '',      -- the tuned prompt content
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index on public.optimizer_section (optimizer_session_id);

-- History: one row per "Rerun analysis" of a section.
create table public.optimizer_section_run (
  id                   serial primary key,
  optimizer_section_id integer not null references public.optimizer_section(id),
  prompt_content       text not null,                 -- prompt text used (for "Restore this prompt")
  output               text not null default '',      -- LLM output
  input_tokens         integer not null default 0,
  output_tokens        integer not null default 0,
  latency_ms           integer not null default 0,
  ai_model_id          integer references public.ai_model(id),
  model_name           text,                          -- denormalised for history chips
  status               text not null default 'complete',  -- 'complete' | 'failed'
  error_message        text,
  created_at           timestamptz not null default now()
);
create index on public.optimizer_section_run (optimizer_section_id);

-- Uploaded source documents (same shape as run_file; reuses run_file_type).
create table public.optimizer_file (
  id                   serial primary key,
  optimizer_session_id integer not null references public.optimizer_session(id),
  run_file_type_id     integer not null references public.run_file_type(id),
  file_name            text not null,
  mime_type            text not null,
  storage_path         text not null,
  markdown_content     text,
  is_example_file      boolean not null default false,
  created_at           timestamptz not null default now(),
  deleted_at           timestamptz
);
create index on public.optimizer_file (optimizer_session_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger trg_optimizer_session_updated before update on public.optimizer_session
  for each row execute function public.set_updated_at();
create trigger trg_optimizer_section_updated before update on public.optimizer_section
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.optimizer_session enable row level security;
create policy optimizer_session_select on public.optimizer_session for select to authenticated
  using (created_by = auth.uid() or (is_published and deleted_at is null));
create policy optimizer_session_insert on public.optimizer_session for insert to authenticated
  with check (created_by = auth.uid());
create policy optimizer_session_update on public.optimizer_session for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

create or replace function public.optimizer_session_visible(p_id integer)
returns boolean language sql security invoker stable as $$
  select exists (
    select 1 from public.optimizer_session s
    where s.id = p_id
      and (s.created_by = auth.uid() or (s.is_published and s.deleted_at is null)));
$$;

create or replace function public.optimizer_session_owned(p_id integer)
returns boolean language sql security invoker stable as $$
  select exists (
    select 1 from public.optimizer_session s
    where s.id = p_id and s.created_by = auth.uid());
$$;

alter table public.optimizer_section enable row level security;
create policy optimizer_section_select on public.optimizer_section for select to authenticated
  using (public.optimizer_session_visible(optimizer_session_id));
create policy optimizer_section_write on public.optimizer_section for all to authenticated
  using (public.optimizer_session_owned(optimizer_session_id))
  with check (public.optimizer_session_owned(optimizer_session_id));

alter table public.optimizer_section_run enable row level security;
create policy optimizer_section_run_select on public.optimizer_section_run for select to authenticated
  using (exists (
    select 1 from public.optimizer_section sec
    where sec.id = optimizer_section_run.optimizer_section_id
      and public.optimizer_session_visible(sec.optimizer_session_id)));
create policy optimizer_section_run_write on public.optimizer_section_run for all to authenticated
  using (exists (
    select 1 from public.optimizer_section sec
    where sec.id = optimizer_section_run.optimizer_section_id
      and public.optimizer_session_owned(sec.optimizer_session_id)))
  with check (exists (
    select 1 from public.optimizer_section sec
    where sec.id = optimizer_section_run.optimizer_section_id
      and public.optimizer_session_owned(sec.optimizer_session_id)));

alter table public.optimizer_file enable row level security;
create policy optimizer_file_select on public.optimizer_file for select to authenticated
  using (public.optimizer_session_owned(optimizer_session_id)
         or (deleted_at is null and public.optimizer_session_visible(optimizer_session_id)));
create policy optimizer_file_write on public.optimizer_file for all to authenticated
  using (public.optimizer_session_owned(optimizer_session_id))
  with check (public.optimizer_session_owned(optimizer_session_id));

-- ---------------------------------------------------------------------------
-- Card view for the Optimizer list (security_invoker keeps RLS in force).
-- ---------------------------------------------------------------------------
create or replace view public.optimizer_session_card with (security_invoker = true) as
select
  os.id,
  os.name,
  os.prompt_set_id,
  os.is_published,
  os.created_by,
  os.created_at,
  os.updated_at,
  os.deleted_at,
  ps.name as prompt_set_name,
  m.name  as model_name,
  prov.name as provider_name,
  (select count(*) from public.optimizer_file f
     where f.optimizer_session_id = os.id and f.run_file_type_id = 1 and f.deleted_at is null) as financial_count,
  (select count(*) from public.optimizer_file f
     where f.optimizer_session_id = os.id and f.run_file_type_id = 2 and f.deleted_at is null) as rating_count,
  (select count(*) from public.optimizer_section_run r
     join public.optimizer_section sec on sec.id = r.optimizer_section_id
    where sec.optimizer_session_id = os.id) as run_count,
  (select max(r.created_at) from public.optimizer_section_run r
     join public.optimizer_section sec on sec.id = r.optimizer_section_id
    where sec.optimizer_session_id = os.id) as last_run_at
from public.optimizer_session os
left join public.prompt_set ps on ps.id = os.prompt_set_id
left join public.ai_model m on m.id = os.ai_model_id
left join public.ai_model_provider prov on prov.id = m.ai_model_provider_id;

grant select on public.optimizer_session_card to authenticated;
