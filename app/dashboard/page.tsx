"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Split = "push" | "pull" | "legs" | "core";

type DashboardData = {
  email: string;
  workoutCount: number;
  bodyweightCount: number;
  latestWorkout: { session_date: string; split: Split } | null;
  latestBodyweight: { log_date: string; weight_input: number; unit_input: "lb" | "kg" } | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      setLoading(true);
      setMsg(null);

      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || !sessionData.session) {
        if (isMounted) {
          setMsg("You are not logged in.");
          setLoading(false);
          router.replace("/login");
        }
        return;
      }

      const user = sessionData.session.user;
      const userId = user.id;

      const [
        workoutsCountRes,
        bodyweightCountRes,
        latestWorkoutRes,
        latestBodyweightRes,
      ] = await Promise.all([
        supabase
          .from("workout_sessions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        supabase
          .from("bodyweight_logs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        supabase
          .from("workout_sessions")
          .select("session_date,split")
          .eq("user_id", userId)
          .order("session_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("bodyweight_logs")
          .select("log_date,weight_input,unit_input")
          .eq("user_id", userId)
          .order("log_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (
        workoutsCountRes.error ||
        bodyweightCountRes.error ||
        latestWorkoutRes.error ||
        latestBodyweightRes.error
      ) {
        if (isMounted) {
          setMsg(
            workoutsCountRes.error?.message ||
              bodyweightCountRes.error?.message ||
              latestWorkoutRes.error?.message ||
              latestBodyweightRes.error?.message ||
              "Failed to load dashboard."
          );
          setLoading(false);
        }
        return;
      }

      if (isMounted) {
        setData({
          email: user.email ?? "Athlete",
          workoutCount: workoutsCountRes.count ?? 0,
          bodyweightCount: bodyweightCountRes.count ?? 0,
          latestWorkout: (latestWorkoutRes.data as DashboardData["latestWorkout"]) ?? null,
          latestBodyweight:
            (latestBodyweightRes.data as DashboardData["latestBodyweight"]) ?? null,
        });
        setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(245,158,11,0.18),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(16,185,129,0.16),transparent_32%),radial-gradient(circle_at_50%_95%,rgba(59,130,246,0.14),transparent_35%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:46px_46px] opacity-20" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-5xl px-6 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300/80">Dashboard</p>
        <h1 className="mt-3 text-4xl font-bold text-white">Welcome Back 💪</h1>
        <p className="mt-2 max-w-2xl text-zinc-300">
          {data?.email ? `Signed in as ${data.email}` : "Track progress, stay consistent, and keep building strength."}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-4 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Workout Sessions</p>
            <p className="mt-2 text-2xl font-semibold text-white">{loading ? "..." : data?.workoutCount ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-4 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Bodyweight Logs</p>
            <p className="mt-2 text-2xl font-semibold text-white">{loading ? "..." : data?.bodyweightCount ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-4 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Latest Workout</p>
            <p className="mt-2 text-base font-semibold text-white">
              {loading
                ? "Loading..."
                : data?.latestWorkout
                  ? `${data.latestWorkout.split.toUpperCase()} · ${data.latestWorkout.session_date}`
                  : "No workouts yet"}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-4 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Latest Weight</p>
            <p className="mt-2 text-base font-semibold text-white">
              {loading
                ? "Loading..."
                : data?.latestBodyweight
                  ? `${data.latestBodyweight.weight_input} ${data.latestBodyweight.unit_input} · ${data.latestBodyweight.log_date}`
                  : "No logs yet"}
            </p>
          </div>
        </div>

        {msg && <p className="mt-4 text-sm text-red-300">{msg}</p>}

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Link
            href="/log"
            className="rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 transition hover:border-zinc-500 hover:bg-zinc-900"
          >
            <p className="text-sm text-zinc-400">Next Step</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Log Workout</h2>
            <p className="mt-2 text-sm text-zinc-300">Record today’s sets and reps.</p>
          </Link>

          <Link
            href="/bodyweight"
            className="rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 transition hover:border-zinc-500 hover:bg-zinc-900"
          >
            <p className="text-sm text-zinc-400">Consistency</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Update Bodyweight</h2>
            <p className="mt-2 text-sm text-zinc-300">Track weight trends over time.</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
