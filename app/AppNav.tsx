"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AppNav() {
  const pathname = usePathname();

  if (pathname === "/login") {
    return null;
  }

  const navItems = [
    { href: "/dashboard", label: "Dashboard", emoji: "📊" },
    { href: "/log", label: "Log Workout", emoji: "🏋️" },
    { href: "/bodyweight", label: "Bodyweight", emoji: "⚖️" },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/80 px-4 py-3 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
        <p className="hidden text-xs font-semibold uppercase tracking-[0.2em] text-amber-300/80 sm:block">
          Gym Mode: On
        </p>

        <nav className="flex items-center gap-2 rounded-2xl border border-zinc-700/70 bg-zinc-900/70 p-1.5 shadow-lg">
          {navItems.map((item) => {
            const isActive = pathname?.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  isActive
                    ? "bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 text-zinc-900"
                    : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
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
      </div>
    </header>
  );
}