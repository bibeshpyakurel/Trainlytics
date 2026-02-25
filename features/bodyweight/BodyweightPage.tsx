"use client";

import { useEffect, useState } from "react";
import { type Unit } from "@/lib/convertWeight";
import type {
  BodyweightLog,
  ChartRange,
  HistoryFilterMode,
  PendingDelete,
  PendingEdit,
  PendingOverwrite,
} from "@/features/bodyweight/types";
import { formatWeightFromKg } from "@/features/bodyweight/utils";
import { toLocalIsoDate } from "@/lib/localDate";
import {
  bodyweightEntryExistsForDate,
  deleteBodyweightLogForCurrentUser,
  getCurrentUserId,
  loadBodyweightLogsForCurrentUser,
  updateBodyweightLogForCurrentUser,
  upsertBodyweightEntry,
} from "@/features/bodyweight/service";
import {
  deleteBodyweightWorkflow,
  editBodyweightWorkflow,
  evaluateSaveBodyweightRequest,
  persistBodyweightWorkflow,
} from "@/features/bodyweight/workflows";
import {
  getBodyweightChartView,
  getBodyweightHistoryView,
  getBodyweightSummary,
} from "@/features/bodyweight/view";
import {
  Area,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function BodyweightPage() {
  const today = toLocalIsoDate();

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
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(5);
  const [historyFilterMode, setHistoryFilterMode] = useState<HistoryFilterMode>("range");
  const [historySingleDate, setHistorySingleDate] = useState(today);
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");

  async function loadLogs(): Promise<string | null> {
    const { logs: loadedLogs, error } = await loadBodyweightLogsForCurrentUser();
    if (error) {
      setMsg(error);
      return error;
    }

    setLogs(loadedLogs);
    return null;
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadLogs();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  const { chartData, yMin, yMax, yTicks, rangeStartIso } = getBodyweightChartView(
    logs,
    displayUnit,
    chartRange
  );
  const { latestLog } = getBodyweightSummary(logs, displayUnit);
  const { avgDisplay } = getBodyweightSummary(
    logs.filter((log) => log.log_date >= rangeStartIso),
    displayUnit
  );
  const { visibleLogs, hasMoreHistory, canShowLessHistory, hasActiveHistoryFilter } =
    getBodyweightHistoryView(
      logs,
      historyFilterMode,
      historySingleDate,
      historyStartDate,
      historyEndDate,
      visibleHistoryCount
    );

  function resetHistoryFilters() {
    setHistoryFilterMode("range");
    setHistorySingleDate(today);
    setHistoryStartDate("");
    setHistoryEndDate("");
    setVisibleHistoryCount(5);
  }

  async function persistWeightEntry(payload: PendingOverwrite) {
    const result = await persistBodyweightWorkflow({ upsertBodyweightEntry }, payload);
    if (result.status === "error") {
      setMsg(result.message);
      setLoading(false);
      return;
    }

    const refreshError = await loadLogs();
    if (refreshError) {
      setLoading(false);
      return;
    }

    setMsg("Saved ✅");
    setWeight("");
    setLoading(false);
  }

  async function save() {
    setLoading(true);
    setMsg(null);

    const result = await evaluateSaveBodyweightRequest(
      { getCurrentUserId, bodyweightEntryExistsForDate },
      { today, date, weight, unit, logs }
    );
    if (result.status === "error") {
      setMsg(result.message);
      setLoading(false);
      return;
    }

    if (result.status === "confirm_overwrite") {
      setPendingOverwrite(result.payload);
      setLoading(false);
      return;
    }

    await persistWeightEntry(result.payload);
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

  function requestDeleteLog(log: BodyweightLog) {
    setPendingDelete({ id: log.id, logDate: log.log_date });
  }

  async function confirmDeleteLog() {
    if (!pendingDelete) return;

    const target = pendingDelete;
    setPendingDelete(null);
    setLoading(true);
    setMsg(null);

    const result = await deleteBodyweightWorkflow({ deleteBodyweightLogForCurrentUser }, target.id);
    if (result.status === "error") {
      setMsg(result.message);
      setLoading(false);
      return;
    }

    const refreshError = await loadLogs();
    if (refreshError) {
      setLoading(false);
      return;
    }

    setMsg("Deleted 🗑️");
    setLoading(false);
  }

  function cancelDeleteLog() {
    setPendingDelete(null);
    setMsg("Delete cancelled.");
  }

  function requestEditLog(log: BodyweightLog) {
    setPendingEdit({
      id: log.id,
      originalLogDate: log.log_date,
      newLogDate: log.log_date,
      weight: String(log.weight_input),
      unit: log.unit_input,
    });
  }

  function cancelEditLog() {
    setPendingEdit(null);
    setMsg("Edit cancelled.");
  }

  async function confirmEditLog() {
    if (!pendingEdit) return;

    setLoading(true);
    setMsg(null);

    const result = await editBodyweightWorkflow({ updateBodyweightLogForCurrentUser }, {
      today,
      logId: pendingEdit.id,
      newLogDate: pendingEdit.newLogDate,
      weight: pendingEdit.weight,
      unit: pendingEdit.unit,
    });
    if (result.status === "error") {
      setLoading(false);
      setMsg(result.message);
      return;
    }

    const refreshError = await loadLogs();
    if (refreshError) {
      setLoading(false);
      return;
    }

    setPendingEdit(null);
    setLoading(false);
    setMsg("Updated bodyweight log ✅");
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(245,158,11,0.18),transparent_34%),radial-gradient(circle_at_85%_10%,rgba(16,185,129,0.12),transparent_32%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:46px_46px] opacity-20" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-5xl px-6 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300/80">Bodyweight Tracking</p>
        <h1 className="mt-3 text-4xl font-bold text-zinc-100 dark:text-white">Own Your Progress</h1>
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
              {latestLog ? `${formatWeightFromKg(Number(latestLog.weight_kg || 0), displayUnit)} ${displayUnit}` : "—"}
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
                  <defs>
                    <linearGradient id="bodyweightAreaFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.45} />
                      <stop offset="55%" stopColor="#f59e0b" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="bodyweightLineStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#22d3ee" />
                      <stop offset="55%" stopColor="#f59e0b" />
                      <stop offset="100%" stopColor="#f97316" />
                    </linearGradient>
                  </defs>
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
                    payloadUniqBy={(entry) => entry.dataKey}
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
                  <Area
                    type="monotone"
                    dataKey="weight"
                    fill="url(#bodyweightAreaFill)"
                    stroke="none"
                  />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="url(#bodyweightLineStroke)"
                    strokeWidth={3}
                    dot={{ r: 3, fill: "#22d3ee", stroke: "#0f172a", strokeWidth: 1 }}
                    activeDot={{ r: 6, fill: "#f59e0b", stroke: "#0f172a", strokeWidth: 1 }}
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
                max={today}
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
                <div className="flex items-center gap-3">
                  <span className="font-medium text-white">
                    {formatWeightFromKg(Number(l.weight_kg || 0), displayUnit)} {displayUnit}
                  </span>
                  <button
                    type="button"
                    onClick={() => requestEditLog(l)}
                    disabled={loading}
                    className="rounded-md border border-zinc-500/70 px-2 py-1 text-xs font-medium text-zinc-200 transition hover:bg-zinc-700/40 disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => requestDeleteLog(l)}
                    disabled={loading}
                    className="rounded-md border border-red-400/60 px-2 py-1 text-xs font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
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

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">Confirm Delete</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Delete bodyweight log?</h3>
            <p className="mt-2 text-sm text-zinc-300">
              This will remove your entry for <span className="font-semibold text-white">{pendingDelete.logDate}</span> from history and charts.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancelDeleteLog}
                className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteLog()}
                className="rounded-md bg-gradient-to-r from-red-400 via-rose-400 to-orange-400 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:brightness-110"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">Edit Bodyweight Log</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Update date and weight</h3>
            <p className="mt-2 text-sm text-zinc-300">
              Adjust this entry while keeping your progress history accurate.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="edit-bodyweight-date" className="mb-1 block text-sm text-zinc-300">Date</label>
                <input
                  id="edit-bodyweight-date"
                  type="date"
                  value={pendingEdit.newLogDate}
                  max={today}
                  onChange={(e) =>
                    setPendingEdit((prev) =>
                      prev
                        ? {
                            ...prev,
                            newLogDate: e.target.value,
                          }
                        : prev
                    )
                  }
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                />
              </div>

              <div>
                <label htmlFor="edit-bodyweight-weight" className="mb-1 block text-sm text-zinc-300">Weight</label>
                <input
                  id="edit-bodyweight-weight"
                  value={pendingEdit.weight}
                  onChange={(e) =>
                    setPendingEdit((prev) =>
                      prev
                        ? {
                            ...prev,
                            weight: e.target.value,
                          }
                        : prev
                    )
                  }
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                />
              </div>

              <div>
                <label htmlFor="edit-bodyweight-unit" className="mb-1 block text-sm text-zinc-300">Unit</label>
                <select
                  id="edit-bodyweight-unit"
                  value={pendingEdit.unit}
                  onChange={(e) =>
                    setPendingEdit((prev) =>
                      prev
                        ? {
                            ...prev,
                            unit: e.target.value as Unit,
                          }
                        : prev
                    )
                  }
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                >
                  <option value="lb">lb</option>
                  <option value="kg">kg</option>
                </select>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancelEditLog}
                className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmEditLog()}
                disabled={loading}
                className="rounded-md bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:brightness-110 disabled:opacity-60"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
