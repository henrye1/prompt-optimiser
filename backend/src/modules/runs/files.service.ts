import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/env.js';
import { HttpError } from '../../middleware/error.js';
import { throwOnError, requireFound } from '../../lib/supabaseError.js';

const BUCKET = env.supabase.storageBucket;

export interface UploadInput {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  runFileTypeId: number;
  isExampleFile: boolean;
}

/**
 * Uploads a file to Storage under `<userId>/run-<runId>/...` (required by the
 * storage RLS policy) and records a run_file row. The markdown is converted
 * lazily at execution time and cached on the row.
 */
export async function uploadRunFile(
  db: SupabaseClient,
  userId: string,
  runId: number,
  input: UploadInput,
) {
  const safeName = input.fileName.replace(/[^\w.\-]+/g, '_');
  const path = `${userId}/run-${runId}/${Date.now()}-${safeName}`;

  const { error: upErr } = await db.storage
    .from(BUCKET)
    .upload(path, input.buffer, { contentType: input.mimeType, upsert: false });
  if (upErr) throw new HttpError(500, `Upload failed: ${upErr.message}`);

  const { data, error } = await db
    .from('run_file')
    .insert({
      run_id: runId,
      run_file_type_id: input.runFileTypeId,
      file_name: input.fileName,
      mime_type: input.mimeType,
      storage_path: path,
      is_example_file: input.isExampleFile,
    })
    .select('id, file_name, mime_type, run_file_type_id, is_example_file, created_at')
    .single();
  throwOnError(error, 'Record run file');
  return data;
}

export async function listRunFiles(db: SupabaseClient, runId: number) {
  const { data, error } = await db
    .from('run_file')
    .select('id, file_name, mime_type, run_file_type_id, is_example_file, created_at')
    .eq('run_id', runId)
    .is('deleted_at', null)
    .order('created_at');
  throwOnError(error, 'List run files');
  return data ?? [];
}

export async function softDeleteRunFile(db: SupabaseClient, fileId: number): Promise<void> {
  const { data, error } = await db
    .from('run_file')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', fileId)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();
  throwOnError(error, 'Delete run file');
  requireFound(data, 'File');
}

/** Active files for a run, including any cached markdown. */
export async function getActiveFiles(db: SupabaseClient, runId: number) {
  const { data, error } = await db
    .from('run_file')
    .select('id, file_name, storage_path, markdown_content')
    .eq('run_id', runId)
    .is('deleted_at', null)
    .order('created_at');
  throwOnError(error, 'Load run files');
  return (data ?? []) as {
    id: number;
    file_name: string;
    storage_path: string;
    markdown_content: string | null;
  }[];
}

export async function downloadFile(db: SupabaseClient, storagePath: string): Promise<Buffer> {
  const { data, error } = await db.storage.from(BUCKET).download(storagePath);
  if (error || !data) throw new HttpError(500, `Download failed: ${error?.message ?? 'no data'}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function cacheMarkdown(db: SupabaseClient, fileId: number, markdown: string): Promise<void> {
  const { error } = await db.from('run_file').update({ markdown_content: markdown }).eq('id', fileId);
  throwOnError(error, 'Cache markdown');
}
