export const RUN_STATUS: Record<number, string> = {
  1: 'New',
  2: 'In-progress',
  3: 'Failed',
  4: 'Complete',
};
export const SECTION_STATUS = RUN_STATUS;

export interface RunSummary {
  id: number;
  name: string;
  description: string;
  prompt_set_id: number;
  run_status_id: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface RunSection {
  id: number;
  title: string;
  content: string;
  run_section_status_id: number;
  sequence: number;
  error_message: string | null;
  prompt_section: { content: string } | null;
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

export interface RunDetail extends RunSummary {
  created_by: string;
  sections: RunSection[];
  files: RunFile[];
  logs: RunLog[];
}
