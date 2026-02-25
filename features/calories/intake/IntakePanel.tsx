"use client";

import { useEffect, useState } from "react";
import type {
  CaloriesLog,
  ChartRange,
  HistoryFilterMode,
  PendingDelete,
  PendingEdit,
  PendingOverwrite,
} from "@/features/calories/intake/types";
import {
  deleteCaloriesLogForCurrentUser,
  getCaloriesLogForDate,
  getCurrentUserId,
  loadCaloriesLogsForCurrentUser,
  updateCaloriesLogForCurrentUser,
  upsertCaloriesEntry,
} from "@/features/calories/intake/service";
import {
  getCaloriesChartView,
  getCaloriesHistoryView,
  getCaloriesSummary,
} from "@/features/calories/intake/view";
import { formatCalories, getTotalCalories } from "@/features/calories/intake/utils";
import { toLocalIsoDate } from "@/lib/localDate";
import {
  Area,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function IntakePanel() {
  const today = toLocalIsoDate();

  const [date, setDate] = useState(today);
  const [preWorkoutCalories, setPreWorkoutCalories] = useState("");
  const [postWorkoutCalories, setPostWorkoutCalories] = useState("");
  const [chartRange, setChartRange] = useState<ChartRange>("biweekly");

  const [logs, setLogs] = useState<CaloriesLog[]>([]);
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

  async function loadLogs() {
    const { logs: loadedLogs, error } = await loadCaloriesLogsForCurrentUser({ limit: 400 });
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

  const { chartData, yMax, rangeStartIso } = getCaloriesChartView(logs, chartRange);
  const { latestLog } = getCaloriesSummary(logs);
  const { avgTotal, avgPre, avgPost } = getCaloriesSummary(
    logs.filter((log) => log.log_date >= rangeStartIso)
  );
  const { visibleLogs, hasMoreHistory, canShowLessHistory, hasActiveHistoryFilter } =
    getCaloriesHistoryView(
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

  async function persistCaloriesEntry(payload: PendingOverwrite) {
    const error = await upsertCaloriesEntry(payload);

    if (error) {
      setMsg(error);
      setLoading(false);
      return;
    }

    setMsg("Saved ✅");
    setPreWorkoutCalories("");
    setPostWorkoutCalories("");
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

    const hasPreValue = preWorkoutCalories.trim().length > 0;
    const hasPostValue = postWorkoutCalories.trim().length > 0;

    if (!hasPreValue && !hasPostValue) {
      setMsg("Enter pre-workout and/or post-workout calories.");
      setLoading(false);
      return;
    }

    const preValue = hasPreValue ? Number(preWorkoutCalories) : null;
    const postValue = hasPostValue ? Number(postWorkoutCalories) : null;

    if ((preValue != null && (!Number.isFinite(preValue) || preValue < 0)) ||
        (postValue != null && (!Number.isFinite(postValue) || postValue < 0))) {
      setMsg("Enter valid calories (0 or greater).");
      setLoading(false);
      return;
    }

    const payload: PendingOverwrite = {
      userId,
      logDate: date,
      preWorkoutKcal: preValue,
      postWorkoutKcal: postValue,
    };

    let existingLog = logs.find((log) => log.log_date === date) ?? null;
    if (!existingLog) {
      const { log: serverLog, error: logLookupError } = await getCaloriesLogForDate(userId, date);
      if (logLookupError) {
        setMsg(logLookupError);
        setLoading(false);
        return;
      }
      existingLog = serverLog;
    }

    if (existingLog) {
      payload.preWorkoutKcal = hasPreValue ? preValue : existingLog.pre_workout_kcal;
      payload.postWorkoutKcal = hasPostValue ? postValue : existingLog.post_workout_kcal;

      const shouldConfirmPre = hasPreValue && existingLog.pre_workout_kcal != null;
      const shouldConfirmPost = hasPostValue && existingLog.post_workout_kcal != null;

      if (shouldConfirmPre || shouldConfirmPost) {
        setPendingOverwrite({
          ...payload,
          replacePre: shouldConfirmPre,
          replacePost: shouldConfirmPost,
        });
        setLoading(false);
        return;
      }
    }

    await persistCaloriesEntry(payload);
  }

  async function confirmReplace() {
    if (!pendingOverwrite) return;
    setLoading(true);
    setMsg(null);
    const payload = pendingOverwrite;
    setPendingOverwrite(null);
    await persistCaloriesEntry(payload);
  }

  function cancelReplace() {
    setPendingOverwrite(null);
    setMsg("Update cancelled.");
  }

  function requestDeleteLog(log: CaloriesLog) {
    setPendingDelete({ id: log.id, logDate: log.log_date });
  }

  async function confirmDeleteLog() {
    if (!pendingDelete) return;

    const target = pendingDelete;
    setPendingDelete(null);
    setLoading(true);
    setMsg(null);

    const { error } = await deleteCaloriesLogForCurrentUser(target.id);

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

  function requestEditLog(log: CaloriesLog) {
    setPendingEdit({
      id: log.id,
      originalLogDate: log.log_date,
      newLogDate: log.log_date,
      preWorkoutCalories:
        log.pre_workout_kcal != null ? String(Math.round(log.pre_workout_kcal)) : "",
      postWorkoutCalories:
        log.post_workout_kcal != null ? String(Math.round(log.post_workout_kcal)) : "",
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

    const hasPreValue = pendingEdit.preWorkoutCalories.trim().length > 0;
    const hasPostValue = pendingEdit.postWorkoutCalories.trim().length > 0;
    if (!hasPreValue && !hasPostValue) {
      setMsg("Enter pre-workout and/or post-workout calories.");
      return;
    }

    const preValue = hasPreValue ? Number(pendingEdit.preWorkoutCalories) : null;
    const postValue = hasPostValue ? Number(pendingEdit.postWorkoutCalories) : null;

    if ((preValue != null && (!Number.isFinite(preValue) || preValue < 0)) ||
        (postValue != null && (!Number.isFinite(postValue) || postValue < 0))) {
      setMsg("Enter valid calories (0 or greater).");
      return;
    }

    setLoading(true);
    setMsg(null);

    const error = await updateCaloriesLogForCurrentUser(pendingEdit.id, {
      logDate: pendingEdit.newLogDate,
      preWorkoutKcal: preValue,
      postWorkoutKcal: postValue,
    });

    if (error) {
      setLoading(false);
      setMsg(error);
      return;
    }

    setPendingEdit(null);
    setLoading(false);
    setMsg("Updated calories log ✅");
    void loadLogs();
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-4 backdrop-blur-sm">
          <p className="text-xs uppercase tracking-wide text-zinc-400">Total Logs</p>
          <p className="mt-2 text-2xl font-semibold text-white">{logs.length}</p>
        </div>
        <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-4 backdrop-blur-sm">
          <p className="text-xs uppercase tracking-wide text-zinc-400">Latest Total</p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {latestLog ? `${formatCalories(getTotalCalories(latestLog.pre_workout_kcal, latestLog.post_workout_kcal))} kcal` : "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-4 backdrop-blur-sm">
          <p className="text-xs uppercase tracking-wide text-zinc-400">Average Pre</p>
          <p className="mt-2 text-2xl font-semibold text-white">{avgPre != null ? `${formatCalories(avgPre)} kcal` : "—"}</p>
        </div>
        <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-4 backdrop-blur-sm">
          <p className="text-xs uppercase tracking-wide text-zinc-400">Average Post</p>
          <p className="mt-2 text-2xl font-semibold text-white">{avgPost != null ? `${formatCalories(avgPost)} kcal` : "—"}</p>
        </div>
        <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-4 backdrop-blur-sm">
          <p className="text-xs uppercase tracking-wide text-zinc-400">Average Total</p>
          <p className="mt-2 text-2xl font-semibold text-white">{avgTotal != null ? `${formatCalories(avgTotal)} kcal` : "—"}</p>
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
        <h2 className="text-lg font-semibold text-white">Calories Intake Trend</h2>
        <p className="mt-1 text-sm text-zinc-400">Pre, post, and total intake by day</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["biweekly", "1m", "3m", "6m", "1y"] as ChartRange[]).map((range) => (
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
                  <linearGradient id="caloriesTotalAreaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.38} />
                    <stop offset="55%" stopColor="#f59e0b" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="caloriesTotalStroke" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#ef4444" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#52525b" }} />
                <YAxis tick={{ fill: "#a1a1aa", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#52525b" }} width={56} domain={[0, yMax]} />
                <Tooltip
                  payloadUniqBy={(entry) => entry.dataKey}
                  contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "10px" }}
                  labelStyle={{ color: "#e4e4e7" }}
                  formatter={(value: number | string | undefined, name?: string | number) => {
                    const numericValue = typeof value === "number" ? value : Number(value ?? 0);
                    const labelByKey: Record<string, string> = { total: "Total", preWorkout: "Pre", postWorkout: "Post" };
                    const key = String(name ?? "total");
                    return [`${formatCalories(numericValue)} kcal`, labelByKey[key] ?? key] as const;
                  }}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.logDate || label}
                />
                <Legend
                  verticalAlign="top"
                  height={28}
                  formatter={(value: string) => ({ total: "Total", preWorkout: "Pre", postWorkout: "Post" }[value] ?? value)}
                  wrapperStyle={{ color: "#d4d4d8", fontSize: "12px" }}
                />
                <Area type="monotone" dataKey="total" fill="url(#caloriesTotalAreaFill)" stroke="none" legendType="none" />
                <Line type="monotone" dataKey="preWorkout" stroke="#34d399" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2 }} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="postWorkout" stroke="#60a5fa" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2 }} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="total" stroke="url(#caloriesTotalStroke)" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
        <h2 className="text-lg font-semibold text-white">Log Intake</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="intake-log-date" className="mb-1 block text-sm text-zinc-300">Date</label>
            <input id="intake-log-date" type="date" max={today} className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor="pre-calories" className="mb-1 block text-sm text-zinc-300">Pre-workout kcal</label>
            <input id="pre-calories" className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2" placeholder="e.g. 300" inputMode="numeric" value={preWorkoutCalories} onChange={(e) => setPreWorkoutCalories(e.target.value)} />
          </div>
          <div>
            <label htmlFor="post-calories" className="mb-1 block text-sm text-zinc-300">Post-workout kcal</label>
            <input id="post-calories" className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2" placeholder="e.g. 550" inputMode="numeric" value={postWorkoutCalories} onChange={(e) => setPostWorkoutCalories(e.target.value)} />
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
            <select
              value={historyFilterMode}
              onChange={(e) => {
                setHistoryFilterMode(e.target.value as HistoryFilterMode);
                setVisibleHistoryCount(5);
              }}
              className="rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-sm text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
            >
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
                <p className="text-xs text-zinc-500">Pre: {formatCalories(log.pre_workout_kcal)} kcal · Post: {formatCalories(log.post_workout_kcal)} kcal</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium text-white">Total: {formatCalories(getTotalCalories(log.pre_workout_kcal, log.post_workout_kcal))} kcal</span>
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
            <h3 className="mt-2 text-xl font-semibold text-white">Replace existing intake value?</h3>
            <p className="mt-2 text-sm text-zinc-300">
              You already have {pendingOverwrite.replacePre && pendingOverwrite.replacePost
                ? "pre-workout and post-workout calories"
                : pendingOverwrite.replacePre
                  ? "a pre-workout calories"
                  : "a post-workout calories"} for <span className="font-semibold text-white">{pendingOverwrite.logDate}</span>.
            </p>
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
            <h3 className="mt-2 text-xl font-semibold text-white">Delete intake log?</h3>
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
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">Edit Intake Log</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Update date and calories</h3>

            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="edit-calories-date" className="mb-1 block text-sm text-zinc-300">Date</label>
                <input id="edit-calories-date" type="date" value={pendingEdit.newLogDate} max={today} onChange={(e) => setPendingEdit((prev) => (prev ? { ...prev, newLogDate: e.target.value } : prev))} className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2" />
              </div>

              <div>
                <label htmlFor="edit-pre-calories" className="mb-1 block text-sm text-zinc-300">Pre-workout kcal</label>
                <input id="edit-pre-calories" value={pendingEdit.preWorkoutCalories} inputMode="numeric" onChange={(e) => setPendingEdit((prev) => (prev ? { ...prev, preWorkoutCalories: e.target.value } : prev))} className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2" />
              </div>

              <div>
                <label htmlFor="edit-post-calories" className="mb-1 block text-sm text-zinc-300">Post-workout kcal</label>
                <input id="edit-post-calories" value={pendingEdit.postWorkoutCalories} inputMode="numeric" onChange={(e) => setPendingEdit((prev) => (prev ? { ...prev, postWorkoutCalories: e.target.value } : prev))} className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2" />
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
