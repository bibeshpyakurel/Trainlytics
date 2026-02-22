export const STORAGE_KEYS = {
  theme: "theme",
  launchAnimationEnabled: "launch_animation_enabled",
  insightsSpeakReplies: "insights_speak_replies",
  recentLoginEmails: "recent_login_emails",
} as const;

export function getStoredBoolean(key: string, defaultValue: boolean): boolean {
  if (typeof window === "undefined") return defaultValue;
  const value = window.localStorage.getItem(key);
  if (value == null) return defaultValue;
  return value === "true";
}

export function setStoredBoolean(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, String(value));
}
