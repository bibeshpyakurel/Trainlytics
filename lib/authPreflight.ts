import type { AuthError, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

type AuthPreflightOptions = {
  setCheckingSession: (value: boolean) => void;
  onAuthenticated: (user: User | null) => void;
  onUnauthenticated?: () => void;
  onSessionError?: (error: AuthError) => void;
  onUserError?: (error: AuthError | null) => void;
  requireUser?: boolean;
  timeoutMs?: number;
};

export function runAuthSessionPreflight({
  setCheckingSession,
  onAuthenticated,
  onUnauthenticated,
  onSessionError,
  onUserError,
  requireUser = true,
  timeoutMs,
}: AuthPreflightOptions) {
  let active = true;
  let timeoutId: number | null = null;
  let checkingResolved = false;

  const resolveChecking = () => {
    if (!active || checkingResolved) return;
    checkingResolved = true;
    setCheckingSession(false);
  };

  void (async () => {
    if (typeof timeoutMs === "number" && timeoutMs > 0) {
      timeoutId = window.setTimeout(() => {
        resolveChecking();
      }, timeoutMs);
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (!active) return;

    if (sessionError) {
      onSessionError?.(sessionError);
      resolveChecking();
      return;
    }

    if (!sessionData.session) {
      onUnauthenticated?.();
      resolveChecking();
      return;
    }

    if (!requireUser) {
      onAuthenticated(null);
      return;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (!active) return;

    if (userError || !userData.user) {
      onUserError?.(userError ?? null);
      resolveChecking();
      return;
    }

    onAuthenticated(userData.user);
  })();

  return () => {
    active = false;
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  };
}
