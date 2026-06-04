export interface AiModelProvider {
  id: number;
  name: string;
}

export interface AiModel {
  id: number;
  name: string;
  created_at: string;
  provider: { id: number; name: string } | null;
  api_key_masked: string;
}
