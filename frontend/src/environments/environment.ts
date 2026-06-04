/**
 * App configuration. Must point at the SAME Supabase project the backend uses
 * (the browser authenticates directly against Supabase, and the backend
 * validates those tokens). The anon key is public by design (safe in the client).
 */
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3001',
  supabaseUrl: 'https://nswrppqvybmvdxxowuqi.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zd3JwcHF2eWJtdmR4eG93dXFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0OTYxMTQsImV4cCI6MjA5NjA3MjExNH0.a2Z-w5ggvRvYYku3E6dpMWRigTZ00VfjXnqMMFoDozw',
};
