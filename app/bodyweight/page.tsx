"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { LB_PER_KG, toKg, type Unit } from "@/lib/convertWeight";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type BodyweightLog = {
  id: string | number;
  log_date: string;
  weight_input: number;
  unit_input: Unit;
  weight_kg: number;
};

type PendingOverwrite = {
  userId: string;
  logDate: string;
  weightNum: number;
  inputUnit: Unit;
};

type ChartRange = "biweekly" | "1m" | "3m" | "6m" | "1y";

export default function BodyweightPage() {
  const today = new Date().toISOString().slice(0, 10);

  const [date, setDate] = useState(
    today
  );

  const [weight, setWeight] = useState("");
  const [unit, setUnit] = useState<Unit>("lb");
  const [displayUnit, setDisplayUnit] = useState<Unit>("lb");
  const [chartRange, setChartRange] = useState<ChartRange>("biweekly");

  const [logs, setLogs] = useState<BodyweightLog[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingOverwrite, setPendingOverwrite] = useState<PendingOverwrite | null>(null);
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(5);
  const [historyFilterMode, setHistoryFilterMode] = useState<"single" | "range">("range");
  const [historySingleDate, setHistorySingleDate] = useState(today);
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");

  function formatWeight(weightKg: number, targetUnit: Unit) {
    const converted = targetUnit === "kg" ? weightKg : weightKg * LB_PER_KG;
    return converted.toFixed(1);
  }

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
    const timeoutId = window.setTimeout(() => {
      void loadLogs();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  const latestLog = logs[0];
  const avgKg = logs.length
    ? (
        logs.reduce((sum, entry) => sum + Number(entry.weight_kg || 0), 0) / logs.length
      ).toFixed(1)
    : null;
  const avgDisplay = avgKg
    ? formatWeight(Number(avgKg), displayUnit)
    : null;

  const fullChartData = [...logs]
    .sort((a, b) => a.log_date.localeCompare(b.log_date))
    .map((log) => {
      const date = new Date(`${log.log_date}T00:00:00`);
      return {
        logDate: log.log_date,
        label: date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        weight: Number(formatWeight(Number(log.weight_kg || 0), displayUnit)),
      };
    });

  const chartDaysByRange: Record<ChartRange, number> = {
    biweekly: 14,
    "1m": 30,
    "3m": 90,
    "6m": 180,
    "1y": 365,
  };

  const rangeDays = chartDaysByRange[chartRange];
  const rangeStartDate = new Date();
  rangeStartDate.setHours(0, 0, 0, 0);
  rangeStartDate.setDate(rangeStartDate.getDate() - rangeDays + 1);
  const rangeStartIso = rangeStartDate.toISOString().slice(0, 10);

  const chartData = fullChartData.filter((point) => point.logDate >= rangeStartIso);

  const chartWeights = chartData.map((d) => d.weight);
  const minWeight = chartWeights.length ? Math.min(...chartWeights) : 0;
  const maxWeight = chartWeights.length ? Math.max(...chartWeights) : 0;
  const minSpan = displayUnit === "kg" ? 1 : 2;
  const basePadding = displayUnit === "kg" ? 0.6 : 1.2;
  const tickStep = displayUnit === "kg" ? 1 : 2;
  const span = Math.max(maxWeight - minWeight, minSpan);
  const yMinRaw = minWeight - basePadding - (span === minSpan ? minSpan / 2 : 0);
  const yMaxRaw = maxWeight + basePadding + (span === minSpan ? minSpan / 2 : 0);
  const yMin = Math.floor(yMinRaw / tickStep) * tickStep;
  const yMax = Math.ceil(yMaxRaw / tickStep) * tickStep;
  const yTicks = Array.from(
    { length: Math.floor((yMax - yMin) / tickStep) + 1 },
    (_, index) => Number((yMin + index * tickStep).toFixed(1))
  );
  const historyLogs = logs.filter((log) => {
    if (historyFilterMode === "single") {
      return log.log_date === historySingleDate;
    }

    const startsAfterMin = historyStartDate ? log.log_date >= historyStartDate : true;
    const endsBeforeMax = historyEndDate ? log.log_date <= historyEndDate : true;
    return startsAfterMin && endsBeforeMax;
  });

  const cappedHistoryLogs = historyLogs.slice(0, 20);
  const visibleLogs = cappedHistoryLogs.slice(0, visibleHistoryCount);
  const hasMoreHistory = cappedHistoryLogs.length > visibleHistoryCount;
  const canShowLessHistory = visibleHistoryCount > 5;
  const hasActiveHistoryFilter =
    historyFilterMode === "single" ||
    historyStartDate.length > 0 ||
    historyEndDate.length > 0;

  function resetHistoryFilters() {
    setHistoryFilterMode("range");
    setHistorySingleDate(today);
    setHistoryStartDate("");
    setHistoryEndDate("");
    setVisibleHistoryCount(5);
  }

  async function persistWeightEntry(payload: PendingOverwrite) {
    const { error } = await supabase
      .from("bodyweight_logs")
      .upsert(
        {
          user_id: payload.userId,
          log_date: payload.logDate,
          weight_input: payload.weightNum,
          unit_input: payload.inputUnit,
          weight_kg: toKg(payload.weightNum, payload.inputUnit),
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

    const payload: PendingOverwrite = {
      userId,
      logDate: date,
      weightNum,
      inputUnit: unit,
    };

    const hasEntryForDate = logs.some((log) => log.log_date === date);
    if (hasEntryForDate) {
      setPendingOverwrite(payload);
      setLoading(false);
      return;
    }

    await persistWeightEntry(payload);
  }

  async function confirmReplace() {
    if (!pendingOverwrite) return;
    setLoading(true);
    setMsg(null);
    const payload = pendingOverwrite;
    setPendingOverwrite(null);
    await persistWeightEntry(payload);
  }

  function cancelReplace() {
    setPendingOverwrite(null);
    setMsg("Update cancelled.");
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
              {latestLog ? `${formatWeight(Number(latestLog.weight_kg || 0), displayUnit)} ${displayUnit}` : "—"}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-4 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Average ({displayUnit})</p>
            <p className="mt-2 text-2xl font-semibold text-white">{avgDisplay ?? "—"}</p>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Bodyweight Trend</h2>
              <p className="mt-1 text-sm text-zinc-400">Date vs Weight</p>
            </div>

            <div className="inline-flex rounded-lg border border-zinc-700 bg-zinc-950/70 p-1">
              <button
                onClick={() => setDisplayUnit("kg")}
                className={`rounded-md px-3 py-1 text-sm transition ${
                  displayUnit === "kg"
                    ? "bg-amber-300 text-zinc-900"
                    : "text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                kg
              </button>
              <button
                onClick={() => setDisplayUnit("lb")}
                className={`rounded-md px-3 py-1 text-sm transition ${
                  displayUnit === "lb"
                    ? "bg-amber-300 text-zinc-900"
                    : "text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                lb
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => setChartRange("biweekly")}
              className={`rounded-md px-3 py-1 text-sm transition ${
                chartRange === "biweekly"
                  ? "bg-amber-300 text-zinc-900"
                  : "border border-zinc-700 bg-zinc-950/70 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              Biweekly
            </button>
            <button
              onClick={() => setChartRange("1m")}
              className={`rounded-md px-3 py-1 text-sm transition ${
                chartRange === "1m"
                  ? "bg-amber-300 text-zinc-900"
                  : "border border-zinc-700 bg-zinc-950/70 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              1M
            </button>
            <button
              onClick={() => setChartRange("3m")}
              className={`rounded-md px-3 py-1 text-sm transition ${
                chartRange === "3m"
                  ? "bg-amber-300 text-zinc-900"
                  : "border border-zinc-700 bg-zinc-950/70 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              3M
            </button>
            <button
              onClick={() => setChartRange("6m")}
              className={`rounded-md px-3 py-1 text-sm transition ${
                chartRange === "6m"
                  ? "bg-amber-300 text-zinc-900"
                  : "border border-zinc-700 bg-zinc-950/70 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              6M
            </button>
            <button
              onClick={() => setChartRange("1y")}
              className={`rounded-md px-3 py-1 text-sm transition ${
                chartRange === "1y"
                  ? "bg-amber-300 text-zinc-900"
                  : "border border-zinc-700 bg-zinc-950/70 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              1Y
            </button>
          </div>

          <div className="mt-4 h-72 w-full">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-400">
                No entries in this selected range.
              </div>
            ) : (
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
                    width={56}
                    domain={[yMin, yMax]}
                    ticks={yTicks}
                    tickFormatter={(value: number) => value.toFixed(1)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#18181b",
                      border: "1px solid #3f3f46",
                      borderRadius: "10px",
                    }}
                    labelStyle={{ color: "#e4e4e7" }}
                    formatter={(value: number | string | undefined) => {
                      const numericValue =
                        typeof value === "number"
                          ? value
                          : Number(value ?? 0);

                      return [`${numericValue.toFixed(1)} ${displayUnit}`, "Bodyweight"] as const;
                    }}
                    labelFormatter={(label, payload) => {
                      const logDate = payload?.[0]?.payload?.logDate;
                      return logDate || label;
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="#fcd34d"
                    strokeWidth={3}
                    dot={{ r: 3, fill: "#fcd34d" }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">History</h2>
              <p className="mt-1 text-xs text-zinc-400">
                Showing up to 20 records for the selected date filter on this page.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <select
                value={historyFilterMode}
                onChange={(e) => {
                  setHistoryFilterMode(e.target.value as "single" | "range");
                  setVisibleHistoryCount(5);
                }}
                className="rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-sm text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
              >
                <option value="single">Single date</option>
                <option value="range">Date range</option>
              </select>

              {historyFilterMode === "single" ? (
                <>
                  <input
                    type="date"
                    value={historySingleDate}
                    onChange={(e) => {
                      setHistorySingleDate(e.target.value);
                      setVisibleHistoryCount(5);
                    }}
                    className="rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-sm text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2 sm:col-span-2"
                  />
                  <button
                    type="button"
                    onClick={resetHistoryFilters}
                    className="rounded-md border border-zinc-600 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
                  >
                    Recent logs
                  </button>
                </>
              ) : (
                <>
                  <input
                    type="date"
                    value={historyStartDate}
                    onChange={(e) => {
                      setHistoryStartDate(e.target.value);
                      setVisibleHistoryCount(5);
                    }}
                    className="rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-sm text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                  />
                  <input
                    type="date"
                    value={historyEndDate}
                    onChange={(e) => {
                      setHistoryEndDate(e.target.value);
                      setVisibleHistoryCount(5);
                    }}
                    className="rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-sm text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                  />
                  <button
                    type="button"
                    onClick={resetHistoryFilters}
                    disabled={!hasActiveHistoryFilter}
                    className="rounded-md border border-zinc-600 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Recent logs
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {visibleLogs.length === 0 && (
              <p className="text-sm text-zinc-400">No entries found for the selected date filter.</p>
            )}

            {visibleLogs.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-4 py-3"
              >
                <span className="text-sm text-zinc-300">{l.log_date}</span>
                <span className="font-medium text-white">
                  {formatWeight(Number(l.weight_kg || 0), displayUnit)} {displayUnit}
                </span>
              </div>
            ))}

            {(hasMoreHistory || canShowLessHistory) && (
              <div className="flex items-center gap-2 pt-2">
                {hasMoreHistory && (
                  <button
                    type="button"
                    onClick={() => setVisibleHistoryCount((count) => count + 5)}
                    className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
                  >
                    See more
                  </button>
                )}

                {canShowLessHistory && (
                  <button
                    type="button"
                    onClick={() => setVisibleHistoryCount(5)}
                    className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
                  >
                    Show less
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {pendingOverwrite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">Confirm Replace</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Replace existing bodyweight log?</h3>
            <p className="mt-2 text-sm text-zinc-300">
              You already have an entry for <span className="font-semibold text-white">{pendingOverwrite.logDate}</span>. Do you want to replace it with this new value?
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancelReplace}
                className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmReplace()}
                className="rounded-md bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:brightness-110"
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
