"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ROUTES, getSafeProtectedNextRoute } from "@/lib/routes";

function readNextParam() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("next");
}

export default function SessionExpiredPage() {
  const loginHref = useMemo(() => {
    const safeNext = getSafeProtectedNextRoute(readNextParam());
    const params = new URLSearchParams();
    params.set("reason", "session_expired");
    if (safeNext) {
      params.set("next", safeNext);
    }
    return `${ROUTES.login}?${params.toString()}`;
  }, []);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-6 text-zinc-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(245,158,11,0.18),transparent_34%),radial-gradient(circle_at_82%_20%,rgba(59,130,246,0.14),transparent_34%),radial-gradient(circle_at_50%_88%,rgba(16,185,129,0.12),transparent_36%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:44px_44px] opacity-20" />
      </div>

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-zinc-700/70 bg-zinc-900/75 p-7 text-center shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-md">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300/85">Session Expired</p>
        <h1 className="mt-4 text-3xl font-bold text-white">You were signed out for inactivity</h1>
        <p className="mt-3 text-sm text-zinc-300">
          For security, your session expires after 1 hour of inactivity. Sign in again to continue.
        </p>

        <Link
          href={loginHref}
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:brightness-110"
        >
          Go to Login
        </Link>
      </div>
    </div>
  );
}
