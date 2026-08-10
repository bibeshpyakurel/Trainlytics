"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createUserSplit,
  deleteUserSplit,
  ensureUserSplits,
  renameUserSplit,
  reorderUserSplits,
  type UserSplit,
} from "@/lib/splits";
import { supabase } from "@/lib/supabaseClient";
import { TABLES } from "@/lib/dbNames";
import GradientButton from "@/shared/ui/GradientButton";

type TrainingSplitsSectionProps = {
  userId: string;
  disabled?: boolean;
  onStatus: (message: string | null) => void;
};

const FIELD_CLASS =
  "min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 text-sm text-zinc-100 outline-none ring-amber-300/70 placeholder:text-zinc-600 focus:ring-2";

/** Pure fetch, kept out of the component so effects never setState synchronously. */
async function fetchSplitsAndCounts(userId: string) {
  const result = await ensureUserSplits(userId);
  if (!result.ok) return { ok: false as const, message: result.message };

  // How many exercises sit in each split — a split can't be deleted while in use.
  const { data } = await supabase
    .from(TABLES.exercises)
    .select("split")
    .eq("user_id", userId)
    .eq("is_active", true);

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ split: string }>) {
    counts[row.split] = (counts[row.split] ?? 0) + 1;
  }

  return { ok: true as const, splits: result.splits, counts };
}

export default function TrainingSplitsSection({ userId, disabled, onStatus }: TrainingSplitsSectionProps) {
  const [splits, setSplits] = useState<UserSplit[]>([]);
  const [exerciseCounts, setExerciseCounts] = useState<Record<string, number>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [newName, setNewName] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const refresh = useCallback(async () => {
    const result = await fetchSplitsAndCounts(userId);
    if (!result.ok) {
      onStatus(result.message);
      return;
    }
    setSplits(result.splits);
    setExerciseCounts(result.counts);
  }, [userId, onStatus]);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      const result = await fetchSplitsAndCounts(userId);
      if (!isMounted) return;
      if (!result.ok) {
        onStatus(result.message);
        return;
      }
      setSplits(result.splits);
      setExerciseCounts(result.counts);
    })();

    return () => {
      isMounted = false;
    };
  }, [userId, onStatus]);

  async function run(action: () => Promise<{ ok: boolean; message?: string }>, successMessage: string) {
    setIsBusy(true);
    const result = await action();
    setIsBusy(false);

    if (!result.ok) {
      onStatus(result.message ?? "Something went wrong.");
      return false;
    }

    onStatus(successMessage);
    await refresh();
    return true;
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    const created = await run(() => createUserSplit(userId, newName), "Training day added ✅");
    if (created) setNewName("");
  }

  async function handleRename(split: UserSplit) {
    const saved = await run(() => renameUserSplit(userId, split, draftName), "Training day renamed ✅");
    if (saved) setEditingId(null);
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= splits.length) return;

    const next = [...splits];
    [next[index], next[target]] = [next[target], next[index]];
    setSplits(next);

    await run(() => reorderUserSplits(userId, next.map((entry) => entry.id)), "Order saved ✅");
  }

  const isLocked = Boolean(disabled) || isBusy;

  return (
    <section className="rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
      <h2 className="text-lg font-semibold text-white">Training Days</h2>
      <p className="mt-1 text-sm text-zinc-400">
        These are the days you train. Rename them, reorder them, or add your own — the log page follows this list.
      </p>

      <ul className="mt-4 space-y-2">
        {splits.map((split, index) => {
          const count = exerciseCounts[split.name] ?? 0;
          const isEditing = editingId === split.id;

          return (
            <li key={split.id} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
              {isEditing ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    maxLength={40}
                    aria-label={`Rename ${split.name}`}
                    className={FIELD_CLASS}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      disabled={isBusy}
                      className="min-h-11 flex-1 rounded-md border border-zinc-600 px-4 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-60 sm:flex-none"
                    >
                      Cancel
                    </button>
                    <GradientButton
                      label={isBusy ? "Saving…" : "Save"}
                      onClick={() => void handleRename(split)}
                      disabled={isLocked || !draftName.trim()}
                      className="min-h-11 flex-1 px-4 sm:flex-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold capitalize text-zinc-100">{split.name}</p>
                    <p className="text-xs text-zinc-500">
                      {count} exercise{count === 1 ? "" : "s"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleMove(index, -1)}
                    disabled={isLocked || index === 0}
                    aria-label={`Move ${split.name} up`}
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleMove(index, 1)}
                    disabled={isLocked || index === splits.length - 1}
                    aria-label={`Move ${split.name} down`}
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-30"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(split.id);
                      setDraftName(split.name);
                    }}
                    disabled={isLocked}
                    className="min-h-11 rounded-lg border border-zinc-700 px-3 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-40"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => void run(() => deleteUserSplit(userId, split), "Training day removed ✅")}
                    disabled={isLocked || count > 0}
                    title={count > 0 ? "Move or delete its exercises first" : undefined}
                    className="min-h-11 rounded-lg border border-red-500/50 px-3 text-xs font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-30"
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={40}
          placeholder="Add a training day — e.g. arms"
          aria-label="New training day name"
          className={FIELD_CLASS}
        />
        <GradientButton
          label="Add day"
          onClick={() => void handleAdd()}
          disabled={isLocked || !newName.trim()}
          className="min-h-11 px-4"
        />
      </div>

      <p className="mt-3 text-xs text-zinc-500">
        Renaming a day moves every exercise and logged session with it. A day can only be deleted once it has no exercises.
      </p>
    </section>
  );
}
