import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseBrowserEnv } from "@/lib/env.client";
import type { Database } from "@/lib/supabaseTypes";

const { url, anonKey } = getSupabaseBrowserEnv();

export const supabase = createBrowserClient<Database>(url, anonKey);
