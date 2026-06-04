export interface PromptType {
  id: number;
  description: string;
}

export interface PromptSetBase {
  id: number;
  name: string;
  description: string;
  version: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

/** Card row from the prompt_set_card view (list page). */
export interface PromptSetSummary extends PromptSetBase {
  prompt_count: number;
  section_count: number;
  system_count: number;
  assessment_count: number;
  audit_count: number;
  run_count: number;
}

export interface PromptSection {
  id: number;
  title: string;
  content: string;
  sequence: number;
}

export interface Prompt {
  id: number;
  name: string;
  prompt_type_id: number;
  sequence: number;
  sections: PromptSection[];
}

export interface PromptSetDetail extends PromptSetBase {
  prompts: Prompt[];
}
