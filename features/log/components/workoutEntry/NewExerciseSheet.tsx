"use client";

import { useMemo, useState } from "react";
import { createManagedExercise } from "@/lib/exerciseManagement";
import type { CatalogEntry } from "@/lib/workoutImportService";
import { useUserSplits } from "@/features/log/useUserSplits";
import type { MetricType, Split } from "@/features/log/types";
import GradientButton from "@/shared/ui/GradientButton";
import ModalSheet from "@/shared/ui/ModalSheet";

type NewExerciseSheetProps = {
  userId: string;
  catalog: CatalogEntry[];
  /** Split chosen for the session — prefilled, but changeable. */
  defaultSplit: Split;
  initialName?: string;
  onCancel: () => void;
  onCreated: (exercise: CatalogEntry) => void;
};

const NEW_GROUP = "__new__";

export default function NewExerciseSheet({
  userId,
  catalog,
  defaultSplit,
  initialName = "",
  onCancel,
  onCreated,
}: NewExerciseSheetProps) {
  const SPLITS = useUserSplits(userId);
  const [name, setName] = useState(initialName);
  const [split, setSplit] = useState<Split>(defaultSplit);
  const [metricType, setMetricType] = useState<MetricType>("WEIGHTED_REPS");
  const [groupChoice, setGroupChoice] = useState<string>("");
  const [customGroup, setCustomGroup] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Offer the groups this user already uses in the chosen split.
  const groupOptions = useMemo(() => {
    const groups = catalog.filter((entry) => entry.split === split).map((entry) => entry.muscle_group);
    return [...new Set(groups)].sort();
  }, [catalog, split]);

  const muscleGroup = groupChoice === NEW_GROUP ? customGroup : groupChoice;
  const canSave = name.trim().length > 0 && muscleGroup.trim().length > 0 && !isSaving;

  async function handleCreate() {
    setError(null);
    setIsSaving(true);

    const result = await createManagedExercise(userId, {
      name,
      split,
      muscleGroup,
      metricType,
    });

    setIsSaving(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    onCreated({
      id: result.exercise.id,
      name: result.exercise.name,
      split: result.exercise.split,
      muscle_group: result.exercise.muscle_group,
      metric_type: result.exercise.metric_type,
    });
  }

  return (
    <ModalSheet backdropClassName="bg-zinc-950/80">
      <div className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-2xl border border-zinc-700 bg-zinc-900 shadow-2xl sm:rounded-2xl">
        <div className="border-b border-zinc-800 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">New Exercise</p>
          <h3 className="mt-2 text-lg font-semibold text-white">Add it to your list</h3>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
          <div>
            <label htmlFor="new-exercise-name" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Name
            </label>
            <input
              id="new-exercise-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="e.g. Cable Crossover"
              className="min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 text-sm text-zinc-100 outline-none ring-amber-300/70 placeholder:text-zinc-600 focus:ring-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="new-exercise-split" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Split
              </label>
              <select
                id="new-exercise-split"
                value={split}
                onChange={(e) => {
                  setSplit(e.target.value as Split);
                  setGroupChoice("");
                }}
                className="min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 text-sm capitalize text-zinc-100 outline-none ring-amber-300/70 focus:ring-2"
              >
                {SPLITS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="new-exercise-group" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Muscle group
              </label>
              <select
                id="new-exercise-group"
                value={groupChoice}
                onChange={(e) => setGroupChoice(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 text-sm text-zinc-100 outline-none ring-amber-300/70 focus:ring-2"
              >
                <option value="">Pick one…</option>
                {groupOptions.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
                <option value={NEW_GROUP}>New group…</option>
              </select>
            </div>
          </div>

          {groupChoice === NEW_GROUP && (
            <input
              value={customGroup}
              onChange={(e) => setCustomGroup(e.target.value)}
              maxLength={40}
              placeholder="New muscle group name"
              className="min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 text-sm text-zinc-100 outline-none ring-amber-300/70 placeholder:text-zinc-600 focus:ring-2"
            />
          )}

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">What it records</p>
            <div className="flex gap-2">
              {(["WEIGHTED_REPS", "DURATION"] as MetricType[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMetricType(option)}
                  className={`min-h-11 flex-1 rounded-xl border px-3 text-sm font-semibold transition ${
                    metricType === option
                      ? "border-amber-300/70 bg-amber-400/10 text-amber-200"
                      : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  {option === "WEIGHTED_REPS" ? "Weight & reps" : "Duration"}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-300">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-800 p-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="min-h-11 rounded-md border border-zinc-600 px-4 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-60"
          >
            Cancel
          </button>
          <GradientButton
            label={isSaving ? "Creating…" : "Create & select"}
            onClick={() => void handleCreate()}
            disabled={!canSave}
            className="min-h-11 px-4"
          />
        </div>
      </div>
    </ModalSheet>
  );
}
