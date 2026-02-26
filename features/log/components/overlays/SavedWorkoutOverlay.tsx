import type { Split } from "@/features/log/types";

type SavedWorkoutOverlayProps = {
  split: Split;
  sessionDate: string;
  setCount: number;
};

export default function SavedWorkoutOverlay({ split, sessionDate, setCount }: SavedWorkoutOverlayProps) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-zinc-700/80 bg-zinc-900/90 px-7 py-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(245,158,11,0.24),transparent_40%),radial-gradient(circle_at_85%_78%,rgba(16,185,129,0.22),transparent_44%),radial-gradient(circle_at_68%_18%,rgba(59,130,246,0.2),transparent_44%)]" />

        <div className="relative z-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/20 text-3xl text-emerald-300">
            ✓
          </div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300/85">
            Workout Saved
          </p>
          <p className="mt-2 text-xl font-bold text-white">
            {split.toUpperCase()} · {sessionDate}
          </p>
          <p className="mt-1 text-sm text-zinc-300">
            {setCount} set{setCount === 1 ? "" : "s"} recorded.
          </p>
        </div>
      </div>
    </div>
  );
}
