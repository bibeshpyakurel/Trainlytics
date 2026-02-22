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

        <div className="flex items-center gap-2">
          <nav className="flex items-center gap-2 rounded-2xl border border-zinc-700/70 bg-zinc-900/70 p-1.5 shadow-lg">
          {navItems.map((item) => {
            const isActive = pathname?.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  isActive
                    ? `${CLASS_GRADIENT_PRIMARY} text-zinc-900`
                    : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                }`}
              >
                <span className="mr-2" aria-hidden>
                  {item.emoji}
                </span>
                {item.label}
              </Link>
            );
          })}
          </nav>
          <Link
            href={ROUTES.profile}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${
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
    </header>
  );
}
