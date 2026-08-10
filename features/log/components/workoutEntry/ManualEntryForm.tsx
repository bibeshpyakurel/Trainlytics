"use client";

import { useMemo } from "react";
import type { CatalogEntry } from "@/lib/workoutImportService";
import { MAX_SETS, resizePerSetValues, type EntryRow } from "@/lib/manualEntry";
import type { Split } from "@/features/log/types";
import type { Unit } from "@/lib/convertWeight";

export const NEW_EXERCISE_VALUE = "__new_exercise__";

type ManualEntryFormProps = {
  /** The user's training days, in their chosen order. */
  splits: Split[];
  date: string;
  split: Split;
  rows: EntryRow[];
  catalog: CatalogEntry[];
  onChangeDate: (date: string) => void;
  onChangeSplit: (split: Split) => void;
  onChangeRow: (key: string, patch: Partial<EntryRow>) => void;
  onRemoveRow: (key: string) => void;
  onAddRow: () => void;
  onRequestNewExercise: (rowKey: string) => void;
};

const FIELD_CLASS =
  "min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 text-sm text-zinc-100 outline-none ring-amber-300/70 placeholder:text-zinc-600 focus:ring-2";
const LABEL_CLASS = "mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400";

export default function ManualEntryForm({
  splits,
  date,
  split,
  rows,
  catalog,
  onChangeDate,
  onChangeSplit,
  onChangeRow,
  onRemoveRow,
  onAddRow,
  onRequestNewExercise,
}: ManualEntryFormProps) {
  // Only offer exercises belonging to the chosen split — otherwise the list is unusable on a phone.
  const options = useMemo(
    () => catalog.filter((entry) => entry.split === split).sort((a, b) => a.name.localeCompare(b.name)),
    [catalog, split]
  );

  const byId = useMemo(() => new Map(catalog.map((entry) => [entry.id, entry])), [catalog]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="entry-date" className={LABEL_CLASS}>Date</label>
          <input
            id="entry-date"
            type="date"
            value={date}
            onChange={(e) => onChangeDate(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label htmlFor="entry-split" className={LABEL_CLASS}>Split</label>
          <select
            id="entry-split"
            value={split}
            onChange={(e) => onChangeSplit(e.target.value as Split)}
            className={`${FIELD_CLASS} capitalize`}
          >
            {splits.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
      </div>

      {rows.map((row, index) => {
        const exercise = row.exerciseId ? byId.get(row.exerciseId) : undefined;
        const isDuration = exercise?.metric_type === "DURATION";
        const perSetValues = row.perSet ? resizePerSetValues(row) : [];

        return (
          <div key={row.key} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Exercise {index + 1}</p>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemoveRow(row.key)}
                  aria-label={`Remove exercise ${index + 1}`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
                >
                  ✕
                </button>
              )}
            </div>

            <select
              value={row.exerciseId}
              onChange={(e) => {
                if (e.target.value === NEW_EXERCISE_VALUE) {
                  onRequestNewExercise(row.key);
                  return;
                }
                onChangeRow(row.key, { exerciseId: e.target.value });
              }}
              className={FIELD_CLASS}
            >
              <option value="">Pick an exercise…</option>
              {options.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.name}</option>
              ))}
              <option value={NEW_EXERCISE_VALUE}>＋ New exercise…</option>
            </select>

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <span className={LABEL_CLASS}>Sets</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onChangeRow(row.key, { setCount: Math.max(1, row.setCount - 1) })}
                    aria-label="One fewer set"
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-700 text-lg text-zinc-300 transition hover:bg-zinc-800"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-semibold text-zinc-100">{row.setCount}</span>
                  <button
                    type="button"
                    onClick={() => onChangeRow(row.key, { setCount: Math.min(MAX_SETS, row.setCount + 1) })}
                    aria-label="One more set"
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-700 text-lg text-zinc-300 transition hover:bg-zinc-800"
                  >
                    +
                  </button>
                </div>
              </div>

              {!row.perSet && isDuration && (
                <>
                  <div className="min-w-[5rem] flex-1">
                    <label className={LABEL_CLASS} htmlFor={`duration-${row.key}`}>Duration</label>
                    <input
                      id={`duration-${row.key}`}
                      inputMode="numeric"
                      value={row.durationValue}
                      onChange={(e) => onChangeRow(row.key, { durationValue: e.target.value.replace(/[^\d]/g, "") })}
                      placeholder="60"
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div className="w-24">
                    <span className={LABEL_CLASS}>Unit</span>
                    <select
                      value={row.durationUnit}
                      onChange={(e) => onChangeRow(row.key, { durationUnit: e.target.value as "sec" | "min" })}
                      className={FIELD_CLASS}
                      aria-label="Duration unit"
                    >
                      <option value="sec">sec</option>
                      <option value="min">min</option>
                    </select>
                  </div>
                </>
              )}

              {!row.perSet && !isDuration && (
                <>
                  <div className="min-w-[4.5rem] flex-1">
                    <label className={LABEL_CLASS} htmlFor={`reps-${row.key}`}>Reps</label>
                    <input
                      id={`reps-${row.key}`}
                      inputMode="numeric"
                      value={row.reps}
                      onChange={(e) => onChangeRow(row.key, { reps: e.target.value.replace(/[^\d]/g, "") })}
                      placeholder="8"
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div className="min-w-[5rem] flex-1">
                    <label className={LABEL_CLASS} htmlFor={`weight-${row.key}`}>Weight</label>
                    <input
                      id={`weight-${row.key}`}
                      inputMode="decimal"
                      value={row.weight}
                      onChange={(e) => onChangeRow(row.key, { weight: e.target.value.replace(/[^\d.]/g, "") })}
                      placeholder="Bodyweight"
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div className="flex gap-1">
                    {(["lb", "kg"] as Unit[]).map((unitOption) => (
                      <button
                        key={unitOption}
                        type="button"
                        onClick={() => onChangeRow(row.key, { unit: unitOption })}
                        className={`h-11 w-11 rounded-xl border text-xs font-semibold transition ${
                          row.unit === unitOption
                            ? "border-amber-300/70 bg-amber-400/10 text-amber-200"
                            : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                        }`}
                      >
                        {unitOption}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {row.perSet && (
              <div className="mt-3 space-y-2">
                {perSetValues.map((value, setIndex) => (
                  <div key={setIndex} className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-xs text-zinc-500">Set {setIndex + 1}</span>
                    {isDuration ? (
                      <input
                        inputMode="numeric"
                        value={value.durationValue}
                        onChange={(e) => {
                          const next = [...perSetValues];
                          next[setIndex] = { ...value, durationValue: e.target.value.replace(/[^\d]/g, "") };
                          onChangeRow(row.key, { perSetValues: next });
                        }}
                        placeholder="60"
                        aria-label={`Set ${setIndex + 1} duration`}
                        className={FIELD_CLASS}
                      />
                    ) : (
                      <>
                        <input
                          inputMode="numeric"
                          value={value.reps}
                          onChange={(e) => {
                            const next = [...perSetValues];
                            next[setIndex] = { ...value, reps: e.target.value.replace(/[^\d]/g, "") };
                            onChangeRow(row.key, { perSetValues: next });
                          }}
                          placeholder="reps"
                          aria-label={`Set ${setIndex + 1} reps`}
                          className={FIELD_CLASS}
                        />
                        <input
                          inputMode="decimal"
                          value={value.weight}
                          onChange={(e) => {
                            const next = [...perSetValues];
                            next[setIndex] = { ...value, weight: e.target.value.replace(/[^\d.]/g, "") };
                            onChangeRow(row.key, { perSetValues: next });
                          }}
                          placeholder="weight"
                          aria-label={`Set ${setIndex + 1} weight`}
                          className={FIELD_CLASS}
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <label className="mt-3 flex min-h-11 items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={row.perSet}
                onChange={(e) =>
                  onChangeRow(row.key, {
                    perSet: e.target.checked,
                    perSetValues: e.target.checked ? resizePerSetValues(row) : [],
                  })
                }
                className="h-5 w-5 rounded border-zinc-600 bg-zinc-950 accent-amber-400"
              />
              Sets differ (enter each one)
            </label>
          </div>
        );
      })}

      <button
        type="button"
        onClick={onAddRow}
        className="min-h-11 w-full rounded-xl border border-dashed border-zinc-700 text-sm font-semibold text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-900"
      >
        ＋ Add exercise
      </button>
    </div>
  );
}
