import type { Unit } from "@/lib/convertWeight";
import { formatModified } from "@/features/log/formatters";
import PreviousPerformancePill from "@/features/log/components/PreviousPerformancePill";

type WeightedSetRowProps = {
  setIndex: 0 | 1;
  exerciseId: string;
  row: { reps: string; weight: string; unit: Unit } | undefined;
  isCurrentDate: boolean;
  loading: boolean;
  lastWeightedSet?: { weightInput: number | null; unitInput: Unit | null; reps: number | null; sessionDate: string };
  lastModified?: string;
  onUpdateReps: (value: string) => void;
  onUpdateWeight: (value: string) => void;
  onUpdateUnit: (value: Unit) => void;
  onSave: () => void;
  onDelete: () => void;
};

export default function WeightedSetRow({
  setIndex,
  row,
  isCurrentDate,
  loading,
  lastWeightedSet,
  lastModified,
  onUpdateReps,
  onUpdateWeight,
  onUpdateUnit,
  onSave,
  onDelete,
}: WeightedSetRowProps) {
  return (
    <div className="rounded-xl border border-zinc-700/70 bg-zinc-950/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-12 text-sm text-zinc-300">Set {setIndex + 1}</span>

        <input
          className="w-28 rounded-md border border-zinc-700 bg-zinc-900 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
          placeholder="Weight"
          inputMode="decimal"
          value={row?.weight ?? ""}
          onChange={(e) => onUpdateWeight(e.target.value)}
        />

        <input
          className="w-24 rounded-md border border-zinc-700 bg-zinc-900 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
          placeholder="Reps"
          inputMode="numeric"
          value={row?.reps ?? ""}
          onChange={(e) => onUpdateReps(e.target.value)}
        />

        <select
          className="rounded-md border border-zinc-700 bg-zinc-900 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
          value={row?.unit ?? "lb"}
          onChange={(e) => onUpdateUnit(e.target.value as Unit)}
        >
          <option value="lb">lb</option>
          <option value="kg">kg</option>
        </select>

        <button
          type="button"
          onClick={onSave}
          disabled={loading}
          className="rounded-md border border-emerald-400/60 px-2 py-1 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/10 disabled:opacity-50"
        >
          Save
        </button>

        <button
          type="button"
          onClick={onDelete}
          disabled={loading}
          className="rounded-md border border-red-400/60 px-2 py-1 text-xs font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
        >
          Delete
        </button>

        {isCurrentDate && lastWeightedSet && (
          <PreviousPerformancePill
            primary={`${lastWeightedSet.weightInput ?? "-"} ${lastWeightedSet.unitInput ?? "lb"} × ${lastWeightedSet.reps ?? "-"} reps`}
            sessionDate={lastWeightedSet.sessionDate}
          />
        )}

        {lastModified && (
          <span className="text-xs text-zinc-500">
            Modified {formatModified(lastModified)}
          </span>
        )}
      </div>
    </div>
  );
}
