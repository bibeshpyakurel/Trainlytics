"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { APP_COPY } from "@/lib/appCopy";
import { TABLES } from "@/lib/dbNames";
import { ROUTES, buildLoginRedirectPath, getSafeProtectedNextRoute } from "@/lib/routes";

export default function LaunchPage() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [welcomeLabel, setWelcomeLabel] = useState("Welcome");
  const [subtitle, setSubtitle] = useState<string>(APP_COPY.launchSignedOutText);

  useEffect(() => {
    let isMounted = true;
    let exitTimer: number | undefined;
    let routeTimer: number | undefined;
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const nextParam = params?.get("next");
    const safeNextRoute = getSafeProtectedNextRoute(nextParam);

    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!isMounted) return;

      if (error || !data.session) {
        setWelcomeLabel("Welcome");
        setSubtitle(APP_COPY.launchSignedOutText);
        setVisible(true);
        exitTimer = window.setTimeout(() => setExiting(true), 1300);
        routeTimer = window.setTimeout(() => {
          router.replace(buildLoginRedirectPath(safeNextRoute ?? ROUTES.dashboard, "auth_required"));
        }, 1800);
        return;
      }

      const userId = data.session.user.id;
      const { data: profileData } = await supabase
        .from(TABLES.profiles)
        .select("first_name")
        .eq("user_id", userId)
        .maybeSingle();
      if (!isMounted) return;
      const resolvedFirstName = (profileData?.first_name as string | null | undefined) ?? null;
      setWelcomeLabel(resolvedFirstName?.trim() ? `Welcome Back, ${resolvedFirstName.trim()}` : "Welcome Back");
      setSubtitle(APP_COPY.launchSignedInText);

      setVisible(true);
      exitTimer = window.setTimeout(() => setExiting(true), 1300);
      routeTimer = window.setTimeout(() => router.replace(safeNextRoute ?? ROUTES.dashboard), 1800);
    })();

    return () => {
      isMounted = false;
      if (exitTimer) window.clearTimeout(exitTimer);
      if (routeTimer) window.clearTimeout(routeTimer);
    };
  }, [router]);

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
          {welcomeLabel}
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
          {APP_COPY.launchIntroText}
        </p>
        <p
          className={`mt-2 text-xs text-zinc-400 transition-all duration-500 ${
            visible && !exiting ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          }`}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
}
