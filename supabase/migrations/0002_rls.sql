-- Prompt Comparer — Row Level Security
--
-- Visibility rule:
--   * The OWNER sees their rows regardless of soft-delete state (so they can
--     soft-delete and potentially restore them).
--   * Everyone else sees a row only if it is PUBLISHED and not soft-deleted.
-- Writes are owner-only. Hard DELETE is NOT granted (deletes are soft).
--
-- IMPORTANT: the owner branch deliberately omits `deleted_at IS NULL`. Postgres
-- applies a table's SELECT policy as an implicit check on the *new* row during
-- UPDATE; if the owner branch required `deleted_at IS NULL`, setting deleted_at
-- (the soft delete) would violate it. The application layer filters
-- `deleted_at IS NULL` when listing active rows.
--
-- The backend uses a per-request Supabase client built from the caller's JWT,
-- so auth.uid() resolves to the logged-in user and these policies apply.

-- ---------------------------------------------------------------------------
-- Reference tables: readable by any authenticated user, no writes.
-- ---------------------------------------------------------------------------
alter table public.prompt_type         enable row level security;
alter table public.run_status          enable row level security;
alter table public.run_section_status  enable row level security;
alter table public.run_file_type       enable row level security;

create policy ref_read on public.prompt_type        for select to authenticated using (true);
create policy ref_read on public.run_status         for select to authenticated using (true);
create policy ref_read on public.run_section_status for select to authenticated using (true);
create policy ref_read on public.run_file_type      for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- prompt_set (top-level, owned)
-- ---------------------------------------------------------------------------
alter table public.prompt_set enable row level security;

create policy prompt_set_select on public.prompt_set for select to authenticated
  using (created_by = auth.uid() or (is_published and deleted_at is null));
create policy prompt_set_insert on public.prompt_set for insert to authenticated
  with check (created_by = auth.uid());
create policy prompt_set_update on public.prompt_set for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

-- Is the given prompt set visible to the caller?
create or replace function public.prompt_set_visible(p_id integer)
returns boolean language sql security invoker stable as $$
  select exists (
    select 1 from public.prompt_set ps
    where ps.id = p_id
      and (ps.created_by = auth.uid() or (ps.is_published and ps.deleted_at is null)));
$$;

-- Does the caller own the given prompt set?
create or replace function public.prompt_set_owned(p_id integer)
returns boolean language sql security invoker stable as $$
  select exists (
    select 1 from public.prompt_set ps
    where ps.id = p_id and ps.created_by = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- prompt (child of prompt_set)
-- ---------------------------------------------------------------------------
alter table public.prompt enable row level security;
create policy prompt_select on public.prompt for select to authenticated
  using (public.prompt_set_visible(prompt_set_id));
create policy prompt_write on public.prompt for all to authenticated
  using (public.prompt_set_owned(prompt_set_id)) with check (public.prompt_set_owned(prompt_set_id));

-- ---------------------------------------------------------------------------
-- prompt_section (child of prompt -> prompt_set)
-- ---------------------------------------------------------------------------
alter table public.prompt_section enable row level security;
create policy prompt_section_select on public.prompt_section for select to authenticated
  using (exists (
    select 1 from public.prompt p
    where p.id = prompt_section.prompt_id and public.prompt_set_visible(p.prompt_set_id)));
create policy prompt_section_write on public.prompt_section for all to authenticated
  using (exists (
    select 1 from public.prompt p
    where p.id = prompt_section.prompt_id and public.prompt_set_owned(p.prompt_set_id)))
  with check (exists (
    select 1 from public.prompt p
    where p.id = prompt_section.prompt_id and public.prompt_set_owned(p.prompt_set_id)));

-- ---------------------------------------------------------------------------
-- run (top-level, owned)
-- ---------------------------------------------------------------------------
alter table public.run enable row level security;
create policy run_select on public.run for select to authenticated
  using (created_by = auth.uid() or (is_published and deleted_at is null));
create policy run_insert on public.run for insert to authenticated
  with check (created_by = auth.uid());
create policy run_update on public.run for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

create or replace function public.run_visible(p_run_id integer)
returns boolean language sql security invoker stable as $$
  select exists (
    select 1 from public.run r
    where r.id = p_run_id
      and (r.created_by = auth.uid() or (r.is_published and r.deleted_at is null)));
$$;

create or replace function public.run_owned(p_run_id integer)
returns boolean language sql security invoker stable as $$
  select exists (
    select 1 from public.run r
    where r.id = p_run_id and r.created_by = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- run_section / run_file / run_log (children of run)
-- ---------------------------------------------------------------------------
alter table public.run_section enable row level security;
create policy run_section_select on public.run_section for select to authenticated
  using (public.run_visible(run_id));
create policy run_section_write on public.run_section for all to authenticated
  using (public.run_owned(run_id)) with check (public.run_owned(run_id));

alter table public.run_file enable row level security;
-- Owner always (so they can soft-delete the file); others only if not deleted.
create policy run_file_select on public.run_file for select to authenticated
  using (public.run_owned(run_id) or (deleted_at is null and public.run_visible(run_id)));
create policy run_file_write on public.run_file for all to authenticated
  using (public.run_owned(run_id)) with check (public.run_owned(run_id));

alter table public.run_log enable row level security;
create policy run_log_select on public.run_log for select to authenticated
  using (public.run_visible(run_id));
create policy run_log_write on public.run_log for all to authenticated
  using (public.run_owned(run_id)) with check (public.run_owned(run_id));

-- ---------------------------------------------------------------------------
-- run_comparison (top-level, owned)
-- ---------------------------------------------------------------------------
alter table public.run_comparison enable row level security;
create policy run_comparison_select on public.run_comparison for select to authenticated
  using (created_by = auth.uid() or (is_published and deleted_at is null));
create policy run_comparison_insert on public.run_comparison for insert to authenticated
  with check (created_by = auth.uid());
create policy run_comparison_update on public.run_comparison for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

create or replace function public.comparison_visible(p_id integer)
returns boolean language sql security invoker stable as $$
  select exists (
    select 1 from public.run_comparison c
    where c.id = p_id
      and (c.created_by = auth.uid() or (c.is_published and c.deleted_at is null)));
$$;

create or replace function public.comparison_owned(p_id integer)
returns boolean language sql security invoker stable as $$
  select exists (
    select 1 from public.run_comparison c
    where c.id = p_id and c.created_by = auth.uid());
$$;

alter table public.run_comparison_run enable row level security;
create policy run_comparison_run_select on public.run_comparison_run for select to authenticated
  using (public.comparison_visible(run_comparison_id));
create policy run_comparison_run_write on public.run_comparison_run for all to authenticated
  using (public.comparison_owned(run_comparison_id)) with check (public.comparison_owned(run_comparison_id));

alter table public.run_comparison_section enable row level security;
create policy run_comparison_section_select on public.run_comparison_section for select to authenticated
  using (public.comparison_visible(run_comparison_id));
create policy run_comparison_section_write on public.run_comparison_section for all to authenticated
  using (public.comparison_owned(run_comparison_id)) with check (public.comparison_owned(run_comparison_id));
