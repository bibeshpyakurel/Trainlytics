"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { clearAccountScopedClientState } from "@/lib/accountScopedClientState";
import { ROUTES, isProtectedRoute } from "@/lib/routes";
import {
  SESSION_LAST_ACTIVITY_STORAGE_KEY,
  SESSION_MAX_AGE_MS,
  SESSION_STARTED_AT_COOKIE,
  formatSessionCookieValue,
  parseSessionStartedAt,
} from "@/lib/sessionTimeout";

const USER_ACTIVITY_EVENTS: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"];

function getNow() {
  return Date.now();
}

function persistLastActivity(nextTimestampMs: number) {
  const value = formatSessionCookieValue(nextTimestampMs);
  localStorage.setItem(SESSION_LAST_ACTIVITY_STORAGE_KEY, value);
  document.cookie = `${SESSION_STARTED_AT_COOKIE}=${value}; path=/; samesite=lax`;
}

function resolveLastActivityMs() {
  const fromStorage = parseSessionStartedAt(localStorage.getItem(SESSION_LAST_ACTIVITY_STORAGE_KEY) ?? undefined);
  if (fromStorage) return fromStorage;
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
      persistLastActivity(now);
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
      localStorage.removeItem(SESSION_LAST_ACTIVITY_STORAGE_KEY);
      document.cookie = `${SESSION_STARTED_AT_COOKIE}=; path=/; max-age=0; samesite=lax`;

      await supabase.auth.signOut();
      clearAccountScopedClientState();

      const params = new URLSearchParams();
      params.set("next", nextPath);
      router.replace(`${ROUTES.sessionExpired}?${params.toString()}`);
    };

    const initialLastActivityMs = resolveLastActivityMs();
    persistLastActivity(initialLastActivityMs);
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
