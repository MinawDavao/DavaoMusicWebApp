import { createClient } from '@supabase/supabase-js';

// Publishable values — safe to ship in the browser. Override with .env.local
// (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY) or Cloudflare env vars.
const SUPABASE_URL =
  (import.meta as any).env?.VITE_SUPABASE_URL || 'https://ckwdiwfnivquokggjtyq.supabase.co';
const SUPABASE_KEY =
  (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_ou7CgbimY1cMfGIcqqujXg_a16t0UBu';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const CURRENT_TERMS_VERSION = '2026-10';
