export type ReleaseNote = {
  icon: string;
  title: string;
  description: string;
};

/**
 * Bump this whenever a new set of notes ships — the modal reappears for every
 * user whose stored "seen" value no longer matches.
 */
export const CURRENT_RELEASE_ID = "2026-08-09";
export const CURRENT_RELEASE_LABEL = "August 9, 2026";

export const CURRENT_RELEASE_NOTES: ReleaseNote[] = [
  {
    icon: "🗓️",
    title: "Train the way you actually train",
    description:
      "Push, pull, legs and core are just a starting point now. Rename them, reorder them, or build your own days from Profile → Training Days.",
  },
  {
    icon: "🎚️",
    title: "Your own number of sets",
    description:
      "Every exercise used to open with exactly two sets. Use Add Set or Remove Set in the ⋮ menu and it remembers, so next session starts where you left it.",
  },
  {
    icon: "📥",
    title: "Bring in past workouts",
    description:
      "Tap Add Workout on the log page to enter an old session with dropdowns, or paste it straight from your notes app. Nothing saves until you check the summary.",
  },
  {
    icon: "🆕",
    title: "Set things up your way from day one",
    description:
      "New accounts now choose their training days, exercises and starting sets up front — or take the standard setup and change it later.",
  },
  {
    icon: "⋮",
    title: "Action menus everywhere",
    description:
      "Every exercise row and muscle group header has a ⋮ menu — export, rename, move, archive, add sets, or delete without leaving the page.",
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
      "The dashboard tracks your top 6 exercises automatically, and you can pick exactly which ones stay pinned.",
  },
  {
    icon: "🎯",
    title: "A tighter dashboard view",
    description:
      "Charts now open on the last 30 days, with 90, 180 and all-time a tap away. Each chart also scales its own axis, so small changes are actually visible.",
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
      "A bottom tab bar on mobile, and every dialog now slides up as a sheet with bigger tap targets instead of floating in the middle of the screen.",
  },
  {
    icon: "🗂️",
    title: "Cleaner exercise list",
    description:
      "Exercises sit in alphabetical order within each muscle group, and archived ones collapse into compact rows you can expand, restore, or delete for good.",
  },
];
