"use client";

import { useEffect, useState } from "react";
import { DEFAULT_SPLIT_NAMES, ensureUserSplits } from "@/lib/splits";
import type { Split } from "@/features/log/types";

/**
 * The current user's training days, in their chosen order. Falls back to the
 * starter set while loading so dropdowns are never empty.
 */
export function useUserSplits(userId: string | null | undefined) {
  const [splits, setSplits] = useState<Split[]>([...DEFAULT_SPLIT_NAMES]);

  useEffect(() => {
    if (!userId) return;
    let isMounted = true;

    (async () => {
      const result = await ensureUserSplits(userId);
      if (!isMounted || !result.ok || result.splits.length === 0) return;
      setSplits(result.splits.map((entry) => entry.name));
    })();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  return splits;
}
