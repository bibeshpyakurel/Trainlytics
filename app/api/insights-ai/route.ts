import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { jsonError } from "@/lib/apiResponse";
import { getInsightsAiEnv } from "@/lib/env.server";
import { logServerError } from "@/lib/monitoring";
import { loadInsightsAiContextForUser } from "@/lib/insightsAiContext.server";
import {
  buildInsightsSystemPrompt,
  type AssistantOutputMode,
  type AssistantTone,
} from "@/lib/insightsAiPrompt";

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

const MAX_REQUEST_BODY_BYTES = 24 * 1024;
const DEFAULT_PROVIDER_TIMEOUT_MS = 90_000;
const MIN_PROVIDER_TIMEOUT_MS = 15_000;
const MAX_PROVIDER_TIMEOUT_MS = 180_000;

function resolveProviderTimeoutMs() {
  const rawValue = process.env.INSIGHTS_AI_PROVIDER_TIMEOUT_MS;
  if (!rawValue) return DEFAULT_PROVIDER_TIMEOUT_MS;
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return DEFAULT_PROVIDER_TIMEOUT_MS;
  return Math.max(MIN_PROVIDER_TIMEOUT_MS, Math.min(MAX_PROVIDER_TIMEOUT_MS, Math.round(parsed)));
}

function logInsightsRequest(event: string, context: Record<string, unknown>) {
  console.info(
    "[monitoring]",
    JSON.stringify({
      source: "server",
      event,
      context,
      timestamp: new Date().toISOString(),
    })
  );
}

