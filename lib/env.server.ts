function getRequiredServerEnvFromSet(name: "OPENAI_API_KEY" | "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getInsightsAiEnv() {
  return {
    apiKey: getRequiredServerEnvFromSet("OPENAI_API_KEY"),
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  };
}

export function getSupabaseAdminEnv() {
  return {
    url: getRequiredServerEnvFromSet("NEXT_PUBLIC_SUPABASE_URL"),
    serviceRoleKey: getRequiredServerEnvFromSet("SUPABASE_SERVICE_ROLE_KEY"),
  };
}
