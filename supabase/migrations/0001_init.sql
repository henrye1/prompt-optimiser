-- Prompt Comparer — core schema
-- Integer serial PKs from 1. created_by is the Supabase auth user (uuid).
-- Soft deletes via deleted_at. Reference tables seeded at the bottom.

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reference / static tables
-- ---------------------------------------------------------------------------
create table public.prompt_type (
  id          serial primary key,
  description text not null unique
);

create table public.run_status (
  id          serial primary key,
  description text not null unique
);

create table public.run_section_status (
  id          serial primary key,
  description text not null unique
);

create table public.run_file_type (
  id          serial primary key,
  description text not null unique
);

-- ---------------------------------------------------------------------------
-- Prompt template
-- ---------------------------------------------------------------------------
create table public.prompt_set (
  id           serial primary key,
  name         text not null,
  created_by   uuid not null default auth.uid() references auth.users(id),
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create table public.prompt (
  id             serial primary key,
  prompt_set_id  integer not null references public.prompt_set(id),
  name           text not null,
  prompt_type_id integer not null references public.prompt_type(id),
  sequence       integer not null default 1
);
create index on public.prompt (prompt_set_id);

create table public.prompt_section (
  id        serial primary key,
  prompt_id integer not null references public.prompt(id),
  title     text not null,
  content   text not null default '',
  sequence  integer not null default 1
);
create index on public.prompt_section (prompt_id);

-- ---------------------------------------------------------------------------
-- Run (generalized "Assessment")
-- ---------------------------------------------------------------------------
create table public.run (
  id            serial primary key,
  name          text not null,
  description   text not null default '',
  prompt_set_id integer not null references public.prompt_set(id),
  run_status_id integer not null references public.run_status(id) default 1,
  created_by    uuid not null default auth.uid() references auth.users(id),
  is_published  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index on public.run (created_by);
create index on public.run (prompt_set_id);

create table public.run_section (
  id                    serial primary key,
  run_id                integer not null references public.run(id),
  prompt_section_id     integer references public.prompt_section(id),
  title                 text not null,
  content               text not null default '',          -- LLM output
  run_section_status_id integer not null references public.run_section_status(id) default 1,
  sequence              integer not null default 1,
  error_message         text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on public.run_section (run_id);

create table public.run_file (
  id               serial primary key,
  run_id           integer not null references public.run(id),
  run_file_type_id integer not null references public.run_file_type(id),
  file_name        text not null,
  mime_type        text not null,
  storage_path     text not null,
  markdown_content text,                                   -- cached markitdown output
  is_example_file  boolean not null default false,
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index on public.run_file (run_id);

create table public.run_log (
  id         serial primary key,
  run_id     integer not null references public.run(id),
  level      text not null default 'info',
  message    text not null,
  created_at timestamptz not null default now()
);
create index on public.run_log (run_id);

-- ---------------------------------------------------------------------------
-- Comparison
-- ---------------------------------------------------------------------------
create table public.run_comparison (
  id           serial primary key,
  name         text not null,
  created_by   uuid not null default auth.uid() references auth.users(id),
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index on public.run_comparison (created_by);

create table public.run_comparison_run (
  run_comparison_id integer not null references public.run_comparison(id),
  run_id            integer not null references public.run(id),
  primary key (run_comparison_id, run_id)
);

create table public.run_comparison_section (
  id                serial primary key,
  run_comparison_id integer not null references public.run_comparison(id),
  run_section_id_a  integer references public.run_section(id),
  run_section_id_b  integer references public.run_section(id),
  commentary        text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on public.run_comparison_section (run_comparison_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger trg_prompt_set_updated   before update on public.prompt_set            for each row execute function public.set_updated_at();
create trigger trg_run_updated           before update on public.run                  for each row execute function public.set_updated_at();
create trigger trg_run_section_updated   before update on public.run_section          for each row execute function public.set_updated_at();
create trigger trg_run_comparison_upd    before update on public.run_comparison       for each row execute function public.set_updated_at();
create trigger trg_run_cmp_section_upd   before update on public.run_comparison_section for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Seed reference data (ids start at 1 in listed order)
-- ---------------------------------------------------------------------------
insert into public.prompt_type (description) values
  ('Assessment'), ('Audit'), ('System');

insert into public.run_status (description) values
  ('New'), ('In-progress'), ('Failed'), ('Complete');

insert into public.run_section_status (description) values
  ('New'), ('In-progress'), ('Failed'), ('Complete');

insert into public.run_file_type (description) values
  ('Document'), ('Spreadsheet'), ('Example');
