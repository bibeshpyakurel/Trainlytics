import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseBrowserEnv } from "@/lib/env.client";
import type { Database } from "@/lib/supabaseTypes";

type BrowserSupabaseClient = ReturnType<typeof createBrowserClient<Database>>;

let browserClient: BrowserSupabaseClient | null = null;

function getOrCreateBrowserClient() {
  if (!browserClient) {
    const { url, anonKey } = getSupabaseBrowserEnv();
    browserClient = createBrowserClient<Database>(url, anonKey);
  }
  return browserClient;
}

export const supabase = new Proxy({} as BrowserSupabaseClient, {
  get(_target, prop, receiver) {
    if (typeof window === "undefined") {
      throw new Error(
        "Supabase browser client was accessed during server render. Use it inside client effects/events."
      );
    }

    const client = getOrCreateBrowserClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
