-- Record which connected model a run targets. Nullable: existing runs have none,
-- and execution still falls back to the server Gemini key until per-run model
-- execution is wired up.

alter table public.run add column if not exists ai_model_id integer references public.ai_model(id);
create index if not exists run_ai_model_id_idx on public.run (ai_model_id);
