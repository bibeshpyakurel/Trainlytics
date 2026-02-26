import { CLASS_GRADIENT_PRIMARY } from "@/lib/uiTokens";

type GradientButtonProps = {
  type?: "button" | "submit";
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  tone?: "primary" | "danger";
  className?: string;
};

export default function GradientButton({
  type = "button",
  label,
  disabled,
  onClick,
  tone = "primary",
  className = "",
}: GradientButtonProps) {
  const gradientClass = tone === "danger"
    ? "bg-gradient-to-r from-red-400 via-rose-400 to-orange-400"
    : CLASS_GRADIENT_PRIMARY;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:brightness-110 disabled:opacity-60 ${gradientClass} ${className}`.trim()}
    >
      {label}
    </button>
  );
}
