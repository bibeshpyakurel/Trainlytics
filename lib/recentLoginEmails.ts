import { STORAGE_KEYS } from "@/lib/preferences";

const MAX_RECENT_LOGIN_EMAILS = 5;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function dedupeEmails(values: string[]) {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = normalizeEmail(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}

export function getRecentLoginEmails(): string[] {
  if (typeof window === "undefined") return [];

  const raw = window.localStorage.getItem(STORAGE_KEYS.recentLoginEmails);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return dedupeEmails(parsed.filter((value) => typeof value === "string"));
  } catch {
    return [];
  }
}

function setRecentLoginEmails(values: string[]) {
  if (typeof window === "undefined") return;
  const next = dedupeEmails(values).slice(0, MAX_RECENT_LOGIN_EMAILS);
  window.localStorage.setItem(STORAGE_KEYS.recentLoginEmails, JSON.stringify(next));
}

export function rememberRecentLoginEmail(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;

  const existing = getRecentLoginEmails().filter((value) => value !== normalized);
  setRecentLoginEmails([normalized, ...existing]);
}

export function removeRecentLoginEmail(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;

  const next = getRecentLoginEmails().filter((value) => value !== normalized);
  setRecentLoginEmails(next);
}
