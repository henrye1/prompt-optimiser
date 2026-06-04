-- AI model providers (reference table). Read-only to authenticated users,
-- following the same pattern as prompt_type / run_status.

create table public.ai_model_provider (
  id   serial primary key,
  name text not null unique
);

insert into public.ai_model_provider (name) values
  ('Google'), ('Anthropic');

alter table public.ai_model_provider enable row level security;
create policy ref_read on public.ai_model_provider for select to authenticated using (true);
