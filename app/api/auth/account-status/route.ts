import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { jsonError } from "@/lib/apiResponse";
import { getSupabaseAdminEnv } from "@/lib/env.server";

type RequestBody = {
  email?: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function POST(request: Request) {
  let env: ReturnType<typeof getSupabaseAdminEnv>;
  try {
    env = getSupabaseAdminEnv();
  } catch {
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
    const perPage = 200;
    for (let page = 1; page <= 10; page += 1) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      });

      if (error) {
        return jsonError(`Failed to check account status: ${error.message}`, 500);
      }

      const users = data?.users ?? [];
      if (users.some((user) => user.email?.toLowerCase() === normalizedEmail)) {
        exists = true;
        break;
      }

      if (users.length < perPage) {
        break;
      }
    }

    return NextResponse.json({ exists });
  } catch {
    return jsonError("Failed to process account status request.", 500);
  }
}
