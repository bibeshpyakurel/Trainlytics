import type { DashboardData } from "@/lib/dashboardTypes";

type DashboardViewModelInput = {
  loading: boolean;
  msg: string | null;
  data: DashboardData | null;
};

export function getDashboardViewModel(input: DashboardViewModelInput) {
  const firstName = input.data?.firstName?.trim();
  const welcomeTitle = firstName ? `Welcome Back, ${firstName} 💪` : "Welcome Back 💪";

  const latestWorkoutText = input.loading
    ? "Loading..."
    : input.data?.latestWorkout
      ? `${input.data.latestWorkout.split.toUpperCase()} · ${input.data.latestWorkout.session_date}`
      : "No workouts yet";

  const latestWeightText = input.loading
    ? "Loading..."
    : input.data?.latestBodyweight
      ? `${input.data.latestBodyweight.weight_input} ${input.data.latestBodyweight.unit_input} · ${input.data.latestBodyweight.log_date}`
      : "No logs yet";

  const latestCaloriesText = input.loading
    ? "Loading..."
    : input.data?.latestCalories
      ? `${(input.data.latestCalories.pre_workout_kcal ?? 0) + (input.data.latestCalories.post_workout_kcal ?? 0)} kcal · ${input.data.latestCalories.log_date}`
      : "No logs yet";

  const latestBurnText = input.loading
    ? "Loading..."
    : input.data?.latestMetabolicBurn
      ? `${Math.round(input.data.latestMetabolicBurn.estimated_kcal_spent)} kcal · ${input.data.latestMetabolicBurn.log_date}`
      : "No logs yet";

  const avgBurn7dText = input.loading
    ? "Loading..."
    : input.data?.avgBurn7d != null
      ? `${Math.round(input.data.avgBurn7d)} kcal`
      : "Not enough data";

  const netEnergy7dText = input.loading
    ? "Loading..."
    : input.data?.netEnergy7d != null
      ? `${Math.round(input.data.netEnergy7d)} kcal`
      : "Not enough data";

  const energyCompletenessText = input.loading
    ? "Loading..."
    : input.data
      ? `${Math.round(input.data.energyDataCompletenessPct)}%`
      : "0%";

  return {
    welcomeTitle,
    latestWorkoutText,
    latestWeightText,
    latestCaloriesText,
    latestBurnText,
    avgBurn7dText,
    netEnergy7dText,
    energyCompletenessText,
    errorMessage: input.msg,
  };
}
