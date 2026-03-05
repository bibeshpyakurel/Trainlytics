export const SESSION_STARTED_AT_COOKIE = "trainlytics_session_started_at";
export const SESSION_LAST_ACTIVITY_STORAGE_KEY = "trainlytics_last_activity_at";
export const SESSION_MAX_AGE_MS = 60 * 60 * 1000;

export function parseSessionStartedAt(value: string | undefined): number | null {
  if (!value) return null;
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  return timestamp;
}

export function isSessionExpiredFromStart(startedAtMs: number, nowMs = Date.now()): boolean {
  return nowMs - startedAtMs >= SESSION_MAX_AGE_MS;
}

export function formatSessionCookieValue(timestampMs: number) {
  return String(Math.max(0, Math.floor(timestampMs)));
}

export function parseSessionStartedAtFromCookieHeader(cookieHeader: string | undefined): number | null {
  if (!cookieHeader) return null;
  const cookieKey = `${SESSION_STARTED_AT_COOKIE}=`;
  const rawValue = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(cookieKey))
    ?.slice(cookieKey.length);
  return parseSessionStartedAt(rawValue);
}

export function markSessionActivity(timestampMs = Date.now()) {
  const value = formatSessionCookieValue(timestampMs);
  if (typeof window === "undefined") return value;
  localStorage.setItem(SESSION_LAST_ACTIVITY_STORAGE_KEY, value);
  document.cookie = `${SESSION_STARTED_AT_COOKIE}=${value}; path=/; samesite=lax`;
  return value;
}

export function clearSessionActivityMarkers() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_LAST_ACTIVITY_STORAGE_KEY);
  document.cookie = `${SESSION_STARTED_AT_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
