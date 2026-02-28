export const ENERGY_METRIC_KEYS = {
  activeCalories: "active_calories_kcal",
  maintenanceCalories: "maintenance_kcal",
  maintenanceCaloriesForDay: "maintenance_kcal_for_day",
  totalBurnCalories: "total_burn_kcal",
  netCalories: "net_calories_kcal",
  caloriesIn: "calories_in_kcal",
} as const;

export const MAINTENANCE_METHODS = {
  mifflinStJeorActivityMultiplier: "mifflin_st_jeor_activity_multiplier",
} as const;

export const MAINTENANCE_FORMULA_DEFINITION =
  "Maintenance uses Mifflin-St Jeor BMR (male: 10*kg + 6.25*cm - 5*age + 5; female: 10*kg + 6.25*cm - 5*age - 161), then multiplies by activity level (sedentary=1.2, light=1.375, moderate=1.55, very_active=1.725, extra_active=1.9).";

export const ENERGY_METRIC_DEFINITIONS = {
  activeCalories:
    "Smartwatch activity-only calories from movement/exercise. Never includes BMR, resting, or maintenance calories.",
  maintenanceCalories:
    `Estimated maintenance baseline (TDEE) computed separately from profile/BMR inputs. ${MAINTENANCE_FORMULA_DEFINITION}`,
  totalBurnCalories:
    "Total daily burn computed as maintenance_kcal + active_calories_kcal.",
  netCalories:
    "Net daily calories computed as calories_in_kcal - total_burn_kcal.",
} as const;

export const ENERGY_METRIC_GUARDRAIL_PROMPT = [
  "Metric definitions are strict and must not be reinterpreted:",
  `${ENERGY_METRIC_KEYS.activeCalories}: ${ENERGY_METRIC_DEFINITIONS.activeCalories}`,
  `${ENERGY_METRIC_KEYS.maintenanceCalories}: ${ENERGY_METRIC_DEFINITIONS.maintenanceCalories}`,
  `${ENERGY_METRIC_KEYS.maintenanceCaloriesForDay}: Daily maintenance snapshot used for date-specific analysis.`,
  `${ENERGY_METRIC_KEYS.totalBurnCalories}: ${ENERGY_METRIC_DEFINITIONS.totalBurnCalories}`,
  `${ENERGY_METRIC_KEYS.netCalories}: ${ENERGY_METRIC_DEFINITIONS.netCalories}`,
  "Hard rule: if any required energy component is missing for the date/range, explicitly call it a partial estimate and do not infer hidden burn.",
].join(" ");
