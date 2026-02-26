import GradientButton from "@/shared/ui/GradientButton";

type AvatarCropModalProps = {
  sourceUrl: string;
  cropZoom: number;
  cropOffsetX: number;
  cropOffsetY: number;
  isSaving: boolean;
  onChangeZoom: (value: number) => void;
  onChangeOffsetX: (value: number) => void;
  onChangeOffsetY: (value: number) => void;
  onCancel: () => void;
  onSave: () => void;
};

export default function AvatarCropModal({
  sourceUrl,
  cropZoom,
  cropOffsetX,
  cropOffsetY,
  isSaving,
  onChangeZoom,
  onChangeOffsetX,
  onChangeOffsetY,
  onCancel,
  onSave,
}: AvatarCropModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">Crop Profile Photo</p>
        <div className="mt-3 flex justify-center">
          <div className="relative h-72 w-72 overflow-hidden rounded-full border-2 border-zinc-600 bg-zinc-950">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sourceUrl}
              alt="Crop preview"
              className="absolute select-none"
              style={{
                left: `calc(50% + ${cropOffsetX}px)`,
                top: `calc(50% + ${cropOffsetY}px)`,
                width: `${cropZoom * 100}%`,
                height: `${cropZoom * 100}%`,
                transform: "translate(-50%, -50%)",
                objectFit: "cover",
              }}
            />
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-xs text-zinc-300">
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={cropZoom}
              onChange={(event) => onChangeZoom(Number(event.target.value))}
              className="mt-1 w-full"
            />
          </label>
          <label className="block text-xs text-zinc-300">
            Horizontal
            <input
              type="range"
              min={-140}
              max={140}
              step={1}
              value={cropOffsetX}
              onChange={(event) => onChangeOffsetX(Number(event.target.value))}
              className="mt-1 w-full"
            />
          </label>
          <label className="block text-xs text-zinc-300">
            Vertical
            <input
              type="range"
              min={-140}
              max={140}
              step={1}
              value={cropOffsetY}
              onChange={(event) => onChangeOffsetY(Number(event.target.value))}
              className="mt-1 w-full"
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="rounded-md border border-zinc-600 px-4 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-60"
          >
            Cancel
          </button>
          <GradientButton
            label={isSaving ? "Saving..." : "Save Photo"}
            onClick={onSave}
            disabled={isSaving}
          />
        </div>
      </div>
    </div>
  );
}
