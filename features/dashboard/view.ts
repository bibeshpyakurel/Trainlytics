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

  return {
    welcomeTitle,
    latestWorkoutText,
    latestWeightText,
    latestCaloriesText,
    errorMessage: input.msg,
  };
}
