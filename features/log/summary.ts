import type { SessionSummaryItem, Split } from "@/features/log/types";

export function sortSessionSummaryItems(items: SessionSummaryItem[], split: Split) {
  const splitSummaryOrder: Partial<Record<Split, string[]>> = {
    push: [
      "incline",
      "tricep push",
      "triceps push",
      "tricep pull",
      "triceps pull",
      "barbell shoulder",
      "cable lateral raise",
      "pec fly",
      "peck fly",
      "overhead tricep",
      "overhead tricept",
      "converging",
    ],
    pull: [
      "bendover barbell row",
      "bent over barbell row",
      "diverging low row",
      "pull up",
      "pull-up",
      "hammer",
      "upper back row",
      "preacher",
      "pracher",
      "preacher curl",
      "lat pull down",
      "lat pulldown",
    ],
    legs: [
      "squat",
      "romainian",
      "romanian",
      "leg extension",
      "leg curl",
      "calves",
      "prone leg curl",
    ],
  };

  const normalizeText = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const getOrderIndex = (exerciseName: string, orderList: string[]) => {
    const normalized = normalizeText(exerciseName);
    const index = orderList.findIndex((label) => normalized.includes(normalizeText(label)));
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  return items
    .map((item) => ({
      ...item,
      setDetails: [...item.setDetails].sort((a, b) => a.setNumber - b.setNumber),
    }))
    .sort((a, b) => {
      const activeOrder = splitSummaryOrder[split];
      if (activeOrder && activeOrder.length > 0) {
        const aIndex = getOrderIndex(a.exerciseName, activeOrder);
        const bIndex = getOrderIndex(b.exerciseName, activeOrder);
        if (aIndex !== bIndex) return aIndex - bIndex;
      }

      return a.exerciseName.localeCompare(b.exerciseName);
    });
}
