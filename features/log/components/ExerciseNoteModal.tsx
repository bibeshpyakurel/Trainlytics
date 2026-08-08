"use client";

import { useState } from "react";
import GradientButton from "@/shared/ui/GradientButton";
import type { Exercise } from "@/features/log/types";

const MEMO_MAX = 500;

type ExerciseNoteModalProps = {
  exercise: Exercise;
  isBusy: boolean;
  onCancel: () => void;
  /** Pass null to delete the note. */
  onSave: (memo: string | null) => void;
};

export default function ExerciseNoteModal({ exercise, isBusy, onCancel, onSave }: ExerciseNoteModalProps) {
  const [text, setText] = useState(exercise.memo ?? "");
  const trimmed = text.trim();
  const hasExistingNote = Boolean(exercise.memo?.trim());
  const isUnchanged = trimmed === (exercise.memo?.trim() ?? "");

  return (
    /* Slides up from bottom on mobile; centred on desktop */
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/70 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-lg rounded-t-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl sm:rounded-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">Exercise Note</p>
        <h3 className="mt-1 text-lg font-semibold text-white">{exercise.name}</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Seat settings, machine tips, form cues — anything useful to remember next time.
        </p>

        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MEMO_MAX))}
          disabled={isBusy}
          rows={4}
          placeholder="e.g. Seat: 5 · Crunch machine feels lighter than Planet Fitness"
          className="mt-4 w-full resize-none rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2.5 text-sm text-zinc-100 outline-none ring-amber-300/70 placeholder:text-zinc-600 transition focus:ring-2 disabled:opacity-60"
        />
        <p className="mt-1 text-right text-[11px] text-zinc-600">
          {text.length}/{MEMO_MAX}
        </p>

        <div className="mt-4 flex items-center justify-between gap-2">
          {hasExistingNote ? (
            <button
              type="button"
              onClick={() => onSave(null)}
              disabled={isBusy}
              className="rounded-md border border-red-400/50 px-3 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-60"
            >
              Delete Note
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isBusy}
              className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-60"
            >
              Cancel
            </button>
            <GradientButton
              label={isBusy ? "Saving..." : "Save Note"}
              onClick={() => onSave(trimmed || null)}
              disabled={isBusy || isUnchanged}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
