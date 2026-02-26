type FeedbackOverlayProps = {
  text: string;
  tone: "success" | "error";
};

export default function FeedbackOverlay({ text, tone }: FeedbackOverlayProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-24 z-40 flex justify-center px-4">
      <div
        className={`max-w-xl rounded-xl border px-4 py-3 text-sm shadow-xl ${
          tone === "success"
            ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200"
            : "border-red-400/60 bg-red-500/15 text-red-200"
        }`}
      >
        {text}
      </div>
    </div>
  );
}
