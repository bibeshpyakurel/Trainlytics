"use client";

import type { PendingSession, PendingSet } from "@/lib/workoutImportService";
import type { Unit } from "@/lib/convertWeight";

type ConfirmSaveCardProps = {
  sessions: PendingSession[];
  defaultUnit: Unit;
  /** Lines the parser could not read — shown so nothing disappears silently. */
  skippedLines?: string[];
};

function formatDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  // Construct locally so the label never slips a day across timezones.
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatSet(set: PendingSet, defaultUnit: Unit) {
  if (set.durationSeconds != null) {
    const minutes = Math.floor(set.durationSeconds / 60);
    const seconds = set.durationSeconds % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds} sec`;
  }

  const reps = set.reps != null ? `${set.reps} reps` : "— reps";
  if (set.weight == null) return `${reps} · bodyweight`;
  return `${reps} · ${set.weight} ${set.unit ?? defaultUnit}`;
}

export default function ConfirmSaveCard({ sessions, defaultUnit, skippedLines = [] }: ConfirmSaveCardProps) {
  const totalSets = sessions.reduce(
    (sum, session) => sum + session.exercises.reduce((inner, exercise) => inner + exercise.sets.length, 0),
    0
  );
  const totalExercises = sessions.reduce((sum, session) => sum + session.exercises.length, 0);

  return (
    <div className="space-y-4">
      {sessions.map((session, index) => (
        <div key={`${session.date}-${session.split}-${index}`} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
          <p className="text-sm font-semibold text-white">{formatDate(session.date)}</p>
          <p className="mt-0.5 text-xs uppercase tracking-wide text-amber-300/80">{session.split}</p>

          {session.willOverwrite && (
            <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-red-300">
              ⚠ This date already has a {session.split} session.
              {session.existingSetCount > 0
                ? ` Saving replaces its ${session.existingSetCount} existing set${session.existingSetCount === 1 ? "" : "s"}.`
                : " Saving replaces what is already there."}
            </p>
          )}

          <div className="mt-3 space-y-3">
            {session.exercises.map((exercise) => (
              <div key={exercise.exerciseId}>
                <p className="text-sm font-medium text-zinc-100">{exercise.exerciseName}</p>
                <ul className="mt-1 space-y-0.5">
                  {exercise.sets.map((set, setIndex) => (
                    <li key={setIndex} className="flex gap-3 text-xs text-zinc-400">
                      <span className="w-12 shrink-0 text-zinc-600">Set {setIndex + 1}</span>
                      <span>{formatSet(set, defaultUnit)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="mt-3 border-t border-zinc-800 pt-2 text-xs text-zinc-500">
            {session.exercises.length} exercise{session.exercises.length === 1 ? "" : "s"} ·{" "}
            {session.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)} sets
          </p>
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

      {sessions.length > 1 && (
        <p className="text-center text-xs text-zinc-500">
          {sessions.length} sessions · {totalExercises} exercises · {totalSets} sets in total
        </p>
      )}
    </div>
  );
}
