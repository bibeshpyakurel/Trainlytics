export type BmrSex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "very_active" | "extra_active";
export type BmiCategory = "underweight" | "normal" | "overweight" | "obese";

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

export function calculateBmrMifflinStJeor(input: {
  sex: BmrSex;
  weightKg: number;
  heightCm: number;
  ageYears: number;
}) {
  const sexAdjustment = input.sex === "male" ? 5 : -161;
  return (10 * input.weightKg) + (6.25 * input.heightCm) - (5 * input.ageYears) + sexAdjustment;
}

export function calculateMaintenanceCalories(input: {
  bmr: number;
  activityLevel: ActivityLevel;
}) {
  return input.bmr * ACTIVITY_MULTIPLIERS[input.activityLevel];
}

export function calculateTotalBurnCalories(maintenanceKcal: number | null, activeCaloriesKcal: number | null) {
  if (maintenanceKcal == null || activeCaloriesKcal == null) return null;
  if (!Number.isFinite(maintenanceKcal) || !Number.isFinite(activeCaloriesKcal)) return null;
  return maintenanceKcal + activeCaloriesKcal;
}

export function calculateNetCalories(caloriesInKcal: number | null, totalBurnKcal: number | null) {
  if (caloriesInKcal == null || totalBurnKcal == null) return null;
  if (!Number.isFinite(caloriesInKcal) || !Number.isFinite(totalBurnKcal)) return null;
  return caloriesInKcal - totalBurnKcal;
}

export function calculateAgeYearsFromBirthDate(birthDateIso: string, referenceDate = new Date()) {
  const birthDate = new Date(`${birthDateIso}T00:00:00`);
  if (!Number.isFinite(birthDate.getTime())) return null;

  const years = referenceDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = referenceDate.getMonth() - birthDate.getMonth();
  const dayDiff = referenceDate.getDate() - birthDate.getDate();
  const hadBirthdayThisYear = monthDiff > 0 || (monthDiff === 0 && dayDiff >= 0);
  const age = hadBirthdayThisYear ? years : years - 1;
  return age >= 0 ? age : null;
}

export function calculateMaintenanceCaloriesFromProfile(input: {
  sex: BmrSex;
  weightKg: number;
  heightCm: number;
  birthDateIso: string;
  activityLevel: ActivityLevel;
  referenceDate?: Date;
}) {
  const ageYears = calculateAgeYearsFromBirthDate(input.birthDateIso, input.referenceDate);
  if (ageYears == null) return null;

  const bmr = calculateBmrMifflinStJeor({
    sex: input.sex,
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    ageYears,
  });

  return calculateMaintenanceCalories({
    bmr,
    activityLevel: input.activityLevel,
  });
}

export function calculateBmi(weightKg: number, heightCm: number) {
  if (!(weightKg > 0) || !(heightCm > 0)) return null;
  const heightMeters = heightCm / 100;
  return weightKg / (heightMeters * heightMeters);
}

export function getBmiCategory(bmi: number): BmiCategory | null {
  if (!Number.isFinite(bmi) || bmi <= 0) return null;
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "normal";
  if (bmi < 30) return "overweight";
  return "obese";
}
