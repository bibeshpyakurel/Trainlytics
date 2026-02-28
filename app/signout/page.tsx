"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { APP_COPY } from "@/lib/appCopy";
import { ROUTES } from "@/lib/routes";
import { supabase } from "@/lib/supabaseClient";
import { clearAccountScopedClientState } from "@/lib/accountScopedClientState";
import { SESSION_LAST_ACTIVITY_STORAGE_KEY, SESSION_STARTED_AT_COOKIE } from "@/lib/sessionTimeout";

export default function SignOutPage() {
  const router = useRouter();
  const visible = true;
  const [exiting, setExiting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(true);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let isMounted = true;
    let exitTimer: number | null = null;
    let routeTimer: number | null = null;

    async function runSignOut() {
      setIsSigningOut(true);
      setErrorMessage(null);

      const { error } = await supabase.auth.signOut();
      if (!isMounted) return;

      if (error) {
        setIsSigningOut(false);
        setErrorMessage(`Sign out failed: ${error.message}`);
        return;
      }

      document.cookie = `${SESSION_STARTED_AT_COOKIE}=; path=/; max-age=0; samesite=lax`;
      localStorage.removeItem(SESSION_LAST_ACTIVITY_STORAGE_KEY);
      clearAccountScopedClientState();
      setIsSigningOut(false);
      exitTimer = window.setTimeout(() => setExiting(true), 700);
      routeTimer = window.setTimeout(() => router.replace(ROUTES.login), 1200);
    }

    runSignOut();

    return () => {
      isMounted = false;
      if (exitTimer) window.clearTimeout(exitTimer);
      if (routeTimer) window.clearTimeout(routeTimer);
    };
  }, [retryToken, router]);

  function retrySignOut() {
    setRetryToken((prev) => prev + 1);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_18%,rgba(245,158,11,0.24),transparent_34%),radial-gradient(circle_at_84%_14%,rgba(16,185,129,0.18),transparent_36%),radial-gradient(circle_at_50%_92%,rgba(59,130,246,0.16),transparent_38%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:46px_46px] opacity-20" />
      </div>

      <div className="relative z-10 px-6 text-center">
        <p
          className={`text-xs font-semibold uppercase tracking-[0.28em] text-amber-300/85 transition-all duration-500 ${
            visible && !exiting ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          }`}
        >
          Session Ended
        </p>
        <h1
          className={`mt-4 bg-gradient-to-r from-amber-300 via-orange-300 to-red-300 bg-clip-text text-5xl font-black text-transparent transition-all duration-700 sm:text-7xl ${
            visible && !exiting ? "scale-100 opacity-100" : "scale-95 opacity-0"
          }`}
        >
          {APP_COPY.appName}
        </h1>
        <p
          className={`mt-4 text-sm text-zinc-300 transition-all duration-500 ${
            visible && !exiting ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          }`}
        >
          {isSigningOut ? "Signing you out..." : "Signed out successfully."}
        </p>
        {errorMessage && (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-red-300">{errorMessage}</p>
            <button
              type="button"
              onClick={retrySignOut}
              className="rounded-md bg-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
            >
              Retry sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
