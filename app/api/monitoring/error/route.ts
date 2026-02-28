import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { logServerError } from "@/lib/monitoring";
import { takeRateLimit } from "@/lib/rateLimit";

type MonitoringPayload = {
  event?: string;
  message?: string;
  context?: Record<string, unknown>;
  pathname?: string | null;
  timestamp?: string;
};

const MONITORING_RATE_LIMIT_REQUESTS = 60;
const MONITORING_RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_EVENT_LENGTH = 80;
const MAX_MESSAGE_LENGTH = 600;
const MAX_CONTEXT_BYTES = 8 * 1024;

function getClientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
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
      logServerError("client.monitoring_endpoint.auth_failed", authError);
      return jsonError("Failed to verify authentication.", 401);
    }

    if (!user) {
      return jsonError("Authentication required.", 401);
    }

    const clientIp = getClientIp(request);
    const limitKey = `monitoring:${user.id}:${clientIp}`;
    const rateLimit = takeRateLimit(limitKey, MONITORING_RATE_LIMIT_REQUESTS, MONITORING_RATE_LIMIT_WINDOW_MS);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many monitoring events. Please retry later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
            "X-RateLimit-Limit": String(MONITORING_RATE_LIMIT_REQUESTS),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    const body = (await request.json()) as MonitoringPayload;
    const event = (body.event ?? "").trim();
    const message = (body.message ?? "").trim();

    if (!event) {
      return jsonError("Event is required.", 400);
    }
    if (!/^[a-z0-9._-]+$/i.test(event) || event.length > MAX_EVENT_LENGTH) {
      return jsonError("Invalid event format.", 400);
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return jsonError("Message is too long.", 400);
    }

    const context = body.context ?? {};
    const contextBytes = new TextEncoder().encode(JSON.stringify(context)).byteLength;
    if (contextBytes > MAX_CONTEXT_BYTES) {
      return jsonError("Context payload is too large.", 413);
    }

    logServerError(`client.${event}`, message || "Client runtime error", {
      userId: user.id,
      pathname: body.pathname ?? null,
      clientTimestamp: body.timestamp ?? null,
      userAgent: request.headers.get("user-agent"),
      clientIp,
      context,
    });

    return NextResponse.json(
      { ok: true },
      {
        headers: {
          "X-RateLimit-Limit": String(MONITORING_RATE_LIMIT_REQUESTS),
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      }
    );
  } catch (error) {
    logServerError("client.monitoring_endpoint.failed", error);
    return jsonError("Failed to process monitoring payload.", 500);
  }
}