export async function POST(request: Request) {
  const providerTimeoutMs = resolveProviderTimeoutMs();
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    logServerError("api.insights_ai.auth_env_missing", "Missing Supabase public environment variables");
    logInsightsRequest("api.insights_ai.request_denied", {
      requestId,
      clientIp,
      status: 503,
      reason: "auth_env_missing",
      durationMs: Date.now() - startedAt,
    });
    return jsonError("Server auth check is not configured.", 503);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    logServerError("api.insights_ai.auth_get_user_failed", authError);
    logInsightsRequest("api.insights_ai.request_denied", {
      requestId,
      clientIp,
      status: 401,
      reason: "auth_get_user_failed",
      durationMs: Date.now() - startedAt,
    });
    return jsonError("Failed to verify authentication.", 401);
  }

  if (!user) {
    logInsightsRequest("api.insights_ai.request_denied", {
      requestId,
      clientIp,
      status: 401,
      reason: "unauthenticated",
      durationMs: Date.now() - startedAt,
    });
    return jsonError("Authentication required.", 401);
  }

  let env: ReturnType<typeof getInsightsAiEnv>;
  try {
    env = getInsightsAiEnv();
  } catch (error) {
    logServerError("api.insights_ai.env_missing", error);
    logInsightsRequest("api.insights_ai.request_failed", {
      requestId,
      userId: user.id,
      clientIp,
      status: 500,
      reason: "openai_env_missing",
      durationMs: Date.now() - startedAt,
    });
    return jsonError("Missing OPENAI_API_KEY. Add it to your environment to enable AI chat.", 500);
  }

  try {
    const rawBody = await request.text();
    const bodyBytes = new TextEncoder().encode(rawBody).byteLength;
    if (bodyBytes > MAX_REQUEST_BODY_BYTES) {
      logInsightsRequest("api.insights_ai.request_denied", {
        requestId,
        userId: user.id,
        clientIp,
        status: 413,
        reason: "payload_too_large",
        bodyBytes,
        maxBodyBytes: MAX_REQUEST_BODY_BYTES,
        durationMs: Date.now() - startedAt,
      });
      return jsonError("Request body is too large.", 413);
    }

    let body: {
      question?: string;
      history?: ChatMessage[];
      tone?: AssistantTone;
      outputMode?: AssistantOutputMode;
    };
    try {
      body = JSON.parse(rawBody) as {
        question?: string;
        history?: ChatMessage[];
        tone?: AssistantTone;
        outputMode?: AssistantOutputMode;
      };
    } catch {
      logInsightsRequest("api.insights_ai.request_denied", {
        requestId,
        userId: user.id,
        clientIp,
        status: 400,
        reason: "invalid_json",
        bodyBytes,
        durationMs: Date.now() - startedAt,
      });
      return jsonError("Invalid JSON payload.", 400);
    }

    const question = body.question?.trim();
    if (!question) {
      logInsightsRequest("api.insights_ai.request_denied", {
        requestId,
        userId: user.id,
        clientIp,
        status: 400,
        reason: "missing_question",
        bodyBytes,
        durationMs: Date.now() - startedAt,
      });
      return jsonError("Question is required.", 400);
    }
    const tone: AssistantTone =
      body.tone === "technical" || body.tone === "plain" || body.tone === "coach"
        ? body.tone
        : "coach";
    const outputMode: AssistantOutputMode =
      body.outputMode === "fitness_structured" ? "fitness_structured" : "default";

    const userContext = await loadInsightsAiContextForUser(supabase, user.id);
    const history = (body.history ?? [])
      .filter((item) => (item.role === "user" || item.role === "assistant") && typeof item.text === "string")
      .map((item) => ({ role: item.role, text: item.text.trim() }))
      .filter((item) => item.text.length > 0)
      .slice(-8);

    const systemPrompt = buildInsightsSystemPrompt({
      firstName: userContext.firstName,
      tone,
      outputMode,
    });

    const contextPrompt = [
      "User context data:",
      JSON.stringify(userContext),
    ].join("\n");

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "system", content: contextPrompt },
      ...history.map((item) => ({
        role: item.role,
        content: item.text,
      })),
      { role: "user", content: question },
    ];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), providerTimeoutMs);
    let response: Response;
    try {
      response = await fetch(`${env.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.apiKey}`,
        },
        body: JSON.stringify({
          model: env.model,
          stream: true,
          messages,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        logInsightsRequest("api.insights_ai.request_failed", {
          requestId,
          userId: user.id,
          clientIp,
          status: 504,
          reason: "provider_timeout",
          timeoutMs: providerTimeoutMs,
          durationMs: Date.now() - startedAt,
        });
        return jsonError("AI provider request timed out.", 504);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      let providerMessage = `status_${response.status}`;
      try {
        const errorBody = (await response.json()) as { error?: { message?: string } };
        if (errorBody?.error?.message) {
          providerMessage = `${providerMessage}:${errorBody.error.message}`;
        }
      } catch {
        // Ignore provider body parse failures and keep fallback status-only message.
      }
      logServerError("api.insights_ai.provider_error", providerMessage);
      logInsightsRequest("api.insights_ai.request_failed", {
        requestId,
        userId: user.id,
        clientIp,
        status: 502,
        reason: "provider_non_ok",
        providerStatus: response.status,
        providerMessage,
        durationMs: Date.now() - startedAt,
      });
      return jsonError(`AI provider error: ${response.status}. ${providerMessage}`, 502);
    }

    if (!response.body) {
      logInsightsRequest("api.insights_ai.request_failed", {
        requestId,
        userId: user.id,
        clientIp,
        status: 502,
        reason: "provider_empty_stream",
        durationMs: Date.now() - startedAt,
      });
      return jsonError("AI provider returned an empty stream.", 502);
    }

    logInsightsRequest("api.insights_ai.request_ok", {
      requestId,
      userId: user.id,
      clientIp,
      status: 200,
      questionChars: question.length,
      bodyBytes,
      historyMessages: history.length,
      durationMs: Date.now() - startedAt,
    });
    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    logServerError("api.insights_ai.unhandled", error);
    logInsightsRequest("api.insights_ai.request_failed", {
      requestId,
      userId: user.id,
      clientIp,
      status: 500,
      reason: "unhandled",
      durationMs: Date.now() - startedAt,
    });
    return jsonError("Failed to process AI request.", 500);
  }
}
