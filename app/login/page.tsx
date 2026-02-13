"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    setLoading(true);
    setMsg(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoading(false);
      setMsg(`Login failed: ${error.message}`);
      return;
    }

    // If login succeeds, you should get a session here
    const hasSession = !!data.session;
    setLoading(false);

    if (!hasSession) {
      setMsg(
        "Login call succeeded but no session returned. This usually means email confirmation is required."
      );
      return;
    }

    router.replace("/dashboard");
  }

  const isError = !!msg?.toLowerCase().includes("failed");

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(245,158,11,0.24),transparent_34%),radial-gradient(circle_at_88%_10%,rgba(16,185,129,0.18),transparent_32%),radial-gradient(circle_at_60%_95%,rgba(59,130,246,0.14),transparent_38%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:44px_44px] opacity-20" />
        <div className="absolute -top-24 left-[-40px] h-64 w-64 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="absolute bottom-[-80px] right-[-20px] h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-12">
        <div className="hidden w-full max-w-lg pr-10 md:block">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-300/80">
            Built For Progress
          </p>
          <h2 className="mt-4 text-5xl font-black leading-tight text-white">
            Train Hard.
            <br />
            Stay Consistent.
            <br />
            Lift Stronger.
          </h2>
          <p className="mt-5 max-w-md text-zinc-300">
            Every rep compounds. Show up, log your sets, and keep the streak alive.
          </p>

          <div className="mt-8 grid max-w-md grid-cols-3 gap-3 text-center text-xs text-zinc-200">
            <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 py-3">
              <p className="text-lg font-semibold text-white">4x</p>
              <p className="mt-1 text-zinc-400">Sessions/Wk</p>
            </div>
            <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 py-3">
              <p className="text-lg font-semibold text-white">+1%</p>
              <p className="mt-1 text-zinc-400">Every Day</p>
            </div>
            <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 py-3">
              <p className="text-lg font-semibold text-white">PR</p>
              <p className="mt-1 text-zinc-400">Mindset</p>
            </div>
          </div>
        </div>

        <div className="w-full max-w-md rounded-3xl border border-zinc-700/70 bg-zinc-900/70 p-7 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-md">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
            Bibesh Personal Gym Tracker
          </p>
          <h1 className="mt-3 text-3xl font-bold text-white">Welcome back, Bibesh 💪</h1>
          <p className="mt-2 text-sm text-zinc-300">
            Sign in and keep your progress moving. One workout at a time.
          </p>

          <form onSubmit={signIn} className="mt-5">
            <label htmlFor="email" className="block text-sm font-medium text-zinc-200">
              Email
            </label>
            <input
              id="email"
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />

            <label htmlFor="password" className="mt-4 block text-sm font-medium text-zinc-200">
              Password
            </label>
            <input
              id="password"
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />

            <button
              type="submit"
              disabled={loading}
              className="mt-5 w-full rounded-md bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 py-2 font-semibold text-zinc-900 transition hover:brightness-110 disabled:opacity-60"
            >
              {loading ? "Working..." : "Sign in"}
            </button>

            <p className="mt-4 text-center text-xs text-zinc-500">
              Discipline over motivation. Keep the streak alive.
            </p>
          </form>

          {msg && (
            <p className={`mt-4 text-sm ${isError ? "text-red-300" : "text-emerald-300"}`}>
              {msg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
