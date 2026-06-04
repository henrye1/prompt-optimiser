import type { SupabaseClient } from '@supabase/supabase-js';

declare global {
  namespace Express {
    interface Request {
      /** Authenticated user's id (Supabase auth.uid). Set by requireAuth. */
      userId?: string;
      /** Raw access token from the Authorization header. Set by requireAuth. */
      accessToken?: string;
      /** Per-request Supabase client bound to the caller's JWT (RLS applies). */
      supabase?: SupabaseClient;
    }
  }
}

export {};
