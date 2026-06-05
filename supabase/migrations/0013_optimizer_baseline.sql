-- Optimizer baseline comparison: a section run can be a "baseline" run — the
-- output of the section's ORIGINAL prompt — kept so the UI can compare it against
-- the latest run of the edited (current) prompt. Baseline runs are excluded from
-- the normal section history.
alter table public.optimizer_section_run
  add column if not exists is_baseline boolean not null default false;
