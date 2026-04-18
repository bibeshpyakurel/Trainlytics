"use client";

import { useState } from "react";
import type { Exercise } from "@/features/log/types";
import GradientButton from "@/shared/ui/GradientButton";

type ArchiveWithReplacementModalProps = {
  exercise: Exercise;
  activeExercisesInSplit: Exercise[];
  onCancel: () => void;
  onConfirm: (replacedByExerciseId: string | null) => void;
};

export default function ArchiveWithReplacementModal({
  exercise,
  activeExercisesInSplit,
  onCancel,
  onConfirm,
}: ArchiveWithReplacementModalProps) {
  const [selectedReplacementId, setSelectedReplacementId] = useState<string>("");

  const candidates = activeExercisesInSplit.filter((e) => e.id !== exercise.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">Archive Exercise</p>
        <h3 className="mt-2 text-xl font-semibold text-white">Archive {exercise.name}?</h3>

        <div className="mt-3 text-sm text-zinc-300">
          <p>
            This removes <span className="font-semibold text-white">{exercise.name}</span> from your active logger.
            Its historical workout data will still be preserved and visible in charts.
          </p>

          {candidates.length > 0 && (
            <div className="mt-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">
                Replacement exercise <span className="font-normal normal-case text-zinc-500">(optional)</span>
              </label>
              <p className="text-xs text-zinc-500 mb-2">
                Linking a replacement merges historical trend data into the new exercise on the dashboard.
              </p>
              <select
                value={selectedReplacementId}
                onChange={(e) => setSelectedReplacementId(e.target.value)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-sm text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
              >
                <option value="">— No replacement —</option>
                {candidates.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
          >
            Cancel
          </button>
          <GradientButton
            label={selectedReplacementId ? "Archive with Replacement" : "Archive"}
            onClick={() => onConfirm(selectedReplacementId || null)}
          />
        </div>
      </div>
    </div>
  );
}
