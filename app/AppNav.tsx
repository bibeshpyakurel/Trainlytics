"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CLASS_GRADIENT_PRIMARY } from "@/lib/uiTokens";
import { TABLES } from "@/lib/dbNames";
import { ROUTES } from "@/lib/routes";

export default function AppNav() {
  const pathname = usePathname();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const hideNav =
    pathname === ROUTES.login ||
    pathname === ROUTES.signup ||
    pathname === ROUTES.forgotPassword ||
    pathname === ROUTES.sessionExpired ||
    pathname === ROUTES.launch ||
    pathname === ROUTES.signout;

  useEffect(() => {
    if (hideNav) return;

    let isMounted = true;

    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!isMounted || error || !data.session) return;

      const userId = data.session.user.id;
      const { data: profileRow, error: profileError } = await supabase
        .from(TABLES.profiles)
        .select("avatar_url")
        .eq("user_id", userId)
        .maybeSingle();

      if (!isMounted || profileError) return;
      setAvatarUrl((profileRow?.avatar_url as string | null | undefined) ?? null);
    })();

    return () => {
      isMounted = false;
    };
  }, [hideNav, pathname]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setAvatarUrl(null);
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  if (hideNav) {
    return null;
  }

  const navItems = [
    { href: ROUTES.insights, label: "Insights", emoji: "🧠" },
    { href: ROUTES.dashboard, label: "Dashboard", emoji: "📊" },
    { href: ROUTES.log, label: "Log Workout", emoji: "🏋️" },
    { href: ROUTES.bodyweight, label: "Bodyweight", emoji: "⚖️" },
    { href: ROUTES.calories, label: "Calories", emoji: "🍽️" },
  ];
  const isProfileActive = pathname?.startsWith(ROUTES.profile);

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/80 px-4 py-3 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
        <p className="hidden text-xs font-semibold uppercase tracking-[0.2em] text-amber-300/80 sm:block">
          Gym Mode: On
        </p>

        <div className="w-full sm:w-auto">
          <div className="flex w-full items-center gap-2 sm:w-auto sm:min-w-max">
            <nav className="flex flex-1 items-center justify-between gap-1 rounded-2xl border border-zinc-700/70 bg-zinc-900/70 p-1.5 shadow-lg sm:flex-none sm:justify-start sm:gap-2">
              {navItems.map((item) => {
                const isActive = pathname?.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex-1 rounded-xl px-2 py-2 text-center text-xs font-semibold transition sm:flex-none sm:px-4 sm:text-sm ${
                      isActive
                        ? `${CLASS_GRADIENT_PRIMARY} text-zinc-900`
                        : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                    }`}
                  >
                    <span className="sm:mr-2" aria-hidden>
                      {item.emoji}
                    </span>
                    <span className="hidden sm:inline">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <Link
              href={ROUTES.profile}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition sm:px-3 ${
                isProfileActive
                  ? `border-amber-300/80 ${CLASS_GRADIENT_PRIMARY} text-zinc-900`
                  : "border-zinc-700/70 bg-zinc-900/70 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800"
              }`}
            >
              <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-zinc-100/15 text-xs" aria-hidden>
                {avatarUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  </>
                ) : (
                  "👤"
                )}
              </span>
              <span className="hidden sm:inline">Profile</span>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
