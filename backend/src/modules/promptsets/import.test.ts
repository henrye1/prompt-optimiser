import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
  process.env.SUPABASE_ANON_KEY ??= 'test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service';
  process.env.GEMINI_API_KEY ??= 'test-gemini';
});

type Result = { data: unknown; error: unknown };
type Write = { table: string; op: string; payload: unknown };

const TYPES = [
  { id: 1, description: 'Assessment' },
  { id: 2, description: 'Audit' },
  { id: 3, description: 'System' },
];

class FakeBuilder {
  private ops: string[] = [];
  private payload: unknown;
  constructor(
    private table: string,
    private resolve: (table: string, ops: string[]) => Result,
    private onWrite: (w: Write) => void,
  ) {}
  private rec(m: string, payload?: unknown) {
    this.ops.push(m);
    if (m === 'insert' || m === 'update') {
      this.payload = payload;
      this.onWrite({ table: this.table, op: m, payload });
    }
    return this;
  }
  select(..._a: unknown[]) { return this.rec('select'); }
  insert(p?: unknown) { return this.rec('insert', p); }
  update(p?: unknown) { return this.rec('update', p); }
  eq(..._a: unknown[]) { return this.rec('eq'); }
  is(..._a: unknown[]) { return this.rec('is'); }
  order(..._a: unknown[]) { return this.rec('order'); }
  limit(..._a: unknown[]) { return this.rec('limit'); }
  maybeSingle() { return this.rec('maybeSingle'); }
  single() { return this.rec('single'); }
  then(onFulfilled: (r: Result) => void) { onFulfilled(this.resolve(this.table, this.ops)); }
}

function makeDb(writes: Write[]) {
  let idSeq = 100;
  const resolve = (table: string, ops: string[]): Result => {
    const has = (m: string) => ops.includes(m);
    if (table === 'prompt_type') return { data: TYPES, error: null };
    if (table === 'prompt_set' && has('insert')) return { data: { id: 1 }, error: null };
    if (table === 'prompt_set' && has('select')) {
      return { data: { id: 1, name: 'x', is_published: false, prompts: [] }, error: null };
    }
    if (has('insert')) return { data: { id: ++idSeq }, error: null };
    return { data: null, error: null };
  };
  return {
    from: (table: string) => new FakeBuilder(table, resolve, (w) => writes.push(w)),
  } as never;
}

describe('importPromptSet', () => {
  it('resolves type names to ids and assigns sequences from array order', async () => {
    const { importPromptSet } = await import('./promptsets.service.js');
    const writes: Write[] = [];
    const payload = {
      name: 'Sample',
      prompts: [
        { name: 'System role', type: 'System', sections: [{ title: 'P', content: 'c' }] },
        { name: 'Liquidity', type: 'assessment', sections: [{ title: 'Q1' }, { title: 'Q2' }] },
      ],
    };

    await importPromptSet(makeDb(writes), payload);

    const promptInserts = writes.filter((w) => w.table === 'prompt').map((w) => w.payload as Record<string, number>);
    expect(promptInserts).toHaveLength(2);
    expect(promptInserts[0]).toMatchObject({ prompt_type_id: 3, sequence: 1 }); // System
    expect(promptInserts[1]).toMatchObject({ prompt_type_id: 1, sequence: 2 }); // Assessment (case-insensitive)

    const sectionInserts = writes.filter((w) => w.table === 'prompt_section');
    expect(sectionInserts).toHaveLength(3);
    // Sequences reset per prompt (1 for first prompt's single section; 1,2 for second).
    expect(sectionInserts.map((w) => (w.payload as { sequence: number }).sequence)).toEqual([1, 1, 2]);
  });

  it('rejects an unknown prompt type with a 400', async () => {
    const { importPromptSet } = await import('./promptsets.service.js');
    const payload = { name: 'Bad', prompts: [{ name: 'X', type: 'Nonsense', sections: [] }] };
    await expect(importPromptSet(makeDb([]), payload)).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a missing name with a 400', async () => {
    const { importPromptSet } = await import('./promptsets.service.js');
    await expect(importPromptSet(makeDb([]), { prompts: [] })).rejects.toMatchObject({ status: 400 });
  });
});
