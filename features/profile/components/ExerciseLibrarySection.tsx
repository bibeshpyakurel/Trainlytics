"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MetricType, Split } from "@/features/log/types";
import {
  deleteManagedExercise,
  loadManagedExercises,
  restoreManagedExercise,
  updateArchivedExerciseReplacement,
  type ManagedExercise,
} from "@/lib/exerciseManagement";
import ConfirmModal from "@/shared/ui/ConfirmModal";
import GradientButton from "@/shared/ui/GradientButton";
import ArchivedBadge from "@/shared/ui/ArchivedBadge";

type ExerciseLibrarySectionProps = {
  userId: string;
  disabled?: boolean;
  onStatus: (message: string | null) => void;
};

function formatMetricType(metricType: MetricType) {
  return metricType === "DURATION" ? "Duration" : "Weighted reps";
}

function formatSplit(split: Split) {
  return split.toUpperCase();
}

export default function ExerciseLibrarySection({ userId, disabled = false, onStatus }: ExerciseLibrarySectionProps) {
  const [exercises, setExercises] = useState<ManagedExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<ManagedExercise | null>(null);
  const [pendingRestore, setPendingRestore] = useState<ManagedExercise | null>(null);
  const [pendingReplacementEdit, setPendingReplacementEdit] = useState<ManagedExercise | null>(null);
  const [replacementSelectionId, setReplacementSelectionId] = useState<string>("");

  const refreshExercises = useCallback(async (showLoading = true) => {
    if (!userId) {
      setExercises([]);
      setLoading(false);
      return;
    }

    if (showLoading) {
      setLoading(true);
    }

    const result = await loadManagedExercises(userId);
    setLoading(false);

    if (!result.ok) {
      onStatus(`Failed loading exercises: ${result.message}`);
      return;
    }

    setExercises(result.exercises);
  }, [onStatus, userId]);

  useEffect(() => {
    let isCancelled = false;

    async function loadInitialExercises() {
      if (!userId) {
        setLoading(false);
        return;
      }

      const result = await loadManagedExercises(userId);
      if (isCancelled) {
        return;
      }

      setLoading(false);
      if (!result.ok) {
        onStatus(`Failed loading exercises: ${result.message}`);
        return;
      }

      setExercises(result.exercises);
    }

    void loadInitialExercises();
    return () => {
      isCancelled = true;
    };
  }, [onStatus, userId]);

  const archivedExercises = useMemo(
    () => exercises.filter((exercise) => !exercise.is_active),
    [exercises]
  );
  const exerciseById = useMemo(
    () => new Map(exercises.map((exercise) => [exercise.id, exercise])),
    [exercises]
  );
  const replacementCandidates = useMemo(() => {
    if (!pendingReplacementEdit) {
      return [] as ManagedExercise[];
    }

    return exercises.filter(
      (exercise) =>
        exercise.is_active &&
        exercise.id !== pendingReplacementEdit.id &&
        exercise.split === pendingReplacementEdit.split &&
        exercise.metric_type === pendingReplacementEdit.metric_type
    );
  }, [exercises, pendingReplacementEdit]);

  async function confirmRestoreExercise() {
    if (!pendingRestore || disabled) return;

    const target = pendingRestore;
    setPendingRestore(null);
    onStatus(null);

    const result = await restoreManagedExercise(userId, target.id, target.split);
    if (!result.ok) {
      onStatus(`Failed restoring exercise: ${result.message}`);
      return;
    }

    onStatus("Exercise restored to your active list ✅");
    await refreshExercises(false);
  }

  async function confirmDeleteExercise() {
    if (!pendingDelete || disabled) return;

    const target = pendingDelete;
    setPendingDelete(null);
    onStatus(null);

    const result = await deleteManagedExercise(userId, target.id);
    if (!result.ok) {
      onStatus(`Failed deleting exercise: ${result.message}`);
      return;
    }

    onStatus(
      `Exercise permanently deleted from the backend. Removed ${result.deletedSetCount} set${result.deletedSetCount === 1 ? "" : "s"} and ${result.deletedEmptySessions} empty session${result.deletedEmptySessions === 1 ? "" : "s"} ✅`
    );
    await refreshExercises(false);
  }

  async function confirmReplacementEdit() {
    if (!pendingReplacementEdit || disabled) return;

    const target = pendingReplacementEdit;
    const nextReplacementId = replacementSelectionId || null;
    setPendingReplacementEdit(null);
    onStatus(null);

    const result = await updateArchivedExerciseReplacement(userId, target.id, nextReplacementId);
    if (!result.ok) {
      onStatus(`Failed updating replacement link: ${result.message}`);
      return;
    }

    if (nextReplacementId) {
      const replacementName = exerciseById.get(nextReplacementId)?.name ?? "the selected exercise";
      onStatus(`Historical trend for ${target.name} now rolls into ${replacementName} on the dashboard ✅`);
    } else {
      onStatus(`Replacement link removed for ${target.name}. Its dashboard trend now appears separately ✅`);
    }

    await refreshExercises(false);
  }

  return (
    <section className="rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Archived Exercises</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Only archived exercises are managed here. Unarchive restores an exercise to your active logger.
            Permanent delete removes the exercise and all related workout history from the backend.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-700/70 bg-zinc-950/50 px-4 py-3 text-center text-xs">
          <p className="uppercase tracking-[0.14em] text-zinc-500">Archived</p>
          <p className="mt-1 text-lg font-semibold text-zinc-100">{archivedExercises.length}</p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-zinc-700/70 bg-zinc-950/50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Archived list</h3>
            <p className="mt-1 text-xs text-zinc-400">Hidden from your active logger until restored.</p>
          </div>
          <button
            type="button"
            onClick={() => void refreshExercises()}
            disabled={loading || disabled}
            className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50"
          >
            Refresh List
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {loading ? (
            <p className="text-sm text-zinc-400">Loading exercises...</p>
          ) : archivedExercises.length === 0 ? (
            <p className="text-sm text-zinc-400">No archived exercises yet.</p>
          ) : (
            archivedExercises.map((exercise) => (
              <div key={exercise.id} className="rounded-xl border border-zinc-700/80 bg-zinc-900/60 px-4 py-3">
                <p className="flex items-center text-sm font-semibold text-zinc-500 line-through">
                  {exercise.name}
                  <ArchivedBadge />
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  {formatSplit(exercise.split)} · {exercise.muscle_group} · {formatMetricType(exercise.metric_type)}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {exercise.loggedSetCount} historical set{exercise.loggedSetCount === 1 ? "" : "s"} across {exercise.loggedSessionCount} session{exercise.loggedSessionCount === 1 ? "" : "s"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {exercise.replaced_by_exercise_id && exerciseById.get(exercise.replaced_by_exercise_id)
                    ? (
                      <>
                        Dashboard trend merges into <span className="font-medium text-zinc-300">{exerciseById.get(exercise.replaced_by_exercise_id)?.name}</span>.
                      </>
                    )
                    : "Not linked to a replacement yet. Its history appears as a separate exercise trend."}
                </p>
                <div className="mt-3 rounded-lg border border-red-400/25 bg-red-500/5 px-3 py-2 text-xs text-red-200">
                  Permanent delete removes this exercise and all related workout history from the backend. This cannot be undone.
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPendingReplacementEdit(exercise);
                      setReplacementSelectionId(exercise.replaced_by_exercise_id ?? "");
                    }}
                    disabled={disabled}
                    className="rounded-md border border-amber-400/60 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-500/10 disabled:opacity-50"
                  >
                    {exercise.replaced_by_exercise_id ? "Edit Replacement Link" : "Link Replacement"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingRestore(exercise)}
                    disabled={disabled}
                    className="rounded-md border border-emerald-400/60 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/10 disabled:opacity-50"
                  >
                    Unarchive
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(exercise)}
                    disabled={disabled}
                    className="rounded-md border border-red-400/60 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
                  >
                    Delete Permanently
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {pendingRestore && (
        <ConfirmModal
          titleTag="Restore Exercise"
          title={`Unarchive ${pendingRestore.name}?`}
          description={
            <>
              This will put <span className="font-semibold text-white">{pendingRestore.name}</span> back into your active
              logger under the <span className="font-semibold text-white">{formatSplit(pendingRestore.split)}</span> split.
            </>
          }
          onCancel={() => setPendingRestore(null)}
          confirmButton={<GradientButton label="Unarchive" onClick={() => void confirmRestoreExercise()} />}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          titleTag="Permanent Delete"
          title={`Delete ${pendingDelete.name} permanently?`}
          description={
            <>
              This removes the exercise and all related workout data from the backend. This action cannot be undone.
              <div className="mt-2 rounded-lg border border-red-400/30 bg-red-500/5 px-3 py-2 text-xs text-red-200">
                {pendingDelete.loggedSetCount} logged set{pendingDelete.loggedSetCount === 1 ? "" : "s"} across {pendingDelete.loggedSessionCount} session{pendingDelete.loggedSessionCount === 1 ? "" : "s"} will be deleted.
              </div>
            </>
          }
          onCancel={() => setPendingDelete(null)}
          confirmButton={<GradientButton label="Delete Permanently" tone="danger" onClick={() => void confirmDeleteExercise()} />}
        />
      )}

      {pendingReplacementEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">Replacement Link</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Link {pendingReplacementEdit.name} to a current exercise</h3>

            <div className="mt-3 text-sm text-zinc-300">
              <p>
                Linked replacements keep your archived history visible while rolling it into the current exercise trend on the dashboard.
              </p>
              <label className="mb-1.5 mt-4 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Replacement exercise <span className="font-normal normal-case text-zinc-500">(optional)</span>
              </label>
              <select
                value={replacementSelectionId}
                onChange={(e) => setReplacementSelectionId(e.target.value)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-sm text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
              >
                <option value="">— Keep separate —</option>
                {replacementCandidates.map((exercise) => (
                  <option key={exercise.id} value={exercise.id}>
                    {exercise.name}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-zinc-500">
                Only active exercises from the same split and metric type can be linked.
              </p>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingReplacementEdit(null)}
                className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
              >
                Cancel
              </button>
              <GradientButton
                label={replacementSelectionId ? "Save Replacement Link" : "Keep Separate"}
                onClick={() => void confirmReplacementEdit()}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}