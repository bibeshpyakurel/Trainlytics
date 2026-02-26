import type { ReactNode } from "react";

type ConfirmModalProps = {
  titleTag?: string;
  title: string;
  description?: ReactNode;
  cancelLabel?: string;
  isConfirmDisabled?: boolean;
  onCancel: () => void;
  confirmButton: ReactNode;
};

export default function ConfirmModal({
  titleTag,
  title,
  description,
  cancelLabel = "Cancel",
  isConfirmDisabled,
  onCancel,
  confirmButton,
}: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
        {titleTag && <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">{titleTag}</p>}
        <h3 className="mt-2 text-xl font-semibold text-white">{title}</h3>
        {description && <div className="mt-2 text-sm text-zinc-300">{description}</div>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isConfirmDisabled}
            className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          {confirmButton}
        </div>
      </div>
    </div>
  );
}
