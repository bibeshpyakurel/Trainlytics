"use client";

import { useEffect, useRef, useState } from "react";

type MenuItem = {
  label: string;
  onClick: () => void;
  variant?: "danger";
};

type OverflowMenuProps = {
  items: MenuItem[];
  disabled?: boolean;
};

export default function OverflowMenu({ items, disabled }: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-label="More actions"
        className="flex h-10 w-10 items-center justify-center rounded-md border border-zinc-600 text-base font-bold leading-none text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50"
      >
        ⋮
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 min-w-[180px] rounded-xl border border-zinc-700 bg-zinc-900 py-1 shadow-2xl">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`w-full px-4 py-2 text-left text-sm transition hover:bg-zinc-800 ${
                item.variant === "danger" ? "text-red-300" : "text-zinc-100"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
