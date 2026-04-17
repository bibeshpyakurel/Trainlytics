"use client";

import { useMemo, useState } from "react";
import GradientButton from "@/shared/ui/GradientButton";
import {
  downloadWorkoutExport,
  formatWorkoutExportRangeLabel,
  loadWorkoutExportRows,
  type WorkoutExportFormat,
  type WorkoutExportRange,
  type WorkoutExportScope,
} from "@/lib/workoutExport";

type ExportFlowModalProps = {
  userId: string;
  scope: WorkoutExportScope;
  onClose: () => void;
  onStatus: (message: string | null) => void;
};

type ExportStep = "confirm" | "range" | "format";

function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function ExportFlowModal({ userId, scope, onClose, onStatus }: ExportFlowModalProps) {
  const today = useMemo(() => getTodayIsoDate(), []);
  const [step, setStep] = useState<ExportStep>("confirm");
  const [rangeMode, setRangeMode] = useState<WorkoutExportRange["mode"]>("last-session");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState(today);
  const [format, setFormat] = useState<WorkoutExportFormat>("csv");
  const [isExporting, setIsExporting] = useState(false);

  const effectiveRange: WorkoutExportRange =
    rangeMode === "date-range"
      ? { mode: "date-range", startDate, endDate }
      : rangeMode === "all"
        ? { mode: "all" }
        : { mode: "last-session" };

  async function handleExport() {
    if (isExporting) return;

    setIsExporting(true);
    onStatus(null);
    const result = await loadWorkoutExportRows(userId, scope, effectiveRange);
    setIsExporting(false);

    if (!result.ok) {
      onStatus(`Failed preparing export: ${result.message}`);
      return;
    }

    if (result.rows.length === 0) {
      onStatus(`No workout history found for ${scope.label} in the selected range.`);
      return;
    }

    await downloadWorkoutExport(result.rows, {
      scope,
      range: effectiveRange,
      format,
    });

    onStatus(`Exported ${result.rows.length} set${result.rows.length === 1 ? "" : "s"} for ${scope.label} as ${format.toUpperCase()} ✅`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">Export Flow</p>
        <h3 className="mt-2 text-xl font-semibold text-white">Export {scope.label}</h3>
        <p className="mt-2 text-sm text-zinc-300">
          This export will include detailed workout history for the selected scope. Choose the range and output format before download.
        </p>

        {step === "confirm" && (
          <div className="mt-5 rounded-xl border border-zinc-700/70 bg-zinc-950/60 p-4">
            <p className="text-sm text-zinc-200">You are about to export:</p>
            <p className="mt-2 text-lg font-semibold text-white">{scope.label}</p>
            <p className="mt-2 text-xs text-zinc-400">
              A short flow will let you choose the date range and file format before the export starts.
            </p>
          </div>
        )}

        {step === "range" && (
          <div className="mt-5 space-y-3">
            <label className="flex items-start gap-3 rounded-xl border border-zinc-700/70 bg-zinc-950/60 px-4 py-3">
              <input
                type="radio"
                name="export-range"
                checked={rangeMode === "last-session"}
                onChange={() => setRangeMode("last-session")}
              />
              <div>
                <p className="text-sm font-medium text-zinc-100">Most recent session</p>
                <p className="text-xs text-zinc-400">Export only the latest workout session where this scope has history.</p>
              </div>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-zinc-700/70 bg-zinc-950/60 px-4 py-3">
              <input
                type="radio"
                name="export-range"
                checked={rangeMode === "date-range"}
                onChange={() => setRangeMode("date-range")}
              />
              <div className="w-full">
                <p className="text-sm font-medium text-zinc-100">Custom date range</p>
                <p className="text-xs text-zinc-400">Choose a start and end date for a focused export.</p>
                {rangeMode === "date-range" && (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="export-start-date" className="mb-1 block text-xs uppercase tracking-wide text-zinc-400">Start date</label>
                      <input
                        id="export-start-date"
                        type="date"
                        value={startDate}
                        max={today}
                        onChange={(event) => setStartDate(event.target.value)}
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                      />
                    </div>
                    <div>
                      <label htmlFor="export-end-date" className="mb-1 block text-xs uppercase tracking-wide text-zinc-400">End date</label>
                      <input
                        id="export-end-date"
                        type="date"
                        value={endDate}
                        max={today}
                        onChange={(event) => setEndDate(event.target.value)}
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                      />
                    </div>
                  </div>
                )}
              </div>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-zinc-700/70 bg-zinc-950/60 px-4 py-3">
              <input
                type="radio"
                name="export-range"
                checked={rangeMode === "all"}
                onChange={() => setRangeMode("all")}
              />
              <div>
                <p className="text-sm font-medium text-zinc-100">All workout history</p>
                <p className="text-xs text-zinc-400">Export every matching set in your recorded history.</p>
              </div>
            </label>
          </div>
        )}

        {step === "format" && (
          <div className="mt-5 space-y-3">
            <div className="rounded-xl border border-zinc-700/70 bg-zinc-950/60 px-4 py-3 text-xs text-zinc-400">
              Range selected: <span className="font-semibold text-zinc-100">{formatWorkoutExportRangeLabel(effectiveRange)}</span>
            </div>
            {([
              {
                id: "csv",
                label: "CSV",
                description: "Best for spreadsheets, analysis, and importing into other tools.",
              },
              {
                id: "xlsx",
                label: "Excel (.xlsx)",
                description: "Best for users who want a ready-to-open workbook with clean columns.",
              },
              {
                id: "pdf",
                label: "PDF",
                description: "Best for sharing or saving a clean read-only record.",
              },
            ] as Array<{ id: WorkoutExportFormat; label: string; description: string }>).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFormat(option.id)}
                className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                  format === option.id
                    ? "border-amber-300/70 bg-amber-400/10"
                    : "border-zinc-700/70 bg-zinc-950/60 hover:bg-zinc-950/80"
                }`}
              >
                <p className="text-sm font-semibold text-zinc-100">{option.label}</p>
                <p className="mt-1 text-xs text-zinc-400">{option.description}</p>
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={step === "confirm" ? onClose : () => setStep(step === "format" ? "range" : "confirm")}
            disabled={isExporting}
            className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-60"
          >
            {step === "confirm" ? "Cancel" : "Back"}
          </button>

          {step !== "format" ? (
            <GradientButton
              label="Continue"
              onClick={() => setStep(step === "confirm" ? "range" : "format")}
              disabled={isExporting || (step === "range" && rangeMode === "date-range" && (!startDate || !endDate))}
            />
          ) : (
            <GradientButton
              label={isExporting ? "Exporting..." : `Download ${format.toUpperCase()}`}
              onClick={() => void handleExport()}
              disabled={isExporting}
            />
          )}
        </div>
      </div>
    </div>
  );
}