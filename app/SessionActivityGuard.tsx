"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { clearAccountScopedClientState } from "@/lib/accountScopedClientState";
import { buildSessionExpiredPath, isProtectedRoute } from "@/lib/routes";
import {
  SESSION_LAST_ACTIVITY_STORAGE_KEY,
  SESSION_MAX_AGE_MS,
  clearSessionActivityMarkers,
  markSessionActivity,
  parseSessionStartedAtFromCookieHeader,
  parseSessionStartedAt,
} from "@/lib/sessionTimeout";

const USER_ACTIVITY_EVENTS: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"];

function getNow() {
  return Date.now();
}

function resolveLastActivityMs() {
  const fromStorage = parseSessionStartedAt(localStorage.getItem(SESSION_LAST_ACTIVITY_STORAGE_KEY) ?? undefined);
  const fromCookie = parseSessionStartedAtFromCookieHeader(document.cookie);
  if (fromStorage && fromCookie) return Math.max(fromStorage, fromCookie);
  if (fromStorage) return fromStorage;
  if (fromCookie) return fromCookie;
  return getNow();
}

export default function SessionActivityGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!pathname || !isProtectedRoute(pathname)) return;

    let timerId: number | null = null;
    let expired = false;
    let active = true;

    const scheduleFrom = (lastActivityMs: number) => {
      if (timerId !== null) window.clearTimeout(timerId);
      const elapsedMs = Math.max(0, getNow() - lastActivityMs);
      const remainingMs = Math.max(0, SESSION_MAX_AGE_MS - elapsedMs);
      timerId = window.setTimeout(() => {
        void expireSession();
      }, remainingMs);
    };

    const onActivity = () => {
      if (expired) return;
      const lastActivityMs = resolveLastActivityMs();
      if (getNow() - lastActivityMs >= SESSION_MAX_AGE_MS) {
        void expireSession();
        return;
      }
      const now = getNow();
      markSessionActivity(now);
      scheduleFrom(now);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        onActivity();
      }
    };

    const expireSession = async () => {
      if (expired || !active) return;
      expired = true;

      const nextPath = pathname;
      clearSessionActivityMarkers();

      await supabase.auth.signOut();
      clearAccountScopedClientState();

      router.replace(buildSessionExpiredPath(nextPath));
    };

    const initialLastActivityMs = resolveLastActivityMs();
    markSessionActivity(initialLastActivityMs);
    scheduleFrom(initialLastActivityMs);

    USER_ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, onActivity, { passive: true });
    });
    window.addEventListener("focus", onActivity);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      if (timerId !== null) window.clearTimeout(timerId);
      USER_ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, onActivity);
      });
      window.removeEventListener("focus", onActivity);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [pathname, router]);

  return null;
}
