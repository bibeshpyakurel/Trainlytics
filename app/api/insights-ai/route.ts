import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { jsonError } from "@/lib/apiResponse";
import { getInsightsAiEnv } from "@/lib/env.server";
import { logServerError } from "@/lib/monitoring";
import { loadInsightsAiContextForUser } from "@/lib/insightsAiContext.server";

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const MAX_REQUEST_BODY_BYTES = 24 * 1024;
const PROVIDER_TIMEOUT_MS = 15_000;

const rateLimitByUser = new Map<string, { windowStartMs: number; count: number }>();

function consumeRateLimit(userId: string, nowMs: number) {
  const current = rateLimitByUser.get(userId);
  if (!current || nowMs - current.windowStartMs >= RATE_LIMIT_WINDOW_MS) {
    rateLimitByUser.set(userId, { windowStartMs: nowMs, count: 1 });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, retryAfterSeconds: 0 };
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.windowStartMs + RATE_LIMIT_WINDOW_MS - nowMs) / 1000));
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  current.count += 1;
  rateLimitByUser.set(userId, current);
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - current.count, retryAfterSeconds: 0 };
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

  const rateLimit = consumeRateLimit(user.id, Date.now());
  if (!rateLimit.allowed) {
    const response = jsonError("Too many requests. Please try again soon.", 429);
    response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    logInsightsRequest("api.insights_ai.request_denied", {
      requestId,
      userId: user.id,
      clientIp,
      status: 429,
      reason: "rate_limited",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
      durationMs: Date.now() - startedAt,
    });
    return response;
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
    };
    try {
      body = JSON.parse(rawBody) as {
        question?: string;
        history?: ChatMessage[];
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

    const userContext = await loadInsightsAiContextForUser(supabase, user.id);
    const history = (body.history ?? [])
      .filter((item) => (item.role === "user" || item.role === "assistant") && typeof item.text === "string")
      .map((item) => ({ role: item.role, text: item.text.trim() }))
      .filter((item) => item.text.length > 0)
      .slice(-8);

    const systemPrompt = [
      "You are an insights coach for a Trainlytics app.",
      userContext.firstName ? `The athlete's first name is ${userContext.firstName}.` : "",
      "You MUST answer using only the provided user context data.",
      "Use yearlyRawLogs and yearlyTimeline for detailed personal-history questions across workouts, bodyweight, calories, burn, net energy, and strength.",
      "For date-specific questions (for example 'what workout did I do on 2026-02-02?'), use yearlyTimeline.workoutSessions and yearlyTimeline.dailyMetrics.",
      "For month-specific average questions (for example February 2026), use monthlyAverages when available.",
      "For 'first/last calories log' questions, use calorieCoverage.firstLogDate and calorieCoverage.lastLogDate.",
      "Whenever answering about bodyweight, include BOTH kg and lb values when data exists.",
      "If data is missing or insufficient, say so clearly.",
      "Be concise, practical, and action-oriented.",
      "When useful, provide 3-5 bullets.",
      "Do not fabricate metrics or dates.",
    ].join(" ");

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
    const timeoutId = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
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
          temperature: 0.3,
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
          timeoutMs: PROVIDER_TIMEOUT_MS,
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

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      logInsightsRequest("api.insights_ai.request_failed", {
        requestId,
        userId: user.id,
        clientIp,
        status: 502,
        reason: "provider_empty_answer",
        durationMs: Date.now() - startedAt,
      });
      return jsonError("AI returned an empty response.", 502);
    }

    logInsightsRequest("api.insights_ai.request_ok", {
      requestId,
      userId: user.id,
      clientIp,
      status: 200,
      questionChars: question.length,
      bodyBytes,
      historyMessages: history.length,
      remainingInWindow: rateLimit.remaining,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ answer });
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
