import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// Provide env so config/env.ts validation passes when app modules load.
beforeAll(() => {
  process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
  process.env.SUPABASE_ANON_KEY ??= 'test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service';
  process.env.GEMINI_API_KEY ??= 'test-gemini';
});

describe('health endpoint', () => {
  it('returns ok', async () => {
    const { createApp } = await import('./app.js');
    const app: Express = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
