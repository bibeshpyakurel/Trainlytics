"use client";

import { useState } from "react";
import GradientButton from "@/shared/ui/GradientButton";
import type { Split } from "@/features/log/types";

type MuscleGroupMoveModalProps = {
  muscleGroup: string;
  currentSplit: Split;
  isBusy: boolean;
  onCancel: () => void;
  onConfirm: (targetSplit: Split) => void;
};

const SPLITS: Split[] = ["push", "pull", "legs", "core"];

export default function MuscleGroupMoveModal({ muscleGroup, currentSplit, isBusy, onCancel, onConfirm }: MuscleGroupMoveModalProps) {
  const [targetSplit, setTargetSplit] = useState<Split | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">Move Muscle Group</p>
        <h3 className="mt-2 text-xl font-semibold capitalize text-white">Move &ldquo;{muscleGroup}&rdquo;</h3>
        <p className="mt-2 text-sm text-zinc-300">
          All exercises in this group will move to the selected session. If a group with the same name already exists
          there, they will be merged into it.
        </p>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Target session</p>
          <div className="grid grid-cols-3 gap-2">
            {SPLITS.filter((s) => s !== currentSplit).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setTargetSplit(s)}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold capitalize transition ${
                  targetSplit === s
                    ? "border-amber-300/70 bg-amber-400/10 text-amber-200"
                    : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-60"
          >
            Cancel
          </button>
          <GradientButton
            label={isBusy ? "Moving..." : "Move Group"}
            onClick={() => targetSplit && onConfirm(targetSplit)}
            disabled={isBusy || !targetSplit}
          />
        </div>
      </div>
    </div>
  );
}
