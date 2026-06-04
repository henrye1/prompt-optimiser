import { Injectable } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/**
 * Thin singleton wrapper around the Supabase browser client. The client
 * persists the session in localStorage and refreshes tokens automatically.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseClientProvider {
  readonly client: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseAnonKey,
  );
}
