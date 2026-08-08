"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ROUTES } from "@/lib/routes";
import { STORAGE_KEYS } from "@/lib/preferences";
import { CURRENT_RELEASE_ID, CURRENT_RELEASE_LABEL, CURRENT_RELEASE_NOTES } from "@/lib/releaseNotes";
import GradientButton from "@/shared/ui/GradientButton";
import ModalSheet from "@/shared/ui/ModalSheet";

function hasSeenCurrentRelease() {
  try {
    return window.localStorage.getItem(STORAGE_KEYS.whatsNewSeenRelease) === CURRENT_RELEASE_ID;
  } catch {
    // Private mode / storage disabled — treat as seen so we never nag on every load.
    return true;
  }
}

function markCurrentReleaseSeen() {
  try {
    window.localStorage.setItem(STORAGE_KEYS.whatsNewSeenRelease, CURRENT_RELEASE_ID);
  } catch {}
}

export default function WhatsNewModal() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const isAuthRoute =
    pathname === ROUTES.login ||
    pathname === ROUTES.signup ||
    pathname === ROUTES.forgotPassword ||
    pathname === ROUTES.sessionExpired ||
    pathname === ROUTES.launch ||
    pathname === ROUTES.signout;

  useEffect(() => {
    if (isAuthRoute || hasSeenCurrentRelease()) return;

    let isMounted = true;

    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!isMounted || error || !data.session) return;
      setIsOpen(true);
    })();

    return () => {
      isMounted = false;
    };
  }, [isAuthRoute, pathname]);

  const dismiss = useCallback(() => {
    markCurrentReleaseSeen();
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, dismiss]);

  if (!isOpen) return null;

  return (
    <ModalSheet>
      <div
        className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-2xl border border-zinc-700 bg-zinc-900 shadow-2xl sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
      >
        <div className="flex items-start justify-between gap-2 border-b border-zinc-800 p-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">What&rsquo;s New</p>
            <h3 id="whats-new-title" className="mt-2 text-xl font-semibold text-white">
              {CURRENT_RELEASE_NOTES.length} new things in Trainlytics
            </h3>
            <p className="mt-1 text-xs text-zinc-500">{CURRENT_RELEASE_LABEL}</p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl leading-none text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
          >
            ×
          </button>
        </div>

        <ul className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5">
          {CURRENT_RELEASE_NOTES.map((note) => (
            <li key={note.title} className="flex gap-3">
              <span aria-hidden="true" className="mt-0.5 w-7 shrink-0 text-center text-lg">
                {note.icon}
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-zinc-100">{note.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">{note.description}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex justify-end border-t border-zinc-800 p-4">
          <GradientButton
            label="Got it"
            onClick={dismiss}
            className="w-full py-3 text-base sm:w-auto sm:py-2 sm:text-sm"
          />
        </div>
      </div>
    </ModalSheet>
  );
}
