import { Injectable, computed, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { SupabaseClientProvider } from './supabase.client';

/**
 * Holds the current Supabase auth session as a signal and exposes
 * email/password sign-in, sign-up, and sign-out.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly sessionSig = signal<Session | null>(null);

  readonly session = this.sessionSig.asReadonly();
  readonly isAuthenticated = computed(() => this.sessionSig() !== null);
  readonly user = computed(() => this.sessionSig()?.user ?? null);

  constructor(private readonly supa: SupabaseClientProvider) {
    // Seed from any persisted session, then track changes.
    void this.supa.client.auth.getSession().then(({ data }) => {
      this.sessionSig.set(data.session);
    });
    this.supa.client.auth.onAuthStateChange((_event, session) => {
      this.sessionSig.set(session);
    });
  }

  get accessToken(): string | null {
    return this.sessionSig()?.access_token ?? null;
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.supa.client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }

  async signUp(email: string, password: string): Promise<void> {
    const { error } = await this.supa.client.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
  }

  async signOut(): Promise<void> {
    await this.supa.client.auth.signOut();
  }
}
