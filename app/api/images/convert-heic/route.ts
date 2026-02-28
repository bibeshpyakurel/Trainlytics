import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { logServerError } from "@/lib/monitoring";
import { takeRateLimit } from "@/lib/rateLimit";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const RATE_LIMIT_REQUESTS = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function getClientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function isHeicLikeUpload(file: File) {
  const fileName = file.name.toLowerCase();
  const fileType = file.type.toLowerCase();
  return (
    fileType === "image/heic" ||
    fileType === "image/heif" ||
    fileType === "image/heic-sequence" ||
    fileType === "image/heif-sequence" ||
    fileName.endsWith(".heic") ||
    fileName.endsWith(".heif")
  );
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
      logServerError("api.images.convert_heic.auth_failed", authError);
      return jsonError("Failed to verify authentication.", 401);
    }
    if (!user) {
      return jsonError("Authentication required.", 401);
    }

    const clientIp = getClientIp(request);
    const limitKey = `convert-heic:${user.id}:${clientIp}`;
    const rate = takeRateLimit(limitKey, RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW_MS);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many conversion requests. Please retry shortly." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rate.retryAfterSeconds),
            "X-RateLimit-Limit": String(RATE_LIMIT_REQUESTS),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    const formData = await request.formData();
    const maybeFile = formData.get("file");
    if (!(maybeFile instanceof File)) {
      return jsonError("Image file is required.", 400);
    }
    if (maybeFile.size <= 0 || maybeFile.size > MAX_UPLOAD_BYTES) {
      return jsonError("File is missing or too large.", 413);
    }
    if (!isHeicLikeUpload(maybeFile)) {
      return jsonError("Only HEIC/HEIF files are supported on this endpoint.", 400);
    }

    const inputBuffer = Buffer.from(await maybeFile.arrayBuffer());
    const convertModule = await import("heic-convert");
    const convert = (convertModule as { default?: unknown }).default as (
      args: {
        buffer: Buffer;
        format: "JPEG";
        quality: number;
      }
    ) => Promise<Uint8Array | Buffer>;

    const outputBuffer = await convert({
      buffer: inputBuffer,
      format: "JPEG",
      quality: 0.92,
    });

    return new NextResponse(outputBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store",
        "X-RateLimit-Limit": String(RATE_LIMIT_REQUESTS),
        "X-RateLimit-Remaining": String(rate.remaining),
      },
    });
  } catch (error) {
    logServerError("api.images.convert_heic.failed", error);
    return jsonError("Failed to convert HEIC/HEIF image.", 500);
  }
}
