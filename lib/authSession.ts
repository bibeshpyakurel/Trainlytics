import { supabase } from "@/lib/supabaseClient";
import type { Session, User } from "@supabase/supabase-js";

export type CurrentSessionUserResult =
  | { status: "ok"; session: Session; user: User; userId: string }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

export async function getCurrentSessionUser(): Promise<CurrentSessionUserResult> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    return { status: "error", message: error.message };
  }

  const session = data.session;
  if (!session) {
    return { status: "unauthenticated" };
  }

  return {
    status: "ok",
    session,
    user: session.user,
    userId: session.user.id,
  };
}

export async function getCurrentUserIdFromSession(): Promise<{ userId: string | null; error: string | null }> {
  const authState = await getCurrentSessionUser();
  if (authState.status === "error") {
    return { userId: null, error: authState.message };
  }

  if (authState.status === "unauthenticated") {
    return { userId: null, error: null };
  }

  return { userId: authState.userId, error: null };
}
