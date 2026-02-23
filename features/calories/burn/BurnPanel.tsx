"use client";

import { useEffect, useState } from "react";
import { toLocalIsoDate } from "@/lib/localDate";
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
import type {
  BurnChartRange,
  BurnHistoryFilterMode,
  MetabolicActivityLog,
  PendingBurnDelete,
  PendingBurnEdit,
  PendingBurnOverwrite,
} from "@/features/calories/burn/types";
import {
  deleteBurnLogForCurrentUser,
  getBurnLogForDate,
  getCurrentUserId,
  loadBurnLogsForCurrentUser,
  updateBurnLogForCurrentUser,
  upsertBurnEntry,
} from "@/features/calories/burn/service";
import { getBurnChartView, getBurnHistoryView, getBurnSummary } from "@/features/calories/burn/view";
import { formatCalories } from "@/features/calories/burn/utils";

const BURN_COLOR_PIVOT_KCAL = 500;

function getGradientOffsetPctForValue(value: number, yMax: number) {
  if (!Number.isFinite(yMax) || yMax <= 0) return 100;
  const raw = (value / yMax) * 100;
  return Math.min(100, Math.max(0, raw));
}

export default function BurnPanel() {
  const today = toLocalIsoDate();

  const [date, setDate] = useState(today);
  const [estimatedKcalSpent, setEstimatedKcalSpent] = useState("");
  const [source, setSource] = useState("");
  const [chartRange, setChartRange] = useState<BurnChartRange>("biweekly");

  const [logs, setLogs] = useState<MetabolicActivityLog[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingOverwrite, setPendingOverwrite] = useState<PendingBurnOverwrite | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingBurnDelete | null>(null);
  const [pendingEdit, setPendingEdit] = useState<PendingBurnEdit | null>(null);
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(5);
  const [historyFilterMode, setHistoryFilterMode] = useState<BurnHistoryFilterMode>("range");
  const [historySingleDate, setHistorySingleDate] = useState(today);
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");

  async function loadLogs() {
    const { logs: loadedLogs, error } = await loadBurnLogsForCurrentUser({ limit: 400 });
    if (error) {
      setMsg(error);
      return;
    }

    setLogs(loadedLogs);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadLogs();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  const { chartData, yMax, rangeStartIso } = getBurnChartView(logs, chartRange);
  const burnPivotOffsetPct = getGradientOffsetPctForValue(BURN_COLOR_PIVOT_KCAL, yMax);
  const { latestLog, avgSpent } = getBurnSummary(logs.filter((log) => log.log_date >= rangeStartIso));
  const { visibleLogs, hasMoreHistory, canShowLessHistory, hasActiveHistoryFilter } =
    getBurnHistoryView(
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

  async function persistBurnEntry(payload: PendingBurnOverwrite) {
    const error = await upsertBurnEntry(payload);
    if (error) {
      setMsg(error);
      setLoading(false);
      return;
    }

    setMsg("Saved ✅");
    setEstimatedKcalSpent("");
    setSource("");
    setLoading(false);
    void loadLogs();
  }

  async function save() {
    setLoading(true);
    setMsg(null);

    if (date > today) {
      setMsg("Future log dates are not allowed.");
      setLoading(false);
      return;
    }

    const { userId, error: userError } = await getCurrentUserId();
    if (userError) {
      setMsg(userError);
      setLoading(false);
      return;
    }

    if (!userId) {
      setMsg("Not logged in.");
      setLoading(false);
      return;
    }

    const spentValue = Number(estimatedKcalSpent);
    if (!Number.isFinite(spentValue) || spentValue < 0) {
      setMsg("Enter valid estimated calorie burn (0 or greater).");
      setLoading(false);
      return;
    }

    const payload: PendingBurnOverwrite = {
      userId,
      logDate: date,
      estimatedKcalSpent: spentValue,
      source: source.trim() ? source.trim() : null,
    };

    let existingLog = logs.find((log) => log.log_date === date) ?? null;
    if (!existingLog) {
      const { log: serverLog, error: lookupError } = await getBurnLogForDate(userId, date);
      if (lookupError) {
        setMsg(lookupError);
        setLoading(false);
        return;
      }
      existingLog = serverLog;
    }

    if (existingLog) {
      if (payload.source == null && existingLog.source != null) {
        payload.source = existingLog.source;
      }
      setPendingOverwrite(payload);
      setLoading(false);
      return;
    }

    await persistBurnEntry(payload);
  }

  async function confirmReplace() {
    if (!pendingOverwrite) return;
    setLoading(true);
    setMsg(null);
    const payload = pendingOverwrite;
    setPendingOverwrite(null);
    await persistBurnEntry(payload);
  }

  function cancelReplace() {
    setPendingOverwrite(null);
    setMsg("Update cancelled.");
  }

  function requestDeleteLog(log: MetabolicActivityLog) {
    setPendingDelete({ id: log.id, logDate: log.log_date });
  }

  async function confirmDeleteLog() {
    if (!pendingDelete) return;

    const target = pendingDelete;
    setPendingDelete(null);
    setLoading(true);
    setMsg(null);

    const { error } = await deleteBurnLogForCurrentUser(target.id);

    if (error) {
      setMsg(error);
      setLoading(false);
      return;
    }

    setMsg("Deleted 🗑️");
    setLoading(false);
    void loadLogs();
  }

  function cancelDeleteLog() {
    setPendingDelete(null);
    setMsg("Delete cancelled.");
  }

  function requestEditLog(log: MetabolicActivityLog) {
    setPendingEdit({
      id: log.id,
      originalLogDate: log.log_date,
      newLogDate: log.log_date,
      estimatedKcalSpent: String(Math.round(log.estimated_kcal_spent)),
      source: log.source ?? "",
    });
  }

  function cancelEditLog() {
    setPendingEdit(null);
    setMsg("Edit cancelled.");
  }

  async function confirmEditLog() {
    if (!pendingEdit) return;

    if (pendingEdit.newLogDate > today) {
      setMsg("Future log dates are not allowed.");
      return;
    }

    const spentValue = Number(pendingEdit.estimatedKcalSpent);
    if (!Number.isFinite(spentValue) || spentValue < 0) {
      setMsg("Enter valid estimated calorie burn (0 or greater).");
      return;
    }

    setLoading(true);
    setMsg(null);

    const error = await updateBurnLogForCurrentUser(pendingEdit.id, {
      logDate: pendingEdit.newLogDate,
      estimatedKcalSpent: spentValue,
      source: pendingEdit.source.trim() ? pendingEdit.source.trim() : null,
    });

    if (error) {
      setLoading(false);
      setMsg(error);
      return;
    }

    setPendingEdit(null);
    setLoading(false);
    setMsg("Updated burn log ✅");
    void loadLogs();
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-4 backdrop-blur-sm">
          <p className="text-xs uppercase tracking-wide text-zinc-400">Total Burn Logs</p>
          <p className="mt-2 text-2xl font-semibold text-white">{logs.length}</p>
        </div>
        <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-4 backdrop-blur-sm">
          <p className="text-xs uppercase tracking-wide text-zinc-400">Latest Burn</p>
          <p className="mt-2 text-2xl font-semibold text-white">{latestLog ? `${formatCalories(latestLog.estimated_kcal_spent)} kcal` : "—"}</p>
        </div>
        <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-4 backdrop-blur-sm">
          <p className="text-xs uppercase tracking-wide text-zinc-400">Average Burn</p>
          <p className="mt-2 text-2xl font-semibold text-white">{avgSpent != null ? `${formatCalories(avgSpent)} kcal` : "—"}</p>
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
        <h2 className="text-lg font-semibold text-white">Estimated Burn Trend</h2>
        <p className="mt-1 text-sm text-zinc-400">Estimated kcal spent by day</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["biweekly", "1m", "3m", "6m", "1y"] as BurnChartRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setChartRange(range)}
              className={`rounded-md px-3 py-1 text-sm transition ${
                chartRange === range
                  ? "bg-amber-300 text-zinc-900"
                  : "border border-zinc-700 bg-zinc-950/70 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {range === "biweekly" ? "Biweekly" : range.toUpperCase()}
            </button>
          ))}
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
                  <linearGradient id="burnAreaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.32} />
                    <stop offset={`${burnPivotOffsetPct}%`} stopColor="#facc15" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="burnLineStroke" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#ef4444" />
                    <stop offset={`${burnPivotOffsetPct}%`} stopColor="#facc15" />
                    <stop offset="100%" stopColor="#22c55e" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#52525b" }} />
                <YAxis tick={{ fill: "#a1a1aa", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#52525b" }} width={56} domain={[0, yMax]} />
                <Tooltip
                  payloadUniqBy={(entry) => entry.dataKey}
                  contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "10px" }}
                  labelStyle={{ color: "#e4e4e7" }}
                  formatter={(value: number | string | undefined) => {
                    const numericValue = typeof value === "number" ? value : Number(value ?? 0);
                    return [`${formatCalories(numericValue)} kcal`, "Estimated Burn"] as const;
                  }}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.logDate || label}
                />
                <Area type="monotone" dataKey="spent" fill="url(#burnAreaFill)" stroke="none" legendType="none" />
                <Line type="monotone" dataKey="spent" stroke="url(#burnLineStroke)" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
        <h2 className="text-lg font-semibold text-white">Log Burn</h2>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="burn-log-date" className="mb-1 block text-sm text-zinc-300">Date</label>
            <input id="burn-log-date" type="date" max={today} className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div>
            <label htmlFor="burn-kcal" className="mb-1 block text-sm text-zinc-300">Estimated kcal burnt</label>
            <input id="burn-kcal" className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2" placeholder="e.g. 2200" inputMode="numeric" value={estimatedKcalSpent} onChange={(e) => setEstimatedKcalSpent(e.target.value)} />
          </div>

          <div>
            <label htmlFor="burn-source" className="mb-1 block text-sm text-zinc-300">Source (optional)</label>
            <input id="burn-source" className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2" placeholder="e.g. Apple Watch" value={source} onChange={(e) => setSource(e.target.value)} />
          </div>

          <button onClick={save} disabled={loading} className="rounded-md bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 px-5 py-2 font-semibold text-zinc-900 transition hover:brightness-110 disabled:opacity-60">
            {loading ? "Saving..." : "Save"}
          </button>
        </div>

        {msg && <p className="mt-3 text-sm text-zinc-300">{msg}</p>}
      </div>

      <div className="mt-6 rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">History</h2>
            <p className="mt-1 text-xs text-zinc-400">Showing up to 20 records for the selected date filter on this page.</p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <select value={historyFilterMode} onChange={(e) => { setHistoryFilterMode(e.target.value as BurnHistoryFilterMode); setVisibleHistoryCount(5); }} className="rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-sm text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2">
              <option value="single">Single date</option>
              <option value="range">Date range</option>
            </select>

            {historyFilterMode === "single" ? (
              <>
                <input type="date" value={historySingleDate} onChange={(e) => { setHistorySingleDate(e.target.value); setVisibleHistoryCount(5); }} className="rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-sm text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2 sm:col-span-2" />
                <button type="button" onClick={resetHistoryFilters} className="rounded-md border border-zinc-600 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800">Recent logs</button>
              </>
            ) : (
              <>
                <input type="date" value={historyStartDate} onChange={(e) => { setHistoryStartDate(e.target.value); setVisibleHistoryCount(5); }} className="rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-sm text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2" />
                <input type="date" value={historyEndDate} onChange={(e) => { setHistoryEndDate(e.target.value); setVisibleHistoryCount(5); }} className="rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-sm text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2" />
                <button type="button" onClick={resetHistoryFilters} disabled={!hasActiveHistoryFilter} className="rounded-md border border-zinc-600 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50">Recent logs</button>
              </>
            )}
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {visibleLogs.length === 0 && <p className="text-sm text-zinc-400">No entries found for the selected date filter.</p>}
          {visibleLogs.map((log) => (
            <div key={log.id} className="flex items-center justify-between rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-4 py-3">
              <div>
                <span className="text-sm text-zinc-300">{log.log_date}</span>
                <p className="text-xs text-zinc-500">Source: {log.source ?? "—"}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium text-white">Burn: {formatCalories(log.estimated_kcal_spent)} kcal</span>
                <button type="button" onClick={() => requestEditLog(log)} disabled={loading} className="rounded-md border border-zinc-500/70 px-2 py-1 text-xs font-medium text-zinc-200 transition hover:bg-zinc-700/40 disabled:opacity-50">Edit</button>
                <button type="button" onClick={() => requestDeleteLog(log)} disabled={loading} className="rounded-md border border-red-400/60 px-2 py-1 text-xs font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-50">Delete</button>
              </div>
            </div>
          ))}

          {(hasMoreHistory || canShowLessHistory) && (
            <div className="flex items-center gap-2 pt-2">
              {hasMoreHistory && <button type="button" onClick={() => setVisibleHistoryCount((count) => count + 5)} className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800">See more</button>}
              {canShowLessHistory && <button type="button" onClick={() => setVisibleHistoryCount(5)} className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800">Show less</button>}
            </div>
          )}
        </div>
      </div>

      {pendingOverwrite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">Confirm Replace</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Replace existing burn value?</h3>
            <p className="mt-2 text-sm text-zinc-300">You already have a burn log for <span className="font-semibold text-white">{pendingOverwrite.logDate}</span>. Do you want to replace it?</p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" onClick={cancelReplace} className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800">Cancel</button>
              <button type="button" onClick={() => void confirmReplace()} className="rounded-md bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:brightness-110">Replace</button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">Confirm Delete</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Delete burn log?</h3>
            <p className="mt-2 text-sm text-zinc-300">This will remove your entry for <span className="font-semibold text-white">{pendingDelete.logDate}</span>.</p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" onClick={cancelDeleteLog} className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800">Cancel</button>
              <button type="button" onClick={() => void confirmDeleteLog()} className="rounded-md bg-gradient-to-r from-red-400 via-rose-400 to-orange-400 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:brightness-110">Delete</button>
            </div>
          </div>
        </div>
      )}

      {pendingEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">Edit Burn Log</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Update date and burn</h3>

            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="edit-burn-date" className="mb-1 block text-sm text-zinc-300">Date</label>
                <input id="edit-burn-date" type="date" value={pendingEdit.newLogDate} max={today} onChange={(e) => setPendingEdit((prev) => (prev ? { ...prev, newLogDate: e.target.value } : prev))} className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2" />
              </div>

              <div>
                <label htmlFor="edit-burn-kcal" className="mb-1 block text-sm text-zinc-300">Estimated kcal burnt</label>
                <input id="edit-burn-kcal" value={pendingEdit.estimatedKcalSpent} inputMode="numeric" onChange={(e) => setPendingEdit((prev) => (prev ? { ...prev, estimatedKcalSpent: e.target.value } : prev))} className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2" />
              </div>

              <div>
                <label htmlFor="edit-burn-source" className="mb-1 block text-sm text-zinc-300">Source (optional)</label>
                <input id="edit-burn-source" value={pendingEdit.source} onChange={(e) => setPendingEdit((prev) => (prev ? { ...prev, source: e.target.value } : prev))} className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2" />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" onClick={cancelEditLog} className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800">Cancel</button>
              <button type="button" onClick={() => void confirmEditLog()} disabled={loading} className="rounded-md bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:brightness-110 disabled:opacity-60">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
