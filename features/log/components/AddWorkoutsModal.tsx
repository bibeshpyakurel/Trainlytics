"use client";

import { useEffect, useState } from "react";
import { parseWorkoutNotes } from "@/lib/workoutImport";
import {
  buildImportPlan,
  commitPendingSession,
  loadExerciseCatalog,
  toPendingSessions,
  withOverwriteInfo,
  type CatalogEntry,
  type ImportSession,
  type PendingSession,
} from "@/lib/workoutImportService";
import { buildPendingExercises, createEmptyRow, type EntryRow } from "@/lib/manualEntry";
import type { Split } from "@/features/log/types";
import type { Unit } from "@/lib/convertWeight";
import GradientButton from "@/shared/ui/GradientButton";
import ModalSheet from "@/shared/ui/ModalSheet";
import ManualEntryForm from "@/features/log/components/workoutEntry/ManualEntryForm";
import { useUserSplits } from "@/features/log/useUserSplits";
import NewExerciseSheet from "@/features/log/components/workoutEntry/NewExerciseSheet";
import ConfirmSaveCard from "@/features/log/components/workoutEntry/ConfirmSaveCard";

type Mode = "manual" | "paste";
/** Paste needs an extra pass to fix dates and splits; manual entry goes straight to confirm. */
type Step = "input" | "resolve" | "confirm";

type AddWorkoutsModalProps = {
  userId: string;
  defaultUnit: Unit;
  initialDate: string;
  initialSplit: Split;
  onCancel: () => void;
  onSaved: (sessionCount: number, setCount: number) => void;
};

const PLACEHOLDER = `Mar 3 - push
Bench 3x8 135
Incline DB 3x10 50

Mar 5 - pull
Row 225x5, 225x5`;

