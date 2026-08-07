"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { TABLES } from "@/lib/dbNames";
import GradientButton from "@/shared/ui/GradientButton";
import type { Exercise, Split } from "@/features/log/types";

type ExerciseMoveModalProps = {
  exercise: Exercise;
  userId: string;
  isBusy: boolean;
  onCancel: () => void;
  onConfirm: (targetSplit: Split, targetMuscleGroup: string) => void;
};

const SPLITS: Split[] = ["push", "pull", "legs", "core"];

export default function ExerciseMoveModal({ exercise, userId, isBusy, onCancel, onConfirm }: ExerciseMoveModalProps) {
  const [targetSplit, setTargetSplit] = useState<Split>(exercise.split);
  const [targetMuscleGroup, setTargetMuscleGroup] = useState(exercise.muscle_group);
  const [muscleGroupsBySplit, setMuscleGroupsBySplit] = useState<Partial<Record<Split, string[]>>>({});
  const [loadingGroups, setLoadingGroups] = useState(true);

  useEffect(() => {
    async function fetchGroups() {
      const { data } = await supabase
        .from(TABLES.exercises)
        .select("split,muscle_group")
        .eq("user_id", userId)
        .eq("is_active", true);

      const map: Partial<Record<Split, Set<string>>> = {};
      for (const row of (data ?? []) as Array<{ split: Split; muscle_group: string }>) {
        if (!map[row.split]) map[row.split] = new Set();
        map[row.split]!.add(row.muscle_group);
      }

      const grouped: Partial<Record<Split, string[]>> = {};
      for (const [s, set] of Object.entries(map) as Array<[Split, Set<string>]>) {
        grouped[s] = Array.from(set).sort();
      }
      setMuscleGroupsBySplit(grouped);

      const initialGroups = grouped[exercise.split] ?? [];
      if (initialGroups.includes(exercise.muscle_group)) {
        setTargetMuscleGroup(exercise.muscle_group);
      } else if (initialGroups.length > 0) {
        setTargetMuscleGroup(initialGroups[0]!);
      } else {
        setTargetMuscleGroup("");
      }

      setLoadingGroups(false);
    }
    void fetchGroups();
  }, [userId, exercise.split, exercise.muscle_group]);

  const groupOptions = muscleGroupsBySplit[targetSplit] ?? [];
  const isUnchanged = targetSplit === exercise.split && targetMuscleGroup === exercise.muscle_group;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">Move Exercise</p>
        <h3 className="mt-2 text-xl font-semibold text-white">Move &ldquo;{exercise.name}&rdquo;</h3>

        {loadingGroups ? (
          <p className="mt-4 text-sm text-zinc-400">Loading...</p>
        ) : (
          <>
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Target session</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SPLITS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setTargetSplit(s);
                      const groups = muscleGroupsBySplit[s] ?? [];
                      if (groups.includes(exercise.muscle_group)) {
                        setTargetMuscleGroup(exercise.muscle_group);
                      } else if (groups.length > 0) {
                        setTargetMuscleGroup(groups[0]!);
                      } else {
                        setTargetMuscleGroup("");
                      }
                    }}
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

            <div className="mt-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Target muscle group
              </label>
              {groupOptions.length > 0 ? (
                <select
                  value={targetMuscleGroup}
                  onChange={(e) => setTargetMuscleGroup(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                >
                  {groupOptions.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                  {!groupOptions.includes(exercise.muscle_group) && (
                    <option value={exercise.muscle_group}>{exercise.muscle_group} (new)</option>
                  )}
                </select>
              ) : (
                <input
                  value={targetMuscleGroup}
                  onChange={(e) => setTargetMuscleGroup(e.target.value)}
                  placeholder="e.g. chest, back, core"
                  maxLength={40}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                />
              )}
            </div>
          </>
        )}

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
            label={isBusy ? "Moving..." : "Move Exercise"}
            onClick={() => onConfirm(targetSplit, targetMuscleGroup.trim())}
            disabled={isBusy || isUnchanged || !targetMuscleGroup.trim() || loadingGroups}
          />
        </div>
      </div>
    </div>
  );
}
