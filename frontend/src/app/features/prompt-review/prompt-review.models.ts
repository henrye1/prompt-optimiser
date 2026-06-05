/** Row from the prompt_review_session_card view (Prompt Review list). */
export interface PromptReviewSessionCard {
  id: number;
  name: string;
  source_prompt_set_id: number | null;
  is_published: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  source_name: string | null;
  model_name: string | null;
  provider_name: string | null;
  prompt_count: number;
  section_count: number;
}

export interface PromptReviewSection {
  id: number;
  title: string;
  content: string;
  sequence: number;
}

export interface PromptReviewPrompt {
  id: number;
  name: string;
  prompt_type_id: number;
  sequence: number;
  prompt_type: { description: string } | null;
  sections: PromptReviewSection[];
}

export interface PromptReviewSession {
  id: number;
  name: string;
  source_prompt_set_id: number | null;
  ai_model_id: number | null;
  is_published: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  source: { name: string } | null;
  ai_model: { id: number; name: string; provider: { name: string } | null } | null;
  prompts: PromptReviewPrompt[];
}

export type Severity = 'high' | 'med' | 'low';

export interface Finding {
  id: string;
  severity: Severity;
  kind: string;
  promptId: number | null;
  sectionId: number | null;
  sectionTitle: string | null;
  promptName: string;
  message: string;
  fix: string | null;
}

export interface ReviewResult {
  findings: Finding[];
  health: { score: number; band: string };
}

export interface DocChange {
  sectionId: number;
  promptName: string;
  sectionTitle: string;
  before: string;
  after: string;
}

export interface RestructureProposal {
  changes: { type: 'move' | 'rename'; label: string }[];
  prompts: { id: number; name: string; promptType: string; sectionCount: number }[];
}
