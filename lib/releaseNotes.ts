export type ReleaseNote = {
  icon: string;
  title: string;
  description: string;
};

/**
 * Bump this whenever a new set of notes ships — the modal reappears for every
 * user whose stored "seen" value no longer matches.
 */
export const CURRENT_RELEASE_ID = "2026-08-07";
export const CURRENT_RELEASE_LABEL = "August 7, 2026";

export const CURRENT_RELEASE_NOTES: ReleaseNote[] = [
  {
    icon: "⋮",
    title: "Action menus everywhere",
    description:
      "Every exercise row and muscle group header now has a ⋮ menu — export, rename, move, archive, or delete without leaving the page.",
  },
  {
    icon: "📝",
    title: "Exercise notes",
    description:
      "Attach a note to any exercise for form cues, setup reminders, or seat heights. It shows inline under the exercise name.",
  },
  {
    icon: "📈",
    title: "Pinned strength charts",
    description:
      "The dashboard now tracks your top 6 exercises automatically, and you can pick exactly which ones stay pinned.",
  },
  {
    icon: "🎯",
    title: "Sharper chart scaling",
    description:
      "Each chart scales its own axis to the data it shows, so small week-to-week changes are actually visible.",
  },
  {
    icon: "💪",
    title: "Rebuilt strength score",
    description:
      "Strength is now weight-first, with your heaviest working sets counting most. It tracks real progress more closely than the old 1RM estimate.",
  },
  {
    icon: "🕓",
    title: "Edit past sessions",
    description:
      "Jump back to any previous training day and fix it up — sets load pre-filled, with a one-tap return to today.",
  },
  {
    icon: "📱",
    title: "Built for your phone",
    description:
      "A bottom tab bar replaces the old top nav on mobile, so every screen is reachable one-handed.",
  },
  {
    icon: "🗂️",
    title: "Cleaner archive",
    description:
      "Archived exercises collapse into compact rows you can expand, restore, or delete for good.",
  },
  {
    icon: "🏷️",
    title: "Rename & move muscle groups",
    description:
      "Rename a muscle group or shift it to another split, and every exercise inside it follows along.",
  },
];
