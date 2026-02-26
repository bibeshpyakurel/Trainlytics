type PublicEnvName = "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY";

function getRequiredPublicEnv(name: PublicEnvName) {
  const value =
    name === "NEXT_PUBLIC_SUPABASE_URL"
      ? process.env.NEXT_PUBLIC_SUPABASE_URL
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  if (
    name === "NEXT_PUBLIC_SUPABASE_ANON_KEY" &&
    (value.includes("service_role") || value.startsWith("sb_secret_"))
  ) {
    throw new Error(
      "Unsafe Supabase key detected in NEXT_PUBLIC_SUPABASE_ANON_KEY. Use the publishable/anon key only."
    );
  }

  return value;
}

export function getSupabaseBrowserEnv() {
  return {
    url: getRequiredPublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: getRequiredPublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
}
