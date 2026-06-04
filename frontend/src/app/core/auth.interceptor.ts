import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

/**
 * Attaches the Supabase access token as a Bearer header on requests to our
 * backend API. Leaves requests to other origins (e.g. Supabase itself) alone.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.accessToken;

  if (token && req.url.startsWith(environment.apiBaseUrl)) {
    return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
  }
  return next(req);
};
