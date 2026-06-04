-- AI models: a named model under a provider, with an optional per-user API key.
-- Owner-private (no publish/sharing) so API keys are only ever visible to their owner.

create table public.ai_model (
  id                   serial primary key,
  name                 text not null,
  ai_model_provider_id integer not null references public.ai_model_provider(id),
  api_key              text,
  created_by           uuid not null default auth.uid() references auth.users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index on public.ai_model (created_by);
create index on public.ai_model (ai_model_provider_id);

create trigger trg_ai_model_updated before update on public.ai_model
  for each row execute function public.set_updated_at();

alter table public.ai_model enable row level security;
create policy ai_model_select on public.ai_model for select to authenticated
  using (created_by = auth.uid());
create policy ai_model_insert on public.ai_model for insert to authenticated
  with check (created_by = auth.uid());
create policy ai_model_update on public.ai_model for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy ai_model_delete on public.ai_model for delete to authenticated
  using (created_by = auth.uid());
