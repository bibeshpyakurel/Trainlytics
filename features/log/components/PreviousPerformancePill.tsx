import { formatLastSessionDate } from "@/features/log/formatters";

type PreviousPerformancePillProps = {
  primary: string;
  sessionDate: string;
};

export default function PreviousPerformancePill({ primary, sessionDate }: PreviousPerformancePillProps) {
  return (
    <div className="inline-flex min-w-[300px] items-center gap-2 rounded-md border border-zinc-700/70 bg-zinc-950/40 px-3 py-1.5 text-base text-zinc-200">
      <span className="font-semibold text-zinc-100">Previous:</span>
      <span>{primary}</span>
      <span className="text-sm text-zinc-400">({formatLastSessionDate(sessionDate)})</span>
    </div>
  );
}
