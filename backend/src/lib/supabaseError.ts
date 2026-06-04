import type { PostgrestError } from '@supabase/supabase-js';
import { HttpError } from '../middleware/error.js';

/**
 * Translates a Supabase/PostgREST error into an HttpError. RLS denials surface
 * as empty results rather than errors, so callers also null-check their data.
 */
export function throwOnError(error: PostgrestError | null, context: string): void {
  if (!error) return;
  // 23xxx = integrity violations (e.g. FK), surface as 400.
  if (error.code?.startsWith('23')) {
    throw new HttpError(400, `${context}: ${error.message}`);
  }
  throw new HttpError(500, `${context}: ${error.message}`);
}

/** Throws 404 when a required single row was not found / not visible. */
export function requireFound<T>(row: T | null, what: string): T {
  if (row === null || row === undefined) {
    throw new HttpError(404, `${what} not found`);
  }
  return row;
}
