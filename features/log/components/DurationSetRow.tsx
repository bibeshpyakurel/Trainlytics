import { formatModified } from "@/features/log/formatters";
import PreviousPerformancePill from "@/features/log/components/PreviousPerformancePill";

type DurationSetRowProps = {
  setIndex: 0 | 1;
  row: { seconds: string } | undefined;
  isCurrentDate: boolean;
  loading: boolean;
  lastDurationSet?: { durationSeconds: number | null; sessionDate: string };
  lastModified?: string;
  onUpdateSeconds: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
};

export default function DurationSetRow({
  setIndex,
  row,
  isCurrentDate,
  loading,
  lastDurationSet,
  lastModified,
  onUpdateSeconds,
  onSave,
  onDelete,
}: DurationSetRowProps) {
  return (
    <div className="rounded-xl border border-zinc-700/70 bg-zinc-950/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-12 text-sm text-zinc-300">Set {setIndex + 1}</span>

        <input
          className="w-40 rounded-md border border-zinc-700 bg-zinc-900 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
          placeholder="Seconds"
          inputMode="numeric"
          value={row?.seconds ?? ""}
          onChange={(e) => onUpdateSeconds(e.target.value)}
        />

        <span className="text-sm text-zinc-400">seconds</span>

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

        {isCurrentDate && lastDurationSet && (
          <PreviousPerformancePill
            primary={`${lastDurationSet.durationSeconds ?? "-"}s`}
            sessionDate={lastDurationSet.sessionDate}
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
