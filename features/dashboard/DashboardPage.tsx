"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardData } from "@/lib/dashboardTypes";
import { loadDashboardData, type DashboardChartWindow } from "@/lib/dashboardService";
import { ROUTES, buildLoginRedirectPath } from "@/lib/routes";
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

function getChartYMax(series: StrengthTimeSeriesPoint[]) {
  const max = series.length > 0 ? Math.max(...series.map((point) => point.score)) : 0;
  return Math.max(100, Math.ceil((max + 100) / 100) * 100);
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
}: {
  series: StrengthTimeSeriesPoint[];
  lineColor: string;
  emptyText: string;
}) {
  const chartData = toChartData(series);
  const yMax = getChartYMax(series);

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
          domain={[0, yMax]}
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
        <Line type="monotone" dataKey="score" stroke={lineColor} strokeWidth={3} dot={{ r: 3 }} />
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

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<string>("");
  const [chartWindow, setChartWindow] = useState<DashboardChartWindow>("90d");

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
        router.replace(buildLoginRedirectPath(ROUTES.dashboard, "session_expired"));
        return;
      }

      if (result.status === "error") {
        setMsg(result.message);
        setLoading(false);
        return;
      }

      setData(result.data);
      setLoading(false);
    })();

    return () => {
      isMounted = false;
    };
  }, [router, chartWindow]);

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

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(data?.trackedMuscleGroups ?? []).map((group) => {
            const selectedExercises = data?.selectedExercisesByMuscleGroup[group] ?? [];

            return (
              <div
                key={group}
                className="rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md"
              >
                <h3 className="text-base font-semibold text-white">{formatMuscleGroupTitle(group)}</h3>
                <p className="mt-1 text-xs text-zinc-400">
                  {selectedExercises.length > 0
                    ? `Using top exercises: ${selectedExercises.join(" · ")}`
                    : "No qualifying exercise data yet."}
                </p>
                <div className="mt-3 h-56 w-full">
                  <StrengthLineChart
                    series={data?.muscleGroupStrengthSeries[group] ?? []}
                    lineColor={MUSCLE_GROUP_LINE_COLORS[group]}
                    emptyText={`No ${formatMuscleGroupLabel(group).toLowerCase()} data yet.`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Exercise Strength Trend</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Select an exercise to view session strength over time ({WINDOW_OPTIONS.find((option) => option.id === chartWindow)?.label} window).
              </p>
            </div>

            <select
              value={effectiveSelectedExercise}
              onChange={(e) => setSelectedExercise(e.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-sm text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
              disabled={loading || !data || data.exerciseNames.length === 0}
            >
              {data?.exerciseNames.length ? (
                (Object.keys(EXERCISE_CATEGORY_LABELS) as Array<keyof typeof EXERCISE_CATEGORY_LABELS>).map(
                  (category) => {
                    const categoryExercises = data.exerciseNamesByCategory[category] ?? [];
                    if (categoryExercises.length === 0) return null;

                    return (
                      <optgroup key={category} label={EXERCISE_CATEGORY_LABELS[category]}>
                        {categoryExercises.map((exerciseName) => (
                          <option key={exerciseName} value={exerciseName}>
                            {exerciseName}
                          </option>
                        ))}
                      </optgroup>
                    );
                  }
                )
              ) : (
                <option value="">No exercises</option>
              )}
            </select>
          </div>

          <div className="mt-4 h-72 w-full">
            <StrengthLineChart
              series={selectedExerciseSeries}
              lineColor="#a78bfa"
              emptyText="No session strength data for this exercise yet."
            />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr] lg:items-stretch">
          <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-300/80">Strength Score Formula</p>

            <div className="mt-4 space-y-4 text-sm text-zinc-200">
              <div className="rounded-xl border border-zinc-700/70 bg-zinc-950/40 p-3">
                <p className="font-medium text-zinc-100">Per-Set Score</p>
                <p className="mt-1">Weight × Reps × Rep Multiplier</p>
              </div>

              <div className="rounded-xl border border-zinc-700/70 bg-zinc-950/40 p-3">
                <p className="font-medium text-zinc-100">Rep Multiplier</p>
                <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs text-zinc-300">
                  <p>1–3 reps</p><p className="text-right">0.80</p>
                  <p>4–6 reps</p><p className="text-right">1.00</p>
                  <p>7–9 reps</p><p className="text-right">1.15</p>
                  <p>10–12 reps</p><p className="text-right">1.05</p>
                  <p>13+ reps</p><p className="text-right">1.00</p>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-700/70 bg-zinc-950/40 p-3">
                <p className="font-medium text-zinc-100">Session Score</p>
                <p className="mt-1">0.4 × Set 1 score + 0.6 × Set 2 score</p>
                <p className="mt-1 text-xs text-zinc-300">If only one set exists, use that set score directly.</p>
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
    </div>
  );
}
