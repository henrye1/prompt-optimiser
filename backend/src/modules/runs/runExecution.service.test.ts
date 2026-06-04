import { describe, it, expect, beforeAll } from 'vitest';
import type { LlmService } from '../llm/llm.types.js';

beforeAll(() => {
  process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
  process.env.SUPABASE_ANON_KEY ??= 'test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service';
  process.env.GEMINI_API_KEY ??= 'test-gemini';
});

type Result = { data: unknown; error: unknown };

/** Minimal chainable, awaitable stand-in for the Supabase query builder. */
class FakeBuilder {
  private ops: string[] = [];
  constructor(
    private table: string,
    private resolve: (table: string, ops: string[]) => Result,
    private onWrite: (table: string, op: string, payload: unknown) => void,
  ) {}
  private rec(m: string, payload?: unknown) {
    this.ops.push(m);
    if (m === 'update' || m === 'insert') this.onWrite(this.table, m, payload);
    return this;
  }
  select(..._a: unknown[]) { return this.rec('select'); }
  insert(p?: unknown) { return this.rec('insert', p); }
  update(p?: unknown) { return this.rec('update', p); }
  eq(..._a: unknown[]) { return this.rec('eq'); }
  is(..._a: unknown[]) { return this.rec('is'); }
  order(..._a: unknown[]) { return this.rec('order'); }
  maybeSingle() { return this.rec('maybeSingle'); }
  single() { return this.rec('single'); }
  then(onFulfilled: (r: Result) => void) { onFulfilled(this.resolve(this.table, this.ops)); }
}

const SECTIONS = [
  { id: 1, sequence: 1, prompt_section: { content: 'Q1' } },
  { id: 2, sequence: 2, prompt_section: { content: 'Q2' } },
];

function makeDb(writes: { table: string; op: string; payload: unknown }[]) {
  const resolve = (table: string, ops: string[]): Result => {
    const has = (m: string) => ops.includes(m);
    if (table === 'run' && has('select')) return { data: { prompt_set_id: 10 }, error: null };
    if (table === 'prompt_type') return { data: { id: 3 }, error: null };
    if (table === 'prompt') return { data: [], error: null };
    if (table === 'run_file') return { data: [], error: null };
    if (table === 'run_section' && has('select')) return { data: SECTIONS, error: null };
    return { data: null, error: null };
  };
  return {
    from: (table: string) =>
      new FakeBuilder(table, resolve, (t, op, payload) => writes.push({ table: t, op, payload })),
  } as never;
}

function statusCounts(writes: { table: string; op: string; payload: unknown }[]) {
  const sectionStatuses = writes
    .filter((w) => w.table === 'run_section' && w.op === 'update')
    .map((w) => (w.payload as { run_section_status_id?: number }).run_section_status_id)
    .filter((s): s is number => typeof s === 'number');
  const runStatuses = writes
    .filter((w) => w.table === 'run' && w.op === 'update')
    .map((w) => (w.payload as { run_status_id?: number }).run_status_id)
    .filter((s): s is number => typeof s === 'number');
  return { sectionStatuses, finalRunStatus: runStatuses.at(-1) };
}

describe('executeRun', () => {
  it('marks all sections and the run Complete when generation succeeds', async () => {
    const { executeRun } = await import('./runExecution.service.js');
    const gemini: LlmService = { generate: async () => ({ text: 'OUTPUT', inputTokens: 10, outputTokens: 5 }) };
    const writes: { table: string; op: string; payload: unknown }[] = [];

    await executeRun(makeDb(writes), 1, gemini);

    const { sectionStatuses, finalRunStatus } = statusCounts(writes);
    expect(sectionStatuses.filter((s) => s === 4)).toHaveLength(2); // 2 COMPLETE
    expect(sectionStatuses).not.toContain(3); // no FAILED
    expect(finalRunStatus).toBe(4); // run COMPLETE
  });

  it('marks the failing section Failed and the run Failed', async () => {
    const { executeRun } = await import('./runExecution.service.js');
    const gemini: LlmService = {
      generate: async ({ prompt }) => {
        if (prompt === 'Q2') throw new Error('boom');
        return { text: 'OUTPUT', inputTokens: 10, outputTokens: 5 };
      },
    };
    const writes: { table: string; op: string; payload: unknown }[] = [];

    await executeRun(makeDb(writes), 1, gemini);

    const { sectionStatuses, finalRunStatus } = statusCounts(writes);
    expect(sectionStatuses.filter((s) => s === 4)).toHaveLength(1); // 1 COMPLETE
    expect(sectionStatuses.filter((s) => s === 3)).toHaveLength(1); // 1 FAILED
    expect(finalRunStatus).toBe(3); // run FAILED
  });
});