export default function AddWorkoutsModal({
  userId,
  defaultUnit,
  initialDate,
  initialSplit,
  onCancel,
  onSaved,
}: AddWorkoutsModalProps) {
  const SPLITS = useUserSplits(userId);
  const [mode, setMode] = useState<Mode>("manual");
  const [step, setStep] = useState<Step>("input");
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual entry
  const [date, setDate] = useState(initialDate);
  const [split, setSplit] = useState<Split>(initialSplit);
  const [rows, setRows] = useState<EntryRow[]>([createEmptyRow(defaultUnit)]);
  const [newExerciseForRow, setNewExerciseForRow] = useState<string | null>(null);

  // Paste
  const [text, setText] = useState("");
  const [resolveSessions, setResolveSessions] = useState<ImportSession[]>([]);
  const [skippedLines, setSkippedLines] = useState<string[]>([]);

  // Confirmation
  const [pending, setPending] = useState<PendingSession[]>([]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const result = await loadExerciseCatalog(userId);
      if (!isMounted) return;
      if (result.ok) setCatalog(result.catalog);
      else setError(result.message);
    })();
    return () => {
      isMounted = false;
    };
  }, [userId]);

  function updateRow(key: string, patch: Partial<EntryRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  async function goToConfirm(sessions: PendingSession[]) {
    setIsBusy(true);
    const enriched = await withOverwriteInfo(userId, sessions);
    setIsBusy(false);
    setPending(enriched);
    setStep("confirm");
  }

  async function handleManualReview() {
    setError(null);
    if (!date) {
      setError("Pick a date for this session.");
      return;
    }

    const built = buildPendingExercises(rows, catalog);
    if (!built.ok) {
      setError(built.message);
      return;
    }

    await goToConfirm([
      { date, split, exercises: built.exercises, willOverwrite: false, existingSetCount: 0 },
    ]);
  }

  async function handleParse() {
    setError(null);
    setIsBusy(true);

    const parsed = parseWorkoutNotes(text);
    if (parsed.sessions.length === 0) {
      setIsBusy(false);
      setError("Nothing here looked like a workout. Check the examples below the box.");
      return;
    }

    const result = await buildImportPlan(userId, parsed.sessions);
    setIsBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setResolveSessions(result.plan.sessions);
    setSkippedLines(parsed.unparsedLines.map((line) => line.rawLine));
    setStep("resolve");
  }

  async function handleResolveReview() {
    setError(null);
    const ready = toPendingSessions(resolveSessions);
    if (ready.length === 0) {
      setError("No session is ready yet. Each one needs a date, a split, and a matched exercise.");
      return;
    }
    await goToConfirm(ready);
  }

  async function handleSave() {
    setError(null);
    setIsBusy(true);

    let savedSessions = 0;
    let savedSets = 0;

    for (const session of pending) {
      const result = await commitPendingSession(session, defaultUnit);
      if (!result.ok) {
        setIsBusy(false);
        setError(result.message);
        return;
      }
      savedSessions++;
      savedSets += result.setCount;
    }

    setIsBusy(false);
    onSaved(savedSessions, savedSets);
  }

  function handleBack() {
    setError(null);
    if (step === "confirm") {
      setStep(mode === "paste" ? "resolve" : "input");
      return;
    }
    if (step === "resolve") {
      setStep("input");
      return;
    }
    onCancel();
  }

  const primaryLabel = (() => {
    if (isBusy) return "Working…";
    if (step === "confirm") {
      const setCount = pending.reduce(
        (sum, session) => sum + session.exercises.reduce((inner, ex) => inner + ex.sets.length, 0),
        0
      );
      return `Save ${setCount} set${setCount === 1 ? "" : "s"}`;
    }
    return "Review";
  })();

  const primaryDisabled =
    isBusy ||
    (step === "input" && mode === "paste" && text.trim().length === 0) ||
    (step === "confirm" && pending.length === 0);

  function handlePrimary() {
    if (step === "confirm") return void handleSave();
    if (step === "resolve") return void handleResolveReview();
    return void (mode === "manual" ? handleManualReview() : handleParse());
  }

  return (
    <>
      <ModalSheet>
        <div className="flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-2xl border border-zinc-700 bg-zinc-900 shadow-2xl sm:rounded-2xl">
          <div className="border-b border-zinc-800 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">Add Workouts</p>
            <h3 className="mt-2 text-xl font-semibold text-white">
              {step === "confirm" ? "Check before saving" : step === "resolve" ? "Fix up what we read" : "Log a past session"}
            </h3>

            {step === "input" && (
              <div className="mt-4 flex gap-1 rounded-full border border-zinc-700/70 bg-zinc-950/70 p-1">
                {(["manual", "paste"] as Mode[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMode(option)}
                    className={`min-h-11 flex-1 rounded-full text-xs font-semibold transition sm:min-h-0 sm:py-2 ${
                      mode === option
                        ? "bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 text-zinc-900"
                        : "text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    {option === "manual" ? "Enter manually" : "Paste notes"}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
            {step === "input" && mode === "manual" && (
              <ManualEntryForm
                splits={SPLITS}
                date={date}
                split={split}
                rows={rows}
                catalog={catalog}
                onChangeDate={setDate}
                onChangeSplit={setSplit}
                onChangeRow={updateRow}
                onRemoveRow={(key) => setRows((current) => current.filter((row) => row.key !== key))}
                onAddRow={() => setRows((current) => [...current, createEmptyRow(defaultUnit)])}
                onRequestNewExercise={setNewExerciseForRow}
              />
            )}

            {step === "input" && mode === "paste" && (
              <>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={9}
                  placeholder={PLACEHOLDER}
                  className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2.5 font-mono text-sm text-zinc-100 outline-none ring-amber-300/70 placeholder:text-zinc-600 focus:ring-2"
                />
                <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Formats it understands</p>
                  <ul className="mt-2 space-y-1 font-mono text-xs text-zinc-500">
                    <li>Bench 3x8 135<span className="font-sans"> — 3 sets of 8 at 135</span></li>
                    <li>Squat 225x5, 225x5<span className="font-sans"> — one set each</span></li>
                    <li>Bench 135 8,8,6<span className="font-sans"> — reps per set</span></li>
                    <li>Pull ups 3x8<span className="font-sans"> — bodyweight</span></li>
                    <li>Plank 3x60s<span className="font-sans"> — duration</span></li>
                  </ul>
                </div>
              </>
            )}

            {step === "resolve" && (
              <div className="space-y-4">
                {resolveSessions.map((session, index) => (
                  <div key={index} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="date"
                        value={session.date ?? ""}
                        onChange={(e) =>
                          setResolveSessions((current) =>
                            current.map((s, i) => (i === index ? { ...s, date: e.target.value || null } : s))
                          )
                        }
                        aria-label="Session date"
                        className="min-h-11 flex-1 rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 text-sm text-zinc-100 outline-none ring-amber-300/70 focus:ring-2"
                      />
                      <select
                        value={session.split ?? ""}
                        onChange={(e) =>
                          setResolveSessions((current) =>
                            current.map((s, i) =>
                              i === index ? { ...s, split: (e.target.value || null) as Split | null } : s
                            )
                          )
                        }
                        aria-label="Session split"
                        className="min-h-11 rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 text-sm capitalize text-zinc-100 outline-none ring-amber-300/70 focus:ring-2"
                      >
                        <option value="">Pick a split…</option>
                        {SPLITS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>

                    <ul className="mt-3 space-y-2">
                      {session.exercises.map((entry, entryIndex) => (
                        <li key={entryIndex} className="text-sm">
                          <p className={entry.match ? "text-zinc-100" : "text-zinc-500 line-through"}>
                            {entry.match?.name ?? entry.parsed.name}
                            <span className="ml-2 text-xs text-zinc-600">{entry.parsed.sets.length} sets</span>
                          </p>
                          {!entry.match && (
                            <p className="text-xs text-amber-300/80">
                              Not in your exercises — add it first, or this line is skipped.
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

                {skippedLines.length > 0 && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Lines skipped</p>
                    <ul className="mt-2 space-y-1 text-xs text-zinc-500">
                      {skippedLines.map((line, index) => (
                        <li key={index} className="truncate">{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {step === "confirm" && (
              <ConfirmSaveCard sessions={pending} defaultUnit={defaultUnit} skippedLines={skippedLines} />
            )}

            {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-zinc-800 p-4">
            <button
              type="button"
              onClick={handleBack}
              disabled={isBusy}
              className="min-h-11 rounded-md border border-zinc-600 px-4 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-60"
            >
              {step === "input" ? "Cancel" : "Back to edit"}
            </button>
            <GradientButton
              label={primaryLabel}
              onClick={handlePrimary}
              disabled={primaryDisabled}
              className="min-h-11 px-4"
            />
          </div>
        </div>
      </ModalSheet>

      {newExerciseForRow && (
        <NewExerciseSheet
          userId={userId}
          catalog={catalog}
          defaultSplit={split}
          onCancel={() => setNewExerciseForRow(null)}
          onCreated={(exercise) => {
            setCatalog((current) => [...current, exercise]);
            // A new exercise may belong to another split; follow it so the row can show it.
            if (exercise.split !== split) setSplit(exercise.split);
            updateRow(newExerciseForRow, { exerciseId: exercise.id });
            setNewExerciseForRow(null);
          }}
        />
      )}
    </>
  );
}
