import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Service-role client. Bypasses RLS: only use after an explicit membership check (spec §11). */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service env vars missing");
  return createClient(url, key, { auth: { persistSession: false } });
}
