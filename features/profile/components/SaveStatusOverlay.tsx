type SaveStatusOverlayProps = {
  state: "saving" | "success";
};

export default function SaveStatusOverlay({ state }: SaveStatusOverlayProps) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-950/55 backdrop-blur-sm">
      <div className="relative overflow-hidden rounded-3xl border border-zinc-700/80 bg-zinc-900/90 px-8 py-7 text-center shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(245,158,11,0.22),transparent_45%),radial-gradient(circle_at_80%_75%,rgba(59,130,246,0.2),transparent_46%)]" />
        <div className="relative z-10 flex flex-col items-center">
          {state === "saving" ? (
            <>
              <div className="relative h-14 w-14">
                <span className="absolute inset-0 rounded-full border-2 border-amber-300/40 animate-ping" />
                <span className="absolute inset-1 rounded-full border-2 border-transparent border-t-amber-300 border-r-orange-300 animate-spin" />
              </div>
              <p className="mt-4 text-sm font-medium uppercase tracking-[0.18em] text-amber-300/90">Saving Profile</p>
            </>
          ) : (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/20 text-2xl text-emerald-300 animate-pulse">✓</div>
              <p className="mt-4 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">Saved</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
