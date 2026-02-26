"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { APP_COPY } from "@/lib/appCopy";
import { TABLES } from "@/lib/dbNames";
import { ROUTES, buildLoginRedirectPath } from "@/lib/routes";

export default function LaunchPage() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let exitTimer: number | undefined;
    let routeTimer: number | undefined;

    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!isMounted) return;

      if (error || !data.session) {
        router.replace(buildLoginRedirectPath(ROUTES.launch, "session_expired"));
        return;
      }

      const userId = data.session.user.id;
      const { data: profileData } = await supabase
        .from(TABLES.profiles)
        .select("first_name")
        .eq("user_id", userId)
        .maybeSingle();
      if (!isMounted) return;
      setFirstName((profileData?.first_name as string | null | undefined) ?? null);

      setVisible(true);
      exitTimer = window.setTimeout(() => setExiting(true), 1300);
      routeTimer = window.setTimeout(() => router.replace(ROUTES.dashboard), 1800);
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
          {firstName?.trim() ? `Welcome Back, ${firstName.trim()}` : "Welcome Back"}
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
          {APP_COPY.launchPreparingText}
        </p>
      </div>
    </div>
  );
}
