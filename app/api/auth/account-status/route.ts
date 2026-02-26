import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { jsonError } from "@/lib/apiResponse";
import { getSupabaseAdminEnv } from "@/lib/env.server";
import { logServerError } from "@/lib/monitoring";

type RequestBody = {
  email?: string;
};

const ACCOUNT_STATUS_PER_PAGE = 1000;
const ACCOUNT_STATUS_TIMEOUT_MS = 2500;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function POST(request: Request) {
  let env: ReturnType<typeof getSupabaseAdminEnv>;
  try {
    env = getSupabaseAdminEnv();
  } catch (error) {
    logServerError("api.auth.account_status.env_missing", error);
    return jsonError("Server auth check is not configured.", 503);
  }

  try {
    const body = (await request.json()) as RequestBody;
    const normalizedEmail = normalizeEmail(body.email ?? "");
    if (!normalizedEmail) {
      return jsonError("Email is required.", 400);
    }

    const supabaseAdmin = createClient(env.url, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let exists = false;
    let page = 1;
    const startedAt = Date.now();

    while (true) {
      if (Date.now() - startedAt > ACCOUNT_STATUS_TIMEOUT_MS) {
        logServerError("api.auth.account_status.lookup_timeout", {
          page,
          timeoutMs: ACCOUNT_STATUS_TIMEOUT_MS,
        });
        return jsonError("Account status check timed out. Please try again.", 503);
      }

      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: ACCOUNT_STATUS_PER_PAGE,
      });

      if (error) {
        logServerError("api.auth.account_status.list_users_failed", error);
        return jsonError(`Failed to check account status: ${error.message}`, 500);
      }

      const users = data?.users ?? [];
      if (users.some((user) => user.email?.toLowerCase() === normalizedEmail)) {
        exists = true;
        break;
      }

      if (users.length < ACCOUNT_STATUS_PER_PAGE) {
        break;
      }

      page += 1;
    }

    return NextResponse.json({ exists });
  } catch (error) {
    logServerError("api.auth.account_status.unhandled", error);
    return jsonError("Failed to process account status request.", 500);
  }
}
