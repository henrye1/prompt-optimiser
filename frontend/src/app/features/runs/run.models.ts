export const RUN_STATUS: Record<number, string> = {
  1: 'New',
  2: 'In-progress',
  3: 'Failed',
  4: 'Complete',
};
export const SECTION_STATUS = RUN_STATUS;

/** Row from the run_card view (Runs list). */
export interface RunCard {
  id: number;
  name: string;
  run_status_id: number;
  is_published: boolean;
  created_by: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  input_tokens: number;
  output_tokens: number;
  prompt_set_name: string | null;
  model_name: string | null;
  provider_name: string | null;
  section_total: number;
  section_complete: number;
  running_section: string | null;
  last_error: string | null;
}

export interface RunSection {
  id: number;
  title: string;
  content: string;
  run_section_status_id: number;
  sequence: number;
  error_message: string | null;
  prompt_section: { prompt: { prompt_type: { description: string } | null } | null } | null;
}

export interface RunFile {
  id: number;
  file_name: string;
  mime_type: string;
  run_file_type_id: number;
  is_example_file: boolean;
  created_at: string;
}

export interface RunLog {
  id: number;
  level: string;
  message: string;
  created_at: string;
}

export interface RunDetail {
  id: number;
  name: string;
  description: string;
  prompt_set_id: number;
  run_status_id: number;
  is_published: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  input_tokens: number;
  output_tokens: number;
  prompt_set: { name: string } | null;
  ai_model: { id: number; name: string; provider: { name: string } | null } | null;
  sections: RunSection[];
  files: RunFile[];
  logs: RunLog[];
}
