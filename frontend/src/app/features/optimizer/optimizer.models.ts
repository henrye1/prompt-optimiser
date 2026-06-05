/** Row from the optimizer_session_card view (Optimizer list). */
export interface OptimizerSessionCard {
  id: number;
  name: string;
  prompt_set_id: number;
  is_published: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  prompt_set_name: string | null;
  model_name: string | null;
  provider_name: string | null;
  financial_count: number;
  rating_count: number;
  run_count: number;
  last_run_at: string | null;
}

export interface OptimizerSectionRun {
  id: number;
  prompt_content: string;
  output: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  model_name: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  is_baseline: boolean;
}

export interface OptimizerSection {
  id: number;
  prompt_section_id: number | null;
  prompt_name: string;
  prompt_type_id: number;
  prompt_sequence: number;
  title: string;
  sequence: number;
  original_content: string;
  current_content: string;
  prompt_type: { description: string } | null;
  runs: OptimizerSectionRun[];
}

export interface OptimizerFile {
  id: number;
  file_name: string;
  mime_type: string;
  run_file_type_id: number;
  is_example_file: boolean;
  created_at: string;
}

export interface OptimizerSession {
  id: number;
  name: string;
  prompt_set_id: number;
  ai_model_id: number | null;
  is_published: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  prompt_set: { name: string } | null;
  ai_model: { id: number; name: string; provider: { name: string } | null } | null;
  sections: OptimizerSection[];
  files: OptimizerFile[];
}
