"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toKg, type Unit } from "@/lib/convertWeight";

type Split = "push" | "pull" | "legs" | "core";
type MetricType = "WEIGHTED_REPS" | "DURATION";

type Exercise = {
  id: string;
  name: string;
  split: Split;
  muscle_group: string;
  metric_type: MetricType;
  sort_order: number;
};

type WeightedSet = { reps: string; weight: string; unit: Unit };
type DurationSet = { seconds: string };

export default function LogWorkoutPage() {
  const [split, setSplit] = useState<Split>("push");
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Form state keyed by exercise_id
  const [weightedForm, setWeightedForm] = useState<Record<string, [WeightedSet, WeightedSet]>>({});
  const [durationForm, setDurationForm] = useState<Record<string, [DurationSet, DurationSet]>>({});

  // Fetch exercises for this split
  useEffect(() => {
    (async () => {
      setMsg(null);

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setMsg("Not logged in. Go to /login first.");
        setExercises([]);
        return;
      }

      const { data, error } = await supabase
        .from("exercises")
        .select("id,name,split,muscle_group,metric_type,sort_order")
        .eq("split", split)
        .eq("is_active", true)
        .order("sort_order");

      if (error) {
        setMsg(`Error loading exercises: ${error.message}`);
        setExercises([]);
        return;
      }

      const rows = (data ?? []) as Exercise[];
      setExercises(rows);

      // Initialize default 2-set inputs if missing
      setWeightedForm((prev) => {
        const next = { ...prev };
        for (const ex of rows) {
          if (ex.metric_type === "WEIGHTED_REPS" && !next[ex.id]) {
            next[ex.id] = [
              { reps: "", weight: "", unit: "lb" },
              { reps: "", weight: "", unit: "lb" },
            ];
          }
        }
        return next;
      });

      setDurationForm((prev) => {
        const next = { ...prev };
        for (const ex of rows) {
          if (ex.metric_type === "DURATION" && !next[ex.id]) {
            next[ex.id] = [{ seconds: "" }, { seconds: "" }];
          }
        }
        return next;
      });
    })();
  }, [split]);

  const grouped = useMemo(() => {
    const map = new Map<string, Exercise[]>();
    for (const ex of exercises) {
      const key = ex.muscle_group;
      map.set(key, [...(map.get(key) ?? []), ex]);
    }
    return Array.from(map.entries());
  }, [exercises]);

  const splitLabel = split.charAt(0).toUpperCase() + split.slice(1);

  function updateWeighted(exId: string, setIdx: 0 | 1, patch: Partial<WeightedSet>) {
    setWeightedForm((prev) => {
      const cur = prev[exId] ?? [
        { reps: "", weight: "", unit: "lb" as Unit },
        { reps: "", weight: "", unit: "lb" as Unit },
      ];
      const next: [WeightedSet, WeightedSet] = [
        { ...cur[0] },
        { ...cur[1] },
      ];
      next[setIdx] = { ...next[setIdx], ...patch };
      return { ...prev, [exId]: next };
    });
  }

  function updateDuration(exId: string, setIdx: 0 | 1, seconds: string) {
    setDurationForm((prev) => {
      const cur = prev[exId] ?? [{ seconds: "" }, { seconds: "" }];
      const next: [DurationSet, DurationSet] = [{ ...cur[0] }, { ...cur[1] }];
      next[setIdx] = { seconds };
      return { ...prev, [exId]: next };
    });
  }

  async function save() {
    setLoading(true);
    setMsg(null);

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    
    if (sessionErr || !sessionData.session) {
      setLoading(false);
      setMsg("You’re not logged in. Go to /login first.");
      return;
    }
    const userId = sessionData.session.user.id;

    // 1) Upsert/find workout session for date+split
    const { data: sessionRow, error: upsertErr } = await supabase
      .from("workout_sessions")
      .upsert(
          { user_id: userId, session_date: date, split },
          { onConflict: "user_id,session_date,split" }
        )

      .select("id")
      .single();

    if (upsertErr) {
      setLoading(false);
      setMsg(`Failed to create session: ${upsertErr.message}`);
      return;
    }

    const sessionId = sessionRow.id as string;

    // 2) Build sets to insert (2 sets per exercise)
    const payload: any[] = [];

    for (const ex of exercises) {
      if (ex.metric_type === "WEIGHTED_REPS") {
        const sets = weightedForm[ex.id];
        if (!sets) continue;

        for (let i = 0; i < 2; i++) {
          const repsNum = Number(sets[i].reps);
          const wNum = Number(sets[i].weight);
          const unit = sets[i].unit;

          // Skip empty set rows
          if (!sets[i].reps && !sets[i].weight) continue;

          if (!Number.isFinite(repsNum) || repsNum < 0) {
            setLoading(false);
            setMsg(`Invalid reps for ${ex.name} set ${i + 1}`);
            return;
          }
          if (!Number.isFinite(wNum) || wNum < 0) {
            setLoading(false);
            setMsg(`Invalid weight for ${ex.name} set ${i + 1}`);
            return;
          }

          payload.push({
            user_id: userId,
            session_id: sessionId,
            exercise_id: ex.id,
            set_number: i + 1,
            reps: repsNum,
            weight_input: wNum,
            unit_input: unit,
            weight_kg: toKg(wNum, unit),
            duration_seconds: null,
          });
        }
      } else {
        // DURATION (Plank)
        const sets = durationForm[ex.id];
        if (!sets) continue;

        for (let i = 0; i < 2; i++) {
          if (!sets[i].seconds) continue;
          const secNum = Number(sets[i].seconds);
          if (!Number.isFinite(secNum) || secNum < 0) {
            setLoading(false);
            setMsg(`Invalid seconds for ${ex.name} set ${i + 1}`);
            return;
          }

          payload.push({
            user_id: userId,
            session_id: sessionId,
            exercise_id: ex.id,
            set_number: i + 1,
            reps: null,
            weight_input: null,
            unit_input: null,
            weight_kg: null,
            duration_seconds: secNum,
          });
        }
      }
    }

    // Optional: clear previous sets for that session+split (prevents duplicates if you save twice)
    // If you added the unique constraint (session_id, exercise_id, set_number), you can do upsert instead.
    const { error: delErr } = await supabase
      .from("workout_sets")
      .delete()
      .eq("session_id", sessionId);

    if (delErr) {
      setLoading(false);
      setMsg(`Failed clearing old sets: ${delErr.message}`);
      return;
    }

    // 3) Insert new sets
    const { error: insErr } = await supabase.from("workout_sets").insert(payload);

    if (insErr) {
      setLoading(false);
      setMsg(`Failed saving sets: ${insErr.message}`);
      return;
    }

    setLoading(false);
    setMsg("Saved ✅");
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(245,158,11,0.2),transparent_34%),radial-gradient(circle_at_88%_10%,rgba(16,185,129,0.14),transparent_30%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:46px_46px] opacity-20" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-5xl px-6 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300/80">Workout Logger</p>
        <h1 className="mt-3 text-4xl font-bold text-white">Build Strength, Set by Set</h1>
        <p className="mt-2 max-w-2xl text-zinc-300">
          Log your {splitLabel} session with precision and keep momentum every training day.
        </p>

        <div className="mt-6 rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="session-date" className="mb-1 block text-sm text-zinc-300">
                Session Date
              </label>
              <input
                id="session-date"
                className="rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-2 rounded-xl border border-zinc-700/70 bg-zinc-950/60 p-1.5">
              {(["push", "pull", "legs", "core"] as Split[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSplit(s)}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    split === s
                      ? "bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 text-zinc-900"
                      : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                  }`}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              onClick={save}
              disabled={loading}
              className="ml-auto rounded-md bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 px-5 py-2 font-semibold text-zinc-900 transition hover:brightness-110 disabled:opacity-60"
            >
              {loading ? "Saving..." : "Save Workout"}
            </button>
          </div>

          {msg && (
            <p className={`mt-4 text-sm ${msg.toLowerCase().includes("saved") ? "text-emerald-300" : "text-red-300"}`}>
              {msg}
            </p>
          )}
        </div>

        <div className="mt-6 space-y-6">
          {grouped.map(([muscle, list]) => (
            <div key={muscle} className="rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
              <h2 className="text-lg font-semibold capitalize text-white">{muscle}</h2>

              <div className="mt-4 space-y-4">
                {list.map((ex) => (
                  <div key={ex.id} className="rounded-2xl border border-zinc-700/70 bg-zinc-950/60 p-4">
                    <div className="font-medium text-zinc-100">{ex.name}</div>

                    {ex.metric_type === "WEIGHTED_REPS" ? (
                      <div className="mt-3 grid gap-3">
                        {[0, 1].map((i) => {
                          const setIdx = i as 0 | 1;
                          const row = weightedForm[ex.id]?.[setIdx];
                          return (
                            <div key={i} className="flex flex-wrap items-center gap-2">
                              <span className="w-12 text-sm text-zinc-300">Set {i + 1}</span>

                              <input
                                className="w-24 rounded-md border border-zinc-700 bg-zinc-900 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                                placeholder="Reps"
                                inputMode="numeric"
                                value={row?.reps ?? ""}
                                onChange={(e) => updateWeighted(ex.id, setIdx, { reps: e.target.value })}
                              />

                              <input
                                className="w-28 rounded-md border border-zinc-700 bg-zinc-900 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                                placeholder="Weight"
                                inputMode="decimal"
                                value={row?.weight ?? ""}
                                onChange={(e) => updateWeighted(ex.id, setIdx, { weight: e.target.value })}
                              />

                              <select
                                className="rounded-md border border-zinc-700 bg-zinc-900 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                                value={row?.unit ?? "lb"}
                                onChange={(e) => updateWeighted(ex.id, setIdx, { unit: e.target.value as Unit })}
                              >
                                <option value="lb">lb</option>
                                <option value="kg">kg</option>
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-3 grid gap-3">
                        {[0, 1].map((i) => {
                          const setIdx = i as 0 | 1;
                          const row = durationForm[ex.id]?.[setIdx];
                          return (
                            <div key={i} className="flex flex-wrap items-center gap-2">
                              <span className="w-12 text-sm text-zinc-300">Set {i + 1}</span>

                              <input
                                className="w-40 rounded-md border border-zinc-700 bg-zinc-900 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                                placeholder="Seconds"
                                inputMode="numeric"
                                value={row?.seconds ?? ""}
                                onChange={(e) => updateDuration(ex.id, setIdx, e.target.value)}
                              />

                              <span className="text-sm text-zinc-400">seconds</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 text-sm text-zinc-500">
          Tip: After saving, check Supabase tables: <span className="font-mono text-zinc-300">workout_sessions</span> and{" "}
          <span className="font-mono text-zinc-300">workout_sets</span>.
        </p>
      </div>
    </div>
  );
}