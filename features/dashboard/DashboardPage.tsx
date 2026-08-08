"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardData } from "@/lib/dashboardTypes";
import { loadDashboardData, type DashboardChartWindow } from "@/lib/dashboardService";
import { ROUTES, buildSessionExpiredPath } from "@/lib/routes";
import { getDashboardViewModel } from "@/features/dashboard/view";
import type {
  StrengthTimeSeriesPoint,
  TrackedMuscleGroup,
} from "@/lib/dashboardStrength";
import { LB_PER_KG, toKg } from "@/lib/convertWeight";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ArchivedBadge from "@/shared/ui/ArchivedBadge";
import GradientButton from "@/shared/ui/GradientButton";
import TogglePill from "@/shared/ui/TogglePill";

function formatChartLabel(dateIso: string) {
  const date = new Date(`${dateIso}T00:00:00`);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function toChartData(series: StrengthTimeSeriesPoint[]) {
  return series.map((point) => ({
    ...point,
    label: formatChartLabel(point.date),
  }));
}

function getChartYDomain(series: StrengthTimeSeriesPoint[]): [number, number] {
  if (series.length === 0) return [0, 100];

  const scores = series.map((p) => p.score);
  const dataMin = Math.min(...scores);
  const dataMax = Math.max(...scores);
  const dataRange = dataMax - dataMin;

  // Padding: 15% of the data range, at least 5% of the max value, never less than 3.
  // This zooms in meaningfully while avoiding exaggerating small changes.
  const pad = Math.max(dataRange * 0.15, dataMax * 0.05, 3);

  return [Math.max(0, Math.floor(dataMin - pad)), Math.ceil(dataMax + pad)];
}

function formatSummaryLineWithLb(line: string) {
  return line.replace(/(\d+(?:\.\d+)?)×(\d+(?:\.\d+)?)/g, (_match, weightText, repsText) => {
    const weight = Number(weightText);
    if (!Number.isFinite(weight)) return `${weightText}×${repsText}`;
    const weightLb = weight * LB_PER_KG;
    return `${weightLb.toFixed(1)} lb × ${repsText}`;
  });
}

function StrengthLineChart({
  series,
  lineColor,
  emptyText,
  isArchived = false,
}: {
  series: StrengthTimeSeriesPoint[];
  lineColor: string;
  emptyText: string;
  isArchived?: boolean;
}) {
  const chartData = toChartData(series);
  const [yMin, yMax] = getChartYDomain(series);

  if (chartData.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-400">
        {emptyText}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
        <XAxis
          dataKey="label"
          tick={{ fill: "#a1a1aa", fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: "#52525b" }}
        />
        <YAxis
          tick={{ fill: "#a1a1aa", fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: "#52525b" }}
          width={64}
          domain={[yMin, yMax]}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload || payload.length === 0) return null;

            const point = payload[0]?.payload as {
              date?: string;
              score?: number;
              summaryLines?: string[];
            };

            if (!point?.date) return null;

            return (
              <div className="rounded-lg border border-zinc-700 bg-zinc-900/95 px-3 py-2 text-xs text-zinc-200 shadow-lg">
                <p className="font-semibold text-zinc-100">{point.date}</p>
                {point.summaryLines && point.summaryLines.length > 0 && (
                  <div className="mt-1 max-w-xs space-y-1 text-zinc-300">
                    {point.summaryLines.map((line) => (
                      <p key={line} className="leading-relaxed">{formatSummaryLineWithLb(line)}</p>
                    ))}
                  </div>
                )}
                <p className="mt-2 font-semibold text-amber-300">Score: {(point.score ?? 0).toFixed(1)}</p>
              </div>
            );
          }}
        />
        <Line
          type="monotone"
          dataKey="score"
          stroke={isArchived ? "#71717a" : lineColor}
          strokeWidth={isArchived ? 2 : 3}
          strokeDasharray={isArchived ? "5 5" : undefined}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function formatMuscleGroupLabel(group: TrackedMuscleGroup) {
  if (group === "abs") return "Core";
  if (group === "bicep") return "Bicep";
  if (group === "tricep") return "Tricep";
  if (group === "quad") return "Quad";
  if (group === "hamstring") return "Hamstring";
  if (group === "shoulder") return "Shoulder";
  if (group === "back") return "Back";
  return "Chest";
}

function formatMuscleGroupTitle(group: TrackedMuscleGroup) {
  return `${formatMuscleGroupLabel(group)} Strength Trend`;
}

const MUSCLE_GROUP_LINE_COLORS: Record<TrackedMuscleGroup, string> = {
  back: "#38bdf8",
  bicep: "#818cf8",
  tricep: "#f472b6",
  chest: "#f97316",
  quad: "#34d399",
  hamstring: "#22c55e",
  shoulder: "#f59e0b",
  abs: "#a78bfa",
};

