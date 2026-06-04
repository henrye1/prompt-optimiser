-- Prompt Comparer — Storage bucket for run file uploads
--
-- Private bucket. Objects are stored under a per-user prefix: "<auth.uid()>/...".
-- The backend uploads/downloads using the caller's JWT, so these policies
-- restrict each user to their own folder.

insert into storage.buckets (id, name, public)
values ('run-files', 'run-files', false)
on conflict (id) do nothing;

create policy "run_files_read_own" on storage.objects for select to authenticated
  using (bucket_id = 'run-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "run_files_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'run-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "run_files_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'run-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "run_files_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'run-files' and (storage.foldername(name))[1] = auth.uid()::text);
