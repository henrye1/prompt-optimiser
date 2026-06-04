import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

/**
 * Per-request client built from the caller's JWT. RLS policies apply because
 * auth.uid() resolves to the logged-in user. Use this for all user-scoped data
 * access so ownership/publish/soft-delete rules are enforced by Postgres.
 */
export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(env.supabase.url, env.supabase.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Service-role client. Bypasses RLS — use ONLY for admin/seed/maintenance,
 * never to serve a user request directly.
 */
export function createServiceClient(): SupabaseClient {
  return createClient(env.supabase.url, env.supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
