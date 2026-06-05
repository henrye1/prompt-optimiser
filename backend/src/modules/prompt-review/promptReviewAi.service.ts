import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from '../../middleware/error.js';
import { throwOnError, requireFound } from '../../lib/supabaseError.js';
import { resolveLlmServiceForPromptReviewSession } from '../llm/llm.factory.js';
import { getSession } from './promptReview.service.js';

interface DocSection {
  ref: number;
  promptId: number;
  promptName: string;
  promptType: string;
  sectionId: number;
  sectionTitle: string;
  content: string;
}
interface DocPrompt {
  id: number;
  name: string;
  promptTypeId: number;
  promptType: string;
  sequence: number;
  sections: { id: number; title: string; content: string; sequence: number }[];
}

const TYPE_ORDER = ['System', 'Assessment', 'Audit', 'Summary'];

/** Loads the session document as ordered prompts plus a flat, numbered section list. */
async function loadDoc(db: SupabaseClient, sessionId: number): Promise<{ prompts: DocPrompt[]; flat: DocSection[] }> {
  const session = (await getSession(db, sessionId)) as unknown as {
    prompts: {
      id: number;
      name: string;
      prompt_type_id: number;
      sequence: number;
      prompt_type: { description: string } | null;
      sections: { id: number; title: string; content: string; sequence: number }[];
    }[];
  };
  const prompts: DocPrompt[] = session.prompts.map((p) => ({
    id: p.id,
    name: p.name,
    promptTypeId: p.prompt_type_id,
    promptType: p.prompt_type?.description ?? '',
    sequence: p.sequence,
    sections: p.sections,
  }));
  const flat: DocSection[] = [];
  let ref = 0;
  for (const p of prompts) {
    for (const s of p.sections) {
      flat.push({
        ref: ++ref,
        promptId: p.id,
        promptName: p.name,
        promptType: p.promptType,
        sectionId: s.id,
        sectionTitle: s.title,
        content: s.content,
      });
    }
  }
  return { prompts, flat };
}

function numberedDoc(flat: DocSection[]): string {
  return flat
    .map((s) => `[${s.ref}] Prompt "${s.promptName}" — type ${s.promptType || 'Untyped'} — section "${s.sectionTitle}":\n${s.content || '(empty)'}`)
    .join('\n\n');
}

/** Extracts the first JSON value (object or array) from a model response. */
function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  const start = t.search(/[[{]/);
  if (start < 0) throw new HttpError(502, 'The model did not return usable JSON.');
  const open = t[start];
  const close = open === '{' ? '}' : ']';
  const end = t.lastIndexOf(close);
  if (end <= start) throw new HttpError(502, 'The model did not return usable JSON.');
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    throw new HttpError(502, 'Could not parse the model response. Please try again.');
  }
}

const KINDS = ['Ambiguity', 'Ungrounded', 'Missing guardrail', 'No output format', 'Readability', 'Wordiness', 'Redundancy', 'Empty', 'Structure'];

interface Finding {
  id: string;
  severity: 'high' | 'med' | 'low';
  kind: string;
  promptId: number | null;
  sectionId: number | null;
  sectionTitle: string | null;
  promptName: string;
  message: string;
  fix: string | null;
}

/**
 * Reviews the document with the session's model and returns findings: per-section
 * issues (with a concrete rewrite as `fix`) plus a whole-document structure flag.
 */
