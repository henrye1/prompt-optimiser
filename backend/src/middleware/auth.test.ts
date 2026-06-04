import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { Request, Response } from 'express';

beforeAll(() => {
  process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
  process.env.SUPABASE_ANON_KEY ??= 'test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service';
  process.env.GEMINI_API_KEY ??= 'test-gemini';
});

function mockRes(): Response {
  return {} as Response;
}

describe('requireAuth', () => {
  it('rejects when no Authorization header is present', async () => {
    const { requireAuth } = await import('./auth.js');
    const next = vi.fn();
    const handler = requireAuth(() => {
      throw new Error('client factory should not be called');
    });

    await handler({ headers: {} } as Request, mockRes(), next);

    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({ status: 401 });
  });

  it('rejects when the token is invalid', async () => {
    const { requireAuth } = await import('./auth.js');
    const next = vi.fn();
    const fakeClient = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'bad' } }) },
    };
    const handler = requireAuth(() => fakeClient as never);

    await handler(
      { headers: { authorization: 'Bearer bad-token' } } as Request,
      mockRes(),
      next,
    );

    expect(next.mock.calls[0][0]).toMatchObject({ status: 401 });
  });

  it('attaches userId, accessToken and client on success', async () => {
    const { requireAuth } = await import('./auth.js');
    const next = vi.fn();
    const fakeClient = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null }) },
    };
    const req = { headers: { authorization: 'Bearer good-token' } } as Request;
    const handler = requireAuth(() => fakeClient as never);

    await handler(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith();
    expect(req.userId).toBe('user-123');
    expect(req.accessToken).toBe('good-token');
    expect(req.supabase).toBe(fakeClient);
  });
});
