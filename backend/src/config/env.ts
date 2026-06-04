import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  port: Number(optional('PORT', '3000')),
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:4200'),
  supabase: {
    url: required('SUPABASE_URL'),
    anonKey: required('SUPABASE_ANON_KEY'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    storageBucket: optional('SUPABASE_STORAGE_BUCKET', 'run-files'),
  },
  gemini: {
    apiKey: required('GEMINI_API_KEY'),
    model: optional('GEMINI_MODEL', 'gemini-2.5-flash'),
  },
} as const;