export async function auditSession(db: SupabaseClient, sessionId: number): Promise<{ findings: Finding[] }> {
  const { flat } = await loadDoc(db, sessionId);
  if (!flat.length) return { findings: [] };
  const { service } = await resolveLlmServiceForPromptReviewSession(db, sessionId);

  const instruction =
    'You are auditing the prompts of an automated document-analysis tool. Below is the document as a numbered list of sections; each section is a single instruction given to an AI model. Find weak or risky instructions.\n\n' +
    'Classify each issue with ONE of these kinds: Ambiguity (vague wording the model can interpret loosely), Ungrounded (an Assessment/Audit section that does not require grounding answers in the source documents), "Missing guardrail" (a System section with no guard against speculation/hallucination), "No output format" (a non-System section that does not specify the output shape), Readability (an overly long, hard-to-read sentence), Wordiness (wordy phrasing to tighten), Redundancy (heavy overlap with another section), Empty (no content).\n' +
    'Severity is "high", "med", or "low".\n\n' +
    'Return ONLY a JSON object (no markdown, no commentary) of this exact shape:\n' +
    '{"findings":[{"ref":<section number>,"severity":"high|med|low","kind":"<one kind>","message":"<short explanation>","fix":"<the FULL rewritten section content that resolves the issue, or null>"}],"restructure":{"needed":<true|false>,"message":"<why prompts should be grouped by type / titles standardised, if needed>"}}\n\n' +
    'Sections:\n' +
    numberedDoc(flat);

  const { text } = await service.generate({ prompt: instruction });
  const parsed = extractJson(text) as {
    findings?: { ref?: number; severity?: string; kind?: string; message?: string; fix?: string | null }[];
    restructure?: { needed?: boolean; message?: string };
  };

  const byRef = new Map(flat.map((s) => [s.ref, s]));
  const sev = (s?: string): Finding['severity'] => (s === 'high' || s === 'med' || s === 'low' ? s : 'low');
  let n = 0;
  const findings: Finding[] = [];
  for (const f of parsed.findings ?? []) {
    const src = f.ref != null ? byRef.get(f.ref) : undefined;
    if (!src) continue;
    const fix = typeof f.fix === 'string' && f.fix.trim() && f.fix.trim() !== src.content.trim() ? f.fix.trim() : null;
    findings.push({
      id: `f${++n}`,
      severity: sev(f.severity),
      kind: KINDS.includes(f.kind ?? '') ? (f.kind as string) : 'Ambiguity',
      promptId: src.promptId,
      sectionId: src.sectionId,
      sectionTitle: src.sectionTitle,
      promptName: src.promptName,
      message: (f.message ?? '').trim() || 'Issue detected.',
      fix,
    });
  }
  if (parsed.restructure?.needed) {
    findings.push({
      id: `f${++n}`,
      severity: 'low',
      kind: 'Structure',
      promptId: null,
      sectionId: null,
      sectionTitle: null,
      promptName: 'Whole document',
      message: (parsed.restructure.message ?? '').trim() || 'Prompts aren’t grouped by type, or some section titles are inconsistent — tidy the structure.',
      fix: '__restructure__',
    });
  }
  const rank = { high: 0, med: 1, low: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return { findings };
}

/** Health score (0–100) and band, derived from findings severity. */
export function health(findings: Finding[]): { score: number; band: string } {
  const w = { high: 14, med: 7, low: 3 };
  let score = 100;
  findings.forEach((f) => (score -= w[f.severity] || 0));
  score = Math.max(0, Math.min(100, score));
  const band = score >= 85 ? 'Strong' : score >= 70 ? 'Good' : score >= 50 ? 'Fair' : 'Needs work';
  return { score, band };
}

const IMPROVE_PREAMBLE =
  'You are refining instructions (prompts) fed to an AI model inside an automated document-analysis tool. ' +
  'Rewrite to better achieve the goal while preserving the original intent and any concrete requirements. Keep it concise and in the same instructional voice.';

/** Rewrites a single section's content toward a goal using the session's model. */
export async function improveSection(db: SupabaseClient, sectionId: number, goal: string): Promise<{ suggestion: string }> {
  const { data: secData, error } = await db
    .from('prompt_review_section')
    .select('id, content, prompt_review_prompt:prompt_review_prompt(prompt_review_session_id)')
    .eq('id', sectionId)
    .maybeSingle();
  throwOnError(error, 'Load section');
  const section = requireFound(secData, 'Section') as unknown as {
    content: string;
    prompt_review_prompt: { prompt_review_session_id: number } | null;
  };
  const sessionId = section.prompt_review_prompt?.prompt_review_session_id;
  if (!sessionId) throw new HttpError(404, 'Section not found');

  const { service } = await resolveLlmServiceForPromptReviewSession(db, sessionId);
  const instruction =
    `${IMPROVE_PREAMBLE}\nReturn ONLY the rewritten section content — no preamble, no quotes, no markdown.\n\n` +
    `Goal: ${goal}\n\nCurrent section:\n${section.content}`;
  const { text } = await service.generate({ prompt: instruction });
  const suggestion = text.trim().replace(/^["'\s]+|["'\s]+$/g, '');
  if (!suggestion) throw new HttpError(502, 'The model returned an empty suggestion. Try rephrasing your goal.');
  return { suggestion };
}

interface DocChange {
  sectionId: number;
  promptName: string;
  sectionTitle: string;
  before: string;
  after: string;
}

/** Rewrites every section of the document toward a goal; returns only the changes. */
export async function improveDoc(db: SupabaseClient, sessionId: number, goal: string): Promise<{ items: DocChange[] }> {
  const { flat } = await loadDoc(db, sessionId);
  if (!flat.length) return { items: [] };
  const { service } = await resolveLlmServiceForPromptReviewSession(db, sessionId);

  const instruction =
    `${IMPROVE_PREAMBLE}\nApply this goal across every section: "${goal}".\n` +
    'Return ONLY a JSON array (no markdown) of the sections you changed: [{"ref":<section number>,"after":"<full rewritten content>"}]. Omit sections you would leave unchanged.\n\n' +
    'Sections:\n' +
    numberedDoc(flat);
  const { text } = await service.generate({ prompt: instruction });
  const parsed = extractJson(text) as { ref?: number; after?: string }[];
  const list = Array.isArray(parsed) ? parsed : [];

  const byRef = new Map(flat.map((s) => [s.ref, s]));
  const items: DocChange[] = [];
  for (const r of list) {
    const src = r.ref != null ? byRef.get(r.ref) : undefined;
    const after = (r.after ?? '').trim();
    if (!src || !after || after === src.content.trim()) continue;
    items.push({ sectionId: src.sectionId, promptName: src.promptName, sectionTitle: src.sectionTitle, before: src.content, after });
  }
  return { items };
}

// ---------------------------------------------------------------------------
// Restructure — deterministic: group prompts by type, standardise section titles
// ---------------------------------------------------------------------------
const titleCase = (s: string): string => (s || '').replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
const typeIdx = (t: string): number => {
  const i = TYPE_ORDER.indexOf(t);
  return i < 0 ? 99 : i;
};

interface RestructureProposal {
  changes: { type: 'move' | 'rename'; label: string }[];
  prompts: { id: number; name: string; promptType: string; sectionCount: number }[];
}

function computeRestructure(prompts: DocPrompt[]): { ordered: DocPrompt[]; changes: RestructureProposal['changes'] } {
  const changes: RestructureProposal['changes'] = [];
  const sorted = prompts
    .map((p, i) => ({ p, i }))
    .sort((a, b) => typeIdx(a.p.promptType) - typeIdx(b.p.promptType) || a.i - b.i);
  sorted.forEach((e, newI) => {
    if (e.i !== newI) changes.push({ type: 'move', label: `Moved “${e.p.name}” into the ${e.p.promptType || 'untyped'} group` });
  });
  const ordered = sorted.map((e) => {
    const sections = e.p.sections.map((s) => {
      const nt = titleCase(s.title);
      if (nt !== s.title) changes.push({ type: 'rename', label: `Renamed “${s.title}” → “${nt}”` });
      return { ...s, title: nt };
    });
    return { ...e.p, sections };
  });
  return { ordered, changes };
}

export async function restructurePreview(db: SupabaseClient, sessionId: number): Promise<RestructureProposal> {
  const { prompts } = await loadDoc(db, sessionId);
  const { ordered, changes } = computeRestructure(prompts);
  return {
    changes,
    prompts: ordered.map((p) => ({ id: p.id, name: p.name, promptType: p.promptType, sectionCount: p.sections.length })),
  };
}

/** Applies the restructure (reorder prompts, retitle sections) and returns the session. */
export async function restructureApply(db: SupabaseClient, sessionId: number) {
  const { prompts } = await loadDoc(db, sessionId);
  const { ordered } = computeRestructure(prompts);
  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i];
    await db.from('prompt_review_prompt').update({ sequence: i + 1 }).eq('id', p.id);
    for (const s of p.sections) {
      const nt = titleCase(s.title);
      if (nt !== s.title) await db.from('prompt_review_section').update({ title: nt }).eq('id', s.id);
    }
  }
  return getSession(db, sessionId);
}
