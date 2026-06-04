import type { Request, Response, NextFunction } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createUserClient } from '../supabase/client.js';
import { HttpError } from './error.js';

type ClientFactory = (accessToken: string) => SupabaseClient;

/**
 * Express middleware that requires a valid Supabase access token.
 *
 * Verifies the Bearer token, then attaches `userId`, `accessToken`, and a
 * per-request Supabase client (bound to the token, so RLS applies) to the
 * request. The client factory is injectable for testing.
 */
export function requireAuth(clientFactory: ClientFactory = createUserClient) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const header = req.headers.authorization ?? '';
      const [scheme, token] = header.split(' ');
      if (scheme !== 'Bearer' || !token) {
        throw new HttpError(401, 'Missing or malformed Authorization header');
      }

      const client = clientFactory(token);
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) {
        throw new HttpError(401, 'Invalid or expired token');
      }

      req.userId = data.user.id;
      req.accessToken = token;
      req.supabase = client;
      next();
    } catch (err) {
      next(err);
    }
  };
}
