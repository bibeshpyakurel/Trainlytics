type TogglePillProps = {
  enabled: boolean;
  onToggle: () => void;
  onLabel?: string;
  offLabel?: string;
  disabled?: boolean;
};

export default function TogglePill({
  enabled,
  onToggle,
  onLabel = "On",
  offLabel = "Off",
  disabled,
}: TogglePillProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
        enabled
          ? "bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 text-zinc-900"
          : "bg-zinc-700/40 text-zinc-300"
      }`}
    >
      {enabled ? onLabel : offLabel}
    </button>
  );
}