const EXERCISE_CATEGORY_LABELS: Record<"push" | "pull" | "legs" | "core", string> = {
  push: "Push",
  pull: "Pull",
  legs: "Legs",
  core: "Core",
};

const WINDOW_OPTIONS: Array<{ id: DashboardChartWindow; label: string }> = [
  { id: "90d", label: "90 days" },
  { id: "180d", label: "180 days" },
  { id: "all", label: "All" },
];

const EXERCISE_CHART_COLORS = [
  "#f97316", "#38bdf8", "#34d399", "#a78bfa",
  "#f472b6", "#fbbf24", "#4ade80", "#fb7185",
  "#60a5fa", "#c084fc", "#67e8f9", "#86efac",
];

const PINNED_EXERCISES_KEY = "dashboard_pinned_exercises";

function loadPinnedExercisesFromStorage(): string[] | null {
  try {
    const raw = localStorage.getItem(PINNED_EXERCISES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return (parsed as unknown[]).filter((v): v is string => typeof v === "string");
  } catch {
    return null;
  }
}

function savePinnedExercisesToStorage(names: string[]) {
  try { localStorage.setItem(PINNED_EXERCISES_KEY, JSON.stringify(names)); } catch {}
}

function getDefaultPinnedExercises(
  exerciseStrengthSeries: Record<string, StrengthTimeSeriesPoint[]>,
  exerciseIsArchivedByName: Record<string, boolean>,
  count: number
): string[] {
  return Object.entries(exerciseStrengthSeries)
    .filter(([name]) => !(exerciseIsArchivedByName[name] ?? false))
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, count)
    .map(([name]) => name);
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<string>("");
  const [chartWindow, setChartWindow] = useState<DashboardChartWindow>("90d");
  const [showArchivedExercises, setShowArchivedExercises] = useState(false);
  const [pinnedExercises, setPinnedExercises] = useState<string[]>([]);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [customizerSnapshot, setCustomizerSnapshot] = useState<string[]>([]);
  const pinnedInitializedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      setLoading(true);
      setMsg(null);

      const result = await loadDashboardData(chartWindow);
      if (!isMounted) return;

      if (result.status === "unauthenticated") {
        setMsg("You are not logged in.");
        setLoading(false);
        router.replace(buildSessionExpiredPath(ROUTES.dashboard));
        return;
      }

      if (result.status === "error") {
        setMsg(result.message);
        setLoading(false);
        return;
      }

      setData(result.data);

      if (!pinnedInitializedRef.current) {
        pinnedInitializedRef.current = true;
        const stored = loadPinnedExercisesFromStorage();
        const valid = stored?.filter((name) => !!result.data.exerciseStrengthSeries[name]) ?? [];
        if (valid.length > 0) {
          setPinnedExercises(valid);
        } else {
          const defaults = getDefaultPinnedExercises(
            result.data.exerciseStrengthSeries,
            result.data.exerciseIsArchivedByName,
            6
          );
          setPinnedExercises(defaults);
          savePinnedExercisesToStorage(defaults);
        }
      }

      setLoading(false);

      if (!pinnedInitialized) {
        const stored = loadPinnedExercisesFromStorage();
        const valid = stored?.filter((name) => !!result.data.exerciseStrengthSeries[name]) ?? [];
        if (valid.length > 0) {
          setPinnedExercises(valid);
        } else {
          const defaults = getDefaultPinnedExercises(result.data.exerciseStrengthSeries, result.data.exerciseIsArchivedByName, 6);
          setPinnedExercises(defaults);
          savePinnedExercisesToStorage(defaults);
        }
        setPinnedInitialized(true);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [router, chartWindow]);

  useEffect(() => {
    if (!data || pinnedInitialized) return;
    const stored = loadPinnedExercisesFromStorage();
    const valid = stored?.filter((name) => !!data.exerciseStrengthSeries[name]) ?? [];
    if (valid.length > 0) {
      setPinnedExercises(valid);
    } else {
      const defaults = getDefaultPinnedExercises(data.exerciseStrengthSeries, data.exerciseIsArchivedByName, 6);
      setPinnedExercises(defaults);
      savePinnedExercisesToStorage(defaults);
    }
    setPinnedInitialized(true);
  }, [data, pinnedInitialized]);

  const effectiveSelectedExercise =
    data && data.exerciseNames.length > 0
      ? selectedExercise && data.exerciseStrengthSeries[selectedExercise]
        ? selectedExercise
        : data.exerciseNames[0]
      : "";

  const selectedExerciseSeries =
    effectiveSelectedExercise && data ? data.exerciseStrengthSeries[effectiveSelectedExercise] ?? [] : [];
  const viewModel = getDashboardViewModel({ loading, msg, data });

  function getLatestWeightDisplayText() {
    if (loading) return "Loading...";
    if (!data?.latestBodyweight) return "No logs yet";

    const rawValue = Number(data.latestBodyweight.weight_input);
    const rawUnit = data.latestBodyweight.unit_input;
    const valueInKg = toKg(rawValue, rawUnit);
    const valueLb = valueInKg * LB_PER_KG;
    return `${valueLb.toFixed(1)} lb · ${data.latestBodyweight.log_date}`;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(245,158,11,0.18),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(16,185,129,0.16),transparent_32%),radial-gradient(circle_at_50%_95%,rgba(59,130,246,0.14),transparent_35%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:46px_46px] opacity-20" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-5xl px-6 py-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300/80">Dashboard</p>
          <h1 className="mt-3 text-4xl font-bold text-white">{viewModel.welcomeTitle}</h1>
          <p className="mt-2 max-w-2xl text-zinc-300">
            Track progress, stay consistent, and keep building strength.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-4 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Latest Workout</p>
            <p className="mt-2 text-base font-semibold text-white">{viewModel.latestWorkoutText}</p>
          </div>
          <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-4 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Latest Weight</p>
            <p className="mt-2 text-base font-semibold text-white">{getLatestWeightDisplayText()}</p>
          </div>
          <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-4 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Latest Calories</p>
            <p className="mt-2 text-base font-semibold text-white">{viewModel.latestCaloriesText}</p>
          </div>
        </div>

        {viewModel.errorMessage && <p className="mt-4 text-sm text-red-300">{viewModel.errorMessage}</p>}

        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-zinc-700/70 bg-zinc-900/70 p-1">
          {WINDOW_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setChartWindow(option.id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                chartWindow === option.id
                  ? "bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 text-zinc-900"
                  : "text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-6 rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Exercise Strength Trends</h2>
              <p className="mt-1 text-sm text-zinc-400">
                {loading
                  ? "Loading..."
                  : `${pinnedExercises.length} exercise${pinnedExercises.length !== 1 ? "s" : ""} · ${WINDOW_OPTIONS.find((o) => o.id === chartWindow)?.label} window`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setCustomizerSnapshot(pinnedExercises);
                setShowCustomizer(true);
              }}
              disabled={loading || !data}
              className="rounded-md border border-zinc-600 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50"
            >
              Customize
            </button>
          </div>

          {loading ? (
            <p className="mt-6 text-sm text-zinc-400">Loading charts...</p>
          ) : pinnedExercises.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-zinc-700 py-10 text-center text-sm text-zinc-400">
              No exercises selected.{" "}
              <button
                type="button"
                onClick={() => { setCustomizerSnapshot([]); setShowCustomizer(true); }}
                className="text-amber-300 underline underline-offset-2"
              >
                Customize
              </button>{" "}
              to add some.
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pinnedExercises.map((name, idx) => {
                const series = data?.exerciseStrengthSeries[name] ?? [];
                const isArchived = data?.exerciseIsArchivedByName[name] ?? false;
                const color = EXERCISE_CHART_COLORS[idx % EXERCISE_CHART_COLORS.length] ?? "#a78bfa";
                return (
                  <div key={name} className="rounded-2xl border border-zinc-700/70 bg-zinc-950/50 p-4">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-zinc-100">{name}</p>
                        {isArchived && <ArchivedBadge />}
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${name}`}
                        onClick={() => {
                          const next = pinnedExercises.filter((n) => n !== name);
                          setPinnedExercises(next);
                          savePinnedExercisesToStorage(next);
                        }}
                        className="shrink-0 text-zinc-600 transition hover:text-zinc-300"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="mt-3 h-44">
                      <StrengthLineChart
                        series={series}
                        lineColor={color}
                        isArchived={isArchived}
                        emptyText="No data yet"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr] lg:items-stretch">
          <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-300/80">Strength Score Formula</p>

            <div className="mt-4 space-y-4 text-sm text-zinc-200">
              <div className="rounded-xl border border-zinc-700/70 bg-zinc-950/40 p-3">
                <p className="font-medium text-zinc-100">Per-Set Score</p>
                <p className="mt-1">Weight × Rep Multiplier</p>
                <p className="mt-1 text-xs text-zinc-400">Weight is the primary driver. The multiplier adds a small bonus for each rep within the 5–9 target range.</p>
              </div>

              <div className="rounded-xl border border-zinc-700/70 bg-zinc-950/40 p-3">
                <p className="font-medium text-zinc-100">Rep Multiplier</p>
                <p className="mt-1 text-xs text-zinc-400">Consistent heavier weight scores higher than more reps at a lighter weight.</p>
                <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs text-zinc-300">
                  <p>1–3 reps</p><p className="text-right">0.85</p>
                  <p>4 reps</p><p className="text-right">0.93</p>
                  <p className="font-medium text-zinc-100">5 reps (target start)</p><p className="text-right font-medium text-zinc-100">1.00</p>
                  <p className="font-medium text-zinc-100">9 reps (target end)</p><p className="text-right font-medium text-zinc-100">1.04</p>
                  <p>10–12 reps</p><p className="text-right">0.95</p>
                  <p>13+ reps</p><p className="text-right">0.85</p>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-700/70 bg-zinc-950/40 p-3">
                <p className="font-medium text-zinc-100">Session Score</p>
                <p className="mt-1">(Set 1 score + Set 2 score) ÷ 2</p>
                <p className="mt-1 text-xs text-zinc-300">If only one set exists, use that set score directly.</p>
              </div>

              <div className="rounded-xl border border-zinc-700/70 bg-zinc-950/40 p-3">
                <p className="font-medium text-zinc-100">Progression Model</p>
                <p className="mt-1 text-xs text-zinc-300">Build reps from 5 → 9 at the same weight. When you reach 9, increase weight — reps naturally drop back toward 5. Both rep increases and weight increases raise your score.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
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

            <Link
              href="/calories"
              className="rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 transition hover:border-zinc-500 hover:bg-zinc-900"
            >
              <p className="text-sm text-zinc-400">Nutrition</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Log Calories</h2>
              <p className="mt-2 text-sm text-zinc-300">Track intake and estimated burn in one place.</p>
            </Link>
          </div>
        </div>

      </div>

      {showCustomizer && data && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/70 backdrop-blur-sm sm:items-center sm:p-4">
          <div
            className="flex w-full max-w-lg flex-col rounded-t-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl sm:rounded-2xl"
            style={{ maxHeight: "85vh" }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">Customize Charts</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Choose Exercises</h3>
            <p className="mt-1 text-sm text-zinc-400">
              {pinnedExercises.length} selected — check an exercise to pin it to your dashboard.
            </p>

            <div className="mt-4 flex items-center gap-2">
              <span className="text-xs text-zinc-400">Show archived</span>
              <TogglePill
                enabled={showArchivedExercises}
                onToggle={() => setShowArchivedExercises((v) => !v)}
                onLabel="On"
                offLabel="Off"
              />
            </div>

            <div className="mt-3 flex-1 overflow-y-auto">
              {(Object.keys(EXERCISE_CATEGORY_LABELS) as Array<keyof typeof EXERCISE_CATEGORY_LABELS>).map((category) => {
                const exercises = (data.exerciseNamesByCategory[category] ?? []).filter(
                  (name) => showArchivedExercises || !(data.exerciseIsArchivedByName[name] ?? false)
                );
                if (exercises.length === 0) return null;
                return (
                  <div key={category}>
                    <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      {EXERCISE_CATEGORY_LABELS[category]}
                    </p>
                    {exercises.map((name) => {
                      const isPinned = pinnedExercises.includes(name);
                      const isArchived = data.exerciseIsArchivedByName[name] ?? false;
                      return (
                        <label
                          key={name}
                          className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-zinc-800"
                        >
                          <input
                            type="checkbox"
                            checked={isPinned}
                            onChange={() =>
                              setPinnedExercises((prev) =>
                                isPinned ? prev.filter((n) => n !== name) : [...prev, name]
                              )
                            }
                            className="h-4 w-4 rounded border-zinc-600 accent-amber-400"
                          />
                          <span className={`flex-1 text-sm ${isArchived ? "text-zinc-500 line-through" : "text-zinc-200"}`}>
                            {name}
                          </span>
                          {isArchived && <ArchivedBadge />}
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex items-center justify-between gap-2 border-t border-zinc-700/60 pt-4">
              <button
                type="button"
                onClick={() => {
                  const defaults = getDefaultPinnedExercises(data.exerciseStrengthSeries, data.exerciseIsArchivedByName, 6);
                  setPinnedExercises(defaults);
                }}
                className="text-xs text-zinc-400 transition hover:text-zinc-200"
              >
                Reset to top 6
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPinnedExercises(customizerSnapshot);
                    setShowCustomizer(false);
                  }}
                  className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <GradientButton
                  label="Save"
                  onClick={() => {
                    savePinnedExercisesToStorage(pinnedExercises);
                    setShowCustomizer(false);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
