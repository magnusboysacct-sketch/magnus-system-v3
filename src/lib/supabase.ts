import { createClient } from '@supabase/supabase-js'

function getEnvValue(envKeys: string[]): string | undefined {
  for (const key of envKeys) {
    const value = (import.meta.env as any)[key];
    if (value) return value;
  }
  return undefined;
}

const urlCandidates = [
  'VITE_SUPABASE_URL',
  'SUPABASE_URL',
  'PROJECT_URL',
];

const anonKeyCandidates = [
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY',
];

const supabaseUrl = getEnvValue(urlCandidates);
const supabaseAnonKey = getEnvValue(anonKeyCandidates);

if (!supabaseUrl) {
  throw new Error("Missing Supabase URL. Checked: " + urlCandidates.map(k => `import.meta.env.${k}`).join(', '));
}

if (!supabaseAnonKey) {
  throw new Error("Missing Supabase anon key. Checked: " + anonKeyCandidates.map(k => `import.meta.env.${k}`).join(', '));
}

console.log("[Supabase Config]", {
  host: new URL(supabaseUrl).host,
  hasAnonKey: !!supabaseAnonKey
});

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
