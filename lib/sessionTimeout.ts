export const SESSION_STARTED_AT_COOKIE = "trainlytics_session_started_at";
export const SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export function parseSessionStartedAt(value: string | undefined): number | null {
  if (!value) return null;
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  return timestamp;
}

export function isSessionExpiredFromStart(startedAtMs: number, nowMs = Date.now()): boolean {
  return nowMs - startedAtMs >= SESSION_MAX_AGE_MS;
}
