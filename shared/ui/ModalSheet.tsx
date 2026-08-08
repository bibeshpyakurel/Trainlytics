"use client";

import { useEffect, type ReactNode } from "react";

type ModalSheetProps = {
  children: ReactNode;
  /** Extra backdrop classes — e.g. a stronger scrim or a lower stacking layer. */
  backdropClassName?: string;
};

/**
 * Shared modal backdrop: a bottom sheet on phones, a centred dialog from `sm:` up.
 *
 * Mounting also locks background scrolling. iOS Safari ignores `overflow: hidden`
 * on the body, so we pin the body and restore the offset on close — without this
 * the page behind the sheet scrolls under your finger.
 */

let lockCount = 0;
let lockedScrollY = 0;

function lockBodyScroll() {
  lockCount += 1;
  if (lockCount > 1) return;

  lockedScrollY = window.scrollY;
  const { body } = document;
  body.style.position = "fixed";
  body.style.top = `-${lockedScrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.overflow = "hidden";
}

function unlockBodyScroll() {
  lockCount -= 1;
  if (lockCount > 0) return;

  lockCount = 0;
  const { body } = document;
  body.style.position = "";
  body.style.top = "";
  body.style.left = "";
  body.style.right = "";
  body.style.overflow = "";
  window.scrollTo(0, lockedScrollY);
}

/** Lock background scroll for a modal that needs its own backdrop markup. */
export function useBodyScrollLock() {
  useEffect(() => {
    lockBodyScroll();
    return unlockBodyScroll;
  }, []);
}

export default function ModalSheet({ children, backdropClassName = "" }: ModalSheetProps) {
  useBodyScrollLock();

  return (
    <div
      className={`modal-sheet fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/70 backdrop-blur-sm sm:items-center sm:p-4 ${backdropClassName}`.trim()}
    >
      {children}
    </div>
  );
}

/** Panel classes shared by every sheet: flush rounded top on mobile, full card at `sm:`. */
export const MODAL_PANEL_CLASS =
  "w-full rounded-t-2xl border border-zinc-700 bg-zinc-900 shadow-2xl sm:rounded-2xl";
