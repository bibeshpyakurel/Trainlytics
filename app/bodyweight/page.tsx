"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toKg, type Unit } from "@/lib/convertWeight";

export default function BodyweightPage() {
  const [date, setDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  const [weight, setWeight] = useState("");
  const [unit, setUnit] = useState<Unit>("lb");

  const [logs, setLogs] = useState<any[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadLogs() {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return;

    const userId = sessionData.session.user.id;

    const { data } = await supabase
      .from("bodyweight_logs")
      .select("*")
      .eq("user_id", userId)
      .order("log_date", { ascending: false });

    setLogs(data ?? []);
  }

  useEffect(() => {
    loadLogs();
  }, []);

  const latestLog = logs[0];
  const avgKg = logs.length
    ? (
        logs.reduce((sum, entry) => sum + Number(entry.weight_kg || 0), 0) / logs.length
      ).toFixed(1)
    : null;

  async function save() {
    setLoading(true);
    setMsg(null);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setMsg("Not logged in.");
      setLoading(false);
      return;
    }

    const userId = sessionData.session.user.id;

    const weightNum = Number(weight);
    if (!Number.isFinite(weightNum) || weightNum <= 0) {
      setMsg("Enter valid weight.");
      setLoading(false);
      return;
    }

    const { error } = await supabase
      .from("bodyweight_logs")
      .upsert(
        {
          user_id: userId,
          log_date: date,
          weight_input: weightNum,
          unit_input: unit,
          weight_kg: toKg(weightNum, unit),
        },
        { onConflict: "user_id,log_date" }
      );

    if (error) {
      setMsg(error.message);
      setLoading(false);
      return;
    }

    setMsg("Saved ✅");
    setWeight("");
    setLoading(false);
    loadLogs();
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(245,158,11,0.18),transparent_34%),radial-gradient(circle_at_85%_10%,rgba(16,185,129,0.12),transparent_32%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:46px_46px] opacity-20" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-5xl px-6 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300/80">Bodyweight Tracking</p>
        <h1 className="mt-3 text-4xl font-bold text-white">Own Your Progress</h1>
        <p className="mt-2 max-w-2xl text-zinc-300">
          Track your weight consistently, spot trends early, and stay focused on long-term gains.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-4 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Total Logs</p>
            <p className="mt-2 text-2xl font-semibold text-white">{logs.length}</p>
          </div>
          <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-4 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Latest Entry</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {latestLog ? `${latestLog.weight_input} ${latestLog.unit_input}` : "—"}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-4 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Average (kg)</p>
            <p className="mt-2 text-2xl font-semibold text-white">{avgKg ?? "—"}</p>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
          <h2 className="text-lg font-semibold text-white">Log Today</h2>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
            <div>
              <label htmlFor="log-date" className="mb-1 block text-sm text-zinc-300">
                Date
              </label>
              <input
                id="log-date"
                type="date"
                className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="weight" className="mb-1 block text-sm text-zinc-300">
                Weight
              </label>
              <input
                id="weight"
                className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                placeholder="Weight"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="unit" className="mb-1 block text-sm text-zinc-300">
                Unit
              </label>
              <select
                id="unit"
                className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                value={unit}
                onChange={(e) => setUnit(e.target.value as Unit)}
              >
                <option value="lb">lb</option>
                <option value="kg">kg</option>
              </select>
            </div>

            <button
              onClick={save}
              disabled={loading}
              className="rounded-md bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 px-5 py-2 font-semibold text-zinc-900 transition hover:brightness-110 disabled:opacity-60"
            >
              {loading ? "Saving..." : "Save"}
            </button>
          </div>

          {msg && <p className="mt-3 text-sm text-zinc-300">{msg}</p>}
        </div>

        <div className="mt-6 rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
          <h2 className="text-lg font-semibold text-white">History</h2>

          <div className="mt-3 space-y-2">
            {logs.length === 0 && (
              <p className="text-sm text-zinc-400">No entries yet. Log your first bodyweight to get started.</p>
            )}

            {logs.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-4 py-3"
              >
                <span className="text-sm text-zinc-300">{l.log_date}</span>
                <span className="font-medium text-white">
                  {l.weight_input} {l.unit_input}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
