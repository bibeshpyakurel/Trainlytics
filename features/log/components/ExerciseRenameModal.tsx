"use client";

import { useState } from "react";
import GradientButton from "@/shared/ui/GradientButton";
import type { Exercise } from "@/features/log/types";
import ModalSheet from "@/shared/ui/ModalSheet";

type ExerciseRenameModalProps = {
  exercise: Exercise;
  isBusy: boolean;
  onCancel: () => void;
  onConfirm: (newName: string) => void;
};

export default function ExerciseRenameModal({ exercise, isBusy, onCancel, onConfirm }: ExerciseRenameModalProps) {
  const [name, setName] = useState(exercise.name);
  const trimmed = name.trim();

  return (
    <ModalSheet>
      <div className="w-full max-w-md rounded-t-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl sm:rounded-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">Rename Exercise</p>
        <h3 className="mt-2 text-xl font-semibold text-white">Rename &ldquo;{exercise.name}&rdquo;</h3>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isBusy}
          maxLength={80}
          placeholder="New exercise name"
          className="mt-4 w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2 disabled:opacity-60"
        />
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
            label={isBusy ? "Saving..." : "Rename"}
            onClick={() => onConfirm(trimmed)}
            disabled={isBusy || !trimmed || trimmed === exercise.name}
          />
        </div>
      </div>
    </ModalSheet>
  );
}
