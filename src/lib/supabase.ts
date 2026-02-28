import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// Use anon key for client, or service role for server-side when anon is not set
export const supabase: SupabaseClient | null =
  supabaseUrl && (supabaseAnonKey || supabaseServiceKey)
    ? createClient(supabaseUrl, supabaseAnonKey || supabaseServiceKey)
    : null;
