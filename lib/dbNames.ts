export const TABLES = {
  bodyweightLogs: "bodyweight_logs",
  caloriesLogs: "calories_logs",
  metabolicActivityLogs: "metabolic_activity_logs",
  exercises: "exercises",
  profiles: "profiles",
  workoutSessions: "workout_sessions",
  workoutSets: "workout_sets",
} as const;

export const STORAGE_BUCKETS = {
  profileAvatars: "profile-avatars",
} as const;

export const STORAGE_PUBLIC_PATH_MARKERS = {
  profileAvatars: `/storage/v1/object/public/${STORAGE_BUCKETS.profileAvatars}/`,
} as const;
