import { STORAGE_KEYS } from "@/lib/preferences";

const SHARED_LOCAL_STORAGE_KEYS = new Set<string>([
  STORAGE_KEYS.theme,
  STORAGE_KEYS.recentLoginEmails,
]);

export function clearAccountScopedClientState() {
  if (typeof window === "undefined") return;

  try {
    const localKeysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (!SHARED_LOCAL_STORAGE_KEYS.has(key)) {
        localKeysToRemove.push(key);
      }
    }

    localKeysToRemove.forEach((key) => window.localStorage.removeItem(key));
  } catch {}

  try {
    window.sessionStorage.clear();
  } catch {}
}
